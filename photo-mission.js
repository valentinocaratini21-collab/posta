// Misión de fotos semanal — UN solo pedido: la foto que nos falta para SUS posteos.
// La regla mira lo que ya tenemos (sin GPT, sin manual de fotografía):
// - sin fotos → una foto de su producto estrella (o producto/servicio)
// - con fotos → variedad simple según rubro
// Se evalúa por semana (week_key = lunes); cuenta fotos subidas esa semana.
const streaks = require('./streaks');

function getProfile(db, userId) {
  let p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!p) {
    db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(userId);
    p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  }
  return p || {};
}

function readDnaSafe(db, userId) {
  try {
    const r = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(userId);
    if (r && r.dna_json) { const o = JSON.parse(r.dna_json); return (o && typeof o === 'object') ? o : {}; }
  } catch (e) {}
  return {};
}

// Qué foto pedir esta semana: concreta, de SU negocio, en una línea.
function weeklyPhotoNeed(db, userId) {
  const dna = readDnaSafe(db, userId);
  let total = 0;
  try { total = db.prepare(`SELECT COUNT(*) AS n FROM assets WHERE user_id = ? AND kind = 'photo'`).get(userId).n || 0; } catch (e) {}
  const star = dna.producto_estrella
    || (Array.isArray(dna.productos) && ((dna.productos.find(p => p && p.es_estrella) || dna.productos[0] || {}).nombre || ''))
    || '';
  if (!total) return star ? `una foto de tu ${star}` : 'una foto de tu producto o servicio';
  const cat = String(getProfile(db, userId).category || '').toLowerCase();
  if (/gastronom|comida|restaurante|bar|caf|pizz|helad/.test(cat)) return 'una foto de tu plato más pedido';
  if (/moda|ropa|tienda|retail|boutique/.test(cat)) return 'una foto de tu vidriera';
  if (/belleza|peluquer|barber|spa|estetica/.test(cat)) return 'una foto de un trabajo terminado';
  if (/gym|fitness|entren/.test(cat)) return 'una foto entrenando a un cliente';
  return 'una foto tuya trabajando';
}

async function getOrCreateMission(db, userId) {
  const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) || {};
  const tz = settings.timezone || 'America/Argentina/Buenos_Aires';
  const wk = streaks.mondayKeyOf(streaks.tzToday(tz));
  let uploaded = 0;
  try {
    const c = db.prepare(
      `SELECT COUNT(*) AS n FROM assets WHERE user_id = ? AND kind = 'photo' AND date(created_at) >= date(?)`
    ).get(userId, wk);
    uploaded = c ? c.n : 0;
  } catch (e) {}
  return { week_key: wk, need: weeklyPhotoNeed(db, userId), uploaded, done: uploaded > 0 };
}

module.exports = { getOrCreateMission };
