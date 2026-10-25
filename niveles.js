// niveles.js — EL SISTEMA DE NIVELES DE BAMBOOTY (espina del programa TestFlight).
// Spec: ~/workspace/bambooty-supremo/GAMIFICACION-NIVELES.md + niveles-posty.md.
// Leyes duras que este módulo hace cumplir en código:
//   1. Solo hechos: el nivel se computa de EVENTOS reales registrados en
//      oficina_nivel_eventos (append-only). Nada sube por tiempo ni por pago.
//   2. Nunca baja: los eventos no se borran; el cálculo es monótono.
//   3. Cada poder tiene sus 5 nombres (de sus propios documentos de sistema)
//      y sus compuertas (gates) de hitos por nivel.
//   4. La barra/tallo es del color del agente; la de la oficina, DORADA.
//   5. Lo sensible no se gamifica: los eventos del módulo de personas son
//      de TRABAJO (detección, preparación, aprobación) — jamás datos.
//   6. Estructura 4+4 (decisión de Valentino, 2026-10-25): el motor computa
//      CUATRO poderes + la oficina. Diseño y crecimiento cuentan para
//      Posty; personas cuenta para Gesty; dirección cuenta para la
//      oficina (Bambooty). Los especialistas NO tienen nivel propio.
'use strict';

// Dorado de la website (DETALLE-TOTAL §2): degradé metálico real.
const DORADO = { a: '#DFA856', b: '#DBA453', c: '#D6A463' };

// Registro de poderes (los CUATRO + la oficina). color/firma: los
// documentados en cada sistema (Posty celeste; Venty luz coral). Gesty y
// Atenty: acento provisional declarado en el informe del programa (sus
// documentos no fijan color de tallo). Los especialistas viven en su
// propio registro (ESPECIALISTAS), sin nivel ni tallo de poder.
const PODERES = {
  posty: {
    nombre: 'Posty', rol: 'Community Manager', color: '#2793C8', firma: 'lapiz', avatar: '/ai-avatar.png',
    niveles: ['Nuevo en tu feed', 'Leyendo tu mundo', 'De la casa', 'Mano derecha de tu Instagram', 'Tu socio de contenido'],
    gates: {
      2: [{ evento: 'fundamento_leido', min: 1, falta: 'Cuando Posty termina de leer tu mundo, sube.' }],
      3: [
        { evento: 'semana_generada', min: 1, falta: 'Cuando Posty arme tu primera semana desde tu fundamento.' },
        { evento: 'decision_bandeja', min: 1, falta: 'Tu primera decisión en la Bandeja le enseña tu gusto.' },
      ],
      4: [
        { evento: 'semana_aceptada', min: 1, falta: 'Si una semana entera sale aceptada, queda a un paso.' },
        { evento: 'pieza_aceptada_primera', min: 3, falta: 'Piezas aceptadas sin cambios: así se mide su acierto de primera.' },
      ],
      5: [
        { evento: 'semana_publicada', min: 4, falta: 'Semanas publicadas con constancia, sin incidentes.' },
        { evento: 'pregunta_respondida', min: 2, falta: 'Cada respuesta tuya cierra un hueco para siempre.' },
      ],
    },
  },
  gesty: {
    nombre: 'Gesty', rol: 'Administración', color: '#5B8C5A', firma: 'telefono', avatar: null,
    // Nombres provisorios del constructor (Gesty aún no bautizó los suyos en su
    // documento de sistema): palabras de su oficio sobre la escala común.
    niveles: ['Recién llegada', 'Conoce tus papeles', 'De la casa', 'Mano derecha de tu administración', 'Socia de tu administración'],
    gates: {
      2: [{ evento: 'fundamento_leido', min: 1, falta: 'Cuando Gesty conoce tus papeles y tus reglas.' }],
      3: [
        { evento: 'papel_ordenado', min: 3, falta: 'Papeles leídos y ordenados: su oficio en marcha.' },
        { evento: 'cierre_dia', min: 1, falta: 'Su primer cierre del día emitido.' },
      ],
      4: [
        { evento: 'cobranza_registrada', min: 3, falta: 'Cobranzas registradas con su medio de pago.' },
        { evento: 'reserva_registrada', min: 2, falta: 'Reservas tomadas y confirmadas.' },
      ],
      5: [
        { evento: 'cierre_dia', min: 20, falta: 'Cierres del día con constancia.' },
        { evento: 'decision_bandeja', min: 5, falta: 'Tus decisiones le enseñan cómo ordenás.' },
      ],
    },
  },
  venty: {
    nombre: 'Venty', rol: 'Ventas', color: '#FF7A59', firma: 'rey', avatar: null,
    niveles: ['Recién sentado al tablero', 'Leyendo tu partida', 'Jugando de memoria', 'Viendo tres jugadas adelante', 'La partida entera en su cabeza'],
    gates: {
      2: [{ evento: 'fundamento_leido', min: 1, falta: 'Cuando Venty leyó tu lista de precios y tus políticas.' }],
      3: [
        { evento: 'cotizacion_emitida', min: 1, falta: 'Su primera cotización desde tu lista cargada.' },
        { evento: 'objecion_aprendida', min: 1, falta: 'Una objeción respondida con tu respuesta aprobada.' },
      ],
      4: [
        { evento: 'cierre_partida', min: 3, falta: 'Partidas cerradas con su forma registrada.' },
        { evento: 'resena_pedida', min: 1, falta: 'La reseña se pide al cerrar, en la misma conversación.' },
      ],
      5: [
        { evento: 'cierre_partida', min: 15, falta: 'Partidas cerradas con constancia.' },
        { evento: 'jugada_bandeja', min: 3, falta: 'Jugadas sensibles resueltas con tu OK.' },
      ],
    },
  },
  atenty: {
    nombre: 'Atenty', rol: 'Atención al Cliente', color: '#2E8C83', firma: 'escudo', avatar: null,
    niveles: ['Nueva en el mostrador', 'Conoce a los de siempre', 'De la casa', 'La que avisa antes', 'Cuida como vos'],
    gates: {
      2: [{ evento: 'fundamento_leido', min: 1, falta: 'Cuando Atenty leyó tus políticas de cuidado.' }],
      3: [{ evento: 'caso_cerrado_confirmado', min: 1, falta: 'Su primer caso cerrado con la confirmación del cliente.' }],
      4: [
        { evento: 'caso_cerrado_confirmado', min: 5, falta: 'Casos cerrados con confirmación, con constancia.' },
        { evento: 'resena_registrada', min: 2, falta: 'Reseñas que nacen de casos bien cerrados.' },
      ],
      5: [{ evento: 'caso_cerrado_confirmado', min: 20, falta: 'Cuidar como vos, semana a semana.' }],
    },
  },
  oficina: {
    nombre: 'Bambooty', rol: 'Tu oficina', color: DORADO.b, firma: 'medallon', avatar: '/bambooty-avatar.webp',
    niveles: ['Llegando', 'Conociendo tu mundo', 'De la casa', 'Mano derecha', 'Socio'],
    gates: {
      2: [{ evento: 'fundamento_cargado', min: 1, falta: 'Tu fundamento cargado: las raíces de tu oficina.' }],
      3: [
        { evento: 'decision_dueno', min: 1, falta: 'Tu primera decisión: la oficina aprende cómo decidís.' },
        { metrica: 'poderes_con_salida', min: 1, falta: 'El primer trabajo entregado por un poder.' },
      ],
      4: [
        { metrica: 'poderes_con_salida', min: 4, falta: 'Cuatro poderes ya entregaron trabajo real.' },
        { evento: 'parte_oficina', min: 1, falta: 'El primer parte de tu oficina, desde los registros.' },
      ],
      5: [
        { metrica: 'poderes_con_salida', min: 4, falta: 'Los cuatro poderes entregando: la oficina entera.' },
        { evento: 'semanas_creciendo', min: 4, falta: 'Semanas creciendo juntos, sin cortar.' },
      ],
    },
  },
};

// ——— LA SEGUNDA LÍNEA: ESPECIALISTAS POR PROYECTO (BAMBOOTY-SUPREMO §0 bis).
// Sin nivel propio ni tallo de poder: su presencia en la oficina es su
// misión. Cuando un proyecto suyo está activo, su trabajo aparece en la
// Bandeja como proyecto (y su push solo sale con proyecto activo).
const ESPECIALISTAS = {
  desy: {
    nombre: 'Desy', mision: 'Proyectos de marca y web: identidad, logo, tienda online, packaging',
    color: '#E0218A', firma: 'poster', avatar: null, anfitrion: 'posty',
  },
  talenty: {
    nombre: 'Talenty', mision: 'Contrataciones: busca, filtra y te trae la terna lista',
    color: '#F0A868', firma: 'calendario', avatar: null, anfitrion: 'gesty',
  },
  growty: {
    nombre: 'Growty', mision: 'Alianzas y embajadores: colaboraciones y socios que traen clientes, por campaña',
    color: '#8BC34A', firma: 'gota', avatar: null, anfitrion: 'posty',
  },
  bossty: {
    nombre: 'Bossty', mision: 'Proyectos de dirección: la auditoría con veredicto y la expansión',
    color: '#C9962E', firma: 'estrella', avatar: null, anfitrion: 'oficina',
  },
};

// EL PLIEGUE: a qué poder cuenta el trabajo de cada clave que ya no es un
// poder separado. Los eventos YA registrados bajo estas claves (el río es
// append-only: nada se borra) cuentan para su anfitrión, y todo evento
// nuevo se registra directamente bajo el anfitrión.
const PLIEGUE = { desy: 'posty', growty: 'posty', talenty: 'gesty', bossty: 'oficina' };
function resolverPoder(poder) { return PLIEGUE[poder] || poder; }

// Identidad presentable de CUALQUIER clave (poder, especialista u
// oficina): nombre/color/avatar para Bandeja, río, push y chat.
const IDENTIDADES = {};
for (const [k, v] of Object.entries(PODERES)) IDENTIDADES[k] = { nombre: v.nombre, rol: v.rol, color: v.color, firma: v.firma, avatar: v.avatar };
for (const [k, v] of Object.entries(ESPECIALISTAS)) IDENTIDADES[k] = { nombre: v.nombre, rol: v.mision, color: v.color, firma: v.firma, avatar: v.avatar };

const ORDEN_PODERES = ['posty', 'venty', 'atenty', 'gesty'];
const ORDEN_ESPECIALISTAS = ['desy', 'talenty', 'growty', 'bossty'];

function clavesQueCuentan(poder) {
  const destino = resolverPoder(poder);
  const claves = [destino];
  for (const k of Object.keys(PLIEGUE)) if (PLIEGUE[k] === destino && !claves.includes(k)) claves.push(k);
  return claves;
}

function conteoEventos(db, uid, poder) {
  const claves = clavesQueCuentan(poder);
  const out = {};
  try {
    const qs = claves.map(() => '?').join(',');
    const rows = db.prepare(`SELECT evento, COUNT(*) AS n FROM oficina_nivel_eventos WHERE user_id = ? AND poder IN (${qs}) GROUP BY evento`).all(uid, ...claves);
    for (const r of rows) out[r.evento] = r.n;
  } catch (e) { /* tabla aún no creada: nivel base */ }
  return out;
}

// metrics: { poderes_con_salida: n } — lo provee oficina.js (conteo real de
// poderes con al menos una salida registrada). Sin provider, vale 0.
function computarNivel(db, uid, poder, metrics) {
  poder = resolverPoder(poder);
  const def = PODERES[poder];
  if (!def) return null;
  const conteos = conteoEventos(db, uid, poder);
  const reqCumplido = (req) => {
    if (req.metrica) return ((metrics && metrics[req.metrica]) || 0) >= req.min;
    return (conteos[req.evento] || 0) >= req.min;
  };
  const reqProgreso = (req) => {
    if (req.metrica) return Math.min(((metrics && metrics[req.metrica]) || 0), req.min);
    return Math.min(conteos[req.evento] || 0, req.min);
  };
  let nivel = 1;
  const hitos = [];
  for (let L = 2; L <= 5; L++) {
    const gate = def.gates[L] || [];
    const todos = gate.every(reqCumplido);
    for (const req of gate) {
      hitos.push({
        nivel_objetivo: L,
        clave: req.evento || req.metrica,
        falta: req.falta,
        cumplido: reqCumplido(req),
        progreso: reqProgreso(req),
        min: req.min,
      });
    }
    if (todos && nivel === L - 1) nivel = L;
  }
  // Gate en curso: el del nivel siguiente (si hay).
  const gateActual = nivel < 5 ? (def.gates[nivel + 1] || []) : [];
  const pendientes = gateActual.filter((r) => !reqCumplido(r));
  const progresoGate = gateActual.length
    ? Math.round(100 * (gateActual.reduce((a, r) => a + reqProgreso(r), 0) / gateActual.reduce((a, r) => a + r.min, 0)))
    : 100;
  return {
    poder,
    nivel,
    nombre_nivel: def.niveles[nivel - 1],
    nombre: def.nombre,
    rol: def.rol,
    color: def.color,
    hitos,
    hitos_cumplidos: hitos.filter((h) => h.cumplido).length,
    hitos_total: hitos.length,
    gate: {
      nivel_objetivo: Math.min(nivel + 1, 5),
      progreso_pct: nivel >= 5 ? 100 : progresoGate,
      pendientes: pendientes.map((r) => ({ clave: r.evento || r.metrica, falta: r.falta })),
    },
    proximo_paso: nivel >= 5 ? null : (pendientes[0] ? pendientes[0].falta : null),
    eventos: conteos,
  };
}

// Registra un evento real y devuelve el resultado con detección de subida.
// `hecho` es la frase humana del evento (para el río y el parte).
function registrarEvento(db, uid, { poder, evento, hecho, registro_ref }, metrics) {
  poder = resolverPoder(poder); // el pliegue: el evento nace bajo su anfitrión
  const antes = computarNivel(db, uid, poder, metrics);
  db.prepare('INSERT INTO oficina_nivel_eventos (user_id, poder, evento, hecho, registro_ref, ts) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uid, poder, evento, hecho || '', registro_ref || '', Date.now());
  const despues = computarNivel(db, uid, poder, metrics);
  let subida = null;
  if (antes && despues && despues.nivel > antes.nivel) {
    subida = {
      poder,
      nombre: PODERES[poder].nombre,
      nivel: despues.nivel,
      nombre_nivel: despues.nombre_nivel,
      color: PODERES[poder].color,
      avatar: PODERES[poder].avatar,
    };
    // La subida queda registrada: es un hecho del río, no un cartel.
    try {
      db.prepare('INSERT INTO oficina_registros (user_id, poder, tipo, resumen, registro_ref, recibo_json, estado, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uid, poder, 'subida_nivel', `${PODERES[poder].nombre} subió a ${despues.nombre_nivel}`, `nivel:${poder}:${despues.nivel}:${Date.now()}`, null, 'registrado', Date.now());
    } catch (e) { /* el río es derivado: si falla, la subida igual ocurrió */ }
  }
  return { nivel: despues, subida };
}

// ---------- LOS 6 AGREGADOS (v459): desafio semanal + prueba del nivel ----------
// Copy ES/EN en un solo lugar: el servidor la sirve y la tira la muestra tal
// cual. Sin puntajes, sin rachas, sin lenguaje de fracaso: el desafio es el
// proximo nudo con su accion de un toque; la prueba es UN hecho real.
const DESAFIO_MAP = {
  fundamento_leido: { accion: '#/app/negocio', titulo: { es: 'Que Posty termine de leer tu mundo', en: 'Let Posty finish reading your world' }, texto: { es: 'Tu fundamento todavía está incompleto: Posty lee lo legible y te pregunta solo el hueco.', en: 'Your fundamento is still incomplete: Posty reads what is readable and only asks you for the gap.' } },
  semana_generada: { accion: '#/app/schedule', titulo: { es: 'Armá tu primera semana', en: 'Build your first week' }, texto: { es: 'Posty ya conoce tu mundo: tu semana nace de ahí.', en: 'Posty already knows your world: your week is born from it.' } },
  decision_bandeja: { accion: '#/app/bandeja', titulo: { es: 'Decidí tu semana con un toque', en: 'Decide your week in one tap' }, texto: { es: 'Tu semana espera tu OK en la Bandeja.', en: 'Your week is waiting for your OK in the Bandeja.' } },
  semana_aceptada: { accion: '#/app/schedule', titulo: { es: 'Aceptá tu semana entera', en: 'Accept your whole week' }, texto: { es: 'Una semana entera aceptada: así Posty confirma tu gusto.', en: 'A whole week accepted: that is how Posty confirms your taste.' } },
  pieza_aceptada_primera: { accion: '#/app/schedule', titulo: { es: 'Aceptá piezas sin cambios', en: 'Accept pieces as-is' }, texto: { es: 'Cuando una pieza te gusta tal cual, aceptala: así Posty aprende tu gusto.', en: 'When you like a piece as-is, accept it: that is how Posty learns your taste.' } },
  semana_publicada: { accion: '#/app/schedule', titulo: { es: 'Dejá que tu semana se publique sola', en: 'Let your week publish on its own' }, texto: { es: 'El autopiloto publica solo: cada semana completa publicada te acerca.', en: 'Autopilot publishes on its own: each fully published week brings you closer.' } },
  pregunta_respondida: { accion: '#/app/chat', titulo: { es: 'Respondé la pregunta de Posty', en: 'Answer Posty’s question' }, texto: { es: 'Cada respuesta cierra un hueco para siempre.', en: 'Every answer closes a gap for good.' } },
};
function semanaISO(d) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
function desafioPara(niv) {
  if (!niv || niv.nivel >= 5) return null;
  const falt = (niv.gate && niv.gate.pendientes) || [];
  if (!falt.length) return null;
  const d = DESAFIO_MAP[falt[0].clave];
  if (!d) return null;
  return { clave: falt[0].clave, accion: d.accion, titulo: d.titulo, texto: d.texto, semana: semanaISO(new Date()) };
}
// datos: { business, item, tema, ultimaSemana: { fecha } } — todo real, todo
// opcional: sin dato real para el nivel, la prueba es null (nunca inventada).
function pruebaPara(niv, datos) {
  if (!niv || niv.nivel < 2) return null;
  const ev = niv.eventos || {};
  const d = datos || {};
  if (niv.nivel === 2) {
    if (d.item) return { es: `Posty ya sabe que ${d.business ? d.business + ' ofrece' : 'tu negocio ofrece'} ${d.item}.`, en: `Posty already knows that ${d.business ? d.business + ' offers' : 'your business offers'} ${d.item}.` };
    if (d.tema) return { es: `Posty ya conoce de tu feed el tema ${d.tema}.`, en: `Posty already knows the theme ${d.tema} from your feed.` };
    return null;
  }
  if (niv.nivel === 3) {
    if (!d.ultimaSemana) return null;
    return { es: `Tu semana del ${d.ultimaSemana.fecha} nació de tu fundamento.`, en: `Your week of ${d.ultimaSemana.fecha} was born from your fundamento.` };
  }
  if (niv.nivel === 4) {
    const n = ev.pieza_aceptada_primera || 0;
    if (!n) return null;
    return { es: `Aceptaste ${n} piezas sin cambios: Posty ya acierta de primera.`, en: `You accepted ${n} pieces as-is: Posty already gets it right the first time.` };
  }
  const s = ev.semana_publicada || 0;
  const p = ev.pregunta_respondida || 0;
  if (!s) return null;
  return { es: `${s} semanas publicadas con constancia${p ? ` y ${p} preguntas respondidas` : ''}: tu socio ya trabaja solo.`, en: `${s} weeks published steadily${p ? ` and ${p} questions answered` : ''}: your partner already works on its own.` };
}

module.exports = { PODERES, ESPECIALISTAS, ORDEN_PODERES, ORDEN_ESPECIALISTAS, PLIEGUE, resolverPoder, IDENTIDADES, DORADO, computarNivel, registrarEvento, conteoEventos, DESAFIO_MAP, desafioPara, pruebaPara, semanaISO };
