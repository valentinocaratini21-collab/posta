#!/usr/bin/env python3
"""Tests LOTE DIAGNOSTICO2: estáticos sobre el árbol + conductual del reporter
con un harness node mínimo (DOM stub, sin navegador real)."""
import os, re, subprocess, sys, difflib

S = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(S, 'work')
BASE = os.path.join(S, 'work-base')
fails = []

def check(name, cond, extra=''):
    print(('PASS' if cond else 'FAIL'), name, extra)
    if not cond:
        fails.append(name)

app = open(os.path.join(WORK, 'public', 'app.js'), encoding='utf-8', errors='surrogateescape').read()
base = open(os.path.join(BASE, 'public', 'app.js'), encoding='utf-8', errors='surrogateescape').read()

check('bloque presente ×1', app.count('LOTE DIAGNOSTICO2') == 2)  # apertura + FIN
check('guard __pzDiag2', app.count('__pzDiag2') == 2)
check('nombre evento válido (regex track)', bool(re.search(r"track\('diag_defecto2'", app)))
check('campos del payload', all(k in app for k in
      ['trig:', 'dsw:', 'bsw:', 'bb:', 'iv:', 'grid:', 'col:', 'over:']))
check('tope 6 por sesión', 'sent >= 6' in app)
check('throttle 5 s', 'Date.now() - lastSent < 5000' in app)
check('debounce 400 ms al asentar', ', 400)' in app)
check('solo en Inicio (guarda inicioView)', "getElementById('inicioView')" in app)
check('tope payload 1800 (evita truncado server 2000)', 'length > 1800' in app)
check('marcado TEMPORAL', 'TEMPORAL' in app and 'quitar en el lote del fix real' in app)
check('colapso intacto (pzHeadCollapseSync sin cambios)',
      'function pzHeadCollapseSync() {' in app and app.count('pzHeadCollapseEcho') == 7)
check('mzChatPlus intacto', app.count('mzChatPlus') == 1)
# Diff: solo líneas agregadas, ninguna modificada ni quitada
diff = list(difflib.unified_diff(base.splitlines(), app.splitlines(), lineterm=''))
removed = [l for l in diff if l.startswith('-') and not l.startswith('---')]
check('diff vs base = solo inserción (0 líneas quitadas)', len(removed) == 0, f'removed={len(removed)}')
added = [l for l in diff if l.startswith('+') and not l.startswith('+++')]
check('líneas agregadas acotadas (<120)', 0 < len(added) < 120, f'added={len(added)}')
check('styles.css intacto',
      open(os.path.join(WORK, 'public', 'styles.css'), 'rb').read() ==
      open(os.path.join(BASE, 'public', 'styles.css'), 'rb').read())
check('server.js intacto',
      open(os.path.join(WORK, 'server.js'), 'rb').read() ==
      open(os.path.join(BASE, 'server.js'), 'rb').read())
r = subprocess.run(['node', '--check', os.path.join(WORK, 'public', 'app.js')],
                   capture_output=True, text=True)
check('node --check app.js', r.returncode == 0, r.stderr[:200])

# --- Conductual: extraer el bloque y correrlo con DOM stub ---
start = app.index('// LOTE DIAGNOSTICO2')
end = app.index('// FIN LOTE DIAGNOSTICO2') + len('// FIN LOTE DIAGNOSTICO2')
block = app[start:end]
harness = r'''
const reports = [];
global.track = (n, p) => reports.push({ n, p });
function el(tag, id, cls, rect) {
  return { tagName: tag, id: id || '', className: cls || '',
    getBoundingClientRect: () => rect,
    classList: { contains: (c) => (cls || '').split(' ').includes(c) },
    querySelector: (s) => s === '.hf-grid' ? gridEl : null };
}
const gridEl = el('DIV', '', 'hf-grid', { width: 430, left: 24, right: 454 });
const bbEl = el('MAIN', '', 'bb-main', { width: 430, left: 0, right: 430 });
const ivEl = el('DIV', 'inicioView', 'hf-view hf-collapsed', { width: 430, left: 0, right: 430 });
const wideEl = el('DIV', 'sospechoso', 'hf-strip', { width: 500, left: 24, right: 524 });
const okEl = el('DIV', '', 'hf-tile', { width: 140, left: 24, right: 164 });
let scrollCb = null;
global.window = { innerWidth: 430, scrollY: 900,
  addEventListener: (t, cb) => { if (t === 'scroll') scrollCb = cb; },
  MutationObserver: undefined, __pzDiag2: undefined };
global.document = { documentElement: { scrollWidth: 524 },
  body: { scrollWidth: 524 },
  getElementById: (id) => id === 'inicioView' ? ivEl : null,
  querySelector: (s) => s === '.bb-main' ? bbEl : null,
  querySelectorAll: () => [wideEl, okEl, gridEl] };
''' + block + r'''
(async () => {
  if (!scrollCb) { console.log('NO_SCROLL_CB'); process.exit(2); }
  scrollCb(); // dispara schedule -> debounce 400 ms
  await new Promise(r => setTimeout(r, 700));
  console.log(JSON.stringify({ n: reports.length, r0: reports[0] || null }));
})();
'''
open(os.path.join(S, 'harness-diag2.js'), 'w').write(harness)
r = subprocess.run(['node', os.path.join(S, 'harness-diag2.js')], capture_output=True, text=True, timeout=30)
try:
    import json
    out = json.loads(r.stdout.strip().splitlines()[-1])
    check('conductual: 1 reporte tras scroll asentado', out['n'] == 1, r.stdout[:300])
    p = (out['r0'] or {}).get('p') or {}
    check('conductual: nombre diag_defecto2', (out['r0'] or {}).get('n') == 'diag_defecto2')
    check('conductual: iw/dsw/grid presentes', p.get('iw') == 430 and p.get('dsw') == 524 and p.get('grid', {}).get('w') == 430, str(p)[:200])
    check('conductual: over nombra al elemento ancho', any(o.get('id') == 'sospechoso' and o.get('r') == 524 for o in p.get('over', [])), str(p.get('over')))
    check('conductual: col=1 (colapsado)', p.get('col') == 1)
    check('conductual: payload < 1800 chars', len(json.dumps(p)) < 1800, str(len(json.dumps(p))))
except Exception as e:
    check('conductual: harness corre y emite JSON', False, r.stdout[:300] + r.stderr[:300])

print()
print('TODO OK' if not fails else f'FALLOS: {fails}')
sys.exit(0 if not fails else 1)
