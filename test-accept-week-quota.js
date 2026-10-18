// test-accept-week-quota.js — Regresión del fix 2026-10-18 (v215):
// el cupo al ACEPTAR se evalúa contra la semana DEL POSTEO (lun–dom de su
// fecha destino), no contra la semana actual ni un contador global.
// Escenario tipo cuenta 12: semana actual 5/5 programados (Esencial) +
// borradores propuestos para la semana que viene. Antes del fix, aceptar
// el del lunes 19 devolvía 403 plan_limit (el modal de tope) aunque la
// semana que viene estaba fresca. Después: acepta y confirma su fecha;
// un 6º de la MISMA semana sí devuelve plan_limit con week_key de esa
// semana; accept-all respeta la misma regla por semana.
// Uso: node test-accept-week-quota.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-weekquota-'));
const PORT = 18745;
const BASE = `http://127.0.0.1:${PORT}`;
const TZ = 'America/Argentina/Buenos_Aires';

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
  console.log(`— Cupo por semana del posteo (esta semana lunes ${THIS_MON}; la que viene ${NEXT_MON})`);
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken215' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'server booteó');
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const seedPost = (uid, status, when, caption) => {
      const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review, week_key)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(uid, '/media/test.jpg', caption || 'Posteo de prueba', '', when || null, status, 'image', 0, when ? mondayKeyOf(String(when).slice(0, 10)) : THIS_MON);
      return Number(r.lastInsertRowid);
    };
    const uidOf = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    // 15:00 UTC = 12:00 ART: la fecha almacenada cae en el día elegido en ambas zonas.
    const at = (ymd) => `${ymd} 15:00:00`;
    const isoAt = (ymd) => `${ymd}T13:00:00.000Z`; // 10:00 ART

    // ── Usuario A: 5/5 esta semana + borrador lunes que viene + borrador 6º esta semana
    const uA = await register('a@example.com');
    ok(uA.status === 200 || uA.status === 201, `register A (${uA.status})`);
    const uidA = uidOf('a@example.com');
    for (let i = 0; i < 5; i++) seedPost(uidA, 'scheduled', at(shiftDays(THIS_MON, i)), 'Programado ' + (i + 1));
    const dNext = seedPost(uidA, 'draft', null, 'Borrador lunes que viene');
    const dSixth = seedPost(uidA, 'draft', null, 'Borrador sexto de esta semana');

    // A1: aceptar el del lunes 19 (semana que viene) con esta semana llena
    const r1 = await api(uA.cookie, 'PATCH', `/api/posts/${dNext}`, { scheduled_at: isoAt(NEXT_MON) });
    ok(r1.status === 200 && r1.data && r1.data.ok, `A1 aceptar borrador de la semana que viene NO salta plan_limit (status ${r1.status})`);
    ok(r1.data && r1.data.week_key === NEXT_MON, `A1 la respuesta confirma week_key ${NEXT_MON} (vino ${r1.data && r1.data.week_key})`);
    ok(r1.data && String(r1.data.scheduled_at || '').slice(0, 10) === NEXT_MON, `A1 la respuesta confirma la fecha destino ${NEXT_MON} (vino ${r1.data && r1.data.scheduled_at})`);
    const rowNext = db.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').get(dNext);
    ok(rowNext.status === 'scheduled' && String(rowNext.scheduled_at).slice(0, 10) === NEXT_MON, 'A1 el posteo quedó programado en su fecha');

    // A2: un 6º de la MISMA semana sí es tope verdadero
    const r2 = await api(uA.cookie, 'PATCH', `/api/posts/${dSixth}`, { scheduled_at: isoAt(shiftDays(THIS_MON, 5)) });
    ok(r2.status === 403 && r2.data && r2.data.plan_limit === true, `A2 el 6º de la misma semana devuelve plan_limit (status ${r2.status})`);
    ok(r2.data && r2.data.week_key === THIS_MON, `A2 el 403 trae week_key de ESTA semana ${THIS_MON} (vino ${r2.data && r2.data.week_key})`);
    const rowSixth = db.prepare('SELECT status FROM posts WHERE id = ?').get(dSixth);
    ok(rowSixth.status === 'draft', 'A2 el 6º quedó como borrador (no se programó)');

    // ── Usuario B: 5/5 esta semana + 2 borradores → accept-all a la semana que viene
    const uB = await register('b@example.com');
    const uidB = uidOf('b@example.com');
    for (let i = 0; i < 5; i++) seedPost(uidB, 'scheduled', at(shiftDays(THIS_MON, i)), 'Programado B' + (i + 1));
    const b1 = seedPost(uidB, 'draft', null, 'B1');
    const b2 = seedPost(uidB, 'draft', null, 'B2');
    const r3 = await api(uB.cookie, 'POST', '/api/posts/accept-all', {
      items: [
        { id: b1, scheduled_at: isoAt(NEXT_MON) },
        { id: b2, scheduled_at: isoAt(shiftDays(NEXT_MON, 1)) },
      ],
    });
    ok(r3.status === 200 && r3.data && r3.data.accepted === 2, `B accept-all acepta los 2 de la semana que viene (status ${r3.status}, accepted ${r3.data && r3.data.accepted})`);
    ok(r3.data && r3.data.next_week === 2, `B la respuesta marca next_week=2 (vino ${r3.data && r3.data.next_week})`);

    // ── Usuario C: 4/5 esta semana + 3 borradores con fechas de ESTA semana → solo cabe 1
    const uC = await register('c@example.com');
    const uidC = uidOf('c@example.com');
    for (let i = 0; i < 4; i++) seedPost(uidC, 'scheduled', at(shiftDays(THIS_MON, i)), 'Programado C' + (i + 1));
    const c1 = seedPost(uidC, 'draft', null, 'C1 viernes');
    const c2 = seedPost(uidC, 'draft', null, 'C2 sábado');
    const c3 = seedPost(uidC, 'draft', null, 'C3 domingo');
    const r4 = await api(uC.cookie, 'POST', '/api/posts/accept-all', {
      items: [
        { id: c1, scheduled_at: isoAt(shiftDays(THIS_MON, 4)) },
        { id: c2, scheduled_at: isoAt(shiftDays(THIS_MON, 5)) },
        { id: c3, scheduled_at: isoAt(shiftDays(THIS_MON, 6)) },
      ],
    });
    ok(r4.status === 200 && r4.data && r4.data.accepted === 1 && r4.data.partial === true && r4.data.total === 3,
      `C accept-all de la misma semana acepta solo el que cabe (accepted ${r4.data && r4.data.accepted}, partial ${r4.data && r4.data.partial}, total ${r4.data && r4.data.total})`);

    // ── Usuario D: crear directo programado a la semana que viene con esta semana llena
    const uD = await register('d@example.com');
    const uidD = uidOf('d@example.com');
    for (let i = 0; i < 5; i++) seedPost(uidD, 'scheduled', at(shiftDays(THIS_MON, i)), 'Programado D' + (i + 1));
    const r5 = await api(uD.cookie, 'POST', '/api/posts', {
      image_path: '/media/test.jpg', caption: 'Directo a la semana que viene', scheduled_at: isoAt(NEXT_MON), media_type: 'image',
    });
    ok(r5.status === 200 && r5.data && r5.data.ok, `D crear programado a la semana que viene NO salta plan_limit (status ${r5.status})`);
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
