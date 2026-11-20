// test-lote-reconexion-ads.js
// LOTE RECONEXION-ADS — la conexión publicitaria VISIBLE y
// reconectable desde la app (SPEC-RECONEXION-ADS, 19/11).
// §A · estáticos que fijan cada cambio de la SPEC (1–6) + sellos.
// §B · módulos con Meta falso (el stub hermano): el arbitraje de
//      identidad adjunta las dos cuentas al error
//      (igDuena/igConexion) en los tres frenos guardados, y el
//      camino que coincide resuelve sin freno.
// §C · boot real: con la compuerta LISTA el payload del tab trae
//      connect_url Y el detalle de la conexión (Página · Instagram
//      · cuenta publicitaria); sin conexión, el detalle viaja null
//      y la URL sigue presente; el 409 del impulso de un posteo de
//      OTRA cuenta lleva ig_duena + ig_conexion en el cuerpo, creó
//      cero objetos en Meta y dejó su fila de error.
// Uso: node test-lote-reconexion-ads.js (cwd = raíz del árbol)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = __dirname;

let ok = 0, mal = 0;
function check(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok - ' + nombre); }
  else { mal++; console.log('  MAL - ' + nombre + (extra ? ' :: ' + extra : '')); }
}
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const veces = (src, s) => (src.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

// ══════════════ §A · ESTÁTICOS ══════════════
console.log('§A · estáticos');
const srvSrc = leer('server.js');
const metaSrc = leer('meta_ads.js');
const appSrc = leer('public/app.js');
const chunkSrc = leer('public/chunk-ajustes.js');
const idxSrc = leer('public/index.html');

check('A1 · server: adsConexionDetalle definida (la fuente única del detalle de conexión)',
  srvSrc.includes('function adsConexionDetalle(userId)') && srvSrc.includes('ad_account_name:'));
check('A2 · server: el detalle viaja en AMBOS payloads (elegibles + /api/ads/config)',
  veces(srvSrc, 'conexion: adsConexionDetalle(') === 2);
check('A3 · server: la connect_url se calcula SIEMPRE que el flujo unificado está configurado (ambos payloads)',
  srvSrc.includes("unifiedReady(uid) ? '/api/ig/unified/go' : ''")
  && srvSrc.includes("unifiedReady(req.session.userId) ? '/api/ig/unified/go' : ''"));
check('A4 · server: el candado viejo (URL solo con la compuerta cerrada) ya no está',
  !srvSrc.includes('faltaConexionAds && unifiedReady(uid)'));
check('A5 · server: los 409 de identidad de AMBOS rieles cliente llevan ig_duena + ig_conexion',
  srvSrc.includes('ig_duena: crDError.igDuena') && srvSrc.includes('ig_duena: crError.igDuena')
  && veces(srvSrc, 'ig_conexion: Array.isArray(') === 2);
check('A6 · meta_ads: los TRES frenos guardados adjuntan las identidades (única · sin match · no usable)',
  metaSrc.includes('err.igDuena = pubU1;') && metaSrc.includes('err.igConexion = [unica.username || unica.id];')
  && metaSrc.includes('errSin.igDuena = pubU;') && metaSrc.includes('errNoU.igDuena = pubU;')
  && veces(metaSrc, 'igConexion = detalladas.map') === 2);
check('A7 · app.js: la tarjeta de conexión existe y entra en el render del tab Ads',
  appSrc.includes('function pzAdsConexionHTML()') && appSrc.includes('${pzAdsConexionHTML()}')
  && appSrc.includes('Conectado: ') && appSrc.includes('Cambiar conexión'));
check('A8 · app.js: «Cambiar conexión» abre el flujo unificado con la vuelta al tab Ads',
  appSrc.includes('async function pzAdsCambiarConexion(btn)') && appSrc.includes("encodeURIComponent('/#/app/ads')"));
check('A9 · app.js: el estado guarda la conexión y la URL también en estado listo',
  appSrc.includes('s.conexion = (elig && elig.ok && elig.conexion) ? elig.conexion : null;')
  && appSrc.includes("s.connectUrl = (elig && elig.ok) ? String(elig.connect_url || '') : '';")
  && !appSrc.includes("!elig.ads_ready) ? String(elig.connect_url"));
check('A10 · app.js: el error guardado conserva las identidades del 409',
  appSrc.includes("igDuena: (j && j.ig_duena) || ''") && appSrc.includes('igConexion: (j && Array.isArray(j.ig_conexion))'));
check('A11 · app.js: la tarjeta del error de identidad dice la causa exacta y ofrece reconectar',
  appSrc.includes("if (motivo === 'ig_fuera_de_conexion') {")
  && appSrc.includes('Meta solo acepta impulsar desde la cuenta dueña.')
  && appSrc.includes('Reconectar con la cuenta correcta')
  && appSrc.includes('onclick="pzAdsCambiarConexion(this)"'));
check('A12 · chunk-ajustes: la fila de Ads en Conexiones existe (bloque + cargador + invocación + fila del menú)',
  chunkSrc.includes('Publicidad en Meta (Ads)') && chunkSrc.includes('id="adsZone"')
  && chunkSrc.includes('async function adsZoneLoad()') && chunkSrc.includes('try { adsZoneLoad(); } catch (e) {}')
  && chunkSrc.includes('id="rsAdsVal"') && chunkSrc.includes('Cambiar conexión'));
check('A13 · sellos del lote: BUILD v1190 ×1 en server.js (v1189 ×0), PZ_BUILD v1190 en app.js, app.js?v=825 en el index ES',
  veces(srvSrc, '20261105-v1190') === 1 && veces(srvSrc, '20261105-v1189') === 0
  && appSrc.includes("const PZ_BUILD = '20261105-v1190';") && idxSrc.includes('app.js?v=825'));

// ══════════════ §B · MÓDULOS CON FAKES ══════════════
(async () => {
  console.log('§B · módulos');
  const TMPB = fs.mkdtempSync(path.join(ROOT, '.tmp-reconexion-ads-mod-'));
  process.env.META_STUB_CONTROL = path.join(TMPB, 'control.json');
  fs.writeFileSync(process.env.META_STUB_CONTROL, JSON.stringify({}));
  process.env.META_ADS_TOKEN = 'TOKEN_POSTY';
  process.env.META_AD_ACCOUNT_ID = '123456';
  require('./test-lote-reconexion-ads.stub.js').install();
  const MA = require('./meta_ads.js');
  const ctxDe = (igAccounts, publicadaUsername) => ({
    token: 'SUAT_TEST', adAccountId: '777001', igAccounts,
    igAccountIds: igAccounts.map((a) => a.id), publicadaUsername,
  });

  // B1 · la noche del dueño: una sola guardada (la EN), el posteo es de la ES.
  let e1 = null;
  try {
    await MA.resolverIgUserIdBoost({ pageId: '555111', igMediaId: 'MEDIA_OK', ctx: ctxDe([{ id: '555002', username: 'postycommunitymanager', page_id: '555111', usable_en_cuenta: true }], 'posty.communitymanager') });
  } catch (e) { e1 = e; }
  check('B1 · freno de identidad (única guardada distinta): code + igDuena + igConexion',
    !!e1 && e1.code === 'ig_fuera_de_conexion' && e1.igDuena === 'posty.communitymanager'
    && JSON.stringify(e1.igConexion) === JSON.stringify(['postycommunitymanager']),
    e1 && (e1.code + ' ' + JSON.stringify(e1.igConexion)));
  // B2 · varias guardadas y la dueña no está: la lista completa viaja.
  let e2 = null;
  try {
    await MA.resolverIgUserIdBoost({ pageId: '555111', igMediaId: 'MEDIA_OK', ctx: ctxDe([
      { id: '555002', username: 'postycommunitymanager', page_id: '555111', usable_en_cuenta: true },
      { id: '555003', username: 'otracuenta', page_id: '555112', usable_en_cuenta: true },
    ], 'posty.communitymanager') });
  } catch (e) { e2 = e; }
  check('B2 · freno de identidad (la dueña no está entre varias): igConexion lista las dos',
    !!e2 && e2.code === 'ig_fuera_de_conexion' && e2.igDuena === 'posty.communitymanager'
    && JSON.stringify(e2.igConexion) === JSON.stringify(['postycommunitymanager', 'otracuenta']),
    e2 && (e2.code + ' ' + JSON.stringify(e2.igConexion)));
  // B3 · la dueña está pero no asignada a la cuenta publicitaria.
  let e3 = null;
  try {
    await MA.resolverIgUserIdBoost({ pageId: '555111', igMediaId: 'MEDIA_OK', ctx: ctxDe([
      { id: '555001', username: 'posty.communitymanager', page_id: '555111', usable_en_cuenta: false },
      { id: '555002', username: 'postycommunitymanager', page_id: '555111', usable_en_cuenta: true },
    ], 'posty.communitymanager') });
  } catch (e) { e3 = e; }
  check('B3 · freno de identidad (dueña no asignada): también lleva las identidades',
    !!e3 && e3.code === 'ig_fuera_de_conexion' && e3.igDuena === 'posty.communitymanager'
    && JSON.stringify(e3.igConexion) === JSON.stringify(['posty.communitymanager', 'postycommunitymanager']),
    e3 && (e3.code + ' ' + JSON.stringify(e3.igConexion)));
  // B4 · la dueña coincide: resuelve sin freno.
  let r4 = null, e4 = null;
  try {
    r4 = await MA.resolverIgUserIdBoost({ pageId: '555111', igMediaId: 'MEDIA_OK', ctx: ctxDe([{ id: '555001', username: 'posty.communitymanager', page_id: '555111', usable_en_cuenta: true }], 'posty.communitymanager') });
  } catch (e) { e4 = e; }
  check('B4 · dueña coincidente: resuelve por lo guardado, sin freno',
    !!r4 && r4.id === '555001' && r4.fuente === 'conexion_guardada' && !e4, e4 && e4.code);
  try { fs.rmSync(TMPB, { recursive: true, force: true }); } catch (e) {}

  // ══════════════ §C · BOOT ══════════════
  console.log('§C · boot');
  const DATA_DIR = fs.mkdtempSync(path.join(ROOT, '.tmp-reconexion-ads-boot-'));
  const metaLog = path.join(DATA_DIR, 'meta.jsonl');
  const stripeLog = path.join(DATA_DIR, 'stripe.jsonl');
  const controlC = path.join(DATA_DIR, 'control.json');
  fs.writeFileSync(controlC, JSON.stringify({}));
  const PORT = 18763;
  const BASE = `http://127.0.0.1:${PORT}`;
  const stubPath = path.join(ROOT, 'test-lote-reconexion-ads.stub.js');
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, DATA_DIR, PORT: String(PORT), SESSION_SECRET: 'test-reconexion-ads',
      ADMIN_TOKEN: 'testtoken-reconexion', OPENAI_API_KEY: '',
      DESTACADO_BOOST_ENABLED: '1', META_ADS_TOKEN: 'TOKEN_POSTY', META_AD_ACCOUNT_ID: '123456',
      STRIPE_SECRET_KEY: 'sk_test_stub_1234567890',
      META_FLB_CONFIG_ID: '1451417137172791', META_FLB_APP_ID: '999888777', META_FLB_APP_SECRET: 'secreto-stub',
      NODE_OPTIONS: `--require ${stubPath}`,
      META_STUB_AUTOINSTALL: '1', META_STUB_LOG: metaLog, STRIPE_STUB_LOG: stripeLog, META_STUB_CONTROL: controlC,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  const dbPath = path.join(DATA_DIR, 'posta.db');
  const q1 = (sql, ...args) => { const d = new DatabaseSync(dbPath); d.exec('PRAGMA busy_timeout = 8000'); try { return d.prepare(sql).get(...args); } finally { d.close(); } };
  const qw = (sql, ...args) => { const d = new DatabaseSync(dbPath); d.exec('PRAGMA busy_timeout = 8000'); try { return d.prepare(sql).run(...args); } finally { d.close(); } };
  const metaCalls = () => { try { return fs.readFileSync(metaLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
  const campPosts = () => metaCalls().filter((c) => c.method === 'POST' && /\/campaigns$/.test(c.path)).length;
  async function waitBoot(tries = 80) {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
      await sleep(500);
    }
    return false;
  }
  async function api(cookie, method, p, body) {
    const rr = await fetch(BASE + p, {
      method, headers: { Cookie: cookie || '', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null; try { data = await rr.json(); } catch (e) {}
    return { status: rr.status, data };
  }
  async function registrar(email) {
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test1234', business_name: 'Negocio ' + email }),
    });
    const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
    return cookies.map((c) => c.split(';')[0]).join('; ');
  }
  const uidDe = (email) => { const u = q1('SELECT id FROM users WHERE email = ?', email); return u && u.id; };
  function seedComun(uid, { igUserId, igUsername }) {
    qw(`INSERT INTO settings (user_id, demo_mode, ig_user_id) VALUES (?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET demo_mode = 0, ig_user_id = excluded.ig_user_id`, uid, igUserId);
    qw(`INSERT INTO profiles (user_id, ig_username, ig_connected) VALUES (?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET ig_username = excluded.ig_username, ig_connected = 1`, uid, igUsername);
    qw(`UPDATE users SET stripe_customer_id = 'cus_stub_1' WHERE id = ?`, uid);
  }
  // La conexión capturada con las cuentas del OTRO idioma (el caso
  // real del 19/11): Página «Posty.», IG EN, cuenta «Posty» (777001).
  function seedConexionEN(uid) {
    qw(`INSERT INTO ig_ads_connections (user_id, suat, fb_page_id, fb_page_name, primary_ad_account_id, ad_currency, ad_accounts, ig_account_ids, ig_accounts, status)
        VALUES (?, 'SUAT_TEST', '555111', 'Posty.', '777001', 'USD', '[{"account_id":"777001","name":"Cuenta Posty EN","currency":"USD","account_status":1}]', '["555002"]', '[{"id":"555002","username":"postycommunitymanager","page_id":"555111","usable_en_cuenta":true}]', 'connected')
        ON CONFLICT(user_id) DO UPDATE SET suat = excluded.suat, primary_ad_account_id = excluded.primary_ad_account_id`, uid);
  }
  function seedPost(uid, media) {
    const r = qw(`INSERT INTO posts (user_id, image_path, caption, status, ig_media_id, published_at) VALUES (?, '/img.jpg', 'posteo de prueba', 'published', ?, datetime('now'))`, uid, media);
    return Number(r.lastInsertRowid);
  }
  const CX_ESPERADA = { page_id: '555111', page_name: 'Posty.', ig_id: '555002', ig_username: 'postycommunitymanager', ad_account_id: '777001', ad_account_name: 'Cuenta Posty EN' };
  const cxOk = (cx) => !!cx && Object.keys(cx).length === 6 && Object.keys(CX_ESPERADA).every((k) => cx[k] === CX_ESPERADA[k]);

  try {
    check('C0 · boot: server levanta', await waitBoot());
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    check('C0b · /api/version = BUILD del lote (v1190)', ver.build === '20261105-v1190', String(ver.build));

    // ── LISTA: compuerta lista, conexión capturada con OTRAS cuentas ──
    const cookieL = await registrar('reconexion-lista@example.com');
    const uidL = uidDe('reconexion-lista@example.com');
    seedComun(uidL, { igUserId: '555009', igUsername: 'posty.communitymanager' });
    seedConexionEN(uidL);
    const postL = seedPost(uidL, 'MEDIA_OK');

    const elL = await api(cookieL, 'GET', '/api/ads/billetera/elegibles');
    check('C1 · elegibles con la compuerta LISTA: ads_ready true (riel cliente)',
      elL.status === 200 && elL.data && elL.data.ok === true && elL.data.ads_ready === true, JSON.stringify(elL.data && { ads_ready: elL.data.ads_ready, motivo: elL.data.motivo }));
    check('C2 · elegibles LISTA: connect_url presente AUNQUE la compuerta esté lista (el cambio 1)',
      !!elL.data && elL.data.connect_url === '/api/ig/unified/go', JSON.stringify(elL.data && elL.data.connect_url));
    check('C3 · elegibles LISTA: conexion = el detalle guardado exacto (Página · IG · cuenta)',
      !!elL.data && cxOk(elL.data.conexion), JSON.stringify(elL.data && elL.data.conexion));
    const cfgL = await api(cookieL, 'GET', '/api/ads/config');
    check('C4 · /api/ads/config LISTA: el mismo detalle + la misma URL (la fila de Conexiones)',
      cfgL.status === 200 && !!cfgL.data && cxOk(cfgL.data.conexion) && cfgL.data.connect_url === '/api/ig/unified/go',
      JSON.stringify(cfgL.data && { conexion: cfgL.data.conexion, connect_url: cfgL.data.connect_url }));

    // ── SIN: Instagram conectado, pero ninguna conexión de Ads ──
    const cookieS = await registrar('reconexion-sin@example.com');
    const uidS = uidDe('reconexion-sin@example.com');
    seedComun(uidS, { igUserId: '555009', igUsername: 'posty.communitymanager' });
    const elS = await api(cookieS, 'GET', '/api/ads/billetera/elegibles');
    check('C5 · elegibles SIN conexión: la clave conexion viaja y vale null (no rompe), URL presente',
      elS.status === 200 && !!elS.data && ('conexion' in elS.data) && elS.data.conexion === null
      && elS.data.connect_url === '/api/ig/unified/go', JSON.stringify(elS.data && { conexion: elS.data.conexion, connect_url: elS.data.connect_url }));
    const cfgS = await api(cookieS, 'GET', '/api/ads/config');
    check('C6 · /api/ads/config SIN conexión: conexion null + connect_url presente',
      cfgS.status === 200 && !!cfgS.data && cfgS.data.conexion === null && cfgS.data.connect_url === '/api/ig/unified/go',
      JSON.stringify(cfgS.data && { conexion: cfgS.data.conexion, connect_url: cfgS.data.connect_url }));

    // ── IDENTIDAD: el impulso del posteo de la ES con la conexión de la EN ──
    const campsAntes = campPosts();
    const imL = await api(cookieL, 'POST', '/api/ads/billetera/impulsar', { posteoId: postL, montoUSD: 20 });
    check('C7 · impulsar posteo de otra cuenta → 409 ig_fuera_de_conexion',
      imL.status === 409 && imL.data && imL.data.motivo === 'ig_fuera_de_conexion', JSON.stringify(imL.data));
    check('C8 · el 409 lleva LAS DOS identidades (ig_duena = la del posteo · ig_conexion = la guardada)',
      !!imL.data && imL.data.ig_duena === 'posty.communitymanager'
      && JSON.stringify(imL.data.ig_conexion) === JSON.stringify(['postycommunitymanager']),
      JSON.stringify(imL.data && { ig_duena: imL.data.ig_duena, ig_conexion: imL.data.ig_conexion }));
    check('C9 · el freno creó CERO objetos en Meta', campPosts() === campsAntes);
    const rowL = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidL, postL);
    check('C10 · el intento quedó registrado como error, sin ids de campaña',
      !!rowL && rowL.status === 'error' && !rowL.meta_campaign_id);
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) {}
    if (mal) console.error('\n--- log del servidor (últimas 40 líneas) ---\n' + srvLog.split('\n').slice(-40).join('\n'));
  }
  console.log(`\ntest-lote-reconexion-ads: ${ok}/${ok + mal} ok`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', (e && e.stack) || e); process.exit(1); });
