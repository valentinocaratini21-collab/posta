#!/usr/bin/env python3
"""Test lote MOVIMIENTO-RESIDUAL (v634, sin push): el toggle del header
colapsa/expande con animacion de alto en vez de salto instantaneo.

1. Estatico: funcion nueva x1, guard intacto, DIAGNOSTICO2 intacto,
   max-width v633 en styles intacto, solo app.js difiere del base.
2. Harness node: la funcion EXACTA extraida de app.js, con DOM stub:
   colapsar 390->60 con transition .22s y limpieza; expandir 60->390;
   reduced-motion = toggle plano; sin head = toggle plano; h0==h1 = sin
   estilos; reversion a mitad de animacion (token) no borra la nueva.
3. node --check app.js.
"""
import re
import subprocess
import sys

import os
import tempfile
_TREE = os.path.dirname(os.path.abspath(__file__))  # raiz del arbol (work/)
_ROOT = os.path.dirname(_TREE)  # dir que contiene work/ y work-base/
BASE = os.path.join(_ROOT, "work-base", "public", "app.js")
NEW = os.path.join(_TREE, "public", "app.js")
BASE_STYLES = os.path.join(_ROOT, "work-base", "public", "styles.css")
NEW_STYLES = os.path.join(_TREE, "public", "styles.css")
HARNESS = os.path.join(tempfile.gettempdir(), "harness-lotemovresidual.js")

fails = []


def check(name, cond):
    print(("OK   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


def extract_func(src):
    i = src.index("function pzHeadCollapseAnimate")
    depth = 0
    j = i
    while True:
        c = src[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
        j += 1


def main():
    base = open(BASE, encoding="utf-8", errors="surrogateescape").read()
    new = open(NEW, encoding="utf-8", errors="surrogateescape").read()

    check("funcion pzHeadCollapseAnimate x1", new.count("function pzHeadCollapseAnimate") == 1)
    check("token pzHeadCollapseAnimToken presente", "pzHeadCollapseAnimToken" in new)
    check("reduced-motion -> toggle plano", "prefers-reduced-motion: reduce" in new)
    check("transition height .22s ease-out", "height .22s ease-out" in new)
    check("fallback timeout 300ms", "setTimeout(clear, 300)" in new)
    check("guard echo -1/+1 intacto",
          "pzHeadCollapseEcho = next.collapsed ? -1 : 1" in new)
    check("guard come-echo intacto",
          "if (pzHeadCollapseEcho === -1 && y < pzHeadCollapseState.lastY)" in new
          and "if (pzHeadCollapseEcho === 1 && y > pzHeadCollapseState.lastY)" in new)
    check("DIAGNOSTICO2 intacto (__pzDiag2)",
          new.count("__pzDiag2") == base.count("__pzDiag2") and "__pzDiag2" in new)
    check("DIAGNOSTICO2 evento intacto", "diag_defecto2" in new)
    check("toggle plano en else (sin cambio) preservado",
          "} else {\n      iv.classList.toggle('hf-collapsed', next.collapsed);" in new)
    check("reset maxScroll<=0 intacto",
          "if (iv && iv.scrollHeight <= 0) iv.classList.remove('hf-collapsed')" in new
          or "iv.classList.remove('hf-collapsed')" in new)
    check("styles.css byte-identico al base (v633 intacto)",
          open(BASE_STYLES, "rb").read() == open(NEW_STYLES, "rb").read())
    check("max-width:100% v633 presente",
          "#inicioView{max-width:100%}" in open(NEW_STYLES, encoding="utf-8", errors="surrogateescape").read())
    check("BUILD sin tocar (server.js identico)",
          open(os.path.join(_ROOT, "work-base", "server.js"), "rb").read()
          == open(os.path.join(_TREE, "server.js"), "rb").read())

    # --- harness node con la funcion exacta ---
    func = extract_func(new)
    js = r"""
let _h = 390, _ovr = null, _reduced = false, _nohead = false;
const head = {
  style: {},
  listeners: [],
  addEventListener: function(t, fn, o) { this.listeners.push([t, fn]); },
  get offsetHeight() { return _ovr !== null ? _ovr : _h; }
};
const iv = {
  classes: new Set(),
  classList: { toggle: (c, f) => { _ovr = null; if (f) iv.classes.add(c); else iv.classes.delete(c); if (c === 'hf-collapsed') _h = f ? 60 : 390; } },
  querySelector: (s) => (_nohead || s !== '.hf-head') ? null : head
};
global.window = { matchMedia: (q) => ({ matches: _reduced }) };
let pzHeadCollapseAnimToken = 0;
""" + func + r"""
function assert(c, msg) { if (!c) { console.log('FAIL ' + msg); process.exitCode = 1; } else console.log('OK   ' + msg); }
function reset() { _h = 390; _ovr = null; _reduced = false; _nohead = false; head.style = {}; head.listeners = []; iv.classes = new Set(); }
// 1. colapsar: 390 -> 60 con transition y limpieza por transitionend
reset();
pzHeadCollapseAnimate(iv, true);
assert(iv.classes.has('hf-collapsed'), 'colapsar: clase puesta');
assert(head.style.height === '60px', 'colapsar: alto destino 60px (era ' + head.style.height + ')');
assert(head.style.transition === 'height .22s ease-out', 'colapsar: transition .22s');
assert(head.style.overflow === 'hidden', 'colapsar: overflow hidden');
head.listeners.filter(l => l[0] === 'transitionend')[0][1]();
assert(head.style.height === '' && head.style.transition === '' && head.style.overflow === '', 'colapsar: limpieza tras transitionend');
// 2. expandir: 60 -> 390
reset(); iv.classes.add('hf-collapsed'); _h = 60;
pzHeadCollapseAnimate(iv, false);
assert(!iv.classes.has('hf-collapsed'), 'expandir: clase quitada');
assert(head.style.height === '390px', 'expandir: alto destino 390px (era ' + head.style.height + ')');
// 3. reduced-motion: toggle plano, sin estilos
reset(); _reduced = true;
pzHeadCollapseAnimate(iv, true);
assert(iv.classes.has('hf-collapsed') && head.style.height === undefined, 'reduced-motion: toggle plano sin estilos');
// 4. sin head: toggle plano, sin throw
reset(); _nohead = true;
pzHeadCollapseAnimate(iv, true);
assert(iv.classes.has('hf-collapsed'), 'sin head: toggle plano sin throw');
// 5. h0==h1: sin estilos
reset();
const origToggle = iv.classList.toggle;
iv.classList.toggle = (c, f) => { if (f) iv.classes.add(c); else iv.classes.delete(c); /* _h fijo: h0==h1 */ };
pzHeadCollapseAnimate(iv, true);
assert(head.style.height === undefined, 'h0==h1: sin estilos');
iv.classList.toggle = origToggle;
// 6. reversion a mitad: vieja limpieza no borra la nueva
reset();
pzHeadCollapseAnimate(iv, true);           // anim 1: 390->60
const l1 = head.listeners.filter(l => l[0] === 'transitionend');
assert(l1.length === 1, 'reversion: anim1 registro transitionend');
_ovr = 200;                                  // altura renderizada a mitad
pzHeadCollapseAnimate(iv, false);          // anim 2: 200->390
assert(head.style.height === '390px', 'reversion: alto destino 390px desde 200');
l1[0][1]();                                  // vieja limpieza: debe ser no-op
assert(head.style.height === '390px', 'reversion: vieja limpieza no borra la nueva');
const l2 = head.listeners.filter(l => l[0] === 'transitionend');
l2[l2.length - 1][1]();                      // nueva limpieza: limpia
assert(head.style.height === '', 'reversion: nueva limpieza si limpia');
console.log('HARNESS-DONE');
"""
    open(HARNESS, "w").write(js)
    r = subprocess.run(["node", HARNESS], capture_output=True, text=True)
    print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="")
    check("harness node exit 0", r.returncode == 0 and "HARNESS-DONE" in r.stdout)

    r = subprocess.run(["node", "--check", NEW], capture_output=True, text=True)
    check("node --check app.js", r.returncode == 0)

    print()
    if fails:
        print(f"RESULTADO: {len(fails)} FALLOS: {fails}")
        sys.exit(1)
    print("RESULTADO: TODOS LOS TESTS PASAN")


if __name__ == "__main__":
    main()
