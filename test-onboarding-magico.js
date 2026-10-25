'use strict';
/* test-onboarding-magico.js — ✨ Bienvenida mágica post-pago + onboarding por confirmación (2026-10-25).
 *
 * Doctrina: Posty pregunta SOLO el hueco, de un toque, nunca lo que ya sabe.
 * Lo que se verifica (sin red, sin tocar plata):
 *  1. Fichas: solo hechos reales del digest; una capa vacía no genera ficha.
 *  2. Huecos: máximo 3; nunca una pregunta cuya respuesta ya está en el digest
 *     (ni renderizada ni aceptada por POST: el servidor recomputa y rechaza).
 *  3. Responder: persiste en onboarding_facts + espejo en digest.dueno (la
 *     fuente más fuerte, que el refresco preserva); la pregunta desaparece.
 *  4. Corregir: solo opciones reales de la ficha; la vista superpone la
 *     corrección y la marca como corregida por el dueño.
 *  5. Saltear: la pregunta no vuelve en el momento y no cuenta como respuesta.
 *  6. Estáticos: el momento vive en la tarjeta ?plan=ok (nunca un formulario
 *     aparte), la nota del payoff existe ES+EN, y los 3 endpoints existen.
 * Corre con: node test-onboarding-magico.js
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const clientDigest = require('./client-digest');
const ob = require('./onboarding');

function memDb() { return new DatabaseSync(':memory:'); }
function seedDigest(db, uid, parts) {
  const d = clientDigest.buildFromParts(parts);
  clientDigest.saveDigest(db, uid, d);
  return clientDigest.getDigest(db, uid);
}
const FULL = {
  business: 'Café Aroma', category: 'cafeteria', subcat: 'cafe',
  web: { name: 'Café Aroma', description: 'Café de especialidad en el barrio', services: [], city: 'Buenos Aires', palette: [], url: 'https://cafearoma.example' },
  feed: { bio: 'soy María, café de especialidad', captions: ['el mejor café del barrio'], name: 'Café Aroma', handle: 'cafearoma' },
  form: { description: 'Café de especialidad' },
  palette: [{ hex: '#6F4A2F', rol: 'principal' }, { hex: '#C9A24B', rol: 'accent' }],
  registro: 'light',
};
// Los ítems de oferta viajan en el digest guardado (buildFromParts los mina
// del texto; los sembramos explícitos para que el test no dependa del minado).
function seedFull(db, uid) {
  const d = seedDigest(db, uid, FULL);
  d.productos = [{ nombre: 'Café de especialidad' }, { nombre: 'Medialunas' }];
  d.servicios = [{ nombre: 'Brunch' }];
  clientDigest.saveDigest(db, uid, d);
  return clientDigest.getDigest(db, uid);
}

section('1 · Fichas: solo hechos reales del digest');
{
  const db = memDb(); seedFull(db, 1);
  const m = ob.momentoFor(db, 1);
  const ids = m.fichas.map((f) => f.id);
  ok(ids.includes('rubro'), 'ficha rubro presente (digest la tiene)');
  ok(ids.includes('estrella'), 'ficha estrella presente (hay oferta real)');
  ok(ids.includes('paleta'), 'ficha paleta presente (hex reales del digest)');
  ok(ids.includes('registro'), 'ficha tono del feed presente (registro light)');
  ok(ids.includes('protagonista'), 'ficha protagonista presente (leída de la bio)');
  ok(!ids.includes('calendario'), 'sin ficha de calendario: el digest no tiene esa capa, no se inventa');
  const pal = m.fichas.find((f) => f.id === 'paleta');
  ok(pal && pal.colores && pal.colores.includes('#6F4A2F'), 'paleta muestra los hex reales del digest');
}
{
  const db = memDb();
  clientDigest.saveDigest(db, 2, clientDigest.emptyDigest());
  const m = ob.momentoFor(db, 2);
  ok(m.fichas.length === 0, 'digest vacío → cero fichas (nada inventado)');
  ok(m.preguntas.length === 3, 'digest vacío → exactamente las 3 preguntas sin ítems (meta, no_publicar, cliente)');
  ok(!m.preguntas.some((p) => p.id === 'estrella'), 'sin ítems no hay pregunta de estrella (sin opciones reales no hay pregunta)');
}

section('2 · Huecos: máximo 3 y nunca lo sabido');
{
  const db = memDb(); seedFull(db, 3);
  const m = ob.momentoFor(db, 3);
  ok(m.preguntas.length <= ob.MAX_PREGUNTAS, `preguntas ≤ ${ob.MAX_PREGUNTAS} (son ${m.preguntas.length})`);
  ok(m.preguntas[0].id === 'meta', 'el primer hueco es la meta (qué querés que pase)');
  ok(m.preguntas.some((p) => p.id === 'no_publicar'), 'el hueco nunca-publicar existe (el dueño aún no fijó su límite)');
  const r = ob.responder(db, 3, 'meta', 'venir');
  ok(r.ok, 'responder meta con opción real acepta');
  const m2 = ob.momentoFor(db, 3);
  ok(!m2.preguntas.some((p) => p.id === 'meta'), 'tras responder, la meta ya no es hueco');
  ok(m2.respondidas.some((x) => x.id === 'meta' && x.valor === 'venir'), 'la respuesta queda en respondidas');
  const d = clientDigest.getDigest(db, 3);
  ok(d.dueno && d.dueno.meta === 'venir', 'la respuesta espeja en digest.dueno (gusto durable, lo preserva el refresco)');
  const dup = ob.responder(db, 3, 'meta', 'comprar');
  ok(!dup.ok && dup.error === 'no_hueco', 'responder dos veces lo mismo se rechaza (no_hueco)');
  const bad = ob.responder(db, 3, 'no_publicar', 'inventado');
  ok(!bad.ok && bad.error === 'opcion_invalida', 'una opción que no existe se rechaza');
  const ghost2 = (() => {
    const db2 = memDb(); const d2 = seedFull(db2, 31);
    d2.dueno = { estrella: 'Café de especialidad' };
    clientDigest.saveDigest(db2, 31, d2);
    return { momento: ob.momentoFor(db2, 31), r: ob.responder(db2, 31, 'estrella', 'Medialunas') };
  })();
  ok(!ghost2.momento.preguntas.some((p) => p.id === 'estrella'), 'con estrella confirmada por el dueño no hay hueco de estrella');
  ok(!ghost2.r.ok && ghost2.r.error === 'no_hueco', 'responder la estrella ya confirmada se rechaza (no_hueco)');
  const starOk = ob.responder(db, 3, 'estrella', 'Café de especialidad');
  ok(starOk.ok, 'la estrella SIN confirmar sí es hueco legítimo y se puede responder de un toque');
}

section('3 · Corregir: solo opciones reales, superpuestas y marcadas');
{
  const db = memDb(); seedFull(db, 4);
  const r = ob.corregir(db, 4, 'rubro', 'gastronomia');
  ok(r.ok, 'corregir rubro a una opción real acepta');
  const f = r.momento.fichas.find((x) => x.id === 'rubro');
  ok(f && f.corregida && /Gastronom/.test(f.valor), 'la ficha muestra el rubro corregido y marcado');
  const bad = ob.corregir(db, 4, 'rubro', 'rubro_inventado');
  ok(!bad.ok && bad.error === 'opcion_invalida', 'corregir a un rubro fuera de la lista se rechaza');
  const pal = ob.corregir(db, 4, 'paleta', '#C9A24B');
  ok(pal.ok, 'corregir el color principal a un hex del digest acepta');
  ok(pal.momento.fichas.find((x) => x.id === 'paleta').colores[0] === '#C9A24B', 'el color corregido queda primero');
  const reg = ob.corregir(db, 4, 'registro', 'dark');
  ok(reg.ok && /Oscuro/.test(reg.momento.fichas.find((x) => x.id === 'registro').valor), 'corregir el tono a oscuro se refleja');
}

section('4 · Saltear: no vuelve y no cuenta como respuesta');
{
  const db = memDb(); seedFull(db, 5);
  const r = ob.saltear(db, 5, 'meta');
  ok(r.ok, 'saltear acepta');
  ok(!r.momento.preguntas.some((p) => p.id === 'meta'), 'la salteada no vuelve en el momento');
  ok(!r.momento.respondidas.some((x) => x.id === 'meta'), 'la salteada no cuenta como respuesta aplicada');
}

section('5 · Estáticos: el momento vive en ?plan=ok, payoff ES+EN, endpoints');
{
  const app = read('public/app.js');
  ok(app.includes('pzPostPayMagicMount'), 'app.js monta el momento dentro de la tarjeta post-pago');
  ok(app.includes('maybePostPayWelcome'), 'el momento cuelga del handler ?plan=ok (no es un formulario aparte)');
  ok(app.includes('Con lo que me contaste, tu semana quedó así'), 'nota del payoff ES presente');
  ok(app.includes('With what you told me, your week is set like this'), 'nota del payoff EN presente');
  ok(app.includes('Saltear') && app.includes("'Skip'") || app.includes('Skip'), 'saltear existe ES+EN');
  const srv = read('server.js');
  ok(srv.includes("app.get('/api/onboarding'"), 'endpoint GET /api/onboarding existe');
  ok(srv.includes("app.post('/api/onboarding/responder'"), 'endpoint POST responder existe');
  ok(srv.includes("app.post('/api/onboarding/saltear'"), 'endpoint POST saltear existe');
  ok(srv.includes("app.post('/api/onboarding/corregir'"), 'endpoint POST corregir existe');
  const mod = read('onboarding.js');
  ok(/MAX_PREGUNTAS = 3/.test(mod), 'tope documentado en el código: MAX_PREGUNTAS = 3');
}

console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO VERDE');
process.exit(fails ? 1 : 0);
