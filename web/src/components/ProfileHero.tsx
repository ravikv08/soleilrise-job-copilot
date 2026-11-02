import Link from "next/link";

import type { Applicant, MasterResume } from "@/lib/resume";
import { resumeYears } from "@/lib/profile-strength";

export const TABS = [
  ["overview", "Overview"],
  ["experience", "Experience & education"],
  ["roles", "Target roles"],
  ["resume", "Resume"],
] as const;

export type TabKey = (typeof TABS)[number][0];

/** Contact lines become links where they look like an email or a URL. */
function ContactBit({ value }: { value: string }) {
  if (/@/.test(value)) return <a href={`mailto:${value}`}>{value}</a>;
  const m = value.match(/((https?:\/\/)?[\w.-]+\.(com|io|ai|dev|org)[^\s]*)/i);
  if (m) {
    const href = /^https?:/.test(m[1]) ? m[1] : `https://${m[1]}`;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {value}
      </a>
    );
  }
  return <>{value}</>;
}

export function ProfileHero({
  resume,
  applicant,
  targetRoles,
  tab,
  children,
}: {
  resume: MasterResume;
  applicant: Applicant;
  targetRoles: string[];
  tab: TabKey;
  /** The work-authorization form, folded into the "Open to work" panel. */
  children: React.ReactNode;
}) {
  const initials =
    String(resume.name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";

  const contact = (resume.contact ?? [])
    .join(" | ")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);

  const loc =
    applicant.location ||
    contact.find((x) => /,\s*[A-Z]{2}\b/.test(x) && !/@/.test(x)) ||
    "";

  const years = resumeYears(resume);

  const auth = [
    applicant.workAuth,
    applicant.sponsorship && /^no/i.test(applicant.sponsorship)
      ? "No sponsorship needed"
      : applicant.sponsorship
        ? `Sponsorship: ${applicant.sponsorship}`
        : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // Phone numbers and the location already appear above; don't repeat them.
  const contactLine = contact.filter(
    (x) => x !== loc && !/^\+?[\d\s().-]{8,}$/.test(x),
  );

  return (
    <div className="card pf-hero">
      <div className="pf-banner" aria-hidden />
      <div className="pf-head">
        <span className="pf-avatar" aria-hidden>
          {initials}
        </span>
        <Link className="btn small" href="/profile?tab=resume">
          Update resume
        </Link>
      </div>

      <h1 className="pf-name">{resume.name || "Your name"}</h1>
      {resume.headline ? <p className="pf-headline">{resume.headline}</p> : null}
      <p className="text-sm" style={{ color: "var(--muted)", marginTop: 4 }}>
        {[loc, years ? `${years}+ years experience` : ""].filter(Boolean).join(" · ")}
      </p>

      {contactLine.length ? (
        <p className="pf-contact">
          {contactLine.map((x, i) => (
            <span key={i}>
              {i > 0 ? " · " : ""}
              <ContactBit value={x} />
            </span>
          ))}
        </p>
      ) : null}

      <div className="pf-open">
        <b>Open to work</b>
        <span>{targetRoles.length ? targetRoles.join(" · ") : "No target roles saved yet"}</span>
        {auth ? (
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {auth}
          </span>
        ) : null}
        <details open={!applicant.workAuth}>
          <summary className="text-sm" style={{ color: "var(--muted)", cursor: "pointer" }}>
            {applicant.workAuth
              ? "Edit work authorization & LinkedIn"
              : "Add work authorization & LinkedIn URL"}
          </summary>
          <div style={{ marginTop: 10 }}>{children}</div>
        </details>
      </div>

      <nav className="pf-tabs" aria-label="Profile sections">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/profile?tab=${k}`}
            aria-current={tab === k ? "page" : "false"}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
