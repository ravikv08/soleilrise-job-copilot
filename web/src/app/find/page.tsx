import Link from "next/link";
import { redirect } from "next/navigation";

import {
  addToStudio,
  discoverStats,
  listDiscovered,
  runCrawl,
  scoreJobs,
} from "@/app/actions/discover";
import { getProfile } from "@/app/actions/profile";
import { auth } from "@/auth";
import { ActionButton, AddButton } from "@/components/FindControls";
import { BOARDS } from "@/lib/boards-data";
import { tier } from "@/lib/score";

const SOURCES = [
  ["", "All boards"],
  ["greenhouse", "Greenhouse"],
  ["lever", "Lever"],
  ["ashby", "Ashby"],
] as const;

const MINS = [0, 60, 70, 80] as const;

export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string; src?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { min: rawMin, src: rawSrc } = await searchParams;
  const min = MINS.includes(Number(rawMin) as (typeof MINS)[number])
    ? Number(rawMin)
    : 70;
  const src = (SOURCES.map(([k]) => k) as string[]).includes(rawSrc ?? "")
    ? (rawSrc as string)
    : "";

  const profile = await getProfile();
  const stats = await discoverStats();
  const rows = await listDiscovered(min, src || null);

  return (
    <>
      <section className="grid gap-2">
        <h1 className="text-3xl">Find Jobs</h1>
        <p style={{ color: "var(--muted)", maxWidth: "70ch" }}>
          US postings read straight from {BOARDS.length} company job boards, then scored against
          your resume. The boards are crawled once and shared, so finding a job does not cost
          per person — only scoring and tailoring do.
        </p>
      </section>

      <section className="pf-stats" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <div>
          <b>{BOARDS.length}</b>
          <span>Boards tracked</span>
        </div>
        <div>
          <b>{stats.total}</b>
          <span>Recent postings</span>
        </div>
        <div>
          <b>{stats.scored}</b>
          <span>Scored for you</span>
        </div>
      </section>

      <section className="card grid gap-3">
        <h2 className="text-xl">Bring in postings</h2>
        <p style={{ color: "var(--muted)" }}>
          Crawling reads public board APIs and costs nothing. Scoring runs one Claude call per
          batch of 20 and counts against your allowance.
        </p>
        {!profile?.resume ? (
          <div className="notice warn">
            Add your master resume on <Link href="/profile">your profile</Link> before scoring.
          </div>
        ) : null}
        <div className="flex flex-wrap gap-4">
          <ActionButton
            run={async () => {
              "use server";
              return runCrawl();
            }}
            label="Crawl boards"
            pendingLabel="Reading boards… (a minute or two)"
            ghost
          />
          <ActionButton
            run={async () => {
              "use server";
              return scoreJobs(20);
            }}
            label="Score next 20"
            pendingLabel="Scoring…"
          />
        </div>
      </section>

      <section className="card grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl" style={{ flex: 1 }}>
            Matches <span style={{ color: "var(--muted)" }}>({rows.length})</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {MINS.map((m) => (
              <Link
                key={m}
                href={`/find?min=${m}${src ? `&src=${src}` : ""}`}
                className="btn small ghost"
                style={
                  min === m ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined
                }
              >
                {m === 0 ? "All" : `${m}+`}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map(([k, label]) => (
              <Link
                key={k || "all"}
                href={`/find?min=${min}${k ? `&src=${k}` : ""}`}
                className="btn small ghost"
                style={
                  src === k ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined
                }
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            {stats.total === 0
              ? "No postings yet. Crawl the boards above to bring some in."
              : stats.scored === 0
                ? "Postings are in but none are scored yet. Score a batch above."
                : "Nothing at this threshold. Try a lower one."}
          </p>
        ) : (
          <ul className="grid gap-2">
            {rows.map((r) => {
              const [, label] = tier(r.match);
              const age = r.postedAt
                ? Math.floor((Date.now() - new Date(r.postedAt).getTime()) / 86_400_000)
                : null;
              return (
                <li
                  key={r.id}
                  className="grid gap-2 rounded-xl p-3"
                  style={{ background: "var(--sunk)" }}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <b
                      style={{
                        fontSize: "1.3rem",
                        color:
                          r.match >= 80
                            ? "var(--good)"
                            : r.match >= 70
                              ? "var(--mid)"
                              : "var(--muted)",
                      }}
                    >
                      {r.match}
                    </b>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="font-semibold">
                        {r.company} — {r.title}
                      </div>
                      <div className="text-sm" style={{ color: "var(--muted)" }}>
                        {r.location}
                        {age !== null ? ` · ${age === 0 ? "today" : `${age}d ago`}` : ""} ·{" "}
                        {label} · {r.source}
                      </div>
                    </div>
                    {r.url ? (
                      <a
                        className="btn small ghost"
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Posting ↗
                      </a>
                    ) : null}
                    <AddButton
                      jobId={r.id}
                      action={addToStudio}
                      disabled={r.inStudio}
                    />
                  </div>
                  {r.why ? <p className="text-sm">{r.why}</p> : null}
                  {r.missing?.length ? (
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      Missing: {r.missing.join(" · ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
