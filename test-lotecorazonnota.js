// test-lotecorazonnota.js — LOTE NOTA DEL CORAZÓN, LIBERACIÓN v606 (ADAPTADO).
// Historia: el lote original (1/11, 53/53) movía la nota <p class="hf-nota"> de
// DESPUÉS de la grilla a justo después de las pestañas, con texto corto.
// Esa ubicación quedó SUPERSEDED por inicio-3 (v585): la nota vivió SOLO
// en el encabezado, junto a «Aceptar todo» (span.hf-accept-note).
// (SACAR-CORAZÓN 6/11 · decisión Valentino: el corazón para aprobar SALE
// del feed; la aprobación vive solo en el ritual [Sale así].) La nota
// instructiva SALE COMPLETA: ni en el encabezado ni bajo la grilla ni en
// ningún lado, en ningún idioma. Este archivo ahora es la regresión de
// esa ausencia: la nota no existe, el botón Aceptar todo queda solo en
// la fila del encabezado, y sin candidatos la fila no se renderiza.
// Node puro, lee el árbol. Uso: node test-lotecorazonnota.js
'use strict';
const fs = require('fs');
const path = require('path');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const cnt = (s, sub) => (s.split(sub).length - 1);

// --- La vieja nota bajo la grilla ya no existe (igual que en v606) ---
t(cnt(app, 'hf-nota') === 0, 'hf-nota aparece 0 veces en app.js (línea vieja eliminada)');
t(cnt(app, 'Todos salen en su fecha, salvo que pidas un cambio.') === 0, '0 ocurrencias frase vieja ES en app.js');
t(cnt(app, 'They all go out on their date, unless you ask for a change.') === 0, '0 ocurrencias frase vieja EN en app.js');
for (const f of fs.readdirSync(path.join(__dirname, 'public'))) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(__dirname, 'public', f), 'utf8');
  t(!src.includes('Todos salen en su fecha, salvo que pidas un cambio.'), 'sin frase vieja ES en public/' + f);
  t(!src.includes('They all go out on their date, unless you ask for a change.'), 'sin frase vieja EN en public/' + f);
}

// --- La nota del corazón NO existe en ningún lado (SACAR-CORAZÓN 6/11) ---
t(!app.includes('hf-accept-note'), 'sin span.hf-accept-note en app.js');
t(!css.includes('.hf-accept-note'), 'sin regla .hf-accept-note en styles.css');
t(cnt(app, 'Tocá el corazón en los posteos para aprobar.') === 0, '0 ocurrencias nota ES en app.js');
t(cnt(app, 'Tap the heart on the posts to approve.') === 0, '0 ocurrencias nota EN en app.js');
t(cnt(app, 'Tocá el corazón para aprobar.') === 0, '0 ocurrencias nota corta ES en app.js');
t(cnt(app, 'Tap the heart to approve.') === 0, '0 ocurrencias nota corta EN en app.js');
for (const f of fs.readdirSync(path.join(__dirname, 'public'))) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(__dirname, 'public', f), 'utf8');
  t(!src.includes('Tocá el corazón en los posteos para aprobar.'), 'sin nota ES en public/' + f);
  t(!src.includes('Tap the heart on the posts to approve.'), 'sin nota EN en public/' + f);
}

// --- La fila del encabezado queda: solo Aceptar todo, y nada sin candidatos ---
t(app.includes('hf-pacts-accept'), 'la fila hf-pacts-accept del encabezado sigue presente');
t(app.includes("if (!acceptHTML) return '';"), 'sin candidatos la fila no se renderiza (vacía, no un div vacío)');

// --- Orden de inicioView intacto (v708 sacó la chatbar de Inicio) ---
const vistaIdx = app.indexOf('id="inicioView"');
t(vistaIdx > 0, 'existe el template de inicioView');
const vista = vistaIdx > 0 ? app.slice(vistaIdx, vistaIdx + 20000) : '';
const iTabs = vista.indexOf('hfTabsHTML');
const iGrid = vista.indexOf('${gridHTML}');
const iPill = vista.indexOf('${visitorPillHTML}');
t(iTabs > 0 && iGrid > 0 && iPill > 0, 'pestañas, grilla y píldora presentes en inicioView');
t(iTabs < iGrid && iGrid < iPill, 'orden intacto: pestañas → grilla → píldora, sin nota en medio');

// --- Corazón fuera de las tiles: ni botón ni handler ni guard ---
t(cnt(app, 'data-hf-like') === 0, 'data-hf-like aparece 0 veces en app.js');
t(cnt(app, 'hfLikeBind') === 0, 'hfLikeBind aparece 0 veces en app.js');
t(cnt(app, 'hfTileApprove') === 0, 'hfTileApprove aparece 0 veces en app.js');

console.log(`lotecorazonnota-sacar-corazon: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
