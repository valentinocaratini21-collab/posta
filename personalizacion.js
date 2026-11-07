// personalizacion.js — LOTE PERSONALIZACIÓN DE POSTEOS (6/11, Valentino: «Dale, arma todo»).
// Motor de personalización: logo, 3 ángulos (ondas), voz del cliente,
// historia del producto, testimonio con cita real. Todo PURO y testeable:
// sin DB, sin red, sin estado. Lo que toca DB/red vive en server.js.
// REGLAS DURAS (del lote): nunca inventar nada — sin frase real guardada
// no hay posteo de testimonio (fail-closed); sin historia real no hay
// historia; sin logo en el fundamento no se dibuja uno; sin datos reales
// de IG no hay «lo que funcionó» (manda el gusto elegido por toques).
// Los prompts jamás se muestran crudos al cliente: ANGULOS_ONDA lleva el
// brief INTERNO (briefInterno) que solo usa el generador; lo que viaja al
// cliente son posteos terminados (generarOpcionesOnda devuelve solo eso).
// ÍTEM 2 — REFERENCIA: mock v3 (~/workspace/onboarding-prompts-mock-v3.png,
// aprobado por Valentino 6/11 ~21:15): EL MISMO producto en las 3 tarjetas,
// 3 versiones distintas (héroe vertical / detalle del logo / aviso
// horizontal crema); producto NUNCA cortado en ninguna tarjeta.
'use strict';

// ---------------------------------------------------------------------------
// ÍTEM 2 — LOS 3 ÁNGULOS (ondas): vender / historia / enseñar.
// Cada ángulo tiene su brief interno (prompt distinto → posteo distinto:
// VARIEDAD-54: «prompts distintos no son variedad» si la dirección de arte
// es la misma) y su dirección de arte. El cliente nunca ve el brief.
// ---------------------------------------------------------------------------
const ANGULOS_ONDA = [
  {
    id: 'vender',
    formatoEs: 'Promo', formatoEn: 'Promo', tipo: 'promo',
    // Chips y layouts según el MOCK V3 (referencia, aprobado por Valentino
    // 6/11 ~21:15): el MISMO producto en las 3 tarjetas, 3 versiones.
    // Card 1 = héroe vertical entera («directo, para vender»).
    chipEs: 'directo, para vender', chipEn: 'direct, to sell',
    variante: 'heroe',
    labelEs: 'VENDER', labelEn: 'SELL',
    // Brief interno: qué tiene que lograr el posteo (nunca va al cliente).
    briefInternoEs: 'Vender: el producto estrella como protagonista entero, precio real si lo hay, urgencia solo con dato real (stock o fecha). Una sola idea: que escriban para pedirlo.',
    briefInternoEn: 'Sell: the star product as the whole protagonist, real price if there is one, urgency only with a real fact (stock or date). One idea: get them to write and order it.',
    arteEs: 'Foto del producto entero, sin cortar, en primer plano; fondo limpio del local; luz natural.',
    arteEn: 'Photo of the whole product, never cropped, front and center; clean backdrop from the shop; natural light.',
  },
  {
    id: 'historia',
    formatoEs: 'Detrás de escena', formatoEn: 'Behind the scenes', tipo: 'detras',
    // Card 2 = detalle («la historia de la prenda»): el mismo producto en
    // detalle (el logo, el detalle que lo hace reconocible).
    chipEs: 'la historia', chipEn: 'the story',
    variante: 'detalle',
    labelEs: 'HISTORIA', labelEn: 'STORY',
    briefInternoEs: 'Historia: contar el origen o un momento real del producto con el dato del fundamento, sin inventar nada. Si el dato no alcanza para una historia, mostrar el proceso real en vez de adornar.',
    briefInternoEn: 'Story: tell the origin or a real moment of the product using the foundation fact, inventing nothing. If the fact is not enough for a story, show the real process instead of dressing it up.',
    arteEs: 'Manos trabajando, el proceso real, un detalle que solo ese negocio tiene; nada posado.',
    arteEn: 'Hands at work, the real process, a detail only this business has; nothing posed.',
  },
  {
    id: 'ensenar',
    formatoEs: 'Tip', formatoEn: 'Tip', tipo: 'tip',
    // Card 3 = aviso HORIZONTAL crema («tip, para enseñar»): foto a la
    // izquierda, datos a la derecha.
    chipEs: 'tip, para enseñar', chipEn: 'tip, to teach',
    variante: 'aviso',
    labelEs: 'ENSEÑAR', labelEn: 'TEACH',
    briefInternoEs: 'Enseñar: un tip útil y concreto sobre el producto estrella, que se pueda guardar. El tip sale del fundamento o del uso real del producto; jamás un consejo genérico que serviría para cualquier negocio.',
    briefInternoEn: 'Teach: one useful, concrete tip about the star product, worth saving. The tip comes from the foundation or the real use of the product; never a generic tip that would fit any business.',
    arteEs: 'El producto en uso, el gesto o el detalle que enseña el tip; texto mínimo en la imagen.',
    arteEn: 'The product in use, the gesture or detail that teaches the tip; minimal text on the image.',
  },
];
const ONDA_IDS = ANGULOS_ONDA.map((a) => a.id);
function ondaValida(id) { return ONDA_IDS.includes(String(id || '').trim().toLowerCase()); }
function anguloOnda(id) {
  const k = String(id || '').trim().toLowerCase();
  return ANGULOS_ONDA.find((a) => a.id === k) || null;
}

// Corta un título a N palabras como máximo, sin partir palabras
// (misma regla que el resto del generador: lo cortado se muestra cortado).
function cortarPalabras(t, max) {
  const w = String(t || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (w.length <= max) return w.join(' ');
  return w.slice(0, max).join(' ') + '…';
}

// ÍTEM 2 — Motor de las 3 opciones terminadas (el mock: 3 posteos de la
// remera Corteiz, 3 ángulos). SIN IA: plantillas sobre datos reales.
// Solo se usa lo que viene en el input: producto (obligatorio), precio,
// diferencial/historia (opcionales). Sin precio no se pone precio; sin
// historia, la opción de historia invita a contarla (pregunta, no afirmación
// inventada). La respuesta lleva SOLO lo que ve el cliente: nunca el brief.
function generarOpcionesOnda({ producto, precio, foto, diferencial, historia, lang } = {}) {
  const en = lang === 'en';
  const prod = String(producto || '').replace(/\s+/g, ' ').trim();
  if (!prod) return [];
  const pr = String(precio || '').replace(/\s+/g, ' ').trim();
  const precioTxt = !pr ? '' : (/^[$€£¥]|^usd\b/i.test(pr) ? ` ${pr}.` : ` $${pr}.`);
  const dif = String(diferencial || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const his = String(historia || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const fotoUrl = (foto && /^https?:\/\//.test(String(foto))) ? String(foto) : null;
  const vender = en
    ? { id: 'vender', chip: 'direct, to sell', titulo: cortarPalabras(`This is ${prod}`, 6), caption: `This is ${prod}.${precioTxt} Write us here and we'll tell you everything.`, formato: 'Promo' }
    : { id: 'vender', chip: 'directo, para vender', titulo: cortarPalabras(`Este es ${prod}`, 6), caption: `Este es ${prod}.${precioTxt} Escribinos por acá y te contamos todo.`, formato: 'Promo' };
  const historiaOp = en
    ? { id: 'historia', chip: 'the story', titulo: cortarPalabras(`The story of ${prod}`, 6), caption: his ? `Behind ${prod}: ${his}` : `Behind ${prod} there's a story worth telling. Shall we tell it?`, formato: 'Behind the scenes' }
    : { id: 'historia', chip: 'la historia', titulo: cortarPalabras(`La historia de ${prod}`, 6), caption: his ? `Detrás de ${prod}: ${his}` : `Detrás de ${prod} hay una historia que vale la pena. ¿La contamos?`, formato: 'Detrás de escena' };
  const ensenar = en
    ? { id: 'ensenar', chip: 'tip, to teach', titulo: cortarPalabras(`How to get the most from ${prod}`, 6), caption: `Here's how ${prod} is used to get the most out of it. Save it for later.`, formato: 'Tip' }
    : { id: 'ensenar', chip: 'tip, para enseñar', titulo: cortarPalabras(`Cómo aprovechar ${prod}`, 6), caption: `Te mostramos cómo se usa ${prod} para sacarle el jugo. Guardalo para después.`, formato: 'Tip' };
  // El diferencial real, si lo hay, vive en la opción de historia como dato.
  if (dif && !his) {
    historiaOp.caption = en
      ? `What makes ${prod} different: ${dif}`
      : `Lo que hace distinto a ${prod}: ${dif}`;
  }
  const out = [vender, historiaOp, ensenar].map((o) => {
    const a = ANGULOS_ONDA.find((x) => x.id === o.id) || {};
    // variante = layout de la tarjeta según el mock v3 (heroe / detalle /
    // aviso): el MISMO producto y la MISMA foto en las 3; lo que cambia es
    // el ángulo y el layout, nunca el producto.
    return { ...o, foto: fotoUrl, tipo: a.tipo || '', variante: a.variante || '' };
  });
  return out;
}

// Reordena el pool de ideas para que el ángulo elegido por el cliente
// abra la semana (su palabra manda). No cambia el total ni los tipos:
// solo mueve el slot del ángulo al frente. Sin onda válida, intacto.
function ordenarPoolPorOnda(pool, onda) {
  if (!Array.isArray(pool) || !pool.length) return pool;
  const a = anguloOnda(onda);
  if (!a) return pool;
  const idx = pool.findIndex((p) => p && (p.formato === a.formatoEs || p.formato === a.formatoEn));
  if (idx <= 0) return pool;
  const next = pool.slice();
  const [pick] = next.splice(idx, 1);
  next.unshift(pick);
  return next;
}

// ---------------------------------------------------------------------------
// ÍTEM 3 — SU VOZ: marcadores aprendidos de SUS captions y SUS respuestas.
// Determinístico, sin IA: palabras y frases de 2 palabras que el cliente
// repite de verdad. Se guardan en el fundamento (digest.voz_marcadores)
// en el estudio y viajan al brief; el generador las usa tal cual.
// ---------------------------------------------------------------------------
const VOZ_STOP = new Set(String(
  // Español: funcionales + genéricos de Instagram + palabras de Posty.
  'el la los las de del un una unos unas y o en a con por para que se su sus al lo como mas mas pero le ya este esta estos estas eso esa ese aquel aquella soy eres es somos son estoy estas esta estamos estan fue fui ser estar haber tener tengo tienes tiene tenemos hago haces hace hacemos hacen voy vas va vamos van puedo puedes puede podemos pueden quiero quieres quiere queremos quieren digo dices dice decimos dicen veo ves ve vemos ven sepa sabes sabe sabemos saben dar doy das da damos dan ir venir salir entrar poner sacar dejar seguir quedar pasar llevar traer mirar escuchar hablar escribir leer vivir sentir pensar creer deber poder haber muy mas menos mas tan tanto tanta tantos tantas cada todo todos todas nada nadie alguien algo alguno algunos ninguna ningun quien quienes cual cuales cuando donde como porque pues si no ni aunque pero sino hasta desde durante contra entre hacia segun sin sobre tras ante bajo cabe conmigo contigo consigo mismo misma mismos mismas otro otra otros otras vez veces hoy ayer mañana ahora luego despues antes siempre nunca jamas tambien tampoco solo solamente apenas casi igual mismo mayor menor mejor peor primero segundo tercero ultimo cada cual'
  + ' mucho mucha muchos muchas poco poca pocos pocas bastante demasiado'
  + ' the be to of and a in that it was for on are as with his they i at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part over new sound take only little work know place year live me back give most very after thing our just name good sentence man think say great where help through much before line right too mean old any same tell boy follow came want show also around form three small set put end does another well large must big even such because turn here why ask went men read need land different home us move try kind hand picture again change off play spell air away animal house point page letter mother answer found study still learn should world high every near add food between own below country plant last school father keep tree never start city earth eye light thought head under story saw left few while along might close something seem next hard open example begin life always those both paper together got group often run'
  + ' link bio seguinos seguime escribinos escribime dm instagram post reel historia historias promo oferta descuento nuevo nueva lanzamiento gracias hola chau buen dia dias semana local sucursal turnos reservas envios envio delivery retiro pedido pedidos compra comprar venta ventas cliente clientes negocio emprender emprendimiento posty posta'
).split(/\s+/).filter(Boolean));

function _limpiarTextoVoz(t) {
  return String(t || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#]\w+/g, (m) => ' ' + m.slice(1)) // el # y el @ fuera; la palabra queda
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s'’]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function _normVoz(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function _esContenido(w) {
  const n = _normVoz(w);
  return n.length >= 3 && !VOZ_STOP.has(n) && !/^\d+$/.test(n);
}

// captions: sus captions de IG. respuestas: sus respuestas (chat/onboarding).
// Devuelve hasta 8 marcadores (palabras sueltas distintivas + frases de 2
// palabras), en el orden en que más se repiten. Sin textos, [].
function extraerMarcadoresVoz(captions, respuestas) {
  // Las frases no cruzan comas ni puntos: cada texto se parte en segmentos
  // («de barrio, café de especialidad» no da «barrio café»). La presencia
  // se cuenta por texto original, no por segmento.
  const fuentes = [...(Array.isArray(captions) ? captions : []), ...(Array.isArray(respuestas) ? respuestas : [])];
  const segmentos = [];
  fuentes.forEach((t, ti) => {
    for (const seg of String(t || '').split(/[,;.!?¿¡\n]+/)) {
      const limpio = _limpiarTextoVoz(seg);
      if (limpio.length >= 3) segmentos.push({ texto: limpio, ti });
    }
  });
  if (!segmentos.length) return [];
  const presencia = new Map(); // clave normalizada -> { display, textos:Set, total }
  const total = new Map();
  const ver = (clave, display) => {
    if (!presencia.has(clave)) presencia.set(clave, { display, textos: new Set(), total: 0 });
    return presencia.get(clave);
  };
  segmentos.forEach(({ texto, ti }) => {
    const palabras = texto.split(' ').filter(Boolean);
    const vistas = new Set();
    const anotar = (clave, display) => {
      if (!clave) return;
      const e = ver(clave, display);
      if (!vistas.has(clave)) { e.textos.add(ti); vistas.add(clave); }
      e.total += 1;
      total.set(clave, (total.get(clave) || 0) + 1);
    };
    for (let i = 0; i < palabras.length; i++) {
      const w = palabras[i];
      if (_esContenido(w) && _normVoz(w).length >= 4) anotar('w:' + _normVoz(w), w);
      // Frase de 2 palabras de contenido: juntas, o con UN conector corto
      // entre medio («hecho a mano», «con mucho amor»): la frase se guarda
      // con el conector, tal como la escribe el cliente.
      for (let j = i + 1; j <= Math.min(i + 2, palabras.length - 1); j++) {
        const b = palabras[j];
        if (!_esContenido(b)) continue;
        if (j === i + 2) {
          const medio = palabras[i + 1];
          // Conectores que unen UNA frase («hecho a mano», «café de
          // especialidad»). La «y» NO une: «especialidad y medialunas»
          // son dos cosas distintas, no una frase del cliente.
          const esConector = ['a', 'de', 'con', 'en', 'por', 'para', 'sin', 'del', 'al', 'su', 'sus'].includes(_normVoz(medio));
          if (!esConector) continue;
        }
        if (_esContenido(w)) {
          const frase = palabras.slice(i, j + 1).join(' ');
          anotar('f:' + _normVoz(frase), frase);
        }
      }
    }
  });
  const cands = [];
  for (const [clave, e] of presencia) {
    const esFrase = clave.startsWith('f:');
    // Palabra suelta: tiene que aparecer en 2+ textos (firma real).
    // Frase de 2 palabras: con 1 texto alcanza (es distintiva).
    if (!esFrase && e.textos.size < 2) continue;
    // Frase: solo importan la primera y la última palabra (el conector
    // del medio — «a» en «hecho a mano» — no descalifica la frase).
    if (esFrase) {
      const ws = e.display.split(' ');
      if (_normVoz(ws[0]).length < 3 || _normVoz(ws[ws.length - 1]).length < 3) continue;
    }
    cands.push({ display: e.display, textos: e.textos.size, total: e.total, frase: esFrase });
  }
  cands.sort((x, y) => (y.textos - x.textos) || (y.total - x.total) || (y.display.length - x.display.length));
  // Sin duplicar: una frase que contiene una palabra ya elegida no suma.
  const out = [];
  for (const c of cands) {
    if (out.length >= 8) break;
    const nc = _normVoz(c.display);
    if (out.some((o) => _normVoz(o).includes(nc) || nc.includes(_normVoz(o)))) continue;
    out.push(c.display);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Líneas del brief (ideasInputFor / openaiIdeas): solo se emiten cuando hay
// dato real. Vacío = la semana se arma como hoy (fail-open al resto).
// ---------------------------------------------------------------------------
function lineaVoz(marcadores, lang) {
  const ms = (Array.isArray(marcadores) ? marcadores : []).map((m) => String(m || '').trim()).filter(Boolean).slice(0, 8);
  if (!ms.length) return '';
  return lang === 'en'
    ? `CLIENT'S OWN VOICE (their real words, from their captions and replies — use them as-is in headlines and captions, with their rhythm; never force them where they don't fit): ${ms.join(' · ')}`
    : `VOZ DEL CLIENTE (sus palabras reales, de sus captions y respuestas — usalas tal cual en títulos y captions, con su ritmo; nunca las fuerces donde no calzan): ${ms.join(' · ')}`;
}
function lineaOnda(onda, lang) {
  const a = anguloOnda(onda);
  if (!a) return '';
  return lang === 'en'
    ? `ANGLE CHOSEN BY THE CLIENT (picked with one tap, their word rules): ${a.labelEn}. At least 2 of the 7 ideas with that angle, leading the week.`
    : `ONDA ELEGIDA POR EL CLIENTE (la eligió con un toque, su palabra manda): ${a.labelEs}. Al menos 2 de las 7 ideas con ese ángulo, abriendo la semana.`;
}
function lineaHistoriaProducto(historia, producto, lang) {
  const h = String(historia || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!h) return '';
  const p = String(producto || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return lang === 'en'
    ? `REAL STORY OF THE PRODUCT (foundation fact, invent nothing else): ${p ? p + ' — ' : ''}${h}. At least one idea tells this story as it is. If the fact is not enough for a story, show the real process instead of dressing it up.`
    : `HISTORIA REAL DEL PRODUCTO (dato del fundamento, no inventar nada más): ${p ? p + ' — ' : ''}${h}. Al menos una idea cuenta esta historia tal cual. Si el dato no alcanza para una historia, mostrá el proceso real en vez de adornarla.`;
}
function lineaTestimonio(citas, lang) {
  const cs = (Array.isArray(citas) ? citas : [])
    .map((c) => ({ texto: String((c && c.texto) || '').replace(/\s+/g, ' ').trim().slice(0, 200), autor: String((c && c.autor) || '').replace(/\s+/g, ' ').trim().slice(0, 40) }))
    .filter((c) => c.texto.length >= 8);
  if (!cs.length) return '';
  const lista = cs.map((c) => `«${c.texto}» — ${c.autor || 'cliente'}`).join(' · ');
  return lang === 'en'
    ? `REAL TESTIMONIALS (word-for-word quotes from real customers — use them as-is; FORBIDDEN to invent or dress up a quote; with no quote in this list, there is NO testimonial post): ${lista}`
    : `TESTIMONIOS REALES (citas textuales de clientes reales — usalas tal cual; PROHIBIDO inventar o adornar una cita; sin cita en esta lista, NO hay posteo de testimonio): ${lista}`;
}

// ÍTEM 5 — Slot «Historia del producto» para las plantillas: reemplaza al
// slot «Detrás de escena» (mismo tipo 'detras') SOLO cuando hay historia
// real (historiaProducto). Sin historia, el slot queda como estaba.
function historiaSlot({ r1, historia, ga, lang } = {}) {
  const h = String(historia || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!h) return null;
  const prod = String(r1 || '').trim();
  if (lang === 'en') {
    return { formato: 'Behind the scenes', tipo: 'detras', titulo: prod ? `the story of ${prod}` : 'the story behind it', angulo: `Tell the real story of ${prod || 'the product'} with this foundation fact: «${h}». Invent nothing: if the fact is not enough, show the real process.` };
  }
  return { formato: 'Detrás de escena', tipo: 'detras', titulo: prod ? `la historia de ${prod}` : 'la historia detrás', angulo: `Contá la historia real de ${prod || 'el producto'} con este dato del fundamento: «${h}». Sin inventar nada: si el dato no alcanza, mostrá el proceso real.` };
}

// ÍTEM 7 — Slot «Testimonio» con cita real para las plantillas.
// Con citas: el slot lleva la cita textual. Sin citas: null (el llamador
// decide: generateIdeas lo reemplaza por Proceso — fail-closed).
function testimonioSlot({ citas, ga, lang } = {}) {
  const cs = (Array.isArray(citas) ? citas : [])
    .map((c) => ({ texto: String((c && c.texto) || '').replace(/\s+/g, ' ').trim().slice(0, 200), autor: String((c && c.autor) || '').replace(/\s+/g, ' ').trim().slice(0, 40) }))
    .filter((c) => c.texto.length >= 8);
  if (!cs.length) return null;
  const c = cs[0];
  if (lang === 'en') {
    return { formato: 'Testimonial', tipo: 'social', titulo: c.autor ? `what ${c.autor} says` : 'what our customers say', angulo: `Real quote from a customer — use it word for word, invent nothing else: «${c.texto}» — ${c.autor || 'customer'}.` };
  }
  return { formato: 'Testimonio', tipo: 'social', titulo: c.autor ? `lo que dice ${c.autor}` : 'lo que dicen nuestros clientes', angulo: `Cita real de un cliente — usala textual, sin inventar nada más: «${c.texto}» — ${c.autor || 'cliente'}.` };
}

// ÍTEM 7 — Reemplazo «Proceso» (fail-closed): un Testimonio sin cita real
// no sale; en su lugar va el proceso real de preparación (mismo reemplazo
// que el pre-lanzamiento, mismo tipo 'detras').
function procesoSlot({ r1, ga, lang } = {}) {
  const prod = String(r1 || '').trim();
  if (lang === 'en') {
    return { formato: 'Process', tipo: 'detras', titulo: prod ? `how we're getting ${prod} ready` : 'how we are getting ready', angulo: 'No real customer quote saved yet: show the real work of getting ready — process builds trust without inventing opinions.' + (ga || '') };
  }
  return { formato: 'Proceso', tipo: 'detras', titulo: prod ? `cómo estamos preparando ${prod}` : 'cómo nos estamos preparando', angulo: 'Todavía no hay una frase real de un cliente guardada: mostrá el trabajo real de preparación — el proceso da confianza sin inventar testimonios.' + (ga || '') };
}

module.exports = {
  ANGULOS_ONDA, ONDA_IDS, ondaValida, anguloOnda,
  generarOpcionesOnda, ordenarPoolPorOnda,
  extraerMarcadoresVoz, lineaVoz, lineaOnda, lineaHistoriaProducto, lineaTestimonio,
  historiaSlot, testimonioSlot, procesoSlot,
};
