/* LOTE SEMILLAS-MAESTRO-REDENCION — R5 (8/11, decisión Valentino 01:54 +
   tablero: la limpieza de endpoints muertos va DENTRO de R5, no es lote
   aparte): el sistema de Semilla de Maestro SALE ENTERO — postjardin.js
   (semillaCodigoNuevo, semillaRegalar, semillaCanjear, miSemilla,
   negocioNombre, estadoPost50), los 3 endpoints de semilla, la UI de
   canje y las tablas jardin_semillas_regalo / jardin_semillas_canje.
   El canje ya no existe en ningún lado: ni regalo, ni código, ni
   procedencia. Lo que queda de «semilla» en el árbol es vocabulario
   ajeno (oración semilla del copy, semillaDeSemana de formatos,
   asegurarSemilla de Venty) — no es el sistema Maestro.
   Uso: node test-lotesemillas.js (desde la raíz del árbol). Sin
   dependencias (node:sqlite). «Ahora» fijo: lunes 2026-11-02. */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const XP = require('./xp-nivel');

let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }
function count(s, sub) { return s.split(sub).length - 1; }
const cntCI = (s, sub) => (s.toLowerCase().split(sub.toLowerCase()).length - 1);

const app = read('public/app.js');
const srv = read('server.js');
const css = read('public/styles.css');

console.log('== 1. El módulo de semillas ya no existe ==');
check('postjardin.js fuera del árbol', !fs.existsSync(path.join(__dirname, 'postjardin.js')));
check('posty-nivel50.js fuera del árbol', !fs.existsSync(path.join(__dirname, 'posty-nivel50.js')));
for (const fn of ['semillaCodigoNuevo', 'semillaMostrar', 'semillaNormalizar', 'semillaRegalar', 'semillaCanjear', 'miSemilla', 'negocioNombre', 'semillasEnsure', 'estadoPost50']) {
  check('sin ' + fn + ' en servidor', !srv.includes(fn));
  check('sin ' + fn + ' en cliente', !app.includes(fn));
}
check('sin tablas de semillas en el servidor', !srv.includes('jardin_semillas_regalo') && !srv.includes('jardin_semillas_canje'));
check('sin endpoints de semilla en el servidor', !srv.includes("'/api/oficina/jardin-semilla-regalo'") && !srv.includes("'/api/oficina/jardin-semilla-canjear'") && !srv.includes("'/api/oficina/jardin-semilla-mia'"));
check('sin endpoint jardin-post50 en el servidor', !srv.includes("'/api/oficina/jardin-post50'"));

console.log('== 2. El cliente no muestra ni llama nada de semillas ==');
for (const s of ['Semillas de Maestro', 'Master seeds', 'semillas regaladas', 'Regalar una semilla', 'Canjeala con el código', 'pzSemillaRegalar', 'pzSemillaCanjear', 'mxSemillaCanjeHTML', 'miSemilla', 'jardin-semilla-', 'pz-semilla', 'pzSemillaCod']) {
  check('app.js sin «' + s + '»', !app.includes(s));
}
check('app.js: solo 2 «semilla» restantes (comentarios ajenos)', cntCI(app, 'semilla') === 2, 'tiene ' + cntCI(app, 'semilla'));
check('styles.css sin .pz-semilla', !css.includes('.pz-semilla'));
check('cliente sin endpoint canjear ni mi semilla', !app.includes("'/api/oficina/jardin-semilla-canjear'") && !app.includes("'/api/oficina/jardin-semilla-mia'"));

console.log('== 3. El XP no tiene componente de semilla (nada inventado) ==');
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE posts (user_id INTEGER, status TEXT, media_type TEXT, ig_permalink TEXT, published_at INTEGER)');
  db.exec('CREATE TABLE comment_queue (user_id INTEGER, status TEXT)');
  db.exec('CREATE TABLE pz_ritual (user_id INTEGER, day_key TEXT, picked_post_id TEXT)');
  db.exec('CREATE TABLE milestones_seen (user_id INTEGER, milestone INTEGER)');
  const ins = db.prepare('INSERT INTO posts (user_id, status, media_type, ig_permalink) VALUES (?,?,?,?)');
  for (let i = 0; i < 613; i++) ins.run(7, 'published', 'image', 'https://www.instagram.com/p/S' + i + '/');
  const d = XP.avatarLevelData(db, 7);
  check('613 fotos = 24520 XP exactos, sin bonus de semilla', d.xp === 24520 && d.level === 50, d.xp + '/' + d.level);
  const insR = db.prepare('INSERT INTO comment_queue (user_id, status) VALUES (?,?)');
  for (let i = 0; i < 100; i++) insR.run(7, 'replied');
  const insP = db.prepare('INSERT INTO pz_ritual (user_id, day_key, picked_post_id) VALUES (?,?,?)');
  for (let i = 0; i < 30; i++) {
    const dt = new Date(Date.UTC(2026, 10, 2) - (29 - i) * 86400000);
    insP.run(7, dt.toISOString().slice(0, 10), 'post-' + i);
  }
  const d2 = XP.avatarLevelData(db, 7);
  // 24520 + 100×25 + 150 (100 respuestas) + 100 (semana) + 150 (racha 30) = 27420.
  check('XP total = suma exacta de los componentes documentados', d2.xp === 27420, 'dio ' + d2.xp);
}

console.log('== 4. Censo (pre = post en lo no tocado) ==');
check('censo server intacto', count(srv, 'catsMatch') === 3 && count(srv, 'week-redo') === 16 && count(srv, 'first_week') === 3 && count(srv, '/aprobar') === 17);
check('censo app intacto', count(app, 'pzGoBack') === 6 && count(app, 'pz-detalle-setup') === 1 && count(app, '/aprobar') === 1 && count(app, 'autofetch') === 0);

console.log('\nTOTAL: ' + ok + ' ok, ' + fail + ' fallos' + (fail ? ' :: ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
