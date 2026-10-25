// test-pais-selector.js — Tanda tablero 2026-10-25: selector de país + espejos.
// Uso: node test-pais-selector.js (desde la raíz del repo o con CWD en ella).
// No requiere deps: plans.js se require directo; el resto son chequeos estáticos
// sobre los archivos tocados. Falla (exit 1) ante el primer incumplimiento.
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) { console.error(`FAIL #${n}: ${msg}`); process.exit(1); }
  console.log(`ok #${n}: ${msg}`);
}

// ---------- 1. plans.js: espejos y selector ----------
const pl = require(path.join(root, 'config/plans.js'));
const gb = pl.getPlans('GB');
ok(gb.esencial.price === 149.99 && gb.pro.price === 224.99 && gb.total.price === 299.99, 'GB 149.99/224.99/299.99');
ok(gb.esencial.currency === 'GBP', 'GB moneda GBP');
const eu = pl.getPlans('EU');
ok(eu.esencial.price === 179.99 && eu.pro.price === 269.99 && eu.total.price === 359.99, 'EU 179.99/269.99/359.99');
ok(eu.esencial.currency === 'EUR', 'EU moneda EUR');
ok(pl.formatPrice(eu.pro) === '€269.99', 'formatPrice EUR €269.99');
for (const c of ['BR', 'MX', 'CL', 'CO', 'PE']) {
  const ps = pl.getPlans(c);
  ok(ps.esencial.price === 199.99 && ps.pro.price === 299.99 && ps.total.price === 399.99, `${c} → escalera USD base`);
  ok(ps.esencial.currency === 'USD', `${c} moneda USD (sin precio local inventado)`);
  ok(pl.getRail(c) === 'mercadopago', `${c} riel Mercado Pago`);
  ok(pl.COUNTRY_META[c].pending === true, `${c} marcado pending`);
}
ok(pl.getPlans('AR').esencial.price === 199999, 'AR intacto 199999');
ok(pl.getPlans('UY').esencial.price === 4990, 'UY intacto 4990');
ok(pl.getPlans('US').esencial.price === 199.99, 'USD intacto 199.99');
ok(pl.getPlans('CA').esencial.price === 279, 'CA intacto (no se toca)');
ok(JSON.stringify(pl.SELECTOR_COUNTRIES) === JSON.stringify(['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'EU']), 'selector = exactamente los 10 códigos, en orden');
ok(!pl.SELECTOR_COUNTRIES.includes('EC') && !pl.SELECTOR_COUNTRIES.includes('VE'), 'EC/VE fuera del selector');
ok(pl.getRail('US') === 'stripe' && pl.getRail('GB') === 'stripe' && pl.getRail('EU') === 'stripe', 'riel Stripe US/GB/EU');
ok(pl.getRail('AR') === 'mercadopago' && pl.getRail('UY') === 'mercadopago', 'riel MP AR/UY');
const plansSrc = read('config/plans.js');
const gbBlock = plansSrc.slice(plansSrc.indexOf('const PLANS_GB'), plansSrc.indexOf('\n};', plansSrc.indexOf('const PLANS_GB')));
ok(!/159|239|319/.test(gbBlock), 'GB viejo muerto en PLANS_GB (sin 159/239/319)');
ok(!/Ecuador|Venezuela/.test(plansSrc), 'Ecuador/Venezuela ausentes de plans.js');

// ---------- 2. server.js ----------
const srv = read('server.js');
ok(srv.includes("['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'EU', 'CA'].includes(q)"), 'API planes: allowlist 11 códigos');
ok(srv.includes("['AR', 'UY', 'BR', 'MX', 'CL', 'CO', 'PE'].includes(mpCountry)"), 'MP subscribe: 7 países MP');
ok(srv.includes("['US', 'GB', 'EU'].includes(") && srv.includes('stripeCountry'), 'Stripe checkout: país US/GB/EU');
ok(!srv.includes("user.lang !== 'en'"), 'puerta vieja lang=en muerta en Stripe checkout');
ok(srv.includes('local_price_pending') && srv.includes('rail: meta.rail'), 'API planes: rail + pending en respuesta');
ok(srv.includes('founder_currency') && srv.includes("String(plan.currency || '') === 'USD'"), 'fundador Stripe solo si moneda coincide');

// ---------- 3. app.js (home ES) ----------
const app = read('public/app.js');
ok(app.includes("const PZ_PAISES = ['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'EU']"), 'app.js: PZ_PAISES 10 códigos');
ok(app.includes('PZ_PAISES.map(') && app.includes("onclick=\"switchPlansCountry('${c}')\""), 'app.js: toggle renderiza 10 banderas');
ok(app.includes('id="plansCountryNote"'), 'app.js: línea de nota del país');
ok(app.includes("PLANS_COUNTRY = PZ_PAISES.includes(c) ? c : 'AR'"), 'app.js: switch valida contra la lista');
ok(app.includes("localStorage.setItem('posta-pais'"), 'app.js: país persiste');
ok(app.includes("'?pais=' + c") || app.includes("'?pais=' +"), 'app.js: CTA /prueba lleva ?pais=');
ok(app.includes("const CHUNK_V = '20261025-v465'"), 'app.js: CHUNK_V bumpeado (chunk-ajustes cambia)');
ok(app.includes('pzFmtPrecioES'), 'app.js: formateo ES de precios');
ok(!/Ecuador|Venezuela/.test(app), 'Ecuador/Venezuela ausentes de app.js');

// ---------- 4. en/index.html ----------
const en = read('public/en/index.html');
ok((en.match(/data-country="/g) || []).length === 10, 'EN: 10 botones de país');
ok(en.includes('PZ_PAISES_EN') && en.includes("id=\"plansCountryNote\""), 'EN: script del selector + nota');
ok(en.includes('id="unicoLine"') && en.includes('cmp-posty-from'), 'EN: unico + comparador actualizables');
ok(!en.includes('United States · USD</button>'), 'EN: botón único viejo muerto');
ok(!/Ecuador|Venezuela/.test(en), 'Ecuador/Venezuela ausentes de EN');

// ---------- 5. prueba ES/EN ----------
for (const [f, def] of [['public/prueba.html', "'AR'"], ['public/en-prueba.html', "'US'"]]) {
  const t = read(f);
  ok(t.includes('PAIS_PRECIO'), `${f}: PAIS_PRECIO presente`);
  ok(t.includes('id="pruebaCountryToggle"') && t.includes('id="pruebaCountryNote"'), `${f}: host del selector + nota`);
  ok(t.includes("get('pais')"), `${f}: lee ?pais=`);
  ok(t.includes("j.country === 'GB'") && t.includes("j.country === 'EU'") && t.includes("['BR', 'MX', 'CL', 'CO', 'PE'].includes(j.country)"), `${f}: ramas GB/EU/latam`);
  ok(t.includes('id="priceContrast"'), `${f}: contraste con id`);
  const m = t.match(/let COUNTRY = '([A-Z]{2})';/);
  ok(m && m[1] === (def === "'AR'" ? 'AR' : 'US'), `${f}: COUNTRY del demo intacto (${def})`);
  ok(!/Ecuador|Venezuela/.test(t), `${f}: Ecuador/Venezuela ausentes`);
}

// ---------- 6. chunk-ajustes.js (paywall) ----------
const aj = read('public/chunk-ajustes.js');
ok(aj.includes('pzPayCountry') && aj.includes("localStorage.getItem('posta-pais')"), 'paywall: país desde posta-pais');
ok(aj.includes('const isStripe = PZ_PAY_STRIPE.includes(pzPayCountry)'), 'paywall: riel por país');
ok(aj.includes('if (isStripe) {'), 'paywall: rama Stripe por país');
ok(aj.includes("country: pzPayCountry"), 'paywall: país viaja en ambas llamadas de cobro');
ok(aj.includes("'/api/billing/plans?country=' + pzPayCountry"), 'paywall: planes con país');
ok(!/Ecuador|Venezuela/.test(aj), 'Ecuador/Venezuela ausentes del paywall');

// ---------- 7. styles.css ----------
const css = read('public/styles.css');
ok(css.includes('.lp-pais-nota'), 'styles: nota del país');
ok(css.includes('.country-toggle button{padding:0;width:44px;height:44px'), 'styles: botones bandera redondos');

console.log(`\ntest-pais-selector: ${n} chequeos OK`);
