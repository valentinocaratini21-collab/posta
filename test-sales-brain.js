'use strict';
/* test-sales-brain.js — CEREBRO COMERCIAL v232 (2026-10-18).
 * Doctrina de Valentino: cada posteo nace PENSADO PARA VENDER —
 * intención declarada (venta/reserva/consulta/prueba/autoridad),
 * ángulo elegido con reglas, prueba obligatoria para vender (sin
 * prueba ⇒ degradación a autoridad, jamás humo), cierre acorde a la
 * intención, trazabilidad (posts.sales_intent/sales_angle) y
 * realimentación por ángulo. Todo con fixtures y aserciones sobre
 * briefs/specs ensamblados: CERO llamadas de IA.
 *
 * Aceptación:
 *  (a) negocio con booking → semana con ≥2 reservas, cierre de
 *      reserva y ángulo registrado;
 *  (b) productos con estrella → venta anclada a la estrella con su
 *      evidencia como prueba;
 *  (c) NEGATIVO: digest sin promos ni stock → ninguna escasez ni
 *      números inventados;
 *  (d) venta sin prueba disponible → degradada a autoridad;
 *  (e) dos semanas fixture con métricas → la segunda prefiere el
 *      ángulo ganador de la primera;
 *  + prueba (trial): deriveTopics adjunta intent/ángulo/prueba y el
 *    relleno queda capado a autoridad.
 */
const assert = require('assert');
const fs = require('fs');
const salesBrain = require('./sales-brain');
const cleanPieces = require('./clean-pieces');
const captions = require('./demo-captions');
const clientDigest = require('./client-digest');
const demo = require('./demo');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}
const baseDigest = (over) => Object.assign({
  business: 'Negocio', category: 'otro', productos: [], servicios: [], promos: [],
  temas_feed: [], protagonista: '', paleta: [], registro: '', ciudad: '',
  diferencial: '', has_booking: false, fuentes: {}, catalog: null, bio_link: '',
  lexicon: null, photo_map: null, inferred_star: null, contradictions: [],
  question_candidates: [],
}, over || {});
const idea = (titulo, tipo) => ({ titulo, tipo, angulo: '', porque: '' });

console.log('== Taxonomía compartida (clean-pieces) ==');
ok('kind→intención de venta', () => {
  assert.strictEqual(cleanPieces.salesIntentOfTipo('promo'), 'venta');
  assert.strictEqual(cleanPieces.salesIntentOfTipo('reserva'), 'reserva');
  assert.strictEqual(cleanPieces.salesIntentOfTipo('tip'), 'autoridad');
  assert.strictEqual(cleanPieces.salesIntentOfTipo('social'), 'prueba');
  assert.deepStrictEqual(salesBrain.SALES_INTENTS, ['venta', 'reserva', 'consulta', 'prueba', 'autoridad']);
});

console.log('== (a) Negocio con booking: la semana empuja reservas ==');
const digestBooking = baseDigest({
  business: 'Peluquería Lola', category: 'belleza', ciudad: 'Palermo',
  diferencial: 'Atendemos en Palermo desde 2015', has_booking: true,
  servicios: [{ nombre: 'Corte de pelo' }, { nombre: 'Coloración completa', precio: '$28.000' }],
  temas_feed: ['peinados'],
});
const weekBooking = [
  idea('Coloración completa: el cambio de temporada', 'novedad'),
  idea('Cómo cuidar el color en casa', 'tip'),
  idea('Así trabajamos un sábado en el salón', 'detras'),
  idea('Nuestras clientas de siempre', 'social'),
  idea('Peinados que más piden esta semana', 'social'),
  idea('Corte de pelo: renovate el look', 'novedad'),
  idea('Tips para que el peinado dure', 'tip'),
];
ok('cuota: booking n=5 ⇒ 2 reservas', () => {
  const q = salesBrain.salesQuotas(salesBrain.digestSignals(digestBooking), 5);
  assert.strictEqual(q.reserva, 2);
});
let planA;
ok('la semana trae ≥2 piezas de reserva con ángulo registrado', () => {
  planA = salesBrain.planSalesWeek(weekBooking.map((i) => ({ ...i })), 5, digestBooking);
  const win = planA.picks.slice(0, 5);
  const reservas = win.filter((p) => p._sales.intent === 'reserva');
  assert.ok(reservas.length >= 2, `reservas: ${reservas.length}`);
  for (const p of win) {
    assert.ok(p._sales, 'toda pieza lleva _sales');
    assert.ok(salesBrain.SALES_ANGLES.includes(p._sales.angle), `ángulo válido: ${p._sales.angle}`);
    assert.ok(salesBrain.SALES_INTENTS.includes(p._sales.intent), `intención válida: ${p._sales.intent}`);
  }
  for (const p of reservas) assert.ok(p._sales.proof, 'la reserva lleva su servicio como prueba');
});
ok('cierre de reserva acorde a la intención', () => {
  const out = captions.ensureCaptionCloseForIntent('Sábado de salón, como nos gusta ✨', 'reserva', 'vos');
  assert.ok(out.includes('Reservá tu turno por DM'), out);
  assert.ok(captions.captionEndsWithCta(out), 'el cierre se reconoce como CTA');
});

console.log('== (b) Productos con estrella: venta anclada con su evidencia ==');
const digestStar = baseDigest({
  business: 'Café Aroma', category: 'cafeteria', ciudad: 'Palermo',
  diferencial: 'Tostamos en el local desde 2016',
  productos: [{ nombre: 'Blend Patagonia', precio: '$11.900' }, { nombre: 'Medialunas de manteca', precio: '$2.500' }],
  inferred_star: { item: 'Blend Patagonia', confidence: 0.9, evidence: ['aparece en 5 de sus últimos posteos', 'su posteo con más alcance lo nombra'] },
});
ok('piezas de venta ancladas a la estrella, evidencia como prueba', () => {
  const week = [
    idea('Blend Patagonia: recién tostado', 'novedad'),
    idea('Medialunas de manteca para la tarde', 'novedad'),
    idea('Cómo guardás el café en casa', 'tip'),
    idea('La mañana en el local', 'social'),
    idea('Blend Patagonia en taza', 'social'),
  ];
  const plan = salesBrain.planSalesWeek(week, 5, digestStar);
  const ventas = plan.picks.slice(0, 5).filter((p) => p._sales.intent === 'venta');
  assert.ok(ventas.length >= 2, `ventas: ${ventas.length}`);
  const starPiece = ventas.find((p) => p.titulo.includes('Blend Patagonia'));
  assert.ok(starPiece, 'hay pieza de venta sobre la estrella');
  assert.ok(starPiece._sales.proof.includes('Blend Patagonia'), starPiece._sales.proof);
  assert.ok(starPiece._sales.proof.includes('$11.900'), 'precio real del digest en la prueba');
  assert.ok(starPiece._sales.proof.includes('aparece en 5 de sus últimos posteos'), 'la evidencia de la estrella ES la prueba');
});

console.log('== (c) NEGATIVO: sin promos ni stock, ni escasez ni números inventados ==');
const digestNoPromo = baseDigest({
  business: 'Florería Jazmín', category: 'flores',
  productos: [{ nombre: 'Ramo de jazmines' }],
});
ok('ninguna pieza usa escasez ni el ángulo número', () => {
  const week = [
    idea('Ramo de jazmines en promo esta semana', 'promo'),
    idea('Ramo de jazmines recién armado', 'novedad'),
    idea('Cómo hacer durar las flores', 'tip'),
    idea('Ramos de la semana', 'social'),
    idea('El rincón verde del local', 'social'),
  ];
  const plan = salesBrain.planSalesWeek(week, 5, digestNoPromo);
  for (const p of plan.picks) {
    assert.notStrictEqual(p._sales.angle, 'escasez', `escasez sin dato en: ${p.titulo}`);
    assert.notStrictEqual(p._sales.angle, 'numero', `número sin dato en: ${p.titulo}`);
  }
});
ok('la escasez exige dato concreto; el candado de números sigue firme', () => {
  assert.strictEqual(salesBrain.scarcityEvidenceFor({ titulo: 'Promo por tiempo limitado' }), '');
  assert.strictEqual(salesBrain.scarcityEvidenceFor({ titulo: 'Oferta especial de la casa' }), '');
  assert.ok(salesBrain.scarcityEvidenceFor({ titulo: 'Quedan 3 ramos' }), 'stock con número SÍ es escasez real');
  assert.ok(salesBrain.scarcityEvidenceFor({ titulo: '2x1 hasta el viernes' }), 'plazo con día SÍ es escasez real');
  const withFoundation = { ...digestNoPromo, fuentes: { ig: true } };
  assert.strictEqual(clientDigest.promoNumberGuard({ kind: 'promo', headline: 'Ramo de jazmines a $9.999' }, withFoundation).ok, false, 'número inventado: rechazado');
  assert.strictEqual(clientDigest.promoNumberGuard({ kind: 'promo', headline: 'Ramo de jazmines' }, withFoundation).ok, true);
});
ok('con escasez REAL en el digest, el ángulo escasez sí se usa', () => {
  const digestScarce = baseDigest({
    business: 'Florería Jazmín', category: 'flores',
    productos: [{ nombre: 'Ramo de jazmines' }],
    promos: [{ titulo: 'Ramos de jazmines: quedan 4 hoy' }],
  });
  const plan = salesBrain.planSalesWeek([idea('Ramos de jazmines: quedan 4 hoy', 'promo')], 1, digestScarce);
  assert.strictEqual(plan.picks[0]._sales.intent, 'venta');
  assert.strictEqual(plan.picks[0]._sales.angle, 'escasez');
});

console.log('== (d) Venta sin prueba ⇒ degradada a autoridad ==');
ok('planOne y planSalesWeek degradan la venta sin ancla', () => {
  const empty = baseDigest({ business: 'Estudio Norte', category: 'profesionales' });
  const signals = salesBrain.digestSignals(empty);
  const one = salesBrain.planOne(idea('Promo de la semana imperdible', 'promo'), signals);
  assert.strictEqual(one.intent, 'autoridad');
  assert.strictEqual(one.degraded, true);
  const plan = salesBrain.planSalesWeek([idea('Promo de la semana imperdible', 'promo'), idea('Dato útil del rubro', 'tip')], 2, empty);
  assert.strictEqual(plan.picks[0]._sales.intent, 'autoridad');
  assert.strictEqual(plan.picks[0]._sales.degraded, true);
  assert.strictEqual(plan.stats.degraded, 1);
});

console.log('== (e) Realimentación: la semana 2 prefiere el ángulo ganador ==');
const week1Rows = [
  { angle: 'dolor', reach: 1000, likes: 90, comments: 12, saved: 40 },
  { angle: 'dolor', reach: 800, likes: 70, comments: 8, saved: 25 },
  { angle: 'directo', reach: 1000, likes: 12, comments: 1, saved: 2 },
  { angle: 'directo', reach: 900, likes: 10, comments: 2, saved: 1 },
];
const digestConsulta = baseDigest({
  business: 'Estudio Andar', category: 'profesionales',
  servicios: [{ nombre: 'Asesoría inicial' }],
});
ok('scoreAngles mide el ganador con los datos que ya junta el sistema', () => {
  const scores = salesBrain.scoreAngles(week1Rows);
  assert.ok(scores.dolor > 1, `dolor rinde sobre el promedio: ${scores.dolor}`);
  assert.ok(scores.directo < 1, `directo rinde bajo el promedio: ${scores.directo}`);
  assert.deepStrictEqual(salesBrain.scoreAngles(week1Rows.slice(0, 2)), {}, 'con poca muestra no se opina');
});
ok('sin historial la consulta usa objeción; con historial, el ángulo ganador', () => {
  const mk = () => [idea('Reservá tu asesoría inicial', 'reserva')];
  const sin = salesBrain.planSalesWeek(mk(), 1, digestConsulta);
  assert.strictEqual(sin.picks[0]._sales.intent, 'consulta');
  assert.strictEqual(sin.picks[0]._sales.angle, 'objecion');
  const scores = salesBrain.scoreAngles(week1Rows);
  const con = salesBrain.planSalesWeek(mk(), 1, digestConsulta, { angleScores: scores });
  assert.strictEqual(con.picks[0]._sales.angle, 'dolor', 'la semana 2 prefiere el ángulo ganador de la semana 1');
});
ok('tope de rotación: máx 2 del mismo ángulo, salvo el único probado', () => {
  const tips = () => [0, 1, 2, 3, 4].map((i) => idea(`Dato útil del rubro ${i}`, 'tip'));
  const capped = salesBrain.planSalesWeek(tips(), 5, digestConsulta, { angleScores: { dolor: 1.24, directo: 0.76 } });
  const nDolor = capped.picks.filter((p) => p._sales.angle === 'dolor').length;
  assert.ok(nDolor <= 2, `dolor aparece ${nDolor} veces (tope 2)`);
  const unico = salesBrain.planSalesWeek(tips(), 5, digestConsulta, { angleScores: { dolor: 1.24 } });
  const nDolor2 = unico.picks.filter((p) => p._sales.angle === 'dolor').length;
  assert.ok(nDolor2 >= 3, `siendo el único probado, el tope se levanta: ${nDolor2}`);
});

console.log('== Cierres por intención (las 5) ==');
ok('cada intención cierra acorde y se reconoce como CTA', () => {
  const base = 'Un caption de prueba, sin llamado final';
  const cases = {
    venta: 'Pedilo hoy', reserva: 'Reservá tu turno', consulta: 'Escribinos tu caso',
    prueba: 'probarlo', autoridad: 'Guardá este posteo',
  };
  for (const [intent, frag] of Object.entries(cases)) {
    const out = captions.ensureCaptionCloseForIntent(base, intent, 'vos');
    assert.ok(out.toLowerCase().includes(frag.toLowerCase()), `${intent} → ${out.split('\n').pop()}`);
    assert.ok(captions.captionEndsWithCta(out), `${intent}: cierre reconocido`);
  }
  const tu = captions.ensureCaptionCloseForIntent(base, 'venta', 'tu');
  assert.ok(!tu.includes('Pedilo'), 'tono tú convierte el cierre');
  const ya = captions.ensureCaptionCloseForIntent('Ya cierra bien\n\nPedilo por DM 📩', 'reserva', 'vos');
  assert.ok(!ya.includes('Reservá'), 'si ya cierra con CTA no se duplica');
});

console.log('== Prueba (trial): topics derivados con ventas declaradas ==');
const sushiDigest = () => clientDigest.buildFromParts({
  business: 'Sushi Go', category: 'gastronomia',
  feed: { bio: 'Sushi y cocina nikkei en Palermo. Omakase los viernes. Reservas por DM.', captions: ['Omakase de viernes 🍣 el favorito de la casa', 'Rolls de salmón fresco, como siempre', 'Nigiris del día, recién hechos'], name: 'Sushi Go', handle: 'sushigo' },
  registro: 'dark',
});
ok('deriveTopics adjunta intent+ángulo+prueba por slot', () => {
  const topics = clientDigest.deriveTopics(sushiDigest(), { count: 5 });
  assert.ok(topics.length >= 4, `topics: ${topics.length}`);
  for (const t of topics) {
    assert.ok(t.intent, `topic ${t.kind} sin intención`);
    assert.ok(salesBrain.SALES_ANGLES.includes(t.angle), `topic ${t.kind} ángulo válido: ${t.angle}`);
  }
  const byKind = Object.fromEntries(topics.map((t) => [t.kind, t]));
  assert.strictEqual(byKind.reserva.intent, 'reserva', 'booking ⇒ topic de reserva con intención reserva');
  assert.strictEqual(byKind.novedad.intent, 'venta');
  assert.ok(byKind.novedad.proof, 'la novedad derivada lleva su prueba (el ítem real)');
  assert.strictEqual(byKind.tip.intent, 'autoridad');
});
ok('trial con escasez real: la promo usa el ángulo escasez', () => {
  const d = clientDigest.buildFromParts({
    business: 'Café Aroma', category: 'cafeteria',
    feed: { bio: 'Café de especialidad en Palermo.', captions: ['Blend de la casa recién tostado', 'Medialunas calentitas de manteca'], name: 'Café Aroma', handle: 'cafearoma' },
    dna: { productos: [{ nombre: 'Blend de la casa' }], promos_activas: ['Quedan 5 combos de café con medialunas'] },
  });
  const topics = clientDigest.deriveTopics(d, { count: 5 });
  const promo = topics.find((t) => t.kind === 'promo');
  assert.ok(promo, 'hay topic de promo');
  assert.strictEqual(promo.intent, 'venta');
  assert.strictEqual(promo.angle, 'escasez', `ángulo: ${promo.angle}`);
});
ok('el RELLENO queda capado a autoridad: nunca vende lo que no conoce', () => {
  const empty = clientDigest.buildFromParts({
    business: 'Café Martínez', category: 'gastronomia',
    feed: { bio: '', captions: [], name: 'Café Martínez', handle: 'cafemartinez' },
  });
  const spec = demo.buildDemoSpec({ business: 'Café Martínez', category: 'gastronomia', country: 'AR', tone: 'vos', count: 5, bioText: '', digest: empty });
  assert.ok(spec.topics.length >= 4, `topics de relleno: ${spec.topics.length}`);
  for (const t of spec.topics) {
    assert.strictEqual(t.intent, 'autoridad', `relleno con intención ${t.intent}`);
    assert.strictEqual(t._filler, 1);
  }
  for (const p of spec.specPosts) assert.strictEqual(p.sales_intent, 'autoridad');
});
ok('el spec de la prueba registra la intención de los derivados', () => {
  const spec = demo.buildDemoSpec({ business: 'Sushi Go', category: 'gastronomia', country: 'AR', tone: 'vos', count: 5, bioText: 'Sushi y cocina nikkei en Palermo. Omakase los viernes. Reservas por DM.', digest: sushiDigest() });
  assert.ok(spec.specPosts.some((p) => p.sales_intent === 'reserva'), 'el spec trae una pieza de reserva');
  assert.ok(spec.specPosts.every((p) => p.sales_intent && p.sales_angle), 'toda pieza del spec declara intención y ángulo');
});

console.log('== Wiring (contratos de código) ==');
ok('server/generator/db/demo conectados al cerebro', () => {
  const srv = fs.readFileSync('server.js', 'utf8');
  const gen = fs.readFileSync('generator.js', 'utf8');
  const dbSrc = fs.readFileSync('db.js', 'utf8');
  assert.ok(srv.includes("require('./sales-brain')"), 'server requiere sales-brain');
  assert.ok(srv.includes('planSalesWeek(picks, deficit, digest'), 'el pipeline planifica la semana');
  assert.ok(srv.includes('sales_intent, sales_angle'), 'el INSERT persiste intención+ángulo');
  assert.ok(srv.includes('anglePerformanceFor') && srv.includes('GROUP BY p.sales_angle') === false && srv.includes('p.sales_angle AS angle'), 'rendimiento por ángulo');
  assert.ok(srv.includes('mineObjectionsFor'), 'objeciones minadas de comentarios/DMs');
  assert.ok(srv.includes('ensureCaptionCloseForIntent'), 'cierre por intención en piezas limpias');
  assert.ok(srv.includes('demo.closeTrialCaption'), 'la prueba cierra por intención');
  assert.ok(gen.includes('CIERRE SEGÚN LA INTENCIÓN DE VENTA'), 'CAPTION_CRAFT con la regla v232');
  assert.ok(gen.includes('salesIntent'), 'el prompt de captions recibe la intención');
  assert.ok(dbSrc.includes('ADD COLUMN sales_intent') && dbSrc.includes('ADD COLUMN sales_angle'), 'columnas de trazabilidad');
  assert.strictEqual(typeof demo.closeTrialCaption, 'function');
  assert.strictEqual(typeof captions.ensureCaptionCloseForIntent, 'function');
  assert.ok(srv.includes("const BUILD_ID = '20261019-v236'"), 'BUILD_ID v233');
  assert.strictEqual(demo.DEMO_ENGINE_V, 24);
});

console.log(`\n✅ test-sales-brain: ${passed} verificaciones OK`);
