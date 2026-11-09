'use strict';
/* test-lote-fix-auto-arm.js — FIX AUTO-ARM EXTRAS (v835)
 * Diagnóstico: en autoArmWeek (server.js, la regla 24h, corre cada hora a
 * las :17), la query de feedDrafts tiene UN solo `?` (user_id) pero el
 * código le pasaba DOS valores: `.all(uid, weekKey)`. node:sqlite tira
 * «column index out of range» al ligar el segundo, el try/catch del paso
 * de extras lo tragaba (`[auto-arm:<tag>] extras:` en el log) y
 * generateWeekExtras (historias + reels del plan) se saltaba CADA VEZ.
 * La query ya filtra por created_at > -3 días; el weekKey lo usa
 * generateWeekExtras, no la query. Fix: `.all(uid, weekKey)` → `.all(uid)`
 * EN ESA QUERY SOLO (las otras 7 tienen 2 `?` y no se tocan).
 *
 * Parte A: estático — el call-site de autoArmWeek liga 1 valor con 1 `?`;
 *   las otras 7 ligaduras `.all(uid, weekKey)` siguen intactas; BUILD v835.
 * Parte B: runtime — la query EXACTA extraída del server.js servido corre
 *   con `.all(uid)` sobre una DB en memoria y filtra bien; la ligadura
 *   vieja `.all(uid, weekKey)` tira «column index out of range» (el bug).
 * Corre con: node test-lote-fix-auto-arm.js
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
function ok(cond, msg) { total++; if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }

const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

function autoArmBlock() {
  const start = serverSrc.indexOf('async function autoArmWeek(uid, tag) {');
  const end = serverSrc.indexOf('function autoWeekEnabled(uid) {', start);
  if (start < 0 || end < 0) return null;
  return serverSrc.slice(start, end);
}

function partA() {
  section('A1 · el call-site de autoArmWeek liga 1 valor con 1 placeholder');
  const block = autoArmBlock();
  ok(block !== null, 'bloque autoArmWeek encontrado en server.js');
  if (!block) return;
  ok(block.includes("created_at > datetime('now', '-3 days')"), 'la query de feedDrafts es la del filtro -3 días');
  const m = block.match(/const feedDrafts = db\.prepare\(`([\s\S]*?)`\)\.all\(uid\);/);
  ok(m !== null, 'la query de feedDrafts se liga con .all(uid) (1 valor)');
  if (m) {
    const placeholders = (m[1].match(/\?/g) || []).length;
    ok(placeholders === 1, `la query tiene exactamente 1 placeholder (tiene ${placeholders})`);
    ok(m[1].includes('user_id = ?'), 'el único placeholder es user_id');
    ok(!m[1].includes('week_key'), 'la query no filtra por week_key (el weekKey lo usa generateWeekExtras)');
  }
  ok(!block.includes('.all(uid, weekKey)'), 'autoArmWeek ya no tiene ningún .all(uid, weekKey)');

  section('A2 · las otras 7 ligaduras .all(uid, weekKey) no se tocaron');
  const all = (serverSrc.match(/\.all\(uid, weekKey\)/g) || []).length;
  ok(all === 7, `quedan exactamente 7 .all(uid, weekKey) en server.js (hay ${all})`);

  section('A3 · BUILD estampado');
  ok(serverSrc.includes("const BUILD_ID = '20261105-v835';"), 'BUILD_ID v835 (1 ocurrencia)');
  ok((serverSrc.match(/const BUILD_ID = /g) || []).length === 1, 'una sola línea BUILD_ID');
}

function partB() {
  section('B1 · la query extraída del server.js corre con .all(uid)');
  const block = autoArmBlock();
  const m = block && block.match(/const feedDrafts = db\.prepare\(`([\s\S]*?)`\)\.all\(uid\);/);
  ok(m !== null, 'query extraída del server.js (no una copia)');
  if (!m) return;
  const sql = m[1];
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, media_type TEXT, status TEXT, created_at TEXT)`);
  const ins = db.prepare(`INSERT INTO posts (user_id, media_type, status, created_at) VALUES (?, ?, ?, ?)`);
  // uid 1: los dos que SÍ entran (draft + scheduled, imagen, recientes).
  ins.run(1, 'image', 'draft', new Date().toISOString().slice(0, 19).replace('T', ' '));
  ins.run(1, 'image', 'scheduled', new Date().toISOString().slice(0, 19).replace('T', ' '));
  // Los que NO entran: video reciente, imagen vieja (4 días), otro usuario, cancelado.
  ins.run(1, 'video', 'draft', new Date().toISOString().slice(0, 19).replace('T', ' '));
  const old = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  ins.run(1, 'image', 'draft', old);
  ins.run(2, 'image', 'draft', new Date().toISOString().slice(0, 19).replace('T', ' '));
  ins.run(1, 'image', 'cancelled', new Date().toISOString().slice(0, 19).replace('T', ' '));

  let threw = null;
  try { db.prepare(sql).all(1, '2026-11-09'); } catch (e) { threw = e; }
  ok(threw !== null && /column index out of range/.test(threw.message),
    `la ligadura vieja .all(uid, weekKey) tira «column index out of range» (vino: ${threw ? threw.message : 'no tiró'})`);

  let rows = null, err = null;
  try { rows = db.prepare(sql).all(1); } catch (e) { err = e; }
  ok(err === null, `la ligadura corregida .all(uid) no tira (${err ? err.message : 'ok'})`);
  ok(Array.isArray(rows) && rows.length === 2, `devuelve exactamente los 2 borradores recientes de imagen del usuario (vinieron ${rows ? rows.length : '?'})`);
  if (rows) {
    ok(rows.every((r) => r.user_id === 1 && r.media_type === 'image' && (r.status === 'draft' || r.status === 'scheduled')),
      'las filas son del usuario, imagen, draft/scheduled');
  }
}

partA();
partB();
console.log(`\n${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
