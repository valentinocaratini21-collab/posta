'use strict';
// test-email-semana-v4.js — Tests del builder del email de la semana v4.
// Se corre con: node test-email-semana-v4.js (sin DB, sin email real).
// Fixture: semana Lun–Lun 2–9 nov 2026, 22:00 UTC = 19:00 Buenos Aires.
const { buildWeekEmailV4, _internal } = require('./email-semana-v4');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}
function count(h, sub) { return h.split(sub).length - 1; }

const BASE = 'https://postycommunitymanager.com';
const APPROVE = 'https://postycommunitymanager.com/api/week/2026-11-02/publish?uid=81&sig=x&exp=9';
const TZ = 'America/Argentina/Buenos_Aires';

function fixturePosts() {
  const days = [2, 3, 4, 5, 6, 7, 8, 9];
  return days.map((d, i) => ({
    id: 480 + i,
    caption: i === 0
      ? '¿Cuántas veces te sentiste abrumado con la organización de tu negocio? En Gesty estamos para que tus presupuestos, facturas y cobranzas estén en orden, sin que tengas que perseguir papeles ni perder tardes buscando una factura vieja en cajas.'
      : `Posteo del día ${d} con su texto completo y real, sin recortes ni puntos suspensivos al final.`,
    tipo: i === 0 ? 'organización' : 'novedad',
    scheduled_at: `2026-11-${String(d).padStart(2, '0')} 22:00:00`,
  }));
}

// ---- Caso normal: 8 posteos ES ----
const es = buildWeekEmailV4({
  biz: 'Gesty', lang: 'es', posts: fixturePosts(),
  approveUrl: APPROVE, baseUrl: BASE, tz: TZ,
});
ok(es.subject === 'Tu semana está lista: 8 posteos', 'ES subject exacto aprobado');
ok(es.html.includes('La semana de Gesty está lista'), 'ES título con nombre del negocio');
ok(es.html.includes('Si no me decís nada, los 8 salen así, uno por día a las 19:00.'), 'ES caja autopiloto exacta aprobada');
ok(es.html.includes('Aprobar semana'), 'ES botón Aprobar semana');
ok(es.html.includes('Aprobar los 8 posteos'), 'ES cierre Aprobar los 8 posteos');
ok(count(es.html, `href="${APPROVE.replace(/&/g, '&amp;')}"`) === 2, 'ES ambos botones apuntan al approveUrl (escapado)');
ok(es.html.includes('Tu semana de un vistazo'), 'ES título de la tirita');
ok(count(es.html, '<i>●</i>') === 8, 'ES tirita con 8 puntos (uno por día)');
for (const d of ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM', 'LUN']) ok(es.html.includes(`>${d}<`), 'ES tirita tiene ' + d);
ok(count(es.html, 'class="card-link"') === 8, 'ES 8 tarjetas');
for (let i = 0; i < 8; i++) {
  ok(es.html.includes(`${BASE}/#/app/post/${480 + i}`), 'ES deep link posteo ' + (480 + i));
}
ok(es.html.includes('LUN 2 NOV · 19:00'), 'ES fecha real primer posteo (22:00Z = 19:00 BA)');
ok(es.html.includes('LUN 9 NOV · 19:00'), 'ES fecha real último posteo');
ok(es.html.includes('sin recortes ni puntos suspensivos al final.'), 'ES pie completo sin truncar');
ok(!es.html.includes('…'), 'ES ningún … en todo el html');
ok(count(es.html, '<img') === 1, 'ES un solo <img> (avatar)');
ok(es.html.includes('<img class="avatar" src="data:image/png;base64,'), 'ES avatar como data URI');
ok(!/<img[^>]+src="https?:/.test(es.html), 'ES cero <img> externos');
ok(es.html.includes('¿Cuántas veces te sentiste abrumado con la organización de tu negocio?'), 'ES gancho = primera frase del pie');
ok(!es.html.includes('Asunto:'), 'ES sin div Asunto del mock (el asunto va en subject)');

// ---- Cruce de día por timezone ----
const f = _internal.fmtPostDate('2026-11-03 01:00:00', TZ, 'es');
ok(f && f.dow === 'LUN' && f.dom === '2' && f.hm === '22:00', 'tz: 01:00Z del 3 = LUN 2 22:00 BA (no MAR 3)');
ok(_internal.fmtPostDate('basura', TZ, 'es') === null, 'fecha inválida → null');

// ---- Gancho y escape ----
ok(_internal.hookOf('', 'testimonio', 'es') === 'testimonio', 'gancho fallback al tipo si no hay pie');
ok(_internal.hookOf('', '', 'es') === 'Posteo', 'gancho fallback a Posteo');
const escTest = buildWeekEmailV4({
  biz: 'A<B', lang: 'es',
  posts: [{ id: 1, caption: '<script>alert(1)</script> Hola.', tipo: '', scheduled_at: '2026-11-02 22:00:00' }],
  approveUrl: APPROVE, baseUrl: BASE, tz: TZ,
});
ok(!escTest.html.includes('<script>alert(1)</script>'), 'escape: script no sale crudo');
ok(escTest.html.includes('&lt;script&gt;'), 'escape: script sale escapado');
ok(escTest.subject === 'Tu semana está lista: 1 posteos', 'semana parcial usa el número real en el asunto');
ok(count(escTest.html, '<i>●</i>') === 1, 'semana parcial: tirita con 1 punto');

// ---- Variante EN (traducción directa) ----
const en = buildWeekEmailV4({
  biz: 'Gesty', lang: 'en', posts: fixturePosts(),
  approveUrl: APPROVE, baseUrl: BASE, tz: TZ,
});
ok(en.subject === 'Your week is ready: 8 posts', 'EN subject');
ok(en.html.includes("Gesty's week is ready"), 'EN título con nombre del negocio');
ok(en.html.includes("If you don't tell me otherwise, all 8 go out as-is, one a day at 7:00 PM."), 'EN caja autopiloto traducida');
ok(en.html.includes('Approve week'), 'EN botón Approve week');
ok(en.html.includes('Approve all 8 posts'), 'EN cierre Approve all 8 posts');
ok(en.html.includes('MON NOV 2 · 7:00 PM'), 'EN fecha real primer posteo');
ok(count(en.html, '<img') === 1 && en.html.includes('src="data:image/png;base64,'), 'EN avatar data URI único');
ok(count(en.html, 'class="card-link"') === 8, 'EN 8 tarjetas');

console.log(`test-email-semana-v4: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
