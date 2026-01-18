import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function Secret() {
  const session = await auth();
  const user = session?.user;

  if (!session) return redirect("/profile");

  // Call backend /login endpoint server-side with name and email
  try {
    const backend = process.env.BACKEND_URL || "http://localhost:5000";
    await fetch(`${backend}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: user?.name, email: user?.email }),
    });
  } catch (e) {
    // non-fatal: continue to profile even if backend call fails
    console.error("Backend login call failed:", e);
  }

  // Redirect to profile where user can set language and access chat
  redirect("/profile");
}
