// test-lote-cierre-ads.js
// LOTE CIERRE-ADS — activación verificada, cartel de diferencia contra
// el TOTAL y alineación de políticas (SPEC-CIERRE-ADS, 19/11).
// §A · estáticos que fijan cada fix contra la SPEC.
// §B · módulos con Meta/Stripe falsos (el stub hermano): createBoost
//      verifica campaña+conjunto+ANUNCIO y distingue «sin dato» de
//      PAUSED confirmado; reactivarBoost repara; el desglose aprende
//      los totales; el fee pendiente se lee por usuario; el refund a
//      la fuente existe y es idempotente; el asiento sin_dato de la
//      billetera no debita.
// §C · boot real (la PRUEBA DE CIERRE de la SPEC §6 con los fakes
//      inyectados): saldo US$20 → la diferencia hacia el total US$22
//      se carga en un toque → el impulso de un posteo de la cuenta
//      CONECTADA corre → campaña+conjunto+anuncio ACTIVE en Meta →
//      fila 'active' con los tres ids → gestión de US$2 cobrada una
//      sola vez. Negativos: diferencia imposible sin la carga exacta,
//      posteo de la IG fuera de la conexión (freno antes de crear,
//      cero objetos en Meta), fee pendiente que frena el próximo
//      impulso sin tocar la campaña que corre + «Pagar la gestión»,
//      activación fallida que el barrido repara, y destacado con
//      anuncio fallido → REFUND a la tarjeta (no crédito).
// Uso: node test-lote-cierre-ads.js (cwd = raíz del árbol)
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

// ══════════════ §A · ESTÁTICOS ══════════════
console.log('§A · estáticos');
const metaSrc = leer('meta_ads.js');
const feeSrc = leer('ads-fee.js');
const bilSrc = leer('ads-billetera.js');
const cobroSrc = leer('destacado-cobro.js');
const dbSrc = leer('db.js');
const srvSrc = leer('server.js');
const appSrc = leer('public/app.js');

check('A1 · meta_ads: verificarActivos lee también el ANUNCIO (out.ad) y createBoost lo pasa (camp, adset, ad.id)',
  metaSrc.includes('out.ad = await leer(adId)') && metaSrc.includes('verificarActivos(camp.id, adset.id, ad.id, gctx)'));
check('A2 · meta_ads: el error distingue sin dato de PAUSED confirmado (activacion_sin_dato)',
  metaSrc.includes("sinDato ? 'activacion_sin_dato' : 'activacion_fallida'") && metaSrc.includes('err.adStatus'));
check('A3 · meta_ads: camino de reparación exportado (reactivarBoost + lecturas de huérfanas + archivar)',
  ['reactivarBoost', 'listarCampanasPorNombre', 'leerAnunciosDeCampana', 'leerAdsetDeCampana', 'archivarCampana']
    .every((f) => metaSrc.includes(`async function ${f}`) && metaSrc.includes(f + ',')));
check('A4 · ads-fee: desgloseDesdeTotal + feePendienteDeUsuario definidos y exportados',
  feeSrc.includes('function desgloseDesdeTotal(') && feeSrc.includes('function feePendienteDeUsuario(')
  && feeSrc.includes('desgloseDesdeTotal,') && feeSrc.includes('feePendienteDeUsuario,'));
check('A5 · server: gate fee_pendiente en AMBOS endpoints de impulso (billetera + destacado)',
  (srvSrc.match(/motivo: 'fee_pendiente', feeCents:/g) || []).length === 2);
check('A6 · server: endpoint «Pagar la gestión» (POST /api/ads/fees/reintentar) re-invoca la costura con la fila guardada',
  srvSrc.includes("app.post('/api/ads/fees/reintentar'") && srvSrc.includes('campanaRef: String(pend.campana_ref'));
check('A7 · server: barrido de reparación + disparos admin (reparar / reconciliar-huerfanas) + intervalo horario',
  srvSrc.includes('async function barridoReparacionAds()') && srvSrc.includes("app.post('/api/admin/ads/reparar'")
  && srvSrc.includes("app.post('/api/admin/ads/reconciliar-huerfanas'") && srvSrc.includes('barridoReparacionAds().catch'));
check('A8 · server: las filas de error de activación guardan los ids de Meta (riel cliente, ambos endpoints)',
  (srvSrc.match(/activación sin dato en Meta/g) || []).length >= 2
  && ['campaignId', 'adsetId', 'adId'].every((k) => srvSrc.includes(`crDError.${k}`) && srvSrc.includes(`crError.${k}`)));
check('A9 · server: /cargar acepta la diferencia hacia el TOTAL (desgloseDesdeTotal) y la rama ARS declara por qué no aplica',
  srvSrc.includes('adsFee.desgloseDesdeTotal(') && srvSrc.includes('va DENTRO del monto elegido (splitARS'));
check('A10 · server: el destacado devuelve a la FUENTE (reembolsarImpulso) y ya no acredita crédito como default',
  srvSrc.includes('destacadoCobro.reembolsarImpulso(') && !srvSrc.includes('adsBilletera.acreditarCreditoAnuncioFallido(')
  && cobroSrc.includes('async function reembolsarImpulso(') && cobroSrc.includes('reembolso_${cobroId}'));
check('A11 · db.js: columnas refund_id + repair_intentos + repair_ultimo en ad_boosts',
  dbSrc.includes('ADD COLUMN refund_id') && dbSrc.includes('ADD COLUMN repair_intentos') && dbSrc.includes('ADD COLUMN repair_ultimo'));
check('A12 · ads-billetera: el asiento distingue activacion_sin_dato sin debitar (mismo camino que activacion_fallida)',
  bilSrc.includes("anuncio.motivo === 'activacion_sin_dato'") || bilSrc.includes("anuncio.motivo === 'activacion_fallida' || anuncio.motivo === 'activacion_sin_dato'"));
check('A13 · app.js: pzBoostTotal existe y pzBoostPuede compara el saldo contra el TOTAL',
  appSrc.includes('function pzBoostTotal(') && appSrc.includes('saldo >= pzBoostTotal(m)'));
check('A14 · app.js: pzAdsDiferencia ya no está atada al riel billetera y calcula contra el total',
  (() => { const i = appSrc.indexOf('function pzAdsDiferencia()'); const seg = appSrc.slice(i, i + 1600); return i > 0 && !seg.includes("rielAds !== 'billetera'") && seg.includes('pzBoostTotal(pauta)'); })());
check('A15 · app.js: el cartel del tab con la copy cerrada de la SPEC (§5.2) + su carga en un toque',
  appSrc.includes('function pzAdsTabDiferenciaHTML()') && appSrc.includes('function pzAdsTabCargarDiferencia(')
  && appSrc.includes('para llegar a') && appSrc.includes('de gestión de Posty. Tenés'));
check('A16 · app.js: el botón de impulsar queda REEMPLAZADO por el cartel cuando falta (render de la tarjeta)',
  appSrc.includes('difTab.pauta === mSel') && appSrc.includes('pzAdsTabDiferenciaHTML()'));
check('A17 · app.js: motivo fee_pendiente con la copy de la SPEC + botón «Pagar la gestión» cableado',
  appSrc.includes("case 'fee_pendiente':") && appSrc.includes('sigue corriendo normal')
  && appSrc.includes('function pzBoostFeePendienteAdjuntar(') && appSrc.includes('async function pzAdsPagarFee(')
  && appSrc.includes("api.post('/api/ads/fees/reintentar'"));
check('A18 · app.js: ningún motivo invisible — pzAdsAudienciaSale ya no saltea el fallback con boostError y pzBoostConfirmar garantiza #pzAdsRecMsg',
  !appSrc.includes("j.motivo !== 'audiencia_pendiente' && !s.boostError")
  && appSrc.includes("if (tabMsg && tabMsg !== msgEl) tabMsg.innerHTML = pzBoostErrorHTML("));
check('A19 · sellos del lote: BUILD v1189 ×1 en server.js (v1188 ×0), PZ_BUILD v1189 en app.js, app.js?v=823 en el index ES',
  (srvSrc.match(/20261105-v1189/g) || []).length === 1 && (srvSrc.match(/20261105-v1188/g) || []).length === 0
  && appSrc.includes("const PZ_BUILD = '20261105-v1189';") && leer('public/index.html').includes('app.js?v=823'));

// ══════════════ §B · MÓDULOS CON FAKES ══════════════
(async () => {
  console.log('§B · módulos');
  const TMPB = fs.mkdtempSync(path.join(ROOT, '.tmp-cierre-ads-mod-'));
  const controlPath = path.join(TMPB, 'control.json');
  const stripeLogB = path.join(TMPB, 'stripe.jsonl');
  fs.writeFileSync(controlPath, JSON.stringify({ adActivable: false }));
  process.env.META_STUB_CONTROL = controlPath;
  process.env.STRIPE_STUB_LOG = stripeLogB;
  process.env.META_ADS_TOKEN = 'TOKEN_POSTY';
  process.env.META_AD_ACCOUNT_ID = '123456';
  require('./test-lote-cierre-ads.stub.js').install();
  const MA = require('./meta_ads.js');
  const AF = require('./ads-fee.js');
  const DC = require('./destacado-cobro.js');
  const AB = require('./ads-billetera.js');
  const setControl = (patch) => {
    let c = {}; try { c = JSON.parse(fs.readFileSync(controlPath, 'utf8')); } catch (e) {}
    fs.writeFileSync(controlPath, JSON.stringify({ ...c, ...patch }));
  };
  const boostArgs = (media) => ({ name: 'Posty · test', pageId: '447205365133941', igUserId: '999001', igMediaId: media, spendCents: 2000, days: 7, country: 'AR' });

  // B1 · camino feliz: los tres estados verificados.
  let b1 = null;
  try { b1 = await MA.createBoost(boostArgs('MEDIA_OK')); } catch (e) { b1 = null; }
  check('B1 · createBoost MEDIA_OK devuelve los tres ids', !!(b1 && b1.campaignId && b1.adsetId && b1.adId));
  if (b1) {
    const est = await MA.verificarActivos(b1.campaignId, b1.adsetId, b1.adId);
    check('B1b · verificarActivos lee campaña+conjunto+anuncio ACTIVE', est.campaign === 'ACTIVE' && est.adset === 'ACTIVE' && est.ad === 'ACTIVE');
    const stats = await MA.getBoostStats(b1.campaignId);
    check('B1c · getBoostStats: gasto > 0 en insights', !!stats && Number(stats.spend_cents) > 0, stats && String(stats.spend_cents));
  }
  // B2 · anuncio pausado: campaña+conjunto ACTIVE no alcanzan.
  let errB2 = null;
  try { await MA.createBoost(boostArgs('MEDIA_ADPAUSED')); } catch (e) { errB2 = e; }
  check('B2 · anuncio PAUSED → activacion_fallida con ids y estados leídos',
    !!errB2 && errB2.code === 'activacion_fallida' && !!errB2.campaignId && !!errB2.adsetId && !!errB2.adId
    && errB2.campaignStatus === 'ACTIVE' && errB2.adStatus === 'PAUSED',
    errB2 && (errB2.code + ' ' + errB2.message));
  // B3 · sin dato: motivo interno distinto.
  let errB3 = null;
  try { await MA.createBoost(boostArgs('MEDIA_NODATA')); } catch (e) { errB3 = e; }
  check('B3 · lecturas caídas (puro sin dato) → activacion_sin_dato, distinguible en el registro',
    !!errB3 && errB3.code === 'activacion_sin_dato' && !!errB3.campaignId, errB3 && errB3.code);
  // B4 · la reparación re-enciende y verifica los tres.
  if (errB2) {
    setControl({ adActivable: true });
    const rep = await MA.reactivarBoost({ campaignId: errB2.campaignId, adsetId: errB2.adsetId, adId: errB2.adId });
    check('B4 · reactivarBoost repara la activación fallida (los tres ACTIVE)', rep.ok === true && rep.estados.ad === 'ACTIVE');
    setControl({ adActivable: false });
  } else check('B4 · reactivarBoost repara la activación fallida', false, 'sin campaña de B2');
  // B5 · el desglose aprende los totales.
  check('B5 · desgloseDesdeTotal: 2200→pauta 2000 fee 200 · 5500→5000 · 11000→10000 · 2300→null',
    typeof AF.desgloseDesdeTotal === 'function'
    && AF.desgloseDesdeTotal(2200).pautaCents === 2000 && AF.desgloseDesdeTotal(2200).feeCents === 200
    && AF.desgloseDesdeTotal(5500).pautaCents === 5000 && AF.desgloseDesdeTotal(11000).pautaCents === 10000
    && AF.desgloseDesdeTotal(2300) === null && AF.desgloseDesdeTotal(0) === null);
  // B6 · el fee pendiente por usuario (la lectura del gate).
  const mdb = new DatabaseSync(':memory:');
  mdb.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
  mdb.exec('INSERT INTO users (id) VALUES (7), (8), (9)');
  AF.ensureFeeSchema(mdb);
  const insFee = (uid, ref, estado, fee) => mdb.prepare(`INSERT INTO ad_fees (user_id, campana_ref, campaign_id, adset_id, post_id, pauta_cents, fee_cents, moneda, estado) VALUES (?,?,?,?,?,2000,?,'USD',?)`).run(uid, ref, 'CAMP_X', 'ADSET_X', 1, fee, estado);
  insFee(7, 'meta:C1', 'cobrado', 200);
  insFee(7, 'meta:C2', 'pendiente_fallo', 200);
  insFee(8, 'meta:C3', 'sin_medio', 500);
  const fp7 = typeof AF.feePendienteDeUsuario === 'function' ? AF.feePendienteDeUsuario(mdb, 7) : null;
  const fp8 = typeof AF.feePendienteDeUsuario === 'function' ? AF.feePendienteDeUsuario(mdb, 8) : null;
  check('B6 · feePendienteDeUsuario: trae la fila pendiente (no la cobrada) y la sin_medio; sin filas → null',
    !!fp7 && fp7.campana_ref === 'meta:C2' && fp7.fee_cents === 200 && !!fp8 && fp8.estado === 'sin_medio'
    && typeof AF.feePendienteDeUsuario === 'function' && AF.feePendienteDeUsuario(mdb, 9) === null);
  mdb.close();
  // B7 · el refund a la fuente, idempotente por cobroId.
  let refundArgs = null;
  const fakeClient = { refunds: { create: async (params, opts) => { refundArgs = { params, opts }; return { id: 're_test_1', status: 'succeeded' }; } } };
  const rf1 = typeof DC.reembolsarImpulso === 'function'
    ? await DC.reembolsarImpulso({ client: fakeClient, cobroId: 'pi_123' }) : { ok: false };
  check('B7 · reembolsarImpulso: refund sobre el PaymentIntent con clave reembolso_<cobroId>',
    rf1.ok === true && rf1.refundId === 're_test_1' && !!refundArgs && refundArgs.params.payment_intent === 'pi_123'
    && refundArgs.opts.idempotencyKey === 'reembolso_pi_123');
  const rf2 = typeof DC.reembolsarImpulso === 'function'
    ? await DC.reembolsarImpulso({ client: { refunds: { create: async () => { throw new Error('stripe caído'); } } }, cobroId: 'pi_9' }) : { ok: false, motivo: 'sin_funcion' };
  const rf3 = typeof DC.reembolsarImpulso === 'function'
    ? await DC.reembolsarImpulso({ client: null, cobroId: 'pi_9' }) : { ok: false, motivo: 'sin_funcion' };
  check('B7b · reembolsarImpulso: fallo de Stripe o sin cliente → ok:false (la urgencia la registra el llamador)',
    rf2.ok === false && rf2.motivo === 'reembolso_fallido' && rf3.ok === false);
  // B8 · el asiento sin_dato de la billetera: sin débito, tipo propio.
  for (const motivoAct of ['activacion_sin_dato', 'activacion_fallida']) {
    const regs = [];
    let debito = false;
    let r = null;
    try {
      r = await AB.impulsarConSaldo({
        clienteId: 5, posteoId: 9, montoUSD: 20, moneda: 'USD', zona: 'AR',
        env: { DESTACADO_BOOST_ENABLED: '1' }, adsConfigurado: true, paginaAutorizada: true, permisoAds: true,
        conversionARS: (m) => m * 100, saldoCentsUSD: 5000, saldoCentsARS: 0, splitARS: null,
        fecha: '2026-11-19', demo: false,
        buscarDebito: async () => null,
        crearAnuncio: async () => ({ ok: false, motivo: motivoAct, campaignId: 'C1', adsetId: 'A1', adId: 'D1', anuncioId: 'C1', error: 'detalle de activación' }),
        debitar: async () => { debito = true; return { ok: true, saldoNuevo: 0 }; },
        registrar: async (rec) => { regs.push(rec); },
      });
    } catch (e) { r = null; }
    check(`B8 · impulsarConSaldo con ${motivoAct}: asiento tipo '${motivoAct}', SIN débito, motivo externo anuncio_fallido`,
      r.ok === false && r.motivo === 'anuncio_fallido' && debito === false && regs.length === 1 && regs[0].tipo === motivoAct && regs[0].campaignId === 'C1');
  }
  try { fs.rmSync(TMPB, { recursive: true, force: true }); } catch (e) {}

  // ══════════════ §C · BOOT — LA PRUEBA DE CIERRE ══════════════
  console.log('§C · boot (prueba de cierre)');
  const DATA_DIR = fs.mkdtempSync(path.join(ROOT, '.tmp-cierre-ads-boot-'));
  const metaLog = path.join(DATA_DIR, 'meta.jsonl');
  const stripeLog = path.join(DATA_DIR, 'stripe.jsonl');
  const controlC = path.join(DATA_DIR, 'control.json');
  fs.writeFileSync(controlC, JSON.stringify({ adActivable: false, feeFallaUnaVez: false }));
  const setControlC = (patch) => {
    let c = {}; try { c = JSON.parse(fs.readFileSync(controlC, 'utf8')); } catch (e) {}
    fs.writeFileSync(controlC, JSON.stringify({ ...c, ...patch }));
  };
  const PORT = 18757;
  const BASE = `http://127.0.0.1:${PORT}`;
  const stubPath = path.join(ROOT, 'test-lote-cierre-ads.stub.js');
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, DATA_DIR, PORT: String(PORT), SESSION_SECRET: 'test-cierre-ads',
      ADMIN_TOKEN: 'testtoken-cierre', OPENAI_API_KEY: '',
      DESTACADO_BOOST_ENABLED: '1', META_ADS_TOKEN: 'TOKEN_POSTY', META_AD_ACCOUNT_ID: '123456',
      STRIPE_SECRET_KEY: 'sk_test_stub_1234567890',
      NODE_OPTIONS: `--require ${stubPath}`,
      META_STUB_AUTOINSTALL: '1', META_STUB_LOG: metaLog, STRIPE_STUB_LOG: stripeLog, META_STUB_CONTROL: controlC,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  const dbPath = path.join(DATA_DIR, 'posta.db');
  const q = (sql, ...args) => { const d = new DatabaseSync(dbPath); d.exec('PRAGMA busy_timeout = 8000'); try { return d.prepare(sql).all(...args); } finally { d.close(); } };
  const q1 = (sql, ...args) => { const d = new DatabaseSync(dbPath); d.exec('PRAGMA busy_timeout = 8000'); try { return d.prepare(sql).get(...args); } finally { d.close(); } };
  const qw = (sql, ...args) => { const d = new DatabaseSync(dbPath); d.exec('PRAGMA busy_timeout = 8000'); try { return d.prepare(sql).run(...args); } finally { d.close(); } };
  const metaCalls = () => { try { return fs.readFileSync(metaLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
  const stripeCalls = () => { try { return fs.readFileSync(stripeLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
  const campPosts = () => metaCalls().filter((c) => c.method === 'POST' && /\/campaigns$/.test(c.path)).length;
  async function waitBoot(tries = 80) {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
      await sleep(500);
    }
    return false;
  }
  async function api(cookie, method, p, body, extraHeaders) {
    const rr = await fetch(BASE + p, {
      method, headers: { Cookie: cookie || '', 'Content-Type': 'application/json', ...(extraHeaders || {}) },
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
  function seedConexion(uid, suat, cuenta) {
    qw(`INSERT INTO ig_ads_connections (user_id, suat, fb_page_id, primary_ad_account_id, ad_currency, ig_account_ids, ig_accounts, status)
        VALUES (?, ?, '555111', ?, 'USD', '["555001"]', '[{"id":"555001","username":"postycommunitymanager","page_id":"555111","usable_en_cuenta":true}]', 'connected')
        ON CONFLICT(user_id) DO UPDATE SET suat = excluded.suat, primary_ad_account_id = excluded.primary_ad_account_id`, uid, suat, cuenta);
  }
  function seedPost(uid, media) {
    const r = qw(`INSERT INTO posts (user_id, image_path, caption, status, ig_media_id, published_at) VALUES (?, '/img.jpg', 'posteo de prueba', 'published', ?, datetime('now'))`, uid, media);
    return Number(r.lastInsertRowid);
  }
  async function esperarFee(uid, campanaRef, estado, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const f = q1('SELECT * FROM ad_fees WHERE user_id = ? AND campana_ref = ?', uid, campanaRef);
      if (f && f.estado === estado) return f;
      await sleep(400);
    }
    return q1('SELECT * FROM ad_fees WHERE user_id = ? AND campana_ref = ?', uid, campanaRef);
  }

  try {
    check('C0 · boot: server levanta', await waitBoot());
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    check('C0b · /api/version = BUILD del lote (v1189)', ver.build === '20261105-v1189', String(ver.build));

    // ── Usuario A: riel cliente (la cuenta CONECTADA, EN) ──
    const cookieA = await registrar('cierre-a@example.com');
    const uidA = uidDe('cierre-a@example.com');
    seedComun(uidA, { igUserId: '555001', igUsername: 'postycommunitymanager' });
    seedConexion(uidA, 'SUAT_TEST', '777001');
    const postA1 = seedPost(uidA, 'MEDIA_OK');

    const cgA = await api(cookieA, 'POST', '/api/ads/billetera/cargar', { montoUSD: 20 });
    check('C1 · carga fija de US$20 acredita (saldo 2000)', cgA.status === 200 && cgA.data && cgA.data.ok === true && cgA.data.balance_cents === 2000, JSON.stringify(cgA.data));
    // La diferencia IMPOSIBLE primero: $3 no es la falta exacta hacia 22.
    const cgMal = await api(cookieA, 'POST', '/api/ads/billetera/cargar', { montoUSD: 3, diferencia: { montoImpulsoUSD: 22 } });
    check('C2 · diferencia que no es la falta exacta → 409 diferencia_invalida, sin cobro',
      cgMal.status === 409 && cgMal.data && cgMal.data.motivo === 'diferencia_invalida'
      && q1('SELECT balance_cents FROM ad_wallets WHERE user_id = ?', uidA).balance_cents === 2000);
    // EL CASO DE VALENTINO: saldo US$20, total US$22 → cargar los US$2.
    const cgDif = await api(cookieA, 'POST', '/api/ads/billetera/cargar', { montoUSD: 2, diferencia: { montoImpulsoUSD: 22 } });
    check('C3 · LA DIFERENCIA HACIA EL TOTAL: US$2 exactos en un toque → saldo US$22',
      cgDif.status === 200 && cgDif.data && cgDif.data.ok === true && cgDif.data.diferencia === true && cgDif.data.balance_cents === 2200,
      JSON.stringify(cgDif.data));
    const piDif = stripeCalls().filter((c) => c.tipo === 'payment_intent' && c.amount === 200 && c.metadata_tipo === 'billetera_carga');
    check('C3b · Stripe cobró exactamente US$2 por la diferencia', piDif.length === 1);

    // El impulso del posteo REAL de la cuenta conectada.
    const imA1 = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA1, montoUSD: 20 });
    check('C4 · impulsar posteo de la cuenta conectada → ok, riel cliente', imA1.status === 200 && imA1.data && imA1.data.ok === true && imA1.data.riel === 'cliente', JSON.stringify(imA1.data));
    const rowA1 = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidA, postA1);
    check('C5 · fila ad_boosts ACTIVE con los TRES ids de Meta',
      !!rowA1 && rowA1.status === 'active' && !!rowA1.meta_campaign_id && !!rowA1.meta_adset_id && !!rowA1.meta_ad_id, rowA1 && rowA1.status);
    const lecturasAd = metaCalls().filter((c) => c.method === 'GET' && rowA1 && c.path === '/' + rowA1.meta_ad_id);
    check('C6 · Meta: el ANUNCIO se leyó para verificarlo ACTIVE (no solo campaña y conjunto)', lecturasAd.length >= 1);
    const feeA1 = await esperarFee(uidA, 'meta:' + (rowA1 && rowA1.meta_campaign_id), 'cobrado');
    check('C7 · gestión de US$2 COBRADA (ad_fees cobrado, fee_cents 200)', !!feeA1 && feeA1.fee_cents === 200, feeA1 && feeA1.estado);
    const feePIs = stripeCalls().filter((c) => c.tipo === 'payment_intent' && c.metadata_tipo === 'fee_impulso');
    check('C7b · un solo cargo de gestión en Stripe, con su clave de idempotencia por campaña',
      feePIs.length === 1 && feePIs[0].amount === 200 && feePIs[0].idempotencyKey.startsWith('feeimpulso:meta:'));
    const imA1b = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA1, montoUSD: 20 });
    check('C8 · segundo toque del mismo impulso → ya creado/ya impulsado, SIN segunda campaña ni segundo fee',
      (imA1b.status === 200 || imA1b.status === 409) && campPosts() === 1
      && stripeCalls().filter((c) => c.tipo === 'payment_intent' && c.metadata_tipo === 'fee_impulso').length === 1,
      JSON.stringify(imA1b.data));

    // ── Negativo (ii): posteo de la IG fuera de la conexión ──
    const cookieB = await registrar('cierre-b@example.com');
    const uidB = uidDe('cierre-b@example.com');
    seedComun(uidB, { igUserId: '555001', igUsername: 'posty.communitymanager' });
    seedConexion(uidB, 'SUAT_TEST', '777001');
    const postB1 = seedPost(uidB, 'MEDIA_OK');
    const campsAntesB = campPosts();
    const imB = await api(cookieB, 'POST', '/api/ads/billetera/impulsar', { posteoId: postB1, montoUSD: 20 });
    check('C9 · posteo de la IG en español (fuera de la conexión) → 409 ig_fuera_de_conexion',
      imB.status === 409 && imB.data && imB.data.motivo === 'ig_fuera_de_conexion', JSON.stringify(imB.data));
    check('C9b · el freno de identidad creó CERO objetos en Meta', campPosts() === campsAntesB);
    const rowB = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidB, postB1);
    check('C9c · el intento quedó registrado como error, sin ids (nada que reparar: nada se creó)',
      !!rowB && rowB.status === 'error' && !rowB.meta_campaign_id);

    // ── Usuario D: riel billetera (cuenta propia) ──
    const cookieD = await registrar('cierre-d@example.com');
    const uidD = uidDe('cierre-d@example.com');
    seedComun(uidD, { igUserId: '999001', igUsername: 'postycommunitymanager' });
    const postD1 = seedPost(uidD, 'MEDIA_OK');
    const postD2 = seedPost(uidD, 'MEDIA_NODATA');
    const postD3 = seedPost(uidD, 'MEDIA_ADPAUSED');
    await api(cookieD, 'POST', '/api/ads/billetera/cargar', { montoUSD: 20 });
    const campsAntesD = campPosts();
    const imD50 = await api(cookieD, 'POST', '/api/ads/billetera/impulsar', { posteoId: postD1, montoUSD: 50 });
    check('C10 · billetera US$20 contra impulso de US$50 → saldo_insuficiente, CERO campañas, saldo intacto',
      imD50.status === 409 && imD50.data && imD50.data.motivo === 'saldo_insuficiente' && campPosts() === campsAntesD
      && q1('SELECT balance_cents FROM ad_wallets WHERE user_id = ?', uidD).balance_cents === 2000);
    const imD2 = await api(cookieD, 'POST', '/api/ads/billetera/impulsar', { posteoId: postD2, montoUSD: 20 });
    const rowD2 = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidD, postD2);
    check('C11 · billetera + activación SIN DATO: asiento distinguible con ids, SIN débito',
      imD2.status === 409 && !!rowD2 && rowD2.status === 'error' && /activación sin dato/.test(rowD2.error || '')
      && !!rowD2.meta_campaign_id && q1('SELECT balance_cents FROM ad_wallets WHERE user_id = ?', uidD).balance_cents === 2000,
      rowD2 && rowD2.error);
    const imD3 = await api(cookieD, 'POST', '/api/ads/billetera/impulsar', { posteoId: postD3, montoUSD: 20 });
    const rowD3 = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidD, postD3);
    check('C12 · billetera + activación FALLIDA: asiento con ids, SIN débito ni fee',
      imD3.status === 409 && !!rowD3 && rowD3.status === 'error' && /activación fallida/.test(rowD3.error || '')
      && !!rowD3.meta_campaign_id && q1('SELECT balance_cents FROM ad_wallets WHERE user_id = ?', uidD).balance_cents === 2000
      && !q1('SELECT id FROM ad_fees WHERE campana_ref = ?', 'meta:' + (rowD3 && rowD3.meta_campaign_id)));

    // ── Negativo (iii): fee pendiente frena el próximo, sin tocar la que corre ──
    setControlC({ feeFallaUnaVez: true });
    const postA2 = seedPost(uidA, 'MEDIA_OK');
    const imA2 = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA2, montoUSD: 20 });
    const rowA2 = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidA, postA2);
    check('C13 · segundo impulso de A corre (su fee va a fallar una vez, por el control)',
      imA2.status === 200 && !!rowA2 && rowA2.status === 'active', JSON.stringify(imA2.data));
    const feeA2pend = await esperarFee(uidA, 'meta:' + (rowA2 && rowA2.meta_campaign_id), 'pendiente_fallo');
    check('C13b · el fee quedó pendiente_fallo (la campaña corre igual)', !!feeA2pend && feeA2pend.fee_cents === 200, feeA2pend && feeA2pend.estado);
    const postA3 = seedPost(uidA, 'MEDIA_OK');
    const campsAntesFee = campPosts();
    const metaAntesFee = metaCalls().length;
    const imA3 = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA3, montoUSD: 20 });
    check('C14 · con fee pendiente, el PRÓXIMO impulso frena: 409 fee_pendiente con feeCents y campanaRef',
      imA3.status === 409 && imA3.data && imA3.data.motivo === 'fee_pendiente' && imA3.data.feeCents === 200
      && imA3.data.campanaRef === 'meta:' + (rowA2 && rowA2.meta_campaign_id), JSON.stringify(imA3.data));
    const toquesCampA2 = metaCalls().slice(metaAntesFee).filter((c) => rowA2 && c.path === '/' + rowA2.meta_campaign_id && c.method === 'POST');
    check('C14b · el gate no creó nada y NO tocó la campaña que corre (ningún POST sobre ella)',
      campPosts() === campsAntesFee && toquesCampA2.length === 0);
    const reFee = await api(cookieA, 'POST', '/api/ads/fees/reintentar', {});
    check('C15 · «Pagar la gestión» cobra el fee pendiente', reFee.status === 200 && reFee.data && reFee.data.estado === 'cobrado', JSON.stringify(reFee.data));
    const feesCampA2 = stripeCalls().filter((c) => (c.tipo === 'payment_intent' || c.tipo === 'payment_intent_fallido') && c.idempotencyKey && c.idempotencyKey.includes((rowA2 && rowA2.meta_campaign_id) || ''));
    check('C15b · el reintento reusó la MISMA clave de idempotencia (un solo cargo neto)',
      feesCampA2.length === 2 && feesCampA2[0].idempotencyKey === feesCampA2[1].idempotencyKey
      && !!q1('SELECT id FROM ad_fees WHERE campana_ref = ? AND estado = ?', 'meta:' + (rowA2 && rowA2.meta_campaign_id), 'cobrado'));
    const imA3b = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA3, montoUSD: 20 });
    check('C16 · pagada la gestión, el impulso frenado sale', imA3b.status === 200 && imA3b.data && imA3b.data.ok === true, JSON.stringify(imA3b.data));

    // ── El barrido repara la activación fallida ──
    const postA4 = seedPost(uidA, 'MEDIA_ADPAUSED');
    const imA4 = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA4, montoUSD: 20 });
    const rowA4 = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidA, postA4);
    check('C17 · activación fallida en riel cliente: fila error CON ids (materia del barrido), sin fee',
      imA4.status === 409 && !!rowA4 && rowA4.status === 'error' && /activación fallida/.test(rowA4.error || '')
      && !!rowA4.meta_campaign_id && !!rowA4.meta_ad_id, rowA4 && rowA4.error);
    setControlC({ adActivable: true });
    const rep = await api('', 'POST', `/api/admin/ads/reparar?token=testtoken-cierre`, {});
    const rowA4b = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidA, postA4);
    check('C18 · el barrido repara: la fila pasa a ACTIVE',
      rep.status === 200 && rep.data && rep.data.reparadas >= 1 && !!rowA4b && rowA4b.status === 'active', JSON.stringify(rep.data));
    const feeA4 = await esperarFee(uidA, 'meta:' + (rowA4 && rowA4.meta_campaign_id), 'cobrado');
    check('C18b · y la costura cobra la gestión de la campaña reparada (una sola vez)', !!feeA4 && feeA4.fee_cents === 200);

    // ── Sin dato en riel cliente: el asiento guarda ids y el motivo interno ──
    const postA5 = seedPost(uidA, 'MEDIA_NODATA');
    const imA5 = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA5, montoUSD: 20 });
    const rowA5 = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidA, postA5);
    check('C19 · riel cliente + sin dato: fila error «activación sin dato» CON ids (reparable)',
      imA5.status === 409 && !!rowA5 && /activación sin dato/.test(rowA5.error || '') && !!rowA5.meta_campaign_id, rowA5 && rowA5.error);

    // ── Reconciliación de las huérfanas del 17/11 ──
    const cookieC = await registrar('cierre-c@example.com');
    const uidC = uidDe('cierre-c@example.com');
    seedComun(uidC, { igUserId: '555001', igUsername: 'postycommunitymanager' });
    seedConexion(uidC, 'SUAT_HUERF', '777009');
    const postC1 = seedPost(uidC, 'MEDIA_OK');
    const postC2 = seedPost(uidC, 'MEDIA_OK');
    qw(`INSERT INTO ad_boosts (user_id, post_id, ig_media_id, budget_cents, fee_cents, spend_cents, currency, status, objective, duration_days, error)
        VALUES (?, ?, 'MEDIA_OK', 2000, 0, 0, 'USD', 'error', 'engagement', 7, 'creación fallida en la cuenta del cliente (riel cliente): paso creativo · code 100')`, uidC, postC1);
    qw(`INSERT INTO ad_boosts (user_id, post_id, ig_media_id, budget_cents, fee_cents, spend_cents, currency, status, objective, duration_days, error)
        VALUES (?, ?, 'MEDIA_OK', 2000, 0, 0, 'USD', 'error', 'engagement', 7, 'creación fallida en la cuenta del cliente (riel cliente): paso activación')`, uidC, postC2);
    setControlC({ huerfanasUid: uidC, huerfanaPost1: postC1, huerfanaPost2: postC2 });
    const rec = await api('', 'POST', `/api/admin/ads/reconciliar-huerfanas?token=testtoken-cierre`, { user_id: uidC });
    const det = (rec.data && rec.data.campanas) || [];
    const detH1 = det.find((d) => d.campaignId === 'CAMP_H1');
    const detH2 = det.find((d) => d.campaignId === 'CAMP_H2');
    check('C20 · reconciliación: la sin-anuncio se archiva; la con-anuncio se activa verificada',
      rec.status === 200 && !!detH1 && detH1.resultado === 'archivada_sin_anuncio' && !!detH2 && detH2.resultado === 'activada',
      JSON.stringify(rec.data));
    const archLog = metaCalls().filter((c) => c.method === 'POST' && c.path === '/CAMP_H1' && c.body && c.body.status === 'ARCHIVED');
    const rowC1 = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidC, postC1);
    const rowC2 = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidC, postC2);
    check('C20b · CAMP_H1 quedó ARCHIVED en Meta y su fila cerrada con la causa; CAMP_H2 activa con ids',
      archLog.length === 1 && !!rowC1 && rowC1.meta_campaign_id === 'CAMP_H1' && /creación incompleta 17\/11/.test(rowC1.error || '')
      && !!rowC2 && rowC2.status === 'active' && rowC2.meta_adset_id === 'ADSET_H2' && rowC2.meta_ad_id === 'AD_H2');
    const feeH2 = await esperarFee(uidC, 'meta:CAMP_H2', 'cobrado');
    check('C20c · la huérfana activada paga su gestión de US$2 por la costura', !!feeH2 && feeH2.fee_cents === 200);

    // ── Negativo (iv): destacado cobra y el anuncio no sale → REFUND ──
    const cookieE = await registrar('cierre-e@example.com');
    const uidE = uidDe('cierre-e@example.com');
    seedComun(uidE, { igUserId: '999001', igUsername: 'postycommunitymanager' });
    const postE1 = seedPost(uidE, 'MEDIA_FALLA');
    const imE = await api(cookieE, 'POST', '/api/destacado/impulsar', { montoUSD: 20, posteoId: postE1 });
    const rowE = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidE, postE1);
    const refunds = stripeCalls().filter((c) => c.tipo === 'refund');
    const piDest = stripeCalls().filter((c) => c.tipo === 'payment_intent' && c.metadata_tipo === 'destacado_impulso');
    check('C21 · destacado con anuncio fallido tras el cobro → 409 y REFUND a la tarjeta (no crédito)',
      imE.status === 409 && imE.data && imE.data.motivo === 'anuncio_fallido' && refunds.length === 1
      && piDest.length === 1 && refunds[0].payment_intent === piDest[0].id
      && refunds[0].idempotencyKey === 'reembolso_' + piDest[0].id, JSON.stringify(imE.data));
    const wE = q1('SELECT balance_cents FROM ad_wallets WHERE user_id = ?', uidE);
    check('C21b · la fila guarda el id del refund y la billetera NO recibió crédito',
      !!rowE && !!rowE.refund_id && rowE.refund_id.startsWith('re_stub_')
      && !q1(`SELECT id FROM ad_transactions WHERE user_id = ? AND kind = 'credito_anuncio_fallido'`, uidE)
      && (!wE || wE.balance_cents === 0));
    // El gate del fee también frena el destacado, antes de cobrar.
    qw(`INSERT INTO ad_fees (user_id, campana_ref, campaign_id, adset_id, post_id, pauta_cents, fee_cents, moneda, estado)
        VALUES (?, 'meta:CAMP_SEED_E', 'CAMP_SEED_E', 'ADSET_SEED_E', ?, 2000, 200, 'USD', 'pendiente_fallo')`, uidE, postE1);
    const pisAntesE = stripeCalls().filter((c) => c.tipo === 'payment_intent').length;
    const imE2 = await api(cookieE, 'POST', '/api/destacado/impulsar', { montoUSD: 20, posteoId: postE1 });
    check('C22 · fee pendiente también frena el destacado — antes de cualquier cobro',
      imE2.status === 409 && imE2.data && imE2.data.motivo === 'fee_pendiente'
      && stripeCalls().filter((c) => c.tipo === 'payment_intent').length === pisAntesE, JSON.stringify(imE2.data));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) {}
    if (mal) console.error('\n--- log del servidor (últimas 40 líneas) ---\n' + srvLog.split('\n').slice(-40).join('\n'));
  }
  console.log(`\ntest-lote-cierre-ads: ${ok}/${ok + mal} ok`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', (e && e.stack) || e); process.exit(1); });
