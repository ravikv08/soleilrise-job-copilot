import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import { jsPDF } from "jspdf";

import type { MasterResume } from "@/lib/resume";

/**
 * DOCX and PDF rendering, ported from the artifact's buildDocx / buildPdf.
 *
 * Generated on the server so the two libraries stay out of the client bundle
 * and the file is built from the approved resume in the database rather than
 * from whatever the browser happens to be holding.
 */

const FONT = "Arial";
const SZ = 19;
const BLUE = "1F3C88";
const BLUE_RGB: [number, number, number] = [31, 60, 136];

export function buildDocx(r: MasterResume): Promise<Buffer> {
  const T = (
    text: string,
    o: { size?: number; bold?: boolean; it?: boolean; color?: string } = {},
  ) => new TextRun({ text, font: FONT, size: o.size ?? SZ, bold: o.bold, italics: o.it, color: o.color });

  const P = (runs: TextRun[], after = 40) =>
    new Paragraph({ children: runs, spacing: { after, before: 0 } });

  const H = (text: string) =>
    new Paragraph({
      children: [T(text.toUpperCase(), { bold: true, size: 23, color: BLUE })],
      spacing: { before: 110, after: 40 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 1 } },
    });

  const B = (text: string) =>
    new Paragraph({
      children: [T(text)],
      numbering: { reference: "bul", level: 0 },
      spacing: { after: 10, line: 235 },
    });

  const kids: Paragraph[] = [];
  kids.push(P([T(r.name || "", { bold: true, size: 24 })], 0));
  if (r.headline) kids.push(P([T(r.headline, { bold: true, color: BLUE })], 0));
  (r.contact ?? []).forEach((c) => kids.push(P([T(c, { size: 18 })], 0)));

  if (r.summary) {
    kids.push(H("Summary"));
    kids.push(P([T(r.summary)]));
  }

  if (r.experience?.length) {
    kids.push(H("Professional Experience"));
    r.experience.forEach((e) => {
      kids.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: 10800 }],
          spacing: { before: 70, after: 20 },
          children: [
            T(e.company, { bold: true }),
            T("  |  "),
            T(e.title, { bold: true, color: BLUE }),
            T(`\t${e.dates ?? ""}`, { it: true }),
          ],
        }),
      );
      (e.bullets ?? []).forEach((b) => kids.push(B(b)));
    });
  }

  if (r.projects?.length) {
    kids.push(H("Personal Projects"));
    r.projects.forEach((b) => kids.push(B(b)));
  }

  if (r.skills?.length) {
    kids.push(H("Technical Skills"));
    r.skills.forEach((s) =>
      kids.push(P([T(`${s.label}: `, { bold: true }), T(s.items)], 10)),
    );
  }

  if (r.education?.length) {
    kids.push(H("Education"));
    r.education.forEach((e) => {
      kids.push(B(e.text));
      (e.sub ?? []).forEach((s) =>
        kids.push(
          new Paragraph({
            children: [T(s)],
            numbering: { reference: "bul", level: 1 },
            spacing: { after: 20 },
          }),
        ),
      );
    });
  }

  const doc = new Document({
    creator: r.name || "",
    title: "Resume",
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    numbering: {
      config: [
        {
          reference: "bul",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 300, hanging: 200 } } },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: "–",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 700, hanging: 200 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 560, bottom: 560, left: 720, right: 720 },
          },
        },
        children: kids,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/**
 * jsPDF's core fonts are Latin-1 only, so characters outside it would render
 * as mojibake. Map the ones a resume actually produces, drop the rest.
 */
const PDFMAP: Record<string, string> = {
  "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "≈": "~",
  " ": " ", "‑": "-", "‐": "-", "−": "-", " ": " ", " ": " ",
};
const pdfSafe = (s: string) =>
  String(s ?? "")
    .replace(/[→←≤≥≈ ‑‐−  ]/g, (c) => PDFMAP[c] ?? c)
    .replace(/[^\x09\x0a\x0d\x20-\x7e¡-ÿ–—‘’“”•…€]/g, "");

export type PdfResult = { bytes: Buffer; rendered: string[] };

export function buildPdf(r: MasterResume): PdfResult {
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  // Capture every string actually drawn, so the caller can check that the
  // rendered file contains what was approved rather than trusting the render.
  const rendered: string[] = [];
  const draw = doc.text.bind(doc);
  doc.text = ((str: string | string[], ...rest: unknown[]) => {
    rendered.push(Array.isArray(str) ? str.join(" ") : String(str));
    return (draw as (...a: unknown[]) => jsPDF)(str, ...rest);
  }) as typeof doc.text;

  const W = 612;
  const M = 36;
  const CW = W - 2 * M;
  const BOT = 792 - 30;
  let y = 40;

  const need = (h: number) => {
    if (y + h > BOT) {
      doc.addPage();
      y = 40;
    }
  };

  const text = (
    s: string,
    o: { bold?: boolean; it?: boolean; size?: number; color?: [number, number, number]; after?: number } = {},
  ) => {
    doc.setFont("helvetica", o.bold ? "bold" : o.it ? "oblique" : "normal");
    doc.setFontSize(o.size ?? 9.5);
    doc.setTextColor(...(o.color ?? ([17, 17, 17] as [number, number, number])));
    const lines = doc.splitTextToSize(pdfSafe(s), CW) as string[];
    const lh = (o.size ?? 9.5) * 1.2;
    lines.forEach((l) => {
      need(lh);
      doc.text(l, M, y);
      y += lh;
    });
    y += o.after ?? 1.5;
  };

  const head = (s: string) => {
    need(24);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BLUE_RGB);
    doc.text(pdfSafe(s.toUpperCase()), M, y);
    y += 3;
    doc.setDrawColor(...BLUE_RGB);
    doc.setLineWidth(0.7);
    doc.line(M, y, W - M, y);
    y += 10;
  };

  const bullet = (s: string, indent = 10) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(pdfSafe(s), CW - indent - 8) as string[];
    const lh = 11.3;
    lines.forEach((l, i) => {
      need(lh);
      doc.setTextColor(17, 17, 17);
      if (i === 0) doc.text("•", M + indent - 8, y);
      doc.text(l, M + indent + 2, y);
      y += lh;
    });
    y += 0.6;
  };

  text(r.name, { bold: true, size: 14, after: 2 });
  if (r.headline) text(r.headline, { bold: true, color: BLUE_RGB, after: 1 });
  (r.contact ?? []).forEach((c) => text(c, { size: 9, after: 0.5 }));

  if (r.summary) {
    head("Summary");
    text(r.summary);
  }

  if (r.experience?.length) {
    head("Professional Experience");
    r.experience.forEach((e) => {
      need(28);
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.8);
      doc.setTextColor(17, 17, 17);
      const left = pdfSafe(`${e.company}  |  `);
      doc.text(left, M, y);
      doc.setTextColor(...BLUE_RGB);
      doc.text(pdfSafe(e.title), M + doc.getTextWidth(left), y);
      doc.setFont("helvetica", "oblique");
      doc.setTextColor(17, 17, 17);
      doc.text(pdfSafe(e.dates ?? ""), W - M, y, { align: "right" });
      y += 11.5;
      (e.bullets ?? []).forEach((b) => bullet(b));
    });
  }

  if (r.projects?.length) {
    head("Personal Projects");
    r.projects.forEach((b) => bullet(b));
  }

  if (r.skills?.length) {
    head("Technical Skills");
    r.skills.forEach((s) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      const lab = pdfSafe(`${s.label}: `);
      const lw = doc.getTextWidth(lab);
      need(12);
      doc.setTextColor(17, 17, 17);
      doc.text(lab, M, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(pdfSafe(s.items), CW - lw) as string[];
      lines.forEach((l, i) => {
        if (i > 0) {
          need(11);
          y += 11;
        }
        doc.text(l, M + (i === 0 ? lw : 0), y);
      });
      y += 12;
    });
  }

  if (r.education?.length) {
    head("Education");
    r.education.forEach((e) => {
      bullet(e.text);
      (e.sub ?? []).forEach((s) => bullet(s, 24));
    });
  }

  return { bytes: Buffer.from(doc.output("arraybuffer")), rendered };
}

/**
 * Check that every bullet and heading we approved actually appears in the
 * rendered output. A silent drop — a layout bug, a page-break edge case, a
 * character the font cannot express — would otherwise ship a resume missing
 * lines the person approved.
 */
export function verifyRendered(r: MasterResume, rendered: string[]): string[] {
  const haystack = rendered.join(" ").replace(/\s+/g, " ").toLowerCase();
  const expected = [
    r.headline,
    r.summary,
    ...(r.experience ?? []).flatMap((e) => [e.company, e.title, ...(e.bullets ?? [])]),
    ...(r.projects ?? []),
  ].filter((s): s is string => !!s && s.trim().length > 12);

  return expected.filter((line) => {
    // Compare on a distinctive prefix: wrapping splits long lines, and
    // pdfSafe may have replaced characters inside them.
    const probe = pdfSafe(line).replace(/\s+/g, " ").trim().slice(0, 40).toLowerCase();
    return probe.length > 12 && !haystack.includes(probe);
  });
}

/** Filename stem, ported from the artifact's fileBase(). */
export function fileBase(company: string, title: string, date: string): string {
  const camel = (s: string, max = 40) => {
    let out = "";
    for (const w of String(s ?? "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^A-Za-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)) {
      const n = out + w[0].toUpperCase() + w.slice(1);
      if (n.length > max && out) break;
      out = n;
    }
    return out || "Job";
  };
  return `${camel(company, 24)}_${camel(title)}_Resume_${date.replace(/-/g, "")}`;
}
