'use strict';
/* =====================================================================
 * ideas-editions.js — Ediciones del email "3 ideas para tu Instagram"
 * (frente #2 del playbook: contenido de valor gratis, los lunes 9:00 ART).
 *
 * Fuente editorial: equipo-posty/contenidos-playbook/email/edicion-NN-<rubro>.md
 * Cada edición archivada en markdown se CARGA acá en formato estructurado
 * para que el job (ideas-email.js) la consuma. Las "notas de producción"
 * del .md NO viajan: son internas.
 *
 * Estructura: EDITIONS[segmento] = [edición1, edición2, ...] en orden.
 * El segmento es la clave canónica de rubro-id (rubro o subrubro):
 *   peluqueria (subrubro de belleza) · cafeteria · moda (tienda de ropa)
 *   · gimnasio (subrubro de fitness).
 * El cierre y el pie del email son FIJOS del sistema (sistema-email-ideas.md
 * §4) y los agrega el renderizador de ideas-email.js — no van por edición.
 * Regla de la casa: si un segmento no tiene la edición que sigue, esa
 * semana NO se manda relleno: el job salta al suscriptor.
 * ===================================================================== */

const EDITIONS = {
  peluqueria: [
    {
      n: 1,
      subject: '3 ideas para tu peluquería esta semana',
      preheader: 'Día de la Madre, balayage y agenda de fin de año: posteos listos para copiar.',
      intro: 'Esta semana te dejo 3 posteos listos para tu peluquería: copiás, pegás y salen vendiendo tus servicios reales.',
      ideas: [
        {
          titular: 'Regalá un cambio de look',
          idea: 'Para el Día de la Madre, mostrá la gift card o el turno compartido madre e hija como regalo concreto: color, corte o peinado, con reserva por mensaje directo.',
          imagen: 'Para mamá, un mimo real',
          caption: 'Este domingo regalale un momento para ella 💇‍♀️ Gift card para color, corte o peinado, lista para entregar. Escribinos por DM con “MAMÁ” y te reservamos el turno o te armamos la tarjeta para regalar.',
          cuando: 'Lunes, entre las 10 y las 12 h.',
          porque: 'Resuelve el regalo a último momento con un servicio que ya vendés, sin bajar el precio.',
        },
        {
          titular: 'Balayage: antes y después',
          idea: 'Subí un carrusel con el antes, el proceso en foil y el después con luz natural. Nombrá el tono exacto que usaste y para qué tipo de pelo lo recomendás.',
          imagen: 'Balayage que ilumina sin dañar',
          caption: 'Así quedó este balayage miel: aclarado gradual, sin marcas y con baño de luz final ✨ Si querés ese efecto iluminado para el verano, mandanos una foto de tu pelo por DM y te decimos qué técnica te conviene.',
          cuando: 'Miércoles, entre las 18 y las 20 h.',
          porque: 'El antes y después prueba tu trabajo y la consulta con foto baja la barrera para pedir turno.',
        },
        {
          titular: 'Agenda abierta: reservá tu fecha',
          idea: 'Avisá desde ahora que los turnos de noviembre y diciembre para egresos, casamientos y fiestas se llenan primero, y mostrá 3 peinados de fiesta que ya hiciste.',
          imagen: 'Fiestas: asegurá tu turno hoy',
          caption: 'Se vienen egresos, casamientos y despedidas de año 🎉 Los viernes y sábados de noviembre y diciembre vuelan. Escribinos con tu fecha por DM y te guardamos color, corte o peinado sin esperar a último momento.',
          cuando: 'Viernes, entre las 11 y las 13 h.',
          porque: 'La escasez es real —hay fechas concretas que se agotan— y anticipar llena la agenda sin apuro en diciembre.',
        },
      ],
    },
  ],
  cafeteria: [
    {
      n: 1,
      subject: '3 ideas para tu cafetería esta semana',
      preheader: 'Brunch del Día de la Madre, tu café en proceso y mesas para trabajar: listos para copiar.',
      intro: 'Esta semana te dejo 3 posteos listos para tu cafetería: copiás, pegás y salen mostrando lo que la gente ya puede venir a probar.',
      ideas: [
        {
          titular: 'Brunch para mamá, sin cocinar',
          idea: 'Para el Día de la Madre, mostrá tu brunch real en una foto de mesa completa —café, jugo, tostadas, algo dulce— e invitá a reservar mesa por mensaje directo.',
          imagen: 'Domingo de brunch con mamá',
          caption: 'Este domingo, mamá no cocina ☕ Mesa lista, café recién hecho y brunch para compartir sin apuro. Reservá tu mesa por DM con el horario y la cantidad de personas, y nosotros te la guardamos.',
          cuando: 'Lunes, entre las 9 y las 11 h.',
          porque: 'Muestra el plan completo ya resuelto y la reserva por DM convierte la intención en mesa ocupada.',
        },
        {
          titular: 'Así hacemos tu flat white',
          idea: 'Filmá o fotografiá en 3 pasos cómo sale tu café más pedido: el espresso, la leche texturizada y el arte final. Nombrá el grano que usás y de dónde viene, si lo sabés.',
          imagen: 'Tu flat white, paso a paso',
          caption: 'Espresso doble, leche cremosa sin burbujas y la temperatura justa para que no queme 🔥 Así sale cada flat white de la casa. Pasá a probarlo esta semana y contanos si lo tomás solo o con algo dulce al lado.',
          cuando: 'Miércoles, entre las 8 y las 10 h.',
          porque: 'Mostrar el proceso le da valor al precio y convierte un café de todos los días en un motivo para elegirte.',
        },
        {
          titular: 'Tu oficina fuera de casa',
          idea: 'Mostrá esa mesa tranquila que tenés con buena luz, enchufes y wifi, en horario valle. Apuntá al que trabaja o estudia y busca cambiar de aire entre semana.',
          imagen: 'Trabajá rico, cambiá de aire',
          caption: 'Notebook, café y una mesa tranquila con buena luz 💻 Si esta semana trabajás o estudiás desde casa, venite a hacerlo acá: te ubicamos en el rincón más cómodo y te mantenemos el café caliente.',
          cuando: 'Martes, entre las 14 y las 16 h.',
          porque: 'Llena las horas valle de la tarde con un público que se queda, consume y vuelve en la semana.',
        },
      ],
    },
  ],
  moda: [
    {
      n: 1,
      subject: '3 ideas para tu tienda esta semana',
      preheader: 'Ingreso de temporada, regalo para mamá y una prenda en 3 looks: posteos listos para copiar.',
      intro: 'Esta semana te dejo 3 posteos listos para tu tienda: copiás, pegás y salen mostrando prendas concretas que ya tenés en el perchero.',
      ideas: [
        {
          titular: 'Llegó lo nuevo de temporada',
          idea: 'Sacá foto al ingreso real de primavera-verano apenas entra —perchero, mesa o probador— y nombrá 3 prendas puntuales con su talle disponible, no “nueva colección” a secas.',
          imagen: 'Recién llegado: mirá todo esto',
          caption: 'Entró la temporada nueva 🌸 Vestidos livianos, camisas de lino y sastrería en colores claros, ya en el local y en talles reales. Escribinos por DM la prenda que te gustó y te confirmamos talle y precio al toque.',
          cuando: 'Lunes, entre las 11 y las 13 h.',
          porque: 'Lo recién llegado genera consulta inmediata y preguntar por talle en DM abre la conversación de venta.',
        },
        {
          titular: 'Un regalo para cada mamá',
          idea: 'Armá 3 opciones de regalo según el estilo de cada mamá —clásica, informal, fan de los accesorios— con prendas que tengas en stock, listas para retirar en el día.',
          imagen: 'Para mamá, según su estilo',
          caption: '¿Mamá clásica, informal o coqueta? 🎁 Te dejamos 3 ideas con prendas del local, listas para retirar hoy mismo. Mandanos por DM cuál se parece más a la tuya y te lo preparamos para regalo, sin vueltas.',
          cuando: 'Miércoles, entre las 18 y las 20 h.',
          porque: 'Ordena la elección por persona y no por producto, y resuelve el regalo con stock real y retiro inmediato.',
        },
        {
          titular: 'Una prenda, tres looks',
          idea: 'Elegí tu prenda estrella de la semana —una camisa, un blazer liviano, un vestido— y mostrala en 3 combinaciones distintas: trabajo, salida y fin de semana.',
          imagen: 'La misma camisa, 3 días',
          caption: 'Una camisa, tres planes 👕 Con jean para todos los días, con sastrero para trabajar y abierta sobre un top para salir. Si te gusta alguna versión, escribinos por DM y te armamos el look completo en tu talle.',
          cuando: 'Viernes, entre las 17 y las 19 h.',
          porque: 'Multiplica el valor percibido de una sola prenda y ayuda a decidir a la que duda cómo la va a usar.',
        },
      ],
    },
  ],
  gimnasio: [
    {
      n: 1,
      subject: '3 ideas para tu gimnasio esta semana',
      preheader: 'Plan de fin de año, primera clase y rutina de 30 minutos: posteos listos para copiar.',
      intro: 'Esta semana te dejo 3 posteos listos para tu gimnasio: copiás, pegás y salen hablando de entrenar en serio, con tus clases y tus horarios reales.',
      ideas: [
        {
          titular: 'Empezá hoy, llegá bien diciembre',
          idea: 'Planteá el plan mensual como un bloque concreto de 8 semanas hasta fin de año: cuántas veces por semana, qué incluye la rutina inicial y cómo se mide el avance en la primera evaluación.',
          imagen: 'Quedan 8 semanas de año',
          caption: 'No hace falta esperar a enero 💪 Si empezás esta semana, llegás a diciembre con 8 semanas de entrenamiento encima. Escribinos por DM con “EMPIEZO” y te contamos cómo arranca el plan mensual, con rutina desde el primer día.',
          cuando: 'Lunes, entre las 7 y las 9 h.',
          porque: 'Pone una fecha concreta y cercana, mucho más movilizadora que la promesa abierta de “ponerte en forma”.',
        },
        {
          titular: 'Probá una clase, sin compromiso',
          idea: 'Mostrá por dentro una de tus clases más pedidas —funcional, spinning, musculación guiada— con el profe explicando en 2 líneas para quién es y qué se trabaja ese día.',
          imagen: 'Vení a probar esta clase',
          caption: 'Así se entrena en nuestra clase de funcional: fuerza, cardio y técnica, adaptada a tu nivel 🏋️ Si nunca viniste, escribinos por DM y coordinamos tu primera clase para que la pruebes antes de decidir tu plan.',
          cuando: 'Miércoles, entre las 18 y las 20 h.',
          porque: 'Bajar el primer paso a una sola clase prueba reduce el miedo de quien mira hace rato y todavía no se anota.',
        },
        {
          titular: 'Sin tiempo: rutina de treinta',
          idea: 'Compartí una rutina corta y real de 30 minutos —4 o 5 ejercicios, rondas y pausa— pensada para el socio que esta semana llega justo y está por faltar.',
          imagen: '30 minutos también cuentan',
          caption: '¿Día largo y poco tiempo? ⏱️ Esta rutina de 30 minutos trabaja todo el cuerpo: sentadillas, empuje, remo y core, en rondas cortas. Guardala, vení aunque sea media hora y no cortes la semana que venís construyendo.',
          cuando: 'Jueves, entre las 12 y las 14 h.',
          porque: 'Defiende la constancia de los socios actuales, que es lo que sostiene las renovaciones de fin de año.',
        },
      ],
    },
  ],
};

// La edición N de un segmento, o null si todavía no existe (el job salta:
// nunca se manda relleno — sistema-email-ideas.md §2/§3).
function editionFor(segment, n) {
  const list = EDITIONS[segment];
  if (!Array.isArray(list)) return null;
  return list.find((e) => e.n === n) || null;
}

function segmentsWithEditions() {
  return Object.keys(EDITIONS);
}

module.exports = { EDITIONS, editionFor, segmentsWithEditions };
