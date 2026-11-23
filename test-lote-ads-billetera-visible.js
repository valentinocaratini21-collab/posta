'use strict';
/* test-lote-ads-billetera-visible.js — LOTE ADS-BILLETERA-VISIBLE
 * (orden del dueño 22/11 22:15, con captura de su hoja «Impulsar
 * posteo con Ads»): «En esta pantalla en ningun lado aparece cuanto
 * tengo en la billetera. Corregir.»
 *
 * El caso: la hoja mostraba las opciones $50/$20/$100, la línea «Te
 * faltan $28 · cargalo acá mismo, sin ir a otra pantalla» y el botón
 * «Cargar $50 ahora» — pero en NINGÚN lado el saldo. El dato existía
 * (su billetera: US$22; 50 − 28 = 22) y el servidor ya calculaba el
 * faltante: la hoja nunca lo mostraba y el dueño tenía que adivinar
 * su saldo restando.
 *
 * El arreglo (solo public/app.js + 1 regla en public/styles.css):
 * pzBoostPintarBoost rinde, junto a las opciones y antes de la línea
 * del faltante, la línea del saldo — «Tenés $22 en tu billetera» /
 * "You have $22 in your wallet" — con la cifra de pzBoostSaldo(), la
 * MISMA función que alimenta el cálculo del faltante de la misma
 * hoja (una sola verdad). Sin billetera cargada, no se afirma ningún
 * número (la hoja se repinta con el dato real al llegar).
 *
 * §A estáticos · §B comportamiento en VM (funciones reales de app.js
 * con DOM mínimo): el caso del dueño sembrado (saldo 22, opciones
 * 20/50/100) en ES · §C el espejo EN · §D el riel MP (formato es-AR).
 * En la base prístina v1241 los checks del saldo FALLAN (la hoja no
 * muestra el saldo en ningún lado: es la captura del dueño) y los del
 * faltante pasan (ese comportamiento ya era correcto).
 * Uso: node test-lote-ads-billetera-visible.js — sale 0 si todo pasa.
 *   ABV_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TREE = path.resolve(process.env.ABV_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const count = (s, sub) => (s.split(sub).length - 1);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}

// ---------- §A: estáticos ----------
console.log('— §A: estáticos');
const appCode = stripComments(APP);
t(count(appCode, 'function pzBoostPintarBoost(') === 1, '§A: pzBoostPintarBoost existe ×1 (una sola hoja para ES y EN)');
t(count(appCode, 'pz-boost-3d3-saldo') === 1, '§A: la línea del saldo se rinde ×1 en la hoja', count(appCode, 'pz-boost-3d3-saldo'));
t(appCode.includes("'Tenés $' + pzBoostFmtMonto(saldo) + ' en tu billetera'"), '§A: copy ES del saldo con la cifra formateada');
t(appCode.includes("'You have $' + pzBoostFmtMonto(saldo) + ' in your wallet'"), '§A: copy EN del saldo (paridad)');
{
  const pintar = fnFrom(appCode, 'function pzBoostPintarBoost(');
  t(/const saldo = pzBoostSaldo\(\);/.test(pintar), '§A: la hoja lee el saldo de pzBoostSaldo()');
  t(/const falta = saldo < monto;/.test(pintar) && pintar.includes('pzBoostFmtMonto(monto - saldo)'),
    '§A: el faltante se calcula con ESE saldo (misma fuente, una sola verdad)');
  t(/s\.billetera\s*\?\s*`<div class="pz-boost-3d3-saldo">/.test(pintar),
    '§A: sin billetera cargada la línea no se rinde (no se afirma un número sin dato)');
}
t(count(CSS, '.pz-boost-3d3-saldo{') === 1, '§A: styles.css trae la regla .pz-boost-3d3-saldo ×1');

// ---------- §B/C/D: comportamiento en VM ----------
console.log('— §B: comportamiento (VM, funciones reales)');
const bodyEl = { innerHTML: '' };
const sandbox = {
  console, Set, Map,
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  ME: { lang: 'es' },
  document: { getElementById: (id) => (id === 'pzBoostBody' ? bodyEl : null) },
};
vm.createContext(sandbox);
const piezasNombres = ['gzT', 'pzBoostNewState', 'pzBoostSaldoUSD', 'pzBoostEsMP', 'pzBoostFmtMonto',
  'pzBoostMontos', 'pzBoostSaldo', 'pzBoostMinTopup', 'pzBoostMotivo', 'pzBoostGate', 'pzBoostTotal',
  'pzBoostPuede', 'pzBoostImpulsarMonto', 'pzBoostNumerosComa', 'pzBoostKey', 'pzBoostPintarBoost'];
let piezas = '', faltan = [];
for (const n of piezasNombres) {
  // Las async se extraen con su prefijo (sin él, el await interno no compila).
  const f = fnFrom(appCode, 'async function ' + n + '(') || fnFrom(appCode, 'function ' + n + '(');
  if (!f) faltan.push(n); else piezas += f + '\n';
}
t(faltan.length === 0, '§B: las piezas de la hoja extraen enteras del bundle', faltan.join(','));
const enVM = (expr) => vm.runInContext(expr, sandbox);
if (!faltan.length) {
  enVM('let pzBoostState = null; let pzBoostImpulsados = new Set(); let __confirmar = [];');
  enVM(piezas);
  enVM('pzBoostConfirmar = async (btn) => { __confirmar.push(pzBoostState.selMonto); };');
  const POST = "{ post_id: 744, ig_media_id: 'ig744', image_path: '/m/744.jpg', caption: 'Esto es Posty: tus community managers.', reach: 0, likes: 0, comments: 0, saves: 0, recomendado: false, ya_impulsado: false, publicado_en: '2026-11-22' }";
  const seed = (bil, monto) => enVM(`pzBoostState = { elegibles: [], billetera: ${JSON.stringify(bil)}, adsReady: true, motivoGate: '', connectUrl: '', conexion: null, rielAds: '', boostHabilitado: true, adsPermiso: true, conversionPendiente: false, selId: 'p744', selMonto: ${monto}, selPost: ${POST}, montosAbierto: false }; __confirmar = [];`);
  const pintar = () => { enVM('pzBoostPintarBoost()'); return bodyEl.innerHTML; };
  const BIL22 = { balance_cents: 2200, currency: 'USD', billing_provider: 'stripe' };

  // B1 — el caso del dueño: saldo 22, opción $50 seleccionada.
  seed(BIL22, 50);
  let h = pintar();
  t(h.includes('Tenés $22 en tu billetera'), '§B1: la hoja muestra el saldo — «Tenés $22 en tu billetera»', h.slice(0, 200));
  t(h.includes('pz-boost-3d3-saldo'), '§B1: la línea del saldo va con su clase propia');
  t(h.indexOf('pz-boost-3d3-saldo') > h.indexOf('pz-boost-3d3-montos') && h.indexOf('pz-boost-3d3-saldo') < h.indexOf('pz-boost-warn'),
    '§B1: el saldo se ve junto a las opciones, antes del faltante (sin scrollear)');
  t(h.includes('Te faltan $28 · cargalo acá mismo, sin ir a otra pantalla.'), '§B1: faltante de la opción $50 = $28 (como la captura)');
  t(h.includes('Cargar $50 ahora'), '§B1: el botón carga el monto de la opción ($50)');

  // B2 — cambiar la opción recomputa en el acto: $100.
  returnMain().catch((e) => { console.log('ERROR de suite:', e); process.exit(2); });
  async function returnMain() {
    await enVM('pzBoostImpulsarMonto(100, null)');
    h = bodyEl.innerHTML;
    t(h.includes('Te faltan $78'), '§B2: opción $100 → faltante $78 recomputado en el acto', h.slice(0, 200));
    t(h.includes('Cargar $100 ahora'), '§B2: opción $100 → el botón pasa a «Cargar $100 ahora»');
    t(h.includes('Tenés $22 en tu billetera'), '§B2: el saldo sigue a la vista tras cambiar de opción');
    t(enVM('__confirmar.length') === 0, '§B2: sin saldo para $100, el toque NO impulsa (repinta con el aviso)');

    // B3 — opción cubierta ($20 con saldo 22): sin faltante, sin
    // Cargar, y el toque impulsa (llega a pzBoostConfirmar).
    seed(BIL22, 20);
    h = pintar();
    t(!h.includes('Te faltan'), '§B3: opción $20 cubierta → no hay línea de faltante');
    t(!h.includes('pzBoostCargar') && !h.includes('Cargar $'), '§B3: opción cubierta → no hay botón de cargar');
    t(h.includes('Tenés $22 en tu billetera'), '§B3: el saldo se muestra también con la opción cubierta');
    await enVM('pzBoostImpulsarMonto(20, null)');
    t(enVM('__confirmar.join(",")') === '20', '§B3: el toque en la opción cubierta impulsa (llega a confirmar)');

    // B4 — falta total: saldo 0.
    seed({ balance_cents: 0, currency: 'USD', billing_provider: 'stripe' }, 50);
    h = pintar();
    t(h.includes('Tenés $0 en tu billetera'), '§B4: saldo 0 → la hoja lo dice («Tenés $0 en tu billetera»)');
    t(h.includes('Te faltan $50') && h.includes('Cargar $50 ahora'), '§B4: falta total → faltante entero y camino de carga');

    // B5 — una sola verdad: si el saldo cambia, saldo y faltante se
    // mueven juntos (35 → faltante 15 con la opción $50).
    seed({ balance_cents: 3500, currency: 'USD', billing_provider: 'stripe' }, 50);
    h = pintar();
    t(h.includes('Tenés $35 en tu billetera') && h.includes('Te faltan $15'),
      '§B5: saldo y faltante salen de la misma fuente (35 → faltan 15)');

    // B6 — sin billetera cargada no se afirma ningún número.
    seed(null, 50);
    h = pintar();
    t(!h.includes('pz-boost-3d3-saldo') && !h.includes('en tu billetera'),
      '§B6: sin el dato de la billetera, la hoja no inventa un saldo');

    // ---------- §C: espejo EN ----------
    console.log('— §C: espejo EN');
    enVM("ME.lang = 'en'");
    seed(BIL22, 50);
    h = pintar();
    t(h.includes('You have $22 in your wallet'), '§C: EN muestra el saldo — "You have $22 in your wallet"');
    t(h.includes('You’re $28 short') && h.includes('Top up $50 now'), '§C: EN conserva su faltante y su botón');
    seed(BIL22, 20);
    h = pintar();
    t(!h.includes('short') && h.includes('You have $22 in your wallet'), '§C: EN con la opción cubierta: saldo sí, faltante no');
    enVM("ME.lang = 'es'");

    // ---------- §D: riel MP ----------
    console.log('— §D: riel MP');
    seed({ balance_cents: 1500000, currency: 'ARS', billing_provider: 'mp', presupuestos_ars: [5000, 10000, 20000] }, 10000);
    h = pintar();
    t(h.includes('Tenés $15.000 en tu billetera'), '§D: MP muestra el saldo con su formato ($15.000)', h.slice(0, 200));
    t(!h.includes('Te faltan'), '§D: MP con saldo de sobra → sin faltante');

    console.log(`\n${pass} ok · ${fail} MAL`);
    if (fails.length) console.log('Fallan:', fails.join(' | '));
    process.exit(fail ? 1 : 0);
  }
} else {
  console.log(`\n${pass} ok · ${fail} MAL`);
  process.exit(1);
}
