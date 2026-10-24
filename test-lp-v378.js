'use strict';
/* v378 — Fase A (renumerada: la v377 la tomó la tanda de la placa) «Arma todo!»: semana navegable con captions (ítem 1),
   comparador honesto de 4 vías (ítem 2) y calculadora de dos controles
   contra el plan real (ítem 3). ES (app.js) + EN (en/index.html). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const appJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const enHtml = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const idxHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

/* ---------- banco de captions: extracción y alineación ---------- */
function extractCaps(src, label) {
  const m = src.match(/const LP_WEEK_CAPS = (\{[\s\S]*?\n\});/);
  ok(!!m, label + ': LP_WEEK_CAPS presente');
  if (!m) return {};
  try { return vm.runInNewContext('(' + m[1] + ')'); }
  catch (e) { ok(false, label + ': LP_WEEK_CAPS parsea (' + e.message + ')'); return {}; }
}
function extractWeekEngine(src, label) {
  const marks = [src.indexOf('const LP_WEEK_ICONS'), src.indexOf('const LP_WEEK = {')].filter((x) => x >= 0);
  const a = marks.length ? Math.min(...marks) : -1;
  const b = src.indexOf('const LP_WEEK_CAPS');
  ok(a >= 0 && b > a, label + ': motor de semana localizable');
  if (a < 0 || b <= a) return null;
  const ctx = { console };
  vm.createContext(ctx);
  try {
    vm.runInContext(src.slice(a, b) + '\nthis.__cards = lpWeekCards; this.__week = LP_WEEK;', ctx);
    return ctx;
  } catch (e) { ok(false, label + ': motor de semana evalúa (' + e.message + ')'); return null; }
}
function checkLang(src, caps, label) {
  const keys = Object.keys(caps);
  ok(keys.length >= 9, label + ': al menos 9 rubros con semana completa (hay ' + keys.length + ')');
  const eng = extractWeekEngine(src, label);
  for (const key of keys) {
    const pieces = caps[key];
    ok(Array.isArray(pieces) && pieces.length === 5, label + '/' + key + ': 5 piezas');
    if (!Array.isArray(pieces)) continue;
    let cards = null;
    if (eng) { try { cards = eng.__cards(key); } catch (e) { /* */ } }
    pieces.forEach((p, i) => {
      ok(typeof p.cap === 'string' && p.cap.length >= 40, label + '/' + key + '[' + i + ']: caption real (>=40 chars)');
      ok(p.cap === p.cap.toLowerCase() || /[a-záéíóúñ]/.test(p.cap), label + '/' + key + '[' + i + ']: caption NO forzado a mayúsculas');
      ok(!/text-transform/i.test(p.cap), label + '/' + key + '[' + i + ']: sin marcas raras');
      ok(fs.existsSync(path.join(__dirname, 'public', p.img)), label + '/' + key + '[' + i + ']: imagen servida existe (' + p.img + ')');
      if (cards && cards[i]) ok(cards[i].img === p.img, label + '/' + key + '[' + i + ']: imagen alineada con lpWeekCards (' + p.img + ' vs ' + cards[i].img + ')');
      ok(typeof p.why === 'string' && p.why.length >= 15, label + '/' + key + '[' + i + ']: porqué presente');
    });
  }
  return keys;
}
const capsEs = extractCaps(appJs, 'ES');
const capsEn = extractCaps(enHtml, 'EN');
const keysEs = checkLang(appJs, capsEs, 'ES');
const keysEn = checkLang(enHtml, capsEn, 'EN');
ok(keysEs.includes('cafeteria') && keysEn.includes('cafeteria'), 'cafeteria (default) tiene semana en ES y EN');

/* ---------- ítem 1: visor ---------- */
for (const [src, label] of [[appJs, 'ES'], [enHtml, 'EN']]) {
  for (const fn of ['lpWeekView', 'lpWeekNav', 'lpWeekClose', 'lpViewRender', 'lpWeekFilterChips']) {
    ok(src.includes('function ' + fn + '('), label + ': función ' + fn + ' definida');
  }
  ok(src.includes('id="lpView"'), label + ': overlay del visor en el HTML');
  ok(src.includes('id="lpViewCap"'), label + ': el visor tiene bloque de caption');
  ok(src.includes('LP_WEEK_CUR'), label + ': semana enriquecida (LP_WEEK_CUR)');
}
ok(/\.lp-view-cap\{[^}]*white-space:pre-line/.test(styles), 'CSS: el caption del visor conserva saltos (pre-line)');
ok(!/\.lp-view-cap\{[^}]*text-transform/.test(styles), 'CSS: el caption del visor SIN text-transform (nunca mayúsculas)');
ok(styles.includes('.lp-view{'), 'CSS: overlay .lp-view presente');

/* ---------- ítem 2: comparador honesto ---------- */
ok(appJs.includes('CM freelance') && appJs.includes('Lo hacés vos') && appJs.includes('id="cmpPostyPrice"'), 'ES: comparador de 4 vías con precio de Posty inyectado');
ok(appJs.includes('referencia de mercado'), 'ES: rangos rotulados como referencia de mercado');
ok(appJs.includes('Desde $1.000.000 *'), 'ES: ancla CM freelance oficial con asterisco');
ok(enHtml.includes('Freelance CM') && enHtml.includes('Do it yourself') && enHtml.includes('Market reference prices'), 'EN: comparador de 4 vías + referencia rotulada');
ok(enHtml.includes('$1,500–$3,000+ *'), 'EN: ancla oficial $1,500–$3,000+ con asterisco');
ok(styles.includes('.cmp-table.cmp4'), 'CSS: grilla de 5 columnas del comparador');

/* ---------- ítem 3: calculadora de dos controles ---------- */
for (const [src, label] of [[appJs, 'ES'], [enHtml, 'EN']]) {
  ok(src.includes('id="lpCalcR"'), label + ': slider de valor de la hora');
  ok(src.includes('function lpCalcRateSlider('), label + ': lpCalcRateSlider definida');
  ok(src.includes('id="lpCalcRVal"'), label + ': valor de la hora visible');
  ok(!src.includes('desde <b>$6.667 por día</b>') && !src.includes('from <b>$6.67 per day</b>'), label + ': sin precio por día hardcodeado viejo');
}
ok(appJs.includes('LP_CALC_PLAN') && appJs.includes('lpPlanLabel'), 'ES: el contraste sale del plan real (price_label)');
ok(appJs.includes('function lpCalcSetPlan('), 'ES: lpCalcSetPlan definida (sigue el toggle de país)');
ok(appJs.includes('lpCalcSetPlan(cfg.plans.find'), 'ES: switchPlansCountry refresca comparador + calculadora');
ok(enHtml.includes('$199.99 per month'), 'EN: contraste con el plan real USD 199.99');

/* ---------- cadena de invariantes ---------- */
ok(appJs.includes('hasSessionContext'), 'invariante: guarda del hotfix v371 presente');
ok(appJs.includes('Posty trabaja completo por sí solo'), 'invariante v376: aclaración de autonomía ES entera');
ok(enHtml.includes('Does Posty work on its own, or do I need to hire anything else?'), 'invariante v376: FAQ de autonomía EN entera');
const av = fs.readFileSync(path.join(__dirname, 'public/ai-avatar.png'));
ok(crypto.createHash('sha256').update(av).digest('hex').startsWith('c8feaff7'), 'invariante: avatar canónico con placa (sha c8feaff7…)');
ok(idxHtml.includes('/app.js?v=264'), 'index: app.js ?v=263');
ok(idxHtml.includes('/styles.css?v=20261024k') && enHtml.includes('/styles.css?v=20261024k'), 'styles.css ?v=20261024k en ES y EN');
ok(/BUILD_ID = '202610\d\d-v\d+'/.test(serverJs), 'BUILD_ID presente (el exacto lo afirma el test de la tanda vigente)');

console.log(`test-lp-v378: ${okN} ok / ${failN} fallas`);
process.exit(failN ? 1 : 0);
