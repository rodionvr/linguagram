"use client";
import { signOut } from "next-auth/react";
import { FcGoogle } from "react-icons/fc";
import Link from "next/link";
import { useState, useEffect } from "react";

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

export default function Profile() {
  const [session, setSession] = useState<any>(null);
  const [userLanguage, setUserLanguage] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isEditingLanguage, setIsEditingLanguage] = useState(false);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          setSession(data);
          
          if (data?.user?.email) {
            // Fetch user data from backend to check language
            const userRes = await fetch(`${backend}/login?email=${encodeURIComponent(data.user.email)}`, {
              headers: {
                'ngrok-skip-browser-warning': 'true'
              }
            });
            if (userRes.ok) {
              const userData = await userRes.json();
              setUserLanguage(userData.user?.language || "");
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch session or user data", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [backend]);

  const handleLanguageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLanguage || !session?.user?.email) return;

    try {
      const res = await fetch(`${backend}/updateLanguage`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ email: session.user.email, language: selectedLanguage }),
      });

      if (res.ok) {
        setUserLanguage(selectedLanguage);
        setIsEditingLanguage(false);
        setSelectedLanguage("");
      } else {
        alert("Failed to update language");
      }
    } catch (e) {
      console.error("Failed to update language", e);
      alert("Failed to update language");
    }
  };

  const handleSignIn = async () => {
    const { signIn } = await import("next-auth/react");
    await signIn("google", { callbackUrl: "/secret" });
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/profile" });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  const user = session?.user;

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleSignIn}
            className="px-10 py-3 bg-black flex items-center justify-center gap-1 rounded-md text-white cursor-pointer"
          >
            <FcGoogle className="w-5 h-5" />
            Signin with Google
          </button>
        </div>
      </div>
    );
  }

  // Show language selection if user doesn't have a language set
  if (!userLanguage) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-white shadow-lg max-w-md">
          <h2 className="text-xl font-bold">Welcome, {user.name}!</h2>
          <p className="text-gray-600">Please select your preferred language:</p>
          <form onSubmit={handleLanguageSubmit} className="w-full flex flex-col gap-4">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full p-2 border rounded"
              required
            >
              <option value="">Choose a language...</option>
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Normal profile view once language is set
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h1 className="text-2xl font-bold">Welcome {user.name}</h1>
      
      {isEditingLanguage ? (
        <form onSubmit={handleLanguageSubmit} className="flex flex-col gap-3 items-center">
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="p-2 border rounded"
            required
          >
            <option value="">Choose a language...</option>
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditingLanguage(false);
                setSelectedLanguage("");
              }}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-gray-600">Language: {userLanguage}</p>
          <button
            onClick={() => {
              setSelectedLanguage(userLanguage || "");
              setIsEditingLanguage(true);
            }}
            className="text-sm text-blue-500 hover:text-blue-700 underline"
          >
            Change
          </button>
        </div>
      )}
      
      <div className="flex gap-2 mt-4">
        <Link href="/chat">
          <button className="p-2 border-2 bg-blue-500 text-white rounded">
            Go to Chats
          </button>
        </Link>
        <button
          onClick={handleSignOut}
          className="p-2 border-2 bg-red-400 rounded"
        >
          Signout
        </button>
      </div>
    </div>
  );
}
