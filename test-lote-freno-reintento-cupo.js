// test-lote-freno-reintento-cupo.js — LOTE FRENO-REINTENTO-CUPO.
// Regla: el reintento de un posteo ya programado NO se cobra dos veces en
// el cupo semanal. El cupo se cobra una sola vez por posteo, en su
// programación original; el reintento hereda el lugar DE SU MISMA SEMANA.
//
// El defecto (incidente 22/11, la película): el posteo 742 estaba
// programado, falló al salir y su reintento desde la app (publish-now)
// rebotó con 403 plan_limit porque el único reel semanal del plan de
// prueba (Esencial: reelsPerWeek=1) ya lo consumía el reel 695 publicado.
// Mecanismo: quotaCounts (server.js) cuenta scheduled/publishing/
// published — un 'failed' no cuenta — y las puertas de cupo eximían por
// ESTADO ACTUAL: al pasar a 'failed', el posteo perdía la exención y el
// reintento se cobraba como posteo nuevo.
//
// Fixture 742/695 sobre boot real (usuario nuevo = plan de prueba,
// 1 reel/semana):
//   A el cupo de reels está lleno por el 695 publicado (used 1, left 0).
//   B publish-now del 742 (fallido de ESTA semana) → 200, NO plan_limit.
//   C publish-now de un borrador de video NUEVO → 403 plan_limit.
//   D camino feliz intacto: programado → 200; borrador de imagen con
//     cupo de posteos disponible → 200.
//   E publish-now de un fallido de la semana PASADA → 403 plan_limit
//     (la herencia es de su semana, no un pase libre).
//   F PATCH que reprograma un fallido a OTRO día de SU semana → 200,
//     queda 'scheduled' (herencia también en Reprogramar).
//   G PATCH que reprograma un fallido a la semana que viene, con el
//     cupo de esa semana lleno por otro publicado → 403 plan_limit.
// Uso: node test-lote-freno-reintento-cupo.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-freno-reintento-'));
const MEDIA = path.join(TMP, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
const PORT = 18777;
const BASE = `http://127.0.0.1:${PORT}`;
const TZ = 'America/Argentina/Buenos_Aires';

// Material real mínimo: el checklist de publish-now frena (duro) si el
// archivo del video no existe; el de la foto igual. Video real de 3s si
// hay ffmpeg; si no, bytes dummy alcanzan (solo se exige existencia).
try {
  execFileSync('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '3', path.join(MEDIA, 'v1.mp4'), '-y'], { stdio: 'ignore' });
} catch (e) {
  fs.writeFileSync(path.join(MEDIA, 'v1.mp4'), Buffer.from('dummy-video'));
}
fs.writeFileSync(path.join(MEDIA, 'c1.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

function todayYmdTz() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}
function mondayKeyOf(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function shiftDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const THIS_MON = mondayKeyOf(todayYmdTz());
const NEXT_MON = shiftDays(THIS_MON, 7);
// 15:00 almacenado: cae en el día elegido tanto en UTC como en ART.
const at = (ymd) => `${ymd} 15:00:00`;
// ISO UTC de las 13:00 = 10:00 ART del mismo día.
const isoAt = (ymd) => `${ymd}T13:00:00.000Z`;

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function register(email) {
  const rr = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234', business_name: 'Test ' + email }),
  });
  const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
  return { status: rr.status, cookie: cookies.map((c) => c.split(';')[0]).join('; ') };
}
async function api(cookie, method, p, body) {
  const rr = await fetch(BASE + p, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}

(async () => {
  console.log(`— FRENO-REINTENTO-CUPO (semana del lunes ${THIS_MON}; la que viene ${NEXT_MON})`);
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, MEDIA_DIR: MEDIA, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-freno' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'server booteó');
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const seed = (uid, fields) => {
      const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review, week_key, published_at, error)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        uid, fields.image || '/media/v1.mp4', fields.caption, '', fields.when || null,
        fields.status, fields.media || 'video', 0,
        fields.when ? mondayKeyOf(String(fields.when).slice(0, 10)) : THIS_MON,
        fields.published_at || null, fields.error || '');
      return Number(r.lastInsertRowid);
    };

    const u = await register('dueno@example.com');
    ok(u.status === 200 || u.status === 201, `register (${u.status})`);
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('dueno@example.com').id;
    // La zona del usuario manda en quotaFor: se fija a ART (la del
    // fixture) para que la semana medida sea determinista.
    try {
      const upd = db.prepare('UPDATE settings SET timezone = ? WHERE user_id = ?').run(TZ, uid);
      if (!upd.changes) db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?)').run(uid, TZ);
    } catch (e) {}
    const tzRow = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(uid);
    ok(tzRow && tzRow.timezone === TZ, `timezone del usuario fijada a ${TZ}`);

    // ── El escenario del incidente: 695 publicado llena el único reel.
    const p695 = seed(uid, { status: 'published', when: at(THIS_MON), published_at: at(THIS_MON), caption: 'Reel 695 ya publicado' });
    const p742 = seed(uid, { status: 'failed', when: at(shiftDays(THIS_MON, 1)), caption: 'La película (742)', error: 'Meta rechazó el procesamiento del video' });
    const fPatch = seed(uid, { status: 'failed', when: at(shiftDays(THIS_MON, 2)), caption: 'Fallido para reprogramar en su semana', error: 'fallo de red' });
    const fNext = seed(uid, { status: 'failed', when: at(shiftDays(THIS_MON, 3)), caption: 'Fallido para reprogramar a la que viene', error: 'fallo de red' });
    const fOld = seed(uid, { status: 'failed', when: at(shiftDays(THIS_MON, -1)), caption: 'Fallido de la semana pasada', error: 'fallo viejo' });
    const pNext = seed(uid, { status: 'published', when: at(NEXT_MON), published_at: at(NEXT_MON), caption: 'Publicado de la semana que viene' });
    const dNew = seed(uid, { status: 'draft', when: null, caption: 'Borrador de video nuevo, nunca programado' });

    // A: el cupo de reels de ESTA semana está lleno por el 695.
    const q = await api(u.cookie, 'GET', '/api/quota');
    ok(q.status === 200 && q.data && q.data.reels && q.data.reels.used === 1 && q.data.reels.left === 0,
      `A el cupo de reels está lleno por el 695 (used ${q.data && q.data.reels && q.data.reels.used}, left ${q.data && q.data.reels && q.data.reels.left})`);

    // B: el reintento del 742 (fallido de esta semana) NO rebota.
    const rB = await api(u.cookie, 'POST', `/api/posts/${p742}/publish-now`, {});
    ok(rB.status === 200 && rB.data && rB.data.ok === true && rB.data.status === 'publishing',
      `B publish-now del 742 fallido → 200 publishing, SIN plan_limit (status ${rB.status})`);

    // C: un posteo NUEVO distinto sí sigue frenado por el cupo.
    const rC = await api(u.cookie, 'POST', `/api/posts/${dNew}/publish-now`, {});
    ok(rC.status === 403 && rC.data && rC.data.plan_limit === true,
      `C publish-now de un borrador de video nuevo → 403 plan_limit (status ${rC.status})`);
    const rowNew = db.prepare('SELECT status FROM posts WHERE id = ?').get(dNew);
    ok(rowNew.status === 'draft', 'C el borrador nuevo quedó como borrador (no salió)');

    // D: el camino feliz no cambia.
    const sImg = seed(uid, { status: 'scheduled', when: at(shiftDays(THIS_MON, 5)), media: 'image', image: '/media/c1.png', caption: 'Foto programada de la semana' });
    const dImg = seed(uid, { status: 'draft', when: null, media: 'image', image: '/media/c1.png', caption: 'Borrador de foto con cupo disponible' });
    const rD1 = await api(u.cookie, 'POST', `/api/posts/${sImg}/publish-now`, {});
    ok(rD1.status === 200 && rD1.data && rD1.data.ok === true,
      `D1 publish-now de un programado → 200 como siempre (status ${rD1.status})`);
    const rD2 = await api(u.cookie, 'POST', `/api/posts/${dImg}/publish-now`, {});
    ok(rD2.status === 200 && rD2.data && rD2.data.ok === true,
      `D2 publish-now de un borrador con cupo disponible → 200 como siempre (status ${rD2.status})`);

    // E: el fallido de la semana PASADA no hereda: ocupa un lugar de hoy.
    const rE = await api(u.cookie, 'POST', `/api/posts/${fOld}/publish-now`, {});
    ok(rE.status === 403 && rE.data && rE.data.plan_limit === true,
      `E publish-now de un fallido de la semana pasada → 403 plan_limit (status ${rE.status})`);

    // F: reprogramar el fallido a OTRO día de SU misma semana hereda.
    const rF = await api(u.cookie, 'PATCH', `/api/posts/${fPatch}`, { scheduled_at: isoAt(shiftDays(THIS_MON, 4)) });
    ok(rF.status === 200 && rF.data && rF.data.ok === true,
      `F PATCH del fallido a otro día de su semana → 200, SIN plan_limit (status ${rF.status})`);
    const rowF = db.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').get(fPatch);
    ok(rowF.status === 'scheduled' && String(rowF.scheduled_at).slice(0, 10) === shiftDays(THIS_MON, 4),
      `F el fallido quedó programado en su semana (${rowF.scheduled_at})`);

    // G: reprogramarlo a la semana que viene SÍ se cobra (y está llena).
    const rG = await api(u.cookie, 'PATCH', `/api/posts/${fNext}`, { scheduled_at: isoAt(shiftDays(NEXT_MON, 2)) });
    ok(rG.status === 403 && rG.data && rG.data.plan_limit === true && rG.data.week_key === NEXT_MON,
      `G PATCH del fallido a la semana que viene (llena) → 403 plan_limit con week_key ${NEXT_MON} (status ${rG.status}, vino ${rG.data && rG.data.week_key})`);
    const rowG = db.prepare('SELECT status FROM posts WHERE id = ?').get(fNext);
    ok(rowG.status === 'failed', 'G el fallido quedó fallido (no se programó a otra semana sin cupo)');
  } catch (e) {
    fails++;
    console.error('  ✗ excepción:', e.message);
    console.error(srvLog.slice(-1500));
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n${total - fails}/${total} OK${fails ? ` — ${fails} FALLOS` : ''}`);
  process.exit(fails ? 1 : 0);
})();
