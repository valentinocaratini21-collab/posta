'use strict';
/* =====================================================================
 * test-music-catalog.js — Gap 8 (auditoría de material del cliente,
 * 2026-10-25): el catálogo de música de los reels.
 *
 *  - ≥15 pistas en total, ≥5 por mood, TODAS con archivo real en
 *    assets/music/ y TODAS documentadas en REELS-MUSIC.md.
 *  - Rotación determinística por seed `${uid}:${weekKey}`: la misma
 *    seed da siempre la misma pista (auditable) y, entre semanas
 *    seguidas de un mismo negocio, la pista cambia (no suenan todos
 *    los reels de un rubro igual).
 *  - beats.json (el mapa que usa el motor v3 para el snap de cortes)
 *    cubre TODAS las pistas del catálogo.
 * ===================================================================== */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};

const re = require('./reel-engine');
const catalog = re.MUSIC_CATALOG;
const all = Object.values(catalog).flat();
ok('el catálogo tiene ≥15 pistas', all.length >= 15, 'total=' + all.length);
for (const mood of Object.keys(catalog)) {
  ok(`mood ${mood}: ≥5 pistas`, catalog[mood].length >= 5, 'n=' + catalog[mood].length);
  ok(`mood ${mood}: todas las pistas existen en assets/music/`,
    catalog[mood].every((f) => fs.existsSync(path.join(__dirname, 'assets', 'music', f))));
}
const doc = fs.readFileSync(path.join(__dirname, 'REELS-MUSIC.md'), 'utf8');
ok('todas las pistas están documentadas en REELS-MUSIC.md', all.every((f) => doc.includes(f)),
  'faltan: ' + all.filter((f) => !doc.includes(f)).join(', '));
ok('REELS-MUSIC.md declara el límite honesto de Meta (sin audios trending por API)',
  /API de publicación de Meta/.test(doc) && /trending/i.test(doc));

// Rotación por seed: determinística y con cambio entre semanas.
const picks = [];
for (let w = 0; w < 6; w++) picks.push(re.pickMusicFile('chill', `7:2026-10-${19 + w * 7}`));
ok('la misma seed elige siempre la misma pista', re.pickMusicFile('chill', '7:2026-10-19') === picks[0]);
ok('entre 6 semanas seguidas hay ≥3 pistas distintas', new Set(picks).size >= 3, 'distintas=' + new Set(picks).size);
ok('sin seed: la pista histórica del mood, determinística', re.pickMusicFile('groove') === re.pickMusicFile('groove') && re.pickMusicFile('groove').endsWith(catalog.groove[0]));

// beats.json cubre el catálogo completo.
const beats = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'music', 'beats.json'), 'utf8'));
const beatKeys = Object.keys(beats.tracks || beats);
ok('beats.json cubre todas las pistas del catálogo', all.every((f) => beatKeys.includes(f)),
  'sin beats: ' + all.filter((f) => !beatKeys.includes(f)).join(', '));

console.log(`\ntest-music-catalog: ${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
