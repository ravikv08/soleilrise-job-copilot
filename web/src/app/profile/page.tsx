import { redirect } from "next/navigation";

import {
  getProfile,
  parseResume,
  saveApplicant,
  saveFacts,
  saveTargetRoles,
} from "@/app/actions/profile";
import { profileStats } from "@/app/actions/stats";
import { auth, requireUserId } from "@/auth";
import {
  ApplicantForm,
  FactsForm,
  ResumeForm,
  TargetRolesForm,
} from "@/components/ProfileForms";
import { ProfileHero, TABS, type TabKey } from "@/components/ProfileHero";
import { ProfileStrength } from "@/components/ProfileStrength";
import { resumeYears } from "@/lib/profile-strength";
import { usageSummary } from "@/lib/quota";

function UsagePanel({ usage }: { usage: Awaited<ReturnType<typeof usageSummary>> }) {
  const pct = Math.min(100, (usage.spentUsd / usage.limitUsd) * 100);
  return (
    <div className="card grid gap-2">
      <h2 className="text-xl">AI usage</h2>
      <p style={{ color: "var(--muted)" }}>
        {usage.calls} request{usage.calls === 1 ? "" : "s"} in the last 30 days, costing $
        {usage.spentUsd.toFixed(4)} of your ${usage.limitUsd.toFixed(2)} allowance.
      </p>
      <div className="pf-meter">
        <span style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
    </div>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { tab: raw } = await searchParams;
  const tab: TabKey = (TABS.map(([k]) => k) as string[]).includes(raw ?? "")
    ? (raw as TabKey)
    : "overview";

  const profile = await getProfile();
  const usage = await usageSummary(await requireUserId());
  const stats = await profileStats();

  const resume = profile?.resume ?? null;
  const applicant = profile?.applicant ?? {};
  const targetRoles = profile?.targetRoles ?? [];

  const applicantForm = <ApplicantForm action={saveApplicant} applicant={applicant} />;

  // Before there is a resume there is nothing to build a profile out of, so
  // the page stays the plain setup form.
  if (!resume) {
    return (
      <>
        <section className="grid gap-2">
          <h1 className="text-3xl">Your profile</h1>
          <p style={{ color: "var(--muted)", maxWidth: "66ch" }}>
            Set this up once. Every match, tailored resume and screening answer is built from it.
          </p>
        </section>
        <section className="card">
          <ResumeForm
            action={parseResume}
            resume={null}
            resumeText={profile?.resumeText ?? ""}
          />
        </section>
        <section className="card">{applicantForm}</section>
        <ProfileStrength resume={null} applicant={applicant} targetRoles={targetRoles} />
        <UsagePanel usage={usage} />
      </>
    );
  }

  const years = resumeYears(resume);

  return (
    <section className="grid gap-5">
      <ProfileHero
        resume={resume}
        applicant={applicant}
        targetRoles={targetRoles}
        tab={tab}
      >
        {applicantForm}
      </ProfileHero>

      {tab === "overview" ? (
        <>
          <div className="pf-stats">
            <div>
              <b>{years ? `${years}+` : "—"}</b>
              <span>Years experience</span>
            </div>
            <div>
              <b>{(resume.experience ?? []).length}</b>
              <span>Roles</span>
            </div>
            <div>
              <b>{stats.tailored}</b>
              <span>Resumes tailored</span>
            </div>
            <div>
              <b>{stats.avgAfter ?? "—"}</b>
              <span>Avg score after</span>
            </div>
          </div>

          <div className="pf-two">
            <div className="grid gap-5">
              {resume.summary ? (
                <div className="card grid gap-2">
                  <h2 className="text-xl">About</h2>
                  <p>{resume.summary}</p>
                </div>
              ) : null}
              <div className="card">
                <FactsForm action={saveFacts} facts={profile?.facts ?? ""} />
              </div>
              <UsagePanel usage={usage} />
            </div>
            <ProfileStrength
              resume={resume}
              applicant={applicant}
              targetRoles={targetRoles}
            />
          </div>
        </>
      ) : null}

      {tab === "experience" ? (
        <>
          <div className="card grid gap-3">
            <h2 className="text-xl">Experience</h2>
            <ol className="pf-list">
              {(resume.experience ?? []).map((e, i) => (
                <li className="pf-exp" key={i}>
                  <span className="pf-logo" aria-hidden>
                    {(e.company || "•").replace(/\s*\(.*?\)\s*/g, " ").trim()[0] ?? "•"}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b>{e.title}</b>
                    <div>{e.company}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>
                      {e.dates}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {(resume.education ?? []).length ? (
            <div className="card grid gap-3">
              <h2 className="text-xl">Education</h2>
              <ul className="pf-list">
                {resume.education.map((e, i) => (
                  <li className="pf-exp" key={i}>
                    <span className="pf-logo" aria-hidden>
                      🎓
                    </span>
                    <div>
                      <b>{e.text}</b>
                      {(e.sub ?? []).map((s, j) => (
                        <div key={j} className="text-sm" style={{ color: "var(--muted)" }}>
                          {s}
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {(resume.projects ?? []).length ? (
            <div className="card grid gap-2">
              <h2 className="text-xl">Projects</h2>
              <ul className="list-disc pl-5">
                {resume.projects.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "roles" ? (
        <div className="card">
          <TargetRolesForm action={saveTargetRoles} roles={targetRoles} />
        </div>
      ) : null}

      {tab === "resume" ? (
        <>
          <div className="card">
            <ResumeForm
              action={parseResume}
              resume={resume}
              resumeText={profile?.resumeText ?? ""}
            />
          </div>
          <div className="card grid gap-3">
            <h2 className="text-xl">Skills</h2>
            {(resume.skills ?? []).map((s, i) => (
              <div key={i}>
                <b>{s.label}</b>
                <div style={{ color: "var(--muted)" }}>{s.items}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
