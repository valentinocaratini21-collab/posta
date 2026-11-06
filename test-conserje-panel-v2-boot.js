// test-conserje-panel-v2-boot.js — M121 del lote conserje-panel-v2 (base v698).
// Levanta server.js en una copia aislada (DATA_DIR temporal propio, sin
// tocar la DB real) y verifica por HTTP: el panel sigue bajo
// requireAdminToken (403 sin token, 200 con token); en DB fresca el panel
// viene vacío (sin clientes, sin alertas, sin próximos); y con un cliente
// en conserje + posteo de hoy sembrados en la DB del boot, el panel
// devuelve foto + posteo_hoy + feed + mañana + alertas reales.
// Uso: node test-conserje-panel-v2-boot.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { dayKeyInTz } = require('./morning-post-push');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const PORT = 34562;
const TOKEN = 'boot-test-token-panel-v2';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-panel-v2-boot-'));
const nodeModules = path.join(__dirname, '..', '.lote-pruebaentrada-boot', 'node_modules');

async function getJson(p, token) {
  const url = 'http://127.0.0.1:' + PORT + p + (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token || '');
  const r = await fetch(url);
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}

const NOW = new Date();
function utc(d) { return d.toISOString().slice(0, 19).replace('T', ' '); }
function hoursAgo(h) { return utc(new Date(NOW.getTime() - h * 3600 * 1000)); }
const TODAY_NY = dayKeyInTz(NOW, 'America/New_York');
const NOON_NY_UTC = TODAY_NY + ' 17:00:00';

(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: TOKEN,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: '',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'],
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
    check('el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await getJson('/api/version');
    check('/api/version trae el BUILD v698', ver.status === 200 && ver.json && ver.json.build === '20261105-v698',
      JSON.stringify(ver.json));

    const noTok = await getJson('/api/admin/support/conserje/panel');
    check('panel del dueño sin token → 403', noTok.status === 403);
    const empty = await getJson('/api/admin/support/conserje/panel', TOKEN);
    check('panel en DB fresca → 200, vacío (sin clientes, sin alertas, sin próximos)',
      empty.status === 200 && empty.json && empty.json.ok === true
      && Array.isArray(empty.json.clientes) && empty.json.clientes.length === 0
      && Array.isArray(empty.json.alertas) && empty.json.alertas.length === 0
      && Array.isArray(empty.json.proximos_posteos) && empty.json.proximos_posteos.length === 0,
      JSON.stringify(empty.json && { clientes: empty.json.clientes, alertas: empty.json.alertas }));

    // Siembra directa en la DB del boot: Valentino (12) en conserje, con
    // posteo publicado (517), posteo de hoy (518, recomendado), posteo de
    // mañana (519) y un mensaje de hace 3 h sin responder.
    const dbPath = path.join(tmpDir, 'posta.db');
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec(`CREATE TABLE IF NOT EXISTS pz_ritual (user_id INTEGER NOT NULL, day_key TEXT NOT NULL, recommended_post_id INTEGER NOT NULL, alt_post_ids TEXT NOT NULL DEFAULT '[]', picked_post_id INTEGER, gold INTEGER NOT NULL DEFAULT 0, picked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, day_key))`);
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, concierge) VALUES (12, 'valentino_bamboo@hotmail.com', 'x', 'posty', 'active', 1)`).run();
    db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (12, 'Posty', 'posty.communitymanager', 'Marketing')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, 'America/New_York')`).run();
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, published_at, created_at)
      VALUES (517, 12, '/media/517.jpg', 'El posteo que salió bien.', ?, 'published', 'approved', 'Producto que vende.', ?, ?)`)
      .run(TODAY_NY + ' 14:00:00', TODAY_NY + ' 14:00:00', hoursAgo(26));
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, created_at)
      VALUES (518, 12, '/media/518.jpg', 'El posteo de hoy.', ?, 'scheduled', 'approved', 'Producto que vende.', ?)`)
      .run(NOON_NY_UTC, hoursAgo(2));
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, strategy_why, created_at)
      VALUES (519, 12, '/media/519.jpg', 'El posteo de mañana.', ?, 'scheduled', 'approved', 'Producto que vende.', ?)`)
      .run(TODAY_NY + ' 17:00:00', hoursAgo(2));
    db.prepare(`UPDATE posts SET scheduled_at = datetime(?, '+1 day') WHERE id = 519`).run(TODAY_NY + ' 17:00:00');
    db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold)
      VALUES (12, ?, 518, '[519]', NULL, 0)`).run(TODAY_NY);
    db.prepare(`INSERT INTO chat_messages (user_id, role, text, created_at) VALUES (12, 'user', '¿me cambiás el posteo de hoy? Sale a las 17:00, ¿no?', ?)`)
      .run(hoursAgo(3));
    db.close();

    const panel = await getJson('/api/admin/support/conserje/panel', TOKEN);
    check('panel con cliente → 200', panel.status === 200 && panel.json && panel.json.ok === true);
    const c12 = ((panel.json || {}).clientes || []).find((c) => c.user_id === 12) || {};
    check('panel HTTP: user 12 con foto absoluta de su posteo publicado',
      typeof c12.foto === 'string' && c12.foto.endsWith('/media/517.jpg'), String(c12.foto));
    check('panel HTTP: posteo de hoy es el 518 con caption y cuando',
      c12.posteo_hoy && c12.posteo_hoy.id === 518 && c12.posteo_hoy.caption === 'El posteo de hoy.'
      && /^hoy \d{2}:\d{2}$/.test(c12.posteo_hoy.cuando || ''), JSON.stringify(c12.posteo_hoy));
    check('panel HTTP: feed con el 517 y próximo 518; mañana sin confirmar',
      c12.feed && (c12.feed.publicados || []).some((p) => p.id === 517) && c12.feed.proximo && c12.feed.proximo.id === 518
      && c12.manana && c12.manana.confirmada === false);
    check('panel HTTP: proximos_posteos 518 y 519 ordenados',
      ((panel.json || {}).proximos_posteos || []).map((p) => p.id).join(',') === '518,519');
    check('panel HTTP: alerta real por el mensaje de hace 3 h sin responder',
      ((panel.json || {}).alertas || []).some((a) => a.tipo === 'mensaje_sin_respuesta' && a.user_id === 12 && /3 h/.test(a.detalle || '')),
      JSON.stringify((panel.json || {}).alertas));
    const pend = await getJson('/api/admin/support/conserje/pendientes', TOKEN);
    check('pendientes con token → 200, total 1 (user 12)',
      pend.status === 200 && pend.json && pend.json.ok === true && pend.json.total === 1);
  } catch (e) {
    console.log('error del test:', e.message);
    fail++;
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n${pass} ok, ${fail} mal`);
  process.exit(fail ? 1 : 0);
})();
