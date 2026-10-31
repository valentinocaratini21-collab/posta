// costs.js — Medición y control de gasto de IA (OpenAI).
// Palancas anti-quemado:
//  1) Cada llamada a OpenAI se loguea en api_costs con los tokens REALES
//     (usage.prompt_tokens / usage.completion_tokens / cached_tokens) + modelo + feature.
//  2) Techo mensual POR USUARIO: 10% del precio de su plan (vara 2026-10-04).
//     Esencial: $2.000 ARS/mes ≈ USD 1.40. Ningún usuario puede costar más que eso,
//     pase lo que pase. El cap global diario ($10) se eliminó: un heavy user lo
//     agotaba y bloqueaba a todos; queda DAILY_AI_CAP_USD como freno de emergencia.
//  3) Rate limits por usuario/día/plan (tabla ai_rate): chat, semanas, regens.
//  4) Dedup de fotos: no reenviar al modelo fotos que ya vio hace poco.
// Medir nunca rompe: todos los helpers tragan sus errores.
'use strict';
const crypto = require('crypto');

let DB = null;
let planFor = null; // (userId) => plan — lo inyecta server.js en initCosts
function initCosts(db, opts) {
  DB = db;
  if (opts && typeof opts.planFor === 'function') planFor = opts.planFor;
}

// ---------- Calidad de imagen (gpt-image-2) ----------
// Una sola constante, cambiable sin tocar código: env IMAGE_QUALITY.
// 'medium' = default (2026-10-02, pendiente de validación visual de Valentino).
// 'high' ≈ 4x tokens que medium. Si Valentino ve diferencia real en la comparación
// lado a lado, se vuelve a 'high' y se recorta por otro lado.
// Valores válidos de la API: 'low' | 'medium' | 'high' | 'auto'.
const IMAGE_QUALITY = (() => {
  const v = String(process.env.IMAGE_QUALITY || 'medium').toLowerCase().trim();
  return ['low', 'medium', 'high', 'auto'].includes(v) ? v : 'medium';
})();

// Precios APROXIMADOS (USD). Sirven para MEDIR el quemado por función, no para facturar.
// Basados en el pricing público de OpenAI (oct-2026); actualizar si cambian.
const MODEL_PRICES = {
  'gpt-4o':      { inPer1M: 2.50, outPer1M: 10.00 }, // chat con foto (visión)
  'gpt-4o-mini': { inPer1M: 0.15, outPer1M: 0.60 },  // chat texto, ideas, captions, briefs
  'gpt-image-2': { perImage: IMAGE_QUALITY === 'high' ? 0.25 : 0.063 }, // verificado 07/10/2026: OpenAI factura por tokens ($4/1M in, $15/1M out desde sep-2026); medium 1024x1024≈$0.05268 → $0.063 para 1024x1536 es buena aproximación (solo medición de quemado, no facturación)
  'gpt-image-2@high': { perImage: 0.25 }, // v209: tier high EXPLÍCITO por llamada (ruta IA del demo: calidad máxima de la prueba) aunque el global siga en medium — se loguea con este modelo virtual para medir el quemado real
  'gpt-image-1@high': { perImage: 0.167 }, // v209: fallback de gpt-image-2 en high (1024x1280 high ≈ $0.167 de lista)
  'gemini-3-pro-image': { perImage: 0.134 }, // v205: Nano Banana Pro (Google) — precio de lista por imagen del benchmark 2026-10-18; lo usa SOLO el demo ilustrado con feature 'demo-ai-nano'
  'whisper-1':   { perMin: 0.006 },                  // notas de voz / ADN por audio
  'gpt-4o-mini-tts': { perMin: 0.015 },              // (v384) La Carta con audio: ≈USD 0,02 por carta de prueba (~1,3 min)
};

function estCostUsd(model, inTok, outTok, images, minutes) {
  const p = MODEL_PRICES[model];
  if (!p) return 0;
  let c = 0;
  if (p.inPer1M) c += ((inTok | 0) / 1e6) * p.inPer1M + ((outTok | 0) / 1e6) * p.outPer1M;
  if (p.perImage) c += (images | 0) * p.perImage;
  if (p.perMin) c += (minutes || 0) * p.perMin;
  return Math.round(c * 1e6) / 1e6;
}

function logApiCost({ userId, feature, model, inTokens = 0, outTokens = 0, cachedTokens = 0, images = 0, minutes = 0 }) {
  if (!DB) return;
  try {
    const cost = estCostUsd(model, inTokens, outTokens, images, minutes);
    DB.prepare(`INSERT INTO api_costs (user_id, feature, model, in_tokens, out_tokens, cached_tokens, images, est_cost_usd)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      userId == null ? null : userId, String(feature || ''), String(model || ''),
      inTokens | 0, outTokens | 0, cachedTokens | 0, images | 0, cost);
  } catch (e) { /* medir nunca rompe */ }
}

// Wrapper de conveniencia: extrae usage.* del JSON de chat/completions y loguea.
// También captura cached_tokens (prompt caching): si es 0 de forma sistemática,
// se está perdiendo el ~50% de descuento en input.
function trackUsage({ feature, userId, model, json, images = 0, minutes = 0 }) {
  try {
    const u = (json && json.usage) || {};
    const det = u.prompt_tokens_details || {};
    logApiCost({
      userId, feature, model,
      inTokens: (u.prompt_tokens | 0) || 0,
      outTokens: (u.completion_tokens | 0) || 0,
      cachedTokens: (det.cached_tokens | 0) || 0,
      images, minutes,
    });
  } catch (e) { /* medir nunca rompe */ }
}

// ---------- Kill-switch de gasto diario (freno de emergencia global) ----------
// El cap global de $10/día se reemplazó (2026-10-02) por el techo mensual POR USUARIO
// (vara 5%): un solo heavy user lo agotaba y bloqueaba a todos. Esto queda solo como
// freno de emergencia ante catástrofe (ej. bug que spamea la API).
const DAILY_CAP_USD = Math.max(0, parseFloat(process.env.DAILY_AI_CAP_USD || '100') || 100);

function daySpendUsd() {
  if (!DB) return 0;
  try {
    const r = DB.prepare(`SELECT COALESCE(SUM(est_cost_usd),0) AS s FROM api_costs
      WHERE date(ts) = date('now') AND feature != 'blocked'`).get();
    return (r && r.s) || 0;
  } catch (e) {
    // FAIL-CLOSED (2026-10-02): si no podemos leer el gasto, asumimos el PEOR
    // caso (tope superado) en vez de $0. Antes un "database is locked" = gasto ilimitado.
    console.error('[daySpendUsd] DB error, asumiendo tope superado:', e.message);
    return DAILY_CAP_USD;
  }
}

class AiCapExceeded extends Error {
  constructor(msg) { super(msg); this.name = 'AiCapExceeded'; }
}

const MSG_CAP = 'llegamos al tope de IA de hoy 🔋 seguimos mañana con todo — no se perdió nada, tus borradores están a salvo 💪';

// ---------- Techo mensual de IA por usuario (vara 5%, 2026-10-02) ----------
// El costo variable de IA por usuario/mes no puede superar el 10% del precio de su plan.
// Esencial ($69.900 ARS): $6.990 ARS/mes ≈ USD 4.91. Pro: ≈ USD 9.12. Total: ≈ USD 14.03.
// Es el techo DURO: pase lo que pase, ningún usuario cuesta más que eso en IA por mes.
// (Un cap diario por usuario no sirve: la generación semanal mete ~USD 0.32 en un día
// y quedaría bloqueada. El mensual permite el batch semanal y frena la cola.)
const ARS_PER_USD = Math.max(1, parseFloat(process.env.ARS_PER_USD || '1425') || 1425);
const UYU_PER_USD = Math.max(1, parseFloat(process.env.UYU_PER_USD || '40') || 40);
const AI_CAP_FOUNDER_USD = Math.max(0, parseFloat(process.env.AI_CAP_FOUNDER_USD || '200') || 200);
// El fundador testea sin techo mensual de IA: sus cuentas se reconocen por email.
const FOUNDER_EMAILS = ['valentino_bamboo@hotmail.com', 'valentinocaratini21@gmail.com'];
function isFounderEmail(userId) {
  if (!DB || !userId) return false;
  try {
    const u = DB.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    const em = String((u && u.email) || '').trim().toLowerCase();
    return em && FOUNDER_EMAILS.includes(em);
  } catch (e) { return false; }
}

function monthlyCapUsd(plan) {
  try {
    if (!plan) return 2.80;
    if (plan.id === 'free') return AI_CAP_FOUNDER_USD; // cuenta del fundador (testeo)
    const rate = (plan.currency === 'UYU') ? UYU_PER_USD : ARS_PER_USD;
    const cap = (Number(plan.price) || 0) * 0.10 / rate;
    return Math.max(0.50, Math.round(cap * 100) / 100); // piso de seguridad
  } catch (e) { return 2.80; }
}

function monthSpendUsd(userId) {
  if (!DB) return 0;
  try {
    const r = DB.prepare(`SELECT COALESCE(SUM(est_cost_usd),0) AS s FROM api_costs
      WHERE user_id = ? AND ts >= date('now','start of month') AND feature != 'blocked'`).get(userId);
    return (r && r.s) || 0;
  } catch (e) {
    // FAIL-CLOSED: si no podemos leer el gasto, asumimos tope superado.
    console.error('[monthSpendUsd] DB error, asumiendo tope superado:', e.message);
    return Infinity;
  }
}

const MSG_MONTHLY_CAP = 'llegamos al tope de IA de tu plan por este mes 🔋 se renueva solo el mes que viene — tus borradores están a salvo 💪';

// ---------- Línea de cap SEPARADA para el video firma IA (v329) ----------
// El video IA premium semanal (Seedance vía fal, módulo ai-video.js) tiene su
// PROPIA línea de techo mensual por plan, separada del cap genérico de IA de
// arriba (10% del plan): el video solo ya representa ~9–14% del precio USD
// del plan y si compartiera el cap genérico quedaría estrangulado (brief
// posty-reels-video-ia §3, diseño confirmado por Valentino 2026-10-22).
// Valores = costo terminado esperado del mes (4,33 videos/semana × tarifa ×
// factor 1,3 de reintentos) con aire: Esencial ≈ USD 10,9 → 14 · Pro/Total
// ≈ USD 26,6 → 32. El gasto de video se loguea en api_costs con feature
// 'ai-video' (y por lo tanto también cuenta en monthSpendUsd/assertAiOk
// como gasto real que es); esta línea es el freno específico que ai-video.js
// consulta ANTES de gastar en un clip nuevo. Si el cap corta, la semana sale
// sin firma (fallback), nunca rota.
const AI_VIDEO_CAP_USD = { esencial: 14, pro: 32, total: 32 };
function aiVideoCapUsd(plan) {
  try {
    const id = typeof plan === 'string' ? plan : (plan && plan.id);
    if (id === 'free') return AI_CAP_FOUNDER_USD; // fundador: testeo sin techo
    return AI_VIDEO_CAP_USD[id] || AI_VIDEO_CAP_USD.esencial;
  } catch (e) { return AI_VIDEO_CAP_USD.esencial; }
}
function aiVideoMonthSpendUsd(userId) {
  if (!DB) return 0;
  try {
    const r = DB.prepare(`SELECT COALESCE(SUM(est_cost_usd),0) AS s FROM api_costs
      WHERE user_id = ? AND feature = 'ai-video' AND ts >= date('now','start of month')`).get(userId);
    return (r && r.s) || 0;
  } catch (e) {
    // FAIL-CLOSED como monthSpendUsd: si no se puede leer, tope superado.
    console.error('[aiVideoMonthSpendUsd] DB error, asumiendo tope superado:', e.message);
    return Infinity;
  }
}
// Inserta el costo ESTIMADO de un clip (tarifa × duración pedida; lo calcula
// ai-video.js con su tabla de tarifas de fal). Medir nunca rompe.
function logVideoCost({ userId, model, estUsd }) {
  if (!DB) return;
  try {
    const cost = Math.round((Number(estUsd) || 0) * 1e6) / 1e6;
    DB.prepare(`INSERT INTO api_costs (user_id, feature, model, in_tokens, out_tokens, cached_tokens, images, est_cost_usd)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      userId == null ? null : userId, 'ai-video', String(model || ''), 0, 0, 0, 0, cost);
  } catch (e) { /* medir nunca rompe */ }
}

// Llamar ANTES de gastar IA en endpoints user-facing. Tira AiCapExceeded si se superó el tope.
function assertAiOk(userId) {
  if (daySpendUsd() >= DAILY_CAP_USD) {
    logApiCost({ userId, feature: 'blocked', model: 'cap' });
    try { console.error(`[ai-cap] BLOQUEO GLOBAL usuario=${userId} gasto_hoy=$${daySpendUsd().toFixed(2)} tope=$${DAILY_CAP_USD}`); } catch (e) {}
    throw new AiCapExceeded(MSG_CAP);
  }
  // Techo mensual por usuario (10% del plan): el que garantiza los números.
  // El fundador queda exento para poder testear sin fricción.
  if (isFounderEmail(userId)) return;
  try {
    const plan = planFor ? planFor(userId) : null;
    const cap = monthlyCapUsd(plan);
    const spent = monthSpendUsd(userId);
    if (spent >= cap) {
      logApiCost({ userId, feature: 'blocked', model: 'cap-monthly' });
      try { console.error(`[ai-cap] BLOQUEO MENSUAL usuario=${userId} gasto_mes=$${spent.toFixed(2)} tope=$${cap.toFixed(2)} plan=${plan && plan.id}`); } catch (e) {}
      throw new AiCapExceeded(MSG_MONTHLY_CAP);
    }
  } catch (e) {
    if (e && e.name === 'AiCapExceeded') throw e;
    // Si falla la resolución del plan, no bloqueamos por techo mensual (el freno
    // global de emergencia sigue vigente). Medir nunca rompe.
  }
}

// ---------- Rate limits por usuario/día ----------
function checkRate(userId, feature, limit) {
  if (!DB) return { ok: true, remaining: limit, used: 0 };
  // El fundador testea sin límites de ritmo tampoco.
  try { if (isFounderEmail(userId)) return { ok: true, remaining: 999, used: 0 }; } catch (e) {}
  try {
    const row = DB.prepare(`SELECT n FROM ai_rate WHERE user_id = ? AND feature = ? AND day = date('now')`).get(userId, feature);
    const n = (row && row.n) || 0;
    if (n >= limit) return { ok: false, remaining: 0, used: n };
    DB.prepare(`INSERT INTO ai_rate (user_id, feature, day, n) VALUES (?,?,date('now'),1)
      ON CONFLICT(user_id, feature, day) DO UPDATE SET n = n + 1`).run(userId, feature);
    return { ok: true, remaining: limit - n - 1, used: n + 1 };
  } catch (e) {
    // FAIL-CLOSED (2026-10-02): si no podemos leer el contador, bloqueamos.
    // Antes cualquier falla de DB bypaseaba los límites.
    console.error('[checkRate] DB error, bloqueando:', e.message);
    return { ok: false, remaining: 0, used: limit };
  }
}

const MSG_CHAT_RATE = 'hoy charlamos un montón 😅 llegamos al tope de mensajes del día — seguimos mañana 💪';
const MSG_WEEK_RATE = 'ya armamos varias semanas hoy 📅 seguimos mañana con más ideas 💪';
const MSG_IDEAS_RATE = 'ya generamos un montón de ideas hoy 💡 seguimos mañana 💪';
const MSG_REGEN_RATE = 'ya regeneramos varias imágenes hoy 🎨 seguimos mañana con más 💪';

// ---------- Dedup de fotos (no reenviar lo ya visto) ----------
function photoHash(dataUrl) {
  const s = String(dataUrl || '');
  return crypto.createHash('sha256').update(s.slice(0, 8192) + '|' + s.length).digest('hex');
}
const PHOTO_RESEND_HOURS = 20; // si el modelo la vio hace menos de esto, no se reenvía
function photoRecentlySent(userId, hash) {
  if (!DB) return false;
  try {
    const r = DB.prepare(`SELECT last_sent_at FROM chat_seen_photos WHERE user_id = ? AND photo_hash = ?`).get(userId, hash);
    if (!r || !r.last_sent_at) return false;
    const t = new Date(String(r.last_sent_at).replace(' ', 'T') + 'Z').getTime();
    if (!t) return false;
    return (Date.now() - t) / 3600000 < PHOTO_RESEND_HOURS;
  } catch (e) { return false; }
}
function markPhotoSent(userId, hash) {
  if (!DB) return;
  try {
    DB.prepare(`INSERT INTO chat_seen_photos (user_id, photo_hash, last_sent_at) VALUES (?,?,datetime('now'))
      ON CONFLICT(user_id, photo_hash) DO UPDATE SET last_sent_at = datetime('now')`).run(userId, hash);
  } catch (e) {}
}

// ---------- Lectura: breakdown por función ----------
function costBreakdown(days) {
  if (!DB) return [];
  try {
    return DB.prepare(`SELECT feature, model, COUNT(*) AS calls,
        COALESCE(SUM(in_tokens),0) AS in_tok, COALESCE(SUM(out_tokens),0) AS out_tok,
        COALESCE(SUM(cached_tokens),0) AS cached_tok, COALESCE(SUM(images),0) AS images, COALESCE(SUM(est_cost_usd),0) AS usd
      FROM api_costs
      WHERE ts >= datetime('now', ?) AND feature != 'blocked'
      GROUP BY feature, model ORDER BY usd DESC`).all(`-${Math.max(1, days | 0)} days`);
  } catch (e) { return []; }
}

// ---------- Tope diario ESPECÍFICO de la IA del demo (v198) ----------
// La proyección de /prueba genera piezas con el motor de IA real SOLO para
// perfiles ilustrados/mascota (decisión de Valentino 2026-10-18). Ese gasto
// tiene su propio contador y su propio techo: DEMO_AI_DAILY_CAP_USD
// (default USD 10/día). Todo gasto del demo se loguea en api_costs con
// feature 'demo-ai-*' para medirlo contra conversión desde el panel admin.
// FAIL-CLOSED como daySpendUsd: si la DB no responde, se asume tope superado
// y el demo cae a plantillas (fallback silencioso, nunca error visible).
const DEMO_AI_DAILY_CAP_USD = Math.max(0, parseFloat(process.env.DEMO_AI_DAILY_CAP_USD || '10') || 10);

function demoAiSpendTodayUsd() {
  if (!DB) return DEMO_AI_DAILY_CAP_USD;
  try {
    const r = DB.prepare(`SELECT COALESCE(SUM(est_cost_usd),0) AS s FROM api_costs
      WHERE date(ts) = date('now') AND feature LIKE 'demo-ai%'`).get();
    return (r && r.s) || 0;
  } catch (e) {
    console.error('[demoAiSpendTodayUsd] DB error, asumiendo tope superado:', e.message);
    return DEMO_AI_DAILY_CAP_USD;
  }
}

function demoAiCapOk() {
  return demoAiSpendTodayUsd() < DEMO_AI_DAILY_CAP_USD;
}

module.exports = {
  initCosts, MODEL_PRICES, DAILY_CAP_USD, IMAGE_QUALITY,
  estCostUsd, logApiCost, trackUsage,
  daySpendUsd, AiCapExceeded, assertAiOk, MSG_CAP,
  DEMO_AI_DAILY_CAP_USD, demoAiSpendTodayUsd, demoAiCapOk,
  monthlyCapUsd, monthSpendUsd, MSG_MONTHLY_CAP,
  checkRate, isFounderEmail, MSG_CHAT_RATE, MSG_WEEK_RATE, MSG_IDEAS_RATE, MSG_REGEN_RATE,
  photoHash, photoRecentlySent, markPhotoSent,
  costBreakdown,
  AI_VIDEO_CAP_USD, aiVideoCapUsd, aiVideoMonthSpendUsd, logVideoCost,
};
