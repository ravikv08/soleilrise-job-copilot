import Link from "next/link";
import { redirect } from "next/navigation";

import { addPosting, listApplications } from "@/app/actions/tailor";
import { auth } from "@/auth";
import { PostingForm } from "@/components/StudioForms";

export default async function StudioPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const apps = await listApplications();

  return (
    <>
      <section className="grid gap-2">
        <h1 className="text-3xl">Resume Studio</h1>
        <p style={{ color: "var(--muted)", maxWidth: "66ch" }}>
          One tailored resume per posting, built only from what your master resume and confirmed
          facts support.
        </p>
      </section>

      <section className="card">
        <PostingForm action={addPosting} />
      </section>

      <section className="card grid gap-3">
        <h2 className="text-xl">Your postings</h2>
        {apps.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Nothing yet. Paste a job description above.</p>
        ) : (
          <ul className="grid gap-2">
            {apps.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/studio/${a.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                  style={{ background: "var(--sunk)" }}
                >
                  <span className="font-semibold">{a.company || "Untitled company"}</span>
                  <span style={{ color: "var(--muted)" }}>{a.title || "—"}</span>
                  <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
                    {a.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
