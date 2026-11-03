#!/usr/bin/env node
/* LOTE ACEPTAR-TODO-POSICIÓN — test nuevo.
Corre con: node test-loteaceptartodopos.js (sin dependencias, sin red).
Para el control negativo: PZ_TEST_ROOT=pristine-v555 node test-loteaceptartodopos.js
Cubre: la «Aceptar todo» de la semana nueva es fila propia del bloque
inferior fijo (pestañas abajo, chat encima, barra encima del chat);
SUPERSEDED CON CAUSA 2/11 (decisión Valentino: la barra a todo el ancho
se ve demasiado larga): desde aceptar-todo-compacto es PÍLDORA
COMPACTA CENTRADA, no a todo el ancho. El chat queda 100% clickeable; sin
pendientes no hay barra ni hueco fantasma; la grilla lleva el despeje
correspondiente; mismos candidatos v552; un toque acepta en su lugar;
la píldora de Agenda (.accept-pill, hsAcceptAll) NO se toca; la
píldora vieja de borradores sigue muerta. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.PZ_TEST_ROOT
  ? path.join(__dirname, process.env.PZ_TEST_ROOT)
  : __dirname;
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const PRE_DIR = path.join(__dirname, 'pristine-v555');
const APP_PRE = fs.existsSync(path.join(PRE_DIR, 'public', 'app.js'))
  ? fs.readFileSync(path.join(PRE_DIR, 'public', 'app.js'), 'utf8') : null;
const CSS_PRE = fs.existsSync(path.join(PRE_DIR, 'public', 'styles.css'))
  ? fs.readFileSync(path.join(PRE_DIR, 'public', 'styles.css'), 'utf8') : null;

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
const SRC_BAR = extract(APP, 'function acceptBarHTML');
const SRC_PILL = extract(APP, 'function acceptPillHTML');
const SRC_CANDS = extract(APP, 'function pzAcceptAllWeekCands');
const SRC_HANDLER = extract(APP, 'async function pzAcceptAllWeek');
const SRC_OFF = extract(APP, 'function pzAcceptBarOff');
ok(!!SRC_BAR, 'acceptBarHTML presente');
ok(!!SRC_PILL, 'acceptPillHTML presente (Agenda intacta)');
ok(!!SRC_CANDS, 'pzAcceptAllWeekCands presente');
ok(!!SRC_HANDLER, 'pzAcceptAllWeek presente');
ok(!!SRC_OFF, 'pzAcceptBarOff presente');

// ---------- barra: estáticos ----------
if (SRC_BAR) {
  ok(SRC_BAR.includes('class="hf-accept-bar"'), 'barra: clase hf-accept-bar');
  ok(SRC_BAR.includes('id="hfAcceptAllWeek"'), 'barra: mismo id hfAcceptAllWeek');
  ok(SRC_BAR.includes('accept-count'), 'barra: conteo');
  ok(!SRC_BAR.includes('accept-pill'), 'barra: NO usa la clase accept-pill');
}
if (APP_PRE && SRC_PILL) {
  const pre = extract(APP_PRE, 'function acceptPillHTML');
  ok(pre === SRC_PILL, 'acceptPillHTML byte-idéntica a v555 (Agenda intacta)');
}
if (CSS_PRE) {
  const mPre = CSS_PRE.match(/\.accept-pill\{[^}]*\}/);
  const mNow = CSS.match(/\.accept-pill\{[^}]*\}/);
  ok(!!mPre && !!mNow && mPre[0] === mNow[0], 'CSS .accept-pill byte-idéntica a v555');
}
ok(APP.includes("acceptPillHTML(drafts.length, 'hsAcceptAll')"), 'Agenda hsAcceptAll sigue con acceptPillHTML');
ok(APP.includes("acceptBarHTML(pzAcceptWeekCands.length)"), 'plantilla semana nueva usa acceptBarHTML');
ok(!APP.includes("acceptPillHTML(pzAcceptWeekCands.length, 'hfAcceptAllWeek')"), 'semana nueva YA NO usa acceptPillHTML');

// ---------- plantilla Inicio: stack ----------
{
  const ivStart = APP.indexOf('async function inicioView()');
  const ivEnd = APP.indexOf('/* ===== TIRA DE NIVEL', ivStart);
  const iv = APP.slice(ivStart, ivEnd);
  ok(iv.includes('id="mzBottomStack"'), 'plantilla: stack mzBottomStack presente');
  ok(iv.includes('class="mz-bottomstack"'), 'plantilla: clase mz-bottomstack');
  const iBar = iv.indexOf('${pzAcceptWeekHTML}');
  const iChat = iv.indexOf('id="mzChatBar"');
  const iStack = iv.indexOf('id="mzBottomStack"');
  ok(iBar > 0 && iChat > 0 && iStack > 0, 'plantilla: barra, stack y chat presentes');
  ok(iStack > 0 && iStack < iBar && iBar < iChat, 'plantilla: orden stack → barra → chat (barra ENCIMA del chat)');
  ok(iv.includes('id="mzPlus"') && iv.includes('id="mzChatOpen"') && iv.includes('id="mzMic"'), 'chat: +, campo y mic intactos');
  ok(iv.includes("hf-acceptbar-on") && iv.includes("pzAcceptWeekCands.length ? ' hf-acceptbar-on' : ''"), 'plantilla: clase de despeje solo con pendientes');
  ok(iv.indexOf('${pzAcceptWeekHTML}') > iv.indexOf('${gridHTML}'), 'barra va tras la grilla en la plantilla');
  ok(!iv.includes('${stripHTML}'), 'píldora vieja de borradores NO se inserta (sigue muerta)');
  ok(iv.includes('</div>\n  </div>\n  <div class="mz-sheet"'), 'stack se cierra antes de la hoja del chat');
  ok(iv.includes("pzAcceptWeekCands.length\n    ? acceptBarHTML"), 'sin pendientes la barra es cadena vacía');
}
ok(APP.includes("$('#hfAcceptAllWeek')"), 'binder hfAcceptAllWeek presente');
ok(APP.includes('pzAcceptAllWeek(haw)'), 'binder llama al handler');

// ---------- handler: sin render, apaga el despeje ----------
if (SRC_HANDLER) {
  const noComments = SRC_HANDLER.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  ok(!noComments.includes('render('), 'handler NO llama a render()');
  ok((SRC_HANDLER.match(/pzAcceptBarOff\(\);/g) || []).length >= 2, 'handler apaga el despeje en los dos sitios donde quita la barra');
}

// ---------- candidatos: exactamente v552 ----------
if (SRC_CANDS) {
  ok(SRC_CANDS.includes("String(p.status || '') !== 'scheduled'"), 'candidatos: solo scheduled');
  ok(SRC_CANDS.includes("String(p.approval || 'pending') !== 'pending'"), 'candidatos: solo pendientes');
  ok(SRC_CANDS.includes("String(p.week_key || '') !== wk"), 'candidatos: solo week_key del lunes actual');
  ok(SRC_CANDS.includes('t.archivedExt'), 'candidatos: fuera archivados');
  ok(SRC_CANDS.includes('owner_liked'), 'candidatos: piloto excluye constancia');
}

// ---------- CSS: geometría del stack ----------
{
  const barRule = CSS.match(/\.hf-accept-bar\{[^}]*\}/);
  ok(!!barRule, 'CSS: regla .hf-accept-bar presente');
  if (barRule) {
    ok(barRule[0].includes('position:fixed') && barRule[0].includes('right:16px'), 'CSS fuera del móvil: barra conserva geometría píldora');
  }
  const mob = CSS.match(/@media\(max-width:820px\)\{[^]*?#inicioView\.hf-wrap\.hf-acceptbar-on\{[^}]*\}[^}]*\}/);
  ok(!!mob, 'CSS: bloque móvil del stack presente');
  if (mob) {
    const b = mob[0];
    ok(b.includes('.mz-bottomstack{position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom))'), 'CSS móvil: stack fijo a 72px+safe (misma base que el chat)');
    ok(b.includes('.mz-bottomstack .mz-chatbar{position:static'), 'CSS móvil: chat dentro del stack es estático (no flota)');
    ok(b.includes('.mz-bottomstack .hf-accept-bar{position:static;width:fit-content'), 'CSS móvil: barra compacta (fit-content, no 100%) — decisión Valentino 2/11, supersede ancho completo');
    ok(b.includes('margin-left:auto;margin-right:auto'), 'CSS móvil: barra centrada (márgenes auto)');
    ok(b.includes('#inicioView.hf-wrap.hf-acceptbar-on{padding-bottom:calc(196px + env(safe-area-inset-bottom))'), 'CSS móvil: despeje 196px solo con barra');
  }
  const stackFixedCount = (CSS.match(/\.mz-bottomstack\{position:fixed/g) || []).length;
  // SUPERSEDED CON CAUSA (LOTE CHAT-ESCRITORIO-FIJO, decisión Valentino
  // 2/11: chat fijo abajo también en escritorio): el stack fijo ya NO es
  // solo móvil. Quedan 3 reglas: 1 móvil (≤820px) + 2 de escritorio web
  // (821–1023 y ≥1024, con scoping .main). La regla móvil sigue intacta
  // (asserts del bloque mob arriba). La barra compacta v564 (fit-content)
  // sigue intacta en móvil: en escritorio la barra vive estática DENTRO
  // del stack (contenido centrado), no como píldora flotante.
  const stackFixedDesk = (CSS.match(/\.main #inicioView \.mz-bottomstack\{position:fixed/g) || []).length;
  ok(stackFixedCount === 3, 'stack fijo 3 veces: 1 móvil + 2 escritorio web (decisión 2/11)');
  ok(stackFixedDesk === 2 && CSS.indexOf('.mz-bottomstack{position:fixed') > CSS.indexOf('LOTE ACEPTAR-TODO-POSICIÓN'), 'stack fijo escritorio: 2 reglas con scoping .main, tras el bloque del lote');
  // Aritmética del despeje: chat 52 (38 + 7 + 7) + gap 8 + barra 44 (min-height, piso de toque; antes ≤42) = 176 ≤ 196.
  const chatH = 38 + 7 + 7;
  const barH = 44;
  const top = 72 + chatH + 8 + barH;
  ok(top <= 196, `despeje: tope del stack ${top}px ≤ padding 196px`);
  ok(CSS.includes('.mz-plus{width:38px;height:38px'), 'base: botón + 38px (altura del chat)');
}

// ---------- funcional: barra ES/EN ----------
function ctxBase(extra) {
  const ctx = { ME: { lang: 'es' }, pzIc: () => '', console };
  Object.assign(ctx, extra || {});
  return vm.createContext(ctx);
}
if (SRC_BAR) {
  const cEs = ctxBase({ ME: { lang: 'es' } });
  vm.runInContext(SRC_BAR, cEs);
  const es = cEs.acceptBarHTML(5);
  ok(es.includes('Aceptar todo') && es.includes('>5<'), 'barra ES: texto y conteo');
  const cEn = ctxBase({ ME: { lang: 'en' } });
  vm.runInContext(SRC_BAR, cEn);
  ok(cEn.acceptBarHTML(5).includes('Accept all'), 'barra EN: Accept all');
}

// ---------- funcional: candidatos ----------
if (SRC_CANDS) {
  const ctx = ctxBase({
    albumMondayKey: () => '2026-11-02',
    HF_VISITOR: false,
  });
  vm.runInContext(SRC_CANDS, ctx);
  const T = (id, st, ap, wk, extra) => Object.assign(
    { kind: 'post', post: { id, status: st, approval: ap, week_key: wk, scheduled_at: '2026-11-02T22:00:00.000Z' } }, extra || {});
  const list = [
    T(1, 'scheduled', 'pending', '2026-11-02'),
    T(2, 'scheduled', 'pending', '2026-11-02', { archivedExt: true }),
    T(3, 'draft', 'pending', '2026-11-02'),
    T(4, 'scheduled', 'pending', '2026-10-26'),
    T(5, 'published', 'approved', '2026-11-02'),
    T(6, 'scheduled', 'approved', '2026-11-02'),
    T(7, 'scheduled', 'pending', '2026-11-02', { post: null }),
    T(8, 'scheduled', 'pending', '2026-11-02'),
  ];
  list[6] = { kind: 'post', post: null };
  list[7].post.owner_liked = 1;
  const got = ctx.pzAcceptAllWeekCands(list, null).map((t) => t.post.id);
  ok(JSON.stringify(got) === JSON.stringify([1, 8]), 'candidatos: solo programados pendientes semana nueva (1,8), resto fuera');
  const gotPilot = ctx.pzAcceptAllWeekCands(list, true).map((t) => t.post.id);
  ok(JSON.stringify(gotPilot) === JSON.stringify([1]), 'candidatos piloto: excluye constancia (8)');
}

// ---------- funcional: handler quita barra y despeje ----------
if (SRC_HANDLER && SRC_OFF) {
  const runHandler = async ({ approveOk, count }) => {
    const removed = { btn: 0, classes: [] };
    const fakeView = { classList: { remove: (c) => removed.classes.push(c) } };
    const fakeCount = { textContent: '' };
    const btn = {
      _pzBusy: false, disabled: false, removed: false,
      remove() { this.removed = true; removed.btn++; },
      querySelector: (s) => (s === '.accept-count' ? fakeCount : null),
    };
    const tiles = [];
    for (let i = 0; i < count; i++) {
      tiles.push({ kind: 'post', post: { id: 100 + i, status: 'scheduled', approval: 'pending', week_key: '2026-11-02', scheduled_at: '2026-11-02T22:00:00.000Z' } });
    }
    const nodes = tiles.map(() => ({ querySelector: () => null, querySelectorAll: () => [], style: {}, insertBefore: () => {}, firstChild: null }));
    const ctx = ctxBase({
      HF_VISITOR: false, HF_TILES: tiles,
      f3ApprovalMode: async () => ({ manual: true, known: true }),
      f3En: () => false,
      api: { post: async () => (approveOk ? { ok: true } : { ok: false }), patch: async () => ({ ok: true }) },
      toast: () => {},
      pzAprobadoMarcar: () => {},
      pzAcceptAllWeekMark: () => {},
      albumMondayKey: () => '2026-11-02',
      document: {
        getElementById: (id) => (id === 'inicioView' ? fakeView : null),
        querySelectorAll: (sel) => {
          const m = sel.match(/data-post-id="(\d+)"/);
          if (!m) return [];
          return [nodes[Number(m[1]) - 100]].filter(Boolean);
        },
      },
    });
    vm.runInContext(SRC_CANDS, ctx);
    vm.runInContext(SRC_OFF, ctx);
    vm.runInContext(SRC_HANDLER, ctx);
    await ctx.pzAcceptAllWeek(btn);
    return { btn, removed, fakeCount, tiles };
  };
  (async () => {
    const r1 = await runHandler({ approveOk: true, count: 2 });
    ok(r1.btn.removed && r1.removed.classes.includes('hf-acceptbar-on'), 'handler éxito total: quita barra Y despeje');
    const r2 = await runHandler({ approveOk: false, count: 2 });
    ok(!r2.btn.removed && !r2.removed.classes.includes('hf-acceptbar-on'), 'handler todo falla: barra y despeje quedan (reintento posible)');
    console.log(`\nLOTE ACEPTAR-TODO-POSICIÓN: ${pass} ok, ${fail} fallos`);
    if (fail) { console.log('Fallos:\n- ' + fails.join('\n- ')); process.exit(1); }
  })();
} else {
  console.log(`\nLOTE ACEPTAR-TODO-POSICIÓN: ${pass} ok, ${fail} fallos`);
  if (fail) { console.log('Fallos:\n- ' + fails.join('\n- ')); process.exit(1); }
}
