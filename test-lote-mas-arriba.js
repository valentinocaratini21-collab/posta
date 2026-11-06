// test-lote-mas-arriba.js — LOTE MAS-ARRIBA (base v723).
// Decisión Valentino 6/11 ~16:11 (con captura del feed, dock ya en vivo
// con v722): «el simbolo de + de agregar hay que subirlo un poquito mas,
// que quede a la misma altura que los otros iconos!». El + se veía ~2px
// más BAJO que los otros 4 iconos del dock de 5 — SOLO en la shell bb
// (la app nativa, que es la que Valentino ve en su teléfono); en la
// shell mz ya estaba alineado.
// Causa raíz (medida con Chromium Playwright, HTML real de las dos
// shells, 390 y 360 — script measure-mas.py en el scratch del lote):
//  1) .bb-tab-ic era un span en línea: el svg de 24px se apoyaba en la
//     línea base y el puntal (strut) dejaba ~3px vacíos debajo, así la
//     caja medía ~27px y la tinta quedaba 1,5px arriba de su centro; y
//  2) el botón del + (círculo exacto de 24px) era ~2px más bajo que los
//     botones de ícono, y con align-items:flex-end en .bb-bar su círculo
//     quedaba 0,66px más bajo. Total: el + 2,16px más bajo.
//  El glifo + NO era la causa: en Chromium está centrado en su círculo
//  (centro del glifo = centro del círculo), así que no se toca el glifo.
// Fix (solo styles.css, 2 cambios, sin tocar app.js):
//  A) .bb-tab-ic es caja flex de 24px como .mz-tab-ic (el mismo
//     tratamiento que la Pieza 2 del 3/11 le dio a mz y que nunca se
//     hizo en bb): display:flex;align-items:center;justify-content:center;
//     height:24px. Los 5 botones miden lo mismo y las 5 cajas de ícono
//     arrancan a la misma altura.
//  B) .bb-tab-mas-lb pasa de line-height:1.35 a line-height:normal:
//     la etiqueta del + medía 14,85px mientras las demás etiquetas bb
//     usan normal (14px) — el botón del + era 0,84px más alto y su
//     círculo quedaba 0,84px por encima. Con normal, las 5 etiquetas
//     miden lo mismo. NO poner 1.35 aquí: el botón .bb-tab-mas sí lleva
//     1.35 !important y se hereda si se quita esta línea. (En mz la
//     etiqueta del + SÍ lleva 1.35 porque allí las demás también usan
//     1.35 — .mz-tab —, así que mz no se toca.)
// Medición DESPUÉS (Chromium, 390 y 360, las dos shells): delta 0,00px
// en las 4 combinaciones (mz: tinta 21,00 vs 21,00; bb: tinta 25,00 vs
// 25,00). Antes: mz 0,00px, bb +2,16px. Capturas antes/después en el
// scratch (mas-390-before/after.png, mas-360-before/after.png).
// Node puro: asserts estáticos + modelo geométrico derivado del CSS
// (los términos que fijan el centro son idénticos entre el + y los
// demás, así que el delta es 0 sin depender del navegador).
// Uso: node test-lote-mas-arriba.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
// Todas las reglas de un selector (puede haber varias), concatenadas.
const rules = (sel) => {
  const re = new RegExp('\\.' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}', 'g');
  return (css.match(re) || []).join(' ');
};
const has = (body, prop) => new RegExp(prop + '\\s*:').test(body);

(async () => {
  // ---------- 1. Censo (sin cambio) + base v723, re-pineo preparador v727 ----------
  t(srv.includes("const BUILD_ID = '20261105-v728'"), 'server: BUILD v728'); // re-pin re-base v728 sobre v727 (era v724)
  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
  t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
  t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
  t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
  t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
  t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
  t(app.includes("const CHUNK_V = '20261105-v723'"), 'CHUNK_V v723 (sin cambio)');
  t(md5(app) === 'fb6d3f801b555a0f343f1448c335cab9', 'app.js md5 v727 (sin tocar)');
  t(md5(css) === '1ab1e38c5985f589df399bca8fea4c53', 'styles.css md5 (lote mas-arriba, re-base v728 sobre v727)');

  // ---------- 2. Causa A: .bb-tab-ic es caja flex de 24px, como .mz-tab-ic ----------
  const bbIc = rules('bb-tab-ic');
  t(!!bbIc, 'bb-tab-ic: regla presente');
  t(/display:flex/.test(bbIc), 'bb-tab-ic: display:flex (el svg ya no se apoya en la línea base)');
  t(/align-items:center/.test(bbIc), 'bb-tab-ic: align-items:center');
  t(/justify-content:center/.test(bbIc), 'bb-tab-ic: justify-content:center');
  t(/height:24px/.test(bbIc), 'bb-tab-ic: height:24px (misma caja que el círculo del +)');
  t(!/display:block/.test(bbIc), 'bb-tab-ic: sin display:block (el strut ya no existe)');
  const mzIc = rules('mz-tab-ic');
  t(/display:flex/.test(mzIc) && /height:24px/.test(mzIc), 'mz-tab-ic: sigue en flex de 24px (sin cambio)');
  t(!/display:block;/.test(mzIc.replace(/display:block;margin-bottom:2px/, '')), 'mz-tab-ic: sin resto de display:block');

  // ---------- 3. Causa B: la etiqueta del + bb usa normal, como las demás ----------
  const bbLb = rules('bb-tab-mas-lb');
  t(/line-height:normal/.test(bbLb), 'bb-tab-mas-lb: line-height:normal (igual que las demás etiquetas bb)');
  t(!/line-height:1\.35/.test(bbLb), 'bb-tab-mas-lb: sin line-height:1.35 (era 0,84px más alta)');
  const bbTab = rules('bb-tab');
  t(!has(bbTab, 'line-height'), 'bb-tab: sin line-height propio (las etiquetas regulares heredan normal)');
  const mzLb = rules('mz-tab-mas-lb');
  t(/line-height:1\.35/.test(mzLb), 'mz-tab-mas-lb: sigue en 1.35 (en mz las demás también usan 1.35, sin cambio)');
  const mzTab = rules('mz-tab');
  t(/line-height:1\.35/.test(mzTab), 'mz-tab: sigue en 1.35 (consistente con su etiqueta Agregar)');

  // ---------- 4. Modelo geométrico: los términos del centro son idénticos ----------
  // bb: botón flex column, align-items:flex-end en .bb-bar → todos los
  // botones apoyan abajo; el centro del ícono (relativo al botón) es
  // padding-top + alturaDeÍcono/2. Si padding-top y altura son iguales,
  // los centros coinciden. La etiqueta no entra en el centro del ícono,
  // pero su altura fija la altura del botón: si una etiqueta midiera
  // distinto, ese botón mediría distinto y su ícono quedaría desplazado
  // (eso era el residuo de 0,84px de la causa B).
  // Los valores se PARSEAN del CSS (no se hardcodean): en el árbol
  // prístino este modelo falla porque .bb-tab-ic no existe.
  const px = (body, re) => { const m = body.match(re); return m ? parseFloat(m[1]) : NaN; };
  const bbMasBtn = rules('bb-tab-mas');
  const bbMasIc = rules('bb-tab-mas-ic');
  const mzMasBtn = rules('mz-tab-mas');
  const mzMasIc = rules('mz-tab-mas-ic');
  const bbPadReg = px(bbTab, /padding:(\d+(?:\.\d+)?)px/);
  const bbPadMas = px(bbMasBtn, /padding:(\d+(?:\.\d+)?)px/);
  t(bbPadReg === bbPadMas && bbPadReg === 4, 'bb: padding-top 4px igual en el botón regular y en el del +');
  t(/gap:2px/.test(bbTab) && /gap:2px !important/.test(bbMasBtn), 'bb: gap 2px igual en ambos botones');
  const bbIcH = px(bbIc, /height:(\d+(?:\.\d+)?)px/);
  const bbMasIcH = px(bbMasIc, /height:(\d+(?:\.\d+)?)px/);
  t(bbIcH === 24 && bbMasIcH === 24, 'bb: caja de ícono 24px igual en el regular y en el círculo del +');
  const bbOffReg = bbPadReg + bbIcH / 2;
  const bbOffMas = bbPadMas + bbMasIcH / 2;
  t(bbOffReg === bbOffMas && bbOffReg === 16, 'bb: centro del ícono a 16px del borde superior en ambos botones (medido: 25 − 9 = 16)');
  t(!/transform|translateY|margin-top/.test(bbMasIc), 'bb: el + no se mueve con translateY ni márgenes (fix estructural, no parche)');
  t(!/transform|translateY/.test(bbMasBtn), 'bb: el botón del + no lleva transform');
  // mz: mismo modelo (padding 2px 0, ícono 24px, margen inferior 2px).
  const mzPadReg = px(mzTab, /padding:(\d+(?:\.\d+)?)px/);
  const mzPadMas = px(mzMasBtn, /padding:(\d+(?:\.\d+)?)px/);
  t(mzPadReg === mzPadMas && mzPadReg === 2, 'mz: padding-top 2px igual en el botón regular y en el del +');
  const mzIcH = px(mzIc, /height:(\d+(?:\.\d+)?)px/);
  const mzMasIcH = px(mzMasIc, /height:(\d+(?:\.\d+)?)px/);
  t(mzIcH === 24 && mzMasIcH === 24, 'mz: caja de ícono 24px igual en el regular y en el círculo del +');
  t(/margin:0 auto 2px/.test(mzMasIc) && /margin-bottom:2px/.test(mzIc), 'mz: margen inferior 2px igual en el ícono regular y en el del +');
  const mzOffReg = mzPadReg + mzIcH / 2;
  const mzOffMas = mzPadMas + mzMasIcH / 2;
  t(mzOffReg === mzOffMas && mzOffReg === 14, 'mz: centro del ícono a 14px del borde superior en ambos botones (medido: 21 − 7 = 14)');
  // Delta del modelo: con términos idénticos, centro(+) − centro(otros) = 0.
  t(bbOffMas - bbOffReg === 0 && mzOffMas - mzOffReg === 0, 'modelo: delta del + vs los otros 4 íconos = 0,00px en las dos shells (medido con Chromium: 0,00px a 390 y 360)');

  // ---------- 5. Lo que NO cambió: círculo, color, peso, orden, app.js ----------
  for (const cls of ['mz-tab-mas-ic', 'bb-tab-mas-ic']) {
    const m = css.match(new RegExp('\\.' + cls + '\\{[^}]*\\}'));
    t(!!m, cls + ': regla presente');
    if (m) {
      t(/border-radius:50%/.test(m[0]), cls + ': círculo (border-radius 50%)');
      t(/width:24px;height:24px/.test(m[0]), cls + ': círculo de 24px');
      t(/background:rgba\(255,255,255,\.55\)/.test(m[0]), cls + ': fondo vidrio');
      t(/border:1px solid rgba\(255,255,255,\.75\)/.test(m[0]), cls + ': borde del círculo');
      t(/box-shadow:0 0 0 1px rgba\(39,147,200,\.35\)/.test(m[0]), cls + ': anillo Posty');
      t(/color:#47617A/.test(m[0]), cls + ': glifo + #47617A, como los otros íconos');
      t(/font-size:20px/.test(m[0]), cls + ': glifo a 20px (sin cambio)');
      t(/line-height:1/.test(m[0]), cls + ': glifo con line-height:1 (sin cambio)');
    }
  }
  t(/\.bb-tab-mas-lb\{[^}]*font-weight:400/.test(css), 'bb: etiqueta Agregar en 400, como las inactivas');
  t(/\.bb-tab-mas-lb\{[^}]*color:#47617A/.test(css), 'bb: etiqueta Agregar #47617A');
  t(/\.mz-tab-mas-lb\{[^}]*font-weight:700/.test(css), 'mz: etiqueta Agregar en 700, como las demás etiquetas mz');
  t(/\.mz-tab-mas-lb\{[^}]*color:#47617A/.test(css), 'mz: etiqueta Agregar #47617A');
  const orderOk = (s, keys) => {
    let prev = -1;
    for (const k of keys) { const i = s.indexOf(k, prev + 1); if (i === -1 || i < prev) return false; prev = i; }
    return true;
  };
  const bbNav = (app.split('\n').find((l) => l.includes("'<nav class=\"bb-bar\">'")) || '');
  t(orderOk(bbNav, ["tabBtn('inicio'", "tabBtn('ads'", "pzDockMasBtn('bb')", "tabBtn('analisis'", "tabBtn('jardin'"]), 'bb-bar: orden Inicio, Ads, +, Estrategia, Premios (sin cambio)');
  t(!bbNav.includes("tabBtn('ajustes'"), 'bb-bar: sin tab Ajustes (sin cambio)');
  const mzFn = app.slice(app.indexOf('function mzTabsHTML(tab) {'), app.indexOf('\n/* (LOTE DOCK-MAS) */'));
  t(orderOk(mzFn, ["t('inicio'", "t('ads'", "pzDockMasBtn('mz')", "t('analisis'", "t('jardin'"]), 'mz-tabs: orden Inicio, Ads, +, Estrategia, Premios (sin cambio)');

  console.log(`\ntest-lote-mas-arriba: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
