// test-lote-ads-preguntas.js — Suite del LOTE ADS-PREGUNTAS
// (pedido del dueño, 23/11: las preguntas que faltaban en la
// tarjeta de impulso).
// §A estáticos (fuentes) + gate M78 · §B módulos (ads-audiencia y
// meta_ads con el stub) · §C boot real con Meta/Stripe stubbeados:
//   1 · el objetivo SIEMPRE elegible (chips desde el espejo si la
//       propuesta no trae lista; el del fundamento, «sugerido»).
//   2 · «Que visiten tu perfil»: OUTCOME_TRAFFIC +
//       VISIT_INSTAGRAM_PROFILE + INSTAGRAM_PROFILE; la medición
//       son visitas al perfil (insights), jamás seguidores.
//   3 · «Los que ya te vieron»: audiencia de interacción IG
//       find-or-create en la cuenta de quien pauta; sin resolución
//       corre sin ella declarado; los Términos de Meta frenan el
//       impulso con el motivo real, sin crear ni cobrar.
//   4 · días {3,7,14} validado en el servidor (fuera → 400 sin
//       gasto) y presupuesto 20/50/100 con su fee (22/55/110).
//   5 · la guía «sin cuenta» de 6 pasos, UNA sola fuente, también
//       desde Ajustes → Conexiones → Publicidad en Meta.
// Uso: node test-lote-ads-preguntas.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
let pass = 0, fail = 0;
const fallos = [];
function check(nombre, cond, extra) {
  if (cond) { pass++; console.log('  ✓', nombre); }
  else { fail++; fallos.push(nombre); console.log('  ✗', nombre, extra != null ? `→ ${extra}` : ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

(async () => {
  // ══════════════ §A · ESTÁTICOS ══════════════
  console.log('§A · estáticos');
  const serverSrc = read('server.js');
  const dbSrc = read('db.js');
  const metaSrc = read('meta_ads.js');
  const audSrc = read('ads-audiencia.js');
  const appSrc = read('public/app.js');
  const chunkSrc = read('public/chunk-ajustes.js');

  check('A1 · server: dias_invalido + days: diasFinal en ambos rieles + texto del débito',
    serverSrc.includes("motivo: 'dias_invalido'")
    && (serverSrc.match(/days: diasFinal/g) || []).length >= 2
    && serverSrc.includes('x ${diasFinal} días'));
  check('A2 · server: barrido persiste last_visitas_perfil + freno audiencia_terminos en los dos rieles',
    serverSrc.includes('last_visitas_perfil=?')
    && (serverSrc.match(/audiencia_terminos/g) || []).length >= 2
    && (serverSrc.match(/gate\.igUserId/g) || []).length >= 2);
  check('A3 · db: columna last_visitas_perfil en ad_boosts',
    dbSrc.includes('ALTER TABLE ad_boosts ADD COLUMN last_visitas_perfil'));
  check('A4 · meta_ads: find-or-create de interacción (regla 365 días) + visitas_perfil en stats',
    metaSrc.includes('findOrCreateEngagementAudienceId')
    && metaSrc.includes('ig_business_profile_all')
    && metaSrc.includes('31536000')
    && metaSrc.includes('visitas_perfil'));
  check('A5 · app.js: espejo de objetivos con «Que visiten tu perfil» + marca «sugerido»',
    appSrc.includes('PZ_ADS_OBJETIVOS_FALLBACK')
    && appSrc.includes('Que visiten tu perfil')
    && appSrc.includes('· sugerido'));
  check('A6 · app.js: grupo de modo con «Los que ya te vieron» + mutador de modo',
    appSrc.includes('function pzAdsAudienciaModo')
    && appSrc.includes('Los que ya te vieron')
    && appSrc.includes('¿GENTE NUEVA O LA QUE YA TE VIO?'));
  check('A7 · app.js: chips de días + mutador + body.dias en el POST',
    appSrc.includes('function pzAdsAudienciaDias')
    && appSrc.includes('¿CUÁNTOS DÍAS?')
    && appSrc.includes('body.dias'));
  check('A8 · app.js: guía con el título del botón y los 6 pasos (Facebook · negocio · Página+IG · cuenta · pago · Conectar)',
    appSrc.includes('¿No tenés cuenta en Meta? Te guío paso a paso')
    && appSrc.includes('Entrá con tu cuenta de Facebook')
    && appSrc.includes('portafolio')
    && appSrc.includes('Vinculá tu Página de Facebook y tu Instagram')
    && appSrc.includes('Creá la cuenta publicitaria')
    && appSrc.includes('medio de pago')
    && appSrc.includes('Volvé acá y tocá «Conectar»'));
  check('A9 · chunk-ajustes: botón de la guía + toggle que usa la MISMA función',
    chunkSrc.includes('pzAdsGuiaToggle')
    && chunkSrc.includes('ads-guia-slot')
    && chunkSrc.includes('pzAdsGuiaSinCuentaHTML'));
  check('A10 · ads-audiencia: objetivo perfil con su mapeo verificado',
    audSrc.includes("'perfil'") && audSrc.includes('VISIT_INSTAGRAM_PROFILE')
    && audSrc.includes('OUTCOME_TRAFFIC') && audSrc.includes('INSTAGRAM_PROFILE'));

  // Gate M78: toda función pzAds* invocada desde onclick en app.js
  // y en el chunk de ajustes existe definida en alguno de los dos.
  {
    const invocadas = new Set();
    for (const src of [appSrc, chunkSrc]) {
      for (const m of src.matchAll(/onclick=\\?"[^"\\]*?\b(pzAds\w+)\s*\(/g)) invocadas.add(m[1]);
      for (const m of src.matchAll(/onclick="pzAdsGuiaToggle/g)) invocadas.add('pzAdsGuiaToggle');
    }
    const definidas = new Set();
    for (const src of [appSrc, chunkSrc]) {
      for (const m of src.matchAll(/function\s+(pzAds\w+)\s*\(/g)) definidas.add(m[1]);
    }
    const faltantes = [...invocadas].filter((n) => !definidas.has(n));
    check(`A11 · gate M78: funciones auditadas ${invocadas.size - faltantes.length}/${invocadas.size} (toda pzAds* invocada desde tarjetas/menús existe)`,
      faltantes.length === 0, faltantes.join(','));
  }

  // ══════════════ §B · MÓDULOS ══════════════
  console.log('§B · módulos');
  process.env.META_ADS_TOKEN = 'TOKEN_POSTY';
  process.env.META_AD_ACCOUNT_ID = '123456';
  const stub = require(path.join(ROOT, 'test-lote-ads-preguntas.stub.js'));
  stub.install();
  const TMPB = fs.mkdtempSync(path.join(ROOT, '.tmp-preguntas-mod-'));
  const controlB = path.join(TMPB, 'control.json');
  process.env.META_STUB_CONTROL = controlB;
  const setControlB = (obj) => fs.writeFileSync(controlB, JSON.stringify(obj));
  setControlB({});
  const aud = require(path.join(ROOT, 'ads-audiencia.js'));
  const metaAds = require(path.join(ROOT, 'meta_ads.js'));

  check('B1 · OBJETIVOS trae los 6 (con perfil) y MODOS los 2',
    aud.OBJETIVOS.length === 6 && aud.OBJETIVOS.includes('perfil')
    && JSON.stringify(aud.MODOS) === JSON.stringify(['nuevos', 'conocidos']));
  const mp = aud.mapeoMeta('perfil');
  check('B2 · mapeoMeta(perfil) = OUTCOME_TRAFFIC + VISIT_INSTAGRAM_PROFILE + INSTAGRAM_PROFILE, medición visitas_perfil',
    mp.campaignObjective === 'OUTCOME_TRAFFIC' && mp.optimizationGoal === 'VISIT_INSTAGRAM_PROFILE'
    && mp.destinationType === 'INSTAGRAM_PROFILE' && mp.medicion === 'visitas_perfil', JSON.stringify(mp));

  const fund = { categoria: 'gastronomia', ciudad: 'Miami', pais: 'US', clienteIdeal: 'mujeres de 25 a 44 años', cta: 'comprar', lang: 'es' };
  const prop = aud.propuestaDesdeFundamento(fund);
  check('B3 · propuesta: objetivo del fundamento + opciones con los 6 objetivos (perfil etiquetado) + modos + modo default nuevos',
    prop.objetivo === 'comprar'
    && prop.opciones.objetivos.length === 6
    && prop.opciones.objetivos.some((o) => o.valor === 'perfil' && o.etiqueta === 'Que visiten tu perfil')
    && JSON.stringify(prop.opciones.modos) === JSON.stringify(['nuevos', 'conocidos'])
    && prop.audiencia.modo === 'nuevos' && prop.audiencia.genero === 'mujeres',
    JSON.stringify({ obj: prop.objetivo, modos: prop.opciones.modos, modo: prop.audiencia.modo }));
  const base = JSON.parse(JSON.stringify(prop.audiencia));
  check('B4 · validar sin modo → ok, modo nuevos (compatibilidad)',
    (() => { const v = aud.validarAudiencia(base, prop); return v.ok && v.audiencia.modo === 'nuevos'; })());
  check('B5 · validar modo conocidos → ok y viaja en la audiencia validada',
    (() => { const v = aud.validarAudiencia({ ...base, modo: 'conocidos' }, prop); return v.ok && v.audiencia.modo === 'conocidos'; })());
  check('B6 · validar objetivo perfil → ok, es el objetivo validado',
    (() => { const v = aud.validarAudiencia({ ...base, objetivo: 'perfil' }, prop); return v.ok && v.objetivo === 'perfil'; })());
  check('B7 · objetivo fuera de la lista → audiencia_invalida',
    aud.validarAudiencia({ ...base, objetivo: 'viral' }, prop).ok === false);
  check('B8 · modo fuera de los dos → audiencia_invalida',
    aud.validarAudiencia({ ...base, modo: 'cercanos' }, prop).ok === false);
  check('B9 · textoHumano con conocidos nombra la interacción y NO los parecidos',
    (() => {
      const t = aud.textoHumano({ ...prop, audiencia: { ...prop.audiencia, modo: 'conocidos' } }, 'es');
      return t.includes('ya interactuaron con tu Instagram') && !t.includes('parecido a tus seguidores');
    })());

  const audBase = { radio_km: 5, alcance: 'pais', edad_min: 25, edad_max: 44, genero: 'mujeres', intereses: [{ nombre: 'Pastelería', activo: true }], parecidos: true, modo: 'nuevos' };
  const propGeo = { geo: { pais: 'US', ciudad: 'Miami' } };
  const metaFake = {
    searchInterestId: async (n) => ({ id: 'INT1', name: n }),
    searchGeo: async () => null,
    findLookalikeAudienceId: async () => 'AUD_LOOK_1',
    findOrCreateEngagementAudienceId: async () => 'AUD_ENG_X',
  };
  {
    const r = await aud.resolverTargeting(audBase, propGeo, metaFake, null, '555001');
    check('B10 · resolver nuevos: intereses resueltos + parecidos aplicados + modo_estado no_participa',
      !!(r.targeting.flexible_spec && r.targeting.flexible_spec[0].interests[0].id === 'INT1')
      && JSON.stringify(r.targeting.custom_audiences) === JSON.stringify([{ id: 'AUD_LOOK_1' }])
      && r.resuelto.modo === 'nuevos' && r.resuelto.modo_estado === 'no_participa', JSON.stringify(r.resuelto));
  }
  {
    const r = await aud.resolverTargeting({ ...audBase, modo: 'conocidos' }, propGeo, metaFake, null, '555001');
    check('B11 · resolver conocidos: LA audiencia es la de interacción, sin intereses ni parecidos',
      JSON.stringify(r.targeting.custom_audiences) === JSON.stringify([{ id: 'AUD_ENG_X' }])
      && !r.targeting.flexible_spec
      && r.resuelto.modo_estado === 'aplicado', JSON.stringify(r.resuelto));
  }
  {
    const fakeNull = { ...metaFake, findOrCreateEngagementAudienceId: async () => null };
    const r = await aud.resolverTargeting({ ...audBase, modo: 'conocidos' }, propGeo, fakeNull, null, '555001');
    check('B12 · conocidos sin resolución: corre sin audiencia, declarado sin_audiencia_disponible (nunca un id inventado)',
      !r.targeting.custom_audiences && r.resuelto.modo_estado === 'sin_audiencia_disponible', JSON.stringify(r.resuelto));
  }
  {
    const errTos = new Error('tos'); errTos.code = 'audiencia_terminos';
    const fakeTos = { ...metaFake, findOrCreateEngagementAudienceId: async () => { throw errTos; } };
    let lanzo = null;
    try { await aud.resolverTargeting({ ...audBase, modo: 'conocidos' }, propGeo, fakeTos, null, '555001'); } catch (e) { lanzo = e; }
    check('B13 · el freno de Términos se PROPAGA (no degrada en silencio)', !!lanzo && lanzo.code === 'audiencia_terminos');
  }
  check('B14 · resultadoDe(perfil) lee last_visitas_perfil (nunca seguidores)',
    (() => { const r = aud.resultadoDe({ objetivo: 'perfil', last_visitas_perfil: 7, last_clicks: 3, stats_updated_at: '2026-11-23 00:00:00' }); return !!r && r.tipo === 'visitas_perfil' && r.valor === 7; })());

  const ctxCliente = { token: 'SUAT_TEST', adAccountId: '777001' };
  {
    setControlB({});
    stub.calls.length = 0;
    const id = await metaAds.findOrCreateEngagementAudienceId(ctxCliente, '555001');
    const post = stub.calls.find((c) => c.method === 'POST' && /customaudiences$/.test(c.path));
    const regla = post && post.body ? JSON.stringify(post.body.rule || {}) : '';
    check('B15 · find-or-create CREA en la cuenta del cliente: subtype ENGAGEMENT + regla ig_business_profile_all + retención 365 días',
      id === 'AUD_ENG_CREADA' && !!post && /act_777001/.test(post.path)
      && post.body.subtype === 'ENGAGEMENT'
      && regla.includes('ig_business_profile_all') && regla.includes('31536000') && regla.includes('555001'),
      JSON.stringify({ id, post: post && post.body }));
  }
  {
    setControlB({ engagementExiste: true });
    stub.calls.length = 0;
    const id = await metaAds.findOrCreateEngagementAudienceId(ctxCliente, '555001');
    const posts = stub.calls.filter((c) => c.method === 'POST' && /customaudiences$/.test(c.path)).length;
    check('B16 · si ya existe, la ENCUENTRA y no crea otra', id === 'AUD_ENG_EXISTE' && posts === 0, String(id));
  }
  {
    setControlB({ engagementTerminos: true });
    let lanzo = null;
    try { await metaAds.findOrCreateEngagementAudienceId(ctxCliente, '555001'); } catch (e) { lanzo = e; }
    check('B17 · rechazo por Términos → error marcado audiencia_terminos con el detalle de Meta',
      !!lanzo && lanzo.code === 'audiencia_terminos' && !!lanzo.metaError, lanzo && lanzo.message);
  }
  {
    setControlB({ insightsVisitasPerfil: true });
    const s = await metaAds.getBoostStats('CAMP_9');
    check('B18 · getBoostStats cuenta visitas_perfil (profile_visit) y conversaciones por separado',
      !!s && s.visitas_perfil === 4 && s.conversaciones === 2, JSON.stringify(s));
  }
  setControlB({});
  check('B19 · sin ig o sin ctx usable → null (degradación declarada, jamás inventa)',
    (await metaAds.findOrCreateEngagementAudienceId(ctxCliente, '')) === null
    && (await metaAds.findOrCreateEngagementAudienceId({ token: '', adAccountId: '' }, '555001')) === null);
  try { fs.rmSync(TMPB, { recursive: true, force: true }); } catch (e) {}

  // ══════════════ §C · BOOT REAL ══════════════
  console.log('§C · boot');
  const DATA_DIR = fs.mkdtempSync(path.join(ROOT, '.tmp-preguntas-boot-'));
  const metaLog = path.join(DATA_DIR, 'meta.jsonl');
  const stripeLog = path.join(DATA_DIR, 'stripe.jsonl');
  const controlC = path.join(DATA_DIR, 'control.json');
  fs.writeFileSync(controlC, JSON.stringify({}));
  const setControlC = (patch) => {
    let c = {}; try { c = JSON.parse(fs.readFileSync(controlC, 'utf8')); } catch (e) {}
    fs.writeFileSync(controlC, JSON.stringify({ ...c, ...patch }));
  };
  const PORT = 18761;
  const BASE = `http://127.0.0.1:${PORT}`;
  const stubPath = path.join(ROOT, 'test-lote-ads-preguntas.stub.js');
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, DATA_DIR, PORT: String(PORT), SESSION_SECRET: 'test-preguntas',
      ADMIN_TOKEN: 'test-token-preguntas',
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
  const campPosts = () => metaCalls().filter((c) => c.method === 'POST' && /\/campaigns$/.test(c.path)).length;
  const ultimoAdset = (desde) => {
    const cs = metaCalls().slice(desde || 0).filter((c) => c.method === 'POST' && /\/adsets$/.test(c.path));
    return cs.length ? cs[cs.length - 1] : null;
  };
  const normTg = (b) => { try { return typeof b.targeting === 'string' ? JSON.parse(b.targeting) : (b.targeting || {}); } catch (e) { return {}; } };
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
  function seedConexion(uid, suat, cuenta) {
    qw(`INSERT INTO ig_ads_connections (user_id, suat, fb_page_id, primary_ad_account_id, ad_currency, ig_account_ids, ig_accounts, status)
        VALUES (?, ?, '555111', ?, 'USD', '["555001"]', '[{"id":"555001","username":"postycommunitymanager","page_id":"555111","usable_en_cuenta":true}]', 'connected')
        ON CONFLICT(user_id) DO UPDATE SET suat = excluded.suat, primary_ad_account_id = excluded.primary_ad_account_id`, uid, suat, cuenta);
  }
  function seedPost(uid, media) {
    const r = qw(`INSERT INTO posts (user_id, image_path, caption, status, ig_media_id, published_at) VALUES (?, '/img.jpg', 'posteo de prueba', 'published', ?, datetime('now'))`, uid, media);
    return Number(r.lastInsertRowid);
  }
  function seedFundamento(uid, { cta, categoria, ciudad, cliente }) {
    const profRow = q1('SELECT user_id FROM profiles WHERE user_id = ?', uid);
    if (profRow) qw('UPDATE profiles SET category = ? WHERE user_id = ?', categoria, uid);
    else qw('INSERT INTO profiles (user_id, category) VALUES (?, ?)', uid, categoria);
    qw(`INSERT INTO client_digest (user_id, digest_json, hash, version, updated_at) VALUES (?, ?, '', 1, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET digest_json = excluded.digest_json`,
      uid, JSON.stringify({ onboarding: { cta, audiencia: 'Mujeres' }, ciudad, dueno: { cliente } }));
  }
  function seedBilletera(uid, cents) {
    qw(`INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (?, ?, 'USD') ON CONFLICT(user_id) DO UPDATE SET balance_cents = excluded.balance_cents, currency = 'USD'`, uid, cents);
  }
  async function propuestaDe(cookie) {
    const r = await api(cookie, 'GET', '/api/ads/billetera/audiencia');
    return r.data && r.data.propuesta;
  }
  const audBody = (propuesta, extra) => {
    const a = JSON.parse(JSON.stringify((propuesta && propuesta.audiencia) || {}));
    delete a.intereses; // la tarjeta no los manda: el servidor los completa de la propuesta
    return { ...a, ...(extra || {}) };
  };
  // La costura del fee corre async tras la respuesta: entre
  // impulsos del mismo usuario se espera a que asiente (el patrón
  // de la suite de cierre) para que el gate de fee pendiente no
  // cruce los escenarios.
  async function asentarFee(uid, postId) {
    const row = q1('SELECT meta_campaign_id FROM ad_boosts WHERE user_id = ? AND post_id = ?', uid, postId);
    if (row && row.meta_campaign_id) await esperarFee(uid, 'meta:' + row.meta_campaign_id, 'cobrado');
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
    check('C0 · boot: server levanta', await waitBoot(), srvLog.slice(-400));

    // ── Usuario A: riel cliente (cuenta conectada) ──
    const cookieA = await registrar('preg-a@example.com');
    const uidA = uidDe('preg-a@example.com');
    seedComun(uidA, { igUserId: '555001', igUsername: 'postycommunitymanager' });
    seedConexion(uidA, 'SUAT_TEST', '777001');
    seedFundamento(uidA, { cta: 'comprar', categoria: 'gastronomia', ciudad: 'Miami', cliente: 'mujeres de 25 a 44 años' });
    const propA = await propuestaDe(cookieA);
    check('C1 · la propuesta servida trae los 6 objetivos (perfil: «Que visiten tu perfil»), los 2 modos y modo default nuevos',
      !!propA && propA.objetivo === 'comprar'
      && propA.opciones.objetivos.length === 6
      && propA.opciones.objetivos.some((o) => o.valor === 'perfil' && o.etiqueta === 'Que visiten tu perfil')
      && JSON.stringify(propA.opciones.modos) === JSON.stringify(['nuevos', 'conocidos'])
      && propA.audiencia.modo === 'nuevos',
      JSON.stringify(propA && propA.opciones));

    const postA1 = seedPost(uidA, 'MEDIA_CLI');
    {
      const marca = metaCalls().length;
      const im = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA1, montoUSD: 20, audiencia: audBody(propA, { objetivo: 'perfil' }) });
      const camp = metaCalls().slice(marca).find((c) => c.method === 'POST' && /\/campaigns$/.test(c.path));
      const adset = ultimoAdset(marca);
      const row = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidA, postA1);
      check('C2 · objetivo «perfil» viaja entero: campaña OUTCOME_TRAFFIC, conjunto VISIT_INSTAGRAM_PROFILE + INSTAGRAM_PROFILE, fila con objetivo perfil',
        im.status === 200 && im.data && im.data.ok === true
        && !!camp && camp.body.objective === 'OUTCOME_TRAFFIC'
        && !!adset && adset.body.optimization_goal === 'VISIT_INSTAGRAM_PROFILE' && adset.body.destination_type === 'INSTAGRAM_PROFILE'
        && !!row && row.objetivo === 'perfil',
        JSON.stringify({ im: im.data, camp: camp && camp.body, adset: adset && adset.body }));
    }
    await asentarFee(uidA, postA1);
    const postA2 = seedPost(uidA, 'MEDIA_CLI');
    {
      const im = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA2, montoUSD: 20, audiencia: audBody(propA) });
      const row = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidA, postA2);
      check('C3 · sin días en el pedido → 7 (el default histórico) en respuesta y en la fila',
        im.data && im.data.ok === true && im.data.dias === 7 && !!row && row.duration_days === 7,
        JSON.stringify({ dias: im.data && im.data.dias, row: row && row.duration_days }));
    }
    await asentarFee(uidA, postA2);
    const postA3 = seedPost(uidA, 'MEDIA_CLI');
    {
      const antes = campPosts();
      const im = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA3, montoUSD: 20, audiencia: audBody(propA, { objetivo: 'viral' }) });
      check('C4 · objetivo fuera de la lista → 400 audiencia_invalida, CERO campañas',
        im.status === 400 && im.data && im.data.motivo === 'audiencia_invalida' && campPosts() === antes,
        JSON.stringify(im.data));
    }
    const postA4 = seedPost(uidA, 'MEDIA_CLI');
    {
      setControlC({ engagementExiste: true });
      const marca = metaCalls().length;
      const im = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA4, montoUSD: 20, audiencia: audBody(propA, { modo: 'conocidos' }) });
      const adset = ultimoAdset(marca);
      const tg = adset ? normTg(adset.body) : {};
      const row = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidA, postA4);
      let aj = null; try { aj = JSON.parse(row.audiencia_json); } catch (e) {}
      check('C5 · conocidos con audiencia existente: el conjunto lleva SOLO esa audiencia y el registro declara modo aplicado',
        im.data && im.data.ok === true
        && JSON.stringify(tg.custom_audiences) === JSON.stringify([{ id: 'AUD_ENG_EXISTE' }])
        && !tg.flexible_spec
        && !!aj && aj.resuelto && aj.resuelto.modo === 'conocidos' && aj.resuelto.modo_estado === 'aplicado',
        JSON.stringify({ tg, aj }));
    }
    await asentarFee(uidA, postA4);
    const postA5 = seedPost(uidA, 'MEDIA_CLI');
    {
      setControlC({ engagementExiste: false });
      const marca = metaCalls().length;
      const im = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA5, montoUSD: 20, audiencia: audBody(propA, { modo: 'conocidos' }) });
      const creacion = metaCalls().slice(marca).find((c) => c.method === 'POST' && /customaudiences$/.test(c.path));
      const regla = creacion ? (typeof creacion.body.rule === 'string' ? creacion.body.rule : JSON.stringify(creacion.body.rule || {})) : '';
      const adset = ultimoAdset(marca);
      const tg = adset ? normTg(adset.body) : {};
      check('C6 · conocidos sin audiencia: se CREA en la cuenta del cliente (ENGAGEMENT, regla de interacción, 365 días) y el conjunto la usa',
        im.data && im.data.ok === true && !!creacion && /act_777001/.test(creacion.path)
        && creacion.body.subtype === 'ENGAGEMENT'
        && regla.includes('ig_business_profile_all') && regla.includes('31536000')
        && JSON.stringify(tg.custom_audiences) === JSON.stringify([{ id: 'AUD_ENG_CREADA' }]),
        JSON.stringify({ im: im.data, creacion: creacion && creacion.body, tg }));
    }
    await asentarFee(uidA, postA5);
    { const feesA = q('SELECT campana_ref, estado, fee_cents FROM ad_fees WHERE user_id = ?', uidA); console.log('  · fees de A antes de C7:', JSON.stringify(feesA)); }
    const postA6 = seedPost(uidA, 'MEDIA_CLI');
    {
      setControlC({ engagementTerminos: true });
      const antes = campPosts();
      const im = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA6, montoUSD: 20, audiencia: audBody(propA, { modo: 'conocidos' }) });
      const rowErr = q1(`SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ? AND status = 'error'`, uidA, postA6);
      setControlC({ engagementTerminos: false });
      check('C7 · Términos de Audiencias (riel cliente): frena con anuncio_fallido + el mensaje de Meta, CERO campañas, fila error asentada',
        im.status === 409 && im.data && im.data.motivo === 'anuncio_fallido'
        && String(im.data.meta_msg || '').includes('Custom Audience Terms')
        && campPosts() === antes && !!rowErr,
        JSON.stringify(im.data));
    }
    const postA7 = seedPost(uidA, 'MEDIA_CLI');
    {
      const marca = metaCalls().length;
      const im = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA7, montoUSD: 50, dias: 3, audiencia: audBody(propA) });
      const adset = ultimoAdset(marca);
      const row = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidA, postA7);
      const fee = row ? await esperarFee(uidA, 'meta:' + row.meta_campaign_id, 'cobrado') : null;
      check('C8 · días 3 + US$50 (riel cliente): respuesta y fila en 3 días, lifetime_budget 5000 y fee de gestión 500 cobrado',
        im.data && im.data.ok === true && im.data.dias === 3
        && !!row && row.duration_days === 3 && row.budget_cents === 5000
        && !!adset && Number(adset.body.lifetime_budget) === 5000
        && !!fee && fee.fee_cents === 500,
        JSON.stringify({ im: im.data, row: row && { d: row.duration_days, b: row.budget_cents }, fee: fee && fee.fee_cents }));
    }
    const postA8 = seedPost(uidA, 'MEDIA_CLI');
    {
      const antes = campPosts();
      const im = await api(cookieA, 'POST', '/api/ads/billetera/impulsar', { posteoId: postA8, montoUSD: 20, dias: 5, audiencia: audBody(propA) });
      check('C9 · días fuera de {3,7,14} → 400 dias_invalido, CERO campañas',
        im.status === 400 && im.data && im.data.motivo === 'dias_invalido' && campPosts() === antes,
        JSON.stringify(im.data));
    }

    // ── Usuario E: el barrido de resultados (objetivo perfil) ──
    const cookieE = await registrar('preg-e@example.com');
    const uidE = uidDe('preg-e@example.com');
    seedComun(uidE, { igUserId: '999001', igUsername: 'postycommunitymanager' });
    seedBilletera(uidE, 100000);
    const propE = await propuestaDe(cookieE);
    const postE1 = seedPost(uidE, 'MEDIA_OK');
    {
      const im = await api(cookieE, 'POST', '/api/ads/billetera/impulsar', { posteoId: postE1, montoUSD: 20, audiencia: audBody(propE, { objetivo: 'perfil' }) });
      setControlC({ insightsVisitasPerfil: true });
      const lista = await api(cookieE, 'GET', '/api/ads/boosts');
      setControlC({ insightsVisitasPerfil: false });
      const b = lista.data && (lista.data.boosts || []).find((x) => x.post_id === postE1);
      const row = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidE, postE1);
      check('C10 · barrido: las visitas al perfil quedan persistidas y el resultado del impulso es visitas_perfil (no clics ni seguidores)',
        im.data && im.data.ok === true && !!b && b.last_visitas_perfil === 4
        && !!b.resultado && b.resultado.tipo === 'visitas_perfil' && b.resultado.valor === 4
        && !!row && row.last_visitas_perfil === 4,
        JSON.stringify({ b, row: row && row.last_visitas_perfil }));
    }

    // ── Usuario D: riel billetera (cuenta de Posty) ──
    const cookieD = await registrar('preg-d@example.com');
    const uidD = uidDe('preg-d@example.com');
    seedComun(uidD, { igUserId: '999001', igUsername: 'postycommunitymanager' });
    seedBilletera(uidD, 100000);
    const propD = await propuestaDe(cookieD);
    const postD1 = seedPost(uidD, 'MEDIA_OK');
    {
      const im = await api(cookieD, 'POST', '/api/ads/billetera/impulsar', { posteoId: postD1, montoUSD: 20, dias: 14, audiencia: audBody(propD) });
      const row = q1('SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ?', uidD, postD1);
      const saldo = q1('SELECT balance_cents FROM ad_wallets WHERE user_id = ?', uidD);
      const feeD = row ? await esperarFee(uidD, 'meta:' + row.meta_campaign_id, 'cobrado') : null;
      check('C11 · días 14 (riel billetera): respuesta y fila en 14, la billetera debita la pauta (2000) y la gestión (200) corre por la costura del fee',
        im.data && im.data.ok === true && im.data.dias === 14
        && !!row && row.duration_days === 14
        && !!saldo && saldo.balance_cents === 98000
        && !!feeD && feeD.fee_cents === 200,
        JSON.stringify({ im: im.data, saldo: saldo && saldo.balance_cents, fee: feeD && feeD.fee_cents }));
    }
    const postD2 = seedPost(uidD, 'MEDIA_OK');
    {
      setControlC({ engagementExistePosty: true });
      const marca = metaCalls().length;
      const im = await api(cookieD, 'POST', '/api/ads/billetera/impulsar', { posteoId: postD2, montoUSD: 20, audiencia: audBody(propD, { modo: 'conocidos', parecidos: false }) });
      const adset = ultimoAdset(marca);
      const tg = adset ? normTg(adset.body) : {};
      check('C12 · conocidos (riel billetera): el conjunto lleva la audiencia de interacción de la cuenta de Posty',
        im.data && im.data.ok === true
        && JSON.stringify(tg.custom_audiences) === JSON.stringify([{ id: 'AUD_ENG_POSTY' }]),
        JSON.stringify({ im: im.data, tg }));
    }
    await asentarFee(uidD, postD2);
    const postD3 = seedPost(uidD, 'MEDIA_OK');
    {
      setControlC({ engagementTerminos: true, engagementExistePosty: false });
      const antes = campPosts();
      const saldoAntes = q1('SELECT balance_cents FROM ad_wallets WHERE user_id = ?', uidD).balance_cents;
      const im = await api(cookieD, 'POST', '/api/ads/billetera/impulsar', { posteoId: postD3, montoUSD: 20, audiencia: audBody(propD, { modo: 'conocidos', parecidos: false }) });
      const rowErr = q1(`SELECT * FROM ad_boosts WHERE user_id = ? AND post_id = ? AND status = 'error'`, uidD, postD3);
      const saldoDesp = q1('SELECT balance_cents FROM ad_wallets WHERE user_id = ?', uidD).balance_cents;
      setControlC({ engagementTerminos: false });
      check('C13 · Términos de Audiencias (riel billetera): anuncio_fallido, CERO campañas, saldo intacto, fila error asentada',
        im.status === 409 && im.data && im.data.motivo === 'anuncio_fallido'
        && campPosts() === antes && saldoDesp === saldoAntes && !!rowErr,
        JSON.stringify(im.data));
    }

    // ── Usuario F: la diferencia (saldo US$22 contra total US$55) ──
    const cookieF = await registrar('preg-f@example.com');
    const uidF = uidDe('preg-f@example.com');
    seedComun(uidF, { igUserId: '999001', igUsername: 'postycommunitymanager' });
    seedBilletera(uidF, 2200);
    const postF1 = seedPost(uidF, 'MEDIA_OK');
    {
      const antes = campPosts();
      const im = await api(cookieF, 'POST', '/api/ads/billetera/impulsar', { posteoId: postF1, montoUSD: 50 });
      const saldo = q1('SELECT balance_cents FROM ad_wallets WHERE user_id = ?', uidF);
      check('C14 · saldo US$22 contra el total US$55 de US$50: saldo_insuficiente, CERO campañas, saldo intacto',
        im.status === 409 && im.data && im.data.motivo === 'saldo_insuficiente'
        && campPosts() === antes && !!saldo && saldo.balance_cents === 2200,
        JSON.stringify(im.data));
    }
  } catch (e) {
    check('§C · sin excepciones', false, (e && e.stack || String(e)).slice(0, 500));
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
  }

  console.log(`\nADS-PREGUNTAS · ${pass} ok · ${fail} fallos`);
  if (fallos.length) console.log('Fallos:', fallos.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('suite explotó:', e); process.exit(2); });
