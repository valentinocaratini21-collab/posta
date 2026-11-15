#!/usr/bin/env node
/* LOTE VENTANA-GATE (v1101) — la ventana del gate de la lista de espera se
 * mueve al 28–30/11/2026 con apertura el 1/12/2026.
 * Decisión de Valentino del 15/11 (02:09): la ventana (29–31/1/2027,
 * decisión del 26/10) acompaña el lanzamiento del 1/12/2026. Alcance: las
 * constantes de isWaitlistWindow en waitlist.js + su documentación, los
 * pins de la suite de la superficie (test-lotecuentaregresiva) y de la
 * sección 3 de test-lote-listaespera112, los comentarios de la ventana
 * donde server.js cablea el gate, y los stamps de la cadena con la
 * paridad de frescura restaurada (PZ_BUILD v1101). El texto de las
 * páginas NO se toca (ya dice 1 de diciembre / December 1 desde v1099).
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

const WLJS = read('waitlist.js');
const SRV = read('server.js');
const APP = read('public/app.js');
const IDX = read('public/index.html');
const IDXEN = read('public/en/index.html');
const ES = read('public/lista-espera.html');
const EN = read('public/en-lista-espera.html');
const DB = read('db.js');
const SCH = read('scheduler.js');
const SF = read('serie-feed.js');
const GEN = read('generator.js');
const EA = read('email-audit.js');
const WL = require('./waitlist');

// ---- 1. La ventana nueva, pineada en el módulo ----
ok(WLJS.includes('const WAITLIST_START_KEY = 20261128;'), 'START 20261128 (28/11/2026)');
ok(WLJS.includes('const WAITLIST_END_KEY = 20261130;'), 'END 20261130 (30/11/2026)');
ok(WLJS.includes('const WAITLIST_LAST_DAY_KEY = 20261130;'), 'LAST_DAY 20261130 (30/11/2026)');
ok(!WLJS.includes('20270129') && !WLJS.includes('20270131'), 'la ventana vieja (29–31/1/2027) no queda en el módulo');
ok(SRV.includes('ventana 28–30/11/2026, solo lista de espera'), 'server.js: comentario del cableado con la ventana nueva');

// ---- 2. Conducta de la ventana (días ART) ----
ok(WL.waitlistPhaseOf(new Date('2026-11-27T12:00:00Z')) === 'normal', '27/11: normal (antes de la ventana)');
ok(WL.waitlistPhaseOf(new Date('2026-11-28T03:00:00Z')) === 'waitlist', '28/11 00:00 ART: abre');
ok(WL.waitlistPhaseOf(new Date('2026-11-29T12:00:00Z')) === 'waitlist', '29/11: lista de espera');
ok(WL.waitlistPhaseOf(new Date('2026-11-30T12:00:00Z')) === 'waitlist', '30/11: lista de espera (último día)');
ok(WL.waitlistPhaseOf(new Date('2026-12-01T03:00:00Z')) === 'normal', '1/12 00:00 ART: apertura, web normal');
ok(WL.waitlistPhaseOf(new Date('2027-01-30T12:00:00Z')) === 'normal', '30/1/2027: normal (la ventana vieja ya no abre)');
ok(WL.isWaitlistLastDay(new Date('2026-11-30T12:00:00Z')) === true, '30/11 es el último día («Mañana se abre.»)');
ok(WL.isWaitlistLastDay(new Date('2026-11-29T12:00:00Z')) === false, '29/11 no es el último día');

// ---- 3. Las superficies: gate y rutas, con la conducta de hoy intacta ----
function fakeReq(p, session) { return { method: 'GET', path: p, session: session || {} }; }
function fakeRes() {
  const r = { headers: {}, body: null, sent: false };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.send = (b) => { r.body = b; r.sent = true; };
  r.redirect = (u) => { r.body = 'REDIRECT:' + u; r.sent = true; };
  return r;
}
function runGate(gate, req) {
  const res = fakeRes();
  let nexted = false;
  gate(req, res, () => { nexted = true; });
  return { res, nexted };
}
const stripTags = (s) => s.replace(/<[^>]*>/g, '');
const gateLast = WL.createWaitlistGate({ nowFn: () => new Date('2026-11-30T15:00:00Z') });
const gateToday = WL.createWaitlistGate({ nowFn: () => new Date('2026-11-15T15:00:00Z') });
let t = runGate(gateLast, fakeReq('/'));
ok(t.res.sent && stripTags(t.res.body).includes('Mañana se abre.'), '30/11 + visitante + /: lista ES con «Mañana se abre.»');
t = runGate(gateLast, fakeReq('/en/'));
ok(t.res.sent && stripTags(t.res.body).includes('Opens tomorrow.'), '30/11 + visitante + /en/: lista EN con «Opens tomorrow.»');
t = runGate(gateToday, fakeReq('/'));
ok(!t.res.sent && t.nexted, 'fuera de ventana (hoy) + visitante + /: pasa a la web normal');
ok(WLJS.includes("app.get('/lista-espera'") && WLJS.includes("app.get('/en/lista-espera'"), 'rutas directas ES/EN registradas');
ok(WLJS.includes("return res.redirect('/')") && WLJS.includes("return res.redirect('/en/')"), 'fuera de ventana las rutas directas redirigen a la home (conducta de hoy)');

// ---- 4. El texto de las páginas no se tocó (lote v1099) ----
ok(occ(ES, 'Posty abre el 1 de diciembre') === 3, 'ES: «Posty abre el 1 de diciembre» x3');
ok(occ(EN, 'Posty opens on December 1') === 3, 'EN: «Posty opens on December 1» x3');
ok(occ(ES, 'febrero') === 0 && occ(EN, 'February') === 0, 'sin la fecha vieja en las páginas');

// ---- 5. Stamps de la cadena, con la paridad de frescura restaurada ----
ok(SRV.includes("const BUILD_ID = '20261105-v1101';"), 'BUILD_ID v1101');
ok(APP.includes("const PZ_BUILD = '20261105-v1101';"), 'PZ_BUILD v1101 en paridad (el lote 5 lo había dejado en v1099)');
ok(IDX.includes('app.js?v=747'), 'index ES: app.js?v=747');
ok(!IDXEN.includes('app.js?v='), 'index EN: sin stamp de app.js (no lo carga)');
ok(IDX.includes('styles.css?v=20261286') && IDXEN.includes('styles.css?v=20261286'), 'styles sin tocar en ambos index (20261286)');

// ---- 6. Marcadores ajenos intactos (v1093–v1100) ----
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
ok(IDXEN.includes('})();\n</script>') && occ(IDXEN, '<script') === 14, 'v1100: script de login-social del index EN cerrado (14 aperturas)');

console.log('\n' + pass + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
