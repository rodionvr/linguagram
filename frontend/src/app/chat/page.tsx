"use client";
import { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Message {
  id: string;
  text: string;
  sender_id?: string;
  timestamp?: string;
  
}

interface Conversation {
  id: string;
  partnerEmail: string;
  partnerId?: string;
  latestMessage?: {
    text: string;
    timestamp: string;
    sender_id: string;
  };
  updated_at?: string;
  raw: any;
}

export default function ChatPage() {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [targetEmail, setTargetEmail] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
  const socketRef = useRef<any>(null);
  const userEmailRef = useRef<string>("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [newContactEmail, setNewContactEmail] = useState<string>("");
  const [loadingConvs, setLoadingConvs] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  // Auto-scroll to bottom when messages change or load
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // require signed-in user; redirect to /profile if not signed in
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          router.push("/profile");
          return;
        }
        const data = await res.json();
        const email = data?.user?.email;
        if (!email) {
          router.push("/profile");
          return;
        }
        setUserEmail(email);
        userEmailRef.current = email;
        // Fetch user ID from backend
        try {
          const userRes = await fetch(`${backend}/login?email=${encodeURIComponent(email)}`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            if (userData.user?._id) {
              setUserId(userData.user._id);
            }
          }
        } catch (e) {
          console.warn("Failed to fetch user ID", e);
        }
      } catch (e) {
        router.push("/profile");
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [router, backend]);

  // Fetch message preview text by message_id
  const fetchMessagePreview = async (messageId: string, convId: string): Promise<string> => {
    if (!messageId || !userEmail) return "";
    try {
      const res = await fetch(
        `${backend}/getMessages?email=${encodeURIComponent(userEmail)}&conversation_id=${encodeURIComponent(convId)}`,
        { headers: { 'ngrok-skip-browser-warning': 'true' } }
      );
      if (res.ok) {
        const data = await res.json();
        const msg = data.messages?.find((m: any) => m.message_id === messageId);
        return msg?.text || "";
      }
    } catch (e) {
      // Silent fail for preview
    }
    return "";
  };

  // Send message
  const sendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!message || !targetEmail) return;

    interface MessageResponse {
      message?: string;
      message_id?: string;
      conversation_id?: string;
      error?: string;
    }

    // Prefer websocket if connected
    try {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("send_message", {
          message,
          email: userEmail,
          target_email: targetEmail,
          conversation_id: conversationId,
        });
        setMessage("");
        return;
      }

      // Fallback to REST if socket unavailable
      const res = await fetch(`${backend}/message`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          message,
          email: userEmail,
          target_email: targetEmail,
        }),
      });

      let data: MessageResponse = {};
      try {
        data = (await res.json()) as MessageResponse;
      } catch {
        console.warn("Response is not JSON");
      }

      if (res.ok && data.message_id) {
        const newConvId = data.conversation_id || conversationId;
        setConversationId(newConvId);
        if (newConvId && data.conversation_id) {
          const key = `conv:${[userEmail, targetEmail].sort().join(":")}`;
          localStorage.setItem(key, newConvId);
        }
        // Append only if socket not connected (no real-time delivery)
        if (!socketRef.current || !socketRef.current.connected) {
          const newMsg = { text: message, id: data.message_id, sender_id: userId };
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
        setMessage("");
      } else {
        console.error("Message failed:", data);
        alert(data.error || "Error sending message");
      }
    } catch (err) {
      console.error("Send failed:", err);
      alert("Failed to send message: " + err);
    }
  };

  // Setup Socket.IO client
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        if (!mounted) return;
        const socket = io(backend, { 
          transports: ["websocket", "polling"],
          extraHeaders: {
            "ngrok-skip-browser-warning": "true"
          },
          reconnectionDelay: 1000,
          reconnection: true,
          reconnectionAttempts: 10,
          timeout: 20000,
          forceNew: true
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          // Register this client identity with server
          if (userEmail) {
            socket.emit("register", { email: userEmail });
          }
          // Join conversation room if available
          if (conversationId && userEmail) {
            socket.emit("join", { conversation_id: conversationId, email: userEmail });
          }
        });

        socket.on("message", (data: any) => {
          const isSender = data.sender_email && data.sender_email === userEmailRef.current;
          const text = isSender 
            ? (data.original_text || data.text || data.translated_text || "") 
            : (data.translated_text || data.original_text || data.text || "");
          const id = data.message_id || String(Date.now());
          const newMsg = { id, text, sender_id: data.sender_id, timestamp: data.timestamp };
          
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          // Update conversation list with new message preview
          if (data.conversation_id) {
            setConversations((prev) => {
              return prev.map((conv) => {
                if (conv.id === data.conversation_id) {
                  return {
                    ...conv,
                    latestMessage: {
                      text: text.length > 50 ? text.substring(0, 50) + "..." : text,
                      timestamp: data.timestamp,
                      sender_id: data.sender_id,
                    },
                    updated_at: data.timestamp,
                  };
                }
                return conv;
              }).sort((a, b) => {
                const timeA = a.updated_at || a.latestMessage?.timestamp || "";
                const timeB = b.updated_at || b.latestMessage?.timestamp || "";
                return timeB.localeCompare(timeA);
              });
            });
          }

          if (!conversationId && data.conversation_id) {
            setConversationId(data.conversation_id);
            const key = `conv:${[userEmail, targetEmail].sort().join(":")}`;
            try {
              localStorage.setItem(key, data.conversation_id);
            } catch (e) {}
            try {
              socket.emit("join", { conversation_id: data.conversation_id, email: userEmail });
            } catch (e) {}
          }
        });

        socket.on("joined", (d: any) => {
          if (d && d.conversation_id && !conversationId) {
            setConversationId(d.conversation_id);
          }
        });

        socket.on("connect_error", (err: any) => {
          console.error("Socket connect error:", err);
        });

        socket.on("error", (err: any) => {
          console.error("Socket error:", err);
        });

        socket.on("disconnect", (reason: any) => {
          console.warn("Socket disconnected:", reason);
        });
      } catch (e) {
        console.warn("Socket.IO client not available, falling back to REST", e);
      }
    })();

    return () => {
      mounted = false;
      try {
        socketRef.current?.disconnect();
      } catch (e) {}
    };
  }, [backend]);

  // Register socket with user email when it becomes available
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !userEmail) return;

    const handleConnect = () => {
      socket.emit("register", { email: userEmail });
    };

    if (socket.connected) {
      handleConnect();
    }
    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
    };
  }, [userEmail]);

  // Join conversation room when conversationId changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !conversationId || !userEmail) return;

    const handleConnect = () => {
      socket.emit("join", { conversation_id: conversationId, email: userEmail });
    };

    if (socket.connected) {
      handleConnect();
    }
    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
    };
  }, [conversationId, userEmail]);

  // Fetch user's conversations when authenticated/userEmail is known
  useEffect(() => {
    if (!authChecked || !userEmail) return;
    let mounted = true;
    
    const fetchEmail = async (id: string) => {
      try {
        const res = await fetch(`${backend}/getEmail?id=${encodeURIComponent(id)}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        if (!res.ok) return null;
        const d = await res.json();
        return d.email || null;
      } catch (e) {
        return null;
      }
    };

    (async () => {
      setLoadingConvs(true);
      try {
        const res = await fetch(`${backend}/getConvs?email=${encodeURIComponent(userEmail)}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        if (!res.ok) {
          setConversations([]);
          setLoadingConvs(false);
          return;
        }
        const data = await res.json();
        const convs = data.conversations || [];

        // Enrich conversations with partner email and latest message preview
        const enriched: Conversation[] = [];
        for (const c of convs) {
          try {
            const participants = c.participants || [];
            const emails: string[] = [];
            const participantIds: string[] = [];
            
            for (const p of participants) {
              const idStr = typeof p === "string" ? p : (p && p.$oid) ? p.$oid : String(p);
              const email = await fetchEmail(idStr);
              if (email) emails.push(email);
              participantIds.push(idStr);
            }
            
            const partnerEmail = emails.find((em) => em && em !== userEmail) || emails[0] || "";
            const partnerId = participantIds.find((id) => {
              // We'd need to match by email, but for now just use first non-user ID
              return true;
            });
            
            const convId = c._id || c.id || String(c["_id"]);
            let latestMessage;
            
            // Try to get preview from latest message if available
            if (c.latest?.message_id) {
              const previewText = await fetchMessagePreview(c.latest.message_id, convId);
              if (previewText) {
                latestMessage = {
                  text: previewText.length > 50 ? previewText.substring(0, 50) + "..." : previewText,
                  timestamp: c.latest.timestamp || c.updated_at || "",
                  sender_id: c.latest.sender_id || "",
                };
              }
            }
            
            enriched.push({
              id: convId,
              partnerEmail,
              partnerId: participantIds.find((id) => id !== userId) || partnerId,
              latestMessage,
              updated_at: c.updated_at || c.latest?.timestamp || "",
              raw: c,
            });
          } catch (e) {
            console.warn("Error enriching conversation:", e);
          }
        }

        // Sort by updated_at descending
        enriched.sort((a, b) => {
          const timeA = a.updated_at || "";
          const timeB = b.updated_at || "";
          return timeB.localeCompare(timeA);
        });

        if (!mounted) return;
        setConversations(enriched);
        
        // Auto-select the most recent conversation if available
        if (enriched.length > 0 && !conversationId) {
          const mostRecent = enriched[0];
          setTargetEmail(mostRecent.partnerEmail);
          setConversationId(mostRecent.id);
        }
      } catch (e) {
        console.warn("Failed to load conversations", e);
        setConversations([]);
      } finally {
        if (mounted) setLoadingConvs(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authChecked, userEmail, backend, userId]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!conversationId || !userEmail || !targetEmail) {
      return;
    }
    
    const key = `conv:${[userEmail, targetEmail].sort().join(":")}`;
    try {
      localStorage.setItem(key, conversationId);
    } catch (e) {}
    
    // Fetch existing messages for this conversation
    (async () => {
      try {
        const res = await fetch(
          `${backend}/getMessages?email=${encodeURIComponent(userEmail)}&conversation_id=${encodeURIComponent(conversationId)}`,
          { headers: { 'ngrok-skip-browser-warning': 'true' } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data && data.messages) {
            const map = new Map<string, { text: string; sender_id: string }>();
            for (const m of data.messages) {
              map.set(m.message_id, { text: m.text, sender_id: m.sender_id });
            }
            setMessages(Array.from(map.entries()).map(([id, { text, sender_id }]) => ({ 
              id, 
              text, 
              sender_id 
            })));
          }
        }
      } catch (e) {
        console.warn("Failed to load messages", e);
      }
    })();
    
    // Join conversation room
    try {
      const s = socketRef.current;
      if (s && s.connected) {
        s.emit("join", { conversation_id: conversationId, email: userEmail });
      }
    } catch (e) {
      // ignore
    }
  }, [conversationId, userEmail, targetEmail, backend]);

  if (!authChecked) return null;

  const currentConv = conversationId ? conversations.find(c => c.id === conversationId) : null;
  const displayEmail = targetEmail || currentConv?.partnerEmail || "";

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m`;
      if (diffHours < 24) return `${diffHours}h`;
      if (diffDays < 7) return `${diffDays}d`;
      return date.toLocaleDateString();
    } catch {
      return "";
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar - 30% width */}
      <aside className="w-[30%] border-r bg-gray-50 flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-white flex items-center justify-between">
          <h2 className="text-lg font-semibold">Chats</h2>
          <Link href="/profile">
            <button className="text-sm text-blue-500 hover:text-blue-700 px-2 py-1">
              Profile
            </button>
          </Link>
        </div>
        
        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="p-4 text-sm text-gray-500">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No conversations yet</div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  if (c.id === conversationId && c.partnerEmail === targetEmail) {
                    return;
                  }
                  setTargetEmail(c.partnerEmail);
                  const key = `conv:${[userEmail, c.partnerEmail].sort().join(":")}`;
                  try {
                    localStorage.setItem(key, c.id);
                  } catch (e) {}
                  setConversationId(c.id);
                  setMessages([]);
                }}
                className={`w-full text-left p-3 hover:bg-gray-100 border-b transition-colors ${
                  c.id === conversationId ? "bg-blue-50 border-blue-200" : "bg-white"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {c.partnerEmail || "(unknown)"}
                    </div>
                    {c.latestMessage && (
                      <div className="text-sm text-gray-600 truncate mt-1">
                        {c.latestMessage.sender_id === userId ? "You: " : ""}
                        {c.latestMessage.text}
                      </div>
                    )}
                  </div>
                  {c.latestMessage && (
                    <div className="text-xs text-gray-500 ml-2 flex-shrink-0">
                      {formatTime(c.latestMessage.timestamp || c.updated_at)}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* New contact input */}
        <div className="p-4 border-t bg-white">
          <div className="flex gap-2">
            <input
              value={newContactEmail}
              onChange={(e) => setNewContactEmail(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const btn = document.querySelector('[data-start-conversation]') as HTMLButtonElement;
                  btn?.click();
                }
              }}
              placeholder="Email address"
              className="flex-1 border border-gray-300 p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              data-start-conversation
              onClick={async () => {
                const email = newContactEmail.trim();
                if (!email) return;
                const existing = conversations.find((cv) => cv.partnerEmail === email);
                try {
                  if (existing) {
                    const key = `conv:${[userEmail, email].sort().join(":")}`;
                    try { localStorage.setItem(key, existing.id); } catch (e) {}
                    setTargetEmail(email);
                    setConversationId(existing.id);
                    setMessages([]);
                  } else {
                    const resp = await fetch(`${backend}/createConversation`, {
                      method: "POST",
                      headers: { 
                        "Content-Type": "application/json",
                        "ngrok-skip-browser-warning": "true"
                      },
                      body: JSON.stringify({ email: userEmail, target_email: email }),
                    });
                    if (!resp.ok) {
                      const err = await resp.json().catch(() => ({}));
                      alert(err.error || "Failed to create conversation");
                    } else {
                      const d = await resp.json();
                      const convId = d.conversation_id;
                      if (convId) {
                        const key = `conv:${[userEmail, email].sort().join(":")}`;
                        try { localStorage.setItem(key, convId); } catch (e) {}
                        setTargetEmail(email);
                        setConversationId(convId);
                        setMessages([]);
                        // Refresh conversations list
                        window.location.reload(); // Simple refresh for now
                      }
                    }
                  }
                } catch (e) {
                  console.warn("Failed to create/select conversation", e);
                  alert("Failed to start conversation: " + e);
                } finally {
                  setNewContactEmail("");
                }
              }}
              className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
            >
              Start
            </button>
          </div>
        </div>
      </aside>

      {/* Main chat area - 70% width, full height */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white">
        {/* Chat header */}
        <div className="p-4 border-b bg-gray-50">
          <h1 className="text-xl font-semibold text-gray-800">
            {displayEmail ? displayEmail : "Select a conversation"}
          </h1>
        </div>

        {/* Messages container - scrollable */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 bg-gray-100"
          style={{ scrollBehavior: "smooth" }}
        >
          <div className="flex flex-col gap-3 max-w-4xl mx-auto">
            {messages.map((msg) => {
              const isFromMe = msg.sender_id === userId;
              return (
                <div
                key={msg.id}
                className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`px-4 py-2 rounded-lg max-w-[70%] break-words ${
                    isFromMe 
                      ? 'bg-blue-500 text-white rounded-br-none' 
                      : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'
                  }`}
                >
                  {msg.text}
              
                  {isFromMe && (
                    <div className="text-xs text-right opacity-70 mt-1">
                      {msg.status === "sending" && "⏳"}
                      {msg.status === "sent" && "✓"}
                      {msg.status === "read" && "✓✓"}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        {displayEmail && (
          <form
            onSubmit={sendMessage}
            className="p-4 border-t bg-white"
          >
            <div className="flex gap-2 max-w-4xl mx-auto">
              <input
                type="text"
                placeholder="Type a message..."
                value={message}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setMessage(e.target.value)
                }
                className="flex-1 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                Send
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}