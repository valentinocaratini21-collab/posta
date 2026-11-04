'use strict';
// test-loteemaillindo.js — Lote EMAIL-LINDO (v621): previews reales en el
// nudge de borradores. Sin DB, sin envíos reales: se testea el builder
// puro buildDraftsNudgeEmail (el wrapper draftsNudgeEmail solo agrega el
// sendEmail, que sin RESEND_API_KEY no sale a la red).
// Se corre con: node test-loteemaillindo.js
const { buildDraftsNudgeEmail, draftsNudgeEmail } = require('./email');

const BASE = 'https://postycommunitymanager.com';
const TZ = 'America/Argentina/Buenos_Aires';
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}
function count(h, sub) { return h.split(sub).length - 1; }
const IMG = 'https://postycommunitymanager.com/media/1792922740229-acfb25100298.jpg';
function draft(img, caption, when) { return { img, caption, when }; }

// ---- Caso real Gesty ES: 3 con foto + 13 más (16 en total) ----
const gestyDrafts = [
  draft(IMG, '¿Cuántas veces te sentiste abrumado con la organización de tu negocio? 😩\nEn Gesty, estamos para hacerte la vida más fácil.', '2026-10-26T22:00:00.000Z'),
  draft('https://postycommunitymanager.com/media/1792922740975-bb781f28cc5b.jpg', '¿Cuántas veces te pasó que tus cobranzas se te acumulaban y te traían dolores de cabeza?  ', '2026-10-27T22:00:00.000Z'),
  draft('https://postycommunitymanager.com/media/1792922741770-3220e220916b.jpg', '¿Sabías que los reportes de Gesty son clave para tu negocio? 📊\nTe voy a ser honesto: tener', '2026-10-28T22:00:00.000Z'),
];
for (let i = 0; i < 13; i++) gestyDrafts.push(draft('', `Borrador sin foto ${i}`, '2026-10-29T22:00:00.000Z'));
const es = buildDraftsNudgeEmail({ name: 'Gesty', count: 16, lang: 'es', tz: TZ, drafts: gestyDrafts }, BASE);
ok(es.subject === 'Tus posteos de la semana para Instagram ya están listos 👀', 'ES subject intacto');
ok(es.html.includes('Hola, Gesty 👋'), 'ES saludo intacto');
ok(es.html.includes('Ya los armé con tu marca y tu estilo. Entrá y programalos con un clic —'), 'ES intro intacta');
ok(count(es.html, 'box-shadow:0 2px 10px') === 3, 'ES 3 tarjetas');
ok(es.html.includes(IMG), 'ES foto real 509');
ok(es.html.includes('¿Cuántas veces te sentiste abrumado con la organización de tu negocio? 😩'), 'ES caption 509 primera línea');
ok(!es.html.includes('En Gesty, estamos para hacerte la vida más fácil.'), 'ES caption cortado a primera línea');
ok(es.html.includes('Lunes 26/10 · 19:00'), 'ES día/hora 509 (22:00Z = 19:00 BA)');
ok(es.html.includes('Martes 27/10 · 19:00'), 'ES día/hora 510');
ok(es.html.includes('Miércoles 28/10 · 19:00'), 'ES día/hora 511');
ok(es.html.includes('+ 13 más esperando tu revisión'), 'ES línea +13');
ok(es.html.includes('Programar mis posteos'), 'ES CTA intacto');
ok(es.html.includes('Te avisamos porque tenés contenido pendiente en Posty.'), 'ES pie intacto');
ok(es.html.includes('Posty <span style="font-weight:600">— tu community manager</span>'), 'ES cabecera intacta');

// ---- Con approveUrl: botón Aprobar primario, sin botón Programar ----
const ap = buildDraftsNudgeEmail({ name: 'Gesty', count: 3, lang: 'es', tz: TZ, approveUrl: BASE + '/aprobar/abc', drafts: gestyDrafts.slice(0, 3) }, BASE);
ok(ap.html.includes('✅ Aprobar mi semana'), 'ES approve botón primario');
ok(!ap.html.includes('>Programar mis posteos<'), 'ES approve sin botón Programar');
ok(!ap.html.includes('+'), 'ES 3/3 sin línea +N');

// ---- Variante EN: 2 con foto, sin +N, hora 12h ----
const en = buildDraftsNudgeEmail({ name: 'Gesty', count: 2, lang: 'en', tz: TZ, drafts: gestyDrafts.slice(0, 2) }, BASE);
ok(en.subject === 'Your Instagram posts for this week are ready 👀', 'EN subject intacto');
ok(en.html.includes('Hi, Gesty 👋'), 'EN saludo intacto');
ok(count(en.html, 'box-shadow:0 2px 10px') === 2, 'EN 2 tarjetas');
ok(en.html.includes('Monday 10/26 · 7:00 PM'), 'EN día/hora 12h');
ok(!en.html.includes('more waiting for your review'), 'EN 2/2 sin línea +N');
ok(en.html.includes('Schedule my posts'), 'EN CTA intacto');

// ---- Video cuenta en +N pero no genera tarjeta ----
const mix = buildDraftsNudgeEmail({ name: 'X', count: 4, lang: 'es', tz: TZ, drafts: [
  draft(IMG, 'Con foto 1', '2026-10-26T22:00:00.000Z'),
  draft('', 'Video sin póster', '2026-10-27T22:00:00.000Z'),
  draft(IMG, 'Con foto 2', '2026-10-28T22:00:00.000Z'),
  draft(IMG, 'Con foto 3', '2026-10-29T22:00:00.000Z'),
] }, BASE);
ok(count(mix.html, 'box-shadow:0 2px 10px') === 3, 'MIX 3 tarjetas (video fuera)');
ok(mix.html.includes('+ 1 más esperando tu revisión'), 'MIX video cuenta en +N');

// ---- Sin fotos: sale como hoy (sin tarjetas, sin +N) ----
const sin = buildDraftsNudgeEmail({ name: 'X', count: 4, lang: 'es', tz: TZ, drafts: [
  draft('', 'Solo texto 1', '2026-10-26T22:00:00.000Z'),
  draft('', 'Solo texto 2', '2026-10-27T22:00:00.000Z'),
] }, BASE);
ok(count(sin.html, 'box-shadow:0 2px 10px') === 0, 'SIN-FOTO 0 tarjetas');
ok(!sin.html.includes('más esperando'), 'SIN-FOTO sin línea +N');
ok(sin.html.includes('Programar mis posteos'), 'SIN-FOTO CTA intacto');

// ---- Forma vieja (sin drafts): idéntica a hoy ----
const old = buildDraftsNudgeEmail({ name: 'X', count: 4, lang: 'es' }, BASE);
ok(count(old.html, 'box-shadow:0 2px 10px') === 0, 'VIEJA sin tarjetas');
ok(old.html.includes('Ya los armé con tu marca y tu estilo. Entrá y programalos con un clic —'), 'VIEJA intro intacta');

// ---- Escape + día cruzado por timezone + sin fecha ----
const esc = buildDraftsNudgeEmail({ name: 'X', count: 2, lang: 'es', tz: TZ, drafts: [
  draft(IMG, '<script>alert(1)</script> & "comillas"', '2026-11-03 01:00:00'),
  draft(IMG, 'Sin fecha', null),
] }, BASE);
ok(!esc.html.includes('<script>'), 'ESC caption escapado');
ok(esc.html.includes('&lt;script&gt;'), 'ESC entidades presentes');
ok(esc.html.includes('Lunes 02/11 · 22:00'), 'TZ 01:00Z del 3 = LUN 2 22:00 BA');
ok(esc.html.includes('Sin fecha'), 'SIN-FECHA etiqueta honesta');

// ---- Send-path sin clave: no sale a la red, no rompe ----
(async () => {
  delete process.env.RESEND_API_KEY;
  const r = await draftsNudgeEmail({ name: 'X', count: 1, lang: 'es', tz: TZ, drafts: [] }, BASE);
  ok(r && r.ok === false && r.skipped === true, 'SEND sin clave: skipped, sin fetch');
  console.log(`loteemaillindo: ${pass} ok, ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})();
