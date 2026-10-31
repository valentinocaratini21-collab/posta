// semana-aprende.js — ÍTEM 4: LA SEMANA APRENDE DE LA SEMANA.
//
// Cada plan semanal arranca de lo que realmente rindió la semana anterior
// PARA ESE negocio. Señales REALES, todas leídas de registros durables del
// propio producto (nada de Instagram salvo que post_metrics/piece_learning
// ya tenga filas: la capa de IG sigue gated como en LEARNING-LOOP.md):
//
//   - Aprobaciones de primera: eventos `pieza_aceptada_primera` y
//     `semana_aceptada` de oficina_nivel_eventos (el dueño aceptó sin
//     cambios / la semana entera). Resolubles a posts por registro_ref.
//   - Preguntas recibidas: comment_queue + dm_queue (community-pro) con
//     created_at dentro de la semana anterior y forma de pregunta.
//   - Guardados y comentarios medidos: piece_learning JOIN posts de la
//     semana anterior, solo cuando hay filas (si no hay, la señal no
//     existe: fail-closed, jamás se estima).
//   - Fechas cubiertas / pendientes: efemérides del sistema (ephemeris.js,
//     la misma fuente que ya usa el prompt de ideas) en la ventana de la
//     semana anterior y en la ventana destino.
//
// REGLA DE VERDAD (dura): el porqué que sale de acá cita SOLO hechos con
// conteo real (preguntas textuales, aces contados). Jamás ventas, jamás
// atribución ("esto vendió", "esto trajo clientes"), jamás una pregunta
// inventada. Sin señales, el aprendizaje es vacío y el plan queda intacto.
//
// ALCANCE DELIBERADO: este módulo NO reordena picks. El equilibrio de
// grilla ya fijó posiciones y notas por pick; reordenar después rompería
// esa correspondencia. El ajuste de temas/ángulos viaja por (a) el bloque
// de aprendizaje en el brief de ideas (el LLM propone desde lo real) y
// (b) el porqué determinista con cita (garantía, testeable sin LLM).
// Tampoco toca niveles: LEE oficina_nivel_eventos, nunca emite eventos
// de nivel ni llama a nivelEmitir. La única escritura es UNA hipótesis
// por semana en account_experiments (la memoria que LEARNING-LOOP.md
// dejó prevista: "la escribe el loop semanal cuando exista").
//
'use strict';

const STOP = new Set(('de la el que en y a los las un una con por para su sus al del como mas pero este esta esto eso esa sin sobre entre cuando donde es son fue eran estan'.split(' ')));

// Palabras con las que puede empezar una pregunta (sobre texto normalizado).
// Ojo: el "qué" inicial NO está: al quitar tildes es indistinguible del
// "que" conjunción ("qué rico se ve todo" es exclamación, no pregunta).
// Esas preguntas igual entran si traen '?'/'¿', que es lo habitual.
const PREG_INICIO = /^(cuanto|cuando|donde|tienen|hacen|hay|puedo|pueden|abren|cierran|venden|queda|quedan|sale|salen|traen|manejan|trabajan|atienden)/;

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sigTokens(s) {
  const seen = new Set();
  const out = [];
  for (const w of norm(s).split(' ').filter(Boolean)) {
    // Significativo: 4+ letras, o 3 caracteres con dígito (códigos como
    // "2x1" son señal, no ruido). Los de 3 sin dígito ("hoy", "día")
    // se excluyen: emparejarían piezas sin relación real.
    const ok = (w.length >= 4 || (w.length === 3 && /\d/.test(w))) && !STOP.has(w);
    if (ok && !seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out;
}

function compartenTema(a, b) {
  const ta = sigTokens(a);
  if (!ta.length) return false;
  const sb = new Set(sigTokens(b));
  return ta.some((t) => sb.has(t));
}

function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function isoDay(dt) { return dt.toISOString().slice(0, 10); }

// La semana anterior a una week_key (que ya es un lunes YYYY-MM-DD).
function prevWeekKey(weekKey) {
  const dt = parseYmd(weekKey);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() - 7);
  return isoDay(dt);
}

function nextWeekKey(weekKey) {
  const dt = parseYmd(weekKey);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() + 7);
  return isoDay(dt);
}

function normFecha(s) {
  return String(s || '').replace('T', ' ').slice(0, 19);
}

function esPregunta(text) {
  const raw = String(text || '');
  if (/[?¿]/.test(raw)) return true;
  return PREG_INICIO.test(norm(raw));
}

function tsMs(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? n : n * 1000;
}

function qAll(db, sql, params) {
  try { return db.prepare(sql).all(...(params || [])) || []; } catch (e) { return []; }
}

function qGet(db, sql, params) {
  try { return db.prepare(sql).get(...(params || [])) || null; } catch (e) { return null; }
}

// Eventos de efemérides en [desde, hasta) por fecha YYYY-MM-DD.
// `eventosOpt` es inyección para tests; si no viene, se usa ephemeris.js
// (allForYear la exporta esta tanda; sin ella, fechas = [] sin romper nada).
function eventosEnVentana(desde, hasta, eventosOpt) {
  let evs = eventosOpt;
  if (!evs) {
    try {
      const eph = require('./ephemeris');
      if (eph && typeof eph.allForYear === 'function') {
        const y1 = +String(desde).slice(0, 4);
        const y2 = +String(hasta).slice(0, 4);
        evs = [];
        for (const y of [...new Set([y1, y2])]) evs.push(...eph.allForYear(y));
      } else { evs = []; }
    } catch (e) { evs = []; }
  }
  return (evs || []).filter((e) => e && e.date && e.date >= desde && e.date < hasta);
}

// Aprendizaje de la semana anterior a `weekKey` para `uid`.
// Nunca tira: ante cualquier error devuelve { tiene: false }.
function aprendizajeSemanaAnterior(db, uid, weekKey, eventosOpt) {
  const vacio = { tiene: false, prev: null, piezas: [], aces: [], semanaAceptada: false,
    preguntas: [], preguntasRecientes: [], ig: [], fechasCubiertas: [], fechasPendientes: [] };
  try {
    if (!db || uid === undefined || uid === null || !weekKey) return vacio;
    const prev = prevWeekKey(weekKey);
    if (!prev) return vacio;
    const hasta = weekKey;
    const desdeStr = prev + ' 00:00:00';
    const hastaStr = hasta + ' 00:00:00';
    const winFrom = Date.UTC(+prev.slice(0, 4), +prev.slice(5, 7) - 1, +prev.slice(8, 10));
    const winTo = winFrom + 7 * 86400000;

    // 1. Piezas de la semana anterior.
    const piezas = qAll(db,
      `SELECT id, source_topic, source_angle, tipo, status FROM posts
       WHERE user_id = ? AND week_key = ? AND status != 'cancelled'`,
      [uid, prev]).map((r) => ({
        id: r.id, tema: String(r.source_topic || ''), angulo: String(r.source_angle || ''),
        tipo: String(r.tipo || ''), status: String(r.status || ''),
      }));

    // 2. Aces de primera (oficina_nivel_eventos, ts en ms; se toleran segundos).
    const acesPorTema = new Map();
    const evRows = qAll(db,
      `SELECT evento, registro_ref, ts FROM oficina_nivel_eventos
       WHERE user_id = ? AND poder = 'posty' AND evento IN ('pieza_aceptada_primera', 'semana_aceptada')`,
      [uid]);
    let semanaAceptada = false;
    for (const r of evRows) {
      if (r.evento === 'semana_aceptada' && String(r.registro_ref || '') === 'semana-aceptada:' + prev) {
        semanaAceptada = true;
        continue;
      }
      if (r.evento !== 'pieza_aceptada_primera') continue;
      const t = tsMs(r.ts);
      if (!t || t < winFrom || t >= winTo) continue;
      const m = /^pieza:(\d+)$/.exec(String(r.registro_ref || ''));
      if (!m) continue;
      const p = qGet(db, 'SELECT source_topic, tipo FROM posts WHERE id = ? AND user_id = ?', [+m[1], uid]);
      if (!p || !String(p.source_topic || '').trim()) continue;
      const key = norm(p.source_topic);
      const cur = acesPorTema.get(key) || { tema: String(p.source_topic), tipo: String(p.tipo || ''), n: 0 };
      cur.n += 1;
      acesPorTema.set(key, cur);
    }
    const aces = [...acesPorTema.values()].sort((a, b) => b.n - a.n);

    // 3. Preguntas recibidas en la semana (community-pro). Si la tabla no
    // tiene created_at, el SELECT tira y se cae al fallback "recientes"
    // (enSemana=false: alimentan el brief, jamás un porqué con semana).
    const preguntas = [];
    const preguntasRecientes = [];
    for (const tabla of ['comment_queue', 'dm_queue']) {
      let rows = [];
      try {
        rows = db.prepare(`SELECT text, created_at FROM ${tabla} WHERE user_id = ?`).all(uid) || [];
      } catch (e) {
        try { rows = (db.prepare(`SELECT text FROM ${tabla} WHERE user_id = ?`).all(uid) || []).map((r) => ({ text: r.text, created_at: null })); } catch (e2) { rows = []; }
      }
      for (const r of rows) {
        const texto = String(r.text || '').replace(/\s+/g, ' ').trim();
        if (texto.length < 8 || !esPregunta(texto)) continue;
        const item = { texto: texto.slice(0, 120) };
        if (r.created_at) {
          const f = normFecha(r.created_at);
          if (f >= desdeStr && f < hastaStr) preguntas.push(item);
        } else {
          preguntasRecientes.push(item);
        }
      }
    }
    const dedup = (arr) => {
      const seen = new Set(); const out = [];
      for (const it of arr) { const k = norm(it.texto); if (k && !seen.has(k)) { seen.add(k); out.push(it); } if (out.length >= 10) break; }
      return out;
    };

    // 4. Guardados/comentarios medidos en IG, solo si hay filas.
    const igPorTema = new Map();
    const igRows = qAll(db,
      `SELECT p.source_topic AS tema, COALESCE(pl.comments, 0) AS comments, COALESCE(pl.saves, 0) AS saves
       FROM piece_learning pl JOIN posts p ON p.id = pl.post_id
       WHERE p.user_id = ? AND p.week_key = ? AND (COALESCE(pl.comments, 0) + COALESCE(pl.saves, 0)) > 0`,
      [uid, prev]);
    for (const r of igRows) {
      const tema = String(r.tema || '').trim();
      if (!tema) continue;
      const cur = igPorTema.get(norm(tema)) || { tema, comments: 0, saves: 0 };
      cur.comments += +r.comments || 0; cur.saves += +r.saves || 0;
      igPorTema.set(norm(tema), cur);
    }
    const ig = [...igPorTema.values()];

    // 5. Fechas: cubiertas en la anterior, pendientes en la destino.
    const evPrev = eventosEnVentana(prev, hasta, eventosOpt);
    const evNext = eventosEnVentana(hasta, nextWeekKey(hasta) || hasta, eventosOpt);
    const textosPiezas = piezas.map((p) => `${p.tema} ${p.angulo}`).join(' ');
    const fechasCubiertas = evPrev.filter((e) => compartenTema(e.name || '', textosPiezas))
      .map((e) => ({ nombre: e.name, fecha: e.date }));
    const cubNombres = new Set(fechasCubiertas.map((f) => norm(f.nombre)));
    const fechasPendientes = evNext.filter((e) => !cubNombres.has(norm(e.name || '')))
      .map((e) => ({ nombre: e.name, fecha: e.date }));

    const tiene = aces.length > 0 || semanaAceptada || preguntas.length > 0 ||
      ig.length > 0 || fechasCubiertas.length > 0;
    return { tiene, prev, target: weekKey, piezas, aces, semanaAceptada,
      preguntas: dedup(preguntas), preguntasRecientes: dedup(preguntasRecientes),
      ig, fechasCubiertas, fechasPendientes };
  } catch (e) { return vacio; }
}

// Bloque de texto para el brief de ideas. Solo hechos con conteo; jamás
// ventas ni atribución. '' cuando no hay nada que contar. Dos gates:
// con aprendizaje de semana, todas las líneas (incluidas las fechas que
// vienen, que son contexto, no aprendizaje); sin él, solo la línea de
// preguntas recientes SIN fecha — rotuladas como tales, jamás como
// "la semana pasada".
function textoParaBrief(ap) {
  if (!ap) return '';
  if (!ap.tiene) {
    if (ap.preguntasRecientes && ap.preguntasRecientes.length) {
      return 'Preguntas recientes (sin fecha de semana): ' + ap.preguntasRecientes.map((p) => `«${p.texto}»`).join(' ');
    }
    return '';
  }
  const lines = [];
  if (ap.semanaAceptada) lines.push(`La semana del ${ap.prev} se aceptó entera.`);
  if (ap.aces.length) {
    lines.push('Aceptados sin cambios la semana pasada: ' + ap.aces.map((a) =>
      a.n > 1 ? `${a.tema} (${a.n} veces)` : a.tema).join(' | ') + '.');
  }
  if (ap.preguntas.length) {
    lines.push('Preguntas recibidas la semana pasada: ' + ap.preguntas.map((p) => `«${p.texto}»`).join(' '));
  } else if (ap.preguntasRecientes.length) {
    lines.push('Preguntas recientes (sin fecha de semana): ' + ap.preguntasRecientes.map((p) => `«${p.texto}»`).join(' '));
  }
  for (const g of ap.ig) {
    const partes = [];
    if (g.saves > 0) partes.push(`${g.saves} guardados`);
    if (g.comments > 0) partes.push(`${g.comments} comentarios`);
    if (partes.length) lines.push(`En Instagram, «${g.tema}» sumó ${partes.join(' y ')}.`);
  }
  if (ap.fechasCubiertas.length) lines.push('Fechas ya cubiertas la semana pasada: ' + ap.fechasCubiertas.map((f) => f.nombre).join(', ') + '.');
  if (ap.fechasPendientes.length) lines.push('Fechas que vienen esta semana y aún no cubriste: ' + ap.fechasPendientes.map((f) => `${f.nombre} (${f.fecha})`).join(', ') + '.');
  return lines.join('\n');
}

// Empareja picks con señales (prioridad: pregunta, luego ace). No reordena
// ni elimina nada: devuelve solo los picks que calzan, con su motivo.
function emparejarPicks(picks, ap) {
  if (!ap || !ap.tiene || !Array.isArray(picks)) return [];
  const out = [];
  for (const pick of picks) {
    if (!pick) continue;
    const texto = `${pick.titulo || ''} ${pick.angulo || ''}`;
    let motivo = null;
    for (const pr of (ap.preguntas || [])) {
      if (compartenTema(pr.texto, texto)) { motivo = { kind: 'pregunta', texto: pr.texto }; break; }
    }
    if (!motivo) {
      for (const a of (ap.aces || [])) {
        if (compartenTema(a.tema, texto)) { motivo = { kind: 'ace', tema: a.tema, n: a.n }; break; }
      }
    }
    if (motivo) out.push({ pick, motivo });
  }
  return out;
}

// Porqué con aprendizaje real, o el porqué original si no calza.
// Una sola frase citada, con conteo; jamás ventas ni atribución.
function porqueConAprendizaje(pick, ap) {
  const base = String((pick && pick.porque) || '');
  if (!ap || !ap.tiene) return base;
  if (/semana pasada/i.test(base)) return base; // ya cita aprendizaje: no duplicar
  const emp = emparejarPicks([pick], ap);
  if (!emp.length) return base;
  const m = emp[0].motivo;
  let frase = '';
  if (m.kind === 'pregunta') {
    frase = ` La semana pasada preguntaron por esto: «${String(m.texto).slice(0, 80)}».`;
  } else if (m.kind === 'ace') {
    frase = m.n > 1
      ? ` Este tema se aceptó sin cambios ${m.n} veces la semana pasada.`
      : ' Este tema se aceptó sin cambios la semana pasada.';
  }
  if (!frase) return base;
  const sep = base && !/[.!?…]\s*$/.test(base) ? '. ' : ' ';
  return (base + (base ? sep : '') + frase.trim()).slice(0, 500);
}

// UNA hipótesis por semana en account_experiments (dedup por usuario+semana).
// Devuelve null si no hay nada que hipotetizar o si la escritura falla.
function registrarHipotesis(db, uid, weekKey, ap, emparejados) {
  try {
    if (!db || !ap || !ap.tiene || !emparejados || !emparejados.length) return null;
    db.exec(`CREATE TABLE IF NOT EXISTS account_experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, week_key TEXT DEFAULT '',
      hypothesis TEXT NOT NULL DEFAULT '', result TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    const ya = qGet(db, 'SELECT id FROM account_experiments WHERE user_id = ? AND week_key = ? LIMIT 1', [uid, weekKey]);
    if (ya) return { ok: false, reason: 'ya_existe', id: ya.id };
    const m = emparejados[0].motivo;
    const tema = emparejados[0].pick.titulo || m.tema || '';
    const hypothesis = m.kind === 'pregunta'
      ? `Tema «${tema}» responde una pregunta recibida la semana del ${ap.prev}`
      : `Tema «${tema}» aceptado sin cambios la semana del ${ap.prev}`;
    const r = db.prepare('INSERT INTO account_experiments (user_id, week_key, hypothesis, result) VALUES (?, ?, ?, ?)').run(uid, weekKey, hypothesis, '');
    return { ok: true, id: r && r.lastInsertRowid };
  } catch (e) { return null; }
}

// Mide la hipótesis de la semana anterior contra los aces de esa semana.
// Sin aces en la semana anterior, la hipótesis queda sin medir (result ''):
// ausencia de evidencia no es refutación.
function medirHipotesisAnterior(db, uid, weekKey) {
  try {
    const prev = prevWeekKey(weekKey);
    if (!db || !prev) return null;
    const row = qGet(db, 'SELECT id, hypothesis, result FROM account_experiments WHERE user_id = ? AND week_key = ? ORDER BY id DESC LIMIT 1', [uid, prev]);
    if (!row || String(row.result || '').trim()) return null;
    const apPrev = aprendizajeSemanaAnterior(db, uid, weekKey);
    if (!apPrev || !apPrev.aces.length) return null;
    const kw = new Set(sigTokens(row.hypothesis || ''));
    if (!kw.size) return null;
    const hit = apPrev.aces.find((a) => sigTokens(a.tema).some((t) => kw.has(t)));
    const result = hit
      ? `confirmada (ace: ${hit.tema})`
      : `no_confirmada (${apPrev.aces.length} aces, ninguno del tema)`;
    db.prepare('UPDATE account_experiments SET result = ? WHERE id = ?').run(result, row.id);
    return { ok: true, result };
  } catch (e) { return null; }
}

module.exports = {
  prevWeekKey, nextWeekKey, aprendizajeSemanaAnterior, textoParaBrief,
  emparejarPicks, porqueConAprendizaje, registrarHipotesis, medirHipotesisAnterior,
  _norm: norm, _sigTokens: sigTokens, _esPregunta: esPregunta,
};
