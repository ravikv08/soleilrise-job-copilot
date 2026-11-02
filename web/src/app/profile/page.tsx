import { redirect } from "next/navigation";

import { getProfile, parseResume, saveApplicant, saveFacts } from "@/app/actions/profile";
import { auth, requireUserId } from "@/auth";
import { usageSummary } from "@/lib/quota";
import { ApplicantForm, FactsForm, ResumeForm } from "@/components/ProfileForms";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const profile = await getProfile();
  const usage = await usageSummary(await requireUserId());

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
          resume={profile?.resume ?? null}
          resumeText={profile?.resumeText ?? ""}
        />
      </section>

      <section className="card">
        <FactsForm action={saveFacts} facts={profile?.facts ?? ""} />
      </section>

      <section className="card">
        <ApplicantForm action={saveApplicant} applicant={profile?.applicant ?? {}} />
      </section>

      <section className="card grid gap-2">
        <h2 className="text-xl">AI usage</h2>
        <p style={{ color: "var(--muted)" }}>
          {usage.calls} request{usage.calls === 1 ? "" : "s"} in the last 30 days, costing $
          {usage.spentUsd.toFixed(4)} of your ${usage.limitUsd.toFixed(2)} allowance.
        </p>
        <div
          style={{ height: 8, borderRadius: 99, background: "var(--sunk)", overflow: "hidden" }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, (usage.spentUsd / usage.limitUsd) * 100).toFixed(1)}%`,
              background: "var(--accent)",
            }}
          />
        </div>
      </section>
    </>
  );
}
