import { auth, signIn, signOut } from "@/auth";

export default async function SignIn() {
  const session = await auth();
  const user = session?.user;

  return user ? (
    <>
      <h1>Welcome {user.name}</h1>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit" className="p-2 border-2 bg-red-400">Signout</button>
      </form>
    </>
  ) : (
    <>
      <form
        className="flex flex-col items-center justify-center gap-4"
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: '/secret'});
        }}
      >
        <button type="submit" className="m-auto border-2 p-2 bg-green-400">Signin with Google</button>
      </form>
    </>
  );
}
