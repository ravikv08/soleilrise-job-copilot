import { redirect } from "next/navigation";

import { auth, devLoginEnabled, enabledProviders, hasProviders, signIn } from "@/auth";

export default async function SignIn() {
  const session = await auth();
  if (session?.user) redirect("/profile");

  return (
    <section className="card grid max-w-md gap-4">
      <h1 className="text-2xl">Sign in</h1>

      {hasProviders ? (
        <p style={{ color: "var(--muted)" }}>
          Your resume, jobs and applications stay private to your account.
        </p>
      ) : null}

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

      {devLoginEnabled ? (
        <form
          className="grid gap-2"
          action={async (form: FormData) => {
            "use server";
            await signIn("dev-email", {
              email: String(form.get("email") ?? ""),
              redirectTo: "/profile",
            });
          }}
        >
          {enabledProviders.length > 0 ? (
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              or
            </div>
          ) : null}
          <label className="grid gap-1 text-sm font-semibold">
            Email
            <input
              name="email"
              type="email"
              required
              className="field"
              placeholder="you@example.com"
            />
          </label>
          <button className="btn" type="submit">
            Send me a sign-in link
          </button>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Development mode: the link is printed in the terminal running{" "}
            <code>npm run dev</code>, not emailed. Paste it into your browser to sign in.
          </p>
        </form>
      ) : null}

      {!hasProviders ? (
        <div className="notice warn">
          No way to sign in is configured. For local development, set{" "}
          <code>DEV_EMAIL_LOGIN=1</code> in <code>.env.local</code> and restart — that prints a
          sign-in link to the terminal and needs no other account. For real users, add an OAuth
          provider (both halves). See <code>web/README.md</code>.
        </div>
      ) : null}
    </section>
  );
}
