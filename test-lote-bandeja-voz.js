// test-lote-bandeja-voz.js — LOTE BANDEJA-VOZ (22/11/2026)
// La voz con la que la bandeja redacta las respuestas: el dueño vio en su
// captura que al comentario «🔥» el borrador decía «¡Gracias por
// escribirnos! 🙌» — «La respuesta no se ve como una persona, se ve como
// ia». Esta suite compone borradores para una batería de clases de
// comentario (reacción · elogio · precio · pregunta · queja · mensaje
// real) en ES y EN, sobre dos negocios con voces distintas, y afirma las
// reglas de voz una por una:
//   · la fórmula de gratitud no aparece en NINGÚN borrador;
//   · la clase reacción se responde en espejo (corta, con su emoji) —
//     el caso fundante produce «se viene 🔥»;
//   · el ancla y la voz del fundamento viajan en el prompt;
//   · el candado de voz retira la fórmula si el modelo la escribe y
//     conserva el dato real que traía;
//   · la puerta de datos de siempre sigue intacta (precio que no está
//     en el fundamento → needs_human).
// El camino del modelo se ejerce con fetch interceptado (respuestas
// guionadas, cero gasto de IA). Uso:
//   node test-lote-bandeja-voz.js [root]   (default: el árbol del archivo)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const gen = require(path.join(ROOT, 'generator.js'));

let ok = 0, mal = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('ok  ', nombre); }
  else { mal++; console.log('MAL ', nombre, detalle !== undefined ? '→ ' + JSON.stringify(detalle) : ''); }
}
const FORMULA = /(gracias por (escribirnos|tu mensaje|su mensaje|contactarnos|comunicarte|comunicarse|escribir|el mensaje)|thank(s| you) for (reaching out|your message|contacting us|getting in touch|messaging us))/i;
const sinFormula = (r) => !FORMULA.test(String(r || ''));

// Dos negocios con voces distintas. La casa (ES) y una panadería (EN).
const CASA = {
  business: 'Posty.', category: 'community manager', tone: 'canchero', lang: 'es',
  fundamento: {
    servicios: [{ nombre: 'Community manager para tu negocio', precio: 'USD 199' }],
    productos: [], promos: [], ciudad: '',
    voz_marcadores: ['se viene', 'tus community managers'],
  },
  horarios: 'lunes a viernes de 9 a 18',
  postCaption: 'Esto es Posty: tus community managers. Posteamos por tu negocio todos los días, con tu producto real. 🚀 Arrancamos el 1° de febrero.',
};
const CRUMB = {
  business: 'Crumb & Co', category: 'bakery', tone: 'warm', lang: 'en',
  fundamento: {
    servicios: [], productos: [{ nombre: 'Sourdough loaf', precio: '$12' }], promos: [], ciudad: '',
    voz_marcadores: ['baked at dawn', 'from our oven'],
  },
  horarios: 'Tue–Sat 8–14',
  postCaption: 'Our sourdough loaf, baked at dawn every day.',
};
const args = (base, commentText, extra) => ({ ...base, username: 'reyveronica_', commentText, ...(extra || {}) });

(async () => {
  // ---------- A. Caminos determinísticos (sin API key) ----------
  let r = await gen.suggestReplyDetailed(args(CASA, '🔥'), '');
  check('A1 fundante: 🔥 en la casa → «se viene 🔥»', r.reply === 'se viene 🔥', r.reply);
  r = await gen.suggestReplyDetailed(args(CRUMB, '🔥'), '');
  check('A2 fundante EN: 🔥 → "it\'s coming 🔥"', r.reply === "it's coming 🔥", r.reply);
  r = await gen.suggestReplyDetailed(args(CASA, '😍'), '');
  check('A3 espejo: 😍 se responde 😍, corto y sin fórmula', r.reply === '😍' && sinFormula(r.reply), r.reply);
  r = await gen.suggestReplyDetailed(args(CASA, '¡hermoso el posteo!'), '');
  check('A4 elogio ES: corto y sin fórmula', sinFormula(r.reply) && r.reply.length <= 30, r.reply);
  r = await gen.suggestReplyDetailed(args(CRUMB, 'beautiful post!'), '');
  check('A5 elogio EN: corto y sin fórmula', sinFormula(r.reply) && r.reply.length <= 30, r.reply);
  r = await gen.suggestReplyDetailed(args(CASA, '¿cuánto sale el community manager?'), '');
  check('A6 precio ES con fundamento: confirma sin fórmula', r.reply === 'te lo confirmo enseguida por acá' && sinFormula(r.reply), r.reply);
  r = await gen.suggestReplyDetailed(args(CRUMB, 'how much is the sourdough loaf?'), '');
  check('A7 precio EN con fundamento: confirma sin fórmula', sinFormula(r.reply) && /confirm/i.test(r.reply), r.reply);
  r = await gen.suggestReplyDetailed(args(CASA, 'el pedido llegó mal, una vergüenza'), '');
  check('A8 queja ES: reconoce (perdón/contame) y sin fórmula', sinFormula(r.reply) && /(perdón|contame)/i.test(r.reply), r.reply);
  r = await gen.suggestReplyDetailed(args(CRUMB, 'the order arrived wrong, terrible service'), '');
  check('A9 queja EN: reconoce (sorry) y sin fórmula', sinFormula(r.reply) && /sorry/i.test(r.reply), r.reply);
  r = await gen.suggestReplyDetailed(args(CASA, '¿hacen envíos a todo el país?', { fundamento: null, horarios: '' }), '');
  check('A10 pregunta ES sin fundamento: invita al DM, sin fórmula', sinFormula(r.reply) && /privado/i.test(r.reply), r.reply);
  r = await gen.suggestReplyDetailed(args(CRUMB, 'I just wanted to say your bread changed my mornings, been coming every week'), '');
  check('A11 mensaje real EN: responde sin abrir con fórmula', sinFormula(r.reply) && r.reply.length > 0, r.reply);
  r = await gen.suggestReplyDetailed(args(CASA, 'quería contarles que probé el servicio por recomendación de una amiga y me viene bárbaro'), '');
  check('A12 mensaje real ES: responde sin abrir con fórmula', sinFormula(r.reply) && r.reply.length > 0, r.reply);
  r = await gen.suggestReplyDetailed(args(CASA, '¿cuánto sale el corte?', {
    fundamento: { servicios: [{ nombre: 'Corte de pelo', precio: '' }], productos: [], promos: [], ciudad: '' },
  }), '');
  check('A13 la puerta de datos sigue: precio sin precio en el fundamento → needs_human', r.needsHuman === true, r);

  // ---------- B. Camino del modelo (fetch interceptado) ----------
  const fetchReal = global.fetch;
  let scripted = '', lastBody = null;
  global.fetch = async (url, opts) => {
    lastBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: scripted } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) };
  };
  try {
    scripted = '¡Gracias por escribirnos! 🙌';
    r = await gen.suggestReplyDetailed(args(CASA, '🔥'), 'sk-test');
    check('B1 candado: el modelo escribe la fórmula ante 🔥 → sale el espejo', r.reply === 'se viene 🔥', r.reply);
    const sys = lastBody.messages[0].content;
    check('B2 prompt: la fórmula está prohibida por escrito', sys.includes('PROHIBIDA la fórmula de gratitud'), sys.slice(-400));
    check('B3 prompt: instrucción de la clase reacción', sys.includes('SOLO una reacción'), '');
    check('B4 prompt: la voz del negocio viaja (sus frases)', sys.includes('tus community managers'), '');
    check('B5 prompt: el ancla del posteo viaja (su caption)', sys.includes('Esto es Posty: tus community managers'), '');
    check('B6 prompt: el comentario llega como mensaje del usuario', lastBody.messages[1].content.includes('🔥'), lastBody.messages[1].content);

    scripted = '¡Qué lindo que te gustó el posteo! Seguimos subiendo cosas nuevas todas las semanas para toda la comunidad, estate atenta a lo que se viene muy pronto.';
    r = await gen.suggestReplyDetailed(args(CASA, '🔥'), 'sk-test');
    check('B7 candado espejo: respuesta larga ante 🔥 → espejo corto', r.reply === 'se viene 🔥', r.reply);

    scripted = '¡Gracias por tu mensaje! Abrimos los sábados de 9 a 13.';
    r = await gen.suggestReplyDetailed(args(CASA, 'hola, ¿el sábado abren?', { horarios: 'sábados de 9 a 13' }), 'sk-test');
    check('B8 candado: fórmula + dato real → queda el dato, sin fórmula', r.reply === 'Abrimos los sábados de 9 a 13.' && sinFormula(r.reply), r.reply);

    scripted = '¡Gracias por escribirnos! El community manager sale USD 199 por mes.';
    r = await gen.suggestReplyDetailed(args(CASA, '¿cuánto sale el community manager?'), 'sk-test');
    check('B9 candado: fórmula + precio real → queda el precio, sin fórmula', sinFormula(r.reply) && r.reply.includes('USD 199'), r.reply);

    scripted = 'Thanks for reaching out! Tell me your order number and I will check it today.';
    r = await gen.suggestReplyDetailed(args(CRUMB, 'the order arrived wrong, terrible service'), 'sk-test');
    check('B10 candado EN: fórmula + paso concreto → queda el paso, sin fórmula', sinFormula(r.reply) && r.reply.includes('order number'), r.reply);

    scripted = 'ese es justo el community manager del posteo: sale USD 199 y arranca el 1° de febrero 🔥';
    r = await gen.suggestReplyDetailed(args(CASA, '¿cuánto sale el community manager?'), 'sk-test');
    check('B11 respuesta humana anclada: pasa intacta', r.reply === scripted, r.reply);

    scripted = 'Thanks for reaching out! 🙌';
    r = await gen.suggestReplyDetailed(args(CRUMB, '🔥'), 'sk-test');
    const sysEn = lastBody.messages[0].content;
    check('B12 candado EN: la fórmula ante 🔥 → espejo EN', r.reply === "it's coming 🔥", r.reply);
    check('B13 prompt EN: la fórmula está prohibida y la voz viaja', sysEn.includes('the gratitude formula is BANNED') && sysEn.includes('baked at dawn'), '');
  } finally {
    global.fetch = fetchReal;
  }

  // ---------- C. Estática y clasificador ----------
  const srcGen = fs.readFileSync(path.join(ROOT, 'generator.js'), 'utf8');
  const srcIns = fs.readFileSync(path.join(ROOT, 'insights.js'), 'utf8');
  const srcBan = fs.readFileSync(path.join(ROOT, 'bandeja.js'), 'utf8');
  check('C1 generator: la fórmula ya no existe como fallback', !srcGen.includes('¡Gracias por escribirnos! 🙌') && !srcGen.includes('Thanks for reaching out! 🙌'), '');
  check('C2 insights: ningún catch escribe la fórmula', !srcIns.includes('¡Gracias por escribirnos!'), '');
  check('C3 bandeja: el ancla viaja (postCaption en los dos llamados de comentarios)', (srcBan.match(/prepararBorrador\(d, uid, \{[^}]*postCaption: m\.caption/g) || []).length === 2 && srcBan.includes('postCaption: args.postCaption'), '');
  const claseDe = (t) => (typeof gen.replyClass === 'function' ? gen.replyClass(t) : '(replyClass no existe en este árbol)');
  check('C4 clases: 🔥 → reaccion', claseDe('🔥') === 'reaccion', claseDe('🔥'));
  check('C5 clases: precio → dato', claseDe('¿cuánto sale?') === 'dato', claseDe('¿cuánto sale?'));
  check('C6 clases: elogio → elogio', claseDe('¡qué lindo!') === 'elogio', claseDe('¡qué lindo!'));
  check('C7 clases: queja → queja', claseDe('el pedido llegó mal, una vergüenza') === 'queja', claseDe('el pedido llegó mal, una vergüenza'));
  check('C8 clases: pregunta → pregunta', claseDe('¿hacen envíos?') === 'pregunta', claseDe('¿hacen envíos?'));
  check('C9 clases: mensaje escrito → mensaje', claseDe('quería contarles que probé el servicio por recomendación de una amiga') === 'mensaje', claseDe('quería contarles que probé el servicio por recomendación de una amiga'));

  console.log(`\nBANDEJA-VOZ sobre ${ROOT}: ${ok} ok · ${mal} MAL`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(2); });
