'use strict';
/* M108 — Calendario por país (2026-10-26). Cubre las 9 correcciones de la
   auditoría ~/workspace/equipo-posty/hidden_files/auditoria-calendario-2026-10-25.md.
   Determinista: las fechas se verifican vía allForYear / entriesForYear /
   activeCampaign con fechas explícitas, no con "hoy". Corre en el árbol
   (junto a server.js) o en ~/workspace/calendario-pais/ (usa work/). */

const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const TREE = fs.existsSync(path.join(__dirname, 'server.js')) ? __dirname : path.join(__dirname, 'work');
const { allForYear, upcomingEphemeris } = require(path.join(TREE, 'ephemeris.js'));
const { entriesForYear, easterSunday, getUpcoming, getRelevant } = require(path.join(TREE, 'calendar.js'));
const { CAMPAIGNS, activeCampaign, currentCampaign, campaignThemeLine } = require(path.join(TREE, 'campaigns.js'));
const serverJs = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const proactiveJs = fs.readFileSync(path.join(TREE, 'proactive.js'), 'utf8');

const findEph = (list, name, date) => list.find((e) => e.name === name && (!date || e.date === date));
const findCal = (list, title, date) => list.find((e) => e.title === title && (!date || e.date === date));
const D = (s) => s + 'T12:00:00';

/* ---------- 1. Ephemeris AR ---------- */
const ar26 = allForYear(2026, 'AR');
ok(findEph(ar26, 'Día de la Madre', '2026-10-18'), 'AR 2026: Madre 18/10 (3er dom oct)');
ok(findEph(ar26, 'Día del Padre', '2026-06-21'), 'AR 2026: Padre 21/6 (3er dom jun)');
ok(findEph(ar26, 'Día del Niño', '2026-08-16'), 'AR 2026: Niño 16/8 (3er dom ago)');
ok(findEph(ar26, 'Día de la Independencia', '2026-07-09'), 'AR 2026: Independencia 9/7');
ok(findEph(ar26, 'CyberMonday', '2026-11-02'), 'AR 2026: CyberMonday 2/11');
ok(findEph(ar26, 'CyberMonday', '2026-11-02').angle.includes('2–4/11'), 'AR 2026: ángulo CyberMonday conserva 2–4/11');
ok(findEph(ar26, 'Hot Sale', '2026-05-11'), 'AR 2026: Hot Sale 11/5 (2º lun may, CACE)');
ok(findEph(ar26, 'Día del Amigo', '2026-07-20'), 'AR 2026: Amigo 20/7');
ok(findEph(ar26, 'Carnaval', '2026-02-16') && findEph(ar26, 'Carnaval', '2026-02-17'), 'AR 2026: Carnaval 16–17/2');
ok(findEph(ar26, 'Día de la Primavera', '2026-09-21'), 'AR 2026: Primavera 21/9');
ok(findEph(ar26, 'Black Friday', '2026-11-27'), 'AR 2026: Black Friday 27/11 (último vie nov)');
ok(findEph(ar26, 'Pascuas', '2026-04-05'), 'AR 2026: Pascuas 5/4 intacta');

const ar27 = allForYear(2027, 'AR');
ok(findEph(ar27, 'Día de la Madre', '2027-10-17'), 'AR 2027: Madre 17/10');
ok(findEph(ar27, 'Día del Padre', '2027-06-20'), 'AR 2027: Padre 20/6');
ok(findEph(ar27, 'Día del Niño', '2027-08-15'), 'AR 2027: Niño 15/8');
ok(findEph(ar27, 'CyberMonday', '2027-11-01'), 'AR 2027: CyberMonday 1/11 (regla, no 2/11 fijo)');
ok(findEph(ar27, 'CyberMonday', '2027-11-01').angle.includes('1–3/11'), 'AR 2027: ángulo CyberMonday 1–3/11');
ok(findEph(ar27, 'Hot Sale', '2027-05-10'), 'AR 2027: Hot Sale 10/5 (patrón CACE)');
ok(findEph(ar27, 'Carnaval', '2027-02-08') && findEph(ar27, 'Carnaval', '2027-02-09'), 'AR 2027: Carnaval 8–9/2');
ok(findEph(ar27, 'Black Friday', '2027-11-26'), 'AR 2027: Black Friday 26/11');

/* ---------- 2. Ephemeris UY ---------- */
const uy26 = allForYear(2026, 'UY');
ok(findEph(uy26, 'Día de la Madre', '2026-05-10'), 'UY 2026: Madre 10/5 (2º dom may)');
ok(findEph(uy26, 'Día del Padre', '2026-07-12'), 'UY 2026: Padre 12/7 (2º dom jul)');
ok(findEph(uy26, 'Día del Niño', '2026-08-16'), 'UY 2026: Niño 16/8 (coincide con AR)');
ok(findEph(uy26, 'Día de la Independencia', '2026-08-25'), 'UY 2026: Independencia 25/8');
ok(!findEph(uy26, 'Día de la Independencia', '2026-07-09'), 'UY 2026: SIN 9/7 (no hay orgullo argentino)');
ok(!uy26.some((e) => e.name === 'CyberMonday'), 'UY 2026: SIN CyberMonday CACE (no inventado)');
ok(!uy26.some((e) => e.name === 'Hot Sale'), 'UY 2026: SIN Hot Sale AR');
ok(!uy26.some((e) => e.name === 'Día de la Primavera'), 'UY 2026: SIN Primavera');
ok(findEph(uy26, 'Día del Amigo', '2026-07-20'), 'UY 2026: Amigo 20/7 (ambos mercados)');
ok(findEph(uy26, 'Carnaval', '2026-02-16') && findEph(uy26, 'Carnaval', '2026-02-17'), 'UY 2026: Carnaval 16–17/2');
ok(findEph(uy26, 'Black Friday', '2026-11-27'), 'UY 2026: Black Friday 27/11');
const uy27 = allForYear(2027, 'UY');
ok(findEph(uy27, 'Día de la Madre', '2027-05-09'), 'UY 2027: Madre 9/5');
ok(findEph(uy27, 'Día del Padre', '2027-07-11'), 'UY 2027: Padre 11/7');
ok(allForYear(2026).some((e) => e.name === 'Día de la Madre' && e.date === '2026-10-18'), 'Default sin país = AR histórico (Madre octubre)');
// Ventana relativa: la Madre UY siempre cae en mayo, la AR siempre en octubre.
const wUy = upcomingEphemeris(400, 'UY');
const wAr = upcomingEphemeris(400, 'AR');
ok(wUy.filter((e) => e.name === 'Día de la Madre').every((e) => e.date.slice(5, 7) === '05'), 'Ventana UY: toda Madre en mayo');
ok(wAr.filter((e) => e.name === 'Día de la Madre').every((e) => e.date.slice(5, 7) === '10'), 'Ventana AR: toda Madre en octubre');
ok(!wUy.some((e) => e.name === 'CyberMonday'), 'Ventana UY 400 días: ningún CyberMonday');
ok(wAr.some((e) => e.name === 'CyberMonday'), 'Ventana AR 400 días: hay CyberMonday');

/* ---------- 3. calendar.js por país ---------- */
const calAr26 = entriesForYear(2026, 'AR');
ok(findCal(calAr26, 'Día del Padre', '2026-06-21'), 'Cal AR 2026: Padre 21/6 (no 15/6 fijo)');
ok(findCal(calAr26, 'Día del Niño', '2026-08-16'), 'Cal AR 2026: Niño 16/8 (no 17/8)');
ok(findCal(calAr26, 'Black Friday', '2026-11-27'), 'Cal AR 2026: Black Friday 27/11 (no 28/11)');
ok(!calAr26.some((e) => e.title === 'Cyber Monday'), 'Cal AR 2026: SIN Cyber Monday 1/12');
ok(findCal(calAr26, 'Día del Amigo', '2026-07-20'), 'Cal AR 2026: Amigo 20/7');
ok(findCal(calAr26, 'Carnaval', '2026-02-16') && findCal(calAr26, 'Carnaval', '2026-02-17'), 'Cal AR 2026: Carnaval 16–17/2');
ok(findCal(calAr26, 'Día de la Primavera', '2026-09-21'), 'Cal AR 2026: Primavera 21/9');
const hwAr = findCal(calAr26, 'Halloween', '2026-10-31');
ok(hwAr && JSON.stringify(hwAr.rubros) === JSON.stringify(['gastronomia', 'belleza', 'fiestas']), 'Cal AR: Halloween con criterio acotado (sin moda amplia)');
const calAr27 = entriesForYear(2027, 'AR');
ok(findCal(calAr27, 'Día del Padre', '2027-06-20'), 'Cal AR 2027: Padre 20/6');
ok(findCal(calAr27, 'Día del Niño', '2027-08-15'), 'Cal AR 2027: Niño 15/8');
ok(findCal(calAr27, 'Black Friday', '2027-11-26'), 'Cal AR 2027: Black Friday 26/11');

const calUy26 = entriesForYear(2026, 'UY');
ok(findCal(calUy26, 'Día de la Madre', '2026-05-10'), 'Cal UY 2026: Madre 10/5');
ok(findCal(calUy26, 'Día del Padre', '2026-07-12'), 'Cal UY 2026: Padre 12/7');
ok(findCal(calUy26, 'Día de la Independencia', '2026-08-25'), 'Cal UY 2026: Independencia 25/8');
ok(findCal(calUy26, 'Batalla de las Piedras', '2026-05-18'), 'Cal UY 2026: Batalla 18/5');
ok(findCal(calUy26, 'Natalicio de Artigas', '2026-06-19'), 'Cal UY 2026: Artigas 19/6');
ok(findCal(calUy26, 'Jura de la Constitución', '2026-07-18'), 'Cal UY 2026: Jura 18/7');
ok(findCal(calUy26, 'Día de los Difuntos', '2026-11-02'), 'Cal UY 2026: Difuntos 2/11');
for (const [t, d] of [['Día de la Independencia', '2026-07-09'], ['Día de la Memoria', '2026-03-24'], ['Revolución de Mayo', '2026-05-25'], ['Día de la Bandera', '2026-06-20'], ['Día de la Diversidad', '2026-10-12'], ['Día de la Soberanía', '2026-11-20'], ['Día de la Virgen', '2026-12-08']]) {
  ok(!findCal(calUy26, t, d), `Cal UY 2026: SIN feriado AR ${t} ${d}`);
}
ok(!calUy26.some((e) => e.title === 'Cyber Monday'), 'Cal UY 2026: SIN Cyber Monday');
const hwUy = findCal(calUy26, 'Halloween', '2026-10-31');
ok(hwUy && JSON.stringify(hwUy.rubros) === JSON.stringify(['gastronomia', 'belleza', 'fiestas']), 'Cal UY: Halloween con criterio acotado');

ok(JSON.stringify(easterSunday(2026)) === JSON.stringify({ m: 4, d: 5 }), 'Computus: Pascua 2026 = 5/4');
ok(JSON.stringify(easterSunday(2027)) === JSON.stringify({ m: 3, d: 28 }), 'Computus: Pascua 2027 = 28/3');
ok(JSON.stringify(easterSunday(2030)) === JSON.stringify({ m: 4, d: 21 }), 'Computus: Pascua 2030 = 21/4 (igual tabla)');
const calUs27 = entriesForYear(2027, 'US');
for (const [t, d] of [['Easter', '2027-03-28'], ["Mother's Day", '2027-05-09'], ['Memorial Day', '2027-05-31'], ["Father's Day", '2027-06-20'], ['Labor Day', '2027-09-06'], ['Thanksgiving', '2027-11-25'], ['Black Friday', '2027-11-26'], ['Cyber Monday', '2027-11-29'], ['Martin Luther King Jr. Day', '2027-01-18'], ["Presidents' Day", '2027-02-15']]) {
  ok(findCal(calUs27, t, d), `Cal US 2027: ${t} ${d} (regla, no fijo 2026)`);
}
const calUs26 = entriesForYear(2026, 'US');
for (const [t, d] of [['Easter', '2026-04-05'], ["Mother's Day", '2026-05-10'], ['Memorial Day', '2026-05-25'], ["Father's Day", '2026-06-21'], ['Labor Day', '2026-09-07'], ['Thanksgiving', '2026-11-26'], ['Black Friday', '2026-11-27'], ['Cyber Monday', '2026-11-30'], ['Small Business Saturday', '2026-11-28']]) {
  ok(findCal(calUs26, t, d), `Cal US 2026: ${t} ${d} (sin cambio vs fijos viejos)`);
}
ok(Array.isArray(getUpcoming(14, 'es', 'UY')) && Array.isArray(getRelevant('gastronomia', 14, 'es', 'UY')), 'getUpcoming/getRelevant aceptan pais sin romper');

/* ---------- 4. campaigns.js: tabla + reglas anuales ---------- */
const hs26 = CAMPAIGNS.find((c) => c.id === 'hot-sale-ar-2026');
ok(!!hs26 && hs26.start === '2026-05-04' && hs26.end === '2026-05-17', 'Existe hot-sale-ar-2026 (ventana 4–17/5)');
ok(JSON.stringify(hs26.paises) === JSON.stringify(['AR']), 'Hot Sale 2026 es AR-only');
const md26 = CAMPAIGNS.find((c) => c.id === 'madre-ar-2026');
ok(!!md26 && md26.start === '2026-10-11' && md26.end === '2026-10-18', 'Existe madre-ar-2026 (ventana 11–18/10)');
const aHs = activeCampaign(D('2026-05-11'));
ok(aHs && aHs.id === 'hot-sale-ar-2026', '2026-05-11: Hot Sale activo');
ok(campaignThemeLine('2026-05-11', 'moda') !== '' && campaignThemeLine('2026-05-11', 'barberia') === '', 'Hot Sale: moda entra, barberia fuera');
ok(activeCampaign(D('2026-11-02')) && activeCampaign(D('2026-11-02')).id === 'cybermonday-ar-2026', '2026-11-02: fechada gana (sin duplicar anual)');
ok(activeCampaign(D('2026-11-05')) === null, '2026-11-05: ninguna campaña (anual no rige en 2026)');
ok(activeCampaign(D('2027-05-11')) && activeCampaign(D('2027-05-11')).id === 'hot-sale-ar-2027', '2027-05-11: Hot Sale anual');
ok(activeCampaign(D('2027-11-02')) && activeCampaign(D('2027-11-02')).id === 'cybermonday-ar-2027', '2027-11-02: CyberMonday anual');
ok(activeCampaign(D('2027-10-15')) && activeCampaign(D('2027-10-15')).id === 'madre-ar-2027', '2027-10-15: Madre anual (capa de octubre)');
ok(activeCampaign(D('2027-11-26')) && activeCampaign(D('2027-11-26')).id === 'black-friday-2027', '2027-11-26: Black Friday anual');
ok(activeCampaign(D('2027-12-15')) && activeCampaign(D('2027-12-15')).id === 'fiestas-2027', '2027-12-15: Fiestas anual (horizonte roto)');
ok(activeCampaign(D('2028-02-14')) && activeCampaign(D('2028-02-14')).id === 'san-valentin-2028', '2028-02-14: San Valentín anual');
ok(activeCampaign(D('2028-11-24')) && activeCampaign(D('2028-11-24')).id === 'black-friday-2028', '2028-11-24: Black Friday anual');
ok(activeCampaign(D('2028-05-08')) && activeCampaign(D('2028-05-08')).id === 'hot-sale-ar-2028', '2028-05-08: Hot Sale anual');
ok(activeCampaign(D('2027-04-15')) === null, '2027-04-15: sin campaña inventada en abril');
ok(activeCampaign(D('2027-06-01')) === null, '2027-06-01: sin campaña inventada en junio');
// Filtro por país: las AR-only no llegan a UY; sin país, sin filtro (histórico).
ok(campaignThemeLine('2027-10-15', 'moda', 'es', 'UY') === '', 'Madre anual: UY no la recibe');
ok(campaignThemeLine('2027-10-15', 'moda', 'es', 'AR') !== '', 'Madre anual: AR sí la recibe');
ok(campaignThemeLine('2027-10-15', 'moda', 'es') !== '', 'Madre anual: sin país no se filtra (histórico)');
ok(campaignThemeLine('2027-11-02', 'moda', 'es', 'UY') === '', 'CyberMonday anual: UY no lo recibe');
ok(currentCampaign('2027-10-15', 'es', 'UY') === null, 'currentCampaign octubre 2027 UY: null (sin capa AR)');
const bf26 = CAMPAIGNS.find((c) => c.id === 'black-friday-2026');
ok(bf26 && !bf26.angle.es.includes('30/11'), 'Ángulo ES Black Friday: sin cita US 30/11');
ok(bf26 && bf26.angle.en.includes('Nov 30'), 'Ángulo EN Black Friday: conserva Nov 30 (US real)');
const ver27 = CAMPAIGNS.find((c) => c.id === 'verano-2027');
ok(ver27 && !ver27.angle.es.includes('US:'), 'Ángulo ES verano: sin mezcla US');
ok(ver27 && !ver27.angle.en.includes('southern'), 'Ángulo EN verano: sin mezcla sur');

/* ---------- 5. Estáticos: cableado en server.js / proactive.js ---------- */
for (const s of [
  'function ephemerisFor(profile, pais)',
  'upcomingEphemeris(12, pais)',
  'function ephemerisWindowFor(profile, days, pais)',
  'upcomingEphemeris(days || 21, pais)',
  'ephemerisFor(getProfile(uid), adCountry(uid))',
  'ephemeris: ephemerisFor(profile, adCountry(uid))',
  'ephemeris: ephemerisWindowFor(profile, 21, adCountry(uid))',
  'albumMissionPick(getProfile(uid) || {}, weekKey, adCountry(uid))',
  'getRelevant(p && p.category, days, u && u.lang, paisCal)',
  'currentCampaign(new Date(), lang, paisCamp)',
  'req.query.pais',
]) ok(serverJs.includes(s), `server.js cablea: ${s.slice(0, 60)}`);
const iFor = serverJs.indexOf('function ephemerisFor');
const segFor = iFor >= 0 ? serverJs.slice(iFor, iFor + 800) : '';
ok(segFor.includes('catsMatch(eph,'), 'ephemerisFor (800) conserva catsMatch');
ok(segFor.includes('profile.description'), 'ephemerisFor (800) conserva description');
ok(segFor.includes('EPHEMERIS_GIFT_OK.test(cat)'), 'ephemerisFor (800) conserva gift gate');
const iWin = serverJs.indexOf('function ephemerisWindowFor');
const segWin = iWin >= 0 ? serverJs.slice(iWin, iWin + 900) : '';
ok(segWin.includes('catsMatch(e,'), 'ephemerisWindowFor (900) conserva catsMatch');
ok(segWin.includes('profile.description'), 'ephemerisWindowFor (900) conserva description');
ok(segWin.includes('EPHEMERIS_GIFT_OK.test(cat)'), 'ephemerisWindowFor (900) conserva gift gate');
const canario = (serverJs.match(/HEADLINE_INFINITIVES/g) || []).length;
ok(canario === 3, `canario HEADLINE_INFINITIVES = 3 (dio ${canario})`);
ok(proactiveJs.includes('upcomingEphemeris(9, paisPro)'), 'proactive.js pasa país a upcomingEphemeris');
ok(proactiveJs.includes('paisPro'), 'proactive.js tiene espejo de país');

console.log(`test-calendario-pais: ${okN} ok / ${failN} fallas`);
process.exit(failN ? 1 : 0);
