// preguntas-posteos.js — PREGUNTAS→POSTEOS (mejora 2/5 de Posty, 30/10).
// Preguntas reales repetidas de clientes → propuestas de posteo en la
// Bandeja, pendientes de la aprobación del dueño. NUNCA publica solo.
//
// Lógica PURA: sin DB, sin red, sin GPT. Recibe comentarios ya leídos
// (el bundle real de ig-comments.js) y devuelve grupos y propuestas.
// Sin preguntas reales repetidas, no hay propuestas: jamás relleno.
//
// Reglas (SPEC.md):
//  - Umbral: >= 3 veces Y >= 2 autores distintos (1 = anécdota, 2 puede
//    ser un hilo, 3 con 2+ voces = demanda repetida; un autor 3 veces
//    NO alcanza: anti-spam).
//  - Una pregunta por propuesta; agrupación SOLO ortográfica (minúsculas,
//    sin acentos, sin puntuación): nunca se fusionan dos preguntas
//    parecidas por semántica.
//  - La propuesta queda en estado 'pendiente'. No tiene ningún campo ni
//    llamada de publicación: publicar no existe en este módulo.
'use strict';

const UMBRAL_VECES = 3;
const MIN_AUTORES = 2;
const MAX_PROPUESTAS = 10;
const MAX_EJEMPLOS = 3;
const TIPO_BANDEJA = 'pregunta_posteo';

// Palabras interrogativas al inicio (ES + EN básico del sitio espejo).
// En forma SIN acentos: la comparación usa la clave ya normalizada.
// 'que' y 'porque' sueltos NO entran: sin '?' suelen ser deseos o
// explicaciones («que vendan mucho», «porque no abren»), no preguntas.
// Las preguntas con 'qué'/'por qué' reales casi siempre traen '?' y ya
// entran por esa vía; 'por qué' sin '?' entra por el chequeo de abajo.
const INTERROGATIVAS = [
  'cual', 'cuales', 'cuando', 'donde', 'como', 'cuanto', 'cuanta',
  'cuantos', 'cuantas', 'quien', 'quienes',
  'what', 'when', 'where', 'how', 'which', 'who', 'why',
];
// Verbos de pregunta frecuente al inicio (ES + EN). Lista cerrada y
// conservadora: un verbo fuera de la lista sin '?' NO cuenta como
// pregunta (mejor perder una pregunta que inventar una).
// (La comparación usa la clave ya normalizada — sin acentos — así que
// la lista va en forma sin acentos: 'envian', no 'envían'.)
const VERBOS_PREGUNTA = [
  'hacen', 'hace', 'tienen', 'tiene', 'abren', 'abre', 'venden', 'vende',
  'envian', 'envia', 'entregan', 'entrega', 'aceptan', 'acepta',
  'atienden', 'atiende', 'trabajan', 'trabaja', 'estan', 'esta', 'queda',
  'quedan', 'sale', 'salen', 'cuesta', 'cuestan', 'llevan', 'llegan',
  'do', 'does', 'is', 'are', 'can', 'have', 'has',
];
// Elogios/afirmaciones con 'qué' que NO son preguntas aunque suenen así.
// En forma sin acentos: se aplica sobre la clave ya normalizada.
const NO_PREGUNTA = /^(que rico|que lindo|que hermoso|que bueno|que genial|que divino|me encanta|que belleza)/;

function sinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Clave canónica: solo ortografía. '¿Hacen envíos?' == 'hacen envios'.
function normalizeQuestion(text) {
  return sinAcentos(String(text || '').toLowerCase())
    .replace(/[¿?¡!.,;:"“”«»'()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function primeraPalabra(clave) {
  return clave.split(' ')[0] || '';
}

// ¿Es una pregunta? '?' manda; si no, inicio interrogativo o verbo.
function isQuestion(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.includes('?')) return true;
  const clave = normalizeQuestion(raw);
  if (!clave || clave.length < 3) return false;
  if (NO_PREGUNTA.test(clave)) return false;
  const p = primeraPalabra(clave);
  if (INTERROGATIVAS.includes(p)) return true;
  if (VERBOS_PREGUNTA.includes(p)) return true;
  // 'por qué ...' sin '?' ya entra por INTERROGATIVAS ('por').
  if (p === 'por' && /^por que\b/.test(clave)) return true;
  return false;
}

// groupQuestions(comentarios) → [grupos] ordenados por veces desc.
// comentarios: [{ username, text }] (el bundle real de IG).
// Cada grupo: { clave, pregunta, veces, autores[], ejemplos[] }.
// 'pregunta' = la variante verbatim más frecuente (empate: primera vista).
function groupQuestions(comentarios) {
  const grupos = new Map();
  const lista = Array.isArray(comentarios) ? comentarios : [];
  for (const c of lista) {
    if (!c) continue;
    const text = String(c.text || '').trim();
    if (!text || !isQuestion(text)) continue;
    const clave = normalizeQuestion(text);
    if (!clave) continue;
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, variantes: new Map(), autores: new Set(), ejemplos: [], veces: 0 };
      grupos.set(clave, g);
    }
    g.veces += 1;
    const autor = String(c.username || '').trim().toLowerCase() || 'sin-nombre';
    g.autores.add(autor);
    g.variantes.set(text, (g.variantes.get(text) || 0) + 1);
    if (g.ejemplos.length < MAX_EJEMPLOS && !g.ejemplos.includes(text)) g.ejemplos.push(text);
  }
  const out = [];
  for (const g of grupos.values()) {
    if (g.veces < UMBRAL_VECES) continue;
    if (g.autores.size < MIN_AUTORES) continue;
    let pregunta = g.ejemplos[0];
    let mejor = -1;
    for (const [v, n] of g.variantes) {
      if (n > mejor) { mejor = n; pregunta = v; }
    }
    out.push({
      clave: g.clave,
      pregunta,
      veces: g.veces,
      autores: [...g.autores].sort(),
      ejemplos: g.ejemplos,
    });
  }
  out.sort((a, b) => (b.veces - a.veces) || a.clave.localeCompare(b.clave));
  return out;
}

// buildPropuestas(grupos, clavesExistentes) → [propuestas].
// Una propuesta por grupo; se saltean las claves ya pendientes en la
// cola (la deduplicación vive en el llamador: la Bandeja pendiente).
// Estado SIEMPRE 'pendiente': nada acá aprueba ni publica nada.
function buildPropuestas(grupos, clavesExistentes) {
  const ya = new Set(Array.isArray(clavesExistentes) ? clavesExistentes : []);
  const out = [];
  for (const g of (Array.isArray(grupos) ? grupos : [])) {
    if (!g || !g.clave) continue;
    if (ya.has(g.clave)) continue;
    out.push({
      clave: g.clave,
      pregunta: g.pregunta,
      veces: g.veces,
      autores: g.autores || [],
      ejemplos: g.ejemplos || [],
      estado: 'pendiente',
      origen: 'comentarios_ig',
      creado_en: new Date().toISOString(),
    });
    if (out.length >= MAX_PROPUESTAS) break;
  }
  return out;
}

// propuestasDesdeComentarios(comentarios, clavesExistentes)
// → { grupos, propuestas }: atajo para la captura (mine-comments).
function propuestasDesdeComentarios(comentarios, clavesExistentes) {
  const grupos = groupQuestions(comentarios);
  return { grupos, propuestas: buildPropuestas(grupos, clavesExistentes) };
}

// itemBandejaPara(propuesta) → el ítem que va a oficina.crearBandejaItem.
// push:false: un lote de propuestas no genera una ráfaga de pushes; la
// cola se ve en la Bandeja. La propuesta NO inventa la respuesta: la
// pone el dueño en la nota al aceptar (ver efectoDecisionPregunta).
function itemBandejaPara(p) {
  const ejemplos = (p.ejemplos || []).slice(0, MAX_EJEMPLOS)
    .map(e => `«${e}»`).join(' · ');
  return {
    poder: 'posty',
    que: `Posteo que responde: «${p.pregunta}» — la preguntaron ${p.veces} veces`,
    propuesta:
      `Pregunta real de tus clientes (×${p.veces}, ${Array.isArray(p.autores) ? p.autores.length : 0} personas): «${p.pregunta}»\n` +
      (ejemplos ? `Así la escribieron: ${ejemplos}\n` : '') +
      `Al aceptar, escribí la respuesta en la nota: Posty no inventa respuestas. ` +
      `Si aceptás sin nota, la propuesta queda registrada con respuesta pendiente y NO se crea ningún posteo.`,
    contexto: {
      tipo: TIPO_BANDEJA,
      clave: p.clave,
      pregunta: p.pregunta,
      veces: p.veces,
      autores: p.autores || [],
      ejemplos: p.ejemplos || [],
      origen: 'comentarios_ig',
    },
    push: false,
  };
}

// efectoDecisionPregunta(item, accion) → el registro que el hook de
// Posty escribe en el río al resolver la propuesta. PURO y SIN EFECTO
// DE PUBLICACIÓN: no crea posteos, no programa, no publica. La
// conversión a borrador la hace el generador semanal (pendiente del
// turno del push) con imagen del fundamento, no acá.
function efectoDecisionPregunta(item, accion) {
  const ctx = (item && item.contexto) || {};
  const nota = String((item && item.nota_dueno) || '').trim();
  if (accion === 'aceptar') {
    return {
      tipo: 'pregunta_aceptada',
      resumen: nota
        ? `Pregunta aceptada: «${ctx.pregunta || ''}» — respuesta del dueño: ${nota.slice(0, 200)}`
        : `Pregunta aceptada: «${ctx.pregunta || ''}» — respuesta_pendiente (el dueño no dejó nota; no se creó ningún posteo)`,
      estado: 'aceptada',
    };
  }
  return {
    tipo: 'pregunta_cambio',
    resumen: `El dueño pidió un cambio en la propuesta: «${ctx.pregunta || ''}»${nota ? ` — nota: ${nota.slice(0, 200)}` : ''}`,
    estado: 'cambio_pedido',
  };
}

module.exports = {
  UMBRAL_VECES, MIN_AUTORES, MAX_PROPUESTAS, TIPO_BANDEJA,
  normalizeQuestion, isQuestion, groupQuestions, buildPropuestas,
  propuestasDesdeComentarios, itemBandejaPara, efectoDecisionPregunta,
};
