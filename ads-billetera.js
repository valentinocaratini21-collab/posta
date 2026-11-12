// ads-billetera.js — Billetera de ads por moneda (LOTE ADS-BILLETERA +
// LOTE RIEL-SUSCRIPCION v878).
//
// El cliente CARGA PLATA y ELIGE el posteo; Posty hace TODO el resto
// (público, presupuesto desde el saldo, creación del ad en Meta,
// gestión). Dos pasos del cliente, nada más. La moneda sigue al riel
// de la suscripción (v878): Stripe → USD ($20/$50/$100, Stripe
// off-session con la tarjeta guardada); Mercado Pago → ARS (carga por
// preferencia de checkout, presupuestos $5.000/$10.000/$20.000).
//
// Este módulo es puro + inyectado: NO importa Stripe, Meta ni server.js.
// El cobro, la acreditación, la creación del ad y el débito llegan como
// funciones inyectadas, así los tests verifican los gates sin tocar dinero
// real ni la API de Meta.
//
// REGLAS DURAS (no se negocian):
// - La billetera tiene UNA moneda por usuario: USD (riel Stripe) o ARS
//   (riel Mercado Pago). NUNCA se mezclan. Cargar en una moneda con
//   saldo > 0 en la otra se rechaza ('saldo_ars_pendiente' para la carga
//   USD, 'saldo_usd_pendiente' para la carga ARS); con saldo 0, la
//   primera carga migra la moneda (el endpoint lo hace; acá solo se
//   verifica).
// - El DÉBITO ocurre SOLO cuando el ad se creó bien. Si la creación falla,
//   NO se debita nada (fail-closed). El orden es: gates → crear ad →
//   debitar → registrar. Si el débito falla DESPUÉS de crear el ad (carrera
//   por el saldo), se registra 'debito_fallido' con el campaign id para
//   revisión manual: nunca se traga.
// - Permiso ads_management verificado ANTES de gastar (gate estricto, igual
//   que impulsar-unclic): sin verificar = bloqueado, nunca se asume.
// - Sin tasa USD→ARS (IMPULSO_TASA_ARS sin definir) → 'conversion_pendiente'
//   SIN gasto: la tasa la define Valentino, acá nunca se inventa. El
//   impulso ARS NO necesita conversión (el gasto ya es pesos) y por eso
//   no pasa por ese gate.
// - Sin reembolso automático: todo fallo con plata de por medio queda
//   registrado para revisión manual.
// - Un solo débito por impulso: el reintento (mismo cliente + posteo +
//   monto + mismo día) devuelve el impulso ya hecho, sin segundo débito ni
//   segundo ad. La comprobación va ANTES del chequeo de saldo: si no, el
//   reintento fallaría con saldo_insuficiente porque el saldo ya bajó.
// - Montos fijos USD $20/$50/$100 (los existentes) y ARS $5.000/$10.000/
//   $20.000 (los de config/ads.js, no inventados), 7 días (la duración
//   existente). Sin fee en USD (spec aprobado del flujo USD); fee del 10%
//   en ARS (adSplit, el fee del flujo viejo ARS).
'use strict';

// - Demo: si la cuenta está en modo demo (settings.demo_mode = 1, sin IG
//   conectado), NADA se cobra, se acredita, se crea ni se debita. El
//   servidor pasa `demo` desde getSettings; el módulo lo respeta primero.
const MONTOS_CARGA_USD = [20, 50, 100];
const DIAS_BILLETERA = 7;

// (LOTE RIEL-SUSCRIPCION v878) La moneda sigue al riel de la suscripción:
// Stripe → USD ($20/$50/$100, off-session); Mercado Pago → ARS. Los
// montos ARS son los del flujo viejo (config/ads.js, en centavos):
// carga $10.000/$20.000/$50.000, presupuestos $5.000/$10.000/$20.000.
// Acá van en pesos enteros (el cliente y el servidor hablan en pesos;
// a centavos se pasa multiplicando por 100 en el borde).
const MONTOS_CARGA_ARS = [10000, 20000, 50000];
const MONTOS_IMPULSO_ARS = [5000, 10000, 20000];

// (LOTE ADS-DIRECTO v759) Corte de caption por palabra, nunca a mitad:
// si el corte cae justo en un límite de palabra se queda ahí; si no, se
// retrocede al último espacio; sin espacio, corte duro. Siempre con …
// cuando se recorta. Espejo en el cliente: anaCortarCaption.
function cortarCaption(texto, max) {
  const t = String(texto || '');
  const m = Math.max(0, Math.floor(Number(max) || 0));
  if (!m || t.length <= m) return t;
  const recorte = t.slice(0, m);
  if (t[m] === ' ') return recorte + '…';
  const ultimoEspacio = recorte.lastIndexOf(' ');
  if (ultimoEspacio > 0) return recorte.slice(0, ultimoEspacio) + '…';
  return recorte + '…';
}

function validarMontoUSD(monto) {
  return typeof monto === 'number' && Number.isInteger(monto) && MONTOS_CARGA_USD.includes(monto);
}

// (LOTE RIEL-SUSCRIPCION v878) Montos ARS en pesos enteros.
function validarMontoARS(monto) {
  return typeof monto === 'number' && Number.isInteger(monto) && MONTOS_CARGA_ARS.includes(monto);
}
function validarPresupuestoARS(monto) {
  return typeof monto === 'number' && Number.isInteger(monto) && MONTOS_IMPULSO_ARS.includes(monto);
}

// Ref estable del débito de un impulso: mismo cliente + posteo + monto +
// mismo día = mismo impulso (reintento seguro). La fecha viene en
// 'YYYY-MM-DD'; si no se pasa, se usa el día actual (UTC).
function refDebitoBoost({ clienteId, posteoId, montoUSD, fecha }) {
  const f = fecha || new Date().toISOString().slice(0, 10);
  return `boost_usd:u${clienteId}:p${posteoId}:${montoUSD}:${f}`;
}

// (LOTE RIEL-SUSCRIPCION v878) Ref del débito ARS: espacio de nombres
// propio (boost_ars:), distinto de boost_usd: — un impulso ARS nunca
// colisiona con uno USD del mismo día, y el reintento del mismo impulso
// ARS lo encuentra.
function refDebitoBoostARS({ clienteId, posteoId, montoARS, fecha }) {
  const f = fecha || new Date().toISOString().slice(0, 10);
  return `boost_ars:u${clienteId}:p${posteoId}:${montoARS}:${f}`;
}

// Cargar plata a la billetera.
//   cargarBilletera({ clienteId, montoUSD, monedaActual, saldoActual, ref,
//     buscarCarga, cobrar, acreditar, demo })
// → { ok: true, cobroId, montoUSD, saldoNuevo [, ya_cargado] }
// → { ok: false, motivo [, cobroId] }.
// Motivos: demo (la cuenta está en modo demo: NADA se cobra ni se
// acredita) · monto_invalido · saldo_ars_pendiente · cobro_sin_acreditar
// (plata cobrada pero sin acreditar: revisión manual URGENTE, nunca
// silencio) · o el motivo que devuelva `cobrar` (sin_tarjeta_guardada,
// cobro_fallido, cobro_requiere_accion, stripe_no_configurado,
// sin_cliente_stripe).
// `buscarCarga(ref)` devuelve la carga ya hecha (o null): el reintento con
// el mismo ref no cobra dos veces. `acreditar({ montoUSD, cobroId })`
// devuelve { ok, saldoNuevo }.
async function cargarBilletera(input) {
  const { clienteId, montoUSD, monedaActual, saldoActual, ref, buscarCarga, cobrar, acreditar, demo } = input || {};
  const no = (motivo, extra) => ({ ok: false, motivo, ...(extra || {}) });
  if (demo) return no('demo');
  if (!validarMontoUSD(montoUSD)) return no('monto_invalido');
  if (!clienteId) return no('sin_cliente');
  if (monedaActual === 'ARS' && Number(saldoActual || 0) > 0) return no('saldo_ars_pendiente');
  if (typeof buscarCarga === 'function') {
    let existente = null;
    try { existente = await buscarCarga(ref); } catch (e) { existente = null; }
    if (existente) {
      return { ok: true, ya_cargado: true, cobroId: existente.cobroId || existente.ref || null, montoUSD, saldoNuevo: null };
    }
  }
  if (typeof cobrar !== 'function') return no('sin_proveedores');
  let cobro = null;
  try { cobro = await cobrar({ clienteId, montoUSD, ref }); } catch (e) { cobro = { ok: false, motivo: 'cobro_fallido' }; }
  if (!cobro || !cobro.ok) return no((cobro && cobro.motivo) || 'cobro_fallido');
  if (typeof acreditar !== 'function') return no('cobro_sin_acreditar', { cobroId: cobro.cobroId || null });
  let acr = null;
  try { acr = await acreditar({ clienteId, montoUSD, cobroId: cobro.cobroId || null, ref }); } catch (e) { acr = { ok: false, motivo: 'acreditar_fallido' }; }
  if (!acr || !acr.ok) return no('cobro_sin_acreditar', { cobroId: cobro.cobroId || null });
  return { ok: true, cobroId: cobro.cobroId || null, montoUSD, saldoNuevo: (acr.saldoNuevo != null ? acr.saldoNuevo : null) };
}

// Cargar plata en ARS (riel Mercado Pago, LOTE RIEL-SUSCRIPCION v878).
// NO cobra off-session: el preapproval de MP no permite un cargo extra
// de una vez (la API de Suscripciones solo crea/lee/actualiza el
// preapproval y sus cuotas; no hay endpoint de cobro único — ver
// STATUS.md §«La incógnita de MP»). La carga se hace por preferencia de
// checkout: `crearPreferencia` crea la preferencia y devuelve
// { ok, init_point }; el cliente la aprueba en el checkout de MP y el
// webhook acredita la billetera en ARS.
//   cargarBilleteraARS({ clienteId, montoARS, monedaActual, saldoActual,
//     ref, buscarCarga, crearPreferencia, demo })
// → { ok: true, init_point, montoARS, ref [, ya_creado] }
// → { ok: false, motivo }.
// Motivos: demo (la cuenta está en modo demo: NADA se crea) ·
// monto_invalido · saldo_usd_pendiente (la billetera tiene saldo USD > 0:
// nunca se mezcla; con saldo USD = 0 la primera carga ARS migra la
// moneda a ARS, espejo de la migración inversa) · preferencia_fallida ·
// o el motivo que devuelva `crearPreferencia`.
// `buscarCarga(ref)` devuelve la preferencia ya creada (o null): el
// reintento con el mismo ref no crea una segunda preferencia.
async function cargarBilleteraARS(input) {
  const { clienteId, montoARS, monedaActual, saldoActual, ref, buscarCarga, crearPreferencia, demo } = input || {};
  const no = (motivo, extra) => ({ ok: false, motivo, ...(extra || {}) });
  if (demo) return no('demo');
  if (!validarMontoARS(montoARS)) return no('monto_invalido');
  if (!clienteId) return no('sin_cliente');
  if (monedaActual === 'USD' && Number(saldoActual || 0) > 0) return no('saldo_usd_pendiente');
  if (typeof buscarCarga === 'function') {
    let existente = null;
    try { existente = await buscarCarga(ref); } catch (e) { existente = null; }
    if (existente) {
      return { ok: true, ya_creado: true, init_point: existente.init_point || existente.initPoint || null, montoARS, ref };
    }
  }
  if (typeof crearPreferencia !== 'function') return no('sin_proveedores');
  let pref = null;
  try { pref = await crearPreferencia({ clienteId, montoARS, ref }); } catch (e) { pref = { ok: false, motivo: 'preferencia_fallida' }; }
  if (!pref || !pref.ok) return no((pref && pref.motivo) || 'preferencia_fallida');
  if (!pref.init_point) return no('preferencia_fallida');
  return { ok: true, init_point: pref.init_point, montoARS, ref };
}

// Impulsar con saldo: el cliente ya cargó, solo elige posteo + monto.
//   impulsarConSaldo({ clienteId, posteoId, montoUSD | montoARS, moneda,
//     zona, env, adsConfigurado, paginaAutorizada, permisoAds,
//     conversionARS, saldoCentsUSD | saldoCentsARS, splitARS,
//     fecha, buscarDebito, crearAnuncio, debitar, registrar, demo })
// → { ok: true, anuncioId, posteoId, montoUSD | montoARS, dias,
//     saldoNuevo [, ya_creado] }
// → { ok: false, motivo [, anuncioId] }.
// `moneda`: 'USD' (riel Stripe, el de siempre) o 'ARS' (riel Mercado
// Pago, v878). Sin `moneda` se asume USD: los llamados viejos no cambian.
// En ARS: el monto es `montoARS` en pesos enteros ($5.000/$10.000/
// $20.000), el gasto es `splitARS(montoARS * 100).spend_cents` (fee 10%,
// sin conversión — el gasto ya es pesos) y el saldo se mira en
// `saldoCentsARS`. En USD: como antes (`montoUSD`, `conversionARS`,
// `saldoCentsUSD`, sin fee).
// Motivos: demo (la cuenta está en modo demo: NADA se crea ni se debita) ·
// boost_deshabilitado · monto_invalido · sin_posteo · sin_zona ·
// ads_no_configurado · sin_autorizacion_publicitaria · ads_sin_permiso ·
// conversion_pendiente (solo USD: sin tasa no hay gasto) ·
// saldo_insuficiente · anuncio_fallido (SIN débito) ·
// debito_fallido (el ad SÍ se creó: revisión manual con anuncioId) ·
// sin_proveedores (falta el split ARS o el creador del anuncio).
// `conversionARS` es la función de la tasa (o null): sin ella no hay gasto.
// `buscarDebito(ref)` devuelve el impulso ya hecho (o null).
// `crearAnuncio({ posteoId, montoUSD | montoARS, spendCents, zona, objetivo })`
// devuelve { ok, anuncioId, campaignId, adsetId, adId }.
// `debitar({ clienteId, montoUSD | montoARS, ref, campaignId })` devuelve
// { ok, saldoNuevo }. `registrar` recibe { tipo: 'exito' |
// 'debito_fallido', ..., feeCents }.
// (LOTE v888 · decisión Valentino 10/11 14:17) `cobrarDirecto` (solo USD):
// cuando la billetera es ARS con saldo > 0, el saldo en pesos NO bloquea
// el cobro en dólares — queda como crédito en pesos y el impulso se cobra
// DIRECTO con la tarjeta guardada de Stripe, sin tocar la billetera. Con
// `cobrarDirecto` NO se mira el saldo ni se debita: el anuncio se crea
// primero y recién ahí se cobra; si el anuncio no se crea, NO se cobra
// nada; si el cobro falla tras crear el anuncio, `debito_fallido` (el ad
// existe: revisión manual). `cobrarDirecto({ clienteId, montoUSD, ref,
// campaignId })` devuelve { ok, cobroId }.
async function impulsarConSaldo(input) {
  const {
    clienteId, posteoId, montoUSD, montoARS, moneda, zona, env,
    adsConfigurado, paginaAutorizada, permisoAds, conversionARS,
    saldoCentsUSD, saldoCentsARS, splitARS,
    fecha, buscarDebito, crearAnuncio, debitar, cobrarDirecto, registrar, demo,
  } = input || {};
  // (LOTE RIEL-SUSCRIPCION v878) La moneda del impulso es la de la
  // billetera: 'USD' (riel Stripe, como antes) o 'ARS' (riel Mercado
  // Pago). Sin `moneda` se asume USD: los llamados viejos no cambian.
  const esARS = moneda === 'ARS';
  const monto = esARS ? montoARS : montoUSD;
  const no = (motivo, extra) => ({ ok: false, motivo, ...(extra || {}) });
  if (demo) return no('demo');
  const { boostHabilitado } = require('./destacado-semana');
  if (!boostHabilitado(env)) return no('boost_deshabilitado');
  if (esARS ? !validarPresupuestoARS(montoARS) : !validarMontoUSD(montoUSD)) return no('monto_invalido');
  if (!posteoId) return no('sin_posteo');
  if (typeof zona !== 'string' || !zona.trim()) return no('sin_zona');
  if (!adsConfigurado) return no('ads_no_configurado');
  if (!paginaAutorizada) return no('sin_autorizacion_publicitaria');
  // Permiso ads_management: gate estricto. Sin verificar = bloqueado.
  if (permisoAds !== true) return no('ads_sin_permiso');
  if (!clienteId) return no('sin_cliente');
  // Gasto en Meta (centavos de la moneda de la pauta):
  // - USD: la tasa USD→ARS la define Valentino; sin ella, fail-closed
  //   ANTES de gastar ('conversion_pendiente').
  // - ARS: el gasto ya es pesos — NO hay conversión que definir. El fee
  //   de gestión del 10% es del flujo ARS (adSplit, inyectado como
  //   `splitARS`); el flujo USD no lleva fee (spec aprobado del flujo USD).
  let spendCents = 0;
  let feeCents = 0;
  if (esARS) {
    if (typeof splitARS !== 'function') return no('sin_proveedores');
    let sp = null;
    try { sp = splitARS(montoARS * 100); } catch (e) { sp = null; }
    spendCents = Number(sp && sp.spend_cents);
    feeCents = Number(sp && sp.fee_cents) || 0;
    if (!(Number.isFinite(spendCents) && spendCents > 0)) return no('sin_proveedores');
  } else {
    if (typeof conversionARS === 'function') {
      try { spendCents = conversionARS(montoUSD); } catch (e) { spendCents = 0; }
    }
    if (!(typeof spendCents === 'number' && Number.isFinite(spendCents) && spendCents > 0)) {
      return no('conversion_pendiente');
    }
  }
  const ref = esARS
    ? refDebitoBoostARS({ clienteId, posteoId, montoARS, fecha })
    : refDebitoBoost({ clienteId, posteoId, montoUSD, fecha });
  // Reintento: ANTES del chequeo de saldo (el saldo ya bajó con el primer
  // intento; si el saldo se mirara primero, el reintento diría
  // saldo_insuficiente y el cliente pagaría dos veces por el mismo ad).
  if (typeof buscarDebito === 'function') {
    let existente = null;
    try { existente = await buscarDebito(ref); } catch (e) { existente = null; }
    if (existente) {
      return { ok: true, ya_creado: true, anuncioId: existente.anuncioId || existente.meta_campaign_id || null, posteoId, ...(esARS ? { montoARS } : { montoUSD }), dias: DIAS_BILLETERA, saldoNuevo: null, ref };
    }
  }
  const saldoCents = esARS ? saldoCentsARS : saldoCentsUSD;
  // (v888) Con cobro directo no hay saldo que mirar: la billetera no se
  // toca (el saldo viejo en pesos queda como crédito en pesos).
  const cobroDirecto = !esARS && typeof cobrarDirecto === 'function';
  if (!cobroDirecto && !(typeof saldoCents === 'number' && saldoCents >= monto * 100)) {
    return no('saldo_insuficiente');
  }
  if (typeof crearAnuncio !== 'function' || (typeof debitar !== 'function' && !cobroDirecto)) {
    return no('sin_proveedores');
  }
  let anuncio = null;
  try {
    anuncio = await crearAnuncio({
      posteoId, ...(esARS ? { montoARS } : { montoUSD }), spendCents,
      zona: zona.trim(), objetivo: 'visitas_perfil_y_mensajes',
    });
  } catch (e) {
    anuncio = { ok: false, error: String((e && e.message) || e).slice(0, 300) };
  }
  // El ad NO se creó: NO se debita nada.
  if (!anuncio || !anuncio.ok) {
    return no('anuncio_fallido');
  }
  // El ad SÍ se creó: recién ahora se cobra — del saldo, o directo con
  // la tarjeta guardada (v888: la billetera no se toca).
  let deb = null;
  try {
    deb = cobroDirecto
      ? await cobrarDirecto({ clienteId, montoUSD, ref, campaignId: anuncio.campaignId || anuncio.anuncioId || null })
      : await debitar({ clienteId, ...(esARS ? { montoARS } : { montoUSD }), ref, campaignId: anuncio.campaignId || anuncio.anuncioId || null });
  } catch (e) { deb = { ok: false, motivo: 'saldo_insuficiente' }; }
  if (!deb || !deb.ok) {
    if (typeof registrar === 'function') {
      try {
        await registrar({
          tipo: 'debito_fallido', posteoId, ...(esARS ? { montoARS, feeCents } : { montoUSD }), ref,
          anuncioId: anuncio.anuncioId || null, campaignId: anuncio.campaignId || null,
          adsetId: anuncio.adsetId || null, adId: anuncio.adId || null, spendCents,
        });
      } catch (e) { /* el registro nunca tapa el motivo real */ }
    }
    return { ok: false, motivo: 'debito_fallido', anuncioId: anuncio.anuncioId || null };
  }
  if (typeof registrar === 'function') {
    try {
      await registrar({
        tipo: 'exito', posteoId, ...(esARS ? { montoARS, feeCents } : { montoUSD }), ref,
        anuncioId: anuncio.anuncioId || null, campaignId: anuncio.campaignId || null,
        adsetId: anuncio.adsetId || null, adId: anuncio.adId || null, spendCents,
      });
    } catch (e) { /* el registro nunca tapa un éxito real */ }
  }
  return {
    ok: true, anuncioId: anuncio.anuncioId || null, posteoId, ...(esARS ? { montoARS } : { montoUSD }),
    dias: DIAS_BILLETERA, saldoNuevo: (deb.saldoNuevo != null ? deb.saldoNuevo : null), ref,
  };
}

// ── Crédito por anuncio no creado (LOTE v888 · decisión Valentino 10/11
// 14:17) ──
// Si el anuncio NO se crea DESPUÉS de cobrar (el flujo directo cobra
// primero y crea después), el monto NO se devuelve a la tarjeta: queda
// como crédito en la billetera del cliente para usar después. Idempotente:
// el ref es 'credito_' + cobroId y `yaAcreditado(ref)` dice si ese cobro
// ya se acreditó (un segundo llamado no acredita dos veces). Moneda del
// crédito: USD (el cobro fue en dólares). Si la billetera es ARS con
// saldo 0, se migra a USD antes de acreditar (misma regla que
// cargarBilletera); si es ARS con saldo > 0, se acredita igual y se marca
// moneda_mezclada (el dinero nunca se pierde; el llamador loguea el
// aviso). `leerBilletera()` devuelve { currency, balance_cents };
// `mover(cents, kind, ref, note)` devuelve { ok, saldoNuevo };
// `fijarMoneda(moneda)` cambia la moneda de la billetera.
// Devuelve { ok, ya_acreditado, saldoNuevo, moneda_mezclada }.
async function acreditarCreditoAnuncioFallido(input) {
  const { clienteId, montoUSD, cobroId, leerBilletera, mover, yaAcreditado, fijarMoneda } = input || {};
  const no = (motivo, extra) => ({ ok: false, motivo, ...(extra || {}) });
  if (!clienteId) return no('sin_cliente');
  if (!validarMontoUSD(montoUSD)) return no('monto_invalido');
  if (!cobroId) return no('sin_cobro');
  if (typeof leerBilletera !== 'function' || typeof mover !== 'function') return no('sin_proveedores');
  const ref = 'credito_' + String(cobroId);
  if (typeof yaAcreditado === 'function') {
    let ya = false;
    try { ya = await yaAcreditado(ref); } catch (e) { ya = false; }
    if (ya) return { ok: true, ya_acreditado: true, saldoNuevo: null, moneda_mezclada: false };
  }
  let w = null;
  try { w = await leerBilletera(); } catch (e) { w = null; }
  let monedaMezclada = false;
  if (w && w.currency === 'ARS') {
    if (w.balance_cents === 0) {
      if (typeof fijarMoneda === 'function') {
        try { await fijarMoneda('USD'); } catch (e) { /* seguir: mover acredita igual */ }
      }
    } else {
      monedaMezclada = true;
    }
  }
  let r = null;
  try { r = await mover(montoUSD * 100, 'credito_anuncio_fallido', ref, 'Crédito por anuncio no creado (sin reembolso)'); } catch (e) { r = { ok: false }; }
  if (!r || !r.ok) return no('acreditar_fallido', { moneda_mezclada: monedaMezclada });
  return { ok: true, ya_acreditado: false, saldoNuevo: (r.saldoNuevo != null ? r.saldoNuevo : null), moneda_mezclada: monedaMezclada };
}

// Elegibles para el picker: posteos publicados con ig_media_id (los únicos
// que Meta puede pautar), sin los que ya tienen una pauta activa o
// pendiente. El recomendado de la semana (el mejor posteo de la semana)
// queda marcado: la recomendación es sugerencia, la elección es del cliente.
// `mejorPostId` = post_id del mejor posteo de la semana (o null: sin dato
// no hay recomendado, nunca uno inventado).
// (LOTE REDISEÑO SIMPLE RS-4 · 9/11) La hoja «¿Cuál querés impulsar?»
// necesita VER los ya impulsados (deshabilitados, no ausentes) + el día de
// publicación para el título. `opts.incluirImpulsados` (solo cuando el
// cliente lo pide con ?incluir_impulsados=1): no filtra los ya impulsados
// y les pone `ya_impulsado: true`. Sin opts, el comportamiento es
// EXACTAMENTE el de antes (el picker del tab Ads no ve los ya impulsados).
// `opts.semanaActual` (week_key del lunes actual): marca `viejo` en los de
// otra semana, para el texto de la recomendación. `publicado_en` viaja
// siempre (aditivo, el picker viejo lo ignora).
function elegiblesParaAds(rows, mejorPostId, yaImpulsados, opts) {
  const impulsados = yaImpulsados instanceof Set ? yaImpulsados : new Set(yaImpulsados || []);
  const incluir = !!(opts && opts.incluirImpulsados);
  const semanaActual = (opts && opts.semanaActual) ? String(opts.semanaActual) : '';
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.status === 'published' && r.ig_media_id && !String(r.ig_media_id || '').startsWith('demo_') && r.media_type !== 'story' && (incluir || !impulsados.has(r.id)))
    .map((r) => ({
      post_id: r.id,
      image_path: r.image_path || '',
      caption: cortarCaption(String(r.caption || ''), 90),
      ig_media_id: r.ig_media_id,
      // (v846) Reciente de IG sin fila local: post_id null + solo_ig.
      // El cliente lo impulsa por ig_media_id y el servidor lo adopta.
      solo_ig: !!r.solo_ig,
      reach: Number(r.reach || 0),
      likes: Number(r.likes || 0),
      comments: Number(r.comments || 0),
      saves: Number(r.saves || r.saved || 0),
      recomendado: mejorPostId != null && Number(r.id) === Number(mejorPostId),
      publicado_en: r.published_at || '',
      viejo: !!(semanaActual && r.week_key && String(r.week_key) !== semanaActual),
      ...(incluir ? { ya_impulsado: impulsados.has(r.id) } : {}),
    }))
    // El recomendado va primero (Impulsar lo sugiere; el picker lo
    // pre-selecciona); el resto conserva el orden de entrada.
    .sort((a, b) => (b.recomendado ? 1 : 0) - (a.recomendado ? 1 : 0));
}

// (LOTE ADS-DIRECTO v759) El feed entero para la grilla: TODOS los
// posteos publicados con ig_media_id (REGLA DURA 6/11: todos, no solo
// los recientes), ordenados por publicado desc, con el flag ya_impulsado
// (pauta activa o pendiente). `rows` = filas de posts, `yaImpulsados` =
// Set de post_id con pauta activa/pendiente. Puro: la consulta vive en
// el endpoint.
// (LOTE ADS-FEED-STORIES · 7/11) Sin stories: la grilla es del FEED —
// una story publicada con ig_media_id NO es un posteo para impulsar
// (media_type 'story' fuera, acá y en el SQL; filas sin media_type
// —legado— siguen entrando, nunca se las supone story).
function feedParaAds(rows, yaImpulsados) {
  const impulsados = yaImpulsados instanceof Set ? yaImpulsados : new Set(yaImpulsados || []);
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.status === 'published' && r.ig_media_id && !String(r.ig_media_id || '').startsWith('demo_') && r.media_type !== 'story')
    .map((r) => ({
      post_id: r.id,
      image_path: r.image_path || '',
      caption: cortarCaption(String(r.caption || ''), 90),
      publicado_en: r.published_at || '',
      ya_impulsado: impulsados.has(r.id),
    }))
    .sort((a, b) => String(b.publicado_en || '').localeCompare(String(a.publicado_en || '')));
}

// (LOTE ADS-DIRECTO v759) Carga automática: flag persistida en
// ad_wallets (db inyectada). Por defecto 0: solo se prende con permiso
// explícito del cliente + tarjeta guardada verificada (lo verifica el
// endpoint; acá solo se persiste). Nunca cobra nada por sí misma.
function getAutoTopup(db, userId) {
  try {
    const row = db.prepare('SELECT auto_topup FROM ad_wallets WHERE user_id = ?').get(userId);
    return row && row.auto_topup ? 1 : 0;
  } catch (e) { return 0; }
}
function setAutoTopup(db, userId, on) {
  const v = on === true || on === 1 ? 1 : 0;
  try {
    db.prepare('INSERT OR IGNORE INTO ad_wallets (user_id, auto_topup) VALUES (?, ?)').run(userId, v);
    db.prepare("UPDATE ad_wallets SET auto_topup = ?, updated_at = datetime('now') WHERE user_id = ?").run(v, userId);
  } catch (e) { return 0; }
  return v;
}

// (LOTE BILLETERA-APPLE-PAY) Ref de la carga con Apple Pay: espacio
// propio (carga_applepay_), distinto del de la carga con tarjeta guardada
// (carga_) y del de MP (adtopup_). El `unico` es el sello de tiempo en
// base36: un ref por intent, así cada intento de Apple Pay acredita una
// sola vez aunque se reintente /confirmar.
function refCargaApplePay({ clienteId, unico }) {
  return `carga_applepay_u${clienteId}_${String(unico || Date.now().toString(36))}`;
}
// Confirmar una carga pagada con Apple Pay: el pago YA se hizo en el
// cliente (Express Checkout Element + confirmPayment); acá solo se
// VERIFICA en Stripe y se acredita, idempotente por ref. Espejo de
// cargarBilletera pero SIN cobrar: el cobro es el PaymentIntent que trae
// verificarPago(). El webhook NO acredita estas cargas (processEvent no
// maneja payment_intent.*): el único camino de acreditación es este.
//   confirmarCargaApplePay({ clienteId, demo, monedaActual, saldoActual,
//     buscarCarga, verificarPago, acreditar, guardarTarjeta })
// → { ok: true, montoUSD, saldoNuevo, cobroId [, ya_cargado] }
// → { ok: false, motivo [, cobroId] }.
// `verificarPago()` → { ok, montoUSD, ref, cobroId, paymentMethodId } o
// { ok: false, motivo }. `guardarTarjeta(pmId)` es best-effort: deja la
// tarjeta del Apple Pay como default del cliente para la próxima carga de
// un toque; si falla, la carga igual se acredita.
async function confirmarCargaApplePay(input) {
  const { clienteId, demo, monedaActual, saldoActual, buscarCarga, verificarPago, acreditar, guardarTarjeta } = input || {};
  const no = (motivo, extra) => ({ ok: false, motivo, ...(extra || {}) });
  if (demo) return no('demo');
  if (!clienteId) return no('sin_cliente');
  if (monedaActual === 'ARS' && Number(saldoActual || 0) > 0) return no('saldo_ars_pendiente');
  if (typeof verificarPago !== 'function') return no('sin_proveedores');
  let pago = null;
  try { pago = await verificarPago(); } catch (e) { pago = { ok: false, motivo: 'pago_no_verificado' }; }
  if (!pago || !pago.ok) return no((pago && pago.motivo) || 'pago_no_verificado');
  if (!validarMontoUSD(pago.montoUSD)) return no('monto_invalido', { cobroId: pago.cobroId || null });
  if (!pago.ref) return no('pago_sin_ref', { cobroId: pago.cobroId || null });
  if (typeof buscarCarga === 'function') {
    let existente = null;
    try { existente = await buscarCarga(pago.ref); } catch (e) { existente = null; }
    if (existente) return { ok: true, ya_cargado: true, cobroId: pago.cobroId || null, montoUSD: pago.montoUSD, saldoNuevo: null };
  }
  if (typeof acreditar !== 'function') return no('cobro_sin_acreditar', { cobroId: pago.cobroId || null });
  let acr = null;
  try { acr = await acreditar({ montoUSD: pago.montoUSD, cobroId: pago.cobroId || null, ref: pago.ref }); } catch (e) { acr = { ok: false, motivo: 'acreditar_fallido' }; }
  if (!acr || !acr.ok) return no('cobro_sin_acreditar', { cobroId: pago.cobroId || null });
  if (pago.paymentMethodId && typeof guardarTarjeta === 'function') {
    try { await guardarTarjeta(pago.paymentMethodId); } catch (e) { /* best-effort: la carga ya está acreditada */ }
  }
  return { ok: true, cobroId: pago.cobroId || null, montoUSD: pago.montoUSD, saldoNuevo: (acr.saldoNuevo != null ? acr.saldoNuevo : null) };
}

module.exports = {
  MONTOS_CARGA_USD,
  MONTOS_CARGA_ARS,
  MONTOS_IMPULSO_ARS,
  DIAS_BILLETERA,
  validarMontoUSD,
  validarMontoARS,
  validarPresupuestoARS,
  cortarCaption,
  refDebitoBoost,
  refDebitoBoostARS,
  refCargaApplePay,
  confirmarCargaApplePay,
  cargarBilletera,
  cargarBilleteraARS,
  impulsarConSaldo,
  acreditarCreditoAnuncioFallido,
  elegiblesParaAds,
  feedParaAds,
  getAutoTopup,
  setAutoTopup,
};
