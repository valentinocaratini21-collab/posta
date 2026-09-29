// style-learn.js — aprende reglas de estilo del diff de ediciones manuales del cliente.
// Cuando el cliente edita un caption a mano, detectamos QUÉ cambió (no solo que cambió)
// y con 2 hits la regla se activa: los generadores la respetan siempre.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

function normKey(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function countEmojis(s) {
  return (String(s || '').match(EMOJI_RE) || []).length;
}

const RULES = {
  sin_emojis: {
    text: 'El cliente prefiere captions sin emojis (o máximo 1)',
    detect: (oldC, newC) => countEmojis(oldC) >= 2 && countEmojis(newC) === 0,
  },
  corto: {
    text: 'El cliente prefiere captions cortos y directos',
    detect: (oldC, newC) => newC.length > 0 && newC.length < oldC.length * 0.7,
  },
  con_precios: {
    text: 'Al cliente le sirve que el caption mencione precio/cuotas',
    detect: (oldC, newC) => /\$|precio|cuota/i.test(newC) && !/\$|precio|cuota/i.test(oldC),
  },
};

function learnStyleHit(db, userId, key, text) {
  const row = db.prepare('SELECT hits, active FROM style_rules WHERE user_id = ? AND rule_key = ?').get(userId, key);
  if (!row) {
    db.prepare('INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (?, ?, ?, 1, 0)')
      .run(userId, key, text);
  } else {
    const hits = (row.hits || 0) + 1;
    db.prepare('UPDATE style_rules SET hits = ?, rule_text = ?, active = ? WHERE user_id = ? AND rule_key = ?')
      .run(hits, text, hits >= 2 ? 1 : row.active, userId, key);
  }
}

function learnFromCaptionEdit(db, userId, oldCaption, newCaption) {
  const oldC = String(oldCaption || '');
  const newC = String(newCaption || '');
  if (!oldC || !newC || oldC === newC) return [];
  const hits = [];
  for (const [key, r] of Object.entries(RULES)) {
    try {
      if (r.detect(oldC, newC)) { learnStyleHit(db, userId, key, r.text); hits.push(key); }
    } catch (e) { /* una regla nunca rompe el guardado */ }
  }
  return hits;
}

module.exports = { learnFromCaptionEdit, learnStyleHit, normKey, EMOJI_RE };
