// test-lotejardin.js — LOTE SLIDER DEL JARDÍN + HERO COMPLETO.
// Slider 1–50 con futuro oscuro+candado y desbloqueo real en palabras;
// hero mosaico 5 etapas (lo tuyo a color, lo que falta oscuro con candado,
// nunca tierra sola); miniatura tira = bambusal completo en chico.
// Node puro, lee el árbol. Uso: node test-lotejardin.js
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
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
function sandbox(lang) {
  const sb = {
    console,
    ME: { lang: lang || 'es' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: { getElementById: () => null },
    Intl, Date, Map, Set,
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
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
function loadConst(sb, name) {
  const a = app.indexOf('const ' + name);
  t(a >= 0, 'existe const ' + name);
  if (a < 0) return;
  const b = app.indexOf('];', a);
  vm.runInContext(app.slice(a, b + 2).replace('const ' + name + ' =', 'globalThis.' + name + ' ='), sb);
}

// ---------- Versiones + censo (referencia v522) ----------
t(srv.includes("const BUILD_ID = '20261101-v532'"), 'BUILD v522 en server.js');
t(idx.includes('app.js?v=353') && idx.includes('styles.css?v=20261072'), 'index: app 344 + styles 20261065');
t(idxEn.includes('styles.css?v=20261072') && !idxEn.includes('app.js?v='), 'en/index: styles 20261065, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v516 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- Funciones nuevas en sandbox ----------
const sb = sandbox('es');
loadConst(sb, 'MX_ZONAS_PREMIO');
loadConst(sb, 'MX_ETAPAS_JARDIN');
loadFns(sb, ['mxEtapaJardin', 'mxZonaPremioEn', 'mxSliderVistaHTML', 'mxSliderToggle', 'mxSliderJardinHTML', 'mxSliderJardin', 'mxHeroEtapaIr', 'mxHeroMosaicoHTML']);

// ---------- Etapas: mapeo real, sin renders inventados ----------
t(sb.mxEtapaJardin(1) === 0 && sb.mxEtapaJardin(2) === 0, 'etapa: Nv 1–2 → joven (0)');
t(sb.mxEtapaJardin(3) === 1 && sb.mxEtapaJardin(4) === 2 && sb.mxEtapaJardin(5) === 3, 'etapa: Nv 3/4/5 → crece-1/2/3');
t(sb.mxEtapaJardin(6) === 4 && sb.mxEtapaJardin(50) === 4, 'etapa: Nv 6+ → bambú (4)');
t(sb.MX_ETAPAS_JARDIN.length === 5 && sb.MX_ETAPAS_JARDIN.every((e) => ['jardin-joven.webp', 'jardin-crece-1.webp', 'jardin-crece-2.webp', 'jardin-crece-3.webp', 'jardin-bambu.webp'].includes(e.img)), 'etapas: 5 renders aprobados, ninguno inventado');
for (const f of ['jardin-joven.webp', 'jardin-crece-1.webp', 'jardin-crece-2.webp', 'jardin-crece-3.webp', 'jardin-bambu.webp']) {
  t(fs.existsSync(path.join(__dirname, 'public', f)), 'asset en árbol ' + f);
}

// ---------- Slider: estructura ----------
{
  const h = sb.mxSliderJardinHTML(2);
  t(h.includes('type="range"') && h.includes('min="1"') && h.includes('max="50"') && h.includes('value="2"') && h.includes('data-actual="2"'), 'slider: rango 1–50, valor = nivel actual');
  t(h.includes('id="mxSliderRango"') && h.includes('id="mxSliderVista"') && h.includes('oninput="mxSliderJardin(this)"'), 'slider: ids + handler');
  t(h.includes('Deslizá para ver cómo crece tu jardín'), 'slider: título ES');
  t(!h.includes('%') && !h.includes('<progress'), 'slider: sin % ni barras (regla vigente)');
  t(h.includes('jardin-joven.webp'), 'slider en Nv 2: vista = etapa joven');
  const h50 = sb.mxSliderJardinHTML(50);
  t(h50.includes('jardin-bambu.webp') && h50.includes('value="50"'), 'slider en Nv 50: vista = bambú');
}

// ---------- Slider: vista futura oscura + candado + desbloqueo real ----------
{
  const v = sb.mxSliderVistaHTML(11, 2);
  t(v.includes('mx-slider-futuro') && v.includes('🔒'), 'vista futura: oscura + candadito');
  t(v.includes('Se desbloquea en el Nivel 11') && v.includes('Raíz firme'), 'vista futura P: desbloqueo real en palabras (nivel + zona)');
  t(v.includes('mx-slider-vista-btn') && v.includes('mx-slider-det" hidden') && v.includes('Seguí publicando tus semanas para llegar'), 'vista futura: al tocar revela el detalle (sin inventar desbloqueo)');
  t(!v.includes('El rincón de la raíz'), 'vista futura P: el detalle sorpresa NO se filtra antes de desbloquear');
  const v7 = sb.mxSliderVistaHTML(7, 2);
  t(v7.includes('Se desbloquea en el Nivel 7') && !v7.includes('Raíz firme'), 'vista futura no-P: solo nivel, sin zona inventada');
  const vc = sb.mxSliderVistaHTML(2, 2);
  t(vc.includes('Estás acá') && !vc.includes('mx-slider-futuro') && !vc.includes('🔒') && vc.includes('mx-slider-vista-div'), 'vista actual: a color, sin candado, dice Estás acá');
  const vp = sb.mxSliderVistaHTML(6, 11);
  t(vp.includes('Tu primer brote dorado') && !vp.includes('🔒'), 'vista pasada P: detalle sorpresa visible porque ya desbloqueó');
  const vpp = sb.mxSliderVistaHTML(4, 11);
  t(vpp.includes('Ya lo alcanzaste'), 'vista pasada no-P: ya alcanzado');
}

// ---------- Slider: handler actualiza vista + etiqueta ----------
{
  const vista = { innerHTML: '' };
  const lab = { textContent: '' };
  const docSb = sandbox('es');
  docSb.document = { getElementById: (id) => (id === 'mxSliderVista' ? vista : id === 'mxSliderNv' ? lab : null) };
  loadConst(docSb, 'MX_ZONAS_PREMIO');
  loadConst(docSb, 'MX_ETAPAS_JARDIN');
  loadFns(docSb, ['mxEtapaJardin', 'mxZonaPremioEn', 'mxSliderVistaHTML', 'mxSliderJardin']);
  docSb.mxSliderJardin({ value: '11', dataset: { actual: '2' } });
  t(vista.innerHTML.includes('Se desbloquea en el Nivel 11') && vista.innerHTML.includes('mx-slider-futuro'), 'handler: mover el slider actualiza la vista');
  t(lab.textContent === 'Nv 11', 'handler: etiqueta = Nv 11');
}

// ---------- Hero mosaico ----------
{
  const m2 = sb.mxHeroMosaicoHTML(2, 'jardin-joven.webp');
  t(cnt(m2, 'mx-etapa ') === 5 || cnt(m2, 'class="mx-etapa') === 5, 'mosaico: 5 etapas');
  t(m2.includes('class="mx-hero-btn"') && m2.includes("openLightbox('jardin-joven.webp', 0)"), 'mosaico: la etapa actual abre su visual con openLightbox');
  t(m2.includes('Estás acá'), 'mosaico: la etapa actual dice Estás acá');
  t(cnt(m2, 'mx-etapa-lock') === 4, 'mosaico Nv 2: 4 etapas futuras con candado');
  t(m2.includes('Nv 1–2') && m2.includes('Nv 3') && m2.includes('Nv 6+'), 'mosaico: etiquetas de nivel reales');
  t(m2.includes('mxHeroEtapaIr(3)') && m2.includes('mxHeroEtapaIr(6)'), 'mosaico: tocar una etapa futura salta al slider en ese nivel');
  const m6 = sb.mxHeroMosaicoHTML(6, 'jardin-bambu.webp');
  t(!m6.includes('mx-etapa-lock') && cnt(m6, 'mx-etapa ok') === 5, 'mosaico Nv 6: las 5 etapas a color, sin candados');
  t(!m2.includes('mx-foto-nivel'), 'mosaico: ya no hay un hero de una sola foto (nunca solo tierra)');
}

// ---------- Pantalla Jardín: hero + slider cableados ----------
{
  const rama = sliceFn(app, "if (tipo === 'posty') {", 'function mxJardinErrorHTML');
  t(rama.includes('mxHeroMosaicoHTML(nvNum, heroActual)'), 'jardín: hero = mosaico completo');
  t(rama.includes('mxHeroJardin(mxNvNum(nvP))'), 'jardín: el visual actual sigue saliendo de mxHeroJardin');
  t(rama.includes('mxSliderJardinHTML(nvNum)'), 'jardín: slider cableado bajo el hero');
  t(rama.includes('mx-jardin-vivo') && rama.includes('mx-orb-a') && rama.includes('mx-posty-live') && rama.includes("Posty está acá"), 'jardín: vivo + orbes + Posty presente intactos');
  t(!rama.includes('const brote = nvNum <= 2'), 'jardín: fuera el brote que tapaba la tierra (el hero ya no es tierra sola)');
  t(!rama.includes('mxBarra'), 'jardín: sin barras dentro (regla vigente)');
}

// ---------- Tira: miniatura = bambusal completo en chico ----------
{
  const tira = sliceFn(app, 'function mxTiraHTML', 'async function mxPortTop');
  t(tira.includes('jardin-bambu.webp') && tira.includes('mx-tira-lock') && tira.includes('nvTira < 6'), 'tira: bambusal completo en chico, candadito si Nv<6');
  t(!tira.includes('mx-tira-brote-grande') && !tira.includes('MX_BROTE_SVG'), 'tira: brote dibujado fuera');
  t(tira.includes(`onerror="this.closest('.mx-tira-thumb').remove()"`), 'tira: sin fallback a avatar');
  t(!tira.includes('ai-avatar'), 'tira: sin avatar en su código');
}

// ---------- EN ----------
{
  const en = sandbox('en');
  loadConst(en, 'MX_ZONAS_PREMIO');
  loadConst(en, 'MX_ETAPAS_JARDIN');
  loadFns(en, ['mxEtapaJardin', 'mxZonaPremioEn', 'mxSliderVistaHTML', 'mxSliderJardinHTML', 'mxHeroMosaicoHTML']);
  t(en.mxSliderJardinHTML(2).includes('Slide to see how your garden grows'), 'EN: título del slider');
  const v = en.mxSliderVistaHTML(11, 2);
  t(v.includes('Unlocks at Level 11') && v.includes('Strong root') && v.includes('Keep publishing your weeks to get there'), 'EN: desbloqueo + zona + detalle');
  t(en.mxSliderVistaHTML(2, 2).includes("You're here"), 'EN: Estás acá');
  t(en.mxHeroMosaicoHTML(2, 'jardin-joven.webp').includes("You're here"), 'EN: mosaico marca actual');
  t(app.includes("Posty's garden"), 'EN: título del jardín intacto');
}

// ---------- CSS ----------
t(css.includes('.mx-hero-mosaico{'), 'CSS: mosaico');
t(css.includes('.mx-etapa.lock .mx-etapa-img{filter:grayscale(1) brightness(.45)'), 'CSS: futuro oscuro (silueta)');
t(css.includes('.mx-slider-foto.mx-slider-futuro{filter:grayscale(.35) brightness(.45)'), 'CSS: vista futura oscura');
t(css.includes('.mx-tira-lock{'), 'CSS: candadito de la tira');
t(css.includes('.mx-hero-posty-row{'), 'CSS: fila Posty bajo el mosaico');
t(css.includes('.mx-jardin-vivo .mx-posty-live{position:static'), 'CSS: Posty ya no tapa el mosaico');

console.log(`\ntest-lotejardin: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
