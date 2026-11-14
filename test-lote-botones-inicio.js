#!/usr/bin/env node
// Suite del lote BOTONES-INICIO v914.
// Re-pineada por el preparador: base v913 (3e153c3f; app.js 31492, styles 6226), D3 31525/6229.
// Re-base 3: HEAD v905 -> v912 -> v913 mientras se trabajaba.
// RE-PIN DEL PREPARADOR (aterrizaje DETALLE-POSTEO v1021, sobre HEAD
// vivo v1020): la base de control de este scratch es el árbol v1020
// (base-v913/ apunta a él). La fila .pz-hoy-tres quedó SUPERSEDIDA por
// el diseño aprobado del 13/11 (píldora + tarjetas .pz-hoy-acts +
// editor inline + Rehacer de primer nivel): A1, A3, A6, A7, A9, B1–B8
// se re-pinean a esa verdad con su causa; el harness B suma la
// extracción de hfRedoLeft/hfRedoLineHTML (sin ellas la tarjeta
// Rehacer no rendía y B3 pasaba vacuo — ya lo había notado el builder
// del DETALLE); D pasa a BUILD v1021 / app.js?v=699 / styles
// 20261279 / conteos del árbol fusionado; E5 a CHUNK_V v977. El resto
// (A2, A4, A5, A8, C, E1–E4, M78) no se toca: sigue valiendo.
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
t('A1: (RE-PIN v1021) .pz-hoy-tres ×0 en app.js del release (supersedida por .pz-hoy-acts del DETALLE) y ×1 en la base viva',
  occ(jsR, /pz-hoy-tres/g) === 0 && occ(jsR, /pz-hoy-acts/g) >= 1 && occ(jsB, /pz-hoy-tres/g) === 1);
t('A2: data-pz-hoy-frenar ×1 y data-pz-hoy-eliminar ×1 en app.js (render + bind cuentan aparte)',
  jsR.includes('data-pz-hoy-frenar="${esc(String(p.id))}"') &&
  jsR.includes('data-pz-hoy-eliminar="${esc(String(p.id))}"'));
t('A3: (RE-PIN v1021) Editar es inline (data-pz-hoy-editar); data-pz-hoy-cambiar queda para el publicado (su tarjeta) y para «Cambialo»',
  jsR.includes('data-pz-hoy-editar="${esc(String(p.id))}"') &&
  jsR.includes('data-pz-hoy-cambiar="${esc(String(p.id))}"><span class="pz-hoy-act-ic pz-hoy-act-azul">${pzIc(\'pencil\', 20)}'));
t('A4: pzHoyBind cablea frenar y eliminar (querySelectorAll ×1 cada uno)',
  occ(jsR, /querySelectorAll\('\[data-pz-hoy-frenar\]'\)/g) === 1 &&
  occ(jsR, /querySelectorAll\('\[data-pz-hoy-eliminar\]'\)/g) === 1);
t('A5: pzHoyEliminar definida ×1 (confirm + api.del + render)',
  occ(jsR, /async function pzHoyEliminar\(id, btn\)/g) === 1 &&
  jsR.includes("window.confirm(en ? 'Delete this post permanently?'") &&
  jsR.includes("await api.del('/api/posts/' + encodeURIComponent(id));"));
t('A6: (RE-PIN v1021) Frenar solo si scheduled, Eliminar solo si no published (forma tarjeta .pz-hoy-act)',
  jsR.includes("st === 'scheduled'\n        ? `<button type=\"button\" class=\"pz-hoy-act\" data-pz-hoy-frenar=") &&
  jsR.includes("st !== 'published'\n        ? `<button type=\"button\" class=\"pz-hoy-act\" data-pz-hoy-eliminar="));
t('A7: (RE-PIN v1021) Rechazar sigue SIN aparecer en el héroe; Rehacer SÍ (es de primer nivel desde DETALLE-POSTEO)',
  !/Rechazar|apvReject/.test(jsR.slice(jsR.indexOf('const pillEstado'), jsR.indexOf('const editBox'))) &&
  jsR.slice(jsR.indexOf('const pillEstado'), jsR.indexOf('const editBox')).includes('data-pz-hoy-rehacer'));
t('A8: comentario de trazabilidad BOTONES-INICIO v914 ×3 en app.js (héroe, eliminar, bind)',
  occ(jsR, /BOTONES-INICIO v914/g) === 3);
t('A9: (RE-PIN v1021) CSS: .pz-hoy-tres ×0 en el release (sale con la fila) y .pz-hoy-acts ×1; en la base viva la fila vieja existía (×2)',
  occ(cssR, /\.pz-hoy-tres\{/g) === 0 &&
  occ(cssR, /\.pz-hoy-acts\{/g) === 1 &&
  occ(cssB, /pz-hoy-tres/g) === 2);

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
vm.runInContext(extractFn(jsR, 'function hfRedoLeft(p) {', '// Línea del contador'), sandbox);
vm.runInContext(extractFn(jsR, 'function hfRedoLineHTML(p, en) {', '// (Tanda feed 6A · ítem 2)'), sandbox);
vm.runInContext(cardSrc, sandbox);
const pzHoyCardHTML = vm.runInContext('pzHoyCardHTML', sandbox);
const post = (over) => Object.assign({ id: 42, status: 'scheduled', approval: 'pending', media_type: 'image', image_path: '/media/x.jpg', caption: 'Tesora que todos piden', scheduled_at: '2026-11-11T19:00:00-05:00' }, over);

const hSched = pzHoyCardHTML(post({}), { hero: true, en: false });
t('B1: (RE-PIN v1021) héroe programado rinde las CUATRO tarjetas del DETALLE con su id (Rehacer/Editar inline/Frenar/Eliminar)',
  hSched.includes('data-pz-hoy-rehacer="42"') && hSched.includes('data-pz-hoy-editar="42"') && hSched.includes('data-pz-hoy-frenar="42"') && hSched.includes('data-pz-hoy-eliminar="42"') &&
  hSched.includes('Rehacer') && hSched.includes('Editar') && hSched.includes('Frenar') && hSched.includes('Eliminar'));
t('B2: (RE-PIN v1021) las tarjetas van DESPUÉS del caption; «Ver el posteo completo» ya no existe ni como botón ni como link (ADDENDUM V4)',
  hSched.indexOf('pz-hoy-hero-caption') < hSched.indexOf('pz-hoy-acts') &&
  !hSched.includes('pz-hoy-hero-link') && !hSched.includes('Ver el posteo completo'));
t('B3: (RE-PIN v1021) héroe programado NO trae Rechazar; Rehacer SÍ (primer nivel desde DETALLE-POSTEO)',
  !hSched.includes('Rechazar') && hSched.includes('data-pz-hoy-rehacer="42"'));
const hDraft = pzHoyCardHTML(post({ status: 'draft', approval: 'pending' }), { hero: true, en: false });
t('B4: (RE-PIN v1021) borrador: Editar inline + Eliminar, SIN Frenar',
  hDraft.includes('data-pz-hoy-editar="42"') && hDraft.includes('data-pz-hoy-eliminar="42"') && !hDraft.includes('data-pz-hoy-frenar'));
const hPub = pzHoyCardHTML(post({ status: 'published', approval: 'approved' }), { hero: true, en: false });
t('B5: (RE-PIN v1021) publicado: su tarjeta es Cambialo (data-pz-hoy-cambiar), sin Frenar/Eliminar/Rehacer',
  hPub.includes('data-pz-hoy-cambiar="42"') && !hPub.includes('data-pz-hoy-frenar') && !hPub.includes('data-pz-hoy-eliminar') && !hPub.includes('data-pz-hoy-rehacer'));
const hCompact = pzHoyCardHTML(post({}), { cartita: false, en: false });
t('B6: (RE-PIN v1021) tarjeta compacta (resto de la semana): SIN tarjetas .pz-hoy-acts',
  !hCompact.includes('pz-hoy-acts'));
const hEn = pzHoyCardHTML(post({}), { hero: true, en: true });
t('B7: (RE-PIN v1021) EN: Redo / Edit / Hold / Delete',
  hEn.includes('>Redo<') && hEn.includes('>Edit<') && hEn.includes('>Hold<') && hEn.includes('>Delete<'));
const hNoCap = pzHoyCardHTML(post({ caption: '' }), { hero: true, en: false });
t('B8: (RE-PIN v1021) sin caption, las tarjetas rinden igual',
  hNoCap.includes('pz-hoy-acts') && hNoCap.includes('data-pz-hoy-frenar="42"'));

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
  t('D1: (RE-PIN v1021) BUILD v1021 ×1 en server.js, v900 ×0',
    occ(srvR, /20261105-v1021/g) === 1 && occ(srvR, /20261105-v900/g) === 0);
  t('D2: (RE-PIN v1021) app.js?v=699 ×1 en index ES, styles.css?v=20261279 ×1 ES + ×1 EN, EN sin app.js?v=',
    occ(idxR, /app\.js\?v=699/g) === 1 &&
    occ(idxR, /styles\.css\?v=20261279/g) === 1 &&
    occ(idxEnR, /styles\.css\?v=20261279/g) === 1 &&
    !idxEnR.includes('app.js?v='));
  t('D3: (RE-PIN v1021) app.js 33663 líneas (33496 base v1020 + 167 del DETALLE fusionado), styles.css 6426 (6416 base v1020 + 10)',
    nlines(path.join(REL, 'public/app.js')) === 33663 &&
    nlines(path.join(REL, 'public/styles.css')) === 6426);

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
  t('E5: (RE-PIN v1021) CHUNK_V v977 ×1 línea en app.js (el DETALLE no toca chunks); acciones Aprobar/Cambiar del héroe intactas',
    occ(jsR, /20261105-v977/g) === 1 &&
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
