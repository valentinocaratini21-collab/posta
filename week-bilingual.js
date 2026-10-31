// SEMANA-DOS-IDIOMAS
// week-bilingual — SEMANA DOS IDIOMAS (aprobado Valentino 30/10 ~01:22 EDT).
//
// Opt-in por cliente, APAGADO por defecto. La misma semana en español y en
// inglés: misma idea, caption traducida de verdad (nunca contenido nuevo).
// Para negocios con turistas o clientes en inglés.
//
// REGLAS DURAS que este módulo hace cumplir con código (no con promesas):
//   1. Sin opt-in, nada cambia: bilingualizeWeek() no llama al traductor ni
//      escribe nada cuando users.bilingual_week no es 1.
//   2. La versión EN es TRADUCCIÓN fiel de la pieza ES: checkParity() exige
//      que todos los hechos medibles del ES estén en el EN (números,
//      precios, %, promos NxM, fechas, horas, URLs, # y @) y que el EN no
//      agregue ningún hecho nuevo. Si falla, el EN NO se guarda.
//   3. NO cambia el idioma de la app: este módulo jamás lee ni escribe
//      users.lang. Solo lee/escribe users.bilingual_week y los campos EN
//      de la pieza (posts.caption_en / headline_en / bilingual_status).
//   4. Las reglas de posteo valen en los dos idiomas: checkPostingRules()
//      corre sobre la pieza ES y sobre la EN (una idea por pieza, sin
//      mayúsculas forzadas, texto solo en banda superior/inferior, nunca
//      en el centro ni sobre el sujeto, sin botones CTA dibujados).
//   5. Sin traductor no hay EN inventado: translateWeekPiece() sin
//      translateFn devuelve { ok: false, reason: 'no_translator' } y en
//      null. El EN nunca se fabrica con plantillas ni con el texto ES.
//
// El módulo NO depende de server.js ni del generador: recibe la `db`
// inyectada (forma better-sqlite3: prepare().get()/.run()) y el traductor
// inyectado (async (esPiece) => ({ caption, headline })). En producción el
// traductor es una llamada al modelo con FAITHFUL_TRANSLATION_PROMPT; en
// tests es un stub. La paridad se verifica SIEMPRE, venga de donde venga
// el texto EN.
//
// LÍMITE HONESTO: la paridad cubre hechos medibles. El nombre del negocio
// (que no se traduce ni se deforma, regla TITULO-14 / VOZ-46 del generador)
// lo cubre el prompt + la revisión humana de siempre; no hay forma
// genérica de verificarlo con código sin el ADN del negocio adentro.

const FAITHFUL_TRANSLATION_PROMPT = [
  'Translate the following Instagram post faithfully from Spanish (Rioplatense) to English.',
  'STRICT RULES:',
  '1. Same idea, same facts, same data: every number, price, percentage, date, time, promo (e.g. 2x1), URL, hashtag and @mention in the Spanish text MUST appear unchanged in the English text.',
  '2. NEVER add new claims, offers, prices, dates, hashtags or facts that are not in the Spanish text.',
  '3. NEVER translate or deform the business name, its slogan or its brand hashtag: copy them letter for letter.',
  '4. Keep the same tone and the same length class (do not turn a short caption into a long one).',
  '5. Do not force UPPERCASE. Do not add a drawn call-to-action button or button text.',
  '6. If a headline is given, translate it with 6 words or fewer.',
  'Return ONLY JSON: {"caption": "...", "headline": "..."}.',
].join('\n');

// ---------- hechos medibles ----------

function normalizeNumber(tok) {
  const t = String(tok || '').trim();
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return t.replace(/[.,]/g, ''); // miles: 2.500 / 2,500 -> 2500
  if (/^\d+,\d+$/.test(t)) return t.replace(',', '.'); // decimal con coma -> punto
  return t;
}

// Extrae el conjunto de hechos medibles de un texto. Se enmascaran los
// tramos ya consumidos para no contar dos veces el mismo dígito (un precio
// no vuelve a aparecer como "número suelto").
function extractFacts(text) {
  const facts = new Set();
  let s = String(text || '');
  const take = (re, fmt) => {
    s = s.replace(re, (m, ...groups) => {
      const v = fmt ? fmt(m, groups) : m;
      if (v) facts.add(v);
      return ' '.repeat(m.length);
    });
  };
  take(/https?:\/\/[^\s)]+/gi, (m) => 'url:' + m.toLowerCase());
  take(/@[A-Za-z0-9_.-]+/g, (m) => 'mention:' + m.toLowerCase());
  take(/#[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ]+/g, (m) => 'hashtag:' + m.toLowerCase());
  take(/\d+\s*x\s*\d+/gi, (m) => 'promo:' + m.replace(/\s+/g, '').toLowerCase());
  take(/(\d+(?:[.,]\d+)?)\s*%/g, (m, g) => 'pct:' + normalizeNumber(g[0]));
  take(/(\$|USD|US\$)\s*(\d+(?:[.,]\d+)?)/gi, (m, g) => 'cur:' + normalizeNumber(g[1]));
  take(/(\d+(?:[.,]\d+)?)\s*(USD|pesos)/gi, (m, g) => 'cur:' + normalizeNumber(g[0]));
  take(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, (m) => 'date:' + m);
  take(/\b\d{1,2}:\d{2}\b/g, (m) => 'time:' + m);
  take(/\b\d+(?:[.,]\d+)?\b/g, (m) => 'num:' + normalizeNumber(m));
  return facts;
}

// Paridad ES -> EN: todo hecho del ES debe estar en el EN, y el EN no
// puede traer ningún hecho nuevo. La prosa puede (debe) cambiar: eso es
// traducir. Los hechos, no.
function checkParity(esText, enText) {
  const es = extractFacts(esText);
  const en = extractFacts(enText);
  const missing = [...es].filter((f) => !en.has(f)).sort();
  const added = [...en].filter((f) => !es.has(f)).sort();
  return { ok: missing.length === 0 && added.length === 0, missing, added };
}

// ---------- reglas de posteo (valen en los dos idiomas) ----------

function checkPostingRules(piece) {
  const failures = [];
  const p = piece || {};
  const caption = String(p.caption || '');
  const headline = String(p.headline || '');
  if (!caption.trim()) failures.push('empty_caption');
  // Sin mayúsculas forzadas: si hay 20+ letras y más del 80% son
  // mayúsculas, es forzado (siglas sueltas o frases cortas no disparan).
  const letters = caption.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || [];
  const uppers = caption.match(/[A-ZÁÉÍÓÚÜÑ]/g) || [];
  if (letters.length >= 20 && uppers.length / letters.length > 0.8) failures.push('forced_uppercase');
  // Titular de 6 palabras o menos, cuando la pieza lleva titular.
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (words.length > 6) failures.push('headline_too_long');
  // Texto solo en banda superior/inferior: nunca centro ni sobre el sujeto.
  const band = String(p.text_band || '').trim().toLowerCase();
  if (band && band !== 'top' && band !== 'bottom') failures.push('text_in_center_or_over_subject');
  // Sin botones CTA dibujados.
  if (p.cta_button_drawn) failures.push('cta_button_drawn');
  // Una idea por pieza.
  if (Array.isArray(p.ideas) && p.ideas.length > 1) failures.push('more_than_one_idea');
  if (Number(p.idea_count) > 1) failures.push('more_than_one_idea');
  return { ok: failures.length === 0, failures };
}

// Paridad + reglas en ambos idiomas para un par ES/EN ya armado.
function checkBilingualPiece(esPiece, enPiece) {
  const parity = checkParity(
    [String((esPiece || {}).caption || ''), String((esPiece || {}).headline || '')].join('\n'),
    [String((enPiece || {}).caption || ''), String((enPiece || {}).headline || '')].join('\n'),
  );
  const rulesEs = checkPostingRules(esPiece);
  const rulesEn = checkPostingRules(enPiece);
  return { ok: parity.ok && rulesEs.ok && rulesEn.ok, parity, rulesEs, rulesEn };
}

// Traduce UNA pieza ES con el traductor inyectado y valida el resultado.
// Nunca devuelve un EN sin validar: ante cualquier fallo, en = null.
async function translateWeekPiece(esPiece, translateFn) {
  const es = esPiece || {};
  if (typeof translateFn !== 'function') return { ok: false, reason: 'no_translator', en: null };
  let raw;
  try {
    raw = await translateFn({ caption: String(es.caption || ''), headline: String(es.headline || ''), idea: es.idea || es.topic || '' });
  } catch (e) {
    return { ok: false, reason: 'translator_error', detail: String((e && e.message) || e), en: null };
  }
  const en = { caption: String((raw && raw.caption) || ''), headline: String((raw && raw.headline) || '') };
  if (!en.caption.trim()) return { ok: false, reason: 'empty_translation', en: null };
  const check = checkBilingualPiece(
    { caption: es.caption, headline: es.headline, text_band: es.text_band, cta_button_drawn: es.cta_button_drawn, ideas: es.ideas, idea_count: es.idea_count },
    { caption: en.caption, headline: en.headline, text_band: es.text_band, cta_button_drawn: es.cta_button_drawn, ideas: es.ideas, idea_count: es.idea_count },
  );
  if (!check.ok) {
    const reason = !check.parity.ok ? 'parity' : 'rules';
    return { ok: false, reason, detail: check, en: null };
  }
  return { ok: true, en, status: 'ready' };
}

// ---------- estado durable (opt-in, default 0) ----------

// Default 0: sin fila, con 0, o sin columna (DB anterior a la migración) -> false.
// Jamás lanza: un toggle que no se puede leer es un toggle apagado.
function isBilingualWeekEnabled(db, uid) {
  try {
    const r = db.prepare('SELECT bilingual_week FROM users WHERE id = ?').get(uid);
    return !!(r && r.bilingual_week === 1);
  } catch (e) { return false; }
}

function setBilingualWeek(db, uid, on) {
  try {
    db.prepare('UPDATE users SET bilingual_week = ? WHERE id = ?').run(on ? 1 : 0, uid);
    return { ok: true, enabled: !!on };
  } catch (e) { return { ok: false, enabled: false, reason: String((e && e.message) || e) }; }
}

// Guarda el EN validado en la pieza. Si la paridad/reglas fallaron, NO
// escribe caption_en/headline_en: marca el bloqueo y deja la pieza solo ES.
function attachBilingualToPost(db, postId, enCaption, enHeadline, check) {
  try {
    if (!check || !check.ok) {
      const status = check && check.reason ? 'blocked_' + check.reason : 'blocked';
      db.prepare('UPDATE posts SET bilingual_status = ? WHERE id = ?').run(status, postId);
      return { ok: false, status };
    }
    db.prepare('UPDATE posts SET caption_en = ?, headline_en = ?, bilingual_status = ? WHERE id = ?')
      .run(String(enCaption || ''), String(enHeadline || ''), 'ready', postId);
    return { ok: true, status: 'ready' };
  } catch (e) { return { ok: false, status: 'error', reason: String((e && e.message) || e) }; }
}

// La semana entera: si el opt-in está apagado, NO se llama al traductor y
// NO se escribe nada (esta es la garantía "sin opt-in, nada cambia").
// postRows: filas { id, caption, headline, idea?, text_band?, ... } de la
// semana ES ya generada. Devuelve el par por pieza (misma idea, mismo id).
async function bilingualizeWeek(db, uid, postRows, translateFn) {
  if (!isBilingualWeekEnabled(db, uid)) return { ok: true, skipped: 'disabled', done: 0, blocked: 0, pairs: [] };
  const pairs = [];
  let done = 0, blocked = 0;
  for (const row of Array.isArray(postRows) ? postRows : []) {
    const es = { caption: row.caption, headline: row.headline, idea: row.idea || row.topic || '', text_band: row.text_band, cta_button_drawn: row.cta_button_drawn, ideas: row.ideas, idea_count: row.idea_count };
    const t = await translateWeekPiece(es, translateFn);
    if (t.ok) {
      attachBilingualToPost(db, row.id, t.en.caption, t.en.headline, { ok: true });
      pairs.push({ id: row.id, idea: es.idea, es: { caption: es.caption, headline: es.headline }, en: t.en, status: 'ready' });
      done++;
    } else {
      attachBilingualToPost(db, row.id, '', '', { ok: false, reason: t.reason || 'blocked' });
      pairs.push({ id: row.id, idea: es.idea, es: { caption: es.caption, headline: es.headline }, en: null, status: 'blocked_' + (t.reason || 'blocked') });
      blocked++;
    }
  }
  return { ok: true, skipped: null, done, blocked, pairs };
}

module.exports = {
  FAITHFUL_TRANSLATION_PROMPT,
  extractFacts,
  checkParity,
  checkPostingRules,
  checkBilingualPiece,
  translateWeekPiece,
  isBilingualWeekEnabled,
  setBilingualWeek,
  attachBilingualToPost,
  bilingualizeWeek,
};
