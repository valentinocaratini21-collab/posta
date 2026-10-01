// Nudge proactivo de activación — día 2.
//
// Si a las ~48h de creada la cuenta el usuario no completó el paso de mayor
// impacto, Posty le manda UN mensaje en el chat con beneficio concreto + acción
// de 1 tap. Una sola vez por usuario (activation_nudged=1). Nada es gate:
// el mensaje es texto plano, no bloquea ningún flujo.
//
// Orden de impacto: logo > propuesta de logo > conectar IG > analizar estilo.
'use strict';

const nonEmpty = (v) => String(v == null ? '' : v).trim().length > 0;

// Columna propia (users.activation_nudged). En try/catch: si ya existe, no pasa nada.
// users.created_at es TEXT con DEFAULT (datetime('now')) → "YYYY-MM-DD HH:MM:SS" (UTC).
function ensureNudgeColumn(db) {
  try {
    db.exec('ALTER TABLE users ADD COLUMN activation_nudged INTEGER DEFAULT 0');
  } catch (e) {
    /* ya existe */
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN logo_candidate TEXT DEFAULT ''");
  } catch (e) {
    /* ya existe */
  }
}

// Mensajes en voz Posty: voseo rioplatense, cálido, 1-2 líneas.
// Texto plano: el chat renderiza con esc() (sin links cliqueables), igual que
// LEVEL_UP_MSGS en posty-level.js. La ruta va como texto de referencia.
const MSGS = {
  logo: '📸 Subí tu logo: con eso tus posteos salen con TU marca de verdad, no genéricos. Es 1 tap en Ajustes → Mi marca 👆',
  logoConfirm: '🏷️ Ya tengo una propuesta de logo para vos — confirmala con 1 tap en Ajustes → Mi marca 👇',
  ig: '📸 Conectá tu Instagram en Ajustes y publico por vos, sin que toques nada. Te lleva 1 minuto 👆',
  estilo: '🎨 Pedime que analice tu estilo en Ajustes → Analizar mi estilo y tus posteos salen con tu estética, no con la de nadie ✨',
};

function missingStep(db, userId) {
  let s = {};
  try {
    s = db
      .prepare(
        'SELECT logo_candidate, ig_user_id, ig_access_token FROM settings WHERE user_id = ?'
      )
      .get(userId) || {};
  } catch (e) {
    return null;
  }
  // 1. Logo: el paso de mayor impacto (marca real en los posteos).
  // El logo vive como asset kind='logo' (brand kit o candidata confirmada), no en settings.
  let hasLogo = false;
  try {
    hasLogo = !!db.prepare(`SELECT id FROM assets WHERE user_id = ? AND kind = 'logo' LIMIT 1`).get(userId);
  } catch (e) {}
  if (!hasLogo) {
    // 2. Propuesta de logo pendiente de confirmar (mismo check "vacío" que el resto de la app).
    return nonEmpty(s.logo_candidate) ? 'logoConfirm' : 'logo';
  }
  // 2. IG conectado: mismo check que getCreds en insights.js.
  if (!s.ig_user_id || !s.ig_access_token) return 'ig';
  // 3. Estilo visual analizado (fila en ig_visual_style).
  try {
    const row = db.prepare('SELECT user_id FROM ig_visual_style WHERE user_id = ?').get(userId);
    if (!row) return 'estilo';
  } catch (e) {
    return null;
  }
  return null;
}

function markNudged(db, userId) {
  try {
    db.prepare('UPDATE users SET activation_nudged = 1 WHERE id = ?').run(userId);
  } catch (e) {}
}

// Candidatos: no nudged Y alta entre 36 y 60 horas atrás (~48h).
// created_at es TEXT "YYYY-MM-DD HH:MM:SS" (datetime('now')), la comparación
// lexicográfica vale. Límite de seguridad: 500 usuarios por corrida.
function activationNudge(db) {
  try {
    ensureNudgeColumn(db);
    const cands = db
      .prepare(
        `SELECT id FROM users
         WHERE COALESCE(activation_nudged, 0) = 0
           AND created_at >= datetime('now', '-60 hours')
           AND created_at <= datetime('now', '-36 hours')
         ORDER BY id ASC LIMIT 500`
      )
      .all();
    let sent = 0;
    for (const c of cands) {
      try {
        const step = missingStep(db, c.id);
        if (step) {
          db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?, \'assistant\', ?)').run(c.id, MSGS[step]);
          sent++;
        }
        // Si no falta nada: silencio total, pero se marca igual (nunca hay
        // nada que nudgedear para este usuario).
        markNudged(db, c.id);
      } catch (e) {
        // Un usuario roto no frena a los demás.
      }
    }
    if (sent > 0) console.log(`[posta] Nudge día 2: ${sent} mensaje(s) enviados`);
  } catch (e) {
    // NUNCA lanza.
    console.error('[posta] Nudge día 2 falló:', e.message);
  }
}

module.exports = { activationNudge, ensureNudgeColumn, MSGS };
