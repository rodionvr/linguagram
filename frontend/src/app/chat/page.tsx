"use client";
import { useState, useEffect, FormEvent, ChangeEvent } from "react";

interface Message {
  id: string;
  text: string;
}

export default function ChatPage() {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [targetEmail, setTargetEmail] = useState<string>(
    "patillumaniti@gmail.com",
  );
  const [userEmail, setUserEmail] = useState<string>(
    "rodion.varlamovgg@gmail.com",
  ); // твой email

  const backend = process.env.BACKEND_URL || "http://localhost:5000"; // адрес Flask

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

    try {
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
        setMessage(""); // очистка поля
      } else {
        console.error("Message failed:", data);
        alert(data.error || "Error sending message");
      }
    } catch (err) {
      console.error("Fetch failed:", err);
      alert("Failed to send message" + err);
    }
  };

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
