// test-lote-guard-ya-publicado.js — LOTE GUARD-YA-PUBLICADO (6/11 · caso 570).
// ensureTodayPost generaba un SEGUNDO posteo el mismo día: el 519 ya estaba
// published y el paso 1 (solo programados) no lo veía → el paso 3 generaba
// el 570 para hoy 19:00. El guard nuevo frena todo si hoy ya se publicó
// algo; el paso 2 además excluye borradores frenados (user_stopped=1).
// (SEGUIMIENTO, no en este lote: que redoPost marque user_stopped=1 al
// volver a borrador — se sacó porque su fixture mínima
// test-lote-consolasoporte.js no tiene la columna y rompía esa suite;
// al hacerlo, agregarle user_stopped a ese esquema. El guard ya tapa
// el re-armado del 570 esta noche sin ese cambio.)
// Cubre:
//  (a) publicado hoy + sin programado → ensure no crea nada (caso 570).
//  (b) borrador creado hoy + publicado hoy → NO se re-programa (re-armado).
//  (c) sin publicado ni programado → el flujo sigue intacto (paso 2
//      programa el borrador; paso 3 llega al cupo, sin freno del guard).
//  (d) borrador frenado (user_stopped=1) → el paso 2 lo salta.
//  (e) estáticas: ubicación del guard, paso 2, express pinneado.
// En prístino v729 deben FALLAR: A2, B1, B2 y D1 (las que cazan el bug).
// Uso: node test-lote-guard-ya-publicado.js (desde el árbol). Sale 0 si
// todo pasa. Servidor real con DATA_DIR aislada + express 4.22.3 (M121).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

// El árbol: GUARD_TREE, o este directorio (el test vive en el árbol).
const TREE = process.env.GUARD_TREE || __dirname;
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));

const TZ = 'America/New_York';
const TODAY = dayKeyInTz(new Date(), TZ);
const shiftDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
// Hoy 15:00 UTC (10:00 EST): publicado hoy, formato espacio de producción.
const TODAY_15UTC = TODAY + ' 15:00:00';
// Hoy 10:00 UTC (05:00 EST): borrador creado hoy, formato espacio.
const TODAY_10UTC = TODAY + ' 10:00:00';
const at2200Z = (ymd) => ymd + 'T22:00:00.000Z'; // 17:00 EST
const at0200Z = (ymd) => ymd + 'T02:00:00.000Z'; // 21:00 EST del día anterior
const TOMORROW = shiftDays(TODAY, 1);

// ---------- estáticas ----------
(function estaticas() {
  const iEns = SRV.indexOf('async function ensureTodayPost');
  const iGuard = SRV.indexOf("reason: 'ya_publicado_hoy'", iEns);
  const iPaso1 = SRV.indexOf('// 1) Programado hoy', iEns);
  const iPaso2 = SRV.indexOf('// 2) Borrador de hoy', iEns);
  const iPaso3 = SRV.indexOf('// 3) Nada hoy: generar UNO', iEns);
  t('S1-guard: existe y está al inicio de ensureTodayPost, antes del paso 1',
    iEns >= 0 && iGuard > iEns && iGuard < iPaso1, 'iEns=' + iEns + ' iGuard=' + iGuard + ' iPaso1=' + iPaso1);
  t('S2-guard: usa ritualPublicadoHoy(uid, tz, hoy) y devuelve ya_publicado_hoy',
    SRV.slice(iEns, iPaso1).includes('ritualPublicadoHoy(uid, tz, hoy)') &&
    SRV.slice(iEns, iPaso1).includes("return { ok: false, reason: 'ya_publicado_hoy' }"));
  t('S3-paso2: el query de borradores excluye user_stopped=1',
    SRV.slice(iPaso2, iPaso3).includes('COALESCE(user_stopped, 0) = 0'));
  const pkg = JSON.parse(fs.readFileSync(path.join(TREE, 'package.json'), 'utf8'));
  t('S5-M121: package.json pinnea express 4 (nunca 5)',
    String(pkg.dependencies && pkg.dependencies.express || '').startsWith('^4.'));
  try {
    const expPkg = JSON.parse(fs.readFileSync(path.join('/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules/express/package.json'), 'utf8'));
    t('S5-M121: el express del boot es 4.22.3 (pin del package.json)', expPkg.version === '4.22.3', 'version=' + expPkg.version);
  } catch (e) { t('S5-M121: el express del boot es 4.22.3 (pin del package.json)', false, 'no se pudo leer: ' + e.message); }
})();

// ---------- boot del servidor real ----------
const PORT = 34573;
const SECRET = 'guard-ya-publicado-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-ya-publicado-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';

function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function api(sid, method, p, body, extraHeaders) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method, headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json', ...(extraHeaders || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
async function waitLastResult(sid, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeoutMs || 30000)) {
    const r = await api(sid, 'GET', '/api/week/last-result');
    if (r.json && r.json.has && r.json.result && r.json.result.reason) return r.json.result;
    await new Promise((res) => setTimeout(res, 400));
  }
  return null;
}

(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-test-token-guard-ya-publicado',
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'test',
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
    t('B0-boot: el servidor levanta con el lote (M121, copia aislada)', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    t('B0-boot: /api/version responde el BUILD v730 (re-pineado por el preparador)',
      ver && ver.build === '20261105-v730', JSON.stringify(ver));

    // Siembra: best_hour=21 (la franja de hoy que sigue en el futuro a
    // la hora del test: con 17 ya pasó y el publicador lo comería).
    // 21 publicado hoy (caso A) · 22 publicado hoy + borrador hoy
    // (caso B, análogo al 570) · 23 borrador hoy sin publicado (C1) ·
    // 24 cupo agotado sin publicado ni borrador (C2) · 25 borrador
    // frenado hoy sin publicado (D).
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    db.exec(`CREATE TABLE IF NOT EXISTS pz_ritual (
      user_id INTEGER NOT NULL, day_key TEXT NOT NULL,
      recommended_post_id INTEGER NOT NULL,
      alt_post_ids TEXT NOT NULL DEFAULT '[]', picked_post_id INTEGER,
      gold INTEGER NOT NULL DEFAULT 0, picked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, day_key))`);
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({
      cookie: { originalMaxAge: 604800000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' },
      userId: uid,
    });
    const dna = JSON.stringify({ producto_estrella: 'Café de especialidad', productos: [{ nombre: 'Café de especialidad' }] });
    for (const uid of [21, 22, 23, 24, 25]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (?, ?, 'x', 'posty', 'active', 21)`).run(uid, 'guard-' + uid + '@test.invalid');
      db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')`).run(uid);
      db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('guard-ya-publicado-' + uid, sessJson(uid), exp);
    }
    // ADN (puerta de /api/week/ensure) para 21, 22 y 24.
    for (const uid of [21, 22, 24]) db.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)`).run(uid, dna);
    const insPost = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, published_at, status, tipo, media_type, created_at) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, 'image', ?)`);
    const insDraft = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, status, tipo, media_type, created_at, user_stopped) VALUES (?, ?, ?, ?, '', 'draft', ?, 'image', ?, ?)`);
    // 21 (A): publicado hoy 10:00 EST + programado mañana 17:00 (el 521).
    insPost.run(611, 21, '/media/611.jpg', 'El posteo de hoy, ya salió', at2200Z(TODAY), TODAY_15UTC, 'published', 'social', TODAY_10UTC);
    insPost.run(612, 21, '/media/612.jpg', 'El de mañana', at2200Z(TOMORROW), null, 'scheduled', 'social', TODAY_10UTC);
    // 22 (B): publicado hoy + borrador creado hoy con imagen (el 570).
    insPost.run(621, 22, '/media/621.jpg', 'El posteo de hoy, ya salió', at2200Z(TODAY), TODAY_15UTC, 'published', 'social', TODAY_10UTC);
    insDraft.run(622, 22, '/media/622.jpg', 'Borrador de hoy con imagen', 'promo', TODAY_10UTC, 0);
    // 23 (C1): solo borrador creado hoy con imagen.
    insDraft.run(623, 23, '/media/623.jpg', 'Borrador de hoy', 'social', TODAY_10UTC, 0);
    // 24 (C2): 7 programados el sábado (cupo 7/7), sin publicado ni borrador.
    // Sábado 17:00–23:00 EST = 22:00Z sábado → 04:00Z domingo (misma semana).
    const [sy, sm, sd] = TOMORROW.split('-').map(Number);
    for (let i = 0; i < 7; i++) {
      const satIso = new Date(Date.UTC(sy, sm - 1, sd, 22 + i, 0, 0)).toISOString();
      insPost.run(631 + i, 24, '/media/63' + (1 + i) + '.jpg', 'Programado sábado ' + (i + 1), satIso, null, 'scheduled', 'social', TODAY_10UTC);
    }
    // 25 (D): solo borrador creado hoy, frenado (user_stopped=1).
    insDraft.run(625, 25, '/media/625.jpg', 'Borrador frenado', 'social', TODAY_10UTC, 1);
    const countPosts = (uid) => db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uid).n;

    // ----- (a) publicado hoy, sin programado -----
    const n21a = countPosts(21);
    const hoy21 = await api('guard-ya-publicado-21', 'GET', '/api/ritual/hoy');
    t('A1-ritual: publicado hoy → hoy null (vacío honesto, nada inventado)',
      hoy21.json && hoy21.json.hoy === null, JSON.stringify(hoy21.json && hoy21.json.hoy));
    t('A1-ritual: publicado hoy → publicado_hoy true',
      hoy21.json && hoy21.json.publicado_hoy === true, JSON.stringify(hoy21.json && hoy21.json.publicado_hoy));
    t('A1-ritual: publicado hoy → NO se creó ningún posteo',
      countPosts(21) === n21a, 'antes=' + n21a + ' después=' + countPosts(21));
    const p612 = db.prepare('SELECT status, scheduled_at FROM posts WHERE id = 612').get();
    t('A1-ritual: el programado de mañana sigue intacto (el 521 no se toca)',
      p612 && p612.status === 'scheduled' && p612.scheduled_at === at2200Z(TOMORROW), JSON.stringify(p612));
    const we21 = await api('guard-ya-publicado-21', 'POST', '/api/week/ensure', {});
    t('A2-week-ensure: dispara en segundo plano (generating true)',
      we21.json && we21.json.generating === true, JSON.stringify(we21.json));
    const lr21 = await waitLastResult('guard-ya-publicado-21');
    t("A2-week-ensure: el resultado es ya_publicado_hoy (el guard frena)",
      lr21 && lr21.reason === 'ya_publicado_hoy', JSON.stringify(lr21));
    t('A2-week-ensure: NO se creó ningún posteo',
      countPosts(21) === n21a, 'antes=' + n21a + ' después=' + countPosts(21));

    // ----- (b) borrador hoy + publicado hoy: NO se re-programa -----
    const n22a = countPosts(22);
    const hoy22 = await api('guard-ya-publicado-22', 'GET', '/api/ritual/hoy');
    const p622 = db.prepare('SELECT status, scheduled_at FROM posts WHERE id = 622').get();
    t('B1-ritual: borrador hoy + publicado hoy → el borrador SIGUE en borrador (no se re-programa)',
      p622 && p622.status === 'draft' && p622.scheduled_at === null, JSON.stringify(p622));
    t('B1-ritual: borrador hoy + publicado hoy → hoy null',
      hoy22.json && hoy22.json.hoy === null, JSON.stringify(hoy22.json && hoy22.json.hoy));
    t('B1-ritual: NO se creó ningún posteo',
      countPosts(22) === n22a, 'antes=' + n22a + ' después=' + countPosts(22));
    const we22 = await api('guard-ya-publicado-22', 'POST', '/api/week/ensure', {});
    const lr22 = await waitLastResult('guard-ya-publicado-22');
    t("B2-week-ensure: el resultado es ya_publicado_hoy (tapa el re-armado)",
      lr22 && lr22.reason === 'ya_publicado_hoy', JSON.stringify(lr22));
    const p622b = db.prepare('SELECT status, scheduled_at FROM posts WHERE id = 622').get();
    t('B2-week-ensure: el borrador SIGUE en borrador tras el ensure',
      p622b && p622b.status === 'draft' && p622b.scheduled_at === null, JSON.stringify(p622b));

    // ----- (c) sin publicado ni programado: el flujo sigue intacto -----
    const hoy23 = await api('guard-ya-publicado-23', 'GET', '/api/ritual/hoy');
    const p623 = db.prepare('SELECT status, scheduled_at FROM posts WHERE id = 623').get();
    t('C1-ritual: sin publicado → el borrador de hoy SE programa (paso 2 intacto)',
      p623 && p623.status === 'scheduled', JSON.stringify(p623));
    t('C1-ritual: sin publicado → queda para hoy a las 21:00 EST (best_hour del usuario)',
      p623 && dayKeyInTz(new Date(p623.scheduled_at), TZ) === TODAY && p623.scheduled_at === at0200Z(TOMORROW), JSON.stringify(p623));
    t('C1-ritual: sin publicado → la recomendada es el borrador (623)',
      hoy23.json && hoy23.json.recomendada && hoy23.json.recomendada.id === 623, JSON.stringify(hoy23.json && hoy23.json.recomendada));
    const n24a = countPosts(24);
    const we24 = await api('guard-ya-publicado-24', 'POST', '/api/week/ensure', {});
    const lr24 = await waitLastResult('guard-ya-publicado-24');
    t("C2-week-ensure: sin publicado y cupo lleno → plan_limit (el guard NO frena, llega al paso 3)",
      lr24 && lr24.reason === 'plan_limit', JSON.stringify(lr24));
    t('C2-week-ensure: NO se creó ningún posteo',
      countPosts(24) === n24a, 'antes=' + n24a + ' después=' + countPosts(24));

    // ----- (d) borrador frenado: el paso 2 lo salta -----
    const hoy25 = await api('guard-ya-publicado-25', 'GET', '/api/ritual/hoy');
    const p625 = db.prepare('SELECT status, scheduled_at, user_stopped FROM posts WHERE id = 625').get();
    t('D1-ritual: borrador frenado → SIGUE en borrador (el paso 2 lo salta)',
      p625 && p625.status === 'draft' && p625.scheduled_at === null, JSON.stringify(p625));
    t('D1-ritual: borrador frenado → hoy null (no se inventa nada)',
      hoy25.json && hoy25.json.hoy === null, JSON.stringify(hoy25.json && hoy25.json.hoy));

    db.close();
  } finally {
    kill();
  }

  console.log(`\nGUARD-YA-PUBLICADO: ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
