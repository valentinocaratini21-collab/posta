'use strict';
/* =====================================================================
 * reel-effects.js — EFECTOS VISUALES POR PROMPT (Motion v3, pulido
 * 2026-10-20, pedido directo de Valentino: "los efectos tienen que
 * ser DE PROMPTS, más efectos visuales, que quede más profesional").
 *
 * Cada efecto es un PROMPT de dirección de arte (texto, como los
 * presets de posteos): describe el tratamiento visual de la escena
 * en lenguaje de director de fotografía. El prompt GOBIERNA la
 * escena: el motor lo realiza con parámetros concretos de ffmpeg
 * (grado de color, barrido de luz, partículas, glow) declarados en
 * `realize`. El prompt elegido queda REGISTRADO por escena en el
 * resultado del render (trazabilidad, igual que los presets).
 *
 * Selección determinista por puntaje: intención del guion (3) +
 * rubro del negocio (3) + mood musical (1); el empate lo rompe el
 * orden del catálogo, que pone los prompts de RUBRO (más específicos
 * al cliente) antes que los de intención genérica. Sin match → el
 * efecto neutro (la foto manda; jamás un efecto inventado que
 * ensucie el producto del cliente).
 *
 * Reglas de la casa que ningún prompt puede violar:
 * - El efecto NUNCA tapa el producto ni el sujeto: overlays con
 *   alfa bajo (≤0.22) y barridos que pasan, no se quedan.
 * - El efecto NUNCA compite con los subtítulos: vive en la escena,
 *   debajo de las bandas de texto, y los barridos se limitan al
 *   gancho y a la primera solución (contención = profesional).
 * - El grado es sutil y consistente en TODO el reel: un solo
 *   prompt por reel, aplicado a todas las escenas.
 * ===================================================================== */

const EFFECT_PROMPTS = [
  {
    id: 'polvo-dorado-contraluz',
    rubros: ['belleza', 'peluqueria'],
    moods: ['chill'],
    prompt: 'Polvo dorado flotando en contraluz cálido, como el aire de un salón a última hora de la tarde. Atmósfera premium y calma: las partículas apenas se insinúan sobre la luz, nunca sobre el rostro ni el trabajo.',
    realize: {
      grade: ['colorbalance=rs=0.05:gs=0.02:bs=-0.05', 'eq=saturation=1.04', 'vignette=angle=PI/5'],
      overlay: { kind: 'particles', opacity: 0.50, scenes: 'all' },
    },
  },
  {
    id: 'vineta-calida-cafe',
    rubros: ['cafeteria', 'panaderia'],
    moods: ['chill'],
    prompt: 'Viñeta cálida de café de especialidad: bordes tostados que abrazan el cuadro, centro luminoso sobre la taza, y una luz de ventana que pasa lenta. Todo huele a recién hecho.',
    realize: {
      grade: ['colorbalance=rs=0.06:gs=0.02:bs=-0.07', 'eq=saturation=1.04:contrast=1.02', 'vignette=angle=PI/5'],
      overlay: { kind: 'sweep', opacity: 0.10, dur: 2.2, scaleW: 1500, scenes: ['hook', 'solution-first'] },
    },
  },
  {
    id: 'glow-neon-fitness',
    rubros: ['fitness'],
    moods: ['upbeat', 'groove'],
    prompt: 'Glow de neón sutil sobre el movimiento, como el reflejo de los tubos de luz del gimnasio a la noche. Saturación con energía y bordes con halo apenas perceptible: potencia sin perder limpieza.',
    realize: {
      grade: ['eq=saturation=1.22:contrast=1.06', 'vignette=angle=PI/4.5'],
      glow: 0.12,
      overlay: null,
    },
  },
  {
    id: 'brillo-gastro',
    rubros: ['gastronomia', 'pizzeria', 'heladeria'],
    prompt: 'Brillo gastronómico de foto editorial: micro-contraste que despierta texturas (la costra, la crema, el vapor) y una luz que pasa como reflejo de vitrina. Apetitoso, jamás grasoso.',
    realize: {
      grade: ['unsharp=5:5:0.35', 'eq=saturation=1.08:contrast=1.03'],
      overlay: { kind: 'sweep', opacity: 0.12, dur: 1.8, scaleW: 1400, scenes: ['hook', 'solution-first'] },
    },
  },
  {
    id: 'barrido-luz-vidriera',
    intents: ['venta'],
    prompt: 'Un barrido de luz suave y cálido cruza el producto en diagonal, como el sol de la mañana entrando por la vidriera del local. Brillo editorial de campaña: ilumina, no tapa; el producto sigue siendo el protagonista.',
    realize: {
      grade: ['eq=saturation=1.05:contrast=1.02'],
      overlay: { kind: 'sweep', opacity: 0.16, dur: 1.7, scaleW: 1300, scenes: ['hook', 'solution-first'] },
    },
  },
  {
    id: 'destello-apertura',
    intents: ['prueba'],
    prompt: 'Un destello breve y fino recorre el encuadre al abrir la escena, como el brillo de un lente pulido. Energía de lanzamiento: rápido, elegante, sin quedarse.',
    realize: {
      grade: ['eq=saturation=1.06:contrast=1.02'],
      overlay: { kind: 'sweep', opacity: 0.20, dur: 0.9, scaleW: 1050, scenes: ['hook', 'solution-first'] },
    },
  },
  {
    id: 'sobrio-editorial',
    intents: ['autoridad'],
    prompt: 'Tratamiento sobrio de editorial impresa: contraste medido, color apenas contenido y una viñeta neutra que ordena el cuadro. La autoridad no grita: se nota en la contención.',
    realize: {
      grade: ['eq=saturation=0.94:contrast=1.03', 'vignette=angle=PI/4.5'],
      overlay: null,
    },
  },
  {
    id: 'respiro-limpio',
    intents: ['consulta'],
    prompt: 'Respiro limpio: un toque de luz y nada más. La escena respira abierta y clara, como una conversación sin apuro; el efecto correcto es casi no tener efecto.',
    realize: {
      grade: ['eq=brightness=0.015:saturation=1.02'],
      overlay: null,
    },
  },
  {
    id: 'polvo-contraluz-reserva',
    intents: ['reserva'],
    moods: ['chill'],
    prompt: 'Contraluz suave con polvo de luz flotando, ambiente de cita cuidada: el salón, el estudio o el consultorio en su mejor hora. La reserva se siente un placer antes de hacerse.',
    realize: {
      grade: ['colorbalance=rs=0.04:gs=0.01:bs=-0.04', 'eq=saturation=1.03', 'vignette=angle=PI/5'],
      overlay: { kind: 'particles', opacity: 0.42, scenes: 'all' },
    },
  },
  {
    id: 'neutro-limpio',
    prompt: 'Tratamiento limpio sin efecto dominante: la foto del cliente manda, con el acabado base de la casa (luz pareja, color fiel). Cuando ningún prompt describe la escena, el profesionalismo es no inventar uno.',
    realize: { grade: [], overlay: null },
  },
];

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/* Puntaje de afinidad de un efecto con el contexto del reel. */
function scoreEffect(fx, ctx) {
  let s = 0;
  if (fx.intents && ctx.intent && fx.intents.includes(ctx.intent)) s += 3;
  if (fx.rubros && ctx.rubro && fx.rubros.map(normalize).includes(normalize(ctx.rubro))) s += 3;
  if (fx.moods && ctx.mood && fx.moods.includes(ctx.mood)) s += 1;
  return s;
}

/* Elige EL prompt del reel (uno solo: consistencia de grado).
 * Determinista: mayor puntaje; empate → orden del catálogo. */
function pickEffect(ctx = {}) {
  let best = null, bestScore = 0;
  for (const fx of EFFECT_PROMPTS) {
    if (fx.id === 'neutro-limpio') continue;
    const s = scoreEffect(fx, ctx);
    if (s > bestScore) { best = fx; bestScore = s; }
  }
  return best || EFFECT_PROMPTS[EFFECT_PROMPTS.length - 1];
}

/* Plan de efectos por escena: el grado (y el glow) van en TODAS las
 * escenas; el overlay se contiene (barrido solo en gancho y primera
 * solución; partículas ambientales en todas, son atmósfera). */
function effectsForReel({ intent, mood, rubro, scenes } = {}) {
  const fx = pickEffect({ intent, mood, rubro });
  const roles = (scenes || []).map(s => (s && s.role) || '');
  let solutionSeen = false;
  const perScene = roles.map((role) => {
    let overlay = null;
    const ov = fx.realize.overlay;
    if (ov) {
      if (ov.scenes === 'all') overlay = ov;
      else if (Array.isArray(ov.scenes)) {
        if (ov.scenes.includes(role)) overlay = ov;
        if (role === 'solution') {
          if (!solutionSeen && ov.scenes.includes('solution-first')) overlay = ov;
          solutionSeen = true;
        }
      }
    }
    return {
      effectId: fx.id, prompt: fx.prompt,
      grade: fx.realize.grade || [], glow: fx.realize.glow || 0,
      overlay: overlay ? { kind: overlay.kind, opacity: overlay.opacity, dur: overlay.dur || 0, scaleW: overlay.scaleW || 1300 } : null,
    };
  });
  return { effect: fx, perScene };
}

module.exports = { EFFECT_PROMPTS, pickEffect, effectsForReel, scoreEffect };
