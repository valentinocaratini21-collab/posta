// test-lote-ads-estrategicos.js — LOTE ADS-ESTRATÉGICOS (v1054; el builder lo estampó v1003 sobre su base v992 — re-estampado por el preparador sobre el vivo v1053).
// §A estampados y estáticos · §B ads-audiencia puro (objetivo desde el
// fundamento, propuesta, validación de opciones, resolución a
// targeting, medición) · §C meta_ads con fetch stub (el targeting
// estratégico llega al conjunto; el camino histórico no cambia) ·
// §D cliente en VM (la tarjeta se muestra antes de gastar, editar un
// chip cambia el body del POST) · §E boot real (propuesta por HTTP
// desde el fundamento sembrado, audiencia inválida → 400 sin gasto,
// persistencia + resultado en el historial).
// Uso: node test-lote-ads-estrategicos.js (boot con
// NODE_PATH=/home/hatch/workspace/posta/node_modules si express no
// resuelve desde el árbol).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const REAL_FETCH = global.fetch; // §C reemplaza global.fetch: §E usa el real
let fails = 0, total = 0, skips = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const skip = (msg) => { skips++; console.log('  ↷ skip:', msg); };

(async () => {
// ── §A · estampados y estáticos ───────────────────────────────────
console.log('§A estampados');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const indexEnSrc = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const dbSrc = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
ok(serverSrc.includes("const BUILD_ID = '20261105-v1054'"), 'BUILD_ID 20261105-v1054 (re-pin del preparador: el builder estampó v1003 sobre su base v992)');
ok(indexSrc.includes('app.js?v=720'), 'index ES app.js?v=720 (re-pin del preparador: el builder estampó 691 sobre su base v992; el vivo era 719)');
ok(!indexEnSrc.includes('app.js?v='), 'index EN sin app.js?v= (como siempre)');
ok(fs.existsSync(path.join(ROOT, 'ads-audiencia.js')), 'ads-audiencia.js existe');
ok(serverSrc.includes("app.get('/api/ads/billetera/audiencia'"), 'endpoint GET audiencia registrado');
ok(serverSrc.includes("motivo: 'audiencia_invalida'"), 'impulsar valida la audiencia (400)');
ok(serverSrc.includes('objetivo, audiencia_json'), 'registrar persiste objetivo + audiencia_json');
ok(dbSrc.includes('ALTER TABLE ad_boosts ADD COLUMN objetivo'), 'db: columna objetivo');
ok(dbSrc.includes('ALTER TABLE ad_boosts ADD COLUMN audiencia_json'), 'db: columna audiencia_json');
ok(dbSrc.includes('ALTER TABLE ad_boosts ADD COLUMN last_conversaciones'), 'db: columna last_conversaciones');
for (const fn of ['pzAdsAudienciaMostrar', 'pzAdsAudienciaSale', 'pzAdsAudienciaRadio', 'pzAdsAudienciaEdad', 'pzAdsAudienciaGenero', 'pzAdsAudienciaInteres', 'pzAdsAudienciaParecidos', 'pzAdsAudienciaTexto', 'pzAdsAudienciaPintar', 'pzAdsAudienciaRepintar']) {
  ok(appSrc.includes(`function ${fn}`), `app.js: ${fn} definida`);
}
ok(appSrc.includes('Sale así'), 'app.js: botón «Sale así»');
ok(appSrc.includes("motivo === 'audiencia_pendiente'"), 'app.js: pzAdsImpulsar trata audiencia_pendiente sin pintar error');
ok(appSrc.includes('body.audiencia = s.audienciaSel'), 'app.js: el POST lleva la audiencia elegida');
ok(appSrc.includes('id="pzAdsAudiencia"') && appSrc.includes('id="pzAdsAudienciaSheet"'), 'app.js: contenedores de la tarjeta (tab + hoja)');
ok(appSrc.includes("b.resultado.tipo === 'conversaciones'"), 'app.js: el historial muestra el resultado por objetivo');

// ── §B · ads-audiencia puro ───────────────────────────────────────
console.log('§B ads-audiencia');
const A = require(path.join(ROOT, 'ads-audiencia.js'));
const fund = (extra) => Object.assign({
  cta: '', meta: '', goalTexto: '', categoria: 'belleza',
  audienciaTexto: 'Mujeres', clienteIdeal: '', ciudad: 'Palermo', donde: '', pais: 'AR', lang: 'es',
}, extra || {});

for (const q2 of ['reservar', 'escribirte', 'local', 'comprar']) {
  const p = A.propuestaDesdeFundamento(fund({ cta: q2 }));
  ok(p.objetivo === q2 && p.objetivo_fuente === 'onboarding', `Q2 ${q2} → objetivo ${q2}`);
}
ok(A.propuestaDesdeFundamento(fund({ cta: 'turno' })).objetivo === 'reservar', 'alias turno → reservar');
ok(A.propuestaDesdeFundamento(fund({ meta: 'venir' })).objetivo === 'local', 'dueno.meta venir → local');
ok(A.propuestaDesdeFundamento(fund({ goalTexto: 'quiero vender más por la tienda online' })).objetivo === 'comprar', 'goal por texto → comprar (cm-objetivo)');
{
  const p = A.propuestaDesdeFundamento(fund({}));
  ok(p.objetivo === null && p.objetivo_fuente === 'sin_dato', 'sin señal → objetivo null, fuente sin_dato (no se inventa)');
}
{
  const m = A.mapeoMeta('escribirte');
  ok(m.campaignObjective === 'OUTCOME_ENGAGEMENT' && m.optimizationGoal === 'CONVERSATIONS' && m.destinationType === 'INSTAGRAM_DIRECT' && m.medicion === 'conversaciones', 'escribirte → ENGAGEMENT + CONVERSATIONS + INSTAGRAM_DIRECT, mide conversaciones');
  ok(A.mapeoMeta('reservar').optimizationGoal === 'CONVERSATIONS', 'reservar → mensajes (las reservas se cierran por DM)');
  ok(A.mapeoMeta('comprar').optimizationGoal === 'CONVERSATIONS', 'comprar → mensajes (sin píxel, OUTCOME_SALES no puede optimizar)');
  const ml = A.mapeoMeta('local');
  ok(ml.optimizationGoal === 'POST_ENGAGEMENT' && ml.destinationType === null && ml.medicion === 'clics', 'local → histórico POST_ENGAGEMENT, mide clics');
  ok(A.mapeoMeta(null).optimizationGoal === 'POST_ENGAGEMENT', 'sin objetivo → histórico exacto');
}
{
  const p = A.propuestaDesdeFundamento(fund({ cta: 'escribirte' }));
  ok(p.audiencia.genero === 'mujeres', 'audiencia «Mujeres» → género mujeres');
  ok(p.audiencia.edad_min === 25 && p.audiencia.edad_max === 44, 'belleza → edad estimada 25–44');
  ok(p.audiencia.radio_km === 5 && p.audiencia.parecidos === true, 'default: radio 5 km + parecidos sí');
  ok(p.audiencia.intereses.some((i) => i.nombre === 'Skin care' && i.activo), 'belleza → intereses de Meta por nombre (Skin care)');
  ok(p.texto.includes('Mujeres 25–44'), 'texto humano: «Mujeres 25–44»');
  ok(p.texto.includes('a 5 km de tu local en Palermo'), 'texto humano: radio + ciudad');
  ok(p.texto.includes('parecido a tus seguidores'), 'texto humano: parecidos');
  const sinCiudad = A.propuestaDesdeFundamento(fund({ cta: 'escribirte', ciudad: '', donde: '' }));
  ok(sinCiudad.texto.includes('en todo el país'), 'sin ciudad → texto honesto «en todo el país»');
}
// Validación: solo opciones prefijadas.
{
  // INVARIANTE: la propuesta por defecto de CADA rubro pasa la
  // validación tal cual (el «Sale así» sin editar no puede rebotar).
  for (const cat of [...Object.keys(A.INTERESES_POR_RUBRO), 'otro']) {
    const pr = A.propuestaDesdeFundamento(fund({ cta: 'local', categoria: cat, audienciaTexto: '', clienteIdeal: '' }));
    ok(A.validarAudiencia(pr.audiencia, pr).ok === true, `invariante: propuesta default de ${cat} pasa validarAudiencia`);
  }
  const p = A.propuestaDesdeFundamento(fund({ cta: 'escribirte' }));
  const buena = JSON.parse(JSON.stringify(p.audiencia));
  buena.radio_km = 10; buena.edad_min = 35; buena.edad_max = 44;
  buena.intereses[0].activo = false; buena.parecidos = false;
  const v = A.validarAudiencia(buena, p);
  ok(v.ok === true && v.audiencia.radio_km === 10 && v.audiencia.intereses[0].activo === false && v.audiencia.parecidos === false, 'edición dentro de las opciones → ok y se refleja');
  const mal = (mut) => { const x = JSON.parse(JSON.stringify(p.audiencia)); mut(x); return A.validarAudiencia(x, p); };
  ok(mal((x) => { x.radio_km = 7; }).ok === false, 'radio 7 km (fuera de 2/5/10) → rechazado');
  ok(mal((x) => { x.edad_min = 10; x.edad_max = 90; }).ok === false, 'edad 10–90 (fuera de las prefijadas) → rechazada');
  ok(mal((x) => { x.genero = 'todos-los-dias'; }).ok === false, 'género inventado → rechazado');
  ok(mal((x) => { x.parecidos = 'si'; }).ok === false, 'parecidos no booleano → rechazado');
  ok(mal((x) => { x.intereses.push({ nombre: 'Bitcoin', activo: true }); }).ok === false, 'interés fuera de la tabla del rubro → rechazado');
  ok(mal((x) => { x.intereses = [{ nombre: 'Skin care', activo: 'sí' }]; }).ok === true, 'activo no booleano se normaliza (no es vector de inyección)');
  ok(A.validarAudiencia(null, p).ok === false && A.validarAudiencia('texto libre', p).ok === false, 'audiencia no-objeto → rechazada');
}
// Resolución a targeting real (helpers inyectados).
{
  const p = A.propuestaDesdeFundamento(fund({ cta: 'escribirte' }));
  const editada = JSON.parse(JSON.stringify(p.audiencia));
  editada.radio_km = 10;
  const metaFake = {
    searchInterestId: async (n) => (n === 'Skin care' ? { id: '6003139266461', name: 'Skin care' } : null),
    searchGeo: async () => ({ key: '123', name: 'Palermo', latitude: -34.5788, longitude: -58.4242 }),
    findLookalikeAudienceId: async () => '999888',
  };
  const r = await A.resolverTargeting(editada, p, metaFake);
  ok(r.targeting.geo_locations.custom_locations && r.targeting.geo_locations.custom_locations[0].radius === 10, 'geo: radio de 10 km alrededor del centro resuelto por Meta');
  ok(r.resuelto.geo_modo === 'radio', 'geo_modo radio registrado');
  ok(Array.isArray(r.targeting.genders) && r.targeting.genders[0] === 2, 'género mujeres → genders [2]');
  const ints = (r.targeting.flexible_spec || [])[0] ? r.targeting.flexible_spec[0].interests : [];
  ok(ints.length === 1 && ints[0].id === '6003139266461', 'intereses: solo el que resolvió id real entra al targeting');
  ok(r.resuelto.intereses_omitidos.length >= 1, 'intereses sin id → omitidos y registrados (nunca inventados)');
  ok(r.targeting.custom_audiences && r.targeting.custom_audiences[0].id === '999888' && r.resuelto.parecidos_estado === 'aplicado', 'parecidos: lookalike existente aplicada');
  const sinCiudad = A.propuestaDesdeFundamento(fund({ cta: 'local', ciudad: '', donde: '' }));
  const r2 = await A.resolverTargeting(sinCiudad.audiencia, sinCiudad, metaFake);
  ok(r2.targeting.geo_locations.countries && r2.targeting.geo_locations.countries[0] === 'AR' && r2.resuelto.geo_modo === 'pais', 'sin ciudad → país (histórico), declarado');
  const sinLook = await A.resolverTargeting(Object.assign({}, editada, { parecidos: false }), p, metaFake);
  ok(!sinLook.targeting.custom_audiences && sinLook.resuelto.parecidos_estado === 'apagado', 'parecidos apagado → sin custom_audiences');
  const sinMeta = await A.resolverTargeting(editada, p, {});
  ok(sinMeta.targeting.geo_locations.countries && sinMeta.resuelto.intereses_omitidos.length === editada.intereses.filter((i) => i.activo).length, 'sin helpers de Meta → todo omitido y declarado, targeting válido igual');
}
// Medición honesta.
{
  ok(A.resultadoDe({ objetivo: 'escribirte', last_conversaciones: 7, last_clicks: 3, stats_updated_at: '2026-11-13 10:00:00' }).valor === 7, 'resultado escribirte = conversaciones reales');
  const rl = A.resultadoDe({ objetivo: 'local', last_conversaciones: 7, last_clicks: 42, stats_updated_at: '2026-11-13 10:00:00' });
  ok(rl.tipo === 'clics' && rl.valor === 42, 'resultado local = clics reales');
  ok(A.resultadoDe({ objetivo: 'escribirte', last_conversaciones: 7 }) === null, 'sin stats leídas → null (no se muestra un número inventado)');
}

// ── §C · meta_ads con la red stub ─────────────────────────────────
console.log('§C meta_ads (fetch stub)');
process.env.META_ADS_TOKEN = 'token-de-prueba-1234567890';
process.env.META_AD_ACCOUNT_ID = '424242';
const metaCalls = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  let body = null;
  try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
  metaCalls.push({ url: u, method, body });
  const json = (data) => ({ ok: true, status: 200, json: async () => data });
  if (u.includes('boost_eligibility_info')) return json({ boost_eligibility_info: { eligible: true } });
  if (u.includes('/search')) {
    const q = new URL(u).searchParams;
    if (q.get('type') === 'adinterest') return json(q.get('q') === 'Skin care' ? { data: [{ id: '6003139266461', name: 'Skin care' }] } : { data: [] });
    if (q.get('type') === 'adgeolocation') return json({ data: [{ key: '987', name: 'Palermo', latitude: -34.5788, longitude: -58.4242 }] });
    return json({ data: [] });
  }
  if (u.includes('/customaudiences')) return json({ data: [{ id: '999888', name: 'Parecidos 1%', subtype: 'LOOKALIKE' }] });
  if (u.includes('/insights')) return json({ data: [{ spend: '10.50', reach: 100, impressions: 240, clicks: 9, actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '4' }] }] });
  if (u.includes('/campaigns')) return json({ id: 'camp_1' });
  if (u.includes('/adsets')) return json({ id: 'adset_1' });
  if (u.includes('/adcreatives')) return json({ id: 'cre_1' });
  if (u.endsWith('/ads')) return json({ id: 'ad_1' });
  return json({});
};
const metaAds = require(path.join(ROOT, 'meta_ads.js'));
{
  const r = await metaAds.createBoost({ name: 'Legado', pageId: 'p1', igUserId: 'ig1', igMediaId: 'm1', spendCents: 5000, days: 7, country: 'AR' });
  ok(r.campaignId === 'camp_1', 'createBoost histórico crea la campaña');
  const camp = metaCalls.find((c) => c.url.includes('/campaigns'));
  const adset = metaCalls.find((c) => c.url.includes('/adsets'));
  ok(camp.body.objective === 'OUTCOME_ENGAGEMENT', 'histórico: objective OUTCOME_ENGAGEMENT');
  ok(adset.body.optimization_goal === 'POST_ENGAGEMENT', 'histórico: optimization POST_ENGAGEMENT');
  ok(!('destination_type' in adset.body), 'histórico: sin destination_type');
  ok(adset.body.targeting.geo_locations.countries[0] === 'AR' && adset.body.targeting.age_min === 18 && adset.body.targeting.age_max === 65, 'histórico: targeting país 18–65, idéntico al de siempre');
}
{
  metaCalls.length = 0;
  const p = A.propuestaDesdeFundamento(fund({ cta: 'escribirte' }));
  const editada = JSON.parse(JSON.stringify(p.audiencia));
  editada.radio_km = 10;
  const rt = await A.resolverTargeting(editada, p, metaAds);
  const mapeo = A.mapeoMeta('escribirte');
  const r = await metaAds.createBoost({
    name: 'Estratégico', pageId: 'p1', igUserId: 'ig1', igMediaId: 'm1', spendCents: 5000, days: 7, country: 'AR',
    objective: mapeo.campaignObjective, optimizationGoal: mapeo.optimizationGoal, destinationType: mapeo.destinationType, targeting: rt.targeting,
  });
  ok(r.campaignId === 'camp_1', 'createBoost estratégico crea la campaña');
  const adset = metaCalls.find((c) => c.url.includes('/adsets'));
  ok(adset.body.optimization_goal === 'CONVERSATIONS', 'estratégico: optimization CONVERSATIONS');
  ok(adset.body.destination_type === 'INSTAGRAM_DIRECT', 'estratégico: destination INSTAGRAM_DIRECT');
  ok(adset.body.targeting.geo_locations.custom_locations[0].radius === 10, 'estratégico: el radio editado (10 km) llega al conjunto');
  ok(adset.body.targeting.flexible_spec[0].interests[0].id === '6003139266461', 'estratégico: interés con id REAL resuelto por la búsqueda de Meta');
  ok(adset.body.targeting.custom_audiences[0].id === '999888', 'estratégico: lookalike existente en el conjunto');
  ok(rt.resuelto.intereses_omitidos.length >= 1, 'estratégico: los intereses sin id quedaron registrados como omitidos');
}
{
  ok(await metaAds.searchInterestId('Interés Que No Existe 123') === null, 'searchInterestId sin match → null (se omite, no se inventa)');
  const g = await metaAds.searchGeo('Palermo', 'AR');
  ok(g && g.latitude === -34.5788 && g.longitude === -58.4242, 'searchGeo devuelve las coordenadas de la propia Meta');
  ok(await metaAds.findLookalikeAudienceId() === '999888', 'findLookalikeAudienceId encuentra la lookalike de la cuenta');
  const st = await metaAds.getBoostStats('camp_1');
  ok(st && st.conversaciones === 4 && st.clicks === 9 && st.spend_cents === 1050, 'getBoostStats: conversaciones reales desde actions + clics + gasto');
}

// ── §D · cliente en VM: la tarjeta antes de gastar ────────────────
console.log('§D cliente (VM)');
{
  const startM = '// ── (LOTE ADS-ESTRATÉGICOS) Tarjeta de audiencia';
  const chunk = appSrc.slice(appSrc.indexOf(startM), appSrc.indexOf('function pzBoostMarcarImpulsado'));
  ok(chunk.includes('async function pzBoostConfirmar'), 'VM: el chunk extraído incluye el gate en pzBoostConfirmar');
  const elAud = { id: 'pzAdsAudiencia', innerHTML: '', scrollIntoView() {} };
  const elMsg = { id: 'pzBoostMsg', textContent: '' };
  const propuestaFixture = {
    objetivo: 'escribirte', objetivo_fuente: 'onboarding', objetivo_label: 'Que te escriban por Instagram',
    audiencia: { radio_km: 5, edad_min: 25, edad_max: 44, genero: 'mujeres', intereses: [{ nombre: 'Skin care', activo: true }, { nombre: 'Cosmetics', activo: true }], parecidos: true },
    opciones: { radios: [2, 5, 10], edades: [[18, 24], [25, 34], [25, 44], [35, 44], [35, 54], [45, 54], [55, 65], [18, 65]], generos: ['todos', 'mujeres', 'hombres'] },
    geo: { ciudad: 'Palermo', pais: 'AR' },
    texto: 'Mujeres 25–44 · a 5 km de tu local en Palermo',
  };
  const posts = [];
  const sandbox = {
    console, JSON, Number, String, Array, Object, Set, Promise, Math,
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s),
    gzT: (es) => es,
    toast: () => {},
    pzBoostKey: (p) => 'k' + (p.post_id || p.ig_media_id),
    pzBoostEsMP: () => false,
    pzBoostNewState: () => ({}),
    pzBoostMotivo: (m) => 'motivo:' + m,
    pzBoostImpulsados: new Set(),
    pzBoostMarcarImpulsado: () => {},
    pzBoostPintarExito: () => {},
    pzAdsRefrescar: async () => {},
    api: {
      get: async () => ({ ok: true, propuesta: JSON.parse(JSON.stringify(propuestaFixture)) }),
      post: async (p, body) => { posts.push({ path: p, body }); return { ok: true, balance_cents: 5000, posteoId: 5 }; },
    },
    document: { getElementById: (id) => (id === 'pzAdsAudiencia' ? elAud : id === 'pzBoostMsg' ? elMsg : null) },
    pzBoostState: { selPost: { post_id: 5 }, selId: 'k5', selMonto: 50, elegibles: [], billetera: { currency: 'USD', balance_cents: 10000 } },
  };
  vm.createContext(sandbox);
  vm.runInContext(chunk, sandbox);
  const r1 = await sandbox.pzBoostConfirmar(null);
  ok(r1 && r1.ok === false && r1.motivo === 'audiencia_pendiente', 'gate: el primer toque NO gasta — abre la tarjeta');
  ok(posts.length === 0, 'gate: todavía no hubo POST de impulso');
  ok(elAud.innerHTML.includes('Sale así') && elAud.innerHTML.includes('Mujeres 25–44') && elAud.innerHTML.includes('Palermo') && elAud.innerHTML.includes('Skin care'), 'tarjeta: audiencia en lenguaje humano + chips + «Sale así»');
  sandbox.pzAdsAudienciaRadio(10);
  ok(sandbox.pzBoostState.audienciaSel.radio_km === 10 && elAud.innerHTML.includes('a 10 km'), 'editar el chip de radio repinta el texto (10 km)');
  sandbox.pzAdsAudienciaInteres(0);
  ok(sandbox.pzBoostState.audienciaSel.intereses[0].activo === false, 'editar un interés lo apaga');
  const r2 = await sandbox.pzAdsAudienciaSale(null);
  ok(r2 && r2.ok === true && posts.length === 1, '«Sale así» → un solo POST de impulso');
  const b = posts[0] && posts[0].body;
  ok(b && b.posteoId === 5 && b.montoUSD === 50, 'POST: posteo y monto correctos');
  ok(b && b.audiencia && b.audiencia.radio_km === 10 && b.audiencia.intereses[0].activo === false && b.audiencia.genero === 'mujeres', 'POST: viaja la audiencia EDITADA (radio 10, interés apagado)');
  sandbox.pzBoostState.selMonto = 100;
  const r3 = await sandbox.pzBoostConfirmar(null);
  ok(r3 && r3.motivo === 'audiencia_pendiente' && posts.length === 1, 'cambio de monto → la tarjeta se muestra de nuevo antes de gastar');
}

// ── §F · «+ OTRA GENTE» (agregado de Valentino 13/11 00:47–00:49) ──
console.log('§F otra gente');
ok(typeof A.traducirDescripcion === 'function', 'ads-audiencia exporta traducirDescripcion');
ok(appSrc.includes('onclick="pzAdsAudienciaOtraGente()"'), 'app.js: el chip «+ Otra gente» está en la tarjeta');
for (const fn of ['pzAdsAudienciaOtraGente', 'pzAdsAudienciaAceptarExtra', 'pzAdsAudienciaDescartarExtra', 'pzAdsAudienciaRefrescarPendiente']) {
  ok(appSrc.includes(`function ${fn}`), `app.js: ${fn} definida`);
}
ok(serverSrc.includes("app.post('/api/ads/billetera/audiencia/tema'"), 'server: endpoint tema (chat con el tema puesto)');
ok(serverSrc.includes("app.post('/api/ads/billetera/audiencia/pendiente'"), 'server: endpoint pendiente (aceptar/descartar cierra la tarea)');
ok(serverSrc.includes('[ads-otragente] intercepción'), 'server: la descripción se intercepta en la ruta del chat');
ok(dbSrc.includes('ads_otra_gente'), 'db: tabla ads_otra_gente (persistencia mínima)');
ok(appSrc.includes("location.hash = '#/app/chat'"), 'app.js: el chip abre el chat');
ok(appSrc.includes('PZ_ADS_OG_ESPERA'), 'app.js: hook de vuelta del chat (chatExchange trae el chip)');
{
  const propFit = A.propuestaDesdeFundamento(fund({ cta: 'local', categoria: 'fitness', audienciaTexto: '', ciudad: 'Palermo' }));
  const t1 = A.traducirDescripcion('quiero llegar a mamás que corren', propFit);
  ok(t1.chip && t1.chip.filtro.tipo === 'interes' && t1.chip.filtro.nombre === 'Running', '«mamás que corren» (fitness) → chip Running, del vocabulario del rubro');
  ok(t1.chip && t1.chip.etiqueta.length > 0, 'el chip trae etiqueta en lenguaje humano');
  const propBel = A.propuestaDesdeFundamento(fund({ cta: 'escribirte' }));
  const t2 = A.traducirDescripcion('chicas que aman el skincare', propBel);
  ok(t2.chip && t2.chip.filtro.nombre === 'Skin care', '«chicas que aman el skincare» (belleza) → chip Skin care');
  const t3 = A.traducirDescripcion('gente de cuarenta y pico', propBel);
  ok(t3.chip && t3.chip.filtro.tipo === 'edad' && t3.chip.filtro.edad_min === 35 && t3.chip.filtro.edad_max === 44, '«cuarenta y pico» → rango prefijado 35–44');
  const t4 = A.traducirDescripcion('quiero llegar a gamers que juegan videojuegos', propBel);
  ok(t4.chip === null && t4.cercano && t4.cercano.cercano === true && propBel.audiencia.intereses.some((i) => i.nombre === t4.cercano.filtro.nombre), 'interés real de otro rubro → sin chip directo, cercano DENTRO de su lista');
  const t5 = A.traducirDescripcion('quiero llegar a coleccionistas de sellos postales de otros planetas', propBel);
  ok(t5.chip === null && t5.cercano === null, 'descripción imposible → nada (el aviso honesto lo da el chat)');
  ok(A.traducirDescripcion('', propBel).chip === null, 'descripción vacía → nada');
  // El targeting final solo puede contener valores del vocabulario.
  for (const [desc, prop] of [['mamás que corren', propFit], ['chicas que aman el skincare', propBel], ['gente de cuarenta y pico', propBel], ['mujeres de cerca del barrio', propBel], ['quiero hombres de 30', propBel]]) {
    const t = A.traducirDescripcion(desc, prop);
    const c = t.chip || t.cercano;
    if (!c) continue;
    const f = c.filtro;
    const enVocab = f.tipo === 'interes' ? prop.audiencia.intereses.some((i) => i.nombre === f.nombre)
      : f.tipo === 'edad' ? prop.opciones.edades.some((e) => e[0] === f.edad_min && e[1] === f.edad_max)
      : f.tipo === 'genero' ? prop.opciones.generos.includes(f.valor)
      : f.tipo === 'radio' ? prop.opciones.radios.includes(f.radio_km) : false;
    ok(enVocab, `vocabulario cerrado: «${desc}» → ${f.tipo} dentro de las opciones`);
    if (t.chip) {
      const sel = JSON.parse(JSON.stringify(prop.audiencia));
      if (f.tipo === 'interes') sel.intereses.forEach((i) => { if (i.nombre === f.nombre) i.activo = true; });
      if (f.tipo === 'edad') { sel.edad_min = f.edad_min; sel.edad_max = f.edad_max; }
      if (f.tipo === 'genero') sel.genero = f.valor;
      if (f.tipo === 'radio') sel.radio_km = f.radio_km;
      ok(A.validarAudiencia(sel, prop).ok === true, `la audiencia con el chip aceptado pasa validarAudiencia («${desc}»)`);
    }
  }
}
{
  // VM: abrir el chip siembra el tema; el chip de vuelta se rinde y
  // aceptarlo aplica el filtro.
  const startM = '// ── (LOTE ADS-ESTRATÉGICOS) Tarjeta de audiencia';
  const chunk = appSrc.slice(appSrc.indexOf(startM), appSrc.indexOf('function pzBoostMarcarImpulsado'));
  const elSheet = { id: 'pzAdsAudienciaSheet', innerHTML: '', scrollIntoView() {} };
  const propFixture = {
    objetivo: 'local', objetivo_fuente: 'onboarding', objetivo_label: 'Que vengan a tu local',
    audiencia: { radio_km: 5, edad_min: 18, edad_max: 44, genero: 'todos', intereses: [{ nombre: 'Running', activo: false }, { nombre: 'Yoga', activo: true }], parecidos: true },
    opciones: { radios: [2, 5, 10], edades: [[18, 24], [25, 34], [25, 44], [35, 44], [35, 54], [45, 54], [55, 65], [18, 65]], generos: ['todos', 'mujeres', 'hombres'] },
    geo: { ciudad: 'Palermo', pais: 'AR' }, texto: '',
  };
  const postsF = [];
  const saysF = [];
  const sandboxF = {
    console, JSON, Number, String, Array, Object, Set, Promise, Math,
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s),
    gzT: (es) => es,
    toast: () => {},
    pzBoostKey: (p) => 'k' + (p.post_id || p.ig_media_id),
    pzBoostEsMP: () => false,
    pzBoostNewState: () => ({}),
    pzBoostMotivo: (m) => 'motivo:' + m,
    pzBoostImpulsados: new Set(),
    pzBoostMarcarImpulsado: () => {},
    pzBoostPintarExito: () => {},
    pzAdsRefrescar: async () => {},
    chatSay: (t) => { saysF.push(String(t)); },
    location: { hash: '' },
    api: {
      get: async () => ({ ok: true, propuesta: JSON.parse(JSON.stringify(propFixture)) }),
      post: async (p, body) => { postsF.push({ path: p, body }); if (p === '/api/ads/billetera/audiencia/tema') return { ok: true, mensaje: 'dale, busquemos a esa gente 🎯 mandame un audio' }; return { ok: true }; },
    },
    document: { getElementById: (id) => (id === 'pzAdsAudienciaSheet' ? elSheet : null) },
    pzBoostState: { selPost: { post_id: 5, text: 'Crema nueva' }, selId: 'k5', selMonto: 50, elegibles: [], billetera: { currency: 'USD', balance_cents: 10000 }, audienciaProp: JSON.parse(JSON.stringify(propFixture)), audienciaSel: JSON.parse(JSON.stringify(propFixture.audiencia)), audienciaVisible: true, audienciaKey: 'previa' },
  };
  vm.createContext(sandboxF);
  vm.runInContext(chunk, sandboxF);
  sandboxF.pzBoostState.chipExtra = { etiqueta: 'Running', filtro: { tipo: 'interes', nombre: 'Running' } };
  sandboxF.pzAdsAudienciaPintar();
  ok(elSheet.innerHTML.includes('★') && elSheet.innerHTML.includes('Running'), 'tarjeta: el chip que volvió del chat se rinde con ★ y su etiqueta');
  ok(elSheet.innerHTML.includes('Otra gente'), 'tarjeta: el chip «+ Otra gente» está al final de los chips');
  sandboxF.pzAdsAudienciaAceptarExtra();
  ok(sandboxF.pzBoostState.audienciaSel.intereses[0].activo === true, 'aceptar el chip ★ prende el interés en la audiencia');
  ok(sandboxF.pzBoostState.chipExtra === null && sandboxF.pzBoostState.audienciaKey === '', 'aceptar limpia el pendiente y pide «Sale así» de nuevo');
  ok(postsF.some((x) => x.path === '/api/ads/billetera/audiencia/pendiente' && x.body.accion === 'aceptar'), 'aceptar cierra la tarea en el servidor');
  await sandboxF.pzAdsAudienciaOtraGente();
  const temaCall = postsF.find((x) => x.path === '/api/ads/billetera/audiencia/tema');
  ok(!!temaCall && String(temaCall.body.resumen).includes('Para este anuncio') && String(temaCall.body.resumen).includes('Crema nueva'), 'abrir el chip deja la tarea con el resumen del anuncio (posteo + audiencia)');
  ok(sandboxF.location.hash === '#/app/chat', 'abrir el chip lleva al chat');
  ok(saysF.length === 2 && saysF[0].includes('📣') && saysF[0].includes('Para este anuncio'), 'el chat abre con el anuncio resumido y visible (no vacío)');
  ok(saysF[1] === 'dale, busquemos a esa gente 🎯 mandame un audio', 'Posty habla primero pidiendo esa gente (mensaje del servidor)');
  // La vuelta: el hook trae la propuesta fresca con el chip guardado.
  sandboxF.pzBoostState.chipExtra = null;
  sandboxF.api.get = async () => { const p = JSON.parse(JSON.stringify(propFixture)); p.pendiente = { chip: { etiqueta: 'Yoga', filtro: { tipo: 'interes', nombre: 'Yoga' } } }; return { ok: true, propuesta: p }; };
  await sandboxF.pzAdsAudienciaRefrescarPendiente();
  ok(sandboxF.pzBoostState.chipExtra && sandboxF.pzBoostState.chipExtra.etiqueta === 'Yoga', 'tras el turno del chat, el chip traducido queda en la tarjeta');
}

// ── §E · boot real ────────────────────────────────────────────────
console.log('§E boot real');
{
  const PORT = 18797;
  const BASE = `http://127.0.0.1:${PORT}`;
  const TMPD = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-ads-estr-'));
  const env = { ...process.env, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules', DATA_DIR: TMPD, PORT: String(PORT), DESTACADO_BOOST_ENABLED: '1', OPENAI_API_KEY: '', ADMIN_TOKEN: 'testtoken-ads-estr' };
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  const apiE = async (cookie, method, p, body) => {
    const r = await REAL_FETCH(BASE + p, { method, headers: { Cookie: cookie || '', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, j };
  };
  try {
    let ver = null;
    for (let i = 0; i < 40 && !ver; i++) {
      try { const r = await REAL_FETCH(BASE + '/api/version'); if (r.ok) ver = await r.json(); } catch (e) {}
      if (!ver) await new Promise((res) => setTimeout(res, 500));
    }
    if (!ver && /Cannot find module/.test(srvLog)) {
      skip('boot §E: express no resuelve en este entorno');
    } else {
      ok(!!ver, 'boot: el servidor levantó');
      ok(ver && ver.build === '20261105-v1054', `/api/version = v1054 (${ver && ver.build})`);
      const home = await (await REAL_FETCH(BASE + '/')).text();
      ok(home.includes('app.js?v=720'), 'index servido con app.js?v=720');
      const rr = await REAL_FETCH(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ads-estr@example.com', password: 'test1234', business_name: 'Belleza Test' }) });
      const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
      const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
      ok(cookie.length > 0, 'registro: sesión en cookie');
      const dbFile = fs.readdirSync(TMPD).find((f) => f.endsWith('.db'));
      const { DatabaseSync } = require('node:sqlite');
      const sdb = new DatabaseSync(path.join(TMPD, dbFile));
      const urow = sdb.prepare('SELECT id FROM users WHERE email = ?').get('ads-estr@example.com');
      const uid = urow && urow.id;
      ok(!!uid, 'uid del registro');
      const cols = sdb.prepare('PRAGMA table_info(ad_boosts)').all().map((c) => c.name);
      ok(cols.includes('objetivo') && cols.includes('audiencia_json') && cols.includes('last_conversaciones') && cols.includes('last_clicks'), 'ad_boosts: columnas del lote creadas en el boot');
      ok(!!sdb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ads_otra_gente'").get(), 'tabla ads_otra_gente creada en el boot');
      let aud = await apiE(cookie, 'GET', '/api/ads/billetera/audiencia');
      ok(aud.j && aud.j.ok && aud.j.propuesta && aud.j.propuesta.objetivo === null, 'sin fundamento → propuesta sin objetivo inventado');
      // La fila de profiles nace perezosa: se siembra la categoría
      // insertando si falta (todos los demás campos tienen default).
      const profRow = sdb.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(uid);
      if (profRow) sdb.prepare("UPDATE profiles SET category = 'belleza' WHERE user_id = ?").run(uid);
      else sdb.prepare("INSERT INTO profiles (user_id, category) VALUES (?, 'belleza')").run(uid);
      sdb.prepare("INSERT INTO client_digest (user_id, digest_json, hash, version, updated_at) VALUES (?, ?, '', 1, datetime('now'))")
        .run(uid, JSON.stringify({ onboarding: { cta: 'escribirte', audiencia: 'Mujeres' }, ciudad: 'Palermo', dueno: {} }));
      aud = await apiE(cookie, 'GET', '/api/ads/billetera/audiencia');
      const prop = aud.j && aud.j.propuesta;
      ok(prop && prop.objetivo === 'escribirte', 'fundamento → objetivo escribirte por HTTP');
      ok(prop && prop.texto.includes('Mujeres 25–44') && prop.texto.includes('Palermo'), 'fundamento → texto humano con género, edad del rubro y ciudad');
      ok(prop && prop.audiencia.intereses.some((i) => i.nombre === 'Skin care'), 'fundamento → intereses del rubro belleza');
      const invalida = JSON.parse(JSON.stringify(prop.audiencia)); invalida.radio_km = 7;
      const imBad = await apiE(cookie, 'POST', '/api/ads/billetera/impulsar', { posteoId: 999999, montoUSD: 50, audiencia: invalida });
      ok(imBad.status === 400 && imBad.j && imBad.j.motivo === 'audiencia_invalida', 'impulsar con radio fuera de opciones → 400 audiencia_invalida (sin gasto)');
      const imOk = await apiE(cookie, 'POST', '/api/ads/billetera/impulsar', { posteoId: 999999, montoUSD: 50, audiencia: prop.audiencia });
      ok(!(imOk.j && imOk.j.motivo === 'audiencia_invalida'), 'impulsar con la audiencia de la propuesta → pasa la validación (frena después, no acá)');
      sdb.prepare(`INSERT INTO ad_boosts (user_id, post_id, ig_media_id, budget_cents, currency, status, objetivo, audiencia_json, last_clicks, last_conversaciones, stats_updated_at)
        VALUES (?, 5, 'm5', 5000, 'USD', 'active', 'escribirte', ?, 3, 7, datetime('now'))`)
        .run(uid, JSON.stringify({ objetivo: 'escribirte', audiencia: prop.audiencia }));
      const boosts = await apiE(cookie, 'GET', '/api/ads/boosts');
      const fila = boosts.j && (boosts.j.boosts || []).find((b) => b.objetivo === 'escribirte');
      ok(!!fila, 'historial: el impulso persiste objetivo + audiencia');
      ok(fila && fila.resultado && fila.resultado.tipo === 'conversaciones' && fila.resultado.valor === 7, 'historial: el resultado son las conversaciones reales (7), no alcance');
      sdb.close();
      // «+ OTRA GENTE» punta a punta por HTTP.
      const tema = await apiE(cookie, 'POST', '/api/ads/billetera/audiencia/tema', { resumen: 'Para este anuncio: «Crema nueva» · $50 · Mujeres 25–44 · a 5 km de tu local en Palermo' });
      ok(tema.j && tema.j.ok && String(tema.j.mensaje || '').includes('audio'), 'tema: Posty pide el audio con el tema puesto (no chat genérico)');
      const chat1 = await apiE(cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'quiero llegar a chicas que aman el skincare' }] });
      ok(chat1.j && String(chat1.j.reply || '').includes('chip') && String(chat1.j.reply || '').includes('tarjeta del anuncio'), 'chat: la descripción se traduce y Posty avisa que el chip quedó en la tarjeta');
      const aud2 = await apiE(cookie, 'GET', '/api/ads/billetera/audiencia');
      const chipHttp = aud2.j && aud2.j.propuesta && aud2.j.propuesta.pendiente && aud2.j.propuesta.pendiente.chip;
      ok(chipHttp && chipHttp.filtro && chipHttp.filtro.tipo === 'interes' && chipHttp.filtro.nombre === 'Skin care', 'GET audiencia: el chip traducido espera en la tarjeta (Skin care)');
      const cierre = await apiE(cookie, 'POST', '/api/ads/billetera/audiencia/pendiente', { accion: 'aceptar' });
      const aud3 = await apiE(cookie, 'GET', '/api/ads/billetera/audiencia');
      ok(cierre.j && cierre.j.ok && aud3.j && aud3.j.propuesta && !aud3.j.propuesta.pendiente, 'aceptar en la tarjeta cierra la tarea (sin chip pendiente)');
      await apiE(cookie, 'POST', '/api/ads/billetera/audiencia/tema', { resumen: 'Para este anuncio: otro' });
      const chat2 = await apiE(cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'quiero llegar a coleccionistas de sellos postales de otros planetas' }] });
      ok(chat2.j && String(chat2.j.reply || '').includes('no lo puedo filtrar'), 'chat: lo imposible → aviso honesto en el chat');
      const aud4 = await apiE(cookie, 'GET', '/api/ads/billetera/audiencia');
      ok(aud4.j && aud4.j.propuesta && !aud4.j.propuesta.pendiente, 'lo imposible no deja chip fantasma en la tarjeta');
    }
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    try { fs.rmSync(TMPD, { recursive: true, force: true }); } catch (e) {}
  }
}

console.log(`\n== ads-estrategicos: ${total - fails}/${total} ok · ${fails} fail · ${skips} skip ==`);
process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
