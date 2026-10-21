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
//
// (v306) RADAR SEMANAL + BANCO DE PREGUNTAS CLAVE POR RUBRO (decisión de
// Valentino, 2026-10-21): se suma UNA pregunta-radar — "qué se viene esta
// semana en tu negocio?" — con opciones de un toque de etiquetas según el
// rubro, cuya respuesta DECIDE qué tipo de posteos arma Posty esa semana
// (ver radarWeekLine). Y el banco CLAVE: la pregunta clave de cada rubro,
// como capa de hueco. Conviven con los huecos de siempre bajo el mismo
// techo duro: 1 pregunta por semana en total.
'use strict';

const clientDigest = require('./client-digest');

const norm = clientDigest.norm;

// ---------------------------------------------------------------------------
// (v306) RADAR SEMANAL — la pregunta que decide la semana.
// Texto y opciones determinísticas (cero IA, cero costo), voz de chat
// (minúscula, sin signos de apertura). El qkey lleva la semana: cada
// semana es una pregunta NUEVA (nunca la bloquea la memoria de 42 días
// de los huecos) y el techo de 1/semana lo sigue garantizando
// ensureWeeklyQuestion (una resuelta esta semana ⇒ no nace otra).
// ---------------------------------------------------------------------------
const RADAR_TIPOS = ['evento', 'novedad', 'descuento', 'empuje', 'festejo', 'nada', 'libre'];

// La etiqueta de "algo nuevo" según el rubro canónico (rubro-id.js).
const RADAR_NOVEDAD_ES = {
  moda: 'ingresó ropa', gastronomia: 'plato nuevo', cafeteria: 'plato nuevo',
  bar: 'plato o trago nuevo', belleza: 'servicio nuevo', barberia: 'servicio nuevo',
  hogar: 'pieza nueva', deco: 'pieza nueva', inmobiliaria: 'propiedad nueva',
  educacion: 'curso o clase nueva',
};
const RADAR_NOVEDAD_EN = {
  moda: 'new clothes in', gastronomia: 'a new dish', cafeteria: 'a new dish',
  bar: 'a new dish or drink', belleza: 'a new service', barberia: 'a new service',
  hogar: 'a new piece', deco: 'a new piece', inmobiliaria: 'a new listing',
  educacion: 'a new course or class',
};

function rubroKeyOf(digest) {
  const d = (digest && typeof digest === 'object') ? digest : {};
  const raw = (d.rubro_id && d.rubro_id.rubro) || d.category || '';
  return norm(String(raw)).replace(/\s+/g, '');
}

function radarCandidate(digest, weekKey, lang) {
  if (!weekKey) return null;
  const en = lang === 'en';
  const rk = rubroKeyOf(digest);
  const novedad = en ? (RADAR_NOVEDAD_EN[rk] || 'something new') : (RADAR_NOVEDAD_ES[rk] || 'algo nuevo');
  const L = en ? {
    texto: "what's coming up this week in your business?",
    evento: '🗓️ an important event', descuento: '🏷️ a discount', empuje: '📦 something to push',
    festejo: '⭐ something to celebrate', nada: '😴 nothing special',
  } : {
    texto: 'qué se viene esta semana en tu negocio?',
    evento: '🗓️ un evento importante', descuento: '🏷️ un descuento', empuje: '📦 algo para empujar',
    festejo: '⭐ algo para festejar', nada: '😴 nada especial',
  };
  const opt = (tipo, label) => ({ label, value: JSON.stringify({ radar: 1, tipo }) });
  return {
    kind: 'radar',
    qkey: `radar:${weekKey}`,
    texto: L.texto,
    opciones: [
      opt('evento', L.evento),
      opt('novedad', `🆕 ${novedad}`),
      opt('descuento', L.descuento),
      opt('empuje', L.empuje),
      opt('festejo', L.festejo),
      opt('nada', L.nada),
    ],
    allow_text: true,
    ref: { radar: true, rubro: rk },
  };
}

// ---------------------------------------------------------------------------
// (v306) BANCO DE PREGUNTAS CLAVE POR RUBRO (aprobadas por Valentino,
// 2026-10-21) — la pregunta que un buen CM le hace a ESE rubro. Entran
// como capa de hueco (kind 'clave', memoria de 42 días como el resto):
// su respuesta es combustible de contenido y cae al bloque `radar` del
// digest con tipo 'clave' (insumo de la semana, perenne como el radar).
// ---------------------------------------------------------------------------
const CLAVE_ES = {
  gastronomia: 'qué sale de la cocina esta semana que todavía no mostramos? un plato nuevo, un ingrediente de estación, algo que solo hacés vos?',
  cafeteria: 'qué sale de la cocina esta semana que todavía no mostramos? un plato nuevo, un ingrediente de estación, algo que solo hacés vos?',
  bar: 'qué sale esta semana que todavía no mostramos? un trago nuevo, un plato, algo que solo hacés vos?',
  belleza: 'qué tratamiento está funcionando mejor? si llega una clienta nueva esta semana, a qué querés que venga?',
  barberia: 'qué servicio querés llenar esta semana? hay algún hueco de agenda que salimos a vender?',
  moda: 'qué entró nuevo, o qué quedó colgado con stock? eso sale esta semana.',
  hogar: 'qué pieza querés que se vaya esta semana? esa es la protagonista.',
  deco: 'qué pieza querés que se vaya esta semana? esa es la protagonista.',
  fitness: 'qué logro de un alumno podemos festejar? y hay horario o profe nuevo para empujar?',
  mascotas: 'hay algún paciente que sea la historia de la semana? qué servicio querés recordar: baño, vacuna, control?',
  salud: 'qué es lo que más te preguntan últimamente? lo respondemos en un posteo esta semana.',
  autos: 'qué trabajo zarpado entró al taller? con una foto de eso vendemos solos.',
  profesionales: 'qué caso o resultado de esta semana podés contar, sin nombres? eso es autoridad pura.',
  servicios: 'qué caso o resultado de esta semana podés contar, sin nombres? eso es autoridad pura.',
  inmobiliaria: 'qué propiedad querés empujar esta semana? esa sale de protagonista.',
  educacion: 'hay un curso, una clase o un grupo nuevo para empujar esta semana?',
  eventos: 'qué evento se viene que queramos llenar?',
  flores: 'qué fecha o arreglo se viene que salimos a vender?',
  joyeria: 'qué pieza querés que se vaya esta semana? esa es la protagonista.',
  turismo: 'qué destino o salida querés empujar esta semana?',
  viajes: 'qué destino o salida querés empujar esta semana?',
  fotografia: 'qué sesión o trabajo de esta semana podemos mostrar?',
  arte: 'qué obra o pieza nueva tenés para mostrar esta semana?',
  tecnologia: 'qué novedad o trabajo de esta semana podemos mostrar?',
};
const CLAVE_EN = {
  gastronomia: "what's coming out of the kitchen this week that we haven't shown yet? a new dish, a seasonal ingredient, something only you make?",
  cafeteria: "what's coming out of the kitchen this week that we haven't shown yet? a new dish, a seasonal ingredient, something only you make?",
  bar: "what's on this week that we haven't shown yet? a new drink, a dish, something only you make?",
  belleza: 'which treatment is working best? if a new client walks in this week, what should she come for?',
  barberia: 'which service do you want to fill this week? any empty slots in the book we should sell?',
  moda: 'what just came in, or what is sitting in stock? that goes out this week.',
  hogar: 'which piece do you want gone this week? that one is the star.',
  deco: 'which piece do you want gone this week? that one is the star.',
  fitness: "what's a member win we can celebrate? and is there a new schedule or trainer to push?",
  mascotas: 'is there a patient who is the story of the week? what service should we remind people about: bath, vaccine, checkup?',
  salud: 'what do people ask you most lately? we answer it in a post this week.',
  autos: 'what a great job came into the shop? with one photo of that, it sells itself.',
  profesionales: 'what case or result from this week can you share, no names? that is pure authority.',
  servicios: 'what case or result from this week can you share, no names? that is pure authority.',
  inmobiliaria: 'which property do you want to push this week? that one leads.',
  educacion: 'is there a new course, class or group to push this week?',
  eventos: 'what event is coming up that we want to fill?',
  flores: 'what date or arrangement is coming up that we should sell?',
  joyeria: 'which piece do you want gone this week? that one is the star.',
  turismo: 'what trip or destination do you want to push this week?',
  viajes: 'what trip or destination do you want to push this week?',
  fotografia: 'what session or job from this week can we show?',
  arte: 'what new piece do you have to show this week?',
  tecnologia: 'what new thing or job from this week can we show?',
};
const CLAVE_COMODIN_ES = 'pasó algo esta semana en tu negocio que tus clientes deberían saber?';
const CLAVE_COMODIN_EN = 'did anything happen this week at your business that your customers should know?';

function claveCandidate(digest, lang) {
  const en = lang === 'en';
  const rk = rubroKeyOf(digest);
  const texto = en ? (CLAVE_EN[rk] || CLAVE_COMODIN_EN) : (CLAVE_ES[rk] || CLAVE_COMODIN_ES);
  return {
    kind: 'clave', qkey: `clave:${rk || 'general'}`, texto,
    opciones: [], allow_text: true, ref: { clave: true, rubro: rk },
  };
}

// ---------------------------------------------------------------------------
// EL MAPEO respuesta → semana. Lo consume el brief de ideas (server.js
// radarLineFor → ideasInputFor → openaiIdeas, espejo de la capa de
// campaña): cada tipo se vuelve UNA directiva de contenido para la
// semana EN CURSO — y solo para esa: week_key distinto ⇒ '' (lo
// perecedero jamás se recicla). Descuento SIN detalle ⇒ '' también:
// sin dato real no hay posteo de descuento, punto.
// ---------------------------------------------------------------------------
function radarWeekLine(radar, weekKey, lang) {
  if (!radar || typeof radar !== 'object' || !weekKey || radar.week_key !== weekKey) return '';
  const det = String(radar.detalle || '').trim();
  const conDet = det ? `: ${det}` : '';
  if (lang === 'en') {
    switch (radar.tipo) {
      case 'evento': return `📡 OWNER RADAR (this week): there's an IMPORTANT EVENT${conDet}. Build the week around it: an anticipation post and a reminder the day before.`;
      case 'novedad': return `📡 OWNER RADAR (this week): something NEW${conDet}. The week's hero post is this launch.`;
      case 'descuento': return det ? `📡 OWNER RADAR (this week): a REAL discount confirmed by the owner: ${det}. Sales post with that EXACT data — never invent other discounts, percentages or dates.` : '';
      case 'empuje': return `📡 OWNER RADAR (this week): something to PUSH${conDet}. Product post with REAL scarcity only (whatever is actually true).`;
      case 'festejo': return `📡 OWNER RADAR (this week): something to CELEBRATE${conDet}. Social-proof post.`;
      case 'clave': case 'libre': return det ? `📡 OWNER RADAR (this week): the owner shared: ${det}. Use it as a topic or angle where it fits the week.` : '';
      default: return '';
    }
  }
  switch (radar.tipo) {
    case 'evento': return `📡 RADAR DEL DUEÑO (esta semana): hay un EVENTO IMPORTANTE${conDet}. La semana se ordena alrededor del evento: posteo de anticipación + recordatorio el día anterior.`;
    case 'novedad': return `📡 RADAR DEL DUEÑO (esta semana): hay algo NUEVO${conDet}. El posteo protagonista de la semana es el lanzamiento de esta novedad.`;
    case 'descuento': return det ? `📡 RADAR DEL DUEÑO (esta semana): DESCUENTO REAL confirmado por el dueño: ${det}. Posteo de venta con ese dato EXACTO — prohibido inventar otros descuentos, porcentajes o fechas.` : '';
    case 'empuje': return `📡 RADAR DEL DUEÑO (esta semana): hay algo para EMPUJAR${conDet}. Posteo de producto con escasez REAL (solo la que sea verdad).`;
    case 'festejo': return `📡 RADAR DEL DUEÑO (esta semana): hay algo para FESTEJAR${conDet}. Posteo de prueba social.`;
    case 'clave': case 'libre': return det ? `📡 RADAR DEL DUEÑO (esta semana): el dueño contó: ${det}. Usalo como tema o ángulo donde encaje en la semana.` : '';
    default: return '';
  }
}

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

function candidatesFor(digest, dna, opts) {
  opts = (opts && typeof opts === 'object') ? opts : {};
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

  const gaps = [];
  // 4) Hueco estrella: ni ADN, ni inferido, ni confirmado por el dueño.
  const starKnown = String(a.producto_estrella || '').trim().length >= 3
    || String(dueno.estrella || '').trim().length >= 3
    || (d.inferred_star && d.inferred_star.item && (d.inferred_star.confidence || 0) >= 0.5);
  if (!starKnown) {
    const names = itemNamesOf(d, 3);
    gaps.push({
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
    gaps.push({
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
    gaps.push({
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
    gaps.push({
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
    gaps.push({
      kind: 'no_publicar',
      qkey: 'hueco:no_publicar',
      texto: 'hay algo que no quieras que publique jamás? (un tema, un producto, un precio…)',
      opciones: [{ label: 'Nada, todo vale', value: '__none__' }],
      allow_text: true,
      ref: { hueco: true },
    });
  }

  // (v306) Ensamble final, en orden:
  //   1) derivados del digest (rubro/estrella/precio): prioridad crítica;
  //   2) huecos 4–8: si el fundamento está incompleto, COMPLETARLO manda
  //      (el radar presupone un fundamento que ya funciona);
  //   3) la pregunta CLAVE, si la semana pasada el radar no trajo señal
  //      (opts.preferGap);
  //   4) el RADAR: el default semanal con el fundamento completo;
  //   5) la CLAVE en su turno normal.
  // Techo intacto: 1 pregunta por semana en total.
  const radar = radarCandidate(digest, opts.weekKey, opts.lang);
  const clave = claveCandidate(digest, opts.lang);
  return [
    ...out, ...gaps,
    ...(opts.preferGap ? [clave] : []),
    ...(radar ? [radar] : []),
    ...(opts.preferGap ? [] : [clave]),
  ];
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

function pickWeeklyCandidate(digest, dna, history, nowMs, opts) {
  const blocked = blockedKeys(history, nowMs);
  for (const c of candidatesFor(digest, dna, opts)) {
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
function ensureWeeklyQuestion(db, uid, weekKey, nowMs, opts) {
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
  // (v306) ¿Cómo le fue al radar la semana pasada? Si el dueño participó
  // y no trajo señal (contestó "nada especial" o la descartó), esta
  // semana la capa de hueco (clave por rubro / huecos) va primero. Si
  // expiró sin ser vista, el radar vuelve a ofrecerse tal cual: es LA
  // pregunta semanal.
  let preferGap = false;
  try {
    const lr = db.prepare(`SELECT week_key, status, respuesta FROM posty_questions WHERE user_id = ? AND kind = 'radar' AND week_key != '' AND week_key < ? ORDER BY id DESC LIMIT 1`).get(uid, weekKey);
    if (lr) {
      const prev = new Date(String(weekKey) + 'T12:00:00Z');
      prev.setUTCDate(prev.getUTCDate() - 7);
      const prevKey = prev.toISOString().slice(0, 10);
      if (String(lr.week_key) >= prevKey) {
        preferGap = lr.status === 'dismissed'
          || (lr.status === 'answered' && String(lr.respuesta || '').trim() === 'nada');
      }
    }
  } catch (e) {}
  const cand = pickWeeklyCandidate(digest, dna, history, now, {
    weekKey, lang: (opts && opts.lang) || 'es', preferGap,
  });
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
  let storedAnswer = '';

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
  } else if (row.kind === 'radar') {
    // (v306) RADAR SEMANAL: la opción trae { tipo } en JSON; el texto,
    // si vino, es el detalle. El descuento EXIGE el detalle (cuál y
    // hasta cuándo): sin dato → 'needs_detail' y no se guarda nada —
    // jamás un posteo de descuento inventado. La respuesta cae como
    // bloque `radar` del digest, insumo PERECEDERO de esta semana
    // (radarWeekLine lo lee solo si week_key es la semana en curso):
    // NO va al ADN ni al bloque `dueno`, que son memoria durable.
    let tipo = '';
    try { const v = JSON.parse(value || ''); if (v && v.tipo) tipo = String(v.tipo); } catch (e) {}
    const detalle = text ? cleanAnswerText(text, 200) : '';
    if (!tipo && detalle) tipo = 'libre';
    if (!tipo) return { ok: false, reason: 'empty' };
    if (!RADAR_TIPOS.includes(tipo)) return { ok: false, reason: 'bad_option' };
    if (tipo === 'descuento' && !detalle) return { ok: false, reason: 'needs_detail' };
    digest.radar = {
      tipo, detalle: tipo === 'nada' ? '' : detalle,
      week_key: row.week_key || '', at: new Date().toISOString(), fuente: 'dueno',
    };
    storedAnswer = tipo === 'nada' ? 'nada' : (detalle ? `${tipo}: ${detalle}` : tipo);
    applied = `radar:${tipo}`;
  } else if (row.kind === 'clave') {
    // (v306) PREGUNTA CLAVE del rubro: la respuesta es combustible de
    // contenido — cae al mismo bloque perenne de la semana (digest
    // `radar`, tipo 'clave') para que el brief de ideas la tenga a mano.
    if (!free) return { ok: false, reason: 'empty' };
    digest.radar = {
      tipo: 'clave', detalle: free,
      week_key: row.week_key || '', at: new Date().toISOString(), fuente: 'dueno',
    };
    applied = 'clave';
  } else {
    return { ok: false, reason: 'kind' };
  }

  clientDigest.saveDigest(db, uid, digest);
  writeDnaRow(db, uid, dna);
  db.prepare(`UPDATE posty_questions SET status = 'answered', respuesta = ?, acted_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(storedAnswer || answeredText || applied, row.id, uid);
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
  radarCandidate, claveCandidate, radarWeekLine, rubroKeyOf, RADAR_TIPOS,
};
