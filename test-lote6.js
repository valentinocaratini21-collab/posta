// test-lote6.js — Lote 6: foto-cliente experto completo + perfil + íconos + tipografías.
// Uso: node test-lote6.js [arbol] [CHUNK_V] [BUILD_ID]
// Sin deps externas: usa node:sqlite (Node 24), igual que test-lote4.js.
// Los módulos bajo prueba (checklist.js, autopilot.js) reciben la DB
// como parámetro y no requieren better-sqlite3.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.argv[2] || '.');
const CHUNK_V = process.argv[3] || '20261031-v507';
const BUILD_ID = process.argv[4] || '20261031-v507';

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('FALLO:', name, detail || ''); }
}
const read = (rel) => fs.readFileSync(path.join(TREE, rel), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

// ---------- DB en memoria ----------
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, autopilot_enabled INTEGER);
CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id TEXT, status TEXT, image_path TEXT,
  prev_image_path TEXT, media_type TEXT, caption TEXT, hashtags TEXT, style_code TEXT,
  created_at TEXT, quality_score INTEGER, quality_checks TEXT);
CREATE TABLE checklist_confirm (user_id TEXT, post_id INTEGER, item TEXT);
CREATE TABLE assets (user_id TEXT, file_path TEXT, album_quality TEXT, album_tag TEXT);`);
const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lote6-media-'));
for (const f of ['foto.jpg', 'foto-a2.jpg', 'foto-a4.jpg', 'foto-a5.jpg', 'foto-a7.jpg',
  'foto-b1.jpg', 'foto-b2.jpg', 'foto-b4.jpg', 'foto-b5.jpg'])
  fs.writeFileSync(path.join(mediaDir, f), Buffer.alloc(20480, 7));
const CAPTION = '¡Nueva colección de café de especialidad, recién tostado en nuestro local! #cafe';
db.prepare(`INSERT INTO users VALUES ('u1', 1), ('u0', 0)`).run();
function mkPost(id, uid, over) {
  const base = { id, user_id: uid, status: 'draft', image_path: 'foto.jpg', prev_image_path: '',
    media_type: 'image', caption: CAPTION, hashtags: '#cafe', style_code: null, created_at: '2026-10-31 10:00:00' };
  const p = Object.assign(base, over || {});
  db.prepare(`INSERT INTO posts (id, user_id, status, image_path, prev_image_path, media_type, caption, hashtags, style_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(p.id, p.user_id, p.status, p.image_path, p.prev_image_path, p.media_type, p.caption, p.hashtags, p.style_code, p.created_at);
  return p;
}
function mkAsset(uid, file, quality, tag) {
  db.prepare(`INSERT INTO assets VALUES (?, ?, ?, ?)`).run(uid, file, quality, tag);
}

const checklist = require(path.join(TREE, 'checklist.js'));
const autopilot = require(path.join(TREE, 'autopilot.js'));

// ---------- A. computeChecklist ----------
let post = mkPost(1, 'u1', { image_path: '' });
let cl = checklist.computeChecklist(db, mediaDir, 'u1', post);
ok('A1 sin-medio duro y bloquea', cl.bloqueado && cl.duros.some((d) => d.item === 'sin-medio'), JSON.stringify(cl.duros));

mkPost(2, 'u1', { image_path: 'foto-a2.jpg' });
mkAsset('u1', 'foto-a2.jpg', '["cortada"]', null);
post = db.prepare(`SELECT * FROM posts WHERE id = 2`).get();
cl = checklist.computeChecklist(db, mediaDir, 'u1', post);
ok('A2 producto-cortado duro y bloquea', cl.bloqueado && cl.duros.some((d) => d.item === 'producto-cortado'), JSON.stringify(cl.duros));

db.prepare(`INSERT INTO checklist_confirm VALUES ('u1', 2, 'producto-cortado')`).run();
cl = checklist.computeChecklist(db, mediaDir, 'u1', post);
ok('A3 duro confirmado NO bloquea', !cl.bloqueado && cl.duros.length === 0 &&
  cl.items.find((i) => i.item === 'producto-cortado').confirmado === true, JSON.stringify(cl));

mkPost(3, 'u1', { image_path: 'foto-a4.jpg' });
mkAsset('u1', 'foto-a4.jpg', '{"lum":30}', null);
post = db.prepare(`SELECT * FROM posts WHERE id = 3`).get();
cl = checklist.computeChecklist(db, mediaDir, 'u1', post);
ok('A4 foto-oscura es aviso, no bloquea', !cl.bloqueado &&
  cl.items.some((i) => i.item === 'foto-oscura' && i.duro === false), JSON.stringify(cl.items));

mkPost(4, 'u1', { image_path: 'foto-a5.jpg' });
mkAsset('u1', 'foto-a5.jpg', null, 'equipo');
post = db.prepare(`SELECT * FROM posts WHERE id = 4`).get();
cl = checklist.computeChecklist(db, mediaDir, 'u1', post);
ok('A5 caras-permiso duro y bloquea', cl.bloqueado && cl.duros.some((d) => d.item === 'caras-permiso'), JSON.stringify(cl.duros));
db.prepare(`INSERT INTO checklist_confirm VALUES ('u1', 4, 'caras-permiso')`).run();
cl = checklist.computeChecklist(db, mediaDir, 'u1', post);
ok('A6 caras-permiso confirmado NO bloquea', !cl.bloqueado, JSON.stringify(cl.duros));

mkPost(5, 'u1', { image_path: 'foto-a7.jpg' });
db.prepare(`INSERT INTO posts (id, user_id, status, image_path, prev_image_path, media_type, caption, hashtags, style_code, created_at)
  VALUES (50, 'u1', 'published', 'foto-a7.jpg', '', 'image', 'viejo', '#x', NULL, '2026-10-01 10:00:00')`).run();
post = db.prepare(`SELECT * FROM posts WHERE id = 5`).get();
cl = checklist.computeChecklist(db, mediaDir, 'u1', post);
ok('A7 reuso es aviso, no bloquea', !cl.bloqueado &&
  cl.items.some((i) => i.item === 'reuso' && i.duro === false), JSON.stringify(cl.items));

// ---------- B. shouldAutopublish ----------
mkPost(10, 'u1', { image_path: 'foto-b1.jpg' });
let r = autopilot.shouldAutopublish('u1', 10, db, mediaDir);
ok('B1 post limpio sale solo', r.ok === true, JSON.stringify(r));

mkPost(11, 'u1', { image_path: 'foto-b2.jpg' });
mkAsset('u1', 'foto-b2.jpg', '["cortada"]', null);
r = autopilot.shouldAutopublish('u1', 11, db, mediaDir);
ok('B2 duro sin confirmar frena autopilot', r.ok === false && r.reason === 'checklist_bloqueado' &&
  r.items.some((i) => i.item === 'producto-cortado'), JSON.stringify(r));

db.prepare(`INSERT INTO checklist_confirm VALUES ('u1', 11, 'producto-cortado')`).run();
r = autopilot.shouldAutopublish('u1', 11, db, mediaDir);
ok('B3 duro confirmado sale solo', r.ok === true, JSON.stringify(r));

mkPost(12, 'u1', { image_path: 'foto-b4.jpg' });
mkAsset('u1', 'foto-b4.jpg', '{"lum":30}', null);
r = autopilot.shouldAutopublish('u1', 12, db, mediaDir);
ok('B4 solo aviso sale solo', r.ok === true, JSON.stringify(r));

mkPost(13, 'u0', { image_path: 'foto-b5.jpg' });
r = autopilot.shouldAutopublish('u0', 13, db, mediaDir);
ok('B5 autopilot apagado no sale', r.ok === false && r.reason === 'autopilot_off', JSON.stringify(r));

// ---------- C. server.js ----------
const server = read('server.js');
ok('C1 endpoint bokeh presente', server.includes('/api/drafts/:id/photo-bokeh'));
ok('C2 bokeh modo mascara', server.includes("modo: 'mascara'"));
ok('C3 bokeh modo caja-vision (fallback)', server.includes("modo = 'caja-vision'"));
ok('C4 bokeh modo caja manual', server.includes("let modo = 'caja'"));
ok('C5 bokeh sin llave ni caja: 400 con motivo', server.includes('pasá la caja a mano'));
ok('C6 estilo en los 3 builders de reel', count(server, 'mcEstilo(uid).transicion') === 3,
  'hallado=' + count(server, 'mcEstilo(uid).transicion'));
ok('C7 validación Transición inválida en transitions y mitos', count(server, 'Transición inválida') >= 2,
  'hallado=' + count(server, 'Transición inválida'));
const mitosIdx = server.indexOf("api/mitos/:id/reel");
const mitosBlock = server.slice(mitosIdx, server.indexOf('app.post(', mitosIdx + 10));
ok('C8 mitos legacy: fade explícito manda, si no estilo', mitosBlock.includes('req.body.fade') && mitosBlock.includes('mcEstilo(uid).transicion'));
ok('C9 GET checklist usa computeChecklist', server.includes('computeChecklist'));
ok('C10 publish-now devuelve 409 checklist_bloqueado', server.includes("error: 'checklist_bloqueado'"));
const auto = read('autopilot.js');
ok('C11 autopilot devuelve checklist_bloqueado', auto.includes("reason: 'checklist_bloqueado'"));
ok('C12 catálogo música sigue vacío (sin inventos)', (() => {
  try { const m = JSON.parse(read('music-meta.json')); return Array.isArray(m.tracks) && m.tracks.length === 0; }
  catch (e) { return false; }
})());

// ---------- D. perfil ----------
const app = read('public/app.js');
ok('D1 detalle-setup dentro de pzNivelDetalle', app.includes('pz-detalle-setup'));
ok('D2 tile +Crear cubierta fuera de la tira', !app.includes('hf-hl-plus'));
ok('D3 ícono grid nuevo en PZ_IC', app.includes("pzIc('grid'"));

// ---------- E. íconos ----------
ok('E1 atrás con arrowLeft', app.includes("pzIc('arrowLeft'"));
ok('E2 glifos R8 clapper/box/volume', app.includes("pzIc('clapper'") && app.includes("pzIc('box'") && app.includes("pzIc('volume'"));
const ajustes = read('public/chunk-ajustes.js');
ok('E3 pickers de chips (sin select nativo)', ajustes.includes('pz-pick') && !ajustes.includes('<select id="s_cat"'));
const styles = read('public/styles.css');
ok('E4 CSS pickers + badge accept-count', styles.includes('.pz-pick') && styles.includes('.accept-count'));
ok('E5 botón recicla ya no lleva ♻️', !app.includes('data-pz-recicla-make>♻'));

// ---------- F. tipografías ----------
ok('F1 fila tipografía en Ajustes', ajustes.includes('brand_font'));
ok('F2 brandFontOf en los 5 call sites + helper', count(server, 'brandFontOf') === 6,
  'hallado=' + count(server, 'brandFontOf'));
const comp = read('composite-headline.py');
ok('F3 BRAND_FONTS en composite-headline', comp.includes('BRAND_FONTS'));
const dbjs = read('db.js');
ok('F4 migración brand_font en db.js', dbjs.includes('brand_font'));
const NEW_FONTS = ['Fredoka-600.ttf', 'Fredoka-700.ttf', 'Nunito-700.ttf', 'Nunito-800.ttf',
  'Oswald-600.ttf', 'Oswald-700.ttf', 'PlayfairDisplay-700.ttf', 'PlayfairDisplay-800.ttf',
  'Poppins-600.ttf', 'Poppins-700.ttf', 'Poppins-800.ttf',
  'OFL-Fredoka.txt', 'OFL-Montserrat.txt', 'OFL-Nunito.txt', 'OFL-Oswald.txt',
  'OFL-PlayfairDisplay.txt', 'OFL-Poppins.txt'];
const missingFonts = NEW_FONTS.filter((f) => !fs.existsSync(path.join(TREE, 'fonts', f)));
ok('F5 17 archivos nuevos en fonts/', missingFonts.length === 0, 'faltan: ' + missingFonts.join(', '));
ok('F6 Montserrat ya en repo (no duplicado)', fs.existsSync(path.join(TREE, 'fonts', 'Montserrat-700.ttf')));

// ---------- G. pines ----------
const chunkV = (app.match(/CHUNK_V = '([^']+)'/) || [])[1];
ok('G1 CHUNK_V = ' + CHUNK_V, chunkV === CHUNK_V, 'hallado=' + chunkV);
const buildId = (server.match(/BUILD_ID = '([^']+)'/) || [])[1];
ok('G2 BUILD_ID = ' + BUILD_ID, buildId === BUILD_ID, 'hallado=' + buildId);

console.log(`\ntest-lote6: ${pass} OK, ${fail} fallos`);
if (fail) { console.log('FALLOS:\n' + failures.join('\n')); process.exit(1); }
