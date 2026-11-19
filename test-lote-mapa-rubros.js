'use strict';
/* test-lote-mapa-rubros.js — LOTE MAPA-RUBROS (superficies vivas).
 * Un rubro por sección y ningún tattoo en lo que YA está vivo (base HEAD
 * 6fec4fa9): fuera Scorpion de #crecimiento · Mañana = Highland Bakery ·
 * Vender = Home Slice Pizza · Llegada (mk) = The Coffee Bar · tira de
 * prueba = el trío de Big Top. Tomoko queda solo donde el bosquejo
 * aprobado la asigna (Producto = Berry, Ads = Yuzu) — declarado.
 * Uso: node test-lote-mapa-rubros.js [root]  (default: ./tree)
 * Control: contra ./base tiene que fallar. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = process.argv[2] || path.join(__dirname, 'tree');
const BASE = path.join(__dirname, 'base');
let ok = 0, mal = 0;
const T = (c, l) => { if (c) { ok++; } else { mal++; console.log('  MAL:', l); } };
const rd = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const count = (s, n) => s.split(n).length - 1;
function region(s, a, b) { const i = s.indexOf(a); if (i < 0) return ''; const j = s.indexOf(b, i); return j < 0 ? '' : s.slice(i, j); }

/* ---------- A. diff exacto contra la base ---------- */
const NEW_ASSETS = ['lp-bigtop-dia1.jpg', 'lp-bigtop-dia2.jpg', 'lp-bigtop-dia3.jpg',
  'lp-coffeebar-muro.jpg', 'lp-coffeebar-pieza.jpg', 'lp-coffeebar-terraza.jpg',
  'lp-highland-avatar.jpg', 'lp-highland-sandwich.jpg',
  'lp-homeslice-entera.jpg', 'lp-homeslice-porcion.jpg', 'lp-homeslice-siciliana.jpg'];
for (const f of ['public/app.js', 'public/en/index.html', 'public/index.html'])
  T(md5(path.join(ROOT, f)) !== md5(path.join(BASE, f)), 'A: cambió ' + f);
for (const a of NEW_ASSETS) T(fs.existsSync(path.join(ROOT, 'public', a)), 'A: asset nuevo ' + a);

const app = rd(ROOT, 'public/app.js');
const en = rd(ROOT, 'public/en/index.html');
const idx = rd(ROOT, 'public/index.html');

/* ---------- B. tattoo fuera de lo vivo ---------- */
T(!app.includes('Scorpion') && !app.includes('lp-scorpion'), 'B: ES sin Scorpion en todo app.js');
T(!en.includes('Scorpion') && !en.includes('lp-scorpion'), 'B: EN sin Scorpion en todo el espejo');
T(count(app, 'strat-chip') >= 2 && !app.includes('data-strat="2"'), 'B: ES quedan 2 chips de estrategia (0 y 1)');
T(!en.includes('data-strat="2"'), 'B: EN quedan 2 chips de estrategia');

/* ---------- C. Mañana = Highland Bakery ---------- */
for (const [tag, s] of [['ES', app], ['EN', en]]) {
  const mv = region(s, '<div class="mv-scene">', '<div class="mv-payoff">');
  T(mv.includes('highlandbakery') && mv.includes('lp-highland-sandwich.jpg') && mv.includes('lp-highland-avatar.jpg'), `C: mañana ${tag} = Highland Bakery`);
  T(!mv.toLowerCase().includes('tomoko'), `C: mañana ${tag} sin Tomoko`);
}
T(app.includes('Buen día, Highland Bakery'), 'C: saludo ES de Highland');
T(en.includes('Good morning, Highland Bakery'), 'C: saludo EN de Highland');

/* ---------- D. Vender = Home Slice Pizza ---------- */
for (const [tag, s] of [['ES', app], ['EN', en]]) {
  T(s.includes('lp-homeslice-porcion.jpg') && s.includes('lp-homeslice-siciliana.jpg') && s.includes('lp-homeslice-entera.jpg'), `D: vender ${tag} con fotos de Home Slice`);
}
T(app.includes('La porción estilo Nueva York') && app.includes('Siciliana de pepperoni') && app.includes('La pizza entera'), 'D: filas ES de Home Slice');
T(en.includes('The New York–style slice') && en.includes('Pepperoni sicilian') && en.includes('The whole pie'), 'D: filas EN de Home Slice');

/* ---------- E. Llegada (mk) = The Coffee Bar ---------- */
for (const [tag, s] of [['ES', app], ['EN', en]]) {
  const mk = region(s, '<div class="mk-arrive">', '<div class="pz-beforeafter">');
  T(mk.includes('The Coffee Bar') && mk.includes('lp-coffeebar-terraza.jpg'), `E: llegada ${tag} = The Coffee Bar (re-pin de liberación: el @ vivía solo en la caption mk-feed-cap que FUERA-REPETIDO eliminó; la escena nombra al negocio en los alt)`);
  T(!mk.toLowerCase().includes('tomoko'), `E: llegada ${tag} sin Tomoko`);
}

/* ---------- F. Tira de prueba = trío Big Top ---------- */
for (const [tag, s] of [['ES', app], ['EN', en]]) {
  const wd = region(s, '<div class="wd-trial">', '<div class="section');
  T(wd.includes('lp-bigtop-dia1.jpg') && wd.includes('lp-bigtop-dia2.jpg') && wd.includes('lp-bigtop-dia3.jpg'), `F: tira ${tag} = trío Big Top`);
  T(!wd.toLowerCase().includes('tomoko') && !wd.includes('miogelato'), `F: tira ${tag} sin Tomoko ni gelato`);
}
T(app.includes('Tu video de 30 segundos, como una película.'), 'F: día 3 ES declarado video');
T(en.includes('Your 30-second video, like a little film.'), 'F: día 3 EN declarado video');

/* ---------- G. lo declarado queda intacto ---------- */
T(app.includes('lp-tomoko-berry.jpg'), 'G: Producto (Berry) intacto — asignación del bosquejo');
T(app.includes('lp-tomoko-yuzu.jpg'), 'G: Ads (Yuzu) intacto — asignación del bosquejo');
T(app.includes('lp-es-sotto') && !app.includes('Tomoko · pastelería') && !app.includes('data-strat='), 'G: ESTRATEGIA-VIVA aterrizada: switcher Sotto/A Cappella/Yoga, sin tabs viejas (re-pin de liberación)');

/* ---------- H. assets reales (dimensiones) ---------- */
const dimChk = spawnSync('python3', ['-c',
  'import sys; from PIL import Image; bad=[p for p in sys.argv[1:] if Image.open(p).size!=(540,675)]; print("BAD:"+",".join(bad) if bad else "ALL-OK")',
  ...NEW_ASSETS.filter(a => a !== 'lp-highland-avatar.jpg').map(a => path.join(ROOT, 'public', a))], { encoding: 'utf8' });
T((dimChk.stdout || '').includes('ALL-OK'), 'H: assets 540×675 JPEG reales');
const avChk = spawnSync('python3', ['-c',
  'import sys; from PIL import Image; print("OK" if Image.open(sys.argv[1]).size==(150,150) else "BAD")',
  path.join(ROOT, 'public', 'lp-highland-avatar.jpg')], { encoding: 'utf8' });
T((avChk.stdout || '').includes('OK'), 'H: avatar Highland 150×150');

/* ---------- I. sello + sintaxis ---------- */
T(idx.includes('app.js?v=807') && !idx.includes('app.js?v=806'), 'I: sello de liberación app.js?v=807 (re-pin por orden de aterrizaje)');
const chk = spawnSync('node', ['--check', path.join(ROOT, 'public', 'app.js')], { encoding: 'utf8' });
T(chk.status === 0, 'I: node --check app.js');

console.log(`MAPA-RUBROS: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
