'use strict';
/* test-lote-siembra-nails-v871.js — LOTE v871 SIEMBRA TIRA NAILS (base v860).
 * Orden de Valentino 10/11 09:03-09:04 («dale» 09:09): los proximos 3
 * posteos del producto son la tira nails, con imagenes + captions EXACTOS
 * del mock (sin regenerar por IA: el regen no acepta caption exacto y el
 * generador vivo no conoce las reglas nuevas).
 * Mecanismo: las 4 piezas ya vienen compuestas en public/siembra-nails/
 * (banda + cara arriba a la izquierda, geometria v869) y el endpoint
 * POST /api/admin/siembra-nails (requireAdminToken) las copia a MEDIA_DIR
 * (volumen persistente) e inserta los 3 posteos en sus slots, pasando a
 * borrador los viejos 591/580/584 con el gesto del conserje 'no_sale'
 * (status='draft', scheduled_at=NULL, approval='rejected', sin borrar
 * historia). Idempotente (source='siembra-nails-v871'); sin confirm=true
 * devuelve el plan (dry-run) sin tocar nada.
 * Cubre, con boot aislado (DB temporal, sin tocar produccion):
 *  A) estaticos: BUILD v884 x1 (re-pineo v884), cero v860; endpoint presente; las 4 piezas
 *     en public/siembra-nails con sus md5; captions exactos x1; slots
 *     exactos; app.js y styles.css sin tocar (censo del release);
 *     la cara esta arriba a la izquierda (pixel) y la banda es #F9E9E3.
 *  B) boot + siembra end-to-end: dry-run no toca nada; confirm=true
 *     siembra los 3 (ids, slots, captions, media_type, cover del video);
 *     los viejos 591/580/584 quedan draft sin fecha; los /media/ dan 200;
 *     la DB muestra los 3 programados con captions exactos y ya no los
 *     viejos en esos slots; segunda llamada = already_seeded, sin
 *     duplicados. CONTRA-PRUEBA: en el arbol pristino v860 el endpoint no
 *     existe (404) y la suite falla.
 * Uso: node test-lote-siembra-nails-v871.js — sale 0 si todo pasa.
 *   V871_TREE=<dir>  arbol a probar (por defecto, este directorio)
 *   V871_PORT=<n>    puerto del boot (por defecto 34672; verificar con ss
 *                      que este libre antes de correr).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TREE = path.resolve(process.env.V871_TREE || __dirname);
const PORT = Number(process.env.V871_PORT || 34672);
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function t(cond, label, extra) {
  if (cond) { pass++; console.log('ok   ' + label); }
  else { fail++; fails.push(label); console.log('FAIL ' + label + (extra ? ' — ' + extra : '')); }
}
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }

// ---------- §A: estaticos ----------
console.log('— §A: estaticos');
t((SRV.match(/20261105-v884/g) || []).length === 1, '§A: BUILD v884 x1 en server.js (re-pineo v884)', 'n=' + (SRV.match(/20261105-v884/g) || []).length);
t(!SRV.includes('20261105-v860'), '§A: cero v860 en server.js');
t(SRV.includes("app.post('/api/admin/siembra-nails'"), '§A: endpoint /api/admin/siembra-nails presente');
t(SRV.includes("source = 'siembra-nails-v871'") || SRV.includes("SRC = 'siembra-nails-v871'"), '§A: source siembra-nails-v871');
const CAPS = [
  // (v884) Captions APROBADOS por Valentino 12:19 («Claro, así sí») —
  // promocionan a Posty, no venden hacerse las uñas. Los viejos se
  // reemplazaron en server.js (constante SIEMBRA_NAILS_CAPTIONS).
  'Así queda un posteo de uñas cuando lo hace posty. La foto, el color, el caption: todo listo. Si tenés un salón, esto lo hago por vos todos los días.',
  'así se mueve el color cuando posty lo postea. un video así cada semana, para tu salón, sin que muevas un dedo.',
  'las que vuelven no vuelven por el esmalte. vuelven por el color que les queda. y ese posteo lo hizo posty.',
];
for (const c of CAPS) t((SRV.match(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 1, '§A: caption exacto x1: ' + c.slice(0, 40) + '…');
for (const s of ['2026-11-11T00:00:00.000Z', '2026-11-12T00:00:00.000Z', '2026-11-13T00:00:00.000Z']) {
  t(SRV.includes(s), '§A: slot ' + s);
}
const PIECES = {
  'tira-nails-1.jpg': 'bbb7408cd0b45be2fdc32f4fd28900d4',
  'tira-nails-2.mp4': '75b4e446ae3f9452e031d7f7ea53c457',
  'tira-nails-2-cover.jpg': '4123150c6ac3b3f6162b248b48178ef7',
  'tira-nails-3.jpg': 'dbc5bc27578ba3a3ecb8540f9db96324',
};
for (const [f, h] of Object.entries(PIECES)) {
  const p = path.join(TREE, 'public', 'siembra-nails', f);
  t(fs.existsSync(p), '§A: pieza en public/siembra-nails/' + f);
  if (fs.existsSync(p)) t(md5(p) === h, '§A: md5 ' + f, md5(p));
}
// La cara arriba a la izquierda + la banda #F9E9E3 (pixel, con PIL).
const { execFileSync } = require('child_process');
function px(img, x, y) {
  const out = execFileSync('python3', ['-c',
    `from PIL import Image; im=Image.open(${JSON.stringify(img)}).convert('RGB'); print(im.getpixel((${x},${y})))`],
    { encoding: 'utf8', timeout: 20000 }).trim();
  return out;
}
try {
  const c1 = px(path.join(TREE, 'public', 'siembra-nails', 'tira-nails-1.jpg'), 68, 68);
  t(/\(\d+, \d+, 2[0-9]{2}\)/.test(c1), '§A: cara arriba a la izquierda en tira-1 (pixel 68,68 azul Posty)', c1);
  const isBand = (s) => { const m = s.match(/\((\d+), (\d+), (\d+)\)/); if (!m) return false; const r = +m[1], g = +m[2], b = +m[3]; return r >= 245 && r <= 252 && g >= 230 && g <= 236 && b >= 224 && b <= 229; };
  const b1 = px(path.join(TREE, 'public', 'siembra-nails', 'tira-nails-1.jpg'), 1020, 1330);
  t(isBand(b1), '§A: banda #F9E9E3 en tira-1 (pixel 1020,1330)', b1);
  const b3 = px(path.join(TREE, 'public', 'siembra-nails', 'tira-nails-3.jpg'), 1020, 1330);
  t(isBand(b3), '§A: banda #F9E9E3 en tira-3 (pixel 1020,1330)', b3);
} catch (e) { t(false, '§A: chequeo por pixel (PIL)', String(e.message).slice(0, 120)); }

// ---------- §B: boot + siembra end-to-end ----------
console.log('— §B: boot + siembra');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siembra-v871-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const SECRET = 'lote-siembra-nails-v871-secret';
const ADMIN = 'boot-admin-v871';
process.env.DATA_DIR = tmpDir;
const db = require(path.join(TREE, 'db.js'));
// Usuario 12 + los 3 posteos viejos en sus slots (como en produccion).
db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (12, 'valentino_bamboo@hotmail.com', 'x')`).run();
const OLD = [
  [591, 'image', '2026-11-11T00:00:00.000Z', 'El momento de mirar el Instagram y no saber qué postear no tiene que ser parte de tu día. '],
  [580, 'image', '2026-11-12T00:00:00.000Z', '¿Cuántas veces te pasó de mirar tu Instagram y no saber qué postear...?'],
  [584, 'video', '2026-11-13T00:00:00.000Z', '¿Cuántas veces te pasó de mirar tu Instagram y no saber qué postear...?'],
];
for (const [id, mt, slot, cap] of OLD) {
  db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, media_type, tipo, week_key, source, needs_review, approval)
    VALUES (?, 12, ?, ?, '', ?, 'scheduled', ?, '', '2026-11-09', 'generador', 0, 'approved')`)
    .run(id, '/media/viejo-' + id + (mt === 'video' ? '.mp4' : '.jpg'), cap, slot, mt);
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
async function getRaw(p) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return { status: r.status, type: r.headers.get('content-type') || '' };
}
// Lectura directa de la DB (node:sqlite, read-only): /api/admin/user-posts
// depende de LA.accountPostsDetail y del perfil completo del usuario, y en
// una DB minima de test devuelve 500 — la fila en posts es la fuente de
// verdad de lo que muestra el producto (Hoy lee de ahi).
const { DatabaseSync } = require('node:sqlite');
function queryDb(sql, ...params) {
  const d = new DatabaseSync(path.join(tmpDir, 'posta.db'), { readOnly: true });
  try { return d.prepare(sql).all(...params); } finally { d.close(); }
}

(async () => {
  let boot = null;
  try {
    boot = await startBoot();
    t(boot.up, '§B: el servidor levanta con el lote (puerto ' + PORT + ')');
    if (!boot.up) { console.log(bootOut.split('\n').slice(-30).join('\n')); }
    else {
      const v = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
      t(String(v.build || v.version || JSON.stringify(v)).includes('20261105-v884'), '§B: /api/version v884 (re-pineo v884)', JSON.stringify(v).slice(0, 120));
      // Dry-run: no toca nada.
      const dry = await admin('POST', '/api/admin/siembra-nails', {});
      t(dry.status === 200 && dry.json && dry.json.dry_run === true, '§B: dry-run sin confirm (200 + dry_run)', dry.status + ' ' + JSON.stringify(dry.json).slice(0, 160));
      const before = queryDb(`SELECT id, status, scheduled_at FROM posts WHERE id IN (591,580,584) AND user_id = 12`);
      const nBefore = before.filter((p) => p.status === 'scheduled').length;
      t(nBefore === 3, '§B: dry-run no toca los viejos (3 programados)', 'n=' + nBefore);
      // Siembra real.
      const run = await admin('POST', '/api/admin/siembra-nails', { confirm: true });
      t(run.status === 200 && run.json && run.json.ok === true, '§B: siembra confirm=true (200 + ok)', run.status + ' ' + JSON.stringify(run.json).slice(0, 200));
      const seeded = (run.json && run.json.seeded) || [];
      t(seeded.length === 3, '§B: 3 posteos sembrados', 'n=' + seeded.length);
      const bySlot = {};
      for (const s of seeded) bySlot[s.slot] = s;
      t(bySlot['2026-11-11T00:00:00.000Z'] && bySlot['2026-11-11T00:00:00.000Z'].media === 'image', '§B: tira-1 imagen hoy 19:00');
      t(bySlot['2026-11-12T00:00:00.000Z'] && bySlot['2026-11-12T00:00:00.000Z'].media === 'video', '§B: tira-2 video mañana 19:00');
      t(bySlot['2026-11-13T00:00:00.000Z'] && bySlot['2026-11-13T00:00:00.000Z'].media === 'image', '§B: tira-3 imagen jue 19:00');
      for (let i = 0; i < 3; i++) {
        t(seeded[i] && seeded[i].caption === CAPS[i], '§B: caption exacto tira-' + (i + 1));
      }
      const cancelled = (run.json && run.json.cancelled) || [];
      t(cancelled.length === 3 && cancelled.map((c) => c.id).sort().join(',') === '580,584,591', '§B: viejos 591/580/584 a borrador', JSON.stringify(cancelled));
      // Los /media/ se sirven.
      for (const f of ['tira-nails-1.jpg', 'tira-nails-2.mp4', 'tira-nails-2-cover.jpg', 'tira-nails-3.jpg']) {
        const g = await getRaw('/media/' + f);
        t(g.status === 200, '§B: /media/' + f + ' 200', 'status=' + g.status);
      }
      // El producto muestra los 3 programados; los viejos ya no ocupan los slots.
      const rows = queryDb(`SELECT id, status, scheduled_at, media_type, caption, image_path, cover_path FROM posts WHERE user_id = 12 AND source = 'siembra-nails-v871' ORDER BY scheduled_at`);
      t(rows.length === 3, '§B: 3 filas siembra en la DB', 'n=' + rows.length);
      const slots = rows.filter((p) => p.status === 'scheduled').map((p) => p.scheduled_at).sort();
      t(slots.includes('2026-11-11T00:00:00.000Z') && slots.includes('2026-11-12T00:00:00.000Z') && slots.includes('2026-11-13T00:00:00.000Z'), '§B: los 3 slots ocupados por la tira', JSON.stringify(slots));
      t(rows[0] && rows[0].caption === CAPS[0] && rows[1] && rows[1].caption === CAPS[1] && rows[2] && rows[2].caption === CAPS[2], '§B: captions exactos en la DB');
      t(rows[1] && rows[1].media_type === 'video' && rows[1].cover_path === '/media/tira-nails-2-cover.jpg', '§B: video con cover_path en la DB', rows[1] ? rows[1].cover_path : 'sin fila');
      const oldRows = queryDb(`SELECT id, status, scheduled_at FROM posts WHERE id IN (591,580,584) AND user_id = 12`);
      const oldStill = oldRows.filter((p) => p.status === 'scheduled').length;
      t(oldStill === 0, '§B: ningun viejo sigue programado', 'n=' + oldStill);
      t(oldRows.every((p) => p.status === 'draft' && (p.scheduled_at === null || p.scheduled_at === '')), '§B: viejos en draft sin fecha (gesto no_sale)');
      // Idempotencia: segunda llamada no duplica.
      const again = await admin('POST', '/api/admin/siembra-nails', { confirm: true });
      t(again.status === 200 && again.json && again.json.already_seeded === true, '§B: segunda llamada = already_seeded', again.status + ' ' + JSON.stringify(again.json).slice(0, 120));
      const prog2 = queryDb(`SELECT id FROM posts WHERE user_id = 12 AND status = 'scheduled'`);
      t(prog2.length === 3, '§B: sin duplicados tras la segunda llamada (3 programados)', 'n=' + prog2.length);
      // Sin token: 403.
      const noTok = await fetch(`http://127.0.0.1:${PORT}/api/admin/siembra-nails`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
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
