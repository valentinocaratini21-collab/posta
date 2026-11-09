// ads-billetera.js — Billetera de ads en USD (LOTE ADS-BILLETERA).
//
// El cliente CARGA PLATA ($20/$50/$100, Stripe off-session con la tarjeta
// guardada) y ELIGE el posteo; Posty hace TODO el resto (público,
// presupuesto desde el saldo, creación del ad en Meta, gestión). Dos pasos
// del cliente, nada más.
//
// Este módulo es puro + inyectado: NO importa Stripe, Meta ni server.js.
// El cobro, la acreditación, la creación del ad y el débito llegan como
// funciones inyectadas, así los tests verifican los gates sin tocar dinero
// real ni la API de Meta.
//
// REGLAS DURAS (no se negocian):
// - La billetera es USD. La billetera vieja es ARS (MercadoPago): NUNCA se
//   mezclan. Si la billetera tiene saldo ARS > 0, la carga USD se rechaza
//   con 'saldo_ars_pendiente' (ese saldo se usa por el flujo viejo o se
//   habla con el equipo); con saldo ARS = 0, la primera carga USD migra la
//   moneda a USD (el endpoint lo hace; acá solo se verifica).
// - El DÉBITO ocurre SOLO cuando el ad se creó bien. Si la creación falla,
//   NO se debita nada (fail-closed). El orden es: gates → crear ad →
//   debitar → registrar. Si el débito falla DESPUÉS de crear el ad (carrera
//   por el saldo), se registra 'debito_fallido' con el campaign id para
//   revisión manual: nunca se traga.
// - Permiso ads_management verificado ANTES de gastar (gate estricto, igual
//   que impulsar-unclic): sin verificar = bloqueado, nunca se asume.
// - Sin tasa USD→ARS (IMPULSO_TASA_ARS sin definir) → 'conversion_pendiente'
//   SIN gasto: la tasa la define Valentino, acá nunca se inventa.
// - Sin reembolso automático: todo fallo con plata de por medio queda
//   registrado para revisión manual.
// - Un solo débito por impulso: el reintento (mismo cliente + posteo +
//   monto + mismo día) devuelve el impulso ya hecho, sin segundo débito ni
//   segundo ad. La comprobación va ANTES del chequeo de saldo: si no, el
//   reintento fallaría con saldo_insuficiente porque el saldo ya bajó.
// - Montos fijos $20/$50/$100 (los existentes), 7 días (la duración
//   existente). Sin fee: el monto pasa tal cual a la pauta (spec aprobado
//   del flujo USD; el fee del 10% es del flujo viejo ARS y no aplica acá).
'use strict';

// - Demo: si la cuenta está en modo demo (settings.demo_mode = 1, sin IG
//   conectado), NADA se cobra, se acredita, se crea ni se debita. El
//   servidor pasa `demo` desde getSettings; el módulo lo respeta primero.
const MONTOS_CARGA_USD = [20, 50, 100];
const DIAS_BILLETERA = 7;

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

// Ref estable del débito de un impulso: mismo cliente + posteo + monto +
// mismo día = mismo impulso (reintento seguro). La fecha viene en
// 'YYYY-MM-DD'; si no se pasa, se usa el día actual (UTC).
function refDebitoBoost({ clienteId, posteoId, montoUSD, fecha }) {
  const f = fecha || new Date().toISOString().slice(0, 10);
  return `boost_usd:u${clienteId}:p${posteoId}:${montoUSD}:${f}`;
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

// Impulsar con saldo: el cliente ya cargó, solo elige posteo + monto.
//   impulsarConSaldo({ clienteId, posteoId, montoUSD, zona, env,
//     adsConfigurado, paginaAutorizada, permisoAds, conversionARS,
//     saldoCentsUSD, fecha, buscarDebito, crearAnuncio, debitar, registrar,
//     demo })
// → { ok: true, anuncioId, posteoId, montoUSD, dias, saldoNuevo [, ya_creado] }
// → { ok: false, motivo [, anuncioId] }.
// Motivos: demo (la cuenta está en modo demo: NADA se crea ni se debita) ·
// boost_deshabilitado · monto_invalido · sin_posteo · sin_zona ·
// ads_no_configurado · sin_autorizacion_publicitaria · ads_sin_permiso ·
// conversion_pendiente · saldo_insuficiente · anuncio_fallido (SIN débito) ·
// debito_fallido (el ad SÍ se creó: revisión manual con anuncioId).
// `conversionARS` es la función de la tasa (o null): sin ella no hay gasto.
// `buscarDebito(ref)` devuelve el impulso ya hecho (o null).
// `crearAnuncio({ posteoId, montoUSD, spendCents, zona, objetivo })`
// devuelve { ok, anuncioId, campaignId, adsetId, adId }.
// `debitar({ clienteId, montoUSD, ref, campaignId })` devuelve
// { ok, saldoNuevo }. `registrar` recibe { tipo: 'exito' |
// 'debito_fallido', ... }.
async function impulsarConSaldo(input) {
  const {
    clienteId, posteoId, montoUSD, zona, env,
    adsConfigurado, paginaAutorizada, permisoAds, conversionARS,
    saldoCentsUSD, fecha, buscarDebito, crearAnuncio, debitar, registrar, demo,
  } = input || {};
  const no = (motivo, extra) => ({ ok: false, motivo, ...(extra || {}) });
  if (demo) return no('demo');
  const { boostHabilitado } = require('./destacado-semana');
  if (!boostHabilitado(env)) return no('boost_deshabilitado');
  if (!validarMontoUSD(montoUSD)) return no('monto_invalido');
  if (!posteoId) return no('sin_posteo');
  if (typeof zona !== 'string' || !zona.trim()) return no('sin_zona');
  if (!adsConfigurado) return no('ads_no_configurado');
  if (!paginaAutorizada) return no('sin_autorizacion_publicitaria');
  // Permiso ads_management: gate estricto. Sin verificar = bloqueado.
  if (permisoAds !== true) return no('ads_sin_permiso');
  if (!clienteId) return no('sin_cliente');
  // Conversión USD→ARS sin definir: fail-closed ANTES de gastar.
  let spendCents = 0;
  if (typeof conversionARS === 'function') {
    try { spendCents = conversionARS(montoUSD); } catch (e) { spendCents = 0; }
  }
  if (!(typeof spendCents === 'number' && Number.isFinite(spendCents) && spendCents > 0)) {
    return no('conversion_pendiente');
  }
  const ref = refDebitoBoost({ clienteId, posteoId, montoUSD, fecha });
  // Reintento: ANTES del chequeo de saldo (el saldo ya bajó con el primer
  // intento; si el saldo se mirara primero, el reintento diría
  // saldo_insuficiente y el cliente pagaría dos veces por el mismo ad).
  if (typeof buscarDebito === 'function') {
    let existente = null;
    try { existente = await buscarDebito(ref); } catch (e) { existente = null; }
    if (existente) {
      return { ok: true, ya_creado: true, anuncioId: existente.anuncioId || existente.meta_campaign_id || null, posteoId, montoUSD, dias: DIAS_BILLETERA, saldoNuevo: null, ref };
    }
  }
  if (!(typeof saldoCentsUSD === 'number' && saldoCentsUSD >= montoUSD * 100)) {
    return no('saldo_insuficiente');
  }
  if (typeof crearAnuncio !== 'function' || typeof debitar !== 'function') {
    return no('sin_proveedores');
  }
  let anuncio = null;
  try {
    anuncio = await crearAnuncio({
      posteoId, montoUSD, spendCents,
      zona: zona.trim(), objetivo: 'visitas_perfil_y_mensajes',
    });
  } catch (e) {
    anuncio = { ok: false, error: String((e && e.message) || e).slice(0, 300) };
  }
  // El ad NO se creó: NO se debita nada.
  if (!anuncio || !anuncio.ok) {
    return no('anuncio_fallido');
  }
  // El ad SÍ se creó: recién ahora se debita el saldo.
  let deb = null;
  try {
    deb = await debitar({ clienteId, montoUSD, ref, campaignId: anuncio.campaignId || anuncio.anuncioId || null });
  } catch (e) { deb = { ok: false, motivo: 'saldo_insuficiente' }; }
  if (!deb || !deb.ok) {
    if (typeof registrar === 'function') {
      try {
        await registrar({
          tipo: 'debito_fallido', posteoId, montoUSD, ref,
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
        tipo: 'exito', posteoId, montoUSD, ref,
        anuncioId: anuncio.anuncioId || null, campaignId: anuncio.campaignId || null,
        adsetId: anuncio.adsetId || null, adId: anuncio.adId || null, spendCents,
      });
    } catch (e) { /* el registro nunca tapa un éxito real */ }
  }
  return {
    ok: true, anuncioId: anuncio.anuncioId || null, posteoId, montoUSD,
    dias: DIAS_BILLETERA, saldoNuevo: (deb.saldoNuevo != null ? deb.saldoNuevo : null), ref,
  };
}

// Elegibles para el picker: posteos publicados con ig_media_id (los únicos
// que Meta puede pautar), sin los que ya tienen una pauta activa o
// pendiente. El recomendado de la semana (el mejor posteo de la semana)
// queda marcado: la recomendación es sugerencia, la elección es del cliente.
// `mejorPostId` = post_id del mejor posteo de la semana (o null: sin dato
// no hay recomendado, nunca uno inventado).
function elegiblesParaAds(rows, mejorPostId, yaImpulsados) {
  const impulsados = yaImpulsados instanceof Set ? yaImpulsados : new Set(yaImpulsados || []);
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.status === 'published' && r.ig_media_id && !String(r.ig_media_id || '').startsWith('demo_') && r.media_type !== 'story' && !impulsados.has(r.id))
    .map((r) => ({
      post_id: r.id,
      image_path: r.image_path || '',
      caption: cortarCaption(String(r.caption || ''), 90),
      ig_media_id: r.ig_media_id,
      reach: Number(r.reach || 0),
      likes: Number(r.likes || 0),
      comments: Number(r.comments || 0),
      saves: Number(r.saves || r.saved || 0),
      recomendado: mejorPostId != null && Number(r.id) === Number(mejorPostId),
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

module.exports = {
  MONTOS_CARGA_USD,
  DIAS_BILLETERA,
  validarMontoUSD,
  cortarCaption,
  refDebitoBoost,
  cargarBilletera,
  impulsarConSaldo,
  elegiblesParaAds,
  feedParaAds,
  getAutoTopup,
  setAutoTopup,
};
