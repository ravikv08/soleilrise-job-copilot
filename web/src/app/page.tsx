import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/profile");

  return (
    <section className="card grid gap-4">
      <h1 className="text-3xl">Tailor your resume without inventing anything.</h1>
      <p style={{ color: "var(--muted)", maxWidth: "60ch" }}>
        SoleilRise rewrites your resume toward one posting using only what your resume and your
        confirmed facts already support. It flags what you cannot claim, and it never applies on
        your behalf.
      </p>
      <div>
        <Link href="/signin" className="btn">
          Sign in to start
        </Link>
      </div>
    </section>
  );
}
