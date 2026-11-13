// test-lote-c11-chat-idioma-marca.js — LOTE C11 · EL CHAT DE LA PRUEBA
// HABLA EL IDIOMA DE LA MARCA (BUILD provisorio v1001 sobre v1000)
//
// Diagnóstico (Veja #5, §2.5): la bienvenida del chat de la prueba salió
// en español con voseo para una marca en inglés porque la gobernaba el
// idioma del VISITANTE (body.lang / Accept-Language en guest/start),
// cuando el idioma de la marca ya estaba en el mismo handler (payload
// content_lang). Misma familia: el «why» de los posteos quedó en español.
//
// Verifica:
//  Parte A (unit): whyForPost cambia de idioma SOLO por analysis.lang —
//    el mecanismo que analysisForBrandLang gobierna.
//  Parte B (estática): los 6 puntos de cableado en server.js (bienvenida,
//    reply de set-ig, 3 why de generación, backfill de /api/posts) y el
//    BUILD del lote.
//  Parte C (integración, server real):
//    C-EN marca EN + visitante ES → bienvenida EN sin voseo; why EN.
//    C-ES marca ES + visitante EN → bienvenida ES; why ES.
//    C-SIN marca sin señal → fallback declarado: idioma del visitante.
//    C-IG set-ig: el reply del chat sale en el idioma de la marca.
//  Modo control (C11_CONTROL=1, contra el árbol base): las expectativas
//    de C-EN/C-ES/C-IG se INVIERTEN — el bug se reproduce (bienvenida y
//    reply en el idioma del visitante; why en español por default).
//
// Uso: node test-lote-c11-chat-idioma-marca.js   (desde la raíz del árbol)
// Sale 0 si todo pasa, 1 si algo falla.
'use strict';
process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const CONTROL = process.env.C11_CONTROL === '1';
const PORT = 35011;
const BASE = `http://127.0.0.1:${PORT}`;
const TRIAL_TEST_KEY = 'test-c11-suite';
const tmpDir = '/tmp/c11-suite-' + process.pid;
const BUILD_ESPERADO = CONTROL ? 'v1000' : 'v1001';

let pass = 0, fail = 0;
const results = [];
function t(name, cond, extra) {
  if (cond) { pass++; results.push(`PASS ${name}`); }
  else { fail++; results.push(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function has(s, sub) { return String(s || '').includes(sub); }
const VOSEO = /querés|tocá |mirá|decime|vení|elegí/;

// ---------------- Parte A: mecanismo whyForPost ----------------
{
  const ae = require(path.join(ROOT, 'analysis-engine.js'));
  const digest = { productos: [{ nombre: 'Esplar' }], servicios: [] };
  const post = { tipo: 'foto', formato: 'image', salesIntent: '', porque: '' };
  const whyEs = ae.whyForPost(post, { lang: 'es', findings: [] }, digest);
  const whyEn = ae.whyForPost(post, { lang: 'en', findings: [] }, digest);
  t('A1 whyForPost con analysis.lang=es → «Porque muestra»', has(whyEs, 'Porque muestra Esplar'), String(whyEs));
  t('A2 whyForPost con analysis.lang=en → «Because it shows»', has(whyEn, 'Because it shows Esplar'), String(whyEn));
}

// ---------------- Parte B: estática del cableado ----------------
if (!CONTROL) {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  t('B1 helpers del lote definidos', /function trialPayloadBrandLang\(payload\)/.test(src) && /function analysisForBrandLang\(analysis, brandLang\)/.test(src));
  t('B2 bienvenida usa el idioma de la marca del payload', /const welcomeLang = trialPayloadBrandLang\(payload\) \|\| lang;/.test(src) && /welcomeGuestMessage\(db, g\.userId, \{ lang: welcomeLang,/.test(src));
  t('B3 set-ig: el reply usa el idioma de la marca', /\(trialPayloadBrandLang\(payload\) \|\| lang\) === 'en'/.test(src));
  t('B4 why de generación (JSON) gobernado por contentLang', /analysisForBrandLang\(trialAnalysisJson, contentLang\)/.test(src));
  t('B5 why de generación (stream) gobernado por contentLangS', /analysisForBrandLang\(trialAnalysis, contentLangS\)/.test(src));
  t('B6 why de generación (stream cache) gobernado por el payload', /analysisForBrandLang\(cachedOut\.analysis, trialPayloadBrandLang\(cachedOut\)\)/.test(src));
  t('B7 backfill: guarda invitado + source trial + contentLangOf', /guestAcct && r\.source === 'trial'/.test(src) && /const guestWhyLang = guestAcct \? contentLangOf\(uid\) : null;/.test(src));
  t('B8 BUILD provisorio del lote', src.includes("const BUILD_ID = '20261105-v1001';"));
}

// ---------------- Parte C: integración ----------------
function jpegBuf(kb) {
  const b = Buffer.alloc(kb * 1024, 0);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  return b;
}
function payloadFor({ ig, business, uiLang, brandLang, star, captions }) {
  const posts = captions.map((caption, i) => ({
    type: 'image',
    image: 'data:image/jpeg;base64,' + jpegBuf(12).toString('base64'),
    caption,
    hashtags: '#suite #c11',
    headline: ['Uno', 'Dos', 'Tres'][i % 3],
    style: 'foto', style_name: 'foto', text_mode: 'text',
  }));
  const p = {
    ok: true, engine: 25, lang: uiLang, business, ig, category: 'cafetería',
    posts,
    design: { posts: posts.map((pp) => ({ headline: pp.headline, style: 'foto', kind: 'foto' })) },
    digest: { business, productos: [{ nombre: star }], servicios: [], ciudad: '' },
  };
  if (brandLang) { p.content_lang = brandLang; p.digest.post_lang = brandLang; }
  return p;
}
function seed(ig, payload) {
  const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
  db.prepare(`INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)`).run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function dbRead(fn) {
  const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
  try { return fn(db); } finally { db.close(); }
}
function guestByIg(ig) {
  return dbRead((db) => db.prepare(`SELECT id FROM users WHERE guest_ig = ?`).get(ig));
}
function chatOf(userId) {
  return dbRead((db) => db.prepare(`SELECT role, text FROM chat_messages WHERE user_id = ? ORDER BY id`).all(userId));
}
function whysOf(userId) {
  return dbRead((db) => db.prepare(`SELECT strategy_why FROM posts WHERE user_id = ?`).all(userId).map((r) => r.strategy_why || ''));
}
function cookieOf(res) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return sc.map((c) => c.split(';')[0]).join('; ');
}
async function guestStart(body, cookie) {
  const r = await fetch(BASE + '/api/guest/start?test_key=' + TRIAL_TEST_KEY, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: cookieOf(r) };
}
async function getPosts(cookie) {
  const r = await fetch(BASE + '/api/posts', { headers: { cookie } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const CAP_EN = [
  'Esplar sneakers, handcrafted in Brazil with organic cotton and wild rubber from the Amazon rainforest, made to last for years of daily wear.',
  'Our Esplar line pairs chrome-free leather with recycled lining: a quiet design that goes with everything you already own and love.',
  'Small steps, honest materials. The Esplar is stitched by people who sign their work, in sizes for the whole family, all year round.',
];
const CAP_ES = [
  'Medialuna de manteca recién horneada, hojaldre de verdad y el café de especialidad de siempre: la merienda que el barrio ya conoce de memoria.',
  'Nuestra medialuna de manteca sale tibia a las nueve, con la masa madre que fermenta desde la noche anterior en la cocina de atrás.',
  'Café de especialidad, tortas caseras y la vereda al sol: así se desayuna en esta esquina desde hace más de veinte años, sin apuro.',
];

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-c11', SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const srvPid = srv.pid;
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  const kill = async () => {
    try { process.kill(srvPid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
  };
  try {
    let versionOk = 0, build = '';
    for (let i = 0; i < 60 && versionOk < 5; i++) {
      try {
        const r = await fetch(BASE + '/api/version');
        const j = await r.json();
        if (r.ok && j && j.build) { versionOk++; build = j.build; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t('C0 boot /api/version 5/5', versionOk === 5, `ok=${versionOk} build=${build}`);
    t('C0 build del árbol esperado', String(build).includes(BUILD_ESPERADO), build);
    if (versionOk < 5) {
      console.log('LOG:', log.slice(-2000));
      console.log(results.join('\n'));
      console.log(`\ntest-lote-c11: ${pass} pass, ${fail} fail`);
      await kill();
      process.exit(1);
    }

    // ---- C-EN: marca EN, visitante ES ----
    seed('c11en', payloadFor({ ig: 'c11en', business: 'Veja Suite', uiLang: 'es', brandLang: 'en', star: 'Esplar', captions: CAP_EN }));
    const rEn = await guestStart({ ig: 'c11en', domain: 'c11en.com', device: 'c11-dev-en', lang: 'es' });
    t('C-EN guest/start ok', rEn.status === 200 && rEn.body.posts === 3, JSON.stringify(rEn.body).slice(0, 200));
    const uEn = guestByIg('c11en');
    const msgEn = ((chatOf(uEn.id).find((m) => m.role === 'assistant') || {}).text) || '';
    if (!CONTROL) {
      t('C-EN bienvenida en el idioma de la MARCA (en)', has(msgEn, 'your first post is ready'), msgEn.slice(0, 160));
      t('C-EN bienvenida SIN voseo ni español', !VOSEO.test(msgEn) && !has(msgEn, 'tu primer posteo'), msgEn.slice(0, 160));
    } else {
      t('C-EN CONTROL: la bienvenida sale en el idioma del VISITANTE (es, bug)', has(msgEn, 'tu primer posteo está listo') && VOSEO.test(msgEn), msgEn.slice(0, 160));
    }
    const gpEn = await getPosts(rEn.cookie);
    t('C-EN GET /api/posts ok', gpEn.status === 200 && Array.isArray(gpEn.body) && gpEn.body.length === 3, `status=${gpEn.status} n=${Array.isArray(gpEn.body) ? gpEn.body.length : '?'}`);
    const whysEn = whysOf(uEn.id).filter(Boolean);
    t('C-EN los 3 posteos tienen why guardado', whysEn.length === 3, JSON.stringify(whysEn).slice(0, 200));
    if (!CONTROL) {
      t('C-EN why en el idioma de la MARCA (en)', whysEn.some((w) => has(w, 'Because it shows Esplar')) && !whysEn.some((w) => has(w, 'Porque muestra')), JSON.stringify(whysEn).slice(0, 220));
    } else {
      t('C-EN CONTROL: el why sale en español (bug)', whysEn.some((w) => has(w, 'Porque muestra Esplar')), JSON.stringify(whysEn).slice(0, 220));
    }

    // ---- C-ES: marca ES, visitante EN ----
    seed('c11es', payloadFor({ ig: 'c11es', business: 'Café Suite', uiLang: 'en', brandLang: 'es', star: 'Medialuna de manteca', captions: CAP_ES }));
    const rEs = await guestStart({ ig: 'c11es', domain: 'c11es.com', device: 'c11-dev-es', lang: 'en' });
    t('C-ES guest/start ok', rEs.status === 200 && rEs.body.posts === 3, JSON.stringify(rEs.body).slice(0, 200));
    const uEs = guestByIg('c11es');
    const msgEs = ((chatOf(uEs.id).find((m) => m.role === 'assistant') || {}).text) || '';
    if (!CONTROL) {
      t('C-ES bienvenida en el idioma de la MARCA (es)', has(msgEs, 'tu primer posteo está listo'), msgEs.slice(0, 160));
      t('C-ES bienvenida NO en inglés', !has(msgEs, 'your first post is ready'), msgEs.slice(0, 160));
      const gpEs = await getPosts(rEs.cookie);
      t('C-ES GET /api/posts ok', gpEs.status === 200, `status=${gpEs.status}`);
      const whysEs = whysOf(uEs.id).filter(Boolean);
      t('C-ES why en el idioma de la MARCA (es)', whysEs.some((w) => has(w, 'Porque muestra Medialuna de manteca')) && !whysEs.some((w) => has(w, 'Because it shows')), JSON.stringify(whysEs).slice(0, 220));
    } else {
      t('C-ES CONTROL: la bienvenida sale en el idioma del VISITANTE (en, bug)', has(msgEs, 'your first post is ready'), msgEs.slice(0, 160));
    }

    // ---- C-SIN: marca sin señal → fallback = visitante ----
    if (!CONTROL) {
      seed('c11sin', payloadFor({ ig: 'c11sin', business: 'Sin Señal', uiLang: 'en', brandLang: null, star: 'Tarta de ricota', captions: CAP_EN }));
      const rSin = await guestStart({ ig: 'c11sin', domain: 'c11sin.com', device: 'c11-dev-sin', lang: 'en' });
      t('C-SIN guest/start ok', rSin.status === 200 && rSin.body.posts === 3, JSON.stringify(rSin.body).slice(0, 200));
      const uSin = guestByIg('c11sin');
      const msgSin = ((chatOf(uSin.id).find((m) => m.role === 'assistant') || {}).text) || '';
      t('C-SIN sin señal de marca → bienvenida en el idioma del visitante (en)', has(msgSin, 'your first post is ready'), msgSin.slice(0, 160));
      await getPosts(rSin.cookie);
      const whysSin = whysOf(uSin.id).filter(Boolean);
      t('C-SIN why por la escalera de la casa (users.lang del invitado = en)', whysSin.some((w) => has(w, 'Because it shows Tarta de ricota')), JSON.stringify(whysSin).slice(0, 220));
    }

    // ---- C-IG: set-ig con marca EN, invitado creado en ES ----
    seed('c11ig', payloadFor({ ig: 'c11ig', business: 'Ig Suite', uiLang: 'es', brandLang: 'en', star: 'Esplar', captions: CAP_EN }));
    const rAnon = await guestStart({ lang: 'es', device: 'c11-dev-ig' });
    t('C-IG invitado sin identidad creado', rAnon.status === 200 && rAnon.body.needs_ig === true, JSON.stringify(rAnon.body).slice(0, 200));
    const rSet = await fetch(BASE + '/api/guest/set-ig', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: rAnon.cookie },
      body: JSON.stringify({ ig: 'c11ig' }),
    });
    const setBody = await rSet.json().catch(() => ({}));
    t('C-IG set-ig ok con posteos', rSet.status === 200 && setBody.posts === 3, JSON.stringify(setBody).slice(0, 200));
    if (!CONTROL) {
      t('C-IG reply del chat en el idioma de la MARCA (en)', has(setBody.reply, 'done! i just built your week'), String(setBody.reply || '').slice(0, 160));
    } else {
      t('C-IG CONTROL: el reply sale en el idioma de la cuenta/visitante (es, bug)', has(setBody.reply, 'ya armé tu semana'), String(setBody.reply || '').slice(0, 160));
    }
    const uIg = guestByIg('c11ig');
    const chatIg = chatOf(uIg.id).map((m) => m.text).join('\n');
    if (!CONTROL) {
      t('C-IG el mensaje quedó en el chat en inglés', has(chatIg, 'done! i just built your week'), chatIg.slice(0, 160));
    }

    const errs = (log.match(/Error/g) || []).length;
    t('C9 boot sin errores fatales', !/FATAL|Cannot find module/.test(log), `Error occurrences: ${errs}`);
  } finally {
    await kill();
  }
  let portFree = false;
  try { await fetch(BASE + '/api/version'); } catch (e) { portFree = true; }
  t('C10 puerto libre tras matar por PID exacto', portFree);

  console.log(results.join('\n'));
  console.log(`\ntest-lote-c11-chat-idioma-marca: ${pass} pass, ${fail} fail${CONTROL ? ' (CONTROL/base)' : ''}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
