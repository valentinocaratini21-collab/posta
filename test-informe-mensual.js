// test-informe-mensual.js — INFORME MENSUAL REAL (ítem 5, 2026-10-26).
// Uso en repo: node test-informe-mensual.js
// Uso local sobre un árbol plano: INFORME_DIR=<dir> node test-informe-mensual.js
// DB real en memoria (node:sqlite): nada de stubs de SQL.
// Guardas: solo hechos reales; sin ROI, sin ventas atribuidas, sin promedios;
// una pieza sin published_at no se atribuye a ningún mes; 'sent' solo cuenta
// con decided_at en el mes; DMs nunca cuentan como respuestas.
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DIR = process.env.INFORME_DIR || __dirname;
const P = (f) => path.join(DIR, f);
const MOD = require(P('informe-mensual.js'));

let ok = 0, fail = 0;
function t(cond, msg) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function throws(fn, code, msg) {
  try { fn(); t(false, msg + ' (no lanzó)'); }
  catch (e) { t(e.message === code, msg + ' (lanzó ' + e.message + ')'); }
}
function mesSiguiente(mes) {
  const [y, m] = mes.split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
  return ny + '-' + String(nm).padStart(2, '0');
}

function freshDb(conReplies) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, published_at TEXT, ig_permalink TEXT DEFAULT '', tipo TEXT DEFAULT '')`);
  db.exec(`CREATE TABLE comment_queue (id INTEGER PRIMARY KEY, user_id INTEGER, ig_comment_id TEXT, created_at TEXT, status TEXT DEFAULT 'pending')`);
  db.exec(`CREATE TABLE dm_queue (id INTEGER PRIMARY KEY, user_id INTEGER, ig_message_id TEXT, created_at TEXT, status TEXT DEFAULT 'pending')`);
  if (conReplies !== false) {
    db.exec(`CREATE TABLE comment_replies (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, decided_at TEXT)`);
  }
  return db;
}
const UID = 7, OTRO = 9;
function siembra(db) {
  const post = db.prepare('INSERT INTO posts (user_id, status, published_at, ig_permalink, tipo) VALUES (?,?,?,?,?)');
  post.run(UID, 'published', '2026-10-03 10:00:00', 'https://ig/p/1', '');
  post.run(UID, 'published', '2026-10-03 18:00:00', '', '');
  post.run(UID, 'published', '2026-10-10 12:00:00', 'https://ig/p/3', '');
  post.run(UID, 'published', '2026-10-21 09:00:00', '', '');
  post.run(UID, 'published', '2026-10-21 20:00:00', '', '');
  post.run(UID, 'published', '2026-09-15 10:00:00', '', ''); // mes anterior: fuera
  post.run(UID, 'published', null, '', ''); // sin fecha: sin mes, fuera
  post.run(UID, 'draft', '2026-10-05 10:00:00', '', ''); // borrador: fuera
  post.run(OTRO, 'published', '2026-10-07 10:00:00', '', ''); // otro usuario: fuera
  const cq = db.prepare('INSERT INTO comment_queue (user_id, ig_comment_id, created_at) VALUES (?,?,?)');
  cq.run(UID, 'c1', '2026-10-02 10:00:00');
  cq.run(UID, 'c2', '2026-10-11 10:00:00');
  cq.run(UID, 'c3', '2026-10-20 10:00:00');
  cq.run(UID, 'c4', '2026-10-28 10:00:00');
  cq.run(UID, 'c5', '2026-09-30 10:00:00'); // mes anterior: fuera
  cq.run(OTRO, 'c6', '2026-10-12 10:00:00'); // otro usuario: fuera
  const dm = db.prepare('INSERT INTO dm_queue (user_id, ig_message_id, created_at) VALUES (?,?,?)');
  dm.run(UID, 'd1', '2026-10-04 10:00:00');
  dm.run(UID, 'd2', '2026-10-19 10:00:00');
  const cr = db.prepare('INSERT INTO comment_replies (user_id, status, decided_at) VALUES (?,?,?)');
  cr.run(UID, 'sent', '2026-10-03 11:00:00');
  cr.run(UID, 'sent', '2026-10-12 11:00:00');
  cr.run(UID, 'sent', '2026-10-22 11:00:00');
  cr.run(UID, 'sent', '2026-09-16 11:00:00'); // mes anterior: fuera
  cr.run(UID, 'dismissed', '2026-10-15 11:00:00'); // descartada: fuera
  cr.run(UID, 'pending', null); // pendiente: fuera
}

console.log('— Informe mensual: conteos reales del mes —');
{
  const db = freshDb(true); siembra(db);
  const inf = MOD.informePara(db, UID, '2026-10');
  t(inf.ok === true, 'ok true');
  t(inf.mes === '2026-10', 'mes devuelto');
  t(inf.es_mes_actual === ('2026-10' === MOD.mesActualUTC()), 'es_mes_actual coherente con hoy (sin fecha fija)');
  t(inf.piezas_publicadas === 5, 'piezas_publicadas = 5 (fuera: sep, sin fecha, borrador, otro usuario)');
  t(inf.dias_con_publicacion === 3, 'dias_con_publicacion = 3 (03, 10, 21)');
  t(inf.mensajes_capturados === 6, 'mensajes_capturados = 6 (4 comentarios + 2 DMs de octubre)');
  t(inf.respuestas_con_ok === 3, 'respuestas_con_ok = 3 (solo sent con decided_at en octubre)');
  t(Array.isArray(inf.piezas) && inf.piezas.length === 5, 'piezas listadas = 5');
  t(inf.piezas[0].fecha === '2026-10-03' && inf.piezas[0].permalink === 'https://ig/p/1', 'primera pieza con fecha y permalink reales');
}
console.log('— Mes vacío, mes anterior, validación —');
{
  const db = freshDb(true); siembra(db);
  const vacio = MOD.informePara(db, UID, '2026-01');
  t(vacio.piezas_publicadas === 0 && vacio.dias_con_publicacion === 0 && vacio.mensajes_capturados === 0 && vacio.respuestas_con_ok === 0, 'mes sin hechos = ceros reales, no error');
  const sep = MOD.informePara(db, UID, '2026-09');
  t(sep.piezas_publicadas === 1 && sep.mensajes_capturados === 1 && sep.respuestas_con_ok === 1, 'septiembre aísla sus propios hechos (1/1/1)');
  throws(() => MOD.informePara(db, UID, '2026-13'), 'mes_invalido', 'mes 13 inválido');
  throws(() => MOD.informePara(db, UID, 'octubre'), 'mes_invalido', 'mes no numérico inválido');
  throws(() => MOD.informePara(db, UID, ''), 'mes_invalido', 'mes vacío inválido');
  const futuro = mesSiguiente(MOD.mesActualUTC());
  throws(() => MOD.informePara(db, UID, futuro), 'mes_futuro', 'mes futuro rechazado (' + futuro + ')');
}
console.log('— Sin tabla comment_replies (creación perezosa) —');
{
  const db = freshDb(false);
  db.prepare('INSERT INTO posts (user_id, status, published_at) VALUES (?,?,?)').run(UID, 'published', '2026-10-03 10:00:00');
  const inf = MOD.informePara(db, UID, '2026-10');
  t(inf.piezas_publicadas === 1 && inf.respuestas_con_ok === 0, 'sin tabla replies: piezas cuentan, respuestas = 0 sin error');
}
console.log('— Validación de formato del módulo —');
{
  t(MOD.mesValido('2026-10') === true && MOD.mesValido('2026-1') === false && MOD.mesValido('2026-00') === false, 'mesValido acepta solo YYYY-MM real');
  t(/^\d{4}-\d{2}$/.test(MOD.mesActualUTC()), 'mesActualUTC con formato YYYY-MM');
}

console.log(`\n${ok} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
