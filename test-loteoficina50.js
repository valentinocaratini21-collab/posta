// test-loteoficina50.js — LOTE OFICINA ×50 (decisión Valentino 3/11
// «arma todo»): cada nivel da DOS cosas — 1 cosa para la oficina + 1
// prenda de Posty (PZ_ROPA vigente, no se toca). La oficina se compone
// por capas SVG en Premios: solo se dibujan los ítems desbloqueados;
// al 50, versión Maestro; después, Semillas de Maestro persistidas SIN
// disparador automático (pendiente su decisión).
// Node puro, lee el árbol. Uso: node test-loteoficina50.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.split(sub).length - 1);
// Extrae el bloque completo del lote (definiciones puras, sin DOM en
// tiempo de definición) y lo ejecuta en el sandbox.
const a = app.indexOf('// (LOTE OFICINA ×50');
const b = app.indexOf('// FIN LOTE OFICINA ×50', a);
t(a >= 0 && b > a, 'bloque OFICINA ×50 presente en app.js');
const block = (a >= 0 && b > a) ? app.slice(a, b) : '';
const store = {};
const sb = {
  console, Intl, Date, Map, Set,
  ME: { lang: 'es', id: '12' },
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  document: { getElementById: () => null },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, _store: store },
};
sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
vm.createContext(sb);
if (block) vm.runInContext(block, sb);
// const de nivel superior no cuelga del sandbox: se recupera del contexto.
try { sb.PZ_OFICINA = vm.runInContext('PZ_OFICINA', sb); } catch (err) {}
const OF = sb.PZ_OFICINA || [];
// 1) Datos: 50 ítems exactos, 1 por nivel, zonas del spec.
t(OF.length === 50, 'PZ_OFICINA tiene 50 ítems (tiene ' + OF.length + ')');
const nvs = OF.map((e) => e.nv).sort((x, y) => x - y);
t(nvs.every((v, i) => v === i + 1), 'nv 1–50 sin huecos ni duplicados');
const zonas = {};
for (const e of OF) zonas[e.zona] = (zonas[e.zona] || 0) + 1;
t(zonas.base === 10 && zonas.creativo === 10 && zonas.estudio === 10 && zonas.pro === 10 && zonas.maestro === 10, 'zonas 10/10/10/10/10 (base/creativo/estudio/pro/maestro)');
t(OF.every((e) => e.es && e.en && e.svg && e.z >= 1 && e.z <= 8), 'todo ítem con es/en/svg y z 1–8');
t(OF.every((e) => e.full || (e.x >= 0 && e.y >= 0 && e.x + e.w <= 400 && e.y + e.h <= 320)), 'rectángulos dentro de la escena 400×320');
const specNombres = ['Escritorio', 'Silla', 'Alfombra', 'Lámpara', 'Plantita', 'Taza', 'Laptop', 'Cuaderno', 'Pila de libros', 'Estante', 'Mood board', 'Fotos con chinches', 'Paleta de colores', 'Calendario de contenido', 'Aro de luz', 'Cámara', 'Trípode', 'Micrófono', 'Auriculares', 'Vinilo', 'Parlante', 'Cafetera', 'Reloj', 'Póster', 'Guirnalda de luces', 'Monstera', 'Bambú', 'Segundo estante', 'Cojines', 'Muro de plantas', 'Biblioteca', 'Silla de director', 'Cartel de estrella neón', 'Pared de discos', 'Segunda cámara', 'Caja de luz', 'Pared de bocetos', 'Trofeo chico', 'Árbol en maceta grande', 'Cortina + ventana con sol', 'Lámpara dorada', 'Libros dorados', 'Marco dorado', 'Bambú dorado', 'Globos dorados', 'Confeti', 'Silla Maestro', 'Diploma enmarcado en dorado', 'Trofeo dorado grande', 'Corona dorada en exhibición'];
t(OF.every((e, i) => e.es === specNombres[i]), 'nombres ES exactos del spec, en orden');
// 2) Paralelo con el guardarropa vigente (no se reescribe).
t(cnt(app, 'const PZ_ROPA = [') === 1, 'PZ_ROPA intacto, una sola definición');
t(typeof sb.pzRopaPorNivel !== 'function', 'el bloque OFICINA no redefine pzRopaPorNivel (lo usa si existe)');
// 3) Desbloqueo por nivel.
t(sb.pzOficinaDesbloqueados(0).length === 0, 'nivel 0: 0 ítems');
t(sb.pzOficinaDesbloqueados(1).length === 1, 'nivel 1: 1 ítem');
t(sb.pzOficinaDesbloqueados(7).length === 7, 'nivel 7: 7 ítems');
t(sb.pzOficinaDesbloqueados(50).length === 50, 'nivel 50: 50 ítems');
t(sb.pzOficinaDesbloqueados(99).length === 50, 'nivel >50: sigue en 50 (sin nivel 51)');
t(sb.pzOficinaNombre(1, false) === 'Escritorio' && sb.pzOficinaNombre(50, false) === 'Corona dorada en exhibición', 'nombres por nivel 1 y 50');
t(sb.pzOficinaNombre(50, true) === 'Golden crown on display', 'nombre EN nivel 50');
// 4) Escena: solo desbloqueados, Maestro solo al 50.
const esc1 = sb.pzOficinaEscenaHTML(1, 0);
t(esc1.includes('viewBox="0 0 400 320"'), 'escena con viewBox 400×320');
t(esc1.includes('C98A4B'), 'escena nivel 1 trae el escritorio');
t(!esc1.includes('Golden crown') && !esc1.includes('M10 62L20 8'), 'escena nivel 1 NO trae la corona del 50');
t(!esc1.includes('PZ_OFICINA_MAESTRO') && !esc1.includes('390" y="100'), 'escena nivel 1 sin marco Maestro');
const esc50 = sb.pzOficinaEscenaHTML(50, 0);
t(esc50.includes('M10 62L20 8'), 'escena nivel 50 trae la corona en exhibición');
t(esc50.includes('390" y="100'), 'escena nivel 50 trae el marco Maestro (bambú dorado lateral)');
t(!esc50.includes('pz-oficina-semillas'), 'sin semillas, sin tira de semillas');
// 5) Semillas: persistencia con el patrón del guardarropa, sin auto-otorgar.
t(sb.pzOficinaSemillasGet() === 0, 'semillas iniciales 0');
t(sb.pzOficinaSemillaDar() === 1 && sb.pzOficinaSemillasGet() === 1, 'dar semilla persiste 1');
t(sb.pzOficinaSemillaDar() === 2 && sb.pzOficinaSemillasGet() === 2, 'dar semilla persiste 2');
t(sb.pzOficinaSemillasClave() === 'posta-oficina-semillas_12', 'clave de semillas por usuario (patrón guardarropa)');
t(sb.pzOficinaSemillasHTML(0) === '', 'tira de 0 semillas vacía');
t((sb.pzOficinaSemillasHTML(3).match(/pz-oficina-brote/g) || []).length === 3, 'tira de 3 semillas con 3 brotes');
t(sb.pzOficinaEscenaHTML(50, 2).includes('pz-oficina-semillas'), 'escena Maestro con semillas trae la tira');
t(cnt(app, 'pzOficinaSemillaDar(') === 1, 'pzOficinaSemillaDar SOLO definida, nunca llamada (sin otorgamiento automático)');
// 6) Lista y sección en Premios.
const li1 = sb.pzOficinaListaHTML(1);
t((li1.match(/pz-oficina-fila lock/g) || []).length === 49, 'lista nivel 1: 49 bloqueados');
t(li1.includes('¡Nuevo!'), 'lista nivel 1 marca ¡Nuevo! en el ítem del nivel');
t(!li1.includes('Se desbloquea en el Nivel 1</span>'), 'ninguna fila bloqueada dice desbloquearse en el nivel 1');
const sec = sb.pzOficinaSeccionHTML(50);
t(sec.includes('Tu oficina') && sec.includes('Oficina Maestro'), 'sección Premios nivel 50 con título y texto Maestro');
t(sec.includes('pz-oficina-lista'), 'sección trae la lista');
sb.ME.lang = 'en';
t(sb.pzOficinaSeccionHTML(5).includes('Your office'), 'sección EN con título en inglés');
sb.ME.lang = 'es';
// 7) Cableado en Premios + CSS + no tocar servidor.
t(app.includes('${pzOficinaSeccionHTML(nvNum)}'), 'mxJardinHTML posty inserta la sección de oficina');
t(!app.includes("gzT('El jardín de Posty', \"Posty's garden\")") || app.includes('${pzOficinaSeccionHTML(nvNum)}'), 'h1 de Premios intacto (lo renombra inicio-3, no este lote)');
t(css.includes('.pz-oficina-escena') && css.includes('.pz-oficina-semillas') && css.includes('.pz-oficina-fila'), 'CSS de oficina presente');
t(!srv.includes('PZ_OFICINA'), 'server.js sin cambios de este lote');
t(cnt(app, 'onclick="pzOficina') === 0, 'M78: ninguna función nueva llamada desde UI (filas sin botones)');
console.log(ok + ' ok / ' + bad + ' fallas');
process.exit(bad ? 1 : 0);
