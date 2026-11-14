'use strict';
/* test-lote-captions-semana.js — LOTE CAPTIONS-DE-LA-SEMANA
 * (diagnóstico Blind Barber, punto 6). La causa raíz: el caption del
 * posteo 675 («bar is one of the most requested things at Blind
 * Barber…») salió del constructor determinístico interpolando el tema
 * crudo en minúscula como arranque de oración — su titular hermano sí
 * capitalizaba — y ninguna puerta de texto miraba los slots 1..n (la
 * 6C solo corre en el gate del slot 0 y caza otra clase).
 * El lote: (1) capStartText en las 22 plantillas del constructor que
 * interpolan el tema como arranque de oración (ES/EN, incl. las dos
 * condicionales de la reserva pre-lanzamiento); (2) captionPuertaTexto
 * — arranque en minúscula + fragmento al inicio o al cierre — cableada
 * en mk (el tema no nace), en el armado del spec (demo.js) y como
 * clase nueva en el gate del slot 0.
 * Control contra la base: LOTE_DIR=<base> reproduce el 675 verbatim.
 * Corre con: node test-lote-captions-semana.js */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = process.env.LOTE_DIR || __dirname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-capsem-'));
process.env.DATA_DIR = TMP;

const clientDigest = require(path.join(DIR, 'client-digest'));
const demo = require(path.join(DIR, 'demo'));
const demoCaptions = require(path.join(DIR, 'demo-captions'));

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
const puerta = (cap, en, names) => clientDigest.captionPuertaTexto(cap, { en: !!en, names: names || [] });

/* ============ A) capStartText: la forma de arranque ============ */
console.log('== A) capStartText ==');
{
  ok(clientDigest.capStartText('bar') === 'Bar', "'bar' → 'Bar'");
  ok(clientDigest.capStartText('corte de pelo') === 'Corte de pelo', "'corte de pelo' → 'Corte de pelo' (solo la primera letra)");
  ok(clientDigest.capStartText('Eau De Parfum - Speakeasy') === 'Eau De Parfum - Speakeasy', 'ya capitalizado: intacto');
  ok(clientDigest.capStartText('2x1 en cortes') === '2x1 en cortes', 'abre con dígito: intacto');
  ok(clientDigest.capStartText('') === '', 'vacío: vacío');
}

/* ============ B) La puerta: clases y falsos positivos ============ */
console.log('== B) captionPuertaTexto ==');
{
  const cap675 = 'bar is one of the most requested things at {BIZ} ✨\n\nThanks for choosing us and recommending us.\n\nTell us: have you tried it yet? 👇';
  ok(puerta(cap675, true) === 'arranque-minuscula', 'el caption del 675 verbatim → arranque-minuscula');
  ok(puerta(cap675.replace('bar is', 'Bar is'), true) === null, 'el mismo caption capitalizado pasa');
  const cap675es = 'bar es de lo que más nos piden en {BIZ} ✨\n\nGracias por elegirnos y recomendarnos siempre.\n\nContanos: ¿ya lo probaste? 👇';
  ok(puerta(cap675es, false) === 'arranque-minuscula', 'la versión ES del defecto → arranque-minuscula');
  ok(puerta('From, another favorite at {BIZ} ✨\n\nOrder yours today by DM 📩', true) === 'fragmento', 'fragmento EN al arranque (la clase del 666) → fragmento');
  ok(puerta('Fresh in and ready for you at the', true) === 'fragmento', 'cola colgante EN sin cierre → fragmento');
  ok(puerta('Desde, otro favorito de la casa ✨', false) === 'fragmento', 'fragmento ES al arranque → fragmento');
  ok(puerta('Lo hacemos con el detalle de', false) === 'fragmento', 'cola colgante ES sin cierre → fragmento');
  // Legítimos que NO pueden frenar:
  ok(puerta('3 claves para elegir bien en corte clásico 👇\n\nCalidad, detalle y que sea de {BIZ}: así trabajamos corte clásico.\n\nGuardá este posteo para cuando lo necesites 🔖', false) === null,
    'ES: arranque con dígito («3 claves…») no es defecto');
  ok(puerta('Contanos: ¿ya lo probaste? 👇', false) === null, 'ES: la apertura ¿…? con minúscula es ortografía válida');
  ok(puerta('Bar is one of the most requested things at {BIZ} ✨\n\nThanks for choosing us and recommending us.\n\nTell us: have you tried it yet? 👇', true) === null,
    'EN: «Tell us: have…» tras dos puntos no es arranque de oración');
  ok(puerta('Corte + barba en {BIZ} 🔥\n\nEs por tiempo limitado: cuando se termina, se termina.\n\nEscribinos y te lo reservamos 📩', false) === null,
    'ES promo: «cuando…» tras dos puntos no es cola ni arranque');
  ok(puerta('', true) === null && puerta(null, false) === null, 'caption vacío/nulo: sin veredicto');
}

/* ============ C) Blind Barber: el social sale capitalizado y entero ============ */
console.log('== C) deriveTopics con el fundamento de la corrida ==');
const bbDigest = () => ({
  business: 'Blind Barber', category: 'barberia', subcat: '',
  productos: [{ nombre: 'Eau De Parfum - Speakeasy' }, { nombre: 'Hair Clay' }, { nombre: 'Proof Pomade' }],
  servicios: [], promos: [], temas_feed: ['bar'], has_booking: false,
  inferred_star: null, dueno: {}, onboarding: {}, diferencial: '', etapa: '',
});
{
  const topics = clientDigest.deriveTopics(bbDigest(), { count: 5, category: 'barberia', lang: 'en' });
  const social = topics.find((t) => t.kind === 'social');
  ok(!!social, 'nace el topic social');
  if (social) {
    ok(social.caption.startsWith('Bar is one of the most requested things at {BIZ}'),
      `el caption del slot social arranca capitalizado y entero: ${JSON.stringify(social.caption.slice(0, 55))}`);
    ok(puerta(social.caption, true, [social.digest_anchor]) === null, 'el caption social pasa la puerta');
  }
  ok(topics.length >= 3, `la semana nace con sus temas (${topics.length})`);
  ok(topics.every((t) => puerta(t.caption, true, [t.digest_anchor]) === null), 'TODOS los captions de la semana pasan la puerta');
  ok(topics.every((t) => !/^[a-záéíóúñü]/.test(String(t.caption || ''))), 'ningún caption arranca con el tema crudo en minúscula');
}

/* ============ D) Censo de plantillas: matriz rubro × idioma × etapa ============ */
console.log('== D) censo del constructor: ninguna plantilla produce arranque crudo ==');
{
  const base = (extra) => Object.assign({
    business: 'Negocio', subcat: '', servicios: [], promos: [], has_booking: false,
    inferred_star: null, dueno: {}, onboarding: {}, diferencial: '', etapa: '',
  }, extra);
  const casos = [
    ['barberia EN (servicios)', base({ category: 'barberia', productos: [{ nombre: 'hair clay' }, { nombre: 'proof pomade' }, { nombre: 'beard balm' }], temas_feed: ['bar', 'tarde de cortes'] }), 'barberia', 'en'],
    ['barberia ES (servicios)', base({ category: 'barberia', productos: [{ nombre: 'corte de pelo' }, { nombre: 'afeitado clásico' }, { nombre: 'pomada mate' }], temas_feed: ['corte clásico', 'tarde de cortes'] }), 'barberia', 'es'],
    ['gastronomia ES (producto)', base({ category: 'gastronomia', productos: [{ nombre: 'medialuna de manteca' }, { nombre: 'torta de ricota' }, { nombre: 'café de especialidad' }], temas_feed: ['merienda', 'tarde de medialunas'] }), 'gastronomia', 'es'],
    ['gastronomia EN (producto)', base({ category: 'gastronomia', productos: [{ nombre: 'butter croissant' }, { nombre: 'ricotta cake' }, { nombre: 'specialty coffee' }], temas_feed: ['brunch', 'slow mornings'] }), 'gastronomia', 'en'],
    ['barberia ES con turnos', base({ category: 'barberia', has_booking: true, productos: [{ nombre: 'corte de pelo' }, { nombre: 'arreglo de barba' }], temas_feed: ['corte clásico'] }), 'barberia', 'es'],
    ['barberia EN con turnos', base({ category: 'barberia', has_booking: true, productos: [{ nombre: 'haircut' }, { nombre: 'beard trim' }], temas_feed: ['the classic cut'] }), 'barberia', 'en'],
    ['pre-lanzamiento ES con fecha', base({ category: 'barberia', etapa: 'pre-lanzamiento', lanzamiento_fecha: '2026-12-20', productos: [{ nombre: 'corte de pelo' }, { nombre: 'afeitado clásico' }], temas_feed: ['corte clásico'] }), 'barberia', 'es'],
    ['pre-lanzamiento EN sin fecha', base({ category: 'barberia', etapa: 'pre-lanzamiento', productos: [{ nombre: 'haircut' }, { nombre: 'beard trim' }], temas_feed: ['the classic cut'] }), 'barberia', 'en'],
    ['pre-lanzamiento ES sin fecha', base({ category: 'barberia', etapa: 'pre-lanzamiento', productos: [{ nombre: 'corte de pelo' }, { nombre: 'afeitado clásico' }], temas_feed: ['corte clásico'] }), 'barberia', 'es'],
    ['lanzamiento EN', base({ category: 'gastronomia', onboarding: { etapa: 'lanzamiento' }, productos: [{ nombre: 'butter croissant' }, { nombre: 'ricotta cake' }], temas_feed: ['brunch'] }), 'gastronomia', 'en'],
    ['lanzamiento ES', base({ category: 'gastronomia', onboarding: { etapa: 'lanzamiento' }, productos: [{ nombre: 'medialuna de manteca' }, { nombre: 'torta de ricota' }], temas_feed: ['merienda'] }), 'gastronomia', 'es'],
    ['promo ES', base({ category: 'barberia', promos: [{ titulo: 'corte + barba en promo' }], productos: [{ nombre: 'corte de pelo' }, { nombre: 'afeitado clásico' }], temas_feed: ['corte clásico'] }), 'barberia', 'es'],
    ['promo EN', base({ category: 'barberia', promos: [{ titulo: 'cut + beard deal' }], productos: [{ nombre: 'haircut' }, { nombre: 'beard trim' }], temas_feed: ['the classic cut'] }), 'barberia', 'en'],
  ];
  for (const [nombre, digest, cat, lang] of casos) {
    const topics = clientDigest.deriveTopics(digest, { count: 5, category: cat, lang });
    ok(topics.length >= 2, `${nombre}: la semana nace (${topics.length} temas)`);
    const malos = topics.filter((t) => puerta(t.caption, lang === 'en', [t.digest_anchor]) !== null);
    ok(malos.length === 0, `${nombre}: los ${topics.length} captions pasan la puerta${malos.length ? ' — frenados: ' + malos.map((t) => t.kind).join(',') : ''}`);
    const crudos = topics.filter((t) => /^[a-záéíóúñü]/.test(String(t.caption || '')));
    ok(crudos.length === 0, `${nombre}: ningún caption arranca en minúscula`);
  }
  // La reserva pre-lanzamiento SIN fecha: el tema cierra la oración
  // como arranque — es el sitio condicional del censo.
  const preSinFecha = clientDigest.deriveTopics(base({ category: 'barberia', etapa: 'pre-lanzamiento', productos: [{ nombre: 'corte de pelo' }, { nombre: 'afeitado clásico' }], temas_feed: ['corte clásico'] }), { count: 5, category: 'barberia', lang: 'es' });
  const res = preSinFecha.find((t) => t.kind === 'reserva');
  ok(!res || !/ y corte de pelo es parte/.test(res.caption) && !/\n\ncorte de pelo es parte/.test(res.caption),
    'reserva pre-lanzamiento sin fecha: el tema no queda en minúscula como arranque de oración');
}

/* ============ E) Censo del catálogo de relleno (DEMO_TOPICS) ============ */
console.log('== E) el relleno de la semana también pasa la puerta ==');
{
  let total = 0; let malos = [];
  for (const [src, en] of [[demoCaptions.DEMO_TOPICS, false], [demoCaptions.DEMO_TOPICS_EN, true]]) {
    for (const cat of Object.keys(src || {})) {
      for (const t of (src[cat] || [])) {
        if (!t || !t.caption) continue;
        total++;
        const clase = puerta(t.caption, en, []);
        if (clase) malos.push(`${cat}:${clase}:${String(t.caption).slice(0, 40)}`);
      }
    }
  }
  ok(total > 50, `censo del catálogo: ${total} captions de relleno`);
  // Conjunto conocido y declarado: dos entradas EN de moda cuyas líneas
  // sin puntuación de cierre terminan en palabra de función («…sale is
  // on 🛍️», «…you're in 👇») — la MISMA regla de cola que el gate del
  // slot 0 aplica hoy (enHangingTail). La puerta las descarta del pool
  // en el armado, fail-closed; el catálogo conserva cientos de temas.
  const conocidos = malos.filter((m) => /^moda:fragmento:(Giveaway time|The end-of-season)/.test(m));
  ok(malos.length === conocidos.length && malos.length <= 2,
    `los únicos frenos del catálogo son los 2 conocidos de moda (cola de función sin cierre)${malos.length ? ' — ' + malos.join(' · ') : ''}`);
}

/* ============ F) El armado (buildDemoSpec): slots 1..n cubiertos ============ */
console.log('== F) buildDemoSpec: todos los posteos de la semana ==');
{
  const digest = bbDigest();
  const spec = demo.buildDemoSpec({ business: 'Blind Barber', category: 'barberia', country: 'US', tone: 'vos', count: 5, lang: 'en', bioText: 'Barbershop and lounge. Classic cuts, straight-razor shaves and cocktails.', digest });
  ok(spec && Array.isArray(spec.specPosts) && spec.specPosts.length >= 3, `el spec nace con ${spec.specPosts ? spec.specPosts.length : 0} posteos`);
  const malos = (spec.specPosts || []).filter((p) => puerta(p.caption, true, []) !== null);
  ok(malos.length === 0, 'ningún posteo del spec (slots 0..n) lleva un caption frenado por la puerta');
  const social = (spec.topics || []).find((t) => t.kind === 'social');
  ok(!social || social.caption.startsWith('Bar is one of the most requested'),
    'el social del spec es el caption entero y capitalizado');
}

/* ============ G) El gate del slot 0 conoce la clase nueva ============ */
console.log('== G) primerPosteoGate: arranque en minúscula en el slot 0 ==');
{
  const gEs = demo.primerPosteoGate({ star: '', headline: 'Bar', caption: 'bar es de lo que más nos piden en Blind Barber ✨', lang: 'es' });
  ok(gEs.texto.caption_ok === false && gEs.texto.clase_frenada === 'arranque-minuscula-caption',
    `ES: el slot 0 frena por arranque-minuscula (clase: ${gEs.texto.clase_frenada})`);
  const gEn = demo.primerPosteoGate({ star: '', headline: 'Bar', caption: 'bar is one of the most requested things at Blind Barber ✨', lang: 'en' });
  ok(gEn.texto.caption_ok === false && gEn.texto.clase_frenada === 'arranque-minuscula-caption',
    `EN: el slot 0 frena por arranque-minuscula (clase: ${gEn.texto.clase_frenada})`);
  const gOk = demo.primerPosteoGate({ star: '', headline: 'Bar', caption: 'Bar is one of the most requested things at Blind Barber ✨', lang: 'en' });
  ok(gOk.texto.clase_frenada !== 'arranque-minuscula-caption', 'el caption capitalizado no frena por la clase nueva');
}

console.log(fails === 0 ? '\nTODO OK' : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
