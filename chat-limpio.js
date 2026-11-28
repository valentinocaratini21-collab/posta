'use strict';

// ── LOTE CHAT-SIN-TECNICISMOS ─────────────────────────────────────
// Regla del dueño (27/11/2026, extensión de la de push v1385 a las
// RESPUESTAS DEL CHAT): el chat de cara al cliente NUNCA habla en
// tecnicismos, lo pregunte quien lo pregunte — ni ids internos de
// material o de posteo, ni rutas /media/..., ni nombres de archivo.
// Caso real: ante preguntas de la propia operación de la casa, el
// chat de Subir contestó «Es el material 96: /media/….jpg — la foto
// de la Synchilla que subiste hoy.» y «Es el material 98: /media/…
// .mp4 — el video que subiste recién.». El dato técnico se saca por
// la puerta admin, nunca por el chat del producto.
//
// limpiarRespuestaCliente(texto, lang?) es la RED determinística:
// se aplica en los puntos reales donde una respuesta del asistente
// se guarda o se devuelve al cliente (pzChatSaveReply y la
// respuesta del handler del chat, pzChatMsgInsert, las resoluciones
// del operador en support-cases — resolveVoiceRequest y
// replyAsPosty —, resolver-idea, el acuse de idea-voz y el log del
// hilo). La prevención vive en el prompt del respondedor
// (generator.js, «SIN TECNICISMOS»); esto es lo que garantiza.
//
// La limpieza QUITA el dato técnico conservando la referencia
// humana de la misma frase:
//   «Es el material 96: /media/….jpg — la foto de la Synchilla que
//    subiste hoy.» → «Es la foto de la Synchilla que subiste hoy.»
// Si tras la limpieza no queda nada con sentido, cae en una
// respuesta humana genérica según el medio que se haya quitado
// («Es la foto que subiste hoy.» / «Es el video que subiste hoy.»).
//
// NO se toca:
//  · Los marcadores funcionales que el cliente RINDE como pieza
//    ([foto:/media/…] es la burbuja con la imagen, no texto).
//  · «caso #N»: referencia visible por diseño (el cliente puede
//    nombrar su caso; no es un id de material/posteo).
//  · Los hashtags del cliente (#Synchilla): solo se quita el
//    token «#<dígitos>» suelto, que en este producto es siempre
//    una referencia interna («#827»), nunca un hashtag real.

const EXT_MEDIA = '(?:mp4|mov|m4v|mov|jpg|jpeg|png|webp|gif|heic|heif)';
const MARCADOR_RE = /\[(?:foto|video|audio):[^\]]*\]|\[trabajo-fallo:\d+\]/g;
const CASO_RE = /\b(?:caso|case)\s+#\d+\b/gi;

const PALABRAS_RUIDO = new Set([
  'es', 'el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'lo', 'le',
  'se', 'su', 'tu', 'mi', 'que', 'y', 'o', 'e', 'u', 'en', 'con', 'por',
  'para', 'al', 'a', 'it', 'its', 'is', 'the', 'a', 'an', 'of', 'that',
  'this', 'ese', 'esa', 'este', 'esta', 'esto', 'eso',
]);

function detectarLang(t) {
  if (/\b(subiste|posteo|hoy|foto|video que)\b/i.test(t)) return 'es';
  if (/\b(uploaded|you|your|today|the)\b/i.test(t)) return 'en';
  return 'es';
}

function generica(kind, lang) {
  if (lang === 'en') {
    if (kind === 'foto') return "It's the photo you uploaded today.";
    if (kind === 'video') return "It's the video you uploaded today.";
    return "It's the one you uploaded today.";
  }
  if (kind === 'foto') return 'Es la foto que subiste hoy.';
  if (kind === 'video') return 'Es el video que subiste hoy.';
  return 'Es lo que subiste hoy.';
}

function limpiarRespuestaCliente(texto, lang) {
  const original = String(texto == null ? '' : texto);
  if (!original.trim()) return original;
  const idioma = (lang === 'en' || lang === 'es') ? lang : detectarLang(original);

  // Medio del dato técnico presente (para la genérica si hace falta).
  let kind = null;
  const mExt = original.match(new RegExp('\\.(' + EXT_MEDIA + ')\\b', 'i'));
  if (mExt) kind = /^(mp4|mov|m4v)$/i.test(mExt[1]) ? 'video' : 'foto';

  // Proteger lo que no es texto visible o es referencia legítima.
  const protegidos = [];
  const proteger = () => (m) => { protegidos.push(m); return '\u0001' + (protegidos.length - 1) + '\u0002'; };
  let t = original.replace(MARCADOR_RE, proteger());
  t = t.replace(CASO_RE, proteger());

  // Sin tecnicismo no se toca NADA (ni la puntuación): la respuesta
  // limpia pasa intacta, incluidos los centinelas del chat («…»).
  const HAY_TECNICISMO = new RegExp(
    '/media/|\\S+\\.' + EXT_MEDIA + '\\b|\\bmaterial\\s+#?\\d+\\b|\\b(?:posteo|publicación|publicacion|post)\\s+#?\\d+\\b|(?<![\\w#])#\\d+\\b|\\bid\\s+(?:del\\s+material\\s+|del\\s+posteo\\s+)?[:#]?\\s*\\d+\\b', 'i');
  if (!HAY_TECNICISMO.test(t)) return original;

  // (a)+(b)+(c) La forma exacta de la filtración: «el material N:
  // /media/archivo.ext — » sale entera, con su guion de arrastre.
  t = t.replace(new RegExp(
    '\\b(?:(?:el|la|los|las|del|al|este|ese|esta|esa|the|that|this)\\s+)?material\\s+#?\\d+\\s*[:.]?\\s*' +
    '(?:\\/media\\/\\S+|\\S+\\.' + EXT_MEDIA + '\\b\\S*)?\\s*(?:—|–)?\\s*', 'gi'), '');
  // (a) Cualquier otra ruta /media/ suelta (token que la contiene).
  t = t.replace(/\S*\/media\/\S*/g, '');
  // (c) Cualquier otro nombre de archivo con extensión de medio.
  t = t.replace(new RegExp('\\S+\\.' + EXT_MEDIA + '\\b\\S*', 'gi'), '');
  // (b) «material N» que haya quedado en otra forma de frase.
  t = t.replace(/\b(?:(?:el|la|del|al|the)\s+)?material\s+#?\d+\b\s*:?/gi, '');
  // (d) Ids de posteo: la palabra queda, el número interno sale.
  t = t.replace(/\b(posteo|post|publicación|publicacion)\s+#\d+\b/gi, '$1');
  t = t.replace(/\b(posteo|publicación|publicacion)\s+\d+\b/gi, '$1');
  t = t.replace(/\bpost\s+\d+\b/gi, 'post');
  // (d) «id N» suelto y el token «#<dígitos>» (referencia interna;
  // los hashtags con letras no matchean: son del cliente).
  t = t.replace(/\b(?:(?:el|la|the)\s+)?id\s+(?:del\s+material\s+|del\s+posteo\s+)?[:#]?\s*\d+\b/gi, '');
  t = t.replace(/(?<![\w#])#\d+\b/g, '');

  // Reparación de puntuación y espacios tras los cortes.
  t = t.replace(/\(\s*\)/g, '');
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\s+([.,;:!?…%])/g, '$1');
  t = t.replace(/\s*[:;]\s*(?:—|–)\s*/g, ' ');
  t = t.replace(/(^|[.!?…]\s+)(?:—|–|:|;|,)\s*/g, '$1');
  t = t.replace(/\s+(?:—|–)\s+(?=[.!?…]|$)/g, '');
  t = t.replace(/\.\s*\./g, '.');
  t = t.replace(/ *\n */g, '\n').trim();

  // Restaurar lo protegido antes de juzgar si quedó algo con sentido.
  t = t.replace(/\u0001(\d+)\u0002/g, (m, i) => protegidos[Number(i)] || '');

  // ¿Quedó algo con sentido? Palabras reales fuera del ruido, o un
  // marcador funcional (la burbuja con la foto ES la respuesta).
  const sinMarcadores = t.replace(MARCADOR_RE, ' ');
  const palabras = (sinMarcadores.toLowerCase().match(/[a-záéíóúñü]{2,}/gi) || [])
    .filter((w) => !PALABRAS_RUIDO.has(w));
  const tieneMarcador = /\[(?:foto|video|audio):[^\]]*\]|\[trabajo-fallo:\d+\]/.test(t);
  if (!palabras.length && !tieneMarcador) return generica(kind, idioma);
  return t;
}

module.exports = { limpiarRespuestaCliente };
