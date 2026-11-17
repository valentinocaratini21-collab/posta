// test-lote-conexion-sin-sesion-2.js — LOTE CONEXIÓN-SIN-SESIÓN-2
// ANCLA: 16/11 20:02 EST, video de Valentino de su intento completo —
// el diálogo de Meta confirma «Posty CM has been connected to Posty»
// y al tocar Finish la vuelta cae OTRA VEZ en «La conexión venció»,
// con CONEXIÓN-SIN-SESIÓN (v1143) ya vivo y verificado (la prueba en
// vivo con cuenta de descarte y tarro limpio pasaba: la vuelta sin
// cookie adoptaba la fila y el freno quedaba en el canje).
// MECANISMO (la diferencia entre el tarro limpio y el de Valentino):
//   - La adopción de v1143 exigía que la sesión receptora NO trajera
//     state propio (igAdsState === undefined). El navegador que
//     recibe sus vueltas (la vista de Safari sobre la PWA) arrastra
//     una sesión con el state de un INTENTO ANTERIOR abandonado —
//     cada intento nuevo dejaba su resto y el siguiente moría
//     contra ese resto: por eso «me sigue pasando lo mismo» aunque
//     el resto del mecanismo estuviera bien.
// EL LOTE: la fila viva de la base MANDA sobre el state que la
// sesión traiga. La fila es la prueba fuerte (la compuso el dueño
// autenticado, Meta volvió de ESE diálogo, está sin usar y sin
// vencer); el state de sesión puede ser un resto. La identidad no
// se negocia: una sesión de OTRO usuario nunca adopta la fila.
//
// Qué prueba (boot real + Meta simulado por preload):
//  A (estático): la adopción ya no exige sesión sin state, en los
//     dos callbacks; el resto del mecanismo de v1143 sigue.
//  B (el caso del video, unificado): el mismo usuario con DOS
//     sesiones — la de «Safari» compone un diálogo que abandona
//     (su state queda en esa sesión) y la de la «PWA» compone el
//     diálogo bueno; la vuelta del diálogo bueno cae con la cookie
//     de Safari (state viejo adentro) → [FIX] igads=ok y la fila
//     queda guardada; el replay → vencido.
//  C (identidad): la vuelta con el state de E cae con la sesión de
//     OTRO usuario → vencido, sin fila para el otro.
//  D (Instagram, mismo mecanismo): dos sesiones, state viejo en la
//     receptora, vuelta del diálogo bueno → conecta y guarda.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-conexion-sin-sesion-2.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35207;
const IG_USER = 'IGUSER-DE-PRUEBA';
const IG_NUEVO = '99887766';

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  FAIL: ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// ---------- A. Estático ----------
console.log('== A. Estático: la fila manda sobre el state de sesión ==');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
t(!SRV.includes('req.session.igAdsState === undefined'), 'A1 [FIX] la adopción unificada ya no exige sesión sin state');
t(!SRV.includes('req.session.igState === undefined'), 'A2 [FIX] la adopción de Instagram ya no exige sesión sin state');
t(SRV.includes('_oauthAds.user_id') && SRV.includes('_oauthIg.user_id'), 'A3 [INVARIANTE] la identidad sigue atada al dueño de la fila');
t(SRV.includes('CREATE TABLE IF NOT EXISTS oauth_states') && SRV.includes('used_at IS NULL'), 'A4 [INVARIANTE] el mecanismo de v1143 sigue (tabla + consumo atómico)');

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
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location || '', text: body }));
    });
    r.on('error', reject); r.end();
  });
}

async function main() {
  console.log('== B–D. Boot: la vuelta cae en la sesión con el state viejo ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-viejo-'));
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
  function uidDe(email) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    db.close();
    return u ? u.id : 0;
  }
  function sembrarIg(uid) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    db.prepare(`INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET ig_user_id = excluded.ig_user_id, ig_access_token = excluded.ig_access_token`)
      .run(uid, IG_USER, 'token-de-prueba');
    db.close();
  }
  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'B0 el boot levanta', bootLog.slice(-300));
    if (!up) throw new Error('sin boot');

    // ---------- B. El caso del video (unificado, state viejo en la receptora) ----------
    const regE = await req('POST', '/api/auth/register', { email: 'e@test.local', password: 'secreta123' });
    const jarPwa = String(regE.setCookie).split(';')[0];
    const uidE = uidDe('e@test.local');
    t(!!jarPwa && uidE > 0, 'B1 usuario E registrado (tarro «PWA»)', String(regE.status));
    sembrarIg(uidE);
    // Segunda sesión del MISMO usuario: el tarro «Safari».
    const loginE = await req('POST', '/api/auth/login', { email: 'e@test.local', password: 'secreta123' });
    const jarSafari = String(loginE.setCookie).split(';')[0];
    t(!!jarSafari && jarSafari !== jarPwa, 'B2 segunda sesión del mismo usuario (tarro «Safari»)', String(loginE.status));
    // Safari compone un diálogo que ABANDONA: su state queda en esa sesión.
    const goViejo = await rawReq(PORT, '/api/ig/unified/go', 'hosta.test', jarSafari);
    const stateViejo = new URL(goViejo.location).searchParams.get('state') || '';
    t(!!stateViejo, 'B3 el diálogo abandonado dejó su state en la sesión de Safari');
    // La PWA compone el diálogo BUENO.
    const goBueno = await rawReq(PORT, '/api/ig/unified/go', 'hosta.test', jarPwa);
    const dlgBueno = new URL(goBueno.location);
    const stateBueno = dlgBueno.searchParams.get('state') || '';
    fs.writeFileSync(expectFile, dlgBueno.searchParams.get('redirect_uri') || '');
    t(!!stateBueno && stateBueno !== stateViejo, 'B4 el diálogo bueno tiene su propio state');
    // LA VUELTA cae en el tarro de Safari, que adentro trae el state viejo.
    const cb = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(stateBueno)}`, 'hosta.test', jarSafari);
    t(cb.status === 302 && cb.location.includes('igads=ok'), 'B5 [FIX] vuelta con state viejo en la sesión: igads=ok (la fila manda)', String(cb.status) + ' ' + cb.location.slice(0, 160) + ' ' + cb.text.slice(0, 120));
    {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const row = db.prepare('SELECT * FROM ig_ads_connections WHERE user_id = ?').get(uidE);
      t(!!row && row.primary_ad_account_id === '123456' && row.status === 'ok', 'B6 [FIX] la conexión quedó guardada para el dueño', row ? row.primary_ad_account_id + '/' + row.status : 'sin fila');
      db.close();
    }
    const rp = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(stateBueno)}`, 'hosta.test', jarSafari);
    t(rp.status === 400 && rp.text.includes('La conexión venció'), 'B7 [INVARIANTE] replay del mismo state → vencido', String(rp.status));

    // ---------- C. Identidad: la sesión de otro no adopta ----------
    const regF = await req('POST', '/api/auth/register', { email: 'f@test.local', password: 'secreta123' });
    const jarF = String(regF.setCookie).split(';')[0];
    const uidF = uidDe('f@test.local');
    const goE2 = await rawReq(PORT, '/api/ig/unified/go', 'hosta.test', jarPwa);
    const dlgE2 = new URL(goE2.location);
    const stateE2 = dlgE2.searchParams.get('state') || '';
    fs.writeFileSync(expectFile, dlgE2.searchParams.get('redirect_uri') || '');
    const cbAjena = await rawReq(PORT, `/api/ig/unified/callback?code=CODE-DE-PRUEBA&state=${encodeURIComponent(stateE2)}`, 'hosta.test', jarF);
    t(cbAjena.status === 400 && cbAjena.text.includes('La conexión venció'), 'C1 [INVARIANTE] state de E con sesión de F → vencido (no se adopta ajeno)', String(cbAjena.status));
    {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const rowF = db.prepare('SELECT * FROM ig_ads_connections WHERE user_id = ?').get(uidF);
      t(!rowF, 'C2 [INVARIANTE] F no ganó ninguna conexión', rowF ? 'fila inesperada' : '');
      db.close();
    }

    // ---------- D. Instagram con state viejo en la receptora ----------
    const regG = await req('POST', '/api/auth/register', { email: 'g@test.local', password: 'secreta123' });
    const jarG1 = String(regG.setCookie).split(';')[0];
    const uidG = uidDe('g@test.local');
    const loginG = await req('POST', '/api/auth/login', { email: 'g@test.local', password: 'secreta123' });
    const jarG2 = String(loginG.setCookie).split(';')[0];
    t(!!jarG2 && jarG2 !== jarG1, 'D1 usuario G con dos sesiones', String(loginG.status));
    const goIgViejo = await rawReq(PORT, '/api/ig/go', 'hosta.test', jarG2);
    t(goIgViejo.status === 302 && !!new URL(goIgViejo.location).searchParams.get('state'), 'D2 el diálogo de IG abandonado dejó su state en la segunda sesión', String(goIgViejo.status));
    const goIgBueno = await rawReq(PORT, '/api/ig/go', 'hosta.test', jarG1);
    const stateIgBueno = new URL(goIgBueno.location).searchParams.get('state') || '';
    const cbIg = await rawReq(PORT, `/api/ig/callback?code=CODE-IG&state=${encodeURIComponent(stateIgBueno)}`, 'hosta.test', jarG2);
    t(cbIg.status === 302 && !cbIg.text.includes('La conexión venció'), 'D3 [FIX] vuelta de IG con state viejo en la sesión: NO cae en vencido', String(cbIg.status) + ' ' + cbIg.location.slice(0, 160));
    {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const s = db.prepare('SELECT ig_user_id FROM settings WHERE user_id = ?').get(uidG);
      t(!!s && String(s.ig_user_id) === IG_NUEVO, 'D4 [FIX] el IG quedó conectado para el dueño del state', s ? String(s.ig_user_id) : 'sin settings');
      db.close();
    }
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  t(fs.existsSync(path.join(ROOT, 'data')) === dataDirAntes, 'D5 el boot no creó data/ en el árbol');

  console.log(`\nRESULTADO: ${pass} ok · ${fail} mal`);
  if (fails.length) { console.log('FALLAS:\n- ' + fails.join('\n- ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
