import { redirect } from "next/navigation";

import { getProfile, parseResume, saveApplicant, saveFacts } from "@/app/actions/profile";
import { auth } from "@/auth";
import { ApplicantForm, FactsForm, ResumeForm } from "@/components/ProfileForms";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const profile = await getProfile();

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
    </>
  );
}
