// test-loteajustessimple.js — LOTE AJUSTES-SIMPLE (2/11, aprobado por Valentino).
// Corre: node test-loteajustessimple.js  (desde la raíz del repo, sin node_modules:
// solo lee archivos y evalúa el helper puro con vm).
// Cero red, cero envíos, cero datos reales.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const chunkSrc = fs.readFileSync(path.join(ROOT, 'public', 'chunk-ajustes.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

let n = 0;
function ok(cond, label) {
  n++;
  assert.ok(cond, label);
  console.log('ok ' + n + ' - ' + label);
}
function idx(s, sub) {
  const i = s.indexOf(sub);
  assert.ok(i !== -1, 'falta: ' + sub);
  return i;
}
function countLines(src, sub) {
  return src.split('\n').filter((l) => l.indexOf(sub) !== -1).length;
}

// ---------- 1. Orden de tarjetas: Referidos primero, Más tras Mi plan ----------
// SUPERSEDED (lote ajustes-simple-2, decisión Valentino 2/11): visibles solo
// Notificaciones, Tu negocio, Mi plan; el resto queda detrás de un solo
// botón «Más ajustes» que revela el bloque. El menú «Más» viejo ya no existe.
// ACTUALIZADO (lote ajustes-simple 6/11, decisión Valentino «Referidos arriba
// de todo»): Referidos es la PRIMERA tarjeta, siempre visible (web y nativa);
// «Compartir mi semana» y el pie Posty salen de Ajustes.
const oNotif = idx(chunkSrc, 'id="ajsec-notif"');
const oNeg = idx(chunkSrc, 'id="ajsec-negocio"');
const oAuto = idx(chunkSrc, 'id="ajsec-auto"');
const oPlan = idx(chunkSrc, 'id="ajsec-plan"');
const oMas2 = idx(chunkSrc, 'id="ajsec-mas2"');
const oWrap = idx(chunkSrc, 'id="ajsec-mas2-wrap"');
const oConex = idx(chunkSrc, 'id="ajsec-conex"');
const oMarca = idx(chunkSrc, 'id="ajsec-marca"');
const oPag = idx(chunkSrc, 'id="ajsec-pagina"');
const oRef = idx(chunkSrc, 'id="ajsec-referidos"');
ok(oRef < oNotif && oNotif < oNeg && oNeg < oPlan, 'orden visible: Referidos primero, Notificaciones, Negocio, Plan');
ok(oPlan < oMas2 && oMas2 < oWrap && oWrap < oAuto, 'Más ajustes tras Mi plan; resto detrás del bloque');
ok(oAuto < oConex && oConex < oMarca && oMarca < oPag, 'secundarias en orden: Automático, Conexiones, Marca, Página');
ok(chunkSrc.indexOf('id="ajsec-notif"') !== -1, 'tarjeta Notificaciones existe');

// ---------- 2. Sin acordeones ----------
ok(chunkSrc.indexOf('openSec') === -1, 'sin openSec en el chunk');
ok(chunkSrc.indexOf('role="button"') === -1, 'sin role=button en el chunk');
ok(chunkSrc.indexOf('<span class="ajsec-c">⌄</span>') === -1, 'sin chevrons de acordeón');
ok(chunkSrc.indexOf("class=\"card ajsec ajflat\"") !== -1, 'tarjetas con clase ajflat');
ok(cssSrc.indexOf('.card.ajsec.ajflat>.ajsec-b{display:block}') !== -1, 'CSS: ajflat siempre visible');
ok(cssSrc.indexOf('.card.ajsec.ajflat>.ajsec-h{cursor:default') !== -1, 'CSS: header plano sin cursor pointer');

// ---------- 3. Filas Más ----------
// SUPERSEDED (lote ajustes-simple-2, decisión Valentino 2/11): el menú viejo
// se reemplaza por un solo botón; solo la fila preview sobrevive como fila.
// ELIMINADO (lote ajustes-simple 6/11, decisión Valentino «lo más simple
// posible»): la fila «Cómo me ve la IA» sale de Ajustes; la Vista previa
// vive en Tu negocio (btnPreview) y no necesita atajo.
ok(chunkSrc.indexOf('data-ajmas=') === -1, 'sin filas Más: preview eliminado');
ok(chunkSrc.indexOf("$$('.ajmas-row')") === -1, 'sin handler de filas Más');
ok(chunkSrc.indexOf("getElementById('btnPreview')") === -1, 'sin atajo IA a Vista previa');
ok(chunkSrc.indexOf('id="btnAjMas2"') !== -1, 'botón único Más ajustes');
ok(chunkSrc.indexOf('id="ajsec-mas2-wrap" hidden') !== -1, 'bloque Más nace oculto');
ok(chunkSrc.indexOf('ajDeepSec') !== -1, 'deep-link scrollea (ajDeepSec)');
ok(chunkSrc.indexOf("pq.get('avisos')) return 'notif'") !== -1, 'deep-link avisos -> notif');

// ---------- 4. Nada eliminado: ids y controles viejos siguen ----------
// ACTUALIZADO (lote ajustes-simple 6/11): fuera weekShareZone y ajStSemana
// (sección «Compartir mi semana» eliminada) y styleGallery (el div no existe
// en v721; el loader styleGalleryLoad hace guarda null — preexistente).
for (const id of ['btnPushEnable', 'btnPreNotifyToggle', 'btnLetterToggle', 'btnFailToggle',
  'btnWaNotifyToggle', 'btnSaveProfile', 'btnSaveBrand', 'btnSavePage', 'btnCopyPage',
  'btnLogoutAj', 'btnPreview', 'planZone', 'founderZone', 'refZone',
  'ttZone', 'ggZone', 'tnZone', 'brandPrev', 'brandPf', 'igMsg',
  'ajStAvisos', 'ajStAuto', 's_waNotify', 's_slug', 's_whats', 's_pageon']) {
  ok(chunkSrc.indexOf('id="' + id + '"') !== -1, 'id viejo presente: ' + id);
}
ok(chunkSrc.indexOf('Configuración avanzada') !== -1, 'Configuración avanzada intacta');
ok(chunkSrc.indexOf('id="gzAjustesBox"') !== -1, 'caja Gesty intacta');

// ---------- 5. Botón push: visible arriba, cableado intacto, lógica nativa ----------
ok(idx(chunkSrc, 'id="btnPushEnable"') > oNotif && idx(chunkSrc, 'id="btnPushEnable"') < oNeg, 'botón push dentro de Notificaciones (arriba)');
ok(chunkSrc.indexOf("btnPushEnable") !== -1 && chunkSrc.indexOf('pushEnableFlow()') !== -1 && chunkSrc.indexOf('await loadNotifyPrefs()') !== -1, 'botón llama a pushEnableFlow y re-carga prefs (compat lotepush)');
ok(chunkSrc.indexOf("r.has_push_sub ? 'none' : ''") === -1, 'fuera la lógica vieja has_push_sub esconde-botón');
ok(chunkSrc.indexOf('ajPushNativeOn(r)') !== -1, 'visibilidad usa ajPushNativeOn');
ok(chunkSrc.indexOf("if (off0) off0.style.display = ''; if (on0) on0.style.display = 'none'; return;") !== -1, 'fail-open: si fallan los prefs, botón visible');
ok(chunkSrc.indexOf('id="ajPushOff"') !== -1 && chunkSrc.indexOf('id="ajPushOn"') !== -1, 'estados off/on del push');

// ---------- 6. Servidor distingue nativa ----------
ok(serverSrc.indexOf("transport IN ('apns', 'fcm')") !== -1, 'servidor filtra transport apns/fcm');
ok(serverSrc.indexOf('has_native_push_sub: nativeSubs > 0') !== -1, 'servidor devuelve has_native_push_sub');
ok(serverSrc.indexOf('has_push_sub: subs > 0') !== -1, 'servidor conserva has_push_sub');

// ---------- 7. Espejo EN ----------
for (const s of ["'Notifications'", "'Activate notifications'", "'More settings'", "'Notifications on in your phone.'"]) {
  ok(chunkSrc.indexOf(s) !== -1, 'EN presente: ' + s);
}

// ---------- 8. Helper puro en vm: web NO esconde el botón nativo ----------
const m = chunkSrc.match(/function ajPushNativeOn\(r\) \{[\s\S]*?\n\}/);
assert.ok(m, 'helper ajPushNativeOn extraíble');
const sb = { console };
vm.createContext(sb);
vm.runInContext(m[0] + '\nthis.__f = ajPushNativeOn;', sb);
const f = sb.__f;
assert.strictEqual(f({ has_native_push_sub: true }), true, 'nativa true -> true');
assert.strictEqual(f({ has_native_push_sub: false }), false, 'nativa false -> false');
assert.strictEqual(f({ has_push_sub: true }), false, 'solo web (sin campo nativo) -> false: NO esconde el botón');
assert.strictEqual(f({}), false, 'sin campos -> false');
assert.strictEqual(f(null), false, 'null -> false');
assert.strictEqual(f({ has_native_push_sub: 'yes' }), false, 'no booleano -> false');
n += 6;
console.log('ok - helper ajPushNativeOn: 6 casos');

// ---------- 9. Censo intacto (app.js y server.js no pierden marcadores) ----------
// PIN ROTADO (liberación ajustes-simple-2, causa: censo v589 real 6, no 4 de v559; chats v566 sumaron llamadores; el lote no toca pzGoBack).
assert.strictEqual(countLines(appSrc, 'pzGoBack'), 6, 'censo app pzGoBack 6');
assert.strictEqual(countLines(appSrc, 'pz-detalle-setup'), 1, 'censo app pz-detalle-setup 1');
// PIN ROTADO (lote ajustes-simple 6/11: pcDayKeyShift real en v721 es 6, no 7).
assert.strictEqual(countLines(appSrc, 'pcDayKeyShift'), 6, 'censo app pcDayKeyShift 6');
assert.strictEqual(countLines(appSrc, 'autofetch'), 0, 'censo app autofetch 0');
assert.strictEqual(countLines(appSrc, '/aprobar'), 1, 'censo app /aprobar 1');
assert.strictEqual((serverSrc.match(/catsMatch/g) || []).length, 3, 'censo server catsMatch 3');
assert.strictEqual((serverSrc.match(/week-redo/g) || []).length, 16, 'censo server week-redo 16');
assert.strictEqual((serverSrc.match(/first_week/g) || []).length, 3, 'censo server first_week 3');
// PIN ROTADO (liberación ajustes-simple-2, causa: censo v589 real 17, no 16 de v559; espejo v582 sumó la ruta; el lote no toca /aprobar).
assert.strictEqual(countLines(serverSrc, '/aprobar'), 17, 'censo server /aprobar 17');
n += 9;
console.log('ok - censo intacto: 9 pines');

console.log('TOTAL ' + n + ' asserts');
