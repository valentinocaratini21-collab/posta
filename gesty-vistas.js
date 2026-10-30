// gesty-vistas.js — PASE DE APP · VISTAS de Gesty (recepción primero).
//
// Solo lectura agregada sobre los motores que ya existen (90 mejoras +
// auto-fetch + 5 brechas + 8 de tanda 2). No crea tablas, no duplica
// ningún sistema y no escribe nada: las acciones (llegada, devolver,
// cobro, bloqueos, buscar-ahora) viven en sus módulos y se exponen
// por rutas que las reutilizan.
//
// Reglas que mandan (Producto Increíble):
// · Orden recepción primero: turnos, mensajes, teléfono, papeles, pagos.
// · La home muestra solo lo que necesita el ojo hoy; lo demás vive en
//   su sección, nunca todo a la vista.
// · Cada sección dice si tiene datos reales o si está vacía — sin dato,
//   la vista muestra el estado vacío, nunca un cero inventado ni una
//   frase que finge trabajo.
// · «Gesty hoy» es UNA frase con hechos reales. Si no hay resultado,
//   lo dice. El jardín NO cuenta como prueba de trabajo y nunca se
//   usa acá.
// · Pack: cada sección con capacidad dice si está incluida o no en el
//   plan de la cuenta (no_incluida). Una pantalla oculta no es una
//   barrera, pero una vista tampoco muestra lo que el plan no incluye.
// · Fundamento (H-G16-1): el cableado lado Posty sigue pendiente en
//   otro frente. fundamentoEstado lo marca (flujo_posty: pendiente)
//   y las vistas nunca inventan el dato que falta. Hoy ORIGENES no
//   incluye 'posty': el flujo solo puede marcarse 'ok' cuando el
//   lado Posty escriba fundamento con ese origen.
'use strict';
const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');
const llegadas = require('./gesty-llegadas.js');
const sala = require('./gesty-sala-espera.js');
const variantes = require('./gesty-variantes.js');
const confirmacion = require('./gesty-confirmacion-turnos.js');
const perdidas = require('./gesty-llamadas-perdidas.js');
const sinPagar = require('./gesty-atendidos-sin-pagar.js');
const comprobantes = require('./gesty-comprobantes.js');
const conciliacion = require('./gesty-conciliacion.js');
const planDia = require('./gesty-plan-dia.js');
const conexiones = require('./gesty-conexiones.js');
const propuestas = require('./gesty-propuestas-conexion.js');
const bloqueos = require('./gesty-bloqueos.js');
const fichaTurno = require('./gesty-ficha-turno.js');
const inasistencias = require('./gesty-inasistencias.js');
const cuentaCorriente = require('./gesty-cuenta-corriente.js');
const puntos = require('./gesty-puntos.js');
const altaCliente = require('./gesty-alta-cliente.js');
const fueraHorario = require('./gesty-fuera-horario.js');
const demora = require('./gesty-demora.js');

function esFechaISO(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function hoyDe(opts) {
  const h = opts && opts.hoy;
  return esFechaISO(h) ? String(h) : new Date().toISOString().slice(0, 10);
}
function num(n) { const v = Number(n); return Number.isFinite(v) ? v : 0; }
// Cada lectura va envuelta: si una sección no se puede componer, sale
// con error y el resto de la vista sigue en pie (el plan nunca se rompe
// por una sección, igual que el plan del día).
function leer(fn) {
  try { return { ok: true, data: fn() }; }
  catch (e) { return { ok: false, error: String(e.message || e).slice(0, 240) }; }
}
function tieneCapacidad(db, userId, capacidad) {
  if (!capacidad) return true;
  try { return gesty.hasCapacidad(db, userId, capacidad); } catch (e) { return false; }
}
function esTurnoEv(e) { return e && (e.tipo === 'turno' || e.tipo === 'cita'); }
function resumirTurno(e) {
  const c = e.cliente || {};
  return {
    id: e.id, titulo: e.titulo, tipo: e.tipo, fecha: e.fecha, hora: e.hora || '',
    duracion_min: e.duracion_min || 0, estado: e.estado,
    cliente_nombre: c.nombre || e.cliente_nombre || '',
    cliente_contacto: c.contacto || e.cliente_contacto || '',
  };
}
function resumirComprobante(c) {
  return {
    id: c.id, tipo: c.tipo, numero: c.numero || '', fecha: c.fecha || '',
    vencimiento: c.vencimiento || '', moneda: c.moneda || '',
    monto_total: c.monto_total, emisor: (c.emisor && c.emisor.nombre) || '',
    origen: c.origen || '', estado_lectura: c.estado_lectura || '',
    campos_dudosos: c.campos_dudosos || [],
  };
}

// ---------------------------------------------------------------------------
// Fundamento + gate H-G16-1
// ---------------------------------------------------------------------------
function fundamentoEstado(db, userId) {
  let datos = [];
  try { datos = (gesty.foundationForOwner(db, userId).datos || []); }
  catch (e) {
    return { total: 0, origenes: {}, flujo_posty: 'pendiente',
      motivo: 'No se pudo leer el fundamento.' };
  }
  const origenes = {};
  for (const d of datos) origenes[d.origen] = (origenes[d.origen] || 0) + 1;
  const tienePosty = (origenes.posty || 0) > 0;
  return {
    total: datos.length, origenes,
    flujo_posty: tienePosty ? 'ok' : 'pendiente',
    motivo: tienePosty
      ? 'El fundamento trae datos con origen Posty.'
      : 'H-G16-1 pendiente: el cableado lado Posty todavía no escribe fundamento con origen Posty (hoy ORIGENES no incluye "posty"). Las vistas muestran solo lo que Gesty ya sabe; nunca se inventa el resto.',
  };
}

// ---------------------------------------------------------------------------
// «Gesty hoy»: una frase diaria, solo hechos reales.
// ---------------------------------------------------------------------------
function gestyHoy(db, userId, opts) {
  const hoy = hoyDe(opts);
  const fundamento = fundamentoEstado(db, userId);
  let llegadasN = 0, salaN = 0, perdidasN = 0, sinPagarN = 0, pendientesN = 0, cumplidosN = 0;
  try { llegadasN = llegadas.llegadasDe(db, userId, { fecha: hoy }).length; } catch (e) {}
  try { salaN = sala.salaDe(db, userId, hoy).length; } catch (e) {}
  try { perdidasN = perdidas.pendientes(db, userId, {}).length; } catch (e) {}
  try { sinPagarN = sinPagar.listaDelDia(db, userId, hoy).cantidad; } catch (e) {}
  try { pendientesN = gesty.countPending(db, userId); } catch (e) {}
  try {
    cumplidosN = agenda.listEventos(db, userId, { estado: 'cumplido', limit: 1000 }).eventos
      .filter((e) => e.fecha === hoy && esTurnoEv(e)).length;
  } catch (e) {}
  let gestyContratado = false;
  try { gestyContratado = !!db.prepare("SELECT 1 AS x FROM poderes_contratados WHERE user_id = ? AND poder = 'gesty' AND estado = 'active' LIMIT 1").get(userId); }
  catch (e) {
    try { gestyContratado = !!db.prepare("SELECT 1 AS x FROM poderes_contratados WHERE user_id = ? AND poder = 'gesty' LIMIT 1").get(userId); }
    catch (e2) { gestyContratado = false; }
  }
  const es = [], en = [];
  const pl = (n, s, p) => (n === 1 ? s : p);
  if (llegadasN > 0) {
    es.push(`llegaron ${llegadasN} ${pl(llegadasN, 'cliente', 'clientes')}`);
    en.push(`${llegadasN} ${pl(llegadasN, 'client arrived', 'clients arrived')}`);
  }
  if (cumplidosN > 0) {
    es.push(`se atendieron ${cumplidosN} ${pl(cumplidosN, 'turno', 'turnos')}`);
    en.push(`${cumplidosN} ${pl(cumplidosN, 'appointment served', 'appointments served')}`);
  }
  if (salaN > 0) {
    es.push(`${salaN} esperando en recepción`);
    en.push(`${salaN} waiting at reception`);
  }
  if (perdidasN > 0) {
    es.push(`${perdidasN} ${pl(perdidasN, 'llamado por devolver', 'llamados por devolver')}`);
    en.push(`${perdidasN} ${pl(perdidasN, 'call to return', 'calls to return')}`);
  }
  if (sinPagarN > 0) {
    es.push(`${sinPagarN} ${pl(sinPagarN, 'cobro sin registrar', 'cobros sin registrar')}`);
    en.push(`${sinPagarN} ${pl(sinPagarN, 'payment unrecorded', 'payments unrecorded')}`);
  }
  if (pendientesN > 0) {
    es.push(`${pendientesN} esperando tu OK`);
    en.push(`${pendientesN} waiting for your OK`);
  }
  let frase, frase_en;
  if (!es.length) {
    frase = 'Hoy todavía no hay movimiento en tu recepción.';
    frase_en = 'No reception movement yet today.';
  } else {
    const unir = (xs) => (xs.length === 1 ? xs[0] : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);
    frase = `Gesty hoy: ${unir(es)}.`;
    frase_en = `Gesty today: ${unir(en)}.`;
  }
  return {
    fecha: hoy, frase, frase_en, fundamento, gesty_contratado: gestyContratado,
    hechos: { llegadas: llegadasN, sala: salaN, llamadas_perdidas: perdidasN,
      sin_pagar: sinPagarN, pendientes_ok: pendientesN, turnos_cumplidos: cumplidosN },
    tiene_datos: es.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Recepción de hoy (vista principal de la app, orden recepción primero)
// ---------------------------------------------------------------------------
function vistaRecepcion(db, userId, opts) {
  const hoy = hoyDe(opts);
  const fundamento = fundamentoEstado(db, userId);
  const out = { fecha: hoy, fundamento, secciones: {} };

  // TURNOS (capacidad agenda; sin ella, la sección dice que no está incluida).
  if (!tieneCapacidad(db, userId, 'agenda')) {
    out.secciones.turnos = { no_incluida: true, capacidad: 'agenda' };
  } else {
    const turnos = leer(() => {
      // La agenda del día: lo activo (trabajo por delante) y lo cumplido
      // (trabajo hecho hoy). Lo cancelado no es agenda del día: ya no existe.
      const activos = agenda.listEventos(db, userId, { limit: 1000 }).eventos
        .filter((e) => e.fecha === hoy && esTurnoEv(e) && (e.estado === 'activo' || e.estado === 'cumplido'));
      const pendientesConfirmar = confirmacion.turnosPendientes(db, userId, { hoy });
      const salaHoy = sala.salaDe(db, userId, hoy);
      const llamadosHoy = new Set();
      try { for (const ll of sala.llamadosDe(db, userId, { fecha: hoy })) llamadosHoy.add(ll.evento_id); } catch (e) {}
      const llegadasHoy = llegadas.llegadasDe(db, userId, { fecha: hoy });
      const conLlegada = new Set(llegadasHoy.map((l) => l.evento_id));
      const turnosHoy = activos.map((e) => {
        const r = resumirTurno(e);
        r.llegada = conLlegada.has(e.id);
        r.llamado = llamadosHoy.has(e.id);
        try { const c = confirmacion.getConfirmacion(db, userId, e.id); r.confirmacion = c ? c.estado : null; }
        catch (err) { r.confirmacion = null; }
        try { r.ficha = fichaTurno.fichaParaTurno(db, userId, e.id); }
        catch (err) { r.ficha = null; }
        return r;
      });
      let llamarTexto = variantes.GENERICO;
      let llamarTextoEn = variantes.GENERICO_EN;
      try { llamarTexto = variantes.llamarPara(variantes.getTipo(db, userId)); llamarTextoEn = variantes.llamarPara(variantes.getTipo(db, userId), 'en'); } catch (e) {}
      return {
        turnos_hoy: turnosHoy,
        pendientes_confirmar: pendientesConfirmar.map(resumirTurno),
        sala: salaHoy,
        llamar_texto: llamarTexto,
        llamar_texto_en: llamarTextoEn,
        llegadas: llegadasHoy.map((l) => ({ id: l.id, evento_id: l.evento_id,
          cliente_nombre: l.cliente_nombre, cliente_contacto: l.cliente_contacto,
          hora: l.hora || '', medio: l.medio })),
      };
    });
    out.secciones.turnos = turnos.ok ? { ...turnos.data, tiene_datos: true } : { ok: false, error: turnos.error };
  }

  // TELÉFONO: llamadas perdidas para devolver + cola de la mañana.
  // (Acción base de recepción: sin capacidad que la mapee; no se la
  // cuelga de 'llamadas', que es el canal de voz de G-13.)
  const telefono = leer(() => ({
    perdidas: perdidas.pendientes(db, userId, {}).map((p) => ({ id: p.id,
      contacto: p.contacto || '', nombre: p.nombre || '', fecha: p.fecha || '',
      hora: p.hora || '', motivo: p.motivo || '', veces: p.veces || 1 })),
    cola_manana: fueraHorario.colaManana(db, userId, {}).map((c) => ({ id: c.id,
      contacto: c.contacto || '', nombre: c.nombre || '', fecha: c.fecha || '',
      para_manana: c.para_manana || '', canal: c.canal || '', pedido: c.pedido || '' })),
  }));
  out.secciones.telefono = telefono.ok ? { ...telefono.data, tiene_datos: true } : { ok: false, error: telefono.error };

  // PAPELES (resumen; el detalle vive en vistaPapeles).
  if (!tieneCapacidad(db, userId, 'comprobantes')) {
    out.secciones.papeles = { no_incluida: true, capacidad: 'comprobantes' };
  } else {
    const papeles = leer(() => {
      const total = comprobantes.listComprobantes(db, userId, { limit: 1 }).total;
      const dudosos = comprobantes.listComprobantes(db, userId, { estado: 'necesita-revision', limit: 1 }).total;
      return { total, dudosos };
    });
    out.secciones.papeles = papeles.ok ? { ...papeles.data, tiene_datos: true } : { ok: false, error: papeles.error };
  }

  // PAGOS: atendidos sin pagar del día (control del día, no saldo).
  if (!tieneCapacidad(db, userId, 'cobranzas')) {
    out.secciones.pagos = { no_incluida: true, capacidad: 'cobranzas' };
  } else {
    const pagos = leer(() => {
      const lista = sinPagar.listaDelDia(db, userId, hoy);
      return { sin_pagar: lista.pendientes.map((p) => ({ evento: resumirTurno(p.evento) })), cantidad: lista.cantidad };
    });
    out.secciones.pagos = pagos.ok ? { ...pagos.data, tiene_datos: true } : { ok: false, error: pagos.error };
  }

  // AVISOS: lo que se paga hoy, lo que vence mañana, contratos por vencer.
  // (Lectura del plan del día: si no se compone, la sección sale con error.)
  const avisos = leer(() => {
    const plan = planDia.planDelDia(db, userId, { hoy });
    let demorasHoy = [];
    try {
      demorasHoy = demora.listDemoras(db, userId, { fecha: hoy, estado: 'activa' })
        .map((d) => ({ id: d.id, minutos: d.minutos, motivo: d.motivo || '', profesional: d.profesional || '' }));
    } catch (e) {}
    return {
      demoras: demorasHoy,
      pagar_hoy: (plan.pagar_hoy || []).map((o) => ({ id: o.id, tipo: o.tipo, proveedor: o.proveedor || '', monto_total: o.monto_total, moneda: o.moneda || '', estado: o.estado })),
      vence_manana: {
        fiscal: (plan.vence_manana.fiscal || []).length,
        facturas: (plan.vence_manana.facturas || []).length,
        ordenes: (plan.vence_manana.ordenes || []).length,
        compromisos: (plan.vence_manana.compromisos || []).length,
      },
      contratos_por_vencer: (plan.contratos_por_vencer || []).slice(0, 20),
      necesita_ok: plan.necesita_ok ? plan.necesita_ok.cantidad : 0,
    };
  });
  out.secciones.avisos = avisos.ok ? { ...avisos.data, tiene_datos: true } : { ok: false, error: avisos.error };

  // BANDEJA: solo el conteo (las tarjetas viven en la vista Bandeja).
  const bandeja = leer(() => ({ pendientes: gesty.countPending(db, userId) }));
  out.secciones.bandeja = bandeja.ok ? { ...bandeja.data, tiene_datos: true } : { ok: false, error: bandeja.error };

  return out;
}

// ---------------------------------------------------------------------------
// Papeles (segunda pantalla que manda)
// ---------------------------------------------------------------------------
function vistaPapeles(db, userId, opts) {
  const o = opts || {};
  if (!tieneCapacidad(db, userId, 'comprobantes')) return { no_incluida: true, capacidad: 'comprobantes' };
  const limit = Math.min(Math.max(Number(o.limit) || 20, 1), 100);
  const recientes = comprobantes.listComprobantes(db, userId, { limit });
  const dudosos = comprobantes.listComprobantes(db, userId, { estado: 'necesita-revision', limit });
  let extractos = [];
  try { extractos = conciliacion.listExtractos(db, userId).slice(0, 20); } catch (e) { extractos = []; }
  return {
    recientes: recientes.comprobantes.map(resumirComprobante), total: recientes.total,
    dudosos: dudosos.comprobantes.map(resumirComprobante), dudosos_total: dudosos.total,
    extractos,
  };
}

// ---------------------------------------------------------------------------
// Clientes + ficha (vive en Mi negocio; la ficha por turno vive en turnos)
// ---------------------------------------------------------------------------
function vistaClientes(db, userId, opts) {
  const o = opts || {};
  const q = String(o.q || '').trim().toLowerCase();
  const porContacto = new Map();
  const agregar = (nombre, contacto, origen) => {
    const clave = (contacto || '').trim().toLowerCase() || `nombre:${(nombre || '').trim().toLowerCase()}`;
    if (!clave || clave === 'nombre:') return;
    const prev = porContacto.get(clave) || { nombre: nombre || '', contacto: contacto || '', origenes: [] };
    if (nombre && !prev.nombre) prev.nombre = nombre;
    if (contacto && !prev.contacto) prev.contacto = contacto;
    if (!prev.origenes.includes(origen)) prev.origenes.push(origen);
    porContacto.set(clave, prev);
  };
  try {
    for (const f of altaCliente.listFichas(db, userId, {})) agregar(f.nombre, f.contacto, 'ficha');
  } catch (e) {}
  try {
    const { eventos } = agenda.listEventos(db, userId, { limit: 1000 });
    for (const e of eventos) {
      if (!esTurnoEv(e)) continue;
      const c = e.cliente || {};
      agregar(c.nombre || e.cliente_nombre, c.contacto || e.cliente_contacto, 'agenda');
    }
  } catch (e) {}
  let clientes = [...porContacto.values()];
  if (q) clientes = clientes.filter((c) => (c.nombre || '').toLowerCase().includes(q) || (c.contacto || '').toLowerCase().includes(q));
  return { clientes: clientes.slice(0, 100), total: clientes.length };
}

function fichaCliente(db, userId, opts) {
  const o = opts || {};
  const contacto = String(o.contacto || '').trim();
  const nombre = String(o.nombre || '').trim();
  if (!contacto && !nombre) throw new Error('Para ver la ficha hace falta el contacto o el nombre del cliente.');
  let notas = [];
  try { notas = fichaTurno.notasDe(db, userId, { cliente_contacto: contacto, cliente_nombre: nombre }); } catch (e) {}
  let debe = null, debe_estado = 'sin-datos';
  try {
    const cuenta = cuentaCorriente.cuentaCliente(db, userId, { contacto, nombre });
    if (cuenta && !cuenta.ambiguo && !cuenta.noEncontrado) { debe = cuenta.saldo; debe_estado = 'con-datos'; }
  } catch (e) {}
  let faltas = [];
  try { faltas = inasistencias.faltasDeCliente(db, userId, { contacto, nombre }).filter((f) => f.estado === 'falta'); } catch (e) {}
  let puntosSaldo = null;
  try { if (nombre) puntosSaldo = puntos.saldoDe(db, userId, nombre); } catch (e) {}
  let ultima_visita = null, turnos_proximos = [];
  try {
    const { eventos } = agenda.listEventos(db, userId, { limit: 1000 });
    const mios = eventos.filter((e) => esTurnoEv(e) && (((contacto) && ((e.cliente && e.cliente.contacto === contacto) || e.cliente_contacto === contacto)) || (!contacto && ((e.cliente && e.cliente.nombre === nombre) || e.cliente_nombre === nombre))));
    const cumplidos = mios.filter((e) => e.estado === 'cumplido').sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id);
    const activos = mios.filter((e) => e.estado === 'activo').sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.id - b.id);
    if (cumplidos[0]) ultima_visita = { evento_id: cumplidos[0].id, fecha: cumplidos[0].fecha, hora: cumplidos[0].hora || '', titulo: cumplidos[0].titulo };
    turnos_proximos = activos.slice(0, 10).map(resumirTurno);
  } catch (e) {}
  return {
    cliente: { nombre, contacto }, notas, debe, debe_estado,
    puntos: puntosSaldo, faltas: faltas.length,
    faltas_detalle: faltas.slice(0, 20).map((f) => ({ id: f.id, fecha: f.fecha, evento_id: f.evento_id })),
    ultima_visita, turnos_proximos,
  };
}

// ---------------------------------------------------------------------------
// Conexiones (vive en Ajustes → Conexiones; nunca propone banco en vivo
// justo a tiempo: decisión recepción 29/10 — el banco queda en Ajustes
// como opción manual y por extractos como papel, no como propuesta).
// ---------------------------------------------------------------------------
function vistaConexiones(db, userId) {
  let lista = [];
  try { lista = conexiones.listConexiones(db, userId).map((c) => ({ id: c.id, plataforma: c.plataforma, proveedor: c.proveedor || '', modo: c.modo || '', estado: c.estado, detalle: c.detalle || '' })); } catch (e) {}
  let propuestasPendientes = [];
  try { propuestasPendientes = propuestas.listPropuestas(db, userId).filter((p) => !p.respuesta).map((p) => ({ id: p.id, plataforma: p.plataforma, texto: p.texto, momento: p.momento })); } catch (e) {}
  // Desbloqueos just-in-time (espejo, nunca requisito): el módulo ya no
  // emite banco desde la decisión de recepción; acá se filtra por si
  // acaso una línea vieja lo trae.
  let desbloqueos = { es_requisito: false, lineas: [] };
  try {
    const d = propuestas.mostrarDesbloqueos(db, userId);
    desbloqueos = { es_requisito: false, lineas: (d.lineas || []).filter((l) => l.plataforma !== 'banco') };
  } catch (e) {}
  return { conexiones: lista, propuestas_pendientes: propuestasPendientes, desbloqueos };
}

// ---------------------------------------------------------------------------
// Agenda y bloqueos (viven en Ajustes → Agenda)
// ---------------------------------------------------------------------------
function vistaBloqueos(db, userId, opts) {
  const hoy = hoyDe(opts);
  const activos = bloqueos.listBloqueos(db, userId, { estado: 'activo' });
  const deHoy = bloqueos.bloqueosDeFecha(db, userId, hoy);
  return { fecha: hoy, activos, de_hoy: deHoy };
}

// ---------------------------------------------------------------------------
// Prueba en espejo: un toque por superficie. Corre el camino de lectura
// real y dice si hay datos reales o si la vista está lista y vacía.
// Nunca inventa datos para que el test dé verde.
// ---------------------------------------------------------------------------
const SUPERFICIES = ['turnos', 'telefono', 'papeles', 'pagos', 'conexiones', 'agenda', 'clientes', 'bandeja'];
function probarSuperficie(db, userId, superficie, opts) {
  const hoy = hoyDe(opts);
  const s = String(superficie || '');
  if (!SUPERFICIES.includes(s)) throw new Error(`Superficie desconocida: ${s || '(vacía)'}. Válidas: ${SUPERFICIES.join(', ')}.`);
  const r = (tiene_datos, mensaje, mensaje_en) => ({ superficie: s, ok: true, tiene_datos, mensaje, mensaje_en });
  if (s === 'turnos') {
    const v = vistaRecepcion(db, userId, { hoy });
    const t = v.secciones.turnos || {};
    const n = (t.turnos_hoy || []).length + (t.sala || []).length;
    return r(n > 0, n > 0 ? `Turnos reales: ${(t.turnos_hoy || []).length} hoy, ${(t.sala || []).length} en sala.` : 'Sin turnos hoy: la vista está lista y muestra el día vacío.',
      n > 0 ? `Real appointments: ${(t.turnos_hoy || []).length} today, ${(t.sala || []).length} in the waiting room.` : 'No appointments today: the view is ready and shows the empty day.');
  }
  if (s === 'telefono') {
    const v = vistaRecepcion(db, userId, { hoy });
    const t = v.secciones.telefono || {};
    const n = (t.perdidas || []).length + (t.cola_manana || []).length;
    return r(n > 0, n > 0 ? `Teléfono real: ${(t.perdidas || []).length} por devolver, ${(t.cola_manana || []).length} en la cola de la mañana.` : 'Sin llamadas pendientes: la vista está lista y vacía.',
      n > 0 ? `Real phone: ${(t.perdidas || []).length} to return, ${(t.cola_manana || []).length} in the morning queue.` : 'No pending calls: the view is ready and empty.');
  }
  if (s === 'papeles') {
    const v = vistaPapeles(db, userId, {});
    return r(v.total > 0, v.total > 0 ? `${v.total} papeles reales, ${v.dudosos_total} pidiendo un dato.` : 'Sin papeles todavía: la vista está lista y vacía.',
      v.total > 0 ? `${v.total} real papers, ${v.dudosos_total} needing one detail.` : 'No papers yet: the view is ready and empty.');
  }
  if (s === 'pagos') {
    const v = vistaRecepcion(db, userId, { hoy });
    const p = v.secciones.pagos || {};
    return r((p.cantidad || 0) > 0, (p.cantidad || 0) > 0 ? `${p.cantidad} atendidos sin pagar hoy.` : 'Nadie atendido sin pagar hoy: la vista está lista y vacía.',
      (p.cantidad || 0) > 0 ? `${p.cantidad} served and unpaid today.` : 'Nobody served and unpaid today: the view is ready and empty.');
  }
  if (s === 'conexiones') {
    const v = vistaConexiones(db, userId);
    const n = v.conexiones.length;
    return r(n > 0, n > 0 ? `${n} ${n === 1 ? 'conexión' : 'conexiones'} reales.` : 'Sin conexiones todavía: la vista está lista y vacía.',
      n > 0 ? `${n} real ${n === 1 ? 'connection' : 'connections'}.` : 'No connections yet: the view is ready and empty.');
  }
  if (s === 'agenda') {
    const v = vistaBloqueos(db, userId, { hoy });
    return r(v.activos.length > 0, v.activos.length > 0 ? `${v.activos.length} ${v.activos.length === 1 ? 'bloqueo activo' : 'bloqueos activos'}.` : 'Sin bloqueos: la agenda está lista y sin bloqueos.',
      v.activos.length > 0 ? `${v.activos.length} active ${v.activos.length === 1 ? 'block' : 'blocks'}.` : 'No blocks: the schedule is ready with no blocks.');
  }
  if (s === 'clientes') {
    const v = vistaClientes(db, userId, {});
    return r(v.total > 0, v.total > 0 ? `${v.total} ${v.total === 1 ? 'cliente' : 'clientes'} reales.` : 'Sin clientes todavía: la vista está lista y vacía.',
      v.total > 0 ? `${v.total} real ${v.total === 1 ? 'client' : 'clients'}.` : 'No clients yet: the view is ready and empty.');
  }
  const pendientes = gesty.countPending(db, userId);
  return r(pendientes > 0, pendientes > 0 ? `${pendientes} esperando tu OK.` : 'Nada esperando tu OK: la Bandeja está lista y vacía.',
    pendientes > 0 ? `${pendientes} waiting for your OK.` : 'Nothing waiting for your OK: the Tray is ready and empty.');
}

module.exports = {
  SUPERFICIES,
  fundamentoEstado, gestyHoy, vistaRecepcion, vistaPapeles,
  vistaClientes, fichaCliente, vistaConexiones, vistaBloqueos,
  probarSuperficie,
};
