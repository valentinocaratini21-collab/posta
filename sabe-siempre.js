// sabe-siempre.js — LOTE POSTY-SABE-SIEMPRE-QUÉ-POSTEAR (4/11, SIN PUSH).
//
// Posty sabe siempre qué postear porque la semana se arma desde lo que el
// cliente ya dijo e hizo, no desde el fundamento de hace un mes. Cinco
// piezas, todas fail-closed (sin datos no hay cambio, nunca se inventa):
//
//   1) CADA EDICIÓN O RECHAZO ES UNA REGLA: el rechazo ya dejaba señal
//      durable en cm_gusto ('rechazada') y el edit por chat dejaba
//      'cambio'; el rehacer por chat (redo) solo dejaba post_signals.
//      Este lote cierra ese hueco (redo también deja 'cambio') y hace
//      la regla VISIBLE en una línea: recibo «aprendí: …» en el chat,
//      campo `aprendido` en el reject, y GET /api/aprendizaje con una
//      línea por regla activa (dónde vive: style_rules + cm_gusto;
//      cómo se consulta: ese endpoint).
//   2) LA PREGUNTA SEMANAL CON FOTOS: extiende ana-fl-confirm
//      (GET/POST /api/fundamento/semana-confirm), no la duplica. El GET
//      suma una foto por producto (de los propios posteos del cliente,
//      nunca stock) y la semana elegida; el POST acepta los productos
//      elegidos tocando fotos y los guarda en digest.semana_elegida
//      (week_key de la semana en curso en la zona de la cuenta). La
//      semana se arma con eso: ideasInputFor lo lleva en el brief y el
//      filtro del pool lo respeta como excepción y como foco.
//   3) APRENDE DE LO QUE FUNCIONÓ EN SU INSTAGRAM: rendimiento POR TEMA
//      y POR FORMATO (tipo) desde post_metrics + piece_learning de
//      posteos publicados (últimos 90 días, datos reales de IG), con el
//      mismo encogimiento bayesiano y umbrales de contentPerformanceLine
//      (C=5, ratio ≥1.25 ganador / ≤0.75 perdedor, mínimo 2 posteos por
//      tema y 4 medidos en total). Los ganadores van al brief; los
//      perdedores salen del pool cuando hay alternativa (nunca se vacía
//      la semana: el filtro no baja del déficit).
//   4) MEMORIA ANTI-REPETICIÓN: la semana anterior queda registrada en
//      posts (week_key + source_topic + tipo) y el pool la consulta:
//      un tema de la semana anterior no vuelve, y la secuencia de
//      formatos (tipos, en orden) no se repite idéntica. Excepción: lo
//      que el cliente eligió esta semana en la pregunta semanal pasa
//      igual (su palabra manda).
//   5) LA SEMANA SE ARMA CON LA PROMO REAL Y LO QUE HAY: si el digest
//      y el ADN no traen ninguna promo real, las ideas tipo 'promo'
//      salen del pool cuando hay alternativa. Nunca se inventa una
//      promo (el candado de números de client-digest sigue vigente).
//
// REGLAS DURAS que este módulo NO toca: rubro-literal y fundamento-
// literal (vetos, productos literales, espejo), draft_gusto (veto →
// mezcla → tema → campeona) y su consumo, autopiloto por defecto,
// carta de estrategia, niveles y premios. Sin semana elegida, sin
// métricas o sin semana anterior, la semana se arma exactamente como
// hoy.
'use strict';

const STOP = new Set(('de la el que en y a los las un una con por para su sus al del como mas pero este esta esto eso esa sin sobre entre cuando donde es son fue eran estan'.split(' ')));

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function temaTokens(texto) {
  const seen = new Set();
  const out = [];
  for (const w of norm(texto).split(' ').filter(Boolean)) {
    if (w.length >= 4 && !STOP.has(w) && !seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out;
}

// Regla conservadora de cm-gusto: 2+ tokens compartidos, o 1 token de 7+
// letras. Mejor dejar pasar un tema que vetar de más.
function temaCoincide(a, b) {
  const ta = temaTokens(a);
  const tb = new Set(temaTokens(b));
  if (!ta.length || !tb.size) return false;
  const compartidos = ta.filter((t) => tb.has(t));
  if (compartidos.length >= 2) return true;
  return compartidos.some((t) => t.length >= 7);
}

function shiftDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ---------- Rendimiento por tema y por formato (ítem 3) ----------
// Misma matemática que contentPerformanceLine (C=5, umbrales 1.25/0.75),
// agrupada por source_topic (tema) y por tipo (formato de la semana).
// Solo posteos publicados con métrica real (post_metrics o piece_learning
// con al menos una métrica no nula). Sin datos suficientes: { tiene: false }.
function rendimientoAgrupado(rows) {
  const C = 5;
  const porGrupo = new Map();
  for (const r of rows || []) {
    const clave = String(r.grupo || '').trim();
    if (!clave) continue;
    const eng = (Number(r.likes) || 0) + (Number(r.comments) || 0) + (Number(r.saved) || 0);
    const cur = porGrupo.get(clave) || { n: 0, eng: 0 };
    cur.n += 1;
    cur.eng += eng;
    porGrupo.set(clave, cur);
  }
  const medidos = [...porGrupo.entries()].filter(([, v]) => v.n >= 2 && v.eng > 0);
  const totalN = medidos.reduce((a, [, v]) => a + v.n, 0);
  const totalEng = medidos.reduce((a, [, v]) => a + v.eng, 0);
  if (!medidos.length || totalN < 4 || totalEng <= 0) return { tiene: false, ganadores: [], perdedores: [] };
  const media = totalEng / totalN;
  const scored = medidos.map(([grupo, v]) => {
    const er = v.eng / v.n;
    const score = (C * media + v.n * er) / (C + v.n);
    return { grupo, n: v.n, ratio: media > 0 ? score / media : 1 };
  }).filter((s) => s.ratio >= 1.25 || s.ratio <= 0.75)
    .sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
  return {
    tiene: scored.length > 0,
    ganadores: scored.filter((s) => s.ratio >= 1.25).map((s) => ({ tema: s.grupo, ratio: s.ratio, n: s.n })),
    perdedores: scored.filter((s) => s.ratio <= 0.75).map((s) => ({ tema: s.grupo, ratio: s.ratio, n: s.n })),
  };
}

function rendimientoTemas(db, uid) {
  try {
    if (!db || uid === undefined || uid === null) return { tiene: false, ganadores: [], perdedores: [] };
    const rows = db.prepare(`
      SELECT p.source_topic AS grupo,
             COALESCE(m.likes, pl.likes, 0) AS likes,
             COALESCE(m.comments, pl.comments, 0) AS comments,
             COALESCE(m.saved, pl.saves, 0) AS saved
      FROM posts p
      LEFT JOIN post_metrics m ON m.post_id = p.id
      LEFT JOIN piece_learning pl ON pl.post_id = p.id
      WHERE p.user_id = ? AND p.status = 'published'
        AND COALESCE(p.published_at, p.created_at) > datetime('now', '-90 days')
        AND COALESCE(p.source_topic, '') != ''
        AND (m.post_id IS NOT NULL OR pl.post_id IS NOT NULL)
    `).all(uid);
    return rendimientoAgrupado(rows);
  } catch (e) { return { tiene: false, ganadores: [], perdedores: [] }; }
}

function rendimientoFormatos(db, uid) {
  try {
    if (!db || uid === undefined || uid === null) return { tiene: false, ganadores: [], perdedores: [] };
    const rows = db.prepare(`
      SELECT p.tipo AS grupo,
             COALESCE(m.likes, pl.likes, 0) AS likes,
             COALESCE(m.comments, pl.comments, 0) AS comments,
             COALESCE(m.saved, pl.saves, 0) AS saved
      FROM posts p
      LEFT JOIN post_metrics m ON m.post_id = p.id
      LEFT JOIN piece_learning pl ON pl.post_id = p.id
      WHERE p.user_id = ? AND p.status = 'published'
        AND COALESCE(p.published_at, p.created_at) > datetime('now', '-90 days')
        AND COALESCE(p.tipo, '') != ''
        AND (m.post_id IS NOT NULL OR pl.post_id IS NOT NULL)
    `).all(uid);
    return rendimientoAgrupado(rows);
  } catch (e) { return { tiene: false, ganadores: [], perdedores: [] }; }
}

function bloqueParaBrief(rendTemas, rendFormatos) {
  const lines = [];
  if (rendTemas && rendTemas.tiene) {
    for (const g of rendTemas.ganadores.slice(0, 3)) {
      lines.push(`- Tus posteos sobre "${g.tema}" rinden ${(Math.round(g.ratio * 10) / 10).toFixed(1)}x tu promedio (${g.n} posteos): PREFERILO con variación.`);
    }
    for (const p of rendTemas.perdedores.slice(0, 3)) {
      lines.push(`- Tus posteos sobre "${p.tema}" rinden ${(Math.round(p.ratio * 10) / 10).toFixed(1)}x tu promedio (${p.n} posteos): no lo repitas esta semana.`);
    }
  }
  if (rendFormatos && rendFormatos.tiene) {
    for (const g of rendFormatos.ganadores.slice(0, 2)) {
      lines.push(`- Tus posteos tipo "${g.tema}" rinden ${(Math.round(g.ratio * 10) / 10).toFixed(1)}x tu promedio (${g.n} posteos): PREFERILO con variación.`);
    }
    for (const p of rendFormatos.perdedores.slice(0, 2)) {
      lines.push(`- Tus posteos tipo "${p.tema}" rinden ${(Math.round(p.ratio * 10) / 10).toFixed(1)}x tu promedio (${p.n} posteos): no lo repitas esta semana.`);
    }
  }
  if (!lines.length) return '';
  return `\nRENDIMIENTO POR TEMA Y FORMATO de tu cuenta (últimos 90 días, datos reales de Instagram):\n${lines.join('\n')}`;
}

// ---------- Semana anterior (ítem 4) ----------
function semanaAnterior(db, uid, weekKey) {
  const vacio = { tiene: false, posts: [], tipos: [] };
  try {
    if (!db || uid === undefined || uid === null || !weekKey) return vacio;
    const prevKey = shiftDays(String(weekKey).slice(0, 10), -7);
    const posts = db.prepare(`
      SELECT source_topic AS tema, COALESCE(tipo, '') AS tipo
      FROM posts WHERE user_id = ? AND week_key = ? AND status != 'cancelled'
        AND COALESCE(source_topic, '') != ''
      ORDER BY COALESCE(scheduled_at, created_at) ASC
    `).all(uid, prevKey);
    if (!posts.length) return vacio;
    return { tiene: true, posts, tipos: posts.map((p) => p.tipo).filter(Boolean) };
  } catch (e) { return vacio; }
}

// ---------- Promo real (ítem 5) ----------
function tienePromoReal(digest, dna) {
  try {
    const dPromos = (digest && Array.isArray(digest.promos)) ? digest.promos : [];
    const dnaPromos = dna ? [...(dna.promos_activas || []), ...(dna.promos || [])] : [];
    return dPromos.length > 0 || dnaPromos.length > 0;
  } catch (e) { return false; }
}

// ---------- Foto por producto (ítem 2) ----------
// La foto más reciente de los PROPIOS posteos del cliente (nunca stock)
// cuyo tema calza con el producto, o cuya primera línea de caption lo
// nombra. Sin foto: null (la pregunta sigue funcionando con el nombre).
function fotoPorProducto(db, uid, nombre) {
  try {
    if (!db || uid === undefined || uid === null || !nombre) return null;
    const rows = db.prepare(`
      SELECT image_path AS img, source_topic AS tema, caption AS cap
      FROM posts WHERE user_id = ? AND status != 'cancelled'
        AND image_path LIKE '/media/%'
      ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 40
    `).all(uid);
    for (const r of rows) {
      if (temaCoincide(nombre, r.tema || '')) return String(r.img || '') || null;
    }
    const toks = temaTokens(nombre);
    if (toks.length) {
      for (const r of rows) {
        const primera = norm(String(r.cap || '').split('\n')[0] || '');
        if (toks.some((t) => primera.includes(t))) return String(r.img || '') || null;
      }
    }
    return null;
  } catch (e) { return null; }
}

// ---------- Filtro del pool (ítems 3, 4, 5) ----------
// Orden: promo → anti-repetición (tema) → perdedores. Cada paso solo se
// aplica si el pool resultante sigue ≥ deficit: la semana nunca queda
// incompleta por un filtro. Las ideas que calzan con la semana elegida
// por el cliente (excepciones) pasan siempre.
function filtrarPool(pool, opts) {
  const o = opts || {};
  const deficit = Math.max(1, Number(o.deficit) || 1);
  let cur = Array.isArray(pool) ? [...pool] : [];
  const quitados = [];
  const tituloDe = (i) => String((i && (i.titulo || i.title)) || '');
  const esExcepcion = (i) => {
    const ex = o.excepciones || [];
    if (!ex.length) return false;
    return ex.some((p) => temaCoincide(p, tituloDe(i)) || temaCoincide(tituloDe(i), p));
  };
  const aplicar = (motivo, pred) => {
    if (cur.length <= deficit) return;
    const kept = [];
    for (const i of cur) {
      if (!esExcepcion(i) && pred(i)) { quitados.push({ titulo: tituloDe(i), motivo }); continue; }
      kept.push(i);
    }
    if (kept.length >= deficit) cur = kept;
  };
  // 5) Sin promo real, fuera las ideas tipo 'promo'.
  if (o.tienePromo === false) {
    aplicar('sin_promo_real', (i) => String(i.tipo || '').toLowerCase() === 'promo');
  }
  // 4) Un tema de la semana anterior no vuelve.
  if (o.prevPosts && o.prevPosts.length) {
    aplicar('tema_semana_anterior', (i) => o.prevPosts.some((p) => temaCoincide(tituloDe(i), p.tema || '')));
  }
  // 3) Los perdedores medidos no vuelven (tema o formato).
  const perdedoresTemas = (o.perdedoresTemas || []).map((p) => p.tema || p);
  const perdedoresFormatos = (o.perdedoresFormatos || []).map((p) => p.tema || p);
  if (perdedoresTemas.length || perdedoresFormatos.length) {
    aplicar('bajo_rendimiento', (i) =>
      perdedoresTemas.some((t) => temaCoincide(tituloDe(i), t)) ||
      perdedoresFormatos.some((f) => String(i.tipo || '').toLowerCase() === String(f).toLowerCase()));
  }
  return { pool: cur, quitados };
}

// La secuencia de formatos (tipos, en orden) no se repite idéntica a la
// de la semana anterior: si los picks quedan con la misma secuencia, se
// canjea el último pick por el primer pick del buffer con otro tipo.
// Sin buffer distinto, queda como está (fail-open, nunca se rompe la semana).
function evitarSecuenciaFormatoIgual(picks, pool, prevTipos) {
  if (!Array.isArray(picks) || picks.length < 2 || !Array.isArray(prevTipos) || !prevTipos.length) return picks;
  const seq = picks.map((p) => String(p.tipo || '').toLowerCase());
  if (seq.length !== prevTipos.length) return picks;
  if (!seq.every((t, i) => t === String(prevTipos[i] || '').toLowerCase())) return picks;
  const resto = (Array.isArray(pool) ? pool : []).filter((p) => !picks.includes(p));
  const otro = resto.find((p) => String(p.tipo || '').toLowerCase() !== seq[seq.length - 1]);
  if (!otro) return picks;
  const out = [...picks];
  out[out.length - 1] = otro;
  return out;
}

// ---------- Reglas visibles en una línea (ítem 1) ----------
function lineaAprendi(titulo, tipo) {
  const t = `"${String(titulo || 'posteo').slice(0, 40)}"`;
  if (tipo === 'rechazo') return `aprendí: ${t} no vuelve`;
  return `aprendí: tu cambio en ${t} quedó guardado`;
}

// Líneas de consulta: reglas de estilo activas + vetos de gusto + cambios.
// Cada una es UNA línea; el cliente las ve en GET /api/aprendizaje y las
// puede borrar desde «Lo que aprendí de vos» (vía /api/gustos) o quitando
// el veto desde la pregunta semanal. Sin datos: lista vacía, no un error.
function lineasAprendizaje(db, uid) {
  const out = [];
  try {
    if (!db || uid === undefined || uid === null) return out;
    const reglas = db.prepare(`SELECT rule_text FROM style_rules WHERE user_id = ? AND active = 1 ORDER BY rule_key ASC`).all(uid);
    for (const r of reglas) {
      const t = String(r.rule_text || '').trim();
      if (t) out.push(t);
    }
  } catch (e) {}
  try {
    const rows = db.prepare(`SELECT tema, angulo, senal FROM cm_gusto WHERE user_id = ? ORDER BY created_at DESC LIMIT 40`).all(uid);
    const vistos = new Set();
    for (const r of rows) {
      const tema = String(r.tema || '').trim();
      if (!tema || vistos.has(tema + '|' + r.senal)) continue;
      vistos.add(tema + '|' + r.senal);
      if (r.senal === 'rechazada') out.push(`Nunca: ${tema}`);
      else if (r.senal === 'cambio') out.push(`Cambiaste: ${tema}`);
    }
  } catch (e) {}
  return out.slice(0, 20);
}

module.exports = {
  norm, temaTokens, temaCoincide, shiftDays,
  rendimientoAgrupado, rendimientoTemas, rendimientoFormatos, bloqueParaBrief,
  semanaAnterior, tienePromoReal, fotoPorProducto,
  filtrarPool, evitarSecuenciaFormatoIgual,
  lineaAprendi, lineasAprendizaje,
};
