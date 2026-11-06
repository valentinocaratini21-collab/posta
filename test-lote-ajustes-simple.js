// test-lote-ajustes-simple.js — LOTE AJUSTES-SIMPLE (6/11, decisión Valentino:
// Referidos arriba de todo en Ajustes; fuera «análisis»; Ajustes lo más simple
// posible: fuera «Compartir mi semana», «Cómo me ve la IA» y el pie Posty).
// Corre: node test-lote-ajustes-simple.js (sin node_modules: solo lee archivos
// y renderiza ajustesView en vm con stubs). Cero red, cero envíos.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const chunkSrc = fs.readFileSync(path.join(ROOT, 'public', 'chunk-ajustes.js'), 'utf8');
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

// ---------- 1. Fuente: orden y secciones ----------
const oRef = chunkSrc.indexOf('id="ajsec-referidos"');
const oNotif = chunkSrc.indexOf('id="ajsec-notif"');
const oNeg = chunkSrc.indexOf('id="ajsec-negocio"');
const oPlan = chunkSrc.indexOf('id="ajsec-plan"');
ok(oRef !== -1 && oRef < oNotif && oNotif < oNeg && oNeg < oPlan,
  'fuente: Referidos primera, Notificaciones, Negocio, Plan');
ok(chunkSrc.indexOf('id="ajsec-semana"') === -1, 'fuera: sección Compartir mi semana');
ok(chunkSrc.indexOf('id="ajsec-mas2-preview"') === -1, 'fuera: fila Cómo me ve la IA');
ok(chunkSrc.indexOf('id="ajsec-posty"') === -1, 'fuera: pie Posty · Community Manager');
ok(chunkSrc.indexOf('weekShareZone') === -1, 'fuera: weekShareZone');
ok(chunkSrc.indexOf('weekShareLoad') === -1, 'fuera: función weekShareLoad (muerta sin la sección)');
ok(chunkSrc.indexOf('ajStSemana') === -1, 'fuera: ajStSemana');
ok(chunkSrc.indexOf('data-ajmas=') === -1, 'fuera: filas Más (ajmas)');
ok(chunkSrc.indexOf('Posty · Community Manager') === -1, 'fuera: texto del pie Posty');

// ---------- 2. Fuente: Referidos sin gate de nativa ----------
const refSlice = chunkSrc.slice(Math.max(0, oRef - 200), oRef + 50);
ok(refSlice.indexOf('IS_NATIVE') === -1, 'Referidos sin gate IS_NATIVE (visible en web y nativa)');
ok(chunkSrc.indexOf("if (pq.get('semana'))") === -1, 'deep-link ?semana eliminado');
ok(chunkSrc.indexOf("if (pq.get('referidos')) return 'referidos'") !== -1, 'deep-link ?referidos sigue');
ok(chunkSrc.indexOf("if (pq.get('plan')) return 'plan'") !== -1, 'deep-link ?plan sigue');
ok(chunkSrc.indexOf("if (pq.get('ig')") !== -1, 'deep-link ?ig sigue');
const foldLine = chunkSrc.match(/const AJ_FOLDABLE = \[([^\]]*)\]/);
ok(foldLine && foldLine[1].indexOf('semana') === -1, 'AJ_FOLDABLE sin semana');
ok(foldLine && ['negocio', 'plan', 'auto', 'conex', 'marca', 'pagina'].every((s) => foldLine[1].indexOf(s) !== -1),
  'AJ_FOLDABLE conserva negocio/plan/auto/conex/marca/pagina');

// ---------- 3. Fuente: cero «análisis» en el chunk ----------
// La palabra no aparece ni en textos visibles ni en comentarios.
ok(!/análisis/i.test(chunkSrc), 'cero análisis/Análisis en chunk-ajustes.js');
ok(chunkSrc.indexOf('en Estrategia') !== -1, 'la carta ahora se lee en Estrategia (no en Tu análisis)');
ok((chunkSrc.match(/en Estrategia/g) || []).length === 5, 'Estrategia en los 5 textos de la carta');

// ---------- 4. Render real de ajustesView en vm (IS_NATIVE true y false) ----------
// Extrae ajustesView con la misma técnica que test-loteajustescompacto.js.
const aStart = chunkSrc.indexOf('function ajustesView() {');
const aEnd = chunkSrc.indexOf('// TikTok semanal', aStart);
assert.ok(aStart !== -1 && aEnd > aStart, 'ajustesView extraíble');
const viewSrc = chunkSrc.slice(aStart, aEnd);

function render(isNative, hash) {
  const sandbox = {
    console,
    URLSearchParams,
    IS_NATIVE: isNative,
    location: { hash: hash || '#/app/ajustes' },
    ME: { lang: 'es', plan: 'posty', is_trial: false },
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

for (const native of [false, true]) {
  const html = render(native);
  const iRef = html.indexOf('id="ajsec-referidos"');
  const iNotif = html.indexOf('id="ajsec-notif"');
  const iNeg = html.indexOf('id="ajsec-negocio"');
  const iPlan = html.indexOf('id="ajsec-plan"');
  ok(iRef !== -1, `render IS_NATIVE=${native}: Referidos presente`);
  ok(iRef < iNotif && iNotif < iNeg && iNeg < iPlan,
    `render IS_NATIVE=${native}: Referidos primera, Notificaciones, Negocio, Plan`);
  ok(html.indexOf('Referidos · 50% off') !== -1, `render IS_NATIVE=${native}: título Referidos`);
  ok(html.indexOf('id="refZone"') !== -1, `render IS_NATIVE=${native}: refZone presente`);
  ok(!/análisis/i.test(html), `render IS_NATIVE=${native}: cero análisis en el HTML`);
  ok(html.indexOf('id="ajsec-semana"') === -1, `render IS_NATIVE=${native}: sin sección semana`);
  ok(html.indexOf('id="ajsec-mas2-preview"') === -1, `render IS_NATIVE=${native}: sin fila preview`);
  ok(html.indexOf('id="ajsec-posty"') === -1, `render IS_NATIVE=${native}: sin pie Posty`);
  ok(html.indexOf('id="btnLogoutAj"') !== -1, `render IS_NATIVE=${native}: Salir sigue`);
  ok(html.indexOf('id="gzAjustesBox"') !== -1, `render IS_NATIVE=${native}: caja Gesty sigue`);
  ok(html.indexOf('id="ajsec-plan"') !== -1, `render IS_NATIVE=${native}: Mi plan sigue`);
}

// ---------- 5. Censo intacto ----------
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
