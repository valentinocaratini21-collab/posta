'use strict';
/* =====================================================================
 * subir-voz-primero.js — LOTE SUBIR-VOZ-PRIMERO (decisión de Valentino
 * 20/11 06:01–06:10): la pasada estructurada sobre la nota de voz del
 * flujo post-subida de Subir.
 *
 * Funciones PURAS (sin I/O, sin DB, sin red, sin IA): extraen de la
 * transcripción SOLO lo que se puede extraer con certeza —
 *   · intención: sale hoy / es para una fecha / usala en mis posteos
 *   · la fecha CONCRETA resuelta («el sábado que viene» → su fecha)
 *   · el motivo (vocabulario cerrado de subir-evento: Aniversario,
 *     Inauguración, Cumpleaños…)
 *   · las condiciones libres, VERBATIM de la frase («no lo anuncies
 *     hasta el lunes») — se captura la cláusula, jamás se reescribe
 *   · el tratamiento del video (tal cual con su sonido / a cortar)
 *
 * Lo que no se puede extraer con certeza NO se inventa: vuelve en
 * `faltantes` o marca `ambiguo`, y esa nota NO se asienta sola — cae
 * a la revisión por los caños de voz de siempre (subir_pedidos_voz),
 * donde la atiende la línea a mano. La confirmación del cliente
 * («Va así») es la única puerta de asentamiento.
 *
 * Las fechas ES reusan el parser de subir-evento (parseFechaEnTexto /
 * parseQue), con UNA extensión de este lote, aprobada en el mock del
 * dueño: «el sábado QUE VIENE» / «el próximo sábado» = el sábado de
 * la semana que viene (el siguiente DESPUÉS del próximo), mientras el
 * día pelado («el sábado») sigue siendo el próximo, como siempre.
 * ===================================================================== */
const subirEvento = require('./subir-evento');
const modoEvento = require('./modo-evento');

const clean = (v, max) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max || 80);
const sinTildes = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function shiftISO(iso, n) { return subirEvento.shiftISO(iso, n); }
function weekdayOfISO(iso) {
  const p = modoEvento.parseFecha(iso);
  if (!p) return -1;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}
// El próximo día `dow` ESTRICTAMENTE después de hoy (espejo de
// subir-evento.proximoDiaSemana, no exportada).
function proximoDiaSemana(hoy, dow) {
  let d = shiftISO(hoy, 1);
  for (let i = 0; i < 8; i++) { if (weekdayOfISO(d) === dow) return d; d = shiftISO(d, 1); }
  return null;
}
// Día/mes válido: este año si no pasó; si pasó, el que viene. Null si
// el día no existe en ese mes (no se inventa).
function fechaMesDia(hoy, mes, dia, anioExplicito) {
  const hp = modoEvento.parseFecha(hoy);
  if (!hp) return null;
  let y = anioExplicito || hp.y;
  const ok = (yy) => { const f = isoOf(yy, mes, dia); const p = modoEvento.parseFecha(f); return p && p.m === mes && p.d === dia; };
  if (!ok(y)) return null;
  let f = isoOf(y, mes, dia);
  if (!anioExplicito && f <= hoy) { y += 1; if (!ok(y)) return null; f = isoOf(y, mes, dia); }
  return f;
}

const DOW_ES = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const DOW_EN = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const MESES_EN = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

// ---------------------------------------------------------------------
// LA FECHA. Devuelve 'YYYY-MM-DD' o null. `norm` viene sin tildes y en
// minúsculas, con espacios simples.
// ---------------------------------------------------------------------
function parseFechaVoz(norm, hoy, lang) {
  let m;
  if (lang === 'en') {
    if (/\btomorrow\b/.test(norm)) return shiftISO(hoy, 1);
    m = norm.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) { const p = proximoDiaSemana(hoy, DOW_EN[m[1]]); return p ? shiftISO(p, 7) : null; }
    m = norm.match(/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) return proximoDiaSemana(hoy, DOW_EN[m[1]]);
    m = norm.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (m) { const f = fechaMesDia(hoy, MESES_EN[m[1]], Number(m[2]), null); if (f) return f; }
    m = norm.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) { // EN: mes/día
      let anio = m[3] ? Number(m[3]) : 0; if (anio && anio < 100) anio += 2000;
      const f = fechaMesDia(hoy, Number(m[1]), Number(m[2]), anio || null); if (f) return f;
    }
    m = norm.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) return proximoDiaSemana(hoy, DOW_EN[m[1]]);
    return null;
  }
  // ES — primero la extensión «que viene / próximo» (mock del dueño:
  // «el sábado que viene» dicho un viernes = el sábado de la semana
  // que viene, no el de mañana).
  m = norm.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s+(?:que\s+viene|proximo|proxima)\b/);
  if (m) { const p = proximoDiaSemana(hoy, DOW_ES[m[1]]); return p ? shiftISO(p, 7) : null; }
  m = norm.match(/\b(?:proximo|proxima)\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
  if (m) { const p = proximoDiaSemana(hoy, DOW_ES[m[1]]); return p ? shiftISO(p, 7) : null; }
  return subirEvento.parseFechaEnTexto(norm, hoy);
}

// ---------------------------------------------------------------------
// MOTIVO: vocabulario cerrado. ES reusa parseQue de subir-evento; EN
// mapea al MISMO rótulo canónico (el recibo lo muestra en el idioma
// de la cuenta con MOTIVO_EN).
// ---------------------------------------------------------------------
const MOTIVO_EN = {
  'DJ set': 'DJ set', 'Show en vivo': 'Live show', 'Cumpleaños': 'Birthday',
  'Inauguración': 'Opening', 'Aniversario': 'Anniversary', 'Degustación': 'Tasting',
  'Clase': 'Class', 'Karaoke': 'Karaoke', 'Feria': 'Fair', 'Fiesta': 'Party', 'Evento': 'Event',
};
const QUE_EN = [
  [/\bdj\s+set\b/, 'DJ set'],
  [/\bbirthday\b/, 'Cumpleaños'],
  [/\binauguration\b|\bgrand\s+opening\b|\bopening\b/, 'Inauguración'],
  [/\banniversary\b/, 'Aniversario'],
  [/\btasting\b/, 'Degustación'],
  [/\bclass\b|\bworkshop\b/, 'Clase'],
  [/\bconcert\b|\blive\s+show\b|\blive\s+music\b/, 'Show en vivo'],
  [/\bkaraoke\b/, 'Karaoke'],
  [/\bfair\b|\bmarket\b/, 'Feria'],
  [/\bparty\b/, 'Fiesta'],
  [/\bevent\b/, 'Evento'],
];
function parseMotivoVoz(norm, lang) {
  if (lang === 'en') { for (const [re, label] of QUE_EN) { if (re.test(norm)) return label; } return ''; }
  return subirEvento.parseQue(norm);
}

// ---------------------------------------------------------------------
// CONDICIONES LIBRES: la cláusula del dueño, verbatim. Solo patrones
// de condición inequívocos (no anunciar/no publicar hasta…, que no
// salga hasta…, don't announce until…). Sin patrón → ninguna: una
// condición jamás se deriva de palabras sueltas.
// ---------------------------------------------------------------------
function parseCondicionesVoz(original, norm, lang) {
  const out = [];
  const push = (s) => { const c = clean(s, 140).replace(/[\s.]+$/, ''); if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c); };
  let m;
  if (lang === 'en') {
    m = original.match(/\b(?:don'?t|do\s+not)\s+(?:announce|post|publish|share)\b[^.,;]*/i); if (m) push(m[0]);
    m = original.match(/\bnot\s+until\b[^.,;]*/i); if (m && !out.length) push(m[0]);
    m = original.match(/\bkeep\s+it\s+(?:a\s+)?(?:secret|quiet)\b[^.,;]*/i); if (m) push(m[0]);
    return out.slice(0, 2);
  }
  m = original.match(/\bno\s+(?:lo\s+|la\s+)?(?:anuncies|anunciar|publiques|publicar|muestres|mostrar|subas|subir)\b[^.,;]*/i);
  if (m) push(m[0]);
  m = original.match(/\bque\s+no\s+(?:salga|se\s+anuncie|se\s+publique)\b[^.,;]*/i);
  if (m) push(m[0]);
  m = original.match(/\bes\s+(?:una\s+)?sorpresa\b[^.,;]*/i);
  if (m && !out.length) push(m[0]);
  return out.slice(0, 2);
}

// ---------------------------------------------------------------------
// TRATAMIENTO DEL VIDEO: tal cual (con su sonido, sin tocar) o a
// cortar. Si la frase dice las dos cosas, no se decide: vuelve null
// con la señal de conflicto y la confirmación no lo asienta solo.
// ---------------------------------------------------------------------
function parseTratamientoVoz(norm, lang) {
  let tal = false, cortar = false;
  if (lang === 'en') {
    tal = /\bas\s+is\b/.test(norm) || /\bwith\s+its\s+sound\b/.test(norm) || /\buncut\b/.test(norm) || /\bdon'?t\s+edit\b/.test(norm) || /\bno\s+editing\b/.test(norm);
    cortar = /\bcut\s+it\b/.test(norm) || /\btrim\s+it\b/.test(norm) || /\bedit\s+it\b/.test(norm) || /\bneeds?\s+(?:a\s+)?cut\b/.test(norm);
  } else {
    tal = /\btal\s+cual\b/.test(norm) || /\bcon\s+su\s+sonido\b/.test(norm) || /\basi\s+como\s+esta\b/.test(norm) || /\bsin\s+cortar\b/.test(norm) || /\bsin\s+editar\b/.test(norm) || /\bno\s+lo\s+(?:cortes|edites)\b/.test(norm);
    cortar = /\bcortal[oa]\b/.test(norm) || /\bhay\s+que\s+cortarlo\b/.test(norm) || /\bedital[oa]\b/.test(norm) || /\brecortal[oa]\b/.test(norm) || /\bhay\s+que\s+editarlo\b/.test(norm);
  }
  if (tal && cortar) return { tratamiento: null, conflicto: true };
  if (tal) return { tratamiento: 'tal_cual', conflicto: false };
  if (cortar) return { tratamiento: 'cortar', conflicto: false };
  return { tratamiento: null, conflicto: false };
}

// ---------------------------------------------------------------------
// LA NOTA → LO ENTENDIDO.
// opts: { hoy:'YYYY-MM-DD', lang:'es'|'en', kind:'foto'|'video' }
// ---------------------------------------------------------------------
function parseNotaVoz(texto, opts) {
  const o = opts || {};
  const hoy = modoEvento.parseFecha(o.hoy) ? o.hoy : modoEvento.hoyISO();
  const lang = o.lang === 'en' ? 'en' : 'es';
  const kind = o.kind === 'video' ? 'video' : 'foto';
  const original = String(texto || '').trim();
  const norm = ' ' + sinTildes(original).replace(/\s+/g, ' ') + ' ';

  const fechaISO = original ? parseFechaVoz(norm, hoy, lang) : null;
  const motivo = original ? parseMotivoVoz(norm, lang) : '';
  const condiciones = original ? parseCondicionesVoz(original, norm, lang) : [];
  const trat = kind === 'video' ? parseTratamientoVoz(norm, lang) : { tratamiento: null, conflicto: false };

  // Intención. Precedencia: la fecha CONCRETA manda sobre el «hoy»
  // relativo si no coinciden (la frase trae los dos datos y el
  // concreto es el verificable); «hoy» solo si no hay otra fecha o
  // la fecha ES hoy.
  let intencion = null;
  const diceHoy = lang === 'en'
    ? (/\bfor\s+today\b/.test(norm) || /\bgoes?\s+out\s+today\b/.test(norm) || /\bpost\s+it\s+today\b/.test(norm) || /\bupload\s+it\s+today\b/.test(norm) || /\btoday\b/.test(norm) && /\b(?:post|upload|publish|share)\b/.test(norm))
    : (/\bpara\s+hoy\b/.test(norm) || /\bsale\s+hoy\b/.test(norm) || /\bsubila\s+hoy\b/.test(norm) || /\bsubilo\s+hoy\b/.test(norm) || /\bque\s+salga\s+hoy\b/.test(norm) || /\bhoy\s+mismo\b/.test(norm));
  const dicePosteos = lang === 'en'
    ? (/\buse\s+it\s+in\s+my\s+posts\b/.test(norm) || /\bfor\s+my\s+posts\b/.test(norm) || /\bno\s+special\s+date\b/.test(norm) || /\bnot\s+for\s+a\s+date\b/.test(norm))
    : (/\busal[ao]s?\s+en\s+mis\s+posteos\b/.test(norm) || /\bpara\s+mis\s+posteos\b/.test(norm) || /\bsin\s+fecha\b/.test(norm) || /\bno\s+es\s+una\s+fecha\b/.test(norm) || /\bno\s+es\s+para\s+una\s+fecha\b/.test(norm));
  const diceFecha = !!(fechaISO || motivo) || (lang === 'en' ? /\bspecial\s+date\b/.test(norm) || /\bit'?s\s+for\s+(?:the|a|an)\b/.test(norm) && !!fechaISO : /\bes\s+una\s+fecha\b/.test(norm) || /\bfecha\s+especial\b/.test(norm) || /\bes\s+para\s+el\b/.test(norm) && !!fechaISO);

  // La instrucción EXPLÍCITA de destino manda: si el dueño dice
  // «usala en mis posteos», la pieza queda como material aunque la
  // misma nota nombre una fecha — la fecha y el motivo quedan como
  // ANOTACIÓN en el recibo, no como agenda contra su instrucción.
  if (dicePosteos) intencion = 'posteos';
  else if (fechaISO && fechaISO !== hoy) intencion = 'fecha';
  else if (diceHoy) intencion = 'hoy';
  else if (fechaISO) intencion = 'fecha';
  else if (diceFecha) intencion = 'fecha';

  const faltantes = [];
  if (intencion === 'fecha' && !fechaISO) faltantes.push('fecha');
  // En video que va a salir (hoy/fecha), el tratamiento es parte de
  // lo entendido: si la nota no lo dice (o dice las dos cosas), no se
  // inventa — falta, y la confirmación lo pregunta con dos toques.
  if (kind === 'video' && (intencion === 'hoy' || intencion === 'fecha') && !trat.tratamiento) faltantes.push('tratamiento');

  // Ambiguo = nada asentable: ni intención, ni fecha, ni tratamiento.
  // Esa nota no se asienta sola: cae a la revisión (línea a mano).
  const ambiguo = !intencion && !fechaISO && !trat.tratamiento;

  return {
    intencion,                       // 'hoy' | 'fecha' | 'posteos' | null
    fechaISO: fechaISO || null,      // la fecha concreta resuelta
    fechaTexto: fechaISO ? modoEvento.fechaLinda(fechaISO) : '',
    motivo,                          // rótulo canónico ('' si no hay)
    condiciones,                     // cláusulas verbatim del dueño
    tratamiento: trat.tratamiento,   // 'tal_cual' | 'cortar' | null (solo video)
    faltantes,
    ambiguo,
  };
}

module.exports = { parseNotaVoz, parseFechaVoz, parseMotivoVoz, parseCondicionesVoz, parseTratamientoVoz, MOTIVO_EN };
