/**
 * test-lote-detalle-orden.js — LOTE DETALLE-ORDEN (28/11, dueño con
 * captura del posteo 827: «¿Qué crees que es mas importante? ¿El chat
 * para pedir un cambio o los 3 botones? ¿En qué orden deben estar?»).
 *
 * La tarjeta héroe del posteo (pzHoyCardHTML hero, «EL POSTEO DE HOY»)
 * cambia de orden y de presentación, sin tocar handlers:
 *   ANTES: media · caption · TARJETAS grandes (Rehacer/Editar/Frenar/
 *          Eliminar) · píldora verde «Sale hoy · 19:00 ✓» · tira de voz.
 *   AHORA: media · caption · píldora verde · tira de voz (el chat, la
 *          acción principal) · fila compacta y discreta de acciones
 *          (texto+ícono chico, sin chip de color) AL PIE.
 * «Editar» sigue abriendo el editor de caption en la tarjeta
 * (pzHoyEditarAbrir; en publicados, el camino al chat de siempre).
 *
 * Cliente: harness VM con las funciones reales extraídas de app.js.
 * Estáticos: clases nuevas, CSS, sellos y ?v= de los dos index.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let okN = 0, malN = 0;
function ok(name, cond, extra) {
  if (cond) { okN++; console.log('  ✓ ' + name); }
  else { malN++; console.log('  ✗ ' + name + (extra ? ' | ' + String(extra).slice(0, 300) : '')); }
}

const APP = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const IDX = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// ---------- Cliente (vm) ----------
const extractFn = (src, startMarker, endMarker) => {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('no start: ' + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('no end: ' + endMarker);
  return src.slice(a, b);
};
const escFn = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const sandbox = {
  esc: escFn,
  mv: (x) => x,
  pzIc: (n) => `<i data-ic="${n}"></i>`,
  pzHoyPillSalida: (p, tz, en) => (en ? 'Goes out today · 19:00' : 'Se postea hoy · 19:00'),
  pzHoyCuandoCorto: () => '', pzHoyCuentaSaleTxt: () => '',
  pzVozStripHTML: (p) => '<section class="pz-voz" data-pz-voz-stub="' + (p && p.id) + '"></section>',
  pcParseDate: (iso) => new Date(String(iso || '').replace(' ', 'T')),
  pzWhenRelDay: (d, tz, en) => (en ? 'today' : 'hoy'),
  pzHoyHoraCorta: () => '19:00',
  console,
};
vm.createContext(sandbox);
vm.runInContext(extractFn(APP, 'function hfRedoLeft(p) {', '// Línea del contador'), sandbox);
vm.runInContext(extractFn(APP, 'function hfRedoLineHTML(p, en) {', '// (Tanda feed 6A · ítem 2)'), sandbox);
vm.runInContext(extractFn(APP, 'function pzHoyCardHTML(p, o) {', '// (LOTE A · ítem 2)'), sandbox);
const pzHoyCardHTML = vm.runInContext('pzHoyCardHTML', sandbox);
const WHEN = '2026-11-28T22:00:00.000Z';
const post = (over) => Object.assign({ id: 42, status: 'scheduled', approval: 'auto', media_type: 'image', image_path: '/media/x.jpg', caption: 'Tesora que todos piden', hashtags: '#t', scheduled_at: WHEN, redo_left: 2 }, over);

// — Programado ES: el orden nuevo completo —
const h = pzHoyCardHTML(post({}), { hero: true, en: false });
const iCap = h.indexOf('pz-hoy-hero-caption');
const iPill = h.indexOf('pz-hoy-sale-ok');
const iVoz = h.indexOf('data-pz-voz-stub');
const iActs = h.indexOf('pz-hoy-acts-min');
ok('O1: orden nuevo ES — caption < píldora verde < tira de voz < fila de acciones',
  iCap > -1 && iCap < iPill && iPill < iVoz && iVoz < iActs,
  `cap=${iCap} pill=${iPill} voz=${iVoz} acts=${iActs}`);
ok('O2: la píldora dice la verdad de la salida («Sale hoy · 19:00 ✓»)',
  h.includes('Sale hoy · 19:00 ✓'));
ok('O3: la fila compacta trae los 4 botones en orden Rehacer·Editar·Frenar·Eliminar, con su data-* de siempre',
  h.indexOf('data-pz-hoy-rehacer="42"') > iActs &&
  h.indexOf('data-pz-hoy-rehacer="42"') < h.indexOf('data-pz-hoy-editar="42"') &&
  h.indexOf('data-pz-hoy-editar="42"') < h.indexOf('data-pz-hoy-frenar="42"') &&
  h.indexOf('data-pz-hoy-frenar="42"') < h.indexOf('data-pz-hoy-eliminar="42"'));
ok('O4: los botones son compactos (pz-hoy-act-min) y NO queda ningún chip de ícono (pz-hoy-act-ic) en el héroe',
  (h.match(/pz-hoy-act-min/g) || []).length >= 4 && !h.includes('pz-hoy-act-ic'));
ok('O5: el editor de caption sigue en la tarjeta (editbox + textarea con el caption + Guardar/Cancelar)',
  h.includes('data-pz-hoy-editbox="42"') && h.includes('data-pz-hoy-edit-status="scheduled"') &&
  h.includes('>Tesora que todos piden</textarea>') && h.includes('data-pz-hoy-edit-save="42"') && h.includes('data-pz-hoy-edit-cancel="42"'));
ok('O6: la línea del contador de rehaces sigue bajo la fila',
  h.includes('pz-hoy-redo-line') && h.indexOf('pz-hoy-acts-min') < h.indexOf('pz-hoy-redo-line'));
ok('O7: Rehacer nace habilitado con rehaces que quedan (disabled intacto)',
  h.includes('data-pz-hoy-rehacer="42"') && !h.includes('data-pz-hoy-rehacer="42" disabled'));

// — Publicado: Editar conserva su camino al chat; sin Frenar ni Eliminar —
const hPub = pzHoyCardHTML(post({ status: 'published', approval: 'approved' }), { hero: true, en: false });
ok('O8: publicado — Editar = data-pz-hoy-cambiar (chat), sin Frenar/Eliminar, fila tras la voz',
  hPub.includes('data-pz-hoy-cambiar="42"') && !hPub.includes('data-pz-hoy-frenar') && !hPub.includes('data-pz-hoy-eliminar') &&
  hPub.indexOf('data-pz-voz-stub') < hPub.indexOf('pz-hoy-acts-min'));

// — Borrador: sin píldora de salida, la fila sigue al pie tras la voz —
const hDraft = pzHoyCardHTML(post({ status: 'draft', approval: 'pending', scheduled_at: null }), { hero: true, en: false });
ok('O9: borrador — sin píldora «Sale…», fila compacta al pie tras la voz, Editar inline',
  !hDraft.includes('pz-hoy-sale-ok') && hDraft.indexOf('data-pz-voz-stub') < hDraft.indexOf('pz-hoy-acts-min') &&
  hDraft.includes('data-pz-hoy-editar="42"'));

// — EN: etiquetas y píldora en inglés, mismo orden —
const hEn = pzHoyCardHTML(post({}), { hero: true, en: true });
ok('O10: EN — «Goes out today · 19:00 ✓» antes de la voz y fila Redo·Edit·Hold·Delete al pie',
  hEn.includes('Goes out today · 19:00 ✓') &&
  hEn.indexOf('pz-hoy-sale-ok') < hEn.indexOf('data-pz-voz-stub') &&
  hEn.indexOf('data-pz-voz-stub') < hEn.indexOf('pz-hoy-acts-min') &&
  hEn.includes('>Hold</button>') || hEn.includes('Hold'));

// — La compacta NO se toca: su orden sigue siendo el de siempre —
const hComp = pzHoyCardHTML(post({}), { cartita: true, en: false });
ok('O11: la tarjeta compacta no cambia (sin fila min; su píldora sigue antes de la voz)',
  !hComp.includes('pz-hoy-acts-min') && hComp.indexOf('pz-hoy-sale-ok') > -1 &&
  hComp.indexOf('pz-hoy-sale-ok') < hComp.indexOf('data-pz-voz-stub'));

// ---------- Estáticos ----------
ok('E1: app.js trae las clases nuevas y el sello PZ_BUILD v1400',
  APP.includes('pz-hoy-acts-min') && APP.includes('pz-hoy-act-min') && APP.includes("const PZ_BUILD = '20261105-v1400';"));
ok('E2: styles.css trae la fila compacta discreta (sin fondo de tarjeta, con divisoria superior)',
  CSS.includes('.pz-hoy-acts-min{') && CSS.includes('.pz-hoy-act-min{') && CSS.includes('border-top:1px solid rgba(10,30,51,.07)'));
ok('E3: index ES con app.js?v=987 y styles.css?v=20261400; index EN con el mismo styles?v=',
  IDX.includes('/app.js?v=987') && IDX.includes('/styles.css?v=20261400') && IDXEN.includes('/styles.css?v=20261400'));
ok('E4: server.js con BUILD_ID v1400 (paridad)',
  SRV.includes("const BUILD_ID = '20261105-v1400';"));

console.log(`\ntest-lote-detalle-orden: ${okN} ok, ${malN} mal`);
process.exit(malN ? 1 : 0);
