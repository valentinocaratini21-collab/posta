// test-loteglassfondos.js — LOTE GLASS FONDOS · fondos de Jardín, Estrategia y
// Ajustes en vidrio (pedido Valentino 1/11 21:46). Mismo lenguaje de la home
// (Lote Glass v519): degradado compartido celeste→dorado + vidrio receta v519
// solo en paneles. Fotos y visuales SIN vidrio. Node puro, lee el árbol.
// Uso: node test-loteglassfondos.js  (desde la raíz del árbol)
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
const ana = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const aju = fs.readFileSync(path.join(__dirname, 'public/chunk-ajustes.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
const RECIPE = ['rgba(255,255,255,.55)', 'blur(16px) saturate(1.4)', 'rgba(255,255,255,.75)', '0 8px 24px rgba(10,30,51,.10)'];
const GRAD = 'linear-gradient(165deg,#dff1fa 0%,#eef9fd 30%,#fdf9ec 62%,#fdeec2 100%)';
const rule = (sel) => {
  const a = css.indexOf(sel); if (a === -1) return '';
  const b = css.indexOf('}', a); return b === -1 ? '' : css.slice(a, b + 1);
};
const block = css.slice(css.indexOf('/* (LOTE GLASS FONDOS'));

// ---------- Versiones + censo (base v539; en la liberación se bumpean) ----------
t(srv.includes("const BUILD_ID = '20261101-v539'"), 'BUILD v539 en server.js');
t(idx.includes('app.js?v=358') && idx.includes('styles.css?v=20261078'), 'index: app 354 + styles 20261078');
t(idxEn.includes('styles.css?v=20261078') && !idxEn.includes('app.js?v='), 'en/index: styles 20261078, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V intacto (ningún chunk tocado)');
t(!ana.includes('bb-glass-pantallas') && !aju.includes('bb-glass-pantallas'), 'chunks intactos (sin clase nueva)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');
t(cnt(app, 'function bbShell') === 1, 'sin duplicados: bbShell 1');

// ---------- Shell real: la clase solo en las tres tabs ----------
function sandbox() {
  const sb = {
    console, Intl, Date, Map, Set,
    BB: { estado: null },
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    pzIc: (n) => '<span class="pz-ic">' + n + '</span>',
    pzBackHTML: () => '',
    mxTabKey: (tab) => ({ inicio: 'inicio', 'jardin-posty': 'jardin', analisis: 'analisis', ajustes: 'ajustes', schedule: 'semana' }[tab] || tab),
    mxModoActual: () => 'posty',
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, createElement: () => ({}) },
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  vm.createContext(sb);
  return sb;
}
{
  const sb = sandbox();
  const code = sliceFn(app, 'function bbShell', 'async function bbLoadEstado');
  t(code.length > 0, 'existe bbShell');
  vm.runInContext(code.replace('function bbShell', 'globalThis.bbShell = function'), sb);
  const shell = (tab) => sb.bbShell(tab, '<p>CONTENIDO</p>');
  for (const tab of ['jardin-posty', 'analisis', 'ajustes']) {
    const h = shell(tab);
    t(h.includes('bb-glass-pantallas'), 'shell ' + tab + ' lleva bb-glass-pantallas');
    t(h.includes('CONTENIDO'), 'shell ' + tab + ' conserva el contenido');
    t(h.includes('bb-bar'), 'shell ' + tab + ' conserva la barra de tabs');
  }
  const hIn = shell('inicio');
  t(hIn.includes('bb-glass-inicio') && !hIn.includes('bb-glass-pantallas'), 'Inicio sigue solo con bb-glass-inicio');
  const hSc = shell('schedule');
  t(!hSc.includes('bb-glass-pantallas') && !hSc.includes('bb-glass-inicio'), 'Schedule sin clase vidrio (fuera de alcance)');
  const hBandeja = shell('bandeja');
  t(!hBandeja.includes('bb-glass-pantallas'), 'Bandeja sin clase vidrio (fuera de alcance)');
}

// ---------- CSS: degradado compartido + vidrio en paneles ----------
t(block.length > 0, 'existe el bloque LOTE GLASS FONDOS');
t(rule('.bb-app.bb-glass-pantallas{').includes(GRAD), 'shell: mismo degradado que Inicio');
t(rule('.bb-app.bb-glass-pantallas{').includes('radial-gradient(260px 260px at 85% -60px,rgba(39,147,200,.28)'), 'shell: halo celeste igual que Inicio');
t(rule('.bb-app.bb-glass-pantallas{').includes('radial-gradient(240px 240px at -90px 300px,rgba(254,193,77,.35)'), 'shell: halo dorado igual que Inicio');
for (const sel of ['.bb-app.bb-glass-pantallas .mx-jardin-posty .mx-tarjeta{', '.bb-app.bb-glass-pantallas .ana-card{', '.bb-app.bb-glass-pantallas .card.ajsec{']) {
  const r = rule(sel);
  t(r.length > 0, 'existe regla ' + sel);
  for (const piece of RECIPE) t(r.includes(piece), sel + ' lleva receta v519 (' + piece + ')');
}
// La barra sigue la receta de la barra de Inicio (fondo + blur + borde, sin sombra)
{
  const r = rule('.bb-app.bb-glass-pantallas .bb-bar{');
  t(r.length > 0, 'existe regla .bb-app.bb-glass-pantallas .bb-bar{');
  for (const piece of RECIPE.slice(0, 3)) t(r.includes(piece), '.bb-app.bb-glass-pantallas .bb-bar{ lleva receta barra v519 (' + piece + ')');
}
// El bloque nuevo va después del último bloque oscuro (gana por orden, como Inicio)
{
  const lastDark = css.lastIndexOf('@media (prefers-color-scheme: dark)');
  const blockAt = css.indexOf('/* (LOTE GLASS FONDOS');
  t(blockAt > lastDark, 'bloque nuevo después del último bloque oscuro (gana por orden)');
}
// Fotos y visuales SIN vidrio: ninguna regla nueva los toca
for (const sel of ['mx-jardin-vivo', 'mx-slider-vista', 'mx-slider-foto', 'mx-hero-mosaico', 'ana-ava', 'ana-verdict', 'mx-foto-nivel']) {
  t(!block.includes(sel), 'visual intacto: el bloque no toca ' + sel);
}
// Cableado: cada pantalla usa de verdad la clase que el CSS vitrifica
t(app.includes('mx-tarjeta'), 'jardín usa mx-tarjeta (panel vitrificado)');
t(ana.includes('ana-card'), 'Estrategia usa ana-card (panel vitrificado)');
t(aju.includes('card ajsec'), 'Ajustes usa card ajsec (panel vitrificado)');
t(ana.includes('ana-verdict'), 'Estrategia conserva su banner navy ana-verdict (no vitrificado)');
// Textos navy intactos en las tres pantallas (legibles sobre vidrio claro)
t(css.includes('.mx-jardin-posty .mx-jardin-head h1{color:#0A1E33}'), 'jardín: título navy intacto');
t(css.includes('.mx-jardin-posty .mx-dato{color:#0A1E33}'), 'jardín: dato navy intacto');
t(css.includes('--txt:#0A1E33'), 'texto base navy intacto');

console.log(`\nloteglassfondos: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
