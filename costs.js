// costs.js — Medición y control de gasto de IA (OpenAI).
// Palancas anti-quemado:
//  1) Cada llamada a OpenAI se loguea en api_costs con los tokens REALES
//     (usage.prompt_tokens / usage.completion_tokens) + modelo + feature.
//  2) Kill-switch diario: si el gasto estimado del día supera DAILY_AI_CAP_USD
//     (default 10), se bloquean nuevas llamadas con mensaje amable de Posty.
//  3) Rate limits por usuario/día (tabla ai_rate).
//  4) Dedup de fotos: no reenviar al modelo fotos que ya vio hace poco.
// Medir nunca rompe: todos los helpers tragan sus errores.
'use strict';
const crypto = require('crypto');

let DB = null;
function initCosts(db) { DB = db; }

// Precios APROXIMADOS (USD). Sirven para MEDIR el quemado por función, no para facturar.
// Basados en el pricing público de OpenAI (sep-2026); actualizar si cambian.
const MODEL_PRICES = {
  'gpt-4o':      { inPer1M: 2.50, outPer1M: 10.00 }, // chat con Posty (el quemado de hoy)
  'gpt-4o-mini': { inPer1M: 0.15, outPer1M: 0.60 },  // ideas, captions, briefs
  'gpt-image-1': { perImage: 0.08 },                 // estimado p/ 1024x1536 calidad default
  'whisper-1':   { perMin: 0.006 },                  // notas de voz / ADN por audio
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

function logApiCost({ userId, feature, model, inTokens = 0, outTokens = 0, images = 0, minutes = 0 }) {
  if (!DB) return;
  try {
    const cost = estCostUsd(model, inTokens, outTokens, images, minutes);
    DB.prepare(`INSERT INTO api_costs (user_id, feature, model, in_tokens, out_tokens, images, est_cost_usd)
      VALUES (?,?,?,?,?,?,?)`).run(
      userId == null ? null : userId, String(feature || ''), String(model || ''),
      inTokens | 0, outTokens | 0, images | 0, cost);
  } catch (e) { /* medir nunca rompe */ }
}

// Wrapper de conveniencia: extrae usage.* del JSON de chat/completions y loguea.
function trackUsage({ feature, userId, model, json, images = 0, minutes = 0 }) {
  try {
    const u = (json && json.usage) || {};
    logApiCost({
      userId, feature, model,
      inTokens: (u.prompt_tokens | 0) || 0,
      outTokens: (u.completion_tokens | 0) || 0,
      images, minutes,
    });
  } catch (e) { /* medir nunca rompe */ }
}

// ---------- Kill-switch de gasto diario ----------
const DAILY_CAP_USD = Math.max(0, parseFloat(process.env.DAILY_AI_CAP_USD || '10') || 10);

function daySpendUsd() {
  if (!DB) return 0;
  try {
    const r = DB.prepare(`SELECT COALESCE(SUM(est_cost_usd),0) AS s FROM api_costs
      WHERE date(ts) = date('now') AND feature != 'blocked'`).get();
    return (r && r.s) || 0;
  } catch (e) { return 0; }
}

class AiCapExceeded extends Error {
  constructor(msg) { super(msg); this.name = 'AiCapExceeded'; }
}

const MSG_CAP = 'Llegamos al tope de IA de hoy 🔋 Seguimos mañana con todo — no se perdió nada, tus borradores están a salvo 💪';

// Llamar ANTES de gastar IA en endpoints user-facing. Tira AiCapExceeded si se superó el tope.
function assertAiOk(userId) {
  if (daySpendUsd() >= DAILY_CAP_USD) {
    logApiCost({ userId, feature: 'blocked', model: 'cap' });
    try { console.error(`[ai-cap] BLOQUEO usuario=${userId} gasto_hoy=$${daySpendUsd().toFixed(2)} tope=$${DAILY_CAP_USD}`); } catch (e) {}
    throw new AiCapExceeded(MSG_CAP);
  }
}

// ---------- Rate limits por usuario/día ----------
function checkRate(userId, feature, limit) {
  if (!DB) return { ok: true, remaining: limit, used: 0 };
  try {
    const row = DB.prepare(`SELECT n FROM ai_rate WHERE user_id = ? AND feature = ? AND day = date('now')`).get(userId, feature);
    const n = (row && row.n) || 0;
    if (n >= limit) return { ok: false, remaining: 0, used: n };
    DB.prepare(`INSERT INTO ai_rate (user_id, feature, day, n) VALUES (?,?,date('now'),1)
      ON CONFLICT(user_id, feature, day) DO UPDATE SET n = n + 1`).run(userId, feature);
    return { ok: true, remaining: limit - n - 1, used: n + 1 };
  } catch (e) { return { ok: true, remaining: limit, used: 0 }; }
}

const MSG_CHAT_RATE = 'Hoy charlamos un montón 😅 Llegamos al tope de mensajes del día — seguimos mañana 💪';
const MSG_WEEK_RATE = 'Ya armamos varias semanas hoy 📅 Seguimos mañana con más ideas 💪';
const MSG_IDEAS_RATE = 'Ya generamos un montón de ideas hoy 💡 Seguimos mañana 💪';

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
        COALESCE(SUM(images),0) AS images, COALESCE(SUM(est_cost_usd),0) AS usd
      FROM api_costs
      WHERE ts >= datetime('now', ?) AND feature != 'blocked'
      GROUP BY feature, model ORDER BY usd DESC`).all(`-${Math.max(1, days | 0)} days`);
  } catch (e) { return []; }
}

module.exports = {
  initCosts, MODEL_PRICES, DAILY_CAP_USD,
  estCostUsd, logApiCost, trackUsage,
  daySpendUsd, AiCapExceeded, assertAiOk, MSG_CAP,
  checkRate, MSG_CHAT_RATE, MSG_WEEK_RATE, MSG_IDEAS_RATE,
  photoHash, photoRecentlySent, markPhotoSent,
  costBreakdown,
};
