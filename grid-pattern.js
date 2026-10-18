// grid-pattern.js — EQUILIBRIO DE GRILLA (2026-10-18, v224).
// Lógica PURA: acá no hay DB, ni disco, ni red. Recibe las estadísticas
// tonales ya medidas de los posteos publicados (grid-stats.py, determinístico,
// USD 0) y detecta el PATRÓN de la grilla del cliente para respetarlo al
// ubicar y dirigir los posteos nuevos.
//
// La regla (Valentino): "que mantenga el equilibrio de colores que ya tienen
// los clientes en su feed. Si todas las publicaciones de la fila de la
// izquierda son de una manera, respetar eso." Los feeds con diseño tienen
// patrón: una columna con tono/tipo dominante, alternancia claro/oscuro tipo
// tablero, ritmos por fila. Un posteo nuevo en la posición equivocada rompe
// el dibujo aunque solo esté perfecto.
//
// Modelo de posiciones: la grilla se lee del más nuevo al más viejo
// (posición 0 = arriba a la izquierda; columna = posición mod 3). Los
// posteos nuevos entran ARRIBA: si salen N posteos nuevos (en orden de
// salida j = 0..N-1), el que sale j-ésimo termina en la posición final
// (N-1-j). Los ya publicados se corren N posiciones hacia abajo (más los
// que ya estén comprometidos antes que la tanda). Por eso TODA la lectura
// de tendencias para una tanda se hace en el MARCO FINAL: la tendencia de
// la columna final c es la de la columna actual (c - shift) mod 3, con
// shift = posteos que van a quedar por encima de la grilla vieja.
// Sin patrón FUERTE no se toca nada: comportamiento actual, sin forzar.

// Umbrales de tono sobre luminancia media 0..1 (la misma noción de
// feed-luminance.py): un tile es CLARO u OSCURO solo si está claramente
// de un lado; el resto es 'medio' y no vota tendencias.
function toneOf(lum) {
  if (typeof lum !== 'number' || !Number.isFinite(lum)) return null;
  if (lum >= 0.60) return 'claro';
  if (lum <= 0.40) return 'oscuro';
  return 'medio';
}

// Clave de TIPO comparable entre la grilla vieja (posts guardados) y las
// ideas nuevas: primero el formato (reel/carrusel), después la intención.
function typeKeyOf(t) {
  if (!t) return 'foto';
  const mt = String(t.media_type || t.mediaType || '');
  if (mt === 'video') return 'reel';
  if (mt === 'carousel') return 'carrusel';
  const intent = String(t.intent || '').trim();
  if (intent) return intent;
  const tipo = String(t.tipo || '').trim();
  return tipo || 'foto';
}

const COL_NAME = ['la izquierda', 'el centro', 'la derecha'];

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

function majorityKey(items) {
  const counts = new Map();
  for (const it of items) { if (it) counts.set(it, (counts.get(it) || 0) + 1); }
  let best = null, bestN = 0;
  for (const [k, n] of counts) { if (n > bestN) { best = k; bestN = n; } }
  return { key: best, n: bestN };
}

// detectPattern(tiles) — tiles: [{ lum, hueFam, media_type, tipo, intent }]
// del más nuevo al más viejo (posición = índice). lum puede ser null (la
// foto no estaba en disco): ese tile ocupa su posición pero no vota.
// Devuelve { has, tiles, usable, meanLum, columns: {0,1,2}, checker }.
function detectPattern(tiles) {
  const list = Array.isArray(tiles) ? tiles : [];
  const out = { has: false, tiles: list.length, usable: 0, meanLum: null, columns: {}, checker: null };
  const usable = [];
  list.forEach((t, i) => {
    if (t && typeof t.lum === 'number' && Number.isFinite(t.lum)) usable.push({ t, i });
  });
  out.usable = usable.length;
  if (usable.length < 6) return out;
  const allLums = usable.map(({ t }) => t.lum);
  const gMean = mean(allLums);
  out.meanLum = Math.round(gMean * 1000) / 1000;

  // --- Tendencias por columna (posición mod 3) ---
  for (let c = 0; c < 3; c++) {
    const cells = usable.filter(({ i }) => i % 3 === c);
    const col = { n: cells.length, meanLum: cells.length ? Math.round(mean(cells.map(({ t }) => t.lum)) * 1000) / 1000 : null, tone: null, hueFam: null, type: null, share: 0 };
    if (cells.length >= 3) {
      // Tono: ≥2/3 de las celdas del mismo lado (claro/oscuro) Y la media
      // de la columna corrida ≥0.10 de la media global en esa dirección.
      const tones = cells.map(({ t }) => toneOf(t.lum));
      const nClaro = tones.filter((x) => x === 'claro').length;
      const nOscuro = tones.filter((x) => x === 'oscuro').length;
      const dev = col.meanLum - gMean;
      if (nClaro >= Math.ceil(cells.length * 2 / 3) && nClaro > nOscuro && dev >= 0.10) { col.tone = 'claro'; col.share = nClaro / cells.length; }
      else if (nOscuro >= Math.ceil(cells.length * 2 / 3) && nOscuro > nClaro && dev <= -0.10) { col.tone = 'oscuro'; col.share = nOscuro / cells.length; }
      // Familia de tono dominante (sin 'neutro': el gris no es un color).
      const hues = cells.map(({ t }) => (t.hueFam && t.hueFam !== 'neutro') ? t.hueFam : null);
      const mh = majorityKey(hues);
      if (mh.key && mh.n >= Math.ceil(cells.length * 2 / 3)) { col.hueFam = mh.key; if (!col.share) col.share = mh.n / cells.length; }
      // Tipo dominante (para ordenar la tanda por posición).
      const mt = majorityKey(cells.map(({ t }) => typeKeyOf(t)));
      if (mt.key && mt.n >= Math.ceil(cells.length * 2 / 3)) { col.type = mt.key; if (!col.share) col.share = mt.n / cells.length; }
    }
    out.columns[c] = col;
  }

  // --- Alternancia tipo tablero (claro/oscuro por paridad de posición) ---
  // En una grilla de 3 columnas, la paridad (fila+columna) coincide con la
  // paridad de la posición: el tablero se lee sobre el índice.
  const evens = usable.filter(({ i }) => i % 2 === 0);
  const odds = usable.filter(({ i }) => i % 2 === 1);
  if (evens.length >= 3 && odds.length >= 3) {
    const mE = mean(evens.map(({ t }) => t.lum));
    const mO = mean(odds.map(({ t }) => t.lum));
    const gap = Math.abs(mE - mO);
    if (gap >= 0.15) {
      const lightCells = mE > mO ? 0 : 1;
      const mid = (mE + mO) / 2;
      let fit = 0;
      for (const { t, i } of usable) {
        const shouldBeLight = (i % 2) === lightCells;
        if ((t.lum > mid) === shouldBeLight) fit++;
      }
      if (fit / usable.length >= 0.65) {
        out.checker = { lightCells, gap: Math.round(gap * 1000) / 1000 };
      }
    }
  }

  out.has = !!(out.checker || [0, 1, 2].some((c) => out.columns[c] && (out.columns[c].tone || out.columns[c].hueFam || out.columns[c].type)));
  return out;
}

// La tendencia de una columna FINAL: la grilla vieja se corre `shift`
// posiciones hacia abajo, así que la columna final c hereda la tendencia
// de la columna actual (c - shift) mod 3.
function srcColumn(finalCol, shift) {
  return (((finalCol - shift) % 3) + 3) % 3;
}

// Objetivo tonal para un posteo nuevo que va a quedar en la posición final
// `finalPos` (con la grilla vieja corrida `shift` lugares). La columna manda;
// el tablero completa cuando la columna no tiene tono propio.
function toneTargetForFinalPos(pattern, finalPos, shift) {
  if (!pattern || !pattern.has || typeof finalPos !== 'number' || finalPos < 0) return null;
  const col = ((finalPos % 3) + 3) % 3;
  const src = pattern.columns ? pattern.columns[srcColumn(col, shift)] : null;
  if (src && src.tone) return { tone: src.tone, hueFam: src.hueFam || null, via: 'column', col };
  if (pattern.checker) {
    const lightParity = (((pattern.checker.lightCells + shift) % 2) + 2) % 2;
    const tone = (finalPos % 2) === lightParity ? 'claro' : 'oscuro';
    return { tone, hueFam: (src && src.hueFam) || null, via: 'checker', col };
  }
  if (src && src.hueFam) return { tone: null, hueFam: src.hueFam, via: 'column', col };
  return null;
}

// Consigna de dirección de arte por posición (subordinada: solo registro
// tonal/fondo y familia de color — nunca cambia tema, rol ni protagonista).
function noteForTarget(target) {
  if (!target || (!target.tone && !target.hueFam)) return '';
  let s = 'EQUILIBRIO DE LA GRILLA de su feed (el patrón que su grilla ya tiene manda en el registro, no en el tema): ';
  if (target.tone === 'claro') {
    s += 'este posteo cae en una posición CLARA de su grilla — fondo y registro general CLAROS y luminosos (luz de día, superficies claras, mucho aire), integrando la paleta de su marca. ';
  } else if (target.tone === 'oscuro') {
    s += 'este posteo cae en una posición OSCURA de su grilla — fondo y registro general OSCUROS y profundos (luz cálida y puntual, tonos intensos, contraste cuidado), integrando la paleta de su marca. ';
  }
  if (target.hueFam) {
    s += `La familia de color dominante de esa columna es ${target.hueFam}: que ese color familiar aparezca en props, vestuario o detalles de la escena. `;
  }
  s += 'Es SOLO el registro tonal: el tema, el rol de escena y el protagonista no cambian por esto.';
  return s.trim();
}

// planBatch(pattern, items, totalNew, shift, typeKeyFn)
// items: las ideas/posteos de la tanda EN ORDEN DE CREACIÓN tentativo.
// totalNew: cuántos van a salir de verdad (el resto es buffer: hereda el
// objetivo de su ranura si un slot se libera). shift: posteos que quedan
// por encima de la grilla vieja (totalNew + comprometidos previos).
// Devuelve { order, targets, moved }: order = índices de items en el orden
// de creación que respeta las tendencias de TIPO por columna (greedy
// estable: solo mueve un item si calza con la columna donde va a caer);
// targets[i] = objetivo tonal del item que queda en la ranura de creación i.
// Sin patrón (o sin tendencias de tipo) order es la identidad.
function planBatch(pattern, items, totalNew, shift, typeKeyFn) {
  const list = Array.isArray(items) ? items : [];
  const n = list.length;
  const effN = Math.max(1, Math.min(totalNew || n, n));
  const slotTarget = (i) => {
    const within = i < effN ? i : i - effN;
    const finalPos = effN - 1 - within;
    return toneTargetForFinalPos(pattern, finalPos, shift);
  };
  const slotType = (i) => {
    if (!pattern || !pattern.has) return null;
    const within = i < effN ? i : i - effN;
    const finalPos = effN - 1 - within;
    const col = ((finalPos % 3) + 3) % 3;
    const src = pattern.columns ? pattern.columns[srcColumn(col, shift)] : null;
    return src ? (src.type || null) : null;
  };
  const remaining = list.map((_, ix) => ix);
  const order = [];
  for (let i = 0; i < n; i++) {
    const want = slotType(i);
    let pickPos = 0;
    if (want && typeKeyFn) {
      const found = remaining.findIndex((ix) => typeKeyFn(list[ix]) === want);
      if (found > 0) pickPos = found;
      else if (found === 0) pickPos = 0;
    }
    order.push(remaining.splice(pickPos, 1)[0]);
  }
  let moved = 0;
  order.forEach((ix, i) => { if (ix !== i) moved++; });
  const targets = order.map((_, i) => slotTarget(i));
  return { order, targets, moved };
}

// La línea del reporte semanal: solo si hubo patrón de COLOR aplicado
// (tono de columna o tablero) — el equilibrio de colores es lo que el
// cliente ve. shift = el de la tanda aplicada.
function reportLine(pattern, shift) {
  if (!pattern || !pattern.has) return '';
  let best = null;
  for (let c = 0; c < 3; c++) {
    const src = pattern.columns ? pattern.columns[srcColumn(c, shift)] : null;
    if (src && src.tone && (!best || (src.share || 0) > (best.share || 0))) best = { col: c, tone: src.tone, share: src.share || 0 };
  }
  if (best) return `🧩 Tu grilla mantiene su equilibrio: la columna de ${COL_NAME[best.col]} sigue ${best.tone === 'claro' ? 'clara' : 'oscura'}, como en tu feed`;
  if (pattern.checker) return '🧩 Tu grilla mantiene su ritmo de tablero: claros y oscuros alternados, como en tu feed';
  return '';
}

module.exports = { toneOf, typeKeyOf, detectPattern, toneTargetForFinalPos, noteForTarget, planBatch, reportLine, srcColumn, COL_NAME };
