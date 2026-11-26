'use strict';
/* =====================================================================
   LOTE ADS-GUIA-META — suite propia (26/11/2026)
   Pedido del dueño (26/11): «quiero asegurarme de que los demás
   puedan hacerlo, y que sepan cómo hacerlo» — el producto avisaba
   que el Instagram del espacio no está en la cuenta publicitaria,
   pero no explicaba cómo se hace (el paso vive dentro de Meta).

   El lote: en el detalle de Conexión de Ads, SOLO cuando ese es
   el límite del espacio, aparece la guía aprobada en mock: los 4
   pasos, el botón que abre la configuración de SU negocio en
   Meta directo en la sección de cuentas de Instagram (con el
   business_id de su conexión), la rama «todavía no tenés cuenta
   publicitaria» y el botón «Ya lo hice, revisá de nuevo» que
   relee la conexión y repinta. Si está conectado, la guía NO
   aparece (regla del dueño: conectado = sin instrucciones).
   Control: contra el árbol anterior (ADSGUIA_ROOT=<base>) la
   suite falla en los pines del lote.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ADSGUIA_ROOT || path.resolve(__dirname);
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok ·', label); }
  else { fail++; fails.push(label); console.log('  XX ·', label, extra ? '→ ' + String(extra).slice(0, 220) : ''); }
}

const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

console.log('\n— A. La guía existe y está enganchada —');
ok(APP.includes('function pzAdsGuiaMetaHTML()'), 'A1 · existe la guía de Meta');
ok(APP.includes('${pzAdsGuiaMetaHTML()}'), 'A2 · el detalle de Conexión la pinta');
ok(APP.includes('function pzAdsGuiaRevisar(btn)'), 'A3 · existe el «revisá de nuevo»');
const iRev = APP.indexOf('async function pzAdsGuiaRevisar');
const revTxt = iRev >= 0 ? APP.slice(iRev, iRev + 500) : '';
ok(revTxt.includes('await pzBoostLoad()') && revTxt.includes('pzAdsPintar()'), 'A4 · revisar = releer la conexión y repintar Ads');

console.log('\n— B. El botón de Meta lleva al lugar correcto —');
ok(SRV.includes('business_id: conn.client_business_id || null'), 'B1 · el servidor expone el negocio de Meta de la conexión');
ok(APP.includes("'https://business.facebook.com/settings/instagram-account'"), 'B2 · el botón abre la sección de cuentas de Instagram de Meta');
ok(APP.includes("'?business_id=' + encodeURIComponent(cx.business_id)"), 'B3 · …del negocio DEL CLIENTE (su business_id), no una portada genérica');
ok(APP.includes('target="_blank" rel="noopener"'), 'B4 · se abre en pestaña nueva, sin perder la pantalla de Ads');

console.log('\n— C. Funcional: la guía, extraída y corrida —');
try {
  const iFn = APP.indexOf('function pzAdsGuiaMetaHTML()');
  const fnTxt = APP.slice(iFn, APP.indexOf('\n}\n', iFn) + 3);
  global.esc = (t) => String(t == null ? '' : t);
  global.gzT = (es, en) => es;
  global.ME = { lang: 'es' };
  const guia = eval('(' + fnTxt + ')');
  global.pzBoostState = { motivoGate: 'ig_fuera_de_cuenta_publicitaria', motivoIg: 'postycommunitymanager', conexion: { business_id: '1140848162035745', ig_username: 'posty.communitymanager' } };
  const html = guia();
  ok(html.includes('Cómo sumar tu Instagram a tu cuenta publicitaria'), 'C1 · con el límite activo, la guía aparece con su título');
  ok(html.includes('business.facebook.com/settings/instagram-account?business_id=1140848162035745'), 'C2 · el botón lleva a SU negocio en Meta, sección Instagram');
  ok(html.includes('@postycommunitymanager'), 'C3 · el paso 3 nombra el Instagram de este espacio');
  ok(html.includes('¿Todavía no tenés cuenta publicitaria?'), 'C4 · la rama sin cuenta publicitaria está');
  ok(html.includes('pzAdsGuiaRevisar(this)'), 'C5 · el botón «Ya lo hice, revisá de nuevo» está');
  global.pzBoostState = { motivoGate: '', motivoIg: '', conexion: { business_id: '1140848162035745' } };
  ok(guia() === '', 'C6 · conectado (sin límite): la guía NO aparece');
  global.pzBoostState = { motivoGate: 'sin_cuenta_publicitaria', motivoIg: '', conexion: {} };
  ok(guia() === '', 'C7 · otro límite distinto: la guía tampoco aparece (es de este paso, no genérica)');
} catch (e) {
  ok(false, 'C · la guía extraída corre', e && e.message);
}

console.log('\n— D. Sellos —');
const buildSrv = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildApp = (APP.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
ok(!!buildSrv && buildSrv === buildApp, 'D1 · BUILD_ID y PZ_BUILD en paridad', buildSrv + ' / ' + buildApp);
ok(IDX.includes('app.js?v=965'), 'D2 · el índice ES sirve el app.js del build');

console.log(`\n===== ADS-GUIA-META: ${pass} ok · ${fail} fallos =====`);
if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
process.exit(fail ? 1 : 0);
