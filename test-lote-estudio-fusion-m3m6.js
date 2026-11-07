'use strict';
/* test-lote-estudio-fusion-m3m6.js — ESTUDIO-PROFUNDO · FUSIÓN M3→M6
 * (coordinador, 7/11).
 *
 * La mejora 3 (ficha de oferta) guarda las correcciones del cliente en
 * offerSheet.correcciones_cliente (origen 'dueno') y la mejora 6
 * (re-estudio semanal) protege la palabra del cliente en
 * recordRestudyRun — pero sus fuentes de bloqueo no incluían la ficha.
 * Sin este puente, un precio corregido en la ficha se pisaba en silencio
 * en las listas del fundamento (el gate de la ficha lo respetaba, el
 * fundamento no) y una promo corregida se daba por terminada sin avisar.
 *
 * El puente (study-restudy.js, collectClientLocks + resolveConflict):
 *  - la ficha bloquea como una fuente más: precio → bloqueo de precio,
 *    promo_ends_at / promo_nueva / promo_titulo → bloqueo de promo
 *    (horarios/ubicacion no se comparan en el diff: no bloquean);
 *  - 'nuevo' en un conflicto de la ficha adopta la decisión en la
 *    ficha también (precio → la corrección toma el valor nuevo;
 *    falta → la corrección y el ítem salen de la ficha), así que no
 *    vuelve a conflictuar la semana siguiente.
 * Cubre también las correcciones hechas en la PRUEBA (antes de que
 * existiera la cuenta): la ficha viaja trial_cache → cuenta, y el
 * puente lee la ficha guardada, no necesita uid en el momento de
 * corregir.
 *
 * Uso: node test-lote-estudio-fusion-m3m6.js            (árbol actual)
 *      BASE=/ruta/al/arbol node test-lote-estudio-fusion-m3m6.js
 * En el árbol v760 sin tocar debe FALLAR (no existe study-restudy.js).
 * Con la mejora 6 sin el puente debe FALLAR (el puente no existe).
 * Con el lote fusionado debe dar 0 fallos.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || __dirname;
let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');

let mod = null;
try { mod = require(path.join(BASE, 'study-restudy.js')); } catch (e) { mod = null; }
t(!!mod, '0.1 study-restudy.js existe y carga');
t(typeof (mod && mod.collectClientLocks) === 'function', '0.2 exporta collectClientLocks');
t(typeof (mod && mod.recordRestudyRun) === 'function', '0.3 exporta recordRestudyRun');
t(typeof (mod && mod.resolveConflict) === 'function', '0.4 exporta resolveConflict');
if (mod) {
  const src = read('study-restudy.js');
  t(src.includes('correcciones_cliente'), '0.5 el puente lee offerSheet.correcciones_cliente');
  t(src.includes('PUENTE DEL COORDINADOR'), '0.6 el puente está marcado como fusión M3→M6');
}

// ---------- fixtures ----------
const AT_OLD = '2026-10-31T10:00:00.000Z';
function digestConFicha() {
  return {
    v: 1, business: 'Café Test', category: 'cafetería', subcat: '',
    rubro_id: { v: 1, rubro: 'cafetería', subrubro: '', confianza: 0.9, fuente: 'pregunta', segura: true },
    productos: [
      { nombre: 'Café Latte', precio: '$1200', procedencia: 'web' },
      { nombre: 'Medialuna', precio: '$800', procedencia: 'web' },
      { nombre: 'Tostado', precio: '$900', procedencia: 'web' },
    ],
    servicios: [],
    promos: [{ titulo: '2x1 en medialunas' }],
    temas_feed: [], fuentes: { web: { at: AT_OLD }, feed: { at: AT_OLD } },
    dueno: null, clientCorrections: [],
    offerSheet: {
      v: 1,
      productos: [{ nombre: 'Café Latte', precio: '$1500', fuente: 'dueno', corregido_por_cliente: true, evidencia: 'Corrección del cliente' }],
      promos: [{ titulo: '2x1 en medialunas', ends_at: '2026-11-30', fuente: 'dueno', corregido_por_cliente: true, evidencia: 'Corrección del cliente' }],
      correcciones_cliente: [
        { campo: 'precio', titulo: 'Café Latte', valor: '$1500', ends_at: null, at: AT_OLD, origen: 'dueno' },
        { campo: 'promo_ends_at', titulo: '2x1 en medialunas', valor: '', ends_at: '2026-11-30', at: AT_OLD, origen: 'dueno' },
        { campo: 'horarios', titulo: '', valor: 'Lun a Vie 9 a 18', ends_at: null, at: AT_OLD, origen: 'dueno' },
      ],
      faltantes: [],
    },
  };
}
// Estudio fresco: Café Latte $1200→$2000, Medialuna $800→$900 (sin
// corrección: debe aplicarse), Tostado igual, la promo 2x1 ya no está.
function digestFresco() {
  const d = digestConFicha();
  d.productos = [
    { nombre: 'Café Latte', precio: '$2000', procedencia: 'web' },
    { nombre: 'Medialuna', precio: '$900', procedencia: 'web' },
    { nombre: 'Tostado', precio: '$900', procedencia: 'web' },
  ];
  d.promos = [];
  d.fuentes = { web: { at: '2026-11-07T09:00:00.000Z' }, feed: { at: '2026-11-07T09:00:00.000Z' } };
  return d;
}

function freshDb() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE IF NOT EXISTS profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', category TEXT DEFAULT '', description TEXT DEFAULT '', ig_username TEXT DEFAULT '', ig_connected INTEGER DEFAULT 0)`);
  db.exec(`CREATE TABLE IF NOT EXISTS business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '{}')`);
  return db;
}
const cd = require(path.join(BASE, 'client-digest.js'));

// ---------- 1. el puente bloquea: precio corregido en la ficha ----------
if (mod) {
  const locks = mod.collectClientLocks(digestConFicha());
  t(Array.isArray(locks) && locks.some((l) => l.kind === 'precio' && /latte/i.test(l.nombre || '') && String(l.precio || '').includes('1500')), '1.1 la corrección de precio de la ficha es un bloqueo (Café Latte $1500)');
  t(locks.some((l) => l.kind === 'promo' && /2x1/i.test(l.nombre || '')), '1.2 la corrección de promo de la ficha es un bloqueo (2x1)');
}

// ---------- 2. corrida: conflicto, no pisado; lo sin corregir aplica ----------
let db = null;
if (mod) {
  db = freshDb();
  const r = mod.recordRestudyRun(db, 1, digestConFicha(), digestFresco(), { sources: { web: true, feed: true } });
  t(!!r && r.ok === true, '2.1 recordRestudyRun ok');
  const tiposCambio = (r.cambios || []).map((c) => c.tipo);
  const tiposConf = (r.conflictos || []).map((c) => c.tipo);
  t(!tiposCambio.includes('precio_cambio') || !(r.cambios || []).some((c) => c.tipo === 'precio_cambio' && /Latte/.test(c.item || '')), '2.2 el precio corregido NO se aplica en silencio (no es cambio)');
  t(tiposConf.includes('precio_cambio') && (r.conflictos || []).some((c) => c.tipo === 'precio_cambio' && /Latte/.test(c.item || '') && String(c.valor_cliente || '').includes('1500') && String(c.valor_nuevo || '').includes('2000')), '2.3 el precio corregido es conflicto pendiente ($1500 vs $2000)');
  t(tiposCambio.includes('precio_cambio') && (r.cambios || []).some((c) => c.tipo === 'precio_cambio' && /Medialuna/.test(c.item || '')), '2.4 el precio SIN corregir sí se aplica (Medialuna $800→$900)');
  t(tiposConf.includes('promo_falta') && (r.conflictos || []).some((c) => c.tipo === 'promo_falta' && /2x1/.test(c.item || '')), '2.5 la promo corregida es conflicto pendiente (no se da por terminada)');
  const g = cd.getStoredDigest(db, 1);
  const latte = (g.productos || []).find((p) => /Latte/.test(p.nombre || ''));
  t(!!latte && String(latte.precio || '').includes('1500'), '2.6 el fundamento guarda el precio del cliente ($1500), no el fresco');
  t((g.promos || []).some((p) => /2x1/.test(p.titulo || '')), '2.7 el fundamento conserva la promo corregida');
  const med = (g.productos || []).find((p) => /Medialuna/.test(p.nombre || ''));
  t(!!med && String(med.precio || '').includes('900'), '2.8 el fundamento actualiza el precio sin corregir (Medialuna $900)');
}

// ---------- 3. resolver 'nuevo': la ficha adopta la decisión ----------
if (mod && db) {
  const rPrecio = mod.resolveConflict(db, 1, { tipo: 'precio_cambio', nombre: 'Café Latte', decision: 'nuevo' });
  t(!!rPrecio && rPrecio.ok === true, '3.1 resolver precio con nuevo ok');
  let g = cd.getStoredDigest(db, 1);
  let latte = (g.productos || []).find((p) => /Latte/.test(p.nombre || ''));
  t(!!latte && String(latte.precio || '').includes('2000'), '3.2 el fundamento toma el precio nuevo ($2000)');
  let corrPrecio = ((g.offerSheet || {}).correcciones_cliente || []).find((c) => c.campo === 'precio' && /Latte/.test(c.titulo || ''));
  t(!!corrPrecio && String(corrPrecio.valor || '').includes('2000'), '3.3 la corrección de la ficha toma el valor nuevo ($2000)');
  const rPromo = mod.resolveConflict(db, 1, { tipo: 'promo_falta', nombre: '2x1 en medialunas', decision: 'nuevo' });
  t(!!rPromo && rPromo.ok === true, '3.4 resolver promo con nuevo ok');
  g = cd.getStoredDigest(db, 1);
  t(!(g.promos || []).some((p) => /2x1/.test(p.titulo || '')), '3.5 el fundamento ya no tiene la promo');
  t(!((g.offerSheet || {}).correcciones_cliente || []).some((c) => c.campo === 'promo_ends_at' && /2x1/.test(c.titulo || '')), '3.6 la corrección de promo sale de la ficha');
  t(!((g.offerSheet || {}).promos || []).some((p) => /2x1/.test(p.titulo || '')), '3.7 la promo sale de la ficha (no la sostiene más)');
}

// ---------- 4. segunda corrida: no vuelve a conflictuar ----------
if (mod && db) {
  const g = cd.getStoredDigest(db, 1);
  const r2 = mod.recordRestudyRun(db, 1, g, digestFresco(), { sources: { web: true, feed: true } });
  t(!!r2 && r2.ok === true, '4.1 segunda corrida ok');
  t(Array.isArray(r2.conflictos) && r2.conflictos.length === 0, '4.2 cero conflictos: la decisión quedó adoptada (son ' + (r2.conflictos || []).length + ')');
  t(Array.isArray(r2.cambios) && r2.cambios.length === 0, '4.3 cero cambios: fundamento y estudio fresco coinciden');
}

// ---------- 5. sin ficha no hay puente (no se sobre-bloquea) ----------
if (mod) {
  const sinFicha = digestConFicha();
  delete sinFicha.offerSheet;
  const locks = mod.collectClientLocks(sinFicha);
  t(!locks.some((l) => l.kind === 'precio' && /latte/i.test(l.nombre || '')), '5.1 sin ficha no hay bloqueo de precio (la ficha es la fuente)');
}

console.log(`\ntest-lote-estudio-fusion-m3m6: ${okN} ok, ${badN} fallos`);
process.exit(badN ? 1 : 0);
