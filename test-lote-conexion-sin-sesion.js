// test-lote-conexion-sin-sesion.js — LOTE CONEXIÓN-SIN-SESIÓN
// ANCLA: 16/11 19:22 y 19:25 EST, capturas de Valentino — completó el
// diálogo de Meta dos veces y la vuelta cayó en «La conexión venció 😅»
// las dos veces; 19:43 su orden textual: «necesito que hagas funcionar
// lo de ads!!!».
// MECANISMO (censo sobre v1142, commit c3afe494):
//   - Los callbacks de conexión (Instagram server.js /api/ig/callback y
//     login unificado /api/ig/unified/callback) exigían la cookie de
//     sesión viva y el state guardado EN la sesión (igState /
//     igAdsState). En iOS, el diálogo que se abre desde la app
//     instalada (PWA) vuelve en una vista de Safari que NO comparte
//     esa cookie (la captura de Valentino muestra «◀ Posty CM» sobre
//     la página de vencido): la vuelta llega sin sesión y el guarda
//     da vencido aunque Meta autorizó todo.
// EL LOTE: el state vive TAMBIÉN en la base (tabla oauth_states),
// atado al usuario que compuso el diálogo, con vencimiento de
// 30 min y UN SOLO USO: el callback lo consume en el primer golpe,
// salga bien o mal. Si la vuelta cae sin sesión (o con la sesión
// del mismo dueño sin las claves del flujo), el callback adopta
// usuario, redirect_uri y destino de la fila y la conexión se
// guarda igual. Una fila consumida o vencida (tumba) vence INCLUSO
// a la sesión que sí trae el state: el replay queda rechazado en
// todo contexto. El camino con sesión de siempre no cambia.
//
// Qué prueba (boot real + Meta simulado por preload):
//  A (estático): helpers y tabla existen; ambos callbacks consumen
//     el state en la base; ambos diálogos lo persisten; el guarda
//     de vencido contempla la tumba.
//  B (unificado SIN cookie — el caso Valentino): /go con sesión →
//     callback sin cookie → igads=ok, la fila queda en
//     ig_ads_connections clavada al dueño del state, ads_ready=true,
//     y la respuesta establece sesión en el contexto nuevo.
//  C (replay): el mismo state otra vez, sin cookie Y con la cookie
//     original → «La conexión venció» en ambos (un solo uso).
//  D (camino con sesión intacto): /go y callback con la misma
//     cookie → igads=ok; el segundo uso del mismo state → vencido.
//  E (Instagram SIN cookie): /api/ig/go con sesión → callback sin
//     cookie → NO vencido: settings.ig_user_id queda guardado para
//     el dueño del state; replay sin cookie → vencido.
//  F (state desconocido y state vencido por TTL): vencido honesto
//     en ambos, el vencido por TTL aun con la cookie del dueño.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-conexion-sin-sesion.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35193;
const IG_USER = 'IGUSER-DE-PRUEBA';
const IG_NUEVO = '99887766';

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  FAIL: ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// ---------- A. Estático ----------
console.log('== A. Estático: el state vive en la base ==');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
t(SRV.includes('CREATE TABLE IF NOT EXISTS oauth_states'), 'A1 [FIX] tabla oauth_states');
t(SRV.includes('function saveOAuthState(') && SRV.includes('function takeOAuthState('), 'A2 [FIX] helpers save/take');
t(SRV.includes("saveOAuthState(state, 'ig', req.session.userId"), 'A3 [FIX] el diálogo de Instagram persiste el state');
t(SRV.includes("saveOAuthState(state, 'ig_ads', req.session.userId"), 'A4 [FIX] el diálogo unificado persiste el state');
t(SRV.includes("takeOAuthState(state, 'ig')") && SRV.includes("takeOAuthState(state, 'ig_ads')"), 'A5 [FIX] ambos callbacks consumen el state en la base');
t(SRV.includes('_oauthIgDead || !req.session.userId') && SRV.includes('_oauthAdsDead || !req.session.userId'), 'A6 [FIX] la tumba (consumido/vencido) vence incluso a la sesión');
t(SRV.includes('used_at IS NULL'), 'A7 [FIX] el consumo es atómico (un solo uso real)');

// ---------- Meta simulado (preload del boot) ----------
const STUB = `'use strict';
const fs = require('fs');
const realFetch = globalThis.fetch;
const EXPECT = process.env.MOCK_META_EXPECT_FILE || '';
function jres(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
globalThis.fetch = async function (url, opts) {
  const u = String(url && url.url ? url.url : url);
  let p = null; try { p = new URL(u); } catch (e) {}
  const host = p ? p.hostname : ''; const pth = p ? p.pathname : '';
  if (host.includes('facebook.com')) {
    if (pth.endsWith('/oauth/access_token')) {
      const redirectUri = p.searchParams.get('redirect_uri');
      let expected = ''; try { expected = fs.readFileSync(EXPECT, 'utf8').trim(); } catch (e) {}
      if (!redirectUri || redirectUri !== expected) {
        return jres({ error: { message: 'Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request', type: 'OAuthException', code: 100 } }, 400);
      }
      return jres({ access_token: 'SUAT-DE-PRUEBA' });
    }
    if (pth.endsWith('/me/adaccounts')) return jres({ data: [{ id: 'act_123456', account_id: '123456', name: 'Cuenta Publicitaria Test', currency: 'USD', account_status: 1, business: { id: 'BIZ-TEST' } }] });
    if (pth.endsWith('/me/businesses')) return jres({ data: [] });
    if (pth.endsWith('/me/accounts')) return jres({ data: [{ id: 'PAGE-TEST', name: 'Página Test', instagram_business_account: { id: '${IG_USER}' } }] });
    if (/\\/me$/.test(pth)) return jres({ id: 'SUAT-USER', name: 'Integration User' });
    return jres({ data: [] });
  }
  if (host.startsWith('api.instagram.com')) {
    if (pth.endsWith('/oauth/access_token')) return jres({ access_token: 'IG-SHORT', user_id: ${IG_NUEVO} });
    return jres({});
  }
  if (host.startsWith('graph.instagram.com')) {
    if (pth === '/access_token') return jres({ access_token: 'IG-LONG' });
    if (pth.includes('/v26.0/')) return jres({ id: '${IG_NUEVO}', username: 'negocio.test', account_type: 'BUSINESS' });
    return jres({ data: [] });
  }
  if (host.includes('instagram.com') || host.includes('graph.facebook.com')) return jres({ data: [] });
  return realFetch(url, opts);
};
`;

function rawReq(port, p, host, cookie) {
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: '127.0.0.1', port, path: p, method: 'GET',
      headers: { ...(host ? { Host: host } : {}), ...(cookie ? { Cookie: cookie } : {}) } }, (res) => {
      let body = ''; res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location || '', text: body, setCookie: (res.headers['set-cookie'] || []).join(';') }));
    });
    r.on('error', reject); r.end();
  });
}

async function main() {
  console.log('== B–F. Boot: la vuelta sin sesión conecta igual ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sin-sesion-'));
  const stubPath = path.join(tmpDir, 'stub-meta.js');
  const expectFile = path.join(tmpDir, 'expected-redirect.txt');
  fs.writeFileSync(stubPath, STUB);
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), NODE_PATH: NM,
    OPENAI_API_KEY: '', META_ADS_TOKEN: '', META_AD_ACCOUNT_ID: '',
    META_FLB_CONFIG_ID: 'cfg-posty-test',
    META_FLB_APP_ID: 'FBAPP999', META_FLB_APP_SECRET: 'fb-secret-test',
    META_IG_EMBED_URL: 'https://www.instagram.com/oauth/authorize?client_id=IGAPP123&response_type=code',
    IG_APP_ID: 'IGAPP123', IG_APP_SECRET: 'ig-secret-test',
    MOCK_META_EXPECT_FILE: expectFile,
  };
  const child = spawn(process.execPath, ['--require', stubPath, 'server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += String(d); });
  child.stderr.on('data', (d) => { bootLog += String(d); });
  const dataDirAntes = fs.existsSync(path.join(ROOT, 'data'));
  const dbPath = path.join(tmpDir, 'posta.db');
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
  async function registrar(email) {
    const reg = await req('POST', '/api/auth/register', { email, password: 'secreta123' });
    const cookie = String(reg.setCookie).split(';')[0];
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    db.close();
    return { cookie, uid: u ? u.id : 0, status: reg.status };
  }
  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'B0 el boot levanta', bootLog.slice(-300));
    if (!up) throw new Error('sin boot');

    // ---------- B. Unificado SIN cookie (el caso Valentino) ----------
    const A = await registrar('sinsesion@test.local');
    t(!!A.cookie && A.uid > 0, 'B1 usuario A registrado', String(A.status));
    {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      db.prepare(`INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET ig_user_id = excluded.ig_user_id, ig_access_token = excluded.ig_access_token`)
        .run(A.uid, IG_USER, 'token-de-prueba');
      db.close();
    }
    const goA = await rawReq(PORT, '/api/ig/unified/go', 'hosta.test', A.cookie);
    t(goA.status === 302 && goA.location.includes('facebook.com/v26.0/dialog/oauth'), 'B2 /go compone el diálogo FLB', String(goA.status));
    const dlgA = new URL(goA.location);
    const stateA = dlgA.searchParams.get('state') || '';
    fs.writeFileSync(expectFile, dlgA.searchParams.get('redirect_uri') || '');
    t(!!stateA, 'B3 el diálogo lleva state');
    {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(stateA);
      t(!!row && row.user_id === A.uid && row.flow === 'ig_ads' && !row.used_at, 'B4 [FIX] el state quedó en la base, atado a A, sin usar', row ? JSON.stringify(row).slice(0, 160) : 'sin fila');
      db.close();
    }
    // LA VUELTA SIN COOKIE: otro host, ningún tarro de sesión.
    const cbA = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(stateA)}`, 'hostb.test', '');
    t(cbA.status === 302 && cbA.location.includes('igads=ok'), 'B5 [FIX] callback SIN cookie: igads=ok (conexión guardada)', String(cbA.status) + ' ' + cbA.location.slice(0, 160) + ' ' + cbA.text.slice(0, 120));
    t(!!cbA.setCookie, 'B6 [FIX] la vuelta establece sesión en el contexto nuevo');
    {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const row = db.prepare('SELECT * FROM ig_ads_connections WHERE user_id = ?').get(A.uid);
      t(!!row && row.primary_ad_account_id === '123456' && row.status === 'ok', 'B7 [FIX] la fila de Ads quedó clavada al dueño del state', row ? row.primary_ad_account_id + '/' + row.status : 'sin fila');
      const st = db.prepare('SELECT used_at FROM oauth_states WHERE state = ?').get(stateA);
      t(!!st && !!st.used_at, 'B8 [FIX] el state quedó consumido en el primer golpe');
      db.close();
    }
    const recA = await req('GET', '/api/ads/recommendations', null, A.cookie);
    t(!!recA.json && recA.json.ads_ready === true, 'B9 [FIX] ads_ready = true tras la vuelta sin sesión', JSON.stringify(recA.json).slice(0, 140));

    // ---------- C. Replay del mismo state: rechazado en todo contexto ----------
    const rpSin = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(stateA)}`, 'hostb.test', '');
    t(rpSin.status === 400 && rpSin.text.includes('La conexión venció'), 'C1 [FIX] replay sin cookie → vencido', String(rpSin.status));
    const rpCon = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(stateA)}`, 'hosta.test', A.cookie);
    t(rpCon.status === 400 && rpCon.text.includes('La conexión venció'), 'C2 [FIX] replay CON la cookie original → vencido (la tumba vence a la sesión)', String(rpCon.status) + ' ' + rpCon.location.slice(0, 120));

    // ---------- D. Camino con sesión: intacto ----------
    const B = await registrar('consesion@test.local');
    {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      db.prepare(`INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET ig_user_id = excluded.ig_user_id, ig_access_token = excluded.ig_access_token`)
        .run(B.uid, IG_USER, 'token-de-prueba');
      db.close();
    }
    const goB = await rawReq(PORT, '/api/ig/unified/go', 'hosta.test', B.cookie);
    const dlgB = new URL(goB.location);
    const stateB = dlgB.searchParams.get('state') || '';
    fs.writeFileSync(expectFile, dlgB.searchParams.get('redirect_uri') || '');
    const cbB = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(stateB)}`, 'hosta.test', B.cookie);
    t(cbB.status === 302 && cbB.location.includes('igads=ok'), 'D1 [INVARIANTE] con sesión de siempre: igads=ok', String(cbB.status) + ' ' + cbB.location.slice(0, 140));
    const rpB = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(stateB)}`, 'hosta.test', B.cookie);
    t(rpB.status === 400 && rpB.text.includes('La conexión venció'), 'D2 [FIX] segundo uso del mismo state con sesión → vencido', String(rpB.status));

    // ---------- E. Instagram SIN cookie ----------
    const C = await registrar('igsin@test.local');
    const goC = await rawReq(PORT, '/api/ig/go', 'hosta.test', C.cookie);
    t(goC.status === 302 && goC.location.includes('instagram.com'), 'E1 /api/ig/go redirige al authorize de Instagram', String(goC.status) + ' ' + goC.location.slice(0, 120));
    const stateC = new URL(goC.location).searchParams.get('state') || '';
    t(!!stateC, 'E2 el authorize lleva state');
    const cbC = await rawReq(PORT, `/api/ig/callback?code=CODE-IG&state=${encodeURIComponent(stateC)}`, 'hostb.test', '');
    t(cbC.status === 302 && !cbC.text.includes('La conexión venció'), 'E3 [FIX] callback de IG SIN cookie: NO cae en vencido', String(cbC.status) + ' ' + cbC.location.slice(0, 160));
    {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const s = db.prepare('SELECT ig_user_id FROM settings WHERE user_id = ?').get(C.uid);
      t(!!s && String(s.ig_user_id) === IG_NUEVO, 'E4 [FIX] el IG quedó conectado para el dueño del state', s ? String(s.ig_user_id) : 'sin settings');
      db.close();
    }
    const rpC = await rawReq(PORT, `/api/ig/callback?code=CODE-IG&state=${encodeURIComponent(stateC)}`, 'hostb.test', '');
    t(rpC.status === 400 && rpC.text.includes('La conexión venció'), 'E5 [FIX] replay del state de IG sin cookie → vencido', String(rpC.status));

    // ---------- F. Desconocido y vencido por TTL ----------
    const unk = await rawReq(PORT, `/api/ig/unified/callback?code=X&state=0000000000000000000000000000abcd`, 'hosta.test', '');
    t(unk.status === 400 && unk.text.includes('La conexión venció'), 'F1 state desconocido sin cookie → vencido honesto', String(unk.status));
    const D = await registrar('ttl@test.local');
    const goD = await rawReq(PORT, '/api/ig/unified/go', 'hosta.test', D.cookie);
    const stateD = new URL(goD.location).searchParams.get('state') || '';
    {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      db.prepare('UPDATE oauth_states SET expires_at = 1 WHERE state = ?').run(stateD);
      db.close();
    }
    const cbD = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(stateD)}`, 'hosta.test', D.cookie);
    t(cbD.status === 400 && cbD.text.includes('La conexión venció'), 'F2 [FIX] state vencido por TTL → vencido, aun con la cookie del dueño', String(cbD.status) + ' ' + cbD.location.slice(0, 120));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  t(fs.existsSync(path.join(ROOT, 'data')) === dataDirAntes, 'F3 el boot no creó data/ en el árbol');

  console.log(`\nRESULTADO: ${pass} ok · ${fail} mal`);
  if (fails.length) { console.log('FALLAS:\n- ' + fails.join('\n- ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
