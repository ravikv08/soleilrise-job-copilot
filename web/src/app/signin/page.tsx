import { redirect } from "next/navigation";

import { auth, enabledProviders, signIn } from "@/auth";

export default async function SignIn() {
  const session = await auth();
  if (session?.user) redirect("/profile");

  return (
    <section className="card grid max-w-md gap-4">
      <h1 className="text-2xl">Sign in</h1>

      {enabledProviders.length > 0 ? (
        <>
          <p style={{ color: "var(--muted)" }}>
            Your resume, jobs and applications stay private to your account.
          </p>
          {enabledProviders.map((p, i) => (
            <form
              key={p.id}
              action={async () => {
                "use server";
                await signIn(p.id, { redirectTo: "/profile" });
              }}
            >
              <button className={i === 0 ? "btn" : "btn ghost"} type="submit">
                {p.label}
              </button>
            </form>
          ))}
        </>
      ) : (
        <div className="notice warn">
          No sign-in provider is configured yet. Add <code>AUTH_GOOGLE_ID</code> and{" "}
          <code>AUTH_GOOGLE_SECRET</code> (or the GitHub pair — both halves are required) to{" "}
          <code>.env.local</code>, then restart the dev server. See <code>web/README.md</code>.
        </div>
      )}
    </section>
  );
}
