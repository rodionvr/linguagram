import { auth, signIn, signOut } from "@/auth";
import { FcGoogle } from "react-icons/fc";

export default async function SignIn() {
  const session = await auth();
  const user = session?.user;
  console.log(session)

  return user ? (
    <>
      <h1>Welcome {user.name}</h1>
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
  ) : (
    <>
      <div className="flex items-center justify-center h-screen">
        <form
          className="flex flex-col items-center gap-4"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/secret" });
          }}
        >
          <button
            type="submit"
            className="px-10 py-3 bg-black flex items-center justify-center gap-1 rounded-md text-white cursor-pointer"
          >
            <FcGoogle className="w-5 h-5" />
            Signin with Google
          </button>
        </form>
      </div>
    </>
  );
}
