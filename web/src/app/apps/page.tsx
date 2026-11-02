import Link from "next/link";
import { redirect } from "next/navigation";

import { listForApps, setStatus } from "@/app/actions/tailor";
import { SENT } from "@/db/schema";
import { auth } from "@/auth";
import { StatusPicker } from "@/components/StatusPicker";

type Row = Awaited<ReturnType<typeof listForApps>>[number];

const GROUPS = [
  ["active", "Active"],
  ["Applied", "Applied"],
  ["Interviewing", "Interviewing"],
  ["Offer", "Offer"],
  ["Rejected", "Rejected"],
  ["Archived", "Archived"],
] as const;

const isSent = (r: Row) => (SENT as readonly string[]).includes(r.status);

/** Group membership, ported from the artifact's inG(). */
function inGroup(r: Row, g: string): boolean {
  if (g === "active") return isSent(r) && r.status !== "Rejected";
  if (g === "Interviewing") return ["Interview", "Recruiter replied"].includes(r.status);
  if (g === "Applied") return ["Applied", "Submission failed"].includes(r.status);
  return r.status === g;
}

const days = (d: Date | null) =>
  d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null;

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { g: rawG, q: rawQ } = await searchParams;
  const group = (GROUPS.map(([k]) => k) as string[]).includes(rawG ?? "")
    ? (rawG as string)
    : "active";
  const q = (rawQ ?? "").toLowerCase().trim();

  const all = await listForApps();
  const sent = all.filter(isSent);
  const interviewing = all.filter((r) =>
    ["Interview", "Recruiter replied"].includes(r.status),
  );
  const offers = all.filter((r) => r.status === "Offer");
  const reachedInterview = all.filter((r) => ["Interview", "Offer"].includes(r.status));

  // A week with no reply is the artifact's nudge threshold.
  const followUps = sent.filter(
    (r) => r.status === "Applied" && (days(r.appliedAt) ?? 0) >= 7,
  );

  const list = all.filter(
    (r) =>
      inGroup(r, group) &&
      (!q ||
        [r.company, r.title, r.location, r.status].join(" ").toLowerCase().includes(q)),
  );

  const stats: [string, string | number][] = [
    ["Applied", sent.length],
    ["Interviewing", interviewing.length],
    ["Offers", offers.length],
    [
      "Interview rate",
      sent.length ? `${Math.round((100 * reachedInterview.length) / sent.length)}%` : "—",
    ],
    ["Follow-ups due", followUps.length],
  ];

  return (
    <>
      <section className="grid gap-2">
        <h1 className="text-3xl">My Applications</h1>
        <p style={{ color: "var(--muted)", maxWidth: "66ch" }}>
          Everything you have applied to, in one place.
        </p>
      </section>

      <section className="pf-stats" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
        {stats.map(([label, value]) => (
          <div key={label}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </section>

      {followUps.length ? (
        <div className="notice warn">
          {followUps.length} application{followUps.length === 1 ? "" : "s"} applied over a week
          ago with no reply recorded. Worth a follow-up.
        </div>
      ) : null}

      <section className="card grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {GROUPS.map(([k, label]) => {
            const n = all.filter((r) => inGroup(r, k)).length;
            return (
              <Link
                key={k}
                href={`/apps?g=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="btn small ghost"
                style={
                  group === k
                    ? { background: "var(--accent)", color: "var(--accent-fg)" }
                    : undefined
                }
              >
                {label} <span style={{ opacity: 0.7 }}>{n}</span>
              </Link>
            );
          })}
        </div>

        <form className="flex gap-2" action="/apps">
          <input type="hidden" name="g" value={group} />
          <input
            name="q"
            className="field"
            defaultValue={q}
            placeholder="Search company or role"
            aria-label="Search applications"
          />
          <button className="btn ghost" type="submit">
            Search
          </button>
        </form>

        {list.length === 0 ? (
          <div className="grid gap-2" style={{ color: "var(--muted)" }}>
            <b>{sent.length ? "Nothing at this status" : "No applications yet"}</b>
            <span>
              {sent.length ? (
                "Try another status above."
              ) : (
                <>
                  Approve a resume in <Link href="/studio">Resume Studio</Link>, apply on the
                  company site, then mark it Applied here.
                </>
              )}
            </span>
          </div>
        ) : (
          <ul className="grid gap-2">
            {list.map((r) => {
              const since = days(r.appliedAt);
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                  style={{ background: "var(--sunk)" }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link href={`/studio/${r.id}`} className="font-semibold">
                      {r.company || "Untitled company"}
                    </Link>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>
                      {r.title || "—"}
                      {r.location ? ` · ${r.location}` : ""}
                      {since !== null
                        ? ` · applied ${since === 0 ? "today" : `${since}d ago`}`
                        : ""}
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
                  <StatusPicker id={r.id} status={r.status} action={setStatus} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        The artifact also checks Gmail for recruiter replies and breaks results down by source.
        Neither is ported: Gmail runs through a Claude connector this app does not have, and
        source attribution only becomes meaningful once Find Jobs brings in postings itself.
      </p>
    </>
  );
}
