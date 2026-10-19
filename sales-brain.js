'use strict';
/* =====================================================================
 * sales-brain.js — CEREBRO COMERCIAL (v232, 2026-10-18)
 * Doctrina de Valentino: "los posteos tienen que estar muy bien pensado
 * qué poner dentro del posteo; entender el producto y saber qué decir
 * para vender más; Posty tiene que ser el mejor en eso".
 *
 * Cada pieza nace con tres decisiones DECLARADAS y trazables:
 *   · INTENCIÓN de venta: venta / reserva / consulta / prueba / autoridad
 *     (qué tiene que LOGRAR la pieza, no solo de qué habla).
 *   · ÁNGULO: cómo vende — dolor→solución, antes/después,
 *     objeción→respuesta, número concreto, escasez real, detrás de
 *     escena, comparación honesta, estrella, directo.
 *   · PRUEBA: el dato real del negocio que sostiene la pieza (producto
 *     + precio, la evidencia de su estrella, sus años/barrio). Sin
 *     prueba ni proposición concreta, una pieza de venta/reserva NO
 *     vende humo: se degrada a autoridad.
 *
 * Las tres salen por REGLAS desde el client_digest (v229/v230): si el
 * negocio toma reservas, la semana empuja reservas; si hay estrella
 * inferida, la venta se ancla a ella; la escasez y los números SOLO
 * existen si están en el digest (el mismo candado de verdad de
 * promoNumberGuard). El rendimiento medido realimenta: los ángulos que
 * más rinden EN ESTE negocio se prefieren la semana siguiente, con
 * tope de rotación (máx 2 piezas del mismo ángulo, salvo que sea el
 * único ángulo probado).
 *
 * Módulo PURO (sin DB, sin red, sin IA): el pipeline le pasa ideas +
 * digest + señales y recibe las ideas con `_sales` adjunto. La
 * taxonomía kind→intención vive en clean-pieces (SALES_INTENT_BY_KIND)
 * y las cuotas extienden el mecanismo de canje ventana/buffer de
 * rebalanceIntentPicks (v231): primero el mix grueso anti-degeneración,
 * después estas cuotas finas que salen del digest.
 * ===================================================================== */
const cleanPieces = require('./clean-pieces');
// client-digest se requiere PEREZOSO (adentro de las funciones): es el
// módulo que llama a annotateTopic desde deriveTopics y un require
// cruzado en caliente podría ver exportaciones a medio cargar.
const cd = () => require('./client-digest');

const SALES_INTENTS = ['venta', 'reserva', 'consulta', 'prueba', 'autoridad'];
const SALES_ANGLES = ['dolor', 'antes-despues', 'objecion', 'numero', 'escasez', 'detras', 'comparacion', 'estrella', 'directo'];

// ---------- escasez REAL: solo con dato del digest ----------
// "Por tiempo limitado" a secas NO es evidencia: la escasez exige un
// dato concreto declarado por el negocio (stock con número, un plazo
// con día/fecha, cupos). Sin ese dato, fabricar urgencia está prohibido.
const SCARCITY_RES = [
  /quedan\s+\d+/i,
  /\d+\s*(cupos|lugares|turnos|unidades|pares|platos|entradas|mesas)/i,
  /[uú]ltim[oa]s?\s+\d+/i,
  /hasta\s+(el\s+|la\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}([\/-]\d{1,2})?)/i,
  /solo\s+(hoy|ma[ñn]ana|esta\s+semana|por\s+\d+\s*d[ií]as)/i,
];
function scarcityEvidenceFor(promo) {
  if (!promo || typeof promo !== 'object') return '';
  for (const f of ['titulo', 'nombre', 'detalle', 'vigencia', 'fin']) {
    const t = String(promo[f] || '');
    for (const re of SCARCITY_RES) { const m = t.match(re); if (m) return m[0]; }
  }
  const st = promo.stock;
  if (st != null && String(st).trim() !== '' && Number.isFinite(Number(st))) return `quedan ${Number(st)}`;
  return '';
}

// Objeciones TÍPICAS del rubro, formuladas como la pregunta del cliente
// (no afirman NINGÚN dato del negocio): el ángulo objeción→respuesta
// las usa solo cuando no hay objeciones reales minadas de sus
// comentarios/DMs (que siempre mandan: son SU público hablando).
const RUBRO_OBJECTIONS = {
  gastronomia: '¿No es caro para lo que es?',
  cafeteria: '¿No es caro para un café?',
  bar: '¿No es caro para salir?',
  belleza: '¿Cuánto dura? ¿Hay que mantenerlo seguido?',
  barberia: '¿Cuánto sale y cada cuánto hay que retocarlo?',
  fitness: '¿Y si empiezo y a la semana dejo?',
  salud: '¿Cuánto tarda conseguir turno?',
  dental: '¿Duele? ¿Cuánto sale el tratamiento?',
  mascotas: '¿Es seguro para mi mascota?',
  moda: '¿Tienen mi talle? ¿Se puede cambiar?',
  hogar: '¿Cuánto tarda y cuánto sale el presupuesto?',
  deco: '¿Queda bien en mi espacio? ¿Cómo lo sé antes?',
  flores: '¿Llega fresco y a tiempo?',
  tecnologia: '¿Tiene garantía?',
  autos: '¿Cuánto tarda y cuánto sale?',
  educacion: '¿Y si no me sirve, puedo dejar?',
  turismo: '¿Qué pasa si tengo que cambiar la fecha?',
  joyeria: '¿Es auténtico? ¿Tiene garantía?',
  profesionales: '¿Cuánto cuesta la primera consulta?',
  servicios: '¿Cuánto tarda y cuánto sale?',
  otro: '¿Vale lo que cuesta?',
};

// ---------- señales del digest ----------
function itemName(x) { return String((x && (x.nombre || x.titulo)) || x || '').replace(/\s+/g, ' ').trim(); }

function digestSignals(digest, opts = {}) {
  const d = (digest && typeof digest === 'object') ? digest : {};
  const products = (d.productos || []).map(itemName).filter((s) => s.length >= 3);
  const services = (d.servicios || []).map(itemName).filter((s) => s.length >= 3);
  const priceByItem = new Map();
  const notePrice = (x) => {
    if (!x || typeof x !== 'object') return;
    const n = itemName(x);
    const p = String(x.precio || '').trim();
    if (n && p) priceByItem.set(cd().norm(n), p);
  };
  for (const x of [...(d.productos || []), ...(d.servicios || [])]) notePrice(x);
  if (d.catalog && Array.isArray(d.catalog.items)) for (const x of d.catalog.items) notePrice(x);
  const promos = (d.promos || []).map((p) => ({
    titulo: itemName(p),
    precio: String((p && p.precio) || '').trim(),
    scarcity: scarcityEvidenceFor(p),
  })).filter((p) => p.titulo.length >= 3);
  for (const p of promos) if (p.precio) priceByItem.set(cd().norm(p.titulo), p.precio);
  const star = (d.inferred_star && d.inferred_star.item && (d.inferred_star.confidence || 0) >= 0.5)
    ? { item: String(d.inferred_star.item), evidence: (Array.isArray(d.inferred_star.evidence) ? d.inferred_star.evidence : []).map(String) }
    : null;
  // Evidencia disponible para piezas de PRUEBA: la de su estrella, sus
  // años (del diferencial) y su barrio/ciudad. Todo leído, nada inventado.
  const proofEvidence = [];
  if (star) for (const e of star.evidence) proofEvidence.push(`${star.item}: ${e}`);
  const dif = String(d.diferencial || '').replace(/\s+/g, ' ').trim();
  const yearsM = dif.match(/desde\s+(?:el\s+)?(?:19|20)\d{2}/i) || dif.match(/\d+\s*a[ñn]os/i);
  if (yearsM) proofEvidence.push(yearsM[0]);
  if (d.ciudad) proofEvidence.push(`en ${String(d.ciudad).trim()}`);
  let numbers = new Set();
  try { numbers = cd().digestNumbers(d); } catch (e) {}
  return {
    hasBooking: !!d.has_booking,
    category: String(d.category || ''),
    products, services, promos, star, priceByItem,
    diferencial: dif, ciudad: String(d.ciudad || ''),
    feedThemes: (d.temas_feed || []).map(String).filter(Boolean),
    proofEvidence,
    objections: (Array.isArray(opts.objections) ? opts.objections : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5),
    numbers,
  };
}

function priceOf(name, signals) {
  if (!name) return '';
  return signals.priceByItem.get(cd().norm(name)) || '';
}

/* ¿El texto de la idea nombra un ítem REAL del digest? Devuelve el
 * ítem (estrella primero, después promos, productos y servicios) o ''.
 * Es el mismo chequeo de anclas del fundamento: una coincidencia de
 * palabra distintiva alcanza, una genérica de rubro no. */
function matchItem(text, signals) {
  const t = String(text || '');
  if (!t.trim()) return '';
  const candidates = [];
  if (signals.star) candidates.push(signals.star.item);
  for (const p of signals.promos) candidates.push(p.titulo);
  candidates.push(...signals.products, ...signals.services);
  for (const name of candidates) {
    if (!name) continue;
    try { if (cd().pieceAnchored(t, cd().anchorsFromTexts([name])).ok) return name; } catch (e) {}
  }
  return '';
}
function matchedPromo(text, signals) {
  const t = String(text || '');
  for (const p of signals.promos) {
    try { if (cd().pieceAnchored(t, cd().anchorsFromTexts([p.titulo])).ok) return p; } catch (e) {}
  }
  return null;
}

// ---------- intención base por idea ----------
function baseSalesIntent(idea, signals) {
  const tipo = String((idea && idea.tipo) || '').toLowerCase();
  const text = `${(idea && idea.titulo) || ''} ${(idea && idea.angulo) || ''}`;
  const item = matchItem(text, signals);
  if (tipo === 'detras') {
    // Detrás de escena = mostrar el trabajo real: es PRUEBA si habla de
    // un servicio/producto real; si no, autoridad (humaniza, no vende).
    return { intent: item ? 'prueba' : 'autoridad', item };
  }
  const kind = cleanPieces.kindOfTipo(tipo);
  switch (kind) {
    case 'promo':
    case 'sorteo':
      return { intent: 'venta', item };
    case 'reserva':
      if (signals.hasBooking) return { intent: 'reserva', item };
      return { intent: signals.services.length ? 'consulta' : 'venta', item };
    case 'tip':
      return { intent: 'autoridad', item };
    case 'novedad':
      return item ? { intent: 'venta', item } : { intent: 'autoridad', item: '' };
    case 'social':
    default:
      return { intent: (signals.proofEvidence.length || signals.star) ? 'prueba' : 'autoridad', item };
  }
}

// ---------- cuotas de la semana, desde el digest ----------
/* Cuántas piezas de cada intención pide ESTE negocio esta semana:
 * · toma reservas ⇒ la semana empuja reservas (~40%, 1–3 piezas);
 * · tiene estrella/productos/promos ⇒ venta declarada (~30%, ≥1);
 * · hay evidencia real ⇒ 1 pieza de prueba;
 * · servicios sin reservas ⇒ 1 de consulta (la acción es el mensaje);
 * · autoridad completa — y en semanas de 4+, nunca desaparece. */
function salesQuotas(signals, n) {
  const q = { venta: 0, reserva: 0, consulta: 0, prueba: 0, autoridad: 0 };
  const total = Math.max(0, parseInt(n, 10) || 0);
  if (!total) return q;
  if (signals.hasBooking) q.reserva = Math.min(3, Math.max(1, Math.round(total * 0.4)));
  const sellable = !!(signals.star || signals.products.length || signals.promos.length);
  if (sellable) q.venta = Math.max(1, Math.round(total * 0.3));
  if (signals.proofEvidence.length || signals.star) q.prueba = 1;
  if (signals.services.length && !signals.hasBooking) q.consulta = 1;
  let used = q.reserva + q.venta + q.prueba + q.consulta;
  if (used > total) {
    // Semana corta: manda reserva, después venta, después prueba.
    for (const k of ['consulta', 'prueba', 'venta']) {
      while (used > total && q[k] > 0) { q[k]--; used--; }
    }
  }
  q.autoridad = Math.max(0, total - used);
  if (total >= 4 && q.autoridad === 0 && q.venta > 1) { q.venta--; q.autoridad = 1; }
  return q;
}

// ---------- ángulos: elegibilidad y elección ----------
function eligibleAngles(intent, ctx, signals) {
  const out = [];
  const push = (a) => { if (!out.includes(a)) out.push(a); };
  const promo = ctx.promo || null;
  if (intent === 'venta') {
    if (ctx.item && priceOf(ctx.item, signals)) push('numero');
    if (promo && promo.scarcity) push('escasez');
    if (ctx.item && signals.star && cd().norm(ctx.item) === cd().norm(signals.star.item)) push('estrella');
    push('dolor'); push('directo');
  } else if (intent === 'reserva') {
    if (promo && promo.scarcity) push('escasez');
    push('dolor'); push('directo');
  } else if (intent === 'consulta') {
    push('objecion'); push('dolor'); push('directo');
  } else if (intent === 'prueba') {
    if (signals.star) push('estrella');
    push('detras');
    if (signals.diferencial) push('antes-despues');
    push('directo');
  } else { // autoridad
    push('dolor'); push('objecion'); push('detras');
    if (signals.diferencial) push('comparacion');
    push('directo');
  }
  return out;
}
/* scores: {angulo: ratio} del rendimiento medido de ESTE negocio
 * (>0 = probado). Se prefiere el ángulo ganador entre los elegibles,
 * con tope de rotación: máx 2 piezas del mismo ángulo por semana,
 * SALVO que sea el único ángulo probado del negocio. */
function chooseAngle(intent, ctx, signals, state) {
  const elig = eligibleAngles(intent, ctx, signals);
  const scores = state.scores || {};
  const proven = Object.keys(scores).filter((a) => Number(scores[a]) > 0);
  const sorted = elig.slice().sort((a, b) => (Number(scores[b]) || 0) - (Number(scores[a]) || 0));
  for (const a of sorted) {
    const c = state.counts[a] || 0;
    if (c >= 2 && !(proven.length === 1 && proven[0] === a)) continue;
    return a;
  }
  return sorted[0] || 'directo';
}

// ---------- prueba de la pieza ----------
/* La proposición concreta que sostiene la pieza. Vacío = la pieza no
 * puede vender (y se degrada). Autoridad no exige prueba: enseña. */
function proofFor(intent, ctx, signals) {
  const item = ctx.item || '';
  if (intent === 'venta') {
    if (!item) return '';
    const parts = [item];
    const price = priceOf(item, signals) || (ctx.promo && ctx.promo.precio) || '';
    if (price) parts.push(`a ${price}`);
    if (signals.star && cd().norm(item) === cd().norm(signals.star.item) && signals.star.evidence.length) {
      parts.push(`(${signals.star.evidence[0]})`);
    } else if (!price && signals.diferencial) {
      parts.push(`— ${signals.diferencial.slice(0, 80)}`);
    }
    return parts.join(' ');
  }
  if (intent === 'reserva') return item || signals.services[0] || '';
  if (intent === 'consulta') return item || signals.services[0] || signals.products[0] || '';
  if (intent === 'prueba') return signals.proofEvidence.join(' · ');
  return '';
}

/* Plan de UNA idea (sin rotación de ángulos: eso lo hace la pasada
 * semanal; acá ángulo = primer elegible). Incluye la DEGRADACIÓN: una
 * pieza venta/reserva/consulta/prueba sin prueba no finge. */
function planOne(idea, signals) {
  const base = baseSalesIntent(idea, signals);
  const text = `${(idea && idea.titulo) || ''} ${(idea && idea.angulo) || ''}`;
  const ctx = { item: base.item, promo: matchedPromo(text, signals) };
  let intent = base.intent;
  let proof = proofFor(intent, ctx, signals);
  let degraded = false;
  if (intent !== 'autoridad' && !proof) {
    intent = 'autoridad';
    degraded = true;
    proof = '';
  }
  const angle = eligibleAngles(intent, ctx, signals)[0] || 'directo';
  return { intent, angle, proof, item: ctx.item, degraded };
}

// ---------- planificación semanal (clientes) ----------
/* planSalesWeek(picks, deficit, digest, opts) — extiende el canje de
 * rebalanceIntentPicks: la ventana son los primeros `deficit` picks y
 * el buffer el resto. Asigna a TODOS los picks su `_sales` (el buffer
 * también se consume si un slot falla) y corrige la ventana para
 * cumplir las cuotas del digest canjeando/reconvirtiendo picks sin IA
 * extra. opts: { angleScores: {angulo: ratio}, objections: [string] }. */
function planSalesWeek(picks, deficit, digest, opts = {}) {
  const list = (Array.isArray(picks) ? picks : []).slice();
  const n = Math.min(Math.max(parseInt(deficit, 10) || 0, 0), list.length);
  const signals = digestSignals(digest, opts);
  const quotas = salesQuotas(signals, n);
  const plans = list.map((idea) => {
    const text = `${(idea && idea.titulo) || ''} ${(idea && idea.angulo) || ''}`;
    const base = baseSalesIntent(idea, signals);
    return { idea, intent: base.intent, item: base.item, promo: matchedPromo(text, signals), degraded: false, proof: '' };
  });
  const canTake = (p, intent) => {
    if (intent === 'autoridad') return true;
    if (intent === 'venta') return !!p.item;
    if (intent === 'reserva') return signals.hasBooking && (signals.services.length > 0 || !!p.item);
    if (intent === 'consulta') return signals.services.length > 0 || signals.products.length > 0;
    if (intent === 'prueba') return signals.proofEvidence.length > 0 || !!signals.star;
    return false;
  };
  const countWin = (intent) => plans.slice(0, n).filter((p) => p.intent === intent).length;
  let swapped = 0;
  if (n >= 2) {
    // 1) Cumplir los mínimos: reconvertir un pick flexible de la
    // ventana o canjearlo por uno del buffer que ya traiga la intención.
    for (const intent of ['reserva', 'venta', 'prueba', 'consulta']) {
      let guard = 0;
      while (countWin(intent) < quotas[intent] && guard++ < 8) {
        const flexIdx = plans.slice(0, n).findIndex((p) => p.intent !== intent
          && (p.intent === 'autoridad' || countWin(p.intent) > quotas[p.intent])
          && canTake(p, intent));
        if (flexIdx >= 0) { plans[flexIdx].intent = intent; continue; }
        const bi = plans.findIndex((p, ix) => ix >= n && p.intent === intent);
        if (bi < 0) break;
        const winIdx = plans.slice(0, n).findIndex((p) => p.intent === 'autoridad' || countWin(p.intent) > quotas[p.intent]);
        if (winIdx < 0) break;
        const tmp = plans[winIdx]; plans[winIdx] = plans[bi]; plans[bi] = tmp;
        swapped++;
      }
    }
    // 2) Exceso de venta sin ancla fuerte: lo que sobra de la cuota
    // (+1 de tolerancia) y no es estrella ni promo baja a autoridad.
    let excess = countWin('venta') - (quotas.venta + 1);
    for (let i = n - 1; i >= 0 && excess > 0; i--) {
      const p = plans[i];
      if (p.intent !== 'venta') continue;
      const strong = (signals.star && p.item && cd().norm(p.item) === cd().norm(signals.star.item)) || !!p.promo;
      if (strong) continue;
      p.intent = 'autoridad';
      excess--;
    }
  }
  // 3) Prueba y degradación; 4) ángulos con rotación y realimentación.
  const state = { scores: opts.angleScores || {}, counts: {} };
  plans.forEach((p) => {
    p.proof = proofFor(p.intent, p, signals);
    if (p.intent !== 'autoridad' && !p.proof) { p.intent = 'autoridad'; p.degraded = true; p.proof = ''; }
    p.angle = chooseAngle(p.intent, p, signals, state);
    state.counts[p.angle] = (state.counts[p.angle] || 0) + 1;
  });
  plans.forEach((p) => {
    p.idea._sales = { intent: p.intent, angle: p.angle, proof: p.proof, degraded: !!p.degraded };
  });
  const mix = { venta: 0, reserva: 0, consulta: 0, prueba: 0, autoridad: 0 };
  plans.slice(0, n).forEach((p) => { mix[p.intent]++; });
  return {
    picks: plans.map((p) => p.idea),
    swapped,
    stats: { quotas, mix, degraded: plans.slice(0, n).filter((p) => p.degraded).length },
  };
}

// ---------- prueba (trial): ventas sobre temas derivados ----------
/* trialTopicSales(topic, digest) — intención + ángulo + prueba para un
 * tema DERIVADO del digest (deriveTopics). Los temas derivados nacen
 * anclados a un ítem real por construcción, así que la venta tiene
 * prueba; los de RELLENO no pasan por acá: demo.js los capa a
 * autoridad (el relleno nunca vende lo que no conoce). */
function trialTopicSales(topic, digest) {
  const signals = digestSignals(digest);
  const kind = String((topic && topic.kind) || '');
  const anchor = String((topic && topic.digest_anchor) || '').trim();
  const ctx = { item: anchor, promo: matchedPromo(anchor, signals)
    || (kind === 'promo' ? (signals.promos[0] ? { ...signals.promos[0] } : null) : null) };
  const st = { scores: {}, counts: {} };
  if (kind === 'promo' || kind === 'novedad') {
    const intent = 'venta';
    return { intent, angle: chooseAngle(intent, ctx, signals, st), proof: proofFor(intent, ctx, signals) };
  }
  if (kind === 'reserva') {
    const intent = signals.hasBooking ? 'reserva' : 'venta';
    return { intent, angle: chooseAngle(intent, ctx, signals, st), proof: proofFor(intent, ctx, signals) };
  }
  if (kind === 'tip') {
    return { intent: 'autoridad', angle: 'dolor', proof: '' };
  }
  if (kind === 'social') {
    const proof = signals.proofEvidence.join(' · ') || (anchor ? `tema real de su feed: ${anchor}` : '');
    return { intent: 'prueba', angle: 'directo', proof };
  }
  return { intent: 'autoridad', angle: 'directo', proof: '' };
}

// ---------- realimentación: rendimiento por ángulo ----------
/* scoreAngles(rows) — rows: posteos publicados con métricas
 * [{angle, reach, likes, comments, saved}] (los datos que ya junta el
 * sistema de aprendizajes). Devuelve {angulo: ratio} con el mismo
 * encogimiento bayesiano que usa contentPerformanceLine para tipos
 * (C=5 posteos fantasma contra la media): un ángulo "probado" exige
 * ≥2 posteos medidos y la cuenta ≥4 medidos en total. ratio >1 = rinde
 * sobre el promedio de la cuenta. */
function scoreAngles(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && SALES_ANGLES.includes(r.angle));
  const er = (r) => {
    const reach = Number(r.reach) || 0, likes = Number(r.likes) || 0;
    const comments = Number(r.comments) || 0, saved = Number(r.saved) || 0;
    return (likes + 2 * comments + 3 * saved) / Math.max(reach, 1);
  };
  const measured = list.filter((r) => ((Number(r.reach) || 0) + (Number(r.likes) || 0) + (Number(r.comments) || 0) + (Number(r.saved) || 0)) > 0);
  if (measured.length < 4) return {};
  const byAngle = new Map();
  for (const r of measured) {
    const a = byAngle.get(r.angle) || { erSum: 0, n: 0 };
    a.erSum += er(r); a.n++;
    byAngle.set(r.angle, a);
  }
  const totEr = measured.reduce((a, r) => a + er(r), 0);
  const mean = totEr / measured.length;
  if (!(mean > 0)) return {};
  const C = 5;
  const out = {};
  for (const [angle, a] of byAngle) {
    if (a.n < 2) continue;
    const avg = a.erSum / a.n;
    const shrunk = (C * mean + a.n * avg) / (C + a.n);
    out[angle] = Math.round((shrunk / mean) * 100) / 100;
  }
  return out;
}

module.exports = {
  SALES_INTENTS, SALES_ANGLES, RUBRO_OBJECTIONS,
  scarcityEvidenceFor, digestSignals, priceOf, matchItem, matchedPromo,
  baseSalesIntent, salesQuotas, eligibleAngles, chooseAngle, proofFor,
  planOne, planSalesWeek, trialTopicSales, scoreAngles,
};
