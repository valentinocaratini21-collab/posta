// test-lotecorazonmarca.js — LOTE CORAZÓN-MARCA (reporte Valentino 2/11 ~05:10)
// Tocar el corazón de una pendiente podía terminar sin ninguna marca
// visible: (1) borrador sin fecha -> PATCH ok con warning 'sin_dia_libre'
// deja el posteo en draft, pero el cliente igual decía "¡Listo! Quedó
// programado" y la tile quedaba idéntica; (2) publicado / modo desconocido
// / tile sin entrada en HF_TILES -> retorno mudo (solo el burst 0.92s);
// (3) el corazón NUNCA quedaba lleno tras aprobar.
// Fix: corazón lleno persistente (data-hf-on="1" + CSS celeste) en
// programados/publicados; cada toque termina en un mensaje con el motivo
// real; el warning del servidor se dice con honestidad.
// Uso: node test-lotecorazonmarca.js [dir]  (dir = raíz del árbol; default: __dirname)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

console.log('— 1. Estáticas: fix presente —');
ok(app.includes('LOTE CORAZÓN-MARCA'), 'marca del lote en app.js');
ok(css.includes('LOTE CORAZÓN-MARCA'), 'marca del lote en styles.css');
ok(app.includes("const hfLikeOn = String(p.status) === 'scheduled' || String(p.status) === 'published'"), 'regla lleno: scheduled o published');
ok(app.includes('data-hf-on="1"') && app.includes('aria-pressed='), 'botón lleva data-hf-on + aria-pressed');
ok(css.includes('.hf-like[data-hf-on="1"] svg{fill:#2793C8;stroke:#2793C8}'), 'CSS: corazón lleno celeste Posty');
ok(app.includes("res.warning === 'sin_dia_libre'") && app.includes('no hay día libre en la semana'), 'rama sin_dia_libre con motivo real');
ok(app.includes('mode.known === false') && app.includes('No pude verificar el modo'), 'modo desconocido avisa, no adivina');
ok(app.includes('F3_APPR_MODE = null; return { manual: false, known: false }'), 'fallo de modo no se cachea (próximo toque reintenta)');
ok(app.includes('hfTileApprove(tile, { id: tile.dataset.postId'), 'fallback sin HF_TILES usa los datos de la tile');
ok(app.includes("toast('❤️ ' + (en ? 'Seen' : 'Visto'))"), 'no-manual programado responde Visto');
ok(app.includes("toast('❤️ ' + (en ? 'On autopilot, Posty publishes on its own' : 'En piloto automático, Posty publica solo'))"), 'no-manual borrador responde autopiloto');
ok(app.includes("toast('✅ ' + (en ? 'Already published on Instagram' : 'Ya salió en Instagram'))"), 'publicado responde Ya salió');
// La rama warning vuelve ANTES del "¡Listo!": el orden en el fuente lo garantiza.
{
  const fn = app.slice(app.indexOf('async function hfTileApprove('));
  const iWarn = fn.indexOf("res.warning === 'sin_dia_libre'");
  const iListo = fn.indexOf('✅ <b>¡Listo!</b> Quedó programado');
  const between = fn.slice(iWarn, iListo);
  ok(iWarn >= 0 && iListo > iWarn && between.includes('return;'), 'warning retorna antes del ¡Listo! (nunca miente)');
}

console.log('— 2. Intacto: un solo botón, literales viejos, censo —');
ok(cnt(app, '<button type="button" class="hf-like hf-like-in"') === 1, 'un único botón corazón (detalle NO lo recupera)');
ok(app.includes('${chip}${archChip}${likeInStrip ? likeBtn : \'\'}') && app.includes('${despChip}${talkBtn}${likeInStrip ? \'\' : likeBtn}'), 'botón: en franja con chapita, hijo directo sin chapita (CORAZÓN-EN-LÍNEA 2/11; HABLAR 2/11: el botón 💬 precede al corazón, la regla no cambia)');
ok(app.includes('class="hf-like hf-like-in"'), 'clase literal intacta (lote10)');
ok(css.includes('.hf-tile.hf-has-chip > .hf-strip .hf-like-in{position:static'), 'corazón EN franja solo con chapita (CORAZÓN-EN-LÍNEA 2/11, Valentino)');
ok(/\.hf-tile\s*>\s*\.hf-like-in\{[^}]*bottom:38px/.test(css), 'posición bottom:38px (CORAZÓN-ABAJO 1/11, supersede con causa: decisión Valentino mueve el corazón abajo a la derecha)');
ok(app.includes("closest('[data-hf-like]')") && /HF_DBL/.test(app) && /300/.test(app), 'doble toque 300 ms intacto');
ok(cnt(srv, 'catsMatch') === 3 && cnt(srv, 'week-redo') === 16 && cnt(srv, 'first_week') === 3 && cnt(srv, '/' + 'aprobar') === 16, 'censo server 3/16/3/16');
ok(cnt(app, 'pzGoBack') === 4 && cnt(app, 'pz-detalle-setup') === 1 && cnt(app, '/' + 'aprobar') === 1 && cnt(app, 'autofetch') === 0 && cnt(app, 'pcDayKeyShift') === 7, 'censo app 4/1/1/0/7');
ok(!srv.includes('LOTE CORAZÓN-MARCA'), 'server.js sin tocar');

console.log('— 3. Render homeTileHTML real (vm): lleno persistente por estado —');
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
{
  const sb = { console, ME: { lang: 'es' }, Intl, Date, Map, Set };
  sb.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  sb.pzIc = (name) => `<i data-ic="${name}"></i>`;
  sb.hfCoverState = () => ({ has: false });
  sb.slotHour = () => 19;
  vm.createContext(sb);
  for (const n of ['pcDayKeyShift', 'hfWhenChip', 'hfPlanChip', 'hfTileChipParts', 'homeTileHTML']) {
    const code = extractFn(app, n);
    ok(code.length > 0, 'existe ' + n);
    if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
  for (const n of ['HOME_PIN_SVG', 'HOME_REEL_SVG', 'HOME_CAR_SVG']) {
    const a = app.indexOf('const ' + n + ' =');
    if (a >= 0) { const b = app.indexOf(';', a); vm.runInContext(app.slice(a, b + 1).replace('const ' + n + ' =', 'globalThis.' + n + ' ='), sb); }
  }
  const render = (o, i) => vm.runInContext(`homeTileHTML(${JSON.stringify(o)}, ${i || 0})`, sb);
  const tProg = render({ kind: 'post', post: { id: 201, status: 'scheduled', scheduled_at: '2026-11-05T19:00:00Z', media_type: 'image', caption: 'promo' } });
  ok(tProg.includes('data-hf-on="1"') && tProg.includes('aria-pressed="true"'), 'programada: corazón lleno', tProg.slice(tProg.indexOf('hf-like') - 40, tProg.indexOf('hf-like') + 120));
  const tDraft = render({ kind: 'post', post: { id: 202, status: 'draft', media_type: 'image', caption: 'pendiente' } });
  ok(!tDraft.includes('data-hf-on=') && tDraft.includes('aria-pressed="false"'), 'borrador: corazón vacío');
  const tPub = render({ kind: 'post', post: { id: 203, status: 'published', media_type: 'image', caption: 'viejo' } });
  ok(tPub.includes('data-hf-on="1"'), 'publicada: corazón lleno');
  const tCanc = render({ kind: 'post', post: { id: 204, status: 'cancelled', media_type: 'image', caption: 'frenado' } });
  ok(!tCanc.includes('data-hf-on='), 'cancelada: corazón vacío');
}

console.log('— 4. hfTileApprove real (vm): ningún toque mudo, warning honesto —');
async function main4() {
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
  const sandbox = vm.createContext({ console });
  const calls = { patch: [], post: [], pcApprove: [], toast: [], render: 0, track: [] };
  const stub = `
    var PROFILE = { ig_connected: true };
    function esc(s){ return String(s); }
    function toast(m){ globalThis.__calls.toast.push(m); }
    function track(n, o){ globalThis.__calls.track.push(n); }
    function render(){ globalThis.__calls.render++; }
    async function f3ApprovalMode(){ return globalThis.__mode; }
    function f3En(){ return false; }
    async function pcApprove(id, tile, btn){ globalThis.__calls.pcApprove.push(id); }
    var api = {
      patch: async (u, b) => { globalThis.__calls.patch.push([u, b]); return globalThis.__patchRes; },
      post: async (u, b) => { globalThis.__calls.post.push([u, b]); return {}; },
    };
  `;
  vm.runInContext(stub, sandbox);
  sandbox.__calls = calls;
  vm.runInContext(extractAsync(app, 'hfTileApprove').replace('async function hfTileApprove', 'globalThis.hfTileApprove = async function'), sandbox);
  const tile = (st, sched) => ({ dataset: { postId: '7', status: st, schedAt: sched || '' } });
  const reset = () => { calls.patch = []; calls.post = []; calls.pcApprove = []; calls.toast = []; calls.render = 0; calls.track = []; };
  // 1. borrador sin día libre -> motivo real, SIN signal, SIN "¡Listo!"
  sandbox.__mode = { manual: true, known: true }; sandbox.__patchRes = { ok: true, warning: 'sin_dia_libre' }; reset();
  await sandbox.hfTileApprove(tile('draft'), { id: '7', status: 'draft' });
  ok(calls.patch.length === 1 && calls.post.length === 0 && calls.render === 1, 'sin_dia_libre: PATCH + render, sin signal', JSON.stringify(calls));
  ok(calls.toast.some((t) => String(t).includes('día libre')) && !calls.toast.some((t) => String(t).includes('Quedó programado')), 'sin_dia_libre: dice el motivo, nunca ¡Listo!', JSON.stringify(calls.toast));
  // 2. borrador ok -> signal + ¡Listo! (camino vigente intacto)
  sandbox.__patchRes = { ok: true, scheduled_at: '2026-11-05T19:00:00Z' }; reset();
  await sandbox.hfTileApprove(tile('draft', '2026-11-05T19:00:00Z'), { id: '7', status: 'draft', scheduled_at: '2026-11-05T19:00:00Z' });
  ok(calls.post.length === 1 && calls.post[0][1].signal === 'approved' && calls.render === 1 && calls.toast.some((t) => String(t).includes('Quedó programado')), 'borrador ok: signal + ¡Listo! + render', JSON.stringify(calls));
  // 3. publicado -> mensaje, sin llamadas
  reset();
  await sandbox.hfTileApprove(tile('published'), { id: '7', status: 'published' });
  ok(calls.patch.length === 0 && calls.post.length === 0 && calls.render === 0 && calls.toast.some((t) => String(t).includes('Ya salió')), 'publicado: mensaje Ya salió, sin llamadas', JSON.stringify(calls.toast));
  // 4. borrador + autopilot conocido -> mensaje, sin cambios
  sandbox.__mode = { manual: false, known: true }; reset();
  await sandbox.hfTileApprove(tile('draft', '2026-11-05T19:00:00Z'), { id: '7', status: 'draft' });
  ok(calls.patch.length === 0 && calls.post.length === 0 && calls.toast.length === 1, 'autopilot borrador: responde, sin cambios', JSON.stringify(calls.toast));
  // 5. modo desconocido -> aviso, sin aprobar
  sandbox.__mode = { manual: false, known: false }; reset();
  await sandbox.hfTileApprove(tile('draft', '2026-11-05T19:00:00Z'), { id: '7', status: 'draft' });
  ok(calls.patch.length === 0 && calls.toast.some((t) => String(t).includes('verificar el modo')), 'modo desconocido: avisa y no aprueba', JSON.stringify(calls.toast));
  // 6. programado + manual -> pcApprove + render (intacto)
  sandbox.__mode = { manual: true, known: true }; reset();
  await sandbox.hfTileApprove(tile('scheduled'), { id: '7', status: 'scheduled' });
  ok(calls.pcApprove.length === 1 && calls.render === 1 && calls.patch.length === 0, 'programado: pcApprove + render', JSON.stringify(calls));
  // 7. borrador sin IG -> sin PATCH + aviso (intacto)
  sandbox.PROFILE = { ig_connected: false }; reset();
  await sandbox.hfTileApprove(tile('draft', '2026-11-05T19:00:00Z'), { id: '7', status: 'draft' });
  ok(calls.patch.length === 0 && calls.toast.some((t) => String(t).includes('Instagram')), 'sin IG: sin PATCH + aviso', JSON.stringify(calls.toast));
}
main4().then(() => {
  console.log(`\nTOTAL: ${pass} ok, ${fail} fallos`);
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.log('✗ ERROR vm:', (e && e.stack) || e); process.exit(1); });
