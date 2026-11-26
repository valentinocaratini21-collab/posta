'use strict';
/* =====================================================================
   LOTE SUBIR-WEB-ZONA — suite propia (26/11/2026)
   Ajuste del lote SUBIR-WEB-ESPACIO (v1354) tras su verificación en
   el producto servido: la caja de escribir quedó en 120px ✓ y el
   contenido de la zona centrado ✓, pero la zona NO se estiraba —
   medía ~115px contra ~390px de la tarjeta de la idea. Causa: la
   idea abarcaba las filas 3 a 5 de la grilla y su altura se
   repartía entre las tres; la fila de la zona recibía un tercio.

   El ajuste (solo CSS de escritorio, una regla): la tarjeta de la
   idea vive SOLO en la fila 3 — la fila toma su altura entera y la
   zona, con align-self:stretch (v1354), la iguala. La bandeja de
   carga y las preguntas siguen en la columna izquierda (filas 4 y
   5). Control: contra el árbol v1354 la suite falla en el pin A1.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.SUBIRZONA_ROOT || path.resolve(__dirname);
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

console.log('\n— A. La fila única de la idea —');
ok(CSS.includes('.pz-subir>.pz-idea{grid-column:2;grid-row:3}'), 'A1 · la idea vive solo en la fila 3 (su altura entera va a esa fila)');
ok(!CSS.includes('.pz-subir>.pz-idea{grid-column:2;grid-row:3/span 3}'), 'A2 · el span de 3 filas (la causa del tercio) ya no está');

console.log('\n— B. Lo de v1354 sigue en pie —');
ok(CSS.includes('.pz-subir>.zona{align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center}'), 'B1 · la zona estirada y centrada (v1354)');
ok(CSS.includes('.pz-subir .pz-idea textarea{min-height:120px}'), 'B2 · la caja de escribir de 120px (v1354)');
ok(CSS.includes('.pz-subir{max-width:560px;margin:0 auto;padding:18px 16px 24px}'), 'B3 · la regla base (móvil) intacta');

console.log('\n— C. Sellos —');
const buildSrv = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildApp = (APP.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
ok(!!buildSrv && buildSrv === buildApp, 'C1 · BUILD_ID y PZ_BUILD en paridad', buildSrv + ' / ' + buildApp);
ok(IDX.includes('app.js?v=961'), 'C2 · el índice ES sirve el app.js del build');
ok(IDX.includes('styles.css?v=20261355') && IDXEN.includes('styles.css?v=20261355'), 'C3 · styles?v= nuevo e IGUAL en los dos índices');

console.log(`\n===== SUBIR-WEB-ZONA: ${pass} ok · ${fail} fallos =====`);
if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
process.exit(fail ? 1 : 0);
