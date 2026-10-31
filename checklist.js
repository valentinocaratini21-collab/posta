// checklist.js — REVISIÓN FINAL ANTES DE PUBLICAR (Lote 6).
// Única fuente de verdad de la checklist del borrador: la usan el
// endpoint GET /api/drafts/:id/checklist, el gate del autopilot
// (shouldAutopublish) y el publicar-ahora. Un problema DURO sin
// confirmar BLOQUEA la salida automática y el publicar-ahora
// (fail-closed: nunca se publica un problema duro en silencio). Los
// avisos nunca bloquean. La confirmación durable vive en
// checklist_confirm (user, post, item) y solo el dueño la da desde
// la revisión del borrador («Lo acepto conociéndolo»).
const fs = require('fs');
const { execFileSync } = require('child_process');
const photoCliente = require('./photo-cliente');

/**
 * computeChecklist(db, mediaDir, uid, post): devuelve
 * { items: [{ item, duro, texto, confirmado }], bloqueado, duros }.
 * duros = problemas duros SIN confirmar (los que bloquean).
 * La lógica es la del endpoint original, sin cambios de criterio.
 */
function computeChecklist(db, mediaDir, uid, post) {
  const postId = post.id;
  const confirmados = new Set(db.prepare(`SELECT item FROM checklist_confirm WHERE user_id = ? AND post_id = ?`).all(uid, postId).map((r) => r.item));
  const items = [];
  const add = (item, duro, texto) => items.push({ item, duro, texto, confirmado: confirmados.has(item) });
  const isVideo = post.media_type === 'video';
  if (!post.image_path) add('sin-medio', true, 'El borrador no tiene foto ni video');
  if (isVideo) {
    const abs = post.image_path ? photoCliente.mediaAbs(mediaDir, post.image_path) : null;
    if (!abs || !fs.existsSync(abs)) add('sin-medio', true, 'El video no tiene archivo');
    else {
      try {
        const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', abs], { timeout: 15000, encoding: 'utf8' });
        if (!String(out || '').trim()) add('sin-audio', false, 'El video no tiene audio');
      } catch (e) {}
    }
  }
  // Producto cortado / caras sin permiso: desde el asset de la foto.
  try {
    const a = post.image_path ? db.prepare(`SELECT album_quality, album_tag FROM assets WHERE user_id = ? AND file_path = ?`).get(uid, String(post.image_path)) : null;
    if (a && a.album_quality) {
      const q = JSON.parse(a.album_quality);
      const issues = Array.isArray(q) ? q : (q.issues || []);
      if (issues.includes('cortada')) add('producto-cortado', true, 'La foto parece cortada: el producto puede estar cortado');
      if (q.lum !== undefined && q.lum < 38) add('foto-oscura', false, 'La foto está oscura');
    }
    if (a && a.album_tag === 'equipo' && !confirmados.has('caras-permiso')) add('caras-permiso', true, 'La foto muestra personas del equipo: confirmá que tienen permiso para salir');
  } catch (e) {}
  // Reuso y paleta: avisos (nunca duros). Sin foto no hay reuso
  // que avisar: image_path vacío matchearía prev_image_path ''.
  if (post.image_path) try {
    const reu = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND id != ? AND status IN ('published','scheduled') AND (image_path = ? OR prev_image_path = ?)`).get(uid, postId, String(post.image_path || ''), String(post.image_path || ''));
    if (reu && reu.n > 0) add('reuso', false, 'Esta foto ya se usó en una semana anterior');
  } catch (e) {}
  const duros = items.filter((i) => i.duro && !i.confirmado);
  return { items, bloqueado: duros.length > 0, duros };
}

module.exports = { computeChecklist };
