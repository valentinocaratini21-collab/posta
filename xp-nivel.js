// xp-nivel.js — Regla XP de Nivel (UNA sola fuente de verdad).
// Aprobada por Valentino 8/11 00:26; R5 (8/11 01:54) la convierte en el
// único motor de nivel de Posty: cada nivel son 500 puntos (1–50). Cada
// posteo publicado suma 15 de base + 25 si es foto/carrusel o +45 si es
// video (foto 40, video 60 en total). Cada comentario respondido +25
// (replyComment pone status='replied'). Primera semana completa (7 días
// seguidos eligiendo en el ritual) +100; racha de 30 días +150 y de 100
// días +300 (racha máxima de pz_ritual, no la vigente); 100 consultas
// respondidas +150. La primera venta por anuncio (+200) NO se suma acá:
// Posty no ve las ventas; solo se registra cuando el cliente la reporta
// (pregunta semanal) — nunca inventada. Todo derivado de datos reales
// (posts, pz_ritual, comment_queue): sin tabla nueva, sin escrituras.
// Nombres de nivel: los 5 hitos del mock (R5), por banda: 1–3 Recién
// arranca, 4–49 Negocio Visible, 50 Referente del rubro.
// Lo usan server.js (/api/avatar-level, /api/oficina/nivel, contexto del
// chat), niveles.js (río de subidas) y oficina.js (tarjeta de la oficina).
// Este módulo no requiere nada: nunca hay ciclo.
'use strict';

const XP_NIVEL = 500, XP_MAX_NIVEL = 50;
const XP_POST_BASE = 15, XP_POST_FOTO = 25, XP_POST_VIDEO = 45; // foto 40, video 60
const XP_RESPUESTA = 25;
const XP_PRIMERA_SEMANA = 100, XP_RACHA_30 = 150, XP_RACHA_100 = 300, XP_100_RESPUESTAS = 150;

function avatarNivelNombre(nivel) {
  const n = Math.max(1, Math.min(50, Number(nivel) || 1));
  if (n >= 50) return 'Referente del rubro';
  if (n >= 4) return 'Negocio Visible';
  return 'Recién arranca';
}

// Marcos del logo: misma proporción que antes (bronce 30%, plata 50%, oro
// 70% del recorrido), reescalada a 50 niveles: 15 / 25 / 35.
function avatarTier(lvl) { return lvl >= 35 ? 'gold' : lvl >= 25 ? 'silver' : lvl >= 15 ? 'bronze' : 'none'; }

// Racha máxima de días consecutivos eligiendo en el ritual (pz_ritual).
// Derivado, sin escrituras; ante cualquier error, 0 (nunca inventado).
function rachaMaximaRitual(db, uid) {
  try {
    const rows = db.prepare(`SELECT day_key FROM pz_ritual WHERE user_id = ? AND picked_post_id IS NOT NULL ORDER BY day_key`).all(uid);
    let max = 0, cur = 0, prev = null;
    for (const r of rows) {
      const d = String(r.day_key || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      if (prev) {
        const diff = (new Date(d + 'T00:00:00Z').getTime() - new Date(prev + 'T00:00:00Z').getTime()) / 86400000;
        cur = (diff === 1) ? cur + 1 : 1;
      } else cur = 1;
      prev = d;
      if (cur > max) max = cur;
    }
    return max;
  } catch (e) { return 0; }
}

function avatarLevelData(db, uid) {
  const rows = db.prepare(`SELECT media_type, COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published' AND media_type != 'story' GROUP BY media_type`).all(uid);
  let xp = 0, published = 0;
  for (const r of rows) { const n = r.c || 0; published += n; xp += n * (XP_POST_BASE + (r.media_type === 'video' ? XP_POST_VIDEO : XP_POST_FOTO)); }
  let respuestas = 0;
  try { respuestas = db.prepare(`SELECT COUNT(*) AS c FROM comment_queue WHERE user_id = ? AND status = 'replied'`).get(uid).c || 0; } catch (e) {}
  xp += respuestas * XP_RESPUESTA;
  const rachaMax = rachaMaximaRitual(db, uid);
  if (rachaMax >= 7) xp += XP_PRIMERA_SEMANA;
  if (rachaMax >= 30) xp += XP_RACHA_30;
  if (rachaMax >= 100) xp += XP_RACHA_100;
  if (respuestas >= 100) xp += XP_100_RESPUESTAS;
  const level = Math.min(XP_MAX_NIVEL, Math.floor(xp / XP_NIVEL) + 1);
  const levelName = avatarNivelNombre(level);
  const nextXp = level < XP_MAX_NIVEL ? level * XP_NIVEL : null;
  const nextName = level < XP_MAX_NIVEL ? avatarNivelNombre(level + 1) : null;
  const seen = db.prepare('SELECT milestone FROM milestones_seen WHERE user_id = ? AND milestone >= 900').all(uid).map(r => r.milestone - 900);
  const unseen = [];
  for (let l = 2; l <= level; l++) if (!seen.includes(l)) unseen.push(l);
  return { xp, level, levelName, tier: avatarTier(level), published, nextXp, nextName, respuestas, rachaMax, unseenLevels: unseen };
}

module.exports = { XP_NIVEL, XP_MAX_NIVEL, XP_POST_BASE, XP_POST_FOTO, XP_POST_VIDEO, XP_RESPUESTA, XP_PRIMERA_SEMANA, XP_RACHA_30, XP_RACHA_100, XP_100_RESPUESTAS, avatarNivelNombre, avatarTier, rachaMaximaRitual, avatarLevelData };
