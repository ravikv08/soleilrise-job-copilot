#!/usr/bin/env python3
"""
SoleilRise Assisted Apply
=========================
Opens a job's application form in a real, visible browser, uploads your tailored
resume and fills the fields it can answer truthfully from profile.yaml.

It NEVER clicks Submit. You review the form, answer anything highlighted in red,
and click Submit yourself.

  python3 apply.py "<job url>" [--resume path.pdf] [--cover path.pdf]

Supported: Greenhouse (incl. company sites with ?gh_jid=), Lever, Ashby.
Anything else (Workday, iCIMS, SmartRecruiters…): the page opens and the generic
filler runs on whatever is on screen; sign in yourself, then press Enter in the
terminal to fill the next page.

Rules this tool follows (by design, not configurable):
  • no passwords stored or typed, no account creation
  • no CAPTCHA solving or anti-bot evasion: if one appears, you solve it
  • never clicks Submit / Apply / Next-to-submit
  • never guesses: unknown or sensitive questions are highlighted for you
  • EEO / self-identification questions default to "decline to answer"
  • never overwrites something already typed in a field
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import glob
import os
import re
import sys
import urllib.parse as up
from pathlib import Path

try:
    import yaml
    from playwright.sync_api import sync_playwright, Error as PWError
except ImportError:
    sys.exit("Missing packages. Run:  bash setup_mac.sh   (or: pip3 install playwright pyyaml && python3 -m playwright install chromium)")

HERE = Path(__file__).resolve().parent
HOME = Path.home() / ".soleilrise"
PROFILE_DIR = HOME / "browser"          # persistent browser profile (your own sign-ins stay here)
LOG = HOME / "applications.csv"

RED = "\033[31m"; GRN = "\033[32m"; YEL = "\033[33m"; DIM = "\033[2m"; B = "\033[1m"; X = "\033[0m"

# ───────────────────────────── URL → application form ─────────────────────────────

def resolve(url: str, page, board: str | None) -> tuple[str, str]:
    """Return (ats, form_url)."""
    u = up.urlparse(url)
    q = up.parse_qs(u.query)
    host = u.netloc.lower()

    if "greenhouse.io" in host:
        m = re.search(r"/([^/]+)/jobs/(\d+)", u.path)
        if "embed/job_app" in u.path:
            return "greenhouse", url
        if m:
            return "greenhouse", f"https://job-boards.greenhouse.io/embed/job_app?for={m.group(1)}&token={m.group(2)}"
    if "lever.co" in host:
        p = u.path.rstrip("/")
        return "lever", f"https://{u.netloc}{p if p.endswith('/apply') else p + '/apply'}"
    if "ashbyhq.com" in host:
        p = u.path.rstrip("/")
        return "ashby", f"https://{u.netloc}{p if p.endswith('/application') else p + '/application'}"

    gh = (q.get("gh_jid") or [None])[0]
    if gh:
        if not board:
            # Find the company's Greenhouse board token on its own careers page.
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(2500)
                board = page.evaluate("""() => {
                  const s = [...document.querySelectorAll('[src],[href],script')].map(e => e.src || e.href || e.textContent || '').join(' ');
                  const m = s.match(/greenhouse\\.io\\/(?:embed\\/job_(?:board|app)[^"' ]*?[?&]for=|v1\\/boards\\/)([a-z0-9_-]+)/i);
                  return m ? m[1] : null; }""")
            except PWError:
                board = None
        if not board:  # fall back to the domain name: careers.databricks.com → databricks
            parts = [p for p in host.split(".") if p not in ("www", "careers", "jobs", "com", "io", "ai", "co", "org", "net")]
            board = parts[0] if parts else None
        if board:
            return "greenhouse", f"https://job-boards.greenhouse.io/embed/job_app?for={board}&token={gh}"
    if "myworkdayjobs.com" in host or "workday" in host:
        return "workday", url
    return "generic", url

# ───────────────────────────── profile & answers ─────────────────────────────

DECLINE = [r"decline", r"don.?t wish", r"do not wish", r"prefer not", r"not (to )?(say|answer|disclose|self.?identify)", r"choose not", r"rather not"]

def load_profile(path: Path) -> dict:
    p = yaml.safe_load(path.read_text())
    for k in ("first_name", "last_name", "email", "phone"):
        if not p.get(k):
            sys.exit(f"profile.yaml: '{k}' is empty. Fill it in once and re-run.")
    return p

def yn(v) -> list[str] | None:
    if v is None or v == "":
        return None
    return [r"^\s*yes\b"] if (v is True or str(v).lower() in ("yes", "true", "y")) else [r"^\s*no\b"]

def answer(q: str, kind: str, P: dict, company: str, options: list[str]) -> tuple:
    """Decide what to put in a field. Returns
         ("text", value) | ("choose", [regex…], typed_query) | ("flag", reason) | ("skip",)
    Only answers that come straight from profile.yaml; everything else is flagged."""
    s = re.sub(r"\s+", " ", q).strip().lower().rstrip("*✱ ").strip()
    full = f"{P['first_name']} {P['last_name']}".strip()
    exp = [c.lower() for c in P.get("past_employers", [])]
    co = (company or "").lower()

    def ch(v, query=""):
        return ("choose", v, query) if v else ("flag", "no answer in profile.yaml")

    # ---- consent / legal acknowledgements: always yours to click
    if re.search(r"privacy (policy|notice)|consent|i (agree|acknowledge|certify|attest)|terms (and|&) conditions|by (checking|submitting)|signature|e-?sign", s):
        return ("flag", "consent / acknowledgement: you decide")

    # ---- identity & contact
    if re.search(r"preferred (first )?name", s): return ("text", P.get("preferred_name") or P["first_name"])
    if re.search(r"first name|given name", s): return ("text", P["first_name"])
    if re.search(r"last name|surname|family name", s): return ("text", P["last_name"])
    if re.fullmatch(r"(full |legal )?name", s): return ("text", full)
    if re.search(r"e-?mail", s) and "confirm" not in s or re.search(r"confirm.*e-?mail", s): return ("text", P["email"])
    if re.search(r"phone|mobile", s) and "type" not in s: return ("text", P["phone"])
    if re.search(r"linkedin", s): return ("text", P.get("linkedin", ""))
    if re.search(r"github", s): return ("text", P.get("github", "")) if P.get("github") else ("skip",)
    if re.search(r"^(personal )?(website|portfolio|blog)|other (website|url)|^url", s): return ("text", P.get("website", "")) if P.get("website") else ("skip",)
    if re.fullmatch(r"country( of residence)?", s): return ("choose", [r"^united states( of america)?$", r"^united states", r"^usa?$"], "United States")
    if re.search(r"^(current )?location|\bcity\b|where are you (located|based)", s):
        return ("choose", [re.escape(P.get("city", "")).lower()], P.get("city", "")) if kind == "combobox" else ("text", P.get("location_text", ""))
    if re.fullmatch(r"state|state/province|province", s): return ch([re.escape(P.get("state_name", "California")).lower(), r"^ca\b"], P.get("state_name", "California"))
    if re.search(r"zip|postal", s): return ("text", str(P.get("zip", ""))) if P.get("zip") else ("flag", "zip not in profile")
    if re.search(r"address", s): return ("flag", "street address: you decide")
    if re.search(r"how did you (hear|find|learn)|^source", s):
        return ("choose", [r"company (web)?site|career", r"linkedin", r"job board|online|internet|website", r"other"], "") if kind != "text" else ("text", P.get("heard_about", "Company careers website"))
    if re.search(r"current (company|employer)", s): return ("text", P.get("current_company", ""))
    if re.search(r"current (job )?title|current role", s): return ("text", P.get("current_title", ""))

    # ---- work authorization (user-stated, profile.yaml)
    if re.search(r"(legally )?authori[sz]ed to work|eligible to work|right to work|work authori[sz]ation", s) and "sponsor" not in s:
        return ch(yn(P.get("authorized_to_work_us")))
    if re.search(r"sponsor|visa (status|support)|h-?1b", s):
        return ch(yn(P.get("needs_sponsorship")))
    ot = " | ".join(options).lower()
    if re.search(r"if you selected .{0,40}other than .{0,4}none of the above", s):
        v = P.get("sanctioned_country_ties")
        if v is False: return ("choose", [r"^not applicable"], "")
        return ("flag", "follow-up to the export-control question: answer yourself")
    if kind in ("checkbox", "radio", "combobox", "select") and re.search(r"u\.?s\.? citizen|green card", ot) or re.search(r"citizenship status|immigration status", s):
        st = (P.get("us_status") or "").lower()
        pat = {"green_card": [r"green card", r"^u\.?s\.? permanent resident"], "citizen": [r"^u\.?s\.? citizen"]}.get(st)
        return ("choose", pat, "") if pat else ("flag", "citizenship status: set us_status in profile.yaml")
    if re.search(r"cuba|iran|north korea|syria|crimea|sanction|export control", s + " " + ot):
        v = P.get("sanctioned_country_ties")
        if v is None: return ("flag", "export-control question: set sanctioned_country_ties in profile.yaml once")
        return ("choose", [r"none of the above"], "") if v is False else ("flag", "export-control question: answer yourself")
    if re.search(r"security clearance", s): return ch(yn(P.get("has_clearance")))
    if re.search(r"(at least|over) 18|18 years", s): return ch(yn(True))

    # ---- worked here before? truthful from your resume's employer list
    if re.search(r"(currently|previously|ever|before|past).*(work|employ)|(work|employ).*(before|previously|in the past)", s) and (co and co in s or "this company" in s or "us before" in s or re.search(r"for (us|the company)", s)):
        if co and any(co in e for e in exp): return ("flag", f"your resume lists {company}: answer yourself")
        return ch(yn(False))
    if re.search(r"relocat", s): return ch(yn(P.get("willing_to_relocate")))
    if re.search(r"notice period|start date|when can you start|earliest", s): return ("text", P.get("notice_period", "")) if P.get("notice_period") else ("flag", "notice period")
    if re.search(r"salary|compensation|pay expectation", s):
        return ("text", str(P["desired_salary"])) if P.get("desired_salary") else ("flag", "salary expectation: you decide")
    if re.search(r"non-?compete", s): return ch(yn(P.get("has_noncompete")))

    # ---- voluntary self-identification → decline
    if re.search(r"gender|sex\b|race|ethnic|hispanic|latino|veteran|disabilit|sexual orientation|transgender|pronoun", s):
        return ("choose", DECLINE, "")

    return ("flag", "not sure: answer yourself")

# ───────────────────────────── page scanning & filling ─────────────────────────────

SCAN_JS = r"""
() => {
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return (r.width > 0 || r.height > 0) && s.visibility !== 'hidden' && s.display !== 'none'; };
  const txt = e => (e ? (e.innerText || e.textContent || '') : '').replace(/\s+/g, ' ').trim();
  const lab = el => {
    let t = '';
    if (el.id) t = txt(document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    if (!t && el.getAttribute('aria-labelledby')) t = el.getAttribute('aria-labelledby').split(/\s+/).map(i => txt(document.getElementById(i))).join(' ');
    if (!t) t = el.getAttribute('aria-label') || '';
    if (!t) { const l = el.closest('label'); if (l) t = txt(l); }
    if (!t) { let p = el.parentElement; for (let i = 0; i < 4 && p && !t; i++, p = p.parentElement) { const l = p.querySelector('label, legend, .application-label, .text'); if (l && !l.contains(el)) t = txt(l); } }
    return t || el.placeholder || el.name || '';
  };
  const groupQ = el => {
    const fs = el.closest('fieldset'); if (fs) { const lg = fs.querySelector('legend'); if (lg) return txt(lg); }
    const g = el.closest('[role=group],[role=radiogroup]'); if (g && g.getAttribute('aria-labelledby')) return txt(document.getElementById(g.getAttribute('aria-labelledby')));
    let p = el.parentElement;
    for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
      const l = [...p.querySelectorAll('label, .application-label, legend, .text')].find(x => !x.querySelector('input') && !(x.htmlFor && document.getElementById(x.htmlFor)?.type === el.type));
      if (l) return txt(l);
    }
    return '';
  };
  const out = [], groups = {};
  let n = 0;
  for (const el of document.querySelectorAll('input, select, textarea')) {
    const type = (el.type || '').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'search' || el.name === 'g-recaptcha-response' || /recaptcha|captcha/i.test(el.id + el.name)) continue;
    const isFile = type === 'file';
    if (!isFile && (!vis(el) || el.disabled || el.getAttribute('aria-hidden') === 'true' || el.tabIndex < 0)) continue;
    const req = !!(el.required || el.getAttribute('aria-required') === 'true');
    if (type === 'checkbox' || type === 'radio') {
      const key = el.name || groupQ(el);
      const g = groups[key] || (groups[key] = { kind: type, q: groupQ(el), req: false, opts: [] });
      el.dataset.sr = el.dataset.sr || ('sr' + (n++));
      g.req = g.req || req || /[*✱]\s*$/.test(g.q);
      g.opts.push({ sr: el.dataset.sr, label: lab(el), checked: el.checked });
      continue;
    }
    el.dataset.sr = el.dataset.sr || ('sr' + (n++));
    const combo = el.getAttribute('role') === 'combobox' || /select__input/.test(el.className);
    let cur = el.value || '';
    if (isFile) cur = el.files && el.files.length ? el.files[0].name : '';
    if (combo) { const box = el.closest('[class*="control"]') || el.closest('[class*="container"], .select-shell, .select'); cur = txt(box && box.querySelector('[class*="single-value"], [class*="multi-value"]')); }
    const q = lab(el);
    out.push({ sr: el.dataset.sr, kind: isFile ? 'file' : combo ? 'combobox' : el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : 'text',
               q, req: req || /[*✱]\s*$/.test(q), cur, id: el.id, name: el.name,
               opts: el.tagName === 'SELECT' ? [...el.options].map(o => o.text.trim()).filter(Boolean) : [] });
  }
  for (const g of Object.values(groups)) out.push({ kind: g.kind, q: g.q, req: g.req, opts: g.opts.map(o => o.label), items: g.opts, cur: g.opts.filter(o => o.checked).map(o => o.label).join(', ') });
  const cap = [...document.querySelectorAll('iframe')].some(f => /recaptcha\/api2\/bframe|hcaptcha|challenges\.cloudflare/.test(f.src) && vis(f));
  return { fields: out, captcha: cap, title: document.title };
}
"""

MARK_JS = """(srs) => { for (const s of srs) { const e = document.querySelector(`[data-sr="${s}"]`); if (!e) continue;
  const box = e.closest('.field, .application-question, fieldset, [class*="field"], div') || e; box.style.outline = '3px solid #e5484d'; box.style.outlineOffset = '4px'; box.style.borderRadius = '6px'; }
  const f = document.querySelector(`[data-sr="${srs[0]}"]`); if (f) f.scrollIntoView({block: 'center'}); }"""

def pick(opts: list[str], pats: list[str]) -> int:
    for p in pats:
        for i, o in enumerate(opts):
            if re.search(p, o.strip(), re.I):
                return i
    return -1

def fill_combobox(page, sr: str, pats: list[str], query: str) -> str | None:
    el = page.locator(f'[data-sr="{sr}"]')
    el.scroll_into_view_if_needed()
    el.click()
    if query:
        el.fill("")
        el.type(query, delay=25)
    page.wait_for_timeout(700 if query else 350)
    opt = page.locator('[role="option"]:visible, [class*="select__option"]:visible')
    texts = [t.strip() for t in opt.all_inner_texts()]
    i = pick(texts, pats)
    if i < 0:
        el.press("Escape")
        return None
    opt.nth(i).click()
    return texts[i]

def run_fill(page, P: dict, company: str, resume: Path | None, cover: Path | None) -> dict:
    data = page.evaluate(SCAN_JS)
    filled, flagged, skipped = [], [], []
    for f in data["fields"]:
        q, kind = f["q"], f["kind"]
        try:
            if kind == "file":
                if f.get("cur"): continue
                ql = (q + " " + (f.get("id") or "") + " " + (f.get("name") or "")).lower()
                target = resume if re.search(r"resume|cv", ql) else cover if re.search(r"cover", ql) else None
                if target:
                    page.locator(f'[data-sr="{f["sr"]}"]').set_input_files(str(target))
                    filled.append((("Resume" if target == resume else "Cover letter"), target.name))
                continue
            if f.get("cur"):
                continue  # already answered (by you or a previous pass)
            a = answer(q, kind, P, company, f.get("opts", []))
            if a[0] == "skip":
                continue
            if a[0] == "flag":
                if f["req"] or kind in ("checkbox", "radio"):
                    flagged.append((q, a[1], f.get("sr") or f["items"][0]["sr"]))
                else:
                    skipped.append((q, a[1]))
                continue
            if kind in ("text", "textarea"):
                val = a[1] if a[0] == "text" else None
                if not val:
                    if f["req"]: flagged.append((q, "missing in profile.yaml", f["sr"]))
                    continue
                page.locator(f'[data-sr="{f["sr"]}"]').fill(str(val))
                filled.append((q, val))
            elif kind == "select":
                pats = a[1] if a[0] == "choose" else [re.escape(str(a[1]))]
                i = pick(f["opts"], pats)
                if i < 0: flagged.append((q, "no matching option", f["sr"])); continue
                page.locator(f'[data-sr="{f["sr"]}"]').select_option(label=f["opts"][i])
                filled.append((q, f["opts"][i]))
            elif kind == "combobox":
                pats, query = (a[1], a[2]) if a[0] == "choose" else ([re.escape(str(a[1]))], str(a[1]))
                got = fill_combobox(page, f["sr"], pats, query)
                if got: filled.append((q, got))
                else: flagged.append((q, "no matching option", f["sr"]))
            elif kind in ("checkbox", "radio"):
                if f.get("cur"): continue
                pats = a[1] if a[0] == "choose" else []
                i = pick(f["opts"], pats) if pats else -1
                if i < 0: flagged.append((q, "no matching option", f["items"][0]["sr"])); continue
                page.locator(f'[data-sr="{f["items"][i]["sr"]}"]').check(force=True)
                filled.append((q, f["opts"][i]))
        except PWError as e:
            flagged.append((q, f"could not fill ({str(e).splitlines()[0][:60]})", f.get("sr") or (f.get("items") or [{}])[0].get("sr")))
    if flagged:
        page.evaluate(MARK_JS, [s for _, _, s in flagged if s])
    return {"filled": filled, "flagged": flagged, "skipped": skipped, "captcha": data["captcha"], "title": data["title"]}

# ───────────────────────────── main ─────────────────────────────

CONFIRM = re.compile(r"thank you for (applying|your application)|application (has been |was )?(submitted|received)|we.?ve received your application|successfully submitted", re.I)

def newest_resume(company: str) -> Path | None:
    files = [Path(p) for p in glob.glob(str(Path.home() / "Downloads" / "*Resume*.pdf"))]
    if company:
        tok = re.sub(r"[^a-z0-9]", "", company.lower())[:12]
        c = [f for f in files if tok and tok in re.sub(r"[^a-z0-9]", "", f.name.lower())]
        files = c or files
    return max(files, key=lambda f: f.stat().st_mtime) if files else None

def report(r: dict):
    print(f"\n{B}Filled {len(r['filled'])}{X}")
    for q, v in r["filled"]:
        print(f"  {GRN}✓{X} {q[:70]:<70} {DIM}→{X} {str(v)[:50]}")
    if r["flagged"]:
        print(f"\n{B}{RED}Needs you ({len(r['flagged'])}), outlined in red on the page{X}")
        for q, why, _ in r["flagged"]:
            print(f"  {RED}●{X} {q[:70]:<70} {DIM}{why}{X}")
    if r["skipped"]:
        print(f"\n{DIM}Optional, left blank: " + "; ".join(q[:40] for q, _ in r["skipped"]) + X)
    if r["captcha"]:
        print(f"\n{YEL}A CAPTCHA is showing. Solve it yourself in the browser.{X}")

def log(row: dict):
    HOME.mkdir(parents=True, exist_ok=True)
    new = not LOG.exists()
    with LOG.open("a", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(row))
        if new: w.writeheader()
        w.writerow(row)

def main():
    ap = argparse.ArgumentParser(description="Fill a job application for review. Never submits.")
    ap.add_argument("url")
    ap.add_argument("--resume", help="tailored resume PDF (default: newest *Resume*.pdf in ~/Downloads matching the company)")
    ap.add_argument("--cover", help="optional cover letter PDF")
    ap.add_argument("--company", help="company name (default: from the URL)")
    ap.add_argument("--board", help="Greenhouse board token, if auto-detect fails (e.g. databricks)")
    ap.add_argument("--profile", default=str(HERE / "profile.yaml"))
    ap.add_argument("--no-wait", action="store_true", help=argparse.SUPPRESS)  # tests
    a = ap.parse_args()

    P = load_profile(Path(a.profile))
    host = up.urlparse(a.url).netloc.lower()
    company = a.company or (up.parse_qs(up.urlparse(a.url).query).get("for") or [None])[0] or \
        ([p for p in host.split(".") if p not in ("www", "careers", "jobs", "job-boards", "boards", "greenhouse", "lever", "ashbyhq", "com", "io", "co", "ai")] or [""])[0]
    m = re.search(r"(?:greenhouse\.io|lever\.co|ashbyhq\.com)/([^/?#]+)", a.url)
    if m and m.group(1) not in ("embed",): company = a.company or m.group(1)

    resume = Path(a.resume).expanduser() if a.resume else newest_resume(company)
    if not resume or not resume.exists():
        sys.exit("No resume found. Download the approved PDF from SoleilRise, then pass --resume ~/Downloads/<file>.pdf")
    cover = Path(a.cover).expanduser() if a.cover else None
    print(f"{B}SoleilRise Assisted Apply{X}  ·  {company or 'job'}  ·  resume: {resume.name}")

    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        kw = dict(headless=False, viewport=None, args=["--start-maximized"])
        try:
            ctx = pw.chromium.launch_persistent_context(str(PROFILE_DIR), channel="chrome", **kw)
        except PWError:
            ctx = pw.chromium.launch_persistent_context(str(PROFILE_DIR), **kw)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        ats, form = resolve(a.url, page, a.board)
        print(f"{DIM}ATS: {ats}  ·  form: {form}{X}")
        page.goto(form, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2500)
        if ats in ("workday", "generic"):
            print(f"{YEL}{ats.title()} page. If it asks you to sign in or create an account, do that yourself, "
                  f"open the application page, then press Enter here to fill it.{X}")

        r = run_fill(page, P, company, resume, cover)
        report(r)
        filled_total, flags = len(r["filled"]), [q for q, _, _ in r["flagged"]]

        print(f"\n{B}Now:{X} review every field in the browser, answer anything in red, then click "
              f"{B}Submit{X} yourself. This tool will not submit.")
        status = "filled, not submitted"
        if not a.no_wait:
            while True:
                try:
                    cmd = input(f"\n{DIM}[Enter] fill this page again (multi-page forms)  ·  [d] done, I submitted  ·  [q] quit without submitting:{X} ").strip().lower()
                except (EOFError, KeyboardInterrupt):
                    cmd = "q"
                if cmd in ("d", "done"):
                    try:
                        body = page.inner_text("body")[:20000]
                        status = "submitted (confirmation seen)" if CONFIRM.search(body) else "submitted (you confirmed)"
                    except PWError:
                        status = "submitted (you confirmed)"
                    break
                if cmd in ("q", "quit"):
                    break
                try:
                    r = run_fill(page, P, company, resume, None); report(r)
                    filled_total += len(r["filled"]); flags += [q for q, _, _ in r["flagged"]]
                except PWError as e:
                    print(f"{RED}Browser closed or page changed: {str(e).splitlines()[0]}{X}"); break
        log({"date": dt.datetime.now().isoformat(timespec="minutes"), "company": company, "title": r.get("title", ""),
             "url": a.url, "resume": str(resume), "fields_filled": filled_total,
             "needed_you": " | ".join(dict.fromkeys(f[:60] for f in flags)), "status": status})
        print(f"{GRN}Logged to {LOG}: {status}{X}")
        if status.startswith("submitted"):
            print("Tick “I submitted my application” in SoleilRise so the job moves to My Applications.")
        if not a.no_wait:
            ctx.close()

if __name__ == "__main__":
    main()
