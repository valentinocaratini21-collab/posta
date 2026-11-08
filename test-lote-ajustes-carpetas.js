// test-lote-ajustes-carpetas.js — LOTE AJUSTES-EN-CARPETAS (7/11, pedido de Valentino:
// «siento que en ajustes esta todo muy amontonado. podemos hacer como los
// ajustes de instagram que esta todo en carpetas separadas?»).
// Ajustes pasa a ser un MENÚ estilo Instagram: una lista de filas agrupadas
// por tema; cada fila abre su sección en su propia pantalla (con botón ‹
// para volver). Ninguna opción se saca y ninguna función cambia — solo la
// presentación. El botón «Más ajustes» y su desplegable salen; las secciones
// plegables salen; la navegación es por hash (#/app/ajustes?plan=1, ...).
// Corre: node test-lote-ajustes-carpetas.js (sin node_modules: solo lee
// archivos y renderiza ajustesView en vm con stubs). Cero red, cero envíos.
// Contra prístino: los asserts del fix fallan; los de no-regresión pasan.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const chunkSrc = fs.readFileSync(path.join(ROOT, 'public', 'chunk-ajustes.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

let n = 0;
function ok(cond, label) {
  n++;
  assert.ok(cond, label);
  console.log('ok ' + n + ' - ' + label);
}
function countLines(src, sub) {
  return src.split('\n').filter((l) => l.indexOf(sub) !== -1).length;
}

// ---------- 1. Menú presente: 9 filas en orden, agrupadas por tema ----------
const MENU = ['referidos', 'notif', 'negocio', 'plan', 'auto', 'conex', 'marca', 'pagina', 'avanzado'];
for (const s of MENU) ok(chunkSrc.indexOf('data-ajnav="' + s + '"') !== -1, 'fila del menú: ' + s);
const mPos = MENU.map((s) => chunkSrc.indexOf('data-ajnav="' + s + '"'));
ok(mPos.every((p, k) => k === 0 || p > mPos[k - 1]), 'filas del menú en orden: Referidos primero');
ok(chunkSrc.indexOf('id="ajMenu"') !== -1, 'contenedor del menú (#ajMenu)');
ok(chunkSrc.indexOf('id="ajDetail"') !== -1, 'contenedor del detalle (#ajDetail)');
ok(chunkSrc.indexOf('id="ajBackBtn"') !== -1, 'botón ‹ para volver al menú');
ok(chunkSrc.indexOf('Referidos · 50% off') !== -1, 'Referidos primera fila, arriba de todo');
ok(chunkSrc.indexOf('Notificaciones') !== -1, 'Notificaciones segunda fila');
for (const h of ['Principal', 'Tu negocio', 'Posty', 'Tu marca', 'Más']) ok(chunkSrc.indexOf(h) !== -1, 'grupo del menú: ' + h);
ok(chunkSrc.indexOf('id="ajStAvisosMenu"') !== -1, 'resumen de Notificaciones en el menú');
ok(chunkSrc.indexOf('id="ajStAutoMenu"') !== -1, 'resumen de Automático en el menú');

// ---------- 2. Detalle: las 9 secciones, en orden, una sola vez cada una ----------
for (const s of MENU) {
  ok(chunkSrc.indexOf('id="ajsec-' + s + '"') !== -1, 'sección de detalle: ' + s);
  ok((chunkSrc.match(new RegExp('id="ajsec-' + s + '"', 'g')) || []).length === 1, 'sección ' + s + ' una sola vez');
}
const dPos = MENU.map((s) => chunkSrc.indexOf('id="ajsec-' + s + '"'));
ok(dPos.every((p, k) => k === 0 || p > dPos[k - 1]), 'secciones de detalle en orden');
ok(chunkSrc.indexOf('id="btnLogoutAj"') !== -1, 'Salir sigue (fila del menú)');
ok(chunkSrc.indexOf('id="gzAjustesBox"') !== -1, 'caja Gesty sigue');
ok(chunkSrc.indexOf('id="refZone"') !== -1, 'refZone sigue');
ok(chunkSrc.indexOf('id="ajsec-plan"') !== -1, 'Mi plan sigue');

// ---------- 3. Fuera el sistema viejo: botón Más, wrap, pliegue, localStorage ----------
for (const s of ['id="btnAjMas2"', 'id="ajsec-mas2"', 'id="ajsec-mas2-wrap"', 'pzAjMas2Mostrar', 'pzAjMas2Toggle',
  'ajFoldKey', 'ajFoldSave', 'ajFoldLoad', 'ajFoldSet', 'ajFoldCurrentOpen', 'posta-ajustes-carpetas',
  'ajfold-closed', 'ajfold-open']) ok(chunkSrc.indexOf(s) === -1, 'fuera: ' + s);

// ---------- 4. Navegación: ajNav + compat ajFold* + deep-links por hash ----------
ok((chunkSrc.match(/function ajNav\(/g) || []).length === 1, 'ajNav definida 1 vez');
ok(chunkSrc.indexOf('function ajFoldAbrir(id) { ajNav(id); }') !== -1, 'ajFoldAbrir delega en ajNav');
ok((chunkSrc.match(/function ajFoldAbrir\(/g) || []).length === 1, 'ajFoldAbrir definida 1 vez');
ok(chunkSrc.indexOf('function ajFoldInit() {}') !== -1, 'ajFoldInit queda como no-op');
const foldLine = chunkSrc.match(/const AJ_FOLDABLE = \[([^\]]*)\]/);
ok(foldLine && ['negocio', 'plan', 'auto', 'conex', 'marca', 'pagina'].every((s) => foldLine[1].indexOf(s) !== -1), 'AJ_FOLDABLE intacto');
ok(chunkSrc.indexOf("if (pq.get('referidos')) return 'referidos'") !== -1, 'deep-link ?referidos sigue');
ok(chunkSrc.indexOf("if (pq.get('plan')) return 'plan'") !== -1, 'deep-link ?plan sigue');
ok(chunkSrc.indexOf("if (pq.get('plan_sel')) return 'plan'") !== -1, 'deep-link ?plan_sel aterriza en Mi plan (nuevo)');
ok(chunkSrc.indexOf("if (pq.get('ig')") !== -1, 'deep-link ?ig sigue');
ok(chunkSrc.indexOf("if (pq.get('conex')) return 'conex'") !== -1, 'deep-link ?conex (nuevo, fila del menú)');
ok(chunkSrc.indexOf("if (pq.get('negocio')) return 'negocio'") !== -1, 'deep-link ?negocio (nuevo, fila del menú)');
ok(chunkSrc.indexOf("if (pq.get('avanzado')) return 'avanzado'") !== -1, 'deep-link ?avanzado (nuevo, fila del menú)');
ok(chunkSrc.indexOf("location.hash = '#/app/ajustes'") !== -1, 'botón ‹ vuelve al menú por hash');
ok(chunkSrc.indexOf("location.hash = '#/app/ajustes?' + b.dataset.ajnav + '=1'") !== -1, 'filas del menú navegan por hash');
ok(chunkSrc.indexOf('ajFoldAbrir(ajDeep)') !== -1, 'bindSettings abre el deep-link');
ok(appSrc.indexOf("ajFoldAbrir('plan')") !== -1, 'app.js sigue abriendo Mi plan tras pagar');

// ---------- 5. CSS del menú ----------
for (const s of ['.ajmenu-row{', '.ajmenu-h{', '.ajmenu-ico{', '.ajmenu-t{', '.ajmenu-s{', '.ajmenu-chev{', '.ajback{']) ok(cssSrc.indexOf(s) !== -1, 'CSS menú: ' + s);
ok(cssSrc.indexOf('.card.ajsec.ajflat.ajfold-closed') === -1, 'CSS de carpetas plegables eliminado');
ok(cssSrc.indexOf('.ajfold-chev') === -1, 'CSS de flecha de carpeta eliminado');

// ---------- 6. Espejo EN ----------
for (const s of ["'Referrals · 50% off'", "'Notifications'", "'Your business'", "'My plan'", "'Posty on autopilot'", "'Connections'", "'Your brand'", "'Your page'", "'Advanced settings'", "'Log out'", "'Main'", "'More'"]) ok(chunkSrc.indexOf(s) !== -1, 'EN menú: ' + s);

// ---------- 7. Cero análisis; Estrategia intacta ----------
ok(!/análisis/i.test(chunkSrc), 'cero análisis en el chunk');
ok((chunkSrc.match(/en Estrategia/g) || []).length === 5, 'Estrategia en los 5 textos de la carta');

// ---------- 8. Render real de ajustesView en vm: menú, detalle y deep-link ----------
const aStart = chunkSrc.indexOf('function ajustesView() {');
const aEnd = chunkSrc.indexOf('// TikTok semanal', aStart);
assert.ok(aStart !== -1 && aEnd > aStart, 'ajustesView extraíble');
const viewSrc = chunkSrc.slice(aStart, aEnd);

function render(isNative, hash, lang) {
  const sandbox = {
    console,
    URLSearchParams,
    IS_NATIVE: isNative,
    location: { hash: hash || '#/app/ajustes' },
    ME: { lang: lang || 'es', plan: 'posty', is_trial: false },
    PROFILE: {
      ig_username: 'test', ig_connected: true, business_name: 'Test',
      category: 'otro', tone: '', goal: '', monthly_goal: '', description: '',
      page_slug: 'test', whatsapp: '', page_enabled: 1,
    },
    SETTINGS: { ig_token_warning: false, timezone: 'America/New_York', demo_mode: false },
    pzIc: () => '',
    esc: (v) => String(v == null ? '' : v),
    brandColors: () => [],
    assetLogo: () => null,
    igSince: () => '',
    IG_VERIFIED_AT: '',
    IG_MODE_WARN: false,
    CATS: [], catSel: () => 'otro', catCustom: () => '',
    TONES: [], GOALS: [], TIMEZONES: [],
    NEUTRAL_TRIO: ['#111111', '#222222', '#333333'],
  };
  vm.createContext(sandbox);
  vm.runInContext(viewSrc + '\nthis.__html = ajustesView();', sandbox);
  return sandbox.__html;
}

for (const lang of ['es', 'en']) {
  const html = render(false, '#/app/ajustes', lang);
  ok(html.indexOf('<div id="ajMenu">') !== -1, `render ${lang}: menú visible`);
  ok(html.indexOf('<div id="ajDetail" hidden>') !== -1, `render ${lang}: detalle oculto`);
  const rPos = MENU.map((s) => html.indexOf('data-ajnav="' + s + '"'));
  ok(rPos.every((p) => p !== -1) && rPos.every((p, k) => k === 0 || p > rPos[k - 1]), `render ${lang}: 9 filas del menú en orden`);
  ok(html.indexOf('id="btnLogoutAj"') !== -1, `render ${lang}: Salir en el menú`);
  ok(html.indexOf('id="refZone"') !== -1, `render ${lang}: refZone presente`);
  ok(html.indexOf('id="gzAjustesBox"') !== -1, `render ${lang}: caja Gesty presente`);
  ok(html.indexOf('<div class="card ajsec ajflat" id="ajsec-referidos">') !== -1, `render ${lang}: Referidos sin hidden (menú abierto)`);
  const htmlRef = render(false, '#/app/ajustes?referidos=1', lang);
  ok(htmlRef.indexOf('<div id="ajMenu" hidden>') !== -1, `render ${lang} ?referidos=1: menú oculto`);
  ok(htmlRef.indexOf('<div id="ajDetail">') !== -1, `render ${lang} ?referidos=1: detalle visible`);
  ok(htmlRef.indexOf('<div class="card ajsec ajflat" id="ajsec-referidos">') !== -1, `render ${lang} ?referidos=1: Referidos visible`);
  ok(htmlRef.indexOf('<div class="card ajsec ajflat" hidden id="ajsec-notif">') !== -1, `render ${lang} ?referidos=1: resto oculto`);
  const htmlPlan = render(false, '#/app/ajustes?plan=1', lang);
  ok(htmlPlan.indexOf('<div class="card ajsec ajflat" id="ajsec-plan">') !== -1, `render ${lang} ?plan=1: Mi plan visible`);
  ok(htmlPlan.indexOf('<div class="card ajsec ajflat" hidden id="ajsec-referidos">') !== -1, `render ${lang} ?plan=1: resto oculto`);
  const htmlAv = render(false, '#/app/ajustes?avanzado=1', lang);
  ok(htmlAv.indexOf('<details class="card int-advanced" id="ajsec-avanzado" open>') !== -1, `render ${lang} ?avanzado=1: avanzada abierta`);
}

// ---------- 9. Censo intacto ----------
assert.strictEqual(countLines(appSrc, 'pzGoBack'), 6, 'censo app pzGoBack 6');
assert.strictEqual(countLines(appSrc, 'pz-detalle-setup'), 1, 'censo app pz-detalle-setup 1');
assert.strictEqual(countLines(appSrc, 'pcDayKeyShift'), 6, 'censo app pcDayKeyShift 6');
assert.strictEqual(countLines(appSrc, 'autofetch'), 0, 'censo app autofetch 0');
assert.strictEqual(countLines(appSrc, '/aprobar'), 1, 'censo app /aprobar 1');
assert.strictEqual((serverSrc.match(/catsMatch/g) || []).length, 3, 'censo server catsMatch 3');
assert.strictEqual((serverSrc.match(/week-redo/g) || []).length, 16, 'censo server week-redo 16');
assert.strictEqual((serverSrc.match(/first_week/g) || []).length, 3, 'censo server first_week 3');
assert.strictEqual(countLines(serverSrc, '/aprobar'), 17, 'censo server /aprobar 17');
n += 9;
console.log('ok - censo intacto: 9 pines');

console.log('TOTAL ' + n + ' asserts');
