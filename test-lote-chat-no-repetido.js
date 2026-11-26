'use strict';
/* =====================================================================
   LOTE CHAT-NO-REPETIDO — suite propia (26/11/2026)
   Orden del dueño con captura: en Inicio, la tarjeta del posteo del
   día («¿Necesitás un cambio en este posteo? Escribilo acá…») y la
   tarjeta general de chat del rail («Pedile lo que quieras, por
   escrito…») quedaban una debajo de la otra repitiendo la misma
   promesa y la misma respuesta estimada de 30 minutos. Su regla:
   «cuando el posteo del día está listo, el chat de abajo no hace
   falta».

   Pines:
   A. LA PREMISA: la tarjeta del posteo de hoy trae su puerta de
      cambio escrito en sus dos ramas (hero y normal).
   B. LA GUARDA: el rail monta la tarjeta general SOLO si no hay
      posteo del día (y nunca para el visitante); la tarjeta sigue
      definida y su único llamado es ese.
   C. SELLOS: BUILD/PZ_BUILD en paridad y el índice sirve el
      app.js del build.
   Control: contra el árbol anterior (CHATNOREP_ROOT=<base>) la
   suite falla en los pines del lote.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CHATNOREP_ROOT || path.resolve(__dirname);
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok ·', label); }
  else { fail++; fails.push(label); console.log('  XX ·', label, extra ? '→ ' + String(extra).slice(0, 200) : ''); }
}

const APP = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

console.log('\n— A. La premisa: el posteo de hoy ya trae su puerta —');
const hoyCard = APP.slice(APP.indexOf('pz-hoy-editbox'), APP.indexOf('pz-hoy-editbox') + 6000);
ok((hoyCard.match(/pzVozStripHTML\(p\)/g) || []).length >= 2, 'A1 · la tarjeta de hoy monta la tira de cambio en sus dos ramas (hero y normal)');
ok(APP.includes('Need a change to this post? Write it here and Posty takes care of it.') && APP.includes('¿Necesitás un cambio en este posteo? Escribilo acá y Posty se encarga.'), 'A2 · la copia de la puerta del posteo queda intacta (ES+EN)');

console.log('\n— B. La guarda del rail —');
ok(APP.includes("HF_VISITOR || hoyPostR1 ? '' : iwpChatCardHTML(enHome)"), 'B1 · el rail monta la tarjeta general solo cuando NO hay posteo del día');
ok(!APP.includes("HF_VISITOR ? '' : iwpChatCardHTML(enHome)"), 'B2 · la guarda vieja (siempre, salvo visitante) no existe más');
ok((APP.match(/iwpChatCardHTML\(enHome\)/g) || []).length === 1, 'B3 · un solo llamado a la tarjeta general: el del rail con su guarda');
ok(APP.includes('function iwpChatCardHTML(en)'), 'B4 · la tarjeta general sigue definida (vive para los días sin posteo)');
ok(APP.includes('LOTE CHAT-NO-REPETIDO'), 'B5 · el lote deja su comentario en el punto de la guarda');

console.log('\n— C. Sellos —');
const buildSrv = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildApp = (APP.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
ok(!!buildSrv && buildSrv === buildApp, 'C1 · BUILD_ID y PZ_BUILD en paridad', buildSrv + ' / ' + buildApp);
ok(IDX.includes('app.js?v=959'), 'C2 · el índice ES sirve el app.js del build');

console.log(`\n===== CHAT-NO-REPETIDO: ${pass} ok · ${fail} fallos =====`);
if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
process.exit(fail ? 1 : 0);
