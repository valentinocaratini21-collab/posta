// cm-formatos.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// BIBLIOTECA DE FORMATOS: el repertorio de un buen community manager,
// como DATOS, no como prompt suelto. Cada formato trae gancho, estructura,
// un ejemplo GENÉRICO rotulado EJEMPLO (nunca copiado de una cuenta real,
// nunca un negocio real), cuándo usarlo, cuándo NO, y su anti-patrón
// (qué no hacer). Los ids llevan prefijo `cm-` a propósito: NO chocan
// con el campo `formato` viejo del generador de ideas (novedad, promo,
// tip, social, detras, novedad, Reel/Video), que sigue intacto.
//
// REGLAS DURAS:
// - La rotación es determinista: dentro de una semana no se repite
//   formato; entre semanas no se repite el último formato usado.
// - Un formato vetado por el gusto del dueño jamás se elige.
// - El cierre viejo «seguinos y mirá cómo se arma» está PROHIBIDO:
//   cierreProhibido() lo detecta (con y sin acentos) para que ningún
//   caption nuevo lo lleve.
'use strict';

const FORMATOS = [
  {
    id: 'cm-serie',
    nombre: 'Serie semanal',
    gancho: 'Una semana, un tema: cada día una entrega que deja ganas de la siguiente.',
    estructura: 'Día 1 presenta el tema; días siguientes, una entrega por día; el último día cierra el arco. Cada entrega se entiende sola.',
    ejemplo: 'EJEMPLO: «La semana del café: día 1, el grano; día 2, la molienda; día 3, el barista».',
    usarCuando: 'Cuando hay un tema con recorrido para varios días.',
    noUsarCuando: 'Si el tema se agota en un solo posteo.',
    antiPatron: 'Prometer una parte 2 que nunca llega.',
  },
  {
    id: 'cm-antes-despues',
    nombre: 'Antes / después',
    gancho: 'El contraste real: cómo estaba y cómo quedó.',
    estructura: 'Foto real del antes y foto real del después, mismo encuadre cuando se puede, una frase que nombra el cambio.',
    ejemplo: 'EJEMPLO: «El local antes de abrir / después del primer café de la mañana».',
    usarCuando: 'Cuando hay un cambio visible y real que mostrar.',
    noUsarCuando: 'Si no hay foto real del antes.',
    antiPatron: 'Antes/después inventado o con foto de stock.',
  },
  {
    id: 'cm-pregunta-real',
    nombre: 'Pregunta real',
    gancho: 'Responde algo que los clientes preguntan de verdad.',
    estructura: 'La pregunta textual abre; la respuesta es corta, concreta y con el dato real (precio, horario, dirección).',
    ejemplo: 'EJEMPLO: «¿Abren los domingos? Sí, de 9 a 13».',
    usarCuando: 'Cuando hay preguntas reales en comentarios, DMs o en el local.',
    noUsarCuando: 'Si nadie preguntó eso.',
    antiPatron: 'Pregunta de relleno que nadie hizo («¿te gusta el café?»).',
  },
  {
    id: 'cm-historia',
    nombre: 'Historia del negocio',
    gancho: 'El origen o un momento real del negocio, contado sin folleto.',
    estructura: 'Un momento concreto, un detalle que solo ese negocio tiene, y por qué importa hoy.',
    ejemplo: 'EJEMPLO: «El día que abrimos teníamos 3 mesas y una cafetera prestada».',
    usarCuando: 'Cuando hay un hito o anécdota real del negocio.',
    noUsarCuando: 'Si la historia hay que inventarla.',
    antiPatron: 'Historia edulcorada de folleto («éramos pobres y ahora somos millonarios»).',
  },
  {
    id: 'cm-detras-escena',
    nombre: 'Detrás de escena',
    gancho: 'El proceso que el cliente nunca ve.',
    estructura: 'Manos trabajando, el oficio en vivo, un detalle del proceso con su hora real.',
    ejemplo: 'EJEMPLO: «Así se prepara la masa a las 6 de la mañana».',
    usarCuando: 'Cuando hay un proceso con foto real y lindo de mostrar.',
    noUsarCuando: 'Si mostrarlo incomoda o expone desorden.',
    antiPatron: '«Detrás de escena» actuado, con el local vacío y posado.',
  },
  {
    id: 'cm-error-comun',
    nombre: 'El error común',
    gancho: 'El error que la gente comete y cómo evitarlo.',
    estructura: 'El error nombrado sin culpar, por qué pasa, y la forma correcta en una frase.',
    ejemplo: 'EJEMPLO: «El error: guardar el café molido en la heladera. Se humedece y pierde aroma».',
    usarCuando: 'Cuando el rubro tiene errores reales y frecuentes.',
    noUsarCuando: 'Si hay que inventar un error para vender.',
    antiPatron: 'Avergonzar al cliente («si hacés esto, no sabés nada»).',
  },
  {
    id: 'cm-testimonio',
    nombre: 'Testimonio con permiso',
    gancho: 'Un cliente real cuenta, con su permiso registrado.',
    estructura: 'El cliente con nombre o apodo, qué le pasó con el negocio, una frase textual. SOLO con permiso en cm_ugc_permiso.',
    ejemplo: 'EJEMPLO: «María viene todos los martes desde que abrimos (con su permiso)».',
    usarCuando: 'Solo cuando hay permiso registrado del cliente.',
    noUsarCuando: 'Sin permiso, jamás. Sin excepción.',
    antiPatron: 'Testimonio inventado o con el nombre cambiado.',
  },
  {
    id: 'cm-lista-util',
    nombre: 'Lista útil',
    gancho: 'Una lista corta y concreta que da ganas de guardar.',
    estructura: '3 a 5 ítems, cada uno con un dato real del negocio, cierre con una sola acción.',
    ejemplo: 'EJEMPLO: «3 cosas para pedir si venís por primera vez».',
    usarCuando: 'Cuando hay saber real del rubro que vale ordenar.',
    noUsarCuando: 'Si la lista sale genérica de internet.',
    antiPatron: 'Lista de 10 obviedades que no dice nada.',
  },
];

// Cierre viejo prohibido (variantes con/sin acentos, con/sin «seguinos»).
const CIERRE_VIEJO = /seguinos?\s+y\s+mir[aá]\s+c[oó]mo\s+se\s+arma|seguinos?\s+para\s+ver\s+c[oó]mo\s+se\s+arma|mir[aá]\s+c[oó]mo\s+se\s+arma/i;

function normCierre(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function cierreProhibido(texto) {
  if (!texto) return false;
  return CIERRE_VIEJO.test(normCierre(texto)) || CIERRE_VIEJO.test(String(texto));
}

function porId(id) {
  return FORMATOS.find((f) => f.id === id) || null;
}

function esFormatoValido(id) {
  return !!porId(id);
}

// Asignación determinista de formatos para una semana.
// - n: cantidad de piezas. Sin repetir dentro de la semana (si n <= pool).
// - preferidos: ids que rinden en ESTA cuenta (van primero).
// - vetados: ids que el dueño vetó (jamás se eligen).
// - ultimo: último formato de la semana anterior (la primera pieza no lo repite).
// - semilla: rota el orden base para que no todas las semanas arranquen igual.
function elegirFormatos({ n, preferidos = [], vetados = [], ultimo = null, semilla = 0 } = {}) {
  const cant = Math.max(0, Math.floor(n || 0));
  if (!cant) return [];
  const vet = new Set((vetados || []).filter(esFormatoValido));
  const pool = FORMATOS.filter((f) => !vet.has(f.id));
  if (!pool.length) return [];
  const pref = (preferidos || []).filter(esFormatoValido).filter((id) => !vet.has(id));
  const resto = pool.filter((f) => !pref.includes(f.id));
  const rot = ((semilla % resto.length) + resto.length) % resto.length;
  const restoRotado = resto.slice(rot).concat(resto.slice(0, rot));
  const orden = [...pref.map(porId).filter(Boolean), ...restoRotado];
  const out = [];
  let i = 0;
  while (out.length < cant) {
    const f = orden[i % orden.length];
    // Sin repetir dentro de la semana mientras haya pool; y la primera
    // pieza no repite el último formato de la semana anterior.
    if (out.length < pool.length && out.includes(f.id)) { i++; continue; }
    if (out.length === 0 && ultimo && f.id === ultimo && orden.length > 1) { i++; continue; }
    if (out.length > 0 && out[out.length - 1] === f.id) { i++; continue; }
    out.push(f.id);
    i++;
  }
  return out;
}

// Semilla determinista de una semana (suma de códigos): la rotación de
// formatos de una semana no depende del orden de llegada de los picks.
function semillaDeSemana(weekKey) {
  let h = 0;
  for (const ch of String(weekKey || '')) h += ch.charCodeAt(0);
  return h;
}
function bloqueParaBrief(formatosElegidos) {
  const lista = FORMATOS.map((f) => `- ${f.nombre} (${f.id}): ${f.estructura} Anti-patrón: ${f.antiPatron}`).join('\n');
  const elegidos = (formatosElegidos || []).map((id) => {
    const f = porId(id);
    return f ? `${f.nombre} (${f.id})` : id;
  }).join(', ');
  return 'FORMATOS DE ESTA SEMANA (repertorio estudiado, no copiado de nadie):\n' + lista +
    (elegidos ? `\nAsignación de esta semana, en orden: ${elegidos}. Cada pieza usa SU formato, sin repetir el de la pieza anterior.` : '') +
    '\nPROHIBIDO el cierre viejo «seguinos y mirá cómo se arma» en cualquier variante.';
}

module.exports = { FORMATOS, porId, esFormatoValido, elegirFormatos, cierreProhibido, bloqueParaBrief, semillaDeSemana };
