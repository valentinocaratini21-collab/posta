'use strict';
/* test-lote-estudio-reestudio.js — ESTUDIO-PROFUNDO · MEJORA 6:
 * RE-ESTUDIO SEMANAL (Valentino 7/11 ~16:00 «Perfecto! Arma todo»).
 *
 * Hoy el estudio de la prueba corre UNA sola vez al entrar (IG + web en
 * paralelo → fundamento). Esta mejora vuelve a correrlo cada semana con
 * los MISMOS inputs, compara contra el fundamento guardado, actualiza
 * el fundamento y le muestra al cliente qué cambió.
 *
 * Fixtures: fundamento v1 + estudio fresco con (1) un producto agregado,
 * (2) uno que ya no está, (3) un precio cambiado, (4) una promo nueva →
 * el diff lista EXACTAMENTE esos 4 cambios; el fundamento queda
 * actualizado; la superficie «qué cambió» los muestra; un dato corregido
 * por el cliente que el re-estudio contradice → conflicto marcado, NO
 * sobrescrito.
 *
 * Reglas que la suite fija:
 *  - El re-estudio NUNCA reescribe el rubro en silencio (garantías 3/11):
 *    rubro_id/category/subcat guardados se restauran siempre.
 *  - La palabra del cliente manda: procedencia 'cliente', precios
 *    respondidos por el dueño (digest.dueno.precios) y el espacio
 *    digest.clientCorrections (contrato para la mejora 3, ficha de
 *    oferta) nunca se pisan en silencio: contradicción = conflicto
 *    pendiente, valor del cliente conservado.
 *  - Rama honesta: si una fuente no se puede leer, se informa
 *    (fuentes_no_leidas) y NO se inventa ningún cambio.
 *  - El fundamento solo crece en su espacio propio (studyHistory):
 *    nada de lo demás se reescribe fuera del diff.
 *
 * Uso: node test-lote-estudio-reestudio.js            (árbol actual)
 *      BASE=/ruta/al/arbol node test-lote-estudio-reestudio.js
 * En el árbol v760 sin tocar debe FALLAR (no existe study-restudy.js).
 * Con el lote debe dar 0 fallos.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || __dirname;
const BASE_ORIG = process.env.BASE_ORIG || '/home/hatch/workspace/.preparador-onboarding-rebase-v759/release-v760';
let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');

let mod = null;
try { mod = require(path.join(BASE, 'study-restudy.js')); } catch (e) { mod = null; }
t(!!mod, '0.1 study-restudy.js existe y carga');
if (mod) {
  for (const fn of ['diffDigests', 'recordRestudyRun', 'runRestudyForUser', 'markClientCorrection', 'restudySummaryText', 'resolveConflict']) {
    t(typeof mod[fn] === 'function', '0.2 exporta ' + fn);
  }
}

// ---------- fixtures ----------
const AT_OLD = '2026-10-31T10:00:00.000Z';
function digestV1() {
  return {
    v: 1, business: 'Café Test', category: 'cafetería', subcat: '',
    rubro_id: { v: 1, rubro: 'cafetería', subrubro: '', confianza: 0.9, fuente: 'pregunta', segura: true },
    productos: [
      { nombre: 'Café Latte', precio: '$1200', procedencia: 'web' },
      { nombre: 'Medialuna', precio: '$800', procedencia: 'web' },
      { nombre: 'Tostado', precio: '$900', procedencia: 'web' },
    ],
    servicios: [{ nombre: 'Café para llevar', procedencia: 'web' }],
    promos: [{ titulo: '2x1 en medialunas' }],
    temas_feed: [], fuentes: { web: { at: AT_OLD }, feed: { at: AT_OLD } },
    dueno: null, clientCorrections: [],
  };
}
// Estudio fresco: +Torta de Chocolate, −Tostado, Café Latte $1200→$1500, +promo torta.
function digestFresco() {
  const d = digestV1();
  d.productos = [
    { nombre: 'Café Latte', precio: '$1500', procedencia: 'web' },
    { nombre: 'Medialuna', precio: '$800', procedencia: 'web' },
    { nombre: 'Torta de Chocolate', precio: '$2500', procedencia: 'web' },
  ];
  d.promos = [{ titulo: '2x1 en medialunas' }, { titulo: 'Promo torta 2x1' }];
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

// ---------- 1. diff ----------
if (mod) {
  const diff = mod.diffDigests(digestV1(), digestFresco());
  t(Array.isArray(diff) && diff.length === 4, '1.1 diff lista exactamente 4 cambios (son ' + (diff && diff.length) + ')');
  const tipos = (diff || []).map((c) => c.tipo).sort();
  t(JSON.stringify(tipos) === JSON.stringify(['precio_cambio', 'producto_falta', 'producto_nuevo', 'promo_nueva']), '1.2 diff tiene producto_nuevo + producto_falta + precio_cambio + promo_nueva (son ' + tipos.join(',') + ')');
  const nuevo = (diff || []).find((c) => c.tipo === 'producto_nuevo');
  t(!!nuevo && /Torta de Chocolate/.test(nuevo.item || '') && String(nuevo.fuente || '').length > 0, '1.3 producto_nuevo trae nombre y procedencia (fuente)');
  const precio = (diff || []).find((c) => c.tipo === 'precio_cambio');
  t(!!precio && /Café Latte/.test(precio.item || '') && String(precio.antes || '').includes('1200') && String(precio.despues || '').includes('1500'), '1.4 precio_cambio trae antes $1200 y después $1500');
  const falta = (diff || []).find((c) => c.tipo === 'producto_falta');
  t(!!falta && /Tostado/.test(falta.item || ''), '1.5 producto_falta es Tostado');
  const promo = (diff || []).find((c) => c.tipo === 'promo_nueva');
  t(!!promo && /Promo torta 2x1/.test(promo.item || ''), '1.6 promo_nueva es «Promo torta 2x1»');
  const sinCambios = mod.diffDigests(digestV1(), digestV1());
  t(Array.isArray(sinCambios) && sinCambios.length === 0, '1.7 sin diferencias → diff vacío');
}

// ---------- 2. aplicar: fundamento actualizado + historial ----------
if (mod) {
  const db = freshDb();
  const r = mod.recordRestudyRun(db, 1, digestV1(), digestFresco(), { sources: { web: true, feed: true } });
  t(!!r && r.ok === true, '2.1 recordRestudyRun ok');
  t(Array.isArray(r.cambios) && r.cambios.length === 4, '2.2 run registra 4 cambios');
  t(Array.isArray(r.conflictos) && r.conflictos.length === 0, '2.3 sin conflictos en el fixture base');
  const guardado = require(path.join(BASE, 'client-digest.js')).getStoredDigest(db, 1);
  t(!!guardado, '2.4 fundamento guardado tras el re-estudio');
  const noms = (guardado.productos || []).map((p) => p.nombre);
  t(noms.includes('Torta de Chocolate') && !noms.includes('Tostado'), '2.5 fundamento actualizado: entra Torta, sale Tostado');
  const latte = (guardado.productos || []).find((p) => /Latte/.test(p.nombre));
  t(!!latte && String(latte.precio || '').includes('1500'), '2.6 fundamento actualizado: Café Latte $1500');
  t((guardado.promos || []).some((p) => /Promo torta 2x1/.test(p.titulo || '')), '2.7 fundamento actualizado: promo nueva guardada');
  t(!!guardado.studyHistory && Array.isArray(guardado.studyHistory.runs) && guardado.studyHistory.runs.length === 1, '2.8 studyHistory con 1 corrida');
  const run = guardado.studyHistory.runs[0];
  t(run && Array.isArray(run.cambios) && run.cambios.length === 4 && !!run.at, '2.9 la corrida guarda los 4 cambios con fecha');
  t(guardado.studyHistory.lastRunAt === run.at, '2.10 studyHistory.lastRunAt = fecha de la corrida');
  // Segunda corrida sin cambios: no duplica, suma historial.
  const r2 = mod.recordRestudyRun(db, 1, guardado, JSON.parse(JSON.stringify(guardado)), { sources: { web: true, feed: true } });
  t(!!r2 && r2.ok === true && r2.cambios.length === 0, '2.11 segunda corrida sin cambios → 0 cambios');
  const g2 = require(path.join(BASE, 'client-digest.js')).getStoredDigest(db, 1);
  t(g2.studyHistory.runs.length === 2 && g2.studyHistory.runs[1].cambios.length === 0, '2.12 historial acumula la corrida sin cambios');
}

// ---------- 3. superficie «qué cambió» ----------
if (mod) {
  const db = freshDb();
  const r = mod.recordRestudyRun(db, 1, digestV1(), digestFresco(), { sources: { web: true, feed: true } });
  const run = r.run || (r && r.cambios ? { cambios: r.cambios, conflictos: r.conflictos || [], at: Date.now() } : null);
  const es = mod.restudySummaryText(run, 'es');
  const en = mod.restudySummaryText(run, 'en');
  t(typeof es === 'string' && /Torta de Chocolate/.test(es) && /Tostado/.test(es) && /1500/.test(es) && /Promo torta 2x1/.test(es), '3.1 resumen ES muestra los 4 cambios');
  t(typeof en === 'string' && /Torta de Chocolate/.test(en) && /Tostado/.test(en) && /1500/.test(en), '3.2 resumen EN muestra los cambios (paridad)');
  t(/Qué cambió/.test(es) && /What changed/.test(en), '3.3 resumen titula «Qué cambió / What changed»');
}

// ---------- 4. palabra del cliente: conflicto, NO sobrescrito ----------
if (mod) {
  // 4a. Precio corregido por el cliente (procedencia 'cliente').
  const db = freshDb();
  const viejo = digestV1();
  viejo.productos.find((p) => p.nombre === 'Tostado').procedencia = 'cliente';
  const fresco = digestFresco();
  fresco.productos.push({ nombre: 'Tostado', precio: '$1100', procedencia: 'web' });
  const r = mod.recordRestudyRun(db, 1, viejo, fresco, { sources: { web: true, feed: true } });
  t(Array.isArray(r.conflictos) && r.conflictos.length === 1, '4.1 precio del cliente contradicho → 1 conflicto (son ' + (r.conflictos || []).length + ')');
  const c = (r.conflictos || [])[0] || {};
  t(c.tipo === 'precio_cambio' && c.estado === 'pendiente' && String(c.valor_cliente || '').includes('900') && String(c.valor_nuevo || '').includes('1100'), '4.2 conflicto guarda valor del cliente $900 y valor nuevo $1100, estado pendiente');
  t(!(r.cambios || []).some((x) => x.tipo === 'precio_cambio' && /Tostado/.test(x.item || '')), '4.3 el cambio en conflicto NO entra en cambios aplicados');
  const g = require(path.join(BASE, 'client-digest.js')).getStoredDigest(db, 1);
  const tos = (g.productos || []).find((p) => p.nombre === 'Tostado');
  t(!!tos && String(tos.precio || '').includes('900'), '4.4 fundamento conserva el precio del cliente ($900), no el fresco ($1100)');
  // 4b. Producto del cliente que el estudio ya no ve: conflicto + se conserva.
  const db2 = freshDb();
  const viejo2 = digestV1();
  viejo2.productos.find((p) => p.nombre === 'Tostado').procedencia = 'cliente';
  const r2 = mod.recordRestudyRun(db2, 1, viejo2, digestFresco(), { sources: { web: true, feed: true } });
  t((r2.conflictos || []).some((x) => x.tipo === 'producto_falta' && /Tostado/.test(x.item || '')), '4.5 producto del cliente que ya no se ve → conflicto producto_falta');
  const g2 = require(path.join(BASE, 'client-digest.js')).getStoredDigest(db2, 1);
  t((g2.productos || []).some((p) => p.nombre === 'Tostado'), '4.6 producto del cliente se conserva en el fundamento');
  // 4c. Corrección registrada vía markClientCorrection (contrato mejora 3).
  const db3 = freshDb();
  require(path.join(BASE, 'client-digest.js')).saveDigest(db3, 1, digestV1());
  const mk = mod.markClientCorrection(db3, 1, { campo: 'precio', clave: 'Café Latte', valor: '$1200' });
  t(!!mk && mk.ok === true, '4.7 markClientCorrection ok');
  const g3a = require(path.join(BASE, 'client-digest.js')).getStoredDigest(db3, 1);
  t(Array.isArray(g3a.clientCorrections) && g3a.clientCorrections.length === 1, '4.8 la corrección queda en digest.clientCorrections');
  const r3 = mod.recordRestudyRun(db3, 1, g3a, digestFresco(), { sources: { web: true, feed: true } });
  t((r3.conflictos || []).some((x) => x.tipo === 'precio_cambio' && /Latte/.test(x.item || '')), '4.9 corrección registrada contradicha → conflicto');
  const g3 = require(path.join(BASE, 'client-digest.js')).getStoredDigest(db3, 1);
  const lat3 = (g3.productos || []).find((p) => /Latte/.test(p.nombre));
  t(!!lat3 && String(lat3.precio || '').includes('1200'), '4.10 precio corregido por el cliente se conserva ($1200)');
  // 4d. Precio respondido por el dueño (digest.dueno.precios) también manda.
  const db4 = freshDb();
  const viejo4 = digestV1();
  viejo4.dueno = { precios: { 'cafe latte': { item: 'Café Latte', precio: '$1200' } } };
  const r4 = mod.recordRestudyRun(db4, 1, viejo4, digestFresco(), { sources: { web: true, feed: true } });
  t((r4.conflictos || []).some((x) => x.tipo === 'precio_cambio' && /Latte/.test(x.item || '')), '4.11 precio del dueño (dueno.precios) contradicho → conflicto');
  // 4e. Resolver el conflicto a favor de lo nuevo lo aplica; a favor del cliente lo deja.
  const db5 = freshDb();
  const viejo5 = digestV1();
  viejo5.productos.find((p) => p.nombre === 'Tostado').procedencia = 'cliente';
  const fresco5 = digestFresco();
  fresco5.productos.push({ nombre: 'Tostado', precio: '$1100', procedencia: 'web' });
  mod.recordRestudyRun(db5, 1, viejo5, fresco5, { sources: { web: true, feed: true } });
  const res = mod.resolveConflict(db5, 1, { tipo: 'precio_cambio', nombre: 'Tostado', decision: 'nuevo' });
  t(!!res && res.ok === true, '4.12 resolveConflict (nuevo) ok');
  const g5 = require(path.join(BASE, 'client-digest.js')).getStoredDigest(db5, 1);
  const tos5 = (g5.productos || []).find((p) => p.nombre === 'Tostado');
  t(!!tos5 && String(tos5.precio || '').includes('1100'), '4.13 al elegir lo nuevo, el precio pasa a $1100');
  t((g5.studyHistory.runs[0].conflictos || []).every((x) => x.estado !== 'pendiente'), '4.14 el conflicto resuelto ya no queda pendiente');
}

// ---------- 5. rama honesta: fuentes ilegibles ----------
if (mod) {
  (async () => {
    const db = freshDb();
    db.prepare(`INSERT INTO profiles (user_id, business_name, category, ig_username, ig_connected) VALUES (1, 'Café Test', 'cafetería', 'cafetest', 1)`).run();
    db.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (1, ?)`).run(JSON.stringify({ website_url: 'https://cafe.test' }));
    require(path.join(BASE, 'client-digest.js')).saveDigest(db, 1, digestV1());
    const r = await mod.runRestudyForUser(db, 1, {
      fetchWeb: async () => null,
      fetchFeed: async () => null,
    });
    t(!!r && r.ok === false, '5.1 sin fuentes legibles → ok false');
    t(Array.isArray(r.fuentes_no_leidas) && r.fuentes_no_leidas.includes('web') && r.fuentes_no_leidas.includes('feed'), '5.2 fuentes_no_leidas = web + feed');
    t(Array.isArray(r.cambios) && r.cambios.length === 0, '5.3 sin fuentes no se inventa ningún cambio');
    const g = require(path.join(BASE, 'client-digest.js')).getStoredDigest(db, 1);
    t((g.productos || []).length === 3 && (g.studyHistory.runs[0].fuentes_no_leidas || []).length === 2, '5.4 fundamento intacto y la corrida honesta queda en el historial');
    finish();
  })().catch((e) => { badN++; console.log('✗ 5.x runRestudyForUser lanzó:', e && e.message); finish(); });
} else {
  finish();
}

// ---------- 6. rubro nunca se reescribe en silencio ----------
if (mod) {
  const db = freshDb();
  const viejo = digestV1();
  const fresco = digestFresco();
  fresco.category = 'panadería'; fresco.subcat = 'pan';
  fresco.rubro_id = { v: 1, rubro: 'panadería', subrubro: 'pan', confianza: 0.95, fuente: 'deteccion', segura: true };
  mod.recordRestudyRun(db, 1, viejo, fresco, { sources: { web: true, feed: true } });
  const g = require(path.join(BASE, 'client-digest.js')).getStoredDigest(db, 1);
  t(g.category === 'cafetería' && g.rubro_id && g.rubro_id.rubro === 'cafetería', '6.1 el re-estudio conserva rubro/category guardados aunque el fresco difiera');
}

// ---------- 7. cableado estático ----------
function finish() {
  let SRV = '', ANA = '', APP = '';
  try { SRV = read('server.js'); } catch (e) {}
  try { ANA = read('public/chunk-analisis.js'); } catch (e) {}
  try { APP = read('public/app.js'); } catch (e) {}
  t(/study-restudy/.test(SRV), '7.1 server.js requiere study-restudy');
  t(/recordRestudyRun/.test(SRV), '7.2 refreshDigestsSweep registra la corrida del re-estudio');
  t(/\/api\/estudio\/reestudio/.test(SRV), '7.3 endpoint POST /api/estudio/reestudio');
  t(/\/api\/estudio\/ultimo-cambio/.test(SRV), '7.4 endpoint GET /api/estudio/ultimo-cambio');
  t(/\/api\/estudio\/conflicto\/resolver/.test(SRV), '7.5 endpoint POST /api/estudio/conflicto/resolver');
  t(/anaRestudioBox/.test(ANA), '7.6 chunk-analisis monta la tarjeta «qué cambió» (anaRestudioBox)');
  t(/anaRestudioLoad/.test(ANA), '7.7 chunk-analisis carga la tarjeta bajo demanda');
  t(/\/api\/estudio\/ultimo-cambio/.test(ANA), '7.8 la tarjeta lee GET /api/estudio/ultimo-cambio');
  t(/Qué cambió esta semana/.test(ANA) && /What changed this week/.test(ANA), '7.9 tarjeta ES+EN en paridad');
  t(!/CHUNK_V = '20261105-v760'/.test(APP), '7.10 CHUNK_V bumpeado (chunk-analisis cambió)');
  t(/const BUILD_ID = '20261105-v764'/.test(SRV), '7.11 BUILD_ID sigue 20261105-v764 (base v763, sin re-estampado)');
  // Las 5 preguntas / onboarding no se tocan en este lote.
  try {
    const orig = fs.readFileSync(path.join(BASE_ORIG, 'preguntas-dinamicas.js'), 'utf8');
    const cur = read('preguntas-dinamicas.js');
    t(orig === cur, '7.12 preguntas-dinamicas.js byte-idéntico a la base v760');
  } catch (e) { t(false, '7.12 preguntas-dinamicas.js comparable con la base v760'); }
  try {
    const orig = fs.readFileSync(path.join(BASE_ORIG, 'guest-trial.js'), 'utf8');
    t(orig === read('guest-trial.js'), '7.13 guest-trial.js byte-idéntico a la base v760');
  } catch (e) { t(false, '7.13 guest-trial.js comparable con la base v760'); }

  console.log(`\ntest-lote-estudio-reestudio: ${okN} ok, ${badN} fallos`);
  process.exit(badN ? 1 : 0);
}
