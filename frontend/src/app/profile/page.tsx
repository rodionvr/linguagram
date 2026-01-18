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

// Helper function to get initials from name
const getInitials = (name: string) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export default function Profile() {
  const [session, setSession] = useState<any>(null);
  const [userLanguage, setUserLanguage] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isEditingLanguage, setIsEditingLanguage] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedName, setEditedName] = useState("");
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          setSession(data);
          setEditedName(data?.user?.name || "");
          
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
    
    // Load dark mode preference from localStorage
    const savedDarkMode = localStorage.getItem("darkMode") === "true";
    setDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.documentElement.classList.add("dark");
    }
    
    // Listen for dark mode changes from other pages/tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "darkMode") {
        const newDarkMode = e.newValue === "true";
        setDarkMode(newDarkMode);
        if (newDarkMode) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
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
    await signIn("google", { callbackUrl: "/chat" });
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/profile" });
  };

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem("darkMode", newDarkMode.toString());
    if (newDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const handleProfileUpdate = async () => {
    if (!editedName.trim()) {
      alert("Name cannot be empty");
      return;
    }
    // Note: This would require a backend endpoint to update the user's name
    // For now, we'll just update the local state
    setSession({ ...session, user: { ...session.user, name: editedName } });
    setIsEditingProfile(false);
    alert("Profile updated successfully");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  const user = session?.user;

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full mx-auto">
          <div className="flex flex-col items-center text-center space-y-8">
            {/* SVG Illustration */}
            <div className="w-full max-w-sm">
              <img 
                src="/assets/Facetime-Meeting--Streamline-Lagos.svg" 
                alt="Language communication illustration" 
                className="w-full h-auto"
              />
            </div>

            {/* Title */}
            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                Messaging Without<br />Language Limits.
              </h1>
              <p className="text-base text-gray-600 max-w-sm mx-auto">
                Chat naturally in your own language while others read messages in theirs
              </p>
            </div>

            {/* Sign In Button */}
            <div className="w-full space-y-4 pt-4">
              <button
                onClick={handleSignIn}
                className="w-full py-3.5 px-6 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-full font-medium text-base shadow-sm hover:shadow transition-all duration-200 flex items-center justify-center gap-3"
              >
                <FcGoogle className="w-5 h-5" />
                Sign in with Google
              </button>
              
              <p className="text-sm text-gray-600">
                Have an Account?{" "}
                <button 
                  onClick={handleSignIn}
                  className="text-gray-900 font-semibold hover:underline"
                >
                  Login
                </button>
              </p>
            </div>
          </div>
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
    <div className={`flex flex-col h-screen ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Header with Back Arrow */}
      <header className={`p-4 flex items-center gap-4 shadow-sm ${darkMode ? 'bg-gray-900 border-b border-gray-800' : 'bg-white'}`}>
        <Link href="/chat">
          <button className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
            <svg className={`w-6 h-6 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </Link>
        <h1 className={`text-xl font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>Profile Settings</h1>
      </header>

      {/* Profile Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          {/* Profile Card */}
          <div className={`shadow-lg rounded-lg p-6 ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold border-4 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-blue-500 border-blue-600'}`}>
                {getInitials(user.name || user.email || "")}
              </div>
              {isEditingProfile ? (
                <div className="w-full space-y-3">
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className={`w-full px-3 py-2 border rounded text-center text-xl font-bold ${darkMode ? 'bg-gray-800 text-gray-100 border-gray-700' : 'bg-white text-gray-900'}`}
                    placeholder="Enter your name"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleProfileUpdate}
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditedName(user.name || "");
                        setIsEditingProfile(false);
                      }}
                      className={`flex-1 px-4 py-2 rounded text-sm ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-300 hover:bg-gray-400'}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <h2 className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>{user.name}</h2>
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="text-sm text-blue-500 hover:text-blue-700 underline mt-1"
                  >
                    Edit Name
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Email</label>
                <p className={`p-2 rounded border ${darkMode ? 'text-gray-200 bg-gray-800 border-gray-700' : 'text-gray-800 bg-gray-50'}`}>{user.email}</p>
              </div>
            </div>
          </div>

          {/* Settings Card */}
          <div className={`shadow-lg rounded-lg p-6 ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>Settings</h3>
            
            <div className="space-y-4">
              {/* Language Preference */}
              {isEditingLanguage ? (
                <form onSubmit={handleLanguageSubmit} className="flex flex-col gap-3">
                  <label className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Language Preference</label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className={`p-2 border rounded ${darkMode ? 'bg-gray-800 text-gray-100 border-gray-700' : 'bg-white'}`}
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
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingLanguage(false);
                        setSelectedLanguage("");
                      }}
                      className={`flex-1 px-4 py-2 rounded text-sm ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-300 hover:bg-gray-400'}`}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className={`flex items-center justify-between p-3 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                  <div>
                    <label className={`text-sm font-medium block ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Language Preference</label>
                    <p className={`font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{userLanguage}</p>
                  </div>
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

              {/* Dark Mode Toggle */}
              <div className={`flex items-center justify-between p-3 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                <div>
                  <label className={`text-sm font-medium block ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Dark Mode</label>
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Switch between light and dark theme</p>
                </div>
                <button
                  onClick={toggleDarkMode}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    darkMode ? "bg-blue-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      darkMode ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Log Out Button */}
              <button
                onClick={handleSignOut}
                className="w-full p-3 bg-red-500 text-white rounded hover:bg-red-600 font-medium flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Log Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
