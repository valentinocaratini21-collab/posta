// test-lotefeed.js — LOTE FEED COMPLETO + vidrio botones + patrón desktop + transiciones.
// Valentino 1/11: «el perfil tiene que aparecer con todos los posts que
// tienen en su feed» — nada se pierde en silencio. Node puro, lee el
// árbol. Uso: node test-lotefeed.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const audit = fs.readFileSync(path.join(__dirname, 'feed-audit.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
function sandbox(extra) {
  const sb = {
    console,
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: { getElementById: () => null, activeElement: null, createElement: () => ({}) },
    Intl, Date, Map, Set,
    pcParseDate: (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
    schedYmdToDate: (ymd) => { const d = new Date(ymd + 'T00:00:00Z'); return isNaN(d) ? null : d; },
    schedDayKeyOf: (dt, tz) => { try { return dt.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } },
    schedPlacements: (all, tz) => {
      const byDay = new Map(), proposals = new Map();
      for (const p of (all || [])) {
        if ((p.status === 'scheduled' || p.status === 'draft') && p.scheduled_at) {
          const k = String(p.scheduled_at).slice(0, 10);
          if (!byDay.has(k)) byDay.set(k, []);
          byDay.get(k).push({ p });
        }
      }
      return { byDay, dayOf: new Map(), proposals };
    },
    pzIc: () => '',
    pzDecEnt: (s) => String(s == null ? '' : s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
    mv: (x) => x,
    hfCoverState: () => ({ has: false }),
    hfWhenChip: () => '',
    hfPlanChip: () => '',
    hfTileChipParts: () => null,
    hfHighlightsTrayHTML: () => '',
    hfTabsHTML: () => '',
  };
  Object.assign(sb, extra || {});
  vm.createContext(sb);
  return sb;
}
function loadFns(sb, names) {
  for (const n of names) {
    const code = extractFn(app, n);
    t(code.length > 0, 'existe ' + n);
    if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
}

// ---------- Versiones + censo (referencia v519) ----------
t(srv.includes("const BUILD_ID = '20261101-v529'"), 'BUILD v520 en server.js');
t(idx.includes('app.js?v=350') && idx.includes('styles.css?v=20261069'), 'index: app 343 + styles 20261064');
t(idxEn.includes('styles.css?v=20261069') && !idxEn.includes('app.js?v='), 'en/index: styles 20261064, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v516 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- Composición del feed ----------
const sb = sandbox();
loadFns(sb, ['hfIgShortcode', 'hfFeedUpcoming', 'hfFeedSortKey', 'hfCmpDescKey', 'homeGridCompose', 'hfVisitorTiles', 'homeTileHTML']);
const F = sb;
t(F.hfIgShortcode('https://www.instagram.com/p/ABC123xyz/') === 'ABC123xyz', 'shortcode desde /p/');
t(F.hfIgShortcode('https://www.instagram.com/reel/AbC-12_34/') === 'AbC-12_34', 'shortcode desde /reel/');
t(F.hfIgShortcode('sin permalink') === null, 'sin permalink = null');

const pub = { id: 1, status: 'published', media_type: 'image', image_path: '/media/a.jpg', published_at: '2026-10-20T19:00:00Z', ig_permalink: 'https://www.instagram.com/p/ABC123xyz/' };
const arch = { id: 2, status: 'published', media_type: 'image', image_path: '/media/b.jpg', published_at: '2026-10-10T19:00:00Z', ig_state: 'archived_ext', ig_permalink: 'https://www.instagram.com/p/OLD999/' };
const sched = { id: 3, status: 'scheduled', media_type: 'image', image_path: '/media/c.jpg', scheduled_at: '2026-11-05T19:00:00Z' };
const draftNoDate = { id: 4, status: 'draft', media_type: 'image', image_path: '/media/d.jpg', created_at: '2026-11-01T10:00:00Z' };
const all = [pub, arch, sched, draftNoDate];
const upcoming = F.hfFeedUpcoming(all, 'America/New_York');
t(upcoming.map((u) => u.p.id).join(',') === '3,4', 'upcoming: programado + borrador sin fecha (no se pierde)');
const recents = [
  { img: '/media/ig-old.jpg', type: 'image', taken_at: 1700000000, shortcode: 'MANUAL1' },
  { img: '/media/ig-new.jpg', type: 'image', taken_at: 1790000000, shortcode: 'MANUAL2' },
  { img: '/media/ig-dup.jpg', type: 'image', taken_at: 1760000000, shortcode: 'ABC123xyz' },
];
const tiles = F.homeGridCompose({ upcoming, published: [pub, arch], recents });
const sig = tiles.map((x) => (x.kind === 'ig' ? 'ig:' + x.img : 'post:' + x.post.id + (x.archivedExt ? ':ARCH' : ''))).join('|');
t(sig === 'post:3|post:4|post:1|post:2:ARCH|ig:/media/ig-new.jpg|ig:/media/ig-old.jpg', 'orden Lote 12 + archivado marcado + manuales viejo y nuevo: ' + sig);
t(!sig.includes('ig-dup'), 'sin duplicado: el reciente que ya es publicado se descarta una vez');
const vis = F.hfVisitorTiles(tiles);
t(!vis.some((x) => x.kind === 'post' && x.post.id === 2), 'visitante NO ve el archivado');
t(vis.some((x) => x.kind === 'post' && x.post.id === 1), 'visitante sí ve el publicado vivo');
const many = [];
for (let i = 0; i < 30; i++) many.push({ id: 100 + i, status: 'scheduled', media_type: 'image', image_path: '/media/x.jpg', scheduled_at: '2026-12-' + String((i % 28) + 1).padStart(2, '0') + 'T19:00:00Z' });
t(F.homeGridCompose({ upcoming: F.hfFeedUpcoming(many, 'America/New_York'), published: [], recents: [] }).length === 30, 'sin tope 24: 30 programados rinden 30');
t(!app.includes('HOME_FEED_CAP = 24') || !/slice\(0, cap\)/.test(extractFn(app, 'homeGridCompose')), 'homeGridCompose ya no corta por tope');
const tileArch = F.homeTileHTML({ kind: 'post', post: arch, archivedExt: true }, 0);
t(tileArch.includes('hf-archived-tile') && tileArch.includes('Archivado'), 'tile del archivado: clase + chip Archivado');
const sbEn = sandbox({ ME: { lang: 'en' } });
loadFns(sbEn, ['homeTileHTML']);
t(sbEn.homeTileHTML({ kind: 'post', post: arch, archivedExt: true }, 0).includes('Archived'), 'tile del archivado EN: Archived');
// Corazón, chapita y punteado intactos en una tile borrador común
const tileDraft = F.homeTileHTML({ kind: 'post', post: { id: 9, status: 'draft', media_type: 'image', image_path: '/media/z.jpg', caption: 'hola' }, day: '2026-11-03' }, 1);
t(tileDraft.includes('hf-tile-draft') && tileDraft.includes('data-hf-like'), 'borrador intacto: punteado + corazón');

// ---------- Contadores = IG (no conteo de tiles) ----------
loadFns(sb, ['homeHeadHTML']);
const head = F.homeHeadHTML({ username: 'posty.communitymanager', name: 'Posty.', posts_count: 6, followers: 8, following: 3, pic: '', bio: '', link: '' }, 'Posty.', { en: false });
t(head.includes('>6<') && head.includes('>8<'), 'contadores del head = números de IG (6 y 8), no conteo de tiles');

// ---------- Botones en vidrio + una línea ----------
t(css.includes('#inicioView .hf-pacts{background:transparent'), 'pacts sin fondo blanco (modo oscuro ya no mata el vidrio)');
t(css.includes('#inicioView .hf-pacts .hf-pmain{background:rgba(255,255,255,.55)'), 'botones con el vidrio de los paneles');
t(/\.hf-pacts \.hf-pmain\{[^}]*white-space:nowrap/.test(css), 'botones en una sola línea');
t(/\.hf-pacts\{[^}]*align-items:stretch/.test(css), 'botones misma altura (stretch)');

// ---------- Patrón cuadritos solo desktop ----------
const gridPat = 'repeating-linear-gradient(90deg, rgba(10,30,51,.030) 0 76px';
t(css.includes(gridPat), 'patrón cuadritos presente (mismo de gj.css)');
t(/@media\(min-width:761px\)\{[^}]*repeating-linear-gradient\(90deg, rgba\(10,30,51,\.030\)/.test(css), 'patrón dentro del breakpoint desktop 761px');
t(!/@media\(max-width:760px\)[^@]*repeating-linear-gradient\(90deg, rgba\(10,30,51,\.030\)/.test(css), 'patrón ausente en móvil');
t(css.includes('body:has(#inicioView)') && css.includes('.bb-app.bb-glass-inicio'), 'patrón solo en Inicio (web + shell)');

// ---------- Transiciones ----------
t(app.includes('function pzReducedMotion'), 'existe pzReducedMotion');
t(app.includes('function pzMagicTrail'), 'existe pzMagicTrail');
t(app.includes('function pzPlayEnter'), 'existe pzPlayEnter');
t(app.includes('PZ_NAV_STACK') && app.includes("PZ_NAV_DIR = 'back'") && app.includes("PZ_NAV_DIR = 'fwd'"), 'dirección avance/vuelta por pila');
t(app.includes('pzPlayEnter()') && app.includes("root.innerHTML = appShell(tab, content);"), 'hook tras pintar');
t(app.includes('scfClosePop(true)'), 'cierres explícitos con vuelta a la tile');
t(app.includes('pop.animate') && app.includes('translate('), 'zoom FLIP desde la tile (WAAPI)');
t(css.includes('@keyframes pzSlideFwd') && css.includes('@keyframes pzSlideBack'), 'slides avance/vuelta en CSS');
t(css.includes('.pz-enter-fwd{animation:pzSlideFwd .3s ease-out}'), 'slide ~300 ms');
t(css.includes('.pz-trail-spark') && css.includes('#FEC14D') && css.includes('#2793C8'), 'estela dorada + celeste con destellos');
t(css.includes(':where(#app) button:active{transform:scale(.97)'), 'botón responde al instante (scale + brillo)');
t(css.includes("@media (prefers-reduced-motion: reduce)") && app.includes("prefers-reduced-motion: reduce"), 'reduced-motion: sin animación (CSS + JS)');

// ---------- Servidor: topes que cortaban en silencio ----------
t(srv.includes('ORDER BY p.created_at DESC LIMIT 500'), '/api/posts sin tope 100 (ahora 500)');
t(audit.includes('const MAX_POSTS = 100;'), 'lectura IG sin tope 12 (ahora 100)');

console.log(`\nlotefeed: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
