// test-lote-reversion-199.js — LOTE REVERSIÓN A 199 (decisión FINAL de
// Valentino 16/11/2026: el precio único de Posty queda en USD 199/mes —
// «199usd lo pueden pagar casi todos los negocios, pero 299usd no»).
// Espejo exacto de PRECIO-299 (v1131): la fuente vuelve a 199 y cada
// superficie que ese lote había llevado a 299 vuelve a 199, con los
// derivados recomputados desde la fuente (completo 3× = 597 · equipo
// teamPrice = 358/507/637 · por-día exacto 199/30 = $6.63 · por-día
// redondeado = 7). Nadie pagó nunca a ningún precio (el lanzamiento es
// el 1/12), así que ningún cliente conserva precio viejo.
//
//   §A la fuente y el cargo (config/plans.js PLAN_UNICO + el catálogo
//      Stripe que nace de él por lookup_key, con cliente falso): el
//      precio del único nace en 19900 y, si el lookup_key lo detenta el
//      precio de 29900 que PRECIO-299 creó, ensureCatalog transfiere la
//      llave a un precio nuevo de 19900 — el de 29900 queda inerte,
//      jamás borrado — y la resolución por lookup_key devuelve 19900;
//   §B cada superficie espejada, con su conteo exacto, + las estampas
//      reservadas del lote (BUILD/PZ_BUILD v1132 — excepción deliberada
//      del tablero a la monotonicidad, con v1133 ya vivo — y app.js?v=762
//      solo en el index ES) + los marcadores ajenos intactos (guarda
//      TARJETA-FANTASMA en app.js; cromo-CTA de Juli en generator.js y
//      caption-style.js) + las páginas de prueba sin precio (pin 6);
//   §C el cierre por grep: cero líneas con el patrón del 299 (USD 299 |
//      $299 | 9.97) en TODAS las superficies y en los archivos con
//      residuos; los residuos del patrón 199 son exactamente los
//      declarados (doctrina de la escalera, ancla ARS, ejemplos de
//      formato) más las superficies espejadas;
//   §D gate M78: app.js parsea y toda función llamada desde las dos
//      funciones tocadas (lpAdsHTML, landingView) existe definida;
//   §E boot real por HTTP con DATA_DIR aislada: /api/version = v1132,
//      /api/billing/plans?unico=1 sirve 199 con sus derivados (597 ·
//      358/507/637 · anchor USD 199) y las homes servidas ES/EN traen el
//      precio de vuelta — la EN con sus SEIS puntos en 199;
//   §F (solo con LOTE_BASE_DIR) el diff contra la base es exactamente
//      el lote (19 archivos).
//
// NO se toca (declarado en el aviso): las escaleras internas por país
// (PLANS_AR 199999 ARS, PLANS_US esencial 199, PLAN_ANCHOR.AR
// '$199.999'), la tabla COMPLETO_FUNDADOR, el $199 de client-digest.js
// (precio del producto de una clienta), los coeficientes 0.299 de
// luminancia en app.js (no son precio ni los captura el patrón).
// Uso: node test-lote-reversion-199.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
let PASS = 0, FAIL = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { PASS++; }
  else { FAIL++; fails.push(name); console.log('✗', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

// ---------- §A. La fuente y el cargo ----------
const plans = require('./config/plans');
t(plans.PLAN_UNICO.id === 'posty' && plans.PLAN_UNICO.price === 199 && plans.PLAN_UNICO.currency === 'USD',
  'A1 PLAN_UNICO = posty USD 199', plans.PLAN_UNICO.price);
t(plans.getPlan('posty') && plans.getPlan('posty').price === 199, 'A2 getPlan(posty).price = 199');
t(plans.formatPrice(plans.PLAN_UNICO) === '$199', 'A3 formatPrice(PLAN_UNICO) = $199', plans.formatPrice(plans.PLAN_UNICO));
// Derivados recomputados desde la fuente (sin edición propia):
t(3 * plans.PLAN_UNICO.price === 597, 'A4 completo 3× el poder = 597');
t(plans.teamPrice(2, plans.PLAN_UNICO.price) === 358 && plans.teamPrice(3, plans.PLAN_UNICO.price) === 507 && plans.teamPrice(4, plans.PLAN_UNICO.price) === 637,
  'A5 equipo teamPrice(2/3/4, 199) = 358/507/637',
  [plans.teamPrice(2, 199), plans.teamPrice(3, 199), plans.teamPrice(4, 199)]);
// Lo interno NO se toca (la escalera no es la vidriera):
t(plans.getPlans('US').esencial.price === 199 && plans.getPlans('US').pro.price === 299 && plans.getPlans('US').total.price === 399,
  'A6 escalera interna US intacta (199/299/399 por tier)');
t(plans.getPlans('AR').esencial.price === 199999, 'A7 escalera interna AR intacta (199999 ARS)');
t(plans.PLAN_ANCHOR.AR.desde === '$199.999', 'A8 PLAN_ANCHOR.AR intacto ($199.999 ARS)');
t(plans.COMPLETO_FUNDADOR.USD.esencial === 597 && plans.COMPLETO_FUNDADOR.USD.pro === 897 && plans.COMPLETO_FUNDADOR.USD.total === 1197 && plans.COMPLETO_FUNDADOR.ARS.esencial === 599997,
  'A9 COMPLETO_FUNDADOR intacto (tabla fundador por moneda/tier, histórica)');
// El cargo en Stripe nace de la fuente (cliente falso, sin red):
const sb = require('./stripe-billing');
function makeFake(seedPrices) {
  const store = { products: [], prices: (seedPrices || []).slice() };
  const client = {
    prices: {
      list: async ({ lookup_keys }) => {
        const lk = (lookup_keys || [])[0];
        const found = store.prices.find((p) => p.lookup_key === lk);
        return { data: found ? [found] : [] };
      },
      create: async (params) => {
        if (params.transfer_lookup_key && params.lookup_key) {
          for (const p of store.prices) if (p.lookup_key === params.lookup_key) p.lookup_key = undefined;
        }
        const p = { id: 'price_' + (store.prices.length + 1), ...params };
        store.prices.push(p);
        return p;
      },
    },
    products: {
      create: async (params) => { const p = { id: 'prod_' + (store.products.length + 1), ...params }; store.products.push(p); return p; },
    },
  };
  return { store, client };
}
const stripeDone = (async () => {
  try {
    // Escenario 1: catálogo vacío — el precio del único NACE en 19900.
    const f1 = makeFake([]);
    sb._clearPriceCache();
    const cat1 = await sb.ensureCatalog(f1.client);
    t(!!(cat1 && cat1.posty), 'A10 ensureCatalog resuelve el plan único (catálogo vacío)');
    const pp = f1.store.prices.find((p) => p.lookup_key === 'posty_us_posty_monthly');
    t(!!pp && pp.unit_amount === 19900 && pp.currency === 'usd',
      'A11 el precio Stripe del único NACE en 19900 (USD 199) bajo posty_us_posty_monthly', pp && pp.unit_amount);
    const pe = f1.store.prices.find((p) => p.lookup_key === 'posty_us_esencial_monthly');
    t(!!pe && pe.unit_amount === 19900, 'A12 el tier esencial US sigue naciendo en 19900 (interno intacto)', pe && pe.unit_amount);
    // Escenario 2: el estado real tras PRECIO-299 — el lookup_key lo
    // detenta un precio de 29900. ensureCatalog crea el de 19900 sobre el
    // mismo producto y le transfiere la llave; el de 29900 queda inerte
    // (sin la llave), jamás borrado; la resolución por lookup_key — el
    // camino que usa el checkout — devuelve 19900.
    const f2 = makeFake([{ id: 'price_viejo299', product: 'prod_posty', unit_amount: 29900, currency: 'usd', lookup_key: 'posty_us_posty_monthly', active: true }]);
    sb._clearPriceCache();
    const cat2 = await sb.ensureCatalog(f2.client);
    const nuevo = f2.store.prices.find((p) => p.id !== 'price_viejo299' && p.unit_amount === 19900 && p.product === 'prod_posty');
    t(!!nuevo && cat2.posty === nuevo.id, 'A13 con el 29900 detentando la llave, el catálogo resuelve un precio nuevo de 19900 sobre el mismo producto', nuevo && nuevo.id);
    t(!!nuevo && nuevo.lookup_key === 'posty_us_posty_monthly',
      'A14 el lookup_key posty_us_posty_monthly queda en el precio de 19900');
    const viejo = f2.store.prices.find((p) => p.id === 'price_viejo299');
    const resuelto = await f2.client.prices.list({ lookup_keys: ['posty_us_posty_monthly'] });
    t(!!viejo && viejo.unit_amount === 29900 && viejo.lookup_key === undefined &&
      resuelto.data.length === 1 && resuelto.data[0].unit_amount === 19900,
      'A15 el precio de 29900 queda inerte (existe, sin la llave, sin borrar) y la resolución por lookup_key devuelve 19900',
      viejo && { unit_amount: viejo.unit_amount, lookup_key: viejo.lookup_key });
  } catch (e) {
    t(false, 'A10-A15 ensureCatalog con cliente falso (' + e.message + ')');
  }
})();

// ---------- §B. Superficies (conteos exactos) ----------
const SRV = read('server.js');
const APP = read('public/app.js');
const IDX = read('public/index.html');
const IDXEN = read('public/en/index.html');
const EMAIL = read('email-audit.js');
const TERM = read('public/chunk-terminos.js');
const TERMES = read('public/terminos.html');
const TERMEN = read('public/terms.html');

t(count(SRV, "'- Precio: USD 199 por mes.") === 1, 'B1 server: chat público ES dice USD 199 por mes ×1');
t(count(SRV, "'- Price: USD 199 per month.") === 1, 'B2 server: chat público EN dice USD 199 per month ×1');
t(count(SRV, "desde: 'USD 199'") === 1, 'B3 server: anchorU del único = USD 199 ×1');
t(count(SRV, 'se paga con tarjeta en USD 199: volvé a Mi plan') === 1, 'B4 server: guarda del cobro dice USD 199 ×1');
t(count(SRV, 'Posty $199/month') === 1, 'B5 server: resumen EN del chat $199/month ×1');
t(count(SRV, 'growth, $6.63 a day') === 2, 'B6 server: por-día EN $6.63 ×2 (editor + público)');
t(count(SRV, 'growth, $6.63 por día') === 2, 'B7 server: por-día ES $6.63 ×2 (editor + público)');
t(count(SRV, 'works out to $6.63 a day') === 1, 'B8 server: objeción EN $6.63 ×1');
t(count(SRV, 'sale $6.63 por día') === 1, 'B9 server: objeción ES $6.63 ×1');
t(count(SRV, 'sale USD 199 por mes') === 1, 'B10 server: ejemplo de estilo ES USD 199 ×1');
t(count(SRV, '$199 a month') === 2, 'B11 server: $199 a month ×2 (estilo + hechos EN)');
t(count(EMAIL, 'Después, USD 199 por mes, sin compromiso.') === 1, 'B12 email-audit: línea de precio ES USD 199 ×1');
t(count(EMAIL, 'After that, USD 199 a month, no strings attached.') === 1, 'B13 email-audit: línea de precio EN USD 199 ×1');
t(count(IDX, '"price": "199"') === 1 && count(IDX, '"price": "299"') === 0, 'B14 index ES: JSON-LD price 199 ×1, 299 ×0');
t(count(IDXEN, '"price": "199"') === 1 && count(IDXEN, '"price": "299"') === 0, 'B15 index EN: JSON-LD price 199 ×1, 299 ×0');
t(count(IDXEN, 'separate from the $199.') === 1, 'B16 index EN: línea de Ads $199 ×1');
t(count(IDXEN, 'Posty from <b>$199</b>.') === 1, 'B17 index EN: ancla «Posty from $199» ×1');
t(count(IDXEN, '<div class="price">$199<small>/mo</small></div>') === 1, 'B18 index EN: tarjeta del plan $199/mo ×1');
t(count(IDXEN, '<div class="pz-perday">≈ $6.63 per day</div>') === 1, 'B19 index EN: por-día de la tarjeta $6.63 ×1');
t(count(IDXEN, "var LP_CALC_BASE = '$199';") === 1 && count(IDXEN, "? LP_CALC_BASE : '$199'") === 1, 'B20 index EN: calculadora LP_CALC_BASE $199 (default + fallback)');
t(count(IDXEN, "var LP_CALC_PERDAY = '$6.63';") === 1 && count(IDXEN, "? LP_CALC_PERDAY : '$6.63'") === 1, 'B21 index EN: calculadora LP_CALC_PERDAY $6.63 (default + fallback)');
t(count(APP, 'aparte de los $199.') === 1, 'B22 app.js: línea de Ads ES $199 ×1 (lpAdsHTML)');
t(count(APP, "|| 'USD 199';") === 1, 'B23 app.js: fallback del label del plan USD 199 ×1 (landingView)');
t(count(APP, 'Math.round(Number(lpEsencial.price || 0) / 30) : 7;') === 1 && count(APP, '/ 30) : 10;') === 0,
  'B24 app.js: el fallback del por-día redondeado es 7 (= round(199/30)), no el 10 derivado de 299');
t(count(TERM, 'de USD 199 por mes por cuenta de Instagram') === 1, 'B24b chunk-terminos: definición ES USD 199 ×1');
t(count(TERM, 'plan único de USD 199 (dólares estadounidenses) por mes') === 1, 'B25 chunk-terminos: §4.1 ES USD 199 ×1');
t(count(TERM, 'single plan, USD 199 per month per Instagram account') === 1, 'B26 chunk-terminos: definición EN USD 199 ×1');
t(count(TERM, 'single plan of USD 199 (US dollars) per month') === 1, 'B27 chunk-terminos: §4.1 EN USD 199 ×1');
t(count(TERMES, 'de USD 199 por mes por cuenta de Instagram') === 1 && count(TERMES, 'plan único de USD 199 (dólares estadounidenses) por mes') === 1,
  'B28 terminos.html: definición + §4.1 ES USD 199');
t(count(TERMEN, 'single plan, USD 199 per month per Instagram account') === 1 && count(TERMEN, 'single plan of USD 199 (US dollars) per month') === 1,
  'B29 terms.html: definición + §4.1 EN USD 199');
// Estampas del lote (v1132 RESERVADO por el tablero — excepción deliberada
// a la monotonicidad con v1133 ya vivo; app.js tocado → ?v=762 solo ES):
t(count(SRV, "const BUILD_ID = '20261105-v1134';") === 1 && count(SRV, '20261105-v1133') === 0, 'B30 server: BUILD_ID v1134 ×1, v1133 ×0');
t(count(APP, "const PZ_BUILD = '20261105-v1134';") === 1 && count(APP, '20261105-v1131') === 0, 'B31 app.js: PZ_BUILD v1134 ×1, v1131 ×0');
t(count(IDX, '<script src="/app.js?v=762"></script>') === 1 && count(IDX, 'app.js?v=761') === 0, 'B32 index ES: app.js?v=762 ×1, 761 ×0');
t(count(IDXEN, 'app.js?v=') === 0, 'B33 index EN: sin app.js?v= (como la base)');
t(count(IDX, 'styles.css?v=20261288') === 1 && count(IDXEN, 'styles.css?v=20261288') === 1, 'B34 styles?v= intacto en ambos índices (styles.css no se toca)');
// Marcadores ajenos intactos (censo post del gate):
t(count(APP, '(LOTE TARJETA-FANTASMA) El posteo del día se elige SOLO entre los') === 1 && count(APP, "stDia !== 'published'") === 1,
  'B35 app.js: la guarda de TARJETA-FANTASMA (v1130) sigue intacta en pzHoyTiraDias');
const GEN = read('generator.js');
const CAPSTYLE = read('caption-style.js');
t(count(GEN, 'share the love') === 2 && count(GEN, 'web chrome: a block opens with the brochure CTA') === 1 && count(CAPSTYLE, 'NO BROCHURE CTA') === 1,
  'B36 marcadores de Juli v1133 intactos (frase quemada + bloque cromo-CTA + ítem 28 del checklist)');
// Pin 6 del aviso: las páginas de prueba no cotizan precio (ni antes ni ahora):
const PATPRECIO = /USD 199|USD 299|\$199|\$299|6\.63|9\.97/;
t(read('public/prueba.html').split('\n').filter((l) => PATPRECIO.test(l)).length === 0 &&
  read('public/en-prueba.html').split('\n').filter((l) => PATPRECIO.test(l)).length === 0,
  'B37 prueba.html + en-prueba.html: cero líneas con precio (limpias, no se tocan)');

// ---------- §C. Cierre por grep ----------
// Patrón del 299: cero en TODAS las superficies y archivos con residuos.
const PAT299 = /USD 299|\$299|9\.97/;
function residual299(rel) {
  return read(rel).split('\n').filter((l) => PAT299.test(l)).length;
}
t(residual299('server.js') === 0, 'C1 grep-299: server.js = 0');
t(residual299('email-audit.js') === 0, 'C2 grep-299: email-audit.js = 0');
t(residual299('stripe-billing.js') === 0, 'C3 grep-299: stripe-billing.js = 0');
t(residual299('public/index.html') === 0 && residual299('public/en/index.html') === 0, 'C4 grep-299: ambos índices = 0');
t(residual299('public/chunk-terminos.js') === 0 && residual299('public/terminos.html') === 0 && residual299('public/terms.html') === 0, 'C5 grep-299: Términos ×3 = 0');
t(residual299('config/plans.js') === 0, 'C6 grep-299: plans.js = 0 (la escalera interna es numérica, no texto de vidriera)');
t(residual299('public/app.js') === 0, 'C7 grep-299: app.js = 0 (los 0.299 de luminancia no los captura el patrón)');
t(residual299('public/chunk-ajustes.js') === 0, 'C8 grep-299: chunk-ajustes.js = 0');
// Residuos del patrón 199, exactos y declarados (NO son superficies nuevas:
// son los mismos de siempre + las superficies espejadas por este lote):
//  plans.js ×6 = 4 declarados (doctrina de la escalera L138 · ancla ARS de
//  código '$199.999' L322 · histórico de la escalera L327 · ejemplo de
//  formato L544) + los 2 comentarios de la fuente espejados (L226/L488).
const PAT199 = /USD 199|\$199|6\.63|6,63/;
function residual199(rel) {
  return read(rel).split('\n').filter((l) => PAT199.test(l)).length;
}
t(residual199('config/plans.js') === 6, 'C9 grep-199: plans.js = 4 residuos declarados + 2 comentarios de la fuente', residual199('config/plans.js'));
//  app.js ×7 = 3 declarados (comentarios de formato/escalera L3179/L3180/
//  L3184; el de L3180 está pineado por test-pagos-app) + 4 superficies
//  espejadas (Ads L4943 · fallback L5047 · comentarios paywall/banner).
t(residual199('public/app.js') === 7, 'C10 grep-199: app.js = 3 residuos declarados + 4 superficies espejadas', residual199('public/app.js'));
//  chunk-ajustes.js ×2 = comentarios de formato (L1226/L1231), sin cambios.
t(residual199('public/chunk-ajustes.js') === 2, 'C11 grep-199: chunk-ajustes.js = solo los 2 residuos declarados', residual199('public/chunk-ajustes.js'));

// ---------- §D. Gate M78 sobre las funciones tocadas de app.js ----------
try { new vm.Script(APP, { filename: 'app.js' }); t(true, 'D1 app.js parsea (vm.Script)'); }
catch (e) { t(false, 'D1 app.js parsea (' + e.message + ')'); }
function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = src.indexOf('{', i), depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  return '';
}
const defined = new Set();
for (const m of APP.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1]);
for (const m of APP.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
const BUILTINS = new Set(['Number', 'String', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'delete', 'void', 'in', 'of']);
const CSSFN = new Set(['rotate', 'rgba', 'rgb', 'repeat', 'var', 'calc', 'translate', 'translateX', 'translateY', 'scale', 'url', 'linear-gradient', 'radial-gradient', 'min', 'max', 'clamp']);
const callees = new Set();
for (const fn of ['lpAdsHTML', 'landingView']) {
  const body = fnBody(APP, fn);
  t(body.length > 0, 'D2 cuerpo localizable: ' + fn);
  for (const m of body.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) if (!CSSFN.has(m[1])) callees.add(m[1]);
}
const missing = [...callees].filter((c) => !defined.has(c) && !BUILTINS.has(c));
t(missing.length === 0, 'D3 M78: toda función llamada desde lpAdsHTML/landingView existe definida en el bundle (' + (callees.size - missing.length) + '/' + callees.size + ')', missing);

// ---------- §E. Boot real por HTTP ----------
const PORT = 18797;
const BASE = `http://127.0.0.1:${PORT}`;
async function waitVersion(tries) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE + '/api/version'); if (r.ok) return await r.json(); } catch (e) { /* sigue */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}
(async () => {
  await stripeDone;
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reversion199-'));
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), SESSION_SECRET: 'test-secret', ADMIN_TOKEN: 'test-admin', OPENAI_API_KEY: '', NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootErr = '';
  srv.stderr.on('data', (d) => { bootErr += d; });
  try {
    const ver = await waitVersion(200);
    t(!!ver, 'E1 el servidor botea y responde /api/version', bootErr.slice(0, 200));
    t(ver && String(ver.build || ver.version || '').includes('v1134'), 'E2 /api/version = v1134', ver && (ver.build || ver.version));
    const r = await fetch(BASE + '/api/billing/plans?country=US&unico=1');
    const j = await r.json();
    const p0 = j && j.plans && j.plans[0];
    t(!!p0 && p0.price === 199 && p0.price_label === '$199', 'E3 ?unico=1 sirve el plan a USD 199 con label $199', p0 && { price: p0.price, price_label: p0.price_label });
    const rAr = await fetch(BASE + '/api/billing/plans?unico=1');
    const jAr = await rAr.json();
    t(jAr && jAr.anchor && jAr.anchor.desde === 'USD 199', 'E4 ?unico=1 (default AR) anchor.desde = USD 199', jAr && jAr.anchor);
    t(j && j.completo && j.completo.prices && j.completo.prices.posty === 597, 'E5 ?unico=1 completo.prices.posty = 597 (3×199)');
    t(j && j.equipo && j.equipo.precios && j.equipo.precios[2].posty === 358 && j.equipo.precios[3].posty === 507 && j.equipo.precios[4].posty === 637,
      'E6 ?unico=1 equipo.precios = 358/507/637', j && j.equipo && j.equipo.precios);
    const home = await (await fetch(BASE + '/')).text();
    t(home.includes('"price": "199"') && home.includes('/app.js?v=762'), 'E7 home ES servida: JSON-LD 199 + app.js?v=762');
    const homeEn = await (await fetch(BASE + '/en/', { headers: { 'Accept-Language': 'en' } })).text();
    t(homeEn.includes('"price": "199"') && homeEn.includes('<div class="price">$199<small>/mo</small></div>') &&
      homeEn.includes('≈ $6.63 per day') && homeEn.includes('Posty from <b>$199</b>') &&
      homeEn.includes('separate from the $199') && homeEn.includes("var LP_CALC_BASE = '$199';") &&
      homeEn.includes("var LP_CALC_PERDAY = '$6.63';"),
      'E8 home EN servida: los SEIS puntos en 199 (schema · tarjeta · por-día · ancla · Ads · LP_CALC_BASE/PERDAY)');
    t(!PAT299.test(home) && !PAT299.test(homeEn), 'E9 homes servidas ES/EN: cero patrón 299');
  } catch (e) {
    t(false, 'E boot HTTP (' + e.message + ')');
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) { /* ya murió */ }
    await new Promise((r) => setTimeout(r, 600));
    let free = false;
    try { await fetch(BASE + '/api/version'); } catch (e) { free = true; }
    t(free, 'E10 puerto libre tras matar el boot por PID exacto');
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* tmp */ }
  }

  // ---------- §F. Diff exacto contra la base (solo con LOTE_BASE_DIR) ----------
  const BASEDIR = process.env.LOTE_BASE_DIR;
  if (BASEDIR && fs.existsSync(BASEDIR)) {
    const EXPECTED = new Set([
      'config/plans.js', 'server.js', 'stripe-billing.js', 'email-audit.js',
      'public/app.js', 'public/index.html', 'public/en/index.html',
      'public/chunk-terminos.js', 'public/terminos.html', 'public/terms.html',
      'test-lote-plan-unico-paywall.js', 'test-lote-plan-posty-corregido.js',
      'test-plan-detail.js', 'test-lote-auditoria-email.js',
      'test-lote-terminos-condiciones.js', 'test-lote-website-copy.js',
      'test-lote-copy-sin-billetera.js', 'test-lote-precio-299.js',
      'test-lote-reversion-199.js',
    ]);
    const SKIP = new Set(['node_modules', 'data', '.git']);
    function walk(dir, rel, out) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), r, out);
        else out.set(r, fs.readFileSync(path.join(dir, e.name)));
      }
      return out;
    }
    const a = walk(ROOT, '', new Map());
    const b = walk(BASEDIR, '', new Map());
    const diff = [];
    for (const [k, v] of a) { if (!b.has(k) || !b.get(k).equals(v)) diff.push(k); }
    for (const k of b.keys()) { if (!a.has(k)) diff.push(k + ' (solo en base)'); }
    t(diff.length === EXPECTED.size && diff.every((d) => EXPECTED.has(d)),
      'F1 el diff contra la base es exactamente el lote (' + EXPECTED.size + ' archivos)', diff);
  } else {
    console.log('  (§F omitida: sin LOTE_BASE_DIR)');
  }

  console.log(`\ntest-lote-reversion-199: ${PASS} ok · ${FAIL} mal`);
  if (fails.length) console.log('Fallaron:\n - ' + fails.join('\n - '));
  process.exit(FAIL ? 1 : 0);
})();
