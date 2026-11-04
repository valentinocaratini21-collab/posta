#!/usr/bin/env python3
"""Test lote CHAT-PILDORA — corre sobre work/ (árbol parcheado).

Verifica: (1) el parche es exactamente app.js (+1 botón) + styles.css
(+bloque); (2) la píldora tiene la geometría del mock aprobado; (3) todos
los bindings y guardas viejas siguen intactos; (4) ningún chunk tocado.
Uso: python3 test-lotechatpildora.py [dir-work] [dir-base]
Default: work/ y el árbol WEB-MEJORAS (base pre-parche).
"""
import os, sys, hashlib, subprocess

WORK = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "work")
BASE = sys.argv[2] if len(sys.argv) > 2 else "/home/hatch/workspace/.lotewebmejoras-scratch/work"

fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f" [{extra}]" if extra and not cond else ""))
    if not cond:
        fails.append(name)

def md5(p):
    return hashlib.md5(open(p, "rb").read()).hexdigest()

def read(p):
    return open(p, encoding="utf-8", errors="ignore").read()

app = read(os.path.join(WORK, "public", "app.js"))
css = read(os.path.join(WORK, "public", "styles.css"))
base_app = read(os.path.join(BASE, "public", "app.js"))
base_css = read(os.path.join(BASE, "public", "styles.css"))

# 1. Diff acotado: solo app.js y styles.css cambian, y solo lo esperado.
check("app.js trae el botón + una sola vez",
      app.count('id="mzChatPlus"') == 1)
check("el + abre el menú real del dock",
      'id="mzChatPlus" aria-label="Agregar" onclick="pzDockMasToggle()">+</button>' in app)
check("el + NO es #mzPlus (pin subir-foto-todo intacto)",
      'id="mzChatPlus"' in app and "$('#mzPlus')" in app)
check("app.js fuera del botón es idéntico a la base",
      app.replace('    <button type="button" class="mz-plus" id="mzChatPlus" aria-label="Agregar" onclick="pzDockMasToggle()">+</button>\n', "", 1) == base_app)
check("styles.css trae el bloque CHAT-PILDORA una sola vez",
      css.count("LOTE CHAT-PILDORA") == 1)
check("styles.css fuera del bloque es idéntico a la base",
      css.replace(css[css.index("\n/* ============ LOTE CHAT-PILDORA"):], "", 1) == base_css
      if "\n/* ============ LOTE CHAT-PILDORA" in css else False)

# 2. Geometría del mock aprobado.
check("píldora sólida blanca sin vidrio",
      "#inicioView .mz-chatbar{\n  background:#fff;" in css
      and "backdrop-filter:none;" in css)
check("píldora totalmente redondeada con borde y sombra",
      "border-radius:999px;" in css
      and "border:1px solid rgba(10,30,51,.08);" in css
      and "box-shadow:0 8px 26px rgba(10,30,51,.13);" in css)
check("escritorio: píldora 640px centrada en el stack",
      ".main #inicioView .mz-bottomstack .mz-chatbar{\n  width:min(640px,100%);\n  margin-left:auto;margin-right:auto;" in css)
check("+ celeste 38px", ".mz-plus{\n  width:38px;height:38px;" in css
      and "background:var(--cel);" in css)
check("cara 38px", ".mz-ph .chat-face{width:38px;height:38px;}" in css)
check("mic en círculo claro 38px",
      ".mz-mic{\n  width:38px;height:38px;border-radius:50%;background:rgba(39,147,200,.10);" in css)
check("mic oscuro como el mock", "stroke:#0A1E33;" in css)
check("placeholder sin padding vertical ni borde UA (altura mock)",
      ".mz-ph{display:flex;align-items:center;padding:0;border:none;}" in css)

# 3. Bindings y guardas intactos.
for name, needle in [
    ("abrir chat intacto", "if (open) open.onclick = () => { location.hash = '#/app/chat'; };"),
    ("mic a chat con voz intacto", "window.__pzChatVoice = true; location.hash = '#/app/chat';"),
    ("rotación placeholder intacta", "pzPhAdvanceDock"),
    ("voz que ejecuta intacta", "function voiceToggle"),
    ("menú + del dock intacto", "function pzDockMasToggle()"),
    ("hoja + intacta", "function pzDockMasHTML()"),
    ("guard scroll v623 intacto", "pzHeadCollapseEcho"),
    ("chatbar oculta a visitantes intacta", ".hf-visitor .mz-chatbar{display:none}"),
    ("barra por encima del dock (bottom 72px móvil intacto)", "bottom:calc(72px + env(safe-area-inset-bottom))"),
    ("landing dock no tocado (pz-lp-dock sin mz-chatbar)", 'class="pz-lp-dock"'),
]:
    check(name, needle in (app if "function" in needle or "open" in needle or "window" in needle or "pzPh" in needle or "voice" in needle or "pzDock" in needle or "pzHead" in needle or "$('#" in needle or "location.hash" in needle or "pz-lp-dock" in needle else css))

# 4. Ningún chunk tocado, ningún otro archivo cambiado.
for chunk in ["chunk-analisis.js", "chunk-ajustes.js", "chunk-admin.js"]:
    check(f"{chunk} byte-idéntico a la base",
          md5(os.path.join(WORK, "public", chunk)) == md5(os.path.join(BASE, "public", chunk)))
check("server.js byte-idéntico a la base (BUILD lo pone el liberador)",
      md5(os.path.join(WORK, "server.js")) == md5(os.path.join(BASE, "server.js")))

# 5. node --check
r = subprocess.run(["node", "--check", os.path.join(WORK, "public", "app.js")],
                   capture_output=True, text=True)
check("node --check app.js", r.returncode == 0, r.stderr[:120])

print()
if fails:
    print(f"{len(fails)} FALLOS: {fails}")
    sys.exit(1)
print("TODO OK")
