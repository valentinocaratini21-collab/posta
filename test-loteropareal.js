#!/usr/bin/env node
/* Test LOTE ROPA-REAL (2026-11-02). Uso:
 *   node work/test-loteropareal.js [app.js] [styles.css]
 * Por defecto: work/public/app.js + work/public/styles.css (arbol parchado).
 * Control negativo: pasar el app.js PRISTINO (v554 servido, sin parche) y su
 * styles.css: los asserts de render realista DEBEN fallar (prueba que el test
 * es sensible al fix), mientras las reglas puras siguen pasando.
 * No toca red, DOM ni localStorage real: extrae las funciones reales del
 * app.js indicado y las corre en vm con stubs minimos.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname);
const APP = process.argv[2] || path.join(ROOT, 'public/app.js');
const CSS = process.argv[3] || path.join(ROOT, 'public/styles.css');
const src = fs.readFileSync(APP, 'utf-8');
const css = fs.readFileSync(CSS, 'utf-8');

function extract(name, kind) {
  // kind: 'function' -> function name(...) {...} con balance de llaves
  //       'var' -> let/const name = ...; (para PZ_ROPA: hasta '];')
  let i;
  if (kind === 'function') {
    i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('no encontrada function ' + name);
  } else if (kind === 'array') {
    i = src.indexOf(name + ' = [');
    if (i < 0) throw new Error('no encontrado ' + name);
    const j = src.indexOf('];', i);
    return src.slice(i, j + 2);
  } else if (kind === 'let') {
    i = src.indexOf('let ' + name + ' =');
    if (i < 0) throw new Error('no encontrado let ' + name);
    const j = src.indexOf(';', i);
    return src.slice(i, j + 1);
  }
  let j = src.indexOf('{', i);
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('sin cierre en ' + name);
}

const parts = [
  extract('PZ_ROPA', 'array'),
  extract('PZ_ROPA_NIVEL', 'let'),
  extract('pzRopaPorNivel', 'function'),
  extract('pzRopaPorId', 'function'),
  extract('pzRopaNombre', 'function'),
  extract('pzRopaClave', 'function'),
  extract('pzRopaSelVacio', 'function'),
  extract('pzRopaSel', 'function'),
  extract('pzRopaSelToggle', 'function'),
  extract('pzRopaAvatarHTML', 'function'),
  extract('pzRopaListaHTML', 'function'),
];
// esc real si existe; si no, stub minimo (no afecta los asserts de ropa)
let escSrc = '';
try { escSrc = extract('esc', 'function'); }
catch (e) { escSrc = 'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");}'; }

const store = {};
const sandbox = {
  ME: {},
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  },
  console,
};
vm.createContext(sandbox);
vm.runInContext(parts.join('\n') + '\n' + escSrc, sandbox);
const setSel = (o) => { store['posta-guardarropa'] = JSON.stringify(o); };

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ok -', msg); }
  else { fail++; console.log('  FALLO -', msg); }
}

console.log('== ROPA-REAL: avatar compone desde PNG (no SVG) ==');
setSel({ sombrero: 1, anteojos: 2, cuello: null, extra: null, conjunto: null, corona: null });
let h = vm.runInContext('pzRopaAvatarHTML()', sandbox);
ok(h.includes('ropa/ropa-01.png'), 'gorra 01 como PNG');
ok(h.includes('ropa/ropa-02.png'), 'anteojos 02 como PNG');
ok(!h.includes('<svg'), 'avatar sin <svg');
ok(h.includes('ai-avatar.png'), 'cara canonica presente');
ok((h.match(/pz-ropa-spark/g) || []).length === 4, '4 chispas intactas');

console.log('== ROPA-REAL: conjunto = un solo PNG ==');
setSel({ sombrero: 1, anteojos: 2, cuello: 3, extra: 4, conjunto: 6, corona: null });
h = vm.runInContext('pzRopaAvatarHTML()', sandbox);
ok(h.includes('ropa/ropa-06.png'), 'conjunto 06 como PNG');
ok(!h.includes('ropa/ropa-01.png') && !h.includes('ropa/ropa-02.png') && !h.includes('ropa/ropa-03.png'),
   'conjunto tapa prendas (ninguna single en el HTML)');

console.log('== ROPA-REAL: sin prendas = solo cara ==');
setSel({});
h = vm.runInContext('pzRopaAvatarHTML()', sandbox);
ok(!h.includes('ropa/ropa-'), 'sin prendas no hay img de ropa');
ok(h.includes('ai-avatar.png'), 'cara sola presente');

console.log('== ROPA-REAL: orden de apilado ==');
setSel({ sombrero: 1, anteojos: 2, cuello: 3, extra: 4, conjunto: null, corona: 50 });
h = vm.runInContext('pzRopaAvatarHTML()', sandbox);
const orden = ['ropa-03.png', 'ropa-02.png', 'ropa-01.png', 'ropa-50.png', 'ropa-04.png'];
const pos = orden.map((s) => h.indexOf(s));
ok(pos.every((p) => p >= 0) && pos.every((p, i) => i === 0 || p > pos[i - 1]),
   'orden cuello, anteojos, sombrero, corona, extra');

console.log('== ROPA-REAL: lista nivel 2 (desbloqueadas PNG, bloqueadas candado) ==');
let li = vm.runInContext('pzRopaListaHTML(2)', sandbox);
ok(li.includes('ropa/ropa-01-mini.png') && li.includes('ropa/ropa-02-mini.png'), '01 y 02 con mini PNG');
ok(!li.includes('ropa/ropa-03-mini.png'), '03 bloqueada sin mini');
ok(li.includes('🔒'), 'bloqueadas con candado');
ok(li.includes('¡Nuevo!'), 'nivel actual marca ¡Nuevo!');

console.log('== ROPA-REAL: lista nivel 50 (todas con mini) ==');
li = vm.runInContext('pzRopaListaHTML(50)', sandbox);
let todas = true;
for (let n = 1; n <= 50; n++) {
  if (!li.includes('ropa/ropa-' + String(n).padStart(2, '0') + '-mini.png')) { todas = false; break; }
}
ok(todas, 'las 50 con su -mini.png');
ok(!li.includes('🔒'), 'nivel 50 sin candados');

console.log('== ROPA-REAL: reglas puras intactas ==');
const T = (sel, nv) => vm.runInContext(
  `pzRopaSelToggle(${JSON.stringify(sel)}, pzRopaPorId(${nv}))`, sandbox);
let s = T({ sombrero: null, anteojos: null, cuello: null, extra: null, conjunto: null, corona: null }, 6);
ok(s.conjunto === 6, 'conjunto se pone');
s = T({ sombrero: 1, anteojos: 2, cuello: null, extra: null, conjunto: 6, corona: null }, 3);
ok(s.conjunto === null && s.cuello === 3, 'prenda destapa conjunto');
s = T({ sombrero: 1, anteojos: null, cuello: null, extra: null, conjunto: null, corona: null }, 50);
ok(s.corona === 50 && s.sombrero === null, 'corona comparte cabeza (tapa sombrero)');
s = T({ sombrero: null, anteojos: null, cuello: null, extra: null, conjunto: null, corona: 50 }, 1);
ok(s.sombrero === 1 && s.corona === null, 'sombrero destapa corona');
s = T({ sombrero: 1, anteojos: null, cuello: null, extra: null, conjunto: null, corona: null }, 1);
ok(s.sombrero === null, 'segundo toque quita la prenda');

console.log('== ROPA-REAL: avatar canonico byte-identico ==');
const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, 'public/ai-avatar.png'))).digest('hex');
ok(md5 === 'd40b13eb69b3eda598ba75366f25506a', 'ai-avatar.png md5 d40b13eb... (sin regenerar)');

console.log('== ROPA-REAL: los 50 assets existen y son PNG ==');
let assetsOk = true;
for (let n = 1; n <= 50; n++) {
  const nn = String(n).padStart(2, '0');
  for (const f of [`public/ropa/ropa-${nn}.png`, `public/ropa/ropa-${nn}-mini.png`]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) { assetsOk = false; console.log('  falta', f); break; }
    const b = fs.readFileSync(p);
    if (b.length < 100 || b[0] !== 0x89 || b[1] !== 0x50) { assetsOk = false; console.log('  no-PNG', f); break; }
  }
}
ok(assetsOk, '50 ropa-NN.png + 50 ropa-NN-mini.png validos');

console.log('== ROPA-REAL: CSS nuevo ==');
ok(css.includes('.pz-ropa-capa-img{'), 'CSS .pz-ropa-capa-img presente');
ok(!css.includes('.pz-ropa-capa{'), 'CSS .pz-ropa-capa viejo ausente');
ok(css.includes('.pz-ropa-mini img{'), 'CSS .pz-ropa-mini img presente');

console.log(`\nROPA-REAL: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
