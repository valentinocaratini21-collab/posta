'use strict';
/* onboarding.js — Momento de bienvenida mágico post-pago + onboarding por confirmación.
 *
 * Decisión de Valentino (2026-10-25): SÍ al onboarding post-pago, pero NO como
 * cuestionario. Doctrina del fundamento (bambooty-supremo/FUNDAMENTO.md §1):
 * Posty LEE todo lo legible primero y pregunta SOLO el hueco, con opciones de
 * un toque. Preguntar lo que ya sabe rompería la magia.
 *
 * El momento vive en la tarjeta de bienvenida post-pago de la Agenda (?plan=ok):
 *  1. «Lo que Posty ya sabe de vos» — fichas del digest de la cuenta, SOLO
 *     hechos reales; cada ficha se corrige de un toque (la corrección queda
 *     registrada como hecho del dueño y se superpone al digest en la vista).
 *  2. Solo los huecos reales, MÁXIMO 3 preguntas, siempre de un toque y con
 *     opciones precomputadas. REGLA DURA verificable: cada pregunta
 *     renderizada tiene su hueco correspondiente en el digest; si el digest
 *     ya tiene la respuesta, la pregunta NO existe (ni se renderiza, ni se
 *     acepta por POST: el servidor recomputa los huecos y rechaza lo demás).
 *  3. El payoff: al responder, las respuestas quedan como gusto durable
 *     (bloque `dueno` del digest — la fuente más fuerte, que el refresco
 *     semanal preserva wholesale porque el fresco nunca lo trae — más el
 *     registro de auditoría en onboarding_facts) y la próxima semana ya las
 *     aplica. Si el cliente saltea todo, la semana sigue viva igual.
 *
 * NADA de esto toca el flujo de cobro (Stripe/MP intactos) ni inventa datos:
 * una capa vacía del digest no genera ficha ni pregunta con opciones
 * inventadas — la ficha no se muestra y la pregunta se salta.
 */
const clientDigest = require('./client-digest');
const rubroId = clientDigest.rubroId || {};
const RUBROS = rubroId.RUBROS || [];
const labelFor = rubroId.labelFor || ((r) => r || '');

const MAX_PREGUNTAS = 3;
const SKIP = '__skip__';

function ensureTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS onboarding_facts (
      user_id INTEGER NOT NULL,
      clave TEXT NOT NULL,
      valor TEXT NOT NULL DEFAULT '',
      at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, clave)
    )`);
  } catch (e) { /* defensivo: db.js la crea igual en su esquema */ }
}

function factsOf(db, uid) {
  ensureTable(db);
  const out = {};
  try {
    const rows = db.prepare('SELECT clave, valor FROM onboarding_facts WHERE user_id = ?').all(uid);
    for (const r of rows) out[r.clave] = r.valor;
  } catch (e) {}
  return out;
}

function setFact(db, uid, clave, valor) {
  ensureTable(db);
  db.prepare(`INSERT INTO onboarding_facts (user_id, clave, valor, at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, clave) DO UPDATE SET valor = excluded.valor, at = excluded.at`).run(uid, clave, String(valor == null ? '' : valor));
}

function norm(s) { return String(s || '').trim().toLowerCase(); }
function itemName(it) { return (it && (it.nombre || it.titulo || it)) || ''; }
function itemsOf(digest) {
  const seen = new Set(); const out = [];
  for (const it of [...(digest.productos || []), ...(digest.servicios || [])]) {
    const n = itemName(it); if (!n || seen.has(norm(n))) continue; seen.add(norm(n)); out.push(n);
  }
  return out.slice(0, 12);
}
function starOf(digest, facts) {
  if (facts['respuesta:estrella'] && facts['respuesta:estrella'] !== SKIP) return facts['respuesta:estrella'];
  if (facts['correccion:estrella'] && facts['correccion:estrella'] !== SKIP) return facts['correccion:estrella'];
  const d = digest || {};
  if (d.dueno && d.dueno.estrella) return d.dueno.estrella;
  try { const s = clientDigest.effectiveStarOf(d); if (s) return s; } catch (e) {}
  return '';
}

/* ---------- Fichas: solo hechos reales del digest (corrección superpuesta) ---------- */
function fichasFor(digest, facts) {
  const d = digest || {};
  const fichas = [];
  const push = (f) => { if (f) fichas.push(f); };

  // Rubro (confirmado, no adivinado; si no hay, no hay ficha).
  const rubro = (d.rubro_id && d.rubro_id.rubro) || d.category || '';
  if (rubro) {
    const sub = (d.rubro_id && d.rubro_id.subrubro) || d.subcat || '';
    const corr = facts['correccion:rubro'];
    const cur = corr && corr !== SKIP ? corr : rubro;
    const curSub = corr ? '' : sub;
    const opts = [];
    const seen = new Set([cur]);
    opts.push({ valor: cur, es: labelFor(cur, curSub, 'es'), en: labelFor(cur, curSub, 'en'), actual: true });
    for (const r of RUBROS) {
      if (opts.length >= 4 || seen.has(r)) continue; seen.add(r);
      opts.push({ valor: r, es: labelFor(r, '', 'es'), en: labelFor(r, '', 'en'), actual: false });
    }
    push({ id: 'rubro', es: 'Tu rubro', en: 'Your niche',
      valor: labelFor(cur, curSub, 'es'), valor_en: labelFor(cur, curSub, 'en'),
      corregida: !!corr, opciones: opts });
  }

  // Oferta real / producto estrella.
  const star = starOf(d, facts);
  const items = itemsOf(d);
  if (star || items.length) {
    const cur = star || items[0];
    const opts = [];
    const seen = new Set();
    for (const n of [cur, ...items]) {
      if (!n || seen.has(norm(n)) || opts.length >= 5) continue; seen.add(norm(n));
      opts.push({ valor: n, es: n, en: n, actual: norm(n) === norm(cur) });
    }
    push({ id: 'estrella', es: 'Tu producto estrella', en: 'Your star product',
      valor: cur, valor_en: cur, corregida: !!(facts['correccion:estrella'] || facts['respuesta:estrella']),
      opciones: opts });
  }

  // Paleta del feed (la que manda, no el logo): solo hex reales del digest.
  const pal = Array.isArray(d.paleta) ? d.paleta.filter((x) => x && /^#[0-9A-Fa-f]{6}$/.test(x.hex || '')) : [];
  if (pal.length) {
    const principalCorr = facts['correccion:paleta_principal'];
    const ordered = principalCorr ? [...pal].sort((a, b) =>
      (norm(b.hex) === norm(principalCorr) ? 1 : 0) - (norm(a.hex) === norm(principalCorr) ? 1 : 0)) : pal;
    push({ id: 'paleta', es: 'Los colores de tu feed', en: 'Your feed colors',
      valor: ordered.map((x) => x.hex).join(' '), valor_en: ordered.map((x) => x.hex).join(' '),
      colores: ordered.map((x) => x.hex), corregida: !!principalCorr,
      opciones: pal.map((x) => ({ valor: x.hex, es: x.hex, en: x.hex, actual: norm(x.hex) === norm(ordered[0].hex) })) });
  }

  // Tono visual del feed (registro light/dark del digest, no inventado).
  if (d.registro === 'light' || d.registro === 'dark') {
    const corr = facts['correccion:registro'];
    const cur = (corr === 'light' || corr === 'dark') ? corr : d.registro;
    push({ id: 'registro', es: 'El tono de tu feed', en: 'Your feed tone',
      valor: cur === 'light' ? 'Claro y luminoso' : 'Oscuro y elegante',
      valor_en: cur === 'light' ? 'Bright and light' : 'Dark and elegant',
      corregida: !!corr,
      opciones: [
        { valor: 'light', es: 'Claro y luminoso', en: 'Bright and light', actual: cur === 'light' },
        { valor: 'dark', es: 'Oscuro y elegante', en: 'Dark and elegant', actual: cur === 'dark' },
      ] });
  }

  // Protagonista (solo si el digest lo leyó de su bio/descripción).
  if (d.protagonista) {
    const corr = facts['correccion:protagonista'];
    const cur = (corr && corr !== SKIP) ? corr : d.protagonista;
    const base = [cur, 'el dueño', 'el equipo', 'el producto'];
    const opts = []; const seen = new Set();
    for (const n of base) { if (!n || seen.has(norm(n))) continue; seen.add(norm(n)); opts.push({ valor: n, es: n, en: n, actual: norm(n) === norm(cur) }); }
    push({ id: 'protagonista', es: 'El protagonista', en: 'The star of the show',
      valor: cur, valor_en: cur, corregida: !!corr, opciones: opts });
  }

  return fichas;
}

/* ---------- Huecos: solo lo que el digest NO tiene (máximo 3, en orden) ---------- */
function huecosFor(digest, facts) {
  const d = digest || {};
  const dueno = (d.dueno && typeof d.dueno === 'object') ? d.dueno : {};
  // Una pregunta salteada tampoco vuelve en el momento (no es respuesta,
  // pero el momento ya la mostró: preguntarla de nuevo rompería la magia).
  const seen = (clave) => facts[clave] !== undefined && facts[clave] !== '';
  const items = itemsOf(d);
  const out = [];

  // 1 · Meta: qué querés que pase cuando alguien ve tu Instagram.
  if (!seen('respuesta:meta') && !dueno.meta) {
    out.push({ id: 'meta',
      es: '¿Qué querés que pase cuando alguien ve tu Instagram?',
      en: 'What do you want to happen when someone sees your Instagram?',
      opciones: [
        { valor: 'venir', es: 'Que venga al local', en: 'Come to the shop' },
        { valor: 'comprar', es: 'Que compre', en: 'Buy' },
        { valor: 'escribir', es: 'Que te escriba', en: 'Message you' },
      ] });
  }
  // 2 · Nunca publicar: el límite que el dueño fija una sola vez.
  if (!seen('respuesta:no_publicar') && !dueno.no_publicar) {
    out.push({ id: 'no_publicar',
      es: '¿Hay algo que NUNCA querés que Posty publique?',
      en: 'Is there anything you NEVER want Posty to post?',
      opciones: [
        { valor: 'sorteos', es: 'Sorteos', en: 'Giveaways' },
        { valor: 'descuentos', es: 'Descuentos', en: 'Discounts' },
        { valor: 'clientes_sin_permiso', es: 'Fotos de clientes sin permiso', en: 'Customer photos without permission' },
        { valor: 'nada', es: 'Nada en particular', en: 'Nothing in particular' },
      ] });
  }
  // 3 · Estrella: solo si hay ítems reales entre los que elegir.
  if (!seen('respuesta:estrella') && !dueno.estrella && !starOf(d, facts) && items.length) {
    out.push({ id: 'estrella',
      es: '¿Cuál es tu producto estrella, el que más querés vender?',
      en: 'Which is your star product, the one you most want to sell?',
      opciones: items.slice(0, 4).map((n) => ({ valor: n, es: n, en: n })) });
  }
  // 4 · Más vendido (si hay ítems y aún no se declaró).
  if (!seen('respuesta:mas_vendido') && !dueno.mas_vendido && items.length > 1) {
    out.push({ id: 'mas_vendido',
      es: '¿Qué es lo que más se vende hoy en tu negocio?',
      en: 'What sells best in your business today?',
      opciones: items.slice(0, 4).map((n) => ({ valor: n, es: n, en: n })) });
  }
  // 5 · Cliente ideal (declaración del dueño; opciones genéricas, no un dato inventado).
  if (!seen('respuesta:cliente') && !dueno.cliente) {
    out.push({ id: 'cliente',
      es: '¿Quién es tu cliente ideal?',
      en: 'Who is your ideal customer?',
      opciones: [
        { valor: 'vecinos', es: 'Vecinos del barrio', en: 'Neighbors' },
        { valor: 'familias', es: 'Familias', en: 'Families' },
        { valor: 'jovenes', es: 'Jóvenes', en: 'Young people' },
        { valor: 'turistas', es: 'Turistas', en: 'Tourists' },
      ] });
  }
  return out.slice(0, MAX_PREGUNTAS);
}

function etiquetaRespuesta(id, valor) {
  const mapas = {
    meta: { venir: ['Que venga al local', 'Come to the shop'], comprar: ['Que compre', 'Buy'], escribir: ['Que te escriba', 'Message you'] },
    no_publicar: { sorteos: ['Nunca: sorteos', 'Never: giveaways'], descuentos: ['Nunca: descuentos', 'Never: discounts'], clientes_sin_permiso: ['Nunca: fotos de clientes sin permiso', 'Never: customer photos without permission'], nada: ['Nada en particular', 'Nothing in particular'] },
    cliente: { vecinos: ['Vecinos del barrio', 'Neighbors'], familias: ['Familias', 'Families'], jovenes: ['Jóvenes', 'Young people'], turistas: ['Turistas', 'Tourists'] },
  };
  const m = (mapas[id] || {})[valor];
  if (m) return { es: m[0], en: m[1] };
  return { es: valor, en: valor }; // estrella / más vendido: el valor ES la etiqueta
}

function momentoFor(db, uid) {
  let digest = null;
  try { digest = clientDigest.getDigest(db, uid); } catch (e) { digest = clientDigest.emptyDigest(); }
  const facts = factsOf(db, uid);
  const fichas = fichasFor(digest, facts);
  const preguntas = huecosFor(digest, facts);
  const respondidas = [];
  for (const k of ['respuesta:meta', 'respuesta:no_publicar', 'respuesta:estrella', 'respuesta:mas_vendido', 'respuesta:cliente']) {
    if (facts[k] && facts[k] !== SKIP) {
      const id = k.replace('respuesta:', '');
      respondidas.push({ id, valor: facts[k], etiqueta: etiquetaRespuesta(id, facts[k]) });
    }
  }
  return { fichas, preguntas, respondidas, negocio: (digest && digest.business) || '' };
}

/* Aplica una respuesta: el servidor recomputa los huecos y rechaza todo lo
 * que no sea un hueco real con una opción real (nunca se acepta «lo sabido»). */
function responder(db, uid, pregunta, valor) {
  let digest = null;
  try { digest = clientDigest.getDigest(db, uid); } catch (e) { digest = clientDigest.emptyDigest(); }
  const facts = factsOf(db, uid);
  const hueco = huecosFor(digest, facts).find((h) => h.id === pregunta);
  if (!hueco) return { ok: false, error: 'no_hueco' };
  const opt = hueco.opciones.find((o) => o.valor === valor);
  if (!opt) return { ok: false, error: 'opcion_invalida' };
  setFact(db, uid, 'respuesta:' + pregunta, valor);
  // Espejo durable en el bloque dueno (fuente más fuerte; el refresco lo preserva).
  try {
    const d = clientDigest.getDigest(db, uid) || clientDigest.emptyDigest();
    d.dueno = { ...(d.dueno || {}), [pregunta]: valor };
    clientDigest.saveDigest(db, uid, d);
  } catch (e) {}
  return { ok: true, momento: momentoFor(db, uid) };
}

function saltear(db, uid, pregunta) {
  let digest = null;
  try { digest = clientDigest.getDigest(db, uid); } catch (e) { digest = clientDigest.emptyDigest(); }
  const facts = factsOf(db, uid);
  const hueco = huecosFor(digest, facts).find((h) => h.id === pregunta);
  if (!hueco) return { ok: false, error: 'no_hueco' };
  setFact(db, uid, 'respuesta:' + pregunta, SKIP);
  return { ok: true, momento: momentoFor(db, uid) };
}

/* Corrección de una ficha: solo opciones reales de esa ficha (nunca libre). */
function corregir(db, uid, ficha, valor) {
  let digest = null;
  try { digest = clientDigest.getDigest(db, uid); } catch (e) { digest = clientDigest.emptyDigest(); }
  const facts = factsOf(db, uid);
  const f = fichasFor(digest, facts).find((x) => x.id === ficha);
  if (!f || !Array.isArray(f.opciones)) return { ok: false, error: 'ficha_no_corregible' };
  const opt = f.opciones.find((o) => o.valor === valor);
  if (!opt) return { ok: false, error: 'opcion_invalida' };
  const clave = 'correccion:' + (ficha === 'paleta' ? 'paleta_principal' : ficha);
  setFact(db, uid, clave, valor);
  // Espejo en dueno donde el campo existe (estrella, protagonista): la
  // próxima semana ya lo aplica; el resto vive en onboarding_facts y la
  // vista lo superpone siempre.
  try {
    if (ficha === 'estrella' || ficha === 'protagonista') {
      const d = clientDigest.getDigest(db, uid) || clientDigest.emptyDigest();
      d.dueno = { ...(d.dueno || {}), [ficha]: valor };
      clientDigest.saveDigest(db, uid, d);
    }
  } catch (e) {}
  return { ok: true, momento: momentoFor(db, uid) };
}

module.exports = {
  MAX_PREGUNTAS, SKIP, ensureTable, factsOf, fichasFor, huecosFor, momentoFor,
  responder, saltear, corregir,
};
