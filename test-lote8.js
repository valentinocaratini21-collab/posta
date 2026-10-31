#!/usr/bin/env node
// test-lote8.js — SILENCIO NOCTURNO 22–8 DE LA ALERTA DESPEGUE.
// Uso: node test-lote8.js
// Sin red, sin IG real: pushFn/chatFn/fetchFn inyectados. Los instantes de
// los bordes son UTC fijos con estados DST conocidos (nunca Date.now()),
// así la suite no depende de la hora en que se corre.
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const M = require(path.join(__dirname, 'alerta-despegue.js'));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name, extra !== undefined ? String(extra).slice(0, 400) : ''); }
};
const eq = (a, b) => a === b;

const fmtSql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);
const daysAgo = (d) => new Date(Date.now() - d * 86400 * 1000);

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, lang TEXT DEFAULT 'es', plan_status TEXT DEFAULT 'active');
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, caption TEXT DEFAULT '', ig_media_id TEXT DEFAULT '', status TEXT DEFAULT 'published', published_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE post_metrics (post_id INTEGER PRIMARY KEY, reach INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, saved INTEGER DEFAULT 0, fetched_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'user', text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT '')`);
  M.ensureSchema(db);
  return db;
}
function addUser(db, id, lang, tz) {
  db.prepare('INSERT INTO users (id, lang) VALUES (?,?)').run(id, lang || 'es');
  if (tz !== null && tz !== undefined) db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?,?)').run(id, tz);
}
function addPost(db, id, uid, igId, publishedAt, reach, fetchedAt) {
  db.prepare('INSERT INTO posts (id, user_id, ig_media_id, status, published_at) VALUES (?,?,?,?,?)')
    .run(id, uid, igId, 'published', fmtSql(publishedAt));
  if (reach !== null && reach !== undefined) {
    db.prepare('INSERT INTO post_metrics (post_id, reach, fetched_at) VALUES (?,?,?)')
      .run(id, reach, fetchedAt ? fmtSql(fetchedAt) : fmtSql(new Date()));
  }
  return id;
}
// Baseline 5x100 + candidato 250 (mediana 100, ratio 2,5 -> despega).
function scenario(db, uid, candId) {
  [100, 100, 100, 100, 100].forEach((r, i) => addPost(db, 100 + i, uid, 'ig_base_' + i, daysAgo(2 + i), r, daysAgo(2 + i)));
  return addPost(db, candId, uid, 'ig_cand', hoursAgo(2), 250, new Date());
}
const NOOP_FETCH = async () => null;

async function main() {
  console.log('- ventana 22-8: bordes exactos (UTC fijos, DST conocidos)');
  // Junio 2026, horario de verano NY (EDT, UTC-4), sin transición cerca.
  ok('22:00 NY exacto es noche', M.esSilencioNocturno(Date.UTC(2026, 5, 2, 2, 0), 'America/New_York') === true);
  ok('21:59 NY es día', M.esSilencioNocturno(Date.UTC(2026, 5, 2, 1, 59), 'America/New_York') === false);
  ok('07:59 NY es noche', M.esSilencioNocturno(Date.UTC(2026, 5, 1, 11, 59), 'America/New_York') === true);
  ok('08:00 NY exacto es día', M.esSilencioNocturno(Date.UTC(2026, 5, 1, 12, 0), 'America/New_York') === false);
  ok('23:00 NY es noche', M.esSilencioNocturno(Date.UTC(2026, 5, 2, 3, 0), 'America/New_York') === true);
  ok('09:00 NY es día', M.esSilencioNocturno(Date.UTC(2026, 5, 1, 13, 0), 'America/New_York') === false);
  ok('constantes 22 y 8', M.SILENCIO_DESDE === 22 && M.SILENCIO_HASTA === 8);

  console.log('- próximo 08:00 (incluye cambio de hora)');
  ok('23:00 EDT 31/10 -> 08:00 EST 1/11 (día del atraso: 13:00 UTC)',
    eq(M.proximoDespertarMs(Date.UTC(2026, 10, 1, 3, 0), 'America/New_York'), Date.UTC(2026, 10, 1, 13, 0)));
  ok('07:30 EDT -> 08:00 mismo día',
    eq(M.proximoDespertarMs(Date.UTC(2026, 5, 1, 11, 30), 'America/New_York'), Date.UTC(2026, 5, 1, 12, 0)));
  ok('22:00 EDT -> 08:00 día siguiente',
    eq(M.proximoDespertarMs(Date.UTC(2026, 5, 2, 2, 0), 'America/New_York'), Date.UTC(2026, 5, 2, 12, 0)));
  ok('23:00 EST 7/3 -> 08:00 EDT 8/3 (día del adelanto: 12:00 UTC)',
    eq(M.proximoDespertarMs(Date.UTC(2026, 2, 8, 4, 0), 'America/New_York'), Date.UTC(2026, 2, 8, 12, 0)));

  console.log('- zona de la cuenta y fallback');
  ok('zona válida se respeta', M.resolverTz('America/New_York') === 'America/New_York');
  ok('zona con espacios se recorta', M.resolverTz('  America/New_York  ') === 'America/New_York');
  ok('zona vacía -> fallback BA', M.resolverTz('') === 'America/Argentina/Buenos_Aires');
  ok('zona inválida -> fallback BA', M.resolverTz('Inventada/No_Existe') === 'America/Argentina/Buenos_Aires');
  ok('mismo instante: noche en BA (22:30) y día en NY (21:30)',
    M.esSilencioNocturno(Date.UTC(2026, 5, 1, 1, 30), 'America/Argentina/Buenos_Aires') === true &&
    M.esSilencioNocturno(Date.UTC(2026, 5, 1, 1, 30), 'America/New_York') === false);

  console.log('- barrido de noche: retiene, no suena ni llega');
  {
    const db = freshDb(); addUser(db, 1, 'es', 'America/New_York');
    scenario(db, 1, 200);
    const pushes = [], chats = [];
    const r = await M.sweepDespegue(db, {
      nowMs: Date.UTC(2026, 5, 2, 2, 0), // 22:00 NY
      pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; },
      chatFn: (uid, text) => { chats.push(text); return true; },
      fetchFn: NOOP_FETCH,
    });
    ok('23:00->22:00 NY: 0 alertas, 1 retenida', r.alerted === 0 && r.retenidas === 1, JSON.stringify(r));
    ok('de noche no sale push ni chat', pushes.length === 0 && chats.length === 0);
    ok('sin marca de alertado (la mañana es la que marca)', db.prepare('SELECT COUNT(*) AS n FROM alerta_despegue').get().n === 0);
    const row = db.prepare('SELECT * FROM alerta_despegue_retenida WHERE post_id = 200').get();
    ok('fila retenida visible: reach/mediana/ratio + deliver 08:00 NY',
      !!row && row.reach === 250 && eq(row.median_reach, 100) && row.ratio === 2.5 &&
      row.deliver_at_ms === Date.UTC(2026, 5, 2, 12, 0) && !!row.detected_at, JSON.stringify(row));
    // Segundo barrido de noche: actualiza números, no duplica.
    db.prepare('UPDATE post_metrics SET reach = 300 WHERE post_id = 200').run();
    const r2 = await M.sweepDespegue(db, {
      nowMs: Date.UTC(2026, 5, 2, 3, 0), // 23:00 NY
      pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; },
      chatFn: (uid, text) => { chats.push(text); return true; },
      fetchFn: NOOP_FETCH,
    });
    ok('2º barrido de noche: ya_retenida, sigue 1 fila, reach actualizado a 300',
      r2.ya_retenidas === 1 && r2.alerted === 0 && pushes.length === 0 &&
      db.prepare('SELECT COUNT(*) AS n FROM alerta_despegue_retenida').get().n === 1 &&
      db.prepare('SELECT reach FROM alerta_despegue_retenida WHERE post_id = 200').get().reach === 300, JSON.stringify(r2));
    ok('flush de noche: pendiente, no entrega', (() => true)() && r2.flush.pendientes === 1 && r2.flush.entregadas === 0, JSON.stringify(r2.flush));
    // Flush a las 00:00 NY: sigue pendiente.
    const f0 = await M.flushDespegueRetenido(db, {
      nowMs: Date.UTC(2026, 5, 2, 4, 0),
      pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; },
      chatFn: (uid, text) => { chats.push(text); return true; },
    });
    ok('flush 00:00 NY: pendiente, sin envío', f0.pendientes === 1 && f0.entregadas === 0 && pushes.length === 0, JSON.stringify(f0));
    // Flush a las 08:00 NY exactas: entrega.
    const f1 = await M.flushDespegueRetenido(db, {
      nowMs: Date.UTC(2026, 5, 2, 12, 0),
      pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; },
      chatFn: (uid, text) => { chats.push(text); return true; },
    });
    ok('flush 08:00 NY: 1 entregada, push + chat, fila liberada y marca puesta',
      f1.entregadas === 1 && pushes.length === 1 && chats.length === 1 &&
      db.prepare('SELECT COUNT(*) AS n FROM alerta_despegue_retenida').get().n === 0 &&
      (() => { const m = db.prepare('SELECT * FROM alerta_despegue WHERE post_id = 200').get(); return !!m && m.reach === 300; })(), JSON.stringify(f1));
    ok('el push de la mañana lleva el deep link y los números frescos',
      pushes[0].url === '/#/app/post/200' && pushes[0].body.includes('300'));
  }

  console.log('- barrido de día: sale normal, sin retención');
  {
    const db = freshDb(); addUser(db, 1, 'es', 'America/New_York');
    scenario(db, 1, 200);
    const pushes = [];
    const r = await M.sweepDespegue(db, {
      nowMs: Date.UTC(2026, 5, 1, 13, 0), // 09:00 NY
      pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; },
      fetchFn: NOOP_FETCH,
    });
    ok('09:00 NY: alerta inmediata, 0 retenidas', r.alerted === 1 && r.retenidas === 0 && pushes.length === 1, JSON.stringify(r));
  }
  {
    const db = freshDb(); addUser(db, 1, 'es', 'America/New_York');
    scenario(db, 1, 200);
    const pushes = [];
    const r = await M.sweepDespegue(db, {
      nowMs: Date.UTC(2026, 5, 2, 12, 0), // 08:00 NY exactas: ya es día
      pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; },
      fetchFn: NOOP_FETCH,
    });
    ok('08:00 NY exactas: alerta inmediata (el borde es día)', r.alerted === 1 && r.retenidas === 0, JSON.stringify(r));
  }

  console.log('- la zona de la cuenta manda, no la del servidor');
  {
    const db = freshDb();
    addUser(db, 1, 'es', 'America/Argentina/Buenos_Aires');
    addUser(db, 2, 'es', 'America/New_York');
    scenario(db, 1, 200);
    // Segundo usuario con sus propios posteos (ids distintos).
    [100, 100, 100, 100, 100].forEach((r, i) => addPost(db, 300 + i, 2, 'ig_base2_' + i, daysAgo(2 + i), r, daysAgo(2 + i)));
    addPost(db, 400, 2, 'ig_cand2', hoursAgo(2), 250, new Date());
    const pushes = [];
    const r = await M.sweepDespegue(db, {
      nowMs: Date.UTC(2026, 5, 1, 1, 30), // 22:30 BA (noche) / 21:30 NY (día)
      pushFn: async (uid, copy) => { pushes.push({ uid, copy }); return { ok: true }; },
      fetchFn: NOOP_FETCH,
    });
    ok('mismo instante: BA retenida, NY alertada',
      r.retenidas === 1 && r.alerted === 1 && pushes.length === 1 && pushes[0].uid === 2, JSON.stringify(r));
    ok('la retenida es la de BA, no la de NY',
      !!db.prepare('SELECT * FROM alerta_despegue_retenida WHERE post_id = 200').get() &&
      !db.prepare('SELECT * FROM alerta_despegue_retenida WHERE post_id = 400').get());
  }

  console.log('- fallback ante zona inválida o ausente');
  {
    const db = freshDb(); addUser(db, 1, 'es', 'Inventada/No_Existe');
    scenario(db, 1, 200);
    const r = await M.sweepDespegue(db, {
      nowMs: Date.UTC(2026, 5, 1, 1, 30), // 22:30 en BA (fallback)
      pushFn: async () => ({ ok: true }), fetchFn: NOOP_FETCH,
    });
    ok('zona inválida -> fallback BA: retenida de noche', r.retenidas === 1 && r.alerted === 0, JSON.stringify(r));
  }
  {
    const db = freshDb(); addUser(db, 1, 'es', null); // sin fila en settings
    scenario(db, 1, 200);
    const r = await M.sweepDespegue(db, {
      nowMs: Date.UTC(2026, 5, 1, 1, 30),
      pushFn: async () => ({ ok: true }), fetchFn: NOOP_FETCH,
    });
    ok('sin settings -> fallback BA: retenida de noche', r.retenidas === 1 && r.alerted === 0, JSON.stringify(r));
  }

  console.log('- flush: sin canal no pierde, y no depende de la ventana de 12 h');
  {
    const db = freshDb(); addUser(db, 1, 'es', 'America/New_York');
    M.ensureSchema(db);
    db.prepare('INSERT INTO alerta_despegue_retenida (post_id, user_id, reach, median_reach, ratio, lang, deliver_at_ms) VALUES (?,?,?,?,?,?,?)')
      .run(999, 1, 250, 100, 2.5, 'es', Date.UTC(2026, 5, 2, 12, 0));
    const f = await M.flushDespegueRetenido(db, {
      nowMs: Date.UTC(2026, 5, 2, 13, 0), // 09:00 NY, de día
      pushFn: async () => ({ ok: false }), chatFn: () => false,
    });
    ok('sin canal en la mañana: sin_canal y la fila QUEDA', f.sin_canal === 1 && f.entregadas === 0 &&
      !!db.prepare('SELECT * FROM alerta_despegue_retenida WHERE post_id = 999').get(), JSON.stringify(f));
    const f2 = await M.flushDespegueRetenido(db, {
      nowMs: Date.UTC(2026, 5, 2, 13, 0),
      pushFn: async () => ({ ok: true }), chatFn: () => true,
    });
    ok('con canal, el reintento entrega aunque el posteo no exista en posts',
      f2.entregadas === 1 && !db.prepare('SELECT * FROM alerta_despegue_retenida WHERE post_id = 999').get(), JSON.stringify(f2));
  }

  console.log('- el barrido integra el flush');
  {
    const db = freshDb(); addUser(db, 1, 'es', 'America/New_York');
    M.ensureSchema(db);
    db.prepare('INSERT INTO alerta_despegue_retenida (post_id, user_id, reach, median_reach, ratio, lang, deliver_at_ms) VALUES (?,?,?,?,?,?,?)')
      .run(888, 1, 250, 100, 2.5, 'es', Date.UTC(2026, 5, 2, 12, 0));
    const pushes = [];
    const r = await M.sweepDespegue(db, {
      nowMs: Date.UTC(2026, 5, 2, 13, 0), // 09:00 NY
      pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; },
      fetchFn: NOOP_FETCH,
    });
    ok('barrido diurno entrega la retenida pendiente', r.flush && r.flush.entregadas === 1 && pushes.length === 1, JSON.stringify(r.flush));
  }

  console.log('- retenida EN: el copy de la mañana sale en inglés');
  {
    const db = freshDb(); addUser(db, 1, 'en', 'America/New_York');
    scenario(db, 1, 200);
    const pushes = [];
    await M.sweepDespegue(db, {
      nowMs: Date.UTC(2026, 5, 2, 2, 0),
      pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; },
      fetchFn: NOOP_FETCH,
    });
    await M.flushDespegueRetenido(db, {
      nowMs: Date.UTC(2026, 5, 2, 12, 0),
      pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; },
      chatFn: () => true,
    });
    ok('EN: título de la mañana en inglés', pushes.length === 1 && pushes[0].title === '🚀 Your post is taking off');
  }

  console.log('- guardas del módulo');
  const src = fs.readFileSync(path.join(__dirname, 'alerta-despegue.js'), 'utf8');
  ok('sin puerta agrupada de la oficina', !/require\(['"]\.\/push-oficina['"]\)/.test(src));
  ok('sin literal de censo (no mueve el conteo)', !src.includes('/aprobar'));

  console.log(`\n${passed} pasados, ${failed} fallados`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
