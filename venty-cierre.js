// venty-cierre.js — VENTY SLICE 3 (V-09 + V-10): cierre real genérico.
// Maquinaria de cierre para CUALQUIER negocio del fundamento, no atada a
// ningún piloto:
//   · Cierre con el link de pago DEL NEGOCIO (sale del fundamento; Venty
//     nunca cobra por su cuenta ni guarda secretos: solo credencial_ref).
//     Todo opera en modo 'prueba': ningún cobro real sale de acá.
//   · Registro + conciliación del pago contra lo cotizado (monto y
//     titular). Si cuadra, la partida pasa a cerrada_ganada sin
//     intervención; si no cuadra, NO cierra y escala a Bandeja con el
//     motivo exacto (y se puede volver a registrar el pago corregido).
//   · Aviso al dueño en el momento para pagos >= umbral del fundamento
//     (jugada 'aviso_pago' en Bandeja + evento, apenas concilia).
//   · Reseña de Google SOLO dentro de la conversación de cierre: solo
//     tras cerrada_ganada, una sola vez, con su registro. Fuera de ahí,
//     este módulo no pide reseñas nunca.
//   · Escalación (V-10): ticket alto e inmuebles NO cierran la venta —
//     califican, agendan visita (si hay fecha) y escalan a Bandeja con
//     contexto completo. La escalación general (fuera de límites, queja,
//     plata sensible, lo que el fundamento no cubre) va a Bandeja con
//     resumen + jugada recomendada y la partida sigue registrada.
// Voz de Venty: minúsculas, sin signos de apertura (validada con venty.validarVoz).
'use strict';

const venty = require('./venty');
const agenda = require('./venty-agenda');
let _conexiones = null;
function conexiones() { if (!_conexiones) _conexiones = require('./venty-conexiones'); return _conexiones; }

const MODO_PAGO = 'prueba';
const CAMPOS_PROHIBIDOS = ['secreto', 'token', 'clave', 'password', 'passwd', 'api_key', 'apikey', 'access_token', 'refresh_token', 'client_secret', 'tarjeta', 'cvv', 'cbu', 'alias_bancario'];
const TIPOS_ESCALACION = ['ticket_alto', 'inmuebles', 'fuera_de_limites', 'queja', 'plata_sensible', 'pago_no_cuadra', 'otro'];

function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function normTexto(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
function entero(v) { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : null; }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_cierre_pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    partida_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'total',
    proveedor TEXT NOT NULL DEFAULT '',
    link_pago TEXT NOT NULL DEFAULT '',
    credencial_ref TEXT NOT NULL DEFAULT '',
    modo TEXT NOT NULL DEFAULT 'prueba',
    monto_esperado INTEGER NOT NULL DEFAULT 0,
    monto_recibido INTEGER,
    titular_esperado TEXT NOT NULL DEFAULT '',
    titular_recibido TEXT NOT NULL DEFAULT '',
    referencia TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'esperando',
    motivo_no_cuadra TEXT NOT NULL DEFAULT '',
    aviso_dueno INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    actualizado_at TEXT NOT NULL,
    conciliado_at TEXT NOT NULL DEFAULT ''
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_pagos_part ON venty_cierre_pagos(user_id, partida_id, estado)');
  db.exec(`CREATE TABLE IF NOT EXISTS venty_cierre_resenas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    partida_id INTEGER NOT NULL UNIQUE,
    canal TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    contexto TEXT NOT NULL DEFAULT 'conversacion_de_cierre',
    pedida_at TEXT NOT NULL
  )`);
}

// ---- config de cierre desde el fundamento (una sola fuente) -----------
// Vive en politicas_json.cierre (se fija con fijarConfigCierre); se leen
// también las formas ya existentes del fundamento: politicas.grupo_sena_*,
// politicas.cancelacion_sin_cargo_horas, limites.umbral_escalacion.
// Nada se inventa: sin link_pago cargado, el cierre no arranca.
function configCierre(db, userId) {
  const f = venty.leerFundamento(db, userId);
  const pol = (f && f.politicas) || {};
  const lim = (f && f.limites) || {};
  const c = pol.cierre || pol.pago || {};
  const num = (v) => { const n = entero(v); return n === null ? null : n; };
  return {
    link_pago: String(c.link_pago || pol.link_pago || ''),
    proveedor: String(c.proveedor || ''),
    credencial_ref: String(c.credencial_ref || ''),
    titular_esperado: String(c.titular_esperado || ''),
    sena_pct: num(c.sena_pct !== undefined ? c.sena_pct : pol.grupo_sena_pct),
    umbral_aviso_dueno: num(c.umbral_aviso_dueno !== undefined ? c.umbral_aviso_dueno : (lim.umbral_aviso_pago !== undefined ? lim.umbral_aviso_pago : pol.umbral_aviso_dueno)),
    ticket_alto_desde: num(c.ticket_alto_desde !== undefined ? c.ticket_alto_desde : lim.umbral_escalacion),
    escala_rubros: Array.isArray(c.escala_rubros) ? c.escala_rubros.map((r) => normTexto(r)).filter(Boolean)
      : (Array.isArray(lim.escala_rubros) ? lim.escala_rubros.map((r) => normTexto(r)).filter(Boolean) : []),
    resena_google_url: String(c.resena_google_url || pol.resena_google_url || ''),
    modo: MODO_PAGO,
    fundamento: f,
  };
}

// Fijar la config de cierre en el fundamento (politicas.cierre). Solo refs
// y datos públicos del negocio: un campo que huele a secreto, o una
// credencial_ref que parece un secreto en claro, se rechaza fail-closed.
function fijarConfigCierre(db, userId, config) {
  const c = config || {};
  for (const k of Object.keys(c)) {
    if (CAMPOS_PROHIBIDOS.includes(k.toLowerCase())) return { ok: false, error: 'campo_no_permitido', campo: k };
  }
  const credRef = String(c.credencial_ref || '').trim().slice(0, 120);
  if (credRef) {
    let parece = false;
    try { parece = conexiones().pareceSecretoEnClaro(credRef); } catch (e) { parece = false; }
    if (parece) return { ok: false, error: 'credencial_ref_parece_secreto' };
  }
  const link = String(c.link_pago || '').trim().slice(0, 500);
  if (link && !/^https:\/\//i.test(link)) return { ok: false, error: 'link_pago_invalido' };
  const resenaUrl = String(c.resena_google_url || '').trim().slice(0, 500);
  if (resenaUrl && !/^https:\/\//i.test(resenaUrl)) return { ok: false, error: 'resena_url_invalida' };
  const f = venty.leerFundamento(db, userId);
  if (!f) return { ok: false, error: 'sin_fundamento' };
  const pol = { ...(f.politicas || {}) };
  const anterior = (pol.cierre && typeof pol.cierre === 'object') ? pol.cierre : {};
  const nuevo = { ...anterior };
  const poner = (k, v) => { if (v !== undefined) nuevo[k] = v; };
  poner('link_pago', link || undefined);
  if (c.link_pago !== undefined) nuevo.link_pago = link;
  poner('proveedor', c.proveedor !== undefined ? String(c.proveedor || '').slice(0, 60) : undefined);
  poner('credencial_ref', c.credencial_ref !== undefined ? credRef : undefined);
  poner('titular_esperado', c.titular_esperado !== undefined ? String(c.titular_esperado || '').slice(0, 120) : undefined);
  poner('sena_pct', c.sena_pct !== undefined ? entero(c.sena_pct) : undefined);
  poner('umbral_aviso_dueno', c.umbral_aviso_dueno !== undefined ? entero(c.umbral_aviso_dueno) : undefined);
  poner('ticket_alto_desde', c.ticket_alto_desde !== undefined ? entero(c.ticket_alto_desde) : undefined);
  poner('escala_rubros', Array.isArray(c.escala_rubros) ? c.escala_rubros.map((r) => String(r).slice(0, 60)) : undefined);
  poner('resena_google_url', c.resena_google_url !== undefined ? resenaUrl : undefined);
  poner('agenda_sistema', c.agenda_sistema !== undefined ? String(c.agenda_sistema || '').slice(0, 80) : undefined);
  pol.cierre = nuevo;
  db.prepare('UPDATE venty_fundamento SET politicas_json = ?, updated_at = ? WHERE user_id = ?')
    .run(JSON.stringify(pol), ahoraIso(), userId);
  venty.registrarEvento(db, userId, 'cierre_config', null, { proveedor: nuevo.proveedor || '', tiene_link: !!nuevo.link_pago });
  return { ok: true, cierre: configCierre(db, userId) };
}

function obtenerPartida(db, userId, partidaId) {
  return db.prepare('SELECT * FROM venty_partidas WHERE id = ? AND user_id = ?').get(partidaId, userId) || null;
}

// Esta partida no debe cerrar sola: ticket alto (monto >= umbral del
// fundamento) o rubro que escala siempre (inmuebles y los que declare el
// fundamento en escala_rubros, comparados contra modo/rubro de la partida
// y del fundamento).
function motivoEscalaPrevia(db, userId, partida, monto) {
  const cfg = configCierre(db, userId);
  const rubros = [partida.modo_rubro, cfg.fundamento && cfg.fundamento.modo, cfg.fundamento && cfg.fundamento.rubro]
    .map(normTexto).filter(Boolean);
  for (const r of cfg.escala_rubros) {
    if (rubros.some((x) => x === r || x.includes(r) || r.includes(x))) {
      return { tipo: r === 'inmuebles' || r.includes('inmueble') ? 'inmuebles' : 'ticket_alto', rubro: r };
    }
  }
  if (cfg.ticket_alto_desde !== null && monto !== null && monto >= cfg.ticket_alto_desde) {
    return { tipo: 'ticket_alto', umbral: cfg.ticket_alto_desde, monto };
  }
  return null;
}

// ---- Bandeja: una sola puerta para avisos y escalaciones ---------------
function crearJugada(db, userId, partidaId, tipo, propuesta, porque) {
  const ya = db.prepare(`SELECT id FROM venty_jugadas WHERE user_id = ? AND partida_id IS ? AND tipo = ? AND estado = 'pendiente'`)
    .get(userId, partidaId || null, tipo);
  if (ya && (tipo === 'dato_faltante' || tipo === 'aviso_pago')) return ya.id;
  const r = db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
    .run(userId, partidaId || null, tipo, JSON.stringify(propuesta || {}), String(porque || '').slice(0, 500));
  return Number(r.lastInsertRowid);
}

function contextoPartida(db, userId, partida) {
  const mensajes = db.prepare('SELECT autor, texto, enviado_at FROM venty_mensajes WHERE partida_id = ? ORDER BY enviado_at DESC, id DESC LIMIT 5').all(partida.id)
    .reverse().map((m) => ({ autor: m.autor, texto: String(m.texto || '').slice(0, 200), at: m.enviado_at }));
  const cots = db.prepare(`SELECT datos_json, created_at FROM venty_eventos WHERE user_id = ? AND partida_id = ? AND tipo = 'cotizacion' ORDER BY id DESC LIMIT 1`).all(userId, partida.id);
  let cotizacion = null;
  if (cots.length) { try { cotizacion = JSON.parse(cots[0].datos_json || '{}'); } catch (e) {} }
  return {
    cliente: partida.cliente_nombre, canal: partida.canal, estado: partida.estado,
    monto: Number(partida.monto) || 0, origen: partida.origen || '', cotizacion,
    ultimos_mensajes: mensajes,
  };
}

// ---- V-10: escalación general ------------------------------------------
// La partida queda 'escalada' y la jugada lleva resumen + jugada
// recomendada + contexto completo. Escalar una partida no frena las demás.
// opts: { tipo, resumen, jugada_recomendada, fecha_visita, avisar_cliente }
function escalarPartida(db, userId, partidaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const partida = obtenerPartida(db, userId, partidaId);
  if (!partida) return { ok: false, kind: 'partida_no_encontrada' };
  const tipo = TIPOS_ESCALACION.includes(String(o.tipo || '')) ? String(o.tipo) : 'otro';
  const ahora = o.ahora || ahoraIso();
  const resumen = String(o.resumen || '').slice(0, 500) ||
    (tipo === 'ticket_alto' ? 'ticket alto: la venta no se cierra sola, la define el dueño'
      : tipo === 'inmuebles' ? 'inmuebles: se califica y se agenda visita, la venta la cierra el dueño'
      : 'la partida necesita el ojo del dueño');
  const recomendada = String(o.jugada_recomendada || '').slice(0, 500) ||
    (tipo === 'ticket_alto' || tipo === 'inmuebles' ? 'revisar la cotización y confirmar la visita con el cliente'
      : 'revisar el contexto y decidir la jugada');
  const propuesta = { tipo, resumen, jugada_recomendada: recomendada, contexto: contextoPartida(db, userId, partida) };
  const jugadaId = crearJugada(db, userId, partidaId, 'escalacion', propuesta,
    `escalación ${tipo.replace(/_/g, ' ')}: ${resumen}`.slice(0, 500));
  db.prepare(`UPDATE venty_partidas SET estado = 'escalada', updated_at = ? WHERE id = ?`).run(ahora, partidaId);
  venty.registrarEvento(db, userId, 'escalacion', partidaId, { tipo, jugada_id: jugadaId, resumen });
  let visita = null;
  if ((tipo === 'ticket_alto' || tipo === 'inmuebles') && o.fecha_visita) {
    const v = agenda.crearTurno(db, userId, partidaId, { inicio_at: o.fecha_visita, tipo: 'visita', ahora, avisar: false });
    if (v.ok) visita = v.turno;
  }
  let mensajes = [];
  if (o.avisar_cliente !== false && partida.estado === 'viva') {
    mensajes = agenda.insertarMensajesVenty(db, partida,
      ['eso lo confirmo con el dueño enseguida, te aviso en cuanto me responda'], ahora);
  }
  return { ok: true, jugada_id: jugadaId, tipo, visita, mensajes, estado: 'escalada' };
}

// ---- V-09: iniciar el cierre con el link del negocio --------------------
// opts: { tipo: 'total'|'sena', monto (default: cotizado de la partida),
//         fecha_visita (para ticket alto/inmuebles), ahora }
function iniciarCierre(db, userId, partidaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const partida = obtenerPartida(db, userId, partidaId);
  if (!partida) return { ok: false, kind: 'partida_no_encontrada' };
  const ahora = o.ahora || ahoraIso();
  if (partida.estado === 'esperando_pago') {
    const pago = db.prepare(`SELECT * FROM venty_cierre_pagos WHERE user_id = ? AND partida_id = ? AND estado IN ('esperando','no_cuadra') ORDER BY id DESC LIMIT 1`).get(userId, partidaId);
    if (pago) return { ok: true, ya: true, pago, link_pago: pago.link_pago, estado: 'esperando_pago' };
  }
  if (partida.estado !== 'viva') return { ok: false, kind: 'partida_no_viva', estado: partida.estado };
  if (venty.estaPausado(db, userId)) return { ok: false, kind: 'en_pausa' };
  const cfg = configCierre(db, userId);
  const total = entero(o.monto !== undefined ? o.monto : partida.monto);
  if (total === null || total <= 0) return { ok: false, kind: 'sin_monto_cotizado' };
  // Ticket alto / inmuebles: no cierran la venta. Califican, agendan
  // visita (si hay fecha) y escalan con contexto completo.
  const escala = motivoEscalaPrevia(db, userId, partida, total);
  if (escala) {
    const r = escalarPartida(db, userId, partidaId, {
      tipo: escala.tipo, fecha_visita: o.fecha_visita, ahora,
      resumen: escala.tipo === 'inmuebles'
        ? `inmuebles (${escala.rubro}): partida calificada por ${venty.fmtPesos(total)}, la venta no se cierra sola`
        : `ticket alto: ${venty.fmtPesos(total)} llega al umbral de ${venty.fmtPesos(escala.umbral || 0)} del fundamento`,
      jugada_recomendada: 'confirmar la visita con el cliente y definir el cierre en persona',
    });
    return { ...r, ok: false, kind: 'escalada' };
  }
  if (!cfg.link_pago) {
    const jugadaId = crearJugada(db, userId, partidaId, 'dato_faltante',
      { que: 'cargar el link de pago del negocio en el fundamento para poder cerrar', partida_id: partidaId },
      'la partida está para cerrar pero el fundamento no tiene link de pago del negocio: venty nunca cobra por su cuenta');
    venty.registrarEvento(db, userId, 'cierre_sin_link', partidaId, { jugada_id: jugadaId });
    return { ok: false, kind: 'sin_link_pago', jugada_id: jugadaId };
  }
  const tipo = o.tipo === 'sena' ? 'sena' : 'total';
  let esperado = total;
  if (tipo === 'sena') {
    if (cfg.sena_pct === null) return { ok: false, kind: 'sin_sena_configurada' };
    esperado = Math.round(total * cfg.sena_pct / 100);
  }
  const titularEsperado = cfg.titular_esperado || partida.cliente_nombre || '';
  const r = db.prepare(`INSERT INTO venty_cierre_pagos
    (user_id, partida_id, tipo, proveedor, link_pago, credencial_ref, modo, monto_esperado, titular_esperado, estado, created_at, actualizado_at)
    VALUES (?,?,?,?,?,?,?, ?,?, 'esperando', ?, ?)`)
    .run(userId, partidaId, tipo, cfg.proveedor, cfg.link_pago, cfg.credencial_ref, MODO_PAGO, esperado, titularEsperado, ahora, ahora);
  const pago = db.prepare('SELECT * FROM venty_cierre_pagos WHERE id = ?').get(Number(r.lastInsertRowid));
  db.prepare(`UPDATE venty_partidas SET estado = 'esperando_pago', forma_cierre = ?, updated_at = ? WHERE id = ?`)
    .run(tipo === 'sena' ? 'seña con link de pago' : 'pago con link', ahora, partidaId);
  const mensajes = agenda.insertarMensajesVenty(db, partida, [
    tipo === 'sena'
      ? `para reservarlo, la seña es ${venty.fmtPesos(esperado)} y se paga con el link del negocio`
      : `para cerrar, el total es ${venty.fmtPesos(esperado)} y se paga con el link del negocio`,
    cfg.link_pago,
    'cuando pagues, avisame por acá con el comprobante y lo dejo registrado',
  ], ahora);
  venty.registrarEvento(db, userId, 'cierre_link_enviado', partidaId,
    { pago_id: pago.id, tipo, monto_esperado: esperado, proveedor: cfg.proveedor, modo: MODO_PAGO });
  return { ok: true, pago, link_pago: cfg.link_pago, mensajes, estado: 'esperando_pago' };
}

function listarPagos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  if (o.partida_id) return db.prepare('SELECT * FROM venty_cierre_pagos WHERE user_id = ? AND partida_id = ? ORDER BY id DESC').all(userId, Number(o.partida_id));
  if (o.estado) return db.prepare('SELECT * FROM venty_cierre_pagos WHERE user_id = ? AND estado = ? ORDER BY id DESC').all(userId, String(o.estado));
  return db.prepare('SELECT * FROM venty_cierre_pagos WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(userId);
}

// ---- conciliación -------------------------------------------------------
// opts: { pago_id | partida_id, monto, titular, referencia, ahora }
// Cuadra = monto exacto contra lo esperado y titular normalizado igual al
// esperado. Si cuadra: cerrada_ganada sin intervención + aviso al dueño si
// supera el umbral + reseña pedida en la misma conversación. Si no cuadra:
// la partida NO cierra, el pago queda 'no_cuadra' con el motivo, y sube
// una jugada a Bandeja (se puede re-registrar el pago corregido).
function registrarPago(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const ahora = o.ahora || ahoraIso();
  let pago = null;
  if (o.pago_id) pago = db.prepare('SELECT * FROM venty_cierre_pagos WHERE id = ? AND user_id = ?').get(Number(o.pago_id), userId);
  else if (o.partida_id) pago = db.prepare(`SELECT * FROM venty_cierre_pagos WHERE user_id = ? AND partida_id = ? AND estado IN ('esperando','no_cuadra') ORDER BY id DESC LIMIT 1`).get(userId, Number(o.partida_id));
  if (!pago) return { ok: false, kind: 'pago_no_encontrado' };
  if (pago.estado === 'conciliado') return { ok: false, kind: 'pago_ya_conciliado', pago };
  const partida = obtenerPartida(db, userId, pago.partida_id);
  if (!partida) return { ok: false, kind: 'partida_no_encontrada' };
  const montoRec = entero(o.monto);
  if (montoRec === null || montoRec < 0) return { ok: false, kind: 'monto_invalido' };
  const titularRec = String(o.titular || '').slice(0, 120);
  const motivos = [];
  if (montoRec !== Number(pago.monto_esperado)) {
    motivos.push(`el monto no cuadra: se esperaban ${venty.fmtPesos(pago.monto_esperado)} y llegaron ${venty.fmtPesos(montoRec)}`);
  }
  if (pago.titular_esperado && normTexto(titularRec) !== normTexto(pago.titular_esperado)) {
    motivos.push(`el titular no cuadra: se esperaba ${pago.titular_esperado} y el pago vino de ${titularRec || 'un titular sin nombre'}`);
  }
  if (motivos.length) {
    const motivo = motivos.join(' · ');
    db.prepare(`UPDATE venty_cierre_pagos SET monto_recibido = ?, titular_recibido = ?, referencia = ?, estado = 'no_cuadra', motivo_no_cuadra = ?, actualizado_at = ? WHERE id = ?`)
      .run(montoRec, titularRec, String(o.referencia || '').slice(0, 200), motivo, ahora, pago.id);
    const propuesta = {
      tipo: 'pago_no_cuadra', pago_id: pago.id,
      esperado: { monto: Number(pago.monto_esperado), titular: pago.titular_esperado },
      recibido: { monto: montoRec, titular: titularRec, referencia: String(o.referencia || '').slice(0, 200) },
      motivo, jugada_recomendada: 'confirmar con el cliente si pagó otra cosa o desde otra cuenta; si el pago correcto llega, se registra de nuevo y cierra solo',
      contexto: contextoPartida(db, userId, partida),
    };
    const jugadaId = crearJugada(db, userId, pago.partida_id, 'pago_no_cuadra', propuesta,
      `el pago no cuadró y la venta no cerró: ${motivo}`.slice(0, 500));
    venty.registrarEvento(db, userId, 'pago_no_cuadra', pago.partida_id, { pago_id: pago.id, motivo, jugada_id: jugadaId });
    venty.registrarEvento(db, userId, 'escalacion', pago.partida_id, { tipo: 'pago_no_cuadra', jugada_id: jugadaId, resumen: motivo });
    const mensajes = agenda.insertarMensajesVenty(db, partida,
      ['me llegó el aviso del pago pero no coincide con lo cotizado, lo estoy revisando con el dueño y te aviso'], ahora);
    return { ok: false, kind: 'no_cuadra', motivo, jugada_id: jugadaId, mensajes,
      pago: db.prepare('SELECT * FROM venty_cierre_pagos WHERE id = ?').get(pago.id), estado_partida: partida.estado };
  }
  // Cuadra: cierre sin intervención.
  const cfg = configCierre(db, userId);
  const aviso = cfg.umbral_aviso_dueno !== null && montoRec >= cfg.umbral_aviso_dueno;
  db.prepare(`UPDATE venty_cierre_pagos SET monto_recibido = ?, titular_recibido = ?, referencia = ?, estado = 'conciliado', motivo_no_cuadra = '', aviso_dueno = ?, actualizado_at = ?, conciliado_at = ? WHERE id = ?`)
    .run(montoRec, titularRec, String(o.referencia || '').slice(0, 200), aviso ? 1 : 0, ahora, ahora, pago.id);
  const forma = pago.tipo === 'sena' ? 'seña conciliada' : 'pago total conciliado';
  db.prepare(`UPDATE venty_partidas SET estado = 'cerrada_ganada', monto = ?, forma_cierre = ?, updated_at = ? WHERE id = ?`)
    .run(montoRec, forma, ahora, pago.partida_id);
  venty.registrarEvento(db, userId, 'pago_conciliado', pago.partida_id,
    { pago_id: pago.id, monto: montoRec, titular: titularRec, referencia: String(o.referencia || '').slice(0, 200), modo: MODO_PAGO });
  venty.registrarEvento(db, userId, 'cierre', pago.partida_id, { forma, monto: montoRec });
  let jugadaAvisoId = null;
  if (aviso) {
    jugadaAvisoId = crearJugada(db, userId, pago.partida_id, 'aviso_pago',
      { tipo: 'aviso_pago', pago_id: pago.id, monto: montoRec, umbral: cfg.umbral_aviso_dueno, cliente: partida.cliente_nombre, forma },
      `entró un pago de ${venty.fmtPesos(montoRec)} de ${partida.cliente_nombre}: supera el umbral de aviso del fundamento`);
    venty.registrarEvento(db, userId, 'aviso_dueno_pago', pago.partida_id, { pago_id: pago.id, monto: montoRec, umbral: cfg.umbral_aviso_dueno, jugada_id: jugadaAvisoId });
  }
  const partidaCerrada = obtenerPartida(db, userId, pago.partida_id);
  const mensajes = agenda.insertarMensajesVenty(db, partidaCerrada,
    [`listo, tu pago de ${venty.fmtPesos(montoRec)} quedó registrado y la venta quedó cerrada`], ahora);
  const resena = pedirResena(db, userId, pago.partida_id, { ahora });
  return { ok: true, conciliado: true, pago: db.prepare('SELECT * FROM venty_cierre_pagos WHERE id = ?').get(pago.id),
    estado_partida: 'cerrada_ganada', forma, aviso_dueno: aviso, jugada_aviso_id: jugadaAvisoId, mensajes, resena };
}

// ---- reseña de Google: solo en la conversación de cierre -----------------
// Guardas duras: la partida tiene que estar cerrada_ganada; se pide una
// sola vez (registro en venty_cierre_resenas + evento previo); el pedido
// sale como mensaje DENTRO del hilo de esa partida, nunca por otro canal.
function pedirResena(db, userId, partidaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const partida = obtenerPartida(db, userId, partidaId);
  if (!partida) return { ok: false, kind: 'partida_no_encontrada' };
  if (partida.estado !== 'cerrada_ganada') return { ok: false, kind: 'partida_no_ganada', estado: partida.estado };
  const ya = db.prepare('SELECT * FROM venty_cierre_resenas WHERE user_id = ? AND partida_id = ?').get(userId, partidaId);
  if (ya) return { ok: false, kind: 'resena_ya_pedida', resena: ya };
  const evPrevio = db.prepare(`SELECT id FROM venty_eventos WHERE user_id = ? AND partida_id = ? AND tipo = 'resena_pedida' LIMIT 1`).get(userId, partidaId);
  if (evPrevio) {
    // Ya se pidió antes de este lote (p. ej. la semilla): queda registrada
    // acá y no se vuelve a pedir.
    const ahora0 = o.ahora || ahoraIso();
    db.prepare(`INSERT OR IGNORE INTO venty_cierre_resenas (user_id, partida_id, canal, url, pedida_at) VALUES (?,?,?,?,?)`)
      .run(userId, partidaId, partida.canal || '', configCierre(db, userId).resena_google_url, ahora0);
    return { ok: false, kind: 'resena_ya_pedida' };
  }
  const ahora = o.ahora || ahoraIso();
  const cfg = configCierre(db, userId);
  const textos = ['gracias por tu compra, si te gustó la atención, nos dejás una reseña en google'];
  if (cfg.resena_google_url) textos.push(cfg.resena_google_url);
  const mensajes = agenda.insertarMensajesVenty(db, partida, textos, ahora);
  const r = db.prepare(`INSERT INTO venty_cierre_resenas (user_id, partida_id, canal, url, pedida_at) VALUES (?,?,?,?,?)`)
    .run(userId, partidaId, partida.canal || '', cfg.resena_google_url, ahora);
  venty.registrarEvento(db, userId, 'resena_pedida', partidaId, { via: 'conversacion_de_cierre', resena_id: Number(r.lastInsertRowid) });
  return { ok: true, resena_id: Number(r.lastInsertRowid), mensajes };
}

function listarResenas(db, userId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM venty_cierre_resenas WHERE user_id = ? ORDER BY pedida_at ASC').all(userId);
}

module.exports = {
  MODO_PAGO, TIPOS_ESCALACION,
  ensureSchema, configCierre, fijarConfigCierre, motivoEscalaPrevia,
  iniciarCierre, listarPagos, registrarPago, pedirResena, listarResenas,
  escalarPartida, contextoPartida, normTexto,
};
