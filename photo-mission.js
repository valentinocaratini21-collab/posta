// Misión de fotos semanal — 3 fotos concretas que el dueño saca con el celular.
// Se genera una por semana (week_key = lunes), se cachea en photo_missions,
// y cuenta las fotos subidas esa semana como progreso.
const { generatePhotoMission } = require('./generator');
const streaks = require('./streaks');

function getSettings(db, userId) {
  return db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) || {};
}
function getProfile(db, userId) {
  let p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!p) {
    db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(userId);
    p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  }
  return p || {};
}

async function getOrCreateMission(db, userId) {
  const settings = getSettings(db, userId);
  const tz = settings.timezone || 'America/Argentina/Buenos_Aires';
  const wk = streaks.mondayKeyOf(streaks.tzToday(tz));
  let row = db.prepare('SELECT shots FROM photo_missions WHERE user_id = ? AND week_key = ?').get(userId, wk);
  if (!row) {
    const profile = getProfile(db, userId);
    const shots = await generatePhotoMission(
      { business: profile.business_name, category: profile.category, description: profile.description },
      settings.openai_key || process.env.OPENAI_API_KEY || ''
    );
    db.prepare('INSERT OR REPLACE INTO photo_missions (user_id, week_key, shots) VALUES (?,?,?)')
      .run(userId, wk, JSON.stringify(shots));
    row = { shots: JSON.stringify(shots) };
  }
  let shots = [];
  try { shots = JSON.parse(row.shots); } catch (e) {}
  if (!Array.isArray(shots) || !shots.length) shots = [];
  let uploaded = 0;
  try {
    const c = db.prepare(
      `SELECT COUNT(*) AS n FROM assets WHERE user_id = ? AND kind = 'photo' AND date(created_at) >= date(?)`
    ).get(userId, wk);
    uploaded = c ? c.n : 0;
  } catch (e) {}
  return { week_key: wk, shots, uploaded };
}

module.exports = { getOrCreateMission };
