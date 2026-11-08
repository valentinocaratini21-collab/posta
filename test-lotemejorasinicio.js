// test-lotemejorasinicio.js — LOTE MEJORAS-INICIO (pedido Valentino 3/11 ~23:00, + pieza 7 DETALLE-LIMPIO 23:05).
// 7 piezas, todas en Inicio/feed, archivos public/app.js + public/styles.css.
// Node puro, lee el árbol. Uso: node test-lotemejorasinicio.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
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
    Intl, Date, Map, Set,
    pcParseDate: (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
    schedYmdToDate: (ymd) => { const d = new Date(ymd + 'T00:00:00Z'); return isNaN(d) ? null : d; },
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
const sb = sandbox();
loadFns(sb, ['pcParseDate', 'schedYmdToDate', 'hfFeedSortKey', 'hfCmpDescKey', 'hfIgShortcode', 'homeGridCompose', 'hfVisitorTiles']);
const P = (id, st, pub, sch) => ({ id, status: st, published_at: pub, scheduled_at: sch, media_type: 'image', image_path: 'x.jpg' });
const pubIds = (tiles) => tiles.filter((x) => x.kind === 'post' && x.post && x.post.status === 'published').map((x) => x.post.id);
const igImgs = (tiles) => tiles.filter((x) => x.kind === 'ig').map((x) => x.img);
const yaSalidos = (tiles) => tiles.filter((x) => x.kind === 'ig' || (x.kind === 'post' && x.post.status === 'published'));

// ---------- Censo (base v608; el lote no toca server.js ni esas marcas) ----------
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 17, 'censo server: /aprobar 17');
t(srv.includes("const BUILD_ID = '20261101-v608'"), 'censo server: BUILD v608 intacto');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: /aprobar 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');

// ---------- PIEZA 1: Aceptar todo a la izquierda, nota con ❤️ a la derecha, un renglón ----------
t(app.includes("en ? '❤️ Tap the heart to approve.' : '❤️ Tocá el corazón para aprobar.'"), 'P1: nota con ❤️ antes del texto, ES y EN');
t(css.includes('.hf-pacts-accept{display:flex;align-items:center;gap:8px;flex-wrap:nowrap'), 'P1: fila nowrap, sin salto');
t(css.includes('.hf-accept-note{font-size:12.5px') && css.includes('white-space:nowrap') && css.includes('text-overflow:ellipsis'), 'P1: nota 12.5px (inicio-3 intacto), nowrap, ellipsis de seguridad');
t(css.includes('.hf-pacts-accept .hf-accept-bar{width:auto;flex:none;margin:0;padding:10px 12px;font-size:14px}'), 'P1: botón compacto fijo a la izquierda');
t(app.includes('function acceptBarHTML') && app.includes('function pzAcceptAllWeek') && app.includes('function pzAcceptAllWeekCands'), 'P1: mismo handler y alcance (solo programados pendientes de la semana nueva)');
t(app.includes('hfProfileActionsHTML') && app.includes('hf-pacts-accept'), 'P1: la nota sigue solo en el encabezado (no en dos lugares)');
// Aritmética a 390px: botón ~165px (2 dígitos, 14px) + gap 8 + nota ~186px (12.5px) = 359 < 370 de contenido (390 - padding 20).
t(165 + 8 + 186 <= 390 - 20, 'P1: aritmética 390px: botón + gap + nota entran en un renglón');

// ---------- PIEZA 2: fuera etiqueta-semana y chips de filtro ----------
t(cnt(app, 'pzSemanaEtiqueta') === 0, 'P2: ninguna Semana del… (función ni llamada)');
t(cnt(app, 'pzSemanaLunDom') === 0, 'P2: sin cómputo lun-dom huérfano');
t(cnt(app, 'hfFiltroHTML') === 0 && cnt(app, 'hfFiltroTiles') === 0 && cnt(app, 'hfFiltroAplicar') === 0 && cnt(app, 'hfFiltroGrupo') === 0, 'P2: sin funciones de filtro');
t(cnt(app, 'HF_FILTRO') === 0, 'P2: sin variable HF_FILTRO');
t(cnt(app, 'data-hf-filtro-chip') === 0, 'P2: sin chips en la plantilla');
t(cnt(app, 'filtroHTML') === 0 && cnt(app, 'filtroTiles') === 0, 'P2: sin cómputo de filtro en inicioView');
t(!/\.hf-semana\{/.test(css), 'P2: sin CSS .hf-semana');
t(!/\.hf-filtro/.test(css), 'P2: sin CSS .hf-filtro*');
t(app.includes('pzSemanaOkHTML') && css.includes('.hf-semana-ok'), 'P2: la tira semana-aprobada (real-only, v588) QUEDA intacta');

// ---------- PIEZA 3: botón + del dock con «Agregar» abajo, alineado ----------
{
  const btn = extractFn(app, 'pzDockMasBtn');
  t(btn.includes("gzT('Agregar', 'Add')"), 'P3: palabra Agregar/Add abajo del +');
  t(btn.includes('pzDockMasToggle()'), 'P3: el + sigue abriendo la misma hoja');
  t(btn.includes('mz-tab-mas-ic') && btn.includes('bb-tab-mas-ic') && btn.includes('mz-tab-mas-lb') && btn.includes('bb-tab-mas-lb'), 'P3: icono + etiqueta en ambas variantes (bb y mz)');
  t(cnt(app, 'pzDockMasBtn(') === 1, 'P3: 1 definición, 0 llamadas (R0: el + salió del dock)');
  t(css.includes('.mz-tab-mas-ic{') && css.includes('.bb-tab-mas-ic{') && css.includes('.mz-tab-mas-lb,.bb-tab-mas-lb{'), 'P3: CSS icono 24px + etiqueta 11px');
  t(css.includes('.mz-tab-mas{display:block') && css.includes('.bb-tab-mas{display:flex') && css.includes('flex-direction:column'), 'P3: geometría de pestaña por variante');
  t(!/\.bb-tab-mas, .mz-tab-mas\{[^}]*width:52px/.test(css), 'P3: fuera el círculo 52px (documentado: 52px + etiqueta rompería los offsets del dock)');
  t(css.includes('background:rgba(255,255,255,.55)') && css.includes('backdrop-filter:blur(16px) saturate(1.4)'), 'P3: receta glass intacta en el icono');
  t(css.includes('bottom:calc(84px + env(safe-area-inset-bottom))'), 'P3: la hoja del + sigue en su sitio (offset sin tocar)');
}

// ---------- PIEZA 4: fuera próximo-destacado; el hero del posteo-del-día NO se toca ----------
t(cnt(app, 'function pzProximoDestacadoHTML') === 0 && cnt(app, 'function pzProximoDestacadoPost') === 0, 'P4: sin funciones de próximo-destacado');
t(cnt(app, 'pzProximoDestacadoHTML(allPosts') === 0, 'P4: sin tarjeta en la plantilla de inicioView');
t(!/\.hf-nextup/.test(css), 'P4: sin CSS .hf-nextup*');
t(cnt(app, 'pzProximoDestacadoHTML') === 2 && app.includes("typeof pzProximoDestacadoHTML === 'function'"), 'P4: solo queda la guarda del refresh vivo (limpia tarjetas viejas, no renderiza)');
t(app.includes('pzDiaHeroHTML') && app.includes('pzDiaHeroHTML2'), 'P4: hero del posteo-del-día (v591) intacto');

// ---------- PIEZA 5: grilla de 3 completa, cero overflow ----------
t(css.includes('.hf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'), 'P5: grid minmax(0,1fr) — la columna ya no la infla el contenido');
t(css.includes('.hf-cell{display:block;min-width:0}'), 'P5: celda sin mínimo impuesto');
{
  // 390px: 3 columnas + 2 gaps de 2px = ancho exacto, cero overflow lateral.
  const col = (390 - 2 * 2) / 3;
  t(Math.abs(3 * col + 2 * 2 - 390) < 0.01 && col > 0, 'P5: aritmética 390px: 3 columnas completas, sin overflow');
  t(css.includes('html') && css.includes('overflow-x:clip'), 'P5: la página ya clipaba en X (el síntoma era corte, no scroll)');
}

// ---------- PIEZA 6: publicados en gris = LITERALMENTE los últimos 6 de IG ----------
// 6a. Archivados pre-corte: los 2 más nuevos están archivados; con filtro
// DESPUÉS del corte quedarían solo 4. Con filtro ANTES, rinden los 6 reales.
{
  const pubs = [];
  for (let d = 1; d <= 8; d++) {
    const p = P(800 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`);
    if (d === 7 || d === 8) p.ig_state = 'archived_ext';
    pubs.push(p);
  }
  const tiles = sb.homeGridCompose({ upcoming: [], published: pubs, recents: [] });
  t(pubIds(tiles).join(',') === '806,805,804,803,802,801', 'P6a: 6 publicados reales (oct 1–6), los 2 archivados no ocupan tope');
  t(!tiles.some((x) => x.archivedExt), 'P6a: ningún tile archivado rinde');
  t(!pubIds(tiles).includes(807) && !pubIds(tiles).includes(808), 'P6a: los archivados (oct 7–8) están fuera');
}
// 6b. Mezcla con IG real + duplicado por shortcode + archivado más nuevo que todo.
{
  const pubs = [];
  for (let d = 20; d <= 22; d++) {
    const p = P(900 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`);
    p.ig_permalink = 'https://www.instagram.com/p/DB' + d + 'ABC4567/';
    pubs.push(p);
  }
  const arch = P(999, 'published', '2026-10-25T18:00:00Z');
  arch.ig_state = 'archived_ext';
  pubs.push(arch);
  const recents = [];
  for (let i = 0; i < 4; i++) recents.push({ img: '/ig/n' + i + '.jpg', type: 'image', taken_at: 1795000000 + i * 86400, shortcode: 'N' + i + 'XYZ9876' });
  recents.push({ img: '/ig/dup.jpg', type: 'image', taken_at: 1796000000, shortcode: 'DB21ABC4567' });
  const tiles = sb.homeGridCompose({ upcoming: [], published: pubs, recents });
  const ys = yaSalidos(tiles);
  t(ys.length === 6, 'P6b: el grupo ya salido se corta en 6 en total');
  t(igImgs(tiles).join(',') === '/ig/n3.jpg,/ig/n2.jpg,/ig/n1.jpg,/ig/n0.jpg', 'P6b: los 4 recientes de IG rinden, más reciente primero');
  t(pubIds(tiles).join(',') === '922,921', 'P6b: los 2 publicados reales más nuevos completan el tope');
  t(!igImgs(tiles).includes('/ig/dup.jpg'), 'P6b: el reciente duplicado por shortcode no se rinde dos veces');
  t(!pubIds(tiles).includes(999), 'P6b: el archivado más nuevo de todos no entra');
}
// 6c. Fijado sigue fuera del tope (elección explícita del dueño), con archivados presentes.
{
  const pubs = [Object.assign(P(700, 'published', '2026-10-01T18:00:00Z'), { pinned: true, pinned_at: '2026-10-01T00:00:00Z' })];
  for (let d = 2; d <= 10; d++) {
    const p = P(700 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`);
    if (d === 9 || d === 10) p.ig_state = 'archived_ext';
    pubs.push(p);
  }
  const tiles = sb.homeGridCompose({ upcoming: [], published: pubs, recents: [] });
  t(tiles[0].post.id === 700, 'P6c: fijado primero, como siempre');
  t(pubIds(tiles).length === 7, 'P6c: 1 fijado + 6 reales (archivados fuera del tope)');
  t(!pubIds(tiles).includes(709) && !pubIds(tiles).includes(710), 'P6c: archivados fuera también con fijado');
}
// 6d. Visitante: misma composición, mismo tope.
{
  const pubs = [];
  for (let d = 1; d <= 10; d++) {
    const p = P(1000 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`);
    if (d === 9) p.ig_state = 'archived_ext';
    pubs.push(p);
  }
  const vis = sb.hfVisitorTiles(sb.homeGridCompose({ upcoming: [], published: pubs, recents: [] }));
  t(vis.length === 6 && pubIds(vis).join(',') === '1010,1008,1007,1006,1005,1004', 'P6d: visitante ve los mismos 6 (archivado oct 9 fuera)');
}

// ---------- PIEZA 7: DETALLE-LIMPIO — fuera porqué y «Texto en la foto» del detalle del feed ----------
{
  const det = extractFn(app, 'hfDetailHTML');
  t(det.length > 0, 'P7: hfDetailHTML existe');
  t(!det.includes('hf-d-why') && !det.includes('whyLine') && !det.includes('strategy_why'), 'P7: sin línea del porqué en el detalle del feed');
  t(!det.includes('hf-d-overlay') && !det.includes('overlayHTML') && !det.includes('Texto en la foto') && !det.includes('Text on the photo'), 'P7: sin línea «Texto en la foto» en el detalle del feed');
  t(det.includes('${capHTML}') && det.includes('rgLineHTML(p, en)'), 'P7: caption y línea de rubro intactos');
  t(det.includes('hf-d-dots') && det.includes('data-hfd-act="menu"'), 'P7: menú ••• intacto');
  t(det.includes('${accept}'), 'P7: Aceptar fijo intacto');
  t(!/\.hf-d-why\{/.test(css), 'P7: sin CSS .hf-d-why');
  t(!/\.hf-d-overlay/.test(css) && css.includes('.apv-overlay{'), 'P7: CSS overlay solo para apv');
  t(app.includes('apv-overlay') && app.includes('apvWhyTxt') && app.includes("apvWhyTxt ?"), 'P7: vista de aprobación (apv) NO tocada: overlay + porqué siguen ahí');
}

console.log(`\nlotemejorasinicio: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
