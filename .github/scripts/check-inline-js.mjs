// Parses the inline <script> blocks of an HTML page.
// app/index.html ships as-is to Claude as an artifact, so there is no build
// step to catch a syntax error before it reaches the page. CI runs this.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("usage: node check-inline-js.mjs <file.html>");
  process.exit(2);
}

let html;
try {
  html = readFileSync(file, "utf8");
} catch (e) {
  console.error(`${file}: cannot read (${e.code})`);
  process.exit(1);
}

const blocks = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (blocks.length === 0) {
  console.error(`${file}: no inline <script> block found`);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "inline-js-"));
blocks.forEach((code, i) => {
  const out = join(dir, `block${i}.js`);
  writeFileSync(out, code);
  try {
    // node --check prints the offending line and caret to stderr itself.
    execFileSync(process.execPath, ["--check", out], { stdio: "inherit" });
  } catch {
    console.error(`${file}: inline script block ${i + 1} does not parse`);
    process.exit(1);
  }
});
console.log(`${file}: ${blocks.length} inline script block(s) parse cleanly`);
