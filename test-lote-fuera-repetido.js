// test-lote-fuera-repetido.js — LOTE FUERA-REPETIDO: sale de la landing el
// bloque de texto repetido bajo las fotos de la escena «hoy» (mk-arrive:
// burbuja de Posty «Tu posteo del día ya está listo» + chip HOY + las 3
// fotos de Patisserie Tomoko). Decisión de Valentino 2026-11-18 21:47 sobre
// captura de la landing: «esto lo eliminamos, ¿no? da información repetida»
// — la caption («patisserietomoko · El de hoy es la Berry Mille Crepe:
// salió a las 19:00 y ya está en tu feed, resaltado.») repite lo que la
// burbuja ya dice, y la línea de control («¿No te cierra? Lo rehacés, lo
// editás, lo frenás o lo eliminás — todo desde la app, en un toque.», la
// .mk-ctrl que era pendiente nombrado) repite el control que la app ya
// muestra. La ESCENA (burbuja + fotos) QUEDA; sale solo el bloque de texto,
// ES+EN.
// Suite ESTÁTICA (sin boot): el bloque = 0 ES+EN, la escena intacta por
// hash de sus partes (burbuja, feed de fotos, comparador vecino) y los
// sobrevivientes declarados pineados: la frase in-app de app.js («lo
// frenás o lo cambiás en un toque» — superficie de cliente, fuera de
// alcance) y las reglas CSS .mk-feed-cap/.mk-ctrl de styles.css, que
// quedan inertes (precedente ADS-VIVO/SUBIR-VIVO: styles.css no se toca).
// Uso: node test-lote-fuera-repetido.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const en = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');

let ok = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + name); }
  else { fail++; console.log('  XX  ' + name + (extra ? ' — ' + extra : '')); }
}
function count(s, sub) { return s.split(sub).length - 1; }
function block(s, a, b) {
  let i = s.indexOf(a);
  if (i < 0) return '';
  i = s.lastIndexOf('\n', i) + 1;
  const j = s.indexOf(b, i + a.length);
  if (j < 0) return '';
  return s.slice(i, s.lastIndexOf('\n', j));
}
function feedblock(s) {
  const i = s.indexOf('<div class="mk-feed">');
  if (i < 0) return '';
  const j = s.indexOf('lp-tomoko-yuzu.jpg', i);
  if (j < 0) return '';
  const k = s.indexOf('\n  </div>', j);
  if (k < 0) return '';
  return s.slice(i, k + '\n  </div>'.length);
}
function h16(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16); }

// --- sintaxis ---
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public', 'app.js')]); check('app.js: node --check', true); }
catch (e) { check('app.js: node --check', false, String(e).slice(0, 200)); }

// --- ES: el bloque repetido, en 0 ---
check('ES: caption «El de hoy es la Berry Mille Crepe: salió a las 19:00…» = 0', count(app, 'El de hoy es la Berry Mille Crepe') === 0);
check('ES: línea de control «¿No te cierra? Lo rehacés, lo editás, lo frenás o lo eliminás» = 0', count(app, '¿No te cierra? Lo rehacés') === 0 && count(app, 'lo frenás o lo eliminás') === 0);
check('ES: clase mk-feed-cap en app.js = 0', count(app, 'mk-feed-cap') === 0);
check('ES: clase mk-ctrl en app.js = 0', count(app, 'mk-ctrl') === 0);

// --- ES: la escena «hoy» queda completa ---
check('ES: mk-arrive presente', app.includes('<div class="mk-arrive">'));
check('ES: burbuja «Tu posteo del día ya está listo» presente', app.includes('Tu posteo del día ya está listo. Sale hoy 7pm al feed y a tu story.'));
check('ES: burbuja byte-idéntica (hash base 9df1d35d)', h16(block(app, '<div class="mk-notif">', '<div class="mk-feed">')) === '5fbdb0b66c6f093c');
check('ES: feed de fotos byte-idéntico (hash base 9df1d35d)', h16(feedblock(app)) === '764158d65727d7b3');
check('ES: las 3 fotos de la escena presentes', app.includes('lp-tomoko-berry.jpg') && app.includes('lp-tomoko-hojicha.jpg') && app.includes('lp-tomoko-yuzu.jpg'));
check('ES: chip HOY presente', app.includes('<span class="mk-hoy-tag">HOY</span>'));
check('ES: escena sin hueco — el feed cierra directo contra el fin de mk-arrive', app.includes('</figure>\n  </div>\n</div>'));
check('ES: comparador vecino byte-idéntico', h16(block(app, '<div class="pz-beforeafter">', '<div class="section lp-week-sec" id="prueba">')) === 'ff06d9ef0c2b935c');
check('ES: #ejemplos conserva el form de la puerta (lp-show-cta)', app.includes('lp-show-cta'));

// --- EN: espejo ---
check('EN: caption «Today\'s is the Berry Mille Crepe: it went out at 7:00 PM…» = 0', count(en, "Today's is the Berry Mille Crepe") === 0);
check('EN: línea de control «Not feeling it? Redo it, edit it, pause it or delete it» = 0', count(en, 'Not feeling it? Redo it, edit it') === 0 && count(en, 'pause it or delete it') === 0);
check('EN: clase mk-feed-cap en EN = 0', count(en, 'mk-feed-cap') === 0);
check('EN: clase mk-ctrl en EN = 0', count(en, 'mk-ctrl') === 0);
check('EN: mk-arrive presente con su burbuja', en.includes('<div class="mk-arrive">') && en.includes('Your post of the day is ready. It goes out today at 7pm to your feed and your story.'));
check('EN: burbuja byte-idéntica (hash base 9df1d35d)', h16(block(en, '<div class="mk-notif">', '<div class="mk-feed">')) === '4fdb218828996d7d');
check('EN: feed de fotos byte-idéntico (hash base 9df1d35d)', h16(feedblock(en)) === '471af9a99b013a74');
check('EN: chip TODAY presente', en.includes('<span class="mk-hoy-tag">TODAY</span>'));
check('EN: escena sin hueco — el feed cierra directo contra el fin de mk-arrive', en.includes('</figure>\n  </div>\n</div>'));
check('EN: comparador vecino byte-idéntico', h16(block(en, '<div class="pz-beforeafter">', '<div class="section lp-week-sec" id="prueba">')) === '9c283104c13bd311');

// --- sobrevivientes declarados (fuera de alcance, pineados) ---
check('DECLARADO in-app: «lo frenás o lo cambiás en un toque» (superficie de cliente) sigue = 1', count(app, 'lo frenás o lo cambiás en un toque') === 1);
check('DECLARADO CSS: regla .mk-feed-cap inerte sigue en styles.css', css.includes('.mk-feed-cap{margin:10px 2px 0'));
check('DECLARADO CSS: regla .mk-ctrl inerte sigue en styles.css', css.includes('.mk-ctrl{margin:8px 2px 0'));
check('CSS: llaves balanceadas', count(css, '{') === count(css, '}'));

// --- stamps preparados (el liberador re-fija por orden de aterrizaje) ---
check('stamps: index ES app.js?v=806', idx.includes('app.js?v=806'));
check('stamps: index ES styles.css?v=20261300 sin cambio', idx.includes('styles.css?v=20261300'));
check('stamps: EN styles.css?v=20261300 sin cambio', en.includes('styles.css?v=20261300'));
check('stamps: EN no carga app.js', !en.includes('app.js?v='));

console.log(`\nFUERA-REPETIDO: ${ok} ok · ${fail} mal`);
process.exit(fail ? 1 : 0);
