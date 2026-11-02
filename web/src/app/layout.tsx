import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "SoleilRise Job Copilot",
  description:
    "Finds fresh US roles, tailors your resume truthfully toward each posting, and tracks applications through interviews.",
};

const NAV = [
  { href: "/profile", label: "My Profile" },
  { href: "/studio", label: "Resume Studio" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="antialiased">
        <header style={{ background: "#0d0b0a", color: "#f7efe7" }}>
          <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-extrabold">
              <span
                aria-hidden
                className="h-[22px] w-[22px] shrink-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle at 40% 40%, var(--sun4), var(--sun2) 60%, var(--sun1))",
                  boxShadow: "0 0 14px rgba(255,106,26,.7)",
                }}
              />
              <span className="leading-tight">
                Soleil<span style={{ color: "#ff7a2e" }}>Rise</span>
              </span>
            </Link>

            {session?.user ? (
              <nav className="flex gap-1" aria-label="Views">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="rounded-full px-3 py-1.5 text-sm font-semibold"
                    style={{ color: "#b4a79b" }}
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            ) : null}

            <div className="ml-auto text-xs" style={{ color: "#b4a79b" }}>
              {session?.user?.email ?? "Not signed in"}
            </div>
          </div>
          <div className="sunstripe" />
        </header>

        <main className="mx-auto grid max-w-[1120px] gap-6 px-4 pb-24 pt-7">{children}</main>
      </body>
    </html>
  );
}
