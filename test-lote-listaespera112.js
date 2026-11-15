#!/usr/bin/env node
/* LOTE LISTA-ESPERA-112 (v1099) — la lista de espera re-fechada al 1/12/2026.
 * Orden de Valentino (14/11, «Subi todo», lote 4 de 5): la página de lista de
 * espera decía «1 de febrero» y tiene que decir la fecha de lanzamiento
 * vigente, 1/12/2026 («1 de diciembre» ES · «December 1» EN), en el formato
 * que cada superficie ya usa. Alcance: SOLO las superficies que DICEN la
 * fecha vieja ligada a la espera — las dos páginas servidas (title, og:title
 * y h1), la cita del texto en el comentario de waitlist.js y los pins de la
 * suite de la superficie. La VENTANA del gate NO se re-fechó en este
 * lote (es el mecanismo de encendido, no el texto); la movió después el
 * lote VENTANA-GATE por decisión de Valentino del 15/11 (28–30/11/2026,
 * apertura 1/12/2026), y la sección 3 de esta suite se actualizó con ese
 * movimiento. Fundadores ya decía 1 de diciembre (no se toca).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const R = __dirname;
const read = (p) => fs.readFileSync(path.join(R, p), 'utf8');
const occ = (text, s) => text.split(s).length - 1;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.log('  FAIL - ' + name); }
}

const ES = read('public/lista-espera.html');
const EN = read('public/en-lista-espera.html');
const WLJS = read('waitlist.js');
const SRV = read('server.js');
const APP = read('public/app.js');
const IDX = read('public/index.html');
const IDXEN = read('public/en/index.html');
const GEN = read('generator.js');
const EA = read('email-audit.js');
const DB = read('db.js');
const SCH = read('scheduler.js');
const SF = read('serie-feed.js');

// ---- 1. La fecha nueva, en las tres posiciones de cada página ----
ok(occ(ES, 'Posty abre el 1 de diciembre') === 3, 'ES: «Posty abre el 1 de diciembre» x3 (title, og:title, h1)');
ok(occ(EN, 'Posty opens on December 1') === 3, 'EN: «Posty opens on December 1» x3 (title, og:title, h1)');
ok(ES.includes('<title>Posty abre el 1 de diciembre</title>'), 'ES: title nuevo');
ok(EN.includes('<title>Posty opens on December 1</title>'), 'EN: title nuevo');
ok(ES.includes('<h1>Posty abre el 1 de diciembre</h1>'), 'ES: h1 nuevo');
ok(EN.includes('<h1>Posty opens on December 1</h1>'), 'EN: h1 nuevo');

// ---- 2. La fecha vieja no aparece en ninguna superficie de la espera ----
ok(occ(ES, 'febrero') === 0, 'ES: «febrero» x0');
ok(occ(EN, 'February') === 0, 'EN: «February» x0');
ok(occ(WLJS, 'Posty abre el 1 de febrero') === 0, 'waitlist.js: cita vieja x0');
ok(occ(WLJS, '«Posty abre el 1 de diciembre»') === 1, 'waitlist.js: cita del texto actualizada x1');

// ---- 3. La ventana del gate: la movió VENTANA-GATE (15/11), no este lote ----
ok(WLJS.includes('const WAITLIST_START_KEY = 20261128;'), 'ventana movida (15/11): START 20261128');
ok(WLJS.includes('const WAITLIST_END_KEY = 20261130;'), 'ventana movida (15/11): END 20261130');
ok(WLJS.includes('const WAITLIST_LAST_DAY_KEY = 20261130;'), 'ventana movida (15/11): LAST_DAY 20261130');
const WL = require('./waitlist');
ok(WL.waitlistPhaseOf(new Date('2026-11-29T12:00:00Z')) === 'waitlist', 'la ventana abre el 29/11/2026');
ok(WL.waitlistPhaseOf(new Date('2026-12-01T12:00:00Z')) === 'normal', 'el 1/12/2026 es la apertura: web normal');

// ---- 4. Lo servido por el módulo trae la fecha nueva ----
const servedEs = WL.renderWaitlistPage('es', false);
ok(servedEs.includes('Posty abre el 1 de diciembre'), 'render ES: titular nuevo');
ok(!servedEs.includes('febrero'), 'render ES: sin febrero');
const servedEnLast = WL.renderWaitlistPage('en', true);
ok(servedEnLast.includes('Posty opens on December 1'), 'render EN: titular nuevo');
ok(servedEnLast.includes('Opens tomorrow.'), 'render EN último día: «Opens tomorrow.» intacto');

// ---- 5. Stamps de la cadena (frescura) ----
ok(SRV.includes("const BUILD_ID = '20261105-v1099';"), 'BUILD_ID v1099');
ok(APP.includes("const PZ_BUILD = '20261105-v1099';"), 'PZ_BUILD v1099 en paridad');
ok(IDX.includes('app.js?v=746'), 'index ES: app.js?v=746');
ok(!IDXEN.includes('app.js?v=746'), 'index EN: sin stamp de app.js (no lo carga)');
ok(IDX.includes('styles.css?v=20261286') && IDXEN.includes('styles.css?v=20261286'), 'styles sin tocar en ambos index (20261286)');

// ---- 6. Marcadores ajenos intactos ----
ok(occ(SRV, 'connect_url') >= 13, 'v1093: connect_url en server.js');
ok(occ(APP, 'pzAdsAutorizarPagina') >= 4, 'v1093: pzAdsAutorizarPagina en app.js');
ok(occ(SF, 'mapaDiasSerie') >= 9 && occ(SRV, 'mapaDiasSerie') >= 1, 'v1094: mapaDiasSerie');
ok(occ(SRV, 'serieFeedSweep') >= 1 && occ(SCH, 'serieFeedSweep') >= 1, 'v1094: serieFeedSweep');
ok(occ(SCH, "'7 * * * *'") >= 1, 'v1094: cron :07 en scheduler.js');
ok(occ(SRV, '/api/admin/posts/:id/descartar') >= 1, 'v1095: ruta de descarte admin');
ok(occ(GEN, 'zapatosGuide133') >= 2 && GEN.includes('zapatosGuide62, zapatosGuide133'), 'v1096: guide133 cableada tras guide62 (poda intacta)');
ok(DB.includes('ADD COLUMN industry') && DB.includes('ADD COLUMN city'), 'v1097: columnas industry/city en db.js');
ok(occ(EA, 'starWhyLine') >= 1, 'v1098: starWhyLine en email-audit.js');
ok(occ(APP, 'pzFormatoLineaHTML') >= 1, 'v1098: pzFormatoLineaHTML en app.js');

// ---- 7. Fundadores ya decía la fecha nueva: intacto ----
const FUND = read('public/fundadores.html');
ok(FUND.includes('1 de diciembre de 2026'), 'fundadores ES: ya decía 1 de diciembre (sin tocar)');

console.log('\n' + pass + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
