// niveles.js — EL SISTEMA DE NIVELES DE BAMBOOTY (espina del programa TestFlight).
// Spec: ~/workspace/bambooty-supremo/GAMIFICACION-NIVELES.md + niveles-posty.md.
// Leyes duras que este módulo hace cumplir en código:
//   1. Solo hechos: el nivel se computa de EVENTOS reales registrados en
//      oficina_nivel_eventos (append-only). Nada sube por tiempo ni por pago.
//   2. Nunca baja: los eventos no se borran; el cálculo es monótono.
//   3. Cada poder tiene sus 5 nombres (de sus propios documentos de sistema)
//      y sus compuertas (gates) de hitos por nivel.
//   4. La barra/tallo es del color del agente; la de la oficina, DORADA.
//   5. Lo sensible no se gamifica: los eventos de Talenty son de TRABAJO
//      (detección, preparación, aprobación) — jamás datos de personas.
'use strict';

// Dorado de la website (DETALLE-TOTAL §2): degradé metálico real.
const DORADO = { a: '#DFA856', b: '#DBA453', c: '#D6A463' };

// Registro de poderes. color/firma: los documentados en cada sistema
// (Posty celeste; Venty luz coral; Desy fucsia; Growty lima; Talenty durazno;
// Bossty dorado de capitán). Gesty y Atenty: acento provisional declarado en
// el informe del programa (sus documentos no fijan color de tallo).
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
  growty: {
    nombre: 'Growty', rol: 'Crecimiento', color: '#8BC34A', firma: 'gota', avatar: null,
    niveles: ['Semilla', 'Echando raíces', 'Primer brote', 'Despegue', 'Bosque'],
    gates: {
      2: [
        { evento: 'fundamento_leido', min: 1, falta: 'Cuando Growty leyó tu mundo público.' },
        { evento: 'fuente_leida', min: 1, falta: 'Su primera fuente real leída y registrada.' },
      ],
      3: [{ evento: 'campana_armada', min: 1, falta: 'Su primera campaña armada (en sombra, declarada).' }],
      4: [
        { evento: 'campana_armada', min: 3, falta: 'Campañas armadas con constancia.' },
        { evento: 'medicion_real', min: 1, falta: 'La medición real llega con la Marketing API (enero 2027).' },
      ],
      5: [{ evento: 'medicion_real', min: 4, falta: 'Mediciones reales que sostienen su criterio.' }],
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
  desy: {
    nombre: 'Desy', rol: 'Diseño Gráfico', color: '#E0218A', firma: 'poster', avatar: null,
    niveles: ['Recién llegada', 'Conociendo tu marca', 'Diseñadora de la casa', 'Mano derecha de tu marca', 'Socia de tu marca'],
    gates: {
      2: [{ evento: 'fundamento_leido', min: 1, falta: 'Cuando Desy conoce tu paleta y tu estrella.' }],
      3: [
        { evento: 'pieza_entregada', min: 1, falta: 'Su primera pieza entregada en tu biblioteca.' },
        { evento: 'pieza_aceptada_primera', min: 1, falta: 'Una pieza aceptada sin cambios.' },
      ],
      4: [
        { evento: 'pieza_entregada', min: 5, falta: 'Piezas entregadas con constancia.' },
        { evento: 'decision_bandeja', min: 3, falta: 'Tus decisiones le enseñan tu gusto.' },
      ],
      5: [{ evento: 'pieza_entregada', min: 20, falta: 'Diseñar tu marca como socia.' }],
    },
  },
  talenty: {
    nombre: 'Talenty', rol: 'Recursos Humanos', color: '#F0A868', firma: 'calendario', avatar: null,
    niveles: ['Recién llegada', 'Conociendo a tu gente', 'De la casa', 'Mano derecha', 'Socia'],
    gates: {
      2: [{ evento: 'fundamento_leido', min: 1, falta: 'Cuando Talenty conoce a tu equipo (en su compartimento, sin exhibirlo).' }],
      3: [
        { evento: 'vencimiento_detectado', min: 1, falta: 'Su primera detección antes de que venza.' },
        { evento: 'liquidacion_preparada', min: 1, falta: 'Su primera liquidación preparada para tu OK.' },
      ],
      4: [{ evento: 'liquidacion_aprobada', min: 2, falta: 'Liquidaciones aprobadas por vos, listas para ejecutar.' }],
      5: [{ evento: 'liquidacion_aprobada', min: 8, falta: 'Tu año de personas, planificado con ella.' }],
    },
  },
  bossty: {
    nombre: 'Bossty', rol: 'Gerente General', color: '#C9962E', firma: 'estrella', avatar: null,
    niveles: ['Recién a bordo', 'Mapa leído', 'Semana dominada', 'Mano que anticipa', 'Socio de puente'],
    gates: {
      2: [{ evento: 'fundamento_leido', min: 1, falta: 'Cuando Bossty leyó el mapa completo de tu negocio.' }],
      3: [
        { evento: 'parte_emitido', min: 1, falta: 'Su primer parte semanal armado desde los registros.' },
        { evento: 'orden_cumplida', min: 1, falta: 'Su primera orden cumplida por un poder.' },
      ],
      4: [
        { evento: 'parte_emitido', min: 4, falta: 'Partes semanales con constancia.' },
        { evento: 'decision_direccion', min: 2, falta: 'Decisiones de dirección con resultado observable.' },
      ],
      5: [{ evento: 'parte_emitido', min: 16, falta: 'Un ciclo mensual completo dirigido por él.' }],
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
        { metrica: 'poderes_con_salida', min: 7, falta: 'Los siete poderes entregando: la oficina entera.' },
        { evento: 'semanas_creciendo', min: 4, falta: 'Semanas creciendo juntos, sin cortar.' },
      ],
    },
  },
};

const ORDEN_PODERES = ['posty', 'gesty', 'venty', 'growty', 'atenty', 'desy', 'talenty', 'bossty'];

function conteoEventos(db, uid, poder) {
  const out = {};
  try {
    const rows = db.prepare('SELECT evento, COUNT(*) AS n FROM oficina_nivel_eventos WHERE user_id = ? AND poder = ? GROUP BY evento').all(uid, poder);
    for (const r of rows) out[r.evento] = r.n;
  } catch (e) { /* tabla aún no creada: nivel base */ }
  return out;
}

// metrics: { poderes_con_salida: n } — lo provee oficina.js (conteo real de
// poderes con al menos una salida registrada). Sin provider, vale 0.
function computarNivel(db, uid, poder, metrics) {
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

module.exports = { PODERES, ORDEN_PODERES, DORADO, computarNivel, registrarEvento, conteoEventos };
