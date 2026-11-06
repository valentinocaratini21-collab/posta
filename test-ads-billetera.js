// test-ads-billetera.js — LOTE ADS-BILLETERA (base v701).
// Billetera USD: cargar plata ($20/$50/$100, Stripe off-session) y elegir
// el posteo; Posty hace el resto. El débito del saldo ocurre SOLO cuando
// el ad se crea bien; si la creación falla, NO se debita nada.
// Gates: permiso ads_management ANTES de gastar; sin tasa →
// conversion_pendiente SIN gasto; sin reembolso automático.
// Node puro, módulos reales + inyección de dependencias. Uso:
// node test-ads-billetera.js
'use strict';
const fs = require('fs');
const path = require('path');
const ab = require(path.join(__dirname, 'ads-billetera.js'));
const dc = require(path.join(__dirname, 'destacado-cobro.js'));
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

(async () => {
  // ---------- 1. Montos y refs ----------
  t(JSON.stringify(ab.MONTOS_CARGA_USD) === JSON.stringify([20, 50, 100]), 'montos: exactamente $20/$50/$100 (los existentes, no inventados)');
  t(ab.DIAS_BILLETERA === 7, 'duración: 7 días (la existente)');
  t(ab.validarMontoUSD(20) && ab.validarMontoUSD(50) && ab.validarMontoUSD(100), 'montos válidos: 20/50/100');
  t(!ab.validarMontoUSD(10) && !ab.validarMontoUSD(25) && !ab.validarMontoUSD(0) && !ab.validarMontoUSD(-20) && !ab.validarMontoUSD('50') && !ab.validarMontoUSD(null) && !ab.validarMontoUSD(NaN), 'montos inválidos: 10/25/0/negativo/string/null/NaN');
  t(ab.refDebitoBoost({ clienteId: 7, posteoId: 9, montoUSD: 50, fecha: '2026-11-05' }) === 'boost_usd:u7:p9:50:2026-11-05', 'ref de débito: formato único por cliente+posteo+monto+día');

  // ---------- 2. cargarBilletera (módulo puro) ----------
  const spyCarga = () => { let cobro = 0, acred = 0; return {
    buscarCarga: () => null,
    cobrar: async () => { cobro++; return { ok: true, cobroId: 'pi_carga1' }; },
    acreditar: async () => { acred++; return { ok: true, saldoNuevo: 5000 }; },
    get cobro() { return cobro; }, get acred() { return acred; } }; };
  let s = spyCarga();
  const cOk = await ab.cargarBilletera({ clienteId: 1, montoUSD: 50, monedaActual: 'USD', saldoActual: 0, ref: 'carga_1', buscarCarga: s.buscarCarga, cobrar: s.cobrar, acreditar: s.acreditar });
  t(cOk && cOk.ok && cOk.montoUSD === 50 && cOk.saldoNuevo === 5000 && cOk.cobroId === 'pi_carga1', 'carga: $50 → saldo sube exacto a $50, con cobroId');
  t(s.cobro === 1 && s.acred === 1, 'carga: cobrar y acreditar se llaman UNA vez cada uno');
  // Reintento con el mismo ref: no duplica el cargo.
  let cobro2 = 0;
  const cRe = await ab.cargarBilletera({ clienteId: 1, montoUSD: 50, monedaActual: 'USD', saldoActual: 5000, ref: 'carga_1',
    buscarCarga: () => ({ ref: 'carga_1' }),
    cobrar: async () => { cobro2++; return { ok: true, cobroId: 'pi_otro' }; },
    acreditar: async () => { throw new Error('no debería acreditar'); } });
  t(cRe && cRe.ok && cRe.ya_cargado === true && cRe.cobroId === 'carga_1', 'carga: reintento mismo ref → ya_cargado (cobroId = el ref), sin segundo cobro');
  t(cobro2 === 0, 'carga: reintento → cobrar NO se llama');
  // Monto inválido: nada.
  s = spyCarga();
  const cMal = await ab.cargarBilletera({ clienteId: 1, montoUSD: 30, monedaActual: 'USD', saldoActual: 0, ref: 'carga_2', buscarCarga: s.buscarCarga, cobrar: s.cobrar, acreditar: s.acreditar });
  t(cMal && !cMal.ok && cMal.motivo === 'monto_invalido', 'carga: monto inválido → monto_invalido');
  t(s.cobro === 0 && s.acred === 0, 'carga: monto inválido → NO se cobra ni se acredita');
  // Saldo ARS viejo > 0: nunca se mezcla.
  s = spyCarga();
  const cArs = await ab.cargarBilletera({ clienteId: 1, montoUSD: 50, monedaActual: 'ARS', saldoActual: 30000, ref: 'carga_3', buscarCarga: s.buscarCarga, cobrar: s.cobrar, acreditar: s.acreditar });
  t(cArs && !cArs.ok && cArs.motivo === 'saldo_ars_pendiente', 'carga: saldo ARS > 0 → saldo_ars_pendiente (nunca mezclar monedas)');
  t(s.cobro === 0, 'carga: saldo ARS > 0 → NO se cobra');
  // Saldo ARS = 0: la migración la hace el endpoint; el módulo no bloquea.
  s = spyCarga();
  const cArs0 = await ab.cargarBilletera({ clienteId: 1, montoUSD: 20, monedaActual: 'ARS', saldoActual: 0, ref: 'carga_4', buscarCarga: s.buscarCarga, cobrar: s.cobrar, acreditar: s.acreditar });
  t(cArs0 && cArs0.ok, 'carga: saldo ARS = 0 → se permite (el endpoint migra la moneda a USD)');
  // Cobro falla: nada se acredita.
  s = spyCarga();
  const cCobroFalla = await ab.cargarBilletera({ clienteId: 1, montoUSD: 50, monedaActual: 'USD', saldoActual: 0, ref: 'carga_5',
    buscarCarga: s.buscarCarga, cobrar: async () => { s.cobrar(); return { ok: false, motivo: 'cobro_fallido' }; }, acreditar: s.acreditar });
  t(cCobroFalla && !cCobroFalla.ok && cCobroFalla.motivo === 'cobro_fallido', 'carga: cobro fallido → cobro_fallido');
  t(s.acred === 0, 'carga: cobro fallido → NO se acredita');
  // Cobro OK pero acreditar falla: cobro_sin_acreditar CON cobroId (urgente, nunca silencio).
  const cSinAcr = await ab.cargarBilletera({ clienteId: 1, montoUSD: 50, monedaActual: 'USD', saldoActual: 0, ref: 'carga_6',
    buscarCarga: () => null, cobrar: async () => ({ ok: true, cobroId: 'pi_urgente' }),
    acreditar: async () => ({ ok: false, motivo: 'acreditar_fallido' }) });
  t(cSinAcr && !cSinAcr.ok && cSinAcr.motivo === 'cobro_sin_acreditar' && cSinAcr.cobroId === 'pi_urgente', 'carga: cobro sin acreditar → cobro_sin_acreditar + cobroId para revisión urgente');
  // Demo: nada.
  s = spyCarga();
  const cDemo = await ab.cargarBilletera({ clienteId: 1, montoUSD: 50, monedaActual: 'USD', saldoActual: 0, ref: 'carga_7', demo: true, buscarCarga: s.buscarCarga, cobrar: s.cobrar, acreditar: s.acreditar });
  t(cDemo && !cDemo.ok && cDemo.motivo === 'demo', 'carga: demo → nada');
  t(s.cobro === 0 && s.acred === 0, 'carga: demo → NO se cobra ni se acredita');

  // ---------- 3. impulsarConSaldo (módulo puro) ----------
  const baseImp = { clienteId: 1, posteoId: 9, montoUSD: 50, zona: 'AR',
    env: { DESTACADO_BOOST_ENABLED: '1' }, adsConfigurado: true, paginaAutorizada: true,
    permisoAds: true, conversionARS: (m) => m * 1200 * 100, saldoCentsUSD: 10000, fecha: '2026-11-05',
    buscarDebito: () => null, registrar: async () => {} };
  const spyImp = () => { let crear = 0, debitar = 0; return {
    crearAnuncio: async () => { crear++; return { ok: true, anuncioId: 'camp_1', campaignId: 'camp_1', adsetId: 'a1', adId: 'd1' }; },
    debitar: async () => { debitar++; return { ok: true, saldoNuevo: 5000 }; },
    // OJO: los contadores NO se llaman igual que los métodos (un getter
    // con el mismo nombre pisa al método en el literal del objeto).
    get nCrear() { return crear; }, get nDebitar() { return debitar; } }; };
  let si = spyImp();
  let recExito = null;
  const iOk = await ab.impulsarConSaldo({ ...baseImp, crearAnuncio: si.crearAnuncio, debitar: si.debitar, registrar: async (rec) => { recExito = rec; } });
  t(iOk && iOk.ok && iOk.anuncioId === 'camp_1' && iOk.posteoId === 9 && iOk.montoUSD === 50 && iOk.dias === 7, 'impulsar: ad se crea, $50 x 7 días, con anuncioId');
  t(recExito && recExito.tipo === 'exito' && recExito.spendCents === 6000000, 'impulsar: spend registrado en ARS = $50 × tasa 1200 × 100 = 6.000.000c');
  t(iOk && iOk.saldoNuevo === 5000, 'impulsar: saldo baja exacto $100 → $50');
  t(si.nCrear === 1 && si.nDebitar === 1, 'impulsar: crear y debitar se llaman UNA vez cada uno');
  // Sin permiso: nada.
  si = spyImp();
  const iSinPerm = await ab.impulsarConSaldo({ ...baseImp, permisoAds: false, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iSinPerm && !iSinPerm.ok && iSinPerm.motivo === 'ads_sin_permiso', 'impulsar: permisoAds false → ads_sin_permiso');
  t(si.nCrear === 0 && si.nDebitar === 0, 'impulsar: sin permiso → NO se crea NI se debita (fail-closed antes de gastar)');
  si = spyImp();
  const iSinVer = await ab.impulsarConSaldo({ ...baseImp, permisoAds: undefined, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iSinVer && !iSinVer.ok && iSinVer.motivo === 'ads_sin_permiso', 'impulsar: permisoAds ausente → ads_sin_permiso (gate estricto)');
  t(si.nCrear === 0 && si.nDebitar === 0, 'impulsar: sin verificar → NO se gasta');
  // Sin tasa: nada.
  si = spyImp();
  const iSinTasa = await ab.impulsarConSaldo({ ...baseImp, conversionARS: null, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iSinTasa && !iSinTasa.ok && iSinTasa.motivo === 'conversion_pendiente', 'impulsar: sin tasa → conversion_pendiente (gate v589 intacto)');
  t(si.nCrear === 0 && si.nDebitar === 0, 'impulsar: sin tasa → NO se crea NI se debita');
  // Flag off / demo / gates previos.
  si = spyImp();
  const iFlag = await ab.impulsarConSaldo({ ...baseImp, env: {}, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iFlag && !iFlag.ok && iFlag.motivo === 'boost_deshabilitado', 'impulsar: flag apagado → boost_deshabilitado');
  t(si.nCrear === 0 && si.nDebitar === 0, 'impulsar: flag off → nada');
  si = spyImp();
  const iDemo = await ab.impulsarConSaldo({ ...baseImp, demo: true, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iDemo && !iDemo.ok && iDemo.motivo === 'demo', 'impulsar: demo → nada');
  t(si.nCrear === 0 && si.nDebitar === 0, 'impulsar: demo → NO se crea NI se debita');
  si = spyImp();
  const iSinZona = await ab.impulsarConSaldo({ ...baseImp, zona: '', crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iSinZona && !iSinZona.ok && iSinZona.motivo === 'sin_zona', 'impulsar: sin zona → sin_zona');
  const iMonto = await ab.impulsarConSaldo({ ...baseImp, montoUSD: 30, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iMonto && !iMonto.ok && iMonto.motivo === 'monto_invalido', 'impulsar: monto inválido → monto_invalido');
  const iSinPost = await ab.impulsarConSaldo({ ...baseImp, posteoId: 0, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iSinPost && !iSinPost.ok && iSinPost.motivo === 'sin_posteo', 'impulsar: sin posteo → sin_posteo');
  const iSinAds = await ab.impulsarConSaldo({ ...baseImp, adsConfigurado: false, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iSinAds && !iSinAds.ok && iSinAds.motivo === 'ads_no_configurado', 'impulsar: ads no configurado → ads_no_configurado');
  const iSinPag = await ab.impulsarConSaldo({ ...baseImp, paginaAutorizada: false, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iSinPag && !iSinPag.ok && iSinPag.motivo === 'sin_autorizacion_publicitaria', 'impulsar: página no autorizada → sin_autorizacion_publicitaria');
  // La creación falla: NO se debita (la regla central del lote).
  si = spyImp();
  const iCreaFalla = await ab.impulsarConSaldo({ ...baseImp, crearAnuncio: async () => { si.crearAnuncio(); throw new Error('meta caído'); }, debitar: si.debitar });
  t(iCreaFalla && !iCreaFalla.ok && iCreaFalla.motivo === 'anuncio_fallido', 'impulsar: creación falla → anuncio_fallido');
  t(si.nDebitar === 0, 'impulsar: creación falla → NO se debita nada (fail-closed)');
  // Saldo insuficiente: ni se crea el ad.
  si = spyImp();
  const iPobre = await ab.impulsarConSaldo({ ...baseImp, saldoCentsUSD: 2000, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(iPobre && !iPobre.ok && iPobre.motivo === 'saldo_insuficiente', 'impulsar: saldo $20 < $50 → saldo_insuficiente');
  t(si.nCrear === 0 && si.nDebitar === 0, 'impulsar: saldo insuficiente → NO se crea el ad');
  // Reintento del mismo impulso: un solo débito.
  si = spyImp();
  const i1 = await ab.impulsarConSaldo({ ...baseImp, crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(i1 && i1.ok, 'impulsar: primer intento ok');
  const i2 = await ab.impulsarConSaldo({ ...baseImp, buscarDebito: () => ({ anuncioId: 'camp_1', meta_campaign_id: 'camp_1' }), crearAnuncio: si.crearAnuncio, debitar: si.debitar });
  t(i2 && i2.ok && i2.ya_creado === true && i2.anuncioId === 'camp_1', 'impulsar: reintento mismo ref → ya_creado, mismo anuncioId');
  t(si.nCrear === 1 && si.nDebitar === 1, 'impulsar: reintento → crear y debitar siguen en 1 (un solo débito)');
  // Débito falla tras crear: debito_fallido CON anuncioId, registrado para revisión manual.
  let regTipo = null;
  const iDebFalla = await ab.impulsarConSaldo({ ...baseImp,
    crearAnuncio: async () => ({ ok: true, anuncioId: 'camp_9', campaignId: 'camp_9', adsetId: 'a9', adId: 'd9' }),
    debitar: async () => ({ ok: false, motivo: 'saldo_insuficiente' }),
    registrar: async (rec) => { regTipo = rec.tipo; } });
  t(iDebFalla && !iDebFalla.ok && iDebFalla.motivo === 'debito_fallido' && iDebFalla.anuncioId === 'camp_9', 'impulsar: débito falla tras crear → debito_fallido + anuncioId');
  t(regTipo === 'debito_fallido', 'impulsar: débito fallido queda registrado para revisión manual');

  // ---------- 4. elegiblesParaAds ----------
  // (El módulo exige status 'published' y devuelve `post_id`, no `id`:
  // así lo consume el picker de la carta.)
  const posts = [
    { id: 1, status: 'published', ig_media_id: 'm1', caption: 'A' },
    { id: 2, status: 'published', ig_media_id: '', caption: 'B' },
    { id: 3, status: 'published', caption: 'C' },
    { id: 4, status: 'published', ig_media_id: 'm4', caption: 'D' },
    { id: 5, status: 'published', ig_media_id: 'm5', caption: 'E' },
    { id: 6, status: 'scheduled', ig_media_id: 'm6', caption: 'F' },
  ];
  const el1 = ab.elegiblesParaAds(posts, 4, new Set([5]));
  t(el1.length === 2 && el1[0].post_id === 4 && el1[0].recomendado === true && el1[1].post_id === 1, 'elegibles: publicados con ig_media_id, recomendado primero');
  t(el1.every((e) => typeof e.post_id === 'number' && typeof e.recomendado === 'boolean' && typeof e.saves === 'number'), 'elegibles: forma del picker (post_id + recomendado + saves)');
  const el2 = ab.elegiblesParaAds(posts, null, new Set());
  t(el2.length === 3 && el2.every((e) => e.recomendado === false), 'elegibles: sin recomendado → nadie marcado');
  const el3 = ab.elegiblesParaAds(posts, 5, new Set([5]));
  t(el3.length === 2 && !el3.some((e) => e.post_id === 5), 'elegibles: el ya impulsado activo NO se ofrece (aunque sea el recomendado)');
  t(ab.elegiblesParaAds([], null, new Set()).length === 0, 'elegibles: sin posteos → lista vacía');
  t(!el1.some((e) => e.post_id === 6), 'elegibles: el programado (no publicado) NO se ofrece');

  // ---------- 5. cobrarCargaBilletera (destacado-cobro.js, Stripe fake) ----------
  // (La interfaz real de resolverTarjetaGuardada: customers.retrieve para
  // el método por defecto, paymentMethods.list como respaldo.)
  const captured = { params: null, opts: null };
  const fakeClient = (pi, pmId) => ({
    paymentIntents: { create: async (params, opts) => { captured.params = params; captured.opts = opts; return pi; } },
    customers: { retrieve: async () => ({ invoice_settings: { default_payment_method: pmId || 'pm_guardada1' } }) },
    paymentMethods: { list: async () => ({ data: [{ id: pmId || 'pm_guardada1' }] }) },
  });
  let fc = fakeClient({ id: 'pi_carga_ok', status: 'succeeded' });
  const ccOk = await dc.cobrarCargaBilletera({ client: fc, customerId: 'cus_1', montoUSD: 50, ref: 'carga_test_1' });
  t(ccOk && ccOk.ok && ccOk.cobroId === 'pi_carga_ok', 'cobro carga: ok + cobroId');
  t(captured.params.amount === 5000 && captured.params.currency === 'usd' && captured.params.off_session === true && captured.params.confirm === true, 'cobro carga: $50 off-session confirmado en USD');
  t(String(captured.params.description).includes('Carga billetera ads $50'), 'cobro carga: descripción clara para el cliente');
  t(captured.params.metadata && captured.params.metadata.tipo === 'billetera_carga', 'cobro carga: metadata tipo billetera_carga (no se confunde con impulso)');
  t(String(captured.opts.idempotencyKey).includes('carga_test_1'), 'cobro carga: idempotencia con el ref de la carga');
  t(captured.params.payment_method === 'pm_guardada1', 'cobro carga: usa la tarjeta guardada');
  const ccMal = await dc.cobrarCargaBilletera({ client: fc, customerId: 'cus_1', montoUSD: 30, ref: 'x' });
  t(ccMal && !ccMal.ok && ccMal.motivo === 'monto_invalido', 'cobro carga: monto inválido → monto_invalido');
  const ccSinCli = await dc.cobrarCargaBilletera({ client: null, customerId: 'cus_1', montoUSD: 50, ref: 'x' });
  t(ccSinCli && !ccSinCli.ok && ccSinCli.motivo === 'stripe_no_configurado', 'cobro carga: sin Stripe → stripe_no_configurado');
  const ccSinCus = await dc.cobrarCargaBilletera({ client: fc, customerId: '', montoUSD: 50, ref: 'x' });
  t(ccSinCus && !ccSinCus.ok && ccSinCus.motivo === 'sin_cliente_stripe', 'cobro carga: sin cliente Stripe → sin_cliente_stripe');
  fc = fakeClient({ id: 'pi_accion', status: 'requires_action' });
  const ccAcc = await dc.cobrarCargaBilletera({ client: fc, customerId: 'cus_1', montoUSD: 50, ref: 'x' });
  t(ccAcc && !ccAcc.ok && ccAcc.motivo === 'cobro_requiere_accion', 'cobro carga: 3DS → cobro_requiere_accion (nunca se cobra a ciegas)');
  const fcThrow = { paymentIntents: { create: async () => { throw new Error('card_declined'); } },
    customers: { retrieve: async () => ({ invoice_settings: { default_payment_method: 'pm_1' } }) },
    paymentMethods: { list: async () => ({ data: [{ id: 'pm_1' }] }) } };
  const ccThrow = await dc.cobrarCargaBilletera({ client: fcThrow, customerId: 'cus_1', montoUSD: 50, ref: 'x' });
  t(ccThrow && !ccThrow.ok && ccThrow.motivo === 'cobro_fallido', 'cobro carga: Stripe rechaza → cobro_fallido');
  const fcSinPm = { paymentIntents: { create: async () => ({ id: 'pi_x', status: 'succeeded' }) },
    customers: { retrieve: async () => ({ invoice_settings: {} }) },
    paymentMethods: { list: async () => ({ data: [] }) } };
  const ccSinPm = await dc.cobrarCargaBilletera({ client: fcSinPm, customerId: 'cus_1', montoUSD: 50, ref: 'x' });
  t(ccSinPm && !ccSinPm.ok && ccSinPm.motivo === 'sin_tarjeta_guardada', 'cobro carga: sin tarjeta guardada → sin_tarjeta_guardada');

  // ---------- 6. Servidor: endpoints nuevos + gap cerrado en /api/ads/boost ----------
  t(srv.includes("app.get('/api/ads/billetera'"), 'server: GET /api/ads/billetera existe');
  t(srv.includes("app.post('/api/ads/billetera/cargar'"), 'server: POST /api/ads/billetera/cargar existe');
  t(srv.includes("app.get('/api/ads/billetera/elegibles'"), 'server: GET /api/ads/billetera/elegibles existe');
  t(srv.includes("app.post('/api/ads/billetera/impulsar'"), 'server: POST /api/ads/billetera/impulsar existe');
  t(srv.includes("require('./ads-billetera')"), 'server: require de ads-billetera.js');
  const bilStart = srv.indexOf("app.post('/api/ads/billetera/impulsar'");
  const bilBlock = srv.slice(bilStart, srv.indexOf('// Crear preferencia de MercadoPago', bilStart));
  const billeteraBlock = srv.slice(srv.indexOf("app.get('/api/ads/billetera'"), srv.indexOf('// Crear preferencia de MercadoPago', bilStart));
  t(bilBlock.includes('checkAdsPermission'), 'impulsar con saldo: verifica el permiso ads_management');
  t(bilBlock.indexOf('checkAdsPermission') < bilBlock.indexOf('impulsarConSaldo'), 'impulsar con saldo: el permiso se verifica ANTES de gastar');
  t(bilBlock.includes("motivo: 'ya_impulsado'"), 'impulsar con saldo: posteo con pauta activa → ya_impulsado');
  t(bilBlock.includes("motivo: 'saldo_ars_pendiente'"), 'impulsar con saldo: saldo ARS viejo → saldo_ars_pendiente');
  t(billeteraBlock.includes("currency = 'USD'") && billeteraBlock.includes('topup_usd'), 'cargar: acredita en USD con kind topup_usd (ledger durable, una sola verdad)');
  t(bilBlock.includes('currency, status, meta_campaign_id') && bilBlock.includes("'USD','active'"), 'impulsar con saldo: registra el boost en USD activo con fee 0');
  t(billeteraBlock.includes('demo_mode'), 'demo: los endpoints pasan demo_mode (settings) al módulo — en demo nada se cobra ni se gasta');
  const boostStart = srv.indexOf("app.post('/api/ads/boost'");
  const boostBlock = srv.slice(boostStart, srv.indexOf('// Historial de pautas', boostStart));
  t(boostBlock.includes('checkAdsPermission'), 'boost viejo: AHORA verifica el permiso ads_management (gap cerrado)');
  t(boostBlock.indexOf('checkAdsPermission') < boostBlock.indexOf('adWalletMove(req.session.userId, -budgetCents'), 'boost viejo: el permiso se verifica ANTES de debitar');
  t(boostBlock.indexOf('createBoost') < boostBlock.indexOf('adWalletMove(req.session.userId, -budgetCents'), 'boost viejo: el ad se crea ANTES de debitar (sin débito si Meta falla)');
  t(boostBlock.includes("'ad creado sin débito'"), 'boost viejo: ad creado sin débito queda asentado para revisión manual');
  t(!srv.includes('refunds.create') && !srv.includes('stripe.refunds'), 'sin reembolso automático en el servidor (política sin definir: registro + revisión manual)');

  console.log(`\ntest-ads-billetera: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', e && e.stack || e); process.exit(1); });
