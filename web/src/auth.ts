import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { cache } from "react";

import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

/**
 * Providers are opt-in by environment, so the app boots with whichever
 * credentials you have configured rather than failing on the ones you don't.
 * A provider needs BOTH halves — the sign-in page renders buttons from this
 * list, so a half-configured provider never gets a button that would throw.
 */
const CONFIGURED = [
  { id: "google", label: "Continue with Google", env: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"] },
  { id: "github", label: "Continue with GitHub", env: ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] },
] as const;

export const enabledProviders = CONFIGURED.filter((p) =>
  p.env.every((k) => Boolean(process.env[k])),
).map((p) => ({ id: p.id, label: p.label }));

const providers: NextAuthConfig["providers"] = [];
for (const p of enabledProviders) {
  if (p.id === "google") providers.push(Google);
  if (p.id === "github") providers.push(GitHub);
}

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

/** True when at least one OAuth provider is fully configured. */
export const hasProviders = enabledProviders.length > 0;
