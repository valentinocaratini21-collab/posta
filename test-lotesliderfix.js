// test-lotesliderfix.js — LOTE FIX SLIDER DEL JARDÍN.
// El jardín debe cambiar VISIBLEMENTE con cada paso del slider, no solo al
// cruzar de etapa (bug reportado por Valentino 1/11: «hay veces que cambia
// y otras no» — de Nv 6 a 50 la foto era siempre la misma).
// Mecanismo: capas apiladas (base + superior con opacidad) + aclarado
// progresivo del futuro en la última etapa; el handler pinta en sitio sin
// reemplazar el DOM (sin flicker). Sin renders inventados: solo los 5
// visuales de etapa aprobados. Node puro, lee el árbol.
// Uso: node test-lotesliderfix.js
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
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
function sandbox(lang) {
  const sb = { console, ME: { lang: lang || 'es' }, document: { getElementById: () => null, createElement: () => null }, Intl, Date, Map, Set };
  sb.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

// ---------- Versiones + censo (base v525 + este lote = v526) ----------
t(srv.includes("const BUILD_ID = '20261101-v533'"), 'BUILD v526 en server.js');
t(idx.includes('app.js?v=354') && idx.includes('styles.css?v=20261073'), 'index: app 351 + styles 20261070');
t(idxEn.includes('styles.css?v=20261073') && !idxEn.includes('app.js?v='), 'en/index: styles 20261070, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v523 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- Vista: progresión medible ----------
const sb = sandbox('es');
loadConst(sb, 'MX_ZONAS_PREMIO');
loadConst(sb, 'MX_ETAPAS_JARDIN');
loadFns(sb, ['mxEtapaJardin', 'mxZonaPremioEn', 'mxSliderVistaHTML', 'mxSliderToggle', 'mxSliderJardinHTML', 'mxSliderJardin', 'mxSliderVistaPintar', 'mxHeroMosaicoHTML']);
const APROB = ['jardin-joven.webp', 'jardin-crece-1.webp', 'jardin-crece-2.webp', 'jardin-crece-3.webp', 'jardin-bambu.webp'];
function vistaImgs(v) {
  const m = [...v.matchAll(/<img[^>]*src="([^"]+)"[^>]*>/g)];
  return m.map((x) => x[1]);
}
function vistaOp(v) {
  const m = v.match(/mx-slider-foto-top[^>]*style="opacity:([0-9.]+)"/);
  return m ? parseFloat(m[1]) : null;
}
function vistaFiltro(v) {
  const m = v.match(/style="filter:grayscale\(([0-9.]+)\) brightness\(([0-9.]+)\)"/);
  return m ? { g: parseFloat(m[1]), b: parseFloat(m[2]) } : null;
}
{
  // Crossfade dentro de la etapa 1–2 y al cruzar etapas
  const v1 = sb.mxSliderVistaHTML(1, 2);
  t(JSON.stringify(vistaImgs(v1)) === JSON.stringify(['jardin-joven.webp', 'jardin-crece-1.webp']), 'vista Nv 1: base joven + top crece-1');
  t(vistaOp(v1) === 0, 'vista Nv 1: opacidad top 0');
  const v2 = sb.mxSliderVistaHTML(2, 2);
  t(vistaOp(v2) === 0.5, 'vista Nv 2: opacidad top 0.5 (progresa dentro de 1–2)');
  t(vistaImgs(sb.mxSliderVistaHTML(3, 2))[0] === 'jardin-crece-1.webp' && vistaImgs(sb.mxSliderVistaHTML(3, 2))[1] === 'jardin-crece-2.webp', 'vista Nv 3: base crece-1 + top crece-2');
  t(vistaImgs(sb.mxSliderVistaHTML(5, 2))[1] === 'jardin-bambu.webp', 'vista Nv 5: top = bambú');
  // Última etapa futuro: cada paso aclara (el bug: 6→50 era siempre igual)
  let prevB = -1, creceCadaPaso = true, imgsOk = true;
  for (let s = 6; s <= 50; s++) {
    const v = sb.mxSliderVistaHTML(s, 2);
    const f = vistaFiltro(v);
    if (!f || !(f.b > prevB)) creceCadaPaso = false;
    prevB = f ? f.b : prevB;
    if (JSON.stringify(vistaImgs(v)) !== JSON.stringify(['jardin-bambu.webp', 'jardin-bambu.webp'])) imgsOk = false;
  }
  t(creceCadaPaso, 'vista futuro 6→50: el brillo sube en CADA paso (sin meseta)');
  t(imgsOk, 'vista futuro 6→50: solo bambú, ningún render inventado');
  const f6 = vistaFiltro(sb.mxSliderVistaHTML(6, 2));
  const f23 = vistaFiltro(sb.mxSliderVistaHTML(23, 2));
  const f50 = vistaFiltro(sb.mxSliderVistaHTML(50, 2));
  t(f6 && Math.abs(f6.g - 0.35) < 0.002 && Math.abs(f6.b - 0.45) < 0.002, 'vista Nv 6 futuro: oscuro como antes (.35/.45)');
  t(f23 && Math.abs(f23.g - 0.215) < 0.002 && Math.abs(f23.b - 0.663) < 0.002, 'vista Nv 23 futuro: filtro intermedio real');
  t(f50 && Math.abs(f50.g - 0) < 0.002 && Math.abs(f50.b - 1) < 0.002, 'vista Nv 50 futuro: a todo color');
  t(vistaImgs(sb.mxSliderVistaHTML(50, 2)).every((x) => APROB.includes(x)), 'sin renders inventados en ningún nivel');
  // Pasado en última etapa: a color, sin oscurecer (no es futuro)
  const vp = sb.mxSliderVistaHTML(30, 50);
  t(!vp.includes('mx-slider-futuro') && !vp.includes('🔒') && vistaFiltro(vp) === null, 'vista pasada 6–50: a color, sin filtro ni candado');
  // Textos y estructura del lote jardín intactos
  const v11 = sb.mxSliderVistaHTML(11, 2);
  t(v11.includes('mx-slider-futuro') && v11.includes('🔒'), 'vista futura: oscura + candadito');
  t(v11.includes('Se desbloquea en el Nivel 11') && v11.includes('Raíz firme'), 'vista futura P: desbloqueo real');
  t(v11.includes('mx-slider-vista-btn') && v11.includes('mx-slider-det" hidden'), 'vista futura: botón + detalle oculto');
  t(!v11.includes('El rincón de la raíz'), 'vista futura P: detalle sorpresa no filtrado');
  const vc = sb.mxSliderVistaHTML(2, 2);
  t(vc.includes('Estás acá') && !vc.includes('mx-slider-futuro') && !vc.includes('🔒') && vc.includes('mx-slider-vista-div'), 'vista actual: div, a color, Estás acá');
  t(sb.mxSliderVistaHTML(6, 11).includes('Tu primer brote dorado') && !sb.mxSliderVistaHTML(6, 11).includes('🔒'), 'vista pasada P: detalle visible, sin candado');
  // Capas apiladas presentes
  t(v11.includes('mx-slider-fotos') && v11.includes('mx-slider-foto-top'), 'vista: capas apiladas con top');
  t(css.includes('.mx-slider-foto-top') && css.includes('.mx-slider-fotos'), 'css: reglas de capas');
  t(css.includes('prefers-reduced-motion') && css.includes('.mx-slider-foto-top{transition:none}'), 'css: reduced-motion anula la transición');
}

// ---------- Fake DOM para el handler en sitio ----------
class El {
  constructor(tag, cls) {
    this.tagName = tag; this.children = []; this.parent = null;
    this.attrs = {}; this.style = {}; this._cls = new Set(cls ? cls.split(' ').filter(Boolean) : []);
    this.textContent = ''; this.innerHTML = '';
  }
  get classList() { const s = this._cls; return { toggle: (c, f) => { f ? s.add(c) : s.delete(c); }, contains: (c) => s.has(c), add: (c) => s.add(c) }; }
  appendChild(n) { n.parent = this; this.children.push(n); return n; }
  insertBefore(n, ref) { n.parent = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; } }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  _match(c, sel) { return sel[0] === '.' ? c._cls.has(sel.slice(1)) : c.tagName === sel.toUpperCase(); }
  querySelector(sel) { const walk = (n) => { for (const c of n.children) { if (this._match(c, sel)) return c; const r = walk(c); if (r) return r; } return null; }; return walk(this); }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (this._match(c, sel)) out.push(c); walk(c); } }; walk(this); return out; }
  get firstElementChild() { return this.children[0] || null; }
}
function makeVista(sb2, s, a) {
  // Árbol espejo de mxSliderVistaHTML (futuro = BUTTON, si no DIV).
  const futuro = s > a;
  const wrap = new El(futuro ? 'BUTTON' : 'DIV', futuro ? 'mx-slider-vista-btn' : 'mx-slider-vista-div');
  const fotos = new El('SPAN', 'mx-slider-fotos');
  const base = new El('IMG', 'mx-slider-foto' + (futuro ? ' mx-slider-futuro' : ''));
  const top = new El('IMG', 'mx-slider-foto mx-slider-foto-top' + (futuro ? ' mx-slider-futuro' : ''));
  fotos.appendChild(base); fotos.appendChild(top); wrap.appendChild(fotos);
  let lock = null;
  if (futuro) { lock = new El('SPAN', 'mx-slider-lock'); lock.textContent = '🔒'; wrap.appendChild(lock); }
  const txt = new El('SPAN', 'mx-slider-txt');
  const b = new El('B', ''); const l2 = new El('SPAN', ''); const det = new El('SPAN', 'mx-slider-det');
  txt.appendChild(b); txt.appendChild(l2); txt.appendChild(det); wrap.appendChild(txt);
  return { wrap, base, top, lock, b, l2, det };
}
{
  const docSb = sandbox('es');
  loadConst(docSb, 'MX_ZONAS_PREMIO');
  loadConst(docSb, 'MX_ETAPAS_JARDIN');
  loadFns(docSb, ['mxEtapaJardin', 'mxZonaPremioEn', 'mxSliderVistaHTML', 'mxSliderJardin', 'mxSliderVistaPintar']);
  // Arrastrar futuro 6→50: mismo nodo, misma foto base, solo filtro/texto cambian
  const vista = new El('DIV', ''); const lab = { textContent: '' };
  const mv = makeVista(docSb, 6, 2);
  vista.appendChild(mv.wrap);
  docSb.document = {
    getElementById: (id) => (id === 'mxSliderVista' ? vista : id === 'mxSliderNv' ? lab : null),
    createElement: (tag) => new El(tag.toUpperCase(), ''),
  };
  const input = { value: '6', dataset: { actual: '2' } };
  docSb.mxSliderJardin(input);
  const nodo0 = vista.firstElementChild;
  t(nodo0 === mv.wrap, 'handler: arrastrar NO reemplaza el nodo (sin flicker)');
  const src0 = mv.base.getAttribute('src');
  t(src0 === 'jardin-bambu.webp', 'handler: foto base = bambú en Nv 6');
  input.value = '23';
  docSb.mxSliderJardin(input);
  t(vista.firstElementChild === mv.wrap, 'handler: 6→23 sigue el mismo nodo');
  t(lab.textContent === 'Nv 23', 'handler: etiqueta = Nv 23');
  t(mv.b.textContent.includes('Nv 23'), 'handler: texto vista = Nv 23');
  const f23 = mv.base.style.filter;
  input.value = '24';
  docSb.mxSliderJardin(input);
  const f24 = mv.base.style.filter;
  const b23 = parseFloat(/brightness\(([0-9.]+)\)/.exec(f23)[1]);
  const b24 = parseFloat(/brightness\(([0-9.]+)\)/.exec(f24)[1]);
  t(b24 > b23, 'handler: 23→24 aclara en sitio (sin recargar la foto)');
  t(mv.base.getAttribute('src') === src0, 'handler: src base sin cambiar en 6–50 (misma foto, sin recarga)');
  // Detalle abierto se preserva al deslizar (antes se reseteaba con innerHTML)
  mv.det.hidden = false;
  input.value = '25';
  docSb.mxSliderJardin(input);
  t(mv.det.hidden === false, 'handler: detalle abierto NO se resetea al deslizar');
  // Cruce futuro→pasado: rebuild a div; pasado→futuro: rebuild a botón
  const vista2 = new El('DIV', '');
  const mv2 = makeVista(docSb, 30, 2);
  vista2.appendChild(mv2.wrap);
  docSb.document.getElementById = (id) => (id === 'mxSliderVista' ? vista2 : id === 'mxSliderNv' ? lab : null);
  docSb.mxSliderJardin({ value: '1', dataset: { actual: '2' } });
  t(typeof vista2.innerHTML === 'string' && vista2.innerHTML.includes('mx-slider-vista-div'), 'handler: futuro→pasado reconstruye a div');
  const vista3 = new El('DIV', '');
  const mv3 = makeVista(docSb, 1, 2);
  vista3.appendChild(mv3.wrap);
  docSb.document.getElementById = (id) => (id === 'mxSliderVista' ? vista3 : id === 'mxSliderNv' ? lab : null);
  docSb.mxSliderJardin({ value: '30', dataset: { actual: '2' } });
  t(vista3.innerHTML.includes('mx-slider-vista-btn'), 'handler: pasado→futuro reconstruye a botón');
  // Stub plano (test viejo): sigue por innerHTML
  const plano = { innerHTML: '' };
  const lab2 = { textContent: '' };
  docSb.document.getElementById = (id) => (id === 'mxSliderVista' ? plano : id === 'mxSliderNv' ? lab2 : null);
  docSb.mxSliderJardin({ value: '11', dataset: { actual: '2' } });
  t(plano.innerHTML.includes('Se desbloquea en el Nivel 11') && plano.innerHTML.includes('mx-slider-futuro'), 'handler: stub plano sigue por innerHTML (compat test viejo)');
  t(lab2.textContent === 'Nv 11', 'handler: etiqueta stub = Nv 11');
}

// ---------- EN + hero intacto + M78 ----------
{
  const en = sandbox('en');
  loadConst(en, 'MX_ZONAS_PREMIO');
  loadConst(en, 'MX_ETAPAS_JARDIN');
  loadFns(en, ['mxEtapaJardin', 'mxZonaPremioEn', 'mxSliderVistaHTML', 'mxSliderJardinHTML', 'mxHeroMosaicoHTML']);
  t(en.mxSliderVistaHTML(23, 2).includes('Unlocks at Level 23'), 'EN: desbloqueo en inglés');
  t(en.mxSliderJardinHTML(2).includes('Slide to see how your garden grows'), 'EN: título del slider');
  t(en.mxSliderVistaHTML(2, 2).includes("You're here"), 'EN: Estás acá');
  const m2 = en.mxHeroMosaicoHTML(2, 'jardin-joven.webp');
  t(cnt(m2, 'mx-etapa ') === 5 && m2.includes("You're here"), 'hero intacto: 5 etapas, You\'re here (EN)');
  t(!m2.includes('mx-slider-foto-top') && !m2.includes('mx-slider-fotos'), 'hero intacto: no usa las capas del slider');
  // M78: la única función nueva existe y resuelve; la vista no llama a nada nuevo
  t(app.includes('function mxSliderVistaPintar('), 'M78: mxSliderVistaPintar definida');
  const bloque = extractFn(app, 'mxSliderJardin') + extractFn(app, 'mxSliderVistaPintar');
  t(bloque.includes('mxSliderVistaPintar('), 'M78: mxSliderJardin llama a mxSliderVistaPintar');
  const vistaSrc = extractFn(app, 'mxSliderVistaHTML');
  for (const fn of ['mxEtapaJardin', 'mxZonaPremioEn']) t(app.includes('function ' + fn + '('), 'M78: ' + fn + ' definida (llamada desde la vista)');
  t(app.includes('function gzT(') && app.includes('const esc ='), 'M78: gzT y esc definidos');
  t(!/mxSliderVistaHTML\([^)]*mxSliderVistaPintar/.test(vistaSrc), 'M78: la vista no depende de la función nueva (compat test viejo)');
}

console.log(`\nLOTE SLIDER FIX: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
