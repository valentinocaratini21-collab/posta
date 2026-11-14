// test-lote-impulsar-reriel.js — SUITE DEL LOTE IMPULSAR-DIRECTO-RE-RIELADO
//
// El flujo de Impulsar directo corre sobre el riel de la cuenta del
// CLIENTE (composición CONEXIÓN-PÁGINA + FEE-IMPULSAR +
// IMPULSAR-DIRECTO-UN-CLIC): la campaña se crea en la cuenta
// publicitaria del cliente con su SUAT y el presupuesto ÍNTEGRO, la
// billetera de Posty NO se toca en ese camino, y el 10% de gestión se
// cobra aparte con la tarjeta guardada SOLO si la campaña quedó
// corriendo (costura ads-fee, verificada con el token del cliente).
// Sin conexión: ads_not_connected + connect_url, sin cargos. Fallo de
// Meta: cero cargos. La cuenta propia sigue por el riel legado
// (débito de billetera, campaña en la cuenta de Posty).
//
// Dobles: Meta y Stripe se stubbean en el proceso del server con
// test-lote-impulsar-reriel.stub.js (NODE_OPTIONS=--require): Graph
// queda registrado en meta-calls.jsonl y los PaymentIntents en
// stripe-calls.jsonl, ambos dentro del DATA_DIR de la corrida.
//
// Uso: node test-lote-impulsar-reriel.js [--keep]
//      RERIEL_CONTROL=1 RERIEL_TREE=<árbol base> → reproduce el hueco.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SUITE_DIR = __dirname;
const DIR = process.env.RERIEL_TREE || SUITE_DIR;
const CONTROL = process.env.RERIEL_CONTROL === '1';
const KEEP = process.argv.includes('--keep');
const PORT = 35251;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = `/tmp/reriel-${CONTROL ? 'control-' : ''}${process.pid}`;
const STUB_LOG = path.join(DATA_DIR, 'meta-calls.jsonl');
const STRIPE_LOG = path.join(DATA_DIR, 'stripe-calls.jsonl');

let pass = 0, fail = 0; const fails = [];
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name); console.log('  ✗ FALLO:', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const count = (s, sub) => String(s).split(sub).length - 1;

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
    return { status: res.status, location: res.headers.get('location') || '', json, text };
  };
}

const readLog = (f) => {
  try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); }
  catch (e) { return []; }
};

async function main() {
  console.log(`\n=== SUITE LOTE IMPULSAR-DIRECTO-RE-RIELADO ${CONTROL ? '(CONTROL: base sin el lote)' : ''} ===`);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // ---------- A) Estática ----------
  console.log('\n[A] Estática');
  const serverSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
  const dbSrc = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
  if (!CONTROL) {
    ok(serverSrc.includes("require('./ads-fee')"), 'A1 server requiere ads-fee');
    ok(count(serverSrc, 'metaToken: gate.suat') === 3, 'A2 la costura del fee recibe el SUAT en los 3 caminos del cliente', count(serverSrc, 'metaToken: gate.suat'));
    ok(count(serverSrc, 'feeImpulsoTrasActivacion(') === 5, 'A3 feeImpulsoTrasActivacion: definición + legado + 3 del cliente', count(serverSrc, 'feeImpulsoTrasActivacion('));
    ok(serverSrc.includes('ad_boost_riel_cliente'), 'A4 el impulso del cliente deja su marca de track');
    const iHandler = serverSrc.indexOf("app.post('/api/ads/billetera/impulsar'");
    const iBranch = serverSrc.indexOf('RIEL DEL CLIENTE', iHandler);
    const iSaldo = serverSrc.indexOf('adsBilletera.impulsarConSaldo', iHandler);
    ok(iHandler > 0 && iBranch > iHandler && iSaldo > iBranch, 'A5 la rama del cliente corre ANTES de impulsarConSaldo (la billetera no se toca)');
    ok(serverSrc.includes("connect_url: gate.connect_url"), 'A6 sin conexión: la respuesta lleva connect_url');
    ok(serverSrc.includes("code: 'ads_not_connected'"), 'A7 la compuerta devuelve el código ads_not_connected');
    const gateBlock = serverSrc.slice(serverSrc.indexOf('const ADS_GATE_MSG'), serverSrc.indexOf('const ADS_GATE_MSG') + 1600);
    const sinCuentaLine = (gateBlock.match(/ads_not_connected: '[^']*'/) || [''])[0];
    ok(sinCuentaLine.length > 0 && !/te avisamos/i.test(sinCuentaLine) && !/escribinos/i.test(sinCuentaLine), 'A8 el texto de falta de conexión no dice «te avisamos» ni «escribinos»');
    const iSettings = dbSrc.indexOf('CREATE TABLE IF NOT EXISTS settings');
    const iConn = dbSrc.indexOf('CREATE TABLE IF NOT EXISTS ig_ads_connections');
    ok(iSettings >= 0 && iConn > iSettings, 'A9 ig_ads_connections nace después del CREATE de settings');
    ok(dbSrc.includes('CREATE TABLE IF NOT EXISTS ad_fees'), 'A10 la tabla ad_fees está en db.js');
    let feeMod = null;
    try { feeMod = require(path.join(DIR, 'ads-fee.js')); } catch (e) {}
    ok(feeMod && typeof feeMod.cobrarFeeCampanaCorriendo === 'function', 'A11 ads-fee exporta la costura');
    ok(feeMod && feeMod.desgloseFee(5000).feeCents === 500 && feeMod.desgloseFee(5000).totalCents === 5500, 'A12 desglose $50 → $5 → $55');
    ok(count(appSrc, 'pzAdsImpulsarBloqueo') === 2, 'A13 app.js: el flujo directo de un clic está (def + llamada)', count(appSrc, 'pzAdsImpulsarBloqueo'));
    ok(count(appSrc, 'enTarjeta') === 7, 'A14 app.js: enTarjeta ×7 (censo del lote directo)', count(appSrc, 'enTarjeta'));
    ok(appSrc.includes("case 'sin_cuenta_publicitaria':"), 'A15 app.js: texto del motivo sin_cuenta_publicitaria');
    ok(serverSrc.includes("const BUILD_ID = '20261105-v1048';"), 'A16 BUILD estampado por el preparador a vivo+1 = v1048 (re-pin con causa: el builder lo dejó en v1028 a propósito, para que lo fije el preparador)');
  } else {
    ok(!serverSrc.includes("require('./ads-fee')"), 'CONTROL A1 la base no tiene el módulo del fee');
    ok(!serverSrc.includes('ad_boost_riel_cliente'), 'CONTROL A2 la base no tiene el riel del cliente');
    ok(count(appSrc, 'pzAdsImpulsarBloqueo') === 0, 'CONTROL A3 la base no tiene el flujo directo');
  }

  // ---------- Boot ----------
  console.log('\n[boot] server real (Meta + Stripe stubbeados), DATA_DIR=' + DATA_DIR);
  const env = {
    ...process.env,
    PORT: String(PORT), DATA_DIR,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    NODE_OPTIONS: '--require ' + path.join(SUITE_DIR, 'test-lote-impulsar-reriel.stub.js'),
    META_STUB_AUTOINSTALL: '1', META_STUB_LOG: STUB_LOG, STRIPE_STUB_LOG: STRIPE_LOG,
    META_FLB_CONFIG_ID: 'CFG_TEST_123',
    IG_APP_ID: 'APP_TEST', IG_APP_SECRET: 'SECRET_TEST',
    META_ADS_TOKEN: 'TOKEN_POSTY', META_AD_ACCOUNT_ID: '29027789776849841',
    STRIPE_SECRET_KEY: 'sk_test_stub_reriel_123456',
    ADMIN_TOKEN: 'adm-reriel', TRIAL_TEST_KEY: 'test-reriel',
    DESTACADO_BOOST_ENABLED: '1',
    OPENAI_API_KEY: '',
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

  async function registerAndSeed(email, igId) {
    const jar = {};
    const req = reqFactory(jar);
    if (process.env.RERIEL_DEBUG) console.log('  [dbg] register', email);
    const r = await req('POST', '/api/auth/register', { name: 'Test', email, password: 'clave-larga-123' });
    if (r.status !== 200) throw new Error('register ' + email + ' → ' + r.status + ' ' + r.text.slice(0, 200));
    const uid = seedDb(db => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id);
    if (igId) seedDb(db => db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token, demo_mode) VALUES (?, ?, 'IG_LONG', 0) ON CONFLICT(user_id) DO UPDATE SET ig_user_id = excluded.ig_user_id, ig_access_token = 'IG_LONG', demo_mode = 0").run(uid, igId));
    return { jar, req, uid };
  }
  const seedPost = (uid, media) => seedDb(db => db.prepare("INSERT INTO posts (user_id, image_path, caption, status, ig_media_id, week_key) VALUES (?, '/img/test.jpg', 'Posteo pauta', 'published', ?, '2026-W46')").run(uid, media).lastInsertRowid);
  // Sin pasar por el bucle de reintentos de seedDb: en el CONTROL la
  // tabla no existe y reintentar con busy-wait congela el event loop
  // de la suite (los sockets keep-alive se pudren y el fetch siguiente
  // cae con «other side closed»).
  const seedConn = (uid, suat) => {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(path.join(DATA_DIR, 'posta.db'));
      db.prepare("INSERT INTO ig_ads_connections (user_id, suat, client_business_id, config_id, ig_account_ids, fb_page_id, fb_page_name, ad_accounts, primary_ad_account_id, ad_currency, status, connected_at) VALUES (?, ?, 'BIZ900', 'CFG_TEST_123', '[\"555001\"]', '555111', 'Página Cliente', '[]', '777001', 'USD', 'connected', datetime('now'))").run(uid, suat);
      db.close();
    } catch (e) { /* CONTROL: la base no tiene la tabla */ }
  };
  const seedCustomer = (uid, cus) => seedDb(db => db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(cus, uid));
  const metaCalls = () => readLog(STUB_LOG);
  const stripeCalls = () => readLog(STRIPE_LOG);
  const campaignsOn = (acct, token) => metaCalls().filter(c => c.method === 'POST' && c.path === `/act_${acct}/campaigns` && (!token || c.token === token));

  try {
    // ---------- Usuarios ----------
    const CLI = await registerAndSeed('cli@reriel.test', '555001');
    seedCustomer(CLI.uid, 'cus_cli'); seedConn(CLI.uid, 'SUAT_TEST');
    const cliPost = seedPost(CLI.uid, 'MEDIA_C1');
    const cliPost2 = seedPost(CLI.uid, 'MEDIA_C2');
    const cliPost3 = seedPost(CLI.uid, 'MEDIA_C3');
    const FALLA = await registerAndSeed('falla@reriel.test', '555001');
    seedCustomer(FALLA.uid, 'cus_falla'); seedConn(FALLA.uid, 'SUAT_FALLA');
    const fallaPost = seedPost(FALLA.uid, 'MEDIA_F1');
    const SIN = await registerAndSeed('sin@reriel.test', '424242');
    const sinPost = seedPost(SIN.uid, 'MEDIA_S1');
    const PRO = await registerAndSeed('propio@reriel.test', '999001');
    seedCustomer(PRO.uid, 'cus_propio');
    seedDb(db => db.prepare("INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (?, 10000, 'USD') ON CONFLICT(user_id) DO UPDATE SET balance_cents = 10000, currency = 'USD'").run(PRO.uid));
    const proPost = seedPost(PRO.uid, 'MEDIA_P1');

    if (CONTROL) {
      console.log('\n[B-CONTROL] El hueco en la base');
      if (process.env.RERIEL_DEBUG) console.log('  [dbg] impulso control');
      const r = await CLI.req('POST', '/api/ads/billetera/impulsar', { posteoId: Number(cliPost), montoUSD: 50 });
      ok(r.status === 409 && !(r.json && r.json.riel), 'C1 la base no conoce el riel del cliente (409 sin riel)');
      ok(campaignsOn('777001').length === 0, 'C2 la base no crea la campaña en la cuenta del cliente');
      const feeRows = seedDb(db => { try { return db.prepare('SELECT COUNT(*) n FROM ad_fees').get().n; } catch (e) { return -1; } });
      ok(feeRows === -1 || feeRows === 0, 'C3 la base no registra fees (sin tabla o en cero)');
      ok(stripeCalls().length === 0, 'C4 la base no cobra nada por Stripe en este flujo');
    } else {
      // ---------- B) Riel del cliente: billetera/impulsar ----------
      console.log('\n[B] Riel del cliente — /api/ads/billetera/impulsar');
      const r1 = await CLI.req('POST', '/api/ads/billetera/impulsar', { posteoId: Number(cliPost), montoUSD: 50 });
      ok(r1.status === 200 && r1.json && r1.json.ok && r1.json.riel === 'cliente', 'B1 el impulso del cliente responde ok con riel cliente', );
      ok(r1.json && /^CAMP_/.test(r1.json.anuncioId || ''), 'B2 devuelve el id de la campaña creada');
      const campId = r1.json && r1.json.anuncioId;
      ok(campaignsOn('777001', 'SUAT_TEST').length === 1, 'B3 la campaña se creó en act_ del CLIENTE con su SUAT');
      const adsetCall = metaCalls().find(c => c.method === 'POST' && c.path === '/act_777001/adsets');
      ok(adsetCall && String(adsetCall.body.lifetime_budget) === '5000', 'B4 el presupuesto en Meta es ÍNTEGRO ($50, sin split interno)');
      const brow = seedDb(db => db.prepare('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?').get(CLI.uid, Number(cliPost)));
      ok(brow && brow.status === 'active' && brow.budget_cents === 5000 && brow.spend_cents === 5000 && brow.fee_cents === 0 && brow.currency === 'USD' && brow.meta_campaign_id === campId, 'B5 ad_boosts: activa, presupuesto íntegro, fee_cents 0 (el fee va aparte)');
      const txCli = seedDb(db => db.prepare('SELECT COUNT(*) n FROM ad_transactions WHERE user_id = ?').get(CLI.uid).n);
      ok(txCli === 0, 'B6 la billetera NO se tocó: cero movimientos');
      const walCli = seedDb(db => { const w = db.prepare('SELECT balance_cents FROM ad_wallets WHERE user_id = ?').get(CLI.uid); return w ? w.balance_cents : 0; });
      ok(walCli === 0, 'B7 el saldo del cliente quedó intacto');
      // La costura del fee es asíncrona: se espera su registro.
      let feeRow = null;
      for (let i = 0; i < 16 && !feeRow; i++) {
        await sleep(500);
        feeRow = seedDb(db => db.prepare('SELECT * FROM ad_fees WHERE campana_ref = ?').get('meta:' + campId)) || null;
        if (feeRow && feeRow.estado !== 'cobrado') feeRow = feeRow; // cualquier fila prueba el disparo; se re-chequea abajo
        if (feeRow && feeRow.estado === 'cobrado') break;
      }
      ok(!!feeRow, 'B8 la costura del fee se disparó para la campaña del cliente');
      ok(feeRow && feeRow.estado === 'cobrado' && feeRow.pauta_cents === 5000 && feeRow.fee_cents === 500, 'B9 fee COBRADO: 10% de los $50 íntegros = $5', feeRow && feeRow.estado);
      const sc1 = stripeCalls().filter(c => c.tipo === 'fee_impulso');
      ok(sc1.length === 1 && sc1[0].amount === 500 && sc1[0].customer === 'cus_cli' && sc1[0].off_session === true, 'B10 un solo cobro Stripe: $5 off-session a la tarjeta guardada');
      ok(sc1.length === 1 && sc1[0].idempotencyKey === `feeimpulso:meta:${campId}:pm_test_123`, 'B11 clave de idempotencia campaña+tarjeta');
      const statusReads = metaCalls().filter(c => c.method === 'GET' && c.path === '/' + campId);
      ok(statusReads.length >= 1 && statusReads.every(c => c.token === 'SUAT_TEST'), 'B12 «corriendo» se verificó leyendo con el SUAT del cliente');

      console.log('\n[B2] Reintento del mismo impulso');
      const campsAntes = campaignsOn('777001').length;
      const r2 = await CLI.req('POST', '/api/ads/billetera/impulsar', { posteoId: Number(cliPost), montoUSD: 50 });
      ok(r2.json && (r2.json.ya_creado === true || r2.json.motivo === 'ya_impulsado'), 'B13 el reintento se corta como ya impulsado (guarda del handler o la de la rama), sin duplicar');
      ok(campaignsOn('777001').length === campsAntes, 'B14 no se creó una segunda campaña');
      await sleep(1500);
      ok(stripeCalls().filter(c => c.tipo === 'fee_impulso').length === 1, 'B15 no hubo segundo cobro del fee');
      const feeRow2 = seedDb(db => db.prepare('SELECT * FROM ad_fees WHERE campana_ref = ?').get('meta:' + campId));
      ok(feeRow2 && feeRow2.intentos === 1, 'B16 el fee quedó en un solo intento');

      // ---------- C) Riel del cliente: /api/ads/boost ----------
      console.log('\n[C] Riel del cliente — /api/ads/boost (recomendaciones)');
      const r3 = await CLI.req('POST', '/api/ads/boost', { post_id: Number(cliPost2), budget_cents: 500000 });
      ok(r3.status === 200 && r3.json && r3.json.ok && r3.json.launched === true && r3.json.riel === 'cliente', 'C1 el boost del cliente corre por su riel');
      const brow3 = seedDb(db => db.prepare('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?').get(CLI.uid, Number(cliPost2)));
      ok(brow3 && brow3.status === 'active' && brow3.spend_cents === 500000 && brow3.fee_cents === 0, 'C2 presupuesto íntegro sin split y sin débito (fee_cents 0)');
      ok(seedDb(db => db.prepare('SELECT COUNT(*) n FROM ad_transactions WHERE user_id = ?').get(CLI.uid).n) === 0, 'C3 la billetera sigue sin tocarse');
      let feeRow3 = null;
      for (let i = 0; i < 16; i++) {
        await sleep(500);
        feeRow3 = seedDb(db => db.prepare('SELECT * FROM ad_fees WHERE campaign_id = ?').get(brow3.meta_campaign_id)) || null;
        if (feeRow3 && feeRow3.estado === 'cobrado') break;
      }
      ok(feeRow3 && feeRow3.estado === 'cobrado' && feeRow3.fee_cents === 50000, 'C4 el fee del boost también se cobró (10%)');

      // ---------- D) Riel del cliente: /api/destacado/impulsar ----------
      console.log('\n[D] Riel del cliente — /api/destacado/impulsar');
      const scAntesD = stripeCalls().length;
      const r4 = await CLI.req('POST', '/api/destacado/impulsar', { posteoId: Number(cliPost3), montoUSD: 20 });
      ok(r4.status === 200 && r4.json && r4.json.ok && r4.json.riel === 'cliente' && r4.json.cobroId === null, 'D1 el destacado del cliente corre por su riel, sin cobro íntegro');
      const scD = stripeCalls().slice(scAntesD);
      ok(!scD.some(c => c.amount === 2000), 'D2 NO se cobró el monto entero ($20) con la tarjeta');
      let feeRow4 = null;
      for (let i = 0; i < 16; i++) {
        await sleep(500);
        feeRow4 = seedDb(db => db.prepare('SELECT * FROM ad_fees WHERE campaign_id = ?').get(r4.json.anuncioId)) || null;
        if (feeRow4 && feeRow4.estado === 'cobrado') break;
      }
      ok(feeRow4 && feeRow4.estado === 'cobrado' && feeRow4.pauta_cents === 2000 && feeRow4.fee_cents === 200, 'D3 el fee del destacado: 10% del monto elegido ($20 → $2)');
      const adsetD = metaCalls().filter(c => c.method === 'POST' && c.path === '/act_777001/adsets').pop();
      ok(adsetD && String(adsetD.body.lifetime_budget) === '2000', 'D4 la pauta del destacado corre íntegra en la cuenta del cliente');

      // ---------- E) Fallo de Meta en la cuenta del cliente ----------
      console.log('\n[E] Meta falla creando en la cuenta del cliente');
      const scAntesE = stripeCalls().length;
      const r5 = await FALLA.req('POST', '/api/ads/billetera/impulsar', { posteoId: Number(fallaPost), montoUSD: 50 });
      ok(r5.status === 409 && r5.json && r5.json.motivo === 'anuncio_fallido', 'E1 creación rechazada por Meta → anuncio_fallido');
      ok(metaCalls().some(c => c.method === 'POST' && /campaigns$/.test(c.path) && c.token === 'SUAT_FALLA'), 'E2 la creación se intentó con su SUAT');
      const errRow = seedDb(db => db.prepare("SELECT * FROM ad_boosts WHERE user_id = ? AND status = 'error'").get(FALLA.uid));
      ok(!!errRow, 'E3 queda el registro error para el equipo');
      ok(seedDb(db => db.prepare('SELECT COUNT(*) n FROM ad_fees WHERE user_id = ?').get(FALLA.uid).n) === 0, 'E4 sin campaña no hay fee: cero filas');
      ok(stripeCalls().length === scAntesE, 'E5 cero cargos nuevos en Stripe');
      ok(seedDb(db => db.prepare('SELECT COUNT(*) n FROM ad_transactions WHERE user_id = ?').get(FALLA.uid).n) === 0, 'E6 la billetera tampoco se tocó');

      // ---------- F) Sin conexión capturada ----------
      console.log('\n[F] Cliente sin conexión de pauta');
      const campsAntesF = metaCalls().filter(c => c.method === 'POST' && /campaigns$/.test(c.path)).length;
      const r6 = await SIN.req('POST', '/api/ads/billetera/impulsar', { posteoId: Number(sinPost), montoUSD: 50 });
      ok(r6.status === 409 && r6.json && r6.json.motivo === 'sin_cuenta_publicitaria', 'F1 motivo honesto de falta de conexión');
      ok(r6.json && r6.json.code === 'ads_not_connected', 'F2 código ads_not_connected');
      ok(r6.json && r6.json.connect_url === '/api/ig/unified/go', 'F3 connect_url de un toque en la respuesta');
      ok(metaCalls().filter(c => c.method === 'POST' && /campaigns$/.test(c.path)).length === campsAntesF, 'F4 no se creó ninguna campaña');
      ok(seedDb(db => db.prepare('SELECT COUNT(*) n FROM ad_fees WHERE user_id = ?').get(SIN.uid).n) === 0, 'F5 sin fee');
      ok(!(r6.text || '').includes('escribinos') && !(r6.text || '').includes('te avisamos'), 'F6 nunca «escribinos» ni «te avisamos»');

      // ---------- G) Cuenta propia: riel legado intacto ----------
      console.log('\n[G] Cuenta propia por el riel legado');
      const r7 = await PRO.req('POST', '/api/ads/billetera/impulsar', { posteoId: Number(proPost), montoUSD: 50 });
      ok(r7.status === 200 && r7.json && r7.json.ok && !r7.json.riel, 'G1 la cuenta propia impulsa por el riel de siempre');
      ok(campaignsOn('29027789776849841', 'TOKEN_POSTY').length === 1, 'G2 la campaña se creó en la cuenta de Posty con su token');
      const walPro = seedDb(db => db.prepare('SELECT balance_cents FROM ad_wallets WHERE user_id = ?').get(PRO.uid));
      ok(walPro && walPro.balance_cents === 5000, 'G3 el débito de billetera del riel legado ocurrió ($50)');
      const brow7 = seedDb(db => db.prepare('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?').get(PRO.uid, Number(proPost)));
      ok(brow7 && brow7.status === 'active' && brow7.currency === 'USD', 'G4 el boost legado quedó activo');
      let feePro = null;
      for (let i = 0; i < 16; i++) {
        await sleep(500);
        const sc = stripeCalls().filter(c => c.customer === 'cus_propio' && c.tipo === 'fee_impulso');
        if (sc.length) { feePro = sc[0]; break; }
      }
      ok(feePro && feePro.amount === 500, 'G5 en el riel legado la costura del fee sigue enganchada en el registro de éxito (diseño del lote FEE-IMPULSAR)');
    }
  } finally {
    try { fs.writeFileSync(path.join(DATA_DIR, 'server.log'), serverLog); } catch (e) {}
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { child.kill('SIGKILL'); } catch (e) {}
    if (!KEEP) { try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) {} }
  }

  console.log(`\n=== RESULTADO: ${pass} ok · ${fail} mal ===`);
  if (fails.length) console.log('Fallos:\n - ' + fails.join('\n - '));
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('ERROR SUITE:', e); process.exit(2); });
