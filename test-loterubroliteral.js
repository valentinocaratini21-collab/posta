'use strict';
/* test-loterubroliteral.js — RUBRO-LITERAL (caso real del primo, 3/11):
 * vende CAMPOS, Posty no captó qué vende por IG/web y le hizo posteos de
 * FLORES. La pregunta 1 solo ofrecía «de todo un poco» y la semana igual
 * se armó con temas genéricos. Doctrina: si no es literal lo que venden,
 * el producto es malísimo; el rubro nunca se adivina.
 *
 * Lo que se verifica (sin red, sin gastar IA):
 *  a. Fixture «vende campos»: la minería devuelve campos (bio y web) y
 *     nunca flores; el texto libre «campos» viaja literal al fundamento.
 *  b. La pregunta 1 ofrece escritura libre ES+EN, además de detectados y
 *     «de todo un poco» (que sigue existiendo).
 *  c. «De todo un poco» SIN productos ni texto libre NO genera: la puerta
 *     fail-closed (trialHasEvidencedProducts) da false en ambas rutas.
 *  d. «De todo un poco» CON productos (detectados, servicios o catálogo)
 *     sí genera, desde esos productos (la línea de goal los nombra).
 *  e. Texto libre que no calza con rubros conocidos queda literal y se
 *     usa literal (sin mapear a categoría vecina: no «agro», no flores).
 *  f. Espejo EN de todo lo anterior.
 *  g. No-wipe: una segunda fuente sin productos no borra los de la primera.
 *  h. Re-pregunta: el servidor marca falta_producto y el front vuelve a
 *     la pregunta 1 (clásico y stream) sin borrar el resto de respuestas.
 * Corre con: node test-loterubroliteral.js
 */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

// Extrae una función pura de server.js (sin dependencias de runtime).
function extractFn(src, name) {
  const m = src.match(new RegExp('function ' + name + '[\\s\\S]*?\\n\\}\n'));
  if (!m) throw new Error('no se encontró ' + name);
  return m[0];
}
const srv = read('server.js');
const OC_CTA = ['reservar', 'escribirte', 'local', 'comprar'];
const OC_PROMO = ['ninguna', 'porcentaje', '2x1', 'envio'];
const OC_VOZ = ['cercano', 'profesional', 'divertido', 'elegante'];
const OC_PRECIOS = ['si', 'ofertas', 'no'];
const OC_DONDE = ['whatsapp', 'instagram', 'local', 'web'];
const serverFns = [
  extractFn(srv, 'onboardingAnswersFrom'),
  extractFn(srv, 'onboardingAnswersOk'),
  extractFn(srv, 'onboardingGoalLines'),
  extractFn(srv, 'trialParseDetectados'),
  extractFn(srv, 'trialHasEvidencedProducts'),
].join('\n');
const [onboardingAnswersFrom, onboardingAnswersOk, onboardingGoalLines, trialParseDetectados, trialHasEvidencedProducts] =
  eval(serverFns + ';\n[onboardingAnswersFrom, onboardingAnswersOk, onboardingGoalLines, trialParseDetectados, trialHasEvidencedProducts];'); // eslint-disable-line no-eval

const { detectProducts } = require('./onboarding-products');

const FULL5 = { cta: 'comprar', promo: 'ninguna', voz: 'cercano', precios: 'no', donde: 'whatsapp' };

section('a · Fixture vende campos: la minería devuelve campos, nunca flores');
{
  const bio = detectProducts({ bio: 'Venta de campos 🌾 Asesoramiento rural' });
  ok(bio.join(' ').toLowerCase().includes('campo'), 'bio minada contiene campo: ' + JSON.stringify(bio));
  ok(!bio.join(' ').toLowerCase().includes('flor'), 'bio minada no menciona flores');
  const web = detectProducts({ services: [], description: 'Campos en venta. Asesoramiento rural.' });
  ok(web.join(' ').toLowerCase().includes('campo'), 'descripción web minada contiene campo: ' + JSON.stringify(web));
  const serv = detectProducts({ services: ['Campo 200 ha'] });
  ok(serv.includes('Campo 200 ha'), 'servicio de la web se conserva literal');
  const vacio = detectProducts({ services: [], bio: '', description: '' });
  ok(vacio.length === 0, 'sin señales no hay productos inventados');
}

section('b · Pregunta 1 con escritura libre ES+EN');
for (const [f, libre] of [['public/prueba.html', 'Escribilo con tus palabras'], ['public/en-prueba.html', 'Write it in your own words']]) {
  const html = read(f);
  ok(html.includes("'__libre__'"), f + ': opción __libre__ presente');
  ok(html.includes(libre), f + ': texto libre presente');
  ok(html.includes('screenQ1Libre'), f + ': pantalla de escritura libre presente');
  ok(html.includes("q1mix = 'libre'"), f + ': la escritura libre viaja como q1mix libre');
  ok(html.includes("l: T.todo"), f + ': «de todo un poco» sigue existiendo');
}

section('c · Todo sin evidencia NO genera (puerta fail-closed)');
{
  const sinNada = trialHasEvidencedProducts({ mix: 'todo', estrella: '', servicios: [], catalogItems: [], detectados: [] });
  ok(sinNada === false, 'todo sin servicios/catálogo/detectados = false (el caso del primo)');
  // El gate temprano de las 5 respuestas SIGUE pasando 'todo': por eso la
  // puerta de evidencia va después, con web y catálogo ya resueltos.
  const a = onboardingAnswersFrom({ producto_mix: 'todo', ...FULL5 });
  ok(onboardingAnswersOk(a, { ig: 'x', web: '' }) === true, 'el gate temprano pasa todo (documentado: no basta solo)');
  ok(srv.includes('falta_producto: true'), 'server.js marca falta_producto en la respuesta 400');
  const gates = (srv.match(/trialHasEvidencedProducts\(\{ mix: ocAns\.producto_mix/g) || []).length;
  ok(gates === 2, 'la puerta está en las 2 rutas (generate y generate-stream), halladas: ' + gates);
}

section('d · Todo CON productos sí genera, desde esos productos');
{
  ok(trialHasEvidencedProducts({ mix: 'todo', estrella: '', servicios: [], catalogItems: [], detectados: ['Campos en venta'] }) === true, 'todo + detectados = true');
  ok(trialHasEvidencedProducts({ mix: 'todo', estrella: '', servicios: ['Campo 200 ha'], catalogItems: [], detectados: [] }) === true, 'todo + servicios web = true');
  ok(trialHasEvidencedProducts({ mix: 'todo', estrella: '', servicios: [], catalogItems: [{ nombre: 'Campo 200 ha' }], detectados: [] }) === true, 'todo + catálogo = true');
  const a = onboardingAnswersFrom({ producto_mix: 'todo', ...FULL5 });
  const lines = onboardingGoalLines(a, 'es', ['Campos en venta']);
  ok(lines.join('\n').includes('Campos en venta'), 'la línea de goal nombra los productos detectados: ' + JSON.stringify(lines));
  ok(trialHasEvidencedProducts({ mix: 'uno', estrella: 'Campos en venta' }) === true, 'uno + estrella = true');
}

section('e · Texto libre no conocido queda literal, sin mapear');
{
  ok(trialHasEvidencedProducts({ mix: 'libre', estrella: 'campos' }) === true, 'libre + campos = true');
  const a = onboardingAnswersFrom({ producto_mix: 'libre', producto_estrella: 'campos', ...FULL5 });
  ok(onboardingAnswersOk(a, { ig: 'x', web: '' }) === true, 'el gate temprano acepta libre con texto');
  const lines = onboardingGoalLines(a, 'es');
  ok(lines.join('\n').includes('Producto literal (escrito por el dueño): campos'), 'goal literal ES: ' + JSON.stringify(lines));
  ok(!lines.join('\n').toLowerCase().includes('flor'), 'el goal literal no menciona flores');
  ok(!lines.join('\n').toLowerCase().includes('agro'), 'el goal literal no mapea a categoría vecina (agro)');
  const sinTexto = onboardingAnswersFrom({ producto_mix: 'libre', producto_estrella: '', ...FULL5 });
  ok(onboardingAnswersOk(sinTexto, { ig: 'x', web: '' }) === false, 'libre sin texto no pasa el gate');
}

section('f · Espejo EN');
{
  const a = onboardingAnswersFrom({ producto_mix: 'libre', producto_estrella: 'fields', ...FULL5 });
  const lines = onboardingGoalLines(a, 'en');
  ok(lines.join('\n').includes('Literal product (written by the owner): fields'), 'goal literal EN: ' + JSON.stringify(lines));
  const en = read('public/en-prueba.html');
  ok(en.includes('Write it in your own words') && en.includes('What do you sell?'), 'EN: libre + pregunta presentes');
}

section('g · No-wipe: la segunda fuente sin productos no borra la primera');
for (const f of ['public/prueba.html', 'public/en-prueba.html']) {
  const html = read(f);
  ok(html.includes('if ((d.productos || []).length) S.products = d.productos;'), f + ': guarda no-wipe presente');
  ok(!html.includes('S.products = d.productos || [];'), f + ': no queda asignación que borre productos');
}

section('h · Re-pregunta con falta_producto (clásico y stream)');
for (const f of ['public/prueba.html', 'public/en-prueba.html']) {
  const html = read(f);
  ok(html.includes('window.OC_REASK_Q1 = reaskQ1'), f + ': puente OC_REASK_Q1 expuesto');
  ok(html.includes('data.falta_producto && window.OC_REASK_Q1'), f + ': clásico vuelve a Q1 con falta_producto');
  ok(html.includes('d.falta_producto && window.OC_REASK_Q1'), f + ': stream vuelve a Q1 con falta_producto');
  ok(html.includes("fd.append('productos_detectados'"), f + ': el front manda los detectados al generar');
}
ok(srv.includes('trialParseDetectados(fields.productos_detectados)'), 'server.js parsea productos_detectados del front');

console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO VERDE');
process.exit(fails ? 1 : 0);
