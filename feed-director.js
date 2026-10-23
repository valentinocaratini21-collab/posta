// feed-director.js — DIRECCIÓN DE FEED (2026-10-22, v332, mandato de
// Valentino): "todo lo que estás aprendiendo con el feed de Posty,
// utilizalo para los feeds de nuestros clientes; tenemos que ser expertos
// en que el feed quede excelente y que combine".
//
// Lógica PURA (como grid-pattern.js): acá no hay DB, ni disco, ni red.
// Recibe las estadísticas tonales YA MEDIDAS de los posteos recientes
// reales del cliente y de las piezas candidatas de la semana (grid-stats.py:
// luminancia media, saturación, familia de tono — números, nunca a ojo) y
// compone la semana como UNA pieza contra esa grilla real:
//
//   1. FAMILIA de cada pieza: placa-clara / escena-oscura / cálida / otra,
//      derivada de la medición (la paleta es la del feed DEL CLIENTE: sus
//      posteos recientes definen el registro, no la marca de Posty).
//   2. COMPOSICIÓN POR ORDEN: asigna el orden de publicación de la semana
//      cumpliendo las reglas duras de la línea (LINEA-DE-FEED.md):
//        - nunca 3 oscuras seguidas (contando la cabeza real del feed);
//        - nunca dos escenas casi idénticas pegadas;
//        - alternancia de roles protagonista / escena / placa;
//        - si el feed ya trae un patrón fuerte (grid-pattern.js, v224),
//          se respeta y se extiende; si no trae ninguno, se impone el ritmo.
//      Sin mover piezas ya programadas (fixed): esas son anclas.
//   3. COMPUERTA DE PORTADAS: la portada de un reel/video es la única
//      superficie que toca la grilla. Decide entre el frame natural, un
//      frame alternativo del mismo video o aplicar el GRADO a la portada
//      (el video jamás se toca) según la familia asignada en la composición.
//   4. VERIFICADOR mecánico (verifyComposition): afirma las reglas duras
//      sobre una secuencia ya compuesta — lo usan los tests y el propio
//      registro semanal para declarar, sin esconder, lo que no se pudo
//      reparar por orden (pieza marcada `fights`).
//
// El cableado (medición, frames, grado, persistencia, orden efectivo al
// programar) vive en server.js: composeWeekFeed + feed_compositions.
'use strict';

const gridPattern = require('./grid-pattern');

const WARM_HUES = ['rojo', 'naranja', 'amarillo', 'rosa'];
const FAMILY = { LIGHT: 'placa-clara', DARK: 'escena-oscura', WARM: 'calida', OTHER: 'otra' };

// Familia visual de una pieza desde su medición (la misma noción de tono
// de grid-pattern.toneOf: claro ≥0.60, oscuro ≤0.40). Lo CÁLIDO manda sobre
// el tono cuando el color es real y dominante: un café crema pelea con un
// feed frío por su temperatura, no por su luz (hallazgo del dogfood: el
// still del latte medía luminancia media y aun así rompía la grilla).
function familyOf(s) {
  if (!s || typeof s.lum !== 'number' || !Number.isFinite(s.lum)) return FAMILY.OTHER;
  const warm = WARM_HUES.includes(s.hueFam || '');
  const shareOk = typeof s.hueShare !== 'number' || s.hueShare >= 0.25;
  if (warm && (s.sat || 0) >= 0.25 && shareOk) return FAMILY.WARM;
  if (s.lum >= 0.60) return FAMILY.LIGHT;
  if (s.lum <= 0.40) return FAMILY.DARK;
  return FAMILY.OTHER;
}

// Banda tonal [min, max] de luminancia de cada familia (para la compuerta
// de portadas: distancia de un frame a la familia asignada).
function familyBand(fam) {
  if (fam === FAMILY.LIGHT) return [0.60, 1.0];
  if (fam === FAMILY.DARK) return [0.0, 0.40];
  if (fam === FAMILY.WARM) return [0.35, 0.75];
  return [0.35, 0.65];
}

// Rol rítmico de la pieza (protagonista / escena / placa) desde los datos
// que el pipeline ya persiste. Es la señal BLANDA de alternancia; las
// reglas duras corren por familia y similitud. Prioridad: marcador
// explícito (image_meta de la v330: el avatar/personaje ES el protagonista)
// > formato > tipo/intent del contenido.
function roleOf(p) {
  if (!p) return 'escena';
  if (p.role) return p.role;
  if (p.avatarProtagonist) return 'protagonista';
  const mt = String(p.media_type || 'image');
  if (mt === 'video' || mt === 'carousel') return 'escena';
  const tipo = String(p.tipo || '').toLowerCase();
  const intent = String(p.intent || '').toLowerCase();
  if (/placa|flyer|portada|texto/.test(tipo)) return 'placa';
  if (/social|testimonio|cliente|equipo|retrato/.test(tipo) || /social|comunidad|testimonio/.test(intent)) return 'protagonista';
  if (/producto|novedad|estrella|oferta/.test(tipo) || /producto|venta|reserva/.test(intent)) return 'protagonista';
  if (/detras|proceso|taller|ambiente|local/.test(tipo)) return 'escena';
  return 'escena';
}

// ¿Dos piezas son "escenas casi idénticas"? Misma familia, misma familia de
// tono (o ambas neutras), luminancia a ≤0.08, mismo formato y mismo tipo:
// pegadas se leen como la misma foto dos veces (el defecto B1/B3 del
// dogfood). Determinístico, desde la medición.
function nearIdentical(a, b) {
  if (!a || !b) return false;
  if (a.family !== b.family || a.family === FAMILY.OTHER) return false;
  const ha = a.hueFam || 'neutro', hb = b.hueFam || 'neutro';
  if (ha !== hb && !(ha === 'neutro' && hb === 'neutro')) return false;
  if (typeof a.lum === 'number' && typeof b.lum === 'number' && Math.abs(a.lum - b.lum) > 0.08) return false;
  if ((a.media_type || 'image') !== (b.media_type || 'image')) return false;
  const ta = String(a.tipo || ''), tb = String(b.tipo || '');
  if (ta && tb && ta !== tb) return false;
  return true;
}

// Enriquece piezas/tiles crudos con family + role (sin mutar la entrada).
function enrich(list) {
  return (Array.isArray(list) ? list : []).map((p) => Object.assign({}, p, {
    family: p.family || familyOf(p),
    role: p.role || roleOf(p),
  }));
}

// VERIFICADOR mecánico de las reglas duras sobre una secuencia en orden de
// LECTURA (del más nuevo al más viejo — como se ve la grilla). Devuelve
// [{ rule, at:[índices] }]. Lo comparten los tests y el registro semanal.
function verifyComposition(seq) {
  const s = enrich(seq);
  const out = [];
  for (let i = 0; i + 2 < s.length; i++) {
    if (s[i].family === FAMILY.DARK && s[i + 1].family === FAMILY.DARK && s[i + 2].family === FAMILY.DARK) {
      out.push({ rule: 'dark-run', at: [i, i + 1, i + 2] });
    }
  }
  for (let i = 0; i + 1 < s.length; i++) {
    if (nearIdentical(s[i], s[i + 1])) out.push({ rule: 'identical-adjacent', at: [i, i + 1] });
  }
  return out;
}

// Costo de una secuencia de lectura completa (semana compuesta + cabeza
// real del feed). Menor = mejor. Las violaciones que caen ENTERAS dentro
// del historial no se cobran: no son reparables ni atribuibles a la semana.
function scoreReading(reading, weekCount, ctx) {
  const s = reading;
  let score = 0;
  const inWeek = (i) => i < weekCount;
  for (let i = 0; i + 2 < s.length; i++) {
    if (s[i].family === FAMILY.DARK && s[i + 1].family === FAMILY.DARK && s[i + 2].family === FAMILY.DARK) {
      if (inWeek(i) || inWeek(i + 1) || inWeek(i + 2)) score += 100;
    }
  }
  for (let i = 0; i + 1 < s.length; i++) {
    if (!inWeek(i) && !inWeek(i + 1)) continue;
    if (nearIdentical(s[i], s[i + 1])) score += 80;
    if (s[i].role === s[i + 1].role) score += 4;
    if (s[i].family === FAMILY.WARM && s[i + 1].family === FAMILY.WARM) score += 10;
  }
  if (ctx && ctx.pattern && ctx.pattern.has) {
    for (let r = 0; r < weekCount; r++) {
      const finalPos = (ctx.ahead || 0) + r;
      const target = gridPattern.toneTargetForFinalPos(ctx.pattern, finalPos, (ctx.ahead || 0) + weekCount);
      if (!target || !target.tone) continue;
      const fam = s[r].family;
      if (target.tone === 'claro' && fam === FAMILY.DARK) score += 15;
      if (target.tone === 'oscuro' && fam === FAMILY.LIGHT) score += 15;
    }
  }
  return score;
}

function movesOf(order, n) {
  let m = 0;
  for (let i = 0; i < n; i++) if (order[i] !== i) m++;
  return m;
}

// composeOrder({ pieces, existing, pattern, ahead })
//   pieces:   piezas de la semana EN SU ORDEN DE PUBLICACIÓN ACTUAL
//             (índice = rango de publicación tentativo). Cada una puede
//             traer `fixed: true` (ya programada: su rango no se mueve).
//   existing: posteos recientes reales del cliente, del más nuevo al más
//             viejo (la cabeza contra la que la semana tiene que combinar).
//   pattern:  patrón de grid-pattern.detectPattern (o null).
//   ahead:    posteos comprometidos por encima de la grilla vieja que no
//             son de esta tanda (para los objetivos de posición del patrón).
// Devuelve { order, assignments, flags, remainingViolations, moves, score }
//   order: índices de pieces en el NUEVO orden de publicación (asc).
//   assignments[i]: { idx, family, role, why[] } de la pieza pieces[idx]
//             ya ubicada; flags: piezas que pelean más allá de lo reparable
//             por orden (quedan marcadas y registradas, nunca escondidas).
function composeOrder(input) {
  const piecesIn = enrich((input && input.pieces) || []);
  const existing = enrich((input && input.existing) || []);
  const pattern = (input && input.pattern) || null;
  const ahead = Math.max(0, (input && input.ahead) || 0);
  const n = piecesIn.length;
  const identity = piecesIn.map((_, i) => i);
  if (!n) return { order: [], assignments: [], flags: [], remainingViolations: [], moves: 0, score: 0 };

  const fixedAt = new Map(); // rango de publicación -> idx fijado
  piecesIn.forEach((p, i) => { if (p.fixed) fixedAt.set(i, i); });
  const freeSlots = identity.filter((i) => !fixedAt.has(i));
  const freeIdx = identity.filter((i) => !piecesIn[i].fixed);

  const readingOf = (order) => {
    const reading = order.slice().reverse().map((ix) => piecesIn[ix]);
    return reading.concat(existing);
  };
  const ctx = { pattern, ahead };
  const evaluate = (order) => {
    const reading = readingOf(order);
    return { score: scoreReading(reading, n, ctx) + movesOf(order, n) * 1, moves: movesOf(order, n), reading };
  };

  let best = null;
  const consider = (order) => {
    const ev = evaluate(order);
    const key = order.join(',');
    if (!best || ev.score < best.score
      || (ev.score === best.score && ev.moves < best.moves)
      || (ev.score === best.score && ev.moves === best.moves && key < best.key)) {
      best = { order: order.slice(), score: ev.score, moves: ev.moves, key, reading: ev.reading };
    }
  };

  if (freeIdx.length <= 8) {
    // Búsqueda exhaustiva sobre las piezas libres (las anclas quedan).
    const permute = (arr, l, out) => {
      if (l >= arr.length - 1) { out.push(arr.slice()); return; }
      for (let i = l; i < arr.length; i++) {
        const t = arr[l]; arr[l] = arr[i]; arr[i] = t;
        permute(arr, l + 1, out);
        const u = arr[l]; arr[l] = arr[i]; arr[i] = u;
      }
    };
    const perms = [];
    permute(freeIdx.slice(), 0, perms);
    for (const perm of perms) {
      const order = identity.slice();
      freeSlots.forEach((slot, k) => { order[slot] = perm[k]; });
      consider(order);
    }
  } else {
    // Descenso determinístico por swaps (semanas grandes: 9+ piezas).
    consider(identity);
    let current = best.order.slice();
    let currentScore = best.score;
    for (let iter = 0; iter < 60; iter++) {
      let improved = false;
      for (let a = 0; a < freeSlots.length && !improved; a++) {
        for (let b = a + 1; b < freeSlots.length && !improved; b++) {
          const cand = current.slice();
          const sa = freeSlots[a], sb = freeSlots[b];
          const t = cand[sa]; cand[sa] = cand[sb]; cand[sb] = t;
          const ev = evaluate(cand);
          const total = ev.score;
          if (total < currentScore || (total === currentScore && ev.moves < movesOf(current, n))) {
            current = cand; currentScore = total; improved = true;
            consider(cand);
          }
        }
      }
      if (!improved) break;
    }
  }

  const order = best.order;
  const reading = best.reading;

  // Violaciones que quedan pese al mejor orden, atribuidas por pieza.
  const violations = verifyComposition(reading).filter((v) => v.at.some((i) => i < n));
  const flagByIdx = new Map();
  const noteFlag = (ix, reason) => {
    if (!flagByIdx.has(ix)) flagByIdx.set(ix, { idx: ix, reasons: [] });
    flagByIdx.get(ix).reasons.push(reason);
  };
  for (const v of violations) {
    for (const pos of v.at) {
      if (pos >= n) continue;
      const ix = order[n - 1 - pos];
      if (v.rule === 'dark-run') noteFlag(ix, 'queda en una racha de 3 oscuras seguidas: la semana no trae una pieza clara para cortarla');
      if (v.rule === 'identical-adjacent') noteFlag(ix, 'queda pegada a una escena casi idéntica: no hay pieza distinta para separarla');
    }
  }
  // Pieza cálida en un feed sin nada cálido: pelea por temperatura aunque
  // el orden sea perfecto — se marca, no se esconde.
  const warmFeed = existing.some((t) => t.family === FAMILY.WARM);
  piecesIn.forEach((p, ix) => {
    if (p.family === FAMILY.WARM && !warmFeed && n > 1) {
      const othersWarm = piecesIn.some((q, jx) => jx !== ix && q.family === FAMILY.WARM);
      if (!othersWarm) noteFlag(ix, 'es la única pieza cálida en un feed sin cálidos: combina por orden, pero su temperatura es ajena a la grilla');
    }
  });

  // El "por qué" de cada pieza en su lugar (para el registro semanal, la
  // vista del fundador y el porqué del cliente).
  const assignments = order.map((ix, pubRank) => {
    const p = piecesIn[ix];
    const readPos = n - 1 - pubRank;
    const prev = reading[readPos - 1] || null; // más nuevo (arriba en la grilla)
    const next = reading[readPos + 1] || null; // más viejo (abajo)
    const why = [];
    if (p.family === FAMILY.LIGHT && ((prev && prev.family === FAMILY.DARK) || (next && next.family === FAMILY.DARK))) {
      why.push('placa clara de respiro: corta el bloque oscuro de la grilla');
    }
    if (pattern && pattern.has) {
      const target = gridPattern.toneTargetForFinalPos(pattern, ahead + readPos, ahead + n);
      if (target && target.tone === 'claro' && p.family === FAMILY.LIGHT) why.push('cae en una posición clara del patrón que tu feed ya trae');
      if (target && target.tone === 'oscuro' && p.family === FAMILY.DARK) why.push('cae en una posición oscura del patrón que tu feed ya trae');
    }
    if (prev && nearIdentical(p, prev)) why.push('ojo: quedó junto a una escena casi idéntica (sin alternativa en la semana)');
    if (!why.length && prev && prev.role !== p.role && next && next.role !== p.role) {
      why.push(`alterna el ritmo de la grilla (${p.role} entre ${prev.role} y ${next.role})`);
    }
    if (!why.length && pubRank === n - 1) why.push('es la pieza más nueva: abre la grilla de la semana');
    if (!why.length && pubRank === 0) why.push('abre la semana y deja las piezas fuertes para el cierre');
    if (!why.length) why.push('mantiene el equilibrio de familias de la semana contra tu grilla');
    return { idx: ix, id: p.id != null ? p.id : null, pubRank, readPos, family: p.family, role: p.role, why };
  });

  return {
    order,
    assignments,
    flags: Array.from(flagByIdx.values()).map((f) => ({ idx: f.idx, id: piecesIn[f.idx].id != null ? piecesIn[f.idx].id : null, reasons: f.reasons })),
    remainingViolations: violations,
    moves: best.moves,
    score: best.score,
  };
}

// COMPUERTA DE PORTADAS (pura): frames medidos de UN video, en orden
// temporal; frames[0] es el frame natural (el que hoy sería la portada).
// wantFamily: la familia que la composición asignó a la pieza.
//   natural   — el frame de siempre ya combina: no se toca nada.
//   alt-frame — otro frame del mismo video combina: esa es la portada.
//   grade     — ningún frame combina pero el tono se puede llevar a la
//               familia con el grado SOBRE LA PORTADA (targetLum = centro
//               de la banda). El video no se toca, jamás.
//   keep      — la familia asignada no se alcanza por tono (cálida/otra)
//               o no hay frames medibles: queda el natural, declarado.
function coverGate(input) {
  const frames = enrich((input && input.frames) || []);
  const want = (input && input.wantFamily) || FAMILY.OTHER;
  if (!frames.length) return { action: 'keep', frameIx: -1, reason: 'sin frames medibles' };
  const natural = frames[0];
  if (natural.family === want) return { action: 'natural', frameIx: 0, reason: 'el frame natural ya combina con la familia asignada' };
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].family === want) return { action: 'alt-frame', frameIx: i, reason: 'otro frame del mismo video combina con la familia asignada' };
  }
  const band = familyBand(want);
  const center = (band[0] + band[1]) / 2;
  const dist = (f) => {
    if (typeof f.lum !== 'number') return Infinity;
    if (f.lum < band[0]) return band[0] - f.lum;
    if (f.lum > band[1]) return f.lum - band[1];
    return 0;
  };
  let bestIx = 0, bestD = Infinity;
  frames.forEach((f, i) => { const d = dist(f); if (d < bestD) { bestD = d; bestIx = i; } });
  if ((want === FAMILY.LIGHT || want === FAMILY.DARK) && bestD > 0) {
    return { action: 'grade', frameIx: bestIx, targetLum: center, reason: 'ningún frame cae en la familia asignada: el grado se aplica solo a la portada' };
  }
  if (bestD === 0) return { action: 'alt-frame', frameIx: bestIx, reason: 'el frame más cercano ya cae en la banda de la familia asignada' };
  return { action: 'keep', frameIx: 0, reason: 'la familia asignada no se alcanza por tono desde los frames: queda el natural' };
}

module.exports = {
  FAMILY, WARM_HUES,
  familyOf, familyBand, roleOf, nearIdentical, enrich,
  verifyComposition, composeOrder, coverGate,
};
