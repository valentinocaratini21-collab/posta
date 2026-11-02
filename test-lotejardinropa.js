// test-lotejardinropa.js — LOTE JARDÍN-ROPA (decisión Valentino 2/11).
// Pantalla del jardín limpia: avatar canónico con guardarropa (1 prenda o
// accesorio por nivel 1-50; hitos 6/11/16/21/26/31/36/41/46 = conjuntos),
// nivel + barrita con avance REAL (sin % en texto) + mensaje exacto.
// La cara nunca se regenera: ai-avatar.png (mismos bytes que la canónica)
// + capas SVG locales. Nada comprable, nada que toque el precio.
// Node puro, lee el árbol. Uso: node test-lotejardinropa.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const cntW = (s, name) => (s.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w$])', 'g')) || []).length;
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
function sandbox(lang, id) {
  const store = {};
  const sb = {
    console,
    ME: { lang: lang || 'es', id: id || '' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: { getElementById: () => null },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, _store: store },
    Intl, Date, Map, Set,
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  vm.createContext(sb);
  return sb;
}
const FNS = ['mxNvNum', 'pzNivelUnlock', 'pzRopaPorNivel', 'pzRopaPorId', 'pzRopaNombre', 'pzRopaClave', 'pzRopaSelVacio', 'pzRopaSel', 'pzRopaGuardar', 'pzRopaSelToggle', 'pzRopaAvance', 'pzRopaUnlock', 'pzRopaAvatarHTML', 'pzRopaListaHTML', 'pzRopaPintar', 'pzRopaToggle'];
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

// ---------- Versiones + censo (pines rotados a v553 con causa en la liberación: bump v552→v553 de jardín-ropa; base v546) ----------
t(srv.includes("const BUILD_ID = '20261101-v553'"), 'BUILD v546 en server.js');
t(idx.includes('app.js?v=369') && idx.includes('styles.css?v=20261087'), 'index: app 362 + styles 20261081');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');

// ---------- Tabla 1-50 ----------
{
  const sb = sandbox('es');
  loadConst(sb, 'PZ_ROPA');
  const tab = sb.PZ_ROPA;
  t(Array.isArray(tab) && tab.length === 50, 'tabla: 50 desbloqueos');
  const nvs = tab.map((e) => e.nv).sort((a, b) => a - b);
  t(nvs.every((n, i) => n === i + 1), 'tabla: niveles 1-50 exactamente una vez');
  const hitos = [6, 11, 16, 21, 26, 31, 36, 41, 46];
  t(hitos.every((n) => tab[n - 1].cat === 'conjunto'), 'tabla: hitos son conjuntos especiales');
  const cats = {};
  tab.forEach((e) => { cats[e.cat] = (cats[e.cat] || 0) + 1; });
  t(cats.sombrero === 10 && cats.anteojos === 10 && cats.cuello === 10 && cats.extra === 10 && cats.conjunto === 9 && cats.corona === 1, 'tabla: 10+10+10+10+9+1 por categoría');
  t(tab.every((e) => e.es && e.en && e.svg && !/http|<img/.test(e.svg)), 'tabla: nombres ES+EN y SVG puro sin imágenes externas');
  t(tab[5].es === 'Conjunto Brote dorado' && tab[5].en === 'Golden sprout set', 'tabla: hito 6 = Brote dorado');
  t(tab[49].es === 'Corona del maestro' && tab[49].en === 'Master crown', 'tabla: nivel 50 = corona');
}

// ---------- Nombres, avance real, momento del avance ----------
{
  const sb = sandbox('es');
  loadFns(sb, FNS);
  loadConst(sb, 'PZ_ROPA');
  t(sb.pzRopaNombre(6, false) === 'Conjunto Brote dorado', 'nombre: Nv 6 ES');
  const en = sandbox('en');
  loadFns(en, FNS);
  loadConst(en, 'PZ_ROPA');
  t(en.pzRopaNombre(6, true) === 'Golden sprout set', 'nombre: Nv 6 EN');
  t(en.pzRopaNombre(50, true) === 'Master crown', 'nombre: Nv 50 EN');
  t(sb.pzRopaAvance({ nivel: 2, avance: { hechos: 1, total: 2 } }) === 50, 'avance: gate 1-4 hechos/total');
  t(sb.pzRopaAvance({ nivel: 30, gate: { progreso_pct: 37 } }) === 37, 'avance: gate extendido 5-49 progreso real');
  t(sb.pzRopaAvance({ nivel: 30 }) === null, 'avance: sin dato → null (solo nivel, nunca barra falsa)');
  t(sb.pzRopaAvance({ nivel: 50, gate: { progreso_pct: 100 } }) === 100, 'avance: Nv 50 llena');
  t(sb.pzRopaAvance(null) === null, 'avance: sin nivel → null');
  t(sb.pzRopaUnlock({ nivel: 6 }, false) === 'Desbloqueaste: Conjunto Brote dorado', 'momento: nombra la prenda ES');
  t(en.pzRopaUnlock({ nivel: 6 }, true) === 'Unlocked: Golden sprout set', 'momento: nombra la prenda EN');
  t(sb.pzRopaUnlock({ nivel: 99, premio_actual: 'Premio X' }, false) === 'Premio X', 'momento: fuera de 1-50 cae al premio del servidor');
}

// ---------- Selección pura + persistencia ----------
{
  const sb = sandbox('es', 'u7');
  loadFns(sb, FNS);
  const v = sb.pzRopaSelVacio();
  t(v.sombrero === null && v.conjunto === null && v.corona === null, 'sel: vacía');
  const s1 = sb.pzRopaSelToggle(v, { nv: 1, cat: 'sombrero' });
  t(s1.sombrero === 1, 'sel: ponerse sombrero');
  t(sb.pzRopaSelToggle(s1, { nv: 1, cat: 'sombrero' }).sombrero === null, 'sel: quitarse el mismo');
  const s2 = sb.pzRopaSelToggle({ sombrero: 1, anteojos: null, cuello: null, extra: null, conjunto: 6, corona: null }, { nv: 7, cat: 'sombrero' });
  t(s2.conjunto === null && s2.sombrero === 7, 'sel: prenda destapa el conjunto');
  const s3 = sb.pzRopaSelToggle({ sombrero: 1, anteojos: null, cuello: null, extra: null, conjunto: null, corona: null }, { nv: 50, cat: 'corona' });
  t(s3.corona === 50 && s3.sombrero === null, 'sel: corona desplaza al sombrero');
  t(sb.pzRopaClave() === 'posta-guardarropa_u7', 'persistencia: clave por usuario');
  sb.pzRopaGuardar({ sombrero: 7, anteojos: null, cuello: 3, extra: null, conjunto: null, corona: null });
  const leido = sb.pzRopaSel();
  t(leido.sombrero === 7 && leido.cuello === 3, 'persistencia: guardar → leer');
}

// ---------- Avatar: cara intacta + capas ----------
{
  const sb = sandbox('es');
  loadFns(sb, FNS);
  loadConst(sb, 'PZ_ROPA');
  sb.pzRopaGuardar({ sombrero: 1, anteojos: 2, cuello: 3, extra: null, conjunto: null, corona: null });
  const av = sb.pzRopaAvatarHTML();
  t((av.match(/<img/g) || []).length === 1 && av.includes('src="ai-avatar.png"'), 'avatar: una sola imagen, la cara canónica servida');
  t(av.includes('viewBox="0 0 512 512"') && av.includes('pz-ropa-capa'), 'avatar: capa SVG encima de la cara');
  const tab = (() => { const s2 = sandbox('es'); loadConst(s2, 'PZ_ROPA'); return s2.PZ_ROPA; })();
  t(av.includes(tab[0].svg) && av.includes(tab[1].svg) && av.includes(tab[2].svg), 'avatar: prendas elegidas dibujadas');
  sb.pzRopaGuardar({ sombrero: 1, anteojos: 2, cuello: 3, extra: null, conjunto: 6, corona: null });
  const av2 = sb.pzRopaAvatarHTML();
  t(av2.includes(tab[5].svg) && !av2.includes(tab[0].svg), 'avatar: el conjunto tapa las prendas');
  t(av.includes('✦'), 'avatar: magia de entrada (destellos, nunca puntos)');
}

// ---------- Lista: desbloqueados, candados, nuevo ----------
{
  const sb = sandbox('es');
  loadFns(sb, FNS);
  loadConst(sb, 'PZ_ROPA');
  const h = sb.pzRopaListaHTML(2);
  t(h.includes('Ponerse') && h.includes('Gorra celeste') && h.includes('Anteojos redondos'), 'lista Nv 2: desbloqueados con botón');
  t(h.includes('🔒') && h.includes('Bufanda celeste') && h.includes('Se desbloquea en el Nivel 3'), 'lista Nv 2: bloqueado con candado + nombre + nivel (sin adelantar la sorpresa)');
  t(!h.includes(sb.PZ_ROPA[2].svg), 'lista Nv 2: el bloqueado NO muestra su prenda');
  t(h.includes('¡Nuevo!') && h.indexOf('¡Nuevo!') > h.indexOf('Anteojos redondos'), 'lista Nv 2: el desbloqueo del nivel lleva ¡Nuevo!');
  const en = sandbox('en');
  loadFns(en, FNS);
  loadConst(en, 'PZ_ROPA');
  const he = en.pzRopaListaHTML(2);
  t(he.includes('Wear') && he.includes('Unlocks at Level 3') && he.includes('New!'), 'lista EN: espejo completo');
  sb.pzRopaGuardar({ sombrero: null, anteojos: 2, cuello: null, extra: null, conjunto: null, corona: null });
  const h2 = sb.pzRopaListaHTML(2);
  t(h2.includes('Puesto ✓') && h2.includes('aria-pressed="true"'), 'lista: puesto se marca y se puede quitar');
}

// ---------- Toggle + repintado en sitio (sin render) ----------
{
  const nodes = {};
  const sb = sandbox('es');
  sb.document = { getElementById: (id) => nodes[id] || null };
  loadFns(sb, FNS);
  loadConst(sb, 'PZ_ROPA');
  sb.pzRopaListaHTML(2);
  nodes.pzRopaAvatar = { innerHTML: '' };
  nodes.pzRopaLista = { innerHTML: '', getAttribute: () => '2' };
  sb.pzRopaToggle(1);
  t(sb.pzRopaSel().sombrero === 1 && nodes.pzRopaAvatar.innerHTML.includes('pz-ropa-capa') && nodes.pzRopaLista.innerHTML.includes('Puesto ✓'), 'toggle: viste, persiste y repinta en sitio');
  sb.pzRopaToggle(3);
  t(sb.pzRopaSel().sombrero === 1, 'toggle: bloqueado no se puede vestir');
  const sb2 = sandbox('es');
  loadFns(sb2, FNS);
  loadConst(sb2, 'PZ_ROPA');
  sb2.pzRopaListaHTML(2);
  let sinThrow = true;
  try { sb2.pzRopaToggle(1); } catch (e) { sinThrow = false; }
  t(sinThrow, 'toggle: sin nodos en el DOM no rompe (fallback silencioso)');
}

// ---------- Pantalla: rama posty nueva ----------
{
  const rama = sliceFn(app, "if (tipo === 'posty') {", 'function mxJardinErrorHTML');
  t(rama.includes('pz-ropa-panel') && rama.includes('pzRopaAvatarHTML()') && rama.includes('pzRopaListaHTML(nvNum)'), 'pantalla: panel + avatar + lista');
  t(rama.includes('cuanto más subís de nivel, mejores posteos y más conozco lo que buscás'), 'pantalla: mensaje exacto ES');
  t(rama.includes('the higher your level, the better your posts and the more I know what you are looking for'), 'pantalla: espejo EN');
  t(rama.includes('pzRopaAvance(nvP)') && rama.includes('pz-ropa-barra'), 'pantalla: barrita con avance real');
  t(!/\\d+%/.test(rama), 'pantalla: ningún % en texto');
  t(rama.includes("bbGo('#/app/inicio')") && rama.includes('mx-chat-cabecera'), 'pantalla: atrás propio intacto');
  t(!rama.includes('mxHeroMosaicoHTML') && !rama.includes('mxSliderJardinHTML') && !rama.includes('mxJardinMapaHTML'), 'pantalla: fuera mosaico, slider y mapa');
  t(!rama.includes('jardin-joven.webp') && !rama.includes('jardin-crece') && !rama.includes('jardin-bambu.webp'), 'pantalla: fuera fotos de etapas');
  t(!rama.includes('mxPremioCercaHTML') && !rama.includes('mxVistasUnAgenteHTML') && !rama.includes('mxHistoriaHTML') && !rama.includes('mxJardinPost50HTML'), 'pantalla: fuera premio-cerca, vistas, historia y post-50');
  const cont = sliceFn(app, 'async function bbJardinPostyContent', 'async function bbJardinGestyContent');
  t(cont.includes("mxNivel('posty')") && !cont.includes('mxJardinFotos') && !cont.includes('mxJardinPost50'), 'contenido: solo pide el nivel');
  t(app.includes("const unlock = pzRopaUnlock(nv, en);"), 'momento del avance: nombra la prenda');
}

// ---------- M78: funciones nuevas definidas 1 vez y llamadas ----------
{
  const nuevos = ['pzRopaPorNivel', 'pzRopaPorId', 'pzRopaNombre', 'pzRopaClave', 'pzRopaSelVacio', 'pzRopaSel', 'pzRopaGuardar', 'pzRopaSelToggle', 'pzRopaAvance', 'pzRopaUnlock', 'pzRopaAvatarHTML', 'pzRopaListaHTML', 'pzRopaPintar', 'pzRopaToggle'];
  for (const n of nuevos) {
    t(cnt(app, 'function ' + n + '(') === 1, 'M78: ' + n + ' definida 1 vez');
    t(cntW(app, n) >= 2, 'M78: ' + n + ' llamada');
  }
  t(cnt(app, 'let PZ_ROPA_NIVEL') === 1, 'M78: PZ_ROPA_NIVEL una vez');
}

// ---------- CSS ----------
t(css.includes('.pz-ropa-panel') && css.includes('.pz-ropa-avatar') && css.includes('.pz-ropa-barra') && css.includes('.pz-ropa-lista'), 'css: panel, avatar, barra y lista');
t(css.includes('@media (prefers-reduced-motion: reduce){.pz-ropa-spark{animation:none}}'), 'css: reduced-motion anula la magia');
t(css.includes('blur(16px) saturate(1.4)'), 'css: receta vidrio v519');

console.log(`lotejardinropa: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
