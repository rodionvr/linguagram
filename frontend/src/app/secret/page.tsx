import { auth, signIn, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function Secret() {
    const session = await auth();

    if(!session) return redirect("/profile")

    return <h1>Welcome to the secret content</h1>
}