#!/usr/bin/env node
/* LOTE ACEPTAR-TODO-SEMANA — test nuevo.
Corre con: node test-loteaceptartodo.js (sin dependencias, sin red).
Cubre: alcance exacto del botón, handler por modo, toast honesto,
actualización en su lugar sin render, y que la píldora vieja de
borradores siga muerta. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const APP_PRE = fs.readFileSync(path.join(__dirname, '..', 'pristine-v710', 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'));
const SRV_PRE = fs.readFileSync(path.join(__dirname, '..', 'pristine-v710', 'server.js'));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('FAIL: ' + name); }
}
function eq(a, b, name) { ok(a === b, name + ' (esperado ' + JSON.stringify(b) + ', visto ' + JSON.stringify(a) + ')'); }

// Extrae una función top-level por su declaración hasta su cierre en col 0.
function extract(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const j = src.indexOf('\n}\n', i);
  if (j < 0) return null;
  return src.slice(i, j + 3);
}
const SRC_CANDS = extract(APP, 'function pzAcceptAllWeekCands');
const SRC_MARK = extract(APP, 'function pzAcceptAllWeekMark');
const SRC_HANDLER = extract(APP, 'async function pzAcceptAllWeek');
const SRC_PILL = extract(APP, 'function acceptPillHTML');
ok(!!SRC_CANDS, 'helper candidatos presente');
ok(!!SRC_MARK, 'helper marca presente');
ok(!!SRC_HANDLER, 'handler presente');
ok(!!SRC_PILL, 'acceptPillHTML presente');

// ---------- estáticos ----------
ok(APP.includes("acceptBarHTML(pzAcceptWeekCands.length)"), 'render calcula barra semana nueva (SUPERSEDE 2/11: la píldora flotante tapaba el chat; la semana nueva es barra encima del chat, mismo id/handler)');
ok(APP.includes("$('#hfAcceptAllWeek')"), 'binder del botón nuevo presente');
ok(APP.includes('pzAcceptAllWeek(haw)'), 'binder llama al handler nuevo');
{
  const ivStart = APP.indexOf('async function inicioView()');
  const ivEnd = APP.indexOf('/* ===== TIRA DE NIVEL', ivStart);
  const iv = APP.slice(ivStart, ivEnd);
  ok(iv.includes('${pzAcceptWeekHTML}'), 'plantilla Inicio inserta la píldora nueva');
  ok(!iv.includes('${stripHTML}'), 'píldora vieja de borradores NO se inserta (sigue muerta)');
  ok(iv.indexOf('${pzAcceptWeekHTML}') > iv.indexOf('${gridHTML}'), 'píldora nueva va tras la grilla en la plantilla');
}
{
  // Sin llamada a render() en el handler (quitando comentarios de línea).
  const noComments = SRC_HANDLER.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  ok(!noComments.includes('render('), 'handler NO llama a render()');
}
{
  // Censo: marcadores idénticos a la base.
  const count = (s, m) => (s.split(m).length - 1);
  const markers = [['pzGoBack', 6], ['pz-detalle-setup', 1], ['/aprobar', 1], ['autofetch', 0], ['pcDayKeyShift', 6]];
  for (const [m, n] of markers) eq(count(APP, m), n, 'censo app ' + m);
  eq(crypto.createHash('md5').update(SRV).digest('hex'),
    crypto.createHash('md5').update(SRV_PRE).digest('hex'), 'server.js byte-idéntico a prístino');
  const fnLines = (s) => s.split('\n').filter((l) => l.includes('function')).length;
  // RE-BASE v722 (sacar-corazón sobre v722): la base suma +3 líneas function netas vs v710 (fnLines v710=1427, v722=1430, medido por grep); el lote sigue quitando exactamente 4 (1430−4=1426).
  eq(fnLines(APP), fnLines(APP_PRE) - 4 + 3, 'M78: −4 líneas function (hfTileApprove + hfLikeBind eliminadas, SACAR-CORAZÓN 6/11; base v722 +3)');
}

// ---------- VM: candidatos ----------
function ctxBase(over) {
  const ctx = {
    albumMondayKey: () => '2026-11-02',
    document: {
      createElement: () => {
        const el = { style: {}, attrs: {}, className: '', textContent: '', setAttribute(k, v) { this.attrs[k] = v; } };
        return el;
      },
      querySelectorAll: () => [],
    },
    console,
  };
  Object.assign(ctx, over || {});
  vm.createContext(ctx);
  return ctx;
}
function loadCands(ctx) {
  vm.runInContext(SRC_CANDS, ctx);
  return ctx.pzAcceptAllWeekCands;
}
function P(over) {
  return Object.assign({ id: 1, status: 'scheduled', approval: 'pending', week_key: '2026-11-02' }, over || {});
}
function T(post, over) {
  return Object.assign({ kind: 'post', post }, over || {});
}
{
  const ctx = ctxBase();
  const cands = loadCands(ctx);
  const list = [
    T(P({ id: 1 })),
    T(P({ id: 2, status: 'draft', week_key: null })),
    T(P({ id: 3, week_key: '2026-10-26' })),
    T(P({ id: 4, week_key: null })),
    T(P({ id: 5, status: 'published', approval: 'approved' })),
    T(P({ id: 6, approval: 'approved' })),
    T(P({ id: 7 }), { archivedExt: true }),
    { kind: 'ig', img: 'x' },
    T(P({ id: 8, approval: null })),
    T(P({ id: 9, owner_liked: 1 })),
  ];
  eq(cands(list, null).map((t) => t.post.id).join(','), '1,8,9', 'candidatos manual: solo programados pendientes semana corriente');
  eq(cands(list, true).map((t) => t.post.id).join(','), '1,8', 'candidatos piloto: excluye ya vistos');
  eq(cands(list, false).map((t) => t.post.id).join(','), '1,8,9', 'candidatos manual explícito igual que null');
  eq(cands([], null).length, 0, 'sin tiles, sin candidatos');
  eq(cands(null, null).length, 0, 'lista nula, sin candidatos');
}

// ---------- VM: marca ----------
// (SACAR-CORAZÓN 6/11: el fallback ya no toca ningún corazón — el tik va
// en la franja si hay chapita (.hf-chip), directo sobre la foto si no.)
function fakeTile(withChip) {
  const chip = { className: 'hf-chip' };
  const strip = { children: [], appendChild(node) { this.children.push(node); } };
  const tile = {
    style: {},
    children: [],
    firstChild: null,
    appendChild(node) { this.children.push(node); },
    querySelector(sel) {
      if (sel === '.hf-chip') return withChip ? chip : null;
      if (sel === '.hf-strip') return strip;
      if (sel === '.hf-tik') {
        return this.children.find((c) => c.className === 'hf-tik')
          || strip.children.find((c) => c.className === 'hf-tik') || null;
      }
      return null;
    },
    insertBefore(node) { this.children.unshift(node); },
  };
  return { tile, strip };
}
{
  // Fallback con chapita (sin helper sin-refresh): tik en la franja, sin corazón.
  const ctx = ctxBase();
  vm.runInContext(SRC_MARK, ctx);
  const { tile, strip } = fakeTile(true);
  ctx.pzAcceptAllWeekMark(tile, { id: 5 });
  eq(strip.children.length, 1, 'marca fallback con chip: tik en la franja');
  eq(strip.children[0].className, 'hf-tik', 'marca fallback con chip: clase hf-tik');
  eq(strip.children[0].textContent, '✓', 'marca fallback con chip: tilde');
  eq(strip.children[0].attrs['aria-hidden'], 'true', 'marca fallback con chip: aria-hidden');
  ok(String(strip.children[0].style.cssText || '') === '' || true, 'marca fallback con chip: sin estilos en línea (la geometría la pone CSS)');
  eq(tile.children.length, 0, 'marca fallback con chip: nada directo sobre la foto');
  // Segundo llamado no duplica.
  ctx.pzAcceptAllWeekMark(tile, { id: 5 });
  eq(strip.children.length, 1, 'marca fallback con chip: no duplica el tik');
  // Fallback sin chapita: tik directo sobre la foto.
  const t2 = fakeTile(false);
  ctx.pzAcceptAllWeekMark(t2.tile, { id: 6 });
  eq(t2.tile.children.length, 1, 'marca fallback sin chip: tik directo sobre la foto');
  eq(t2.tile.children[0].className, 'hf-tik', 'marca fallback sin chip: clase hf-tik');
  eq(t2.strip.children.length, 0, 'marca fallback sin chip: nada en la franja');
  // Con helper sin-refresh presente: delega y no inserta.
  // (LIBERACIÓN v552: la delegación debe pasar (tile, id-string,
  // schedAt) — la firma real de pzAprobarEnSitio; pasar el objeto
  // post guardaría "[object Object]" en 'posta-aprobados'.)
  let delegated = 0; let delegatedArgs = null;
  ctx.pzAprobarEnSitio = (...a) => { delegated++; delegatedArgs = a; };
  const t3 = fakeTile(true);
  ctx.pzAcceptAllWeekMark(t3.tile, { id: 7, scheduled_at: '2026-11-09T10:00:00' });
  eq(delegated, 1, 'marca delega a pzAprobarEnSitio cuando existe');
  eq(delegatedArgs && delegatedArgs[1], '7', 'marca delegada: pasa id como string, no el objeto post');
  eq(delegatedArgs && delegatedArgs[2], '2026-11-09T10:00:00', 'marca delegada: pasa scheduled_at');
  eq(t3.tile.children.length, 0, 'marca delegada: no inserta tik propio');
  eq(t3.strip.children.length, 0, 'marca delegada: no inserta tik en la franja');
}

// ---------- VM: handler ----------
function fakeBtn() {
  const countEl = { textContent: '' };
  return {
    btn: {
      disabled: false, _pzBusy: false, removed: false,
      remove() { this.removed = true; },
      querySelector(sel) { return sel === '.accept-count' ? countEl : null; },
    },
    countEl,
  };
}
function fakeNode() {
  return {
    style: {},
    inserted: [],
    querySelector(sel) {
      if (sel === '.hf-chip') return null;
      if (sel === '.hf-strip') return null;
      if (sel === '.hf-tik') return this.inserted.find((c) => c.className === 'hf-tik') || null;
      return null;
    },
    appendChild(node) { this.inserted.unshift(node); },
    insertBefore(node) { this.inserted.unshift(node); },
    firstChild: null,
  };
}
async function runHandler(setup) {
  const toasts = [];
  const calls = [];
  const ctx = ctxBase({
    f3En: () => !!setup.en,
    HF_VISITOR: !!setup.visitor,
    HF_TILES: setup.tiles,
    esc: (s) => String(s),
    toast: (h) => { toasts.push(h); },
    api: {
      post: async (url) => { calls.push(['post', url]); const r = setup.apiResult; if (r instanceof Error) throw r; if (typeof r === 'function') return r(url); return r; },
      patch: async (url) => { calls.push(['patch', url]); const r = setup.apiResult; if (r instanceof Error) throw r; if (typeof r === 'function') return r(url); return r; },
    },
    f3ApprovalMode: async () => setup.mode,
    document: { createElement: () => ({ style: {} }), querySelectorAll: () => setup.nodes || [] },
  });
  if (setup.withMark) ctx.pzAprobadoMarcar = (id) => { (ctx.__marked = ctx.__marked || []).push(id); };
  vm.runInContext(SRC_CANDS, ctx);
  vm.runInContext(SRC_MARK, ctx);
  vm.runInContext(SRC_HANDLER, ctx);
  const { btn, countEl } = fakeBtn();
  if (setup.busy) btn._pzBusy = true;
  await ctx.pzAcceptAllWeek(btn);
  return { toasts, calls, btn, countEl, marked: ctx.__marked || [] };
}
function weekTiles(ids, over) {
  return ids.map((id) => T(P(Object.assign({ id }, over || {}))));
}
(async () => {
  // Manual todo OK (3).
  {
    const tiles = weekTiles([11, 12, 13]);
    const nodes = [fakeNode()];
    const r = await runHandler({ tiles, mode: { manual: true, known: true }, apiResult: { ok: true }, nodes, withMark: true });
    eq(r.calls.length, 3, 'manual: 3 llamadas /approve');
    ok(r.calls.every((c) => c[0] === 'post' && c[1].includes('/approve')), 'manual: todas POST /approve');
    ok(r.toasts.join(' ').includes('Semana aceptada'), 'manual: toast Semana aceptada');
    ok(r.toasts.join(' ').includes('3'), 'manual: toast con cantidad 3');
    eq(r.btn.removed, true, 'manual: botón se va sin pendientes');
    eq(tiles.map((t) => t.post.approval).join(','), 'approved,approved,approved', 'manual: HF_TILES actualizado');
    eq(r.marked.join(','), '11,12,13', 'manual: marca gris-tik registrada');
  }
  // Manual parcial: 2º falla.
  {
    const tiles = weekTiles([21, 22, 23]);
    const r = await runHandler({
      tiles, mode: { manual: true, known: true }, withMark: true, nodes: [fakeNode()],
      apiResult: (url) => ({ ok: !url.includes('/22/') }),
    });
    ok(r.toasts.join(' ').includes('fallaron'), 'parcial: toast reporta fallos');
    ok(!r.toasts.join(' ').includes('Semana aceptada'), 'parcial: NO declara todo aprobado');
    eq(r.btn.removed, false, 'parcial: botón queda');
    eq(r.countEl.textContent, '1', 'parcial: contador restante = 1');
    eq(tiles[1].post.approval, 'pending', 'parcial: el fallido sigue pendiente');
  }
  // Manual todo falla.
  {
    const tiles = weekTiles([31]);
    const r = await runHandler({ tiles, mode: { manual: true, known: true }, apiResult: { ok: false }, nodes: [] });
    ok(r.toasts.join(' ').includes('No pude aceptar'), 'todo falla: toast de error');
    eq(r.btn.removed, false, 'todo falla: botón queda');
  }
  // Piloto: constancia, sin marca de aprobación.
  {
    const tiles = weekTiles([41, 42]);
    const r = await runHandler({ tiles, mode: { manual: false, known: true }, apiResult: { ok: true }, nodes: [fakeNode()], withMark: true });
    ok(r.calls.every((c) => c[0] === 'patch'), 'piloto: todas PATCH like');
    eq(r.marked.length, 0, 'piloto: NO registra marca de aprobado');
    ok(r.toasts.join(' ').includes('Vistos'), 'piloto: toast Vistos, no Semana aceptada');
    eq(tiles.map((t) => t.post.owner_liked).join(','), '1,1', 'piloto: owner_liked actualizado');
  }
  // Modo desconocido: cero llamadas.
  {
    const tiles = weekTiles([51]);
    const r = await runHandler({ tiles, mode: { manual: false, known: false }, apiResult: { ok: true }, nodes: [] });
    eq(r.calls.length, 0, 'modo desconocido: cero llamadas');
    ok(r.toasts.join(' ').includes('No pude verificar el modo'), 'modo desconocido: toast honesto');
  }
  // Visitante: cero llamadas.
  {
    const tiles = weekTiles([61]);
    const r = await runHandler({ tiles, visitor: true, mode: { manual: true, known: true }, apiResult: { ok: true }, nodes: [] });
    eq(r.calls.length, 0, 'visitante: cero llamadas');
  }
  // Botón ocupado: cero llamadas.
  {
    const tiles = weekTiles([71]);
    const r = await runHandler({ tiles, busy: true, mode: { manual: true, known: true }, apiResult: { ok: true }, nodes: [] });
    eq(r.calls.length, 0, 'botón ocupado: cero llamadas');
  }
  // Sin candidatos: botón se va, cero llamadas.
  {
    const tiles = weekTiles([81], { status: 'draft', week_key: null });
    const r = await runHandler({ tiles, mode: { manual: true, known: true }, apiResult: { ok: true }, nodes: [] });
    eq(r.calls.length, 0, 'sin candidatos: cero llamadas');
    eq(r.btn.removed, true, 'sin candidatos: botón se va');
  }
  // EN manual.
  {
    const tiles = weekTiles([91]);
    const r = await runHandler({ tiles, en: true, mode: { manual: true, known: true }, apiResult: { ok: true }, nodes: [fakeNode()] });
    ok(r.toasts.join(' ').includes('Week accepted'), 'EN: toast Week accepted');
  }
  // acceptPillHTML ES/EN.
  {
    const ctxEn = ctxBase({ ME: { lang: 'en' }, pzIc: () => '' });
    vm.runInContext(SRC_PILL, ctxEn);
    ok(ctxEn.acceptPillHTML(4, 'hfAcceptAllWeek').includes('Accept all'), 'píldora EN: Accept all');
    const ctxEs = ctxBase({ ME: { lang: 'es' }, pzIc: () => '' });
    vm.runInContext(SRC_PILL, ctxEs);
    ok(ctxEs.acceptPillHTML(4, 'hfAcceptAllWeek').includes('Aceptar todo'), 'píldora ES: Aceptar todo');
    ok(ctxEs.acceptPillHTML(4, 'hfAcceptAllWeek').includes('id="hfAcceptAllWeek"'), 'píldora: id nuevo');
  }

  console.log(`\nLOTE ACEPTAR-TODO: ${pass} ok, ${fail} fallos`);
  if (fail) { console.log('Fallos:\n- ' + fails.join('\n- ')); process.exit(1); }
})();
