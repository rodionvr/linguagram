"use client";
import { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";

interface Message {
  id: string;
  text: string;
  sender_id?: string;
  timestamp?: string;
}

// Helper function to get initials from name
const getInitials = (name: string) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const LANGUAGES = [
  "English",
  "French",
  "Russian",
  "Spanish",
  "German",
  "Chinese",
  "Japanese",
  "Arabic",
  "Portuguese",
  "Italian",
];

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
  const [conversations, setConversations] = useState<Array<any>>([]);
  const [newContactEmail, setNewContactEmail] = useState<string>("");
  const [loadingConvs, setLoadingConvs] = useState<boolean>(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState<boolean>(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState<boolean>(false);
  const [session, setSession] = useState<any>(null);
  const [userLanguage, setUserLanguage] = useState<string>("");
  const [darkMode, setDarkMode] = useState(false);

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
        setSession(data);
        // Fetch user ID from backend
        try {
          const userRes = await fetch(`${backend}/login?email=${encodeURIComponent(email)}`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            console.log("User data from backend:", userData);
            if (userData.user?._id) {
              console.log("Setting userId to:", userData.user._id);
              setUserId(userData.user._id);
            } else {
              console.warn("No _id found in user data");
            }
            if (userData.user?.language) {
              setUserLanguage(userData.user.language);
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
    
    // Load dark mode preference from localStorage
    const savedDarkMode = localStorage.getItem("darkMode") === "true";
    setDarkMode(savedDarkMode);
    
    // Listen for dark mode changes from other pages/tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "darkMode") {
        setDarkMode(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handleStorageChange);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
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
          const newMsg = { id, text, sender_id: data.sender_id, timestamp: data.timestamp };
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
            
            // If latest.text is missing, fetch the last message from the conversation
            let lastMessageText = c.latest?.text || null;
            if (!lastMessageText && c._id) {
              try {
                const msgRes = await fetch(`${backend}/getMessages?email=${encodeURIComponent(userEmail)}&conversation_id=${c._id}`, {
                  headers: { 'ngrok-skip-browser-warning': 'true' }
                });
                if (msgRes.ok) {
                  const msgData = await msgRes.json();
                  const messages = msgData.messages || [];
                  if (messages.length > 0) {
                    lastMessageText = messages[messages.length - 1].text;
                  }
                }
              } catch (e) {
                // ignore error, will show "No messages yet"
              }
            }
            
            enriched.push({ 
              id: c._id || c.id || String(c["_id"]), 
              partnerEmail, 
              raw: c,
              lastMessageText 
            });
          } catch (e) {
            // skip problematic conv
          }
        }

        if (!mounted) return;
        setConversations(enriched);
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
          `${backend}/getMessages?email=${encodeURIComponent(userEmail)}&conversation_id=${encodeURIComponent(conversationId)}`,
          { headers: { 'ngrok-skip-browser-warning': 'true' } }
        );
        if (res.ok) {
          const data = await res.json();
          console.log("Loaded messages:", data);
          if (data && data.messages) {
            // dedupe by id and preserve sender_id and timestamp
            const map = new Map<string, { text: string; sender_id: string; timestamp?: string }>();
            for (const m of data.messages) {
              map.set(m.message_id, { text: m.text, sender_id: m.sender_id, timestamp: m.timestamp });
            }
            setMessages(Array.from(map.entries()).map(([id, { text, sender_id, timestamp }]) => ({ 
              id, 
              text, 
              sender_id,
              timestamp
            })));
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

  // Polling effect to fetch new messages periodically
  useEffect(() => {
    if (!conversationId || !userEmail) return;
    
    const pollMessages = setInterval(async () => {
      try {
        const res = await fetch(
          `${backend}/getMessages?email=${encodeURIComponent(userEmail)}&conversation_id=${encodeURIComponent(conversationId)}`,
          { headers: { 'ngrok-skip-browser-warning': 'true' } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.messages) {
            const map = new Map<string, { text: string; sender_id: string; timestamp?: string }>();
            for (const m of data.messages) {
              map.set(m.message_id, { text: m.text, sender_id: m.sender_id, timestamp: m.timestamp });
            }
            setMessages(Array.from(map.entries()).map(([id, { text, sender_id, timestamp }]) => ({ 
              id, 
              text, 
              sender_id,
              timestamp
            })));
          }
        }
      } catch (e) {
        console.error("Polling failed:", e);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollMessages);
  }, [conversationId, userEmail, backend]);

  if (!authChecked) return null;

  // Derive display email from conversation if targetEmail not yet set
  const currentConv = conversationId ? conversations.find(c => c.id === conversationId) : null;
  const displayEmail = targetEmail || currentConv?.partnerEmail || "";
  
  const user = session?.user;
  const userName = user?.name || userEmail;

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/profile" });
  };

  // Show empty state when no conversations
  if (conversations.length === 0 && !loadingConvs) {
    return (
      <div className={`min-h-screen flex flex-col ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
        {/* Header */}
        <header className={`p-4 flex items-center justify-between ${darkMode ? 'bg-gray-900 border-b border-gray-800' : 'bg-white border-b border-gray-200'}`}>
          <div className="relative">
            <button 
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gradient-to-br from-purple-200 to-purple-300 text-gray-700'}`}>
                {getInitials(userName)}
              </div>
              <div className="flex flex-col items-start">
                <p className={`font-semibold text-base leading-tight ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{userName.split(' ')[0] || userName}</p>
                <p className={`text-xs leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{userEmail.split('@')[0]}</p>
              </div>
            </button>
            
            {showProfileDropdown && (
              <div className={`absolute left-0 mt-2 w-72 rounded-lg shadow-xl border z-50 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white'}`}>
                <div className="p-4">
                  <div className={`flex flex-col items-center gap-3 pb-4 ${darkMode ? 'border-b border-gray-800' : 'border-b'}`}>
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gradient-to-br from-purple-200 to-purple-300 text-gray-700'}`}>
                      {getInitials(userName)}
                    </div>
                    <div className="text-center">
                      <p className={`font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>{userName}</p>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{userEmail}</p>
                    </div>
                  </div>
                  
                  <div className={`py-3 ${darkMode ? 'border-b border-gray-800' : 'border-b'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Language</span>
                      <span className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{userLanguage || "Not set"}</span>
                    </div>
                  </div>
                  
                  <div className="pt-3">
                    <Link href="/profile" className="w-full">
                      <button className="w-full px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
                        Edit Profile
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="relative">
            <button
              onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
              className={`px-4 py-2 border rounded-full text-sm font-medium shadow-sm hover:bg-gray-50 flex items-center gap-2 ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700' : 'bg-white border-gray-300 text-gray-700'}`}
            >
              <span>{userLanguage || "English"}</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            
            {showLanguageDropdown && (
              <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-xl border z-50 max-h-64 overflow-y-auto ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white'}`}>
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    onClick={async () => {
                      try {
                        const res = await fetch(`${backend}/updateLanguage`, {
                          method: "POST",
                          headers: { 
                            "Content-Type": "application/json",
                            "ngrok-skip-browser-warning": "true"
                          },
                          body: JSON.stringify({ email: userEmail, language: lang }),
                        });
                        if (res.ok) {
                          setUserLanguage(lang);
                          setShowLanguageDropdown(false);
                        }
                      } catch (e) {
                        console.error("Failed to update language", e);
                      }
                    }}
                    className={`w-full px-4 py-2 text-left text-sm first:rounded-t-lg last:rounded-b-lg ${
                      userLanguage === lang 
                        ? "bg-blue-50 text-blue-600 font-medium" 
                        : darkMode ? "text-gray-200 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Main Content - Empty State */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-28 text-center">
          <div className="max-w-sm w-full space-y-6">
            {/* SVG Illustration */}
            <div className="w-full max-w-[300px] mx-auto mb-2">
              <img 
                src="/assets/Working-Together--Streamline-Lagos.svg" 
                alt="No chats illustration" 
                className="w-full h-auto"
              />
            </div>

            {/* Text */}
            <div className="space-y-2.5">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>No chats</h2>
              <p className={`text-sm leading-relaxed px-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Invite someone and start a conversation — language won't be a problem.
              </p>
            </div>

            {/* Invite Button */}
            <button
              onClick={() => {
                const email = prompt("Enter email address to invite:");
                if (!email) return;
                (async () => {
                  try {
                    const resp = await fetch(`${backend}/createConversation`, {
                      method: "POST",
                      headers: { 
                        "Content-Type": "application/json",
                        "ngrok-skip-browser-warning": "true"
                      },
                      body: JSON.stringify({ email: userEmail, target_email: email.trim() }),
                    });
                    if (!resp.ok) {
                      const err = await resp.json().catch(() => ({}));
                      alert(err.error || "Failed to create conversation");
                    } else {
                      const d = await resp.json();
                      const convId = d.conversation_id;
                      if (convId) {
                        setTargetEmail(email.trim());
                        setConversationId(convId);
                        setConversations([{ id: convId, partnerEmail: email.trim(), raw: {} }]);
                      }
                    }
                  } catch (e) {
                    alert("Failed to start conversation: " + e);
                  }
                })();
              }}
              className="w-full max-w-xs mx-auto py-4 px-8 bg-indigo-300 hover:bg-indigo-400 text-gray-800 rounded-full font-semibold text-base shadow-sm transition-all duration-200"
            >
              Invite Friends
            </button>
          </div>
        </main>

        {/* Bottom Navigation */}
        <nav className={`fixed bottom-0 left-0 right-0 py-4 px-6 flex items-center justify-around shadow-lg ${darkMode ? 'bg-gray-900/95 border-t border-gray-800' : 'bg-white border-t border-gray-200'}`}>
          <button className={`flex flex-col items-center gap-1.5 min-w-[80px] ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            <img src="/assets/fi-br-comments.svg" alt="Chats" className={`w-7 h-7 ${darkMode ? 'invert' : ''}`} />
            <span className="text-sm font-semibold">Chats</span>
          </button>
          
          <Link href="/profile" className={`flex flex-col items-center gap-1.5 min-w-[80px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <img src="/assets/fi-br-flower.svg" alt="Settings" className={`w-7 h-7 opacity-60 ${darkMode ? 'invert' : ''}`} />
            <span className="text-sm font-medium">Settings</span>
          </Link>
        </nav>
      </div>
    );
  }

  // Show friends list layout when there are conversations
  return (
    <div className={`min-h-screen flex flex-col ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`p-5 flex items-center justify-between ${darkMode ? 'bg-gray-900 border-b border-gray-800' : 'bg-white border-b border-gray-200'}`}>
        <div className="relative">
          <button 
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold shadow-sm ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gradient-to-br from-purple-200 to-purple-300 text-gray-700'}`}>
              {getInitials(userName)}
            </div>
            <div className="flex flex-col items-start">
              <p className={`font-semibold leading-tight ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{userName.split(' ')[0] || userName}</p>
              <p className={`text-sm leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{userEmail.split('@')[0]}</p>
            </div>
          </button>
          
          {showProfileDropdown && (
            <div className={`absolute left-0 mt-2 w-72 rounded-lg shadow-xl border z-50 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white'}`}>
              <div className="p-4">
                <div className={`flex flex-col items-center gap-3 pb-4 ${darkMode ? 'border-b border-gray-800' : 'border-b'}`}>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gradient-to-br from-purple-200 to-purple-300 text-gray-700'}`}>
                    {getInitials(userName)}
                  </div>
                  <div className="text-center">
                    <p className={`font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>{userName}</p>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{userEmail}</p>
                  </div>
                </div>
                
                <div className={`py-3 ${darkMode ? 'border-b border-gray-800' : 'border-b'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Language</span>
                    <span className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{userLanguage || "Not set"}</span>
                  </div>
                </div>
                
                <div className="pt-3">
                  <Link href="/profile" className="w-full">
                    <button className="w-full px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
                      Edit Profile
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
            className={`px-4 py-2.5 border rounded-full font-medium shadow-sm flex items-center gap-2 ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            <span>{userLanguage || "English"}</span>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          
          {showLanguageDropdown && (
            <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-xl border z-50 max-h-64 overflow-y-auto ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white'}`}>
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={async () => {
                    try {
                      const res = await fetch(`${backend}/updateLanguage`, {
                        method: "POST",
                        headers: { 
                          "Content-Type": "application/json",
                          "ngrok-skip-browser-warning": "true"
                        },
                        body: JSON.stringify({ email: userEmail, language: lang }),
                      });
                      if (res.ok) {
                        setUserLanguage(lang);
                        setShowLanguageDropdown(false);
                      }
                    } catch (e) {
                      console.error("Failed to update language", e);
                    }
                  }}
                  className={`w-full px-4 py-2 text-left text-sm first:rounded-t-lg last:rounded-b-lg ${
                    userLanguage === lang 
                      ? "bg-blue-50 text-blue-600 font-medium" 
                      : darkMode ? "text-gray-200 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main Content - Friends List or Chat */}
      {conversationId ? (
        // Show chat view when a conversation is selected
        <main className="flex-1 flex flex-col px-5 pb-28 overflow-hidden">
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={() => {
                setConversationId(null);
                setTargetEmail("");
                setMessages([]);
              }}
              className={`p-1 ${darkMode ? 'text-blue-400 active:text-blue-300' : 'text-blue-500 active:text-blue-700'}`}
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className={`text-lg font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {displayEmail}
            </h1>
          </div>

          <div className={`flex-1 flex flex-col gap-2 rounded-2xl shadow-sm p-4 overflow-y-auto mb-4 ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
            {messages.map((msg) => {
              const isFromMe = msg.sender_id === userId;
              
              // Format timestamp
              const formatMessageTime = (timestamp: string | undefined) => {
                if (!timestamp) return "";
                const date = new Date(timestamp);
                const now = new Date();
                const isToday = date.toDateString() === now.toDateString();
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                const isYesterday = date.toDateString() === yesterday.toDateString();
                
                const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                
                if (isToday) {
                  return timeStr;
                } else if (isYesterday) {
                  return `Yesterday ${timeStr}`;
                } else {
                  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${timeStr}`;
                }
              };
              
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1 ${isFromMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`p-3 rounded-2xl max-w-[80%] ${
                      isFromMe 
                        ? 'bg-blue-500 text-white' 
                        : darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gray-200 text-gray-900'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className={`text-xs px-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {formatMessageTime(msg.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={sendMessage}
            className={`flex gap-2 items-center rounded-full shadow-md p-2 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'}`}
          >
            <input
              type="text"
              placeholder="Type your message..."
              value={message}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setMessage(e.target.value)
              }
              className={`flex-1 px-5 py-3 rounded-full focus:outline-none text-base ${darkMode ? 'bg-gray-800 text-gray-100 placeholder-gray-500' : 'bg-white text-gray-900'}`}
            />
            <button
              type="submit"
              className="bg-blue-500 active:bg-blue-600 text-white p-3.5 rounded-full"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </main>
      ) : (
        // Show friends list when no conversation is selected
        <main className="flex-1 px-5 pb-28 overflow-y-auto">
          <div className="w-full">
            <div className="flex items-center justify-between mb-5">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Friends</h2>
              <button
                onClick={() => {
                  const email = prompt("Enter email address to invite:");
                  if (!email) return;
                  (async () => {
                    try {
                      const resp = await fetch(`${backend}/createConversation`, {
                        method: "POST",
                        headers: { 
                          "Content-Type": "application/json",
                          "ngrok-skip-browser-warning": "true"
                        },
                        body: JSON.stringify({ email: userEmail, target_email: email.trim() }),
                      });
                      if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        alert(err.error || "Failed to create conversation");
                      } else {
                        const d = await resp.json();
                        const convId = d.conversation_id;
                        if (convId) {
                          setTargetEmail(email.trim());
                          setConversationId(convId);
                          setConversations((prev) => [...prev, { id: convId, partnerEmail: email.trim(), raw: {} }]);
                        }
                      }
                    } catch (e) {
                      alert("Failed to start conversation: " + e);
                    }
                  })();
                }}
                className={`font-medium px-2 ${darkMode ? 'text-blue-400 active:text-blue-300' : 'text-blue-500 active:text-blue-700'}`}
              >
                + Add Friend
              </button>
            </div>

            <div className="space-y-3">
              {loadingConvs ? (
                <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Loading...</div>
              ) : (
                conversations.map((c) => {
                  const partnerEmail = c.partnerEmail || "";
                  const partnerName = partnerEmail.split('@')[0];
                  const capitalizedName = partnerName.charAt(0).toUpperCase() + partnerName.slice(1);
                  
                  // Get last message info - check both latest.text and lastMessageText
                  const lastMessage = c.lastMessageText || c.raw?.latest?.text || "No messages yet";
                  const lastMessageTime = c.raw?.latest?.timestamp;
                  
                  // Format timestamp
                  const formatTime = (timestamp: string) => {
                    if (!timestamp) return "";
                    const date = new Date(timestamp);
                    const now = new Date();
                    const diffMs = now.getTime() - date.getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMs / 3600000);
                    const diffDays = Math.floor(diffMs / 86400000);
                    
                    if (diffMins < 1) return "Just now";
                    if (diffMins < 60) return `${diffMins}m ago`;
                    if (diffHours < 24) return `${diffHours}h ago`;
                    if (diffDays < 7) return `${diffDays}d ago`;
                    return date.toLocaleDateString();
                  };
                  
                  return (
                    <div
                      key={c.id}
                      className={`w-full flex items-center gap-4 p-5 rounded-2xl shadow-sm relative group ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}
                    >
                      <button
                        onClick={() => {
                          setTargetEmail(partnerEmail);
                          setConversationId(c.id);
                        }}
                        className={`flex items-center gap-4 flex-1 rounded-2xl -m-5 p-5 ${darkMode ? 'active:bg-gray-800' : 'active:bg-gray-50'}`}
                      >
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gradient-to-br from-blue-400 to-blue-500 text-white'}`}>
                          {getInitials(capitalizedName)}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className={`font-semibold text-lg ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{capitalizedName}</p>
                            <span className={`text-xs flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatTime(lastMessageTime)}</span>
                          </div>
                          <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{lastMessage}</p>
                        </div>
                        <svg className={`w-6 h-6 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete conversation with ${partnerName}?`)) {
                            (async () => {
                              try {
                                const resp = await fetch(`${backend}/deleteConversation`, {
                                  method: "POST",
                                  headers: { 
                                    "Content-Type": "application/json",
                                    "ngrok-skip-browser-warning": "true"
                                  },
                                  body: JSON.stringify({ conversation_id: c.id }),
                                });
                                if (resp.ok) {
                                  setConversations((prev) => prev.filter((conv) => conv.id !== c.id));
                                  if (conversationId === c.id) {
                                    setConversationId(null);
                                    setTargetEmail("");
                                    setMessages([]);
                                  }
                                } else {
                                  const err = await resp.json().catch(() => ({}));
                                  alert(err.error || "Failed to delete conversation");
                                }
                              } catch (e) {
                                alert("Failed to delete conversation: " + e);
                              }
                            })();
                          }
                        }}
                        className="absolute right-5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-red-500 text-white active:bg-red-600 z-10"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>
      )}

      {/* Bottom Navigation */}
      <nav className={`fixed bottom-0 left-0 right-0 backdrop-blur-md py-4 px-6 flex items-center justify-around shadow-lg ${darkMode ? 'bg-gray-900/95 border-t border-gray-800' : 'bg-white/80 border-t border-gray-200'}`}>
        <button className={`flex flex-col items-center gap-2 min-w-[90px] ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          <img src="/assets/fi-br-comments.svg" alt="Chats" className={`w-8 h-8 ${darkMode ? 'invert' : ''}`} />
          <span className="text-xs font-semibold">Chats</span>
        </button>
        
        <Link href="/profile" className={`flex flex-col items-center gap-2 min-w-[90px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <img src="/assets/fi-br-flower.svg" alt="Settings" className={`w-8 h-8 opacity-60 ${darkMode ? 'invert' : ''}`} />
          <span className="text-xs font-medium">Settings</span>
        </Link>
      </nav>
    </div>
  );
}
