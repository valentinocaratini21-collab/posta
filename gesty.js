// gesty.js — G-02 · FUNDACIÓN del módulo Gesty (segundo empleado de la
// oficina). Spec: gesty-g02-build-spec.md (manda) + gesty-build-spec.md
// (leyes heredadas). Alcance de este archivo: SOLO el P0 de la fundación,
// lado servidor:
//   P0-1 · Registro de empleados + gating por pack (forzado en servidor).
//   P0-2 · Registro durable de eventos, append-only («sin registro no
//          hay promesa»): los eventos no se editan ni se borran — hay
//          triggers que lo impiden en la propia base.
//   P0-3 · Fundamento-vista Gesty: UN solo fundamento con procedencia
//          por dato (valor · origen · origen_ref · cargado_por ·
//          confirmado_por_dueno · historial) y corrección del dueño que
//          propaga a las dos vistas (dueño / «Lo que Gesty aprendió»)
//          porque ambas leen la MISMA fila. Credenciales: jamás en
//          claro — los campos credenciales solo guardan la REFERENCIA
//          al almacenamiento seguro y la API nunca los devuelve.
//   P0-4 · Bandeja «Para tu OK»: la matriz de aprobación forzada EN EL
//          SERVIDOR (R1–R10 de la spec §4.2). Ítems de a uno: NO existe
//          aprobación masiva para tipos Gesty (R3) — ni endpoint, ni
//          función, ni botón. El chat nunca aprueba (R2): acá no hay
//          ninguna vía de aprobación que no sea approveCard con
//          tarjeta previa, dueño, versión vigente y tarjeta viva.
// Los motores de área (Comprobantes G-03, Facturación G-04, …) se
// construyen DESPUÉS sobre esta fundación y se enchufan como
// «ejecutores» por tipo de tarjeta (registerExecutor).
//
// Esquema ADITIVO e idempotente (CREATE TABLE IF NOT EXISTS al primer
// uso, mismo patrón que device_tokens): no toca ninguna tabla existente
// ni cambia el comportamiento de Posty para ninguna cuenta.
'use strict';

// ---------------------------------------------------------------------------
// Constantes de la spec
// ---------------------------------------------------------------------------

// Los 10 tipos de tarjeta de Gesty = las 10 acciones que SIEMPRE exigen
// OK del dueño (spec G-02 §4.1/§4.2). Toda tarjeta Gesty es de matriz:
// no existe tarjeta Gesty aprobable por fuera de approveCard.
const MATRIX_TIPOS = [
  'presupuesto',
  'factura-emision',
  'factura-anulacion',
  'cobranza',
  'orden-compra',
  'pago-proveedor',
  'compromiso-mover',
  'compromiso-cancelar',
  'hueco-ofrecer',
  'caso-sensible',
  // Mejoras producto 28/10 (build local, sin push): tarjetas nuevas
  // de la matriz — cada una con su ejecutor registrado en su módulo.
  'recurrente',          // generar la cobranza de un período dudoso
  'anomalia',            // revisar un aviso de lo que no cuadra
  'precio-venta',        // aplicar un cambio de precio de venta
  'cadena-presupuesto',  // confirmar reserva + stock de un presupuesto aceptado
  'mensaje-proveedor',   // aprobar el envío de un mensaje a un proveedor
  'migracion-revision',  // importar las filas revisadas de una migración
  'legal-vencimiento', 'deuda-vencimiento', 'aviso-precio', 'facturacion-lote', 'lote-por-vencer', 'alerta-dolar', 'suscripcion-olvidada', 'activo-service',   // aviso de vencimiento de un documento legal
  // Mejoras producto 28/10, tanda 7 (build local, sin push).
  'pago-programado',  // aprobar hoy un pago que se ejecuta en fecha
  'abono-periodo',    // revisar el período de un abono mensual
  'saldo-favor',      // aplicar un saldo a favor del cliente
  // Mejoras producto 28/10, tanda 8 (build local, sin push).
  'alquiler-devolucion', // avisar devolución próxima o vencida
  // Mejoras producto 28/10, tanda 9 (build local, sin push).
  'bajo-costo', // confirmar una venta por debajo del costo real
  // Mejoras producto 28/10, tanda 11 (build local, sin push).
  'rendicion', // aprobar una rendición de gasto del equipo
  'canje-puntos', // aprobar un canje de puntos de un cliente
  // Auto-fetch de papeles (build local, sin push).
  'papel-dudoso', // completar el único dato dudoso de un papel buscado solo
  // Brechas de recepción (build local, sin push).
  'cliente-nuevo', // confirmar la ficha de un cliente nuevo creada desde una llamada o mensaje
  // Prueba de Gesty (build local, sin push): aprobar una acción de la
  // semana en vivo. El ejecutor vive en gesty-prueba.js y corre por el
  // flujo estándar (approveCard): no hay una segunda Bandeja.
  'prueba-accion',
];

// Registro de empleados (build-spec §2 / G-02 §2.1). Posty se declara
// solo a título registral: conserva su lógica propia intacta (sus
// aprobaciones viven en su sistema); Gesty es el segundo empleado.
const EMPLEADOS = {
  posty: {
    id: 'posty', nombre: 'Posty', color: '#2793C8', avatar: 'posty',
    packs_que_lo_habilitan: [], // Posty es la app misma; no lo gobierna este registro
    tipos_de_tarjeta: [], // las tarjetas de Posty viven en su propio sistema
  },
  gesty: {
    id: 'gesty', nombre: 'Gesty', color: '#A175CA', avatar: 'gesty',
    packs_que_lo_habilitan: ['esencial', 'completa', 'total'],
    tipos_de_tarjeta: MATRIX_TIPOS.slice(),
  },
};

// Gating por pack (G-02 §2.2). `ninguno` = módulo apagado (default).
const PACKS = ['ninguno', 'esencial', 'completa', 'total'];
const CAPACIDADES = {
  ninguno: [],
  esencial: ['facturacion', 'cobranzas', 'comprobantes'],
  completa: ['facturacion', 'cobranzas', 'comprobantes',
    'presupuestos', 'proveedores', 'agenda', 'stock', 'reportes', 'rutinas', 'whatsapp'],
  total: ['facturacion', 'cobranzas', 'comprobantes',
    'presupuestos', 'proveedores', 'agenda', 'stock', 'reportes', 'rutinas', 'whatsapp',
    'reportes-avanzados', 'multi-sucursal', 'equipo-roles', 'llamadas'],
};

// Procedencia (G-02 §3.1): todo dato del fundamento nace con origen y
// origen_ref válidos; sin procedencia el dato no puede existir.
const ORIGENES = ['dueno', 'pregunta-unica', 'comprobante', 'conexion', 'rubro', 'inferido'];
const ORIGEN_LEGIBLE = {
  dueno: 'lo dijiste vos',
  'pregunta-unica': 'lo respondiste en una pregunta de Gesty',
  comprobante: 'salió de un comprobante',
  conexion: 'lo leyó de tu sistema conectado',
  rubro: 'viene de la ficha de tu rubro (a confirmar)',
  inferido: 'lo dedujo Gesty de tus datos (a confirmar)',
};

// Vista «Lo que Gesty aprendió de tu negocio» (G-02 §3.4): los grupos
// como piensa el dueño.
const GRUPO_LEGIBLE = {
  'datos-fiscales': 'Tus datos fiscales',
  'calendario-fiscal': 'Tus vencimientos',
  'reglas-cobro': 'Cómo cobrás',
  'clientes-facturacion': 'Tus clientes de facturación',
  proveedores: 'Tus proveedores',
  'stock-ref': 'Tu stock',
  'cuentas-medios': 'Tus cuentas y medios',
  'equipo-permisos': 'Quién puede gastar',
  'reglas-dueno': 'Tus reglas',
  contador: 'Tu contador',
};

// Un campo cuyo nombre huele a credencial jamás guarda el secreto: solo
// la referencia al almacenamiento seguro del servidor ({ ref: '…' }).
const CAMPO_CREDENCIAL = /(credencial|certificado|clave|token|password|secreto|api[_-]?key)/i;
// Claves que nunca entran al payload de un evento (build-spec §6/§8).
const CLAVE_SECRETA = /(token|secret|password|passwd|clave|credencial|certificado|api[_-]?key)/i;

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function esCampoCredencial(campo) { return CAMPO_CREDENCIAL.test(String(campo || '')); }

// 'YYYY-MM-DD' (solo fecha) vence al FINAL de ese día; con hora, manda
// la hora. Los timestamps del sistema son UTC (datetime('now')).
function parseVence(vence) {
  const s = String(vence || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T23:59:59.999Z');
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  db.exec(`
  CREATE TABLE IF NOT EXISTS employee_modules (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    packs TEXT NOT NULL DEFAULT '[]',
    tipos_tarjeta TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS gesty_subscriptions (
    user_id INTEGER PRIMARY KEY,
    pack TEXT NOT NULL DEFAULT 'ninguno',
    origen TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS gesty_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL DEFAULT 'sistema',
    entidad_tipo TEXT NOT NULL DEFAULT '',
    entidad_id TEXT NOT NULL DEFAULT '',
    tipo_evento TEXT NOT NULL,
    resumen TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '',
    comprobante_externo TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_events_user ON gesty_events(user_id, id);
  CREATE TABLE IF NOT EXISTS gesty_foundation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    grupo TEXT NOT NULL DEFAULT '',
    campo TEXT NOT NULL DEFAULT '',
    valor TEXT NOT NULL DEFAULT '',
    origen TEXT NOT NULL,
    origen_ref TEXT NOT NULL,
    cargado_por TEXT NOT NULL DEFAULT 'gesty',
    confirmado_por_dueno INTEGER NOT NULL DEFAULT 0,
    sensible INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, grupo, campo)
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_foundation_user ON gesty_foundation(user_id, grupo);
  CREATE TABLE IF NOT EXISTS gesty_foundation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dato_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    valor_anterior TEXT NOT NULL DEFAULT '',
    valor_nuevo TEXT NOT NULL DEFAULT '',
    actor TEXT NOT NULL DEFAULT 'dueno',
    ts TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_foundation_hist ON gesty_foundation_history(dato_id, id);
  CREATE TABLE IF NOT EXISTS gesty_foundation_meta (
    user_id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS gesty_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    empleado TEXT NOT NULL DEFAULT 'gesty',
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '{}',
    monto REAL,
    moneda TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'esperando',
    motivo TEXT NOT NULL DEFAULT '',
    version_documento INTEGER NOT NULL DEFAULT 1,
    fundamento_version INTEGER NOT NULL DEFAULT 0,
    usa_datos TEXT NOT NULL DEFAULT '[]',
    actualizada INTEGER NOT NULL DEFAULT 0,
    vence TEXT NOT NULL DEFAULT '',
    creado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_cards_user ON gesty_cards(user_id, estado, id);
  CREATE TABLE IF NOT EXISTS gesty_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tarjeta_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT '',
    version_documento INTEGER NOT NULL,
    fundamento_version INTEGER NOT NULL DEFAULT 0,
    usuario TEXT NOT NULL DEFAULT '',
    accion TEXT NOT NULL DEFAULT 'aprobar',
    resultado TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT '',
    ts TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_approvals_card ON gesty_approvals(tarjeta_id, id);
  `);
  // Append-only DURO: ni UPDATE ni DELETE sobre el registro de eventos.
  // (Índice único parcial: una aprobación EJECUTADA por (tarjeta, versión)
  // no puede duplicarse; los intentos fallidos quedan registrados y el
  // reintento sobre la misma tarjeta es posible — R5 + R6.)
  try { db.exec(`CREATE TRIGGER IF NOT EXISTS gesty_events_no_update BEFORE UPDATE ON gesty_events BEGIN SELECT RAISE(ABORT, 'gesty_events: registro append-only'); END;`); } catch (e) { /* ya existe */ }
  try { db.exec(`CREATE TRIGGER IF NOT EXISTS gesty_events_no_delete BEFORE DELETE ON gesty_events BEGIN SELECT RAISE(ABORT, 'gesty_events: registro append-only'); END;`); } catch (e) { /* ya existe */ }
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_approvals_ejecutada ON gesty_approvals(tarjeta_id, version_documento, accion) WHERE resultado = 'ejecutada';`); } catch (e) { /* ya existe */ }
  _esquemas.add(db);
}

function initGesty(db) {
  ensureSchema(db);
  const ins = db.prepare(`INSERT OR IGNORE INTO employee_modules (id, nombre, color, avatar, packs, tipos_tarjeta) VALUES (?,?,?,?,?,?)`);
  for (const e of Object.values(EMPLEADOS)) {
    ins.run(e.id, e.nombre, e.color, e.avatar, JSON.stringify(e.packs_que_lo_habilitan), JSON.stringify(e.tipos_de_tarjeta));
  }
}

function listEmpleados(db) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM employee_modules ORDER BY id').all().map((r) => ({
    id: r.id, nombre: r.nombre, color: r.color, avatar: r.avatar,
    packs_que_lo_habilitan: JSON.parse(r.packs || '[]'),
    tipos_de_tarjeta: JSON.parse(r.tipos_tarjeta || '[]'),
  }));
}

// ---------------------------------------------------------------------------
// P0-2 · Registro durable de eventos (append-only)
// ---------------------------------------------------------------------------

function scrubPayload(v) {
  if (Array.isArray(v)) return v.map(scrubPayload);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = CLAVE_SECRETA.test(k) ? '[omitido]' : scrubPayload(val);
    }
    return out;
  }
  return v;
}

function recordEvent(db, userId, ev) {
  ensureSchema(db);
  const e = ev || {};
  const payload = e.payload === undefined || e.payload === null ? '' : JSON.stringify(scrubPayload(e.payload));
  const info = db.prepare(`INSERT INTO gesty_events (user_id, actor, entidad_tipo, entidad_id, tipo_evento, resumen, payload, comprobante_externo)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(userId, String(e.actor || 'sistema'), String(e.entidad_tipo || ''), String(e.entidad_id || ''),
      String(e.tipo_evento || ''), String(e.resumen || ''), payload, String(e.comprobante_externo || ''));
  return Number(info.lastInsertRowid);
}

function parseEventRow(r) {
  let payload = null;
  try { payload = r.payload ? JSON.parse(r.payload) : null; } catch (e) { payload = null; }
  return { ...r, payload };
}

// La historia de la cuenta (o de una entidad) se lee SOLO de acá, en
// orden (G-02 §5.4). Separación por cuenta: el user_id manda siempre.
function listEvents(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const lim = Math.min(Math.max(Number(o.limit) || 500, 1), 5000);
  let rows;
  if (o.entidad_tipo) {
    rows = db.prepare('SELECT * FROM gesty_events WHERE user_id = ? AND entidad_tipo = ? AND entidad_id = ? ORDER BY id ASC LIMIT ?')
      .all(userId, String(o.entidad_tipo), String(o.entidad_id || ''), lim);
  } else {
    rows = db.prepare('SELECT * FROM gesty_events WHERE user_id = ? ORDER BY id ASC LIMIT ?').all(userId, lim);
  }
  return rows.map(parseEventRow);
}

// ---------------------------------------------------------------------------
// P0-1 · Gating por pack (el interruptor vive en el servidor)
// ---------------------------------------------------------------------------

function packOf(db, userId) {
  ensureSchema(db);
  const r = db.prepare('SELECT pack FROM gesty_subscriptions WHERE user_id = ?').get(userId);
  const pack = r && r.pack ? String(r.pack) : 'ninguno';
  return PACKS.includes(pack) ? pack : 'ninguno';
}

// El «flag» de la cuenta: Gesty existe para esta cuenta solo si tiene pack.
function gestyEnabled(db, userId) { return packOf(db, userId) !== 'ninguno'; }

function capacidadesOf(pack) { return (CAPACIDADES[pack] || []).slice(); }
function hasCapacidad(db, userId, capacidad) {
  return capacidadesOf(packOf(db, userId)).includes(String(capacidad || ''));
}

// Cambio de pack = hecho de gobierno: queda en el registro (§5.3).
// Lo aplica el admin/checkout (el plan gratis de familia entra con
// origen 'admin-familia', sin checkout — build-spec §2).
function setPack(db, userId, pack, opts) {
  ensureSchema(db);
  const o = opts || {};
  const nuevo = String(pack || 'ninguno');
  if (!PACKS.includes(nuevo)) fail(`Pack Gesty inválido: ${nuevo}`);
  const anterior = packOf(db, userId);
  db.prepare(`INSERT INTO gesty_subscriptions (user_id, pack, origen, updated_at) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET pack = excluded.pack, origen = excluded.origen, updated_at = datetime('now')`)
    .run(userId, nuevo, String(o.origen || ''));
  if (anterior !== nuevo) {
    recordEvent(db, userId, {
      actor: o.actor || 'sistema', entidad_tipo: 'cuenta', entidad_id: String(userId),
      tipo_evento: 'pack-cambiado', resumen: `Pack de Gesty: ${anterior} → ${nuevo}`,
      payload: { anterior, nuevo, origen: String(o.origen || '') },
    });
  }
  return { pack: nuevo, anterior };
}

// Middleware del módulo: sin pack no hay API de Gesty (403, G-02 §2).
// requireAuth va antes en la cadena (401 sin sesión, como toda la app).
function gestyMiddleware(db) {
  return (req, res, next) => {
    const uid = req.session && req.session.userId;
    if (!uid) return res.status(401).json({ ok: false, error: 'No autenticado' });
    if (!gestyEnabled(db, uid)) {
      return res.status(403).json({ ok: false, error: 'gesty_no_habilitado', message: 'Gesty no está habilitado en esta cuenta.' });
    }
    next();
  };
}

// Middleware de capacidad fina por pack (G-02 §2.2: el gating se impone
// en el servidor; una pantalla oculta no es una barrera).
function capacidadMiddleware(db, capacidad) {
  return (req, res, next) => {
    const uid = req.session && req.session.userId;
    if (!uid) return res.status(401).json({ ok: false, error: 'No autenticado' });
    if (!hasCapacidad(db, uid, capacidad)) {
      return res.status(403).json({ ok: false, error: 'gesty_capacidad_no_incluida', message: `Tu pack de Gesty no incluye ${capacidad}.` });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// P0-3 · Fundamento compartido — vista Gesty con procedencia
// ---------------------------------------------------------------------------

function foundationVersion(db, userId) {
  ensureSchema(db);
  const r = db.prepare('SELECT version FROM gesty_foundation_meta WHERE user_id = ?').get(userId);
  return r ? Number(r.version) || 0 : 0;
}

function bumpFoundationVersion(db, userId) {
  db.prepare(`INSERT INTO gesty_foundation_meta (user_id, version, updated_at) VALUES (?, 1, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET version = version + 1, updated_at = datetime('now')`).run(userId);
  return foundationVersion(db, userId);
}

// Valida y normaliza el valor de un dato. Los campos credenciales SOLO
// aceptan la referencia al almacenamiento seguro ({ ref }); el secreto
// en sí jamás entra al fundamento (build-spec §3/§8).
function validarValorDato(grupo, campo, valor) {
  if (esCampoCredencial(campo)) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor) || !String(valor.ref || '').trim()) {
      fail(`El campo «${campo}» es una credencial: se guarda solo la referencia al almacenamiento seguro ({ ref }), nunca el secreto.`);
    }
    return { valor: { ref: String(valor.ref) }, sensible: 1 };
  }
  return { valor, sensible: 0 };
}

function parseDatoRow(db, r, conHistorial) {
  let valor = null;
  try { valor = r.valor ? JSON.parse(r.valor) : null; } catch (e) { valor = r.valor; }
  const dato = {
    id: r.id, grupo: r.grupo, campo: r.campo, valor,
    origen: r.origen, origen_ref: r.origen_ref, cargado_por: r.cargado_por,
    confirmado_por_dueno: r.confirmado_por_dueno === 1,
    sensible: r.sensible === 1,
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
  if (conHistorial) {
    dato.historial = db.prepare('SELECT valor_anterior, valor_nuevo, actor, ts FROM gesty_foundation_history WHERE dato_id = ? ORDER BY id ASC')
      .all(r.id).map((h) => ({
        valor_anterior: h.valor_anterior ? safeJson(h.valor_anterior) : null,
        valor_nuevo: h.valor_nuevo ? safeJson(h.valor_nuevo) : null,
        actor: h.actor, ts: h.ts,
      }));
  }
  return dato;
}
function safeJson(s) { try { return JSON.parse(s); } catch (e) { return s; } }

// Crea o actualiza un dato del fundamento. Reglas (G-02 §3):
// · origen válido + origen_ref obligatorio: sin procedencia no hay dato.
// · origen rubro/inferido nace NO confirmado.
// · Datos fiscales: Gesty propone, jamás sobrescribe — si el dato ya
//   existe, solo el dueño lo cambia (la corrección va por correctData).
function setData(db, userId, dato) {
  ensureSchema(db);
  const d = dato || {};
  const grupo = String(d.grupo || '').trim();
  const campo = String(d.campo || '').trim();
  if (!grupo || !campo) fail('Todo dato del fundamento lleva grupo y campo.');
  const origen = String(d.origen || '');
  if (!ORIGENES.includes(origen)) fail(`Origen inválido: ${origen || '(vacío)'}. Orígenes válidos: ${ORIGENES.join(', ')}`);
  const origenRef = String(d.origen_ref || '').trim();
  if (!origenRef) fail('Sin procedencia no hay dato: origen_ref es obligatorio.');
  const cargadoPor = String(d.cargado_por || 'gesty');
  const { valor, sensible } = validarValorDato(grupo, campo, d.valor === undefined ? null : d.valor);
  const valorJson = JSON.stringify(valor);

  const prev = db.prepare('SELECT * FROM gesty_foundation WHERE user_id = ? AND grupo = ? AND campo = ?').get(userId, grupo, campo);
  if (prev && grupo === 'datos-fiscales' && cargadoPor !== 'dueno') {
    fail('Dato fiscal protegido: Gesty puede proponer un cambio, pero jamás sobrescribe un dato fiscal. Lo corrige el dueño.');
  }
  let confirmado;
  if (d.confirmado !== undefined) confirmado = d.confirmado ? 1 : 0;
  else if (origen === 'dueno') confirmado = 1;
  else if (origen === 'rubro' || origen === 'inferido') confirmado = 0;
  else confirmado = prev ? prev.confirmado_por_dueno : 0;

  if (prev) {
    db.prepare(`UPDATE gesty_foundation SET valor = ?, origen = ?, origen_ref = ?, cargado_por = ?, confirmado_por_dueno = ?, sensible = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(valorJson, origen, origenRef, cargadoPor, confirmado, sensible, prev.id);
    db.prepare('INSERT INTO gesty_foundation_history (dato_id, user_id, valor_anterior, valor_nuevo, actor) VALUES (?,?,?,?,?)')
      .run(prev.id, userId, prev.valor, valorJson, cargadoPor);
    bumpFoundationVersion(db, userId);
    recordEvent(db, userId, {
      actor: cargadoPor === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'fundamento', entidad_id: String(prev.id),
      tipo_evento: 'dato-corregido', resumen: `Dato corregido: ${grupo} · ${campo}`,
      payload: sensible ? { grupo, campo, sensible: true } : { grupo, campo, anterior: safeJson(prev.valor), nuevo: valor },
    });
    return parseDatoRow(db, db.prepare('SELECT * FROM gesty_foundation WHERE id = ?').get(prev.id), true);
  }
  const info = db.prepare(`INSERT INTO gesty_foundation (user_id, grupo, campo, valor, origen, origen_ref, cargado_por, confirmado_por_dueno, sensible) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, grupo, campo, valorJson, origen, origenRef, cargadoPor, confirmado, sensible);
  const id = Number(info.lastInsertRowid);
  bumpFoundationVersion(db, userId);
  recordEvent(db, userId, {
    actor: cargadoPor === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'fundamento', entidad_id: String(id),
    tipo_evento: 'dato-creado', resumen: `Dato nuevo en el fundamento: ${grupo} · ${campo}`,
    payload: sensible ? { grupo, campo, sensible: true } : { grupo, campo, valor, origen },
  });
  return parseDatoRow(db, db.prepare('SELECT * FROM gesty_foundation WHERE id = ?').get(id), true);
}

function getData(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const rows = o.grupo
    ? db.prepare('SELECT * FROM gesty_foundation WHERE user_id = ? AND grupo = ? ORDER BY campo ASC').all(userId, String(o.grupo))
    : db.prepare('SELECT * FROM gesty_foundation WHERE user_id = ? ORDER BY grupo ASC, campo ASC').all(userId);
  return rows.map((r) => parseDatoRow(db, r, true));
}

// La vista que sale por API: los datos sensibles muestran ESTADO, nunca
// el valor ni la referencia (G-02 §3.3/§8).
function datoParaApi(dato) {
  if (dato.sensible) return { ...dato, valor: null, valor_estado: 'cargado' };
  return dato;
}

// Vista del dueño (fundamento completo con procedencia, por grupo).
function foundationForOwner(db, userId) {
  const datos = getData(db, userId).map(datoParaApi);
  const grupos = {};
  for (const d of datos) { (grupos[d.grupo] = grupos[d.grupo] || []).push(d); }
  return { version: foundationVersion(db, userId), grupos, datos };
}

// Vista «Lo que Gesty aprendió de tu negocio» (§3.4 / build-spec §13.3):
// lenguaje llano, agrupada como piensa el dueño, origen visible.
function learnedView(db, userId) {
  const datos = getData(db, userId);
  const grupos = {};
  for (const d of datos) {
    const etiqueta = GRUPO_LEGIBLE[d.grupo] || d.grupo;
    const item = {
      id: d.id, campo: d.campo,
      campo_legible: d.campo.replace(/_/g, ' '),
      valor: d.sensible ? null : d.valor,
      valor_estado: d.sensible ? 'cargado' : undefined,
      origen: d.origen,
      origen_legible: ORIGEN_LEGIBLE[d.origen] || d.origen,
      confirmado_por_dueno: d.confirmado_por_dueno,
      actualizado_en: d.actualizado_en,
    };
    (grupos[etiqueta] = grupos[etiqueta] || []).push(item);
  }
  return { version: foundationVersion(db, userId), grupos };
}

// LA corrección (única vía, §3.4): solo el dueño. Actualiza LA fila —
// las dos vistas y todo lo que se genere después leen el valor nuevo
// (propagación estructural, sin copias por vista). Lo ya ejecutado no
// se reescribe: el historial y el registro guardan la versión anterior.
// Si un borrador en la bandeja usa este dato, su tarjeta queda marcada
// «actualizada» y no se puede aprobar hasta regenerarla (regla §3.4/H4).
function correctData(db, userId, datoId, cambios) {
  ensureSchema(db);
  const c = cambios || {};
  if (String(c.actor || 'dueno') !== 'dueno') fail('Solo el dueño corrige el fundamento.');
  const row = db.prepare('SELECT * FROM gesty_foundation WHERE id = ?').get(Number(datoId));
  if (!row || row.user_id !== userId) fail('Ese dato no es de esta cuenta.');
  const { valor, sensible } = validarValorDato(row.grupo, row.campo, c.valor === undefined ? null : c.valor);
  const valorJson = JSON.stringify(valor);
  db.prepare(`UPDATE gesty_foundation SET valor = ?, cargado_por = 'dueno', confirmado_por_dueno = 1, sensible = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(valorJson, sensible, row.id);
  db.prepare('INSERT INTO gesty_foundation_history (dato_id, user_id, valor_anterior, valor_nuevo, actor) VALUES (?,?,?,?,?)')
    .run(row.id, userId, row.valor, valorJson, 'dueno');
  bumpFoundationVersion(db, userId);
  // Tarjetas pendientes que usan este dato → «actualizada».
  let marcadas = 0;
  const pendientes = db.prepare(`SELECT id, usa_datos FROM gesty_cards WHERE user_id = ? AND estado IN ('esperando','devuelta')`).all(userId);
  for (const t of pendientes) {
    let usa = [];
    try { usa = JSON.parse(t.usa_datos || '[]'); } catch (e) { usa = []; }
    if (Array.isArray(usa) && usa.map(Number).includes(row.id)) {
      db.prepare(`UPDATE gesty_cards SET actualizada = 1, updated_at = datetime('now') WHERE id = ?`).run(t.id);
      marcadas++;
    }
  }
  recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'fundamento', entidad_id: String(row.id),
    tipo_evento: 'dato-corregido', resumen: `El dueño corrigió: ${row.grupo} · ${row.campo}`,
    payload: sensible || row.sensible === 1
      ? { grupo: row.grupo, campo: row.campo, sensible: true, tarjetas_actualizadas: marcadas }
      : { grupo: row.grupo, campo: row.campo, anterior: safeJson(row.valor), nuevo: valor, tarjetas_actualizadas: marcadas },
  });
  return { dato: datoParaApi(parseDatoRow(db, db.prepare('SELECT * FROM gesty_foundation WHERE id = ?').get(row.id), true)), tarjetas_actualizadas: marcadas };
}

// ---------------------------------------------------------------------------
// P0-4 · Bandeja «Para tu OK» — la matriz forzada en el servidor
// ---------------------------------------------------------------------------

const EXECUTORES = {};
// Los builds de área (G-03…) registran su ejecutor por tipo. El ejecutor
// devuelve { ok:true, comprobante?, evento?, resumen? } o
// { ok:false, motivo } (o lanza). Sin ejecutor registrado (fundación),
// la aprobación queda registrada y sellada con ejecucion 'sin-motor':
// ningún efecto externo se finge (regla de verdad).
function registerExecutor(tipo, fn) {
  if (!MATRIX_TIPOS.includes(String(tipo))) fail(`Tipo fuera de la matriz: ${tipo}`);
  if (typeof fn !== 'function') fail('El ejecutor debe ser una función.');
  EXECUTORES[String(tipo)] = fn;
}

function parseCardRow(r) {
  if (!r) return null;
  let detalle = {};
  let usa = [];
  try { detalle = JSON.parse(r.detalle || '{}'); } catch (e) { detalle = {}; }
  try { usa = JSON.parse(r.usa_datos || '[]'); } catch (e) { usa = []; }
  return {
    id: r.id, empleado: r.empleado, tipo: r.tipo, titulo: r.titulo,
    detalle, monto: r.monto, moneda: r.moneda,
    estado: r.estado, motivo: r.motivo || '',
    version_documento: r.version_documento,
    fundamento_version: r.fundamento_version,
    usa_datos: usa, actualizada: r.actualizada === 1,
    vence: r.vence || '', creado_por: r.creado_por,
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

// Crear una tarjeta = preparar un borrador de una acción de la matriz.
// La crean los motores de Gesty (o el chat, que deriva: R2) — crearla
// NUNCA ejecuta la acción.
function createCard(db, userId, card) {
  ensureSchema(db);
  const c = card || {};
  const tipo = String(c.tipo || '');
  if (!MATRIX_TIPOS.includes(tipo)) fail(`Tipo de tarjeta fuera de la matriz: ${tipo || '(vacío)'}`);
  const info = db.prepare(`INSERT INTO gesty_cards (user_id, empleado, tipo, titulo, detalle, monto, moneda, vence, usa_datos, fundamento_version, creado_por)
    VALUES (?, 'gesty', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, tipo, String(c.titulo || ''), JSON.stringify(c.detalle || {}),
      c.monto === undefined || c.monto === null ? null : Number(c.monto),
      String(c.moneda || ''), String(c.vence || ''),
      JSON.stringify(Array.isArray(c.usa_datos) ? c.usa_datos.map(Number) : []),
      foundationVersion(db, userId), String(c.creado_por || 'gesty'));
  const id = Number(info.lastInsertRowid);
  recordEvent(db, userId, {
    actor: String(c.creado_por || 'gesty') === 'dueno' ? 'dueno' : 'gesty',
    entidad_tipo: 'tarjeta', entidad_id: String(id),
    tipo_evento: 'tarjeta-creada', resumen: `Para tu OK: ${String(c.titulo || tipo)}`,
    payload: { tipo, monto: c.monto === undefined ? null : Number(c.monto) },
  });
  return getCard(db, userId, id);
}

function getCard(db, userId, cardId) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_cards WHERE id = ? AND user_id = ?').get(Number(cardId), userId);
  return parseCardRow(r);
}

// Fila de la bandeja (R10): casos sensibles primero, después lo que
// vence hoy, después por hora de preparación.
function listCards(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const where = o.solo_pendientes === false ? '' : `AND estado IN ('esperando','devuelta')`;
  const rows = db.prepare(`SELECT * FROM gesty_cards WHERE user_id = ? ${where}
    ORDER BY CASE WHEN tipo = 'caso-sensible' THEN 0 ELSE 1 END,
             CASE WHEN vence != '' AND date(vence) <= date('now') THEN 0 ELSE 1 END,
             id ASC`).all(userId);
  return rows.map(parseCardRow);
}

function countPending(db, userId) {
  ensureSchema(db);
  const r = db.prepare(`SELECT COUNT(*) AS n FROM gesty_cards WHERE user_id = ? AND estado IN ('esperando','devuelta')`).get(userId);
  return r ? Number(r.n) || 0 : 0;
}

function logRechazo(db, userId, cardId, motivo, extra) {
  recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'tarjeta', entidad_id: String(cardId || ''),
    tipo_evento: 'aprobacion-rechazada', resumen: `Aprobación rechazada: ${motivo}`,
    payload: { motivo, ...(extra || {}) },
  });
}

// EL endpoint de aprobación (corazón de G-02, §4.2 R1–R10). Valida en
// el servidor: tarjeta propia, tipo en la matriz, estado accionable,
// versión vigente del documento, tarjeta no vencida ni desactualizada.
// Devuelve { ok } sin lanzar: el rechazo es un resultado esperado y
// SIEMPRE queda registrado (evento + fila en gesty_approvals cuando la
// tarjeta existe).
function approveCard(db, userId, cardId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const usuario = String(o.usuario || 'dueno');
  const id = Number(cardId);
  const row = db.prepare('SELECT * FROM gesty_cards WHERE id = ?').get(id);
  if (!row) {
    logRechazo(db, userId, id, 'tarjeta-inexistente');
    return { ok: false, error: 'La tarjeta no existe.', motivo: 'tarjeta-inexistente' };
  }
  if (row.user_id !== userId) {
    logRechazo(db, userId, id, 'tarjeta-ajena');
    return { ok: false, error: 'Esa tarjeta no es de esta cuenta.', motivo: 'tarjeta-ajena' };
  }
  const versionPedida = Number(o.version_documento);
  // R5 · Idempotencia: si esta (tarjeta, versión) ya se ejecutó, el
  // reintento devuelve el resultado registrado SIN ejecutar de nuevo.
  const yaEjecutada = db.prepare(`SELECT * FROM gesty_approvals WHERE tarjeta_id = ? AND version_documento = ? AND accion = 'aprobar' AND resultado = 'ejecutada' ORDER BY id DESC LIMIT 1`)
    .get(id, versionPedida);
  if (yaEjecutada) {
    return { ok: true, idempotente: true, approval: yaEjecutada, card: getCard(db, userId, id) };
  }
  const rechazar = (motivo, error) => {
    db.prepare(`INSERT INTO gesty_approvals (user_id, tarjeta_id, tipo, version_documento, fundamento_version, usuario, accion, resultado, motivo) VALUES (?,?,?,?,?,?, 'aprobar', 'rechazada', ?)`)
      .run(userId, id, row.tipo, versionPedida || row.version_documento, row.fundamento_version, usuario, motivo);
    logRechazo(db, userId, id, motivo, { tipo: row.tipo });
    return { ok: false, error, motivo };
  };
  if (!MATRIX_TIPOS.includes(row.tipo)) return rechazar('fuera-de-matriz', 'Esa acción no está en la matriz de aprobación.');
  if (row.estado !== 'esperando' && row.estado !== 'devuelta') return rechazar('no-esperando', 'La tarjeta ya no está esperando tu OK.');
  if (!Number.isInteger(versionPedida) || versionPedida !== row.version_documento) {
    return rechazar('version-vieja', 'El documento cambió desde que se preparó: revisá la versión nueva antes de aprobar.');
  }
  if (row.actualizada === 1) {
    return rechazar('tarjeta-actualizada', 'El fundamento cambió debajo de este borrador: hay que regenerarlo antes de aprobar.');
  }
  const venceMs = parseVence(row.vence);
  if (venceMs !== null && venceMs <= Date.now()) {
    return rechazar('tarjeta-vencida', 'La tarjeta venció esperando: se regenera o se frena, no se aprueba.');
  }

  // Ejecución: un solo acto (R4) — este camino es EL acto, venga de la
  // pantalla que venga. El ejecutor es del build de área; sin motor,
  // la aprobación se sella como registrada, sin fingir efectos.
  let resultado;
  const ejecutor = EXECUTORES[row.tipo];
  if (!ejecutor) {
    resultado = { ok: true, sin_motor: true };
  } else {
    try { resultado = ejecutor(db, userId, parseCardRow(row)) || { ok: true }; }
    catch (e) { resultado = { ok: false, motivo: e.message || 'La ejecución falló.' }; }
  }

  if (!resultado.ok) {
    // R6 · Fallo = la tarjeta vuelve, con el motivo en una línea.
    const motivo = String(resultado.motivo || 'La ejecución falló.');
    db.prepare(`UPDATE gesty_cards SET estado = 'devuelta', motivo = ?, updated_at = datetime('now') WHERE id = ?`).run(motivo, id);
    db.prepare(`INSERT INTO gesty_approvals (user_id, tarjeta_id, tipo, version_documento, fundamento_version, usuario, accion, resultado, motivo) VALUES (?,?,?,?,?,?, 'aprobar', 'fallida', ?)`)
      .run(userId, id, row.tipo, row.version_documento, row.fundamento_version, usuario, motivo);
    recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'tarjeta', entidad_id: String(id),
      tipo_evento: 'tarjeta-devuelta', resumen: `No salió: ${motivo}`,
      payload: { tipo: row.tipo, motivo },
    });
    return { ok: false, devuelta: true, error: motivo, motivo, card: getCard(db, userId, id) };
  }

  db.prepare(`UPDATE gesty_cards SET estado = 'aprobada', motivo = '', updated_at = datetime('now') WHERE id = ?`).run(id);
  const info = db.prepare(`INSERT INTO gesty_approvals (user_id, tarjeta_id, tipo, version_documento, fundamento_version, usuario, accion, resultado, motivo) VALUES (?,?,?,?,?,?, 'aprobar', 'ejecutada', '')`)
    .run(userId, id, row.tipo, row.version_documento, row.fundamento_version, usuario);
  recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'tarjeta', entidad_id: String(id),
    tipo_evento: 'tarjeta-aprobada', resumen: `Aprobada: ${row.titulo || row.tipo}`,
    payload: { tipo: row.tipo, version_documento: row.version_documento, fundamento_version: row.fundamento_version, ejecucion: resultado.sin_motor ? 'sin-motor-g02' : 'motor-de-area' },
    comprobante_externo: resultado.comprobante || '',
  });
  if (resultado.evento) {
    recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: resultado.entidad_tipo || 'tarjeta', entidad_id: String(resultado.entidad_id || id),
      tipo_evento: String(resultado.evento), resumen: String(resultado.resumen || ''),
      payload: resultado.payload || {}, comprobante_externo: resultado.comprobante || '',
    });
  }
  const approval = db.prepare('SELECT * FROM gesty_approvals WHERE id = ?').get(Number(info.lastInsertRowid));
  return { ok: true, approval, card: getCard(db, userId, id) };
}

// R7 · Editar NO aprueba: regenera el borrador, sube la versión del
// documento, limpia la marca «actualizada» y la tarjeta sigue esperando.
function editCard(db, userId, cardId, cambios) {
  ensureSchema(db);
  const c = cambios || {};
  const row = db.prepare('SELECT * FROM gesty_cards WHERE id = ?').get(Number(cardId));
  if (!row || row.user_id !== userId) fail('Esa tarjeta no es de esta cuenta.');
  if (row.estado !== 'esperando' && row.estado !== 'devuelta') fail('La tarjeta ya no está esperando tu OK.');
  const versionAnterior = row.version_documento;
  db.prepare(`UPDATE gesty_cards SET detalle = ?, titulo = ?, monto = ?, estado = 'esperando', motivo = '', actualizada = 0, version_documento = version_documento + 1, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(c.detalle === undefined ? safeJson(row.detalle) : c.detalle),
      c.titulo === undefined ? row.titulo : String(c.titulo),
      c.monto === undefined ? row.monto : (c.monto === null ? null : Number(c.monto)),
      row.id);
  recordEvent(db, userId, {
    actor: String(c.actor || 'dueno') === 'gesty' ? 'gesty' : 'dueno',
    entidad_tipo: 'tarjeta', entidad_id: String(row.id),
    tipo_evento: 'tarjeta-editada', resumen: `Borrador regenerado: ${row.titulo || row.tipo}`,
    payload: { tipo: row.tipo, version_anterior: versionAnterior, version_nueva: versionAnterior + 1 },
  });
  return getCard(db, userId, row.id);
}

// R7 · Frenar: pausa la gestión. El borrador queda en su área, la
// tarjeta sale de la fila y el freno queda registrado.
function stopCard(db, userId, cardId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const row = db.prepare('SELECT * FROM gesty_cards WHERE id = ?').get(Number(cardId));
  if (!row || row.user_id !== userId) fail('Esa tarjeta no es de esta cuenta.');
  if (row.estado !== 'esperando' && row.estado !== 'devuelta') fail('La tarjeta ya no está esperando tu OK.');
  db.prepare(`UPDATE gesty_cards SET estado = 'frenada', updated_at = datetime('now') WHERE id = ?`).run(row.id);
  db.prepare(`INSERT INTO gesty_approvals (user_id, tarjeta_id, tipo, version_documento, fundamento_version, usuario, accion, resultado, motivo) VALUES (?,?,?,?,?,?, 'frenar', 'registrada', ?)`)
    .run(userId, row.id, row.tipo, row.version_documento, row.fundamento_version, String(o.usuario || 'dueno'), String(o.motivo || ''));
  recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'tarjeta', entidad_id: String(row.id),
    tipo_evento: 'tarjeta-frenada', resumen: `Frenada: ${row.titulo || row.tipo}`,
    payload: { tipo: row.tipo, motivo: String(o.motivo || '') },
  });
  return getCard(db, userId, row.id);
}

module.exports = {
  // constantes
  EMPLEADOS, PACKS, CAPACIDADES, MATRIX_TIPOS, ORIGENES, GRUPO_LEGIBLE, ORIGEN_LEGIBLE,
  // esquema / registro de empleados
  ensureSchema, initGesty, listEmpleados,
  // registro durable
  recordEvent, listEvents,
  // gating
  packOf, gestyEnabled, setPack, capacidadesOf, hasCapacidad,
  gestyMiddleware, capacidadMiddleware,
  // fundamento
  foundationVersion, setData, getData, correctData,
  foundationForOwner, learnedView, datoParaApi,
  // bandeja / matriz
  registerExecutor, createCard, getCard, listCards, countPending,
  approveCard, editCard, stopCard,
};
