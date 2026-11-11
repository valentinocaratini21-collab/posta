#!/usr/bin/env node
// Suite del lote BOTONES-INICIO v914.
// Re-pineada por el preparador: base v913 (3e153c3f; app.js 31492, styles 6226), D3 31525/6229.
// Re-base 3: HEAD v905 -> v912 -> v913 mientras se trabajaba.
// A: estática (tres botones solo en el héroe, cableado, CSS, sin Rechazar/Rehacer)
// B: render real de pzHoyCardHTML (extraída y evaluada en vm con stubs)
// C: comportamiento de pzHoyEliminar (confirm + DELETE)
// D: estampado · E: resto intacto · M78: funciones auditadas
// Corre desde la raíz del scratch: node test-lote-botones-inicio.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const S = __dirname;
const REL = path.join(S, 'release');
const BASE = path.join(S, 'base-v913');
const read = (p) => fs.readFileSync(p, 'utf8');
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const nlines = (p) => { const t = read(p); return t.split('\n').length - (t.endsWith('\n') ? 1 : 0); };
const occ = (txt, re) => (txt.match(re) || []).length;

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

const jsB = read(path.join(BASE, 'public/app.js'));
const jsR = read(path.join(REL, 'public/app.js'));
const cssB = read(path.join(BASE, 'public/styles.css'));
const cssR = read(path.join(REL, 'public/styles.css'));
const srvR = read(path.join(REL, 'server.js'));
const idxR = read(path.join(REL, 'public/index.html'));
const idxEnR = read(path.join(REL, 'public/en/index.html'));

// ---------- A. Estática ----------
t('A1: .pz-hoy-tres ×1 en app.js (solo el héroe) y ×0 en base',
  occ(jsR, /pz-hoy-tres/g) === 1 && occ(jsB, /pz-hoy-tres/g) === 0);
t('A2: data-pz-hoy-frenar ×1 y data-pz-hoy-eliminar ×1 en app.js (render + bind cuentan aparte)',
  jsR.includes('data-pz-hoy-frenar="${esc(String(p.id))}"') &&
  jsR.includes('data-pz-hoy-eliminar="${esc(String(p.id))}"'));
t('A3: Editar reusa data-pz-hoy-cambiar (cero handler nuevo para Editar)',
  jsR.includes('data-pz-hoy-cambiar="${esc(String(p.id))}">${pzIc(\'pencil\', 16)}'));
t('A4: pzHoyBind cablea frenar y eliminar (querySelectorAll ×1 cada uno)',
  occ(jsR, /querySelectorAll\('\[data-pz-hoy-frenar\]'\)/g) === 1 &&
  occ(jsR, /querySelectorAll\('\[data-pz-hoy-eliminar\]'\)/g) === 1);
t('A5: pzHoyEliminar definida ×1 (confirm + api.del + render)',
  occ(jsR, /async function pzHoyEliminar\(id, btn\)/g) === 1 &&
  jsR.includes("window.confirm(en ? 'Delete this post permanently?'") &&
  jsR.includes("await api.del('/api/posts/' + encodeURIComponent(id));"));
t('A6: Frenar solo si scheduled, Eliminar solo si no published',
  jsR.includes("(st === 'scheduled' ? `<button type=\"button\" class=\"btn btn-ghost\" data-pz-hoy-frenar=") &&
  jsR.includes("(st !== 'published' ? `<button type=\"button\" class=\"btn btn-ghost\" data-pz-hoy-eliminar="));
t('A7: Rechazar y Rehacer NO aparecen en el héroe (ni en el bloque tres)',
  !/pz-hoy-tres[\s\S]{0,1200}(Rechazar|Rehacer|apvReject|apvRedo)/.test(jsR.slice(jsR.indexOf('const tres ='))));
t('A8: comentario de trazabilidad BOTONES-INICIO v914 ×3 en app.js (héroe, eliminar, bind)',
  occ(jsR, /BOTONES-INICIO v914/g) === 3);
t('A9: CSS .pz-hoy-tres ×1 + .pz-hoy-tres .btn ×1 en styles.css, ×0 en base',
  occ(cssR, /\.pz-hoy-tres\{display:flex;gap:8px;margin:2px 2px 13px\}/g) === 1 &&
  occ(cssR, /\.pz-hoy-tres \.btn\{flex:1;padding:10px 6px\}/g) === 1 &&
  occ(cssB, /pz-hoy-tres/g) === 0);

// ---------- B. Render real (vm) ----------
function extractFn(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('no start: ' + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('no end: ' + endMarker);
  return src.slice(a, b);
}
const escFn = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const sandbox = {
  esc: escFn,
  mv: (x) => x,
  pzIc: (n) => `<i data-ic="${n}"></i>`,
  pzHoyPillSalida: () => '', pzHoyCuandoCorto: () => '', pzHoyCuentaSaleTxt: () => '',
  console,
};
vm.createContext(sandbox);
const cardSrc = extractFn(jsR, 'function pzHoyCardHTML(p, o) {', '// (LOTE A · ítem 2)');
vm.runInContext(cardSrc, sandbox);
const pzHoyCardHTML = vm.runInContext('pzHoyCardHTML', sandbox);
const post = (over) => Object.assign({ id: 42, status: 'scheduled', approval: 'pending', media_type: 'image', image_path: '/media/x.jpg', caption: 'Tesora que todos piden', scheduled_at: '2026-11-11T19:00:00-05:00' }, over);

const hSched = pzHoyCardHTML(post({}), { hero: true, en: false });
t('B1: héroe programado rinde los tres botones con su id',
  hSched.includes('data-pz-hoy-cambiar="42"') && hSched.includes('data-pz-hoy-frenar="42"') && hSched.includes('data-pz-hoy-eliminar="42"') &&
  hSched.includes('>Editar<') === false && hSched.includes('Editar') && hSched.includes('Frenar') && hSched.includes('Eliminar'));
t('B2: los tres botones van DESPUÉS del caption y ANTES de «Ver el posteo completo»',
  hSched.indexOf('pz-hoy-hero-caption') < hSched.indexOf('pz-hoy-tres') &&
  hSched.indexOf('pz-hoy-tres') < hSched.indexOf('pz-hoy-hero-link'));
t('B3: héroe programado NO trae Rechazar ni Rehacer',
  !hSched.includes('Rechazar') && !hSched.includes('Rehacer'));
const hDraft = pzHoyCardHTML(post({ status: 'draft', approval: 'pending' }), { hero: true, en: false });
t('B4: borrador: Editar + Eliminar, SIN Frenar',
  hDraft.includes('data-pz-hoy-cambiar="42"') && hDraft.includes('data-pz-hoy-eliminar="42"') && !hDraft.includes('data-pz-hoy-frenar'));
const hPub = pzHoyCardHTML(post({ status: 'published', approval: 'approved' }), { hero: true, en: false });
t('B5: publicado: solo Editar (sin Frenar ni Eliminar)',
  hPub.includes('data-pz-hoy-cambiar="42"') && !hPub.includes('data-pz-hoy-frenar') && !hPub.includes('data-pz-hoy-eliminar'));
const hCompact = pzHoyCardHTML(post({}), { cartita: false, en: false });
t('B6: tarjeta compacta (resto de la semana): SIN tres botones',
  !hCompact.includes('pz-hoy-tres'));
const hEn = pzHoyCardHTML(post({}), { hero: true, en: true });
t('B7: EN: Edit / Hold / Delete',
  hEn.includes('Edit') && hEn.includes('Hold') && hEn.includes('Delete'));
const hNoCap = pzHoyCardHTML(post({ caption: '' }), { hero: true, en: false });
t('B8: sin caption, los tres botones rinden igual',
  hNoCap.includes('pz-hoy-tres') && hNoCap.includes('data-pz-hoy-frenar="42"'));

// ---------- C. pzHoyEliminar ----------
async function testEliminar() {
  const elimSrc = extractFn(jsR, 'async function pzHoyEliminar(id, btn) {', '// Contador del conserje');
  const calls = { del: [], toast: [], render: 0 };
  let confirmVal = true;
  const sb = {
    ME: { lang: 'es' },
    window: { confirm: () => confirmVal },
    api: { del: async (u) => { calls.del.push(u); } },
    toast: (m) => { calls.toast.push(m); },
    render: () => { calls.render++; },
    pzIc: (n) => `<i data-ic="${n}"></i>`,
    esc: escFn, console,
  };
  vm.createContext(sb);
  vm.runInContext(elimSrc, sb);
  const fn = vm.runInContext('pzHoyEliminar', sb);
  const btn = { disabled: false };
  confirmVal = true;
  await fn(42, btn);
  t('C1: con confirmación → DELETE /api/posts/42 + render, botón deshabilitado en el camino',
    calls.del.length === 1 && calls.del[0] === '/api/posts/42' && calls.render === 1);
  confirmVal = false;
  calls.del.length = 0; calls.render = 0;
  await fn(42, btn);
  t('C2: sin confirmación → NO hay DELETE ni render',
    calls.del.length === 0 && calls.render === 0);
  sb.api.del = async () => { throw {}; }; // sin mensaje: ejercita el fallback «No se pudo eliminar»
  confirmVal = true; btn.disabled = false;
  calls.render = 0;
  await fn(42, btn);
  t('C3: si el DELETE falla → toast de error, botón rehabilitado, sin render',
    calls.render === 0 && btn.disabled === false && calls.toast.some((m) => String(m).includes('No se pudo eliminar')));
}
testEliminar().then(() => finish()).catch((e) => { console.log('FAIL C: ' + e.message); fail++; finish(); });

function finish() {
  // ---------- D. Estampado ----------
  t('D1: BUILD v914 ×1 en server.js, v900 ×0',
    occ(srvR, /20261105-v914/g) === 1 && occ(srvR, /20261105-v900/g) === 0);
  t('D2: app.js?v=627 ×1 en index ES, styles.css?v=20261252 ×1 ES + ×1 EN, EN sin app.js?v=',
    occ(idxR, /app\.js\?v=627/g) === 1 &&
    occ(idxR, /styles\.css\?v=20261252/g) === 1 &&
    occ(idxEnR, /styles\.css\?v=20261252/g) === 1 &&
    !idxEnR.includes('app.js?v='));
  t('D3: app.js 31525 líneas (31492 base v913 + 33), styles.css 6229 (6226 base v913 + 3)',
    nlines(path.join(REL, 'public/app.js')) === 31525 &&
    nlines(path.join(REL, 'public/styles.css')) === 6229);

  // ---------- E. Resto intacto ----------
  t('E1: v900 intacto: stripe config ×1 y payment-method ×1 en server.js',
    occ(srvR, /\/api\/billing\/stripe\/config/g) === 1 &&
    occ(srvR, /\/api\/billing\/stripe\/payment-method/g) === 1);
  t('E2: pzHoyHoyHTML intacto (cabecera + hero:true)',
    jsR.includes("pzHoyCardHTML(p, { cartita: false, sinCuando: true, en, tz, prop: (o && o.prop) || null, hero: true })"));
  t('E3: detalle intacto: apvMoreHTML con sus 5 botones (Editar, Rechazar, Frenar, Eliminar, Rehacer)',
    jsR.includes("id=\"apvEdit\"") && jsR.includes("id=\"apvReject\"") && jsR.includes("id=\"apvHold\"") &&
    jsR.includes("id=\"apvDelete\"") && jsR.includes("id=\"apvRedo\""));
  t('E4: pcHold intacto (PATCH unschedule) y apvDelete intacto (confirm + api.del)',
    jsR.includes("await api.patch('/api/posts/' + encodeURIComponent(id), { action: 'unschedule' });") &&
    jsR.includes("await api.del('/api/posts/' + encodeURIComponent(apvDl.dataset.apvid));"));
  t('E5: CHUNK_V v890 ×1 línea en app.js; acciones Aprobar/Cambiar del héroe intactas',
    occ(jsR, /20261105-v890/g) === 1 &&
    jsR.includes('data-pz-hoy-aprobar="${esc(String(p.id))}"') &&
    jsR.includes('data-pz-hoy-cambiar="${esc(String(p.id))}">${en ? \'Change it\' : \'Cambialo\'}</button>'));

  // ---------- M78 ----------
  const defs = ['function pzHoyCambiar(', 'async function pcHold(', 'async function pzHoyEliminar('];
  const called = ['pzHoyCambiar(b.getAttribute', 'pcHold(b.getAttribute', 'pzHoyEliminar(b.getAttribute'];
  const allDef = defs.every((d) => jsR.includes(d));
  const allCalled = called.every((c) => jsR.includes(c));
  t('M78: funciones auditadas: 3/3 (pzHoyCambiar, pcHold, pzHoyEliminar definidas y llamadas desde la fila)',
    allDef && allCalled);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
