import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getProfile } from "@/app/actions/profile";
import {
  approveResume,
  getApplication,
  setDecision,
  tailorApplication,
  unapprove,
} from "@/app/actions/tailor";
import { auth } from "@/auth";
import { TailorButton } from "@/components/StudioForms";
import { ApproveButton, ChangeRow, StepNav } from "@/components/StudioSteps";
import { computeChanges, finalResume, needsReview } from "@/lib/changes";
import { TARGET, validResult } from "@/lib/resume";
import { analyse, kwCover, resumeText, tier } from "@/lib/score";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { id } = await params;
  const app = await getApplication(id);
  if (!app) notFound();

  const profile = await getProfile();
  const master = profile?.resume ?? null;
  const result = validResult(app.result) ? app.result : null;
  const approved = app.status === "Approved";

  const changes = master && result ? computeChanges(master, result) : [];
  const decisions = app.decisions ?? {};
  const open = needsReview(changes, decisions);
  const scores = analyse(master, result);

  const requested = Number((await searchParams).step ?? 0);
  // Approval sets the default step, it does not lock the view: the step nav
  // stays navigable so an approved resume can still be re-read.
  const step = !result ? 1 : Math.min(4, Math.max(1, requested || (approved ? 4 : 2)));

  // What would actually be downloaded, after the rejections.
  const final = master && result ? finalResume(master, result, decisions, app.edits ?? {}) : null;
  const coverage = result ? kwCover(result.keywords, resumeText(final)) : [];
  const hit = coverage.filter((c) => c.hit).length;

  return (
    <>
      <section className="grid gap-2">
        <Link href="/studio" className="text-sm" style={{ color: "var(--muted)" }}>
          ← Resume Studio
        </Link>
        <h1 className="text-3xl">
          {app.company || "Untitled company"}
          {app.title ? ` — ${app.title}` : ""}
        </h1>
        {app.location ? <p style={{ color: "var(--muted)" }}>{app.location}</p> : null}
        <StepNav id={app.id} step={step} hasResult={!!result} approved={approved} />
      </section>

      {app.error ? <div className="notice err">{app.error}</div> : null}

      {/* Step 1 — tailoring */}
      {step === 1 || !result ? (
        <section className="card grid gap-3">
          <h2 className="text-xl">{result ? "AI tailoring complete" : "AI Tailoring"}</h2>
          {!master ? (
            <div className="notice warn">
              Add your master resume on <Link href="/profile">your profile</Link> first.
            </div>
          ) : null}
          {result && scores ? (
            <>
              <p style={{ color: "var(--muted)" }}>
                Matched your experience against the posting and changed {changes.length} part
                {changes.length === 1 ? "" : "s"} of your resume, using only what your resume and
                confirmed facts support.
              </p>
              <div className="rs-scores">
                <div className="rs-score">
                  <span>Job fit</span>
                  <b>
                    {scores.before.total} <i>→</i> {scores.after.total}
                  </b>
                  <em className={scores.after.total > scores.before.total ? "up" : ""}>
                    {scores.after.total - scores.before.total > 0 ? "+" : ""}
                    {scores.after.total - scores.before.total} · target {TARGET}
                  </em>
                </div>
                <div className="rs-score">
                  <span>Keywords covered</span>
                  <b>
                    {hit}/{coverage.length}
                  </b>
                  <em>{tier(scores.after.total)[1]}</em>
                </div>
                <div className={`rs-score${open.length ? " warn" : ""}`}>
                  <span>Need your review</span>
                  <b>{open.length}</b>
                  <em>{open.length ? "New or flagged wording" : "Nothing flagged"}</em>
                </div>
              </div>
              <p style={{ color: "var(--muted)" }}>{result.verdict}</p>
              <div>
                <Link className="btn big" href={`/studio/${app.id}?step=2`}>
                  Review changes →
                </Link>
              </div>
            </>
          ) : null}
          <TailorButton
            id={app.id}
            action={tailorApplication}
            label={result ? "Re-tailor from this description" : "Tailor my resume"}
          />
        </section>
      ) : null}

      {/* Step 2 — review every change */}
      {step === 2 && result && master ? (
        <section className="card grid gap-3">
          <h2 className="text-xl">Review changes</h2>
          <p style={{ color: "var(--muted)" }}>
            Every edit, addition and removal, against your master resume. Reject anything you
            disagree with and your original wording comes back — nothing you reject reaches the
            download.
          </p>
          {open.length ? (
            <div className="notice warn">
              {open.length} change{open.length === 1 ? "" : "s"} need a decision: new bullets, or
              wording the house style bans.
            </div>
          ) : null}
          {changes.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>
              No changes were made — your resume already matched this posting.
            </p>
          ) : (
            <ul className="rs-changes">
              {changes.map((c) => (
                <ChangeRow
                  key={c.id}
                  id={app.id}
                  change={c}
                  accepted={decisions[c.id] !== false}
                  action={setDecision}
                />
              ))}
            </ul>
          )}
          <div>
            <Link className="btn big" href={`/studio/${app.id}?step=3`}>
              Match summary →
            </Link>
          </div>
        </section>
      ) : null}

      {/* Step 3 — what the posting asked for, and what you can prove */}
      {step === 3 && result && scores ? (
        <>
          <section className="card grid gap-3">
            <h2 className="text-xl">Match summary</h2>
            <div className="rs-scores">
              <div className="rs-score">
                <span>Job fit before</span>
                <b>{scores.before.total}</b>
              </div>
              <div className="rs-score">
                <span>Job fit after</span>
                <b style={{ color: "var(--accent)" }}>{scores.after.total}</b>
                <em className="up">{tier(scores.after.total)[1]}</em>
              </div>
              <div className="rs-score">
                <span>Keywords covered</span>
                <b>
                  {hit}/{coverage.length}
                </b>
              </div>
            </div>

            <h3 className="text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              Required qualifications
            </h3>
            <ul className="grid gap-1">
              {result.must.map((m, i) => (
                <li key={i}>
                  <b style={{ color: m.after >= 1 ? "var(--good)" : m.after > 0 ? "var(--mid)" : "var(--bad)" }}>
                    {m.after >= 1 ? "✓" : m.after > 0 ? "~" : "✗"}
                  </b>{" "}
                  {m.req}
                  {m.evidence ? (
                    <span className="text-sm" style={{ color: "var(--muted)" }}>
                      {" "}
                      — {m.evidence}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>

            {result.keywords?.length ? (
              <>
                <h3 className="text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                  Keywords
                </h3>
                <p className="text-sm">
                  {coverage.map((c, i) => (
                    <span
                      key={i}
                      style={{
                        color: c.hit ? "var(--good)" : "var(--muted)",
                        textDecoration: c.hit ? "none" : "line-through",
                        marginRight: 10,
                      }}
                    >
                      {c.term}
                    </span>
                  ))}
                </p>
              </>
            ) : null}
          </section>

          {result.gaps?.length ? (
            <section className="card grid gap-2">
              <h2 className="text-xl">Gaps you cannot claim</h2>
              <p style={{ color: "var(--muted)" }}>
                Real requirements your resume does not support. Nothing was written to cover them.
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

          <div>
            <Link className="btn big" href={`/studio/${app.id}?step=4`}>
              Final approval →
            </Link>
          </div>
        </>
      ) : null}

      {/* Step 4 — approve, then the finished resume */}
      {step === 4 && result && final ? (
        <section className="card rs-ready">
          {approved ? (
            <>
              <div className="rs-badge">✓</div>
              <h2 className="text-xl">Your resume is ready</h2>
              <p style={{ color: "var(--muted)" }}>
                Job fit <b>{scores?.after.total}</b> · {hit}/{coverage.length} keywords ·
                approved {app.approvedAt?.toISOString().slice(0, 10)}
              </p>
              <div className="notice warn">
                DOCX and PDF download are not ported yet. The approved text is below — copy it
                into your own document for now.
              </div>
              <ApproveButton id={app.id} action={unapprove} label="Edit this resume" ghost />
            </>
          ) : (
            <>
              <h2 className="text-xl">Final approval</h2>
              <p style={{ color: "var(--muted)" }}>
                This is exactly what would be sent, after your rejections. Read it before
                approving — you are the last check.
              </p>
              {open.length ? (
                <div className="notice warn">
                  {open.length} change{open.length === 1 ? "" : "s"} still need a decision.{" "}
                  <Link href={`/studio/${app.id}?step=2`}>Review them</Link> first.
                </div>
              ) : null}
              <ApproveButton id={app.id} action={approveResume} label="Approve this resume" />
            </>
          )}

          <div className="grid gap-3" style={{ width: "100%", marginTop: 10 }}>
            <div>
              <h3 className="text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                Headline
              </h3>
              <p className="font-semibold">{final.headline}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                Summary
              </h3>
              <p>{final.summary}</p>
            </div>
            {(final.experience ?? []).map((e, i) => (
              <div key={i}>
                <h3 className="text-sm font-bold">
                  {e.company} · {e.title}{" "}
                  <span style={{ color: "var(--muted)", fontWeight: 400 }}>{e.dates}</span>
                </h3>
                <ul className="list-disc pl-5">
                  {e.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
            {(final.skills ?? []).length ? (
              <div>
                <h3 className="text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                  Skills
                </h3>
                {final.skills.map((s, i) => (
                  <div key={i}>
                    <b>{s.label}:</b> {s.items}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <details className="card">
        <summary className="text-xl font-bold">Job description</summary>
        <pre
          className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl p-3 text-sm"
          style={{ background: "var(--sunk)" }}
        >
          {app.jd}
        </pre>
      </details>
    </>
  );
}
