/* test-lote-juli-meta-linea-v958.js — LOTE JULI-META-LÍNEA v958
 * (a) META-LÍNEA en captionPasses + captionPassesEn (generator.js): el
 *     caption ya no puede cerrar con una línea de metatexto interno —
 *     "En tus palabras: «X»" / "Tal como pediste: ..." (ES) ni "In your
 *     words: «X»" / "As you asked: ..." (EN). Ids REALES 595/596/597/601/
 *     603/617/618/619/621/622/623/633/634/635 (trials 11-12/11, cuentas
 *     91/92/93/94/95): 14 de 20 captions nuevos llevaban la línea pegada,
 *     con marcadores basura de una palabra ("locations", "ones",
 *     "constancetenvik", "week", "Salar"). La puerta no la veía: 11 de
 *     los 14 pasaban captionPasses limpio.
 * (b) FALLBACK SIN ECO en resolveTrialCaption (demo-captions.js): el
 *     camino de último recurso pegaba la voiceLine SIN pasar por la
 *     puerta — los ids 622/623/633/635 salieron con el fallback genérico
 *     + eco. El fallback ahora sale pelado; la escalera de intentos cae
 *     al caption limpio porque la puerta rechaza el eco.
 * (c) Checklist regla 26 (caption-style.js): los dos rótulos nombrados
 *     explícitos como notas internas que nunca se publican.
 * NOTA — TESTIMONIO-SIN-CITA NO VA EN ESTE LOTE: la primera versión
 * traía regla de testimonio (ids 605/610, "Lo que nos dijo una clienta..."
 * sin cita), pero rompe 3 tests de test-caption-body-gate.js (ids 448/458
 * y un control): esa apertura ES una fórmula de la casa con tests que la
 * esperan pasando. El defecto de 605/610 queda registrado como candidato
 * con formulación más angosta (que el cuerpo tras la apertura traiga voz
 * del cliente o cita), no como regla de puerta.
 * Base: v957 (HEAD a8a80bab, re-estampado de v931 sobre v942; generator.js,
 * demo-captions.js y caption-style.js byte-idénticos entre v942 y v957;
 * server.js = v957 + solo la línea BUILD a v958). Re-numerado v943→v958
 * por monotonicidad (v957 ya vivo al cerrar el lote). Sin app.js -> sin
 * ?v=, sin M78.
 */
const assert = require('assert');
const gen = require('./generator');
const demoCaptions = require('./demo-captions');
const fs = require('fs');
let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  MAL -', name, '::', e.message); }
}
const IN91 = { business: 'Philz Coffee', dna: null, ig_username: 'philzcoffee' };
const IN93 = { business: 'Olive & June', dna: null, ig_username: 'oliveandjune' };
const IN95 = { business: 'Crumbl', dna: null, ig_username: 'crumbl' };
const IN92 = { business: 'BYREDO', dna: null, ig_username: 'officialbyredo' };
const IN94 = { business: 'VEJA', dna: null, ig_username: 'veja' };
const IN12 = { business: 'Posty. ', dna: null, ig_username: 'posty.communitymanager' };

// --- Captions reales (texto completo, dumps juli-2026-11-12-client-u*.json)
const C595 = 'Nuevo blend de la casa ☕\n\nTostado esta semana, de origen único.\n\nPasá por el local y probalo hoy\nTal como pediste: Mix: de todo un poco, sin un único producto estrella\nEn tus palabras: «philz»';
const C596 = 'La merienda se respeta ☕\n\nCafé con leche + 2 medialunas a precio amigo, toda la tarde.\n\nComentá con quién la compartís 👇\nEn tus palabras: «locations»';
const C597 = 'Flat white o latte? ☕\n\nEl flat white lleva menos leche y más café: más intenso. El latte, más suave.\n\nGuardá este post 🔖\nEn tus palabras: «holiday»';
const C601 = 'Holiday Gel Mani System ✨\n\nOlive & June believes in beautiful nails for everyone. Lo tenés a $140, como lo ves.\n\nEscribinos por DM y te contamos cómo empezamos 📩\nEn tus palabras: «holiday»';
const C603 = '3 claves para elegir bien en dip mani essential 👇\n\nCalidad, detalle y que sea de Olive & June: así trabajamos dip mani essential system.\n\nGuardá este posteo para cuando lo necesites 🔖\nEn tus palabras: «Mani»';
const C605 = 'Lo que nos dijo una clienta después de probar Holiday Gel Mani System en Olive & June\n\n¿Ya conocés el Holiday Gel Mani System? ✨\nEs la forma perfecta de llevar el brillo y la alegría de la temporada a tus uñas. Reservá tu espacio y disfrutá de unos días de uñas impecables.';
const C610 = 'Lo que nos dijo una clienta después de probar community manager en Posty.\n\n¿Cuántas veces te pasó que mirás tu Instagram y no sabés qué postear? 😅\nArmá tu semana completa de contenido con diseños, textos y hashtags a medida. Conmigo, el estrés de pensar en qué publicar desaparece.\nAprobá lo que creamos juntos y disfrutá de un feed atractivo. ¿Te animás a probarlo?\n\nPasá por el local hoy';
const C617 = 'NEW Dirty Soda Value Menu ✨\n\nFind fresh-baked Crumbl cookies near you. Yours for $0.99, just like you see it.\n\nOrder yours today by DM 📩\nIn your words: «Cookie»';
const C619 = '3 keys to choosing your scoopable cookie dough well 👇\n\nQuality, detail and the Crumbl standard: that\'s how we do scoopable cookie dough.\n\nSave this post for when you need it 🔖\nIn your words: «week»';
const C621 = 'Customer services ✨\n\nShop Byredo\'s collection of perfumes, candles, makeup, leather and body care.\n\nDM us and we\'ll walk you through how to start 📩\nIn your words: «Byredo»';
const C622 = 'Something new at BYREDO 👀\n\nWe added something this week you will want to see.\n\nStop by the store today 📍\nIn your words: «ones»';
const C633 = 'Something new at VEJA 👀\n\nWe added something this week you will want to see.\n\nStop by the store today 📍\nIn your words: «VEJA»';

console.log('== (A) META-LÍNEA ES — ids reales ==');
ok('A1 id 595 real: "Tal como pediste: Mix:..." se rechaza', () => {
  const chk = gen.captionPasses(C595, IN91);
  assert.strictEqual(chk.ok, false, '595 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-l[íi]nea/i.test(chk.reason), chk.reason);
});
ok('A2 id 596 real: "En tus palabras: «locations»" se rechaza', () => {
  const chk = gen.captionPasses(C596, IN91);
  assert.strictEqual(chk.ok, false, '596 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-l[íi]nea/i.test(chk.reason), chk.reason);
});
ok('A3 id 597 real: "En tus palabras: «holiday»" se rechaza', () => {
  const chk = gen.captionPasses(C597, IN91);
  assert.strictEqual(chk.ok, false, '597 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-l[íi]nea/i.test(chk.reason), chk.reason);
});
ok('A4 id 601 real: eco ES en caption con frase en inglés se rechaza', () => {
  const chk = gen.captionPasses(C601, IN93);
  assert.strictEqual(chk.ok, false, '601 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-l[íi]nea/i.test(chk.reason), chk.reason);
});
ok('A5 id 603 real: "En tus palabras: «Mani»" se rechaza', () => {
  const chk = gen.captionPasses(C603, IN93);
  assert.strictEqual(chk.ok, false, '603 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-l[íi]nea/i.test(chk.reason), chk.reason);
});

console.log('== (B) META-LINE EN — ids reales ==');
ok('B1 id 617 real: "In your words: «Cookie»" se rechaza', () => {
  const chk = gen.captionPassesEn(C617, IN95);
  assert.strictEqual(chk.ok, false, '617 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-line/i.test(chk.reason), chk.reason);
});
ok('B2 id 619 real: "In your words: «week»" se rechaza', () => {
  const chk = gen.captionPassesEn(C619, IN95);
  assert.strictEqual(chk.ok, false, '619 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-line/i.test(chk.reason), chk.reason);
});
ok('B3 id 621 real: "In your words: «Byredo»" se rechaza', () => {
  const chk = gen.captionPassesEn(C621, IN92);
  assert.strictEqual(chk.ok, false, '621 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-line/i.test(chk.reason), chk.reason);
});
ok('B4 id 622 real: eco EN en fallback genérico se rechaza', () => {
  const chk = gen.captionPassesEn(C622, IN92);
  assert.strictEqual(chk.ok, false, '622 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-line/i.test(chk.reason), chk.reason);
});
ok('B5 id 633 real: "In your words: «VEJA»" se rechaza', () => {
  const chk = gen.captionPassesEn(C633, IN94);
  assert.strictEqual(chk.ok, false, '633 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/meta-line/i.test(chk.reason), chk.reason);
});

console.log('== (D) CONTROLES QUE PASAN — la regla no muerde texto humano ==');
ok('D1 caption ES limpio (base del 595, sin meta-línea) sigue pasando', () => {
  const cap = 'Nuevo blend de la casa ☕\n\nTostado esta semana, de origen único.\n\nPasá por el local y probalo hoy. Escribime por DM.';
  const chk = gen.captionPasses(cap, IN91);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('D2 "tal como pediste," con coma (frase natural) pasa', () => {
  const cap = 'El blend que pediste, tal como pediste, tostado esta semana y listo para llevar.\n\nPasá por el local y probalo hoy. Escribime por DM.';
  const chk = gen.captionPasses(cap, IN91);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('D3 "pediste" suelto sin dos puntos pasa', () => {
  const cap = 'Me pediste algo simple y acá está: el café de la casa, sin vueltas.\n\nPasá por el local hoy. Escribime por DM.';
  const chk = gen.captionPasses(cap, IN91);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('D4 "Contanos en tus palabras:" a mitad de línea (CTA legítimo) pasa', () => {
  const cap = 'Probaste el blend nuevo? Contanos en tus palabras: qué te pareció.\n\nPasá por el local y probalo hoy. Escribime por DM.';
  const chk = gen.captionPasses(cap, IN91);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('D5 caption EN limpio sin eco sigue pasando', () => {
  const cap = 'NEW Dirty Soda Value Menu ✨\n\nFind fresh-baked Crumbl cookies near you. Yours for $0.99, just like you see it.\n\nOrder yours today by DM 📩';
  const chk = gen.captionPassesEn(cap, IN95);
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (E) RESOLVER — la escalera cae al caption limpio ==');
const TOPIC_OK = { kind: 'novedad', headline: 'Nuevo blend de la casa', subline: '', caption: 'Nuevo blend de la casa ☕\n\nTostado esta semana, de origen único.\n\nPasá por el local y probalo hoy', digest_anchor: '' };
ok('E1 resolveTrialCaption con voiceLine devuelve el caption SIN eco', () => {
  const r = demoCaptions.resolveTrialCaption([TOPIC_OK], 'cafeterias', {
    business: 'Philz Coffee', tone: 'canchero', country: 'AR', idx: 0,
    goalLine: '\nTal como pediste: Mix: de todo un poco', lang: 'es',
    prevCaptions: [], voiceLine: '\nEn tus palabras: «philz»',
  });
  assert.ok(!/en tus palabras|tal como pediste/i.test(r.caption), 'el eco sobrevivió: ' + JSON.stringify(r.caption));
  assert.ok(r.caption.includes('Nuevo blend de la casa'), JSON.stringify(r.caption));
});
ok('E2 resolveTrialCaption con voiceLine EN devuelve el caption SIN eco', () => {
  const topicEn = { kind: 'novedad', headline: 'NEW Dirty Soda Value Menu', subline: '', caption: 'NEW Dirty Soda Value Menu ✨\n\nFind fresh-baked Crumbl cookies near you. Yours for $0.99, just like you see it.\n\nOrder yours today by DM 📩', digest_anchor: '' };
  const r = demoCaptions.resolveTrialCaption([topicEn], 'cafeterias', {
    business: 'Crumbl', tone: 'canchero', country: 'US', idx: 0,
    goalLine: '', lang: 'en', prevCaptions: [], voiceLine: '\nIn your words: «Cookie»',
  });
  assert.ok(!/in your words|as you asked/i.test(r.caption), 'el eco sobrevivió: ' + JSON.stringify(r.caption));
});
ok('E3 fallback sin tema válido sale pelado (sin voiceLine)', () => {
  const bad = { kind: 'tip', headline: 'x', subline: '', caption: 'x', digest_anchor: '' };
  const r = demoCaptions.resolveTrialCaption([bad], 'cafeterias', {
    business: 'Philz Coffee', tone: 'canchero', country: 'AR', idx: 0,
    goalLine: '', lang: 'es', prevCaptions: [], voiceLine: '\nEn tus palabras: «locations»',
  });
  assert.strictEqual(r.fallback, true, 'no cayó al fallback: ' + JSON.stringify(r));
  assert.ok(!/en tus palabras/i.test(r.caption), 'el eco sobrevivió en el fallback: ' + JSON.stringify(r.caption));
});

console.log('== (F) CHECKLIST — regla 26 nombra los rótulos ==');
ok('F1 caption-style.js regla 26 menciona "En tus palabras" y "Tal como pediste"', () => {
  const src = fs.readFileSync('./caption-style.js', 'utf8');
  assert.ok(src.includes('En tus palabras'), 'regla 26 sin "En tus palabras"');
  assert.ok(src.includes('Tal como pediste'), 'regla 26 sin "Tal como pediste"');
  assert.ok(src.includes('In your words'), 'regla 26 sin "In your words"');
});

console.log(`\nTOTAL: ${pass} ok, ${fail} mal`);
process.exit(fail ? 1 : 0);
