// test-lote-texto-coherencia.js — LOTE TEXTO-COHERENCIA (L5+L6+L8 del
// diagnóstico de la corrida Veja #6). Lo que la prueba DICE tiene que
// hablar de la pieza real y en el idioma de la marca:
//  L5 · el porqué de cada posteo se computa con el ancla DE ESE posteo
//       (no digest.productos[0]); la importación conserva el porqué de
//       la generación; el backfill de GET /api/posts pasa la guarda
//       sinMuestra para posteos de la prueba (sin foto↔producto
//       persistida, no se afirma «muestra X»).
//  L6 · las líneas fijas del chat del invitado salen en el idioma de
//       la MARCA (contentLangOf vía chatGuestBrandLang): la pregunta
//       del posteo de hoy (siembra del GET), las líneas del handler
//       POST, y el fallback que el invitado realmente VE — el texto de
//       error del cliente (app.js), gobernado por el fixed_lang que el
//       GET devuelve (su POST lo frena la hoja de cuenta). Registrado
//       sin cambios.
//  L8 · la bienvenida afirma «from your real product» solo si alguna
//       pieza ENTREGADA salió con foto real de producto (photo_source
//       real-product / real-product-brand), no solo por estrella en el
//       digest.
// Modo CONTROL (TC_CONTROL=1, correr dentro del árbol base v1008):
// reproduce los tres comportamientos viejos.
// Uso: node test-lote-texto-coherencia.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const CONTROL = process.env.TC_CONTROL === '1';
const PORT = 35131;
const BASE = `http://127.0.0.1:${PORT}`;
const TRIAL_TEST_KEY = 'test-tc-suite';
const tmpDir = '/tmp/tc-suite-' + process.pid;
const ENGINE = require(path.join(ROOT, 'demo')).DEMO_ENGINE_V;
const analysisEngine = require(path.join(ROOT, 'analysis-engine'));

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + extra : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);

// ---------- Parte A: estática (solo release) ----------
if (!CONTROL) {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const ae = fs.readFileSync(path.join(ROOT, 'analysis-engine.js'), 'utf8');
  t('A1 BUILD del árbol (v1013 del aterrizaje)', src.includes("const BUILD_ID = '20261105-v1013';"));
  t('A2 whyForPost lee el ancla propia del posteo',
    ae.includes('post.anchor || post.digest_anchor || post.photo_product || post.source_topic || post.topic'));
  t('A3 chatGuestBrandLang existe y gobierna GET (pregunta) y POST (FT)',
    src.includes('function chatGuestBrandLang(uid)') &&
    src.includes("(chatGuestBrandLang(uid) || langOfUser(uid)) === 'en'") &&
    src.includes('const guestBrandLang = chatGuestBrandLang(uidChat);'));
  t('A4 backfill pasa sinMuestra fail-closed para source=trial',
    src.includes("{ sinMuestra: r.source === 'trial' }"));
  t('A5 la importación conserva el porqué de la generación (strategy_why)',
    src.includes('carousel_paths, strategy_why) VALUES') && src.includes("String(p.why || '').slice(0, 500)"));
  t('A6 el sitio de caché también pasa la guarda (sinMuestra: true)',
    src.includes('cachedOut.digest || null, { sinMuestra: true }'));
  t('A7 L8: el claim de bienvenida exige foto real entregada',
    src.includes("sp.photo_source === 'real-product' || sp.photo_source === 'real-product-brand'") &&
    src.includes('if (!anyRealProduct) welcomeProductoReal = false;'));
  t('A8 las líneas fijas del POST tienen variante EN gobernada por FT',
    src.includes("FT('no pude escuchar tu audio") && src.includes("FT('Uh, me trabé un segundo") &&
    src.includes("FT('Contanos tu idea', 'Tell me your idea')"));
  t('A9 el GET del chat devuelve fixed_lang del invitado (contrato con el cliente)',
    src.includes('fixed_lang: chatGuestBrandLang(uid)'));
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  t('A10 app.js: guarda fixed_lang y el error del envío sale en el idioma de la marca',
    app.includes('window.__pzFixedLang = (r && r.fixed_lang) || null') &&
    app.includes("i couldn't answer, try again in a bit") &&
    app.includes("window.__pzFixedLang === 'en'"));
  const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  t('A11 index ES sirve app.js?v=696', idx.includes('app.js?v=696'));
}

// ---------- Parte B: whyForPost en unidad ----------
{
  const digest = { productos: [{ nombre: 'Salar' }, { nombre: 'The Atlas' }], servicios: [] };
  const anEn = { lang: 'en', findings: [] };
  const wAtlas = analysisEngine.whyForPost({ tipo: 'promo', anchor: 'The Atlas' }, anEn, digest, {});
  const wGuard = analysisEngine.whyForPost({ tipo: 'promo', anchor: 'The Atlas' }, anEn, digest, { sinMuestra: true });
  const wLegacy = analysisEngine.whyForPost({ tipo: 'promo' }, anEn, digest, {});
  const wTopic = analysisEngine.whyForPost({ tipo: 'promo', source_topic: 'Esplar' }, { lang: 'es', findings: [] }, digest, {});
  if (!CONTROL) {
    t('B1 ancla propia: el posteo del Atlas dice Atlas (no Salar)',
      has(wAtlas, 'shows The Atlas') && !has(wAtlas, 'Salar'), wAtlas);
    t('B3 sin ancla propia: cae a la del digest como siempre',
      has(wLegacy, 'shows Salar'), wLegacy);
    t('B4 source_topic también es ancla propia (ES)',
      has(wTopic, 'muestra Esplar') && !has(wTopic, 'Salar'), wTopic);
  } else {
    t('B1c CONTROL ancla propia ignorada: dice la del digest (Salar)',
      has(wAtlas, 'shows Salar') && !has(wAtlas, 'The Atlas'), wAtlas);
    t('B3c CONTROL sin ancla: digest (Salar), igual que release',
      has(wLegacy, 'shows Salar'), wLegacy);
    t('B4c CONTROL source_topic ignorado: dice Salar',
      has(wTopic, 'muestra Salar') && !has(wTopic, 'Esplar'), wTopic);
  }
  t('B2 sinMuestra suprime el claim en ambos modos',
    !/shows|muestra/i.test(String(wGuard || '')), wGuard);
}

// ---------- Parte C: integración ----------
function imgDataUri() {
  const buf = fs.readFileSync(path.join(ROOT, 'public', 'siembra-nails', 'tira-nails-1.jpg'));
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}
const CAPS = [
  'The Atlas sneaker in organic cotton canvas, built on natural rubber from the Amazon rainforest for daily wear.',
  'Salar, our low sneaker in chrome-free leather with a recycled lining: quiet design that goes with everything.',
  'Small steps, honest materials. Stitched by people who sign their work, in sizes for the whole family.',
];
function payloadFor(ig, opts) {
  const o = opts || {};
  const img = imgDataUri();
  const posts = CAPS.map((caption, i) => ({
    type: 'image', image: img, caption, hashtags: '#tc #suite',
    headline: ['Atlas', 'Salar', 'Taller'][i], style: 'foto', style_name: 'foto', text_mode: 'text',
    ...(o.whys && o.whys[i] ? { why: o.whys[i] } : {}),
  }));
  return {
    ok: true, engine: ENGINE, lang: 'es', business: 'Veja TC', ig, category: 'sneakers',
    posts,
    design: { posts: posts.map((pp, i) => ({ headline: pp.headline, style: 'foto', kind: 'foto', photo_source: (o.photoSources || [])[i] })) },
    digest: { business: 'Veja TC', productos: [{ nombre: 'The Atlas' }, { nombre: 'Salar' }], servicios: [], ciudad: '', post_lang: 'en' },
    content_lang: 'en',
  };
}
function dbOpen() { return new DatabaseSync(path.join(tmpDir, 'posta.db')); }
function seed(ig, payload) {
  const db = dbOpen();
  db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function cookieOf(res) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return sc.map((c) => c.split(';')[0]).join('; ');
}
async function guestStart(ig) {
  const r = await fetch(BASE + '/api/guest/start?test_key=' + TRIAL_TEST_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ig, lang: 'es' }),
  });
  const j = await r.json().catch(() => ({}));
  return { r, j, cookie: cookieOf(r) };
}
// Una zona donde AHORA ya pasaron las 9:00 (para la siembra del posteo de hoy).
function pickTzAfter9() {
  const zones = ['Pacific/Kiritimati', 'Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Shanghai', 'Europe/Berlin', 'America/New_York', 'America/Argentina/Buenos_Aires', 'Pacific/Honolulu'];
  for (const tz of zones) {
    try {
      const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()));
      if (h >= 10 && h <= 22) return tz;
    } catch (e) {}
  }
  return 'Pacific/Kiritimati';
}
function ymdIn(tz, d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-tc', SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    t('C0 server booteó', up, log.slice(-400));
    if (!up) return;

    // --- L8 + L5(backfill) + L6: invitado marca EN / visitante ES, semana PÓSTER ---
    seed('invitadotc1', payloadFor('invitadotc1', { photoSources: ['brand-poster', 'brand-poster', 'brand-poster'] }));
    const g1 = await guestStart('invitadotc1');
    t('C1 guest/start ok (3 posteos)', g1.r.status === 200 && g1.j.posts === 3, JSON.stringify(g1.j).slice(0, 200));
    const db = dbOpen();
    const g1User = db.prepare('SELECT id FROM users WHERE guest_ig = ?').get('invitadotc1');
    const welcome1 = db.prepare("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant' ORDER BY id ASC").all(g1User.id).map((m) => m.text).join('\n');
    if (!CONTROL) {
      t('C2 L8 semana póster: la bienvenida NO afirma producto real',
        !has(welcome1, 'from your real product') && !has(welcome1, 'con tu producto real'), welcome1.slice(0, 220));
    } else {
      t('C2c CONTROL semana póster: la bienvenida afirma igual (el bug)',
        has(welcome1, 'from your real product'), welcome1.slice(0, 220));
    }
    // El backfill nace al primer GET /api/posts (los posteos vienen sin why del payload).
    const rP1 = await fetch(BASE + '/api/posts', { headers: { cookie: g1.cookie } });
    const jP1 = await rP1.json().catch(() => ([]));
    const trial1 = (Array.isArray(jP1) ? jP1 : []).filter((p) => p.source === 'trial');
    t('C3 GET /api/posts trae los 3 de la prueba', trial1.length === 3, String(trial1.length));
    if (!CONTROL) {
      t('C4 L5 backfill con guarda: ningún porqué afirma «muestra/shows»',
        trial1.every((p) => !/muestra|shows/i.test(String(p.strategy_why || ''))),
        JSON.stringify(trial1.map((p) => p.strategy_why)));
      t('C5 L5 backfill: el porqué existe y es el honesto (la semana como un todo, en inglés de la marca)',
        trial1.every((p) => has(p.strategy_why, 'part of a week designed as a whole')),
        JSON.stringify(trial1.map((p) => p.strategy_why)));
    } else {
      t('C4c CONTROL backfill sin guarda: el porqué afirma «shows The Atlas» (el bug)',
        trial1.some((p) => has(p.strategy_why, 'shows The Atlas')),
        JSON.stringify(trial1.map((p) => p.strategy_why)));
    }
    // L6 · la pregunta del posteo de hoy en el idioma de la marca.
    const tz = pickTzAfter9();
    const hoy = ymdIn(tz, new Date());
    db.prepare("INSERT INTO settings (user_id, timezone) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone").run(g1User.id, tz);
    db.prepare("INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, scheduled_at, approval, source) VALUES (?, '/media/tc-hoy.jpg', 'Posteo de hoy TC', '#tc', 'scheduled', 'image', 'foto', ?, 'auto', 'trial')")
      .run(g1User.id, hoy + ' 19:00:00');
    db.close();
    const rChat1 = await fetch(BASE + '/api/ideas/chat', { headers: { cookie: g1.cookie } });
    const jChat1 = await rChat1.json().catch(() => ({}));
    const msgs1 = (jChat1.messages || []).map((m) => String(m.text || '')).join('\n');
    if (!CONTROL) {
      t('C6 L6 pregunta de hoy en el idioma de la MARCA (EN, visitante ES)',
        has(msgs1, 'tell me if you want to change anything') && !has(msgs1, 'decime si querés cambiar algo'), msgs1.slice(0, 300));
    } else {
      t('C6c CONTROL pregunta de hoy en el idioma del VISITANTE (ES, el bug)',
        has(msgs1, 'decime si querés cambiar algo'), msgs1.slice(0, 300));
    }
    // L6 · el POST del invitado está frenado por la hoja de cuenta
    // (guestBackstop, ambos modos): las líneas del handler nunca lo
    // sirven — el fallback que VE es el del cliente, gobernado por el
    // fixed_lang que este mismo GET devuelve. Se prueba ese contrato.
    const rAudio1 = await fetch(BASE + '/api/ideas/chat', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: g1.cookie },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'hola' }], audio: 'data:audio/webm;base64,AAAA' }),
    });
    const jAudio1 = await rAudio1.json().catch(() => ({}));
    t('C7 el POST del invitado lo frena la hoja de cuenta (402, ambos modos)',
      rAudio1.status === 402 && jAudio1.guest_account_required === true, rAudio1.status + ' ' + JSON.stringify(jAudio1).slice(0, 120));
    if (!CONTROL) {
      t('C8 L6 el GET devuelve fixed_lang=en para el invitado de marca EN',
        jChat1.fixed_lang === 'en', JSON.stringify({ fixed_lang: jChat1.fixed_lang }));
    } else {
      t('C8c CONTROL el GET no trae fixed_lang (el cliente no tenía señal de marca)',
        !jChat1.fixed_lang, JSON.stringify({ fixed_lang: jChat1.fixed_lang }));
    }

    // --- L8: semana CON foto real de producto → el claim SÍ sale ---
    seed('invitadotc2', payloadFor('invitadotc2', { photoSources: ['real-product', 'brand-poster', 'brand-poster'] }));
    const g2 = await guestStart('invitadotc2');
    const db2 = dbOpen();
    const g2User = db2.prepare('SELECT id FROM users WHERE guest_ig = ?').get('invitadotc2');
    const welcome2 = g2User ? db2.prepare("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant' ORDER BY id ASC").all(g2User.id).map((m) => m.text).join('\n') : '';
    db2.close();
    t('C9 L8 semana con foto real: la bienvenida SÍ afirma producto real (ambos modos)',
      g2.r.status === 200 && has(welcome2, 'from your real product'), (JSON.stringify(g2.j).slice(0, 120)) + ' || ' + welcome2.slice(0, 220));

    // --- L5: la importación conserva el porqué de la generación ---
    const WHY0 = 'Because it shows The Atlas, one of your business strengths, in your visual line.';
    seed('invitadotc3', payloadFor('invitadotc3', { photoSources: ['real-product', 'brand-poster', 'brand-poster'], whys: [WHY0, '', ''] }));
    const g3 = await guestStart('invitadotc3');
    const db3 = dbOpen();
    const g3User = db3.prepare('SELECT id FROM users WHERE guest_ig = ?').get('invitadotc3');
    const whys3 = g3User ? db3.prepare('SELECT strategy_why FROM posts WHERE user_id = ? ORDER BY id ASC').all(g3User.id).map((p) => String(p.strategy_why || '')) : [];
    db3.close();
    if (!CONTROL) {
      t('C10 L5 el posteo importado conserva el porqué de su generación',
        g3.r.status === 200 && whys3[0] === WHY0, JSON.stringify(whys3));
    } else {
      t('C10c CONTROL la importación descarta el porqué (nace vacío, el bug)',
        g3.r.status === 200 && whys3.length === 3 && whys3[0] === '', JSON.stringify(whys3));
    }

    // --- L6: el registrado NO cambia (noAudio en ES en ambos modos) ---
    const rReg = await fetch(BASE + '/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'registrado-tc@example.com', password: 'secreto1' }),
    });
    const regCookie = cookieOf(rReg);
    const rAudioR = await fetch(BASE + '/api/ideas/chat', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: regCookie },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'hola' }], audio: 'data:audio/webm;base64,AAAA' }),
    });
    const jAudioR = await rAudioR.json().catch(() => ({}));
    t('C11 registrado: noAudio en ES como siempre (ambos modos)',
      (rReg.status === 200 || rReg.status === 201) && has(jAudioR.reply, 'no pude escuchar tu audio'),
      rReg.status + ' ' + JSON.stringify(jAudioR).slice(0, 160));
    const r400R = await fetch(BASE + '/api/ideas/chat', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: regCookie },
      body: JSON.stringify({}),
    });
    const j400R = await r400R.json().catch(() => ({}));
    t('C12 registrado: el 400 fijo en ES como siempre (ambos modos)',
      r400R.status === 400 && has(j400R.error, 'Contanos tu idea'), JSON.stringify(j400R));
    const rChatR = await fetch(BASE + '/api/ideas/chat', { headers: { cookie: regCookie } });
    const jChatR = await rChatR.json().catch(() => ({}));
    t('C13 registrado: el GET no fija idioma de marca (fixed_lang vacío, ambos modos)',
      !jChatR.fixed_lang, JSON.stringify({ fixed_lang: jChatR.fixed_lang }));
  } finally {
    try { process.kill(srv.pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    try { process.kill(srv.pid, 'SIGKILL'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n${CONTROL ? 'CONTROL' : 'RELEASE'}: ${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
