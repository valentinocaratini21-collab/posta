// music-meta-catalog.js — Construye music-meta.json desde los MP3
// reales descargados de la colección de Meta.
// Uso: node music-meta-catalog.js --write
//   1) Descargá los temas desde Meta Business Suite → Creative Tools
//      → Sound Collection (sesión del negocio) como MP3.
//   2) Copialos a assets/music-meta/.
//   3) Corré este script: agrega los archivos nuevos al catálogo
//      (título = nombre de archivo, ánimo por prefijo cuando se puede
//      deducir: chill→tranquilo, groove→alegre, upbeat→enérgico; si no,
//      ánimo '' y el script lo avisa para completarlo a mano).
//   4) Completá título/artista/ánimo en music-meta.json si querés.
// NUNCA inventa temas: solo lista archivos que existen de verdad.
// Las entradas existentes se conservan tal cual (no se pisan).
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'assets', 'music-meta');
const CATALOG = path.join(__dirname, 'music-meta.json');
const LICENCIA = 'Meta Sound Collection — uso comercial en productos Meta (Facebook, Instagram, Messenger, Audience Network); no usar fuera de Meta';
function moodOf(f) {
  const s = f.toLowerCase();
  if (s.startsWith('chill')) return 'tranquilo';
  if (s.startsWith('groove')) return 'alegre';
  if (s.startsWith('upbeat')) return 'enérgico';
  return '';
}
function main() {
  if (process.argv[2] !== '--write') {
    console.log('uso: node music-meta-catalog.js --write');
    return 1;
  }
  let existing = { tracks: [] };
  try { existing = JSON.parse(fs.readFileSync(CATALOG, 'utf8')); } catch (e) {}
  if (!Array.isArray(existing.tracks)) existing.tracks = [];
  const byFile = new Map(existing.tracks.map((t) => [t.file, t]));
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => /\.mp3$/i.test(f)).sort(); } catch (e) {}
  const added = [];
  const sinAnimo = [];
  files.forEach((f) => {
    if (byFile.has(f)) return;
    const mood = moodOf(f);
    const entry = { file: f, titulo: f.replace(/\.mp3$/i, ''), artista: '', mood, origen: 'Meta Sound Collection', licencia: LICENCIA };
    existing.tracks.push(entry);
    byFile.set(f, entry);
    added.push(f);
    if (!mood) sinAnimo.push(f);
  });
  fs.writeFileSync(CATALOG, JSON.stringify(existing, null, 2) + '\n');
  console.log(`catálogo: ${existing.tracks.length} temas (${added.length} nuevos)`);
  added.forEach((f) => console.log('  + ' + f));
  if (sinAnimo.length) {
    console.log('AVISO: estos temas quedaron sin ánimo — completalo en music-meta.json:');
    sinAnimo.forEach((f) => console.log('  ? ' + f));
  }
  return 0;
}
process.exit(main());
