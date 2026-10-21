'use strict';
/* =====================================================================
 * reel-script.js — GUION DE REEL DESDE EL FUNDAMENTO (Motion v3, Fase 1)
 * Spec: ~/workspace/equipo-posty/hidden_files/spec-motion-v3.md
 *
 * Hasta hoy el reel semanal reciclaba el caption del posteo fuente
 * (story-reel.js: hookFromCaption = primera línea, beatFromCaption =
 * segunda línea, CTA fijo '¡Seguinos!'). Este módulo invierte el flujo:
 * el guion NACE del fundamento del cliente (client-digest) con la
 * estructura y los números del oficio verificados en el estudio de
 * Predis/competencia (2026-10-19):
 *
 *   Hook → Problema → Solución → CTA
 *   - Gancho: 8–14 palabras objetivo (mín. duro 6), sin preámbulo,
 *     ocupa el arranque (0–3 s).
 *   - Presupuesto de palabras habladas a 125–150 ppm:
 *       15 s ≈ 30–40 palabras · 30 s ≈ 60–75 · 60 s ≈ 125–150.
 *   - Una idea por línea; cambio visual cada 2–4 s (escenas).
 *   - Cada línea no-CTA se ANCLA a un producto/servicio/promo REAL
 *     del digest (test de pertenencia de client-digest: anchorsOf +
 *     pieceAnchored). Una línea que le sirve a cualquier negocio del
 *     rubro se RECHAZA y se regenera con feedback.
 *   - El CTA sale de la INTENCIÓN DE VENTA declarada de la pieza
 *     (venta/reserva/consulta/prueba/autoridad — sales-brain.js),
 *     nunca de un string fijo: '¡Seguinos!' está PROHIBIDO.
 *   - Números (precios, %, NxM) solo si están en el digest: el prompt
 *     lo ordena y el llamador puede además pasar el guard de v231.
 *
 * DEGRADACIÓN (declarada, nunca silenciosa): si el digest es fino o
 * inexistente, si no hay API key, o si la IA no produce un guion que
 * pase la validación tras los reintentos, se cae al comportamiento de
 * hoy (textos derivados del caption) con source:'caption' +
 * degraded:true + degradeReason. El motor actual ni se entera; la
 * Fase 2 decide por flag si usa el guion nuevo.
 *
 * La llamada de IA sigue el patrón de generator.js (fetch a
 * chat/completions, gpt-4o-mini, response_format json_object, apiKey
 * recibida por parámetro, trackUsage de costs.js) y es INYECTABLE
 * (aiCall) para testear sin gastar un peso.
 * ===================================================================== */

const clientDigest = require('./client-digest');
let trackUsage = () => {};
try { ({ trackUsage } = require('./costs')); } catch (e) { /* tests sin costs */ }

// ---------- constantes del oficio ----------
const WPM_MIN = 125;                 // palabras por minuto (habla natural)
const WPM_MAX = 150;
const WPS = 2.3;                     // ≈138 ppm, punto medio para planificar escenas
const HOOK_MIN_WORDS = 6;            // mínimo duro del gancho
const HOOK_TARGET_MIN = 8;           // objetivo del estudio: 8–14 palabras
const HOOK_MAX_WORDS = 14;
const SALES_INTENTS = ['venta', 'reserva', 'consulta', 'prueba', 'autoridad'];
const FORBIDDEN_CTA = '¡Seguinos!';  // el CTA fijo de story-reel.js:185 — prohibido acá
// Verbos de acción aceptados por intención (el CTA tiene que ORDENAR algo
// coherente con la intención; un CTA sin verbo de su intención no cierra).
const CTA_VERBS = {
  venta: ['pedi', 'encarga', 'compra', 'lleva', 'aprovecha', 'pedi'],
  reserva: ['reserva', 'agenda', 'saca', 'pedi'],
  consulta: ['escribinos', 'preguntanos', 'consultanos', 'mandanos', 'escribi'],
  prueba: ['veni', 'proba', 'pasate', 'veni'],
  autoridad: ['guarda', 'segui', 'guardate', 'comparti'],
};

// ---------- utilidades puras ----------
function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}
function normText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* Presupuesto de palabras para una duración: rango [min,max] a
 * 125–150 ppm y reparto objetivo por sección. El gancho se clampa al
 * objetivo del estudio (8–14) aunque la duración crezca. */
function wordBudget(durationSec) {
  const t = Math.max(8, Math.min(60, Number(durationSec) || 15));
  const min = Math.floor(t * WPM_MIN / 60);
  const max = Math.ceil(t * WPM_MAX / 60);
  const target = Math.round((min + max) / 2);
  const hook = Math.max(HOOK_TARGET_MIN, Math.min(HOOK_MAX_WORDS, Math.round(target * 0.22)));
  const cta = Math.max(5, Math.round(target * 0.14));
  const rest = Math.max(10, target - hook - cta);
  const problem = Math.round(rest * 0.42);
  const solution = rest - problem;
  return { durationSec: t, min, max, target, sections: { hook, problem, solution, cta } };
}

/* Ventanas canónicas de sección (segundos) para una duración total:
 * gancho 0–3 s; CTA final de 2–5 s; el resto se reparte problema →
 * solución ≈ 40/60. Son metadata de planificación para el render
 * (Fase 2); los tiempos FINOS de cada escena salen de sus palabras. */
function sectionWindows(durationSec) {
  const t = Math.max(8, Math.min(60, Number(durationSec) || 15));
  const hookEnd = Math.min(3, t * 0.2);
  const ctaDur = Math.max(2, Math.min(5, Math.round(t * 0.1)));
  const mid = t - hookEnd - ctaDur;
  const problemEnd = hookEnd + mid * 0.4;
  return {
    hook: [0, round2(hookEnd)],
    problem: [round2(hookEnd), round2(problemEnd)],
    solution: [round2(problemEnd), round2(t - ctaDur)],
    cta: [round2(t - ctaDur), t],
  };
}
function round2(n) { return Math.round(n * 100) / 100; }

// ---------- CTA determinístico por intención (fallback + red de seguridad) ----------
function itemName(item) { return item ? String(item.nombre || item).trim() : ''; }
function firstItemName(digest) {
  const p = (digest && digest.productos || [])[0];
  const s = (digest && digest.servicios || [])[0];
  return itemName(p) || itemName(s) || '';
}
/* El ítem del CTA depende de la intención: se RESERVA un servicio y
 * se VENDE un producto. Elegir mal el ítem (reservar una máscara)
 * delata guion automático. */
function itemForIntent(intent, digest) {
  const p = itemName((digest && digest.productos || [])[0]);
  const s = itemName((digest && digest.servicios || [])[0]);
  if (intent === 'reserva') return s || p || '';
  if (intent === 'venta' || intent === 'prueba') return p || s || '';
  return p || s || '';
}
function buildCtaForIntent(intent, digest) {
  const item = itemForIntent(intent, digest);
  const ciudad = (digest && digest.ciudad) || '';
  switch (intent) {
    case 'venta':
      return item ? `Pedí tu ${item} hoy mismo por DM.` : 'Pedí el tuyo hoy mismo por DM.';
    case 'reserva':
      return item ? `Reservá tu turno de ${item} por DM.` : 'Reservá tu turno por DM.';
    case 'consulta':
      return 'Escribinos por DM y te respondemos hoy.';
    case 'prueba':
      return item ? `Vení a probar ${item}${ciudad ? ` en ${ciudad}` : ''}.` : 'Vení a probarlo, te va a encantar.';
    case 'autoridad':
    default:
      return 'Guardá este tip para tu próxima visita.';
  }
}

// ---------- validación pura del guion ----------
/* scenes: [{ role:'hook'|'problem'|'solution'|'cta', line, visualHint }]
 * digest: para el test de pertenencia. Devuelve { ok, errors[], anchors }.
 * Reglas: estructura completa (≥1 escena por rol), gancho 6–14 palabras
 * y PRIMERO, total dentro del presupuesto, cada línea no-CTA anclada a
 * un ítem real del digest, CTA con verbo de su intención y jamás el
 * CTA fijo prohibido, visualHint presente en cada escena. */
function validateScript(scenes, digest, opts = {}) {
  const errors = [];
  const durationSec = opts.durationSec || 15;
  const intent = SALES_INTENTS.includes(opts.intent) ? opts.intent : 'autoridad';
  if (!Array.isArray(scenes) || !scenes.length) return { ok: false, errors: ['sin_escenas'], anchors: {} };
  const roles = scenes.map(s => s && s.role);
  for (const r of ['hook', 'problem', 'solution', 'cta']) {
    if (!roles.includes(r)) errors.push(`falta_rol_${r}`);
  }
  if (roles[0] !== 'hook') errors.push('el_gancho_no_abre');
  if (roles[roles.length - 1] !== 'cta') errors.push('el_cta_no_cierra');
  for (const s of scenes) {
    if (!s || !String(s.line || '').trim()) errors.push('linea_vacia');
    if (!s || !String(s.visualHint || '').trim()) errors.push('sin_visual_hint');
  }
  const hookLine = (scenes.find(s => s.role === 'hook') || {}).line || '';
  const hw = wordCount(hookLine);
  if (hw < HOOK_MIN_WORDS) errors.push(`gancho_corto_${hw}`);
  if (hw > HOOK_MAX_WORDS) errors.push(`gancho_largo_${hw}`);
  const total = scenes.reduce((a, s) => a + wordCount(s && s.line), 0);
  const budget = wordBudget(durationSec);
  if (total < budget.min) errors.push(`bajo_presupuesto_${total}<${budget.min}`);
  if (total > budget.max) errors.push(`sobre_presupuesto_${total}>${budget.max}`);
  // Pertenencia: cada línea que no sea el CTA tiene que nombrar algo real.
  const anchors = clientDigest.anchorsOf(digest);
  const anchorByRole = {};
  if (!anchors.length) {
    errors.push('digest_sin_anclas');
  } else {
    for (const s of scenes) {
      if (s.role === 'cta') continue;
      const chk = clientDigest.pieceAnchored(s.line, anchors);
      if (!chk.ok) errors.push(`sin_ancla_${s.role}`);
      else anchorByRole[s.role] = chk.anchor;
    }
  }
  // CTA: verbo de la intención + jamás el fijo prohibido.
  const ctaLine = (scenes.filter(s => s.role === 'cta').pop() || {}).line || '';
  if (normText(ctaLine).replace(/[^a-z ]/g, '').trim() === normText(FORBIDDEN_CTA).replace(/[^a-z ]/g, '').trim()) {
    errors.push('cta_prohibido');
  }
  const ctaNorm = ' ' + normText(ctaLine).replace(/[^a-z ]/g, ' ') + ' ';
  const verbs = CTA_VERBS[intent] || [];
 
  if (!verbs.some(v => ctaNorm.includes(' ' + v))) errors.push('cta_sin_verbo_de_intencion');
  return { ok: errors.length === 0, errors, anchors: anchorByRole, totalWords: total };
}

/* Asigna start/end/seconds a cada escena en proporción a sus palabras
 * (a WPS palabras/seg) y normaliza para que la suma cierre EXACTO en
 * la duración pedida. La última escena absorbe el redondeo. */
function withSceneTiming(scenes, durationSec) {
  const totalWords = scenes.reduce((a, s) => a + wordCount(s.line), 0) || 1;
  let cursor = 0;
  return scenes.map((s, i) => {
    const isLast = i === scenes.length - 1;
    const rawSec = wordCount(s.line) / totalWords * durationSec;
    const start = round2(cursor);
    const end = isLast ? durationSec : round2(cursor + rawSec);
    cursor = end;
    return { ...s, seconds: round2(end - start), start, end };
  });
}

// ---------- prompt + llamada de IA (patrón generator.js) ----------
function itemsLine(digest) {
  const fmt = (arr) => (arr || []).map(it => {
    const n = itemName(it); if (!n) return '';
    const p = it && typeof it === 'object' && it.precio ? ` ($${it.precio})` : '';
    return `${n}${p}`;
  }).filter(Boolean).join(' · ');
  const parts = [];
  if ((digest.servicios || []).length) parts.push(`Servicios: ${fmt(digest.servicios)}`);
  if ((digest.productos || []).length) parts.push(`Productos: ${fmt(digest.productos)}`);
  if ((digest.promos || []).length) parts.push(`Promos reales: ${(digest.promos || []).map(pr => pr.titulo || pr.nombre || pr).join(' · ')}`);
  return parts.join('\n');
}

function buildScriptPrompt({ digest, post, intent, proof, durationSec, feedback }) {
  const budget = wordBudget(durationSec);
  const s = budget.sections;
  const system =
    'Sos el guionista de reels de Posty: escribís guiones CORTOS que venden de verdad para negocios locales argentinos. Español rioplatense, voseo natural, cero humo.\n' +
    'ESTRUCTURA OBLIGATORIA (Hook → Problema → Solución → CTA), una idea por línea:\n' +
    `- Gancho (role "hook"): ${s.hook} palabras aprox. (máx. ${HOOK_MAX_WORDS}), SIN preámbulo ("hola", "hoy te quiero contar" = prohibido). Tiene que doler o intrigar en la primera frase.\n` +
    `- Problema (role "problem"): ~${s.problem} palabras. El dolor concreto del cliente de ESTE negocio.\n` +
    `- Solución (role "solution", 1 a 3 escenas): ~${s.solution} palabras en total. Cómo lo resuelve ESTE negocio, con su producto/servicio real.\n` +
    `- CTA (role "cta"): ~${s.cta} palabras, UN solo llamado a la acción acorde a la intención de venta "${intent}".\n` +
    `PRESUPUESTO TOTAL: entre ${budget.min} y ${budget.max} palabras habladas (el reel dura ${durationSec} s; se habla a 125–150 palabras por minuto). Si te pasás, el guion se descarta.\n` +
    'PERTENENCIA (regla de oro): CADA línea que no sea el CTA tiene que nombrar al menos un producto, servicio o promo REAL de la lista del fundamento. Una frase que podría decir cualquier negocio del rubro ("tenemos la mejor calidad") invalida el guion entero.\n' +
    'VERDAD: prohibido inventar productos, servicios, precios, porcentajes o promos que no estén en el fundamento. Sin números que no estén en la lista.\n' +
    'Cada escena lleva "visualHint": la descripción visual concreta de qué se ve en esos segundos (sujeto + acción + ambiente), que después se usa para buscar o generar el clip. Sin texto en el visualHint.\n' +
    'Respondé SOLO con un JSON: {"scenes":[{"role":"hook|problem|solution|cta","line":"...","visualHint":"..."}]} — la primera escena es el gancho, la última es el CTA.';
  const user =
    `Negocio: ${digest.business || ''} (rubro: ${digest.subcat || digest.category || ''}${digest.ciudad ? `, ${digest.ciudad}` : ''})\n` +
    `Fundamento (lo ÚNICO que existe — no inventes nada fuera de esto):\n${itemsLine(digest)}\n` +
    (digest.diferencial ? `Diferencial real: ${digest.diferencial}\n` : '') +
    `Tema del posteo fuente: ${(post && (post.source_topic || post.tema || post.topic)) || ''}\n` +
    ((post && post.source_angle) ? `Ángulo del posteo: ${post.source_angle}\n` : '') +
    `Intención de venta de la pieza: ${intent}${proof ? ` — prueba concreta a usar: ${proof}` : ''}\n` +
    (feedback ? `\nAjuste de calidad (OBEDECELO — el intento anterior fue rechazado por esto): ${feedback}` : '') +
    '\nEscribí el guion del reel.';
  return { system, user, budget };
}

async function aiCallViaOpenAI({ system, user }, apiKey) {
  if (!apiKey) throw new Error('sin_api_key');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 700,
      temperature: 0.85,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  try { trackUsage({ feature: 'reel-script', model: 'gpt-4o-mini', json: data }); } catch (e) {}
  return JSON.parse(data.choices[0].message.content);
}

// ---------- fallback: el comportamiento de HOY (derivado del caption) ----------
/* Reimplementación local de hookFromCaption/beatFromCaption de
 * story-reel.js (no se importan en esta fase para no acoplar el módulo
 * al motor; Fase 2 los unifica). La diferencia deliberada: el CTA NO es
 * el fijo '¡Seguinos!' sino el determinístico por intención. */
function cleanCaptionLine(ln) {
  return String(ln || '').replace(/#\S+/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ').trim();
}
function hookFromCaptionText(caption) {
  const first = String(caption || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const clean = cleanCaptionLine(first);
  if (!clean) return '';
  if (clean.length > 64) {
    const s1 = (clean.split(/[.!?]\s+/)[0] || '').trim();
    if (s1.length >= 12 && s1.length < clean.length) return s1.charAt(0).toUpperCase() + s1.slice(1);
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}
function beatFromCaptionText(caption, hook) {
  const lines = String(caption || '').split('\n').map(s => s.trim()).filter(Boolean);
  for (const ln of lines) {
    const clean = cleanCaptionLine(ln);
    if (clean && clean !== hook && clean.length >= 12) return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  const sentences = String(caption || '').split(/[.!?]\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences[1]) {
    const clean = cleanCaptionLine(sentences[1]);
    if (clean) return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return '';
}
function captionFallbackScript({ digest, post, intent, durationSec, degradeReason }) {
  const post0 = post || {};
  const hook = hookFromCaptionText(post0.caption) || String(post0.source_topic || post0.tema || '').slice(0, 60);
  const mid = beatFromCaptionText(post0.caption, hook) || String(post0.source_angle || '').slice(0, 60);
  const item = firstItemName(digest);
  const scenes = [];
  if (hook) scenes.push({ role: 'hook', line: hook, visualHint: item || hook, anchor: null });
  if (mid) scenes.push({ role: 'solution', line: mid, visualHint: item || mid, anchor: null });
  scenes.push({ role: 'cta', line: buildCtaForIntent(intent, digest), visualHint: item || 'cierre de marca', anchor: null });
  const timed = withSceneTiming(scenes, durationSec);
  return {
    hook, problem: '', solution: mid,
    cta: timed[timed.length - 1].line,
    scenes: timed, durationSec,
    totalWords: timed.reduce((a, s) => a + wordCount(s.line), 0),
    intent, source: 'caption', degraded: true, degradeReason: degradeReason || 'fallback',
  };
}

// ---------- API principal ----------
/* buildReelScript({ digest, post, durationSec, intent, proof, apiKey,
 *                   aiCall, maxAttempts })
 * → { hook, problem, solution, cta, scenes[], durationSec, totalWords,
 *     intent, source: 'ai'|'caption', degraded, degradeReason?, attempts }
 * Nunca lanza por falta de fundamento/IA: degrada y lo declara. */
async function buildReelScript(opts = {}) {
  const digest = opts.digest || null;
  const post = opts.post || {};
  const durationSec = Math.max(8, Math.min(60, Number(opts.durationSec) || 15));
  const intent = SALES_INTENTS.includes(opts.intent) ? opts.intent
    : SALES_INTENTS.includes(post.salesIntent) ? post.salesIntent
    : SALES_INTENTS.includes(post.sales_intent) ? post.sales_intent
    : SALES_INTENTS.includes(post.intent) ? post.intent : 'autoridad';
  const callAI = opts.aiCall || aiCallViaOpenAI;
  const maxAttempts = Math.max(0, Number.isFinite(opts.maxAttempts) ? opts.maxAttempts : 2);

  if (!clientDigest.hasFoundation(digest)) {
    return captionFallbackScript({ digest: digest || clientDigest.emptyDigest(), post, intent, durationSec, degradeReason: 'sin_fundamento' });
  }
  let feedback = '';
  let lastReason = '';
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    let parsed;
    try {
      const prompt = buildScriptPrompt({ digest, post, intent, proof: opts.proof, durationSec, feedback });
      parsed = await callAI(prompt, opts.apiKey);
    } catch (e) {
      return captionFallbackScript({ digest, post, intent, durationSec, degradeReason: String(e && e.message || 'ia_error') });
    }
    const scenesIn = (parsed && parsed.scenes) || [];
    const v = validateScript(scenesIn, digest, { durationSec, intent });
    if (v.ok) {
      const timed = withSceneTiming(scenesIn.map(s => ({ role: s.role, line: String(s.line).trim(), visualHint: String(s.visualHint).trim() })), durationSec);
      const anchors = clientDigest.anchorsOf(digest);
      for (const s of timed) {
        if (s.role === 'cta') { s.anchor = null; continue; }
        const chk = clientDigest.pieceAnchored(s.line, anchors);
        s.anchor = chk.ok ? chk.anchor : null;
      }
      const byRole = (r) => timed.filter(s => s.role === r).map(s => s.line).join(' ');
      return {
        hook: byRole('hook'), problem: byRole('problem'), solution: byRole('solution'), cta: byRole('cta'),
        scenes: timed, durationSec, totalWords: v.totalWords,
        intent, source: 'ai', degraded: false, attempts: attempt + 1,
      };
    }
    lastReason = 'validacion: ' + v.errors.join(',');
    feedback = `El guion anterior fue rechazado (${v.errors.join(', ')}). Errores "sin_ancla_X" = esa línea no nombra ningún producto/servicio/promo de la lista: reescribila nombrando uno real. "sobre/bajo_presupuesto" = ajustá la cantidad TOTAL de palabras al rango pedido. "gancho_largo/corto" = el gancho va entre ${HOOK_TARGET_MIN} y ${HOOK_MAX_WORDS} palabras.`;
  }
  return captionFallbackScript({ digest, post, intent, durationSec, degradeReason: lastReason || 'validacion' });
}

module.exports = {
  WPM_MIN, WPM_MAX, WPS, HOOK_MIN_WORDS, HOOK_TARGET_MIN, HOOK_MAX_WORDS,
  SALES_INTENTS, FORBIDDEN_CTA,
  wordCount, wordBudget, sectionWindows,
  buildCtaForIntent, validateScript, withSceneTiming,
  buildScriptPrompt, captionFallbackScript, buildReelScript,
};
