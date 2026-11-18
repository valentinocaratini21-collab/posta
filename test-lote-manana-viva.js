// test-lote-manana-viva.js — LOTE MANANA-VIVA: la sección «Así aparece tu
// posteo del día, todas las mañanas» pasa a ser «un día en dos actos»
// (mock aprobado por Valentino 2026-11-18 13:26, dos veces).
// Suite ESTÁTICA (sin boot): lee los archivos del árbol y verifica la
// escena nueva ES+EN, el censo de la escena vieja (burbuja «En 30
// minutos…» = 0), la regla compartida del chip Posteado intacta para las
// otras escenas, los stamps y la sintaxis de app.js.
// Uso: node test-lote-manana-viva.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const en = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');

let ok = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + name); }
  else { fail++; console.log('  XX  ' + name + (extra ? ' — ' + extra : '')); }
}
function count(s, sub) { return s.split(sub).length - 1; }

// --- sintaxis ---
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public', 'app.js')]); check('app.js: node --check', true); }
catch (e) { check('app.js: node --check', false, String(e).slice(0, 200)); }

// --- escena nueva ES ---
check('ES: una sola escena mv-', count(app, 'class="mv-scene"') === 1);
check('ES: título de producción intacto', app.includes('Así aparece tu posteo del día, todas las mañanas.'));
check('ES: bajada de producción intacta', app.includes('Abrís el teléfono y ya está: el posteo de hoy, listo. Si no decís nada, sale solo.'));
check('ES: push 9:00', app.includes('Tu posteo de hoy está listo') && app.includes('Si no decís nada, sale solo a las 19:00.'));
check('ES: push 19:00', app.includes('Tu posteo ya salió') && app.includes('Hojicha Mille Crepe — ya está en tu Instagram.'));
check('ES: tarjeta loop de mañana', app.includes('Tu próximo posteo ya está en camino') && app.includes('· Mañana · 9:00'));
check('ES: relojes 9:00 / 19:00', app.includes('<span class="mv-clock">9:00</span>') && app.includes('<span class="mv-clock">19:00</span>'));
check('ES: botones de producción', app.includes('>Sale así</div>') && app.includes('>Lo freno</div>'));
check('ES: chip Publicado · 19:00', app.includes('Publicado · 19:00'));
check('ES: estado final sin JS (236 + comentario)', app.includes('<p class="mv-likes"><b>236</b> Me gusta</p>') && app.includes('mv-comment in'));
check('ES: caption + comentario', app.includes('capas finitas y crema de té tostado') && app.includes('¡Se ve increíble!'));
check('ES: payoff', app.includes('9:00 — lo ves listo') && app.includes('En el medio, no hacés nada.'));
check('ES: arco con chispa SMIL', app.includes('animateMotion') && app.includes('mv-arc-svg'));

// --- escena nueva EN ---
check('EN: una sola escena mv-', count(en, 'class="mv-scene"') === 1);
check('EN: título de producción intacto', en.includes('This is how your post of the day shows up, every morning.'));
check('EN: push 9:00 AM', en.includes('Your post for today is ready') && en.includes('it goes out on its own at 7:00 PM.'));
check('EN: push 7:00 PM', en.includes('Your post is live') && en.includes("it's on your Instagram now."));
check('EN: tarjeta loop', en.includes('Your next post is already on its way') && en.includes('· Tomorrow · 9:00 AM'));
check('EN: botones', en.includes('>Post it</div>') && en.includes('>Hold it</div>'));
check('EN: payoff', en.includes('9:00 AM — you see it ready') && en.includes('In between, you do nothing.'));
const enMv = (en.split('\n').find(l => l.includes('class="mv-scene"')) || '');
check('EN: imágenes de la escena raíz-relativas (la página vive en /en/)', enMv.includes('src="/lp-tomoko-hojicha.jpg"') && enMv.includes('src="/ai-avatar.png"') && enMv.includes('src="/lp-tomoko-avatar.jpg"') && !/src="(lp-|ai-)/.test(enMv));

// --- censo de la escena vieja (los dos idiomas) ---
for (const [nom, s] of [['ES', app], ['EN', en]]) {
  check(nom + ': burbuja «30 minutos» = 0', !s.includes('En 30 minutos sale tu posteo') && !s.includes("In 30 minutes today's post goes out"));
  check(nom + ': clases viejas = 0', !/wd-morning|wd-notif|wd-badge|wd-floats|wd-eve|wd-scene-title/.test(s));
  check(nom + ': CSS mv- presente', s.includes('.mv-scene{') && s.includes('@keyframes mv-float-l') && s.includes('@media(max-width:900px)'));
  check(nom + ': JS del ciclo presente', s.includes('function mvCycle()') && s.includes('pauseAnimations') && s.includes('mv-live'));
  check(nom + ': chip compartido sin wd-eve-cell pero con ms-feed/jfeed', !s.includes('.wd-eve-cell .wd-posted') && s.includes('.ms-feed .wd-posted,.wd-jfeed .wd-posted{'));
  check(nom + ': targets sin .wd-eve', !s.includes("#como-funciona .wd-eve'"));
}

// --- stamps ---
check('stamp ES: app.js?v=791', idx.includes('/app.js?v=791') && !idx.includes('/app.js?v=790'));
check('styles.css sin tocar (v=20261297 en ambos)', idx.includes('/styles.css?v=20261297') && en.includes('/styles.css?v=20261297'));

console.log('\n' + ok + ' ok · ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
