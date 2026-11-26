'use strict';
/* =====================================================================
   LOTE SUBIR-WEB-ESPACIO — suite propia (26/11/2026)
   El dueño, con captura de la pantalla Subir en website: «podemos
   aprovechar mucho más el espacio de website». Tras dos vueltas de
   mock dejó la composición exacta: LA MISMA pantalla (mismos
   elementos, misma copia, sin agregar nada), mejor repartida en el
   escritorio — y dos ajustes suyos: «ponelo más arriba» (con un
   poquitito de aire más) y «un poco más de espacio para escribir».

   El lote es SOLO CSS de escritorio (≥1024px):
   A. La zona de carga se estira a la altura de la tarjeta de la
      idea, con su contenido centrado en vertical.
   B. La caja de escribir de la idea gana altura real (120px).
   C. Un poco más de aire arriba del título (padding-top 32px).
   D. El móvil NO cambia: la regla base de .pz-subir queda intacta
      y ninguna regla del lote vive fuera del bloque ≥1024px.
   E. Sellos: BUILD/PZ_BUILD en paridad, app.js?v= del índice y
      styles?v= IGUAL en los dos índices (ES y EN).
   Control: contra el árbol anterior (SUBIRWEB_ROOT=<base>) la
   suite falla en los pines del lote.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.SUBIRWEB_ROOT || path.resolve(__dirname);
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

console.log('\n— A/B/C. El reparto de escritorio —');
ok(CSS.includes('.pz-subir>.zona{align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center}'), 'A1 · la zona se estira a la altura de la idea, contenido centrado en vertical');
ok(CSS.includes('.pz-subir .zona .plus{margin:0 0 9px}'), 'A2 · el + de la zona sin el margen automático viejo (lo centra el flex)');
ok(CSS.includes('.pz-subir .pz-idea textarea{min-height:120px}'), 'B1 · la caja de escribir de la idea con 120px en escritorio');
ok(CSS.includes('.pz-subir{padding-top:32px}'), 'C1 · aire arriba del título en escritorio (32px)');

console.log('\n— D. El móvil no cambia —');
ok(CSS.includes('.pz-subir{max-width:560px;margin:0 auto;padding:18px 16px 24px}'), 'D1 · la regla base de .pz-subir (móvil) queda intacta');
const iZona = CSS.indexOf('.pz-subir>.zona{align-self:stretch');
const bloque = CSS.lastIndexOf('@media(min-width:1024px)', iZona);
const baseIdx = CSS.indexOf('.pz-subir{max-width:560px');
ok(bloque > baseIdx && iZona > bloque, 'D2 · las reglas del lote viven dentro de un bloque ≥1024px posterior a la base');
ok((CSS.match(/LOTE SUBIR-WEB-ESPACIO/g) || []).length === 1, 'D3 · el lote deja su comentario una sola vez');

console.log('\n— E. Sellos —');
const buildSrv = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildApp = (APP.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
ok(!!buildSrv && buildSrv === buildApp, 'E1 · BUILD_ID y PZ_BUILD en paridad', buildSrv + ' / ' + buildApp);
ok(IDX.includes('app.js?v=960'), 'E2 · el índice ES sirve el app.js del build');
ok(IDX.includes('styles.css?v=20261354') && IDXEN.includes('styles.css?v=20261354'), 'E3 · styles?v= nuevo e IGUAL en los dos índices (ES y EN)');

console.log(`\n===== SUBIR-WEB-ESPACIO: ${pass} ok · ${fail} fallos =====`);
if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
process.exit(fail ? 1 : 0);
