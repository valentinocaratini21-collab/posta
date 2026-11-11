'use strict';
/* test-lote-siembra-captions-v884.js — LOTE v884 CORREGIR CAPTIONS TIRA NAILS (base v873).
 * v871 aterrizó 11:59 y la siembra se ejecutó 12:00 con los captions VIEJOS
 * (vendían hacerse las uñas). Valentino aprobó los nuevos 12:19 («Claro,
 * así sí»): el caption promociona a Posty y muestra que Posty trabaja con
 * el rubro, nunca vende el servicio del rubro.
 * Mecanismo: (1) los 3 captions SEED del endpoint de siembra pasan a la
 * constante SIEMBRA_NAILS_CAPTIONS (fuente única, cada caption literal x1);
 * (2) endpoint nuevo POST /api/admin/siembra-nails/corregir-captions
 * (requireAdminToken) actualiza SOLO los captions de los 3 posteos con
 * source='siembra-nails-v871' (por slot), sin tocar status, scheduled_at,
 * image_path, cover_path ni media. Idempotente; sin confirm=true devuelve
 * el plan (dry-run) sin tocar nada.
 * Cubre, con boot aislado (DB temporal, sin tocar produccion):
 *  A) estaticos: endpoint corregir presente; constante presente; captions
 *     nuevos x1 c/u; captions viejos x0; SEED usa la constante; endpoint
 *     de siembra intacto; BUILD v884 x1 (estampado).
 *  B) boot + corregir end-to-end: dry-run no toca nada (plan con los 3,
 *     caption_actual viejo, caption_nuevo aprobado, ya_correcto=false);
 *     confirm=true actualiza los 3 (cambiados=3) y la DB muestra los
 *     captions nuevos con status/scheduled_at/image_path/media_type/
 *     cover_path INTACTOS; segunda llamada = mismos posteos, cambiados=0,
 *     sin cambios en la DB; 403 sin token. CONTRA-PRUEBA: en el arbol
 *     pristino v873 el endpoint no existe (404) y la suite falla.
 * Uso: node test-lote-siembra-captions-v884.js — sale 0 si todo pasa.
 *   V884_TREE=<dir>  arbol a probar (por defecto, este directorio)
 *   V884_PORT=<n>    puerto del boot (por defecto 34673; verificar con ss
 *                      que este libre antes de correr).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TREE = path.resolve(process.env.V884_TREE || __dirname);
const PORT = Number(process.env.V884_PORT || 34673);
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function t(cond, label, extra) {
  if (cond) { pass++; console.log('ok   ' + label); }
  else { fail++; fails.push(label); console.log('FAIL ' + label + (extra ? ' — ' + extra : '')); }
}

const OLD = [
  'este color no se elige en la vidriera. se elige en la mano. vení y probalo.',
  'así cae el color antes de llegar a tus manos. mirá cómo se mueve.',
  'las que vuelven no vuelven por el esmalte. vuelven por el color que les queda. pedilo por nombre.',
];
const NEW = [
  'Así queda un posteo de uñas cuando lo hace posty. La foto, el color, el caption: todo listo. Si tenés un salón, esto lo hago por vos todos los días.',
  'así se mueve el color cuando posty lo postea. un video así cada semana, para tu salón, sin que muevas un dedo.',
  'las que vuelven no vuelven por el esmalte. vuelven por el color que les queda. y ese posteo lo hizo posty.',
];
const SLOTS = ['2026-11-11T00:00:00.000Z', '2026-11-12T00:00:00.000Z', '2026-11-13T00:00:00.000Z'];
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---------- §A: estaticos ----------
console.log('— §A: estaticos');
t(SRV.includes("app.post('/api/admin/siembra-nails/corregir-captions'"), '§A: endpoint /api/admin/siembra-nails/corregir-captions presente');
t(SRV.includes('const SIEMBRA_NAILS_CAPTIONS = {'), '§A: constante SIEMBRA_NAILS_CAPTIONS presente');
for (const c of NEW) t((SRV.match(new RegExp(esc(c), 'g')) || []).length === 1, '§A: caption nuevo x1: ' + c.slice(0, 40) + '…');
for (const c of OLD) t(!SRV.includes(c), '§A: caption viejo x0: ' + c.slice(0, 40) + '…');
for (const s of SLOTS) t(SRV.includes("SIEMBRA_NAILS_CAPTIONS['" + s + "']"), '§A: SEED usa la constante para ' + s);
t(SRV.includes("app.post('/api/admin/siembra-nails'"), '§A: endpoint de siembra intacto');
t(SRV.includes("SRC = 'siembra-nails-v871'"), '§A: source siembra-nails-v871');
t((SRV.match(/20261105-v884/g) || []).length === 1, '§A: BUILD v884 x1 (estampado)', 'n=' + (SRV.match(/20261105-v884/g) || []).length);
t(!SRV.includes('20261105-v873'), '§A: BUILD v873 x0');
t(SRV.includes("UPDATE posts SET caption = ? WHERE id = ?"), '§A: el UPDATE toca SOLO caption');

// ---------- §B: boot + corregir end-to-end ----------
console.log('— §B: boot + corregir');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'captions-v884-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const SECRET = 'lote-siembra-captions-v884-secret';
const ADMIN = 'boot-admin-v884';
process.env.DATA_DIR = tmpDir;
const db = require(path.join(TREE, 'db.js'));
// Usuario 12 + los 3 posteos sembrados con los captions VIEJOS (como en produccion).
db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (12, 'valentino_bamboo@hotmail.com', 'x')`).run();
const SEEDED = [
  [592, 'image', '2026-11-11T00:00:00.000Z', '/media/tira-nails-1.jpg', '', OLD[0]],
  [593, 'video', '2026-11-12T00:00:00.000Z', '/media/tira-nails-2.mp4', '/media/tira-nails-2-cover.jpg', OLD[1]],
  [594, 'image', '2026-11-13T00:00:00.000Z', '/media/tira-nails-3.jpg', '', OLD[2]],
];
for (const [id, mt, slot, img, cover, cap] of SEEDED) {
  db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, media_type, tipo, week_key, source, needs_review, approval, cover_path)
    VALUES (?, 12, ?, ?, '', ?, 'scheduled', ?, '', '2026-11-09', 'siembra-nails-v871', 0, 'approved', ?)`)
    .run(id, img, cap, slot, mt, cover);
}
db.close();

let bootOut = '';
async function startBoot() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: ADMIN,
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'test-sin-clave',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { bootOut += String(d); });
  child.stderr.on('data', (d) => { bootOut += String(d); });
  let up = false;
  for (let i = 0; i < 45; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { child, up };
}
async function admin(method, p, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}?token=${ADMIN}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const { DatabaseSync } = require('node:sqlite');
function queryDb(sql, ...params) {
  const d = new DatabaseSync(path.join(tmpDir, 'posta.db'), { readOnly: true });
  try { return d.prepare(sql).all(...params); } finally { d.close(); }
}
function snapshot() {
  return queryDb(`SELECT id, status, scheduled_at, image_path, media_type, cover_path, caption FROM posts WHERE user_id = 12 AND source = 'siembra-nails-v871' ORDER BY scheduled_at`);
}

(async () => {
  let boot = null;
  try {
    boot = await startBoot();
    t(boot.up, '§B: el servidor levanta con el lote (puerto ' + PORT + ')');
    if (!boot.up) { console.log(bootOut.split('\n').slice(-30).join('\n')); }
    else {
      // Dry-run: no toca nada.
      const dry = await admin('POST', '/api/admin/siembra-nails/corregir-captions', {});
      t(dry.status === 200 && dry.json && dry.json.dry_run === true, '§B: dry-run sin confirm (200 + dry_run)', dry.status + ' ' + JSON.stringify(dry.json).slice(0, 160));
      const plan = (dry.json && dry.json.plan) || [];
      t(plan.length === 3, '§B: plan con los 3 posteos', 'n=' + plan.length);
      t(plan.every((p, i) => p.caption_actual === OLD[i] && p.caption_nuevo === NEW[i] && p.ya_correcto === false), '§B: plan muestra viejo → nuevo, ya_correcto=false');
      const before = snapshot();
      t(before.every((p, i) => p.caption === OLD[i]), '§B: dry-run no toca los captions (3 viejos)', JSON.stringify(before.map((p) => p.caption.slice(0, 20))));
      // Corrección real.
      const run = await admin('POST', '/api/admin/siembra-nails/corregir-captions', { confirm: true });
      t(run.status === 200 && run.json && run.json.ok === true, '§B: corregir confirm=true (200 + ok)', run.status + ' ' + JSON.stringify(run.json).slice(0, 200));
      const posts = (run.json && run.json.posts) || [];
      t(posts.length === 3, '§B: devuelve los 3 posteos', 'n=' + posts.length);
      t(run.json && run.json.cambiados === 3, '§B: cambiados=3', 'cambiados=' + (run.json && run.json.cambiados));
      t(posts.every((p, i) => p.id === SEEDED[i][0] && p.slot === SLOTS[i] && p.caption === NEW[i] && p.cambiado === true), '§B: id/slot/caption nuevos + cambiado=true');
      const after = snapshot();
      t(after.every((p, i) => p.caption === NEW[i]), '§B: captions nuevos en la DB');
      // NO toca nada más que el caption.
      t(after.every((p, i) => p.status === before[i].status && p.scheduled_at === before[i].scheduled_at && p.image_path === before[i].image_path && p.media_type === before[i].media_type && p.cover_path === before[i].cover_path), '§B: status/scheduled_at/image_path/media_type/cover_path INTACTOS');
      // Idempotencia: segunda llamada, mismos posteos, sin cambios.
      const again = await admin('POST', '/api/admin/siembra-nails/corregir-captions', { confirm: true });
      t(again.status === 200 && again.json && again.json.ok === true, '§B: segunda llamada (200 + ok)', again.status);
      t(again.json && again.json.cambiados === 0, '§B: segunda llamada cambiados=0', 'cambiados=' + (again.json && again.json.cambiados));
      const posts2 = (again.json && again.json.posts) || [];
      t(posts2.length === 3 && posts2.every((p, i) => p.id === posts[i].id && p.slot === posts[i].slot && p.caption === posts[i].caption), '§B: segunda llamada devuelve los mismos posteos/captions');
      t(posts2.every((p) => p.cambiado === false), '§B: segunda llamada cambiado=false en los 3');
      const after2 = snapshot();
      t(after2.every((p, i) => p.caption === NEW[i]), '§B: la DB sigue con los captions nuevos tras la segunda llamada');
      // Dry-run tras corregir: ya_correcto=true en los 3.
      const dry2 = await admin('POST', '/api/admin/siembra-nails/corregir-captions', {});
      const plan2 = (dry2.json && dry2.json.plan) || [];
      t(plan2.length === 3 && plan2.every((p) => p.ya_correcto === true), '§B: dry-run tras corregir: ya_correcto=true en los 3');
      // Sin token: 403.
      const noTok = await fetch(`http://127.0.0.1:${PORT}/api/admin/siembra-nails/corregir-captions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      t(noTok.status === 403, '§B: sin token = 403', 'status=' + noTok.status);
    }
  } catch (e) {
    t(false, '§B: excepcion', String((e && e.message) || e).slice(0, 200));
  } finally {
    if (boot && boot.child) { try { boot.child.kill('SIGTERM'); } catch (e) {} }
  }
  const errLines = bootOut.split('\n').filter((l) => /^(Error|TypeError|ReferenceError)|Uncaught/i.test(l.trim()));
  t(errLines.length === 0, '§B: 0 errores en la salida del boot', errLines.slice(0, 3).join(' | '));
  console.log(`\n${pass} ok, ${fail} fail${fail ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
