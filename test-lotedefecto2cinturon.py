#!/usr/bin/env python3
"""Tests LOTE DEFECTO2-CINTURON sobre el codigo REAL. Uso:
python3 test-lotedefecto2cinturon.py <dir-scratch>   (contiene work/ y work-base/)
Sale 0 solo si TODO pasa.
"""
import hashlib, os, sys, difflib

S = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = os.path.join(S, "work-base")
WORK = os.path.join(S, "work")
fails = []
nchecks = [0]


def check(name, cond, extra=""):
    nchecks[0] += 1
    print(("PASS " if cond else "FAIL ") + name + (" " + extra if extra else ""))
    if not cond:
        fails.append(name)


def md5(p):
    with open(p, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


css_new = read(os.path.join(WORK, "public/styles.css"))
css_old = read(os.path.join(BASE, "public/styles.css"))

# 1. Las 2 reglas presentes exactamente 1 vez cada una
check("regla .bb-main{min-width:0} x1", css_new.count(".bb-main{min-width:0}") == 1)
check("regla #inicioView{min-width:0} x1", css_new.count("#inicioView{min-width:0}") == 1)
# 2. Dentro del bloque del lote
i = css_new.find("LOTE DEFECTO2-CINTURON")
check("bloque LOTE DEFECTO2-CINTURON presente", i >= 0)
check("reglas dentro del bloque", i >= 0 and ".bb-main{min-width:0}" in css_new[i:] and "#inicioView{min-width:0}" in css_new[i:])
# 3. Diff vs base = SOLO lineas agregadas al final, cero quitadas/cambiadas
d = list(difflib.unified_diff(css_old.splitlines(), css_new.splitlines(), lineterm=""))
removed = [l for l in d if l.startswith("-") and not l.startswith("---")]
changed = [l for l in d if l.startswith("+") and not l.startswith("+++")]
check("diff solo agrega (cero lineas quitadas)", not removed, f"quitadas={len(removed)}")
check("diff agrega solo el bloque (11 lineas)", len(changed) == 11, f"agregadas={len(changed)}")
check("base es prefijo del nuevo", css_new.startswith(css_old))
# 4. Llaves balanceadas
check("llaves balanceadas", css_new.count("{") == css_new.count("}"))
# 5. Ningun otro archivo difiere
diff_files = []
for root, _, files in os.walk(BASE):
    for fn in files:
        b = os.path.join(root, fn)
        w = b.replace(BASE, WORK, 1)
        if not os.path.exists(w) or md5(b) != md5(w):
            diff_files.append(os.path.relpath(b, BASE))
check("solo styles.css difiere en todo el arbol", diff_files == ["public/styles.css"], str(diff_files))
# 6. Anclas originales intactas
check("ancla .bb-main original x1", css_new.count(".bb-main{flex:1;") == 1)
check("ancla #inicioView overflow-x:clip x1", css_new.count("#inicioView{overflow-x:clip}") == 1)
check("espejo .main min-width:0 intacto", ".main{flex:1;min-width:0;" in css_new)
# 7. Colapso / resto intacto (archivos byte-identicos ya cubren, pero asserts explicitos)
app = read(os.path.join(WORK, "public/app.js"))
check("pzHeadCollapseEcho x7 intacto", app.count("pzHeadCollapseEcho") == 7)
check("mzChatPlus x1 intacto", app.count("mzChatPlus") == 1)
check("CHUNK_V v629 intacto", "20261101-v629" in app)
check("Subir foto v630 intacto", "Subir foto" in app)
check("sin data/ en el arbol", not os.path.exists(os.path.join(WORK, "data")))

print()
print("TOTAL: %d checks, %d fallos" % (nchecks[0], len(fails)))
if fails:
    print("FALLOS:", fails)
    sys.exit(1)
print("TODO OK")
