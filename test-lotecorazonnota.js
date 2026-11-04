// test-lotecorazonnota.js — LOTE NOTA DEL CORAZÓN, LIBERACIÓN v606 (ADAPTADO).
// El lote original (1/11, 53/53) movía la nota <p class="hf-nota"> de
// DESPUÉS de la grilla a justo después de las pestañas, con texto corto.
// Esa ubicación quedó SUPERSEDED por inicio-3 (v585): la nota vive SOLO
// en el encabezado, junto a «Aceptar todo» (span.hf-accept-note, textos
// exactos ES «Tocá el corazón para aprobar.» / EN «Tap the heart to
// approve.»). Ponerla arriba de la grilla la duplicaría, y el comentario
// de inicio-3 lo prohíbe explícito: «no se pone la nota en dos lugares».
// Resto real al liberar contra v605: la vieja línea hf-nota SEGUÍA
// renderizándose después de la grilla con el texto largo viejo
// («...aprobar el posteo. Todos salen en su fecha, salvo que pidas un
// cambio.»), o sea la nota estaba en DOS lugares. Fix v606: se ELIMINA
// esa línea vieja. La nota queda solo en el encabezado. Sin funciones
// nuevas, sin cambio de styles (la regla .hf-nota queda muerta, inofensiva).
// Node puro, lee el árbol. Uso: node test-lotecorazonnota.js
'use strict';
const fs = require('fs');
const path = require('path');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const cnt = (s, sub) => (s.split(sub).length - 1);

// --- La vieja nota bajo la grilla ya no existe ---
t(cnt(app, 'hf-nota') === 0, 'hf-nota aparece 0 veces en app.js (línea vieja eliminada)');
t(cnt(app, 'Todos salen en su fecha, salvo que pidas un cambio.') === 0, '0 ocurrencias frase vieja ES en app.js');
t(cnt(app, 'They all go out on their date, unless you ask for a change.') === 0, '0 ocurrencias frase vieja EN en app.js');
for (const f of fs.readdirSync(path.join(__dirname, 'public'))) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(__dirname, 'public', f), 'utf8');
  t(!src.includes('Todos salen en su fecha, salvo que pidas un cambio.'), 'sin frase vieja ES en public/' + f);
  t(!src.includes('They all go out on their date, unless you ask for a change.'), 'sin frase vieja EN en public/' + f);
}

// --- La nota vive SOLO en el encabezado, con los textos exactos del lote ---
t(app.includes('hf-accept-note'), 'existe span.hf-accept-note en el encabezado');
t(app.includes('Tocá el corazón para aprobar.'), 'texto ES exacto del lote en el encabezado');
t(app.includes('Tap the heart to approve.'), 'texto EN exacto del lote en el encabezado');
t(app.includes('hf-pacts-accept'), 'la fila hf-pacts-accept del encabezado sigue presente');

// --- Orden de inicioView intacto, sin nota entre grilla y píldora ---
const vistaIdx = app.indexOf('id="inicioView"');
t(vistaIdx > 0, 'existe el template de inicioView');
const vista = vistaIdx > 0 ? app.slice(vistaIdx, vistaIdx + 20000) : '';
const iTabs = vista.indexOf('hfTabsHTML');
const iGrid = vista.indexOf('${gridHTML}');
const iPill = vista.indexOf('${visitorPillHTML}');
const iChat = vista.indexOf('id="mzChatBar"');
t(iTabs > 0 && iGrid > 0 && iPill > 0 && iChat > 0, 'pestañas, grilla, píldora y chat presentes en inicioView');
t(iTabs < iGrid && iGrid < iPill && iPill < iChat, 'orden intacto: pestañas → grilla → píldora → chat, sin nota en medio');

// --- Corazones de las tiles: no tocados ---
t(cnt(app, "pzIc('heart'") >= 1, 'el corazón de las tiles sigue presente');

console.log(`lotecorazonnota-v606: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
