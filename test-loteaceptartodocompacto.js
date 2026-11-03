#!/usr/bin/env node
/* LOTE ACEPTAR-TODO-COMPACTO — test nuevo.
Corre con: node test-loteaceptartodocompacto.js (sin dependencias, sin red).
Para el control negativo: PZ_TEST_ROOT=<prístino v559> node test-loteaceptartodocompacto.js
(en prístino fallan solo los asserts de compacidad/centrado/piso 44px).
Cubre: la barra «Aceptar todo» de la semana nueva (v557, stack
.mz-bottomstack encima del chat de Inicio) pasa de ancho completo a
PÍLDORA COMPACTA CENTRADA (decisión Valentino 2/11: a todo el ancho se
ve demasiado larga). Solo ancho/centrado: posición, colores, texto,
conteo, handler pzAcceptAllWeek y alcance (solo programados pendientes
de la semana nueva, un toque sin confirmación) intactos. La receta de
vidrio NO la pone este lote (la aplica botones-glass después): aquí no
hay degradado ni blur nuevos. Piso de toque: nunca menos de 44px. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.PZ_TEST_ROOT
  ? path.join(__dirname, process.env.PZ_TEST_ROOT)
  : __dirname;
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('FAIL: ' + name); }
}

function extract(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const j = src.indexOf('\n}\n', i);
  if (j < 0) return null;
  return src.slice(i, j + 3);
}

// ---------- regla del stack: compacta y centrada ----------
const OVERRIDE = (CSS.match(/\.mz-bottomstack \.hf-accept-bar\{[^}]*\}/) || [])[0];
ok(!!OVERRIDE, 'CSS: regla .mz-bottomstack .hf-accept-bar presente');
if (OVERRIDE) {
  ok(OVERRIDE.includes('position:static'), 'barra: sigue estática dentro del stack (encima del chat, no flota)');
  ok(/[;{]width:fit-content;/.test(OVERRIDE), 'barra: ancho fit-content (según contenido)');
  ok(!/[;{]width:100%;/.test(OVERRIDE), 'barra: ya NO es width:100% (ancho completo superseded)');
  ok(OVERRIDE.includes('max-width:100%'), 'barra: max-width 100% (no desborda en pantallas chicas)');
  ok(OVERRIDE.includes('margin-left:auto;margin-right:auto'), 'barra: centrada con márgenes auto');
  ok(OVERRIDE.includes('display:flex'), 'barra: sigue flex (contenido alineado)');
  ok(OVERRIDE.includes('justify-content:center'), 'barra: contenido centrado');
  ok(OVERRIDE.includes('gap:8px'), 'barra: gap 8px intacto');
  ok(OVERRIDE.includes('padding:10px 16px'), 'barra: padding 10px 16px intacto');
  const mh = OVERRIDE.match(/min-height:(\d+)px/);
  ok(!!mh && Number(mh[1]) >= 44, 'barra: piso de toque min-height >= 44px');
  ok(!OVERRIDE.includes('linear-gradient') && !OVERRIDE.includes('backdrop-filter'),
    'barra: SIN receta de vidrio (la pone botones-glass después, no este lote)');
}

// ---------- stack y chat intactos ----------
ok(CSS.includes('.mz-bottomstack{position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom))'),
  'stack: fijo a 72px+safe intacto');
ok(CSS.includes('.mz-bottomstack .mz-chatbar{position:static'), 'stack: chat dentro del stack sigue estático');
ok(CSS.includes('#inicioView.hf-wrap.hf-acceptbar-on{padding-bottom:calc(196px + env(safe-area-inset-bottom))'),
  'stack: despeje 196px con barra intacto');

// ---------- píldora base fuera del stack intacta (colores incluidos) ----------
const BASE = (CSS.match(/\.hf-accept-bar\{[^}]*\}/) || [])[0];
ok(!!BASE, 'CSS: regla base .hf-accept-bar presente');
if (BASE) {
  ok(BASE.includes('position:fixed') && BASE.includes('right:16px'), 'base: geometría píldora fija intacta');
  ok(BASE.includes('background:var(--cel)'), 'base: color celeste intacto (sin cambio de receta)');
}

// ---------- HTML de la barra intacto ----------
const SRC_BAR = extract(APP, 'function acceptBarHTML');
ok(!!SRC_BAR, 'acceptBarHTML presente');
if (SRC_BAR) {
  function ctxBase(extra) {
    const ctx = { ME: { lang: 'es' }, pzIc: () => '', console };
    Object.assign(ctx, extra || {});
    return vm.createContext(ctx);
  }
  const cEs = ctxBase({});
  vm.runInContext(SRC_BAR, cEs);
  const es = cEs.acceptBarHTML(5);
  ok(es.includes('class="hf-accept-bar"'), 'barra HTML: clase hf-accept-bar');
  ok(es.includes('id="hfAcceptAllWeek"'), 'barra HTML: mismo id hfAcceptAllWeek');
  ok(es.includes('Aceptar todo') && es.includes('>5<'), 'barra ES: texto y conteo 5');
  const cEn = ctxBase({ ME: { lang: 'en' } });
  vm.runInContext(SRC_BAR, cEn);
  ok(cEn.acceptBarHTML(5).includes('Accept all'), 'barra EN: Accept all');
}

// ---------- handler y alcance intactos ----------
const SRC_HANDLER = extract(APP, 'async function pzAcceptAllWeek');
ok(!!SRC_HANDLER, 'pzAcceptAllWeek presente (handler no cambia)');
if (SRC_HANDLER) {
  ok(SRC_HANDLER.includes('pzAcceptAllWeekCands'), 'handler: usa pzAcceptAllWeekCands (mismo alcance)');
}
ok(APP.includes("haw.onclick = () => pzAcceptAllWeek(haw)"), 'binding: haw.onclick -> pzAcceptAllWeek intacto');
const SRC_CANDS = extract(APP, 'function pzAcceptAllWeekCands');
ok(!!SRC_CANDS, 'pzAcceptAllWeekCands presente');
if (SRC_CANDS) {
  ok(SRC_CANDS.includes("String(p.status || '') !== 'scheduled'"), 'candidatos: solo scheduled');
  ok(SRC_CANDS.includes("String(p.approval || 'pending') !== 'pending'"), 'candidatos: solo pendientes');
  ok(SRC_CANDS.includes("String(p.week_key || '') !== wk"), 'candidatos: solo week_key del lunes actual');
}

console.log(`\naceptar-todo-compacto: ${pass} OK, ${fail} FAIL`);
if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log(' - ' + f)); }
process.exit(fail ? 1 : 0);
