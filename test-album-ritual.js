// test-album-ritual.js — v183: ritual semanal de fotos (push + email).
// - albumRitualSweep: AMBOS canales una sola vez por usuario/semana (dedupe
//   pushed_at/emailed_at), gate lunes ~10:00 hora LOCAL de cada usuario,
//   audiencia: opt-out recibe push pero no email; fundador (id tipo dogfood)
//   recibe push pero NO email; trial vencido no recibe nada; misión ya
//   cumplida no se pide; trial vigente sí recibe.
// - UN SOLO EMAIL DE LUNES (2026-10-18): el email del ritual va solo a quien
//   instaló la app (pwa_installed=1); sin app → push sí, email NO (ya recibe
//   el email semanal de scheduler.js con la misma misión de fotos).
// - photoRitualEmail: asunto exacto + CTA directo a ?fotos=semana (fetch stub,
//   jamás sale a Resend de verdad).
// - GET /api/album: week{photos,videos} acierta en 0/2/5 y respeta el borde
//   de semana (domingo anterior y lunes siguiente NO cuentan).
// - Front: albumWeekState (los 3 estados, textos exactos), el botón de subida
//   vive DENTRO de #albumWeekBlock, el deep link ?fotos= enfoca el bloque.
// - Sin traba: /api/week/ensure responde OK para un usuario con 0 fotos.
// In-process con DATA_DIR temporal. Sin IA paga.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-ritual-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18753';
process.env.BASE_URL = 'http://127.0.0.1:18753';
delete process.env.RESEND_API_KEY;

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

const BASE = 'http://127.0.0.1:18753';
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
// Lunes (YYYY-MM-DD) de la semana de una fecha en una tz — mismo algoritmo
// que mondayKeyOf/tzToday del server, para sembrar sin depender del día real.
function mondayOfInTz(tz, instant) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function shiftYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

(async () => {
  const db = require('./db');
  const srv = require('./server');
  ok(await waitBoot(), 'server booteó');
  ok(typeof srv.albumRitualSweep === 'function', 'albumRitualSweep exportado');

  // ---------- photoRitualEmail: contenido (fetch stub, sin red) ----------
  {
    const email = require('./email');
    process.env.RESEND_API_KEY = 'test-key';
    let captured = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => { captured = { url, body: JSON.parse(opts.body) }; return { ok: true, status: 200, text: async () => '{"id":"x"}' }; };
    const er = await email.photoRitualEmail({ email: 'ana@example.com', name: 'Ana' }, 'https://postyhacetodo.com', 'Sacale una foto a tu plato estrella, así como sale 📸');
    globalThis.fetch = origFetch;
    delete process.env.RESEND_API_KEY;
    ok(er && er.ok, 'photoRitualEmail ok con Resend stub');
    ok(captured && captured.url === 'https://api.resend.com/emails', 'va a la API de Resend');
    ok(captured && captured.body.subject === 'Esta semana, ¿me pasás 3 a 5 fotos de tu negocio? 📸', 'asunto exacto del ritual');
    ok(captured && captured.body.html.includes('https://postyhacetodo.com/#/app/schedule?fotos=semana'), 'CTA directo a la subida (?fotos=semana)');
    ok(captured && captured.body.html.includes('3 a 5 fotos'), 'el cuerpo pide 3 a 5 fotos');
    ok(captured && captured.body.html.includes('Idea de la semana'), 'la idea de la misión convive en el email');
    ok(captured && JSON.stringify(captured.body.to) === '["ana@example.com"]', 'destinatario correcto');
  }

  // ---------- Matriz de audiencia del sweep ----------
  const NOW_REAL = Date.now();
  const ins = db.prepare(`INSERT INTO users (email, password_hash, plan_status, trial_ends_at, trial_extended_until, created_at, email_opt_out, pwa_installed)
    VALUES (?, 'x', ?, ?, 0, ?, ?, ?)`);
  const mk = (email, status, trialEnds, created, oo, pwa) => ins.run(email, status, trialEnds, created, oo, pwa ? 1 : 0).lastInsertRowid;
  const A = mk('a@example.com', 'active', 0, '2026-10-09 12:00:00', 0, 1);            // activo BA con app → push+email
  const B = mk('b@example.com', 'active', 0, '2026-10-09 12:00:00', 0, 1);            // activo NY con app → su 10:00 llega 1 h después
  const C = mk('c@example.com', 'active', 0, '2026-10-09 12:00:00', 0, 0);            // misión ya cumplida → nada
  const D = mk('d@example.com', 'active', 0, '2026-10-09 12:00:00', 1, 0);            // opt-out → push sí, email no
  const E = mk('valentino_bamboo@hotmail.com', 'active', 0, '2026-10-09 12:00:00', 0, 0); // fundador/dogfood → push sí, email NO
  const F = mk('f@example.com', 'trial', NOW_REAL - 86400000, '2026-10-09 12:00:00', 0, 0); // trial vencido → nada
  const G = mk('g@example.com', 'trial', NOW_REAL + 2 * 86400000, '2026-10-16 12:00:00', 0, 1); // trial vigente con app → push+email
  const H = mk('h@example.com', 'active', 0, '2026-10-09 12:00:00', 0, 0);            // activo BA SIN app → push sí, email NO (lo cubre el email semanal)
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?)').run(B, 'America/New_York');
  // C ya subió su foto esta semana (misión cumplida en la semana real actual).
  const wkReal = mondayOfInTz('America/Argentina/Buenos_Aires', new Date());
  db.prepare(`INSERT INTO album_missions (user_id, week_key, mission_tag, mission_text, done_at, photo_id)
    VALUES (?, ?, 'producto', 'Sacale una foto a tu producto estrella 📸', datetime('now'), 1)`).run(C, wkReal);

  const pushSent = [], mailSent = [];
  const pushFn = async (uid, p) => { pushSent.push({ uid, ...p }); return { ok: true, sent: 1 }; };
  const emailFn = async (u, base, missionText) => { mailSent.push({ uid: u.id, email: u.email, base, missionText }); return { ok: true }; };
  const byUid = (arr, uid) => arr.filter((x) => x.uid === uid).length;

  // Lunes 2026-10-19 13:00Z = 10:00 en Buenos Aires, 09:00 en Nueva York.
  let r = await srv.albumRitualSweep({ now: new Date('2026-10-19T13:00:00Z'), pushFn, emailFn });
  ok(r.pushed === 5 && r.emailed === 2, `sweep1 totales: push ${r.pushed} (esp 5), email ${r.emailed} (esp 2)`);
  ok(byUid(pushSent, A) === 1 && byUid(mailSent, A) === 1, 'A (activo BA): push + email');
  ok(byUid(pushSent, H) === 1 && byUid(mailSent, H) === 0, 'H (sin app): push sí, email NO (un solo email de lunes: el semanal)');
  ok(byUid(pushSent, B) === 0 && byUid(mailSent, B) === 0, 'B (NY): todavía no es su 10:00');
  ok(byUid(pushSent, C) === 0 && byUid(mailSent, C) === 0, 'C (misión cumplida): no se le pide');
  ok(byUid(pushSent, D) === 1 && byUid(mailSent, D) === 0, 'D (opt-out): push sí, email no');
  ok(byUid(pushSent, E) === 1 && byUid(mailSent, E) === 0, 'E (fundador/dogfood): push sí, email NO');
  ok(byUid(pushSent, F) === 0 && byUid(mailSent, F) === 0, 'F (trial vencido): nada');
  ok(byUid(pushSent, G) === 1 && byUid(mailSent, G) === 1, 'G (trial vigente): push + email');
  const pA = pushSent.find((x) => x.uid === A);
  ok(pA && pA.url === '/#/app/schedule?fotos=semana', 'el push aterriza en ?fotos=semana');
  ok(pA && /3 a 5/.test(pA.title) && /3 a 5/.test(pA.body), 'el push pide 3 a 5 (título y cuerpo)');
  ok(pA && pA.body.length > 40, 'el push trae la idea de la semana en el cuerpo');
  const mA = mailSent.find((x) => x.uid === A);
  ok(mA && typeof mA.missionText === 'string' && mA.missionText.length > 5, 'el email recibe la idea de la misión');

  // Dedupe: misma ventana, segunda corrida → cero envíos nuevos.
  r = await srv.albumRitualSweep({ now: new Date('2026-10-19T13:00:00Z'), pushFn, emailFn });
  ok(r.pushed === 0 && r.emailed === 0 && pushSent.length === 5 && mailSent.length === 2, 'sweep1 repetido: dedupe semanal (0 nuevos)');

  // 14:00Z = 10:00 en NY (11:00 en BA): solo B, y nadie se repite.
  r = await srv.albumRitualSweep({ now: new Date('2026-10-19T14:00:00Z'), pushFn, emailFn });
  ok(r.pushed === 1 && r.emailed === 1 && byUid(pushSent, B) === 1 && byUid(mailSent, B) === 1, 'sweep2: B recibe en SU 10:00');
  ok(pushSent.length === 6 && mailSent.length === 3, 'totales tras sweep2: 6 push, 3 email');

  // Marcas persistidas por canal.
  const rowOf = (uid) => db.prepare('SELECT pushed_at, emailed_at FROM album_missions WHERE user_id = ?').get(uid);
  ok(rowOf(A) && rowOf(A).pushed_at && rowOf(A).emailed_at, 'A: pushed_at y emailed_at marcados');
  ok(rowOf(D) && rowOf(D).pushed_at && !rowOf(D).emailed_at, 'D: solo pushed_at');
  ok(rowOf(H) && rowOf(H).pushed_at && !rowOf(H).emailed_at, 'H: solo pushed_at (email unificado en el semanal)');
  ok(rowOf(E) && rowOf(E).pushed_at && !rowOf(E).emailed_at, 'E: solo pushed_at (email jamás)');
  ok(!rowOf(F), 'F: ni siquiera se creó la misión (gate de plan)');

  // ---------- GET /api/album: contador de la semana con borde ----------
  async function register(email) {
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'secreto1' }),
    });
    const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
    return { status: rr.status, cookie: cookies.map((c) => c.split(';')[0]).join('; ') };
  }
  const albumOf = async (cookie) => {
    const rr = await fetch(`${BASE}/api/album`, { headers: { Cookie: cookie } });
    return rr.json();
  };
  const insAsset = db.prepare('INSERT INTO assets (user_id, file_path, kind, created_at) VALUES (?, ?, ?, ?)');
  const noon = (ymd) => `${ymd} 12:00:00`; // mediodía UTC = 09:00 BA, mismo día: seguro para bordes

  const u0 = await register('u0@example.com');
  ok(u0.status === 200 || u0.status === 201, `register U0 (${u0.status})`);
  const idOf = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  let alb = await albumOf(u0.cookie);
  ok(alb.ok && alb.week && alb.week.photos === 0 && alb.week.videos === 0, 'U0: semana en 0');
  ok(alb.week.goal_min === 3 && alb.week.goal_max === 5 && /^\d{4}-\d{2}-\d{2}$/.test(alb.week.week_key), 'U0: meta 3–5 y week_key presente');

  const u2 = await register('u2@example.com');
  const id2 = idOf('u2@example.com');
  insAsset.run(id2, '/media/t1.jpg', 'photo', noon(wkReal));                    // lunes de esta semana ✓
  insAsset.run(id2, '/media/t2.jpg', 'photo', noon(shiftYmd(wkReal, 2)));       // miércoles ✓
  insAsset.run(id2, '/media/t3.jpg', 'photo', noon(shiftYmd(wkReal, -1)));      // domingo ANTERIOR ✗
  insAsset.run(id2, '/media/t4.jpg', 'photo', noon(shiftYmd(wkReal, 7)));       // lunes SIGUIENTE ✗
  insAsset.run(id2, '/media/t5.mp4', 'video', noon(shiftYmd(wkReal, 1)));       // video esta semana (plus) ✓
  alb = await albumOf(u2.cookie);
  ok(alb.week.photos === 2, `U2: 2 fotos esta semana (van ${alb.week.photos}) — el borde no cuenta`);
  ok(alb.week.videos === 1, `U2: 1 video como plus (van ${alb.week.videos})`);

  const u5 = await register('u5@example.com');
  const id5 = idOf('u5@example.com');
  for (let i = 0; i < 5; i++) insAsset.run(id5, `/media/u5-${i}.jpg`, 'photo', noon(shiftYmd(wkReal, i)));
  alb = await albumOf(u5.cookie);
  ok(alb.week.photos === 5, `U5: 5 fotos esta semana (van ${alb.week.photos})`);

  // Sin traba: con 0 fotos, el camino de la semana responde (no hay gate nuevo).
  {
    const rr = await fetch(`${BASE}/api/week/ensure`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u0.cookie }, body: '{}',
    });
    const j = await rr.json().catch(() => ({}));
    ok(rr.ok && j && typeof j === 'object', `ensure con 0 fotos responde ok (reason: ${j.reason || '—'})`);
  }

  // ---------- Front: estados, bloque y deep link (estático + función pura) ----------
  const src = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  const mFn = src.match(/function albumWeekState\(n\) \{[\s\S]*?\n\}/);
  ok(!!mFn, 'albumWeekState existe en app.js');
  const albumWeekState = eval(`(${mFn[0]})`);
  ok(albumWeekState(0).key === 'none' && albumWeekState(0).text === 'Todavía no nos pasaste fotos esta semana: Posty crea las imágenes por vos, pero con las tuyas sale tu negocio real.', 'estado 0: texto exacto');
  ok(albumWeekState(1).text === '¡Van 1! Con 3 ya trabajamos bárbaro 📸' && albumWeekState(2).text === '¡Van 2! Con 3 ya trabajamos bárbaro 📸', 'estados 1–2: texto exacto con N');
  ok(albumWeekState(3).key === 'full' && albumWeekState(5).text === '¡Perfecto! Esta semana sale con tus fotos ✨', 'estados 3–5: texto exacto');
  const cardRegion = src.slice(src.indexOf('async function bindAlbumCard'), src.indexOf('async function bindChatView'));
  ok(cardRegion.includes('albumWeekState(wk.photos'), 'la tarjeta usa el estado semanal');
  const blockRegion = src.slice(src.indexOf('const weekBlockHTML'), src.indexOf('const perfHTML'));
  ok(blockRegion.includes('id="albumWeekBlock"'), 'bloque #albumWeekBlock presente');
  ok(blockRegion.includes('id="albumFile"') && blockRegion.includes('Subir fotos o videos'), 'el botón de subida vive DENTRO del bloque');
  ok((cardRegion.match(/Subir fotos o videos/g) || []).length === 1, 'un solo botón de subida en la tarjeta (no duplicado)');
  ok(cardRegion.includes('Idea de la semana'), 'la idea de la misión convive en el bloque');
  ok(src.includes('__albumFocusDone') && src.includes("get('fotos')") && src.includes('scrollIntoView') && src.includes('album-focus'), 'deep link ?fotos= enfoca el bloque (scroll + resaltado)');
  const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
  ok(css.includes('.album-focus') && css.includes('@keyframes albumFocusPulse'), 'styles.css trae .album-focus');
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  ok(html.includes('/app.js?v=153'), 'index.html sirve app.js?v=153');
  ok(html.includes('/styles.css?v=20261017i'), 'index.html sirve styles.css?v=20261017i');
  // Auditoría estática (regla v151): helpers que usa la tarjeta, definidos.
  for (const fn of ['esc', 'mv', 'albumWeekState', 'bindAlbumCard']) {
    ok(new RegExp(`(function\\s+${fn}\\s*\\(|const\\s+${fn}\\s*=|let\\s+${fn}\\s*=)`).test(src), `helper definido: ${fn}`);
  }

  console.log(fails ? `\n✗ ${fails} FALLAS` : '\n✓ TODO OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
