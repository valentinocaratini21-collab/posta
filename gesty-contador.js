// =====================================================================
// GESTY · G-15 — CONTADOR ALIADO (la carpeta de G-06, entregada)
// Spec: gesty-cola-builds.md G-15 · gesty-build-spec.md §13.1 ·
// gesty-areas-detalle.md §7/§8 (el paquete del contador se arma
// solo; a terceros no se envía nada por cuenta de Gesty: va cuando
// el dueño lo aprueba) · gesty-g02-build-spec.md §3 (el contador
// vive en el fundamento: nombre/contacto · email · formato y canal
// en que quiere la carpeta) · gesty-experiencia-cliente.md §5 (la
// vara: el primer cierre que el contador aprueba sin pedir nada
// que Gesty ya tenga).
//
// POR QUÉ UN MÓDULO NUEVO Y NO UNA EXTENSIÓN DE gesty-reportes.js:
// Reportes (G-06) tiene una doctrina explícita — «solo lee, no
// genera tarjetas ni aprueba nada» — y su carpeta es la FUENTE.
// El Contador Aliado es el ciclo de ENTREGA sobre esa fuente:
// perfil del contador, paquete durable y versionado, sello del
// dueño, envío, entrega manual y pedidos de vuelta. Vive acá,
// consume carpetaDelMes/carpetaCSV/getCierre de Reportes y no
// duplica ni un número: todo total del paquete ES el del cierre.
//
// EL SELLO (la matriz y este envío): la matriz de la bandeja es
// una lista CERRADA de 10 tipos (spec G-02 §4.2 unificada, con
// test que la cuenta) y ninguno es «enviar el paquete al
// contador»; agregar un tipo 11 sería cambiar la fundación, no
// este build. El envío se gobierna entonces con la MISMA
// disciplina que la matriz impone en el servidor, acá adentro:
// · el paquete es un documento CONGELADO y versionado (contenido
//   + destinatario quedan en la fila: lo que se aprueba es
//   exactamente lo que sale);
// · aprobar es un acto solo del dueño, contra la versión vigente
//   (versión vieja → rechazo registrado, como la R de la matriz),
//   idempotente, y queda en gesty_contador_aprobaciones + el
//   registro durable;
// · enviarPaquete es LA ÚNICA vía de salida y exige el sello de
//   la versión exacta; sin sello no sale y el rechazo queda en
//   el registro (evento envio-contador-rechazado-sin-ok);
// · si el email del contador cambió después del OK, el envío se
//   frena: el sello era para OTRO destinatario (hay que rearmar
//   y volver a aprobar).
//
// REGLAS DE VERDAD DEL MÓDULO:
// · El formato preferido sale del fundamento (grupo contador). Si
//   el contador todavía no lo definió, el paquete sale con el
//   formato genérico de la casa Y LO DECLARA (formato_origen
//   «generico-sin-definir» + declaración en el contenido) — jamás
//   se afirma que salió «como el contador lo quiere».
// · Un envío fallido se registra como fallido y el paquete sigue
//   aprobado: nada queda «enviado» a medias.
// · La entrega manual (el dueño descarga/comparte el paquete)
//   queda registrada igual que la de email, con su medio.
// · Los pedidos del contador (devoluciones: «me falta el papel
//   X») son faltantes de PRIMERA CLASE: entran en los faltantes
//   del paquete con la misma forma tipada que los del cierre, y
//   salen de la lista cuando el papel llega y se vincula.
//
// ACOPLE TIPADO PARA G-18 (detector de huecos): el detector no
// tiene que raspar textos. faltantesParaDetector(db, userId,
// periodo) devuelve la lista unificada y tipada de huecos del
// período — { tipo: 'cierre' | 'pedido-contador', clave,
// dato_que_falta, detalle, ids?, pedido_id?, cierre_id } — desde
// el cierre durable y los pedidos abiertos. G-18 consume ESA
// forma; los pedidos del contador ya nacen en ella.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const reportes = require('./gesty-reportes');
const comprobantes = require('./gesty-comprobantes');

// ---------------------------------------------------------------------------
// Utilidades (los patrones de la casa)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function fmtMonto(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function monedaKey(m) { return normTexto(m).toUpperCase() || 'SIN-MONEDA'; }
function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }
function escHtml(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// El canal de email de la app, inyectado por server.js (el mismo
// patrón que Facturación/Cobranzas/Presupuestos: configure).
const _cfg = { sendEmail: null };
function configure(opts) {
  const o = opts || {};
  if (o.sendEmail !== undefined) _cfg.sendEmail = typeof o.sendEmail === 'function' ? o.sendEmail : null;
}

// Los formatos de carpeta que un contador puede preferir. Todos
// ordenan EL MISMO índice de la carpeta de G-06 (ningún formato
// agrega ni quita un papel): cambia el orden y la agrupación,
// con subtotales por grupo calculados sobre los papeles vivos
// (los duplicados se listan marcados y no suman, como en G-06).
const FORMATOS_CARPETA = ['generico', 'por-tipo', 'por-clasificacion', 'por-contraparte'];
const CANALES = ['email', 'manual'];

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  reportes.ensureSchema(db);
  comprobantes.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_paquetes_contador (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    periodo TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    cierre_id INTEGER,
    formato TEXT NOT NULL DEFAULT 'generico',
    formato_origen TEXT NOT NULL DEFAULT 'generico-sin-definir',
    destinatario_nombre TEXT NOT NULL DEFAULT '',
    destinatario_email TEXT NOT NULL DEFAULT '',
    contenido TEXT NOT NULL DEFAULT '{}',
    totales TEXT NOT NULL DEFAULT '{}',
    faltantes TEXT NOT NULL DEFAULT '[]',
    estado TEXT NOT NULL DEFAULT 'preparado',
    creado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_paquetes_contador_user ON gesty_paquetes_contador(user_id, periodo, version);
  CREATE TABLE IF NOT EXISTS gesty_contador_aprobaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    paquete_id INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    usuario TEXT NOT NULL DEFAULT 'dueno',
    accion TEXT NOT NULL DEFAULT 'aprobar',
    resultado TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_contador_aprob_user ON gesty_contador_aprobaciones(user_id, paquete_id);
  CREATE TABLE IF NOT EXISTS gesty_contador_envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    paquete_id INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    canal TEXT NOT NULL DEFAULT 'email',
    destinatario TEXT NOT NULL DEFAULT '',
    resultado TEXT NOT NULL DEFAULT '',
    comprobante TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_contador_envios_user ON gesty_contador_envios(user_id, paquete_id);
  CREATE TABLE IF NOT EXISTS gesty_pedidos_contador (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    periodo TEXT NOT NULL DEFAULT '',
    paquete_id INTEGER,
    texto TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'abierto',
    resuelto_con_comprobante_id INTEGER,
    resuelto_nota TEXT NOT NULL DEFAULT '',
    creado_por TEXT NOT NULL DEFAULT 'contador',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resuelto_en TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_pedidos_contador_user ON gesty_pedidos_contador(user_id, periodo, estado);
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// EL CONTADOR EN EL FUNDAMENTO (grupo «contador»)
// Se aprende UNA vez (nombre, email, formato, día, canal) y rige
// todos los meses. Cada campo guarda su procedencia (el dato del
// fundamento completo), y leer el perfil declara lo que falta.
// ---------------------------------------------------------------------------

function datosContador(db, userId) {
  const datos = gesty.getData(db, userId, { grupo: 'contador' });
  const porCampo = {};
  for (const d of datos) porCampo[d.campo] = d;
  return porCampo;
}

function getContador(db, userId) {
  ensureSchema(db);
  const porCampo = datosContador(db, userId);
  const valorDe = (campo) => (porCampo[campo] ? porCampo[campo].valor : null);
  const email = normTexto(valorDe('email') || '');
  const formatoDato = normTexto(valorDe('formato_carpeta') || '');
  // Un formato guardado que no es de la lista (carga vieja o
  // edición directa del fundamento) no manda: se declara sin
  // definir y rige el genérico. 'generico' elegido a propósito
  // SÍ es un formato definido (es el que el contador pidió).
  const formatoDefinido = FORMATOS_CARPETA.includes(formatoDato) ? formatoDato : null;
  const dia = Number(valorDe('dia_entrega'));
  const fuente = {};
  for (const [campo, d] of Object.entries(porCampo)) {
    fuente[campo] = { dato_id: d.id, origen: d.origen, confirmado_por_dueno: d.confirmado_por_dueno };
  }
  return {
    definido: !!email,
    nombre: normTexto(valorDe('nombre') || ''),
    email,
    formato_carpeta: formatoDefinido,
    formato_efectivo: formatoDefinido || 'generico',
    formato_origen: formatoDefinido ? 'preferido' : 'generico-sin-definir',
    dia_entrega: Number.isInteger(dia) && dia >= 1 && dia <= 28 ? dia : null,
    canal: CANALES.includes(normTexto(valorDe('canal') || '')) ? normTexto(valorDe('canal')) : 'email',
    fuente,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function setContador(db, userId, datos, opts) {
  ensureSchema(db);
  const d = datos || {};
  const o = opts || {};
  const cambios = [];
  const poner = (campo, valor) => {
    gesty.setData(db, userId, {
      grupo: 'contador', campo, valor,
      origen: 'dueno', origen_ref: 'perfil-contador', cargado_por: 'dueno', confirmado: true,
    });
    cambios.push(campo);
  };
  if (d.nombre !== undefined) poner('nombre', normTexto(d.nombre));
  if (d.email !== undefined) {
    const email = normTexto(d.email);
    if (email && !EMAIL_RE.test(email)) fail(`Ese email no parece válido: ${email}.`);
    poner('email', email);
  }
  if (d.formato_carpeta !== undefined) {
    if (d.formato_carpeta === null || d.formato_carpeta === '') poner('formato_carpeta', null);
    else if (!FORMATOS_CARPETA.includes(String(d.formato_carpeta))) {
      fail(`Formato de carpeta inválido: ${d.formato_carpeta}. Válidos: ${FORMATOS_CARPETA.join(', ')}.`);
    } else poner('formato_carpeta', String(d.formato_carpeta));
  }
  if (d.dia_entrega !== undefined) {
    if (d.dia_entrega === null || d.dia_entrega === '') poner('dia_entrega', null);
    else {
      const dia = Number(d.dia_entrega);
      if (!Number.isInteger(dia) || dia < 1 || dia > 28) fail('El día habitual de entrega va del 1 al 28.');
      poner('dia_entrega', dia);
    }
  }
  if (d.canal !== undefined) {
    if (!CANALES.includes(String(d.canal))) fail(`Canal inválido: ${d.canal}. Válidos: ${CANALES.join(', ')}.`);
    poner('canal', String(d.canal));
  }
  if (!cambios.length) fail('No llegó ningún dato del contador para guardar.');
  if (o.registrar_evento !== false) {
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'contador', entidad_id: 'perfil',
      tipo_evento: 'contador-actualizado',
      resumen: `Datos del contador actualizados: ${cambios.join(', ')}`,
      payload: { campos: cambios },
    });
  }
  return getContador(db, userId);
}

// ---------------------------------------------------------------------------
// FORMATO: el índice de la carpeta, ordenado como el contador lo
// quiere. Ningún formato agrega ni quita papeles.
// ---------------------------------------------------------------------------

function montoDe(c) {
  const m = c.monto_total !== null && c.monto_total !== undefined ? c.monto_total : c.monto_neto;
  return m === null || m === undefined ? null : Number(m);
}
function porFechaId(a, b) {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  return a.id - b.id;
}
function subtotalesDe(items) {
  const totales = {};
  for (const c of items) {
    if (c.duplicado_de) continue;
    const m = montoDe(c);
    if (m === null) continue;
    const k = monedaKey(c.moneda);
    totales[k] = round2((totales[k] || 0) + m);
  }
  return totales;
}
function grupo(clave, titulo, items) {
  return {
    clave, titulo,
    cantidad: items.length,
    duplicados: items.filter((c) => c.duplicado_de).length,
    totales_por_moneda: subtotalesDe(items),
    ids: items.map((c) => c.id),
    items,
  };
}
function aplicarFormato(indice, formato) {
  const items = (indice || []).slice();
  if (formato === 'generico' || !FORMATOS_CARPETA.includes(formato)) {
    return { indice_ordenado: items.sort(porFechaId), grupos: [] };
  }
  const gruposMap = new Map();
  const claveDe = (c) => {
    if (formato === 'por-tipo') return { clave: `tipo:${c.tipo || 'sin-tipo'}`, titulo: `Tipo: ${c.tipo || 'sin tipo'}`, orden: 0 };
    if (formato === 'por-clasificacion') {
      const dir = c.direccion === 'emitida' ? 'emitida' : 'recibida';
      const clase = c.clasificacion || 'sin-clasificar';
      return { clave: `${dir}:${clase}`, titulo: `${dir === 'emitida' ? 'Emitidas' : 'Recibidas'} · ${clase}`, orden: dir === 'recibida' ? 0 : 1 };
    }
    // por-contraparte: quién emitió el papel si entró, a quién fue si salió
    const cp = c.direccion === 'emitida' ? c.receptor : c.emisor;
    const nombre = (cp && cp.nombre) || 'sin contraparte';
    const cuit = (cp && cp.cuit) || '';
    return { clave: `contraparte:${nombre}`, titulo: cuit ? `${nombre} (${cuit})` : nombre, orden: 0 };
  };
  for (const c of items) {
    const { clave, titulo, orden } = claveDe(c);
    if (!gruposMap.has(clave)) gruposMap.set(clave, { clave, titulo, orden, items: [] });
    gruposMap.get(clave).items.push(c);
  }
  const grupos = [...gruposMap.values()]
    .map((g) => {
      g.items.sort(porFechaId);
      return { ...grupo(g.clave, g.titulo, g.items), _orden: g.orden, _min: g.items.length ? g.items[0].fecha : '' };
    })
    .sort((a, b) => (a._orden - b._orden) || (a._min < b._min ? -1 : a._min > b._min ? 1 : 0) || (a.clave < b.clave ? -1 : 1))
    .map(({ _orden, _min, ...g }) => g);
  return { indice_ordenado: grupos.flatMap((g) => g.items), grupos };
}

// ---------------------------------------------------------------------------
// PEDIDOS DEL CONTADOR (las devoluciones: «me falta el papel X»)
// Nacen abiertos, viven en su tabla y se leen como faltantes
// tipados. Se resuelven cuando el papel llega y se vincula.
// ---------------------------------------------------------------------------

function parsePedidoRow(r) {
  if (!r) return null;
  return {
    id: r.id, periodo: r.periodo, paquete_id: r.paquete_id || null,
    texto: r.texto, estado: r.estado,
    resuelto_con_comprobante_id: r.resuelto_con_comprobante_id || null,
    resuelto_nota: r.resuelto_nota || '',
    creado_por: r.creado_por, creado_en: r.created_at, resuelto_en: r.resuelto_en || '',
  };
}

function registrarPedido(db, userId, datos, opts) {
  ensureSchema(db);
  const d = datos || {};
  const o = opts || {};
  const periodo = normTexto(d.periodo);
  reportes.rangoPeriodo(periodo); // valida AAAA-MM, en criollo
  const texto = normTexto(d.texto);
  if (!texto) fail('El pedido del contador necesita su texto: qué papel pide.');
  let paqueteId = null;
  if (d.paquete_id !== undefined && d.paquete_id !== null) {
    const p = getPaquete(db, userId, Number(d.paquete_id));
    if (!p) fail('Ese paquete no es de esta cuenta.');
    paqueteId = p.id;
  }
  const creadoPor = ['contador', 'dueno', 'gesty'].includes(String(o.creado_por || d.creado_por || '')) ? String(o.creado_por || d.creado_por) : 'contador';
  const info = db.prepare(`INSERT INTO gesty_pedidos_contador (user_id, periodo, paquete_id, texto, creado_por)
    VALUES (?,?,?,?,?)`).run(userId, periodo, paqueteId, texto, creadoPor);
  const id = Number(info.lastInsertRowid);
  gesty.recordEvent(db, userId, {
    actor: creadoPor, entidad_tipo: 'pedido-contador', entidad_id: String(id),
    tipo_evento: 'pedido-contador-registrado',
    resumen: `Tu contador pidió un papel para ${periodo}: «${texto}»`,
    payload: { periodo, paquete_id: paqueteId, texto },
  });
  return parsePedidoRow(db.prepare('SELECT * FROM gesty_pedidos_contador WHERE id = ?').get(id));
}

function listPedidos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const where = ['user_id = ?'];
  const args = [userId];
  if (o.periodo) { where.push('periodo = ?'); args.push(String(o.periodo)); }
  if (o.estado) { where.push('estado = ?'); args.push(String(o.estado)); }
  const rows = db.prepare(`SELECT * FROM gesty_pedidos_contador WHERE ${where.join(' AND ')} ORDER BY id ASC`).all(...args);
  return rows.map(parsePedidoRow);
}

function getPedido(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_pedidos_contador WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return parsePedidoRow(r);
}

function pedidosAbiertos(db, userId, periodo) {
  return listPedidos(db, userId, { periodo, estado: 'abierto' });
}

// El pedido como faltante, con LA MISMA forma tipada que los
// faltantes del cierre de G-06 ({clave, dato_que_falta, detalle})
// más su identidad: es la forma que consume G-18.
function faltanteDePedido(p) {
  return {
    clave: 'pedido-del-contador',
    dato_que_falta: p.texto,
    detalle: `Tu contador pidió: «${p.texto}» (período ${p.periodo}) y ese papel todavía no está en la carpeta.`,
    pedido_id: p.id,
    origen: 'contador',
  };
}

function resolverPedido(db, userId, pedidoId, datos, opts) {
  ensureSchema(db);
  const d = datos || {};
  const o = opts || {};
  const p = getPedido(db, userId, pedidoId);
  if (!p) fail('Ese pedido no es de esta cuenta.');
  if (p.estado !== 'abierto') fail(`Ese pedido ya está «${p.estado}»: no se resuelve dos veces.`);
  let comprobanteId = null;
  if (d.comprobante_id !== undefined && d.comprobante_id !== null) {
    const c = comprobantes.getComprobante(db, userId, Number(d.comprobante_id));
    if (!c) fail('Ese comprobante no es de esta cuenta: el pedido se resuelve con un papel propio.');
    comprobanteId = c.id;
  }
  const nota = normTexto(d.nota || '');
  if (!comprobanteId && !nota) fail('El pedido se resuelve con el papel que llegó (comprobante_id) o con una nota de qué pasó.');
  db.prepare(`UPDATE gesty_pedidos_contador SET estado = 'resuelto', resuelto_con_comprobante_id = ?, resuelto_nota = ?, resuelto_en = datetime('now') WHERE id = ?`)
    .run(comprobanteId, nota, p.id);
  gesty.recordEvent(db, userId, {
    actor: String(o.actor || 'dueno'), entidad_tipo: 'pedido-contador', entidad_id: String(p.id),
    tipo_evento: 'pedido-contador-resuelto',
    resumen: `Pedido del contador resuelto: «${p.texto}»${comprobanteId ? ` — llegó el comprobante #${comprobanteId}` : ` — ${nota}`}`,
    payload: { periodo: p.periodo, comprobante_id: comprobanteId },
    comprobante_externo: comprobanteId ? `comprobante:${comprobanteId}` : '',
  });
  return getPedido(db, userId, p.id);
}

function descartarPedido(db, userId, pedidoId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const p = getPedido(db, userId, pedidoId);
  if (!p) fail('Ese pedido no es de esta cuenta.');
  if (p.estado !== 'abierto') fail(`Ese pedido ya está «${p.estado}».`);
  const nota = normTexto(d.nota || '');
  db.prepare(`UPDATE gesty_pedidos_contador SET estado = 'descartado', resuelto_nota = ?, resuelto_en = datetime('now') WHERE id = ?`)
    .run(nota, p.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'pedido-contador', entidad_id: String(p.id),
    tipo_evento: 'pedido-contador-descartado',
    resumen: `Pedido del contador descartado: «${p.texto}»${nota ? ` — ${nota}` : ''}`,
    payload: { periodo: p.periodo },
  });
  return getPedido(db, userId, p.id);
}

// ---------------------------------------------------------------------------
// EL PAQUETE: la carpeta del mes como entrega durable y
// versionada. Armarlo NO lo envía: lo deja listo para el OK.
// ---------------------------------------------------------------------------

function parsePaqueteRow(r) {
  if (!r) return null;
  return {
    id: r.id, periodo: r.periodo, version: r.version,
    cierre_id: r.cierre_id || null,
    formato: r.formato, formato_origen: r.formato_origen,
    destinatario: { nombre: r.destinatario_nombre || '', email: r.destinatario_email || '' },
    contenido: safeJson(r.contenido, {}),
    totales: safeJson(r.totales, {}),
    faltantes: safeJson(r.faltantes, []),
    estado: r.estado, creado_por: r.creado_por,
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function getPaquete(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_paquetes_contador WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return parsePaqueteRow(r);
}

function listPaquetes(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const rows = o.periodo
    ? db.prepare('SELECT * FROM gesty_paquetes_contador WHERE user_id = ? AND periodo = ? ORDER BY version DESC').all(userId, String(o.periodo))
    : db.prepare('SELECT * FROM gesty_paquetes_contador WHERE user_id = ? ORDER BY periodo DESC, version DESC').all(userId);
  return rows.map(parsePaqueteRow);
}

function ultimoPaquete(db, userId, periodo) {
  const lista = listPaquetes(db, userId, periodo ? { periodo } : {});
  return lista.length ? lista[0] : null;
}

function armarPaquete(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const periodo = normTexto(o.periodo) || hoyISO().slice(0, 7);
  reportes.rangoPeriodo(periodo); // valida el formato, en criollo
  const perfil = getContador(db, userId);
  const formato = perfil.formato_efectivo;

  // La fuente: la carpeta de G-06 (genera el cierre si el período
  // todavía no tiene uno — durable, con su propio evento).
  const carpeta = reportes.carpetaDelMes(db, userId, periodo, { generado_por: 'gesty-contador' });
  const { indice_ordenado, grupos } = aplicarFormato(carpeta.indice_comprobantes, formato);

  // Faltantes del paquete = los del cierre + los pedidos abiertos
  // del contador (primera clase, misma forma tipada) + lo que la
  // entrega misma no puede saber sin el contador cargado.
  const faltantes = (carpeta.cierre.faltantes || []).slice();
  for (const p of pedidosAbiertos(db, userId, periodo)) faltantes.push(faltanteDePedido(p));
  const declaraciones = [];
  if (perfil.formato_origen === 'generico-sin-definir') {
    declaraciones.push('El paquete salió con el formato genérico de la casa (índice por fecha): tu contador todavía no definió su formato preferido en el fundamento.');
  }
  if (!perfil.definido) {
    faltantes.push({
      clave: 'contador-sin-definir',
      dato_que_falta: 'el email de tu contador (fundamento → Tu contador)',
      detalle: 'El fundamento no tiene cargado el email de un contador: el paquete se arma igual, pero no hay a quién enviárselo hasta cargarlo.',
    });
  }

  // Versión nueva del período: las versiones anteriores que no
  // salieron quedan superadas (la historia no se reescribe: una
  // versión enviada o entregada queda como está, para siempre).
  const prev = db.prepare('SELECT MAX(version) AS v FROM gesty_paquetes_contador WHERE user_id = ? AND periodo = ?').get(userId, periodo);
  const version = (prev && prev.v ? Number(prev.v) : 0) + 1;
  db.prepare(`UPDATE gesty_paquetes_contador SET estado = 'superado', updated_at = datetime('now')
    WHERE user_id = ? AND periodo = ? AND estado IN ('preparado','aprobado','frenado')`).run(userId, periodo);

  const contenido = {
    periodo,
    generado_en: new Date().toISOString(),
    formato,
    formato_origen: perfil.formato_origen,
    declaraciones,
    destinatario: { nombre: perfil.nombre, email: perfil.email },
    cierre_id: carpeta.cierre.id,
    cierre: {
      totales: carpeta.cierre.totales,
      desglose: carpeta.cierre.desglose,
    },
    indice: indice_ordenado,
    grupos: grupos.map(({ items, ...g }) => g),
    totales_carpeta: carpeta.totales_carpeta,
  };
  const totales = {
    comprobantes: indice_ordenado.length,
    leidos: carpeta.totales_carpeta.leidos,
    en_revision: carpeta.totales_carpeta.en_revision,
    duplicados: carpeta.totales_carpeta.duplicados,
    por_moneda_cierre: Object.fromEntries(Object.entries(carpeta.cierre.totales.por_moneda || {})
      .map(([k, v]) => [k, { ventas: v.ventas.total, gastos: v.gastos.total, cobros: v.cobros.total, resultado: v.resultado }])),
  };
  const info = db.prepare(`INSERT INTO gesty_paquetes_contador
    (user_id, periodo, version, cierre_id, formato, formato_origen, destinatario_nombre, destinatario_email, contenido, totales, faltantes, estado, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'preparado',?)`)
    .run(userId, periodo, version, carpeta.cierre.id, formato, perfil.formato_origen,
      perfil.nombre, perfil.email,
      JSON.stringify(contenido), JSON.stringify(totales), JSON.stringify(faltantes),
      normTexto(o.creado_por) || 'gesty');
  const id = Number(info.lastInsertRowid);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'paquete-contador', entidad_id: String(id),
    tipo_evento: 'paquete-contador-armado',
    resumen: `Paquete para el contador de ${periodo} (versión ${version}) armado: ${indice_ordenado.length} comprobante(s), formato ${formato}${perfil.formato_origen === 'generico-sin-definir' ? ' (genérico: el contador no definió el suyo)' : ''}, cierre #${carpeta.cierre.id}. Espera el OK del dueño para salir.`,
    payload: { periodo, version, formato, formato_origen: perfil.formato_origen, cierre_id: carpeta.cierre.id, comprobantes: indice_ordenado.length, faltantes: faltantes.map((f) => f.clave) },
  });
  return getPaquete(db, userId, id);
}

// El CSV del paquete: el índice EN EL ORDEN del formato aplicado
// (la función de G-06 lee indice_comprobantes: se le pasa el
// índice del paquete, ninguna lógica de CSV se duplica).
function paqueteCSV(db, userId, paqueteId) {
  const p = getPaquete(db, userId, paqueteId);
  if (!p) fail('Ese paquete no es de esta cuenta.');
  return reportes.carpetaCSV({ indice_comprobantes: (p.contenido && p.contenido.indice) || [] });
}

// ---------------------------------------------------------------------------
// EL SELLO: aprobar el paquete (solo el dueño, versión vigente)
// aprobarPaquete NO lanza por los rechazos esperados: devuelve
// { ok:false, motivo } y TODO rechazo queda registrado (fila en
// gesty_contador_aprobaciones + evento), como approveCard.
// ---------------------------------------------------------------------------

function logAprobacion(db, userId, paqueteId, version, usuario, accion, resultado, motivo) {
  db.prepare(`INSERT INTO gesty_contador_aprobaciones (user_id, paquete_id, version, usuario, accion, resultado, motivo)
    VALUES (?,?,?,?,?,?,?)`).run(userId, paqueteId, version || 0, usuario || 'dueno', accion, resultado, motivo || '');
}

function selloVigente(db, userId, paquete) {
  const r = db.prepare(`SELECT * FROM gesty_contador_aprobaciones
    WHERE user_id = ? AND paquete_id = ? AND version = ? AND accion = 'aprobar' AND resultado = 'ejecutada'
    ORDER BY id DESC LIMIT 1`).get(userId, paquete.id, paquete.version);
  return r || null;
}

function aprobarPaquete(db, userId, paqueteId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const usuario = String(o.usuario || 'dueno');
  const id = Number(paqueteId);
  const row = db.prepare('SELECT * FROM gesty_paquetes_contador WHERE id = ?').get(id);
  if (!row) {
    logAprobacion(db, userId, id, Number(o.version) || 0, usuario, 'aprobar', 'rechazada', 'paquete-inexistente');
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'paquete-contador', entidad_id: String(id),
      tipo_evento: 'aprobacion-contador-rechazada', resumen: 'Aprobación rechazada: el paquete no existe.',
      payload: { motivo: 'paquete-inexistente' },
    });
    return { ok: false, error: 'El paquete no existe.', motivo: 'paquete-inexistente' };
  }
  if (row.user_id !== userId) {
    logAprobacion(db, userId, id, Number(o.version) || 0, usuario, 'aprobar', 'rechazada', 'paquete-ajeno');
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'paquete-contador', entidad_id: String(id),
      tipo_evento: 'aprobacion-contador-rechazada', resumen: 'Aprobación rechazada: el paquete es de otra cuenta.',
      payload: { motivo: 'paquete-ajeno' },
    });
    return { ok: false, error: 'Ese paquete no es de esta cuenta.', motivo: 'paquete-ajeno' };
  }
  const paquete = parsePaqueteRow(row);
  const rechazar = (motivo, error) => {
    logAprobacion(db, userId, id, Number(o.version) || paquete.version, usuario, 'aprobar', 'rechazada', motivo);
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'paquete-contador', entidad_id: String(id),
      tipo_evento: 'aprobacion-contador-rechazada', resumen: `Aprobación del paquete de ${paquete.periodo} rechazada: ${error}`,
      payload: { motivo, periodo: paquete.periodo, version: paquete.version },
    });
    return { ok: false, error, motivo, paquete };
  };
  const versionPedida = Number(o.version);
  // Idempotencia (como la R5 de la matriz): si esta versión ya
  // tiene su sello ejecutado, el reintento devuelve el sello.
  if (paquete.estado === 'aprobado' && Number.isInteger(versionPedida) && versionPedida === paquete.version && selloVigente(db, userId, paquete)) {
    return { ok: true, idempotente: true, paquete };
  }
  if (!Number.isInteger(versionPedida) || versionPedida !== paquete.version) {
    return rechazar('version-vieja', 'El paquete cambió desde que se preparó: revisá la versión nueva antes de aprobar.');
  }
  if (paquete.estado === 'superado') return rechazar('paquete-superado', 'Hay una versión más nueva de este paquete: se aprueba la vigente.');
  if (paquete.estado === 'enviado' || paquete.estado === 'entregado-manual') return rechazar('ya-entregado', 'Ese paquete ya salió: para corregirlo se arma una versión nueva.');
  if (paquete.estado === 'frenado') return rechazar('paquete-frenado', 'Ese paquete está frenado: armá una versión nueva para enviar.');
  if (paquete.estado !== 'preparado') return rechazar('no-preparado', `El paquete está «${paquete.estado}»: no está esperando tu OK.`);
  if (!paquete.destinatario.email) return rechazar('sin-destinatario', 'El paquete no tiene a quién salir: falta el email del contador en el fundamento.');

  db.prepare(`UPDATE gesty_paquetes_contador SET estado = 'aprobado', updated_at = datetime('now') WHERE id = ?`).run(id);
  logAprobacion(db, userId, id, paquete.version, usuario, 'aprobar', 'ejecutada', '');
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'paquete-contador', entidad_id: String(id),
    tipo_evento: 'paquete-contador-aprobado',
    resumen: `OK del dueño: el paquete de ${paquete.periodo} (versión ${paquete.version}) sale para ${paquete.destinatario.nombre || paquete.destinatario.email} <${paquete.destinatario.email}>.`,
    payload: { periodo: paquete.periodo, version: paquete.version, destinatario_email: paquete.destinatario.email, formato: paquete.formato },
  });
  return { ok: true, paquete: getPaquete(db, userId, id) };
}

function frenarPaquete(db, userId, paqueteId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const paquete = getPaquete(db, userId, paqueteId);
  if (!paquete) fail('Ese paquete no es de esta cuenta.');
  if (paquete.estado !== 'preparado' && paquete.estado !== 'aprobado') {
    fail(`El paquete está «${paquete.estado}»: ya no se puede frenar.`);
  }
  db.prepare(`UPDATE gesty_paquetes_contador SET estado = 'frenado', updated_at = datetime('now') WHERE id = ?`).run(paquete.id);
  logAprobacion(db, userId, paquete.id, paquete.version, String(o.usuario || 'dueno'), 'frenar', 'registrada', String(o.motivo || ''));
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'paquete-contador', entidad_id: String(paquete.id),
    tipo_evento: 'paquete-contador-frenado',
    resumen: `Frenado: el paquete de ${paquete.periodo} (versión ${paquete.version}) no sale.`,
    payload: { periodo: paquete.periodo, version: paquete.version, motivo: String(o.motivo || '') },
  });
  return getPaquete(db, userId, paquete.id);
}

// ---------------------------------------------------------------------------
// EL ENVÍO: la única vía de salida del paquete por email.
// Exige el sello de la versión exacta; todo lo demás es un
// rechazo registrado. El fallo del canal también: registrado,
// y el paquete sigue aprobado (nada «enviado» a medias).
// ---------------------------------------------------------------------------

function cuerpoEmail(db, userId, paquete) {
  const c = paquete.contenido || {};
  const negocio = (() => {
    const d = gesty.getData(db, userId, { grupo: 'datos-fiscales' }).find((x) => x.campo === 'razon_social');
    return d && d.valor ? String(d.valor) : '';
  })();
  const porMoneda = (c.cierre && c.cierre.totales && c.cierre.totales.por_moneda) || {};
  const lineasTotales = Object.entries(porMoneda)
    .map(([k, v]) => `${k}: ventas ${fmtMonto(v.ventas.total)} · gastos ${fmtMonto(v.gastos.total)} · cobros ${fmtMonto(v.cobros.total)} · resultado ${fmtMonto(v.resultado)}`);
  const filaIndice = (x) => {
    const cp = x.direccion === 'emitida' ? x.receptor : x.emisor;
    const monto = montoDe(x);
    return `${x.fecha} · ${x.tipo} · ${x.numero || 's/n'} · ${(cp && cp.nombre) || ''} · ${monedaKey(x.moneda)} ${monto === null ? '—' : fmtMonto(monto)}${x.duplicado_de ? ' (duplicado)' : ''}`;
  };
  const subject = `Carpeta ${paquete.periodo}${negocio ? ` — ${negocio}` : ''}`;
  const text = [
    `Carpeta del mes ${paquete.periodo} de ${negocio || 'el negocio'}, preparada por Gesty (versión ${paquete.version}).`,
    `Formato: ${paquete.formato}${paquete.formato_origen === 'generico-sin-definir' ? ' (genérico de la casa: el formato preferido del contador todavía no está cargado)' : ''}.`,
    `Comprobantes indexados: ${(c.indice || []).length}.`,
    ...lineasTotales,
    paquete.faltantes.length
      ? `Faltantes declarados en el cierre: ${paquete.faltantes.map((f) => f.dato_que_falta).join(' · ')}`
      : 'Sin faltantes: la carpeta está completa con lo registrado.',
    '',
    'Índice de comprobantes:',
    ...(c.indice || []).map(filaIndice),
  ].join('\n');
  const html = [
    `<h2>Carpeta del mes ${escHtml(paquete.periodo)}${negocio ? ` — ${escHtml(negocio)}` : ''}</h2>`,
    `<p>Preparada por Gesty (versión ${paquete.version}) · Formato: ${escHtml(paquete.formato)}${paquete.formato_origen === 'generico-sin-definir' ? ' (genérico de la casa)' : ''} · Comprobantes indexados: ${(c.indice || []).length}.</p>`,
    ...lineasTotales.map((l) => `<p>${escHtml(l)}</p>`),
    paquete.faltantes.length
      ? `<p><strong>Faltantes declarados:</strong> ${paquete.faltantes.map((f) => escHtml(f.dato_que_falta)).join(' · ')}</p>`
      : '<p>Sin faltantes: la carpeta está completa con lo registrado.</p>',
    '<table border="1" cellspacing="0" cellpadding="4"><thead><tr><th>Fecha</th><th>Tipo</th><th>Número</th><th>Contraparte</th><th>Moneda</th><th>Monto</th></tr></thead><tbody>',
    ...(c.indice || []).map((x) => {
      const cp = x.direccion === 'emitida' ? x.receptor : x.emisor;
      const monto = montoDe(x);
      return `<tr><td>${escHtml(x.fecha)}</td><td>${escHtml(x.tipo)}</td><td>${escHtml(x.numero || 's/n')}</td><td>${escHtml((cp && cp.nombre) || '')}</td><td>${escHtml(monedaKey(x.moneda))}</td><td>${monto === null ? '—' : fmtMonto(monto)}${x.duplicado_de ? ' (duplicado)' : ''}</td></tr>`;
    }),
    '</tbody></table>',
  ].join('\n');
  return { subject, text, html };
}

async function enviarPaquete(db, userId, paqueteId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const paquete = getPaquete(db, userId, paqueteId);
  if (!paquete) fail('Ese paquete no es de esta cuenta.');

  // Reenviar lo ya enviado devuelve el envío registrado: el email
  // no sale dos veces (idempotencia, como la R5 de la matriz).
  if (paquete.estado === 'enviado') {
    const prev = db.prepare(`SELECT * FROM gesty_contador_envios WHERE user_id = ? AND paquete_id = ? AND resultado = 'enviado' ORDER BY id DESC LIMIT 1`)
      .get(userId, paquete.id);
    if (prev) return { ok: true, idempotente: true, paquete, envio: { canal: prev.canal, destinatario: prev.destinatario, comprobante: prev.comprobante, fecha: prev.created_at } };
  }

  const rechazarEnvio = (motivo, mensaje) => {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'paquete-contador', entidad_id: String(paquete.id),
      tipo_evento: 'envio-contador-rechazado-sin-ok',
      resumen: `El paquete de ${paquete.periodo} (versión ${paquete.version}) NO salió: ${mensaje}`,
      payload: { periodo: paquete.periodo, version: paquete.version, motivo, estado: paquete.estado },
    });
    fail(mensaje);
  };
  if (paquete.estado !== 'aprobado') {
    rechazarEnvio('sin-ok', `Sin el OK del dueño no sale: el paquete está «${paquete.estado}», no aprobado.`);
  }
  const sello = selloVigente(db, userId, paquete);
  if (!sello) {
    rechazarEnvio('sin-sello', 'Sin el OK del dueño no sale: esta versión del paquete no tiene su aprobación registrada.');
  }
  const perfil = getContador(db, userId);
  if (perfil.email !== paquete.destinatario.email) {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'paquete-contador', entidad_id: String(paquete.id),
      tipo_evento: 'envio-contador-rechazado-sin-ok',
      resumen: `El paquete de ${paquete.periodo} NO salió: el email del contador cambió después del OK (era ${paquete.destinatario.email || '—'}, ahora es ${perfil.email || '—'}). Hay que rearmar y volver a aprobar.`,
      payload: { periodo: paquete.periodo, version: paquete.version, motivo: 'destinatario-cambio' },
    });
    fail('El email del contador cambió después de tu OK: el sello era para otro destinatario. Rearmá el paquete y volvé a aprobarlo.');
  }
  if (!_cfg.sendEmail) fail('El canal de email no está disponible en este servidor.');

  const { subject, text, html } = cuerpoEmail(db, userId, paquete);
  let r;
  try { r = await _cfg.sendEmail({ to: paquete.destinatario.email, subject, html, text }); }
  catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok) {
    const motivo = r && r.skipped ? 'el servidor no tiene el canal de email configurado' : 'el proveedor de email rechazó el envío';
    db.prepare(`INSERT INTO gesty_contador_envios (user_id, paquete_id, version, canal, destinatario, resultado, comprobante, detalle)
      VALUES (?,?,?,?,?,'fallido','',?)`).run(userId, paquete.id, paquete.version, 'email', paquete.destinatario.email, motivo);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'paquete-contador', entidad_id: String(paquete.id),
      tipo_evento: 'paquete-contador-envio-fallido',
      resumen: `El paquete de ${paquete.periodo} NO salió por email: ${motivo}. Sigue aprobado, listo para reintentar.`,
      payload: { periodo: paquete.periodo, version: paquete.version, motivo },
    });
    fail(`El email no salió (${motivo}). El paquete sigue aprobado: nada quedó enviado a medias.`);
  }
  const comprobante = String(r.id || r.provider_id || 'email');
  db.prepare(`INSERT INTO gesty_contador_envios (user_id, paquete_id, version, canal, destinatario, resultado, comprobante, detalle)
    VALUES (?,?,?,?,?,'enviado',?,'')`).run(userId, paquete.id, paquete.version, 'email', paquete.destinatario.email, comprobante);
  db.prepare(`UPDATE gesty_paquetes_contador SET estado = 'enviado', updated_at = datetime('now') WHERE id = ?`).run(paquete.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'paquete-contador', entidad_id: String(paquete.id),
    tipo_evento: 'paquete-contador-enviado',
    resumen: `Paquete de ${paquete.periodo} (versión ${paquete.version}) enviado por email a ${paquete.destinatario.nombre || paquete.destinatario.email} <${paquete.destinatario.email}>.`,
    payload: { periodo: paquete.periodo, version: paquete.version, destinatario_email: paquete.destinatario.email, formato: paquete.formato, cierre_id: paquete.cierre_id },
    comprobante_externo: comprobante,
  });
  return { ok: true, paquete: getPaquete(db, userId, paquete.id), envio: { canal: 'email', destinatario: paquete.destinatario.email, comprobante, fecha: new Date().toISOString() } };
}

// La entrega manual asistida: el dueño baja el paquete y lo
// entrega por su cuenta. No es un envío de Gesty, pero queda
// registrada igual — con su medio — porque la carpeta salió.
function registrarEntregaManual(db, userId, paqueteId, datos, opts) {
  ensureSchema(db);
  const d = datos || {};
  const o = opts || {};
  const paquete = getPaquete(db, userId, paqueteId);
  if (!paquete) fail('Ese paquete no es de esta cuenta.');
  if (paquete.estado === 'enviado') fail('Ese paquete ya salió por email: su entrega ya está registrada.');
  if (paquete.estado === 'entregado-manual') fail('Esa entrega manual ya está registrada.');
  if (paquete.estado === 'superado' || paquete.estado === 'frenado') fail(`El paquete está «${paquete.estado}»: se entrega la versión vigente.`);
  const medio = normTexto(d.medio || '');
  if (!medio) fail('La entrega manual se registra con su medio (cómo lo entregaste: lo descargué y lo mandé por mi email, se lo di en un pendrive…): sin medio, no hay entrega registrada.');
  const nota = normTexto(d.nota || '');
  db.prepare(`INSERT INTO gesty_contador_envios (user_id, paquete_id, version, canal, destinatario, resultado, comprobante, detalle)
    VALUES (?,?,?,?,?,'registrado',?,?)`)
    .run(userId, paquete.id, paquete.version, 'manual', paquete.destinatario.email, medio, nota);
  db.prepare(`UPDATE gesty_paquetes_contador SET estado = 'entregado-manual', updated_at = datetime('now') WHERE id = ?`).run(paquete.id);
  gesty.recordEvent(db, userId, {
    actor: String(o.actor || 'dueno'), entidad_tipo: 'paquete-contador', entidad_id: String(paquete.id),
    tipo_evento: 'paquete-contador-entregado-manual',
    resumen: `Paquete de ${paquete.periodo} (versión ${paquete.version}) entregado a mano por el dueño: ${medio}.`,
    payload: { periodo: paquete.periodo, version: paquete.version, medio },
    comprobante_externo: medio,
  });
  return { ok: true, paquete: getPaquete(db, userId, paquete.id), envio: { canal: 'manual', destinatario: paquete.destinatario.email, comprobante: medio } };
}

// ---------------------------------------------------------------------------
// ACOPLE TIPADO PARA G-18 · los huecos del período, en una forma
// El detector de huecos consume ESTA lista: los faltantes del
// cierre durable + los pedidos abiertos del contador, cada uno
// con su tipo y su identidad. Nada de raspar textos.
// ---------------------------------------------------------------------------

function faltantesParaDetector(db, userId, periodo) {
  ensureSchema(db);
  const p = normTexto(periodo);
  reportes.rangoPeriodo(p);
  const cierre = reportes.getCierre(db, userId, p);
  const delCierre = (cierre ? (cierre.faltantes || []) : []).map((f) => ({
    tipo: 'cierre', clave: f.clave, dato_que_falta: f.dato_que_falta, detalle: f.detalle,
    ids: f.ids || [], campos: f.campos || [], cierre_id: cierre.id,
  }));
  const dePedidos = pedidosAbiertos(db, userId, p).map((ped) => ({
    tipo: 'pedido-contador', clave: 'pedido-del-contador',
    dato_que_falta: ped.texto, detalle: faltanteDePedido(ped).detalle, pedido_id: ped.id,
  }));
  return { periodo: p, cierre_id: cierre ? cierre.id : null, faltantes: [...delCierre, ...dePedidos] };
}

// ---------------------------------------------------------------------------
// RESUMEN PARA «LA OFICINA»: el estado del Contador Aliado de un
// vistazo (perfil, próximo paquete debido, pedidos abiertos).
// ---------------------------------------------------------------------------

function resumenContador(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = normTexto(o.hoy) || hoyISO();
  const [y, m] = hoy.slice(0, 7).split('-').map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const periodoSugerido = `${prevY}-${String(prevM).padStart(2, '0')}`;
  const perfil = getContador(db, userId);
  const paquete = ultimoPaquete(db, userId, periodoSugerido) || ultimoPaquete(db, userId);
  return {
    contador: perfil,
    periodo_sugerido: periodoSugerido,
    dia_entrega: perfil.dia_entrega,
    paquete_del_periodo: paquete
      ? { id: paquete.id, periodo: paquete.periodo, version: paquete.version, estado: paquete.estado, formato: paquete.formato, faltantes: paquete.faltantes.length }
      : null,
    pedidos_abiertos: pedidosAbiertos(db, userId).length,
    pedidos_abiertos_del_periodo: pedidosAbiertos(db, userId, periodoSugerido).length,
  };
}

module.exports = {
  // esquema y canal
  ensureSchema, configure,
  // el contador en el fundamento
  getContador, setContador, FORMATOS_CARPETA,
  // el paquete durable y versionado
  armarPaquete, getPaquete, listPaquetes, ultimoPaquete, paqueteCSV,
  // el sello y la salida
  aprobarPaquete, frenarPaquete, enviarPaquete, registrarEntregaManual,
  // pedidos del contador (devoluciones)
  registrarPedido, listPedidos, getPedido, resolverPedido, descartarPedido,
  // acople tipado para G-18 + resumen
  faltantesParaDetector, faltanteDePedido, resumenContador,
  // piezas internas, exportadas para tests
  aplicarFormato,
};
