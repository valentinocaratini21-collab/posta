/* LOTE SEMILLAS-MAESTRO-REDENCION — checks: canje de una semilla de
   Maestro por un negocio nuevo, con registro durable y sin beneficio
   inventado (SPEC: el canje es reconocimiento/procedencia, NUNCA
   niveles, descuentos ni meses gratis).
   Uso: node test-lotesemillas.js (desde la raíz del árbol). Sin
   dependencias (node:sqlite). «Ahora» fijo: lunes 2026-11-02. */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const PJ = require('./postjardin');

let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }
function count(s, sub) { return s.split(sub).length - 1; }

const GIVER = 7, REDEEMER = 8, OTRO = 9;
const NOW = Date.UTC(2026, 10, 2); // lunes 2026-11-02
const DAY = 86400000;
const MONDAY = (y, m, d) => Date.UTC(y, m - 1, d);

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE oficina_nivel_eventos (user_id INTEGER, poder TEXT, evento TEXT, hecho TEXT, registro_ref TEXT, ts INTEGER)');
  db.exec("CREATE TABLE oficina_registros (user_id INTEGER, poder TEXT, tipo TEXT, resumen TEXT, registro_ref TEXT, recibo_json TEXT, estado TEXT, ts INTEGER, salida INTEGER DEFAULT 0)");
  db.exec('CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT \'\', ig_username TEXT DEFAULT \'\')');
  return db;
}
function ev(db, uid, evento, ts) {
  db.prepare('INSERT INTO oficina_nivel_eventos VALUES (?,?,?,?,?,?)').run(uid, 'posty', evento, evento, 'ev:' + evento + ':' + ts, ts);
}
function usuarioL50(db, uid) {
  ev(db, uid, 'fundamento_leido', MONDAY(2026, 8, 31));
  ev(db, uid, 'semana_generada', MONDAY(2026, 8, 31));
  ev(db, uid, 'decision_bandeja', MONDAY(2026, 8, 31));
  ev(db, uid, 'semana_aceptada', MONDAY(2026, 8, 31));
  for (let i = 0; i < 3; i++) ev(db, uid, 'pieza_aceptada_primera', MONDAY(2026, 8, 31) + i);
  for (let i = 0; i < 4; i++) ev(db, uid, 'semana_publicada', MONDAY(2026, 9, 7) + i * 7 * DAY);
  ev(db, uid, 'pregunta_respondida', MONDAY(2026, 9, 7));
  ev(db, uid, 'pregunta_respondida', MONDAY(2026, 9, 14));
  for (let i = 0; i < 30; i++) ev(db, uid, 'semana_publicada', NOW - i * 7 * DAY);
  for (let i = 0; i < 30; i++) ev(db, uid, 'decision_bandeja', MONDAY(2026, 8, 31) + i);
  for (let i = 0; i < 16; i++) ev(db, uid, 'pieza_aceptada_primera', MONDAY(2026, 8, 31) + i);
}

console.log('== 1. Códigos: forma, unicidad, mostrar, normalizar ==');
check('código: POSTY + 8 sin ambigüedad', (() => {
  for (let i = 0; i < 50; i++) {
    const c = PJ.semillaCodigoNuevo();
    if (!/^POSTY[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(c)) return false;
  }
  return true;
})());
check('códigos únicos en 200 mint', (() => {
  const s = new Set();
  for (let i = 0; i < 200; i++) s.add(PJ.semillaCodigoNuevo());
  return s.size === 200;
})());
check('mostrar con guiones', PJ.semillaMostrar('POSTYABCDEFGH') === 'POSTY-ABCD-EFGH');
check('normalizar: minúsculas, guiones y espacios', PJ.semillaNormalizar(' posty-abcd-efgh ') === 'POSTYABCDEFGH');
check('normalizar vacío', PJ.semillaNormalizar('') === '');

console.log('== 2. Migración: regalos viejos se conservan sin código ==');
{
  const db = freshDb();
  db.exec('CREATE TABLE jardin_semillas_regalo (user_id INTEGER NOT NULL, ts INTEGER NOT NULL)');
  db.prepare('INSERT INTO jardin_semillas_regalo VALUES (?,?)').run(GIVER, NOW - DAY);
  db.prepare('INSERT INTO jardin_semillas_regalo VALUES (?,?)').run(GIVER, NOW - 2 * DAY);
  PJ.semillasEnsure(db);
  const rows = db.prepare('SELECT user_id, ts, codigo FROM jardin_semillas_regalo ORDER BY ts ASC').all();
  check('migración conserva 2 filas', rows.length === 2);
  check('migración deja código NULL (no inventado)', rows.every((r) => r.codigo === null));
  const reg = PJ.semillaRegalar(db, GIVER, NOW);
  check('regalo nuevo tras migración lleva código', !!reg.codigo && reg.codigo.startsWith('POSTY'));
  const rows2 = db.prepare('SELECT codigo FROM jardin_semillas_regalo').all();
  check('viejos siguen NULL tras regalar', rows2.filter((r) => r.codigo === null).length === 2);
}

console.log('== 3. Canje feliz + registro durable + procedencia ==');
{
  const db = freshDb();
  db.prepare('INSERT INTO profiles VALUES (?,?,?)').run(GIVER, 'Café Aroma', '');
  const reg = PJ.semillaRegalar(db, GIVER, NOW);
  const r = PJ.semillaCanjear(db, REDEEMER, reg.codigo, NOW + 1000);
  check('canje ok', r.ok === true && r.giver_id === GIVER);
  check('canje no promete beneficio (sin niveles/descuentos/meses)', (() => {
    const keys = Object.keys(r).join(' ');
    return !/descuento|gratis|nivel|mes/.test(keys);
  })(), Object.keys(r).join(','));
  check('canje trae nombre del negocio dador', r.giver_negocio === 'Café Aroma');
  const gift = db.prepare('SELECT canje_ts, canje_user_id FROM jardin_semillas_regalo WHERE id = ?').get(reg.id);
  check('fila del regalo marca canje', gift.canje_user_id === REDEEMER && gift.canje_ts === NOW + 1000);
  const canje = db.prepare('SELECT giver_id, redeemer_id, ts FROM jardin_semillas_canje WHERE semilla_id = ?').get(reg.id);
  check('tabla canje: quién dio, quién canjeó, cuándo', !!canje && canje.giver_id === GIVER && canje.redeemer_id === REDEEMER && canje.ts === NOW + 1000);
  const mia = PJ.miSemilla(db, REDEEMER);
  check('miSemilla del canjeador', !!mia && mia.giver_negocio === 'Café Aroma' && mia.giver_id === GIVER);
  check('miSemilla null para quien no canjeó', PJ.miSemilla(db, OTRO) === null);
  check('canje acepta código con guiones y minúsculas', (() => {
    const reg2 = PJ.semillaRegalar(db, GIVER, NOW + 2000);
    const r2 = PJ.semillaCanjear(db, OTRO, PJ.semillaMostrar(reg2.codigo).toLowerCase(), NOW + 3000);
    return r2.ok === true;
  })());
}

console.log('== 4. Errores: sin doble canje, sin propia, sin segunda, sin falso ==');
{
  const db = freshDb();
  const reg = PJ.semillaRegalar(db, GIVER, NOW);
  check('código vacío → sin_codigo', PJ.semillaCanjear(db, REDEEMER, '   ', NOW).error === 'semilla_sin_codigo');
  check('código falso → no_existe', PJ.semillaCanjear(db, REDEEMER, 'POSTYZZZZZZZZ', NOW).error === 'semilla_no_existe');
  check('propia → propia', PJ.semillaCanjear(db, GIVER, reg.codigo, NOW).error === 'semilla_propia');
  check('primer canje ok', PJ.semillaCanjear(db, REDEEMER, reg.codigo, NOW).ok === true);
  check('doble canje → ya_canjeada', PJ.semillaCanjear(db, OTRO, reg.codigo, NOW).error === 'semilla_ya_canjeada');
  const reg2 = PJ.semillaRegalar(db, GIVER, NOW + 1000);
  check('segunda semilla mismo negocio → ya_tiene', PJ.semillaCanjear(db, REDEEMER, reg2.codigo, NOW).error === 'semilla_ya_tiene');
  check('regalo viejo sin código no se canjea por azar', (() => {
    db.exec('CREATE TABLE IF NOT EXISTS jardin_semillas_regalo_old (user_id INTEGER, ts INTEGER)');
    return PJ.semillaCanjear(db, OTRO, 'POSTYAAAAAAAA', NOW).error === 'semilla_no_existe';
  })());
}

console.log('== 5. Nombre del dador: negocio, @ig, null ==');
{
  const db = freshDb();
  db.prepare('INSERT INTO profiles VALUES (?,?,?)').run(11, '', 'cafearoma');
  db.prepare('INSERT INTO profiles VALUES (?,?,?)').run(12, '', '');
  check('fallback @ig', PJ.negocioNombre(db, 11) === '@cafearoma');
  check('sin nombre ni ig → null', PJ.negocioNombre(db, 12) === null);
  check('sin perfil → null', PJ.negocioNombre(db, 13) === null);
}

console.log('== 6. estadoPost50: lista del dador + miSemilla del canjeador ==');
{
  const db = freshDb();
  db.prepare('INSERT INTO profiles VALUES (?,?,?)').run(GIVER, 'Café Aroma', '');
  db.prepare('INSERT INTO profiles VALUES (?,?,?)').run(REDEEMER, 'Tienda Nueva', '');
  usuarioL50(db, GIVER);
  const reg = PJ.semillaRegalar(db, GIVER, NOW);
  const est0 = PJ.estadoPost50(db, GIVER, undefined, 'America/Argentina/Buenos_Aires', NOW);
  check('dador L50 completo', !!est0 && est0.completo === true);
  check('lista trae código y sin canjear', !!est0 && est0.semillas.length === 1 && est0.semillas[0].codigo === PJ.semillaMostrar(reg.codigo) && est0.semillas[0].canjeada === false);
  PJ.semillaCanjear(db, REDEEMER, reg.codigo, NOW + 5000);
  const est1 = PJ.estadoPost50(db, GIVER, undefined, 'America/Argentina/Buenos_Aires', NOW);
  check('lista tras canje: canjeada + negocio canjeador', !!est1 && est1.semillas[0].canjeada === true && est1.semillas[0].canje_negocio === 'Tienda Nueva');
  const estR = PJ.estadoPost50(db, REDEEMER, undefined, 'America/Argentina/Buenos_Aires', NOW);
  check('canjeador (nivel bajo) ve miSemilla', !!estR && !!estR.miSemilla && estR.miSemilla.giver_negocio === 'Café Aroma');
  const estN = PJ.estadoPost50(db, OTRO, undefined, 'America/Argentina/Buenos_Aires', NOW);
  check('sin canje: miSemilla null', !!estN && estN.miSemilla === null);
}

console.log('== 7. Estáticos: rutas, UI, M78, censo ==');
{
  const app = read('public/app.js');
  const srv = read('server.js');
  const css = read('public/styles.css');
  const pjSrc = read('postjardin.js');
  check('app: caja + función de canje', app.indexOf('mxSemillaCanjeHTML') >= 0 && app.indexOf('pzSemillaCanjear()') >= 0);
  check('app: endpoint canjear', app.indexOf("'/api/oficina/jardin-semilla-canjear'") >= 0);
  check('app: endpoint mi semilla', app.indexOf("'/api/oficina/jardin-semilla-mia'") >= 0);
  check('app: compartir lleva el código', app.indexOf('Canjeala con el código') >= 0);
  check('app: un solo input de código', count(app, 'id="pzSemillaCod"') === 1);
  check('M78: pzSemillaCanjear llamada desde botón', count(app, 'onclick="pzSemillaCanjear()"') === 1);
  check('server: rutas nuevas', srv.indexOf("'/api/oficina/jardin-semilla-canjear'") >= 0 && srv.indexOf("'/api/oficina/jardin-semilla-mia'") >= 0);
  check('server: regalo devuelve código', srv.indexOf('semillaRegalar') >= 0 && srv.indexOf('codigo: pj.semillaMostrar') >= 0);
  check('css: caja semilla', css.indexOf('.pz-semilla') >= 0);
  check('postjardin exporta lo nuevo', pjSrc.indexOf('semillaCanjear') >= 0 && pjSrc.indexOf('miSemilla') >= 0 && pjSrc.indexOf('semillaRegalar') >= 0);
  check('censo server intacto', count(srv, 'catsMatch') === 3 && count(srv, 'week-redo') === 16 && count(srv, 'first_week') === 3 && count(srv, '/aprobar') === 17);
  check('censo app intacto', count(app, 'pzGoBack') === 6 && count(app, 'pz-detalle-setup') === 1 && count(app, '/aprobar') === 1 && count(app, 'autofetch') === 0);
}

console.log('\nTOTAL: ' + ok + ' ok, ' + fail + ' fallos' + (fail ? ' :: ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
