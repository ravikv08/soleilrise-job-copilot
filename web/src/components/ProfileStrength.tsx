import { band, catScores, completeness } from "@/lib/profile-strength";
import type { Applicant, MasterResume } from "@/lib/resume";

function Ring({ n, label }: { n: number; label: string }) {
  return (
    <div
      className={`ring s-${band(n)}`}
      style={{ ["--p" as string]: n }}
      role="img"
      aria-label={`${label} ${n} out of 100`}
    >
      <div>
        <span>
          <b>{n}</b>
          <br />
          <small>{label}</small>
        </span>
      </div>
    </div>
  );
}

export function ProfileStrength({
  resume,
  applicant,
  targetRoles,
}: {
  resume: MasterResume | null;
  applicant: Applicant;
  targetRoles: string[];
}) {
  const checks = completeness(resume, applicant, targetRoles);
  const pct = Math.round((100 * checks.filter((c) => c.done).length) / checks.length);

  return (
    <div className="card grid gap-3">
      <h2 className="text-xl">Profile strength</h2>

      {resume ? (
        <>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            How strongly your resume proves each area recruiters screen for: the terms you use,
            the share of your bullets that show it, and the years in roles centred on it. Hover a
            ring to see the evidence.
          </p>
          <div className="pf-rings">
            {catScores(resume).map((c) => (
              <div className="pf-ring" key={c.k} title={c.hits.join(", ")}>
                <Ring n={c.score} label={c.k} />
                <b className="pf-rk">{c.k}</b>
                <span>
                  {c.years ? `${c.years} yrs · ` : ""}
                  {c.share}% of bullets
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
        <b>Profile complete</b>
        <b>{pct}%</b>
      </div>
      <div className="pf-meter">
        <span style={{ width: `${pct}%` }} />
      </div>
      <ul className="pf-checks">
        {checks.map((c) => (
          <li key={c.label} className={c.done ? "ok" : ""}>
            {c.done ? "✓" : "○"} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
