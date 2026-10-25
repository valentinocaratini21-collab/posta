'use strict';
/* test-postpay-welcome.js — 🎉 ARMA TODO ítem 1: compra real + momento post-pago.
 *
 * El hueco que cierra: Stripe y MercadoPago devolvían al que pagaba a
 * #/app/ajustes?plan=ok y NADA en el front leía ese parámetro — el usuario
 * aterrizaba en Ajustes sin ningún reconocimiento del pago.
 *
 * Lo que se verifica acá (sin red, sin tocar plata):
 *  1. Unit: stripe-billing.buildCheckoutParams — success_url termina en
 *     '/#/app/schedule?plan=ok' (la semana, donde vive la bienvenida) y
 *     cancel_url en '/#/app/ajustes?plan=error'.
 *  2. Estáticos sobre mercadopago.js: back_url success = schedule?plan=ok,
 *     failure = ajustes?plan=error, y la URL vieja (ajustes?plan=ok) no queda.
 *  3. Estáticos sobre public/app.js: existe el handler de plan=ok en Schedule
 *     (maybePostPayWelcome) con AMBOS textos ES y EN (activo y en espera),
 *     la limpieza del parámetro, el re-chequeo de /api/auth/me vía
 *     refreshSession (cada ~5 s, hasta 4 veces) y el nombre del plan desde
 *     el catálogo de /api/billing/plans (el mismo de Mi plan).
 *  4. Estáticos sobre public/chunk-ajustes.js: banner amable de plan=error
 *     ES+EN (sin la versión agresiva vieja) + limpieza del parámetro.
 * Corre con: node test-postpay-welcome.js
 */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

section('1 · Stripe: buildCheckoutParams (unit, sin red)');
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_PUBLISHABLE_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
const sb = require('./stripe-billing');
const params = sb.buildCheckoutParams({
  priceId: 'price_test', plan: { id: 'pro' }, baseUrl: 'https://postycommunitymanager.com',
  user: { id: 42, email: 'shop@example.com', stripe_customer_id: 'cus_42' }, trialEndSec: null,
});
ok(params.success_url.endsWith('/#/app/schedule?plan=ok'),
  `success_url → la semana con ?plan=ok (vino: ${params.success_url})`);
ok(params.cancel_url.endsWith('/#/app/ajustes?plan=error'),
  `cancel_url → Ajustes con ?plan=error (vino: ${params.cancel_url})`);
ok(!params.success_url.includes('ajustes'), 'success_url ya NO aterriza en Ajustes');

section('2 · MercadoPago: back_urls de createSubscription (estático)');
const mpSrc = read('mercadopago.js');
ok(mpSrc.includes('success: `${baseUrl}/#/app/schedule?plan=ok`'),
  'MP success → #/app/schedule?plan=ok (la semana, espejo de Stripe)');
ok(mpSrc.includes('failure: `${baseUrl}/#/app/ajustes?plan=error`'),
  'MP failure → #/app/ajustes?plan=error (lo lee chunk-ajustes)');
ok(mpSrc.includes('pending: `${baseUrl}/#/app/ajustes?plan=pending`'),
  'MP pending queda en Ajustes (sin cambios)');
ok(!mpSrc.includes('#/app/ajustes?plan=ok'), 'MP: la URL vieja ajustes?plan=ok no queda en el módulo');
const sbSrc = read('stripe-billing.js');
ok(!sbSrc.includes('#/app/ajustes?plan=ok'), 'Stripe: la URL vieja ajustes?plan=ok no queda en el módulo');

section('3 · app.js: bienvenida post-pago en Schedule (estático)');
const appSrc = read(path.join('public', 'app.js'));
ok(appSrc.includes('function maybePostPayWelcome()'), 'existe maybePostPayWelcome()');
ok(appSrc.includes("if (tab === 'schedule') maybePostPayWelcome()"),
  'el router la invoca SOLO en la vista Schedule');
ok(appSrc.includes("new URLSearchParams(location.hash.split('?')[1] || '').get('plan')"),
  'lee el parámetro plan del hash (patrón de la casa, como authLang)');
// Texto ACTIVO — ES y EN (el nombre del plan entra por interpolación ${name})
ok(appSrc.includes('🎉 ¡Ya está en marcha! Tu plan ') && appSrc.includes('quedó activo y tu semana ya está programada: yo publico por vos. Vos solo mirá cómo crece tu Instagram.'),
  'texto activo ES: «🎉 ¡Ya está en marcha! Tu plan {Nombre} quedó activo y tu semana ya está programada: yo publico por vos. Vos solo mirá cómo crece tu Instagram.»');
ok(appSrc.includes("🎉 You're live! Your ") && appSrc.includes('plan is active and your week is already scheduled: I post for you. Just watch your Instagram grow.'),
  'texto activo EN: «🎉 You\'re live! Your {Name} plan is active and your week is already scheduled: I post for you. Just watch your Instagram grow.»');
// Texto EN ESPERA (webhook en camino) — ES y EN, sin nombre (no se inventa)
ok(appSrc.includes('🎉 ¡Ya sos parte! Estamos activando tu plan — en unos segundos tu semana queda en marcha con tu plan nuevo. Tu semana actual ya está programada y publicándose.'),
  'texto en espera ES (la semana de la prueba ya está programada y publicándose)');
ok(appSrc.includes("🎉 You're in! We're activating your plan — in a few seconds your week will be running on your new plan. Your current week is already scheduled and posting."),
  'texto en espera EN (espejo)');
// Variante prueba vencida: posteos pausados hasta el flip — jamás "publicándose"
ok(appSrc.includes('tu semana vuelve a estar en marcha con tu plan nuevo') && appSrc.includes('your week is back up and running on your new plan'),
  'variante trial vencido ES+EN: la semana VUELVE a estar en marcha (sin prometer publicación en curso)');
// Infra de la tarjeta
ok(appSrc.includes("history.replaceState(null, '', location.pathname + '#/app/schedule')"),
  'limpia el parámetro al mostrarla (history.replaceState, sin recargar)');
ok(appSrc.includes("pzPostPayCard") && appSrc.includes("pzPostPayX"),
  'tarjeta fina descartable con ✕ (id pzPostPayCard / pzPostPayX)');
ok(appSrc.includes('setInterval') && appSrc.includes('}, 5000)') && appSrc.includes('await refreshSession()') && appSrc.includes('PZ_POSTPAY.checks >= 4'),
  're-consulta /api/auth/me (refreshSession) cada ~5 s hasta 4 veces y actualiza el texto al flipear');
ok(appSrc.includes("api.get('/api/billing/plans'") && appSrc.includes('async function pzPostPayPlanName'),
  'el nombre del plan sale del catálogo /api/billing/plans (el mismo de Mi plan)');

section('4 · chunk-ajustes.js: plan=error amable (estático)');
const ajSrc = read(path.join('public', 'chunk-ajustes.js'));
ok(ajSrc.includes('El pago no se completó — no se hizo ningún cargo. Cuando quieras, lo intentamos de nuevo desde Mi plan.'),
  'banner plan=error ES: «El pago no se completó — no se hizo ningún cargo. Cuando quieras, lo intentamos de nuevo desde Mi plan.»');
ok(ajSrc.includes("The payment wasn't completed — no charge was made. Whenever you're ready, we can try again from My plan."),
  'banner plan=error EN (espejo)');
ok(ajSrc.includes('id="planErrorMsg"'), 'el banner tiene id propio (planErrorMsg), arriba de la vista');
ok(!ajSrc.includes('❌ El pago no se completó') && !ajSrc.includes('❌ The payment was not completed'),
  'la versión agresiva vieja (❌ + clase err) quedó eliminada');
ok(ajSrc.includes("indexOf('plan=error')") && ajSrc.includes("history.replaceState(null, '', location.pathname + '#/app/ajustes')"),
  'limpia el parámetro plan=error tras mostrarlo (refresh no lo resucita)');

console.log(fails === 0 ? '\nTODO VERDE ✅' : `\n${fails} FALLOS ❌`);
process.exit(fails === 0 ? 0 : 1);
