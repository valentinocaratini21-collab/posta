'use strict';
/* =====================================================================
 * ai-video.js — VIDEO FIRMA SEMANAL con Seedance vía fal.ai (v329)
 * Spec: ~/workspace/posty-reels-video-ia/BRIEF.md (§7 = spec de build).
 *
 * Diseño confirmado (Valentino, 2026-10-22): 1 video IA premium por
 * semana por cliente — la pieza firma de la semana. El clip nace
 * image-to-video desde la imagen EXACTA del cliente (su foto o la imagen
 * del motor que ya pasó el test de pertenencia), sin audio del modelo
 * (Posty monta SU música y subtítulos con el motor de siempre) y abre el
 * reel principal de la semana como escena 1 (enganche en story-reel.js).
 * El clip completo queda guardado en el mediaDir del cliente para reuso.
 *
 * AISLAMIENTO (§7.6): toda llamada a fal vive en este módulo (submitJob,
 * pollJob, fetchResult, uploadImage). Ningún otro archivo conoce URLs ni
 * model ids del proveedor: cambiar de host o de modelo = tocar solo acá
 * y las env de §7.1.
 *
 * FALLO = FALLBACK (nunca rompe la semana): sin flag, sin FAL_KEY, uid no
 * habilitado, cap alcanzado o cualquier error de fal → devuelve null y
 * la semana sale con el pipeline actual, con el log [ai-video]
 * declarando la causa (el mismo patrón honesto del guion v3).
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let costs = null;
try { costs = require('./costs'); } catch (e) { /* sin costs: el cap no frena, el log de costo no-op */ }
let mediaInfo = null;
try { ({ mediaInfo } = require('./reel-engine')); } catch (e) { /* validación cae a existencia+ tamaño */ }

// ---------- Configuración (env, brief §7.1) ----------
const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_STORAGE_INITIATE_URL = 'https://rest.alpha.fal.ai/storage/upload/initiate';
// Polling y deadline son env-ajustables para poder testear el timeout sin
// esperar 12 minutos; los defaults son los del brief (§7.3.4).
const POLL_MS = Math.max(200, parseInt(process.env.POSTY_AI_VIDEO_POLL_MS || '10000', 10) || 10000);
const DEADLINE_MS = Math.max(POLL_MS, parseInt(process.env.POSTY_AI_VIDEO_DEADLINE_MS || String(12 * 60 * 1000), 10) || 12 * 60 * 1000);

// Routing por plan (brief §7.2). Tarifas de PLANIFICACIÓN de fal a 720p
// (USD/segundo, verificadas 2026-10-22): sirven para estimar y loguear;
// la factura real de fal manda y se concilia en el dogfood.
const MODEL_ROUTES = {
  esencial: { modelId: 'bytedance/seedance-2.0/fast/image-to-video', resolution: '720p', duration: '8', rateUsdPerSec: 0.2419 },
  pro:      { modelId: 'bytedance/seedance-2.5/image-to-video',      resolution: '720p', duration: '10', rateUsdPerSec: 0.4730 },
  total:    { modelId: 'bytedance/seedance-2.5/image-to-video',      resolution: '720p', duration: '10', rateUsdPerSec: 0.4730 },
  free:     { modelId: 'bytedance/seedance-2.5/image-to-video',      resolution: '720p', duration: '10', rateUsdPerSec: 0.4730 },
};
// Plantilla genérica segura (brief §7.5.3): si el guion no trajo
// videoPrompt, el clip igual sale — movimiento mínimo, producto quieto.
const GENERIC_VIDEO_PROMPT = 'Slow cinematic push-in on the product from the photo, the product stays perfectly still and exactly as in the photo, soft light movement in the background, photorealistic, vertical 9:16.';

function falKey() { return String(process.env.FAL_KEY || '').trim(); }

/* modelForPlan(planId) → ruta del modelo (§7.2). POSTY_AI_VIDEO_MODEL
 * pisa el routing (test A/B): si el override es un model id conocido usa
 * su tarifa; si es desconocido, hereda duración/resolución/tarifa de la
 * ruta premium (la estimación queda declarada como aproximada). */
function modelForPlan(planId) {
  const override = String(process.env.POSTY_AI_VIDEO_MODEL || '').trim();
  if (override) {
    const known = Object.values(MODEL_ROUTES).find(r => r.modelId === override);
    if (known) return { ...known };
    return { ...MODEL_ROUTES.pro, modelId: override };
  }
  return { ...(MODEL_ROUTES[String(planId || '').toLowerCase()] || MODEL_ROUTES.esencial) };
}

/* Puerta de activación del paso 1 (§7.1): flag global + FAL_KEY + lista
 * de uids habilitados (dogfood: solo founder). Sin las tres cosas, el
 * pipeline ni se entera de que este módulo existe. */
function aiVideoEnabledFor(uid) {
  if (process.env.POSTY_AI_VIDEO !== '1') return false;
  if (!falKey()) return false;
  const list = String(process.env.POSTY_AI_VIDEO_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) return false;
  return list.includes(String(uid));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function alog(...args) { console.log('[ai-video]', ...args); }

/* Error tipado: technical=true admite el ÚNICO reintento de §7.4;
 * contentReject=true lo prohíbe (moderación: reintentar no cambia nada
 * y quema margen). */
class FalError extends Error {
  constructor(msg, opts = {}) {
    super(msg);
    this.name = 'FalError';
    this.technical = !!opts.technical;
    this.contentReject = !!opts.contentReject;
  }
}
function looksLikeContentReject(text) {
  return /content|policy|moderat|safety|nsfw|violat/i.test(String(text || ''));
}

/* fetch hacia fal con timeout duro. Auth NUNCA se inyecta acá: cada
 * llamada pasa sus headers explícitos (la descarga del clip y el PUT a
 * storage van SIN auth, como pide el brief). */
async function falFetch(url, opts = {}, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    throw new FalError(`red/timeout hacia fal: ${e.message}`, { technical: true });
  } finally { clearTimeout(t); }
}
function authHeaders(extra = {}) {
  return { Authorization: `Key ${falKey()}`, ...extra };
}

// ---------- fal Storage: subida de la imagen fuente en 2 pasos (§7.3.1) ----------
async function uploadImage(imageFile) {
  const buf = fs.readFileSync(imageFile);
  const ext = (path.extname(imageFile) || '.jpg').toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const fileName = `posty-firma-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`;
  const initRes = await falFetch(FAL_STORAGE_INITIATE_URL, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ file_name: fileName, content_type: contentType }),
  }, 30000);
  if (!initRes.ok) {
    throw new FalError(`fal storage initiate HTTP ${initRes.status}`, { technical: initRes.status >= 500 || initRes.status === 429 });
  }
  const init = await initRes.json().catch(() => null);
  if (!init || !init.upload_url || !init.file_url) {
    throw new FalError('fal storage initiate: respuesta sin upload_url/file_url', { technical: true });
  }
  const putRes = await falFetch(init.upload_url, {
    method: 'PUT', headers: { 'Content-Type': contentType }, body: buf,
  }, 120000);
  if (!putRes.ok) {
    throw new FalError(`fal storage PUT HTTP ${putRes.status}`, { technical: putRes.status >= 500 || putRes.status === 429 });
  }
  return init.file_url;
}

// ---------- Cola de fal: submit / polling / resultado (§7.3.3–7.3.5) ----------
async function submitRaw(route, body) {
  return falFetch(`${FAL_QUEUE_BASE}/${route.modelId}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  }, 60000);
}

async function submitJob(route, { prompt, imageUrl, seed }) {
  const mkBody = (aspect) => {
    const b = {
      prompt,
      image_url: imageUrl,
      resolution: route.resolution,
      duration: route.duration, // STRING, como pide el esquema de fal
      aspect_ratio: aspect,
      generate_audio: false, // §4.5: el audio del modelo se descarta por diseño
    };
    if (Number.isFinite(seed)) b.seed = seed;
    return b;
  };
  let res = await submitRaw(route, mkBody('9:16'));
  if (res.status === 422) {
    // En 2.5 I2V el aspect se hereda de la imagen: reintento del SUBMIT con
    // 'auto' (§7.3.3). Es corrección de esquema, NO el reintento de §7.4.
    await res.text().catch(() => '');
    res = await submitRaw(route, mkBody('auto'));
  }
  if (res.status === 401 || res.status === 403) {
    throw new FalError(`fal auth HTTP ${res.status} (FAL_KEY inválida o sin permiso)`, {});
  }
  if (res.status === 422) {
    throw new FalError('fal rechazó el pedido (422 tras reintento con aspect auto)', { contentReject: true });
  }
  if (!res.ok) {
    throw new FalError(`fal submit HTTP ${res.status}`, { technical: res.status >= 500 || res.status === 429 });
  }
  const data = await res.json().catch(() => null);
  // Las URLs se guardan TAL COMO VIENEN: armarlas a mano devuelve 405 (§7.3.3).
  if (!data || !data.request_id || !data.status_url || !data.response_url) {
    throw new FalError('fal submit: respuesta sin request_id/status_url/response_url', { technical: true });
  }
  return data;
}

async function pollJob(job, startedAt) {
  for (;;) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      if (job.cancel_url) {
        try { await falFetch(job.cancel_url, { method: 'PUT', headers: authHeaders() }, 15000); } catch (e) { /* best-effort */ }
      }
      throw new FalError(`deadline de ${Math.round(DEADLINE_MS / 1000)}s superado esperando a fal`, { technical: true });
    }
    const res = await falFetch(job.status_url, { headers: authHeaders() }, 30000);
    if (!res.ok) {
      throw new FalError(`fal status HTTP ${res.status}`, { technical: res.status >= 500 || res.status === 429 });
    }
    const st = await res.json().catch(() => null);
    const status = st && st.status;
    if (status === 'COMPLETED') {
      // Un COMPLETED puede traer error (§7.3.4): se trata como fallo.
      if (st.error || st.error_type) {
        const det = `${st.error_type || ''} ${typeof st.error === 'string' ? st.error : JSON.stringify(st.error || '')}`;
        throw new FalError(`fal completó con error: ${det.trim()}`, { contentReject: looksLikeContentReject(det) });
      }
      return st;
    }
    if (status === 'ERROR' || (st && (st.error || st.error_type))) {
      const det = `${(st && st.error_type) || ''} ${st && typeof st.error === 'string' ? st.error : ''}`;
      throw new FalError(`fal reportó error: ${det.trim() || status}`, { contentReject: looksLikeContentReject(det) });
    }
    // IN_QUEUE / IN_PROGRESS (o estado aún no reflejado): seguir esperando.
    await sleep(POLL_MS);
  }
}

async function fetchResult(job) {
  const res = await falFetch(job.response_url, { headers: authHeaders() }, 30000);
  if (!res.ok) {
    throw new FalError(`fal result HTTP ${res.status}`, { technical: res.status >= 500 || res.status === 429 });
  }
  const data = await res.json().catch(() => null);
  const url = data && data.video && data.video.url;
  if (!url) {
    const det = data && (data.error || data.detail) ? String(typeof (data.error || data.detail) === 'string' ? (data.error || data.detail) : JSON.stringify(data.error || data.detail)) : '';
    throw new FalError(`fal result sin video.url${det ? `: ${det}` : ''}`, { technical: !looksLikeContentReject(det), contentReject: looksLikeContentReject(det) });
  }
  return { url, seed: data.seed };
}

async function downloadTo(url, destFile) {
  // SIN header de auth: video.url es una URL firmada de la CDN de fal.
  const res = await falFetch(url, {}, 180000);
  if (!res.ok) {
    throw new FalError(`descarga del clip HTTP ${res.status}`, { technical: res.status >= 500 || res.status === 429 });
  }
  let buf;
  try { buf = Buffer.from(await res.arrayBuffer()); }
  catch (e) { throw new FalError(`descarga del clip interrumpida: ${e.message}`, { technical: true }); }
  if (!buf.length) throw new FalError('descarga del clip vacía', { technical: true });
  fs.writeFileSync(destFile, buf);
}

/* Validación obligatoria del clip antes de usarlo (§7.3.6): reusa el
 * mediaInfo (ffprobe) de reel-engine — stream de video presente
 * (width/height > 0), duración ≥ 4s. */
async function validateClip(file) {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) return false;
    if (!mediaInfo) return true; // sin ffprobe accesible: existencia + tamaño
    const info = await mediaInfo(file);
    return !!(info && info.duration >= 4 && info.width > 0 && info.height > 0);
  } catch (e) { return false; }
}

/* ---------- Biblioteca de vidriera (misión sumada 2026-10-22) ----------
 * Ningún video firma se pierde: cada clip generado queda registrado en la
 * tabla ai_signature_clips (negocio, rubro, plan/tier, semana, modelo,
 * costo) y el archivo queda accesible para siempre vía /media/<file>.
 * Motivo: las mejores piezas se reusan como marketing en el Instagram de
 * Posty (negocio etiquetado, formato collab) meses después.
 * GARANTÍA DE NO-BORRADO (doble): (1) mediaJanitor de server.js borra solo
 * huérfanos NO referenciados, y referencedMediaNames() escanea TODAS las
 * tablas — el file_name registrado acá cuenta como referencia viva;
 * (2) el mismo janitor tiene guarda explícita por prefijo 'ai-signature-'.
 * El registro nunca rompe la generación: todo va en try/catch. */
const LIBRARY_SQL = `CREATE TABLE IF NOT EXISTS ai_signature_clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  plan_id TEXT NOT NULL DEFAULT '',
  week_key TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  seconds INTEGER NOT NULL DEFAULT 0,
  duration_sec REAL NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  source_image TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, week_key)
)`;
function ensureLibrary(db) {
  if (!db) return false;
  try { db.exec(LIBRARY_SQL); return true; } catch (e) { return false; }
}
function registerSignatureClip(db, row) {
  if (!db || !row || row.userId == null) return false;
  try {
    if (!ensureLibrary(db)) return false;
    let business = '', category = '';
    try {
      const p = db.prepare('SELECT business_name, category FROM profiles WHERE user_id = ?').get(row.userId) || {};
      business = String(p.business_name || '');
      category = String(p.category || '');
    } catch (e) { /* snapshot sin perfil: la fila igual sirve */ }
    db.prepare(`INSERT OR REPLACE INTO ai_signature_clips
      (user_id, business_name, category, plan_id, week_key, model, request_id, file_name, seconds, duration_sec, cost_usd, source_image, prompt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.userId, business, category, String(row.planId || ''), String(row.weekKey || ''),
      String(row.model || ''), String(row.requestId || ''), String(row.fileName || ''),
      row.seconds | 0, Number(row.durationSec) || 0,
      Math.round((Number(row.costUsd) || 0) * 1e6) / 1e6,
      String(row.sourceImage || ''), String(row.prompt || ''));
    return true;
  } catch (e) { return false; }
}
/* Listado para el fundador (endpoint admin /api/admin/ai-signatures):
 * lo más nuevo primero, con la URL pública del archivo ya armada. */
function listSignatureClips(db, { limit = 100, userId = null } = {}) {
  if (!db) return [];
  try {
    if (!ensureLibrary(db)) return [];
    const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const rows = userId != null
      ? db.prepare('SELECT * FROM ai_signature_clips WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, lim)
      : db.prepare('SELECT * FROM ai_signature_clips ORDER BY id DESC LIMIT ?').all(lim);
    return rows.map(r => ({ ...r, url: r.file_name ? `/media/${r.file_name}` : '' }));
  } catch (e) { return []; }
}

function resolvePlanId(db, uid, planId) {
  if (planId) return String(planId).toLowerCase();
  try {
    const { getPlan, TRIAL_PLAN } = require('./config/plans');
    const u = db.prepare('SELECT plan, plan_status FROM users WHERE id = ?').get(uid) || {};
    return getPlan(u.plan_status === 'active' ? u.plan : TRIAL_PLAN).id;
  } catch (e) { return 'esencial'; }
}

/* =====================================================================
 * generateSignatureClip({ db, uid, planId, imageFile, prompt, mediaDir,
 *                         weekKey })
 *   → { file, model, requestId, seconds, costUsd } ó null (fallback).
 * Idempotente por (uid, weekKey): si el archivo de la semana ya existe y
 * valida, lo devuelve SIN gastar (aunque el flag se haya apagado después).
 * ===================================================================== */
async function generateSignatureClip({ db, uid, planId, imageFile, prompt, mediaDir, weekKey } = {}) {
  const t0 = Date.now();
  const safeWeek = String(weekKey || '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'semana';
  try {
    if (!mediaDir) { alog(`uid ${uid}: sin mediaDir — semana sin firma`); return null; }
    // El nombre incluye el uid A PROPÓSITO: en producción mediaDir es el
    // MEDIA_DIR compartido por todos los usuarios (server.js) — sin uid,
    // el clip de un cliente sería "reusado" por otro. La idempotencia del
    // brief es por (uid, weekKey) y el nombre la respeta tal cual.
    const finalFile = path.join(mediaDir, `ai-signature-${uid}-${safeWeek}.mp4`);

    // (1) Idempotencia primero: el clip de la semana ya existe → reuso.
    if (fs.existsSync(finalFile)) {
      if (await validateClip(finalFile)) {
        // Backfill de biblioteca: si el archivo existe pero no está en el
        // registro (generado antes de que existiera la tabla), se registra
        // ahora — el registro es parte de la garantía de no-borrado.
        try {
          if (ensureLibrary(db)) {
            const reg = db.prepare('SELECT id FROM ai_signature_clips WHERE user_id = ? AND week_key = ?').get(uid, safeWeek);
            if (!reg) {
              registerSignatureClip(db, {
                userId: uid, planId: resolvePlanId(db, uid, planId), weekKey: safeWeek,
                model: '', requestId: '', fileName: path.basename(finalFile),
                seconds: 0, durationSec: 0, costUsd: 0, sourceImage: '', prompt: '',
              });
            }
          }
        } catch (e) { /* el registro nunca rompe el reuso */ }
        alog(`uid ${uid} semana ${safeWeek}: clip ya existe y valida — reuso sin gasto`);
        return { file: finalFile, reused: true };
      }
      try { fs.rmSync(finalFile, { force: true }); } catch (e) {}
    }

    // (2) Puertas: flag/uids/key, imagen fuente presente.
    if (!aiVideoEnabledFor(uid)) {
      alog(`uid ${uid} semana ${safeWeek}: video firma deshabilitado (flag POSTY_AI_VIDEO, lista de uids o FAL_KEY) — semana sin firma`);
      return null;
    }
    if (!imageFile || !fs.existsSync(imageFile)) {
      alog(`uid ${uid} semana ${safeWeek}: sin imagen fuente — semana sin firma`);
      return null;
    }

    const plan = resolvePlanId(db, uid, planId);
    const route = modelForPlan(plan);
    const seconds = parseInt(route.duration, 10) || 0;
    const estUsd = Math.round(route.rateUsdPerSec * seconds * 1e6) / 1e6;

    // (3) Cap ANTES de gastar (§7.3.2): línea de video del plan en costs.js.
    if (costs && costs.aiVideoMonthSpendUsd && costs.aiVideoCapUsd) {
      const cap = costs.aiVideoCapUsd(plan);
      const spent = costs.aiVideoMonthSpendUsd(uid);
      if (!(spent + estUsd <= cap)) {
        alog(`uid ${uid} semana ${safeWeek}: cap de video del plan alcanzado (mes USD ${Number(spent).toFixed(2)} + est. USD ${estUsd.toFixed(2)} > tope USD ${cap}) — semana sin firma`);
        return null;
      }
    }

    const finalPrompt = String(prompt || '').trim() || GENERIC_VIDEO_PROMPT;
    const tmpFile = path.join(mediaDir, `.tmp-ai-signature-${uid}-${safeWeek}.mp4`);

    // (4) Generación con UN reintento máximo y solo ante fallo técnico (§7.4).
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const imageUrl = await uploadImage(imageFile);
        const job = await submitJob(route, {
          prompt: finalPrompt,
          imageUrl,
          seed: attempt ? Math.floor(Math.random() * 2147483646) + 1 : undefined,
        });
        const startedAt = Date.now();
        await pollJob(job, startedAt);
        const result = await fetchResult(job);
        await downloadTo(result.url, tmpFile);
        // El clip SÍ se generó y fal cobra solo generaciones exitosas: el
        // costo se loguea aunque la validación local lo descarte (§7.4).
        if (costs && costs.logVideoCost) {
          costs.logVideoCost({ userId: uid, model: route.modelId, estUsd });
        }
        if (!(await validateClip(tmpFile))) {
          try { fs.rmSync(tmpFile, { force: true }); } catch (e) {}
          throw new FalError('clip descargado inválido según ffprobe (sin video o duración < 4s)', { technical: true });
        }
        fs.renameSync(tmpFile, finalFile);
        // Registro en la biblioteca de vidriera (misión 2026-10-22): el
        // clip queda indexado y protegido contra el janitor de medios.
        let durSec = 0;
        try { const info = await mediaInfo(finalFile); if (info) durSec = info.duration || 0; } catch (e) {}
        registerSignatureClip(db, {
          userId: uid, planId: plan, weekKey: safeWeek, model: route.modelId,
          requestId: job.request_id, fileName: path.basename(finalFile),
          seconds, durationSec: durSec, costUsd: estUsd,
          sourceImage: path.basename(imageFile || ''), prompt: finalPrompt,
        });
        const elapsed = Math.round((Date.now() - t0) / 1000);
        alog(`uid ${uid} semana ${safeWeek} modelo ${route.modelId} request ${job.request_id} ok en ${elapsed}s, costo est. $${estUsd.toFixed(2)}`);
        return { file: finalFile, model: route.modelId, requestId: job.request_id, seconds, costUsd: estUsd };
      } catch (e) {
        const fe = e instanceof FalError ? e : new FalError(String((e && e.message) || e), { technical: true });
        try { fs.rmSync(tmpFile, { force: true }); } catch (err) {}
        if (fe.contentReject) {
          alog(`uid ${uid} semana ${safeWeek}: rechazo de contenido de fal (${fe.message}) — sin reintento, semana sin firma`);
          return null;
        }
        if (!fe.technical || attempt === 1) {
          alog(`uid ${uid} semana ${safeWeek}: falló el video firma (${fe.message}) — semana sin firma`);
          return null;
        }
        alog(`uid ${uid} semana ${safeWeek}: fallo técnico (${fe.message}) — único reintento`);
      }
    }
    return null;
  } catch (e) {
    // Red final de seguridad: NADA de este módulo rompe la semana.
    alog(`uid ${uid} semana ${safeWeek}: error inesperado (${(e && e.message) || e}) — semana sin firma`);
    return null;
  }
}

module.exports = {
  generateSignatureClip,
  aiVideoEnabledFor,
  modelForPlan,
  validateClip,
  GENERIC_VIDEO_PROMPT,
  MODEL_ROUTES,
  FalError,
  // Biblioteca de vidriera:
  ensureLibrary, registerSignatureClip, listSignatureClips,
  // Internos expuestos solo para tests:
  _internal: { uploadImage, submitJob, pollJob, fetchResult, downloadTo },
};
