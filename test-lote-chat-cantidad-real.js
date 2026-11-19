// test-lote-chat-cantidad-real.js — LOTE v923 CHAT-CANTIDAD-REAL
// REGLA DE VERDAD: Posty nunca anuncia una cantidad que no verificó
// contra los posteos realmente creados. La prueba entrega 1 posteo por
// día (la semana dice «salen uno por uno, día por día»): el día 1 solo
// el primero está listo; los otros dos llegan uno por día.
// El mensaje de bienvenida cuenta los posteos REALMENTE PROGRAMADOS
// (scheduleAllDrafts), NUNCA los importados.
//
// Parte A: unit — welcomeGuestMessage con db stub (ES/EN, 3/2/1/0).
// Parte B: integración — bootea release/server.js y corre el flujo real
//   de /api/guest/start con trial_cache sembrado:
//   B1 completa (3 programados) → mensaje del veredicto, nunca «3 posteos»
//   B2 parcial (1 programado) → «tu primer posteo está listo», sin prometer los otros dos
//   B3 gate retiene todo (0 programados) → el chat no anuncia posteos que no existen
//   B4 orden — el mensaje se emite DESPUÉS de importar + programar y
//        recibe el conteo programado (nSched), no el importado (nImp)
// Parte C: boot — /api/version v923 5/5, 0 errores, puerto libre al matar.
//
// Uso: node test-lote-chat-cantidad-real.js  (desde release/)
// Sale 0 si todo pasa, 1 si algo falla.
'use strict';
// node_modules vive en ~/workspace/posta (release/ no lo lleva): el
// servidor hijo lo resuelve vía NODE_PATH, como en los lotes anteriores.
process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = 34996;
const BASE = `http://127.0.0.1:${PORT}`;
const TRIAL_TEST_KEY = 'test-v923-suite';
const tmpDir = '/tmp/v923-suite-' + process.pid;

let pass = 0, fail = 0;
const results = [];
function t(name, cond, extra) {
  if (cond) { pass++; results.push(`PASS ${name}`); }
  else { fail++; results.push(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function has(s, sub) { return String(s || '').includes(sub); }

// ---------------- Parte A: unit sobre welcomeGuestMessage ----------------
const guestTrial = require(path.join(ROOT, 'guest-trial.js'));
function welcomeText(opts) {
  const captured = [];
  const dbStub = { prepare: () => ({ run: (uid, text) => { captured.push(text); } }) };
  const ok = guestTrial.welcomeGuestMessage(dbStub, 1, opts);
  return { ok, text: captured[0] || '' };
}
{
  const a = welcomeText({ lang: 'es', business: 'Veja', nPosts: 3 });
  t('A1 ES 3 → (re-pin PUERTA-NUEVA) mensaje del modelo: plan + los 3 reales en la semana + el primero sale mañana 19:00', has(a.text, 'tu semana ya está planeada') && has(a.text, 'los 3 posteos de tu prueba en tu semana') && has(a.text, 'tu primer posteo sale mañana a las 19:00'), a.text);
  t('A1 ES 3 → (re-pin PUERTA-NUEVA) nunca dados por publicados ni «ya están en tu feed» (el conteo real sí se dice: están en su semana, programados)', !/ya están en tu feed|ya salieron|ya están publicados|ya armé tus primeros/.test(a.text), a.text);
  const b = welcomeText({ lang: 'en', business: 'Veja', nPosts: 3 });
  t('A2 EN 3 → (re-pin PUERTA-NUEVA) model message: plan + all 3 real posts in the week + first out tomorrow 7:00 PM', has(b.text, 'your week is already planned') && has(b.text, 'all 3 trial posts are in your week') && has(b.text, 'your first post goes out tomorrow at 7:00 PM'), b.text);
  t('A2 EN 3 → never «first 3 posts» / «already in your feed»', !/first 3 posts|already in your feed|i just made your first/.test(b.text), b.text);
  const c = welcomeText({ lang: 'es', business: 'Veja', nPosts: 1 });
  t('A3 ES 1 → (re-pin PUERTA-NUEVA) «ya está tu primer posteo en tu semana» y sale mañana', has(c.text, 'ya está tu primer posteo en tu semana') && has(c.text, 'sale mañana a las 19:00'), c.text);
  t('A3 ES 1 → no promete los otros dos', !has(c.text, 'los otros dos') && !has(c.text, 'llega mañana') && !/3 posteos/.test(c.text), c.text);
  const d = welcomeText({ lang: 'es', business: 'Veja', nPosts: 2 });
  t('A4 ES 2 → (re-pin PUERTA-NUEVA) los 2 reales en la semana + el primero sale mañana', has(d.text, 'ya están 2 posteos de tu prueba en tu semana') && has(d.text, 'tu primer posteo sale mañana a las 19:00'), d.text);
  t('A4 ES 2 → no dice «los otros dos»', !has(d.text, 'los otros dos'), d.text);
  const e = welcomeText({ lang: 'es', business: 'Veja', nPosts: 0 });
  t('A5 ES 0 → no afirma ningún posteo', !has(e.text, 'posteo está listo') && !/posteos/.test(e.text), e.text);
  t('A5 ES 0 → (re-pin PUERTA-NUEVA) avisa el modelo sin prometer el instante', has(e.text, 'estamos armando tu semana') && has(e.text, 'las piezas se cargan durante el día') && has(e.text, 'tu primer posteo sale mañana a las 19:00'), e.text);
  const f = welcomeText({ lang: 'en', business: 'Veja', nPosts: 0 });
  // La promesa futura («i'll let you know when…») NO es afirmar que ya
  // está listo: el 0 no debe llevar ninguna forma de entrega («from your
  // real product», «take a look», «arrive…»).
  t('A6 EN 0 → no post claimed', !/from your real product|take a look|arrive one per day|arrives tomorrow/.test(f.text) && has(f.text, "we're building your week") && has(f.text, 'the pieces load during the day') && has(f.text, 'your first post goes out tomorrow at 7:00 PM'), f.text);
  const g = welcomeText({ lang: 'es', business: '', nPosts: 3 });
  t('A7 ES 3 sin marca → sin «undefined»', !has(g.text, 'undefined') && has(g.text, 'tu semana ya está planeada') && has(g.text, 'los 3 posteos de tu prueba en tu semana'), g.text);
  t('A8 inserta en chat (db stub)', a.ok === true, String(a.ok));
}

// ---------------- Parte B: integración con servidor real ----------------
function jpegBuf(kb) {
  const b = Buffer.alloc(kb * 1024, 0);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  return b;
}
function payloadFor(ig, business, n, imgKb) {
  const posts = [];
  for (let i = 0; i < n; i++) {
    posts.push({
      type: 'image',
      image: 'data:image/jpeg;base64,' + jpegBuf(imgKb).toString('base64'),
      caption: `Posteo de prueba número ${i + 1} para el negocio ${business}: un café de especialidad tostado en casa que se sirve cada mañana con mucho cariño.`,
      hashtags: '#cafe #especialidad #suite',
      headline: ['Café de la mañana', 'Tostado en casa', 'El ritual del café'][i % 3],
      style: 'foto', style_name: 'foto', text_mode: 'text',
    });
  }
  return {
    ok: true, engine: 25, lang: 'es', business, ig, category: 'cafetería',
    posts,
    design: { posts: posts.map((p) => ({ headline: p.headline, style: 'foto', kind: 'foto' })) },
  };
}
function seed(ig, payload) {
  const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
  db.prepare(`INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)`).run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function chatOf(ig) {
  const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
  const u = db.prepare(`SELECT id FROM users WHERE guest_ig = ?`).get(ig);
  if (!u) { db.close(); return { userId: null, posts: [], chat: [] }; }
  const posts = db.prepare(`SELECT id, status, needs_review FROM posts WHERE user_id = ?`).all(u.id);
  const chat = db.prepare(`SELECT role, text FROM chat_messages WHERE user_id = ? ORDER BY id`).all(u.id);
  db.close();
  return { userId: u.id, posts, chat };
}
async function guestStart(ig, domain, device) {
  const r = await fetch(BASE + '/api/guest/start?test_key=' + TRIAL_TEST_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ig, domain, device, lang: 'es' }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-v923', SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  const kill = async () => {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
  };
  try {
    // Parte C: boot 5/5 (hasta 60 s de espera al primer /api/version)
    let versionOk = 0, build = '';
    for (let i = 0; i < 60 && versionOk < 5; i++) {
      try {
        const r = await fetch(BASE + '/api/version');
        const j = await r.json();
        if (r.ok && j && j.build) { versionOk++; build = j.build; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t('C1 boot /api/version 5/5', versionOk === 5, `ok=${versionOk} build=${build}`);
    t('C2 build (re-pin PUERTA-NUEVA) es el del aterrizaje v1182', String(build).includes('v1182'), build);
    if (versionOk < 5) {
      console.log('LOG:', log.slice(-2000));
      console.log(results.join('\n'));
      console.log(`\ntest-lote-chat-cantidad-real: ${pass} pass, ${fail} fail`);
      await kill();
      process.exit(1);
    }

    // B1: completa — 3 posteos buenos → 3 programados → mensaje del veredicto
    seed('suite3', payloadFor('suite3', 'SuiteTres', 3, 12));
    const r1 = await guestStart('suite3', 'suitetres.com', 'suite-dev-3');
    const d1 = chatOf('suite3');
    const msg1 = (d1.chat.find((m) => m.role === 'assistant') || {}).text || '';
    const sched1 = d1.posts.filter((p) => p.status === 'scheduled').length;
    t('B1 respuesta posts:3 scheduled:3', r1.body.posts === 3 && r1.body.scheduled === 3, JSON.stringify(r1.body));
    t('B1 DB: 3 programados (verificado)', sched1 === 3, `scheduled=${sched1}`);
    t('B1 mensaje = (re-pin PUERTA-NUEVA) el modelo: plan + los 3 reales + el primero sale mañana', has(msg1, 'tu semana ya está planeada') && has(msg1, 'los 3 posteos de tu prueba en tu semana') && has(msg1, 'tu primer posteo sale mañana a las 19:00'), msg1);
    t('B1 mensaje (re-pin PUERTA-NUEVA) nunca los da por publicados ni en el feed', !/ya están en tu feed|ya salieron|ya están publicados|primeros 3/.test(msg1), msg1);

    // B2: parcial — 1 posteo → 1 programado → solo el primero, sin prometer los otros
    seed('suite1', payloadFor('suite1', 'SuiteUno', 1, 12));
    const r2 = await guestStart('suite1', 'suiteuno.com', 'suite-dev-1');
    const d2 = chatOf('suite1');
    const msg2 = (d2.chat.find((m) => m.role === 'assistant') || {}).text || '';
    t('B2 respuesta posts:1 scheduled:1', r2.body.posts === 1 && r2.body.scheduled === 1, JSON.stringify(r2.body));
    t('B2 mensaje dice solo el primero', has(msg2, 'ya está tu primer posteo en tu semana') && !has(msg2, 'los otros dos') && !has(msg2, 'llega mañana') && !/2 posteos|3 posteos/.test(msg2), msg2);
    t('B2 mensaje nunca dice 3', !/3 posteos|primeros 3/.test(msg2), msg2);

    // B3: gate retiene todo — 3 importados, 0 programados → el chat no anuncia posteos
    seed('suite0', payloadFor('suite0', 'SuiteCero', 3, 1));
    const r3 = await guestStart('suite0', 'suitecero.com', 'suite-dev-0');
    const d3 = chatOf('suite0');
    const msg3 = (d3.chat.find((m) => m.role === 'assistant') || {}).text || '';
    t('B3 respuesta posts:3 scheduled:0', r3.body.posts === 3 && r3.body.scheduled === 0, JSON.stringify(r3.body));
    t('B3 DB: 0 programados (verificado)', d3.posts.filter((p) => p.status === 'scheduled').length === 0, JSON.stringify(d3.posts.map((p) => p.status)));
    t('B3 mensaje no afirma ningún posteo', !has(msg3, 'posteo está listo') && !/posteos/.test(msg3), msg3);
    t('B3 mensaje (re-pin PUERTA-NUEVA) avisa el modelo sin prometer el instante', has(msg3, 'estamos armando tu semana') && has(msg3, 'las piezas se cargan durante el día') && has(msg3, 'tu primer posteo sale mañana a las 19:00'), msg3);

    // B4: orden — el mensaje se emite DESPUÉS de importar + programar, con el conteo programado
    const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const iSched = src.indexOf('scheduleAllDrafts(g.userId)');
    const iMsg = src.indexOf('welcomeGuestMessage(db, g.userId');
    t('B4 orden: programar antes que el mensaje', iSched > 0 && iMsg > iSched, `sched@${iSched} msg@${iMsg}`);
    t('B4 el mensaje recibe nSched, no nImp', /welcomeGuestMessage\(db, g\.userId, \{[^}]*nPosts: nSched/.test(src), '');
    t('B4 no queda «nPosts: nImp» en guest/start', !/welcomeGuestMessage\(db, g\.userId, \{[^}]*nPosts: nImp/.test(src), '');

    // Parte C: errores de boot
    const errs = (log.match(/Error/g) || []).length;
    t('C3 boot sin errores', errs === 0, `Error occurrences: ${errs}`);
  } finally {
    await kill();
  }

  console.log(results.join('\n'));
  console.log(`\ntest-lote-chat-cantidad-real: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
