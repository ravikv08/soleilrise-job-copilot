import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentUserId } from "@/auth";
import { db } from "@/db";
import { applications, profiles } from "@/db/schema";
import { finalResume } from "@/lib/changes";
import { buildDocx, buildPdf, fileBase, verifyRendered } from "@/lib/docgen";
import { validResult } from "@/lib/resume";

/**
 * Download the approved resume.
 *
 * Built from the database, not from anything the client sends, and only for
 * an application this user owns that they have actually approved — a file
 * leaving here is what gets sent to an employer.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return new NextResponse("Not signed in", { status: 401 });

  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") === "docx" ? "docx" : "pdf";

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1);
  if (!app) return new NextResponse("Not found", { status: 404 });

  if (app.status !== "Approved") {
    return new NextResponse("Approve this resume before downloading it.", { status: 409 });
  }
  if (!validResult(app.result)) {
    return new NextResponse("No tailored resume to download.", { status: 409 });
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!profile?.resume) return new NextResponse("No master resume.", { status: 409 });

  // The same function the approval screen rendered, so the file matches what
  // was shown — rejections included.
  const resume = finalResume(profile.resume, app.result, app.decisions, app.edits);
  const name = fileBase(
    app.company || "Job",
    app.title || "Resume",
    app.tailoredAt ?? new Date().toISOString().slice(0, 10),
  );

  if (format === "docx") {
    const bytes = await buildDocx(resume);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${name}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const { bytes, rendered } = buildPdf(resume);
  const missing = verifyRendered(resume, rendered);
  if (missing.length) {
    // Refuse rather than hand over a resume quietly missing approved lines.
    console.error("[download] PDF dropped approved content", { id, missing });
    return new NextResponse(
      `The PDF came out missing ${missing.length} approved line(s), so it was not sent. Try DOCX, and report this.`,
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
