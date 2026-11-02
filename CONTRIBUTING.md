# Contributing

Thanks for taking a look. This is a small project, so the process is light.

## Getting set up

The app (`app/index.html`) needs no build step. It is one self-contained page that
runs as a Claude artifact — open it there to see your changes. Opening the file
directly in a browser renders the layout but disables anything that needs Claude
(sign-in, storage, AI calls, the browser tools), and the page says so.

The helper is a normal Python tool:

```bash
cd apply-helper
pip install playwright pyyaml && python -m playwright install chromium
cp profile.example.yaml profile.yaml   # your own answers; it is gitignored
```

## Before you open a pull request

Run both checks. CI runs the same two:

```bash
python apply-helper/test/test_fill.py
node .github/scripts/check-inline-js.mjs app/index.html
```

`test_fill.py` drives the filler against `test/mock_greenhouse.html` and asserts the
behaviour below. If you change `apply.py`, extend the mock form rather than relaxing
an assertion.

## Rules that are not up for negotiation

These are the point of the project. A change that weakens one will not be merged.

- **It never clicks Submit.** The person reviews every field and submits themselves.
- **It never invents anything** — no experience, tools, numbers or results that the
  person's resume and confirmed facts do not already support.
- **It never guesses.** A question with no truthful answer in `profile.yaml` is
  outlined in red and left to the person.
- **EEO and self-identification questions default to declining.**
- **No passwords, no account creation, no CAPTCHA solving, no anti-bot evasion.**
- **Nothing personal is committed.** `profile.yaml`, resumes and `*.pdf` are
  gitignored. Keep it that way.

## Reporting a problem with a form

ATS forms change often. If a field fills wrongly, the most useful report is the ATS
(Greenhouse, Lever, Ashby, Workday…), the question label as it appears on the page,
what it filled, and what it should have done. A trimmed-down copy of the field's HTML
helps most of all — with your own answers removed.
