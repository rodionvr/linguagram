"use client";
import { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";

interface Message {
  id: string;
  text: string;
}

export default function ChatPage() {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [targetEmail, setTargetEmail] = useState<string>(
    "rodion.varlamovgg@gmail.com",
  );
  const [userEmail, setUserEmail] = useState<string>(
    "patillumaniti@gmail.com",
  ); // твой email

  const backend = process.env.BACKEND_URL || "http://localhost:5000"; // адрес Flask
  const socketRef = useRef<any>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

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
        setMessages((prev) => [
          ...prev,
          { text: message, id: data.message_id },
        ]);
        setConversationId(data.conversation_id || conversationId);
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
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        if (!mounted) return;
        const socket = io(backend, { transports: ["websocket"] });
        socketRef.current = socket;

        socket.on("connect", () => {
          console.debug("socket connected", socket.id);
        });

        socket.on("message", (data: any) => {
          // data: { message_id, conversation_id, sender_id, timestamp, original_text, translated_text }
          const text = data.translated_text || data.original_text || data.text || "";
          const id = data.message_id || String(Date.now());
          setMessages((prev) => [...prev, { id, text }]);
          if (!conversationId && data.conversation_id) {
            setConversationId(data.conversation_id);
          }
        });

        socket.on("joined", (d: any) => {
          // optionally handle joined
          if (d && d.conversation_id && !conversationId) setConversationId(d.conversation_id);
        });

        socket.on("connect_error", (err: any) => {
          console.warn("socket connect error", err);
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

  return (
    <div className="flex flex-col items-center justify-start h-screen p-4 gap-4">
      <h1 className="text-2xl font-bold">Chat with {targetEmail}</h1>

      <div className="flex flex-col gap-2 w-full max-w-md border p-4 rounded h-[60%] overflow-y-auto bg-gray-50">
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
        className="flex gap-2 w-full max-w-md items-center"
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
    </div>
  );
}
