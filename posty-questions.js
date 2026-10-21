// posty-questions.js — POSTY PREGUNTA (2026-10-19, v238).
// Aprobado por Valentino (2026-10-18): "detrás del digest", Posty le hace
// al cliente MÁXIMO 1 pregunta por semana, pegada a momentos que ya
// existen (la tarjeta vive en Schedule, donde aterriza el ritual de fotos
// del lunes, y el reporte semanal la lleva como dato) — NUNCA un popup.
// La pregunta cubre SOLO lo que el fundamento (client-digest v229/v230/
// v235) no pudo leer solo: confirmar el rubro dudoso, confirmar el
// estrella inferido, resolver una contradicción de precios, o un hueco
// del ADN (estrella / más vendido / promos / cliente ideal / qué NO
// publicar jamás). Selección y redacción DETERMINÍSTICAS (plantillas):
// cero IA para elegir, cero IA para redactar, cero costo en runtime.
// La respuesta del dueño es la fuente MÁS FUERTE: cae al digest (bloque
// `dueno` + el campo que corresponda) y al ADN, y queda lockeada contra
// el refresco semanal (applyDeepBlocks la preserva — ver client-digest).
'use strict';

const clientDigest = require('./client-digest');

const norm = clientDigest.norm;

// ---------------------------------------------------------------------------
// CANDIDATOS — orden de prioridad FIJO:
//   1) rubro sin confirmar (de él cuelgan posteos Y prompts: primer dominó)
//   2) estrella inferido a confirmar (question_candidates de v230)
//   3) contradicción de precios (question_candidates de v230)
//   4) hueco: producto estrella (nadie lo sabe todavía)
//   5) hueco: qué se vende más
//   6) hueco: promos vigentes
//   7) hueco: cliente ideal
//   8) hueco: qué NO publicar jamás
// Cada candidato: { kind, qkey, texto, opciones: [{label, value}], allow_text, ref }
// qkey = la memoria: una pregunta resuelta (respondida o "ahora no") no
// vuelve por 42 días; una que quedó pending/ignorada, por 21.
// ---------------------------------------------------------------------------

function itemNamesOf(digest, max) {
  const out = [];
  const seen = new Set();
  for (const x of [...((digest && digest.productos) || []), ...((digest && digest.servicios) || [])]) {
    const n = String((x && (x.nombre || x)) || '').replace(/\s+/g, ' ').trim();
    if (n.length < 3) continue;
    const k = norm(n);
    if (seen.has(k)) continue;
    seen.add(k); out.push(n);
    if (out.length >= (max || 3)) break;
  }
  return out;
}

function candidatesFor(digest, dna) {
  const d = (digest && typeof digest === 'object') ? digest : {};
  const a = (dna && typeof dna === 'object') ? dna : {};
  const dueno = (d.dueno && typeof d.dueno === 'object') ? d.dueno : {};
  const out = [];

  // 1–3) Los candidatos que el propio digest ya derivó (finalizeDigest).
  for (const c of (d.question_candidates || [])) {
    if (!c || !c.tipo) continue;
    if (c.tipo === 'rubro' && Array.isArray(c.opciones) && c.opciones.length) {
      const rid = d.rubro_id || {};
      out.push({
        kind: 'rubro',
        qkey: `rubro:${rid.rubro || c.rubro || ''}:${rid.nivel_duda || ''}`,
        texto: c.texto || 'cuál es tu rubro?',
        opciones: c.opciones.map((o) => ({
          label: String(o.label || o.rubro || '').slice(0, 60),
          value: JSON.stringify({ rubro: o.rubro || '', subrubro: o.subrubro || '' }),
        })).filter((o) => o.label),
        allow_text: false,
        ref: { rubro: c.rubro || '', opciones: c.opciones },
      });
    } else if (c.tipo === 'estrella' && c.item) {
      out.push({
        kind: 'estrella',
        qkey: `estrella-inf:${norm(c.item)}`,
        texto: c.texto || `tu producto estrella es ${c.item}?`,
        opciones: [
          { label: `Sí, es ${c.item}`.slice(0, 60), value: String(c.item) },
          { label: 'No, es otro', value: '__otro__' },
        ],
        allow_text: true,
        ref: { item: c.item, inferido: true },
      });
    } else if (c.tipo === 'contradiccion' && c.item) {
      const contra = (d.contradictions || []).find((x) => x && clientDigest.sameItemName(x.item, c.item));
      const valores = (contra && contra.valores) || {};
      const srcLabel = (f) => (f === 'bio-link' ? 'link de bio' : f === 'web-catalog' ? 'catálogo web' : f === 'pdf' ? 'PDF' : f === 'dna' ? 'tu ficha' : f);
      const opciones = Object.entries(valores)
        .map(([f, v]) => ({ label: `${v} (${srcLabel(f)})`.slice(0, 60), value: String(v) }))
        .filter((o) => o.value);
      if (opciones.length) {
        out.push({
          kind: 'contradiccion',
          qkey: `precio:${norm(c.item)}`,
          texto: c.texto || `cuál es el precio actual de ${c.item}?`,
          opciones,
          allow_text: true,
          ref: { item: c.item, valores },
        });
      }
    }
  }

  // 4) Hueco estrella: ni ADN, ni inferido, ni confirmado por el dueño.
  const starKnown = String(a.producto_estrella || '').trim().length >= 3
    || String(dueno.estrella || '').trim().length >= 3
    || (d.inferred_star && d.inferred_star.item && (d.inferred_star.confidence || 0) >= 0.5);
  if (!starKnown) {
    const names = itemNamesOf(d, 3);
    out.push({
      kind: 'estrella',
      qkey: 'hueco:estrella',
      texto: 'cuál es tu producto o servicio estrella, el que más querés vender?',
      opciones: names.map((n) => ({ label: n, value: n })),
      allow_text: true,
      ref: { hueco: true },
    });
  }

  // 5) Hueco: qué se vende más (señal comercial distinta del estrella).
  const bestKnown = String(a.mas_vendido || '').trim().length >= 3 || String(dueno.mas_vendido || '').trim().length >= 3;
  if (!bestKnown) {
    const names = itemNamesOf(d, 3);
    out.push({
      kind: 'mas_vendido',
      qkey: 'hueco:mas_vendido',
      texto: 'qué es lo que más se vende de tu negocio?',
      opciones: names.map((n) => ({ label: n, value: n })),
      allow_text: true,
      ref: { hueco: true },
    });
  }

  // 6) Hueco: promos vigentes.
  const promosKnown = ((d.promos || []).length > 0)
    || (Array.isArray(a.promos_activas) && a.promos_activas.length > 0)
    || (Array.isArray(a.promos) && a.promos.length > 0);
  if (!promosKnown) {
    out.push({
      kind: 'promos',
      qkey: 'hueco:promos',
      texto: 'tenés alguna promo activa que quieras que empuje en tus posteos? contame cuál, o tocá «Sin promos».',
      opciones: [{ label: 'Sin promos por ahora', value: '__none__' }],
      allow_text: true,
      ref: { hueco: true },
    });
  }

  // 7) Hueco: cliente ideal (el "cliente típico" de la ficha).
  const clientKnown = String(a.cliente_ideal || '').trim().length >= 3 || String(dueno.cliente || '').trim().length >= 3;
  if (!clientKnown) {
    out.push({
      kind: 'cliente',
      qkey: 'hueco:cliente',
      texto: 'quién es tu cliente típico? (edad, qué busca, de dónde viene — con tus palabras)',
      opciones: [],
      allow_text: true,
      ref: { hueco: true },
    });
  }

  // 8) Hueco: qué NO publicar jamás.
  const banKnown = String(a.no_publicar || '').trim().length >= 3 || String(dueno.no_publicar || '').trim().length >= 3;
  if (!banKnown) {
    out.push({
      kind: 'no_publicar',
      qkey: 'hueco:no_publicar',
      texto: 'hay algo que no quieras que publique jamás? (un tema, un producto, un precio…)',
      opciones: [{ label: 'Nada, todo vale', value: '__none__' }],
      allow_text: true,
      ref: { hueco: true },
    });
  }

  return out;
}

// Memoria de preguntas: filas de posty_questions → qkeys bloqueadas.
// Resuelta (answered/dismissed): 42 días. Pending vieja/expirada: 21 días
// (la de ESTA semana no entra en el historial que pasa el llamador).
function blockedKeys(history, nowMs) {
  const blocked = new Set();
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  for (const r of history || []) {
    if (!r || !r.qkey) continue;
    const created = new Date(String(r.created_at || '').replace(' ', 'T') + 'Z').getTime();
    if (!Number.isFinite(created)) continue;
    const ageDays = (now - created) / 86400000;
    if ((r.status === 'dismissed' || r.status === 'answered') && ageDays <= 42) blocked.add(r.qkey);
    else if ((r.status === 'pending' || r.status === 'expired') && ageDays <= 21) blocked.add(r.qkey);
  }
  return blocked;
}

function pickWeeklyCandidate(digest, dna, history, nowMs) {
  const blocked = blockedKeys(history, nowMs);
  for (const c of candidatesFor(digest, dna)) {
    if (!blocked.has(c.qkey)) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// PERSISTENCIA (posty_questions) — la tabla también se crea en db.js; este
// ensure es defensivo, mismo patrón que client-digest.ensureTable.
// ---------------------------------------------------------------------------
function ensureTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS posty_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      week_key TEXT NOT NULL DEFAULT '',
      qkey TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT '',
      texto TEXT NOT NULL DEFAULT '',
      opciones_json TEXT NOT NULL DEFAULT '[]',
      ref_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      respuesta TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      acted_at TEXT
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_posty_questions_user ON posty_questions(user_id, status, id)`);
  } catch (e) { /* db.js la crea igual */ }
}

function publicShape(row) {
  if (!row) return null;
  let opciones = [];
  try { opciones = JSON.parse(row.opciones_json || '[]'); } catch (e) { opciones = []; }
  let ref = {};
  try { ref = JSON.parse(row.ref_json || '{}'); } catch (e) { ref = {}; }
  return {
    id: row.id, kind: row.kind, texto: row.texto,
    opciones: Array.isArray(opciones) ? opciones : [],
    allow_text: !(ref && ref.allow_text === false),
    week_key: row.week_key,
  };
}

// La pregunta vigente de la semana: expira las pending de semanas
// anteriores, devuelve la pending de ESTA semana si existe, y si no,
// elige UNA (la de mayor prioridad no bloqueada) y la crea. TOPE DURO:
// jamás dos pending en la misma semana — esta función es la única que
// crea filas y siempre mira primero las pending de la semana.
function ensureWeeklyQuestion(db, uid, weekKey, nowMs) {
  ensureTable(db);
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  // 1) Lo que quedó pending de semanas pasadas expira (fue ignorado:
  //    la semana siguiente se ofrece OTRA pregunta, no la misma).
  try {
    db.prepare(`UPDATE posty_questions SET status = 'expired' WHERE user_id = ? AND status = 'pending' AND week_key != '' AND week_key < ?`).run(uid, weekKey);
  } catch (e) {}
  // 2) ¿Ya hay una vigente esta semana?
  let row = null;
  try { row = db.prepare(`SELECT * FROM posty_questions WHERE user_id = ? AND status = 'pending' AND week_key = ? ORDER BY id LIMIT 1`).get(uid, weekKey); } catch (e) {}
  if (row) return publicShape(row);
  // 2b) ¿Ya se resolvió una esta semana? Entonces no nace otra.
  let done = null;
  try { done = db.prepare(`SELECT id FROM posty_questions WHERE user_id = ? AND week_key = ? AND status IN ('answered','dismissed') LIMIT 1`).get(uid, weekKey); } catch (e) {}
  if (done) return null;
  // 3) Elegir y crear.
  const digest = clientDigest.getDigest(db, uid);
  const dna = readDnaRow(db, uid);
  let history = [];
  try { history = db.prepare(`SELECT qkey, status, created_at FROM posty_questions WHERE user_id = ?`).all(uid); } catch (e) {}
  const cand = pickWeeklyCandidate(digest, dna, history, now);
  if (!cand) return null;
  const info = db.prepare(`INSERT INTO posty_questions (user_id, week_key, qkey, kind, texto, opciones_json, ref_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`)
    .run(uid, weekKey, cand.qkey, cand.kind, cand.texto,
      JSON.stringify(cand.opciones || []),
      JSON.stringify({ ...(cand.ref || {}), allow_text: cand.allow_text !== false }));
  row = db.prepare(`SELECT * FROM posty_questions WHERE id = ?`).get(info.lastInsertRowid);
  return publicShape(row);
}

function currentQuestion(db, uid, weekKey) {
  ensureTable(db);
  try {
    const row = db.prepare(`SELECT * FROM posty_questions WHERE user_id = ? AND status = 'pending' AND week_key = ? ORDER BY id LIMIT 1`).get(uid, weekKey);
    return publicShape(row);
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// LA RESPUESTA CAE AL FUNDAMENTO — el dueño es la fuente más fuerte.
// Se escribe en TRES capas coherentes:
//   · client_digest.dueno (bloque del dueño: lo que el refresco semanal
//     preserva y los candidatos respetan — ver client-digest),
//   · el campo concreto del digest (rubro_id/categoría, inferred_star,
//     precio corregido, promos),
//   · business_dna (la capa del dueño en la fuente: producto_estrella,
//     cliente_ideal, promos_activas…), para que un rebuild completo del
//     digest herede la respuesta igual que hereda cualquier edición suya.
// ---------------------------------------------------------------------------
function readDnaRow(db, uid) {
  try {
    const r = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(uid);
    if (r && r.dna_json) { const o = JSON.parse(r.dna_json); if (o && typeof o === 'object') return o; }
  } catch (e) {}
  return {};
}
function writeDnaRow(db, uid, dna) {
  db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET dna_json=excluded.dna_json, updated_at=datetime('now')`).run(uid, JSON.stringify(dna || {}));
}

function cleanAnswerText(s, max) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

// Aplica la respuesta a una pregunta pending. answer: { value } (un toque)
// o { text } (línea libre). '__otro__' sin texto = sin dato (vale como
// descartada con otra redacción: no se guarda basura, no se insiste).
// Devuelve { ok, applied: '<qué se guardó>' } o { ok:false, reason }.
function applyAnswer(db, uid, questionId, answer) {
  ensureTable(db);
  const row = db.prepare(`SELECT * FROM posty_questions WHERE id = ? AND user_id = ? AND status = 'pending'`).get(questionId, uid);
  if (!row) return { ok: false, reason: 'gone' };
  let ref = {};
  try { ref = JSON.parse(row.ref_json || '{}'); } catch (e) {}
  const value = cleanAnswerText(answer && answer.value, 300);
  const text = cleanAnswerText(answer && answer.text, 300);
  const free = text || (value && value !== '__otro__' && value !== '__none__' ? value : '');
  const answeredText = free || text || value;

  const digest = clientDigest.getDigest(db, uid) || clientDigest.emptyDigest();
  if (!digest.dueno || typeof digest.dueno !== 'object') digest.dueno = {};
  const dna = readDnaRow(db, uid);
  let applied = '';

  if (row.kind === 'rubro') {
    let pick = null;
    try { pick = JSON.parse(value || '{}'); } catch (e) { pick = null; }
    if (!pick || !pick.rubro || !clientDigest.rubroId.RUBROS.includes(pick.rubro)) return { ok: false, reason: 'bad_option' };
    const res = clientDigest.rubroId.resolveRubro({ confirmed: { rubro: pick.rubro, subrubro: pick.subrubro || '', fuente: 'pregunta' }, cls: null });
    digest.rubro_id = { ...res.rubroId, evidencia: ['Lo confirmó el dueño desde Posty pregunta'] };
    digest.category = res.category;
    digest.subcat = res.subcat || '';
    try {
      db.prepare(`UPDATE profiles SET category = ?, subrubro = ?, updated_at = datetime('now') WHERE user_id = ?`)
        .run(res.category, res.subcat || '', uid);
    } catch (e) {}
    applied = `rubro:${res.category}${res.subcat ? '/' + res.subcat : ''}`;
  } else if (row.kind === 'estrella') {
    if (!free) return { ok: false, reason: 'empty' };
    digest.dueno.estrella = free;
    digest.inferred_star = { item: free, confidence: 1, evidence: ['Lo confirmó el dueño'], fuente: 'dueno', at: new Date().toISOString() };
    dna.producto_estrella = free;
    applied = 'estrella';
  } else if (row.kind === 'mas_vendido') {
    if (!free) return { ok: false, reason: 'empty' };
    digest.dueno.mas_vendido = free;
    dna.mas_vendido = free;
    applied = 'mas_vendido';
  } else if (row.kind === 'contradiccion') {
    const item = (ref && ref.item) || '';
    const precio = free;
    if (!item || !precio) return { ok: false, reason: 'empty' };
    if (!digest.dueno.precios || typeof digest.dueno.precios !== 'object') digest.dueno.precios = {};
    digest.dueno.precios[norm(item)] = { item, precio };
    const fixPrice = (list) => {
      for (const it of (list || [])) {
        if (it && it.nombre && clientDigest.sameItemName(it.nombre, item)) it.precio = precio;
      }
    };
    fixPrice(digest.productos); fixPrice(digest.servicios);
    if (digest.catalog && Array.isArray(digest.catalog.items)) fixPrice(digest.catalog.items);
    digest.contradictions = (digest.contradictions || []).filter((c) => !(c && clientDigest.sameItemName(c.item, item)));
    const fixDna = (list) => {
      for (const it of (list || [])) {
        if (it && it.nombre && clientDigest.sameItemName(it.nombre, item)) it.precio = precio;
      }
    };
    fixDna(dna.productos); fixDna(dna.servicios);
    applied = 'precio';
  } else if (row.kind === 'promos') {
    if (value === '__none__') {
      digest.dueno.promos_ninguna_at = new Date().toISOString();
      applied = 'promos:ninguna';
    } else {
      if (!free) return { ok: false, reason: 'empty' };
      if (!Array.isArray(dna.promos_activas)) dna.promos_activas = [];
      if (!dna.promos_activas.some((p) => norm((p && (p.titulo || p.nombre)) || p) === norm(free))) {
        dna.promos_activas.push({ titulo: free });
      }
      if (!Array.isArray(digest.promos)) digest.promos = [];
      if (!digest.promos.some((p) => norm((p && (p.titulo || p.nombre)) || p) === norm(free))) {
        digest.promos.unshift({ titulo: free });
      }
      applied = 'promos';
    }
  } else if (row.kind === 'cliente') {
    if (!free) return { ok: false, reason: 'empty' };
    digest.dueno.cliente = free;
    dna.cliente_ideal = free;
    applied = 'cliente';
  } else if (row.kind === 'no_publicar') {
    if (value === '__none__') {
      digest.dueno.no_publicar = '';
      digest.dueno.no_publicar_libre = true; // respondió "todo vale": el hueco queda respondido
      dna.no_publicar = '';
      applied = 'no_publicar:ninguno';
    } else {
      if (!free) return { ok: false, reason: 'empty' };
      digest.dueno.no_publicar = free;
      dna.no_publicar = free;
      applied = 'no_publicar';
    }
  } else {
    return { ok: false, reason: 'kind' };
  }

  clientDigest.saveDigest(db, uid, digest);
  writeDnaRow(db, uid, dna);
  db.prepare(`UPDATE posty_questions SET status = 'answered', respuesta = ?, acted_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(answeredText || applied, row.id, uid);
  return { ok: true, applied };
}

function dismissQuestion(db, uid, questionId) {
  ensureTable(db);
  const r = db.prepare(`UPDATE posty_questions SET status = 'dismissed', acted_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'pending'`).run(questionId, uid);
  return { ok: true, changed: r.changes || 0 };
}

module.exports = {
  candidatesFor, blockedKeys, pickWeeklyCandidate,
  ensureTable, ensureWeeklyQuestion, currentQuestion, publicShape,
  applyAnswer, dismissQuestion,
};
