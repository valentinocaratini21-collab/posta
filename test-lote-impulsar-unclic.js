// test-lote-impulsar-unclic.js — LOTE IMPULSAR-UN-CLIC (base v697).
// La carta del domingo lleva el posteo a boostear DENTRO de la carta,
// muy a la vista, y el flujo es EN UN CLIC: un toque cobra y crea el
// ad. Fail-closed: sin tasa → conversion_pendiente sin cobrar; sin
// permiso ads_management → estado bloqueado claro, nunca éxito falso.
// (ADS-BILLETERA: §4 y §5 SUPERSEDED por la UI de billetera — cargar
// plata + elegir posteo + meter ads con saldo; §1–§3 y §6 INTACTOS: el
// flujo viejo de impulsar y sus gates siguen vivos en el servidor.)
// Node puro, lee el árbol. Uso: node test-lote-impulsar-unclic.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const dest = fs.readFileSync(path.join(__dirname, 'public/destacado.js'), 'utf8');
const ds = require(path.join(__dirname, 'destacado-semana.js'));
const metaAds = require(path.join(__dirname, 'meta_ads.js'));
const cnt = (s, sub) => (s.split(sub).length - 1);

// ---------- 1. Gate permisoAds en procesarImpulso (módulo real) ----------
(async () => {
  const base = { semana: { destacadoId: 7 }, monto: 50, clienteId: 1, zona: 'AR',
    env: { DESTACADO_BOOST_ENABLED: '1' }, adsConfigurado: true, paginaAutorizada: true,
    posteoPublicado: true, registrar: async () => {} };
  const spy = () => { let cobro = 0, anuncio = 0; return {
    cobrar: async () => { cobro++; return { ok: true, cobroId: 'pi_x' }; },
    publicarAnuncio: async () => { anuncio++; return { ok: true, anuncioId: 'c1', campaignId: 'c1', adsetId: 'a1', adId: 'd1' }; },
    get cobro() { return cobro; }, get anuncio() { return anuncio; } }; };

  let s = spy();
  const rSinPermiso = await ds.procesarImpulso({ ...base, permisoAds: false, conversionARS: () => 500000,
    cobrar: s.cobrar, publicarAnuncio: s.publicarAnuncio });
  t(rSinPermiso && !rSinPermiso.ok && rSinPermiso.motivo === 'ads_sin_permiso', 'permisoAds false → ads_sin_permiso');
  t(s.cobro === 0 && s.anuncio === 0, 'sin permiso → NO se cobra NI se crea el ad (fail-closed antes del cobro)');

  s = spy();
  const rSinVerificar = await ds.procesarImpulso({ ...base, conversionARS: () => 500000,
    cobrar: s.cobrar, publicarAnuncio: s.publicarAnuncio });
  t(rSinVerificar && !rSinVerificar.ok && rSinVerificar.motivo === 'ads_sin_permiso', 'permisoAds ausente → ads_sin_permiso (gate estricto, sin verificar = bloqueado)');
  t(s.cobro === 0, 'sin verificar → NO se cobra');

  s = spy();
  const rSinTasa = await ds.procesarImpulso({ ...base, permisoAds: true, conversionARS: null,
    cobrar: s.cobrar, publicarAnuncio: s.publicarAnuncio });
  t(rSinTasa && !rSinTasa.ok && rSinTasa.motivo === 'conversion_pendiente', 'gate v589 intacto: sin tasa → conversion_pendiente');
  t(s.cobro === 0, 'gate v589: sin tasa → NO se cobra');

  s = spy();
  const rOk = await ds.procesarImpulso({ ...base, permisoAds: true, conversionARS: () => 500000,
    cobrar: s.cobrar, publicarAnuncio: s.publicarAnuncio });
  t(rOk && rOk.ok && rOk.posteoId === 7 && rOk.montoUSD === 50 && rOk.cobroId === 'pi_x' && rOk.anuncioId === 'c1', 'con permiso + tasa: flujo completo (cobro + anuncio)');
  t(s.cobro === 1 && s.anuncio === 1, 'con permiso + tasa: cobrar y publicar se llaman UNA vez cada uno');

  s = spy();
  const rAnuncioCaido = await ds.procesarImpulso({ ...base, permisoAds: true, conversionARS: () => 500000,
    cobrar: s.cobrar, publicarAnuncio: async () => { throw new Error('meta caído'); } });
  t(rAnuncioCaido && !rAnuncioCaido.ok && rAnuncioCaido.motivo === 'anuncio_fallido' && rAnuncioCaido.cobroId === 'pi_x', 'anuncio fallido tras cobro: motivo + cobroId, sin reembolso automático');

  // crearImpulso (síncrono): mismo gate.
  const cs = spy();
  const c1 = ds.crearImpulso({ ...base, permisoAds: false, cobrar: () => { cs.cobrar(); return { ok: true }; }, publicarAnuncio: () => ({ ok: true }) });
  t(c1 && !c1.ok && c1.motivo === 'ads_sin_permiso', 'crearImpulso: permisoAds false → ads_sin_permiso');
  t(cs.cobro === 0, 'crearImpulso: sin permiso → NO se cobra');
  const c2 = ds.crearImpulso({ ...base, permisoAds: true, cobrar: () => ({ ok: true, cobroId: 'pi_z' }), publicarAnuncio: () => ({ ok: true, anuncioId: 'c9' }) });
  t(c2 && c2.ok && c2.cobroId === 'pi_z', 'crearImpulso: con permiso → ok');

  // ---------- 2. conversionARSFromEnv: la tasa es config, nunca inventada ----------
  t(ds.conversionARSFromEnv({}) === null, 'tasa: sin env → null (gate conversion_pendiente)');
  t(ds.conversionARSFromEnv({ IMPULSO_TASA_ARS: '' }) === null, 'tasa: vacía → null');
  t(ds.conversionARSFromEnv({ IMPULSO_TASA_ARS: 'abc' }) === null, 'tasa: no numérica → null');
  t(ds.conversionARSFromEnv({ IMPULSO_TASA_ARS: '0' }) === null, 'tasa: 0 → null');
  t(ds.conversionARSFromEnv({ IMPULSO_TASA_ARS: '-5' }) === null, 'tasa: negativa → null');
  const conv1200 = ds.conversionARSFromEnv({ IMPULSO_TASA_ARS: '1200' });
  t(typeof conv1200 === 'function' && conv1200(20) === 2400000 && conv1200(50) === 6000000 && conv1200(100) === 12000000, 'tasa 1200: 20→$2.400.000c, 50→$6.000.000c, 100→$12.000.000c');
  const convDec = ds.conversionARSFromEnv({ IMPULSO_TASA_ARS: ' 1200.5 ' });
  t(typeof convDec === 'function' && convDec(50) === 6002500, 'tasa con decimales y espacios: se acepta y se redondea a centavos');

  // ---------- 3. meta_ads.checkAdsPermission (fetch stubbeado) ----------
  const envBak = { token: process.env.META_ADS_TOKEN, acct: process.env.META_AD_ACCOUNT_ID };
  const fetchBak = global.fetch;
  try {
    delete process.env.META_ADS_TOKEN; delete process.env.META_AD_ACCOUNT_ID;
    const p0 = await metaAds.checkAdsPermission();
    t(p0 && !p0.ok && p0.hasAdsManagement === false, 'permiso: sin configurar → {ok:false} (el llamador falla cerrado)');
    process.env.META_ADS_TOKEN = 'tokendeprueba1234567890';
    process.env.META_AD_ACCOUNT_ID = 'act123456';
    global.fetch = async () => ({ ok: true, json: async () => ({ data: [
      { permission: 'ads_management', status: 'granted' },
      { permission: 'ads_read', status: 'granted' },
    ] }) });
    const p1 = await metaAds.checkAdsPermission();
    t(p1 && p1.ok === true && p1.hasAdsManagement === true, 'permiso: granted ads_management → true');
    global.fetch = async () => ({ ok: true, json: async () => ({ data: [
      { permission: 'ads_read', status: 'granted' },
      { permission: 'instagram_basic', status: 'granted' },
    ] }) });
    const p2 = await metaAds.checkAdsPermission();
    t(p2 && p2.ok === true && p2.hasAdsManagement === false, 'permiso: sin ads_management (solo ads_read) → false, sin éxito falso');
    global.fetch = async () => { throw new Error('red caída'); };
    const p3 = await metaAds.checkAdsPermission();
    t(p3 && !p3.ok && p3.hasAdsManagement === false, 'permiso: Meta caído → {ok:false} (nunca se asume el permiso)');
  } finally {
    if (envBak.token === undefined) delete process.env.META_ADS_TOKEN; else process.env.META_ADS_TOKEN = envBak.token;
    if (envBak.acct === undefined) delete process.env.META_AD_ACCOUNT_ID; else process.env.META_AD_ACCOUNT_ID = envBak.acct;
    global.fetch = fetchBak;
  }

  // ---------- 4. Cliente: billetera + picker + motivos + estados previos ----------
  // (ADS-BILLETERA: SUPERSEDE el §4 de impulsar-un-clic. El render ya no
  // es anaBoostRecHTML(d) sino anaBilleteraHTML() sobre anaBilleteraDatos
  // global: mejor + billetera + elegibles + selección. El flujo ya no es
  // "un clic cobra" sino "cargar plata + elegir posteo + meter ads".)
  function extractFn(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) return '';
    const end = src.indexOf('\n}\n', start);
    return end < 0 ? '' : src.slice(start, end + 3);
  }
  const sb = { console, anaLang: 'es', anaPastMode: false,
    anaT: (es) => es,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  vm.createContext(sb);
  for (const n of ['anaBoostRecPartes', 'anaBoostRecMotivo', 'anaBilleteraHTML', 'anaBilleteraPickerRow', 'anaBilleteraBusqResHTML']) {
    const c = extractFn(chunk, n);
    t(c.length > 0, 'existe ' + n);
    if (c) vm.runInContext(c.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
  const fixture = { post_id: 9, image_path: 'x.jpg', caption: 'Brunch Aroma para dos', reach: 1200, likes: 84, comments: 12, saved: 5 };
  const fixture2 = { post_id: 8, image_path: 'y.jpg', caption: 'Café de especialidad en la barra', reach: 900, likes: 40, comments: 3, saved: 1 };
  // Los elegibles del servidor traen `post_id` (así los devuelve el módulo).
  const eleg9 = { post_id: 9, image_path: 'x.jpg', caption: 'Brunch Aroma para dos', reach: 1200, likes: 84, comments: 12, saved: 5 };
  const datosBase = () => ({ mejor: fixture, boostHabilitado: true, ads_permiso: true, conversion_pendiente: false,
    billetera: { balance_cents: 5000, currency: 'USD', montos_usd: [20, 50, 100] },
    elegibles: [eleg9, fixture2], selId: 9, selMonto: 20 });
  const render = (datos) => { sb.anaBilleteraDatos = datos; return sb.anaBilleteraHTML ? sb.anaBilleteraHTML() : ''; };
  if (sb.anaBilleteraHTML) {
    const h = render(datosBase());
    t(h.includes('Tu mejor posteo de la semana') && h.includes('$20') && h.includes('$50') && h.includes('$100'), 'bloque: título + 3 montos + posteo');
    t(h.includes('84 me gusta') && h.includes('12 comentarios') && h.includes('5 guardados') && h.includes('alcance 1200'), 'bloque: porqué con datos reales, sin números inventados');
    t(h.includes('Tu billetera de ads: $50') && h.includes('Cargar plata:'), 'bloque: saldo visible + cargar plata');
    t(h.includes('¿A cuál le metemos ads?') && h.includes('el que más rindió'), 'bloque: picker con el recomendado marcado');
    t(h.includes('Meter ads por 7 días · $20') && h.includes('anaBilleteraImpulsar(this)'), 'bloque: botón de impulsar con monto y 7 días');
    t(h.includes('anaBilleteraCargar(20, this)') && h.includes('anaBilleteraElegirPosteo(9, this)') && h.includes('anaBilleteraElegirMonto(50, this)'), 'bloque: cargar + elegir posteo + elegir monto (dos pasos del cliente, nada más)');
    t(!h.includes('anaBoostRecElegir') && !h.includes('anaBoostRecConfirmar'), 'bloque: ya no queda el flujo viejo Elegir→Confirmar ni el cobro por impulso');
    const hPobre = render({ ...datosBase(), billetera: { balance_cents: 5000, currency: 'USD' }, selMonto: 100 });
    t(hPobre.includes('Te faltan $50') && hPobre.includes('disabled'), 'saldo insuficiente: botón deshabilitado + dice cuánto falta (antes del toque)');
    const hConv = render({ ...datosBase(), conversion_pendiente: true });
    t(hConv.includes('$20') && hConv.includes('conversión USD→ARS'), 'sin tasa: botones + nota previa de conversión pendiente (sin sorpresa al tocar)');
    // (LOTE ADS-PANTALLA · 6/11 · SUPERSEDE los 4 asserts de abajo) El
    // mock v1 APROBADO por Valentino cambió el diseño: en estado
    // bloqueado la pantalla YA NO es una caja muerta — billetera,
    // cargar y montos se ven SIEMPRE, y lo que desaparece es solo el
    // botón de GASTAR («Meter ads por 7 días»), reemplazado por el botón
    // del chat («Quiero impulsar este posteo»). Fail-closed sigue vivo:
    // sin permiso/config/flag nunca se ofrece gastar, solo hablar.
    const hSinPerm = render({ ...datosBase(), ads_permiso: false });
    t(hSinPerm.includes('$20') && hSinPerm.includes('Cargar plata') && hSinPerm.includes('ads_management') && hSinPerm.includes('permiso de publicidad') && !hSinPerm.includes('Meter ads por 7 días') && hSinPerm.includes('Quiero impulsar este posteo'), 'sin permiso: billetera + cargar visibles, nota clara (qué falta), sin botón de gastar, con botón del chat');
    const hNull = render({ ...datosBase(), ads_permiso: null });
    t(hNull.includes('$20') && hNull.includes('falta conectar la cuenta publicitaria de Meta') && !hNull.includes('Meter ads por 7 días'), 'permiso no verificable: billetera visible, nota honesta (Meta sin conectar), sin botón de gastar');
    const hOff = render({ ...datosBase(), boostHabilitado: false });
    t(hOff.includes('$20') && hOff.includes('todavía no está habilitado') && !hOff.includes('Meter ads por 7 días'), 'flag off: billetera visible, nota honesta, sin botón de gastar');
    const hViejo = render({ ...datosBase(), ads_permiso: undefined });
    t(hViejo.includes('$20') && hViejo.includes('falta conectar la cuenta publicitaria de Meta') && !hViejo.includes('Meter ads por 7 días'), 'respuesta sin ads_permiso (vieja): billetera visible, nota honesta, sin botón de gastar (fail-closed: no se ofrece gastar)');
    const hSinEleg = render({ ...datosBase(), elegibles: [] });
    t(hSinEleg.includes('Todavía no tenés posteos publicados') && hSinEleg.includes('Cargar plata:'), 'sin elegibles: nota honesta, pero cargar sigue disponible');
    const hArs = render({ ...datosBase(), billetera: { balance_cents: 30000, currency: 'ARS' } });
    t(hArs.includes('en pesos') && hArs.includes('La primera carga en dólares'), 'billetera vieja ARS: se dice claro, nunca se mezcla con USD');
  }
  if (sb.anaBoostRecMotivo) {
    const mP = sb.anaBoostRecMotivo('ads_sin_permiso', 50, null);
    t(mP.includes('ads_management') && mP.includes('No se gastó nada'), 'motivo ads_sin_permiso: dice qué falta + no se gastó nada');
    const mV = sb.anaBoostRecMotivo('ads_verificacion_fallida', 50, null);
    t(mV.includes('No se gastó nada') && mV.includes('unos minutos'), 'motivo ads_verificacion_fallida: reintento, sin gasto');
    const mA = sb.anaBoostRecMotivo('ads_no_configurado', 50, null);
    t(mA.includes('No se gastó nada'), 'motivo ads_no_configurado: sin gasto');
    const mS = sb.anaBoostRecMotivo('sin_autorizacion_publicitaria', 50, null);
    t(mS.includes('No se gastó nada') && mS.includes('Página'), 'motivo sin_autorizacion_publicitaria: dice qué falta');
    const mC = sb.anaBoostRecMotivo('conversion_pendiente', 50, null);
    t(mC.includes('No se cobró nada') && mC.includes('conversión'), 'motivo conversion_pendiente intacto: armado, sin cobro');
    const mSaldo = sb.anaBoostRecMotivo('saldo_insuficiente', 100, null);
    t(mSaldo.includes('Cargá plata') && mSaldo.includes('$100'), 'motivo saldo_insuficiente: dice que cargue, con el monto');
    const mArs = sb.anaBoostRecMotivo('saldo_ars_pendiente', 20, null);
    t(mArs.includes('pesos'), 'motivo saldo_ars_pendiente: explica el saldo viejo en pesos');
    const mSinAcr = sb.anaBoostRecMotivo('cobro_sin_acreditar', 20, 'pi_abc');
    t(mSinAcr.includes('pi_abc') && mSinAcr.includes('revisión urgente'), 'motivo cobro_sin_acreditar: cobroId + revisión urgente, nunca silencio');
    const mDeb = sb.anaBoostRecMotivo('debito_fallido', 50, null);
    t(mDeb.includes('revisión manual') && mDeb.includes('no se te cobró dos veces'), 'motivo debito_fallido: ad creado, revisión manual, sin doble cobro');
    const mYa = sb.anaBoostRecMotivo('ya_impulsado', 20, null);
    t(mYa.includes('ya tiene una pauta activa'), 'motivo ya_impulsado: dice que ya tiene pauta');
    const mSinP = sb.anaBoostRecMotivo('sin_posteo', 20, null);
    t(mSinP.includes('Elegí primero el posteo'), 'motivo sin_posteo: pide elegir posteo');
    const mDemo = sb.anaBoostRecMotivo('demo', 20, null);
    t(mDemo.includes('modo demo') && mDemo.includes('Instagram'), 'motivo demo: dice que conecte su Instagram, sin gasto');
  }

  // ---------- 5. Colocación: DENTRO de la carta, no después (SE MANTIENE) ----------
  // (ADS-BILLETERA: la colocación dentro de la carta se mantiene — el
  // bloque cambia de contenido (billetera + picker), no de lugar.)
  t(cnt(chunk, 'id="anaBoostRec"') === 2, 'placeholder: exactamente 2 (una por rama de la carta)');
  t(!chunk.includes("h += `</div>`;\n    h += `<div id=\"anaBoostRec\"></div>`;"), 'rama carta: ya NO es hermana tras el cierre de la carta');
  t(!chunk.includes("h += `</div>`;\n  h += `<div id=\"anaBoostRec\"></div>`;"), 'rama sin carta: ya NO es hermana tras el cierre de la tarjeta');
  const i1 = chunk.indexOf('id="anaBoostRec"');
  t(i1 > 0 && chunk.indexOf('anaFullBtn', i1) > i1, 'rama carta: el bloque va ANTES de "Ver mi estrategia completa" (tras el cuerpo, muy a la vista)');
  const i2 = chunk.indexOf('id="anaBoostRec"', i1 + 1);
  const seg2 = chunk.slice(i2, i2 + 400);
  t(seg2.includes('ana-refresh') && seg2.includes('anaAprendeHTML'), 'rama sin carta: el bloque va DENTRO de la tarjeta (antes del refresh)');
  t(!chunk.includes('function anaBoostRecElegir('), 'Elegir eliminado del chunk (un clic, no dos)');
  t(!chunk.includes('function anaBoostRecConfirmar(') && !chunk.includes('function anaBoostRecHTML('), 'Confirmar + HTML viejo eliminados (el cobro por impulso ya no existe en la carta)');
  t(chunk.includes('function anaBilleteraHTML(') && chunk.includes('function anaBilleteraImpulsar(') && chunk.includes('function anaBilleteraCargar('), 'billetera: HTML + Impulsar + Cargar presentes');
  t(chunk.includes('function anaBilleteraElegirPosteo(') && chunk.includes('function anaBilleteraElegirMonto('), 'billetera: elegir posteo + elegir monto presentes');
  t(chunk.includes('function anaBoostRecLoad('), 'Load intacto (ahora carga mejor-posteo + billetera + elegibles)');
  t(chunk.includes("api.get('/api/estrategia/mejor-posteo')") && chunk.includes("api.get('/api/ads/billetera')") && chunk.includes("api.get('/api/ads/billetera/elegibles')"), 'endpoints GET: mejor-posteo + billetera + elegibles');
  t(chunk.includes("api.post('/api/ads/billetera/cargar'") && chunk.includes("api.post('/api/ads/billetera/impulsar'"), 'endpoints POST: cargar + impulsar con saldo');
  t(!chunk.includes("api.post('/api/destacado/impulsar'"), 'la carta ya NO cobra por impulso con la tarjeta guardada');
  t(chunk.includes('anaPastMode') && chunk.includes('if (!box || anaPastMode) return'), 'cartas anteriores: sin bloque');
  t(css.includes('.ana-boostrec{') && css.includes('.ana-boostrec-img'), 'estilos del bloque presentes (sin cambios de CSS)');

  // ---------- 6. Servidor: permiso verificado antes de cobrar ----------
  const impStart = srv.indexOf("app.post('/api/destacado/impulsar'");
  const impEnd = srv.indexOf("app.get('/api/destacado/reporte'", impStart);
  const impBlock = srv.slice(impStart, impEnd);
  t(impBlock.includes('checkAdsPermission'), 'impulsar: verifica el permiso ads_management');
  t(impBlock.includes("motivo: 'ads_sin_permiso'"), 'impulsar: sin permiso → 409 ads_sin_permiso');
  t(impBlock.includes("motivo: 'ads_verificacion_fallida'"), 'impulsar: verificación fallida → 503, sin asumir el permiso');
  t(impBlock.includes('permisoAds: true'), 'impulsar: pasa permisoAds verificado al flujo puro');
  t(impBlock.includes('conversionARSFromEnv(process.env)'), 'impulsar: la conversión sale de la config (IMPULSO_TASA_ARS)');
  t(!impBlock.includes('conversionARS: null'), 'impulsar: ya no hay null hardcodeado en la conversión');
  t(impBlock.indexOf('checkAdsPermission') < impBlock.indexOf('procesarImpulso'), 'impulsar: el permiso se verifica ANTES de procesar (antes de cobrar)');
  const mpStart = srv.indexOf("app.get('/api/estrategia/mejor-posteo'");
  const mpEnd = srv.indexOf("app.get('/api/ads/config'", mpStart);
  const mpBlock = srv.slice(mpStart, mpEnd);
  t(mpBlock.includes('ads_permiso') && mpBlock.includes('conversion_pendiente'), 'mejor-posteo: expone ads_permiso + conversion_pendiente');
  t(mpBlock.includes('Promise.race') && mpBlock.includes('3000'), 'mejor-posteo: la verificación no cuelga la carta (carrera 3 s)');
  t(!dest.includes('anaBoostRec') && !dest.includes('estrategia'), 'destacado.js intacto: el detalle conserva su Impulsar, sin código de la carta');
  t(!srv.includes('refunds.create') && !srv.includes('stripe.refunds'), 'sin reembolso automático en el servidor (política sin definir: registro + revisión manual)');

  console.log(`\ntest-lote-impulsar-unclic: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', e && e.stack || e); process.exit(1); });
