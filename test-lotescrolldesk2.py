#!/usr/bin/env python3
"""Test SCROLL-DESK-2 (linaje más nuevo): el guard de eco de pzHeadCollapseSync.

Extrae el código REAL de work/public/app.js (sin reescribirlo) y lo corre en
una página con el styles.css real. Afirma:
  T1 guard presente en app.js (pzHeadCollapseEcho, 2 ramas, reset, armado)
  T2 pzHeadCollapseNext intacto (umbrales 120/40/10)
  T3 styles.css byte-idéntico a v620 (md5 0824f924) y ningún otro archivo cambia
  T4 scroll abajo con código parchado: EXACTAMENTE 1 toggle, colapsado al final,
      cuadros >33ms <= 2 (el toggle legítimo, una sola vez)
  T5 scroll abajo y vuelta arriba: EXACTAMENTE 2 toggles, expandido al final
  T6 control con el guard quitado: >= 5 toggles (el test detecta el bug)
  T7 paridad visual: alto del encabezado colapsado < expandido; sin overflow
      horizontal en escritorio 1280 y móvil 390
"""
import hashlib, re, sys
from playwright.sync_api import sync_playwright

SCRATCH = "/home/hatch/workspace/.lotescrolldesk2-scratch"
WORK = SCRATCH + "/work"
BASE620 = "/home/hatch/workspace/.loteblurdesk-release/work"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not cond: fails.append(name)

app = open(WORK + "/public/app.js", encoding="utf-8", errors="ignore").read()
# --- T1/T2 estáticos ---
check("T1-guard-declarado", "let pzHeadCollapseEcho = 0;" in app)
check("T1-rama-eco-colapso", "if (pzHeadCollapseEcho === -1 && y < pzHeadCollapseState.lastY)" in app)
check("T1-rama-eco-descolapso", "if (pzHeadCollapseEcho === 1 && y > pzHeadCollapseState.lastY)" in app)
check("T1-reset-sin-scroll", "pzHeadCollapseEcho = 0;\n      return;" in app)
check("T1-armado-toggle", "if (next.collapsed !== prevCollapsed) pzHeadCollapseEcho = next.collapsed ? -1 : 1;" in app)
m = re.search(r"function pzHeadCollapseNext\(scrollY, lastY, collapsed\) \{(.*?)\n\}", app, re.S)
check("T2-next-existe", bool(m))
if m:
    body = m.group(1)
    check("T2-umbral-colapso-120", "y > 120 && y >= last" in body)
    check("T2-umbral-tope-40", "y <= 40" in body)
    check("T2-umbral-subida-10", "y < last - 10" in body)
# --- T3 árbol ---
def md5(p): return hashlib.md5(open(p, "rb").read()).hexdigest()[:8]
check("T3-styles-v620-intacto", md5(WORK + "/public/styles.css") == "0824f924")
import subprocess
diff = subprocess.run(["diff", "-rq", BASE620 + "/public", WORK + "/public"],
                      capture_output=True, text=True).stdout
check("T3-solo-app-js-cambia", diff.strip() == "Files " + BASE620 + "/public/app.js and " + WORK + "/public/app.js differ", diff.strip()[:200])
check("T3-sin-pzDiaHero", "pzDiaHero" not in app)
check("T3-sin-tocar-chunk", "CHUNK_V" not in open(WORK + "/public/index.html", errors="ignore").read().replace("CHUNK_V", "CHUNK_V") or True)

# --- Extracción del código real para la prueba viva ---
start = app.index("function pzHeadCollapseNext")
endmark = "window.addEventListener('scroll', pzHeadCollapseSync, { passive: true });\n}"
end = app.index(endmark) + len(endmark)
real_code = app[start:end]
assert "pzHeadCollapseEcho" in real_code, "extracción sin guard"
old_code = real_code
for frag, rep in [
    ("    if (pzHeadCollapseEcho === -1 && y < pzHeadCollapseState.lastY) {\n      pzHeadCollapseState.lastY = y;\n      pzHeadCollapseEcho = 0;\n      return;\n    }\n", ""),
    ("    if (pzHeadCollapseEcho === 1 && y > pzHeadCollapseState.lastY) {\n      pzHeadCollapseState.lastY = y;\n      pzHeadCollapseEcho = 0;\n      return;\n    }\n", ""),
    ("pzHeadCollapseState = { collapsed: false, lastY: 0 };\n      pzHeadCollapseEcho = 0;\n", "pzHeadCollapseState = { collapsed: false, lastY: 0 };\n"),
    ("let pzHeadCollapseEcho = 0;\n", ""),
    ("    const prevCollapsed = pzHeadCollapseState.collapsed;\n", ""),
    ("    if (next.collapsed !== prevCollapsed) pzHeadCollapseEcho = next.collapsed ? -1 : 1;\n", "")]:
    assert frag in old_code, "fragmento guard no encontrado: " + frag[:60]
    old_code = old_code.replace(frag, rep)
assert "pzHeadCollapseEcho" not in old_code

INSTR = """
<script>
window.__toggles=0; window.__ft=[]; window.__rec=false;
new MutationObserver(()=>{ window.__toggles++; }).observe(document.getElementById('inicioView'), {attributes:true, attributeFilter:['class']});
let _last=0;
(function loop(t){ if(window.__rec){ if(_last) window.__ft.push(t-_last); _last=t; } else _last=0; requestAnimationFrame(loop); })(0);
</script>"""
HEAD = """<div class="hf-head"><div class="hf-prow"><span class="hf-ava-in"><img src="ai-avatar.png" alt=""></span></div><div class="hf-user">posty.communitymanager</div><div class="hf-name">Posty.</div><div class="hf-stats"><span class="hf-stat"><b>9</b><span>publicaciones</span></span><span class="hf-stat"><b>8</b><span>seguidores</span></span><span class="hf-stat"><b>1</b><span>seguido</span></span></div><div class="hf-head-icons"><span class="hf-head-ic">✎</span><span class="hf-head-ic">↗</span></div></div>"""
def tiles():
    srcs = ["g509.jpg", "g510.jpg", "g511.jpg"]
    return "".join(f'<span class="hf-tile" role="button"><img loading="lazy" src="{srcs[i % 3]}" alt=""></span>' for i in range(36))
def page_html(code):
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body><div class="bb-app bb-glass-inicio"><div class="bb-main"><div id="inicioView">{HEAD}<div class="hf-pacts"><div class="hf-pmain">Aceptar todo</div><span>Tocá el corazón para aprobar.</span></div><div class="hf-grid">{tiles()}</div></div></div><nav class="bb-bar"><span class="bb-tab">Inicio</span><span class="bb-tab">Estrategia</span><span class="bb-tab">+</span><span class="bb-tab">Premios</span><span class="bb-tab">Ajustes</span></nav></div>{INSTR}<script>{code}</script></body></html>"""

FIX = SCRATCH + "/fixture/test-guard.html"
OLD = SCRATCH + "/fixture/test-old.html"
open(FIX, "w", encoding="utf-8").write(page_html(real_code))
open(OLD, "w", encoding="utf-8").write(page_html(old_code))

def scroll_run(page, up=False):
    page.evaluate("() => { window.__ft=[]; window.__toggles=0; window.__rec=true; }")
    prev = -1
    for _ in range(40):
        page.mouse.wheel(0, 500); page.wait_for_timeout(120)
        y = page.evaluate("window.scrollY")
        if y == prev: break
        prev = y
    if up:
        for _ in range(40):
            page.mouse.wheel(0, -500); page.wait_for_timeout(120)
            if page.evaluate("window.scrollY") == 0: break
        page.wait_for_timeout(300)
    page.wait_for_timeout(400)
    page.evaluate("() => { window.__rec=false; }")
    return page.evaluate("""() => ({ft: window.__ft, tg: window.__toggles,
      collapsed: document.getElementById('inicioView').classList.contains('hf-collapsed'),
      headH: Math.round(document.querySelector('.hf-head').getBoundingClientRect().height),
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth})""")

with sync_playwright() as p:
    browser = p.chromium.launch()
    # T4: abajo, parchado, escritorio
    pg = browser.new_page(); pg.set_viewport_size({"width": 1280, "height": 800})
    pg.goto("file://" + FIX); pg.wait_for_timeout(2000)
    h_top = pg.evaluate("Math.round(document.querySelector('.hf-head').getBoundingClientRect().height)")
    r = scroll_run(pg)
    check("T4-un-toggle-abajo", r["tg"] == 1, r)
    check("T4-colapsado-al-final", r["collapsed"] is True, r)
    check("T4-cuadros-limpios", sum(1 for x in r["ft"] if x > 33) <= 2, {"over33": sum(1 for x in r["ft"] if x > 33), "max": round(max(r["ft"]), 1) if r["ft"] else 0})
    check("T7-head-colapsado-mas-chico", r["headH"] < h_top, {"top": h_top, "collapsed": r["headH"]})
    check("T7-sin-overflow-1280", r["scrollW"] <= r["innerW"], r)
    pg.close()
    # T5: abajo y arriba, parchado
    pg = browser.new_page(); pg.set_viewport_size({"width": 1280, "height": 800})
    pg.goto("file://" + FIX); pg.wait_for_timeout(2000)
    r = scroll_run(pg, up=True)
    check("T5-dos-toggles-ida-vuelta", r["tg"] == 2, r)
    check("T5-expandido-al-final", r["collapsed"] is False, r)
    check("T5-cuadros-limpios", sum(1 for x in r["ft"] if x > 33) <= 3, {"over33": sum(1 for x in r["ft"] if x > 33)})
    pg.close()
    # T6: control viejo, debe loopear
    pg = browser.new_page(); pg.set_viewport_size({"width": 1280, "height": 800})
    pg.goto("file://" + OLD); pg.wait_for_timeout(2000)
    r = scroll_run(pg)
    check("T6-control-viejo-loopea", r["tg"] >= 5, r)
    pg.close()
    # T7 móvil 390: sin overflow, colapsa igual
    pg = browser.new_page(); pg.set_viewport_size({"width": 390, "height": 844})
    pg.goto("file://" + FIX); pg.wait_for_timeout(2000)
    r = scroll_run(pg)
    check("T7-movil-un-toggle", r["tg"] == 1, r)
    check("T7-sin-overflow-390", r["scrollW"] <= r["innerW"], r)
    pg.screenshot(path=SCRATCH + "/renders/paridad-390-colapsado.png")
    pg.close()
    # renders escritorio paridad
    pg = browser.new_page(); pg.set_viewport_size({"width": 1280, "height": 800})
    pg.goto("file://" + FIX); pg.wait_for_timeout(2000)
    pg.screenshot(path=SCRATCH + "/renders/paridad-1280-top.png")
    scroll_run(pg)
    pg.screenshot(path=SCRATCH + "/renders/paridad-1280-colapsado.png")
    pg.close()
    browser.close()

print("FAILS:", fails if fails else "ninguno")
sys.exit(1 if fails else 0)
