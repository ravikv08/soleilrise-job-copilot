import { redirect } from "next/navigation";

import { auth, hasProviders, signIn } from "@/auth";

export default async function SignIn() {
  const session = await auth();
  if (session?.user) redirect("/profile");

  return (
    <section className="card grid max-w-md gap-4">
      <h1 className="text-2xl">Sign in</h1>

      {hasProviders ? (
        <>
          <p style={{ color: "var(--muted)" }}>
            Your resume, jobs and applications stay private to your account.
          </p>
          {process.env.AUTH_GOOGLE_ID ? (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/profile" });
              }}
            >
              <button className="btn" type="submit">
                Continue with Google
              </button>
            </form>
          ) : null}
          {process.env.AUTH_GITHUB_ID ? (
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/profile" });
              }}
            >
              <button className="btn ghost" type="submit">
                Continue with GitHub
              </button>
            </form>
          ) : null}
        </>
      ) : (
        <div className="notice warn">
          No sign-in provider is configured yet. Add <code>AUTH_GOOGLE_ID</code> and{" "}
          <code>AUTH_GOOGLE_SECRET</code> (or the GitHub pair) to <code>.env.local</code>, then
          restart the dev server. See <code>web/README.md</code>.
        </div>
      )}
    </section>
  );
}
