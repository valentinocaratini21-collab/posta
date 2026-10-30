// gesty-prueba.js — LA PRUEBA DE GESTY (diseño «prueba perfecta» aprobado
// 29/10, build local sin push).
//
// Orden aprobado, sin atajos:
//  1. Inicio en un clic: email o @ en un solo campo, sin formulario
//     largo. Gesty estudia el negocio y arma su fundamento con lo que
//     ya existe (fundamentoEstado); nunca se vuelve a preguntar lo que
//     ya sabe: el inicio solo guarda el contacto y retrata el
//     fundamento que hay.
//  2. Espejo de ayer: con lo que llegó ayer (llamadas perdidas +
//     cola de la mañana, los registros de recepción de ESTE árbol),
//     muestra lo perdido con la respuesta que Gesty les hubiera dado
//     (borrador, nunca enviado) y el turno propuesto (propuesta,
//     nunca creado). SOLO datos reales: sin registros, estado vacío
//     honesto, nunca simulado. El feed vivo de WhatsApp es G-12 y
//     vive en otro árbol: el espejo lo marca como pendiente de
//     unificación y NO finge que lo leyó.
//  3. Semana en vivo: mensajes, turnos y papeles de verdad. En modo
//     'todo' (primeros días) TODA acción pasa por Bandeja con un
//     toque; el dueño gradúa con un toque a modo 'sensible' y ahí
//     lo rutinario corre solo y solo lo sensible espera su OK.
//     La aprobación usa EL flujo estándar (approveCard + ejecutor
//     'prueba-accion'): no hay una segunda Bandeja.
//  4. Una frase por día: reuse de gestyHoy, la misma fuente que La
//     oficina. Sin dashboard.
//  5. Cierre de la semana: la semana en números reales → momento de
//     paywall USD 250/mes (Gesty único), SOLO checkout de prueba:
//     nunca se crea un cobro real en la prueba (cobra_real: false).
//  6. Llamadas en vivo: GATED por la vara de voz (G-13, pendiente).
//     La prueba incluye mensajes, turnos y papeles. Devolver una
//     llamada perdida registrada SÍ está disponible (es un registro,
//     no una llamada en vivo); responder llamadas en vivo NO es una
//     acción de la prueba y se rechaza con el motivo del gate.
//
// Reglas que mandan: recepción primero · vara de 3 preguntas por
// superficie (¿pidió algo dos veces? ¿tuvo que operar algo? ¿se
// mostró algo sin verificar?) · un toque por acción · color amatista
// #A175CA en vistas nuevas · cero datos simulados, cero testimonios,
// cero números inventados (las horas devueltas quedan en null con su
// motivo: no hay modelo del dueño guardado del que derivarlas y no
// se inventan).
'use strict';
const gesty = require('./gesty.js');
const vistas = require('./gesty-vistas.js');
const agenda = require('./gesty-agenda.js');
const perdidas = require('./gesty-llamadas-perdidas.js');
const fueraHorario = require('./gesty-fuera-horario.js');
const comprobantes = require('./gesty-comprobantes.js');

const PRECIO_USD = 250; // Gesty único, plan único vigente (packs del sitio).
const PLAN_DEEP_LINK = '#/app/ajustes?plan_sel=1&agente=gesty&nivel=unico';
const TIPOS_ACCION = ['mensaje', 'turno', 'papel', 'llamado'];
const GATE_VOZ = 'Las llamadas en vivo están gated por la vara de voz (G-13, pendiente): la prueba arranca con mensajes, turnos y papeles y las llamadas entran cuando la voz esté validada. Nunca se prometen antes.';
const GATE_WHATSAPP = 'G-12 pendiente de unificación: el feed vivo de WhatsApp vive en otro árbol. El espejo lee los registros de recepción de este árbol (llamadas perdidas + cola de la mañana) y nunca finge haber leído el feed vivo.';

function fail(m) { const e = new Error(m); e.gesty = true; throw e; }
function norm(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function esFechaISO(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function sumarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function ayerDe(hoy) { return sumarDias(hoy, -1); }
function parseJson(raw, fallback) {
  try { const v = JSON.parse(raw || ''); return v === null || v === undefined ? fallback : v; }
  catch (e) { return fallback; }
}

function ensureSchema(db) {
  gesty.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_prueba (
    user_id INTEGER PRIMARY KEY, contacto TEXT NOT NULL DEFAULT '',
    contacto_tipo TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'espejo',
    fecha_inicio TEXT NOT NULL DEFAULT '', fecha_fin_semana TEXT NOT NULL DEFAULT '',
    modo_aprobacion TEXT NOT NULL DEFAULT 'todo',
    fundamento_total INTEGER NOT NULL DEFAULT 0, fundamento_origenes TEXT NOT NULL DEFAULT '{}',
    espejo_json TEXT NOT NULL DEFAULT '', cierre_json TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_prueba_acciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    fecha TEXT NOT NULL DEFAULT '', tipo TEXT NOT NULL DEFAULT '',
    titulo TEXT NOT NULL DEFAULT '', detalle TEXT NOT NULL DEFAULT '{}',
    sensible INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'pendiente_ok',
    tarjeta_id INTEGER, origen TEXT NOT NULL DEFAULT 'semana',
    resultado TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_prueba_acc ON gesty_prueba_acciones(user_id, fecha, estado, id)');
}

function parsePrueba(r) {
  if (!r) return null;
  return {
    user_id: r.user_id, contacto: r.contacto, contacto_tipo: r.contacto_tipo,
    estado: r.estado, fecha_inicio: r.fecha_inicio, fecha_fin_semana: r.fecha_fin_semana,
    modo_aprobacion: r.modo_aprobacion, fundamento_total: r.fundamento_total,
    fundamento_origenes: parseJson(r.fundamento_origenes, {}),
    espejo: parseJson(r.espejo_json, null), cierre: parseJson(r.cierre_json, null),
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}
function getPrueba(db, userId) {
  ensureSchema(db);
  return parsePrueba(db.prepare('SELECT * FROM gesty_prueba WHERE user_id = ?').get(userId));
}
function getActiva(db, userId) {
  const p = getPrueba(db, userId);
  if (p && (p.estado === 'espejo' || p.estado === 'viva')) return p;
  return null;
}
function parseAccion(r) {
  if (!r) return null;
  return {
    id: r.id, user_id: r.user_id, fecha: r.fecha, tipo: r.tipo, titulo: r.titulo,
    detalle: parseJson(r.detalle, {}), sensible: r.sensible === 1,
    estado: r.estado, tarjeta_id: r.tarjeta_id === null ? null : Number(r.tarjeta_id),
    origen: r.origen, resultado: r.resultado || '', creado_en: r.created_at,
  };
}
function getAccion(db, userId, id) {
  ensureSchema(db);
  return parseAccion(db.prepare('SELECT * FROM gesty_prueba_acciones WHERE user_id = ? AND id = ?').get(userId, Number(id)));
}

// --- Contacto de un solo campo: email o @, nada más -----------------------
function clasificarContacto(raw) {
  const v = norm(raw);
  if (!v) fail('El inicio lleva un email o un @, en un solo campo.');
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { contacto: v.toLowerCase(), tipo: 'email' };
  const handle = v.replace(/^@+/, '').toLowerCase();
  if (/^[a-z0-9._]{1,40}$/.test(handle)) return { contacto: `@${handle}`, tipo: 'ig' };
  fail('El inicio lleva un email o un @, en un solo campo.');
}

// --- Nombre del negocio desde el fundamento (sin adivinar) -----------------
function nombreNegocio(db, userId) {
  try {
    const datos = (gesty.foundationForOwner(db, userId).datos || []);
    const f = datos.find((d) => ['nombre_negocio', 'nombre', 'negocio'].includes(d.campo) && d.valor);
    return f ? String(f.valor) : null;
  } catch (e) { return null; }
}

// --- Borrador de respuesta: siempre Gesty, nunca humana, nunca enviado -----
function borradorRespuesta(db, userId, item) {
  const negocio = nombreNegocio(db, userId) || 'tu negocio';
  const nombre = item.nombre || 'cliente';
  const base = `Soy Gesty, la asistente de ${negocio}.`;
  if (item.origen === 'llamada-perdida') {
    return {
      texto: `Hola ${nombre}, ${base} Ayer nos llamaste y no llegamos a atenderte — perdón. ¿Te agendo un turno para esta semana?`,
      presentacion: base, es_borrador: true, enviado: false,
    };
  }
  const pedido = item.pedido ? ` Vi tu mensaje: «${item.pedido}».` : '';
  return {
    texto: `Hola ${nombre}, ${base} Gracias por escribirnos.${pedido} Te confirmo en un momento.`,
    presentacion: base, es_borrador: true, enviado: false,
  };
}

// ---------------------------------------------------------------------------
// 1. Inicio en un clic
// ---------------------------------------------------------------------------
function iniciar(db, userId, datos) {
  ensureSchema(db);
  const activa = getActiva(db, userId);
  if (activa) return { ...activa, ya_iniciada: true };
  const c = clasificarContacto(datos && datos.contacto);
  const fundamento = vistas.fundamentoEstado(db, userId);
  const hoy = hoyISO();
  db.prepare(`INSERT INTO gesty_prueba
    (user_id, contacto, contacto_tipo, estado, fecha_inicio, modo_aprobacion,
     fundamento_total, fundamento_origenes, updated_at)
    VALUES (?,?,?,?,?,'todo',?,?,datetime('now'))`)
    .run(userId, c.contacto, c.tipo, 'espejo', hoy, fundamento.total,
      JSON.stringify(fundamento.origenes || {}));
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'prueba', entidad_id: String(userId),
    tipo_evento: 'prueba-iniciada',
    resumen: `Prueba de Gesty iniciada con ${c.contacto} (fundamento: ${fundamento.total} datos).`,
    payload: { contacto_tipo: c.tipo, fundamento_total: fundamento.total },
  });
  return { ...getPrueba(db, userId), ya_iniciada: false };
}

// ---------------------------------------------------------------------------
// 2. Espejo de ayer (solo lectura + borradores; nada se crea ni se envía)
// ---------------------------------------------------------------------------
function espejoAyer(db, userId, opts) {
  ensureSchema(db);
  const prueba = getPrueba(db, userId);
  if (!prueba) fail('Todavía no hay prueba iniciada: el espejo necesita el inicio en un clic primero.');
  const o = opts || {};
  if (o.hoy !== undefined && !esFechaISO(o.hoy)) fail('La fecha va en formato AAAA-MM-DD.');
  if (o.fecha !== undefined && !esFechaISO(o.fecha)) fail('La fecha va en formato AAAA-MM-DD.');
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const ayer = esFechaISO(o.fecha) ? String(o.fecha) : ayerDe(hoy);
  const llamadas = perdidas.pendientes(db, userId, { fecha: ayer }).map((p) => {
    const item = { origen: 'llamada-perdida', id: p.id, contacto: p.contacto || '',
      nombre: p.nombre || '', fecha: p.fecha, hora: p.hora || '', motivo: p.motivo || '', veces: p.veces || 1 };
    return { ...item,
      respuesta: borradorRespuesta(db, userId, item),
      turno_propuesto: { cliente: item.nombre || item.contacto, contacto: item.contacto,
        nota: 'Turno propuesto desde lo perdido ayer — se crea solo con tu OK.', requiere_ok: true, creado: false },
    };
  });
  let cola = [];
  try { cola = fueraHorario.colaManana(db, userId, {}).filter((r) => r.fecha === ayer); } catch (e) { cola = []; }
  const mensajes = cola.map((c) => {
    const item = { origen: 'cola-manana', id: c.id, canal: c.canal || 'mensaje',
      contacto: c.contacto || '', nombre: c.nombre || '', pedido: c.pedido || '',
      fecha: c.fecha, para_manana: c.para_manana || '' };
    return { ...item,
      respuesta: borradorRespuesta(db, userId, item),
      turno_propuesto: { cliente: item.nombre || item.contacto, contacto: item.contacto,
        nota: 'Turno propuesto desde lo perdido ayer — se crea solo con tu OK.', requiere_ok: true, creado: false },
    };
  });
  const total = llamadas.length + mensajes.length;
  const resumen = { fecha: ayer, llamadas: llamadas.length, mensajes: mensajes.length, total_perdidos: total,
    turnos_propuestos: total };
  db.prepare(`UPDATE gesty_prueba SET espejo_json = ?, updated_at = datetime('now') WHERE user_id = ?`)
    .run(JSON.stringify(resumen), userId);
  return {
    fecha: ayer, tiene_datos: total > 0, llamadas, mensajes, resumen,
    fuente: { whatsapp_en_vivo: false, motivo: GATE_WHATSAPP,
      registros: ['llamadas-perdidas', 'cola-manana'] },
    mensaje_vacio: total === 0
      ? 'Ayer no quedó ningún llamado ni mensaje registrado: no hay nada que reflejar. Cuando WhatsApp esté conectado (G-12), Gesty registra lo que llega y el espejo lo muestra acá.'
      : '',
    mensaje_vacio_en: total === 0
      ? 'Yesterday no calls or messages were recorded: there is nothing to mirror. When WhatsApp is connected (G-12), Gesty records what arrives and the mirror shows it here.'
      : '',
  };
}

// ---------------------------------------------------------------------------
// 3. Semana en vivo: proponer / aprobar / rechazar / graduar
// ---------------------------------------------------------------------------
function activarSemana(db, userId, opts) {
  ensureSchema(db);
  const prueba = getPrueba(db, userId);
  if (!prueba) fail('Todavía no hay prueba iniciada.');
  if (prueba.estado === 'viva') return { ...getPrueba(db, userId), ya_activa: true };
  if (prueba.estado !== 'espejo') fail('La semana ya se cerró: el cierre guarda los números y el momento de paywall.');
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  db.prepare(`UPDATE gesty_prueba SET estado = 'viva', fecha_inicio = ?, fecha_fin_semana = ?, updated_at = datetime('now') WHERE user_id = ?`)
    .run(hoy, sumarDias(hoy, 6), userId);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'prueba', entidad_id: String(userId),
    tipo_evento: 'prueba-semana-activa',
    resumen: `Semana en vivo de la prueba: del ${hoy} al ${sumarDias(hoy, 6)} (modo todo-por-Bandeja).`,
    payload: { desde: hoy, hasta: sumarDias(hoy, 6) },
  });
  return { ...getPrueba(db, userId), ya_activa: false };
}

function requiereOk(prueba, sensible) {
  if (!prueba) return true;
  if (prueba.modo_aprobacion === 'todo') return true;
  return !!sensible; // modo 'sensible': solo lo sensible espera el toque
}

function ejecutarAccion(db, userId, accion) {
  const d = accion.detalle || {};
  if (accion.tipo === 'turno') {
    const ev = agenda.crearEvento(db, userId, {
      titulo: d.titulo || accion.titulo || 'Turno',
      tipo: 'turno', fecha: d.fecha, hora: d.hora || '',
      duracion_min: d.duracion_min === undefined ? 30 : d.duracion_min,
      cliente_nombre: d.cliente_nombre || '', cliente_contacto: d.cliente_contacto || '',
    }, { creado_por: 'gesty' });
    return { ejecutada: true, evento_id: ev && ev.evento ? ev.evento.id : null };
  }
  if (accion.tipo === 'llamado') {
    if (!d.perdida_id) fail('Para devolver una llamada hace falta la perdida registrada: no se inventa una devolución.');
    const dev = perdidas.devolver(db, userId, d.perdida_id, { por: 'recepcion', nota: d.nota || '' });
    return { ejecutada: true, perdida_id: dev.id };
  }
  if (accion.tipo === 'papel') {
    const c = comprobantes.registrarManual(db, userId, {
      tipo: d.tipo_papel || 'factura', emisor_nombre: d.emisor_nombre || '',
      emisor_cuit: d.emisor_cuit || '', numero: d.numero || '',
      fecha: d.fecha || hoyISO(), moneda: d.moneda || 'ARS',
      monto_total: d.monto_total === undefined ? null : d.monto_total,
      concepto: d.concepto || accion.titulo || '',
    }, { origen: 'prueba', creado_por: 'gesty', via: 'prueba' });
    return { ejecutada: true, comprobante_id: c && c.id ? c.id : null };
  }
  if (accion.tipo === 'mensaje') {
    // Sin motor de envío en este árbol: la respuesta aprobada queda
    // LISTA para enviar, nunca se declara enviada. El envío es G-12.
    return { ejecutada: false, lista_para_enviar: true,
      envio: 'pendiente-unificacion-g12',
      nota: 'Respuesta aprobada y lista; el envío por WhatsApp llega con G-12.' };
  }
  fail(`Tipo de acción desconocido: ${accion.tipo}.`);
}

function sincronizarLedger(db, userId, accion, resultado) {
  const estado = accion.tipo === 'mensaje' && resultado.lista_para_enviar
    ? 'lista_para_enviar' : 'ejecutada';
  db.prepare(`UPDATE gesty_prueba_acciones SET estado = ?, resultado = ? WHERE id = ?`)
    .run(estado, JSON.stringify(resultado), accion.id);
  return getAccion(db, userId, accion.id);
}

// Ejecutor de Bandeja (tipo 'prueba-accion'): corre desde approveCard.
// El detalle de la tarjeta trae accion_id; sin ella, no se ejecuta nada.
function ejecutorPruebaAccion(db, userId, card) {
  const detalle = (card && card.detalle) || {};
  const accion = getAccion(db, userId, detalle.accion_id);
  if (!accion) return { ok: false, motivo: 'La acción de la prueba ya no existe.' };
  if (accion.estado === 'ejecutada' || accion.estado === 'lista_para_enviar') {
    return { ok: true, ya_ejecutada: true };
  }
  if (accion.estado !== 'pendiente_ok') return { ok: false, motivo: 'La acción ya no está esperando tu OK.' };
  try {
    const res = ejecutarAccion(db, userId, accion);
    sincronizarLedger(db, userId, accion, res);
    return { ok: true, accion_id: accion.id, resultado: res };
  } catch (e) {
    return { ok: false, motivo: String(e.message || e).slice(0, 240) };
  }
}
gesty.registerExecutor('prueba-accion', ejecutorPruebaAccion);

function proponerAccion(db, userId, datos) {
  ensureSchema(db);
  const prueba = getPrueba(db, userId);
  if (!prueba) fail('Todavía no hay prueba iniciada.');
  if (prueba.estado !== 'viva') fail('La semana en vivo todavía no está activa: primero el espejo, después activar la semana.');
  const d = datos || {};
  if (String(d.tipo) === 'llamada-vivo' || String(d.tipo) === 'llamada_en_vivo') fail(GATE_VOZ);
  if (!TIPOS_ACCION.includes(String(d.tipo))) fail(`La acción de la prueba va en: ${TIPOS_ACCION.join(', ')}. Las llamadas en vivo no son una acción: ${GATE_VOZ}`);
  const titulo = norm(d.titulo);
  if (!titulo) fail('La acción de la prueba lleva un título.');
  const sensible = d.sensible === true || d.sensible === 1;
  const fecha = esFechaISO(d.fecha) ? String(d.fecha) : hoyISO();
  const detalle = (d.detalle && typeof d.detalle === 'object') ? d.detalle : {};
  const info = db.prepare(`INSERT INTO gesty_prueba_acciones
    (user_id, fecha, tipo, titulo, detalle, sensible, estado, origen)
    VALUES (?,?,?,?,?,?, 'pendiente_ok', 'semana')`)
    .run(userId, fecha, d.tipo, titulo, JSON.stringify(detalle), sensible ? 1 : 0);
  let accion = getAccion(db, userId, Number(info.lastInsertRowid));
  if (requiereOk(prueba, sensible)) {
    const card = gesty.createCard(db, userId, {
      tipo: 'prueba-accion',
      titulo: `Prueba: ${titulo}`,
      detalle: { accion_id: accion.id, tipo_accion: accion.tipo, sensible },
      creado_por: 'gesty',
    });
    db.prepare(`UPDATE gesty_prueba_acciones SET tarjeta_id = ? WHERE id = ?`).run(card.id, accion.id);
    accion = getAccion(db, userId, accion.id);
    return { ...accion, requiere_ok: true, tarjeta_id: card.id };
  }
  // Modo 'sensible' + acción rutinaria: corre sola, sin tarjeta.
  // Si la ejecución falla, la acción queda 'fallida' (nunca 'ejecutada'
  // inventada) y el error sube al dueño.
  try {
    const res = ejecutarAccion(db, userId, accion);
    accion = sincronizarLedger(db, userId, accion, res);
    return { ...accion, requiere_ok: false };
  } catch (e) {
    db.prepare(`UPDATE gesty_prueba_acciones SET estado = 'fallida', resultado = ? WHERE id = ?`)
      .run(String(e.message || e).slice(0, 240), accion.id);
    throw e;
  }
}

function aprobarAccion(db, userId, id) {
  ensureSchema(db);
  const accion = getAccion(db, userId, id);
  if (!accion) fail('Esa acción de la prueba no es de esta cuenta.');
  if (accion.estado === 'ejecutada' || accion.estado === 'lista_para_enviar') {
    return { ...accion, ya_ejecutada: true };
  }
  if (accion.estado !== 'pendiente_ok') fail('La acción ya no está esperando tu OK.');
  if (!accion.tarjeta_id) fail('La acción no tiene tarjeta en Bandeja: no se puede aprobar por este camino.');
  const card = gesty.getCard(db, userId, accion.tarjeta_id);
  if (!card) fail('La tarjeta de la acción ya no existe.');
  const res = gesty.approveCard(db, userId, accion.tarjeta_id, { version_documento: card.version_documento, usuario: 'dueno' });
  if (!res.ok) fail(res.error || res.motivo || 'La aprobación no salió.');
  return { ...getAccion(db, userId, accion.id), aprobada_por_bandeja: true };
}

function rechazarAccion(db, userId, id, opts) {
  ensureSchema(db);
  const accion = getAccion(db, userId, id);
  if (!accion) fail('Esa acción de la prueba no es de esta cuenta.');
  if (accion.estado !== 'pendiente_ok') return { ...accion, ya_resuelta: true };
  let cardError = '';
  if (accion.tarjeta_id) {
    try { gesty.stopCard(db, userId, accion.tarjeta_id, { usuario: 'dueno', motivo: (opts && opts.motivo) || '' }); }
    catch (e) { cardError = String(e.message || e).slice(0, 240); }
  }
  db.prepare(`UPDATE gesty_prueba_acciones SET estado = 'rechazada' WHERE id = ?`).run(accion.id);
  return { ...getAccion(db, userId, accion.id), tarjeta_frenada: !cardError, card_error: cardError };
}

function listAcciones(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare(`SELECT * FROM gesty_prueba_acciones WHERE user_id = ? ORDER BY fecha ASC, id ASC`).all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  if (o.tipo) rows = rows.filter((r) => r.tipo === String(o.tipo));
  return rows.map(parseAccion);
}

function graduarAprobacion(db, userId) {
  ensureSchema(db);
  const prueba = getPrueba(db, userId);
  if (!prueba) fail('Todavía no hay prueba iniciada.');
  if (prueba.estado !== 'viva') fail('La graduación es de la semana en vivo.');
  if (prueba.modo_aprobacion === 'sensible') return { ...getPrueba(db, userId), ya_graduada: true };
  db.prepare(`UPDATE gesty_prueba SET modo_aprobacion = 'sensible', updated_at = datetime('now') WHERE user_id = ?`).run(userId);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'prueba', entidad_id: String(userId),
    tipo_evento: 'prueba-graduada',
    resumen: 'El dueño graduó la prueba: lo rutinario corre solo, solo lo sensible espera su OK.',
    payload: { modo: 'sensible' },
  });
  return { ...getPrueba(db, userId), ya_graduada: false };
}

// ---------------------------------------------------------------------------
// 4. Una frase por día (misma fuente que La oficina: gestyHoy)
// ---------------------------------------------------------------------------
function fraseDiaria(db, userId, opts) {
  return vistas.gestyHoy(db, userId, opts || {});
}

// ---------------------------------------------------------------------------
// 5. Cierre de la semana: números reales → momento de paywall (prueba)
// ---------------------------------------------------------------------------
function numerosSemana(db, userId, opts) {
  ensureSchema(db);
  const prueba = getPrueba(db, userId);
  if (!prueba) fail('Todavía no hay prueba iniciada.');
  if (prueba.estado !== 'viva' && prueba.estado !== 'cerrada') {
    fail('Los números de la semana viven en la semana en vivo.');
  }
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const desde = prueba.fecha_inicio || hoy;
  const hasta = prueba.fecha_fin_semana || hoy;
  const finEfectivo = hasta < hoy ? hasta : hoy;
  const acciones = listAcciones(db, userId, {}).filter((a) => a.fecha >= desde && a.fecha <= finEfectivo);
  const cuenta = (tipo, estados) => acciones.filter((a) => a.tipo === tipo && estados.includes(a.estado)).length;
  const turnos_agendados = cuenta('turno', ['ejecutada']);
  const papeles_archivados = cuenta('papel', ['ejecutada']);
  const llamados_devueltos = cuenta('llamado', ['ejecutada']);
  const respuestas_preparadas = cuenta('mensaje', ['lista_para_enviar']);
  const pendientes_ok = cuenta('mensaje', ['pendiente_ok']) + cuenta('turno', ['pendiente_ok'])
    + cuenta('papel', ['pendiente_ok']) + cuenta('llamado', ['pendiente_ok']);
  const perdidos_recuperados = turnos_agendados + llamados_devueltos + respuestas_preparadas;
  return {
    desde, hasta, semana_completa: hoy >= hasta,
    turnos_agendados, papeles_archivados, llamados_devueltos,
    respuestas_preparadas,
    respuestas_nota: 'Las respuestas de mensajes quedan aprobadas y listas para enviar: el envío por WhatsApp llega con G-12 y nunca se declara enviado antes.',
    pendientes_ok, perdidos_recuperados,
    perdidos_ayer: prueba.espejo ? (prueba.espejo.total_perdidos || 0) : null,
    horas_devueltas: null,
    horas_nota: 'Sin modelo del dueño guardado del que derivarlas: las horas se calculan con tus números en el chequeo, nunca se inventan acá.',
  };
}

function cierreSemana(db, userId, opts) {
  ensureSchema(db);
  const prueba = getPrueba(db, userId);
  if (!prueba) fail('Todavía no hay prueba iniciada.');
  if (prueba.estado === 'cerrada' && prueba.cierre) return { ...prueba.cierre, ya_cerrada: true };
  if (prueba.estado !== 'viva') fail('El cierre es de la semana en vivo.');
  const numeros = numerosSemana(db, userId, opts);
  const paywall = {
    plan: 'Gesty único', precio_usd: PRECIO_USD, moneda: 'USD',
    modo: 'prueba', checkout: 'test', cobra_real: false,
    deep_link: PLAN_DEEP_LINK,
    nota: 'Momento de paywall de la prueba: solo checkout de prueba. Ningún cobro real se crea desde la prueba.',
    numeros,
  };
  db.prepare(`UPDATE gesty_prueba SET estado = 'cerrada', cierre_json = ?, updated_at = datetime('now') WHERE user_id = ?`)
    .run(JSON.stringify(paywall), userId);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'prueba', entidad_id: String(userId),
    tipo_evento: 'prueba-cerrada',
    resumen: `Cierre de la prueba: ${numeros.turnos_agendados} turnos, ${numeros.llamados_devueltos} llamados devueltos, ${numeros.respuestas_preparadas} respuestas preparadas → paywall de prueba USD ${PRECIO_USD}/mes.`,
    payload: { numeros },
  });
  return { ...paywall, ya_cerrada: false };
}

// ---------------------------------------------------------------------------
// 6. Gate de llamadas en vivo (G-13)
// ---------------------------------------------------------------------------
function estadoLlamadas() {
  return {
    en_vivo: false, motivo: GATE_VOZ,
    incluye: ['mensajes', 'turnos', 'papeles'],
    devolucion_registrada: true,
    devolucion_nota: 'Devolver una llamada perdida registrada sí está disponible: es un registro, no una llamada en vivo.',
  };
}

module.exports = {
  PRECIO_USD, PLAN_DEEP_LINK, TIPOS_ACCION, GATE_VOZ, GATE_WHATSAPP,
  ensureSchema, getPrueba, iniciar, espejoAyer, activarSemana,
  requiereOk, proponerAccion, aprobarAccion, rechazarAccion, listAcciones,
  graduarAprobacion, fraseDiaria, numerosSemana, cierreSemana, estadoLlamadas,
  borradorRespuesta, ejecutarAccion, ejecutorPruebaAccion,
};
