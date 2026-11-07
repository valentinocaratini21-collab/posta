// test-lote-marca-hoy-dock.js — LOTE MARCA-HOY-DOCK (6/11 · decisión
// Valentino «dale, armalo», ítem 1 de la propuesta 13:06).
// 1) MARCA HOY: el posteo del día lleva una marca clara de HOY (EN
//    TODAY) en el feed, porque la confusión de hoy empezó ahí
//    (borradores que parecían posteos reales). Solo el posteo del día
//    la lleva; los publicados NO. El posteo del día es el que decide
//    el ritual: la carta del próximo si cae hoy (velada o abierta) o
//    el programado de hoy. La marca es solo visual: no cambia qué
//    posteo es el de hoy.
// 2) DOCK: el ítem 2 original (dock de 6 a 390px con etiqueta a 10px)
//    quedó SUPERSEDED por DOCK-5 (v722, en vivo): el dock es Inicio,
//    Ads, +, Estrategia, Premios y «Estrategia» a 11px entra a 360
//    con ~16px de sobra (medición real). La regla ≤400px a 10px NO va
//    y esta suite lo afirma en NEGATIVO. El ítem 3 de la propuesta
//    (jardín era por era) NO va: SUPERSEDED por la decisión 3/11 —
//    la pantalla es Premios, no hay jardín.
// RE-BASE sobre v724 (sacar-corazón, en vivo): homeTileHTML ya no
// tiene slots del like (hfLikeOn/likeBtn fuera en v724) — la marca
// HOY se aplica sobre ese homeTileHTML. El assert del corazón se
// invierte: el corazón NO debe aparecer en la tile.
// Node puro: estática + VM con stubs sobre homeGridCompose y
// homeTileHTML extraídos del bundle real. Uso: node test-lote-marca-hoy-dock.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- 1. Censo (sin cambio) + base v728 (BUILD v729 en el árbol final) ----------
t(srv.includes("const BUILD_ID = '20261105-v729'"), 'server: BUILD v729 (re-base marca-hoy sobre v728; v725 transición, v726 ritual, v727 iconos, v728 mas-arriba preservados)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
t(app.includes("const CHUNK_V = '20261105-v723'"), 'CHUNK_V v723 (sin cambio: este lote no toca chunks)');
t(md5(css) === '8d16705e3a63aa3aedb926274f9d0664', 'styles.css: md5 con posty-dentro (re-pin)');

// ---------- 2. VM: homeGridCompose + homeTileHTML ----------
const TZ = 'America/New_York';
const keyOf = (d, tz) => { try { return d.toLocaleDateString('en-CA', { timeZone: tz || TZ }); } catch (e) { return ''; } };
const todayKey = keyOf(new Date(), TZ);
const plusKey = (n) => { const d = new Date(todayKey + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const schedAt = (dayKey, hh) => `${dayKey}T${hh}:00:00Z`; // 22:00Z = 17:00 EST
// (re-base v728 · 6/11) El «ahora» del fixture es FIJO: el posteo de
// hoy se programa a las 17:00 EST y el escenario solo vale si «ahora»
// es antes de esa hora; después de las 17:00 el 900 ya pasó y deja de
// ser el próximo (no es regresión, es el fixture vencido — pasó 6/11
// 17:22: 39/5 con la carta sin hoy). Se congela el reloj DENTRO de la
// VM a hoy 15:00 EST: el 900 (17:00) queda futuro, el 902 (07:00)
// queda pasado, y el escenario es determinista a cualquier hora real.
// Date.parse/UTC se heredan de Date; new Date('...') parsea normal.
const NOW_FIJO = Date.parse(todayKey + 'T20:00:00Z'); // hoy 15:00 EST
class DateFija extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW_FIJO])); }
  static now() { return NOW_FIJO; }
}
let ritualPendiente = true;
const ME = { lang: 'es' };
const sandbox = {
  console,
  ME,
  Date: DateFija, // reloj congelado a hoy 15:00 EST (ver arriba)
  Math, JSON, String, Number, Array, Object, Infinity, isNaN,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (u) => u,
  pzIc: () => '',
  hfCoverState: () => ({ has: false }),
  hfWhenChip: (p) => {
    try {
      const d = new Date(String(p.scheduled_at || '').replace(' ', 'T'));
      if (isNaN(d)) return '';
      return keyOf(d, TZ) === todayKey ? 'Hoy · 17:00' : '';
    } catch (e) { return ''; }
  },
  hfPlanChip: () => '',
  hfTileChipParts: () => null,
  pzAprobadoEs: () => false,
  pcParseDate: (s) => { if (!s) return null; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? null : d; },
  pcTz: () => TZ,
  schedDayKeyOf: (d, tz) => keyOf(d, tz),
  hfIgShortcode: (u) => { const m = String(u || '').match(/\/p\/([^/?#]+)/); return m ? m[1] : null; },
  hfFeedSortKey: (x) => (x.post ? (x.post.scheduled_at || x.post.published_at || '') : (x.taken_at || '')),
  hfCmpDescKey: (a, b) => String(b).localeCompare(String(a)),
  pzRitualPendiente: () => ritualPendiente,
  HOME_REEL_SVG: '<svg class="hf-glyph"></svg>',
  HOME_PIN_SVG: '<svg class="hf-glyph"></svg>',
  HOME_CAR_SVG: '<svg class="hf-glyph"></svg>',
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
const composeSrc = sliceFn(app, 'function homeGridCompose(input) {', '\nconst HOME_REEL_SVG');
const tileSrc = sliceFn(app, 'function homeTileHTML(t, i) {', '\nfunction hfHighlightsTrayHTML');
t(composeSrc.length > 5000, 'extracción: homeGridCompose presente');
t(tileSrc.length > 5000, 'extracción: homeTileHTML presente');
vm.runInContext(composeSrc + '\n' + tileSrc, ctx);
const compose = ctx.homeGridCompose;
const tileHTML = ctx.homeTileHTML;

const post = (id, status, dayKey, extra) => Object.assign({
  id, status, media_type: 'image', caption: 'Posteo ' + id,
  image_path: '/media/post-' + id + '.jpg', carousel_paths: null,
  scheduled_at: status === 'published' ? null : schedAt(dayKey, (extra && extra.hh) || '22'),
  published_at: status === 'published' ? schedAt(dayKey, (extra && extra.hh) || '22') : null,
  ig_permalink: status === 'published' ? `https://www.instagram.com/p/DfPost${id}/` : null,
  ig_state: status === 'published' ? 'live' : null,
  approval: 'pending', pinned: false, pinned_at: null,
}, extra || {});
// Feed v710: programado de hoy (el próximo, carta) + programado de hoy
// ya vencido/en publicación (rinde como tile normal, no es nextPost)
// + programado de mañana (fuera) + publicado de ayer.
const upcoming = [
  { p: post(900, 'scheduled', todayKey), ymd: todayKey },
  { p: post(902, 'scheduled', todayKey, { hh: '12' }), ymd: todayKey },
  { p: post(901, 'scheduled', plusKey(1)), ymd: plusKey(1) },
];
const published = [post(800, 'published', plusKey(-1))];
const tiles = compose({ upcoming, published, recents: [], ritual: null });
const oculta = tiles.find((x) => x.kind === 'oculta');
const hoyTile = tiles.find((x) => x.kind === 'post' && x.post && x.post.id === 902);
const pubTile = tiles.find((x) => x.kind === 'post' && x.post && x.post.id === 800);
const mananaTile = tiles.find((x) => x.kind === 'post' && x.post && x.post.id === 901);
t(tiles[0] === oculta, 'compose: la carta del próximo va primera (idx 0)');
t(!!oculta && oculta.post.id === 900 && oculta.hoy === true, 'compose: carta de HOY lleva hoy=true');
t(!!hoyTile, 'compose: el programado de hoy rinde en la grilla');
t(hoyTile && hoyTile.hoy === true, 'compose: programado de hoy lleva hoy=true');
t(!mananaTile, 'compose: programado de mañana NO rinde en el feed (vive en Semana)');
t(!!pubTile && !pubTile.hoy, 'compose: publicado NO lleva hoy');

// Carta de mañana (sin posteo hoy): el próximo es de mañana → sin marca.
const tilesMan = compose({ upcoming: [{ p: post(901, 'scheduled', plusKey(1)), ymd: plusKey(1) }], published, recents: [], ritual: null });
const ocultaMan = tilesMan.find((x) => x.kind === 'oculta');
t(!!ocultaMan && ocultaMan.hoy === false, 'compose: carta de MAÑANA lleva hoy=false');

// ---------- 3. Render ES: badge solo en el posteo del día ----------
ME.lang = 'es';
ritualPendiente = true; // carta velada
const htmlVelada = tileHTML(oculta, 0);
t(htmlVelada.includes('hf-hoy-badge') && htmlVelada.includes('>HOY<'), 'tile ES: carta velada de hoy lleva HOY');
t(!htmlVelada.includes('>TODAY<'), 'tile ES: carta velada no lleva TODAY');
t(cnt(htmlVelada, 'hf-hoy-badge') === 1, 'tile ES: carta velada lleva UNA sola marca HOY');
ritualPendiente = false; // carta abierta (ya se eligió)
const ocultaAbierta = Object.assign({}, oculta, { openHoy: true });
const htmlAbierta = tileHTML(ocultaAbierta, 0);
t(htmlAbierta.includes('hf-hoy-badge') && htmlAbierta.includes('>HOY<'), 'tile ES: carta abierta de hoy lleva HOY');
const htmlHoy = tileHTML(hoyTile, 1);
t(htmlHoy.includes('hf-hoy-badge') && htmlHoy.includes('>HOY<'), 'tile ES: programado de hoy lleva HOY');
t(cnt(htmlHoy, 'hf-hoy-badge') === 1, 'tile ES: programado de hoy lleva UNA sola marca HOY');
const htmlPub = tileHTML(pubTile, 2);
t(!htmlPub.includes('hf-hoy-badge') && !htmlPub.includes('>HOY<'), 'tile ES: publicado NO lleva HOY');
const htmlManana = tileHTML(ocultaMan, 0);
t(!htmlManana.includes('hf-hoy-badge'), 'tile ES: carta de mañana NO lleva HOY');
// El corazón/aprobar NO está en la tile: lo sacó v724 (sacar-corazón)
// y este lote no lo reintroduce. El tik verde de aprobada sigue.
t(!htmlHoy.includes('hf-like') && !htmlHoy.includes('likeBtn'), 'tile: sin corazón (v724 lo sacó del feed; este lote no lo reintroduce)');
// Sin hoy y sin justPub no hay badge ni solape con «Recién publicado».
const htmlJust = tileHTML(Object.assign({}, hoyTile, { hoy: true, justPub: true }), 1);
t(!htmlJust.includes('hf-hoy-badge') && htmlJust.includes('hf-just-chip'), 'tile: con justPub manda «Recién publicado», HOY no se solapa');

// ---------- 4. Render EN ----------
ME.lang = 'en';
const htmlEn = tileHTML(oculta, 0);
t(htmlEn.includes('hf-hoy-badge') && htmlEn.includes('>TODAY<'), 'tile EN: carta de hoy lleva TODAY');
t(!htmlEn.includes('>HOY<'), 'tile EN: carta de hoy no lleva HOY');
ME.lang = 'es';

// ---------- 5. CSS: badge + dock-5 intacto (sin regla 10px) ----------
const badgeRule = sliceFn(css, '.hf-hoy-badge{', '}');
t(badgeRule.includes('position:absolute') && badgeRule.includes('top:6px') && badgeRule.includes('left:6px'), 'css: .hf-hoy-badge arriba a la izquierda (familia just-chip)');
t(badgeRule.includes('background:#2793C8') && badgeRule.includes('color:#fff'), 'css: .hf-hoy-badge azul Posty con texto blanco (≠ just-chip amarilla)');
t(css.includes('.hf-just-chip{position:absolute;top:6px;left:6px;z-index:3;background:#FEC14D'), 'css: .hf-just-chip intacta (amarilla, Recién publicado)');
// La regla del dock ≤400px a 10px NO existe: con dock-5 (v722) no hace
// falta («Estrategia» a 11px entra a 360 con ~16px de sobra).
t(!css.includes('@media (max-width:400px)'), 'css: SIN regla dock ≤400px a 10px (retirada: innecesaria con dock-5)');
t(!css.includes('.mz-tabs .mz-tab,.mz-tabs .mz-tab-mas{min-width:0;font-size:10px'), 'css: SIN la regla 10px del dock de 6 (texto exacto del lote original)');
t(css.includes('.mz-tab-mas-ic{') && css.includes('width:24px;height:24px'), 'css: el + sigue en su círculo de 24px');
// Dock-5 (v722, en vivo): Inicio, Ads, +, Estrategia, Premios (las dos
// shells). Ajustes vive en el perfil, no en el dock.
const mzNav = (app.split('\n').find((l) => l.includes('<nav class="mz-tabs"')) || '');
t(cnt(mzNav, "t('") === 4 && cnt(mzNav, 'pzDockMasBtn') === 1, 'mzTabsHTML: dock en 5 (4 tabs + Agregar centro)');
const mzOrd = ['inicio', 'ads', 'pzDockMasBtn', 'analisis', 'jardin']
  .map((k) => mzNav.indexOf(k === 'pzDockMasBtn' ? 'pzDockMasBtn' : `t('${k}'`));
t(mzOrd.every((v) => v !== -1) && mzOrd.every((v, i, a) => i === 0 || v > a[i - 1]), 'mzTabsHTML: orden intacto Inicio, Ads, +, Estrategia, Premios');
t(!mzNav.includes("t('ajustes'"), 'mzTabsHTML: Ajustes NO está en el dock (vive en el perfil, v722)');
const bbNav = (app.split('\n').find((l) => l.includes('<nav class="bb-bar"')) || '');
t(bbNav.includes("tabBtn('inicio'") && bbNav.includes("tabBtn('ads'") && bbNav.includes("pzDockMasBtn('bb')") && bbNav.includes("tabBtn('analisis'") && bbNav.includes("tabBtn('jardin'"), 'bbBar: dock en 5 en la shell nativa (mismo orden)');
// Sin números inventados ni cambios de contenido del feed.
t(cnt(app, 'hf-hoy-badge') === 1, 'app: literal hf-hoy-badge en 1 punto (la const; los 3 renders usan ${hoyBadge})');

console.log(`\ntest-lote-marca-hoy-dock: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
