'use strict';
/* =====================================================================
   LOTE ADS-WEB-ESPACIO — suite propia (26/11/2026)
   El dueño, con captura de Ads en website: «acá también deberíamos
   mejorar el espacio del website, ¿no?». Mock aprobado por él
   («dale, subilo así»): LA MISMA pantalla (mismos elementos, misma
   copia, sin agregar nada), mejor repartida en el escritorio:
   A. La columna derecha (elegir otro + activos + filas) queda
      AGRUPADA ARRIBA: las tres piezas viajan en un contenedor
      (.pz-ads-side) que es un solo ítem de la grilla — antes cada
      pieza caía en una fila distinta de la tarjeta de impulso y
      entre la primera y la última quedaba el hueco de su captura.
   B. La tarjeta de impulso gana un poco de aire (padding 22px) y
      la miniatura del posteo elegido crece (92→104px), solo en
      escritorio.
   C. El móvil no cambia: la pila del contenedor es transparente
      y la regla base de .pz-ads queda intacta. El modo elegir
      (grilla del feed) no se toca.
   Control: contra el árbol anterior (ADSWEB_ROOT=<base>) la
   suite falla en los pines del lote.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ADSWEB_ROOT || path.resolve(__dirname);
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok ·', label); }
  else { fail++; fails.push(label); console.log('  XX ·', label, extra ? '→ ' + String(extra).slice(0, 200) : ''); }
}

const CSS = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');

console.log('\n— A. La columna derecha agrupada —');
ok(APP.includes('<div class="pz-ads-side">${pzAdsPickRowHTML()}${pzAdsImpulsosActivosHTML()}${pzAdsFilasHTML()}</div>'), 'A1 · pzAdsHTML envuelve las tres piezas derechas en .pz-ads-side');
ok(CSS.includes('.pz-ads-side{display:flex;flex-direction:column;min-width:0}'), 'A2 · el contenedor apila sus piezas en columna');
ok(CSS.includes('#pzAdsRoot>.pz-ads-side{grid-column:2}'), 'A3 · en escritorio el contenedor es el ítem de la columna 2');
ok(!CSS.includes('#pzAdsRoot>.pz-ads-pickrow,#pzAdsRoot>.pz-ads-rows'), 'A4 · el reparto viejo por filas (el del hueco) ya no está');

console.log('\n— B. Aire de la tarjeta de impulso (solo escritorio) —');
ok(CSS.includes('.pz-ads-rec .pz-boost-3d3{padding:22px}'), 'B1 · la tarjeta de impulso con padding 22px en escritorio');
ok(CSS.includes('.pz-ads-rec-thumb{width:104px;height:104px}'), 'B2 · la miniatura del posteo elegido a 104px en escritorio');
const iAire = CSS.indexOf('.pz-ads-rec .pz-boost-3d3{padding:22px}');
ok(CSS.lastIndexOf('@media(min-width:1024px)', iAire) > CSS.indexOf('.pz-ads{max-width:560px'), 'B3 · las reglas de aire viven dentro del bloque ≥1024px');

console.log('\n— C. Móvil y modo elegir intactos —');
ok(CSS.includes('.pz-ads{max-width:560px;margin:0 auto;padding:6px 14px 90px}'), 'C1 · la regla base de .pz-ads (móvil) queda intacta');
ok(APP.includes('if (pzAdsModoElegir) return pzAdsElegirHTML(recHTML);'), 'C2 · el modo elegir sigue devolviendo su propia pantalla');
ok(APP.includes('#pzAdsRoot:has(>.pz-ads-pick-head)') || CSS.includes('#pzAdsRoot:has(>.pz-ads-pick-head){display:block}'), 'C3 · la regla que apaga la grilla en modo elegir sigue en pie');

console.log('\n— D. Sellos —');
const buildSrv = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildApp = (APP.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
ok(!!buildSrv && buildSrv === buildApp, 'D1 · BUILD_ID y PZ_BUILD en paridad', buildSrv + ' / ' + buildApp);
ok(IDX.includes('app.js?v=962'), 'D2 · el índice ES sirve el app.js del build');
ok(IDX.includes('styles.css?v=20261356') && IDXEN.includes('styles.css?v=20261356'), 'D3 · styles?v= nuevo e IGUAL en los dos índices (ES y EN)');

console.log(`\n===== ADS-WEB-ESPACIO: ${pass} ok · ${fail} fallos =====`);
if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
process.exit(fail ? 1 : 0);
