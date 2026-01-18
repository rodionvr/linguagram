"use client";
import { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Message {
  id: string;
  text: string;
}

export default function ChatPage() {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [targetEmail, setTargetEmail] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const backend = process.env.BACKEND_URL || "http://localhost:5000"; // адрес Flask
  const socketRef = useRef<any>(null);
  const userEmailRef = useRef<string>("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Array<any>>([]);
  const [newContactEmail, setNewContactEmail] = useState<string>("");
  const [loadingConvs, setLoadingConvs] = useState<boolean>(false);

  const convStorageKey = `conv:${[userEmail, targetEmail].sort().join(":")}`;

  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

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
      } catch (e) {
        router.push("/profile");
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [router]);

  

  // Отправка сообщения
  const sendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!message) return;

    interface MessageResponse {
      message?: string;
      message_id?: string;
      conversation_id?: string;
      error?: string;
    }

    console.log("Sending message:", { message, userEmail, targetEmail, conversationId, socketConnected: socketRef.current?.connected });

    // Prefer websocket if connected
    try {
      if (socketRef.current && socketRef.current.connected) {
        console.log("Sending via websocket");
        socketRef.current.emit("send_message", {
          message,
          email: userEmail,
          target_email: targetEmail,
          conversation_id: conversationId,
        });
        setMessage("");
        return;
      }

      console.log("Sending via REST");

      // Fallback to REST if socket unavailable
      const res = await fetch(`${backend}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setConversationId(data.conversation_id || conversationId);
        // persist conversation id so refresh keeps it
        if (data.conversation_id) localStorage.setItem(convStorageKey, data.conversation_id);
        // append only if socket not connected (no real-time delivery)
        if (!socketRef.current || !socketRef.current.connected) {
          const newMsg = { text: message, id: data.message_id };
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
        setMessage(""); // очистка поля
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
    // Don't try to load from localStorage until we know both emails (otherwise key is malformed)
    if (userEmail && targetEmail) {
      const key = `conv:${[userEmail, targetEmail].sort().join(":")}`;
      const stored = localStorage.getItem(key);
      console.log("Socket effect - loading from localStorage:", { key, stored, currentConversationId: conversationId });
      if (stored && !conversationId) {
        console.log("Setting conversationId from localStorage:", stored);
        setConversationId(stored);
      }
    }
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        if (!mounted) return;
        const socket = io(backend, { transports: ["websocket"] });
        socketRef.current = socket;

        socket.on("connect", () => {
          console.log("Socket connected!", { socketId: socket.id, userEmail, conversationId });
          // register this client identity with server for direct deliveries
          if (userEmail) {
            console.log("Emitting register with email:", userEmail);
            socket.emit("register", { email: userEmail });
          } else {
            console.warn("Cannot register - userEmail not available yet");
          }
          // if we already have a conversation, join its room so we receive events
          if (conversationId && userEmail) {
            console.log("Emitting join for conversation:", conversationId);
            socket.emit("join", { conversation_id: conversationId, email: userEmail });
          }
        });

        socket.on("message", (data: any) => {
          console.log("Received message via socket:", data);
          // data: { message_id, conversation_id, sender_id, timestamp, original_text, translated_text }
          // if this client is the sender, show original_text; otherwise show translated_text when available
          const isSender = data.sender_email && data.sender_email === userEmailRef.current;
          const text = isSender ? (data.original_text || data.text || data.translated_text || "") : (data.translated_text || data.original_text || data.text || "");
          const id = data.message_id || String(Date.now());
          const newMsg = { id, text };
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (!conversationId && data.conversation_id) {
            setConversationId(data.conversation_id);
            // persist and join the room for subsequent messages
            try {
              localStorage.setItem(convStorageKey, data.conversation_id);
            } catch (e) {}
            try {
              socket.emit("join", { conversation_id: data.conversation_id, email: userEmail });
            } catch (e) {}
          }
        });

        socket.on("joined", (d: any) => {
          // server confirmed join; capture conversation id if provided
          if (d && d.conversation_id && !conversationId) setConversationId(d.conversation_id);
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

    // Register immediately if already connected
    if (socket.connected) {
      console.log("Registering socket with email (immediate):", userEmail);
      socket.emit("register", { email: userEmail });
    }

    // Also register on future connections (e.g., reconnects)
    const handleConnect = () => {
      console.log("Socket connected, registering with email:", userEmail);
      socket.emit("register", { email: userEmail });
    };

    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
    };
  }, [userEmail]);

  // Join conversation room when conversationId changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !conversationId || !userEmail) return;

    // Join immediately if already connected
    if (socket.connected) {
      console.log("Joining conversation room (immediate):", conversationId);
      socket.emit("join", { conversation_id: conversationId, email: userEmail });
    }

    // Also join on future connections (e.g., reconnects)
    const handleConnect = () => {
      console.log("Socket connected, joining conversation room:", conversationId);
      socket.emit("join", { conversation_id: conversationId, email: userEmail });
    };

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
        const res = await fetch(`${backend}/getEmail?id=${encodeURIComponent(id)}`);
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
        const res = await fetch(`${backend}/getConvs?email=${encodeURIComponent(userEmail)}`);
        if (!res.ok) {
          setConversations([]);
          setLoadingConvs(false);
          return;
        }
        const data = await res.json();
        const convs = data.conversations || [];

        // For each conversation, resolve partner email(s)
        const enriched = [] as any[];
        for (const c of convs) {
          try {
            const participants = c.participants || [];
            // call getEmail for each participant id to resolve email
            const emails: Array<string> = [];
            for (const p of participants) {
              const idStr = typeof p === "string" ? p : (p && p.$oid) ? p.$oid : String(p);
              const email = await fetchEmail(idStr);
              if (email) emails.push(email);
            }
            // Determine partner email (one that isn't the current user)
            const partnerEmail = emails.find((em) => em && em !== userEmail) || emails[0] || "";
            enriched.push({ id: c._id || c.id || String(c["_id"]), partnerEmail, raw: c });
          } catch (e) {
            // skip problematic conv
          }
        }

        if (!mounted) return;
        setConversations(enriched);
        // Auto-select the most recent conversation if available
        if (enriched.length > 0 && !conversationId) {
          const mostRecent = enriched[0];
          console.log("Auto-selecting conversation:", { id: mostRecent.id, partnerEmail: mostRecent.partnerEmail });
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
  }, [authChecked, userEmail, backend]);

  // When conversationId is obtained (e.g., REST created it), join the room
  useEffect(() => {
    console.log("Message loading effect triggered:", { conversationId, userEmail, targetEmail, allPresent: !!(conversationId && userEmail && targetEmail) });
    if (!conversationId || !userEmail || !targetEmail) {
      console.log("Skipping message load - missing required values");
      return;
    }
    // persist using canonical key
    const key = `conv:${[userEmail, targetEmail].sort().join(":")}`;;
    try {
      localStorage.setItem(key, conversationId);
    } catch (e) {}
    // fetch existing messages for this conversation
    (async () => {
      try {
        console.log("Fetching messages for conversation:", conversationId);
        const res = await fetch(
          `${backend}/getMessages?email=${encodeURIComponent(userEmail)}&conversation_id=${encodeURIComponent(conversationId)}`
        );
        if (res.ok) {
          const data = await res.json();
          console.log("Loaded messages:", data);
          if (data && data.messages) {
            // dedupe by id
            const map = new Map<string, string>();
            for (const m of data.messages) map.set(m.message_id, m.text);
            setMessages(Array.from(map.entries()).map(([id, text]) => ({ id, text })));
          }
        }
      } catch (e) {
        console.warn("Failed to load messages", e);
      }
    })();
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

  // Derive display email from conversation if targetEmail not yet set
  const currentConv = conversationId ? conversations.find(c => c.id === conversationId) : null;
  const displayEmail = targetEmail || currentConv?.partnerEmail || "";

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-80 border-r p-4 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Conversations</h2>
          <Link href="/profile">
            <button className="text-sm text-blue-500 hover:text-blue-700">
              Profile
            </button>
          </Link>
        </div>
        <div className="flex flex-col gap-2 mb-4">
          {loadingConvs ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="text-sm text-gray-500">No conversations yet</div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                    const partner = c.partnerEmail || "";                  // Skip if already selected to avoid clearing messages
                  if (c.id === conversationId && partner === targetEmail) {
                    return;
                  }                  setTargetEmail(partner);
                  // persist using canonical key
                  const key = `conv:${[userEmail, partner].sort().join(":")}`;
                  try {
                    localStorage.setItem(key, c.id);
                  } catch (e) {}
                  setConversationId(c.id);
                  setMessages([]);
                }}
                className="text-left p-2 rounded hover:bg-gray-100"
              >
                {c.partnerEmail || "(unknown)"}
              </button>
            ))
          )}
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-medium mb-1">Contact new</h3>
          <div className="flex gap-2">
            <input
              value={newContactEmail}
              onChange={(e) => setNewContactEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 border p-2 rounded"
            />
            <button
              onClick={async () => {
                const email = newContactEmail.trim();
                if (!email) return;
                // if we already have a conversation for this partner, select it
                const existing = conversations.find((cv) => cv.partnerEmail === email);
                try {
                  if (existing) {
                    const key = `conv:${[userEmail, email].sort().join(":")}`;
                    try { localStorage.setItem(key, existing.id); } catch (e) {}
                    setTargetEmail(email);
                    setConversationId(existing.id);
                    setMessages([]);
                  } else {
                    // call backend to create (or return) conversation; backend will ensure accounts exist
                    const resp = await fetch(`${backend}/createConversation`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
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
                        // refresh conversations list to show the new conv
                        setConversations((prev) => [...prev.filter((p) => p.partnerEmail), { id: convId, partnerEmail: email, raw: {} }]);
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
              className="bg-blue-500 text-white px-3 rounded"
            >
              Start
            </button>
          </div>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 p-6 flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold">
          {displayEmail ? `Chat with ${displayEmail}` : "Linguagram"}
        </h1>

        <div className="flex flex-col gap-2 w-full max-w-2xl border p-4 rounded h-[60%] overflow-y-auto bg-gray-50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="p-2 bg-blue-100 rounded w-fit max-w-[80%]"
            >
              {msg.text}
            </div>
          ))}
        </div>

        <form
          onSubmit={sendMessage}
          className="flex gap-2 w-full max-w-2xl items-center"
        >
          <input
            type="text"
            placeholder="Type your message..."
            value={message}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setMessage(e.target.value)
            }
            className="flex-1 border p-2 rounded"
          />
          <button
            type="submit"
            className="bg-blue-500 text-white p-2 rounded cursor-pointer"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
