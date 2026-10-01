// posty-level.js — Niveles de conocimiento de Posty.
// Los niveles miden lo que Posty SABE del negocio con datos reales,
// nunca volumen de chat. Progresión secuencial: no se sube de nivel
// sin haber completado los requisitos de los niveles anteriores.
//
// N1 "Te conozco"   (base): profiles.business_name + profiles.category (rubro) no vacíos.
//                       NOTA: el brief original decía users.business_name/users.rubro,
//                       pero esas columnas NO existen en users — los datos reales del
//                       negocio viven en profiles (ver getProfile en server.js).
// N2 "Veo tu marca": brand_logo + brand_colors + ≥3 assets kind='photo'.
// N3 "Sé tu gusto":  ≥5 post_signals (approved/rejected) O ≥1 style_rules activa.
// N4 "Sé tu ritmo":  IG conectado (getCreds no null) + ≥3 posts published.
// N5 "Te anticipo":  N4 + ≥2 fuentes activas de la tarjeta "Lo que Posty sabe"
//                    (web, historias, Facebook, comentarios, reseñas — los mismos
//                    checks que las filas del frontend: *_analyzed_at en business_dna).
//
// Desbloqueos (documentados en LEEME-posty-level.md):
//   N2 = propone posteos con tu marca (colores + fotos)
//   N3 = escribe en tu tono (taste: reglas de estilo aprendidas)
//   N4 = sugiere tus mejores horarios
//   N5 = ideas proactivas anticipadas
const { getCreds } = require('./insights');

const LEVELS = {
  1: { name: 'Te conozco', unlock: 'Sabe quién sos y de qué es tu negocio' },
  2: { name: 'Veo tu marca', unlock: 'Propone posteos con tus colores y tus fotos' },
  3: { name: 'Sé tu gusto', unlock: 'Escribe en tu tono (taste aprendido)' },
  4: { name: 'Sé tu ritmo', unlock: 'Sugiere tus mejores horarios' },
  5: { name: 'Te anticipo', unlock: 'Ideas proactivas anticipadas' },
};

// Mensajes de level-up en VOZ POSTY (voseo, cálido, concreto:
// qué sabe ahora + qué desbloquea). Se insertan UNA sola vez en chat_messages.
const LEVEL_UP_MSGS = {
  2: '🧠 ¡Nivel 2! Ya veo tu marca: a partir de ahora te propongo posteos con tus colores y tus fotos 🎉',
  3: '🧠 ¡Nivel 3! Ya sé tu gusto: escribo los captions en tu tono, como a vos te salen ✨',
  4: '🧠 ¡Nivel 4! Ya sé tu ritmo: te sugiero los mejores horarios según tu Instagram ⏰',
  5: '🧠 ¡Nivel 5! Te anticipo: de ahora en más te traigo ideas proactivas antes de que me las pidas 🚀',
};

const nonEmpty = (v) => String(v == null ? '' : v).trim().length > 0;
// El rubro vive en profiles.category, pero 'otro' es el DEFAULT de la DB para
// perfiles auto-creados (getProfile): no cuenta como rubro conocido.
// "Si un dato no existe, el nivel no lo cuenta."
const rubroKnown = (v) => nonEmpty(v) && String(v).trim().toLowerCase() !== 'otro';

function countQ(db, sql, ...args) {
  try {
    const r = db.prepare(sql).get(...args);
    return (r && Number(r.n)) || 0;
  } catch (e) { return 0; }
}

function readDna(db, userId) {
  try {
    const r = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(userId);
    if (r && r.dna_json) {
      const o = JSON.parse(r.dna_json);
      return (o && typeof o === 'object') ? o : {};
    }
  } catch (e) { /* sin ADN = sin fuentes */ }
  return {};
}

// Las 5 fuentes de la tarjeta "Lo que Posty sabe" (mismos checks que el frontend):
// cada fila se marca ✅ cuando su *_analyzed_at existe en el ADN.
function activeSources(db, userId) {
  const dna = readDna(db, userId);
  return [
    { key: 'web',         label: 'Tu web',                      active: nonEmpty(dna.website_analyzed_at) },
    { key: 'historias',   label: 'Tus historias',                active: nonEmpty(dna.stories_analyzed_at) },
    { key: 'facebook',    label: 'Tu página de Facebook',       active: nonEmpty(dna.fb_analyzed_at) },
    { key: 'comentarios', label: 'Los comentarios de tu IG',     active: nonEmpty(dna.comments_analyzed_at) },
    { key: 'resenas',     label: 'Las reseñas de Google',       active: nonEmpty(dna.places_analyzed_at) },
  ];
}

function postyLevel(db, userId) {
  // El negocio del usuario vive en profiles (business_name + category=rubro).
  let profile = {};
  try { profile = db.prepare('SELECT business_name, category FROM profiles WHERE user_id = ?').get(userId) || {}; } catch (e) { profile = {}; }
  const settings = db.prepare('SELECT brand_colors FROM settings WHERE user_id = ?').get(userId) || {};
  // El logo canónico vive en assets kind='logo' (brand_logo en settings es legacy).
  const hasLogo = countQ(db, "SELECT COUNT(*) AS n FROM assets WHERE user_id = ? AND kind = 'logo'", userId) > 0;

  const photoCount = countQ(db, "SELECT COUNT(*) AS n FROM assets WHERE user_id = ? AND kind = 'photo'", userId);
  const signalCount = countQ(db, "SELECT COUNT(*) AS n FROM post_signals WHERE user_id = ? AND client_signal IN ('approved','rejected')", userId);
  const activeRules = countQ(db, 'SELECT COUNT(*) AS n FROM style_rules WHERE user_id = ? AND active = 1', userId);
  let igConnected = false;
  try { igConnected = !!getCreds(db, userId); } catch (e) { igConnected = false; }
  const publishedCount = countQ(db, "SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'published'", userId);
  const sources = activeSources(db, userId);
  const nSources = sources.filter((s) => s.active).length;

  // Requisitos por nivel. N3 tiene dos caminos ("o"): alcanza con uno.
  const reqs = {
    1: [
      { key: 'business_name', met: nonEmpty(profile.business_name), frac: nonEmpty(profile.business_name) ? 1 : 0,
        label: 'Contanos el nombre de tu negocio', action: '#/app/ajustes' },
      { key: 'rubro', met: rubroKnown(profile.category), frac: rubroKnown(profile.category) ? 1 : 0,
        label: 'Contanos a qué se dedica tu negocio', action: '#/app/ajustes' },
    ],
    2: [
      { key: 'brand_logo', met: hasLogo, frac: hasLogo ? 1 : 0,
        label: 'Subí tu logo', action: '#/app/ajustes' },
      { key: 'brand_colors', met: nonEmpty(settings.brand_colors), frac: nonEmpty(settings.brand_colors) ? 1 : 0,
        label: 'Elegí los colores de tu marca', action: '#/app/ajustes' },
      { key: 'photos', met: photoCount >= 3, frac: Math.min(photoCount, 3) / 3,
        label: photoCount >= 3 ? 'Fotos de tu negocio' : `Subí ${3 - photoCount} ${3 - photoCount === 1 ? 'foto' : 'fotos'} de tu negocio`,
        action: '#/app/ajustes' },
    ],
    3: [
      { key: 'signals', path: true, met: signalCount >= 5, frac: Math.min(signalCount, 5) / 5,
        label: signalCount >= 5 ? 'Tu gusto en posteos' : `Marcá 👍 o 👎 en ${5 - signalCount} ${5 - signalCount === 1 ? 'posteo' : 'posteos'}`,
        action: '#/app/semana' },
      { key: 'style', path: true, met: activeRules >= 1, frac: activeRules >= 1 ? 1 : 0,
        label: 'O editá un caption a mano: aprendo tu estilo', action: '#/app/semana' },
    ],
    4: [
      { key: 'ig', met: igConnected, frac: igConnected ? 1 : 0,
        label: 'Conectá tu Instagram', action: '#/app/ajustes' },
      { key: 'published', met: publishedCount >= 3, frac: Math.min(publishedCount, 3) / 3,
        label: publishedCount >= 3 ? 'Tus posteos publicados' : 'Publicá tus primeros 3 posteos con Posty',
        action: '#/app/semana' },
    ],
    5: [
      { key: 'sources', met: nSources >= 2, frac: Math.min(nSources, 2) / 2,
        label: nSources >= 2 ? 'Fuentes de tu negocio' : 'Sumá una fuente más: tu web, Facebook, reseñas o comentarios',
        action: '#/app/ajustes' },
    ],
  };

  const levelMet = (L) => (L === 3 ? reqs[3].some((r) => r.met) : reqs[L].every((r) => r.met));

  // Progresión secuencial: el nivel es el más alto alcanzado con todos
  // los anteriores completos. Piso: 1 (usuario vacío = N1 con 0%).
  let level = 1;
  if (levelMet(1) && levelMet(2)) level = 2;
  if (level === 2 && levelMet(3)) level = 3;
  if (level === 3 && levelMet(4)) level = 4;
  if (level === 4 && levelMet(5)) level = 5;

  // Siguiente nivel incompleto (barrido desde 1).
  let next = 5;
  for (let L = 1; L <= 5; L++) {
    if (!levelMet(L)) { next = L; break; }
  }
  const nextReqs = reqs[next] || [];
  const next_missing = nextReqs
    .filter((r) => !r.met)
    .map((r) => ({ key: r.key, label: r.label, action: r.action }));

  // % de requisitos del siguiente nivel ya cumplidos. N3: vale el mejor camino.
  let progress_pct;
  if (next === 3) {
    progress_pct = Math.round(100 * Math.max(...nextReqs.map((r) => r.frac)));
  } else if (nextReqs.length) {
    progress_pct = Math.round(100 * (nextReqs.reduce((a, r) => a + r.frac, 0) / nextReqs.length));
  } else {
    progress_pct = 100;
  }
  if (next_missing.length === 0) progress_pct = 100;

  const checks = {
    business_name: nonEmpty(profile.business_name),
    rubro: rubroKnown(profile.category),
    brand_logo: hasLogo,
    brand_colors: nonEmpty(settings.brand_colors),
    photos: photoCount,
    signals: signalCount,
    active_rules: activeRules,
    ig_connected: igConnected,
    published: publishedCount,
    sources: Object.fromEntries(sources.map((s) => [s.key, s.active])),
    sources_count: nSources,
  };

  return {
    level,
    level_name: LEVELS[level].name,
    progress_pct,
    next_missing,
    checks,
  };
}

module.exports = { postyLevel, LEVELS, LEVEL_UP_MSGS, activeSources };
