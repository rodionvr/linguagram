import { auth, signIn, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function Secret() {
    const session = await auth();
    const user = session?.user;

    if(!session) return redirect("/profile")

    return (
    <h1>Welcome to the messenger, { user?.name}</h1>
    )
}