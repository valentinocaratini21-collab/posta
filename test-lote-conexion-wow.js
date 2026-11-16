'use strict';
// =====================================================================
// SUITE · LOTE CONEXIÓN POST-WOW
//
// La decisión (Valentino, 16/11): la pantalla que revela el primer
// posteo ES la pantalla de conexión — la pieza grande, una línea con
// el próximo horario real («sale hoy a las 19:00, solo»), UN botón
// («Publicalo en @negocio hoy»), el toque abre el OAuth directo y al
// conectar la misma pantalla confirma con la hora REAL, con las
// piezas agendadas solas a las 19:00. «Ahora no» sin castigo: la
// prueba sigue por email/DM y la puerta queda quieta en la semana.
//
// Lo que esta suite pincha:
//   · wow-connect.js: la regla del slot (hoy si en la zona de la
//     cuenta todavía no son las 19:00; mañana si ya pasaron — a las
//     19:00 en punto ya pasó) a ambos lados y en DST, y la agenda
//     sobre las piezas que la semana YA tiene (software o línea a
//     mano: son las mismas filas), sin tocar imagen/caption/headline
//     y sin pisar retenidas, frenadas, historias ni publicadas.
//   · server.js: la marca de sesión del wow (buildIgAuth), el
//     callback que agenda y NO encadena el diálogo publicitario
//     cuando el flujo es del wow, y la vuelta con wow=1.
//   · app.js: la tarjeta del wow en Inicio (héroe / caída tranquila /
//     confirmación), su lugar en la composición (tras el posteo de
//     hoy, antes del aviso de la prueba), su bind, y pzWowDayWord en
//     espejo de la regla del servidor a ambos lados de las 19:00.
//   · Gate v1125: prueba.html y en-prueba.html NO se tocan en este
//     lote, y su script en línea pasa node --check en el árbol.
//
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules \
//        node test-lote-conexion-wow.js [--no-boot]
// Control: PZ_ROOT=<árbol prístino v1127> node test-lote-conexion-wow.js
// Censo de diff (opcional): PZ_PRISTINE=<árbol prístino> en la corrida
//        sobre el release activa la sección F.
// =====================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const SERVER = read('server.js');
const APPJS = read('public/app.js');
const CSS = read('public/styles.css');
const P_ES = read('public/prueba.html');
const P_EN = read('public/en-prueba.html');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) {}
let wow = null;
try { wow = require(path.join(ROOT, 'wow-connect')); } catch (e) {}

let nOk = 0, nMal = 0;
function ok(cond, nombre) {
  if (cond) { nOk++; console.log('  ok  ' + nombre); }
  else { nMal++; console.log('  MAL ' + nombre); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + ' = ' + JSON.stringify(b) + ']'); }
function seccion(t) { console.log('\n== ' + t); }

function nodeCheckOk(file) {
  const r = spawnSync('node', ['--check', file], { encoding: 'utf8' });
  return r.status === 0;
}
// Extrae el script en línea de una página y lo pasa por node --check
// (gate v1125: lo servido se declara solo con el script limpio).
function inlineScriptCheck(html, tag) {
  const m = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return false;
  const tmp = path.join(os.tmpdir(), 'wow-inline-' + tag + '-' + process.pid + '.js');
  try {
    fs.writeFileSync(tmp, m[1]);
    return nodeCheckOk(tmp);
  } finally { try { fs.rmSync(tmp, { force: true }); } catch (e) {} }
}
// Extrae una función top-level por conteo de llaves (sin literales de
// plantilla ni regex en los cuerpos extraídos: alcanza para las dos
// funciones puras del cliente que la suite evalúa).
function extraerFuncion(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i);
  if (j < 0) return null;
  let depth = 0, k = j, mode = 'code';
  while (k < src.length) {
    const c = src[k], d = src[k + 1] || '';
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; k += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; k += 2; continue; }
      if (c === "'") { mode = 'sq'; k++; continue; }
      if (c === '"') { mode = 'dq'; k++; continue; }
      if (c === '{') depth++;
      if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
      k++; continue;
    }
    if (mode === 'line') { if (c === '\n') mode = 'code'; k++; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; k += 2; } else k++; continue; }
    if (mode === 'sq' || mode === 'dq') {
      const q = mode === 'sq' ? "'" : '"';
      if (c === '\\') { k += 2; continue; }
      if (c === q) mode = 'code';
      k++; continue;
    }
  }
  return null;
}

// ---------- A · Pines estáticos ----------
function seccionA() {
  seccion('A · pines estáticos del lote');
  ok(!!wow, 'A1 wow-connect.js existe y carga');
  ok(wow && typeof wow.agendarAlConectar === 'function' && typeof wow.wowSlots === 'function' && typeof wow.wowDayWord === 'function', 'A2 el módulo exporta la agenda y la regla del slot');
  ok(SERVER.includes("require('./wow-connect')"), 'A3 server.js requiere el módulo');
  ok(SERVER.includes("if (String(req.query.wow || '') === '1') req.session.igWow = 1;"), 'A4 buildIgAuth marca la sesión cuando el arranque trae wow=1');
  ok(SERVER.includes('wowConnect.agendarAlConectar(db, req.session.userId'), 'A5 el callback agenda la prueba al conectar (flujo wow)');
  ok(SERVER.includes('if (!wowFlow && unifiedReady(req.session.userId)'), 'A6 el flujo wow NO encadena el diálogo publicitario unificado');
  ok(SERVER.includes("(wowFlow ? '&wow=1' : '')"), 'A7 la vuelta del flujo wow vuelve marcada a la misma pantalla');
  for (const fn of ['pzWowSkipKey', 'pzWowDayWord', 'pzWowTargetPost', 'pzWowQuietHTML', 'pzWowConnectHTML', 'pzWowGo', 'pzWowConnectBind']) {
    ok(APPJS.includes('function ' + fn + '('), 'A8 app.js define ' + fn);
  }
  const iHoy = APPJS.indexOf('pzHoyHoyHTML(hoyPostR1');
  const iWow = APPJS.indexOf('pzWowConnectHTML({ post: wowPostR1');
  const iAviso = APPJS.indexOf('pzTrialAvisoHTML({ hoyPost: hoyPostR1');
  ok(iHoy > 0 && iWow > iHoy && iAviso > iWow, 'A9 la tarjeta del wow entra en Inicio tras el posteo de hoy y antes del aviso de la prueba');
  ok(APPJS.includes('try { pzWowConnectBind(root); } catch (e) {}'), 'A10 el bind del wow se ata junto a los binds post-wow');
  ok(APPJS.includes("sessionStorage.setItem('pz_wow_pending', '1')"), 'A11 el toque deja su marca de sesión (la confirmación se pinta al volver)');
  ok(APPJS.includes("'/api/ig/go?next=' + encodeURIComponent('/#/app/inicio') + '&wow=1'"), 'A12 el toque abre el OAuth por /api/ig/go con la marca del wow y destino Inicio');
  ok(APPJS.includes('¿Lo querés en tu Instagram? Conectalo y este posteo sale'), 'A13 copia ES de la línea del wow (la de la forma cerrada)');
  ok(APPJS.includes('Publicalo en'), 'A14 copia ES del botón con su @');
  ok(APPJS.includes('Listo —') && APPJS.includes('Y los de mañana y pasado salen solos.'), 'A15 copia ES de la confirmación');
  ok(APPJS.includes('Sin problema') && APPJS.includes('Ahora no'), 'A16 copia ES de la caída tranquila y la salida');
  ok(APPJS.includes('Want it on your Instagram? Connect it and this post goes out'), 'A17 copia EN de la línea (mock aprobado)');
  ok(APPJS.includes('Post it on') && APPJS.includes('Done —') && APPJS.includes('No problem') && APPJS.includes('Not now'), 'A18 copia EN del botón, la confirmación, la caída y la salida');
  for (const cls of ['.pz-wow{', '.pz-wow-img{', '.pz-wow-ask{', '.pz-wow-quiet{', '.pz-wow-done{', '.pz-wow-skip{']) {
    ok(CSS.includes(cls), 'A19 styles.css trae ' + cls);
  }
  ok(nodeCheckOk(path.join(ROOT, 'server.js')), 'A20 node --check limpio: server.js');
  ok(nodeCheckOk(path.join(ROOT, 'public/app.js')), 'A21 node --check limpio: public/app.js');
  ok(!wow || nodeCheckOk(path.join(ROOT, 'wow-connect.js')), 'A22 node --check limpio: wow-connect.js');
  ok(inlineScriptCheck(P_ES, 'es'), 'A23 gate v1125: el script en línea de prueba.html pasa node --check (la página no se toca en este lote)');
  ok(inlineScriptCheck(P_EN, 'en'), 'A24 gate v1125: el script en línea de en-prueba.html pasa node --check (la página no se toca en este lote)');
}

// ---------- B · La regla del slot (módulo) ----------
function seccionB() {
  seccion('B · wow-connect: el próximo slot de las 19:00, a ambos lados');
  if (!wow) { ok(false, 'B0 el módulo existe (sin módulo no hay regla que pinchar)'); return; }
  const NY = 'America/New_York', BA = 'America/Argentina/Buenos_Aires';
  // Nueva York, 10:00 EST: hoy.
  let s = wow.wowSlots(NY, Date.parse('2026-11-16T15:00:00Z'));
  eq(wow.wowDayWord(NY, Date.parse('2026-11-16T15:00:00Z')), 'hoy', 'B1 NY 10:00 → hoy');
  eq(s[0], '2026-11-17T00:00:00.000Z', 'B2 el slot 1 es hoy 19:00 EST');
  eq(s[1], '2026-11-18T00:00:00.000Z', 'B3 el slot 2 es mañana 19:00 EST');
  eq(s[2], '2026-11-19T00:00:00.000Z', 'B4 el slot 3 es pasado mañana 19:00 EST');
  // 18:59 EST: todavía hoy. 19:00 en punto: ya pasó → mañana.
  eq(wow.wowDayWord(NY, Date.parse('2026-11-16T23:59:00Z')), 'hoy', 'B5 NY 18:59 → hoy');
  eq(wow.wowDayWord(NY, Date.parse('2026-11-17T00:00:00Z')), 'mañana', 'B6 NY 19:00 en punto → mañana (nunca un hoy falso)');
  eq(wow.wowSlots(NY, Date.parse('2026-11-17T00:00:00Z'))[0], '2026-11-18T00:00:00.000Z', 'B7 el slot 1 tras las 19:00 es mañana 19:00 EST');
  eq(wow.wowDayWord(NY, Date.parse('2026-11-17T01:30:00Z')), 'mañana', 'B8 NY 20:30 → mañana');
  // Buenos Aires (UTC−3): 18:30 → hoy; 19:00 → mañana.
  eq(wow.wowDayWord(BA, Date.parse('2026-11-16T21:30:00Z')), 'hoy', 'B9 BA 18:30 → hoy');
  eq(wow.wowSlots(BA, Date.parse('2026-11-16T21:30:00Z'))[0], '2026-11-16T22:00:00.000Z', 'B10 el slot 1 es hoy 19:00 ART');
  eq(wow.wowDayWord(BA, Date.parse('2026-11-16T22:00:00Z')), 'mañana', 'B11 BA 19:00 en punto → mañana');
  eq(wow.wowSlots(BA, Date.parse('2026-11-16T22:00:00Z'))[0], '2026-11-17T22:00:00.000Z', 'B12 el slot 1 es mañana 19:00 ART');
  // DST: primavera (8/3/2026, NY pasa a EDT) y otoño (1/11/2026, vuelve a EST).
  eq(wow.wowSlots(NY, Date.parse('2026-03-08T15:00:00Z'))[0], '2026-03-08T23:00:00.000Z', 'B13 DST primavera: hoy 19:00 EDT = 23:00Z');
  eq(wow.wowSlots(NY, Date.parse('2026-11-01T14:00:00Z'))[0], '2026-11-02T00:00:00.000Z', 'B14 DST otoño: hoy 19:00 EST = 00:00Z del día siguiente');
  // UTC como zona: 18:00 → hoy 19:00Z; 19:00 → mañana.
  eq(wow.wowSlots('UTC', Date.parse('2026-11-16T18:00:00Z'))[0], '2026-11-16T19:00:00.000Z', 'B15 UTC 18:00 → hoy 19:00Z');
  eq(wow.wowDayWord('UTC', Date.parse('2026-11-16T19:00:00Z')), 'mañana', 'B16 UTC 19:00 → mañana');
  eq(JSON.stringify(wow.wowDias(NY, Date.parse('2026-11-16T15:00:00Z'))), JSON.stringify(['2026-11-16', '2026-11-17', '2026-11-18']), 'B17 los tres días son consecutivos desde el base');
}

// ---------- C · La agenda sobre las piezas existentes ----------
function semillaAgenda(db) {
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, is_guest INTEGER DEFAULT 0, publishing_stopped INTEGER DEFAULT 0);
           CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, media_type TEXT, status TEXT, image_path TEXT, caption TEXT, headline TEXT, scheduled_at TEXT, created_at TEXT, needs_review INTEGER DEFAULT 0, user_stopped INTEGER DEFAULT 0, frenada INTEGER DEFAULT 0, approval TEXT, error TEXT, notified INTEGER DEFAULT 0, auto_published INTEGER DEFAULT 0);`);
  const up = db.prepare('INSERT INTO users (id, is_guest, publishing_stopped) VALUES (?, ?, ?)');
  up.run(501, 1, 0); up.run(502, 1, 0); up.run(503, 0, 0); up.run(504, 1, 1); up.run(505, 1, 0);
  const pp = db.prepare('INSERT INTO posts (id, user_id, media_type, status, image_path, caption, headline, scheduled_at, created_at, needs_review, user_stopped, frenada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  // Invitado 501: la semana mezclada — software y línea a mano son las mismas filas.
  pp.run(1, 501, 'image', 'scheduled', '/media/a.jpg', 'caption uno', 'Uno', '2026-11-17 00:00:00', '2026-11-16 10:00:00', 0, 0, 0); // slot del embudo
  pp.run(2, 501, 'image', 'draft', '/media/b.jpg', 'caption dos — pieza de la línea a mano', 'Dos', null, '2026-11-16 10:01:00', 0, 0, 0); // rescate tardío sin agendar
  pp.run(3, 501, 'carousel', 'scheduled', '/media/c.jpg', 'caption tres', 'Tres', '2026-11-18 00:00:00', '2026-11-16 10:02:00', 0, 0, 0);
  pp.run(4, 501, 'story', 'scheduled', '/media/s.jpg', '', '', '2026-11-16 22:00:00', '2026-11-16 10:03:00', 0, 0, 0); // historia: afuera
  pp.run(5, 501, 'image', 'scheduled', '/media/r.jpg', 'retenida', '', '2026-11-17 00:00:00', '2026-11-16 10:04:00', 1, 0, 0); // gate: afuera
  pp.run(6, 501, 'image', 'published', '/media/p.jpg', 'ya salió', '', '2026-11-15 00:00:00', '2026-11-15 09:00:00', 0, 0, 0); // publicada: afuera
  pp.run(7, 501, 'image', 'draft', '/media/f.jpg', 'frenada por el dueño', '', null, '2026-11-16 10:05:00', 0, 1, 0); // user_stopped: afuera
  pp.run(8, 501, 'image', 'draft', '', 'sin imagen', '', null, '2026-11-16 10:06:00', 0, 0, 0); // sin imagen: afuera
  // Invitado 502: tres piezas simples para la corrida post-19:00.
  pp.run(11, 502, 'image', 'scheduled', '/media/x.jpg', 'x', '', '2026-11-17 00:00:00', '2026-11-16 09:00:00', 0, 0, 0);
  pp.run(12, 502, 'image', 'scheduled', '/media/y.jpg', 'y', '', '2026-11-18 00:00:00', '2026-11-16 09:01:00', 0, 0, 0);
  pp.run(13, 502, 'image', 'scheduled', '/media/z.jpg', 'z', '', '2026-11-19 00:00:00', '2026-11-16 09:02:00', 0, 0, 0);
  // Registrado 503 (no invitado): una pieza que NO se toca.
  pp.run(21, 503, 'image', 'draft', '/media/n.jpg', 'de registrado', '', null, '2026-11-16 08:00:00', 0, 0, 0);
  // Invitado frenado 504: una pieza que NO se toca.
  pp.run(22, 504, 'image', 'draft', '/media/q.jpg', 'de frenado', '', null, '2026-11-16 08:00:00', 0, 0, 0);
}
function seccionC() {
  seccion('C · la agenda al conectar, sobre piezas del software y de la línea a mano');
  if (!wow) { ok(false, 'C0 el módulo existe'); return; }
  if (!DatabaseSync) { ok(false, 'C0 node:sqlite disponible'); return; }
  const db = new DatabaseSync(':memory:');
  semillaAgenda(db);
  const NY = 'America/New_York';
  const antes = (id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  const r = wow.agendarAlConectar(db, 501, { timezone: NY, now: Date.parse('2026-11-16T15:00:00Z') }); // 10:00 EST
  eq(r.scheduled, 3, 'C1 agenda exactamente las 3 piezas de la semana');
  eq(JSON.stringify(r.ids), JSON.stringify([1, 2, 3]), 'C2 el orden es el de día: embudo, rescate a mano, tercera');
  eq(r.first_at, '2026-11-17T00:00:00.000Z', 'C3 la primera queda hoy 19:00 EST');
  eq(antes(1).scheduled_at, '2026-11-17T00:00:00.000Z', 'C4 la pieza 1 se re-ancla al próximo slot');
  eq(antes(2).scheduled_at, '2026-11-18T00:00:00.000Z', 'C5 la pieza de la línea a mano (borrador sin fecha) queda mañana 19:00');
  eq(antes(3).scheduled_at, '2026-11-19T00:00:00.000Z', 'C6 la tercera queda pasado mañana 19:00');
  ok([1, 2, 3].every((id) => antes(id).status === 'scheduled' && antes(id).approval === 'auto' && antes(id).auto_published === 1 && antes(id).notified === 0), 'C7 la semántica es la del embudo para invitados (scheduled + auto + auto_published)');
  eq(antes(2).caption, 'caption dos — pieza de la línea a mano', 'C8 la pieza a mano se respeta tal cual: su caption no se toca');
  eq(antes(2).image_path, '/media/b.jpg', 'C9 su imagen no se toca');
  eq(antes(4).scheduled_at, '2026-11-16 22:00:00', 'C10 la historia queda afuera');
  eq(antes(5).status, 'scheduled', 'C11 la retenida por el gate no se pisa (sigue su revisión)');
  eq(antes(5).scheduled_at, '2026-11-17 00:00:00', 'C12 su fecha no se toca');
  eq(antes(6).status, 'published', 'C13 la ya publicada no se toca');
  eq(antes(7).status, 'draft', 'C14 la frenada por el dueño no se agenda');
  eq(antes(8).status, 'draft', 'C15 la pieza sin imagen no se agenda');
  // Post-19:00: la base es mañana.
  const r2 = wow.agendarAlConectar(db, 502, { timezone: NY, now: Date.parse('2026-11-17T01:30:00Z') }); // 20:30 EST
  eq(r2.scheduled, 3, 'C16 post-19:00 también agenda las 3');
  eq(r2.first_at, '2026-11-18T00:00:00.000Z', 'C17 post-19:00 la primera queda MAÑANA 19:00 (nunca un hoy falso)');
  // Guardas.
  const r3 = wow.agendarAlConectar(db, 503, { timezone: NY, now: Date.parse('2026-11-16T15:00:00Z') });
  eq(r3.scheduled, 0, 'C18 una cuenta registrada no entra en la agenda del wow');
  eq(r3.reason, 'not_guest', 'C19 el motivo se declara: not_guest');
  eq(antes(21).status, 'draft', 'C20 su pieza no se toca');
  const r4 = wow.agendarAlConectar(db, 504, { timezone: NY, now: Date.parse('2026-11-16T15:00:00Z') });
  eq(r4.reason, 'publishing_stopped', 'C21 la cuenta frenada no se agenda (publishing_stopped)');
  eq(antes(22).status, 'draft', 'C22 su pieza no se toca');
  const r5 = wow.agendarAlConectar(db, 505, { timezone: NY, now: Date.parse('2026-11-16T15:00:00Z') });
  eq(r5.reason, 'no_pieces', 'C23 sin piezas, la agenda declara no_pieces');
  const r6 = wow.agendarAlConectar(db, 999, { timezone: NY, now: Date.parse('2026-11-16T15:00:00Z') });
  eq(r6.reason, 'no_user', 'C24 usuario inexistente: no_user, sin crash');
  db.close();
}

// ---------- D · Las funciones puras del cliente, en espejo ----------
function seccionD() {
  seccion('D · app.js: pzWowDayWord y pzWowTargetPost evaluadas desde el bundle');
  const fWord = extraerFuncion(APPJS, 'pzWowDayWord');
  ok(!!fWord, 'D1 pzWowDayWord se puede extraer del bundle');
  if (fWord) {
    const fn = eval('(' + fWord + ')');
    eq(fn(Date.parse('2026-11-16T23:59:00Z'), 'America/New_York'), 'hoy', 'D2 NY 18:59 → hoy (espejo del servidor)');
    eq(fn(Date.parse('2026-11-17T00:00:00Z'), 'America/New_York'), 'mañana', 'D3 NY 19:00 en punto → mañana');
    eq(fn(Date.parse('2026-11-16T21:30:00Z'), 'America/Argentina/Buenos_Aires'), 'hoy', 'D4 BA 18:30 → hoy');
    eq(fn(Date.parse('2026-11-16T22:00:00Z'), 'America/Argentina/Buenos_Aires'), 'mañana', 'D5 BA 19:00 → mañana');
  }
  const fTarget = extraerFuncion(APPJS, 'pzWowTargetPost');
  ok(!!fTarget, 'D6 pzWowTargetPost se puede extraer del bundle');
  if (fTarget) {
    const tp = eval('(' + fTarget + ')');
    const posts = [
      { id: 9, media_type: 'image', image_path: '/m/9.jpg', status: 'scheduled', scheduled_at: '2026-11-18 00:00:00' },
      { id: 7, media_type: 'image', image_path: '/m/7.jpg', status: 'scheduled', scheduled_at: '2026-11-17 00:00:00' },
      { id: 8, media_type: 'story', image_path: '/m/8.jpg', status: 'scheduled', scheduled_at: '2026-11-16 22:00:00' },
      { id: 6, media_type: 'image', image_path: '/m/6.jpg', status: 'scheduled', scheduled_at: '2026-11-16 00:00:00', needs_review: 1 },
      { id: 5, media_type: 'image', image_path: '/m/5.jpg', status: 'published', scheduled_at: '2026-11-15 00:00:00' },
    ];
    const t = tp(posts);
    ok(!!t && t.id === 7, 'D7 la pieza del wow es la primera pendiente de feed con imagen (ni historia, ni retenida, ni publicada)');
    const posts2 = [
      { id: 31, media_type: 'image', image_path: '/m/31.jpg', status: 'draft', scheduled_at: '', created_at: '2026-11-16 10:02:00' },
      { id: 30, media_type: 'image', image_path: '/m/30.jpg', status: 'scheduled', scheduled_at: '2026-11-19 00:00:00', created_at: '2026-11-16 10:01:00' },
    ];
    const t2 = tp(posts2);
    ok(!!t2 && t2.id === 30, 'D8 el orden es el de creación (el de la semana), no el de la fecha suelta');
    eq(tp([]), null, 'D9 sin piezas no hay wow (null, sin crash)');
    eq(tp(null), null, 'D10 entrada inválida: null, sin crash');
  }
}

// ---------- E · Boot: el arranque del OAuth con la marca ----------
async function seccionE() {
  seccion('E · boot aislado: /api/ig/go con y sin la marca del wow');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!DatabaseSync) { ok(false, 'E0 node:sqlite disponible para sembrar'); return; }
  const port = 19700 + Math.floor(Math.random() * 300);
  const ADMIN_TOK = 'token-suite';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-wow-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-wow-media-'));
  const EMBED = 'https://www.instagram.com/oauth/authorize?client_id=1234567890&scope=instagram_business_basic';
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: ADMIN_TOK, META_IG_EMBED_URL: EMBED, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = 'http://127.0.0.1:' + port;
  try {
    let vivo = false;
    for (let i = 0; i < 60 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch(base + '/api/version').catch(() => null);
      if (resp && resp.status === 200) vivo = true;
    }
    ok(vivo, 'E1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    // Sin sesión: la marca del wow no abre ninguna superficie nueva.
    const sinSesion = await fetch(base + '/api/ig/go?wow=1&next=' + encodeURIComponent('/#/app/inicio'), { redirect: 'manual' }).catch(() => null);
    ok(!!sinSesion && sinSesion.status !== 302, 'E2 sin sesión, /api/ig/go?wow=1 no redirige a Instagram (requireAuth manda)');
    // Sesión de invitado por la puerta de regreso (la del RETORNO, viva en este árbol).
    const dbPath = path.join(dataDir, 'posta.db');
    let db = null;
    for (let i = 0; i < 20 && !db; i++) {
      try { db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout = 5000'); } catch (e) { await new Promise((r) => setTimeout(r, 300)); }
    }
    ok(!!db, 'E3 la base del boot se puede abrir para sembrar');
    if (!db) return;
    const ahora = Date.now();
    const uid = Number(db.prepare(`INSERT INTO users (email, password_hash, is_guest, guest_ig, lang, trial_ends_at) VALUES ('guest-wow@guest.invalid', '', 1, 'wow.suite', 'es', ?)`)
      .run(ahora + 2 * 24 * 3600 * 1000).lastInsertRowid);
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)').run(uid, 'Wow Suite', 'wow.suite');
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at, email) VALUES (?, ?, ?, ?)').run('wow.suite', '{"posts":[]}', ahora, 'publico@wow-suite.com');
    db.close();
    const rr = await fetch(base + '/api/guest/return-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'wow.suite', lang: 'es' }) });
    const rrJ = await rr.json().catch(() => ({}));
    ok(rr.status === 200 && rrJ.ok === true, 'E4 la puerta de regreso responde para el invitado sembrado');
    db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout = 5000');
    const caso = db.prepare(`SELECT detalle FROM support_cases WHERE user_id = ? AND tipo = 'prueba_retorno_dm' ORDER BY id DESC`).get(uid);
    const mLink = caso && String(caso.detalle || '').match(/\/api\/guest\/return\?token=([a-f0-9]{32,})/);
    ok(!!mLink, 'E5 el caso de la línea a mano lleva el link de regreso');
    if (!mLink) { db.close(); return; }
    const land = await fetch(base + '/api/guest/return?token=' + mLink[1], { redirect: 'manual' });
    const sc = (typeof land.headers.getSetCookie === 'function') ? land.headers.getSetCookie() : [];
    const cookie = sc.map((c) => c.split(';')[0]).filter((c) => c.includes('=')).join('; ');
    ok(land.status === 302 && !!cookie, 'E6 el link abre la sesión del invitado');
    db.close();
    if (!cookie) return;
    // Con sesión: el arranque del wow redirige a Instagram con el
    // redirect_uri forzado a ESTE host (la vuelta cae en el callback).
    const go = await fetch(base + '/api/ig/go?wow=1&next=' + encodeURIComponent('/#/app/inicio'), { headers: { Cookie: cookie }, redirect: 'manual' });
    const loc = go.headers.get('location') || '';
    ok(go.status === 302 && loc.includes('instagram.com'), 'E7 con sesión, /api/ig/go?wow=1 redirige al OAuth de Instagram [' + go.status + ']');
    ok(loc.includes('redirect_uri=https%3A%2F%2F127.0.0.1%3A' + port + '%2Fapi%2Fig%2Fcallback'), 'E8 el redirect_uri vuelve a este host (/api/ig/callback)');
    // Y el arranque sin marca se comporta igual que siempre (302).
    const go2 = await fetch(base + '/api/ig/go', { headers: { Cookie: cookie }, redirect: 'manual' });
    ok(go2.status === 302 && (go2.headers.get('location') || '').includes('instagram.com'), 'E9 sin la marca, el arranque es el de siempre (302 a Instagram)');
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 400));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------- F · Censo de diff (solo con PZ_PRISTINE) ----------
function seccionF() {
  const prist = process.env.PZ_PRISTINE || '';
  if (!prist) return;
  seccion('F · censo de diff contra el prístino (PZ_PRISTINE)');
  const permitidos = new Set(['wow-connect.js', 'server.js', 'public/app.js', 'public/styles.css', 'test-lote-conexion-wow.js']);
  const diffs = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'data') walk(path.join(dir, e.name), r); }
      else {
        const a = path.join(prist, r), b = path.join(ROOT, r);
        const ba = fs.existsSync(a) ? fs.readFileSync(a) : null;
        const bb = fs.existsSync(b) ? fs.readFileSync(b) : null;
        if (!ba || !bb || !ba.equals(bb)) diffs.push(r);
      }
    }
  };
  walk(ROOT, '');
  const fuera = diffs.filter((d) => !permitidos.has(d));
  ok(fuera.length === 0, 'F1 el diff es exactamente el lote (fuera de lista: ' + (fuera.join(', ') || 'ninguno') + ')');
  const pEsA = fs.readFileSync(path.join(prist, 'public/prueba.html'));
  const pEsB = fs.readFileSync(path.join(ROOT, 'public/prueba.html'));
  const pEnA = fs.readFileSync(path.join(prist, 'public/en-prueba.html'));
  const pEnB = fs.readFileSync(path.join(ROOT, 'public/en-prueba.html'));
  ok(pEsA.equals(pEsB) && pEnA.equals(pEnB), 'F2 prueba.html y en-prueba.html quedan byte a byte como la base (no se tocan)');
}

(async () => {
  seccionA();
  seccionB();
  seccionC();
  seccionD();
  await seccionE();
  seccionF();
  console.log('\n========================================');
  console.log('TOTAL: ' + nOk + ' ok · ' + nMal + ' mal');
  process.exit(nMal ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
