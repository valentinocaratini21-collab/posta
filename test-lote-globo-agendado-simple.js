'use strict';
/* test-lote-globo-agendado-simple.js
 * LOTE GLOBO-AGENDADO-SIMPLE (decisión Valentino 12/11): el globo de
 * confirmación de la tarjeta Hoy queda SOLO «✓ agendado» / «✓ scheduled»;
 * que el posteo también sale como historia se comunica en el DETALLE
 * (approvalPostView), solo para la condición real de la historia gemela
 * del scheduler (feed imagen/carrusel, aprobado o publicado).
 * VM sobre los tramos reales de public/app.js + pins estáticos.
 * Uso: node test-lote-globo-agendado-simple.js  (desde la raíz del árbol)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

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

console.log('§A pins estáticos');
{
  const card = span(APP, 'function pzHoyCardHTML', 'function pzPostWowEmailDismissKey');
  t(card.includes('<div class="pz-hoy-ok">✓ ${en ? \'scheduled\' : \'agendado\'}</div>'),
    'A1: el globo es exactamente «✓ agendado» / «✓ scheduled»');
  t(!card.includes('Posty también lo sube como historia') && !card.includes('Posty also shares it as a story'),
    'A2: la frase de la historia ya NO está en la tarjeta Hoy');
  t(card.includes("(!pendiente && st === 'scheduled')"),
    'A3: la condición de aparición del globo quedó intacta (programado + aprobado)');
  t(count(APP, 'Posty también lo sube como historia') === 1 && count(APP, 'Posty also shares it as a story') === 1,
    'A4: la frase de la historia vive UNA sola vez en app.js (el detalle)');
  const apv = span(APP, 'async function approvalPostView', 'function apvMoreHTML');
  t(apv.includes('apv-story') && apv.includes('Posty también lo sube como historia'),
    'A5: la frase está en approvalPostView con su línea apv-story');
  t(apv.includes("apvMt === 'image' || apvMt === 'carousel'") && apv.includes("st === 'published'") && apv.includes("ap !== 'pending'"),
    'A6: la condición del detalle es la de la gemela (imagen/carrusel + aprobado o publicado)');
  t(count(SERVER, "const BUILD_ID = '20261105-v1071';") === 1, 'A7: BUILD v1071 en server.js (fijado por el preparador)');
  t(count(INDEX, 'app.js?v=727') === 1, 'A8: index ES con app.js?v=727 (fijado por el preparador)');
}

/* ---------- VM: stubs compartidos ---------- */
function baseCtx() {
  const ctx = {
    console,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    mv: (x) => String(x || ''),
    ME: { lang: 'es' },
    track: () => {},
    api: { get: async () => ({}) },
  };
  ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

console.log('§B VM pzHoyCardHTML (el globo)');
{
  const src = span(APP, 'function pzHoyCardHTML', 'function pzPostWowEmailDismissKey');
  const ctx = baseCtx();
  ctx.pzHoyPillSalida = () => 'Se postea mañana · 19:00';
  ctx.pzHoyCuandoCorto = () => 'Hoy 19:00';
  ctx.pzHoyCuentaSaleTxt = () => '';
  vm.runInContext(src, ctx);
  const H = ctx.pzHoyCardHTML;
  t(typeof H === 'function', 'B0: pzHoyCardHTML extraída y evaluada');
  const okDiv = (html) => {
    const a = html.indexOf('pz-hoy-ok');
    if (a < 0) return null;
    const b = html.indexOf('</div>', a);
    return html.slice(a, b);
  };
  const post = { id: 77, status: 'scheduled', approval: 'approved', media_type: 'image', image_path: '/media/x.jpg', caption: 'Hola', scheduled_at: '2026-11-13T19:00:00Z' };

  const h1 = H(post, { en: false }); // compacta: desde v1021 el globo pz-hoy-ok vive solo acá
  t(okDiv(h1) !== null && okDiv(h1).includes('✓ agendado'), 'B1: aprobado ES → globo «✓ agendado»');
  t(!h1.includes('Posty también lo sube como historia'), 'B2: sin frase de historia en la tarjeta');
  const h2 = H(post, { en: true });
  t(okDiv(h2) !== null && okDiv(h2).includes('✓ scheduled') && !h2.includes('Posty also shares it as a story'),
    'B3: aprobado EN → globo «✓ scheduled», sin frase');
  const h3 = H(post, { cartita: true, en: false });
  t(okDiv(h3) !== null && okDiv(h3).includes('✓ agendado') && !okDiv(h3).includes('Se postea mañana') && !okDiv(h3).includes('Hoy 19:00'),
    'B4: cartita con hora → el globo sigue siendo solo «✓ agendado» (la hora no se filtra al globo)');
  const h4 = H({ ...post, approval: 'pending' }, { en: false });
  t(!h4.includes('pz-hoy-ok') && h4.includes('data-pz-hoy-aprobar'), 'B5: pendiente → sin globo, con botones (condición intacta)');
  const h5 = H({ ...post, status: 'draft', approval: 'pending' }, { en: false });
  t(!h5.includes('pz-hoy-ok'), 'B6: borrador → sin globo');
  const h6 = H({ ...post, media_type: 'video', cover_path: '/media/c.jpg' }, { en: false });
  t(okDiv(h6) !== null && okDiv(h6).includes('✓ agendado') && !h6.includes('historia'),
    'B7: reel aprobado → mismo globo simple, sin prometer historia');
}

console.log('§C VM approvalPostView (el detalle)');
{
  const src = span(APP, 'function apvTz', 'function apvMoreHTML');
  const ctx = baseCtx();
  // apvWhenText usa el helper real pcDayKeyShift (vive fuera del tramo apv):
  // se evalúa el real, no un stub.
  vm.runInContext(span(APP, 'function pcDayKeyShift', '\nfunction '), ctx);
  ctx.pzApvBackHTML = () => '';
  ctx.apvMoreHTML = () => '';
  ctx.hfAskChangeBtnHTML = () => '';
  ctx.pzIsPubReal = () => false;
  vm.runInContext(src, ctx);
  const V = ctx.approvalPostView;
  t(typeof V === 'function', 'C0: approvalPostView extraída y evaluada');
  const mk = (over) => ({
    id: 91, status: 'scheduled', approval: 'approved', media_type: 'image',
    image_path: '/media/x.jpg', caption: 'Hola', hashtags: '',
    scheduled_at: '2026-11-13T19:00:00Z', carousel_paths: '[]',
    caption_on: 0, overlay_text: '', needs_review: 0,
    ...(over || {}),
  });
  const run = async (post, en) => {
    ctx.ME = { lang: en ? 'en' : 'es' };
    ctx.api = { get: async () => ({ post }) };
    return String(await V(post.id));
  };
  (async () => {
    t((await run(mk(), false)).includes('apv-story') && (await run(mk(), false)).includes('Posty también lo sube como historia'),
      'C1: detalle programado+aprobado imagen → línea de historia ES');
    t((await run(mk(), true)).includes('Posty also shares it as a story'),
      'C2: detalle EN → línea de historia EN');
    t(!(await run(mk({ media_type: 'video' }), false)).includes('apv-story'),
      'C3: reel → sin línea (los reels no tienen gemela)');
    t(!(await run(mk({ approval: 'pending' }), false)).includes('apv-story'),
      'C4: programado pendiente → sin línea (todavía no aprobado)');
    t(!(await run(mk({ status: 'draft', approval: 'pending' }), false)).includes('apv-story'),
      'C5: borrador → sin línea');
    t((await run(mk({ status: 'published', media_type: 'carousel' }), false)).includes('apv-story'),
      'C6: publicado carrusel → con línea');
    t(!(await run(mk({ media_type: 'story' }), false)).includes('apv-story'),
      'C7: el posteo que YA es historia → sin línea');
    t((await run(mk({ media_type: '' }), false)).includes('apv-story'),
      'C8: media_type vacío = imagen (default de DB) → con línea');
    console.log(`\ntest-lote-globo-agendado-simple: ${ok} ok, ${mal} mal`);
    process.exit(mal ? 1 : 0);
  })().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
