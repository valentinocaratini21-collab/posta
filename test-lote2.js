/* LOTE 2 — checks: doble toque/corazón + MORA-7 + semana dos idiomas.
   Uso: node test-lote2.js (desde la raíz del árbol). Sin dependencias. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }
function count(s, sub) { return s.split(sub).length - 1; }

const app = read('public/app.js');
const srv = read('server.js');
const idx = read('public/index.html');
const enidx = read('public/en/index.html');
const ana = read('public/chunk-analisis.js');
const aju = read('public/chunk-ajustes.js');
const wb = read('week-bilingual.js');

console.log('== ÍTEM 1: doble toque/corazón ==');
check('hfTileApprove definida 1 vez', count(app, 'async function hfTileApprove(') === 1);
check('hfDblReset definida 1 vez', count(app, 'function hfDblReset(') === 1);
check('ventana 300ms en handler', app.includes('dblNow - HF_DBL.t < 300'));
check('doble toque: burst + approve, sin navegar', app.includes('f3HeartBurst(tile)') && app.includes('hfTileApprove(tile, t.post)'));
check('timer navega al detalle', app.includes('hfDetailOpen(pend.post, pend.tile)'));
check('guardia hash sin cambio', app.includes('location.hash === pend.hash'));
check('corazón en fila programado', app.includes('id="apvAccept"') && count(app, 'class="btn btn-soft apv-like"') === 2);
check('binding corazón por clase', app.includes("querySelectorAll('.apv-like')"));
check('icono corazón pzIc heart', app.includes("pzIc('heart', 18)"));
check('M78: nuevas fns definidas 1 vez', count(app, 'async function hfTileApprove(') === 1 && count(app, 'function hfDblReset(') === 1);
console.log('== Lote 1 intacto ==');
check('tab jardin', app.includes("tabBtn('jardin', '#/app/jardin-posty'"));
check('sin tab semana', !app.includes("tabBtn('semana'"));
check('flecha atrás', app.includes('function pzGoBack('));
check('menú posteo', app.includes('function apvMoreHTML('));
check('próximo análisis', ana.includes('anaProximoAnalisisHTML'));
check('ajustes sin Meta App ID', !aju.includes('Meta App ID'));
console.log('== Velocidad intacta ==');
check('esqueleto', app.includes('pzPaintSkeleton'));
check('caché GET', app.includes('pzCacheGet'));
check('precarga idle', app.includes('pzPrefetchKick'));

console.log('== ÍTEM 2: MORA-7 ==');
const MORA7 = " Screens, tablets and phones in the scene show a BLANK screen or abstract color blocks — never a lone symbol, letter or glyph (#, @, stray letters) as screen content.";
check('frase MORA-7 en server.js 1 vez', count(srv, MORA7.trim()) === 1);
check('comentario MORA-7 1 vez', count(srv, 'MORA-7, 2026-10-25, id real 547') === 1);
check('frase dentro del estándar v231', srv.indexOf('const PROMPT_SCENE_STANDARD') < srv.indexOf(MORA7.trim()) && srv.indexOf(MORA7.trim()) < srv.indexOf('function rubroAvoidFor'));
check('assembleImagePrompt usa el estándar', srv.includes('parts.push(PROMPT_SCENE_STANDARD + rubroAvoidFor(category))'));

console.log('== ÍTEM 3: dos idiomas ==');
check('traductor definido 1 vez', count(srv, 'function bilingualTranslateFnFor(') === 1);
check('traductor usa prompt fiel', srv.includes('weekBilingual.FAITHFUL_TRANSLATION_PROMPT'));
check('hook en generateWeekDrafts', srv.includes('bilingualizeWeek(db, uid, bRows, bFn)'));
check('hook tras piloto automático', srv.indexOf('piloto automático:') < srv.indexOf('bilingualizeWeek(db, uid, bRows, bFn)'));
check('hook solo piezas sin EN previo', srv.includes('bilingual_status IS NULL'));
check('módulo: sin opt-in no escribe', wb.includes("if (!isBilingualWeekEnabled(db, uid)) return { ok: true, skipped: 'disabled'"));
check('BUILD v504', srv.includes("BUILD_ID = '20261031-v506'"));
check('index raíz app.js?v=330; en/index estática sin app.js', idx.includes('app.js?v=330') && !enidx.includes('app.js?v='));
check('styles ?v= 20261050', idx.includes('styles.css?v=20261051') && enidx.includes('styles.css?v=20261051'));
console.log('== Censo (sin cambios que explicar) ==');
const c = (s, m) => (s.match(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
check('server.js 3/16/3/15', c(srv, 'catsMatch') === 3 && c(srv, 'week-redo') === 16 && c(srv, 'first_week') === 3 && c(srv, '/aprobar') === 15,
  `cats=${c(srv, 'catsMatch')} redo=${c(srv, 'week-redo')} fw=${c(srv, 'first_week')} ap=${c(srv, '/aprobar')}`);
check('app.js 0/0/4/1', c(app, 'catsMatch') === 0 && c(app, 'week-redo') === 0 && c(app, 'first_week') === 4 && c(app, '/aprobar') === 1);
check('autofetch 0', c(srv, 'autofetch') === 0 && c(app, 'autofetch') === 0);

async function main() {
  console.log('== FUNCIONALES (vm) ==');
  // --- hfTileApprove: ruteo por estado ---
  try {
    const sandbox = vm.createContext({ console });
    function extractAsync(src, name) {
      const i = src.indexOf('async function ' + name + '(');
      if (i < 0) throw new Error('no fn ' + name);
      let j = src.indexOf('{', i), d = 0;
      for (let k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
      }
      throw new Error('sin cierre ' + name);
    }
    const calls = { patch: [], post: [], pcApprove: [], toast: [], render: 0, track: [] };
    const stub = `
      var PROFILE = { ig_connected: true };
      function esc(s){ return String(s); }
      function toast(m){ globalThis.__calls.toast.push(m); }
      function track(n, o){ globalThis.__calls.track.push(n); }
      function render(){ globalThis.__calls.render++; }
      async function f3ApprovalMode(){ return { manual: globalThis.__manual }; }
      function f3En(){ return false; }
      async function pcApprove(id, tile, btn){ globalThis.__calls.pcApprove.push(id); }
      var api = {
        patch: async (u, b) => { globalThis.__calls.patch.push([u, b]); return { scheduled_at: b && b.scheduled_at }; },
        post: async (u, b) => { globalThis.__calls.post.push([u, b]); return {}; },
      };
    `;
    vm.runInContext(stub, sandbox);
    sandbox.__calls = calls;
    vm.runInContext(extractAsync(app, 'hfTileApprove').replace('async function hfTileApprove', 'globalThis.hfTileApprove = async function'), sandbox);
    const tile = (st, sched) => ({ dataset: { postId: '7', status: st, schedAt: sched || '' } });
    const reset = () => { calls.patch = []; calls.post = []; calls.pcApprove = []; calls.toast = []; calls.render = 0; calls.track = []; };
    // 1. borrador + manual + IG -> PATCH + signal + render, sin pcApprove
    sandbox.__manual = true; sandbox.PROFILE = { ig_connected: true }; reset();
    await sandbox.hfTileApprove(tile('draft', '2026-11-02T21:00:00Z'), { id: '7', status: 'draft', scheduled_at: '2026-11-02T21:00:00Z' });
    check('borrador: PATCH + signal + render', calls.patch.length === 1 && calls.patch[0][0] === '/api/posts/7' && calls.post.length === 1 && calls.post[0][1].signal === 'approved' && calls.render === 1 && calls.pcApprove.length === 0, JSON.stringify(calls));
    // 2. programado + manual -> pcApprove + render, sin PATCH
    reset();
    await sandbox.hfTileApprove(tile('scheduled'), { id: '7', status: 'scheduled' });
    check('programado: pcApprove + render', calls.pcApprove.length === 1 && calls.pcApprove[0] === '7' && calls.render === 1 && calls.patch.length === 0, JSON.stringify(calls));
    // 3. publicado -> nada
    reset();
    await sandbox.hfTileApprove(tile('published'), { id: '7', status: 'published' });
    check('publicado: sin llamadas', calls.patch.length === 0 && calls.post.length === 0 && calls.pcApprove.length === 0 && calls.render === 0, JSON.stringify(calls));
    // 4. borrador + autopilot -> nada (corazón afectivo)
    sandbox.__manual = false; reset();
    await sandbox.hfTileApprove(tile('draft', '2026-11-02T21:00:00Z'), { id: '7', status: 'draft' });
    check('autopilot: sin cambios', calls.patch.length === 0 && calls.post.length === 0 && calls.pcApprove.length === 0, JSON.stringify(calls));
    // 5. borrador sin IG -> nada, aviso Instagram
    sandbox.__manual = true; sandbox.PROFILE = { ig_connected: false }; reset();
    await sandbox.hfTileApprove(tile('draft', '2026-11-02T21:00:00Z'), { id: '7', status: 'draft' });
    check('sin IG: sin PATCH + aviso', calls.patch.length === 0 && calls.toast.some((t) => String(t).includes('Instagram')), JSON.stringify(calls));
  } catch (e) { check('hfTileApprove vm', false, String((e && e.stack) || e).slice(0, 300)); }

  // --- bilingualizeWeek con db falsa ---
  try {
    const wbl = require('./week-bilingual');
    function fakeDb(enabled) {
      const writes = [];
      return { writes, prepare: (sql) => ({
        get: () => ({ bilingual_week: enabled ? 1 : 0 }),
        run: (...args) => { writes.push({ sql, args }); return {}; },
        all: () => [],
      }) };
    }
    const rows = [{ id: 11, caption: 'Promo 2x1 hoy en tu peluquería', headline: 'Promo 2x1', idea: 'promo', text_band: '', cta_button_drawn: false }];
    // 1. opt-in + traductor fiel -> EN escrito, ready
    let db1 = fakeDb(true);
    let r1 = await wbl.bilingualizeWeek(db1, 1, rows, async () => ({ caption: '2x1 promo today at your barbershop', headline: '2x1 promo' }));
    const enWrite = db1.writes.find((w) => w.sql.includes('caption_en'));
    check('bilingüe fiel: EN escrito ready', r1.done === 1 && !!enWrite && enWrite.args[2] === 'ready', JSON.stringify(r1) + ' ' + JSON.stringify(db1.writes));
    // 2. opt-in + traductor que agrega un hecho -> bloqueado, sin EN
    let db2 = fakeDb(true);
    let r2 = await wbl.bilingualizeWeek(db2, 1, rows, async () => ({ caption: '2x1 promo today only $99 at your barbershop', headline: '2x1 promo' }));
    check('bilingüe con hecho nuevo: bloqueado sin EN', r2.blocked === 1 && !db2.writes.some((w) => w.sql.includes('caption_en')), JSON.stringify(r2));
    // 3. opt-in apagado -> traductor nunca llamado, nada escrito
    let db3 = fakeDb(false); let called = 0;
    let r3 = await wbl.bilingualizeWeek(db3, 1, rows, async () => { called++; return { caption: 'x', headline: 'y' }; });
    check('opt-in apagado: sin llamadas ni escrituras', r3.skipped === 'disabled' && called === 0 && db3.writes.length === 0, JSON.stringify(r3));
  } catch (e) { check('bilingualizeWeek vm', false, String((e && e.stack) || e).slice(0, 300)); }

  console.log(`\nLOTE2: ${ok} OK, ${fail} FAIL${fails.length ? ' :: ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
