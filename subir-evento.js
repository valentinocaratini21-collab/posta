'use strict';
/* =====================================================================
 * subir-evento.js — LOTE EVENTO + PEDIDO DE CERO (extensión de Subir,
 * decisión de Valentino 13/11 15:33, hilo del bar con DJ).
 *
 * Funciones PURAS (sin I/O, sin DB, sin red) del flujo nuevo de Subir:
 *
 *   · EVENTO CON FECHA: el día sale de un calendario de un toque y el
 *     nombre se lee del flyer o se tipea en UN campo corto (un nombre
 *     propio no se toca ni se inventa: es el único tipeo del flujo).
 *   · PEDIDO DE CERO: la idea entra libre (voz o texto — una frase) y
 *     este módulo extrae lo que se puede extraer CON CERTEZA de la
 *     frase (parseIdea). Lo que no se puede extraer NO se inventa:
 *     vuelve en `faltantes` y se pregunta con un toque.
 *   · LA CARA APORTADA ES UNA FOTO: este módulo no conoce ningún motor
 *     de imagen. La composición del flyer (server + evento-compose.py)
 *     pega la foto real y dibuja texto por programa — ningún camino de
 *     este lote manda una foto de una persona a un modelo de imagen.
 *
 * Las fechas se validan con modo-evento (validateEventDate/fechaLinda):
 * fecha real y futura o no hay posteo.
 * ===================================================================== */
const modoEvento = require('./modo-evento');

const clean = (v, max) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max || 80);
const sinTildes = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const DIAS_SEMANA = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function shiftISO(iso, n) {
  const p = modoEvento.parseFecha(iso);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function weekdayOfISO(iso) {
  const p = modoEvento.parseFecha(iso);
  if (!p) return -1;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}
// El próximo día `dow` ESTRICTAMENTE después de hoy (un evento es futuro).
function proximoDiaSemana(hoy, dow) {
  let d = shiftISO(hoy, 1);
  for (let i = 0; i < 8; i++) { if (weekdayOfISO(d) === dow) return d; d = shiftISO(d, 1); }
  return null;
}
// Construye una fecha de mes/día: este año si todavía no pasó; si pasó
// y no venía año explícito, el año que viene. Devuelve null si el día
// no existe en ese mes (31 de febrero no se inventa: se pregunta).
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

// ---------------------------------------------------------------------
// Fecha dentro de la frase. Solo patrones inequívocos; si ninguno
// matchea con certeza, devuelve null (la fecha se pregunta — es EL
// dato del evento: jamás se adivina).
// ---------------------------------------------------------------------
function parseFechaEnTexto(norm, hoy) {
  let m;
  if (/\bpasado\s+manana\b/.test(norm)) return shiftISO(hoy, 2);
  if (/\bmanana\b/.test(norm)) return shiftISO(hoy, 1);
  m = norm.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    const dia = Number(m[1]), mes = Number(m[2]);
    let anio = m[3] ? Number(m[3]) : 0;
    if (anio && anio < 100) anio += 2000;
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
      const f = fechaMesDia(hoy, mes, dia, anio || null);
      if (f) return f;
    }
  }
  m = norm.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/);
  if (m) {
    const f = fechaMesDia(hoy, MESES[m[2]], Number(m[1]), m[3] ? Number(m[3]) : null);
    if (f) return f;
  }
  m = norm.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s+(\d{1,2})\b/);
  if (m) {
    // «el viernes 22»: manda el número (día del mes); el nombre del día
    // es la forma en que el dueño lo dice, no un segundo dato.
    const hoyP = modoEvento.parseFecha(hoy);
    const f = fechaMesDia(hoy, hoyP.m, Number(m[2]), null);
    if (f && f > hoy) return f;
    const f2 = fechaMesDia(hoy, hoyP.m === 12 ? 1 : hoyP.m + 1, Number(m[2]), hoyP.m === 12 ? hoyP.y + 1 : null);
    if (f2 && f2 > hoy) return f2;
  }
  m = norm.match(/\b(?:el\s+|este\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
  if (m) return proximoDiaSemana(hoy, DIAS_SEMANA[m[1]]);
  m = norm.match(/\bdia\s+(\d{1,2})\b/);
  if (m) { const f = fechaMesDia(hoy, modoEvento.parseFecha(hoy).m, Number(m[1]), null); if (f && f > hoy) return f; }
  return null;
}

// ---------------------------------------------------------------------
// Quién viene/toca: SOLO nombres propios (empiezan con mayúscula en la
// frase original) tras un verbo/rol que los presenta. Sin patrón claro
// → '' (se pregunta). Nunca se deriva un nombre de palabras comunes.
// ---------------------------------------------------------------------
function limpiarNombre(raw) {
  let s = String(raw || '').trim();
  s = s.split(/\s+(?:en|el|la|los|las|este|esta|a|al|del|con|y)\s+/i)[0];
  s = s.replace(/[\s.,;:!¡¿?]+$/g, '').trim();
  return clean(s, 48);
}
function parseQuien(original) {
  let m = original.match(/(?:^|[\s,;:])DJ\s+([A-ZÁÉÍÓÚÜÑ][\wáéíóúüñ'’-]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÜÑ][\wáéíóúüñ'’-]+){0,2})/);
  if (m) return 'DJ ' + limpiarNombre(m[1]);
  m = original.match(/\b(?:toca|viene|actua|actúa|canta|pincha|presenta)\s+(?:el\s+|la\s+)?([A-ZÁÉÍÓÚÜÑ][\wáéíóúüñ'’-]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÜÑ][\wáéíóúüñ'’-]+){0,2})/);
  if (m) return limpiarNombre(m[1]);
  m = original.match(/\bcon\s+([A-ZÁÉÍÓÚÜÑ][\wáéíóúüñ'’-]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÜÑ][\wáéíóúüñ'’-]+){0,2})/);
  if (m) return limpiarNombre(m[1]);
  m = original.match(/\binvitad[oa]\s+(?:especial\s+)?(?:es\s+)?([A-ZÁÉÍÓÚÜÑ][\wáéíóúüñ'’-]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÜÑ][\wáéíóúüñ'’-]+){0,2})/i);
  if (m) return limpiarNombre(m[1]);
  return '';
}

// Qué es: vocabulario cerrado de tipos de evento. Sin match → '' (se
// pregunta con esos mismos chips). El orden importa: lo específico va
// antes que lo genérico.
const QUE_PATTERNS = [
  [/\bdj\s+set\b|\bset\s+de\s+dj\b|\btoca\s+(?:un\s+)?dj\b/, 'DJ set'],
  [/\btoca\b/, 'Show en vivo'],
  [/\bcumpleanos\b/, 'Cumpleaños'],
  [/\binauguracion\b|\bapertura\s+de\b/, 'Inauguración'],
  [/\baniversario\b/, 'Aniversario'],
  [/\bdegustacion\b|\bcata\b/, 'Degustación'],
  [/\bclase\b|\btaller\b|\bworkshop\b/, 'Clase'],
  [/\brecital\b|\bconcierto\b|\bshow\s+en\s+vivo\b|\bshow\b|\ben\s+vivo\b/, 'Show en vivo'],
  [/\bkaraoke\b/, 'Karaoke'],
  [/\bferia\b/, 'Feria'],
  [/\bfiesta\b|\bparty\b/, 'Fiesta'],
  [/\bevento\b/, 'Evento'],
];
function parseQue(norm) {
  for (const [re, label] of QUE_PATTERNS) { if (re.test(norm)) return label; }
  return '';
}

// Nombre propio del evento: solo si la frase lo dice («se llama X» o
// viene entre comillas). Si no, el titular se arma con qué + quién.
function parseNombre(original) {
  let m = original.match(/se\s+llama\s+["«“]?([^"»”.,;]{2,60})/i);
  if (m) return clean(m[1], 60);
  m = original.match(/["«“]([^"»”]{2,60})["»”]/);
  if (m) return clean(m[1], 60);
  return '';
}

// ---------------------------------------------------------------------
// LA IDEA → LO ENTENDIDO. Devuelve los datos extraídos con certeza y
// la lista de faltantes. `hoy` inyectable ('YYYY-MM-DD') para tests.
// ---------------------------------------------------------------------
function parseIdea(texto, hoy) {
  const original = String(texto || '').trim();
  const hoyOk = modoEvento.parseFecha(hoy) ? hoy : modoEvento.hoyISO();
  const norm = ' ' + sinTildes(original) + ' ';
  const fechaISO = parseFechaEnTexto(norm, hoyOk);
  const quien = parseQuien(original);
  const que = parseQue(norm);
  const nombre = parseNombre(original);
  const faltantes = [];
  if (!fechaISO) faltantes.push('fecha');
  if (!quien) faltantes.push('quien');
  if (!que) faltantes.push('que');
  return {
    idea: clean(original, 400),
    nombre,
    quien,
    que,
    fechaISO,
    fechaTexto: fechaISO ? modoEvento.fechaLinda(fechaISO) : '',
    faltantes,
    completo: faltantes.length === 0,
  };
}

// Titular del flyer: el nombre confirmado si lo hay; si no, qué+quién
// (solo datos confirmados — esta función se llama tras la confirmación).
function titularPara(d) {
  const nombre = clean(d && d.nombre, 60);
  if (nombre) return nombre;
  const que = clean(d && d.que, 40);
  const quien = clean(d && d.quien, 48);
  if (que && quien) return `${que} con ${quien}`;
  return que || quien || '';
}

// Caption del posteo de evento: SOLO datos confirmados. El nombre del
// negocio sale del perfil del cliente (server), nunca de la frase.
function captionEvento(d, negocio) {
  const titular = titularPara(d);
  const lines = [];
  if (titular) lines.push(`${titular} 🎉`);
  if (d && d.fechaISO) {
    const fl = modoEvento.fechaLinda(d.fechaISO);
    lines.push(`📅 ${fl.charAt(0).toUpperCase() + fl.slice(1)}`);
  }
  const quien = clean(d && d.quien, 48);
  if (quien && !titular.includes(quien)) lines.push(`✨ Con ${quien}`);
  const neg = clean(negocio, 60);
  if (neg) lines.push(`📍 ${neg}`);
  return lines.join('\n');
}

// Validación final de los datos CONFIRMADOS (la puerta antes de crear):
// fecha real y futura (modo-evento) + titular armable. Devuelve
// { ok } o { ok:false, error } con el código de modo-evento.
function validarDatos(d, now) {
  const v = modoEvento.validateEventDate(d && d.fecha, now);
  if (!v.ok) return { ok: false, error: v.error };
  if (!titularPara(d)) return { ok: false, error: 'sin_titular' };
  return { ok: true, fecha: v.fecha };
}

module.exports = {
  parseIdea, parseFechaEnTexto, parseQuien, parseQue, parseNombre,
  titularPara, captionEvento, validarDatos, shiftISO, clean,
};
