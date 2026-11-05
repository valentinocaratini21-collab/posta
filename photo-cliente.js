'use strict';
/* =====================================================================
 * photo-cliente.js — Posty experto en fotos del cliente (26/10/2026).
 * Helpers PUROS (solo fs/path, sin db, sin IA, sin red) para el flujo
 * de mejora como PROPUESTA y el caption opt-in por código.
 *
 * Doctrina vigente (tablero): «nunca regeneración» = el resultado sigue
 * siendo reconociblemente LA MISMA foto (misma composición, sujetos,
 * encuadre). La mejora edita la foto del cliente (gpt-image-2 EDITS);
 * el titular, cuando lo lleva, se compone POR CÓDIGO
 * (composite-headline.py, bandas superior/inferior, sin mayúsculas
 * forzadas, sin botones), nunca editado por la IA.
 *
 * Convención de base limpia (Gap 7, 2026-10-25): si la pieza mostrada
 * lleva un titular quemado por código, su base limpia vive como hermana
 * `<nombre>-clean.<ext>`. La mejora y el caption trabajan SIEMPRE sobre
 * esa base; el titular se recompone por código al final.
 * ===================================================================== */
const path = require('path');
const fs = require('fs');

function isMediaPath(p) {
  return typeof p === 'string' && p.startsWith('/media/');
}

// Absoluto dentro de MEDIA_DIR, o null si no es una ruta /media/.
// El basename impide cualquier traversal fuera del directorio.
function mediaAbs(mediaDir, mediaPath) {
  if (!isMediaPath(mediaPath)) return null;
  return path.join(mediaDir, path.basename(mediaPath));
}

// `<nombre>-clean.<ext>` (misma regla que photo-enhance).
function cleanSisterName(fileName) {
  return String(fileName).replace(/(\.[a-z0-9]+)$/i, '-clean$1');
}

function cleanSisterPath(mediaDir, imagePath) {
  const abs = mediaAbs(mediaDir, imagePath);
  if (!abs) return null;
  return path.join(mediaDir, cleanSisterName(path.basename(abs)));
}

// Estado del caption de la foto mostrada, derivado de los archivos
// (no de una columna: la verdad está en disco):
//   'on'  — existe base limpia y DIFIERE en bytes de la mostrada
//           (la mostrada lleva titular quemado por código).
//   'off' — no hay base limpia, o es byte-idéntica a la mostrada
//           (la mostrada ES la foto limpia).
//   null  — no hay foto mostrada que leer.
// Comparación barata: tamaños distintos => 'on' sin leer nada; solo
// cuando los tamaños coinciden se comparan los bytes.
function captionState(mediaDir, imagePath) {
  const shownAbs = mediaAbs(mediaDir, imagePath);
  if (!shownAbs || !fs.existsSync(shownAbs)) return null;
  const cleanAbs = cleanSisterPath(mediaDir, imagePath);
  if (!cleanAbs || !fs.existsSync(cleanAbs)) return 'off';
  try {
    const a = fs.statSync(shownAbs);
    const b = fs.statSync(cleanAbs);
    if (a.size !== b.size) return 'on';
    return fs.readFileSync(shownAbs).equals(fs.readFileSync(cleanAbs)) ? 'off' : 'on';
  } catch (e) { return null; }
}

// Nombre de salida del caption compuesto: `<tallo>-cap.<ext>`.
// Si no hay extensión (no debería pasar: los medios siempre la tienen),
// se agrega el sufijo para no sobrescribir jamás la mostrada.
function captionOutName(shownBase) {
  const out = String(shownBase).replace(/(\.[a-z0-9]+)$/i, '-cap$1');
  return out === shownBase ? shownBase + '-cap' : out;
}

function deleteMediaFile(mediaDir, mediaPath) {
  const abs = mediaAbs(mediaDir, mediaPath);
  if (!abs) return false;
  try { fs.unlinkSync(abs); return true; } catch (e) { return false; }
}

// Borra una propuesta y todo lo que nació con ella: la propuesta, su
// base limpia hermana y las variantes livianas que composite-headline
// crea para su salida (@640.webp, @24.webp). Best-effort: nunca lanza.
// Devuelve cuántos archivos borró.
function deleteProposalFiles(mediaDir, proposalPath) {
  const abs = mediaAbs(mediaDir, proposalPath);
  if (!abs) return 0;
  let n = 0;
  const tryUnlink = (p) => { try { fs.unlinkSync(p); n++; } catch (e) {} };
  tryUnlink(abs);
  const clean = path.join(mediaDir, cleanSisterName(path.basename(abs)));
  tryUnlink(clean);
  const stem = abs.replace(/(\.[a-z0-9]+)$/i, '');
  if (stem !== abs) { tryUnlink(stem + '@640.webp'); tryUnlink(stem + '@24.webp'); }
  return n;
}

// resolveStoryPhoto(mediaDir, photoAbs) — STORY-TEXTO-UNICO (2026-11-04,
// post 553): una story NUNCA usa como fondo una foto que ya lleva el
// titular quemado. El cover 9:16 recorta ese titular a los costados, el
// velo oscuro lo deja ilegible, y el overlay de la story lo duplica
// (la gemela del post 551 salió con «¿te imaginás tener 3 días gratis…»
// dos veces: arriba cortado y oscuro + en el medio blanco y legible).
// Si la foto mostrada tiene base limpia hermana que difiere
// (captionState 'on' = titular compuesto por código), la story usa LA
// BASE LIMPIA y el overlay es el único texto. Sin hermana (foto limpia
// o sin registro), la foto entra como hoy. Fail-closed: cualquier duda
// devuelve photoAbs sin cambios.
function resolveStoryPhoto(mediaDir, photoAbs) {
  try {
    if (!photoAbs || !fs.existsSync(photoAbs)) return photoAbs;
    const shown = '/media/' + path.basename(String(photoAbs));
    if (captionState(mediaDir, shown) !== 'on') return photoAbs;
    const clean = cleanSisterPath(mediaDir, shown);
    if (clean && fs.existsSync(clean)) return clean;
  } catch (e) { /* fail-closed: la foto entra como hoy */ }
  return photoAbs;
}

module.exports = {
  isMediaPath,
  mediaAbs,
  cleanSisterName,
  cleanSisterPath,
  captionState,
  captionOutName,
  deleteMediaFile,
  deleteProposalFiles,
  resolveStoryPhoto,
};
