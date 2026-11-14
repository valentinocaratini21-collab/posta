'use strict';
/* test-lote-botones-detalle.js — LOTE BOTONES-DETALLE-SIMPLES (14/11,
 * pedido de Valentino con captura del detalle del posteo):
 *  (1) a «Rehacer» y «Editar» les falta un ícono VISIBLE: los glifos
 *      existían, pero pzIc pinta TODO con trazo fijo #2793C8
 *      (PZ_IC_CEL) y sobre el gradiente azul de su chip el celeste se
 *      perdía (sobre el amarillo de Frenar y el coral de Eliminar sí
 *      se veía: la captura lo muestra). Las cuatro tarjetas quedan
 *      con UN solo diseño simple: chip plano celeste suave
 *      (.pz-hoy-act-ic, fondo #E9F4FA), sin gradientes ni clases de
 *      color — el glifo celeste con contraste real (ratio calculado).
 *  (2) el botón «Cambialo», junto a «Dale, publicalo», está de más:
 *      sale de la fila de aprobación, que queda con «Dale, publicalo
 *      ✓» como única acción a ancho completo (.pz-hoy-actions
 *      .btn{flex:1}). Lo que «Cambialo» abría (pzHoyCambiar →
 *      hfOpenChatForPost, el chat con el posteo anclado) NO se pierde:
 *      en la misma tarjeta vive la tira de voz anclada a ESE posteo
 *      (pzVozStripHTML: «Mantené apretado y decime si necesitás un
 *      cambio en este posteo», mismo cerebro con el posteo anclado)
 *      y en publicados «Editar» conserva data-pz-hoy-cambiar.
 *
 * VM sobre los tramos reales de public/app.js (pzIc + PZ_IC reales,
 * hfRedoLeft/hfRedoLineHTML reales, pzVozStripHTML real,
 * pzHoyCardHTML real) + pins estáticos + CONTROL contra ../base
 * (la captura de hoy reproducida: Cambialo presente, chips con
 * gradiente y el contraste del glifo contra el azul < 1.6).
 * Uso: node test-lote-botones-detalle.js  (desde la raíz del árbol)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const BASE_DIR = path.join(ROOT, '..', 'base');
const hasBase = fs.existsSync(path.join(BASE_DIR, 'public', 'app.js'));
const BAPP = hasBase ? fs.readFileSync(path.join(BASE_DIR, 'public', 'app.js'), 'utf8') : '';
const BCSS = hasBase ? fs.readFileSync(path.join(BASE_DIR, 'public', 'styles.css'), 'utf8') : '';

let ok = 0, mal = 0;
function t(cond, nombre) {
  if (cond) { ok++; console.log('  ok', nombre); }
  else { mal++; console.log('  MAL', nombre); }
}
function span(src, desde, hasta) {
  const a = src.indexOf(desde);
  if (a < 0) throw new Error('ancla no encontrada: ' + desde);
  const b = src.indexOf(hasta, a + desde.length);
  if (b < 0) throw new Error('ancla de cierre no encontrada: ' + hasta);
  return src.slice(a, b);
}
const count = (src, needle) => src.split(needle).length - 1;

/* Contraste WCAG: luminancia relativa y ratio entre dos hex. */
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(h1, h2) {
  const a = lum(h1), b = lum(h2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/* Tono (grados HSL) y distancia circular entre tonos. */
function hue(hex) {
  const r = parseInt(hex.substr(1, 2), 16) / 255, g = parseInt(hex.substr(3, 2), 16) / 255, b = parseInt(hex.substr(5, 2), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
function hueDiff(h1, h2) {
  const d = Math.abs(hue(h1) - hue(h2)) % 360;
  return d > 180 ? 360 - d : d;
}

console.log('§A pins estáticos (release)');
{
  const card = span(APP, 'function pzHoyCardHTML', 'function pzPostWowEmailDismissKey');
  t(count(card, 'data-pz-hoy-cambiar="') === 1,
    'A1: en pzHoyCardHTML queda UN solo atributo data-pz-hoy-cambiar (el de «Editar» en publicados); el botón «Cambialo» salió');
  t(!card.includes('>Cambialo<') && !card.includes('>Change it<'),
    'A2: ningún botón rotulado «Cambialo»/«Change it» en la tarjeta');
  t(count(card, '<span class="pz-hoy-act-ic">') === 5,
    'A3: los 5 chips de la fuente (Rehacer · Editar×2 ramas · Frenar · Eliminar) llevan la clase única sin color');
  t(!APP.includes('pz-hoy-act-azul') && !APP.includes('pz-hoy-act-amarillo') && !APP.includes('pz-hoy-act-coral'),
    'A4: las clases de color de chip desaparecieron de app.js');
  t(!CSS.includes('pz-hoy-act-azul') && !CSS.includes('pz-hoy-act-amarillo') && !CSS.includes('pz-hoy-act-coral'),
    'A5: las reglas de gradiente desaparecieron de styles.css');
  const icRule = span(CSS, '.pz-hoy-act-ic{', '}');
  t(icRule.includes('background:#E9F4FA'),
    'A6: .pz-hoy-act-ic tiene el fondo plano único #E9F4FA');
  t(ratio('#2793C8', '#E9F4FA') >= 3,
    'A7: contraste real del glifo (#2793C8) sobre el chip nuevo: ratio ' + ratio('#2793C8', '#E9F4FA').toFixed(2) + ' ≥ 3');
  t(CSS.includes('.pz-hoy-actions .btn{flex:1'),
    'A8: la fila de aprobación conserva .btn{flex:1} (la acción única ocupa todo el ancho)');
  t(APP.includes("querySelectorAll('[data-pz-hoy-cambiar]')") && APP.includes('function pzHoyCambiar') && APP.includes('hfOpenChatForPost(p)'),
    'A9: el camino al chat del posteo sigue cableado (binding + pzHoyCambiar + hfOpenChatForPost)');
  const icons = span(APP, 'const PZ_IC_CEL', '\n// Variante liviana');
  t(icons.includes('function pzIc') && icons.includes('PZ_IC_CEL'),
    'A10: pzIc no se tocó (sigue pintando con su trazo fijo; el arreglo es del fondo, no del glifo)');
}

/* ---------- VM: tramos reales ---------- */
function buildCtx(appSrc, en) {
  const ctx = {
    console,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (x) => String(x || ''),
    ME: { lang: en ? 'en' : 'es' },
    pzHoyPillSalida: () => 'Se postea mañana · 19:00',
    pzHoyCuandoCorto: () => 'Hoy 19:00',
    pzHoyCuentaSaleTxt: () => '',
    pzHoyHoraCorta: () => '19:00',
    pcParseDate: (s) => new Date(s),
    pzWhenRelDay: () => (en ? 'today' : 'hoy'),
  };
  ctx.globalThis = ctx;
  const c = vm.createContext(ctx);
  vm.runInContext(span(appSrc, 'const PZ_IC_CEL', '\n// Variante liviana'), c);
  vm.runInContext(span(appSrc, 'function hfRedoLeft', 'function hfRedoLineHTML'), c);
  vm.runInContext(span(appSrc, 'function hfRedoLineHTML', '\nfunction '), c);
  vm.runInContext(span(appSrc, 'function pzVozEn', 'function pzVozSemanaHTML'), c);
  vm.runInContext(span(appSrc, 'function pzHoyCardHTML', 'function pzPostWowEmailDismissKey'), c);
  return c;
}
const heroOpts = (en) => ({ cartita: false, sinCuando: true, en, tz: undefined, prop: null, hero: true });
const mkPost = (over) => ({
  id: 42, status: 'scheduled', approval: 'pending', media_type: 'image',
  image_path: '/media/x.jpg', caption: 'Hola', scheduled_at: '2026-11-15T00:00:00Z',
  redo_left: 3, ...(over || {}),
});

console.log('§B VM pzHoyCardHTML héroe (release)');
{
  const ctx = buildCtx(APP, false);
  const H = ctx.pzHoyCardHTML;
  t(typeof H === 'function', 'B0: pzHoyCardHTML extraída y evaluada');
  const h = H(mkPost(), heroOpts(false));
  const ord = ['Rehacer</button>', 'Editar</button>', 'Frenar</button>', 'Eliminar</button>'].map((s) => h.indexOf(s));
  t(ord.every((i) => i >= 0) && ord[0] < ord[1] && ord[1] < ord[2] && ord[2] < ord[3],
    'B1: las cuatro tarjetas en orden Rehacer · Editar · Frenar · Eliminar (ES)');
  t(count(h, 'class="pz-hoy-act-ic"') === 4 && !h.includes('pz-hoy-act-azul') && !h.includes('pz-hoy-act-amarillo') && !h.includes('pz-hoy-act-coral'),
    'B2: 4 chips renderizados, todos con el diseño único (sin clases de color)');
  t(h.includes('stroke="#2793C8"') && h.includes('M23 4v6h-6') && h.includes('l1.5-5.5Z') && h.includes('M9 5v14M15 5v14') && h.includes('M4 7h16'),
    'B3: los glifos REALES se pintan en los chips (refresh · pencil · pause · trash, trazo #2793C8)');
  const act = h.slice(h.indexOf('pz-hoy-actions'), h.indexOf('</div>', h.indexOf('pz-hoy-actions')));
  t(act.includes('Dale, publicalo ✓') && count(act, '<button') === 1 && !h.includes('Cambialo'),
    'B4: la fila de aprobación tiene UNA sola acción («Dale, publicalo ✓») y «Cambialo» no existe en la tarjeta');
  t(h.includes('data-pz-voz="42"') && h.includes('Mantené apretado') && h.includes('data-pz-voz-mic'),
    'B5: la tira de voz anclada a ESTE posteo está en la misma tarjeta (el pedido de cambio sigue alcanzable sin «Cambialo»)');
  t(h.includes('Te quedan 3 de 3 rehaces'),
    'B6: el contador de rehaces sigue bajo las tarjetas, intacto');

  const hEn = buildCtx(APP, true).pzHoyCardHTML(mkPost(), heroOpts(true));
  t(hEn.includes('Redo</button>') && hEn.includes('Edit</button>') && hEn.includes('Hold</button>') && hEn.includes('Delete</button>')
    && hEn.includes('Publish it ✓') && !hEn.includes('Change it') && hEn.includes('Hold down'),
    'B7: EN — Redo · Edit · Hold · Delete, «Publish it ✓» único y sin «Change it»');

  const hPub = H(mkPost({ status: 'published', approval: 'approved' }), heroOpts(false));
  t(hPub.includes('data-pz-hoy-cambiar="42"') && !hPub.includes('data-pz-hoy-editbox') && !hPub.includes('pz-hoy-actions')
    && count(hPub, 'class="pz-hoy-act-ic"') === 1,
    'B8: publicado — «Editar» conserva su camino al chat (data-pz-hoy-cambiar) con el chip único; sin fila de aprobación');
  const hDraft = H(mkPost({ status: 'draft' }), heroOpts(false));
  t(count(hDraft, 'class="pz-hoy-act-ic"') === 3 && !hDraft.includes('Frenar</button>') && hDraft.includes('Dale, publicalo ✓') && !hDraft.includes('Cambialo'),
    'B9: borrador — Rehacer · Editar · Eliminar (sin Frenar), «Dale, publicalo ✓» único');
  const hZero = H(mkPost({ redo_left: 0 }), heroOpts(false));
  t(hZero.includes('Ya usaste los 3 rehaces de este posteo') && hZero.includes('data-pz-hoy-rehacer="42" disabled'),
    'B10: a 0 rehaces, la tarjeta nace deshabilitada y la línea lo dice (comportamiento intacto)');
}

console.log('§C CONTROL contra la base (la captura de hoy, reproducida)');
if (hasBase) {
  const ctx = buildCtx(BAPP, false);
  const h = ctx.pzHoyCardHTML(mkPost(), heroOpts(false));
  t(h.includes('>Cambialo</button>') || h.includes('Cambialo'),
    'C1: en la base el botón «Cambialo» SÍ está junto a «Dale, publicalo»');
  t(count(h, 'pz-hoy-act-azul') === 2 && count(h, 'pz-hoy-act-amarillo') === 1 && count(h, 'pz-hoy-act-coral') === 1,
    'C2: en la base los chips son azul · azul · amarillo · coral (la inconsistencia de la captura)');
  t(BCSS.includes('.pz-hoy-act-azul{background:linear-gradient(145deg,#3aa7dd,#1f7fb8)}'),
    'C3: en la base el chip azul es el gradiente #3aa7dd→#1f7fb8');
  t(ratio('#2793C8', '#3aa7dd') < 1.6 && ratio('#2793C8', '#1f7fb8') < 1.6,
    'C4: el mecanismo de la invisibilidad, calculado: glifo #2793C8 contra el gradiente azul da ratio '
    + ratio('#2793C8', '#3aa7dd').toFixed(2) + ' / ' + ratio('#2793C8', '#1f7fb8').toFixed(2) + ' (< 1.6: se pierde)');
  t(hueDiff('#2793C8', '#3aa7dd') < 25 && hueDiff('#2793C8', '#1f7fb8') < 25
    && hueDiff('#2793C8', '#ffd35c') > 90 && hueDiff('#2793C8', '#f2604c') > 90,
    'C5: el mecanismo completo, medido: el gradiente azul es el MISMO tono que el glifo (Δtono '
    + hueDiff('#2793C8', '#3aa7dd').toFixed(0) + '°/' + hueDiff('#2793C8', '#1f7fb8').toFixed(0)
    + '°, luminancia casi igual) — doble pérdida; el amarillo y el coral son tonos opuestos (Δtono '
    + hueDiff('#2793C8', '#ffd35c').toFixed(0) + '°/' + hueDiff('#2793C8', '#f2604c').toFixed(0)
    + '°) y por eso Frenar y Eliminar SÍ se leían en la captura');
} else {
  console.log('  (sin ../base: control omitido)');
}

console.log(`\ntest-lote-botones-detalle: ${ok} ok, ${mal} mal`);
process.exit(mal ? 1 : 0);
