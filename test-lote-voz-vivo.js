/* LOTE VOZ-VIVO — suite propia.
   La sección #voz pasa del mock aprobado por Valentino 18/11 («la semana que
   obedece») a producción: nota de voz VISUAL (sin audio en ninguna parte),
   4 pedidos en rotación — el cuarto PREGUNTA antes (mecanismo de una sola
   pregunta) — y la semana de Bill Lawrence Salon que se mueve con FLIP.
   ENMIENDA MAPA-RUBROS (18/11): la semana dejó de ser de Tomoko (pastelería
   queda solo en Constancia) y pasó al salón — misma mecánica, piel nueva.
   Uso: node test-lote-voz-vivo.js [root]   (default: este árbol)
   Control: correrla contra la base prístina → tiene que fallar. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = process.argv[2] || __dirname;
const BASE = '/home/hatch/workspace/.liberacion-voz-vivo/head'; /* re-pin del liberador: la base de esta liberación es el HEAD a4fddd5d */
const MOCK = '/home/hatch/workspace/your_files/voz-mock';

let okN = 0, malN = 0;
function ok(cond, label) {
  if (cond) { okN++; }
  else { malN++; console.log('  MAL:', label); }
}
function rd(p) { return fs.readFileSync(p, 'utf8'); }
function md5(p) { try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); } catch (e) { return null; } }
function count(hay, needle) { return hay.split(needle).length - 1; }

/* ---------- A · censo de diff exacto contra la base ---------- */
function walk(root, prefix, out) {
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + e.name : e.name;
    if (!prefix && rel === 'data') continue;               // data/ nunca se sube ni se censa
    if (!prefix && rel === 'test-lote-voz-vivo.js') continue; // la suite misma
    const full = path.join(root, e.name);
    if (e.isDirectory()) walk(full, rel, out);
    else if (e.isFile()) out[rel] = md5(full);
  }
  return out;
}
const baseFiles = walk(BASE, '', {});
const rootFiles = walk(ROOT, '', {});
const changed = [], added = [], removed = [];
for (const rel of Object.keys(rootFiles)) {
  if (!(rel in baseFiles)) added.push(rel);
  else if (baseFiles[rel] !== rootFiles[rel]) changed.push(rel);
}
for (const rel of Object.keys(baseFiles)) if (!(rel in rootFiles)) removed.push(rel);
const expChanged = ['public/app.js', 'public/en/index.html', 'public/index.html'].sort();
const expAdded = ['public/lp-billlawrence-aniv.jpg', 'public/lp-billlawrence-corte.jpg', 'public/lp-billlawrence-equipo.jpg', 'public/lp-billlawrence-espera.jpg', 'public/lp-billlawrence-ondas.jpg', 'public/lp-billlawrence-rubio.jpg', 'public/lp-billlawrence-salon.jpg'].sort();
ok(JSON.stringify(changed.sort()) === JSON.stringify(expChanged), 'A1 diff modificados = ' + JSON.stringify(changed));
ok(JSON.stringify(added.sort()) === JSON.stringify(expAdded), 'A2 diff agregados = ' + JSON.stringify(added));
ok(removed.length === 0, 'A3 sin archivos borrados (' + removed.join(',') + ')');

/* ---------- B · ES: app.js ---------- */
const app = rd(path.join(ROOT, 'public', 'app.js'));
const appBase = rd(path.join(BASE, 'public', 'app.js'));
const fnStart = app.indexOf('function lpVozHTML() {');
const fnEnd = app.indexOf('`;}', fnStart);
const vozFn = fnStart >= 0 && fnEnd > fnStart ? app.slice(fnStart, fnEnd) : '';
ok(vozFn.length > 3000, 'B1 lpVozHTML nueva presente (' + vozFn.length + ' bytes)');
ok(vozFn.includes('vz-scene'), 'B2 la escena vz- está en el HTML');
ok(vozFn.includes('entre cliente y cliente'), 'B3 sub del salón (enmienda MAPA-RUBROS)');
ok(vozFn.includes('La semana de Bill Lawrence Salon'), 'B4 la semana de Bill Lawrence Salon');
ok(!vozFn.includes('Tomoko'), 'B4b Tomoko fuera de #voz');
ok(vozFn.includes('Pedilo como quieras'), 'B5 título de rotación');
ok(vozFn.includes('A la mañana') && vozFn.includes('A la noche'), 'B6 botones de respuesta del beat que pregunta');
ok(!vozFn.includes('wd-vozrow'), 'B7 la fila vieja de un solo beat salió del HTML');
for (const img of ['lp-billlawrence-corte.jpg', 'lp-billlawrence-equipo.jpg', 'lp-billlawrence-rubio.jpg', 'lp-billlawrence-espera.jpg', 'lp-billlawrence-salon.jpg', 'lp-billlawrence-ondas.jpg', 'lp-billlawrence-aniv.jpg'])
  ok(vozFn.includes(img), 'B8 imagen de la semana: ' + img);
ok(vozFn.indexOf('data-key="equipo"') >= 0 && vozFn.indexOf('data-key="equipo"') < vozFn.indexOf('data-key="corte"'),
   'B9 estado estático = beat 1 asentado (La casa primero, espejo del mock)');
ok(vozFn.includes('vz-vreply on') && vozFn.includes('vz-proof on'), 'B10 sin JS se ve el beat 1 completo (respuesta + prueba visibles)');
ok(count(app, 'function lpVozInit()') === 1, 'B11 lpVozInit definida una vez');
ok(count(app, 'lpVozInit') === 3, 'B12 lpVozInit llamada en los dos caminos de render (def + 2)');
for (const s of ['Esta semana empujá el rubio, que es lo que más piden', 'El viernes cerramos por refacción, correlo todo',
                 'El posteo del sábado, correlo un poco', '¿Lo corro al sábado', 'movido por tu audio',
                 "proof:'swap'", "proof:'star'", "proof:'week'", 'Intercambiados,', 'Abre la semana,', 'queda libre'])
  ok(app.includes(s), 'B13 copia del motor ES: ' + s);
const engStart = app.indexOf('function lpVozInit()');
const engEnd = app.indexOf('\nfunction ', engStart + 10);
const engine = engStart >= 0 ? app.slice(engStart, engEnd > engStart ? engEnd : engStart + 14000) : '';
ok(!engine.includes('<audio') && !engine.includes('new Audio') && !engine.includes('.play('), 'B14 el motor no toca audio: la nota es visual');
ok(count(app, '<audio') === count(appBase, '<audio'), 'B15 ningún <audio> nuevo en todo app.js');
ok(app.includes('#voz .vz-week{') && app.includes('@keyframes vz-wv') && app.includes('#voz .vz-vnote.vz-playing .vz-vwave i'),
   'B16 CSS de la escena presente y acotada a #voz');
ok(count(app, '#voz .vz-scene{margin-top:36px') === 1, 'B17 bloque CSS de la escena una sola vez');

/* ---------- C · EN: en/index.html ---------- */
const en = rd(path.join(ROOT, 'public', 'en', 'index.html'));
const s0 = en.indexOf('<div class="section" id="voz">');
const s1 = en.indexOf('<div class="section" id="ads">');
const enSec = s0 >= 0 && s1 > s0 ? en.slice(s0, s1) : '';
ok(enSec.includes('vz-scene'), 'C1 escena vz- en la sección EN');
ok(enSec.includes("Bill Lawrence Salon's week"), 'C2 semana de Bill Lawrence EN');
ok(enSec.includes('Ask however you like'), 'C3 título de rotación EN');
ok(enSec.includes('In the morning') && enSec.includes('At night'), 'C4 botones de respuesta EN');
ok(enSec.includes("Change today's post for tomorrow's"), 'C5 cita del beat 1 EN (la de producción)');
ok(enSec.includes('moved by your voice note'), 'C6 chip de movido EN');
ok(!enSec.includes('wd-vozrow'), 'C7 la fila vieja salió de EN');
ok(!enSec.includes('Hablás') && !enSec.includes('Pedilo'), 'C8 sin copia ES en la sección EN');
ok(en.includes('function lpVozInitEN()'), 'C9 motor EN presente');
for (const s of ['This week push the blonde, it is the one everyone asks for', "We are closed this Friday for renovations, shift it all",
                 'Move it to Saturday', 'goes out in the morning', 'goes out at night', 'Opens the week,', 'stays free'])
  ok(en.includes(s), 'C10 copia del motor EN: ' + s);
ok(count(en, '#voz .vz-scene{margin-top:36px') === 1, 'C11 bloque CSS de la escena una sola vez en EN');
ok(!en.includes('app.js?v='), 'C12 EN sigue sin cargar app.js (como la base)');

/* ---------- D · assets ---------- */
const NEWIMG = ['lp-billlawrence-corte.jpg', 'lp-billlawrence-equipo.jpg', 'lp-billlawrence-rubio.jpg', 'lp-billlawrence-espera.jpg', 'lp-billlawrence-salon.jpg', 'lp-billlawrence-ondas.jpg', 'lp-billlawrence-aniv.jpg'];
const dimChk = spawnSync('python3', ['-c',
  'import sys; from PIL import Image; bad=[p for p in sys.argv[1:] if Image.open(p).size!=(540,675)]; print("BAD:"+",".join(bad) if bad else "ALL-OK")',
  ...NEWIMG.map(a => path.join(ROOT, 'public', a))], { encoding: 'utf8' });
ok((dimChk.stdout || '').includes('ALL-OK'), 'D1 assets nuevos = JPEG 540×675 reales del salón (' + (dimChk.stdout || dimChk.stderr || '').trim().slice(0, 80) + ')');
for (const a of ['lp-tomoko-hojicha-det.jpg', 'lp-tomoko-yuzu.jpg', 'lp-tomoko-berry.jpg', 'lp-tomoko-hojicha.jpg', 'ai-avatar.png'])
  ok(md5(path.join(ROOT, 'public', a)) === md5(path.join(BASE, 'public', a)), 'D2 asset compartido intacto: ' + a);

/* ---------- E · sello ---------- */
const idx = rd(path.join(ROOT, 'public', 'index.html'));
ok(idx.includes('app.js?v=801') && !idx.includes('app.js?v=800'), 'E1 sello de aterrizaje app.js?v=801 (re-fijado por el liberador por orden)');

/* ---------- F · sintaxis ---------- */
const chk = spawnSync('node', ['--check', path.join(ROOT, 'public', 'app.js')], { encoding: 'utf8' });
ok(chk.status === 0, 'F1 node --check app.js');

console.log('LOTE VOZ-VIVO: ' + okN + ' ok · ' + malN + ' mal');
process.exit(malN ? 1 : 0);
