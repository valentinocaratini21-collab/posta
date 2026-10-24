'use strict';
/* =====================================================================
 * taste-memory.js — 🧠 MEMORIA DE GUSTOS (v392)
 *
 * Posty aprende de las ediciones del cliente y no se lo hace repetir.
 * Dos vías, ninguna silenciosa:
 *
 *  1) EXPLÍCITA: el cliente dice una preferencia estable en el chat
 *     («sin hashtags», «de ahora en más, textos cortos») → se anota al
 *     instante y Posty lo confirma en su voz de chat (ese acuse ES el
 *     momento del producto). La detección vive en detectExplicit() y el
 *     cableado en el atajo determinístico de POST /api/ideas/chat.
 *
 *  2) POR PATRÓN (con confirmación): la MISMA corrección 2+ veces
 *     (acorta dos captions, saca los hashtags dos veces) suma EVIDENCIA;
 *     a las 2 nace una PROPUESTA que el chat muestra con botones (o se
 *     responde con un «sí» pelado). Sin confirmación NO se aprende.
 *     Esta vía REEMPLAZA la activación silenciosa que style-learn hacía
 *     sobre style_rules al 2º hit: la evidencia ya no activa nada sola.
 *
 * REGISTRO canónico: el fundamento de la cuenta (client_digest):
 *   digest.gustos            [{ id, tipo, valor, label_es/en,
 *                               texto_es/en, origen, ejemplo, at,
 *                               estado: 'activo'|'pausa_regla', regla }]
 *   digest.gustos_pendientes [{ tipo, valor, ejemplo, hits, at }]
 *   digest.gustos_evidencia  { [key]: { hits, ejemplo, ultima } }
 *   digest.gustos_rechazos   { [key]: at }  (cooldown tras un «no»)
 * Viajan con el digest, se auditan con él, y el refresco semanal los
 * preserva (applyDeepBlocks parte del digest guardado).
 *
 * APLICACIÓN: el gusto ACTIVO se sincroniza a style_rules
 * (rule_key 'gusto-…'), el canal que TODOS los generadores ya consumen
 * con la jerarquía del fundamento (ideasInputFor / contentInputFor →
 * levelBoosted → tasteBlock; captions, ideas e instrucciones de
 * imagen). Borrar el gusto borra la fila: deja de aplicar en la
 * próxima generación.
 *
 * FRONTERA DURA: un gusto NUNCA pisa una regla de la casa. El motor de
 * conflicto (conflictFor) deja en «pausa_regla» — visible en la
 * pantalla, jamás sincronizado — lo que choca con: el pie de foto
 * nunca en mayúsculas · nada de botones dibujados en la imagen ·
 * nunca inventar precios, descuentos ni promos. La regla gana y el
 * cliente lo VE: honestidad visible, no obediencia silenciosa.
 * ===================================================================== */

const clientDigest = require('./client-digest');

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function countEmojis(s) {
  return (String(s || '').match(EMOJI_RE) || []).length;
}
function keyOf(g) {
  const tipo = (g && g.tipo) || '';
  const valor = (g && g.valor) || '';
  return tipo + (valor ? '::' + norm(valor) : '');
}
function styleRuleKey(g) {
  return ('gusto-' + keyOf(g)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function fechaCorta(iso) {
  const d = new Date(iso || Date.now());
  if (isNaN(d.getTime())) return '';
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/* ---------- reglas duras de la casa (el gusto nunca las pisa) ---------- */
const HARD_RULES = {
  mayusculas: { es: 'los textos nunca van todos en mayúsculas', en: 'texts never run in all caps' },
  botones: { es: 'nada de botones dibujados dentro de la imagen', en: 'no buttons drawn inside the image' },
  inventar: { es: 'nunca se inventan precios, descuentos ni promos', en: 'prices, discounts and promos are never made up' },
};

function conflictFor(tipo, valor) {
  if (tipo === 'todo_mayusculas') return 'mayusculas';
  if (tipo === 'botones_imagen') return 'botones';
  if (tipo === 'libre') {
    const t = ' ' + norm(valor) + ' ';
    if (/mayusculas|all caps|uppercase/.test(t)) return 'mayusculas';
    if (/(boton|button).{0,24}(imagen|foto|image|photo|picture)/.test(t)) return 'botones';
    if (/(invent\w*|hacele|pone cualquier|ponele cualquier).{0,28}(descuento|precio|promo|oferta|discount|price)/.test(t)) return 'inventar';
    if (/descuentos? (inventad|falsos?)|fake (discount|promo)/.test(t)) return 'inventar';
  }
  return null;
}

/* ---------- catálogo de gustos ---------- */
const TIPOS = {
  sin_hashtags: {
    label: { es: 'sin hashtags', en: 'no hashtags' },
    rule: {
      es: 'El cliente NO quiere hashtags: el caption va SIN hashtags y el campo de hashtags queda vacío.',
      en: 'The client does NOT want hashtags: captions carry NO hashtags and the hashtag field stays empty.',
    },
    ack: { es: 'anotado 📝 de ahora en más, sin hashtags', en: 'noted 📝 from now on, no hashtags' },
    proposal: {
      es: 'noté que sacaste los hashtags dos veces 📝 anoto que los posteos vayan siempre sin hashtags?',
      en: 'i noticed you removed the hashtags twice 📝 should i note that posts always go without hashtags?',
    },
  },
  sin_emojis: {
    label: { es: 'sin emojis', en: 'no emojis' },
    rule: {
      es: 'El cliente prefiere captions SIN emojis (máximo 1 solo si es inevitable).',
      en: 'The client prefers captions with NO emojis (at most 1 only if unavoidable).',
    },
    ack: { es: 'anotado 📝 de ahora en más, sin emojis', en: 'noted 📝 from now on, no emojis' },
    proposal: {
      es: 'noté que sacaste los emojis dos veces 📝 anoto que los textos vayan siempre sin emojis?',
      en: 'i noticed you removed the emojis twice 📝 should i note that texts always go without emojis?',
    },
  },
  mas_corto: {
    label: { es: 'textos cortos', en: 'short texts' },
    rule: {
      es: 'El cliente prefiere textos CORTOS y directos: captions breves, al punto, sin vueltas.',
      en: 'The client prefers SHORT, direct texts: brief captions, to the point, no rambling.',
    },
    ack: { es: 'anotado 📝 de ahora en más, textos cortos y al punto', en: 'noted 📝 from now on, short texts, to the point' },
    proposal: {
      es: 'noté que acortaste los textos dos veces 📝 anoto que vayan siempre cortos y al punto?',
      en: 'i noticed you shortened the texts twice 📝 should i note that they always stay short and to the point?',
    },
  },
  con_precio: {
    label: { es: 'siempre con precio (cuando hay uno real)', en: 'always with the price (when there is a real one)' },
    rule: {
      es: 'Al cliente le sirve que el caption mencione el precio: cuando el posteo es de un producto o servicio con precio REAL en el fundamento, mencionalo (y las cuotas si están). Nunca inventes un precio.',
      en: 'The client wants the price mentioned: when a post is about a product or service with a REAL price in the foundation, mention it (and installments if listed). Never make up a price.',
    },
    ack: { es: 'anotado 📝 cuando haya precio real, va siempre en el texto', en: 'noted 📝 whenever there is a real price, it goes in the text' },
    proposal: {
      es: 'noté que agregaste el precio dos veces 📝 anoto que, cuando haya precio real, vaya siempre en el texto?',
      en: 'i noticed you added the price twice 📝 should i note that, when there is a real price, it always goes in the text?',
    },
  },
  sin_texto_imagen: {
    label: { es: 'imágenes sin texto', en: 'images without text' },
    rule: {
      es: 'El cliente NO quiere texto dentro de las imágenes: fotos limpias, sin titulares ni textos dibujados (la venta va en el caption).',
      en: 'The client does NOT want text inside the images: clean photos, no headlines or drawn text (the selling happens in the caption).',
    },
    ack: { es: 'anotado 📝 de ahora en más, las imágenes sin texto', en: 'noted 📝 from now on, images with no text on them' },
    proposal: {
      es: 'noté que pediste las imágenes sin texto dos veces 📝 anoto que las fotos vayan siempre limpias, sin texto?',
      en: 'i noticed you asked for text-free images twice 📝 should i note that photos always stay clean, with no text?',
    },
  },
};

function textsFor(tipo, valor) {
  if (TIPOS[tipo]) return TIPOS[tipo];
  if (tipo === 'palabra_prohibida') {
    return {
      label: { es: `nunca la palabra «${valor}»`, en: `never the word "${valor}"` },
      rule: {
        es: `El cliente NO quiere la palabra o frase «${valor}»: nunca la uses en captions, titulares ni textos de imagen.`,
        en: `The client does NOT want the word or phrase "${valor}": never use it in captions, headlines or image text.`,
      },
      ack: { es: `anotado 📝 nunca más la palabra «${valor}»`, en: `noted 📝 never the word "${valor}" again` },
    };
  }
  if (tipo === 'todo_mayusculas') {
    return {
      label: { es: 'todo en mayúsculas', en: 'everything in uppercase' },
      rule: { es: '', en: '' },
      ack: { es: 'anotado 📝 todo en mayúsculas', en: 'noted 📝 everything in uppercase' },
    };
  }
  if (tipo === 'botones_imagen') {
    return {
      label: { es: 'botones dentro de la imagen', en: 'buttons inside the image' },
      rule: { es: '', en: '' },
      ack: { es: 'anotado 📝 botones dentro de la imagen', en: 'noted 📝 buttons inside the image' },
    };
  }
  // libre: el texto del cliente, tal cual lo pidió.
  const v = String(valor || '').slice(0, 140);
  return {
    label: { es: v, en: v },
    rule: {
      es: `Gusto permanente del cliente (lo pidió él): ${v}.`,
      en: `Standing taste from the client (they asked for it): ${v}.`,
    },
    ack: { es: `anotado 📝 ${v}`.slice(0, 160), en: `noted 📝 ${v}`.slice(0, 160) },
  };
}

function ackFor(gusto, lang) {
  const en = lang === 'en';
  const t = textsFor(gusto.tipo, gusto.valor || '');
  let ack = (en ? t.ack.en : t.ack.es) || '';
  if (gusto.estado === 'pausa_regla') {
    const regla = en ? (gusto.regla_en || '') : (gusto.regla || '');
    ack = en
      ? `noted 📝 it's saved, but paused: it clashes with a quality rule (${regla}) — the rule wins. you can see it in settings, under what i've learned from you`
      : `anotado 📝 queda guardado, pero en pausa: choca con una regla de calidad (${regla}) — la regla manda. lo ves en ajustes, en «lo que aprendí de vos»`;
  }
  return ack;
}

function proposalTextFor(pend, lang) {
  const t = TIPOS[pend && pend.tipo];
  if (!t || !t.proposal) return '';
  return lang === 'en' ? t.proposal.en : t.proposal.es;
}

/* ---------- estado (vive en el digest) ---------- */
function readState(db, userId) {
  let d = null;
  try { d = clientDigest.getStoredDigest(db, userId); } catch (e) {}
  if (!d || typeof d !== 'object') {
    try { d = clientDigest.getDigest(db, userId); } catch (e) { d = clientDigest.emptyDigest(); }
  }
  return {
    digest: d,
    gustos: Array.isArray(d.gustos) ? d.gustos : [],
    pendientes: Array.isArray(d.gustos_pendientes) ? d.gustos_pendientes : [],
    evidencia: (d.gustos_evidencia && typeof d.gustos_evidencia === 'object') ? d.gustos_evidencia : {},
    rechazos: (d.gustos_rechazos && typeof d.gustos_rechazos === 'object') ? d.gustos_rechazos : {},
  };
}
function saveState(db, userId, st) {
  const d = st.digest || clientDigest.emptyDigest();
  d.gustos = st.gustos;
  d.gustos_pendientes = st.pendientes;
  d.gustos_evidencia = st.evidencia;
  d.gustos_rechazos = st.rechazos;
  clientDigest.saveDigest(db, userId, d);
  return d;
}

/* ---------- sincronización a style_rules (canal del generador) ---------- */
function syncStyleRule(db, userId, gusto, lang) {
  try {
    const text = (lang === 'en' ? gusto.texto_en : gusto.texto_es) || gusto.texto_es || '';
    if (!text) return;
    db.prepare(`INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (?, ?, ?, 1, 1)
      ON CONFLICT(user_id, rule_key) DO UPDATE SET rule_text = excluded.rule_text, active = 1`)
      .run(userId, styleRuleKey(gusto), String(text).slice(0, 300));
  } catch (e) { /* la sincronización nunca rompe el aprendizaje */ }
}
function unsyncStyleRule(db, userId, gusto) {
  try {
    db.prepare('DELETE FROM style_rules WHERE user_id = ? AND rule_key = ?').run(userId, styleRuleKey(gusto));
  } catch (e) {}
}

/* ---------- aprender / olvidar ---------- */
function learn(db, userId, opts) {
  const tipo = String((opts && opts.tipo) || '');
  if (!tipo) return { gusto: null, dup: false };
  const valor = String((opts && opts.valor) || '').slice(0, 140);
  const st = readState(db, userId);
  const key = tipo + (valor ? '::' + norm(valor) : '');
  const existing = st.gustos.find((g) => keyOf(g) === key);
  if (existing) return { gusto: existing, dup: true };
  const conflict = conflictFor(tipo, valor);
  const texts = textsFor(tipo, valor);
  const gusto = {
    id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    tipo,
    valor,
    label_es: texts.label.es,
    label_en: texts.label.en,
    texto_es: texts.rule.es,
    texto_en: texts.rule.en,
    origen: (opts && opts.origen) === 'patron' ? 'patron' : 'explicito',
    ejemplo: String((opts && opts.ejemplo) || '').slice(0, 140),
    at: new Date().toISOString(),
    estado: conflict ? 'pausa_regla' : 'activo',
    regla: conflict ? HARD_RULES[conflict].es : null,
    regla_en: conflict ? HARD_RULES[conflict].en : null,
    regla_key: conflict || null,
  };
  st.gustos.push(gusto);
  st.pendientes = st.pendientes.filter((p) => keyOf(p) !== key);
  delete st.evidencia[key];
  saveState(db, userId, st);
  if (gusto.estado === 'activo') syncStyleRule(db, userId, gusto, opts && opts.lang);
  return { gusto, dup: false };
}

function forget(db, userId, gustoId) {
  const st = readState(db, userId);
  const idx = st.gustos.findIndex((g) => g.id === gustoId);
  if (idx < 0) return null;
  const [gusto] = st.gustos.splice(idx, 1);
  delete st.evidencia[keyOf(gusto)];
  saveState(db, userId, st);
  unsyncStyleRule(db, userId, gusto);
  return gusto;
}

/* La regla libre que dicta la IA del chat (out.rule) entra al registro:
 * si calza con un tipo del catálogo, se guarda como ese tipo; si no,
 * como gusto libre con el texto tal cual. */
function learnFromText(db, userId, text, lang) {
  const raw = String(text || '').trim().slice(0, 200);
  if (!raw) return { gusto: null, dup: false };
  const t = ' ' + norm(raw) + ' ';
  let det = null;
  if (/hashtag/.test(t)) det = { tipo: 'sin_hashtags', valor: '' };
  else if (/emoji/.test(t)) det = { tipo: 'sin_emojis', valor: '' };
  else if (/mayuscula|all caps|uppercase/.test(t)) det = { tipo: 'todo_mayusculas', valor: '' };
  else if (/sin texto.{0,20}(imagen|foto)|no text.{0,16}(image|photo)/.test(t)) det = { tipo: 'sin_texto_imagen', valor: '' };
  else if (/(texto|caption).{0,20}(corto|breve)|cortos? siempre|short/.test(t)) det = { tipo: 'mas_corto', valor: '' };
  else if (/precio|price/.test(t)) det = { tipo: 'con_precio', valor: '' };
  if (!det) det = { tipo: 'libre', valor: raw };
  return learn(db, userId, { ...det, origen: 'explicito', ejemplo: raw, lang });
}

function forgetByText(db, userId, text) {
  const k = norm(String(text || '')).replace(/\s+/g, ' ').trim();
  if (!k) return null;
  const st = readState(db, userId);
  const g = st.gustos.find((x) =>
    norm(x.texto_es || '').replace(/\s+/g, ' ').trim() === k ||
    norm(x.label_es || '').replace(/\s+/g, ' ').trim() === k ||
    norm(x.valor || '').replace(/\s+/g, ' ').trim() === k ||
    styleRuleKey(x) === String(text || '').toLowerCase());
  if (!g) return null;
  return forget(db, userId, g.id);
}

/* ---------- vía patrón: evidencia desde ediciones de caption ---------- */
function detectCorrections(oldCaption, newCaption, oldHashtags, newHashtags) {
  const oldC = String(oldCaption || '');
  const newC = String(newCaption || '');
  const oldH = String(oldHashtags || '');
  const newH = String(newHashtags || '');
  const out = [];
  const hadTags = /#[\p{L}\p{N}_]+/u.test(oldC) || !!oldH.trim();
  const hasTags = /#[\p{L}\p{N}_]+/u.test(newC) || !!newH.trim();
  if (hadTags && !hasTags && (oldC !== newC || oldH !== newH)) out.push('sin_hashtags');
  if (oldC && newC && countEmojis(oldC) >= 2 && countEmojis(newC) === 0) out.push('sin_emojis');
  if (oldC && newC && newC.length < oldC.length * 0.7) out.push('mas_corto');
  if (oldC && newC && !/(\$|\bprecio\b|\bcuotas?\b)/i.test(oldC) && /(\$|\bprecio\b|\bcuotas?\b)/i.test(newC)) out.push('con_precio');
  return out;
}

function noteCaptionEdit(db, userId, edit) {
  const detected = detectCorrections(
    edit && edit.oldCaption, edit && edit.newCaption, edit && edit.oldHashtags, edit && edit.newHashtags);
  if (!detected.length) return { hits: [], propuesta: null };
  const st = readState(db, userId);
  const ejemplo = String((edit && edit.newCaption) || '').slice(0, 140);
  let propuesta = null;
  for (const tipo of detected) {
    const key = tipo;
    if (st.gustos.some((g) => keyOf(g) === key)) continue; // ya es gusto: no se propone de nuevo
    const ev = st.evidencia[key] || (st.evidencia[key] = { hits: 0, ejemplo: '', ultima: null });
    ev.hits = (ev.hits || 0) + 1;
    ev.ejemplo = ejemplo;
    ev.ultima = new Date().toISOString();
    if (ev.hits >= 2 && !st.pendientes.some((p) => keyOf(p) === key)) {
      const pend = { tipo, valor: '', ejemplo, hits: ev.hits, at: new Date().toISOString() };
      st.pendientes.push(pend);
      if (!propuesta) propuesta = pend;
    }
  }
  saveState(db, userId, st);
  return { hits: detected, propuesta };
}

/* ---------- propuestas: leer / responder ---------- */
function pendingProposal(db, userId) {
  const st = readState(db, userId);
  return st.pendientes[0] || null;
}
function proposalPayload(db, userId, lang) {
  const pend = pendingProposal(db, userId);
  if (!pend) return null;
  return { tipo: pend.tipo, texto: proposalTextFor(pend, lang) };
}
function answerProposal(db, userId, tipo, accept, lang) {
  const st = readState(db, userId);
  const pend = st.pendientes.find((p) => p.tipo === tipo);
  if (!pend) return { ok: false, ack: '' };
  if (accept) {
    const { gusto } = learn(db, userId, {
      tipo: pend.tipo, valor: pend.valor || '', origen: 'patron', ejemplo: pend.ejemplo || '', lang,
    });
    return { ok: true, gusto, ack: ackFor(gusto, lang) };
  }
  const key = keyOf(pend);
  st.pendientes = st.pendientes.filter((p) => keyOf(p) !== key);
  st.rechazos[key] = new Date().toISOString();
  st.evidencia[key] = { hits: 0, ejemplo: '', ultima: null }; // tras un «no», la evidencia arranca de cero
  saveState(db, userId, st);
  return { ok: true, ack: lang === 'en' ? "ok, i won't note it then 👍" : 'dale, no lo anoto entonces 👍' };
}

/* ---------- vía explícita: detección en el chat ---------- */
const MARKER_RE = /(siempre|de ahora en mas|a partir de ahora|nunca mas|todos los (posteos|textos|captions)|todas las (fotos|imagenes)|cada (posteo|vez|foto)|from now on|always|every post)/;

function detectExplicit(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 300) return null;
  const t = ' ' + norm(raw) + ' ';
  const words = raw.split(/\s+/).filter(Boolean).length;
  const hasMarker = MARKER_RE.test(t);
  const isQuestion = /[¿?]/.test(raw);
  if (isQuestion && !hasMarker) return null;

  // «nunca la palabra X» — estable por definición, no pide marcador.
  let m = raw.match(/(?:nunca|no)\s+(?:me\s+)?(?:uses?|pongas?|digas?|escribas?)\s+(?:la\s+palabra\s+|el\s+t[ée]rmino\s+)?["«“]?([^"»”.,!?\n]{2,40}?)["»”]?\s*(?:$|[.,!])/i);
  if (m && m[1] && !/^(hashtags?|emojis?)$/i.test(m[1].trim())) {
    return { tipo: 'palabra_prohibida', valor: m[1].trim() };
  }
  m = raw.match(/never\s+(?:use|say)\s+(?:the\s+word\s+)?["]?([^".,!?\n]{2,40}?)["]?\s*(?:$|[.,!])/i);
  if (m && m[1]) return { tipo: 'palabra_prohibida', valor: m[1].trim() };

  const gated = hasMarker || words <= 7; // frase corta y directa, o con marcador de estabilidad
  if (gated) {
    if (/(todo|escribi|captions?|textos?).{0,18}mayusculas|all caps|in uppercase|todo en mayusculas/.test(t)) return { tipo: 'todo_mayusculas', valor: '' };
    if (/(boton|button).{0,24}(imagen|foto|image|photo|picture)/.test(t)) return { tipo: 'botones_imagen', valor: '' };
    if (/sin (los )?hashtags|no (uses|quiero|pongas) (los )?hashtags|nada de hashtags|no hashtags|without hashtags|don'?t use hashtags/.test(t)) return { tipo: 'sin_hashtags', valor: '' };
    if (/sin emojis|no (uses|quiero) emojis|nada de emojis|no emojis|without emojis/.test(t)) return { tipo: 'sin_emojis', valor: '' };
    if (/sin texto (en|dentro de) (la |las )?(imagen|imagenes|fotos?)|fotos? sin texto|imagenes sin texto|no text (on|in) the (images?|photos?|pictures?)/.test(t)) return { tipo: 'sin_texto_imagen', valor: '' };
    if (/siempre con (el )?precio|pone el precio siempre|con (el )?precio siempre|always (include|with) the price|price always/.test(t)) return { tipo: 'con_precio', valor: '' };
    // «corto» es el caso tramposo: «hacelo más corto» es una edición de
    // UNA pieza, no un gusto. Entra solo con marcador de estabilidad
    // («siempre cortos», «from now on, short texts») o como frase pelada
    // / frase-sustantivo («más corto», «textos cortos»).
    if (/cort[oa]s?\b|shorter|short\b|breves?\b/.test(t)) {
      const bareNoun = /^\s*(textos?|captions?|copy)?\s*(mas\s+)?cort[oa]s?\s*[.!]?\s*$/.test(norm(raw))
        || /^\s*keep (it|them) short\s*[.!]?\s*$/.test(norm(raw));
      if (hasMarker || bareNoun) return { tipo: 'mas_corto', valor: '' };
    }
  }

  // Marco libre con marcador fuerte: «de ahora en más, …», «anotá que …».
  m = raw.match(/(?:de ahora en m[áa]s|a partir de ahora|anot[áa](?:te|me)? que|quiero que de ahora en m[áa]s|from now on)[,:]?\s+(.{4,140})$/i);
  if (m) {
    const valor = m[1].trim().replace(/[.\s]+$/, '');
    if (valor && !/[?¿]/.test(valor) && !/este (posteo|reel)|esta semana|por hoy\b/i.test(valor)) {
      return { tipo: 'libre', valor };
    }
  }
  return null;
}

/* Confirmación textual pelada («sí» / «no») ante una propuesta abierta.
 * Estricto a propósito: mensajes largos jamás se leen como respuesta. */
function parseYesNo(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length > 4) return null;
  const t = norm(raw).replace(/[!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(si|dale|de una|ok|okay|claro|obvio|buenisimo|joya|anotalo|anotame|yes|yeah|yep|sure)( (si|dale|ok|anotalo|yes))?$/.test(t)) return true;
  if (/^(no|nop|nope|mejor no|paso|no gracias|para nada|not really)$/.test(t)) return false;
  return null;
}

/* ---------- lectura para la pantalla ---------- */
function listForApi(db, userId, lang) {
  const en = lang === 'en';
  const st = readState(db, userId);
  const gustos = st.gustos.map((g) => ({
    id: g.id,
    tipo: g.tipo,
    label: (en ? g.label_en : g.label_es) || g.label_es || '',
    origen: g.origen,
    origen_label: g.origen === 'patron'
      ? (en ? 'i suggested it and you said yes' : 'lo propuse y me dijiste que sí')
      : (en ? `you asked me on ${fechaCorta(g.at)}` : `me lo pediste el ${fechaCorta(g.at)}`),
    fecha: fechaCorta(g.at),
    at: g.at,
    ejemplo: g.ejemplo || '',
    estado: g.estado || 'activo',
    regla: g.estado === 'pausa_regla' ? ((en ? g.regla_en : g.regla) || '') : '',
  }));
  return { gustos };
}

module.exports = {
  TIPOS, HARD_RULES,
  norm, countEmojis, keyOf, styleRuleKey, fechaCorta,
  conflictFor, textsFor, ackFor, proposalTextFor,
  readState, saveState, syncStyleRule, unsyncStyleRule,
  learn, forget, learnFromText, forgetByText,
  detectCorrections, noteCaptionEdit,
  pendingProposal, proposalPayload, answerProposal,
  detectExplicit, parseYesNo, listForApi,
};
