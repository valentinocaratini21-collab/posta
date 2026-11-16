// test-lote-ads-conexion-persiste.js — LOTE ADS-CONEXION-PERSISTE
// ANCLA: 16/11 14:31–14:32 EST, video de la pantalla de Valentino —
// el diálogo FLB completa del lado de Meta («Posty CM has been
// connected to Posty» + Finish) y al volver a la app la pantalla de
// Ads muestra el toast «Meta Ads: Error validating verification
// code. Please make sure your redirect_uri is identical to the one
// you used in the OAuth dialog request» y vuelve a ofrecer
// «Conectar mi cuenta publicitaria»: la conexión NO se guardó.
// MECANISMO (censo sobre v1136, commit 85ca74c1):
//   - El diálogo (buildUnifiedAuth, server.js) compone el
//     redirect_uri con el host del request que abre /api/ig/unified/go
//     y lo persiste en la sesión: req.session.igAdsRedirect — escrito
//     UNA vez y no leído NUNCA en todo el árbol.
//   - El canje (exchangeUnifiedCode, meta_ads.js) armaba el pedido a
//     /oauth/access_token SOLO con client_id + client_secret + code:
//     SIN redirect_uri. Meta exige el redirect_uri byte-idéntico al
//     del diálogo y rechaza el canje; el callback cae a igads=error
//     ANTES de fetchClientAssets y del INSERT en ig_ads_connections:
//     la fila jamás se escribió (confirmado en vivo: el evento
//     ig_ads_connected no existe para ningún usuario).
//   - El flujo de Instagram, que sí funciona, hace lo contrario:
//     persiste req.session.igRedirect al componer y lo pasa a su
//     canje (exchangeCodeForTokens).
// EL LOTE: el callback pasa req.session.igAdsRedirect al canje y el
// canje lo manda como redirect_uri. igAdsRedirect y el state viven
// en la misma sesión y el callback los valida juntos: si el state
// coincide, el redirect guardado ES el del diálogo, byte a byte,
// venga la vuelta por el host que venga (el website y la app viven
// en hosts distintos).
//
// Qué prueba (boot real + Meta simulado por preload que replica la
// regla de Meta: canje sin redirect_uri o con uno distinto del
// diálogo → el error textual de Meta; idéntico → SUAT):
//  A (estático): el canje manda redirect_uri y el callback le pasa
//     el de la sesión; invariantes del flujo de IG y de la fuente de
//     verdad (INSERT + adsReadiness leen la misma tabla).
//  B (boot): usuario con IG conectado → /go compuesto desde el host
//     A (website) → callback servido desde el host B (app), MISMA
//     sesión → [FIX] la vuelta cae igads=ok, el canje que vio Meta
//     lleva el redirect_uri del diálogo byte a byte, la fila queda
//     en ig_ads_connections (cuenta primaria + status ok) y la
//     readiness que lee la pantalla de Ads (recommendations y
//     elegibles, su fuente) responde ads_ready = true.
//  En el control prístino, B-[FIX] falla reproduciendo el caso:
//  igads=error con el mensaje textual de Meta, canje sin
//  redirect_uri, sin fila y ads_ready = false.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-conexion-persiste.js
// (desde release/; para el control, copiar a pristine/ y correr ahí.)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35181;
const IG_USER = 'IGUSER-DE-PRUEBA';

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  FAIL: ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// ---------- A. Estático ----------
console.log('== A. Estático: el canje del login unificado ==');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const MA = fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8');
const iEx = MA.indexOf('async function exchangeUnifiedCode');
t(iEx >= 0, 'A0 exchangeUnifiedCode existe');
const exBody = iEx >= 0 ? MA.slice(iEx, MA.indexOf('\n}\n', iEx)) : '';
t(/exchangeUnifiedCode\(\{ appId, appSecret, code, redirectUri \}\)/.test(exBody), 'A1 [FIX] el canje recibe redirectUri', exBody.slice(0, 160));
t(exBody.includes('redirect_uri: String(redirectUri)'), 'A2 [FIX] el canje manda redirect_uri a Meta', exBody.slice(0, 300));
t(SRV.includes('exchangeUnifiedCode({ appId: c.appId, appSecret: c.appSecret, code, redirectUri: req.session.igAdsRedirect })'), 'A3 [FIX] el callback pasa el redirect_uri persistido en la sesión');
t(SRV.includes('req.session.igAdsRedirect = redirectUri;'), 'A4 [INVARIANTE] buildUnifiedAuth sigue persistiendo el redirect_uri del diálogo en la sesión');
t(SRV.includes('req.session.igRedirect,'), 'A5 [INVARIANTE] el callback de Instagram sigue pasando su igRedirect a su canje');
t(SRV.includes('INSERT INTO ig_ads_connections') && SRV.includes('function getAdsConnection(userId)'), 'A6 [INVARIANTE] la fuente de verdad es una: el callback escribe y adsReadiness lee ig_ads_connections');

// ---------- Meta simulado (preload del boot) ----------
const STUB = `'use strict';
const fs = require('fs');
const realFetch = globalThis.fetch;
const EXPECT = process.env.MOCK_META_EXPECT_FILE || '';
const LOG = process.env.MOCK_META_LOG || '';
function log(o) { try { fs.appendFileSync(LOG, JSON.stringify(o) + '\\n'); } catch (e) {} }
function jres(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
globalThis.fetch = async function (url, opts) {
  const u = String(url && url.url ? url.url : url);
  let p = null; try { p = new URL(u); } catch (e) {}
  const host = p ? p.hostname : ''; const pth = p ? p.pathname : '';
  if (host.includes('facebook.com') || host.includes('instagram.com')) {
    if (pth.endsWith('/oauth/access_token')) {
      const redirectUri = p.searchParams.get('redirect_uri');
      log({ kind: 'exchange', redirect_uri: redirectUri, client_id: p.searchParams.get('client_id'), has_code: !!p.searchParams.get('code') });
      let expected = ''; try { expected = fs.readFileSync(EXPECT, 'utf8').trim(); } catch (e) {}
      if (!redirectUri || redirectUri !== expected) {
        return jres({ error: { message: 'Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request', type: 'OAuthException', code: 100 } }, 400);
      }
      return jres({ access_token: 'SUAT-DE-PRUEBA' });
    }
    if (pth.endsWith('/me/adaccounts')) return jres({ data: [{ id: 'act_123456', account_id: '123456', name: 'Cuenta Publicitaria Test', currency: 'USD', account_status: 1, business: { id: 'BIZ-TEST' } }] });
    if (pth.endsWith('/me/accounts')) return jres({ data: [{ id: 'PAGE-TEST', name: 'Página Test', instagram_business_account: { id: '${IG_USER}' } }] });
    if (/\\/me$/.test(pth)) return jres({ id: 'SUAT-USER', name: 'Integration User' });
    return jres({ data: [] });
  }
  return realFetch(url, opts);
};
`;

function rawReq(port, p, host, cookie) {
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: '127.0.0.1', port, path: p, method: 'GET',
      headers: { ...(host ? { Host: host } : {}), ...(cookie ? { Cookie: cookie } : {}) } }, (res) => {
      let body = ''; res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location || '', text: body }));
    });
    r.on('error', reject); r.end();
  });
}

async function main() {
  console.log('== B. Boot: diálogo desde el host A, callback desde el host B ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-persiste-'));
  const stubPath = path.join(tmpDir, 'stub-meta.js');
  const expectFile = path.join(tmpDir, 'expected-redirect.txt');
  const logFile = path.join(tmpDir, 'meta-log.jsonl');
  fs.writeFileSync(stubPath, STUB);
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), NODE_PATH: NM,
    OPENAI_API_KEY: '', META_ADS_TOKEN: '', META_AD_ACCOUNT_ID: '',
    META_FLB_CONFIG_ID: 'cfg-posty-test',
    META_FLB_APP_ID: 'FBAPP999', META_FLB_APP_SECRET: 'fb-secret-test',
    MOCK_META_EXPECT_FILE: expectFile, MOCK_META_LOG: logFile,
  };
  const child = spawn(process.execPath, ['--require', stubPath, 'server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += String(d); });
  child.stderr.on('data', (d) => { bootLog += String(d); });
  const dataDirAntes = fs.existsSync(path.join(ROOT, 'data'));
  async function req(method, p, body, cookie) {
    const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method, redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let json = null; try { json = JSON.parse(txt); } catch (e) {}
    return { status: r.status, json, text: txt, location: r.headers.get('location') || '', setCookie: r.headers.get('set-cookie') || '' };
  }
  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'B0 el boot levanta', bootLog.slice(-300));
    if (!up) throw new Error('sin boot');

    const reg = await req('POST', '/api/auth/register', { email: 'persiste@test.local', password: 'secreta123' });
    const cookie = String(reg.setCookie).split(';')[0];
    t(!!cookie && reg.status < 300, 'B1 registro con cookie de sesión', String(reg.status));

    // Semilla: el usuario ya tiene su Instagram conectado (settings).
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = path.join(tmpDir, 'posta.db');
    let uid = 0;
    {
      const db = new DatabaseSync(dbPath);
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get('persiste@test.local');
      uid = u ? u.id : 0;
      db.prepare(`INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET ig_user_id = excluded.ig_user_id, ig_access_token = excluded.ig_access_token`)
        .run(uid, IG_USER, 'token-de-prueba');
      db.close();
    }
    t(uid > 0, 'B2 usuario sembrado con IG conectado (settings.ig_user_id)', String(uid));

    // El diálogo se compone desde el HOST A (el website).
    const go = await rawReq(PORT, '/api/ig/unified/go', 'hosta.test', cookie);
    t(go.status === 302 && go.location.includes('facebook.com/v26.0/dialog/oauth'), 'B3 /go desde el host A redirige al diálogo FLB', String(go.status) + ' ' + go.location.slice(0, 120));
    const dlg = new URL(go.location);
    const dialogRedirect = dlg.searchParams.get('redirect_uri') || '';
    const state = dlg.searchParams.get('state') || '';
    t(dialogRedirect === 'https://hosta.test/api/ig/unified/callback', 'B4 el redirect_uri del diálogo es el callback del host A', dialogRedirect);
    t(dlg.searchParams.get('client_id') === 'FBAPP999', 'B5 [INVARIANTE] el diálogo se compone con la app «Posty» (META_FLB_APP_ID)', dlg.searchParams.get('client_id'));
    fs.writeFileSync(expectFile, dialogRedirect);

    // La vuelta la sirve el HOST B (la app): misma sesión, otro host.
    const cb = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(state)}`, 'hostb.test', cookie);
    t(cb.status === 302, 'B6 el callback responde redirect', String(cb.status));
    t(cb.location.includes('igads=ok'), 'B7 [FIX] la vuelta cae igads=ok (conexión guardada)', cb.location.slice(0, 200));

    // Lo que vio Meta en el canje.
    const lines = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const ex = lines.find((l) => l.kind === 'exchange');
    t(!!ex, 'B8 el canje llegó a Meta (simulado)', JSON.stringify(lines).slice(0, 200));
    t(!!ex && ex.redirect_uri === dialogRedirect, 'B9 [FIX] el redirect_uri del canje es byte-idéntico al del diálogo', ex ? String(ex.redirect_uri) : 'sin canje');

    // La fila quedó escrita, clavada al usuario de la sesión.
    {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const row = db.prepare('SELECT * FROM ig_ads_connections WHERE user_id = ?').get(uid);
      t(!!row, 'B10 [FIX] la fila existe en ig_ads_connections', row ? '' : 'sin fila');
      t(!!row && row.primary_ad_account_id === '123456' && row.status === 'ok', 'B11 [FIX] cuenta primaria y status ok', row ? row.primary_ad_account_id + '/' + row.status : '');
      t(!!row && row.suat === 'SUAT-DE-PRUEBA' && row.fb_page_id === 'PAGE-TEST', 'B12 [FIX] SUAT y Página capturados', row ? String(row.suat).slice(0, 20) + '/' + row.fb_page_id : '');
      db.close();
    }

    // La pantalla de Ads lee ads_ready de la misma fuente: conectada.
    const rec = await req('GET', '/api/ads/recommendations', null, cookie);
    t(!!rec.json && rec.json.ads_ready === true, 'B13 [FIX] /api/ads/recommendations responde ads_ready = true', JSON.stringify(rec.json).slice(0, 160));
    const elig = await req('GET', '/api/ads/billetera/elegibles', null, cookie);
    t(!!elig.json && elig.json.ads_ready === true, 'B14 [FIX] /api/ads/billetera/elegibles (la fuente de la pantalla) responde ads_ready = true', JSON.stringify(elig.json).slice(0, 160));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  t(fs.existsSync(path.join(ROOT, 'data')) === dataDirAntes, 'B15 el boot no creó data/ en el árbol');

  console.log(`\nRESULTADO: ${pass} ok · ${fail} mal`);
  if (fails.length) { console.log('FALLAS:\n- ' + fails.join('\n- ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
