'use strict';
/* ÍTEM 2 «ARMA TODO» (P25+P26, paquete de Uma 2026-10-24) — CyberMonday AR
   como campaña + efeméride con lista propia por fecha (catsMatch): la fecha
   decide por categoría/nombre/descripción del negocio y, sin lista propia,
   manda el gate de regalo de siempre. Unidad + estáticos sobre server.js. */

const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const { CAMPAIGNS, activeCampaign, currentCampaign, campaignThemeLine } = require('./campaigns.js');
const { upcomingEphemeris, catsMatch } = require('./ephemeris.js');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Fechas de ventana al mediodía local: el borde día exacto no depende de la
// zona horaria de quien corre el test.
const D = (s) => s + 'T12:00:00';

/* ---------- P25: CyberMonday AR en campaigns.js ---------- */
const cyber = CAMPAIGNS.find((c) => c.id === 'cybermonday-ar-2026');
ok(!!cyber, 'existe la campaña cybermonday-ar-2026');
ok(cyber && cyber.start === '2026-10-26' && cyber.end === '2026-11-04', 'ventana CyberMonday 2026-10-26 → 2026-11-04');
ok(CAMPAIGNS.indexOf(cyber) < CAMPAIGNS.findIndex((c) => c.id === 'black-friday-2026'), 'CyberMonday va antes de Black Friday');

const curEs = currentCampaign(new Date('2026-11-02'), 'es');
ok(curEs && curEs.id === 'cybermonday-ar-2026', 'currentCampaign(2026-11-02, es) es CyberMonday');
ok(curEs && curEs.name === 'CyberMonday', 'currentCampaign es: name CyberMonday');
const curEn = currentCampaign(new Date('2026-11-02'), 'en');
ok(curEn && curEn.id === 'cybermonday-ar-2026' && curEn.name === 'Cyber Monday', 'currentCampaign(2026-11-02, en) name Cyber Monday');

ok(campaignThemeLine('2026-10-28', 'moda') !== '', 'themeLine 2026-10-28 moda entra en CyberMonday');
ok(campaignThemeLine('2026-10-28', 'barberia') === '', 'themeLine 2026-10-28 barberia queda fuera (turnos)');
ok(campaignThemeLine('2026-10-28', 'peluqueria') === '', 'themeLine 2026-10-28 peluqueria queda fuera (turnos)');

/* ---------- ventana de la campaña (sin regresión) ---------- */
ok(activeCampaign(D('2026-10-25')) === null, '2026-10-25: ninguna campaña activa');
const a26 = activeCampaign(D('2026-10-26'));
ok(a26 && a26.id === 'cybermonday-ar-2026', '2026-10-26: abre CyberMonday');
const a04 = activeCampaign(D('2026-11-04'));
ok(a04 && a04.id === 'cybermonday-ar-2026', '2026-11-04: último día de CyberMonday');
ok(activeCampaign(D('2026-11-05')) === null, '2026-11-05: CyberMonday ya cerró');
const a27 = activeCampaign(D('2026-11-27'));
ok(a27 && a27.id === 'black-friday-2026', '2026-11-27: Black Friday intacto (sin regresión)');

/* ---------- P25+P26: efemérides con lista propia ---------- */
const ephs = upcomingEphemeris(400);
ok(Array.isArray(ephs) && ephs.length > 0, 'upcomingEphemeris(400) devuelve fechas');

const halloween = ephs.find((e) => e.name === 'Halloween');
ok(!!halloween, 'hay Halloween en la ventana de 400 días');
ok(halloween && typeof halloween.cats === 'string' && halloween.cats.length > 0, 'Halloween trae cats propias');
ok(halloween && catsMatch(halloween, 'pasteleria') === true, 'Halloween matchea pasteleria');
ok(halloween && catsMatch(halloween, 'peluqueria') === false, 'Halloween NO matchea peluqueria');

const cyberEph = ephs.find((e) => e.name === 'CyberMonday');
ok(!!cyberEph, 'hay CyberMonday en las efemérides');
ok(cyberEph && cyberEph.date.endsWith('11-02'), 'CyberMonday cae el 2/11');
ok(cyberEph && catsMatch(cyberEph, 'moda') === true, 'CyberMonday matchea moda');
ok(cyberEph && catsMatch(cyberEph, 'barberia') === false, 'CyberMonday NO matchea barberia');

/* ---------- catsMatch: con cats decide, sin cats no opina ---------- */
ok(typeof catsMatch === 'function', 'ephemeris exporta catsMatch');
ok(catsMatch(halloween, 'maquillaje artistico') === true, 'catsMatch: maquillaje artistico entra en Halloween');
ok(catsMatch(halloween, 'peluqueria') === false, 'catsMatch: peluqueria no entra en Halloween');
ok(catsMatch(halloween, 'Makeup by Luz') === true, 'catsMatch: el nombre del negocio (Makeup by Luz) entra en Halloween');
const sinCats = ephs.find((e) => !e.cats);
ok(!!sinCats, 'hay efemérides sin cats en la ventana');
ok(catsMatch(sinCats, 'pasteleria moda regalos') === null, 'catsMatch sin cats devuelve null (sin opinión)');
ok(catsMatch(null, 'moda') === null, 'catsMatch sin efeméride devuelve null');
ok(catsMatch({ name: 'Libre' }, 'moda') === null, 'catsMatch con objeto sin cats devuelve null');

/* ---------- estáticos sobre server.js ---------- */
ok(serverJs.includes("const { upcomingEphemeris, catsMatch } = require('./ephemeris');"), 'server.js importa catsMatch junto a upcomingEphemeris');

const iFor = serverJs.indexOf('function ephemerisFor');
ok(iFor >= 0, 'server.js tiene ephemerisFor');
const segFor = iFor >= 0 ? serverJs.slice(iFor, iFor + 800) : '';
ok(segFor.includes('catsMatch(eph,'), 'ephemerisFor usa catsMatch');
ok(segFor.includes('profile.description'), 'ephemerisFor suma la descripción del perfil al texto');
ok(segFor.includes('EPHEMERIS_GIFT_OK.test(cat)'), 'ephemerisFor conserva EPHEMERIS_GIFT_OK como fallback');

const iWin = serverJs.indexOf('function ephemerisWindowFor');
ok(iWin >= 0, 'server.js tiene ephemerisWindowFor');
const segWin = iWin >= 0 ? serverJs.slice(iWin, iWin + 900) : '';
ok(segWin.includes('catsMatch(e,'), 'ephemerisWindowFor usa catsMatch por entrada');
ok(segWin.includes('profile.description'), 'ephemerisWindowFor suma la descripción del perfil al texto');
ok(segWin.includes('EPHEMERIS_GIFT_OK.test(cat)'), 'ephemerisWindowFor conserva EPHEMERIS_GIFT_OK como fallback');

ok(serverJs.includes('EPHEMERIS_GIFT_OK'), 'EPHEMERIS_GIFT_OK sigue presente en server.js');
const headlineCount = (serverJs.match(/HEADLINE_INFINITIVES/g) || []).length;
ok(headlineCount === 3, `canario MORA-6: HEADLINE_INFINITIVES aparece 3 veces en server.js (dio ${headlineCount})`);

console.log(`test-campaigns-ephemeris: ${okN} ok / ${failN} fallas`);
process.exit(failN ? 1 : 0);
