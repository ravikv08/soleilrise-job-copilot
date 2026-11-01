#!/usr/bin/env bash
# One-time setup for SoleilRise Assisted Apply (macOS).
set -e
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Install Python 3 first: https://www.python.org/downloads/ (or: brew install python)"; exit 1; }
python3 -m venv .venv
. .venv/bin/activate
pip install -q --upgrade pip
pip install -q playwright pyyaml
python -m playwright install chromium
cat > apply <<'SH'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"; exec "$DIR/.venv/bin/python" "$DIR/apply.py" "$@"
SH
chmod +x apply
echo
echo "Done. Check profile.yaml once, then run for any job:"
echo "  ~/soleilrise/apply-helper/apply \"<job url>\" --resume ~/Downloads/<tailored resume>.pdf"
