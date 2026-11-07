'use strict';
/* test-lote-estudio-mapafeed.js — ESTUDIO-PROFUNDO · mejora 4 MAPA DEL FEED (7/11)
 * Decisión de Valentino 7/11 ~16:00 («Perfecto! Arma todo»): las 6 mejoras
 * del estudio profundo se construyen. Esta es la 4: los últimos 9-12
 * posteos del cliente como una grilla (color dominante por posteo, mix de
 * formatos, qué se repite, qué falta — HUECOS) guardada en el fundamento
 * con procedencia (fundamento.feedMap), y el plan de la semana USA el mapa
 * para tapar los huecos en vez de repetir lo que ya hay.
 *
 * ROJO-PRIMERO: en el árbol sin tocar debe FALLAR (no existe el módulo ni
 * el cableado); con el lote aplicado debe dar 0 fallos.
 * Uso: node test-lote-estudio-mapafeed.js            (árbol actual)
 *      BASE=/ruta/al/arbol node test-lote-estudio-mapafeed.js
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || __dirname;
let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(BASE, rel));

// ---------- 0. El módulo existe ----------
t(exists('study-feedmap.js'), 'módulo study-feedmap.js existe');
let fm = null;
try { fm = require(path.join(BASE, 'study-feedmap.js')); } catch (e) { fm = null; }
t(!!fm && typeof fm.buildFeedMap === 'function', 'study-feedmap.js exporta buildFeedMap');
t(!!fm && typeof fm.applyFeedMapToPool === 'function', 'study-feedmap.js exporta applyFeedMapToPool');
t(!!fm && typeof fm.feedMapGoalLines === 'function', 'study-feedmap.js exporta feedMapGoalLines');
t(!!fm && typeof fm.feedMapBriefLines === 'function', 'study-feedmap.js exporta feedMapBriefLines');
t(!!fm && typeof fm.feedMapFromDigest === 'function', 'study-feedmap.js exporta feedMapFromDigest');

// Fixtures: posteos como los trae el embed (type/caption) + los campos
// explícitos que el estudio puede aportar (has_face / subject / dominant_hex).
function post(i, over) {
  return Object.assign({
    type: 'GraphImage',
    shortcode: 'P' + String(i).padStart(2, '0'),
    taken_at: 1760000000 + i * 86400,
    caption: 'Nuestro café de especialidad, recién tostado',
    likes: 10 + i,
    thumb: null,
  }, over || {});
}

if (fm) {
  // ---------- 1. Feed de 9 posteos todo producto en primer plano, sin caras ----------
  const todoProducto = [];
  for (let i = 0; i < 9; i++) todoProducto.push(post(i, { has_face: false, subject: 'producto', dominant_hex: '#8a5a2b' }));
  const m1 = fm.buildFeedMap(todoProducto);
  t(m1.n_posts === 9, 'mapa 9 posteos: n_posts 9');
  t(m1.grid.length === 9, 'mapa 9 posteos: grilla de 9 celdas');
  t(m1.grid.every((c) => c.format === 'foto'), 'mapa 9 posteos: todos formato foto');
  t(m1.grid.every((c) => c.has_face === false), 'mapa 9 posteos: ninguna celda con cara');
  t(m1.dominant_format === 'foto', 'mapa 9 posteos: formato dominante foto');
  t(m1.gaps.some((g) => g.key === 'sin_caras'), 'mapa 9 posteos sin caras: hueco «sin_caras»');
  t(m1.gaps.some((g) => g.key === 'solo_producto'), 'mapa 9 posteos todo producto: hueco «solo_producto»');
  t(m1.gaps.some((g) => g.key === 'sin_video'), 'mapa 9 posteos sin videos: hueco «sin_video»');
  t(m1.gaps.some((g) => g.key === 'sin_carrusel'), 'mapa 9 posteos sin carruseles: hueco «sin_carrusel»');
  t(m1.gaps.every((g) => g.evidence && g.evidence_source === 'instagram'), 'mapa: cada hueco lleva evidencia con procedencia instagram');
  t(m1.provenance && m1.provenance.source === 'instagram', 'mapa: procedencia instagram');
  t(m1.insufficient === false, 'mapa 9 posteos: no es feed flaco');

  // ---------- 2. Feed con 0 videos → hueco «sin video», sin inventar caras ----------
  const sinVideo = [];
  for (let i = 0; i < 9; i++) {
    sinVideo.push(post(i, {
      type: i % 3 === 2 ? 'GraphSidecar' : 'GraphImage',
      has_face: i % 2 === 0,
      subject: i % 2 === 0 ? 'persona' : 'producto',
    }));
  }
  const m2 = fm.buildFeedMap(sinVideo);
  t(m2.gaps.some((g) => g.key === 'sin_video'), 'feed 0 videos: hueco «sin_video»');
  t(!m2.gaps.some((g) => g.key === 'sin_caras'), 'feed con caras: NO se inventa «sin_caras»');
  t(!m2.gaps.some((g) => g.key === 'solo_producto'), 'feed con personas: NO se inventa «solo_producto»');
  t(!m2.gaps.some((g) => g.key === 'sin_carrusel'), 'feed con carruseles: NO se inventa «sin_carrusel»');

  // ---------- 3. Feed equilibrado → sin huecos inventados ----------
  const equilibrado = [];
  for (let i = 0; i < 12; i++) {
    equilibrado.push(post(i, {
      type: i % 3 === 0 ? 'GraphVideo' : (i % 3 === 1 ? 'GraphSidecar' : 'GraphImage'),
      has_face: i % 3 !== 2,
      subject: i % 3 === 2 ? 'producto' : 'persona',
    }));
  }
  const m3 = fm.buildFeedMap(equilibrado);
  t(m3.n_posts === 12, 'feed equilibrado: ventana de 12 posteos');
  t(m3.gaps.length === 0, 'feed equilibrado: cero huecos (nada inventado)');
  t(m3.mix.videos === 4 && m3.mix.carruseles === 4 && m3.mix.fotos === 4, 'feed equilibrado: mix 4/4/4');

  // ---------- 4. Feed flaco (4 posteos) → rama honesta, sin huecos ----------
  const flaco = [];
  for (let i = 0; i < 4; i++) flaco.push(post(i, { has_face: false, subject: 'producto' }));
  const m4 = fm.buildFeedMap(flaco);
  t(m4.insufficient === true, 'feed flaco: insufficient true');
  t(m4.insufficient_reason === 'feed_flaco', 'feed flaco: reason feed_flaco');
  t(m4.gaps.length === 0, 'feed flaco: cero huecos (nunca se inventa con muestra chica)');
  t(m4.grid.length === 4, 'feed flaco: la grilla observada igual se devuelve (4 celdas)');

  // ---------- 5. Sin cobertura de caras → el hueco de caras NO se afirma ----------
  const sinCobertura = [];
  for (let i = 0; i < 9; i++) sinCobertura.push(post(i, { subject: 'producto' }));
  const m5 = fm.buildFeedMap(sinCobertura);
  t(m5.faces.coverage === 0, 'sin señal de caras: cobertura 0');
  t(!m5.gaps.some((g) => g.key === 'sin_caras'), 'sin cobertura de caras: NO se afirma «sin_caras»');
  t(!m5.gaps.some((g) => g.key === 'solo_producto'), 'sin cobertura de caras: NO se afirma «solo_producto»');

  // ---------- 6. Color dominante por posteo ----------
  const m6 = fm.buildFeedMap([post(0, { dominant_hex: '#2793C8', has_face: false, subject: 'producto' })].concat(
    Array.from({ length: 8 }, (_, i) => post(i + 1, { dominant_hex: '#FFC800', has_face: false, subject: 'producto' }))));
  t(m6.grid[0].dominant_hue_bucket === 5, 'color por posteo: #2793C8 → bucket 5 (azul)');
  t(m6.grid[0].dominant_hue_name === 'azul', 'color por posteo: bucket 5 se llama azul');
  t(m6.grid[1].dominant_hue_bucket === 1, 'color por posteo: #FFC800 → bucket 1 (naranja)');
  t(m6.dominant_hues[0] === 1, 'color por posteo: tono dominante del feed es el 1 (naranja)');
  const sinColor = fm.buildFeedMap(Array.from({ length: 9 }, (_, i) => post(i, { has_face: true })));
  t(sinColor.grid.every((c) => c.dominant_hue_bucket === null), 'sin dato de color: hue null, no inventado');

  // ---------- 7. El plan de la semana USA el mapa (canje ventana/buffer) ----------
  const pool = [
    { titulo: 'Café de especialidad en grano', tipo: 'foto', tema: 'producto' },
    { titulo: 'Nuestra torta del día', tipo: 'foto', tema: 'producto' },
    { titulo: 'Blend de la casa', tipo: 'foto', tema: 'producto' },
    { titulo: 'Un reel con nuestro café en movimiento', tipo: 'video', tema: 'producto' },
    { titulo: 'Detrás de escena: nuestro equipo preparando tu pedido', tipo: 'foto', tema: 'detras_de_escena' },
    { titulo: 'El carrusel de la semana', tipo: 'carrusel', tema: 'producto' },
  ];
  const r7 = fm.applyFeedMapToPool(pool, m1, 3);
  t(r7.applied === true, 'plan con huecos: applyFeedMapToPool aplica canjes');
  t(r7.moves.length >= 2, 'plan con huecos: al menos 2 canjes (video + gente)');
  t(r7.pool.slice(0, 3).some((p) => p.tipo === 'video'), 'plan con hueco sin_video: la ventana trae un video');
  t(r7.pool.slice(0, 3).some((p) => /equipo|detrás de escena/i.test(p.titulo)), 'plan con hueco sin_caras: la ventana trae gente');
  t(r7.pool.length === pool.length, 'plan con huecos: el pool no pierde ni gana ideas');
  t(r7.gapsCovered.includes('sin_video') && r7.gapsCovered.includes('sin_caras'), 'plan con huecos: gapsCovered nombra los huecos tapados');
  // Sin idea que tape el hueco: no se inventa nada, el pool queda intacto.
  const poolSinRelleno = [
    { titulo: 'Café en grano', tipo: 'foto', tema: 'producto' },
    { titulo: 'Torta del día', tipo: 'foto', tema: 'producto' },
    { titulo: 'Blend de la casa', tipo: 'foto', tema: 'producto' },
    { titulo: 'Promo del mes', tipo: 'foto', tema: 'producto' },
  ];
  const r7b = fm.applyFeedMapToPool(poolSinRelleno, m1, 3);
  t(r7b.applied === false && r7b.pool === poolSinRelleno, 'plan sin relleno: no se inventa, pool intacto');
  // Feed equilibrado: el plan no toca nada.
  const r7c = fm.applyFeedMapToPool(pool, m3, 3);
  t(r7c.applied === false, 'plan sin huecos: applyFeedMapToPool no toca el pool');

  // ---------- 8. Líneas de goal/brief nombran el hueco ----------
  const gl = fm.feedMapGoalLines(m1, 'es');
  t(gl.length === m1.gaps.length && gl.some((l) => /sin caras|sin_caras/i.test(l) || /Hueco en su feed/.test(l)), 'goal lines: nombran el hueco en español');
  const bl = fm.feedMapBriefLines(m1, 'es');
  t(bl.includes('MAPA DEL FEED') && bl.includes('sin video'), 'brief lines: bloque MAPA DEL FEED con el hueco sin video');
  t(fm.feedMapBriefLines(m3, 'es') === '', 'brief lines: feed equilibrado → vacío');
  t(fm.feedMapGoalLines(m3, 'es').length === 0, 'goal lines: feed equilibrado → vacío');

  // ---------- 9. feedMap vive en el fundamento (digest.feedMap) ----------
  t(fm.isFeedMap(m1) === true, 'isFeedMap: el mapa construido es válido');
  t(fm.isFeedMap({}) === false, 'isFeedMap: un objeto vacío no es mapa');
  t(fm.feedMapFromDigest({ feedMap: m1 }) === m1, 'feedMapFromDigest: lee fundamento.feedMap');
  t(fm.feedMapFromDigest({}) === null, 'feedMapFromDigest: sin mapa → null');
  t(fm.feedMapFromDigest({ feedMap: { version: 99, grid: [], gaps: [] } }) === null, 'feedMapFromDigest: versión vieja → null');
}

// ---------- 10. Cableado en server.js ----------
let SRV = '';
try { SRV = read('server.js'); } catch (e) { SRV = ''; }
t(SRV.includes("require('./study-feedmap')"), 'server.js: requiere study-feedmap');
t(SRV.includes('applyFeedMapToPool'), 'server.js: generateWeekDrafts aplica el mapa al pool');
t(SRV.includes('feedMapBriefLines'), 'server.js: ideasInputFor suma el brief del mapa');
t(SRV.includes('feedMap') && SRV.includes('buildTrialDigest'), 'server.js: buildTrialDigest recibe el mapa');
t(/(_trialDigestBuilt|digest)\.feedMap\s*=/.test(SRV), 'server.js: el digest guarda fundamento.feedMap');
t(SRV.includes('feedMapGoalLines'), 'server.js: la semana de la prueba consume el mapa (goal lines)');

// ---------- 11. Paleta por posteo: feed-audit la extiende, no la reconstruye ----------
let FA = '';
try { FA = read('feed-audit.js'); } catch (e) { FA = ''; }
t(FA.includes('analyzePalettePerPost'), 'feed-audit.js: exporta analyzePalettePerPost (por posteo, reusa extractColors)');
let faMod = null;
try { faMod = require(path.join(BASE, 'feed-audit.js')); } catch (e) { faMod = null; }
t(!!faMod && typeof faMod.analyzePalettePerPost === 'function', 'feed-audit.js: analyzePalettePerPost es función exportada');

// ---------- 12. BUILD sin tocar (este lote no re-estampa) ----------
t(SRV.includes("const BUILD_ID = '20261105-v764'"), 'BUILD sigue 20261105-v764 (base v763, este lote no re-estampa)');

console.log(`\ntest-lote-estudio-mapafeed: ${okN} ok, ${badN} fallos`);
process.exit(badN ? 1 : 0);
