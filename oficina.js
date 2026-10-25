// oficina.js — LA ESPINA DE BAMBOOTY (programa TestFlight).
// Una sola fuente para la oficina: fundamento único, registro de trabajos
// (el río), Bandeja «Para vos», partes de poder con la forma del contrato
// de partes de la oficina y el chat que rutea. Nada hardcodeado en la superficie: todo lo que
// la app muestra de la oficina sale de estas tablas (ley 10: sin registro
// no hay promesa; contrato §1.1: la ausencia se NOMBRA, jamás silencio).
'use strict';

const bcrypt = require('bcryptjs');
const niveles = require('./niveles');
const pushOficina = require('./push-oficina');
const fixture = require('./oficina-fixture');

function init(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS oficina_fundamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    capa TEXT NOT NULL,
    clave TEXT NOT NULL,
    hecho TEXT NOT NULL,
    detalle TEXT DEFAULT '',
    alcance TEXT DEFAULT 'raiz',
    poder TEXT DEFAULT '',
    fuente TEXT DEFAULT '',
    verificado INTEGER DEFAULT 1,
    ts INTEGER NOT NULL,
    UNIQUE(user_id, clave)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS oficina_registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    poder TEXT NOT NULL,
    tipo TEXT NOT NULL,
    resumen TEXT NOT NULL,
    registro_ref TEXT NOT NULL,
    recibo_json TEXT,
    estado TEXT DEFAULT 'registrado',
    salida INTEGER DEFAULT 0,
    ts INTEGER NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_oficina_reg_user_ts ON oficina_registros(user_id, ts)`);
  db.exec(`CREATE TABLE IF NOT EXISTS oficina_bandeja (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    poder TEXT NOT NULL,
    que TEXT NOT NULL,
    propuesta TEXT DEFAULT '',
    contexto_json TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    registro_ref TEXT DEFAULT '',
    espera_desde INTEGER NOT NULL,
    resuelta_en INTEGER,
    nota_dueno TEXT DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS oficina_nivel_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    poder TEXT NOT NULL,
    evento TEXT NOT NULL,
    hecho TEXT DEFAULT '',
    registro_ref TEXT DEFAULT '',
    ts INTEGER NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_oficina_niv_user ON oficina_nivel_eventos(user_id, poder)`);
  // El registro de dirección de Bambooty (sistema §8): órdenes, decisiones y
  // pedidos de datos. Única fuente operativa de la dirección.
  db.exec(`CREATE TABLE IF NOT EXISTS direccion_registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    que TEXT NOT NULL,
    poder_destino TEXT DEFAULT '',
    estado TEXT DEFAULT 'emitida',
    resultado TEXT DEFAULT '',
    fundamento_ref TEXT DEFAULT '',
    ts INTEGER NOT NULL
  )`);
  try { db.exec(`ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
  pushOficina.init(db);
}

// ————————————————— Utilidades de registro —————————————————

function nuevoRef(poder, tipo, id) { return `${poder}:${tipo}:${id}`; }

function registrarRegistro(db, uid, { poder, tipo, resumen, recibo, estado, salida }) {
  const ts = Date.now();
  const r = db.prepare('INSERT INTO oficina_registros (user_id, poder, tipo, resumen, registro_ref, recibo_json, estado, salida, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, poder, tipo, resumen, '', recibo ? JSON.stringify(recibo) : null, estado || 'registrado', salida ? 1 : 0, ts);
  const ref = nuevoRef(poder, tipo, r.lastInsertRowid);
  db.prepare('UPDATE oficina_registros SET registro_ref = ? WHERE id = ?').run(ref, r.lastInsertRowid);
  return { id: r.lastInsertRowid, registro_ref: ref };
}

// El festejo de una subida: buena noticia → entra por la puerta de push
// como celebración agrupable (Bossty la resume; jamás un grito suelto).
function festejarSubida(db, uid, subida) {
  if (!subida) return;
  pushOficina.emitir(db, uid, {
    agente: subida.poder,
    motivo: 'celebracion',
    titulo: subida.poder === 'oficina' ? '¡Tu oficina subió de nivel! 🌿' : `¡${subida.nombre} subió de nivel!`,
    cuerpo: `Ahora es ${subida.nombre_nivel} (nivel ${subida.nivel} de 5). El tallo crece con trabajo real.`,
    url: '/#/app/oficina',
  }).catch(() => {});
}

// Una salida entregada: registro + (si el poder lo declara) evento de nivel.
function registrarSalida(db, uid, { poder, tipo, resumen, recibo, estado, evento_nivel }) {
  const reg = registrarRegistro(db, uid, { poder, tipo, resumen, recibo, estado: estado || 'entregada', salida: 1 });
  let subida = null;
  if (evento_nivel) {
    const r = niveles.registrarEvento(db, uid, { poder, evento: evento_nivel, hecho: resumen, registro_ref: reg.registro_ref }, metricas(db, uid));
    subida = r.subida;
    festejarSubida(db, uid, subida);
  }
  return { ...reg, subida };
}

function registrarFundamento(db, uid, { capa, clave, hecho, detalle, alcance, poder, fuente, verificado }) {
  // Nunca dos veces el mismo hecho (clave única): si ya está, no se duplica
  // ni se repregunta — la doctrina del fundamento en una línea de código.
  const prev = db.prepare('SELECT id FROM oficina_fundamento WHERE user_id = ? AND clave = ?').get(uid, clave);
  if (prev) return { id: prev.id, duplicado: true };
  const r = db.prepare('INSERT INTO oficina_fundamento (user_id, capa, clave, hecho, detalle, alcance, poder, fuente, verificado, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, capa, clave, hecho, detalle || '', alcance || 'raiz', poder || '', fuente || '', verificado === false ? 0 : 1, Date.now());
  return { id: r.lastInsertRowid, duplicado: false };
}

function metricas(db, uid) {
  let poderes_con_salida = 0;
  try {
    const rows = db.prepare('SELECT DISTINCT poder FROM oficina_registros WHERE user_id = ? AND salida = 1').all(uid);
    poderes_con_salida = new Set(rows.map((r) => niveles.resolverPoder(r.poder))).size;
  } catch (e) {}
  return { poderes_con_salida };
}

// ————————————————— Bandeja «Para vos» —————————————————

async function crearBandejaItem(db, uid, { poder, que, propuesta, contexto, registro_ref, push }) {
  const r = db.prepare('INSERT INTO oficina_bandeja (user_id, poder, que, propuesta, contexto_json, estado, registro_ref, espera_desde) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, poder, que, propuesta || '', contexto ? JSON.stringify(contexto) : null, 'pendiente', registro_ref || '', Date.now());
  const id = r.lastInsertRowid;
  registrarRegistro(db, uid, { poder, tipo: 'bandeja', resumen: `Para vos: ${que}`, estado: 'pendiente' });
  if (push !== false) {
    // Motivo 1 de DETALLE-TOTAL §5: algo listo que espera tu toque, con la
    // decisión en la misma push y el toque en LA tarjeta exacta.
    await pushOficina.emitir(db, uid, {
      agente: poder, motivo: 'decision',
      titulo: `${(niveles.IDENTIDADES[poder] || {}).nombre || 'Tu oficina'} te trajo algo para tu OK`,
      cuerpo: String(que).slice(0, 120),
      url: `/#/app/bandeja?item=${id}`,
      bandeja_id: id,
    }).catch(() => {});
  }
  return { id };
}

function listarBandeja(db, uid, { soloPendientes } = {}) {
  const rows = soloPendientes
    ? db.prepare("SELECT * FROM oficina_bandeja WHERE user_id = ? AND estado = 'pendiente' ORDER BY espera_desde ASC").all(uid)
    : db.prepare('SELECT * FROM oficina_bandeja WHERE user_id = ? ORDER BY espera_desde DESC LIMIT 60').all(uid);
  return rows.map((r) => {
    const def = niveles.IDENTIDADES[r.poder] || {};
    return {
      ...r,
      contexto: r.contexto_json ? JSON.parse(r.contexto_json) : null,
      nombre: def.nombre || r.poder, color: def.color || '#D6A463', avatar: def.avatar || null,
    };
  });
}

// accionar: la única manija del dueño — Aceptar / Pedir un cambio, durable,
// con su evento de nivel y su registro. Devuelve la subida si la hubo
// (la familia festeja: el cliente ve la celebración sobre trabajo real).
function accionarBandeja(db, uid, id, accion, nota) {
  const item = db.prepare('SELECT * FROM oficina_bandeja WHERE id = ? AND user_id = ?').get(id, uid);
  if (!item) return { ok: false, error: 'no_existe' };
  if (item.estado !== 'pendiente') return { ok: false, error: 'ya_resuelta', item };
  const nuevoEstado = accion === 'aceptar' ? 'aceptada' : accion === 'cambio' ? 'cambio_pedido' : null;
  if (!nuevoEstado) return { ok: false, error: 'accion_invalida' };
  db.prepare('UPDATE oficina_bandeja SET estado = ?, resuelta_en = ?, nota_dueno = ? WHERE id = ?')
    .run(nuevoEstado, Date.now(), String(nota || '').slice(0, 500), id);
  registrarRegistro(db, uid, {
    poder: item.poder, tipo: 'decision_bandeja',
    resumen: accion === 'aceptar' ? `Aceptaste: ${item.que}` : `Pediste un cambio: ${item.que}`,
    estado: nuevoEstado,
  });
  const ev = niveles.registrarEvento(db, uid, {
    poder: item.poder, evento: 'decision_bandeja',
    hecho: accion === 'aceptar' ? `El dueño aceptó: ${item.que}` : `El dueño pidió un cambio: ${item.que}`,
    registro_ref: item.registro_ref || '',
  }, metricas(db, uid));
  // La decisión también alimenta a la oficina entera (raíz compartida).
  const evOf = niveles.registrarEvento(db, uid, {
    poder: 'oficina', evento: 'decision_dueno', hecho: 'Primera decisión del dueño en la Bandeja', registro_ref: item.registro_ref || '',
  }, metricas(db, uid));
  const r = { ok: true, item: { ...item, estado: nuevoEstado }, subida: ev.subida || evOf.subida || null };
  // Hook del poder dueño del ítem: su flujo reacciona a la decisión
  // (ej. Posty registra la semana aceptada). Nunca rompe la decisión.
  const hook = HOOKS_BANDEJA[item.poder];
  if (hook) {
    try {
      const extra = hook(db, uid, { ...item, estado: nuevoEstado, nota_dueno: String(nota || ''), contexto: item.contexto_json ? JSON.parse(item.contexto_json) : null }, accion);
      if (extra && extra.subida && !r.subida) r.subida = extra.subida;
      if (extra && extra.detalle) r.detalle = extra.detalle;
    } catch (e) { /* la decisión ya quedó durable */ }
  }
  festejarSubida(db, uid, r.subida);
  return r;
}

// Cada poder registra su reacción a las decisiones de SU Bandeja.
const HOOKS_BANDEJA = {};
function registrarHookBandeja(poder, fn) { HOOKS_BANDEJA[poder] = fn; }

// ————————————————— Partes (forma del contrato §1.1) —————————————————

const DIA_PLAN = { posty: 'martes', gesty: 'martes', venty: 'miércoles', atenty: 'jueves' };

// El contenido sellado del módulo de personas (Talenty) que viaja DENTRO
// del parte de Gesty: SOLO tipo / fecha de vencimiento / monto total /
// estado — jamás un dato de personas (guarda dura, no se fuerza).
function talentySellado(db, uid) {
  let rows = [];
  try { rows = db.prepare("SELECT * FROM oficina_registros WHERE user_id = ? AND poder = 'talenty' ORDER BY ts ASC").all(uid); } catch (e) {}
  return rows.map((r) => {
    const rec = r.recibo_json ? JSON.parse(r.recibo_json) : {};
    return {
      tipo: rec.tipo || r.tipo || '',
      fecha_vencimiento: rec.fecha_vencimiento || null,
      monto_total: rec.monto_total !== undefined ? rec.monto_total : null,
      estado: r.estado,
    };
  });
}

function parteDePoder(db, uid, poder, periodo) {
  const salidasRows = db.prepare("SELECT * FROM oficina_registros WHERE user_id = ? AND poder = ? AND salida = 1 ORDER BY ts ASC").all(uid, poder);
  const fundRows = db.prepare('SELECT * FROM oficina_fundamento WHERE user_id = ? AND poder = ? ORDER BY ts ASC').all(uid, poder);
  const nivel = niveles.computarNivel(db, uid, poder, metricas(db, uid));
  const pendientes = listarBandeja(db, uid, { soloPendientes: true }).filter((i) => i.poder === poder);
  const incidentes = salidasRows.filter((r) => r.estado === 'con_problema')
    .map((r) => ({ que: r.resumen, causa: 'registrado con problema', impacto: 'declarado en su registro', resolucion_estimada: 'en curso' }));
  const tuvoActividad = salidasRows.length > 0 || fundRows.length > 0 || (nivel && nivel.hitos_cumplidos > 0);
  if (!tuvoActividad) return null; // el llamador lo nombra parte_no_recibido
  return {
    poder,
    cliente: 'Café Aroma',
    periodo: periodo || 'semana del programa',
    generado_en: new Date().toISOString(),
    modo: 'real',
    salidas: salidasRows.map((r) => ({
      tipo: r.tipo, resumen: r.resumen, registro_ref: r.registro_ref,
      recibo: r.recibo_json ? JSON.parse(r.recibo_json) : null,
      estado: r.estado,
    })),
    fundamento_nuevo: fundRows.map((f) => (poder === 'talenty'
      ? { hecho: 'Dato de gente (sellado)', capa: f.capa, alcance: 'sellado', fuente: 'talenty', verificado: !!f.verificado }
      : { hecho: f.hecho, capa: f.capa, alcance: f.alcance, fuente: f.fuente || 'programa', verificado: !!f.verificado })),
    nivel: { nivel_actual: nivel.nivel, nombre_nivel: nivel.nombre_nivel, evento_subida: null },
    bandeja_pendientes: pendientes.map((i) => ({ que: i.que, propuesta_armada: i.propuesta, espera_desde: i.espera_desde })),
    incidentes_atrasos: incidentes,
    // El módulo de personas sellado corre dentro de Gesty: su único
    // contenido permitido viaja acá, no como parte separado.
    ...(poder === 'gesty' ? { modulo_personas: { especialista: 'talenty', sellado: true, registros: talentySellado(db, uid) } } : {}),
  };
}

function partesDeLaSemana(db, uid, periodo) {
  const partes = {};
  const faltantes = [];
  for (const poder of niveles.ORDEN_PODERES) {
    const p = parteDePoder(db, uid, poder, periodo);
    if (p) partes[poder] = p;
    else { partes[poder] = { poder, parte_no_recibido: true, causa: 'todavía no corre su flujo en la semana del programa' }; faltantes.push(poder); }
  }
  return { partes, faltantes };
}

function resolverRegistro(db, uid, ref) {
  const r = db.prepare('SELECT * FROM oficina_registros WHERE user_id = ? AND registro_ref = ?').get(uid, ref);
  if (!r) return null;
  return { ...r, recibo: r.recibo_json ? JSON.parse(r.recibo_json) : null };
}

// ————————————————— Dirección (registro de Bossty, §8) —————————————————

function registrarDireccion(db, uid, { tipo, que, poder_destino, estado, resultado, fundamento_ref }) {
  const r = db.prepare('INSERT INTO direccion_registros (user_id, tipo, que, poder_destino, estado, resultado, fundamento_ref, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid, tipo, que, poder_destino || '', estado || 'emitida', resultado || '', fundamento_ref || '', Date.now());
  return { id: r.lastInsertRowid };
}
function listarDireccion(db, uid, limit = 50) {
  return db.prepare('SELECT * FROM direccion_registros WHERE user_id = ? ORDER BY ts DESC LIMIT ?').all(uid, limit);
}

// ————————————————— Estado de la oficina (el río y los puestos) —————————————————

function estadoPoder(db, uid, poder) {
  const def = niveles.PODERES[poder];
  const nivel = niveles.computarNivel(db, uid, poder, metricas(db, uid));
  const ultima = db.prepare('SELECT * FROM oficina_registros WHERE user_id = ? AND poder = ? ORDER BY ts DESC LIMIT 1').get(uid, poder);
  const salidas = db.prepare('SELECT COUNT(*) AS n FROM oficina_registros WHERE user_id = ? AND poder = ? AND salida = 1').get(uid, poder);
  let estado = 'todavia_no_corre';
  if ((salidas && salidas.n) > 0) estado = 'activo';
  else if (nivel.hitos_cumplidos > 0) estado = 'leyendo_tu_mundo';
  return {
    poder, nombre: def.nombre, rol: def.rol, color: def.color, firma: def.firma, avatar: def.avatar,
    estado, dia_plan: DIA_PLAN[poder] || '',
    nivel,
    ultima_actividad: ultima ? { resumen: ultima.resumen, ts: ultima.ts, tipo: ultima.tipo } : null,
    salidas: (salidas && salidas.n) || 0,
  };
}

// La línea de especialistas: sin nivel ni tallo — su presencia es su
// misión y, cuando hay un proyecto activo, su trabajo en la Bandeja.
function estadoEspecialista(db, uid, clave) {
  const def = niveles.ESPECIALISTAS[clave];
  const pendientes = listarBandeja(db, uid, { soloPendientes: true }).filter((i) => i.poder === clave).length;
  const ultima = db.prepare('SELECT * FROM oficina_registros WHERE user_id = ? AND poder = ? ORDER BY ts DESC LIMIT 1').get(uid, clave);
  return {
    clave, nombre: def.nombre, mision: def.mision, color: def.color, firma: def.firma, avatar: def.avatar,
    anfitrion: def.anfitrion, por_proyecto: true,
    proyecto_activo: pendientes > 0,
    pendientes,
    ultima_actividad: ultima ? { resumen: clave === 'talenty' ? 'Actividad registrada (sellada)' : ultima.resumen, ts: ultima.ts, tipo: ultima.tipo } : null,
  };
}

function estadoOficina(db, uid) {
  const m = metricas(db, uid);
  const nivelOficina = niveles.computarNivel(db, uid, 'oficina', m);
  const nombreDe = (clave) => { try { const f = db.prepare('SELECT hecho FROM oficina_fundamento WHERE user_id = ? AND clave = ?').get(uid, clave); return f ? f.hecho : ''; } catch (e) { return ''; } };
  const rio = db.prepare('SELECT * FROM oficina_registros WHERE user_id = ? ORDER BY ts DESC LIMIT 40').all(uid)
    .map((r) => ({ ...r, recibo: r.recibo_json ? JSON.parse(r.recibo_json) : null }));
  const pendientes = listarBandeja(db, uid, { soloPendientes: true });
  const aprendido = db.prepare('SELECT * FROM oficina_fundamento WHERE user_id = ? ORDER BY ts DESC LIMIT 12').all(uid);
  return {
    negocio: nombreDe('nombre'),
    dueno: nombreDe('dueno'),
    nivel_oficina: nivelOficina,
    poderes: niveles.ORDEN_PODERES.map((p) => estadoPoder(db, uid, p)),
    especialistas: niveles.ORDEN_ESPECIALISTAS.map((c) => estadoEspecialista(db, uid, c)),
    rio,
    bandeja_pendientes: pendientes,
    bandeja_count: pendientes.length,
    aprendido: aprendido.map((f) => ({ hecho: f.hecho, capa: f.capa, poder: f.poder, ts: f.ts })),
    metricas: m,
  };
}

function fundamentoCompleto(db, uid) {
  const rows = db.prepare('SELECT * FROM oficina_fundamento WHERE user_id = ? ORDER BY ts ASC').all(uid);
  const capas = {};
  for (const r of rows) {
    if (!capas[r.capa]) capas[r.capa] = [];
    capas[r.capa].push({ clave: r.clave, hecho: r.hecho, detalle: r.detalle, alcance: r.alcance, poder: r.poder, verificado: !!r.verificado, fuente: r.fuente });
  }
  return { capas, total: rows.length };
}

// ————————————————— Chat con Bambooty que rutea —————————————————
// Registro de rutas: cada poder registra sus patrones y su handler cuando
// su módulo entra (esta noche, uno por poder). Lo que no matchea lo responde
// Bambooty desde el estado real de la oficina (sin inventar: conteos y
// pendientes salen de las tablas).
const RUTAS_CHAT = [];
function registrarRutaChat(poder, patrones, handler) {
  RUTAS_CHAT.push({ poder, patrones, handler });
}

async function responderChat(db, uid, texto) {
  const t = String(texto || '').trim();
  for (const ruta of RUTAS_CHAT) {
    if (ruta.patrones.some((re) => re.test(t))) {
      const r = await ruta.handler(db, uid, t);
      if (r) {
        registrarRegistro(db, uid, { poder: ruta.poder, tipo: 'chat', resumen: `Chat → ${ruta.poder}: ${t.slice(0, 80)}` });
        return { ...r, poder: ruta.poder };
      }
    }
  }
  // Bambooty responde desde los registros (la dirección es Bambooty).
  const est = estadoOficina(db, uid);
  const pend = est.bandeja_count;
  const negocio = (() => { try { const f = db.prepare("SELECT hecho FROM oficina_fundamento WHERE user_id = ? AND clave = 'nombre'").get(uid); return f ? f.hecho : 'tu negocio'; } catch (e) { return 'tu negocio'; } })();
  let reply;
  if (/bandeja|para vos|pendiente|ok\b/i.test(t)) {
    reply = pend
      ? `Tenés ${pend} ${pend === 1 ? 'cosa esperándote' : 'cosas esperándote'} en tu Bandeja «Para vos». Ahí aceptás o pedís un cambio, en un toque.`
      : 'Tu Bandeja está al día: no hay nada esperando tu OK. Cuando un poder te traiga algo, aparece ahí.';
  } else if (/nivel|aprend|oficina/i.test(t)) {
    const movidos = est.poderes.filter((p) => p.nivel.nivel > 1).map((p) => `${p.nombre} (${p.nivel.nombre_nivel})`);
    reply = `Tu oficina está en nivel ${est.nivel_oficina.nombre_nivel}. ${movidos.length ? `Ya vienen creciendo: ${movidos.join(' · ')}.` : 'Los tallos crecen con trabajo real: cada flujo que corre suma su evento.'}`;
  } else {
    reply = `Acá estoy, dirigiendo tu oficina de ${negocio}. ${pend ? `Hay ${pend} ${pend === 1 ? 'decisión esperándote' : 'decisiones esperándote'} en la Bandeja. ` : ''}Pedime lo que necesites y lo derivo al poder que corresponde: el que lo hace, lo hace con tu fundamento.`;
  }
  registrarRegistro(db, uid, { poder: 'oficina', tipo: 'chat', resumen: `Chat con Bambooty: ${t.slice(0, 80)}` });
  return { reply, poder: 'oficina' };
}

// ————————————————— Seed: Café Aroma —————————————————
// Idempotente: si la cuenta fixture ya existe, completa lo que falte y sale.
// Devuelve { user_id, creado } — jamás toca otra cuenta.
async function seedCafeAroma(db, { password } = {}) {
  let user = db.prepare('SELECT id FROM users WHERE email = ?').get(fixture.FIXTURE_EMAIL);
  let creado = false;
  if (!user) {
    const hash = bcrypt.hashSync(password || 'CafeAroma-TestFlight-2026!', 10);
    const r = db.prepare("INSERT INTO users (email, password_hash, plan, plan_status, lang, bambooty_shell) VALUES (?, ?, 'total', 'active', 'es', 1)")
      .run(fixture.FIXTURE_EMAIL, hash);
    user = { id: r.lastInsertRowid };
    creado = true;
  } else {
    db.prepare('UPDATE users SET bambooty_shell = 1 WHERE id = ?').run(user.id);
  }
  const uid = user.id;
  // Perfil clásico (lo que los motores existentes ya leen).
  db.prepare(`INSERT INTO profiles (user_id, business_name, category, tone, description, ig_username)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET business_name = excluded.business_name, category = excluded.category, description = excluded.description, ig_username = excluded.ig_username`)
    .run(uid, fixture.PERFIL.business_name, fixture.PERFIL.category, fixture.PERFIL.tone, fixture.PERFIL.description, fixture.PERFIL.ig_username);
  try {
    db.prepare(`INSERT INTO settings (user_id, brand_colors) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET brand_colors = excluded.brand_colors`)
      .run(uid, fixture.PERFIL.brand_colors);
  } catch (e) { /* settings puede no tener la fila: no bloquea la espina */ }
  // El fundamento único, hecho por hecho (dedupe por clave).
  let nuevos = 0;
  for (const f of fixture.FUNDAMENTO) {
    const r = registrarFundamento(db, uid, { ...f, fuente: 'programa TestFlight' });
    if (!r.duplicado) nuevos++;
  }
  // Eventos de nivel iniciales: el fundamento cargado ES un hecho real del
  // programa, y los poderes cuya lista de lectura cubre el fixture lo leyeron.
  const yaCargado = db.prepare("SELECT COUNT(*) AS n FROM oficina_nivel_eventos WHERE user_id = ? AND evento = 'fundamento_cargado'").get(uid).n > 0;
  if (!yaCargado) {
    niveles.registrarEvento(db, uid, { poder: 'oficina', evento: 'fundamento_cargado', hecho: 'El fundamento de Café Aroma quedó cargado: las raíces de la oficina', registro_ref: 'fundamento:cafe-aroma:v1' }, metricas(db, uid));
    for (const poder of fixture.LECTORES_INICIALES) {
      niveles.registrarEvento(db, uid, { poder, evento: 'fundamento_leido', hecho: `${niveles.PODERES[poder].nombre} leyó el fundamento de Café Aroma`, registro_ref: 'fundamento:cafe-aroma:v1' }, metricas(db, uid));
    }
    registrarRegistro(db, uid, { poder: 'oficina', tipo: 'fundamento', resumen: 'Fundamento de Café Aroma cargado — la oficina tiene su mundo', estado: 'registrado' });
    registrarDireccion(db, uid, { tipo: 'decision', que: 'Fundamento v1 de Café Aroma confirmado como base de la semana de prueba', poder_destino: 'oficina', estado: 'cumplida', resultado: 'cargado por el programa', fundamento_ref: 'fundamento:cafe-aroma:v1' });
    // La primera decisión real del dueño: confirmar el fundamento. Propuesta
    // armada, dos botones, un registro detrás — el patrón de toda la Bandeja.
    await crearBandejaItem(db, uid, {
      poder: 'oficina',
      que: 'Confirmá el fundamento de Café Aroma',
      propuesta: 'Cargué el mundo de Café Aroma: su oferta con la lista de precios vigente, su paleta, sus políticas y los límites de Martín. Si está bien, tu oficina trabaja sobre esto toda la semana.',
      contexto: { fundamento_ref: 'fundamento:cafe-aroma:v1', hechos: fixture.FUNDAMENTO.length },
      registro_ref: 'fundamento:cafe-aroma:v1',
    });
  }
  return { user_id: uid, creado, fundamento_nuevos: nuevos };
}

module.exports = {
  init, registrarRegistro, registrarSalida, registrarFundamento, metricas, festejarSubida,
  crearBandejaItem, listarBandeja, accionarBandeja, registrarHookBandeja,
  parteDePoder, partesDeLaSemana, resolverRegistro,
  registrarDireccion, listarDireccion,
  estadoOficina, estadoPoder, estadoEspecialista, talentySellado, fundamentoCompleto,
  registrarRutaChat, responderChat, seedCafeAroma,
  push: pushOficina, niveles,
};
