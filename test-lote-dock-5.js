// test-lote-dock-5.js — LOTE DOCK-5 (base v721).
// Decisión Valentino 6/11 ~15:28 (3 mensajes): 1) Ajustes sale del dock
// y vive en el perfil (tercer ícono junto a Editar perfil y Compartir);
// el dock queda en 5: Inicio, Ads, +, Estrategia, Premios. 2) «Agregar»
// del mismo color que las demás etiquetas inactivas (en el shell bb la
// etiqueta iba en 700 mientras las inactivas van en 400: se veía
// oscura/negrita). 3) Círculo alrededor del + (vuelve el círculo de
// vidrio de 24px que la Pieza 3 del 3/11 había dejado sin fondo).
// La ruta #/app/ajustes sigue funcionando (deep link, drawer, 'fotos' →
// ajustes, bbAvisosEnAjustes): solo sale el tab del dock, nada más.
// Node puro: asserts estáticos + VM sobre mzTabsHTML. Uso: node test-lote-dock-5.js
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
const orderOk = (s, keys) => {
  let prev = -1;
  for (const k of keys) { const i = s.indexOf(k, prev + 1); if (i === -1 || i < prev) return false; prev = i; }
  return true;
};

(async () => {
  // ---------- 1. Censo (sin cambio) + base v721 ----------
  t(srv.includes("const BUILD_ID = '20261105-v728'"), 'server: BUILD v727 (re-pin iconos-linea-info v727, re-base sobre v726)');
  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
  t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
  t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
  t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
  t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
  t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
  t(app.includes("const CHUNK_V = '20261105-v723'"), 'CHUNK_V v723 (ajustes-simple; sin cambio en este lote)');
  t(md5(css) === '1ab1e38c5985f589df399bca8fea4c53', 'styles.css md5 (re-pin iconos-linea-info v727: íconos en la línea de info)');
  t(md5(app) === 'fb6d3f801b555a0f343f1448c335cab9', 'app.js md5 (re-pin iconos-linea-info v727: headIconsHTML en la línea de info)');

  // ---------- 2. Dock de 5 en las dos shells ----------
  const bbNav = (app.split('\n').find((l) => l.includes("'<nav class=\"bb-bar\">'")) || '');
  t(orderOk(bbNav, ["tabBtn('inicio'", "tabBtn('ads'", "pzDockMasBtn('bb')", "tabBtn('analisis'", "tabBtn('jardin'"]), 'bb-bar: orden Inicio, Ads, +, Estrategia, Premios');
  t(!bbNav.includes("tabBtn('ajustes'"), 'bb-bar: sin tab Ajustes');
  t(bbNav.includes("pzDockMasBtn('bb')"), 'bb-bar: el + sigue en el centro');
  const mzFn = sliceFn(app, 'function mzTabsHTML(tab) {', '\n/* (LOTE DOCK-MAS) */');
  t(orderOk(mzFn, ["t('inicio'", "t('ads'", "pzDockMasBtn('mz')", "t('analisis'", "t('jardin'"]), 'mz-tabs: orden Inicio, Ads, +, Estrategia, Premios');
  t(!mzFn.includes("t('ajustes'"), 'mz-tabs: sin tab Ajustes');
  t(!mzFn.includes("tab === 'ajustes'"), 'mzTabsHTML: sin caso ajustes en el mapa on (en Ajustes ningún tab queda activo)');
  t(mzFn.includes("pzDockMasBtn('mz')"), 'mz-tabs: el + sigue en el centro');

  // ---------- 3. Ajustes vive en el perfil ----------
  const head = sliceFn(app, 'hf-head-icons', '</span>');
  t(head.includes('data-hf-pact="edit"'), 'perfil: ícono Editar perfil presente');
  t(head.includes('data-hf-pact="share"'), 'perfil: ícono Compartir presente');
  t(head.includes('data-hf-pact="settings"'), 'perfil: ícono Ajustes (settings) presente');
  t(orderOk(head, ['data-hf-pact="edit"', 'data-hf-pact="share"', 'data-hf-pact="settings"']), 'perfil: Ajustes después de Editar perfil y Compartir');
  t(head.includes("pzIc('gear', 20)"), 'perfil: Ajustes con ícono gear');
  t(head.includes("aria-label=\"${en ? 'Settings' : 'Ajustes'}\""), 'perfil: Ajustes con aria-label ES/EN');
  const bind = sliceFn(app, 'function hfProfileBind(root) {', '\n}\n');
  t(bind.includes("else if (act === 'settings') { location.hash = '#/app/ajustes'; }"), 'hfProfileBind: settings navega a #/app/ajustes');

  // ---------- 4. La ruta #/app/ajustes sigue funcionando ----------
  t(app.includes("else if (tab === 'ajustes') { pzPaintSkeleton(tab);"), 'router: tab ajustes sigue renderizando ajustesView()');
  t(app.includes("if (BB_SHELL_ON() && tab === 'ajustes') { try { bbAvisosEnAjustes(); }"), 'router: bbAvisosEnAjustes sigue en ajustes');
  t(app.includes('data-tab="ajustes"'), 'drawer: conserva su link a Ajustes');
  t(app.includes("(tab === 'jardin-posty' || tab === 'analisis' || tab === 'ajustes'"), 'bbShell: Ajustes sigue con fondo glass-pantallas');

  // ---------- 5. «Agregar» del mismo color (y peso) que las inactivas ----------
  t(/\.bb-tab\{[^}]*color:#47617A/.test(css), 'bb: etiquetas inactivas #47617A');
  t(!/\.bb-tab\{[^}]*font-weight:700/.test(css), 'bb: etiquetas inactivas sin negrita (peso 400 heredado)');
  t(/\.bb-tab-mas-lb\{[^}]*font-weight:400/.test(css), 'bb: etiqueta Agregar en 400, como las inactivas');
  t(/\.bb-tab-mas-lb\{[^}]*color:#47617A/.test(css), 'bb: etiqueta Agregar #47617A');
  t(/\.mz-tab-mas-lb\{[^}]*font-weight:700/.test(css), 'mz: etiqueta Agregar en 700, como las demás etiquetas mz');
  t(/\.mz-tab-mas-lb\{[^}]*color:#47617A/.test(css), 'mz: etiqueta Agregar #47617A');

  // ---------- 6. Círculo alrededor del + (las dos shells) ----------
  for (const cls of ['mz-tab-mas-ic', 'bb-tab-mas-ic']) {
    const m = css.match(new RegExp('\\.' + cls + '\\{[^}]*\\}'));
    t(!!m, cls + ': regla presente');
    if (m) {
      t(/border-radius:50%/.test(m[0]), cls + ': círculo (border-radius 50%)');
      t(/width:24px;height:24px/.test(m[0]), cls + ': círculo de 24px (misma caja que los otros íconos)');
      t(/background:rgba\(255,255,255,\.55\)/.test(m[0]), cls + ': fondo vidrio');
      t(/border:1px solid rgba\(255,255,255,\.75\)/.test(m[0]), cls + ': borde del círculo');
      t(/box-shadow:0 0 0 1px rgba\(39,147,200,\.35\)/.test(m[0]), cls + ': anillo Posty');
      t(/color:#47617A/.test(m[0]), cls + ': glifo + #47617A, como los otros íconos');
    }
  }
  t(!css.includes('.mz-tab-mas-ic{background:transparent'), 'sin regla que quite el círculo (mz)');
  t(!css.includes('.bb-tab-mas-ic{background:transparent'), 'sin regla que quite el círculo (bb)');

  // ---------- 7. Etiquetas a 11px (con 5 entran a 390 y 360) ----------
  t(/\.mz-tab\{[^}]*font-size:11px/.test(css), 'mz: etiquetas a 11px');
  t(/\.bb-tab\{[^}]*font-size:11px/.test(css), 'bb: etiquetas a 11px');
  t(!/\.mz-tab[^{]*\{[^}]*font-size:10px/.test(css), 'mz: sin regla de 10px en el dock');
  t(!/\.bb-tab[^{]*\{[^}]*font-size:10px/.test(css), 'bb: sin regla de 10px en el dock');

  // ---------- 8. VM: mzTabsHTML rinde 5 tabs ----------
  const ctx = { gzT: (es) => es, pzIc: () => '[ic]', console };
  ctx.pzDockMasBtn = new Function('shell', 'return \'<button type="button" class="\' + (shell === \'bb\' ? \'bb-tab bb-tab-mas\' : \'mz-tab mz-tab-mas\') + \'"><span class="\' + (shell === \'bb\' ? \'bb-tab-mas-ic\' : \'mz-tab-mas-ic\') + \'">+</span><span class="\' + (shell === \'bb\' ? \'bb-tab-mas-lb\' : \'mz-tab-mas-lb\') + \'">Agregar</span></button>\';');
  ctx.pzDockMasHTML = () => '';
  vm.createContext(ctx);
  const mzSrc = sliceFn(app, 'function mzTabsHTML(tab) {', '\n/* (LOTE DOCK-MAS) */');
  vm.runInContext(mzSrc, ctx);
  const navInicio = vm.runInContext("mzTabsHTML('inicio')", ctx);
  const navAds = vm.runInContext("mzTabsHTML('ads')", ctx);
  const navAjustes = vm.runInContext("mzTabsHTML('ajustes')", ctx);
  const navTabs = (s) => (s.match(/<button type="button" class="mz-tab/g) || []).length;
  t(navTabs(navInicio) === 5, 'VM mzTabsHTML(inicio): 5 botones en el dock');
  t(!navInicio.includes('Ajustes'), 'VM mzTabsHTML(inicio): sin Ajustes en el dock');
  t(navInicio.includes('Agregar'), 'VM mzTabsHTML(inicio): Agregar presente');
  t(orderOk(navInicio, ['>Inicio<', '>Ads<', '>Agregar<', '>Estrategia<', '>Premios<']), 'VM mzTabsHTML(inicio): orden Inicio, Ads, Agregar, Estrategia, Premios');
  t(navAds.includes('mz-tab on') && navAds.indexOf('mz-tab on') < navAds.indexOf('>Ads<'), 'VM mzTabsHTML(ads): tab Ads activo');
  t(!navAjustes.includes('mz-tab on'), 'VM mzTabsHTML(ajustes): ningún tab activo en la pantalla Ajustes');
  t(navTabs(navAjustes) === 5, 'VM mzTabsHTML(ajustes): el dock sigue con 5 aunque se esté en Ajustes');

  console.log(`\ntest-lote-dock-5: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
