// test-loteglass.js — LOTE GLASS · home en vidrio + 4 fixes urgentes.
// Valentino 1/11: atrás desde un posteo volvía a otra vista; la tarjeta
// «Para vos» mostraba markup literal; la bio mostraba entidades crudas;
// la píldora «Aceptar todo» tapaba tiles. Más: Inicio en vidrio.
// Node puro, lee el árbol. Uso: node test-loteglass.js
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
const demo = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
function sandbox(extra) {
  const sb = {
    console, Intl, Date, Map, Set,
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: (n) => '<span class="pz-ic">' + n + '</span>',
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, createElement: () => ({}) },
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  Object.assign(sb, extra || {});
  vm.createContext(sb);
  return sb;
}
function loadSlice(sb, code, name) {
  t(code.length > 0, 'existe ' + name);
  if (code) vm.runInContext(code.replace('function ' + name, 'globalThis.' + name + ' = function'), sb);
}

// ---------- Versiones + censo (referencia v519) ----------
t(srv.includes("const BUILD_ID = '20261101-v533'"), 'BUILD v522 en server.js');
t(idx.includes('app.js?v=355') && idx.includes('styles.css?v=20261074'), 'index: app 341 + styles 20261064');
t(idxEn.includes('styles.css?v=20261074') && !idxEn.includes('app.js?v='), 'en/index: styles 20261064, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v516 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'function pzApvBackHTML') === 1, 'sin duplicados: pzApvBackHTML 1');
t(cnt(app, 'function pzDecEnt') === 1, 'sin duplicados: pzDecEnt 1');
t(cnt(app, 'let PZ_VIEW_KEY') === 1, 'sin duplicados: PZ_VIEW_KEY 1');

// ---------- B1: atrás con origen ----------
{
  const sb = sandbox();
  loadSlice(sb, sliceFn(app, 'function pzApvBackHTML', 'function pzRestoreScroll'), 'pzApvBackHTML');
  const run = (prev, en) => {
    sb.PZ_PREV_VIEW = prev;
    sb.ME = { lang: en ? 'en' : 'es' };
    return sb.pzApvBackHTML(en);
  };
  let h = run('#/app/inicio', false);
  t(h.includes('href="#/app/inicio"') && h.includes('Inicio'), 'B1: desde Inicio vuelve a Inicio (ES)');
  h = run('#/app/inicio', true);
  t(h.includes('href="#/app/inicio"') && h.includes('Home'), 'B1: desde Inicio vuelve a Home (EN)');
  h = run('#/app/schedule', false);
  t(h.includes('href="#/app/schedule"') && h.includes('Semana'), 'B1: desde Schedule vuelve a Semana');
  h = run('#/app/schedule', true);
  t(h.includes('href="#/app/schedule"') && h.includes('Week'), 'B1: desde Schedule vuelve a Week');
  h = run('', false);
  t(h.includes('href="#/app/inicio"'), 'B1: sin origen, cae a Inicio');
  h = run('#/app/post/123', false);
  t(h.includes('href="#/app/inicio"'), 'B1: origen posteo no encadena a otro posteo');
  h = run('#/login', false);
  t(h.includes('href="#/app/inicio"'), 'B1: origen fuera de la app cae a Inicio');
  h = run('#/app/jardin-posty', false);
  t(h.includes('href="#/app/jardin-posty"') && h.includes('Jardín'), 'B1: desde Jardín vuelve a Jardín');
  h = run('#/app/analisis', true);
  t(h.includes('href="#/app/analisis"') && h.includes('Strategy'), 'B1: desde Estrategia vuelve a Strategy');
  const apv = sliceFn(app, 'async function approvalPostView', 'function apvMoreHTML');
  t(apv.includes('pzApvBackHTML(en)'), 'B1: approvalPostView usa el atrás con origen');
  const dg = sliceFn(app, 'async function dogfoodView', 'async function approvalPostView');
  t(dg.includes('pzApvBackHTML(enD)'), 'B1: dogfood usa el atrás con origen');
  t(!app.includes('apv-back" href="#/app/schedule"'), 'B1: ningún atrás fijo a Schedule en apv-back');
  t(app.includes('PZ_SCROLL_POS[PZ_VIEW_KEY] = window.scrollY'), 'B1: render guarda el scroll al salir de una vista');
  t(app.includes('pzRestoreScroll()'), 'B1: hashchange restaura el scroll al volver');
  // pzRestoreScroll: vuelve desde posteo restaura; si no, no toca nada
  const sb2 = sandbox({ location: { hash: '#/app/inicio' }, window: { scrollY: 0, scrollTo: function (x, y) { this._to = [x, y]; } } });
  loadSlice(sb2, sliceFn(app, 'function pzRestoreScroll', 'async function render'), 'pzRestoreScroll');
  sb2.PZ_PREV_VIEW = '#/app/post/5';
  sb2.PZ_SCROLL_POS = { '#/app/inicio': 420 };
  sb2.pzRestoreScroll();
  t(sb2.window._to && sb2.window._to[0] === 0 && sb2.window._to[1] === 420, 'B1: volver desde posteo restaura el scroll de Inicio');
  sb2.window._to = null;
  sb2.PZ_PREV_VIEW = '#/app/schedule';
  sb2.pzRestoreScroll();
  t(sb2.window._to === null, 'B1: sin posteo previo, no se restaura nada');
}

// ---------- B2: tarjeta «Para vos» sin markup literal ----------
{
  const sb = sandbox();
  loadSlice(sb, sliceFn(app, 'function pvTrayHTML', '// Toggle de las filas'), 'pvTrayHTML');
  const out = sb.pvTrayHTML([{ label: '<span class="pz-ic">help</span> Posty te pregunta', slot: 'hs-question' }], false);
  t(out.includes('<span class="pz-ic">help</span> Posty te pregunta'), 'B2: el ícono se RENDERIZA en la fila de la bandeja');
  t(!out.includes('&lt;span'), 'B2: ningún markup escapado en la fila de la bandeja');
  const out2 = sb.pvTrayHTML([{ label: '<span class="pz-ic">rocket</span> Tu primer posteo', html: '<p>x</p>' }], false);
  t(out2.includes('<span class="pz-ic">rocket</span> Tu primer posteo'), 'B2: fila html también renderiza el ícono');
  t(!app.includes('esc(it.label)'), 'B2: ningún esc(it.label) restante');
  t(app.includes("when.innerHTML = esc(hfStoryDayLabel"), 'B2: visor de historias usa innerHTML (mismo patrón)');
  t(!app.includes('when.textContent = (hfStoryDayLabel'), 'B2: visor de historias ya no usa textContent con markup');
}

// ---------- B3: bio sin entidades crudas ----------
{
  const sb = sandbox();
  loadSlice(sb, sliceFn(app, 'function pzDecEnt', '/* ---------- Sistema de íconos'), 'pzDecEnt');
  const bio = 'Posty &#x2022; Tu community manager (&#064;posty.communitymanager) &#x2022; Instagram photos and videos';
  const dec = sb.pzDecEnt(bio);
  t(dec === 'Posty • Tu community manager (@posty.communitymanager) • Instagram photos and videos', 'B3: entidades de la bio decodificadas (• y @)');
  t(sb.pzDecEnt('Café & Té') === 'Café & Té', 'B3: texto limpio no cambia');
  t(sb.pzDecEnt('A &amp; B') === 'A & B', 'B3: &amp; decodificado');
  t(sb.pzDecEnt('&lt;b&gt;hola&lt;/b&gt;') === '<b>hola</b>', 'B3: entidades con nombre decodificadas');
  t(sb.pzDecEnt('&#x1F600;') === '😀', 'B3: entidad hex fuera del BMP decodificada');
  t(sb.pzDecEnt('') === '', 'B3: vacío sigue vacío');
  t(!sb.esc(dec).includes('&#x2022') && !sb.esc(dec).includes('&#064'), 'B3: tras decodificar + esc, no quedan entidades literales');
  t(app.includes('pzDecEnt(String(P.bio'), 'B3: el render de la bio decodifica antes de escapar');
  const bioFn = sliceFn(demo, 'function extractIgBiography', '// Keywords');
  t(bioFn.includes('fromCodePoint'), 'B3: la ingesta (extractIgBiography) también decodifica entidades');
}

// ---------- B4: despeje de la píldora flotante ----------
{
  t(css.includes('#inicioView.hf-wrap{padding-bottom:calc(148px + env(safe-area-inset-bottom))}'), 'B4: Inicio con despeje 148px+safe');
  t(css.includes('.sched-wrap{padding-bottom:calc(148px + env(safe-area-inset-bottom))}'), 'B4: Schedule con despeje 148px+safe (antes sin despeje)');
  t(css.includes('.accept-pill{position:fixed'), 'B4: la píldora sigue fija (solo cambia el despeje)');
}

// ---------- G: home en vidrio ----------
{
  t(css.includes('linear-gradient(165deg,#dff1fa 0%,#eef9fd 30%,#fdf9ec 62%,#fdeec2 100%)'), 'G: fondo degradado suave celeste → dorado');
  t(css.includes('#inicioView .mx-tira-jardin.mx-tira-posty{background:rgba(255,255,255,.55)'), 'G: tira de vidrio');
  t(css.includes('#inicioView .mx-port-top{margin:10px 12px 14px}'), 'G: tira flotante separada del feed');
  t(css.includes('#inicioView .hf-head{background:rgba(255,255,255,.40)'), 'G: cabecera de vidrio .40 (decisión Valentino 1/11 21:52 opción ii: SOLO la tarjeta baja a .40; tira/botones/chat/tab-bar quedan en .55 — supersede la uniformidad v519 para la cabecera)');
  t(css.includes('#inicioView .hf-pacts .hf-pmain{background:rgba(255,255,255,.55)'), 'G: botones de vidrio');
  t(css.includes('#inicioView .mz-chatbar{background:rgba(255,255,255,.55)'), 'G: chat de vidrio');
  t(css.includes('.bb-app.bb-glass-inicio .bb-bar{background:rgba(255,255,255,.55)'), 'G: tab bar de vidrio solo en Inicio');
  t(app.includes("bb-glass-inicio") && app.includes("tab === 'inicio' ? ' bb-glass-inicio'"), 'G: la clase de vidrio solo se pone en Inicio');
  t(css.includes('#inicioView .hf-grid{background:transparent}'), 'G: grilla transparente (fotos sin vidrio)');
  const glass = css.slice(css.indexOf('LOTE GLASS'));
  t(glass.includes('backdrop-filter:blur(16px) saturate(1.4)'), 'G: blur 16px + saturate del mock');
  t(!glass.includes('.hf-tile'), 'G: ningún backdrop-filter sobre tiles');
  t(css.includes('.mx-tira-barra i{background:linear-gradient(90deg,#2793C8,#FEC14D)'), 'G: barrita degradada del Lote 17 intacta');
  t(css.includes('.hf-tile.hf-tile-draft{outline:2px dashed #2793C8'), 'G: punteados de borradores QUEDAN');
  t(app.includes('jardin-bambu.webp'), 'G (LOTE JARDÍN): miniatura = bambusal completo en chico (sin render inventado)');
  t(!css.includes('#inicioView .hf-pacts,#inicioView .hf-tabs{background:#0A1E33'), 'G: sin banda navy reintroducida');
  t(app.includes('mxTiraHTML') && app.includes('mx-jardin-vivo'), 'G: pantalla Jardín existe (el LOTE JARDÍN la rediseña)');
}

console.log(`LOTEGLASS: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
