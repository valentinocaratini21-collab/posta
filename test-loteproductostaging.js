// LOTE STAGING DE PRODUCTO — test sin IA real (cero gasto).
// Cubre: (1) varias escenas distintas que combinan (estilo + paleta del
// producto dentro del prompt, nunca escena genérica); (2) producto intacto
// (fidelity en el prompt + gate en el servidor, nunca foto cruda como
// escena); (3) gate mueble-para-vender del carrusel; (4) refinamiento 2/11:
// el carrusel se arma SOLO con las escenas elegidas, en el orden elegido,
// y con 0 elegidas no hay carrusel ni borrador; (5) sin OK no hay posteo
// ni programación (borrador en revisión, scheduled_at nunca seteado);
// (6) sin visión no se inventa escena (analizar exige producto + estilo).
// Uso: node test-loteproductostaging.js [LOTE_TREE=dir-del-árbol]
// Por defecto lee server.js/db.js/app.js del mismo dir del test.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const st = require('./product-staging');

const TREE = process.env.LOTE_TREE || __dirname;
const read = (p) => fs.readFileSync(path.join(TREE, p), 'utf8');
const serverJs = read('server.js');
const dbJs = read('db.js');
const appJs = read('public/app.js');

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n++; assert.strictEqual(a, b, msg); };

// ---------- 1. Varias escenas, distintas entre sí, que combinan ----------
const escenas = st.escenasPara('escenas');
eq(escenas.length, st.STAGING_OPCIONES, 'escenas sueltas = 3 opciones');
eq(new Set(escenas.map((e) => e.id)).size, 3, 'las 3 escenas son distintas');
const carrusel = st.escenasPara('carrusel');
eq(carrusel.length, st.STAGING_CARRUSEL, 'carrusel = 5 escenas');
eq(new Set(carrusel.map((e) => e.id)).size, 5, 'las 5 escenas del carrusel son distintas');
const estilo = 'minimal frío, tela gris, patas negras de metal';
const paleta = 'gris, negro, cemento';
const prompt = st.buildScenePrompt({
  fidelityClause: 'FIDELITY-CLAUSE', producto: 'sillón gris de tela',
  estilo, paleta, scene: escenas[0].scene,
});
ok(prompt.includes('sillón gris de tela'), 'el prompt nombra el producto real');
ok(prompt.includes('NEW room'), 'el prompt pide cuarto NUEVO, nunca el original');
ok(prompt.includes('FIDELITY-CLAUSE'), 'el prompt lleva la cláusula de fidelidad');
ok(prompt.includes('untouched'), 'el prompt prohíbe tocar el producto');
ok(st.escenaCombina(prompt, estilo, paleta), 'la escena combina: lleva estilo + paleta');
ok(!st.escenaCombina('a cozy living room, beige rug, wooden floor', estilo, paleta),
  'una escena genérica (living cálido beige) NO combina con el sillón gris');
// Cada escena del carrusel combina con el mismo producto.
for (const esc of carrusel) {
  const p = st.buildScenePrompt({ fidelityClause: 'FIDELITY-CLAUSE', producto: 'sillón gris de tela', estilo, paleta, scene: esc.scene });
  ok(st.escenaCombina(p, estilo, paleta), `la escena ${esc.id} combina`);
  ok(p.includes('THAT EXACT product'), `la escena ${esc.id} exige el producto exacto`);
}

// ---------- 2. Gate mueble-para-vender ----------
ok(st.esMuebleVenta({ es_mueble_venta: true }) === true, 'mueble para vender = carrusel permitido');
ok(st.esMuebleVenta({ es_mueble_venta: false }) === false, 'no-mueble = sin carrusel');
ok(st.esMuebleVenta({}) === false, 'sin nota = sin carrusel (no se inventa)');
ok(st.esMuebleVenta(null) === false, 'sin nota (null) = sin carrusel');
ok(st.esMuebleVenta({ es_mueble_venta: 'true' }) === false, 'string "true" no es true estricto');

// ---------- 3. Refinamiento: carrusel = solo las elegidas, en orden ----------
const paths4 = ['/media/a.jpg', '/media/b.jpg', '/media/c.jpg', '/media/d.jpg'];
let arm = st.armarCarrusel(paths4, [2, 0]);
eq(JSON.stringify(arm.paths), JSON.stringify(['/media/c.jpg', '/media/a.jpg']),
  'elegir 2 de 4 → exactamente esas 2, en el orden elegido');
ok(!arm.error, 'elegir 2 de 4 no da error');
arm = st.armarCarrusel(paths4, []);
eq(arm.error, 'sin_elegidas', 'elegir 0 → sin carrusel');
ok(!arm.paths, 'elegir 0 → no hay paths, no hay borrador que armar');
arm = st.armarCarrusel(paths4, [1, 1, 0]);
eq(JSON.stringify(arm.paths), JSON.stringify(['/media/b.jpg', '/media/a.jpg']),
  'índice repetido queda en su primera aparición');
arm = st.armarCarrusel(paths4, [9]);
eq(arm.error, 'indice_fuera', 'índice fuera de rango = error, nunca escena inventada');
arm = st.armarCarrusel(paths4, 'x');
eq(arm.error, 'sin_elegidas', 'sin lista de elegidas = sin carrusel');
arm = st.armarCarrusel(['/media/solo.jpg'], [0]);
eq(JSON.stringify(arm.paths), JSON.stringify(['/media/solo.jpg']), '1 elegida de 1 = carrusel de 1');

// ---------- 4. Costo con freno ----------
eq(st.costoEstimadoUsd(3), 0.189, '3 escenas ≈ USD 0.19');
eq(st.costoEstimadoUsd(5), 0.315, 'carrusel de 5 ≈ USD 0.32');

// ---------- 5. Cableado en el servidor (estático) ----------
ok(serverJs.includes('/api/staging/analizar'), 'existe endpoint analizar');
ok(serverJs.includes('/api/staging/generar'), 'existe endpoint generar');
ok(serverJs.includes('/api/staging/elegir'), 'existe endpoint elegir');
ok(serverJs.includes("require('./product-staging')"), 'server requiere el módulo');
ok(serverJs.includes('staging_sesiones'), 'server usa la tabla staging_sesiones');
ok(serverJs.includes('fidelityGate'), 'generar pasa por fidelityGate');
ok(serverJs.includes('product-staging'), 'generar loguea costo con feature product-staging');
ok(serverJs.includes("formato === 'carrusel' && !ses.es_mueble_venta"),
  'carrusel exige mueble para vender en el servidor');
ok(serverJs.includes('armarCarrusel'), 'elegir usa armarCarrusel (solo elegidas, en orden)');
ok(serverJs.includes("needs_review, source, tipo, strategy_why) VALUES (?,?,?,'','draft'"),
  'elegir inserta borrador en revisión');
ok(serverJs.includes("carousel_paths"), 'elegir carrusel guarda carousel_paths');
ok(serverJs.includes("media_type, carousel_paths, needs_review"),
  'el insert de carrusel lleva media_type carousel + needs_review');
// La sección de staging nunca programa: scheduled_at no aparece en ella.
const sec = serverJs.slice(serverJs.indexOf('LOTE STAGING DE PRODUCTO'), serverJs.indexOf('Motor de imágenes nivel agencia'));
ok(sec.length > 1000, 'la sección staging existe y es sustancial');
ok(!sec.includes('scheduled_at'), 'ningún insert de staging programa fecha (nunca se programa solo)');
ok(sec.includes('assertAiOk'), 'generar respeta el techo mensual de IA');
ok(sec.includes('checkRate'), 'generar respeta el rate diario');
ok(sec.includes('No se pudo leer el estilo del producto'), 'sin visión no se inventa estilo');
ok(sec.includes('Elegí al menos una escena'), 'con 0 elegidas el servidor no arma carrusel');
// ---------- 6. Tabla en db.js ----------
ok(dbJs.includes('CREATE TABLE IF NOT EXISTS staging_sesiones'), 'db crea staging_sesiones');
ok(dbJs.includes('es_mueble_venta'), 'la tabla guarda es_mueble_venta');
ok(dbJs.includes('carrusel_json'), 'la tabla guarda carrusel_json');
ok(dbJs.includes('elegida'), 'la tabla marca la sesión elegida (una sola vez)');
// ---------- 7. UI: herramienta Escenas + corazones ----------
ok(appJs.includes('mcEscenasUI'), 'existe mcEscenasUI');
ok(appJs.includes("['escenas', pzIc('image'"), 'la herramienta Escenas está en la tira del álbum');
ok(appJs.includes("if (k === 'escenas') return mcEscenasUI();"), 'la herramienta llama a mcEscenasUI');
ok(appJs.includes("pzIc('heart'"), 'el carrusel usa corazón para aprobar por toque');
ok(appJs.includes('/api/staging/elegir'), 'la UI llama a elegir');
ok(appJs.includes("carrusel: true, escenas: orden"), 'la UI manda solo las elegidas, en orden');
ok(appJs.includes('Elegí al menos una escena'), 'la UI frena con 0 elegidas antes de llamar');
// ---------- 8. Magia de Posty en cada escena nueva (regla 2/11) ----------
const stylesCss = read('public/styles.css');
ok(appJs.includes('stg-magia'), 'la UI pinta destellos de magia en cada grid de escenas');
ok((appJs.match(/class="stg-magia"/g) || []).length === 5, '5 destellos ✦ por grid (escenas y carrusel)');
ok(appJs.includes('✦'), 'los destellos son ✦ de 4 puntas, nunca puntos ni polvo');
const mcFn = appJs.slice(appJs.indexOf('async function mcEscenasUI()'), appJs.indexOf('async function mcTestimoniosUI()'));
ok(!mcFn.includes('polvo'), 'sin polvo en la magia del lote');
ok(stylesCss.includes('.stg-magia'), 'styles.css define .stg-magia');
ok(stylesCss.includes('@keyframes stgMagiaIn'), 'la magia tiene keyframes de entrada');
ok(stylesCss.includes('pointer-events:none'), 'la magia nunca tapa el contenido ni demora el toque');
ok(stylesCss.includes('forwards'), 'la animación termina invisible (solo entrada, no permanente)');
ok(stylesCss.includes('#FEC14D') && stylesCss.includes('#2793C8'), 'magia dorada #FEC14D y celeste #2793C8');
ok(stylesCss.includes('prefers-reduced-motion'), 'con reduced-motion se anula todo');
const stgBlock = stylesCss.slice(stylesCss.indexOf('.stg-magia'));
ok(!stgBlock.includes('infinite'), 'la magia no tiene animación infinita');
const defs = (appJs.match(/function mcEscenasUI\(\)/g) || []).length;
const calls = (appJs.match(/return mcEscenasUI\(\)/g) || []).length;
eq(defs, 1, 'mcEscenasUI definida 1 vez');
eq(calls, 1, 'mcEscenasUI llamada 1 vez desde la herramienta');

console.log(`test-loteproductostaging: ${n}/${n} OK`);
