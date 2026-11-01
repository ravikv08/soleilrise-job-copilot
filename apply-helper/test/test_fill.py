import sys, yaml, pathlib, re
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import apply as A
from playwright.sync_api import sync_playwright
T = pathlib.Path(__file__).parent
P = yaml.safe_load((T.parent/"profile.example.yaml").read_text())
P.update(first_name="Test", last_name="User", preferred_name="Test", email="test@example.com", phone="+1-555-010-0000", linkedin="https://www.linkedin.com/in/test", city="San Jose",
         authorized_to_work_us=True, needs_sponsorship=False, us_status="green_card", past_employers=["Acme"], heard_about="Company careers website")
pdf = T/"Databricks_DeliverySolutionsArchitect_Resume_20261027.pdf"; pdf.write_bytes(b"%PDF-1.4\n%%EOF")
def go(P):
    with sync_playwright() as pw:
        b = pw.chromium.launch(); pg = b.new_page()
        pg.goto((T/"mock_greenhouse.html").as_uri())
        pg.evaluate("document.querySelector('#gender').closest('.select__control').querySelector('.select__single-value').textContent='Female'")
        r = A.run_fill(pg, P, "databricks", pdf, None); A.report(r)
        r2 = A.run_fill(pg, P, "databricks", pdf, None)  # idempotent second pass
        st = pg.evaluate("""() => ({sub: !!window.__submitted, res: document.getElementById('resume').files[0]?.name,
          vals: Object.fromEntries([...document.querySelectorAll('.select__container')].map(c => [c.querySelector('input').id, c.querySelector('.select__single-value').textContent])),
          checks: [...document.querySelectorAll('input[type=checkbox]:checked')].map(c => c.id), fn: first_name.value, ph: phone.value, li: q1.value, why: q9.value})""")
        print(st); print("second pass filled:", [q for q,_ in r2["filled"]])
        b.close(); return st, r
st, r = go(P)
assert not st["sub"], "SUBMITTED!"
assert st["vals"] == {'country':'United States','q4':'Yes','q5':'No','q6':'No','gender':'Female','hispanic_ethnicity':'Decline To Self Identify','veteran_status':"I don't wish to answer"}, st["vals"]
assert st["checks"] == ["q10b"], st["checks"]
assert st["why"] == "" and st["res"].startswith("Databricks")
fl = [q for q,_,_ in r["flagged"]]; assert sum("Select all that apply" in q for q in fl) == 2 and any("Why do you" in q for q in fl), fl
P2 = dict(P, sanctioned_country_ties=False); st2, _ = go(P2); assert st2["checks"] == ["q7d","q8f","q10b"], st2["checks"]
print("ALL OK")
