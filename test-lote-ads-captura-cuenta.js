// test-lote-ads-captura-cuenta.js — LOTE ADS-CAPTURA-CUENTA
// ANCLA: 16/11 14:47 EST, video de la pantalla de Valentino — con
// ADS-CREDENCIALES (v1136) y ADS-CONEXION-PERSISTE (v1137) vivos, su
// reintento fresco completó el diálogo FLB eligiendo TODO: portfolio
// Posty CM (1140848162035745), Página «Posty.» (1397548910112144),
// Instagram posty.communitymanager (1336760809518976) y la cuenta
// publicitaria «Posty» (29027789776849841) — la pantalla de revisión
// de Meta listó los cuatro y él tocó Confirm; Meta cerró «Posty CM
// has been connected to Posty». Al volver, la app mostró el toast
// «⚠️ Falta la cuenta publicitaria. Conectaste tu Página, pero no
// elegiste una cuenta publicitaria…» (?igads=sin_cuenta) y siguió
// ofreciendo «Conectar mi cuenta publicitaria».
// MECANISMO (censo sobre v1137, commit 7756930d):
//   - El toast sale SOLO del redirect igads=sin_cuenta, que el
//     callback emite cuando primary === null, DESPUÉS del INSERT:
//     la fila SÍ se escribió (status 'sin_cuenta', primary '').
//   - primary = find(account_status===1) || adAccounts[0] || null:
//     con CUALQUIER lista no vacía hay primaria — primary null
//     equivale a adAccounts vacío al capturar. La regla de elección
//     no descarta nada y el INSERT escribe ese mismo array: ni (b)
//     ni (c); la cuenta se perdió ANTES, en la enumeración.
//   - La enumeración (fetchClientAssets, meta_ads.js) lee las
//     cuentas de UNA sola fuente: GET /me/adaccounts con el SUAT,
//     y cualquier error de Graph en esa llamada se traga en
//     silencio (.catch(() => ({ data: [] })), sin log en todo el
//     camino): lista vacía y error son indistinguibles, y ambos
//     terminan en «sin_cuenta» — el estado que le dice al cliente
//     que NO eligió una cuenta. La Página sí llegó (por
//     /me/accounts): por eso el callback supo que conectó.
//   - La cuenta ELEGIDA en el diálogo no se lee de ninguna otra
//     vía: el callback recibe solo el code y todo activo se
//     re-deriva de los bordes /me/*. Que un activo concedido en
//     FLB no aparezca en el borde clásico /me/* es un fenómeno
//     documentado de Meta (los activos que viven dentro de un
//     portfolio no siempre se reflejan en la enumeración clásica);
//     la enumeración confiable de un portfolio son sus bordes
//     /{business}/owned_ad_accounts y /client_ad_accounts.
//   - El mismo borde frágil alimenta el re-chequeo al impulsar
//     (checkClientAdsAccess, 3 caminos de cobro en server.js):
//     una cuenta capturada por otra ruta volvería a fallar ahí.
// EL LOTE: enumeración en dos rutas con UNA sola fuente de verdad
// (enumerateAdAccounts en meta_ads.js): (1) /me/adaccounts y
// (2) /me/businesses → por negocio, owned_ad_accounts +
// client_ad_accounts; unión sin duplicados. Los errores ya no se
// tragan: se loguean (console.error) y se devuelven. Si no se
// encontró ninguna cuenta Y alguna ruta erroró, la captura NO
// afirma «sin_cuenta»: fetchClientAssets devuelve adAccountsError
// y el callback responde igads=error con el mensaje de Meta, sin
// escribir la fila engañosa. Sin errores y sin cuentas = salteo
// genuino: el estado honesto 'sin_cuenta' de CAMINO-CLIENTE-ADS
// queda intacto. checkClientAdsAccess usa la misma enumeración.
//
// Qué prueba (boot real + Meta simulado por preload; el modo se lee
// de un archivo por request):
//  A (estático): la enumeración consulta los bordes del negocio,
//     los errores no se tragan en silencio, el callback honra
//     adAccountsError ANTES del INSERT, el re-chequeo comparte la
//     enumeración; invariantes del lote anterior (el canje sigue
//     mandando el redirect_uri de la sesión).
//  B (boot, 4 escenarios con los IDs reales del video):
//     B1 «elegida-invisible» [FIX]: la sesión concede página+IG+
//        cuenta pero /me/adaccounts devuelve [] (lo observado en
//        producción); la cuenta vive en owned_ad_accounts del
//        portfolio. La captura guarda LAS TRES cosas y la primaria
//        es LA ELEGIDA (29027789776849841); igads=ok; ads_ready.
//        En el control prístino reproduce el video: igads=
//        sin_cuenta y la fila queda sin_cuenta con primary ''.
//     B2 «clasica» [INVARIANTE]: /me/adaccounts sí trae la cuenta:
//        igads=ok en ambos árboles.
//     B3 «salteo» [INVARIANTE]: ninguna ruta trae cuentas y ninguna
//        errora (el cliente salteó la cuenta en el diálogo):
//        igads=sin_cuenta con la Página capturada, en ambos
//        árboles — el estado honesto no se toca.
//     B4 «error-total» [FIX]: TODAS las rutas de cuentas erroran
//        (Graph 400): la vuelta es igads=error con el mensaje de
//        Meta y NO se escribe ninguna fila. En el control
//        prístino, la fila mentirosa 'sin_cuenta' SÍ se escribe.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-captura-cuenta.js
// (desde release/; para el control, copiar a pristine/ y correr ahí.)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35231;
const IG_USER = '1336760809518976';
const BIZ_ID = '1140848162035745';
const PAGE_ID = '1397548910112144';
const ACCT_ID = '29027789776849841';

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  FAIL: ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// ---------- A. Estático ----------
console.log('== A. Estático: la enumeración de cuentas del login unificado ==');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const MA = fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8');
const iEnum = MA.indexOf('async function enumerateAdAccounts');
t(iEnum >= 0, 'A0 enumerateAdAccounts existe en meta_ads.js');
const enumBody = iEnum >= 0 ? MA.slice(iEnum, MA.indexOf('\n}\n', iEnum)) : '';
t(enumBody.includes('owned_ad_accounts') && enumBody.includes('client_ad_accounts'), 'A1 [FIX] la enumeración consulta los bordes del negocio (owned + client)', enumBody.slice(0, 200));
t(enumBody.includes('/me/businesses'), 'A2 [FIX] la enumeración descubre los negocios del SUAT (/me/businesses)');
t(enumBody.includes('/me/adaccounts'), 'A3 la enumeración conserva el borde clásico /me/adaccounts');
t(enumBody.includes('console.error'), 'A4 [FIX] los errores de enumeración se loguean, no se tragan en silencio');
const iFetch = MA.indexOf('async function fetchClientAssets');
const fetchBody = iFetch >= 0 ? MA.slice(iFetch, MA.indexOf('\n}\n', iFetch)) : '';
t(fetchBody.includes('enumerateAdAccounts') && fetchBody.includes('adAccountsError'), 'A5 [FIX] fetchClientAssets usa la enumeración y devuelve adAccountsError');
const iCb = SRV.indexOf("app.get('/api/ig/unified/callback'");
const cbBody = iCb >= 0 ? SRV.slice(iCb, iCb + 9000) : '';
t(cbBody.includes('assets.adAccountsError'), 'A6 [FIX] el callback honra adAccountsError');
t(cbBody.indexOf('assets.adAccountsError') >= 0 && cbBody.indexOf('assets.adAccountsError') < cbBody.indexOf('INSERT INTO ig_ads_connections'), 'A7 [FIX] el corte por error va ANTES del INSERT (no se escribe la fila engañosa)');
const iChk = MA.indexOf('async function checkClientAdsAccess');
const chkBody = iChk >= 0 ? MA.slice(iChk, MA.indexOf('\n}\n', iChk)) : '';
t(chkBody.includes('enumerateAdAccounts'), 'A8 [FIX] el re-chequeo al impulsar (checkClientAdsAccess) usa la misma enumeración');
const iEx = MA.indexOf('async function exchangeUnifiedCode');
const exBody = iEx >= 0 ? MA.slice(iEx, MA.indexOf('\n}\n', iEx)) : '';
t(exBody.includes('redirect_uri: String(redirectUri)') && SRV.includes('redirectUri: req.session.igAdsRedirect'), 'A9 [INVARIANTE] el canje sigue mandando el redirect_uri persistido en la sesión (ADS-CONEXION-PERSISTE intacto)');
t(SRV.includes('INSERT INTO ig_ads_connections') && SRV.includes('function getAdsConnection(userId)'), 'A10 [INVARIANTE] la fuente de verdad es una: el callback escribe y adsReadiness lee ig_ads_connections');

// ---------- Meta simulado (preload del boot) ----------
const STUB = `'use strict';
const fs = require('fs');
const realFetch = globalThis.fetch;
const EXPECT = process.env.MOCK_META_EXPECT_FILE || '';
const MODEF = process.env.MOCK_META_MODE_FILE || '';
function mode() { try { return fs.readFileSync(MODEF, 'utf8').trim(); } catch (e) { return ''; } }
function jres(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
const ACCT = { id: 'act_${ACCT_ID}', account_id: '${ACCT_ID}', name: 'Posty', currency: 'USD', account_status: 1, business: { id: '${BIZ_ID}' } };
const GERR = { error: { message: '(#200) Requires ads_management permission or the asset is not visible to this token', type: 'OAuthException', code: 200 } };
globalThis.fetch = async function (url, opts) {
  const u = String(url && url.url ? url.url : url);
  let p = null; try { p = new URL(u); } catch (e) {}
  const host = p ? p.hostname : ''; const pth = p ? p.pathname : '';
  if (host.includes('facebook.com') || host.includes('instagram.com')) {
    const m = mode();
    if (pth.endsWith('/oauth/access_token')) {
      const redirectUri = p.searchParams.get('redirect_uri');
      let expected = ''; try { expected = fs.readFileSync(EXPECT, 'utf8').trim(); } catch (e) {}
      if (!redirectUri || redirectUri !== expected) {
        return jres({ error: { message: 'Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request', type: 'OAuthException', code: 100 } }, 400);
      }
      return jres({ access_token: 'SUAT-DE-PRUEBA' });
    }
    if (pth.endsWith('/me/adaccounts')) {
      if (m === 'clasica') return jres({ data: [ACCT] });
      if (m === 'error-total') return jres(GERR, 400);
      return jres({ data: [] });
    }
    if (pth.endsWith('/me/businesses')) {
      if (m === 'elegida-invisible') return jres({ data: [{ id: '${BIZ_ID}', name: 'Posty CM' }] });
      if (m === 'error-total') return jres(GERR, 400);
      return jres({ data: [] });
    }
    if (pth.includes('/owned_ad_accounts')) {
      if (m === 'elegida-invisible') return jres({ data: [ACCT] });
      if (m === 'error-total') return jres(GERR, 400);
      return jres({ data: [] });
    }
    if (pth.includes('/client_ad_accounts')) {
      if (m === 'error-total') return jres(GERR, 400);
      return jres({ data: [] });
    }
    if (pth.endsWith('/me/accounts')) return jres({ data: [{ id: '${PAGE_ID}', name: 'Posty.', instagram_business_account: { id: '${IG_USER}' } }] });
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
  console.log('== B. Boot: la sesión FLB concede página+IG+cuenta (IDs reales del video) ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-captura-'));
  const stubPath = path.join(tmpDir, 'stub-meta.js');
  const expectFile = path.join(tmpDir, 'expected-redirect.txt');
  const modeFile = path.join(tmpDir, 'meta-mode.txt');
  fs.writeFileSync(stubPath, STUB);
  fs.writeFileSync(modeFile, 'elegida-invisible');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), NODE_PATH: NM,
    OPENAI_API_KEY: '', META_ADS_TOKEN: '', META_AD_ACCOUNT_ID: '',
    META_FLB_CONFIG_ID: 'cfg-posty-test',
    META_FLB_APP_ID: 'FBAPP999', META_FLB_APP_SECRET: 'fb-secret-test',
    MOCK_META_EXPECT_FILE: expectFile, MOCK_META_MODE_FILE: modeFile,
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
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(tmpDir, 'posta.db');
  function readRow(uid) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare('SELECT * FROM ig_ads_connections WHERE user_id = ?').get(uid);
    db.close();
    return row || null;
  }
  async function escenario(modoName, email) {
    fs.writeFileSync(modeFile, modoName);
    const reg = await req('POST', '/api/auth/register', { email, password: 'secreta123' });
    const cookie = String(reg.setCookie).split(';')[0];
    if (!cookie || reg.status >= 300) throw new Error('registro falló en ' + modoName + ': ' + reg.status);
    let uid = 0;
    {
      const db = new DatabaseSync(dbPath);
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      uid = u ? u.id : 0;
      db.prepare(`INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET ig_user_id = excluded.ig_user_id, ig_access_token = excluded.ig_access_token`)
        .run(uid, IG_USER, 'token-de-prueba');
      db.close();
    }
    const go = await rawReq(PORT, '/api/ig/unified/go', 'hosta.test', cookie);
    const dlg = new URL(go.location);
    fs.writeFileSync(expectFile, dlg.searchParams.get('redirect_uri') || '');
    const state = dlg.searchParams.get('state') || '';
    const cb = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(state)}`, 'hostb.test', cookie);
    return { uid, cookie, cb };
  }
  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'B0 el boot levanta', bootLog.slice(-300));
    if (!up) throw new Error('sin boot');

    // B1 — la cuenta ELEGIDA no aparece en /me/adaccounts (producción).
    const s1 = await escenario('elegida-invisible', 'elegida@test.local');
    t(s1.cb.status === 302 && s1.cb.location.includes('igads=ok'), 'B1 [FIX] elegida-invisible: la vuelta cae igads=ok', s1.cb.location.slice(0, 220));
    const r1 = readRow(s1.uid);
    t(!!r1 && r1.status === 'ok' && r1.primary_ad_account_id === ACCT_ID, 'B1 [FIX] la primaria guardada es LA ELEGIDA en el diálogo (' + ACCT_ID + ')', r1 ? r1.primary_ad_account_id + '/' + r1.status : 'sin fila');
    let lista1 = [];
    try { lista1 = JSON.parse((r1 && r1.ad_accounts) || '[]'); } catch (e) {}
    t(lista1.some(a => a.account_id === ACCT_ID), 'B1 [FIX] ad_accounts guardadas incluyen la cuenta elegida', JSON.stringify(lista1).slice(0, 200));
    t(!!r1 && r1.fb_page_id === PAGE_ID && r1.suat === 'SUAT-DE-PRUEBA', 'B1 [FIX] Página y SUAT capturados en la misma fila', r1 ? r1.fb_page_id : '');
    t(!!r1 && r1.client_business_id === BIZ_ID, 'B1 [FIX] el negocio de la conexión es el portfolio elegido (Posty CM)', r1 ? r1.client_business_id : '');
    const rec1 = await req('GET', '/api/ads/recommendations', null, s1.cookie);
    t(!!rec1.json && rec1.json.ads_ready === true, 'B1 [FIX] la pantalla de Ads lee ads_ready = true (conectado, sin volver a ofrecer el botón)', JSON.stringify(rec1.json).slice(0, 160));

    // B2 — el borde clásico sí trae la cuenta (invariante).
    const s2 = await escenario('clasica', 'clasica@test.local');
    t(s2.cb.status === 302 && s2.cb.location.includes('igads=ok'), 'B2 [INVARIANTE] clásica: igads=ok con la cuenta por /me/adaccounts', s2.cb.location.slice(0, 160));
    const r2 = readRow(s2.uid);
    t(!!r2 && r2.primary_ad_account_id === ACCT_ID && r2.status === 'ok', 'B2 [INVARIANTE] primaria y status ok por la ruta clásica', r2 ? r2.primary_ad_account_id + '/' + r2.status : 'sin fila');

    // B3 — salteo genuino: ninguna ruta trae cuentas, ninguna errora.
    const s3 = await escenario('salteo', 'salteo@test.local');
    t(s3.cb.status === 302 && s3.cb.location.includes('igads=sin_cuenta'), 'B3 [INVARIANTE] salteo genuino: la vuelta sigue siendo igads=sin_cuenta (estado honesto intacto)', s3.cb.location.slice(0, 160));
    const r3 = readRow(s3.uid);
    t(!!r3 && r3.status === 'sin_cuenta' && r3.fb_page_id === PAGE_ID, 'B3 [INVARIANTE] la fila sin_cuenta guarda la Página capturada', r3 ? r3.status + '/' + r3.fb_page_id : 'sin fila');

    // B4 — todas las rutas de cuentas erroran: nada de «sin_cuenta».
    const s4 = await escenario('error-total', 'error@test.local');
    t(s4.cb.status === 302 && s4.cb.location.includes('igads=error') && !s4.cb.location.includes('igads=sin_cuenta'), 'B4 [FIX] error total de enumeración: la vuelta es igads=error, no sin_cuenta', s4.cb.location.slice(0, 220));
    const r4 = readRow(s4.uid);
    t(!r4, 'B4 [FIX] no se escribe ninguna fila (la conexión no queda afirmada a medias)', r4 ? JSON.stringify(r4).slice(0, 200) : '');
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  t(fs.existsSync(path.join(ROOT, 'data')) === dataDirAntes, 'B5 el boot no creó data/ en el árbol');

  console.log(`\nRESULTADO: ${pass} ok · ${fail} mal`);
  if (fails.length) { console.log('FALLAS:\n- ' + fails.join('\n- ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
