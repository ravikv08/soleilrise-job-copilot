import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getProfile } from "@/app/actions/profile";
import { getApplication, tailorApplication } from "@/app/actions/tailor";
import { auth } from "@/auth";
import { TailorButton } from "@/components/StudioForms";
import { analyse, tier } from "@/lib/score";
import { TARGET } from "@/lib/resume";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { id } = await params;
  const app = await getApplication(id);
  if (!app) notFound();

  const profile = await getProfile();
  const scores = analyse(profile?.resume ?? null, app.result);
  const result = app.result;

  return (
    <>
      <section className="grid gap-2">
        <Link href="/studio" className="text-sm" style={{ color: "var(--muted)" }}>
          ← All postings
        </Link>
        <h1 className="text-3xl">{app.company || "Untitled company"}</h1>
        <p style={{ color: "var(--muted)" }}>
          {app.title || "—"}
          {app.location ? ` · ${app.location}` : ""}
        </p>
      </section>

      {app.error ? <div className="notice err">{app.error}</div> : null}

      <section className="card grid gap-3">
        <TailorButton
          id={app.id}
          action={tailorApplication}
          label={result ? "Tailor again" : "Tailor my resume"}
        />
        {!profile?.resume ? (
          <div className="notice warn">
            Add your master resume on <Link href="/profile">your profile</Link> first.
          </div>
        ) : null}
      </section>

      {scores && result ? (
        <>
          <section className="card grid gap-3">
            <h2 className="text-xl">Match score</h2>
            <div className="flex flex-wrap gap-6">
              <div>
                <div className="text-3xl font-extrabold">{scores.before.total}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Before
                </div>
              </div>
              <div>
                <div className="text-3xl font-extrabold" style={{ color: "var(--accent)" }}>
                  {scores.after.total}
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  After · {tier(scores.after.total)[1]} · target {TARGET}
                </div>
              </div>
            </div>
            <p style={{ color: "var(--muted)" }}>{result.verdict}</p>
          </section>

          {result.gaps?.length ? (
            <section className="card grid gap-2">
              <h2 className="text-xl">Gaps you cannot claim</h2>
              <p style={{ color: "var(--muted)" }}>
                These are real requirements your resume does not support. Nothing was written to
                cover them.
              </p>
              <ul className="list-disc pl-5">
                {result.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {result.confirm?.length ? (
            <section className="card grid gap-2">
              <h2 className="text-xl">Worth confirming</h2>
              <p style={{ color: "var(--muted)" }}>
                These might be true but are not on your resume. Add them to your confirmed facts
                if they are, then tailor again.
              </p>
              <ul className="list-disc pl-5">
                {result.confirm.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card grid gap-3">
            <h2 className="text-xl">Tailored resume</h2>
            <div>
              <h3 className="text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                Headline
              </h3>
              <p className="font-semibold">{result.headline}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                Summary
              </h3>
              <p>{result.summary}</p>
            </div>
            {(result.experience ?? []).map((e) => {
              const role = profile?.resume?.experience?.[e.i];
              return (
                <div key={e.i} className="grid gap-1">
                  <h3 className="text-sm font-bold">
                    {role ? `${role.company} · ${role.title}` : `Role ${e.i + 1}`}
                  </h3>
                  <ul className="list-disc pl-5">
                    {e.bullets.map((b, j) => (
                      <li key={j}>
                        {b.text}
                        {b.reason ? (
                          <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                            ({b.reason})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        </>
      ) : null}

      <section className="card grid gap-2">
        <h2 className="text-xl">Job description</h2>
        <pre
          className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl p-3 text-sm"
          style={{ background: "var(--sunk)" }}
        >
          {app.jd}
        </pre>
      </section>
    </>
  );
}
