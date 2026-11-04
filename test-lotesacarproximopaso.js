#!/usr/bin/env node
/* Lote SACAR-PROXIMO-PASO — test sobre el CÓDIGO REAL de chunk-analisis.js.
 * 1) Estático: 0 llamados a anaNextStepMount(); helpers intactos (tests
 *    viejos siguen pasando); diff vs base = solo los 2 sitios; resto de
 *    Estrategia intacto (carta, impulsar, números, aprende, fundamento).
 * 2) Conductual: se extraen las funciones REALES anaLoad, anaBackCurrent y
 *    anaNextStepMount y se ejecutan con stubs. Tras anaLoad y tras
 *    anaBackCurrent NO se inserta ningún #anaNextStep, pero carta,
 *    impulsar, números y magia SÍ se cargan. Control: anaNextStepMount
 *    real SÍ insertaría #anaNextStep si se la llamara (la quita es en el
 *    llamado, no un mount roto).
 * Se corre en ES y en EN (el montaje era incondicional; ambas ramas deben
 * quedar sin tarjeta).
 */
const fs = require('fs');
const path = require('path');

const SCRATCH = path.dirname(path.resolve(__filename));
const WORK = path.join(SCRATCH, 'work', 'public', 'chunk-analisis.js');
const BASE = path.join(SCRATCH, 'work-base', 'public', 'chunk-analisis.js');
const src = fs.readFileSync(WORK, 'utf8');
const base = fs.readFileSync(BASE, 'utf8');

let pass = 0, fail = 0;
function t(nombre, cond) {
  if (cond) { pass++; console.log('PASS ' + nombre); }
  else { fail++; console.log('FAIL ' + nombre); }
}

// ---------- 1) Estático ----------
const llamados = (src.match(/^\s*anaNextStepMount\(\);$/gm) || []).length;
t('0 llamados a anaNextStepMount() como sentencia', llamados === 0);
for (const fn of ['anaNextStepPendientes', 'anaNextStepElegir', 'anaNextStepHTML',
  'anaNextStepIrInicio', 'anaNextStepIrImpulsar', 'anaNextStepMount', 'anaNextStepLoad']) {
  t('helper intacto: ' + fn, new RegExp('function ' + fn + '\\(').test(src));
}
const lineasSrc = src.split('\n'), lineasBase = base.split('\n');
let dif = 0;
const maxLen = Math.max(lineasSrc.length, lineasBase.length);
for (let i = 0; i < maxLen; i++) if (lineasSrc[i] !== lineasBase[i]) dif++;
t('diff vs base = 2 líneas (los 2 sitios)', dif === 2);
for (const pieza of ['function anaCartaHTML(', 'anaBoostRecLoad', 'anaWeekNumsLoad',
  'anaMagiaEntrada', 'anaAprendeHTML', 'anaFlConfirmLoad', 'anaSaludoTop',
  'anaBoostRec', 'anaWeekNumsTiles']) {
  t('Estrategia intacta: ' + pieza, src.includes(pieza));
}
t('card strings solo dentro del helper sin llamado (Próximo paso presente)',
  src.includes("anaT('Próximo paso', 'Next step')"));
t('comentario de trazabilidad en ambos sitios',
  (src.match(/SACAR-PROXIMO-PASO 4\/11/g) || []).length === 2);

// ---------- 2) Conductual: extraer funciones reales ----------
function extraer(nombre) {
  const ia = src.indexOf('async function ' + nombre + '(');
  const ip = src.indexOf('function ' + nombre + '(');
  let start = -1;
  if (ia >= 0 && (ip < 0 || ia <= ip)) start = ia;
  else start = ip;
  if (start < 0) throw new Error('no se encontró ' + nombre);
  const abre = src.indexOf('{', start);
  let depth = 0, k = abre, ch = null;
  for (; k < src.length; k++) {
    const c = src[k];
    if (ch) {
      if (c === '\\') { k++; continue; }
      if (c === ch) ch = null;
    } else if (c === "'" || c === '"' || c === '`') ch = c;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, k + 1);
}

const codigo = [extraer('anaLoad'), extraer('anaBackCurrent'), extraer('anaNextStepMount')].join('\n');
t('anaLoad real ya no referencia NextStep',
  !/NextStep/.test(extraer('anaLoad')));
t('anaBackCurrent real ya no referencia NextStep',
  !/NextStep/.test(extraer('anaBackCurrent')));

async function correr(lang) {
  const insertados = [];
  const llamadosStub = { carta: 0, boost: 0, nums: 0, magia: 0 };
  const rootEl = {
    _html: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    insertAdjacentHTML(pos, html) { insertados.push(html); },
  };
  const sandbox = {
    document: { getElementById: (id) => (id === 'anaRoot' ? rootEl : null) },
    window: { scrollTo: () => {} },
    api: {
      get: async () => ({ ok: true, analysis: {} }),
      post: async () => ({ ok: true, analysis: {} }),
    },
    anaCartaHTML: () => { llamadosStub.carta++; return '<div class="ana-card ana-letter">CARTA</div>'; },
    anaBoostRecLoad: () => { llamadosStub.boost++; },
    anaWeekNumsLoad: () => { llamadosStub.nums++; },
    anaMagiaEntrada: () => { llamadosStub.magia++; },
    anaPastMode: false,
    anaLastPayload: { ok: true, analysis: {} },
  };
  const vm = require('vm');
  const ctx = vm.createContext(sandbox);
  vm.runInContext(codigo, ctx);
  // anaLoad(false)
  await vm.runInContext('anaLoad(false)', ctx);
  t('[' + lang + '] anaLoad: carta renderizada', rootEl._html.includes('CARTA'));
  t('[' + lang + '] anaLoad: NO inserta #anaNextStep',
    !insertados.some((h) => h.includes('anaNextStep')));
  t('[' + lang + '] anaLoad: impulsar/números/magia intactos',
    llamadosStub.boost === 1 && llamadosStub.nums === 1 && llamadosStub.magia === 1);
  // anaBackCurrent()
  rootEl._html = ''; insertados.length = 0;
  llamadosStub.carta = 0; llamadosStub.boost = 0; llamadosStub.nums = 0;
  await vm.runInContext('anaBackCurrent()', ctx);
  t('[' + lang + '] anaBackCurrent: carta renderizada', rootEl._html.includes('CARTA'));
  t('[' + lang + '] anaBackCurrent: NO inserta #anaNextStep',
    !insertados.some((h) => h.includes('anaNextStep')));
  t('[' + lang + '] anaBackCurrent: impulsar/números intactos',
    llamadosStub.boost === 1 && llamadosStub.nums === 1);
  // Control: el mount real SÍ insertaría la tarjeta si se lo llamara
  insertados.length = 0;
  await vm.runInContext('anaNextStepMount()', ctx);
  t('[' + lang + '] control: mount real insertaría #anaNextStep (la quita es en el llamado)',
    insertados.some((h) => h.includes('id="anaNextStep"')));
}

(async () => {
  await correr('es');
  await correr('en');
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
