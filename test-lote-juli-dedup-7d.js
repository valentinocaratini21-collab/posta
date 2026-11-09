#!/usr/bin/env node
// LOTE JULI-DEDUP-7D (9/11) — la semana real se genera en corridas de
// días distintos con workers en paralelo, y las compuertas intra-semana
// (DEDUP-EXACTA, M79-dispositivo) solo ven los previos que les pasa el
// llamador. Tres defectos reales de producción, cuenta 12, semana
// 2026-11-09 (auditoría 9/11, vía API admin):
// (1) id 584 = id 580 BYTE-IDÉNTICO («¿Cuántas veces te pasó de mirar
//     tu Instagram y no saber qué postear...?», image 7/11 19:23 →
//     video/reel 9/11 12:17, 41 h aparte): el chequeo de duplicado del
//     pipeline miraba solo 24 h — 41 h > 24 h — y 580 tiene week_key
//     VACÍO, así que weekPrevCaptions tampoco lo veía.
// (2) ids 585/586 abren con el MISMO dispositivo («¿Cuántas veces te
//     pasó…?») con 24 s de diferencia: cada worker fotografió los
//     previos (runPrevCaptions.slice()) antes de que el otro insertara.
//     580/584/585 + la variante 586 = 4 posteos con la misma apertura
//     en una semana (el checklist ítem 11/12 la permite UNA vez).
// (3) id 583 y 585 fallan captionPasses en soledad (583: empalme en el
//     cuerpo — «Contame, ¿qué tema querés que hablemos esta semana?»;
//     585: sin CTA) y aun así están scheduled: el «mejor candidato» de
//     generateContent + marca-sin-freno los deja pasar. NO se toca en
//     este lote: se registra (ver log 9/11).
// El fix (2 archivos): generator.js exporta captionWeekClash —
// re-chequeo de último momento que corre captionPasses contra previos
// FRESCOS y solo frena por reglas que dependen de previos (DEDUP,
// M79-dispositivo, CUERPO-57-dispositivo-fuera, D8) — y server.js
// (generateWeekDrafts) lo corre justo antes del INSERT contra la semana
// viva en la DB (7 días, sin mirar week_key, draft/scheduled/
// published). El resto de la puerta sigue como marca, no como freno.
// Uso: node test-lote-juli-dedup-7d.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const gen = require('./generator');
const serverSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 400) : '')); }
}

// --- Captions reales de producción (cuenta 12, 7-9/11, vía API admin) ---
const CAP580 = '¿Cuántas veces te pasó de mirar tu Instagram y no saber qué postear...? 😅\nCon Posty, no tenés que pensar más. Yo me encargo de crear tu semana de contenido atractivo y alineado a tu marca. \nProbalos gratis por 3 días y olvidate de la indecisión. ¡Escribime por DM!';
const CAP585 = '¿Cuántas veces te pasó de mirar tu Instagram y no saber qué postear...? 😅\nCon Posty, tu semana de contenido está armada y lista para que vos solo apruebes. Diseños, textos y hashtags pensados para tu negocio. Dejá que me encargue de todo y disfrutá del resultado.';
const CAP586 = '¿Cuántas veces te pasó que mirás tu Instagram y no sabés qué postear? 😅 \nEn Posty, me encargo de tu cuenta a diario: armando tu semana de posteos, diseños y textos con la onda de tu negocio. \nProbalo gratis por 3 días y olvidate de pensar en qué subir. ¡Escribime por DM!';
const CAP583 = 'Yo me ocupo de todo: diseño, texto y hashtags para que tu semana de contenido esté lista.\n\n¿Listo para liberarte de pensar en eso? Contame, ¿qué tema querés que hablemos esta semana?';
const CAP_OK = 'El flat white sale con el grano que tostamos hoy a la mañana. ☕\nVení a probarlo al local, estamos hasta las 20 h. Escribinos por DM y te lo dejamos listo.';

console.log('== captionWeekClash existe y se exporta ==');
ok('captionWeekClash es función exportada', typeof gen.captionWeekClash === 'function');
if (typeof gen.captionWeekClash !== 'function') {
  // PRE en prístino: sin el helper no hay nada que re-chequear — el
  // resto de la suite no puede correr (es la reproducción del bug).
  console.log('\nTOTAL: 1 ok, 1 fallas (helper ausente: el re-chequeo no existe en este árbol)');
  process.exit(1);
}

console.log('== choques reales de la semana 2026-11-09 (deben frenar) ==');
{
  const r = gen.captionWeekClash(CAP580, [CAP580], 'Posty');
  ok('580=584 duplicado exacto (41 h aparte) → choque DEDUP', r && r.ok === false && /DEDUP/.test(r.reason || ''), JSON.stringify(r));
}
{
  const r = gen.captionWeekClash(CAP586, [CAP585], 'Posty');
  ok('586 vs 585 mismo dispositivo (24 s aparte) → choque M79', r && r.ok === false && /dispositivo de apertura repetido/.test(r.reason || ''), JSON.stringify(r));
}
{
  const r = gen.captionWeekClash(CAP586, [CAP580], 'Posty');
  ok('586 vs 580 mismo dispositivo → choque M79', r && r.ok === false && /dispositivo de apertura repetido/.test(r.reason || ''), JSON.stringify(r));
}
{
  // CUERPO-57: la familia «¿cuántas veces te…?» ya abrió un previo y
  // reaparece como segunda oración (no como apertura).
  const prev = '¿Cuántas veces te pasó de no saber qué postear? 😅\nTe armamos la semana. Escribinos por DM.';
  const cand = 'Tu semana ya está armada, con tus fotos y tus colores.\n¿Y sabés qué? ¿Cuántas veces te pasó de mirar el feed vacío? Escribinos por DM y la dejamos lista.';
  const r = gen.captionWeekClash(cand, [prev], 'Posty');
  ok('dispositivo fuera de la apertura (CUERPO-57) → choque', r && r.ok === false && /fuera de la apertura/.test(r.reason || ''), JSON.stringify(r));
}
{
  // D8: ancla léxica repetida («en esta muestra»).
  const prev = 'En esta muestra te dejamos la semana armada para mirar. Escribinos por DM.';
  const cand = 'En esta muestra vas a ver cómo queda tu feed. Escribinos por DM y empezamos.';
  const r = gen.captionWeekClash(cand, [prev], 'Posty');
  ok('ancla léxica repetida (D8) → choque', r && r.ok === false && /\(D8\)/.test(r.reason || ''), JSON.stringify(r));
}

console.log('== no falsos positivos (no deben frenar) ==');
{
  const r = gen.captionWeekClash(CAP_OK, [CAP580, CAP585, CAP586], 'Posty');
  ok('caption distinto con otra apertura → pasa', r && r.ok === true, JSON.stringify(r));
}
{
  const r = gen.captionWeekClash(CAP586, [], 'Posty');
  ok('sin previos frescos → pasa (sin datos no se frena)', r && r.ok === true, JSON.stringify(r));
}
{
  // 585 sin CTA falla captionPasses, pero NO es un choque de semana:
  // el re-chequeo no cambia el marca-no-freno de hoy.
  const unrelated = 'El corte de esta semana sale con fade parejo y navaja. Reservá tu turno por DM.';
  const r = gen.captionWeekClash(CAP585, [unrelated], 'Posty');
  ok('585 sin CTA vs previos no relacionados → NO es choque (marca, no freno)', r && r.ok === true, JSON.stringify(r));
}
{
  // 583 empalme en el cuerpo vs previos no relacionados → tampoco choque.
  const unrelated = 'El corte de esta semana sale con fade parejo y navaja. Reservá tu turno por DM.';
  const r = gen.captionWeekClash(CAP583, [unrelated], 'Posty');
  ok('583 empalme en cuerpo vs previos no relacionados → NO es choque', r && r.ok === true, JSON.stringify(r));
}
{
  // M79 de cuerpo sin previos («¿Sabías que…?» como apertura de
  // oración) NO es choque: la (M79) a secas no alcanza.
  const cand = 'El café sale del tostador a la mañana. ¿Sabías que lo molemos en el momento? Vení por DM.';
  const r = gen.captionWeekClash(cand, [CAP_OK], 'Posty');
  ok('muletilla de cuerpo (M79) sin previos → NO es choque', r && r.ok === true, JSON.stringify(r));
}
{
  // Tuteo (CUERPO-57) sin dispositivo repetido → NO es choque.
  const cand = '¿Te imaginas tu feed ordenado toda la semana? Escribinos por DM y lo dejamos listo.';
  const r = gen.captionWeekClash(cand, [CAP_OK], 'Posty');
  ok('tuteo (CUERPO-57) sin dispositivo repetido → NO es choque', r && r.ok === true, JSON.stringify(r));
}
{
  // Mismo dispositivo hace 8 días NO es choque (la ventana es 7 días):
  // el helper no lo sabe — lo decide la consulta — pero el helper con
  // prevs viejos EXCLUIDOS pasa, que es el contrato.
  const r = gen.captionWeekClash(CAP586, [CAP_OK], 'Posty');
  ok('mismo dispositivo sin el previo en la ventana → pasa', r && r.ok === true, JSON.stringify(r));
}

console.log('== ventana 7 días: el predicado SQL (simulación fiel) ==');
// created_at es 'YYYY-MM-DD HH:MM:SS': el orden lexicográfico es el
// cronológico, igual que en SQLite. Filas que imitan la semana real:
// 580 (hace 41 h, week_key VACÍO), 583 (hoy), una cancelada (ayer),
// una de hace 8 días. La ventana nueva (-7 days) tiene que traer 580
// y 583; la vieja (-1 day) pierde a 580; la cancelada y la vieja no
// entran en ninguna.
{
  const now = new Date('2026-11-09T17:00:00Z');
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  const h = (n) => new Date(now.getTime() - n * 3600 * 1000);
  const rows = [
    { id: 580, caption: CAP580, status: 'scheduled', week_key: '', created_at: fmt(h(41)) },
    { id: 583, caption: CAP583, status: 'scheduled', week_key: '2026-11-09', created_at: fmt(h(11)) },
    { id: 524, caption: 'reel viejo cancelado', status: 'cancelled', week_key: '2026-10-26', created_at: fmt(h(20)) },
    { id: 470, caption: 'posteo de hace 8 días', status: 'published', week_key: '2026-11-02', created_at: fmt(h(8 * 24 + 1)) },
  ];
  const inWindow = (row, days) => {
    const cut = new Date(now.getTime() - days * 24 * 3600 * 1000);
    return ['draft', 'scheduled', 'published'].includes(row.status)
      && String(row.caption || '').trim() !== ''
      && new Date(row.created_at + 'Z') > cut;
  };
  const fresh7 = rows.filter((r) => inWindow(r, 7)).map((r) => r.id);
  const fresh1 = rows.filter((r) => inWindow(r, 1)).map((r) => r.id);
  ok('ventana 7d trae 580 (41 h, week_key vacío) + 583', fresh7.includes(580) && fresh7.includes(583) && fresh7.length === 2, 'trae: ' + fresh7.join(','));
  ok('ventana vieja 24h PIERDE a 580 (el hueco exacto)', !fresh1.includes(580) && fresh1.includes(583), 'trae: ' + fresh1.join(','));
  ok('cancelada y 8 días afuera en ambas ventanas', !fresh7.includes(524) && !fresh7.includes(470) && !fresh1.includes(524) && !fresh1.includes(470));
}

console.log('== cableado en server.js ==');
ok('server.js importa captionWeekClash', /captionWeekClash/.test(serverSrc) && /require\('.\/generator'\)/.test(serverSrc));
ok('server.js trae la consulta de 7 días sin week_key', serverSrc.includes("datetime('now', '-7 days')") && serverSrc.includes("status IN ('draft', 'scheduled', 'published')"));
ok('server.js llama captionWeekClash antes del INSERT', /captionWeekClash\(caption, freshPrevs/.test(serverSrc));
{
  // La función generateWeekDrafts va de su definición hasta la siguiente
  // función de nivel superior (nextWeekSweep). Dentro NO debe quedar
  // rastro del dupStmt de 24 h. Los otros '-1 day' del archivo son de
  // rutas manuales (POST /api/posts: el usuario pega el caption, su
  // intención es explícita — esa ventana se deja en 24 h a propósito)
  // y de proactive_asks, fuera de este lote.
  const start = serverSrc.indexOf('async function generateWeekDrafts');
  const end = serverSrc.indexOf('async function nextWeekSweep', start);
  const body = serverSrc.slice(start, end);
  ok('generateWeekDrafts ya no tiene dupStmt de 24 h', start >= 0 && end > start && !/dupStmt/.test(body) && !/'-1 day'/.test(body), 'dupStmt: ' + /dupStmt/.test(body) + ", '-1 day': " + /'-1 day'/.test(body));
}

console.log(`\nTOTAL: ${pass} ok, ${fail} fallas`);
if (fail) { console.log('FALLAS: ' + fails.join(' | ')); process.exit(1); }
