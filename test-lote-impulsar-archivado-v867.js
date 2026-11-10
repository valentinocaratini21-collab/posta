'use strict';
/* test-lote-impulsar-archivado-v867.js — LOTE IMPULSAR-ARCHIVADO · EL RECOMENDADO NUNCA ES UN ARCHIVADO (base v866).
 * Orden de Valentino 10/11 08:40 (regla dura): jamás mostrar un posteo para
 * impulsar que fue archivado o eliminado del feed; siempre mostrar uno que
 * esté en el feed. El caso: Valentino archivó en IG el posteo del gimnasio
 * (583, post_id 18139266841731675) y la app lo seguía mostrando en Hoy para
 * impulsar. Causa raíz: GET /api/estrategia/mejor-posteo elegía entre los
 * posts con status='published' + ig_media_id + no demo + no story + week_key
 * de la semana, sin verificar si el posteo seguía vivo en el feed de IG
 * (en la DB el 583 seguía 'published').
 * El fix (server.js, sin tocar app.js ni styles.css): el feed vivo de IG es
 * la fuente de verdad. Nuevo helper idsVivosEnFeed(db, uid) — lee el media
 * edge (solo id+timestamp, limit 100) con carrera de 3 s, mismo presupuesto
 * que el picker (v846) — y función pura filtrarPosteosVivos(rows, vivo),
 * aplicada en los 5 lugares que muestran un posteo para impulsar:
 *  - GET /api/estrategia/mejor-posteo (el recomendado: Hoy + carta + detalle)
 *  - GET /api/ads/billetera/elegibles (picker, filas locales)
 *  - GET /api/ads/billetera/buscar (buscador, filas locales)
 *  - GET /api/ads/billetera/feed (feed de Ads)
 *  - GET /api/ads/recommendations (candidatos antes de puntuar)
 * Las filas que vienen del feed vivo (solo_ig del picker) ya son vivas por
 * construcción y no pasan por el filtro. El gasto (POST .../impulsar, POST
 * /api/ads/boost) NO se toca: valida status local + las compuertas de Meta
 * y el débito ocurre solo si el ad se creó bien en Meta.
 * Fallback (decidido y asentado): si la lista viva no se puede leer (sin IG
 * conectado, IG lento o caído), NO se excluye nada y manda la tabla local
 * (precedente v846). ¿Por qué no fail-closed? Un fallo transitorio de Meta no
 * significa que el posteo no esté vivo; vaciar Impulsar en cada hipo de IG
 * sería un fallo peor y recurrente. La exclusión es exacta cuando la lectura
 * funciona (el caso normal). Sin credenciales tampoco se excluye.
 * Cubre, con boot aislado (DB temporal, sin tocar producción):
 *  A) estáticos: BUILD v867 ×1, cero v859; helpers existen; cableado en los
 *     5 endpoints; app.js y styles.css byte-idénticos a v866 (sin ?v=);
 *     published_at en los 3 SELECT que no lo traían;
 *  B) la función pura (VM, extraída del server.js real): el archivado cae,
 *     el vivo queda, el feed agotado excluye todo ausente, lo más viejo que
 *     la página se conserva, el fallback no excluye nada, demo_ y sin
 *     ig_media_id no se tocan;
 *  C) boot: /api/version v867; mejor-posteo con sesión real responde 200 y
 *     recomienda el mejor local (fallback sin credenciales de IG: la prueba
 *     del boot cubre el fallback, NO la exclusión — la exclusión la cubre
 *     §B y la verificación en vivo del re-estampador con el 583 archivado);
 *     elegibles responde 200; 0 errores en la salida del boot.
 * En el árbol prístino v866 los tests nuevos deben FALLAR (cazan el cambio).
 * Uso: node test-lote-impulsar-archivado-v867.js — sale 0 si todo pasa.
 *   IAV_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TREE = path.resolve(process.env.IAV_TREE || __dirname);
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const IDX_ES = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const gitBlob = (s) => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(s)}\0${s}`).digest('hex');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 400) : ''); }
};
const count = (s, sub) => (s.split(sub).length - 1);

// ---------- §A: estáticos ----------
console.log('— §A: estáticos');
t(count(SRV, "const BUILD_ID = '20261105-v867'") === 1, '§A: BUILD v867 ×1', count(SRV, '20261105-v867'));
t(count(SRV, '20261105-v859') === 0, '§A: cero v859 en server.js', count(SRV, '20261105-v859'));
t(count(SRV, 'async function idsVivosEnFeed(db, uid)') === 1, '§A: idsVivosEnFeed existe ×1');
t(count(SRV, 'function filtrarPosteosVivos(rows, vivo)') === 1, '§A: filtrarPosteosVivos existe ×1');
t(count(SRV, 'elegirMejorPosteoSemana(filtrarPosteosVivos(rows, vivo))') === 1, '§A: mejor-posteo filtra antes de elegir', count(SRV, 'elegirMejorPosteoSemana(filtrarPosteosVivos(rows, vivo))'));
t(count(SRV, 'filtrarPosteosVivos(rows, await idsVivosEnFeed(db, uid))') === 3, '§A: feed+elegibles+buscar filtran (×3)', count(SRV, 'filtrarPosteosVivos(rows, await idsVivosEnFeed(db, uid))'));
t(count(SRV, 'filtrarPosteosVivos(rows, await idsVivosEnFeed(db, req.session.userId))') === 1, '§A: recommendations filtra (×1)');
t(SRV.includes('const vivoP = idsVivosEnFeed(db, uid);'), '§A: mejor-posteo arranca la lectura viva en paralelo');
t(count(SRV, 'IG_VIVOS_TIMEOUT_MS = 3000') === 1, '§A: carrera de 3 s para la lectura viva');
t(count(SRV, 'IG_VIVOS_LIMITE = 100') === 1, '§A: límite 100 medios vivos');
// published_at en los 3 SELECT que no lo traían (el filtro lo usa para
// no juzgar lo más viejo que la página).
t(count(SRV, 'SELECT p.id, p.image_path, p.caption, p.ig_media_id, p.published_at,') === 2, '§A: mejor-posteo y recommendations traen published_at (×2)', count(SRV, 'SELECT p.id, p.image_path, p.caption, p.ig_media_id, p.published_at,'));
// app.js y styles.css byte-idénticos a v866 (blobs verificados por el
// liberador de v866): sin ?v=, sin styles?v=.
t(gitBlob(APP) === 'ddd574c99eb827fe040e394159d168b2f978d521', '§A: app.js byte-idéntico a v866 (sin cambio, sin ?v=)', gitBlob(APP));
t(gitBlob(CSS) === '39cff95f519885985ba015d08e4bcda111b8b3b3', '§A: styles.css byte-idéntico a v859', gitBlob(CSS));
t(gitBlob(IDX_ES) === '2fc07163b3bb9f3a75979e5bc04f94c60fa416ef', '§A: index ES byte-idéntico a v866 (?v=591)', gitBlob(IDX_ES));
t(gitBlob(IDX_EN) === 'bbff3ca45b51713a9d40823314edac1210a70eb7', '§A: index EN byte-idéntico a v866', gitBlob(IDX_EN));

// ---------- §B: la función pura (VM) ----------
console.log('— §B: filtrarPosteosVivos (VM)');
let filtrar = null;
{
  const m = SRV.match(/function filtrarPosteosVivos\(rows, vivo\) \{[\s\S]*?\n\}/);
  t(!!m, '§B: filtrarPosteosVivos extraíble del server.js real');
  if (m) {
    const ctx = { Set };
    vm.createContext(ctx);
    vm.runInContext(m[0] + '\nthis.__f = filtrarPosteosVivos;', ctx);
    filtrar = ctx.__f;
  }
}
if (filtrar) {
  const R = (id, mid, pub) => ({ id, ig_media_id: mid, published_at: pub || '2026-11-10T00:00:00.000Z', likes: 1, comments: 0, saved: 0 });
  // Caso 583: feed agotado (9 medios < 100) sin el 583 → cae; el vivo queda.
  const vivo583 = { ok: true, ids: new Set(['111', '222']), completo: true, masAntiguo: '2026-11-09T19:00:00+0000' };
  const out1 = filtrar([R(583, '18139266841731675'), R(570, '111')], vivo583);
  t(out1.length === 1 && out1[0].id === 570, '§B: el archivado (583) cae con feed agotado; el vivo queda', JSON.stringify(out1.map((r) => r.id)));
  // Página llena: lo más viejo que el medio más antiguo se conserva.
  const vivoPag = { ok: true, ids: new Set(['111']), completo: false, masAntiguo: '2026-11-01T00:00:00+0000' };
  const out2 = filtrar([R(1, '111'), R(2, '999', '2026-09-15T00:00:00.000Z'), R(3, '888', '2026-11-09T00:00:00.000Z')], vivoPag);
  t(out2.map((r) => r.id).join(',') === '1,2', '§B: página llena: viejo conservado, reciente ausente cae', JSON.stringify(out2.map((r) => r.id)));
  // Fallback: sin verificación posible no se excluye nada.
  t(filtrar([R(583, '18139266841731675'), R(570, '111')], { ok: false }).length === 2, '§B: fallback ok:false no excluye nada');
  t(filtrar([R(583, '18139266841731675')], null).length === 1, '§B: fallback vivo=null no excluye nada');
  t(filtrar([R(583, '18139266841731675')], undefined).length === 1, '§B: fallback vivo=undefined no excluye nada');
  // Bordes.
  t(JSON.stringify(filtrar(null, vivo583)) === '[]', '§B: rows=null → []');
  t(JSON.stringify(filtrar(undefined, vivo583)) === '[]', '§B: rows=undefined → []');
  t(filtrar([], vivo583).length === 0, '§B: rows=[] → []');
  t(filtrar([R(1, 'demo_123')], vivo583).length === 1, '§B: demo_ no se toca (lo excluye el SQL)');
  t(filtrar([R(1, '')], vivo583).length === 1, '§B: sin ig_media_id no se toca');
  t(filtrar([R(1, '111', '')], { ok: true, ids: new Set(['222']), completo: false, masAntiguo: '2026-11-01T00:00:00+0000' }).length === 0,
    '§B: sin published_at y página llena, ante la duda cae (manda la regla)');
  // El filtro no muta el array original.
  const rowsIn = [R(583, '18139266841731675'), R(570, '111')];
  filtrar(rowsIn, vivo583);
  t(rowsIn.length === 2, '§B: no muta el array de entrada');
}

// ---------- §C: boot ----------
console.log('— §C: boot');
const PORT = 34671;
const SECRET = 'lote-impulsar-archivado-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impulsar-archivado-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function api(sid, method, p, body) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const r = await fetch(url, {
    method, headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
// Lunes de la semana actual en America/New_York (la misma semana que el
// endpoint calcula con mondayKeyOf(tzToday(...))).
function mondayKeyNY(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (ty) => parts.find((p) => p.type === ty).value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const monday = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')) - ((wd + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}
async function runBoot() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-admin-iav',
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'test-no-real-key',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (r.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, '§C: el servidor levanta con el lote (puerto ' + PORT + ')');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await api('x', 'GET', '/api/version');
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v867',
      '§C: /api/version trae el BUILD v867 (estampado)', JSON.stringify(ver.json));
    // Siembra: usuario + sesión + 2 posteos publicados esta semana con
    // métricas. El 101 es el análogo del 583 (el más rendidor: sin filtro
    // ganaría); el 102 es el segundo. Sin credenciales de IG en settings,
    // la lectura viva falla → fallback a la tabla local → el 101 gana
    // (la prueba del boot cubre el fallback; la exclusión la cubre §B).
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const wk = mondayKeyNY();
    const nowIso = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (1, 'test-iav@example.com', 'x')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (1, 'America/New_York')`).run();
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, status, published_at, ig_media_id, week_key, media_type)
      VALUES (101, 1, '/media/p101.jpg', 'gimnasio archivado', 'published', ?, '18139266841731675', ?, 'image')`).run(nowIso, wk);
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, status, published_at, ig_media_id, week_key, media_type)
      VALUES (102, 1, '/media/p102.jpg', 'vivo segundo', 'published', ?, '99999999999999999', ?, 'image')`).run(nowIso, wk);
    db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved) VALUES (101, 100, 50, 10, 5)`).run();
    db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved) VALUES (102, 10, 5, 1, 0)`).run();
    const sid = 'test-sid-iav867';
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`)
      .run(sid, JSON.stringify({ cookie: { originalMaxAge: 7 * 24 * 3600 * 1000, httpOnly: true, path: '/' }, userId: 1 }), Date.now() + 7 * 24 * 3600 * 1000);
    db.close();
    // Sin sesión → 401 (el endpoint sigue exigiendo auth).
    const sinAuth = await fetch(`http://127.0.0.1:${PORT}/api/estrategia/mejor-posteo`);
    t(sinAuth.status === 401, '§C: mejor-posteo sin sesión → 401', String(sinAuth.status));
    // Con sesión: responde y recomienda (fallback sin IG: el 101, el mejor
    // local). Lo importante: no se cuelga ni da 500 sin credenciales.
    const t0 = Date.now();
    const mj = await api(sid, 'GET', '/api/estrategia/mejor-posteo');
    const dt = Date.now() - t0;
    t(mj.status === 200 && mj.json && mj.json.ok === true, '§C: mejor-posteo responde 200 ok:true', JSON.stringify(mj.json));
    t(mj.json && mj.json.mejor && mj.json.mejor.post_id === 101,
      '§C: fallback sin IG: recomienda el mejor local (101)', JSON.stringify(mj.json && mj.json.mejor));
    t(dt < 10000, '§C: mejor-posteo responde en <10 s sin IG (' + dt + ' ms)', String(dt));
    const el = await api(sid, 'GET', '/api/ads/billetera/elegibles');
    t(el.status === 200 && el.json && el.json.ok === true, '§C: elegibles responde 200 ok:true', JSON.stringify(el.json).slice(0, 200));
    t(el.json && Array.isArray(el.json.elegibles) && el.json.elegibles.some((e) => e.post_id === 101 || e.id === 101),
      '§C: elegibles lista el posteo local (fallback)', JSON.stringify(el.json && el.json.elegibles));
    const errLines = out.split('\n').filter((l) => /^(Error|TypeError|ReferenceError)|Uncaught/i.test(l.trim()));
    t(errLines.length === 0, '§C: 0 errores en la salida del boot', errLines.slice(0, 3).join(' | '));
  } catch (e) {
    t(false, '§C: boot', e.message);
  } finally {
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await runBoot();
  console.log(`\ntest-lote-impulsar-archivado-v867: ${okN}/${okN + badN} ok`);
  if (badN) process.exit(1);
})();
