import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { cache } from "react";

import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

/**
 * OAuth providers are opt-in by environment, so the app boots with whichever
 * credentials you have configured rather than failing on the ones you don't.
 * A provider needs BOTH halves — the sign-in page renders buttons from this
 * list, so a half-configured provider never gets a button that would throw.
 */
const OAUTH = [
  { id: "google", label: "Continue with Google", env: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"] },
  { id: "github", label: "Continue with GitHub", env: ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] },
] as const;

export const enabledProviders = OAUTH.filter((p) =>
  p.env.every((k) => Boolean(process.env[k])),
).map((p) => ({ id: p.id, label: p.label }));

/**
 * Local sign-in link, for development only.
 *
 * Auth.js email sign-in normally mails a one-time link. Nothing requires it to
 * be *mailed* — the link is just a signed URL. In development we print it to
 * the server terminal instead, which gives real sign-in with no email service,
 * no OAuth app and no third-party account.
 *
 * Guarded twice: never in production, and only when DEV_EMAIL_LOGIN is set. A
 * printed sign-in link is a bypass for anyone who can read the logs, so it must
 * not be something you can switch on by accident.
 */
export const devLoginEnabled =
  process.env.NODE_ENV !== "production" && process.env.DEV_EMAIL_LOGIN === "1";

const devEmailProvider = {
  id: "dev-email",
  type: "email" as const,
  name: "Email link",
  from: "dev@localhost",
  maxAge: 15 * 60,
  options: {},
  async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
    const line = "─".repeat(72);
    console.log(
      `\n${line}\n  SIGN-IN LINK for ${identifier}\n  (development only — not emailed)\n\n  ${url}\n${line}\n`,
    );
  },
};

const providers: NextAuthConfig["providers"] = [];
for (const p of enabledProviders) {
  if (p.id === "google") providers.push(Google);
  if (p.id === "github") providers.push(GitHub);
}
if (devLoginEnabled) providers.push(devEmailProvider);

const {
  handlers,
  auth: uncachedAuth,
  signIn,
  signOut,
} = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: { strategy: "database" },
  pages: { signIn: "/signin" },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});

/**
 * Memoised for the lifetime of one request. With the database session
 * strategy each call is a round trip, and a single page render asks for the
 * session from the layout, the page and again inside a data loader.
 */
export const auth = cache(uncachedAuth);

export { handlers, signIn, signOut };

/** The signed-in user's id, or null. Use in server components and actions. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** Same, but throws — for actions that must not run anonymously. */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error("Not signed in");
  return id;
}

/** True when there is any way to sign in at all. */
export const hasProviders = enabledProviders.length > 0 || devLoginEnabled;
