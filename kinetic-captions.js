'use strict';
/* =====================================================================
 * kinetic-captions.js — PLANIFICADOR DE SUBTÍTULOS CINÉTICOS (Motion v3)
 * Spec: ~/workspace/equipo-posty/hidden_files/spec-motion-v3.md
 *
 * Convierte las escenas de un guion (reel-script.js) en un plan de
 * subtítulos por GRUPOS DE FRASE de 2–4 palabras, estilo Submagic:
 * el texto se revela por bloques cortos sincronizados con lo que se
 * DICE (o se lee), nunca todo de una ni palabra suelta sin contexto.
 *
 * TIMING PROPORCIONAL — DECLARADO: todavía no existe pista de voz
 * (el TTS es la Fase 5 del upgrade). Los tiempos de cada chunk se
 * derivan de la ventana de su escena repartida en proporción a la
 * cantidad de palabras de cada chunk. Cuando llegue la voz, ESTE
 * módulo no cambia de interfaz: el plan traerá timingMode:'voice'
 * y los tiempos saldrán del audio real en vez de la proporción.
 *
 * BANDAS: el texto vive SOLO en la banda superior o inferior del
 * cuadro 1080×1920 — nunca en el centro, nunca sobre el sujeto (la
 * misma regla que rige posteos e historias de Posty). Geometría en
 * fracciones de la altura total:
 *   top    y ∈ [0.07, 0.30]
 *   bottom y ∈ [0.66, 0.88]
 *   zona central prohibida: [0.38, 0.62]
 * Asignación por rol: hook y cta arriba (gancho y cierre se leen
 * como titulares), problema y solución abajo (lectura corrida).
 * ===================================================================== */

const BANDS = {
  top: { yMin: 0.07, yMax: 0.30 },
  bottom: { yMin: 0.66, yMax: 0.88 },
};
const FORBIDDEN_ZONE = { yMin: 0.38, yMax: 0.62 };
const BAND_BY_ROLE = { hook: 'top', cta: 'top', problem: 'bottom', solution: 'bottom' };
const CHUNK_MIN = 2;
const CHUNK_MAX = 4;

function round2(n) { return Math.round(n * 100) / 100; }
function wordCount(text) { return String(text || '').trim().split(/\s+/).filter(Boolean).length; }

/* Reparte n palabras en grupos lo más parejos posible de 2–4:
 * n=5 → [3,2] · n=7 → [4,3] · n=8 → [3,3,2] · n=10 → [4,3,3]. */
function chunkSizes(n) {
  if (n <= 0) return [];
  if (n <= CHUNK_MAX) return [n];
  const k = Math.ceil(n / 3.2);
  const sizes = [];
  let left = n;
  for (let i = 0; i < k; i++) {
    if (i === k - 1) { sizes.push(left); left = 0; break; }
    const take = Math.max(CHUNK_MIN, Math.min(CHUNK_MAX, Math.round(left / (k - i))));
    sizes.push(take);
    left -= take;
  }
  return sizes;
}

/* Corta una línea en chunks de texto respetando los tamaños y, cuando
 * se puede, cerrando el chunk en un signo de puntuación (la frase se
 * revela por unidades de sentido, no por conteo ciego). */
function chunkLine(line) {
  const words = String(line || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const sizes = chunkSizes(words.length);
  const chunks = [];
  let idx = 0;
  for (let i = 0; i < sizes.length; i++) {
    let take = sizes[i];
    // Si la palabra siguiente cierra una frase (termina en , . ; : ¡! ¿?),
    // y estamos dentro del máximo, la absorbemos para no cortar la idea.
    while (idx + take < words.length && take < CHUNK_MAX && /[,.;:!?]$/.test(words[idx + take - 1])) take++;
    chunks.push(words.slice(idx, idx + take).join(' '));
    idx += take;
    if (idx >= words.length) break;
  }
  if (idx < words.length) chunks.push(words.slice(idx).join(' '));
  return chunks;
}

/* Plan completo: escenas [{ role, line, start, end }] → chunks
 * [{ text, start, end, band, role, sceneIndex, words }].
 * Dentro de cada escena, el tiempo se reparte en proporción a las
 * palabras de cada chunk; el último chunk cierra EXACTO en el fin de
 * la escena (sin drift). timingMode queda declarado 'proportional'
 * hasta que exista pista de voz (Fase 5). */
function planKineticCaptions(script, opts = {}) {
  const scenes = (script && script.scenes) || [];
  const chunks = [];
  scenes.forEach((scene, sceneIndex) => {
    if (!scene || !String(scene.line || '').trim()) return;
    const start = Number(scene.start) || 0;
    const end = Number(scene.end) || (start + (Number(scene.seconds) || 0));
    if (!(end > start)) return;
    const band = (opts.bandByRole && opts.bandByRole[scene.role]) || BAND_BY_ROLE[scene.role] || 'bottom';
    const parts = chunkLine(scene.line);
    const totalWords = parts.reduce((a, p) => a + wordCount(p), 0) || 1;
    let cursor = start;
    parts.forEach((text, i) => {
      const isLast = i === parts.length - 1;
      const w = wordCount(text);
      const chunkEnd = isLast ? end : round2(start + (end - start) * ((parts.slice(0, i + 1).reduce((a, p) => a + wordCount(p), 0)) / totalWords));
      chunks.push({
        text, words: w,
        start: round2(cursor), end: chunkEnd,
        band, role: scene.role, sceneIndex,
      });
      cursor = chunkEnd;
    });
  });
  return {
    chunks,
    timingMode: 'proportional', // sin pista de voz todavía — ver header
    totalDuration: script && script.durationSec ? script.durationSec : (chunks.length ? chunks[chunks.length - 1].end : 0),
    bands: BANDS,
  };
}

/* Validación pura del plan: chunks de 2–4 palabras (salvo líneas de
 * 1 palabra), tiempos estrictamente crecientes y sin solapes, ningún
 * chunk fuera de [0, totalDuration], bandas válidas y jamás centro. */
function validateCaptionPlan(plan) {
  const errors = [];
  if (!plan || !Array.isArray(plan.chunks)) return { ok: false, errors: ['sin_chunks'] };
  if (plan.timingMode !== 'proportional' && plan.timingMode !== 'voice') errors.push('timing_mode_invalido');
  let prevEnd = 0;
  plan.chunks.forEach((c, i) => {
    if (!(c.end > c.start)) errors.push(`chunk_${i}_sin_duracion`);
    if (c.start < prevEnd - 0.001) errors.push(`chunk_${i}_solapado`);
    prevEnd = Math.max(prevEnd, c.end);
    if (c.words > CHUNK_MAX) errors.push(`chunk_${i}_largo_${c.words}`);
    if (c.words < CHUNK_MIN && wordCount(c.text) >= CHUNK_MIN) errors.push(`chunk_${i}_corto`);
    if (!BANDS[c.band]) errors.push(`chunk_${i}_banda_invalida`);
    if (plan.totalDuration && c.end > plan.totalDuration + 0.01) errors.push(`chunk_${i}_fuera_de_total`);
  });
  return { ok: errors.length === 0, errors };
}

module.exports = {
  BANDS, FORBIDDEN_ZONE, BAND_BY_ROLE, CHUNK_MIN, CHUNK_MAX,
  chunkSizes, chunkLine, planKineticCaptions, validateCaptionPlan,
};
