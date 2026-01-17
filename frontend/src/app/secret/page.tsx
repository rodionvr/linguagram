import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function Secret() {
  const session = await auth();
  const user = session?.user;

  if (!session) return redirect("/profile");

  return (
    <>
      <h1>Welcome to the messenger, {user?.name}</h1>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit" className="p-2 border-2 bg-red-400">
          Signout
        </button>
      </form>
    </>
  );
}
