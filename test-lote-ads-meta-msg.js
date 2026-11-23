// test-lote-ads-meta-msg.js — SUITE DEL LOTE ADS-META-MSG
//
// El defecto (captura del dueño, 2026-11-23): el impulso frena en la
// resolución de la cuenta de Instagram (ig_no_resuelto /
// ig_conflicto en meta_ads.js) y la tarjeta del cliente muestra solo
// el genérico «Meta no aceptó la campaña.», porque la respuesta 409
// solo adjuntaba meta_msg cuando el error traía metaError.user_msg
// de Meta — y estos frenos son errores PROPIOS, sin metaError,
// aunque su mensaje ya es el motivo honesto redactado para el
// cliente (y ya quedaba guardado en ad_boosts.error).
//
// El arreglo (server.js, rama !cr.campaignId del impulsar y su
// espejo !crD.campaignId del destacado): con código de freno de
// resolución, meta_msg se puebla con el mensaje del error (≤300).
// Los frenos frenan igual: no se crea nada ni se cobra nada.
//
// Uso: node test-lote-ads-meta-msg.js [--keep]
//      ADSMSG_CONTROL=1 ADSMSG_TREE=<árbol base> → reproduce la
//      tarjeta genérica de la captura (sin meta_msg en los frenos).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SUITE_DIR = __dirname;
const DIR = process.env.ADSMSG_TREE || SUITE_DIR;
const CONTROL = process.env.ADSMSG_CONTROL === '1';
const KEEP = process.argv.includes('--keep');
const PORT = 35447;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = `/tmp/adsmsg-${CONTROL ? 'control-' : ''}${process.pid}`;
const STUB_LOG = path.join(DATA_DIR, 'meta-calls.jsonl');

const FRENO_TXT = 'No se pudo verificar la cuenta de Instagram dueña del posteo MEDIA_FRENO en la cuenta publicitaria (ni el dueño del medio ni la Instagram de la Página pudieron leerse): el impulso se frenó antes de crear el aviso, sin mandar ningún id sin verificar.';
const CONF_TXT = 'La cuenta de Instagram dueña del posteo (@casa.test (555001)) no está entre las cuentas que la cuenta publicitaria puede usar (@otra.cuenta (888001)): el impulso se frenó antes de crear el aviso.';
const META_USER_MSG = 'Agregá un método de pago a tu cuenta publicitaria para crear la campaña.';

let pass = 0, fail = 0; const fails = [];
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name); console.log('  ✗ FALLO:', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function seedDb(fn) {
  const { DatabaseSync } = require('node:sqlite');
  let lastErr = null;
  for (let i = 0; i < 30; i++) {
    try {
      const db = new DatabaseSync(path.join(DATA_DIR, 'posta.db'));
      const out = fn(db);
      db.close();
      return out;
    } catch (e) { lastErr = e; const t = Date.now(); while (Date.now() - t < 120) {} }
  }
  throw lastErr || new Error('seedDb sin resultado');
}

function reqFactory(jar) {
  return async function (method, p, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (jar.cookie) headers.Cookie = jar.cookie;
    const res = await fetch(BASE + p, {
      method, headers, redirect: 'manual',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs || 30000),
    });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of sc) { const pair = c.split(';')[0]; if (pair) jar.cookie = pair; }
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, json, text };
  };
}

const readLog = () => {
  try { return fs.readFileSync(STUB_LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); }
  catch (e) { return []; }
};

async function main() {
  console.log(`\n=== SUITE LOTE ADS-META-MSG ${CONTROL ? '(CONTROL: base sin el lote)' : ''} ===`);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // ---------- A) Estática ----------
  console.log('\n[A] Estática');
  const serverSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
  const patron = /code === 'ig_no_resuelto' \|\| (crD?Error)\.code === 'ig_conflicto'\)\)\s*\n?\s*\? String\(\1\.message \|\| ''\)\.slice\(0, 300\)/;
  if (!CONTROL) {
    ok(patron.test(serverSrc), 'A1 el impulsar puebla meta_msg con el mensaje del freno de resolución');
    const segDest = serverSrc.slice(serverSrc.indexOf("app.post('/api/destacado/impulsar'"), serverSrc.indexOf("app.get('/api/destacado/reporte'"));
    ok(/crDError\.code === 'ig_no_resuelto'/.test(segDest) && /String\(crDError\.message/.test(segDest), 'A2 el destacado (espejo) puebla meta_msg con el mensaje del freno');
    const segImp = serverSrc.slice(serverSrc.indexOf("app.post('/api/ads/billetera/impulsar'"), serverSrc.indexOf("app.post('/api/ads/topup'"));
    ok(/crError\.code === 'ig_no_resuelto'/.test(segImp) && /String\(crError\.message/.test(segImp), 'A3 el segmento del impulsar lleva el arreglo en su rama !cr.campaignId');
  } else {
    ok(!/code === 'ig_no_resuelto'/.test(serverSrc), 'CONTROL A1 la base no conoce el arreglo (los frenos no alimentan meta_msg)');
  }
  ok(appSrc.includes("gzT('Meta no aceptó la campaña.', 'Meta didn’t accept the campaign.') + (beMM.metaMsg ? ' ' + beMM.metaMsg : '')"),
    'A4 la tarjeta ya sabe pintar meta_msg bajo el genérico (app.js intacto)');

  // ---------- Boot ----------
  console.log('\n[boot] server real (Graph stubbeado), DATA_DIR=' + DATA_DIR);
  const env = {
    ...process.env,
    PORT: String(PORT), DATA_DIR,
    NODE_OPTIONS: '--require ' + path.join(SUITE_DIR, 'test-lote-ads-meta-msg.stub.js'),
    META_STUB_AUTOINSTALL: '1', META_STUB_LOG: STUB_LOG,
    META_FLB_CONFIG_ID: 'CFG_TEST_123', META_FLB_APP_ID: 'APP_TEST', META_FLB_APP_SECRET: 'SECRET_TEST',
    IG_APP_ID: 'APP_TEST', IG_APP_SECRET: 'SECRET_TEST',
    META_ADS_TOKEN: 'TOKEN_' + 'POSTY_STUB',
    STRIPE_SECRET_KEY: 'sk_' + 'test_stub_adsmsg_123456',
    ADMIN_TOKEN: 'adm_' + 'test_adsmsg_123456',
    DESTACADO_BOOST_ENABLED: '1',
    OPENAI_API_KEY: 'sk-' + 'stub-adsmsg',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  child.stdout.on('data', d => { serverLog += d; });
  child.stderr.on('data', d => { serverLog += d; });
  let booted = false;
  for (let i = 0; i < 90 && !booted; i++) {
    await sleep(1000);
    try {
      const r = await fetch(BASE + '/api/version', { signal: AbortSignal.timeout(2000) });
      const j = await r.json();
      if (j && j.build) { console.log('  build:', j.build); booted = true; }
    } catch (e) {}
    if (child.exitCode !== null) break;
  }
  ok(booted, 'el server bootea con la DB de prueba');
  if (!booted) { console.log(serverLog.slice(-3000)); throw new Error('sin boot'); }

  async function registerAndSeed(email, suat) {
    const jar = {};
    const req = reqFactory(jar);
    const r = await req('POST', '/api/auth/register', { name: 'Test', email, password: 'clave-larga-123' });
    if (r.status !== 200) throw new Error('register ' + email + ' → ' + r.status + ' ' + r.text.slice(0, 200));
    const uid = seedDb(db => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id);
    seedDb(db => {
      db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token, demo_mode) VALUES (?, '555001', 'IG_LONG', 0) ON CONFLICT(user_id) DO UPDATE SET ig_user_id = '555001', ig_access_token = 'IG_LONG', demo_mode = 0").run(uid);
      db.prepare("INSERT INTO profiles (user_id, ig_username) VALUES (?, 'casa.test') ON CONFLICT(user_id) DO UPDATE SET ig_username = 'casa.test'").run(uid);
      db.prepare("INSERT INTO ig_ads_connections (user_id, suat, client_business_id, config_id, ig_account_ids, ig_accounts, fb_page_id, fb_page_name, ad_accounts, primary_ad_account_id, ad_currency, status, connected_at) VALUES (?, ?, 'BIZ900', 'CFG_TEST_123', '[\"555001\"]', '[]', '555111', 'Página Cliente', '[]', '777001', 'USD', 'connected', datetime('now'))").run(uid, suat);
      db.prepare("UPDATE users SET stripe_customer_id = 'cus_test' WHERE id = ?").run(uid);
    });
    return { jar, req, uid };
  }
  const seedPost = (uid, media) => seedDb(db => db.prepare("INSERT INTO posts (user_id, image_path, caption, status, ig_media_id, week_key) VALUES (?, '/img/test.jpg', 'Posteo pauta', 'published', ?, '2026-W46')").run(uid, media).lastInsertRowid);

  try {
    const FRENO = await registerAndSeed('freno@adsmsg.test', 'SUAT_FRENO');
    const frenoPost = seedPost(FRENO.uid, 'MEDIA_FRENO');
    const CONF = await registerAndSeed('conf@adsmsg.test', 'SUAT_CONF');
    const confPost = seedPost(CONF.uid, 'MEDIA_CONF');
    const META = await registerAndSeed('meta@adsmsg.test', 'SUAT_META');
    const metaPost = seedPost(META.uid, 'MEDIA_META');

    // ---------- B) Freno ig_no_resuelto en el impulsar ----------
    console.log('\n[B] Impulso frenado por ig_no_resuelto (riel cliente)');
    const rB = await FRENO.req('POST', '/api/ads/billetera/impulsar', { posteoId: Number(frenoPost), montoUSD: 20 });
    ok(rB.status === 409 && rB.json && rB.json.motivo === 'anuncio_fallido', 'B1 el freno frena igual: 409 anuncio_fallido');
    if (!CONTROL) {
      ok(rB.json && rB.json.meta_msg === FRENO_TXT, 'B2 meta_msg trae el motivo honesto del freno, entero (≤300)');
    } else {
      ok(rB.json && !('meta_msg' in rB.json), 'CONTROL B2 la base responde SIN meta_msg: la tarjeta queda genérica (la captura del dueño)');
    }
    ok(readLog().filter(c => c.method === 'POST' && /\/campaigns$/.test(c.path) && c.token === 'SUAT_FRENO').length === 0,
      'B3 el freno no creó nada en Meta (cero POST de campaña con su token)');
    const rowB = seedDb(db => db.prepare('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ? ORDER BY id DESC').get(FRENO.uid, Number(frenoPost)));
    ok(rowB && rowB.status === 'error' && String(rowB.error || '').includes('No se pudo verificar la cuenta de Instagram dueña del posteo'),
      'B4 el registro ad_boosts.error ya guardaba el mismo motivo (la verdad existía, no llegaba a la tarjeta)');
    ok(seedDb(db => db.prepare('SELECT COUNT(*) n FROM ad_transactions WHERE user_id = ?').get(FRENO.uid).n) === 0,
      'B5 no se cobró ni se debitó nada');

    // ---------- C) Freno ig_conflicto en el impulsar ----------
    console.log('\n[C] Impulso frenado por ig_conflicto (riel cliente)');
    const rC = await CONF.req('POST', '/api/ads/billetera/impulsar', { posteoId: Number(confPost), montoUSD: 20 });
    ok(rC.status === 409 && rC.json && rC.json.motivo === 'anuncio_fallido', 'C1 el conflicto frena igual: 409 anuncio_fallido');
    if (!CONTROL) {
      ok(rC.json && rC.json.meta_msg === CONF_TXT, 'C2 meta_msg trae el motivo del conflicto, con las dos cuentas');
    } else {
      ok(rC.json && !('meta_msg' in rC.json), 'CONTROL C2 la base responde SIN meta_msg también en el conflicto');
    }
    ok(readLog().filter(c => c.method === 'POST' && /\/campaigns$/.test(c.path) && c.token === 'SUAT_CONF').length === 0,
      'C3 el conflicto tampoco creó nada en Meta');

    // ---------- D) Rechazo genuino de Meta (comportamiento intacto) ----------
    console.log('\n[D] Rechazo genuino de Meta en la creación');
    const rD = await META.req('POST', '/api/ads/billetera/impulsar', { posteoId: Number(metaPost), montoUSD: 20 });
    ok(rD.status === 409 && rD.json && rD.json.motivo === 'anuncio_fallido', 'D1 el rechazo de Meta frena igual: 409 anuncio_fallido');
    ok(rD.json && rD.json.meta_msg === META_USER_MSG, 'D2 meta_msg sigue siendo el error_user_msg de Meta, como hoy');
    ok(readLog().filter(c => c.method === 'POST' && /\/campaigns$/.test(c.path) && c.token === 'SUAT_META').length === 1,
      'D3 en este caso la creación SÍ llegó a Meta (un solo POST de campaña)');

    // ---------- E) Espejo: destacado ----------
    console.log('\n[E] El espejo del destacado con el mismo freno');
    const rE = await FRENO.req('POST', '/api/destacado/impulsar', { posteoId: Number(frenoPost), montoUSD: 20 });
    ok(rE.status === 409 && rE.json && rE.json.motivo === 'anuncio_fallido', 'E1 el destacado frena igual: 409 anuncio_fallido');
    if (!CONTROL) {
      ok(rE.json && rE.json.meta_msg === FRENO_TXT, 'E2 el destacado también devuelve el motivo en meta_msg');
    } else {
      ok(rE.json && !('meta_msg' in rE.json), 'CONTROL E2 la base tampoco adjunta meta_msg en el destacado');
    }

    // ---------- F) La tarjeta pinta el motivo bajo el genérico ----------
    console.log('\n[F] Render de la tarjeta (pzBoostErrorHTML real de app.js)');
    const iFn = appSrc.indexOf('function pzBoostErrorHTML');
    const iFin = appSrc.indexOf('// Pinta el error guardado', iFn);
    ok(iFn > 0 && iFin > iFn, 'F1 la función de la tarjeta se extrajo del bundle servido');
    const fnSrc = appSrc.slice(iFn, iFin);
    const fabricar = (metaMsg) => {
      const pzBoostState = { boostError: { motivo: 'anuncio_fallido', metaMsg, igDuena: '', igConexion: [] } };
      const gzT = (es) => es;
      const esc = (s) => String(s);
      const pzBoostMotivo = () => 'MOTIVO';
      const fn = new Function('pzBoostState', 'gzT', 'esc', 'pzBoostMotivo', fnSrc + '\nreturn pzBoostErrorHTML;');
      return fn(pzBoostState, gzT, esc, pzBoostMotivo);
    };
    const htmlCon = fabricar(FRENO_TXT)('anuncio_fallido', 20, null);
    ok(htmlCon.includes('Meta no aceptó la campaña. ' + FRENO_TXT), 'F2 con meta_msg, la tarjeta muestra el genérico + el motivo real');
    ok(htmlCon.includes('No se cobró nada.'), 'F3 la garantía de no-cobro sigue en la tarjeta');
    const htmlSin = fabricar('')('anuncio_fallido', 20, null);
    ok(htmlSin.includes('Meta no aceptó la campaña.') && !htmlSin.includes('No se pudo verificar'),
      'F4 sin meta_msg la tarjeta queda solo con el genérico (el estado de la captura)');
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(800);
    try { child.kill('SIGKILL'); } catch (e) {}
    if (!KEEP && !process.env.ADSMSG_KEEP) { try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) {} }
  }

  console.log(`\n=== RESULTADO: ${pass} ok · ${fail} MAL ===`);
  if (fails.length) { console.log('Fallos:', fails.join(' | ')); process.exit(1); }
}

main().catch(e => { console.error('ERROR SUITE:', e); process.exit(2); });
