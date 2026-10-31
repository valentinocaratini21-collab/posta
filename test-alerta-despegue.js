#!/usr/bin/env node
// test-alerta-despegue.js — ALERTA DESPEGUE (mejora 1/5).
// Uso: node test-alerta-despegue.js
// Corre contra el módulo que vive en el mismo directorio (raíz del repo
// tras el patch, o test-apply/ en el árbol local). Sin red, sin IG real:
// la ingesta se inyecta con fetchFn y el push con pushFn falsos.
// El wiring en scheduler.js se verifica si hay un scheduler.js junto al
// test (caso del árbol aplicado) o en ./test-apply/scheduler.js.
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const M = require(path.join(__dirname, 'alerta-despegue.js'));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name, extra !== undefined ? String(extra).slice(0, 300) : ''); }
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
// Zona cercana al mediodía (Lote 8, solo harness): los escenarios de alerta
// inmediata no deben depender de la hora en que se corre la suite. Se elige
// la zona cuya hora actual está entre las 10:00 y las 18:00 y más cerca del
// mediodía, para que ni siquiera un nowMs +35 min cruce a la noche.
function tzCercanaAlMediodia() {
  const zonas = ['Pacific/Kiritimati', 'Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Shanghai', 'Europe/Madrid', 'America/Argentina/Buenos_Aires', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Honolulu'];
  let mejor = 'America/Argentina/Buenos_Aires', mejorDist = 99;
  for (const z of zonas) {
    try {
      const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: z, hour: 'numeric', hour12: false }).format(new Date())) % 24;
      if (h < 10 || h > 18) continue;
      const dist = Math.abs(h - 14);
      if (dist < mejorDist) { mejorDist = dist; mejor = z; }
    } catch (e) {}
  }
  if (mejorDist < 99) return mejor;
  for (const z of zonas) {
    try {
      const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: z, hour: 'numeric', hour12: false }).format(new Date())) % 24;
      const dist = Math.min(Math.abs(h - 14), 24 - Math.abs(h - 14));
      if (dist < mejorDist) { mejorDist = dist; mejor = z; }
    } catch (e) {}
  }
  return mejor;
}
function addUser(db, id, lang) {
  db.prepare('INSERT INTO users (id, lang) VALUES (?,?)').run(id, lang || 'es');
  try { db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?,?)').run(id, tzCercanaAlMediodia()); } catch (e) {}
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
// Baseline de 5 posteos previos con mediana conocida + candidato.
// candPublishedAt default: hace 2 h (dentro de la ventana de 12 h).
function scenario(db, uid, baselineReaches, candReach, candFetchedAt, candPublishedAt) {
  baselineReaches.forEach((r, i) => addPost(db, 100 + i, uid, 'ig_base_' + i, daysAgo(2 + i), r, daysAgo(2 + i)));
  return addPost(db, 200, uid, 'ig_cand', candPublishedAt || hoursAgo(2), candReach, candFetchedAt);
}

async function main() {
  console.log('- mediana y decisión pura');
  ok('mediana impar: [100,300,200] -> 200', eq(M.median([100, 300, 200]), 200));
  ok('mediana par: [100,200,300,400] -> 250', eq(M.median([100, 200, 300, 400]), 250));
  ok('mediana ignora 0/negativos y vacía -> 0', eq(M.median([0, -5, 100, 200]), 150) && eq(M.median([]), 0));
  ok('borde 2x exacto despega', (() => { const d = M.despegeDecision(200, [100, 100, 100, 100, 100]); return d.despega && d.reason === 'despegue' && eq(d.ratio, 2); })());
  ok('1,99x no despega', (() => { const d = M.despegeDecision(199, [100, 100, 100, 100, 100]); return !d.despega && d.reason === 'bajo_mediana'; })());
  ok('alcance 0 -> sin_dato', M.despegeDecision(0, [100, 100, 100, 100, 100]).reason === 'sin_dato');
  ok('sin dato (null) -> sin_dato', M.despegeDecision(null, [100, 100, 100, 100, 100]).reason === 'sin_dato');
  ok('baseline <5 -> sin_baseline aunque el alcance sea gigante', (() => { const d = M.despegeDecision(999999, [100, 100, 100]); return !d.despega && d.reason === 'sin_baseline'; })());
  ok('baseline exactamente 5 alcanza', M.despegeDecision(250, [100, 100, 100, 100, 100]).despega === true);
  ok('mediana robusta a outlier: [100x4,10000] mediana 100, 250 despega (el promedio 2080 no lo haría)',
    (() => { const d = M.despegeDecision(250, [100, 100, 100, 100, 10000]); return d.despega && eq(d.median, 100); })());

  console.log('- payload push (forma)');
  const es = M.buildCopy({ postId: 42, reach: 2400, median: 1000, ratio: 2.4, lang: 'es' });
  ok('ES: título/body/url/data', es.title === '🚀 Tu posteo está despegando' && es.url === '/#/app/post/42' && es.data.postId === 42 && es.data.tipo === 'despegue');
  ok('ES: body con alcance es-AR (2.400) y 2,4 veces', es.body.includes('2.400') && es.body.includes('2,4 veces'));
  ok('ES: chat con mediana (1.000) y acción responder/compartir', es.chat.includes('1.000') && /respondé los comentarios/.test(es.chat) && /compartilo en historias/.test(es.chat));
  const en = M.buildCopy({ postId: 7, reach: 2400, median: 1000, ratio: 2.4, lang: 'en' });
  ok('EN: título/body con 2.4 times', en.title === '🚀 Your post is taking off' && en.body.includes('2.4 times'));
  const doble = M.buildCopy({ postId: 1, reach: 200, median: 100, ratio: 2, lang: 'es' });
  ok('ratio 2 exacto -> "el doble de"', doble.body.includes('el doble de'));
  ok('copy no publica nada: sin "publicar/se publicó" en título/body/chat',
    !/publicar|se publicó|ya salió/.test(es.title + es.body + es.chat));
  const src = fs.readFileSync(path.join(__dirname, 'alerta-despegue.js'), 'utf8');
  ok('módulo no publica: sin publishSinglePost ni sendEmail(', !/publishSinglePost/.test(src) && !/sendEmail\(/.test(src));
  ok('módulo no pasa por la puerta agrupada de la oficina', !/require\(['"]\.\/push-oficina['"]\)/.test(src));
  ok('módulo reutiliza push.js + insights reales por defecto', /require\('\.\/push'\)/.test(src) && /fetchMediaInsights/.test(src));

  console.log('- barrido con DB real (sin red)');
  {
    const db = freshDb(); addUser(db, 1, 'es');
    scenario(db, 1, [300, 400, 400, 500, 600], 1000, hoursAgo(2)); // mediana 400, ratio 2,5
    const pushes = [];
    const r = await M.sweepDespegue(db, {
      pushFn: async (uid, copy) => { pushes.push({ uid, copy }); return { ok: true, sent: 1 }; },
      fetchFn: async () => null, // caché reciente: no se usa
    });
    ok('barrido: 1 alerta', r.alerted === 1 && r.evaluated === 1, JSON.stringify(r));
    ok('push capturado: url deep link + data.postId + tipo', pushes.length === 1 && pushes[0].copy.url === '/#/app/post/200' && pushes[0].copy.data.postId === 200 && pushes[0].copy.data.tipo === 'despegue');
    ok('in-app: 1 mensaje en el chat', db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = 1').get().n === 1);
    ok('dedupe: fila alerta_despegue con reach/mediana/ratio reales', (() => {
      const row = db.prepare('SELECT * FROM alerta_despegue WHERE post_id = 200').get();
      return !!row && row.reach === 1000 && eq(row.median_reach, 400) && row.ratio === 2.5;
    })());
    const r2 = await M.sweepDespegue(db, {
      pushFn: async (uid, copy) => { pushes.push({ uid, copy }); return { ok: true }; },
      fetchFn: async () => null,
    });
    ok('deduplicación: 2º barrido no re-alerta (una alerta por posteo)', r2.alerted === 0 && pushes.length === 1 && db.prepare('SELECT COUNT(*) AS n FROM chat_messages').get().n === 1, JSON.stringify(r2));
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    scenario(db, 1, [300, 400, 400, 500, 600], 0, hoursAgo(2));
    const r = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => ({ reach: 0 }) });
    ok('alcance 0 -> sin_dato, sin alerta ni chat', r.alerted === 0 && r.skipped.sin_dato === 1 && db.prepare('SELECT COUNT(*) AS n FROM alerta_despegue').get().n === 0);
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    scenario(db, 1, [300, 400, 400, 500, 600], null, null); // candidato sin fila de métricas
    const r = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => null });
    ok('sin registro durable -> sin_dato, sin alerta', r.alerted === 0 && r.skipped.sin_dato === 1 && db.prepare('SELECT COUNT(*) AS n FROM alerta_despegue').get().n === 0);
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    scenario(db, 1, [100, 100, 100], 99999, hoursAgo(2)); // solo 3 previos
    const r = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => null });
    ok('sin baseline (<5) -> sin_baseline, sin alerta aunque sea gigante', r.alerted === 0 && r.skipped.sin_baseline === 1);
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    scenario(db, 1, [300, 400, 400, 500, 600], 600, hoursAgo(2)); // ratio 1,5
    let reachNow = 600;
    const r1 = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => ({ reach: reachNow }) });
    ok('bajo mediana -> no alerta y NO se marca', r1.alerted === 0 && r1.skipped.bajo_mediana === 1 && db.prepare('SELECT COUNT(*) AS n FROM alerta_despegue').get().n === 0);
    reachNow = 1200; // crece dentro de la ventana: ahora sí (35 min después: el caché ya es viejo y se re-trae)
    const r2 = await M.sweepDespegue(db, { nowMs: Date.now() + 35 * 60 * 1000, pushFn: async () => ({ ok: true }), fetchFn: async () => ({ reach: reachNow }) });
    ok('al crecer en ventana, el mismo posteo sí alerta (no haberlo marcado antes no lo pierde)', r2.alerted === 1, JSON.stringify(r2));
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    scenario(db, 1, [100, 100, 100, 100, 100], 99999, hoursAgo(13), hoursAgo(13)); // publicado fuera de las 12 h
    const r = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => null });
    ok('fuera de ventana (13 h) -> ni se evalúa', r.evaluated === 0 && r.alerted === 0);
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    scenario(db, 1, [100, 100, 100, 100, 100], 99999, hoursAgo(2));
    db.prepare("UPDATE posts SET ig_media_id = 'demo_x' WHERE id = 200").run();
    const r = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => null });
    ok('demo excluido -> ni se evalúa', r.evaluated === 0 && r.alerted === 0);
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    // Baseline [80,90,100,110,120] mediana 100; candidato 1000. Si el
    // candidato entrara en su propia baseline (6 valores), la mediana
    // sería 550 y el ratio 1,8: no alertaría. Correcto: ratio 10, alerta.
    scenario(db, 1, [80, 90, 100, 110, 120], 1000, hoursAgo(2));
    const r = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => null });
    ok('candidato excluido de su propia baseline', r.alerted === 1, JSON.stringify(r));
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    let fetches = 0;
    scenario(db, 1, [100, 100, 100, 100, 100], 300, new Date()); // caché recién traído
    const r = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => { fetches++; return { reach: 9999 }; } });
    ok('caché reciente (<30 min) -> no re-trae de IG y usa el caché', fetches === 0 && r.alerted === 1, JSON.stringify(r) + ' fetches=' + fetches);
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    let fetches = 0;
    scenario(db, 1, [100, 100, 100, 100, 100], 50, hoursAgo(3)); // caché viejo y bajo
    const r = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => { fetches++; return { reach: 400, likes: 0, comments: 0, saved: 0 }; } });
    const stored = db.prepare('SELECT reach FROM post_metrics WHERE post_id = 200').get();
    ok('caché viejo (>30 min) -> re-trae, actualiza post_metrics y alerta con lo fresco', fetches === 1 && stored.reach === 400 && r.alerted === 1);
  }
  {
    const db = freshDb(); addUser(db, 1, 'es');
    scenario(db, 1, [100, 100, 100, 100, 100], 500, hoursAgo(2));
    const r1 = await M.sweepDespegue(db, { pushFn: async () => ({ ok: false }), chatFn: () => false, fetchFn: async () => null });
    ok('sin ningún canal -> sin_canal y SIN marca (reintenta luego)', r1.alerted === 0 && r1.skipped.sin_canal === 1 && db.prepare('SELECT COUNT(*) AS n FROM alerta_despegue').get().n === 0);
    const r2 = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => null });
    ok('con canal disponible, el reintento en ventana sí alerta', r2.alerted === 1);
  }
  {
    const db = freshDb(); addUser(db, 2, 'en');
    scenario(db, 2, [100, 100, 100, 100, 100], 300, hoursAgo(2));
    const pushes = [];
    const r = await M.sweepDespegue(db, { pushFn: async (uid, copy) => { pushes.push(copy); return { ok: true }; }, fetchFn: async () => null });
    ok('usuario EN: alerta en inglés', r.alerted === 1 && pushes[0].title === '🚀 Your post is taking off');
  }
  {
    const db = freshDb();
    const r = await M.sweepDespegue(db, { pushFn: async () => ({ ok: true }), fetchFn: async () => null });
    ok('DB vacía -> 0 evaluados, sin errores', r.evaluated === 0 && r.alerted === 0 && r.errors === 0);
  }

  console.log('- wiring en scheduler.js');
  const schedPath = fs.existsSync(path.join(__dirname, 'scheduler.js'))
    ? path.join(__dirname, 'scheduler.js')
    : path.join(__dirname, 'test-apply', 'scheduler.js');
  if (fs.existsSync(schedPath)) {
    const s = fs.readFileSync(schedPath, 'utf8');
    ok('scheduler: cron cada 30 min a alerta-despegue', /cron\.schedule\('\*\/30 \* \* \* \*', \(\) => \{\s*\n?\s*sweepDespegue\(db\)/.test(s) && s.includes("require('./alerta-despegue')"));
    ok('scheduler: el bloque NO agrupa por push-oficina ni publica', !/alerta-despegue[\s\S]{0,400}push-oficina/.test(s.slice(s.indexOf('ALERTA DESPEGUE'))));
  } else {
    ok('scheduler.js junto al test para verificar wiring', false, 'no encontrado');
  }

  console.log(`\n${passed} pasados, ${failed} fallados`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
