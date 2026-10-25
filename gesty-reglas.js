// =====================================================================
// GESTY · G-20 — REGLAS APRENDIDAS DEL NEGOCIO
// Spec: gesty-cola-builds.md G-20 («detecta patrones —día de pago
// por proveedor, descuento habitual por cliente, categoría por
// contraparte— y los propone en "Lo que Gesty aprendió" con
// aprobación/descartar de un toque; la regla aprobada rige el
// autopiloto y queda registrada con su origen»; aceptación:
// «patrón sembrado (3 repeticiones) genera UNA propuesta; aprobada,
// el 4.º caso se procesa solo y el evento cita la regla; ninguna
// regla salta la matriz de aprobación») · gesty-modulo-app.md
// (la vista «Lo que Gesty aprendió de tu negocio», donde viven las
// propuestas) · gesty-sistema-operativo.md (la matriz manda).
//
// LA FRONTERA DURA (registrada por Valentino en la cola): una regla
// aprendida JAMÁS salta la matriz de aprobación. Las reglas solo
// ajustan lo que YA es autopiloto:
//   · CLASIFICAR papeles (G-03 corre solo: la regla aprobada se
//     aplica sola y deja su rastro «regla-aprendida-<id>» en la
//     extracción y en el evento de cada papel).
//   · SUGERIR valores en borradores: el plazo de pago de una orden
//     (G-07) y el descuento habitual de un cliente (G-08) se
//     exponen como funciones consumibles (sugerenciaPagoProveedor /
//     sugerenciaDescuentoCliente) para que el borrador los muestre
//     VISIBLES con su cita. Ninguna sugerencia cambia un total que
//     vaya a salir: el total lo sigue viendo y aprobando el dueño
//     en su tarjeta, como siempre.
// Ninguna regla crea, aprueba ni ejecuta una tarjeta, ni toca
// envíos, pagos ni emisiones — este módulo ni siquiera conoce
// createCard/approveCard: no los importa ni los llama. Si un
// patrón cae fuera de ese alcance (ej. el ritmo con que el dueño
// aprueba las cobranzas), se registra como OBSERVACIÓN en «Lo que
// Gesty aprendió», sin propuesta de regla: es un ritmo del dueño,
// no una palanca de Gesty.
//
// DETECCIÓN = OBSERVACIÓN, NUNCA INFERENCIA DE UNA SOLA VEZ. Cada
// patrón exige su base mínima de observaciones (declarada abajo)
// y la propuesta nace con la evidencia CONGELADA: los casos que la
// respaldan, citados uno por uno. Lo que no alcanza la base se
// DECLARA en la salida del escaneo («sin base» / «sin patrón»),
// no se disimula ni se fuerza.
//   (a) PLAZO DE PAGO A UN PROVEEDOR: de los asientos de pago de
//       G-07 (gesty_pagos imputados a su comprobante) se mide el
//       plazo real factura → pago. Propone si hay ≥ BASE pagos y
//       ≥ 60 % cae dentro de ±3 días de la mediana.
//   (b) DESCUENTO HABITUAL A UN CLIENTE: de los presupuestos YA
//       cotizados de G-08 (enviado/aceptado/vencido: pasaron por
//       el OK del dueño) se compara cada precio aprobado contra
//       la lista de precios del fundamento. Propone el porcentaje
//       modal si aparece en ≥ BASE presupuestos del cliente y en
//       ≥ 60 % de sus presupuestos comparables.
//   (c) CLASIFICACIÓN POR CONTRAPARTE: de los papeles recibidos
//       leídos de G-03 (los remitos no: su clasificación viene del
//       tipo), si TODOS los papeles con clasificación definida de
//       una contraparte (≥ BASE) comparten la misma, se propone —
//       SOLO si esa clasificación NO es la que las reglas
//       genéricas de G-03 ya derivan solas para ese papel: una
//       «regla» que repite el default no enseña nada (emitida →
//       venta y recibida → gasto son estructurales, no aprendidas).
//       Las correcciones del dueño cuentan como evidencia y se
//       citan: son la señal más fuerte de todas.
//
// CICLO DE VIDA. La propuesta nace PENDIENTE. El dueño aprueba o
// descarta con un toque (endpoints de este módulo; el acto es
// suyo, actor 'dueno', como en toda la casa). APROBADA: la regla
// se guarda en el fundamento (grupo `reglas-dueno`, campo
// `regla-aprendida-<id>`) con procedencia aprendida — origen
// `inferido`, origen_ref a la propuesta, confirmada por el dueño
// al aprobarla — y queda REVOCABLE desde la misma vista: revocar
// apaga la aplicación y deja la historia (la propuesta, el dato
// con su historial y los eventos; nada se borra). DESCARTADA: no
// se vuelve a proponer igual; solo reaparece UNA vez si la
// evidencia llega al DOBLE de la que tenía al descartarse
// (declarado), como generación 2; si también se descarta, ese
// patrón no se propone más (una revocación posterior de otra
// regla no lo resucita: el ciclo se reinicia solo si una regla
// del patrón llegó a regir y el dueño la revocó).
// DEBILITAMIENTO: si el dueño corrige un papel que una regla de
// clasificación había clasificado, la corrección cuenta EN CONTRA
// de la regla: la primera la debilita (queda marcada, con el
// conteo visible) y la segunda la DESACTIVA — el dueño manda
// sobre lo aprendido, siempre.
//
// G-03 SIN REESCRIBIR: el clasificador de comprobantes gana un
// registro de proveedores de regla (registerReglaClasificacion,
// el patrón registerExtractor/registerExecutor de la casa) que
// consulta ANTES de sus reglas genéricas y DESPUÉS de la
// corrección del dueño (que manda sobre todo). Sin reglas
// aprobadas, el comportamiento de G-03 es idéntico al de siempre.
// G-07 y G-08 no se tocan: sus sugerencias quedan como funciones
// consumibles de este módulo (el cableado a sus pantallas de
// borrador llega con el front; declarado como hueco H-G20-1).
//
// GATING: no existe capacidad «fundamento» en el pack (CAPACIDADES
// de G-02 no la define); las rutas de este módulo usan el mismo
// gating que las del fundamento y la vista «Lo que Gesty
// aprendió» (requireAuth + pack, sin capacidad fina) — declarado.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const comprobantes = require('./gesty-comprobantes');
const proveedores = require('./gesty-proveedores');
const presupuestos = require('./gesty-presupuestos');

// ---------------------------------------------------------------------------
// Constantes declaradas (la vara de cada patrón)
// ---------------------------------------------------------------------------

const BASE_MIN_OBSERVACIONES = 3;      // ningún patrón se propone con menos
const PAGO_VENTANA_MEDIANA_DIAS = 3;   // ±días alrededor de la mediana
const PAGO_PARTICIPACION_MIN = 0.6;    // fracción de pagos dentro de la ventana
const PAGO_LAG_MAX_DIAS = 180;         // un pago a más de 180 días no es «plazo»
const DESCUENTO_MIN_PCT = 2;           // menos de 2 % bajo lista no es descuento
const DESCUENTO_PARTICIPACION_MIN = 0.6;
const FACTOR_REAPARICION = 2;          // la evidencia tiene que duplicarse
const CONTRADICCIONES_PARA_DESACTIVAR = 2;
const GRUPO_REGLAS = 'reglas-dueno';
const TIPOS_PROPUESTA = ['pago-proveedor', 'descuento-cliente', 'clasificacion-contraparte'];
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const TIPO_TARJETA_LEGIBLE = {
  presupuesto: 'presupuestos', 'factura-emision': 'emisiones de factura',
  'factura-anulacion': 'anulaciones de factura', cobranza: 'cobranzas',
  'orden-compra': 'órdenes de compra', 'pago-proveedor': 'pagos a proveedores',
  'compromiso-mover': 'movimientos de compromisos', 'compromiso-cancelar': 'cancelaciones de compromisos',
  'hueco-ofrecer': 'ofrecimientos de hueco', 'caso-sensible': 'casos sensibles',
};

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function soloDigitos(v) { return String(v || '').replace(/\D/g, ''); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function hoyDe(opts) { const o = opts || {}; return esFechaISO(o.hoy) ? String(o.hoy) : hoyISO(); }
function diffDias(desdeISO, hastaISO) {
  if (!esFechaISO(desdeISO) || !esFechaISO(hastaISO)) return null;
  return Math.round((Date.parse(String(hastaISO).slice(0, 10)) - Date.parse(String(desdeISO).slice(0, 10))) / 86400000);
}
function safeJson(s, def) { try { const v = JSON.parse(s); return v === null || v === undefined ? def : v; } catch (e) { return def; } }
function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
// LA MISMA clave de contraparte que usan G-03/G-07 (la identidad
// tiene que coincidir entre áreas).
function campoContraparte(nombre, cuit) {
  const c = soloDigitos(cuit);
  return c ? `cuit_${c}` : slug(nombre);
}
function mediana(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
}
function fmtFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente): las propuestas y las observaciones
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  comprobantes.ensureSchema(db);
  proveedores.ensureSchema(db);
  presupuestos.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_reglas_propuestas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    clave TEXT NOT NULL,
    titulo TEXT NOT NULL DEFAULT '',
    texto TEXT NOT NULL DEFAULT '',
    patron TEXT NOT NULL DEFAULT '{}',
    evidencia TEXT NOT NULL DEFAULT '{}',
    observaciones INTEGER NOT NULL DEFAULT 0,
    generacion INTEGER NOT NULL DEFAULT 1,
    reaparicion INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    activa INTEGER NOT NULL DEFAULT 0,
    contradicciones INTEGER NOT NULL DEFAULT 0,
    fundamento_dato_id INTEGER,
    motivo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    resuelto_en TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_reglas_prop_user ON gesty_reglas_propuestas(user_id, estado, id);
  CREATE INDEX IF NOT EXISTS idx_gesty_reglas_prop_clave ON gesty_reglas_propuestas(user_id, clave, id);
  CREATE TABLE IF NOT EXISTS gesty_reglas_observaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    clave TEXT NOT NULL,
    texto TEXT NOT NULL DEFAULT '',
    evidencia TEXT NOT NULL DEFAULT '{}',
    veces INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, clave)
  );
  `);
  _esquemas.add(db);
}

function parsePropuestaRow(r) {
  if (!r) return null;
  return {
    id: r.id, user_id: r.user_id, tipo: r.tipo, clave: r.clave,
    titulo: r.titulo, texto: r.texto,
    patron: safeJson(r.patron, {}), evidencia: safeJson(r.evidencia, {}),
    observaciones: Number(r.observaciones) || 0,
    generacion: Number(r.generacion) || 1, reaparicion: r.reaparicion === 1,
    estado: r.estado, activa: r.activa === 1,
    contradicciones: Number(r.contradicciones) || 0,
    fundamento_dato_id: r.fundamento_dato_id || null,
    motivo: r.motivo || '',
    creado_en: r.created_at, actualizado_en: r.updated_at, resuelto_en: r.resuelto_en || '',
  };
}
function getPropuesta(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_reglas_propuestas WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return parsePropuestaRow(r);
}
function propuestasDeClave(db, userId, clave) {
  return db.prepare('SELECT * FROM gesty_reglas_propuestas WHERE user_id = ? AND clave = ? ORDER BY id ASC')
    .all(userId, clave).map(parsePropuestaRow);
}
function campoFundamentoDe(propuestaId) { return `regla-aprendida-${Number(propuestaId)}`; }
function datoDeRegla(db, userId, propuestaId) {
  const campo = campoFundamentoDe(propuestaId);
  return gesty.getData(db, userId, { grupo: GRUPO_REGLAS }).find((d) => d.campo === campo) || null;
}

// ---------------------------------------------------------------------------
// DETECTOR (a) · Plazo de pago a un proveedor (factura → pago real)
// ---------------------------------------------------------------------------

function detectarPlazosPago(db, userId) {
  proveedores.ensureSchema(db);
  const filas = db.prepare(`SELECT o.proveedor_campo AS campo, o.proveedor_nombre AS nombre,
      o.proveedor_cuit AS cuit, p.fecha AS pago_fecha, p.id AS pago_id,
      p.comprobante_id AS comprobante_id, c.fecha AS comp_fecha, c.numero AS comp_numero
    FROM gesty_pagos p
    JOIN gesty_ordenes_pago o ON o.id = p.orden_id AND o.user_id = p.user_id
    JOIN gesty_comprobantes c ON c.id = p.comprobante_id AND c.user_id = p.user_id
    WHERE p.user_id = ? AND o.tipo = 'proveedor' AND o.proveedor_campo != '' AND p.comprobante_id IS NOT NULL
    ORDER BY p.fecha ASC, p.id ASC`).all(userId);
  const grupos = new Map();
  for (const f of filas) {
    const lag = diffDias(f.comp_fecha, f.pago_fecha);
    if (lag === null || lag < 0 || lag > PAGO_LAG_MAX_DIAS) continue;
    if (!grupos.has(f.campo)) grupos.set(f.campo, { campo: f.campo, nombre: f.nombre || '', cuit: f.cuit || '', pagos: [] });
    grupos.get(f.campo).pagos.push({
      pago_id: f.pago_id, comprobante_id: f.comprobante_id, comprobante_numero: f.comp_numero || '',
      comprobante_fecha: f.comp_fecha, pago_fecha: f.pago_fecha, dias: lag,
    });
  }
  // El nombre lindo sale de la ficha viva del fundamento si está.
  const fichas = new Map(gesty.getData(db, userId, { grupo: 'proveedores' }).map((d) => [d.campo, d]));
  const candidatos = [], sinBase = [], sinPatron = [];
  for (const g of grupos.values()) {
    const ficha = fichas.get(g.campo);
    const nombre = (ficha && ficha.valor && ficha.valor.nombre) || g.nombre || g.campo;
    const lags = g.pagos.map((p) => p.dias);
    const n = lags.length;
    if (n < BASE_MIN_OBSERVACIONES) {
      sinBase.push({ tipo: 'pago-proveedor', clave: `pago-proveedor:${g.campo}`, observaciones: n,
        texto: `A ${nombre} se le observaron ${n} pago(s): todavía no alcanza para proponer un plazo (mínimo ${BASE_MIN_OBSERVACIONES}).` });
      continue;
    }
    const med = mediana(lags);
    const dentro = lags.filter((d) => Math.abs(d - med) <= PAGO_VENTANA_MEDIANA_DIAS).length;
    if (dentro / n < PAGO_PARTICIPACION_MIN) {
      sinPatron.push({ tipo: 'pago-proveedor', clave: `pago-proveedor:${g.campo}`, observaciones: n,
        texto: `Los pagos a ${nombre} no tienen un plazo estable (${n} pagos, entre ${Math.min(...lags)} y ${Math.max(...lags)} días): no se propone regla.` });
      continue;
    }
    const dias = Math.round(med);
    candidatos.push({
      tipo: 'pago-proveedor', clave: `pago-proveedor:${g.campo}`,
      titulo: `Pagar a ${nombre} a los ~${dias} días de la factura`,
      texto: `Vi ${n} pagos a ${nombre}: la factura se pagó a los ~${dias} días (mediana; ${dentro} de ${n} cayeron entre ${Math.max(0, dias - PAGO_VENTANA_MEDIANA_DIAS)} y ${dias + PAGO_VENTANA_MEDIANA_DIAS} días). Si la aprobás, Gesty sugiere ese plazo al preparar las órdenes de pago de este proveedor — la orden sigue saliendo solo con tu OK.`,
      patron: { proveedor_campo: g.campo, proveedor_nombre: nombre, proveedor_cuit: g.cuit || '', dias_plazo: dias },
      evidencia: { base: `${n} pagos asentados de G-07 imputados a su factura`, pagos: g.pagos, mediana_dias: med, dentro_de_ventana: dentro },
      observaciones: n,
    });
  }
  return { candidatos, sinBase, sinPatron };
}

// ---------------------------------------------------------------------------
// DETECTOR (b) · Descuento habitual a un cliente (precio aprobado
// contra la lista de precios del fundamento, en presupuestos que
// ya pasaron por el OK del dueño: enviado / aceptado / vencido)
// ---------------------------------------------------------------------------

function detectarDescuentos(db, userId) {
  const politica = presupuestos.getPolitica(db, userId);
  const { presupuestos: lista } = presupuestos.listPresupuestos(db, userId, { limit: 500 });
  const cotizados = lista.filter((p) => ['enviado', 'aceptado', 'vencido'].includes(p.estado));
  const porCliente = new Map();
  for (const p of cotizados) {
    const cli = p.cliente || {};
    const key = cli.campo || (cli.cuit ? `cuit_${soloDigitos(cli.cuit)}` : slug(cli.nombre));
    if (!key) continue;
    if (!porCliente.has(key)) porCliente.set(key, { key, nombre: cli.nombre || key, comparables: 0, porPct: new Map() });
    const g = porCliente.get(key);
    const descItems = [];
    let comparable = false;
    for (const it of p.items || []) {
      if (it.precio_unitario === null || it.precio_unitario === undefined) continue;
      const deLista = presupuestos.precioDeLista(politica, it.descripcion);
      if (!deLista || !Number(deLista.precio_unitario)) continue;
      comparable = true;
      const pct = Math.round((1 - Number(it.precio_unitario) / Number(deLista.precio_unitario)) * 100);
      if (pct >= DESCUENTO_MIN_PCT) {
        descItems.push({ descripcion: it.descripcion, precio_lista: Number(deLista.precio_unitario), precio_cotizado: Number(it.precio_unitario), porcentaje: pct });
      }
    }
    if (comparable) g.comparables++;
    if (descItems.length) {
      // El descuento del presupuesto = el porcentaje modal de sus ítems.
      const conteo = new Map();
      for (const d of descItems) conteo.set(d.porcentaje, (conteo.get(d.porcentaje) || 0) + 1);
      const modal = [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      if (!g.porPct.has(modal)) g.porPct.set(modal, []);
      g.porPct.get(modal).push({
        presupuesto_id: p.id, numero: p.numero, fecha: p.fecha_envio || p.fecha || '',
        items: descItems.filter((d) => d.porcentaje === modal),
      });
    }
  }
  const candidatos = [], sinBase = [], sinPatron = [];
  for (const g of porCliente.values()) {
    let mejor = null;
    for (const [pct, casos] of g.porPct.entries()) {
      if (!mejor || casos.length > mejor.casos.length) mejor = { pct, casos };
    }
    if (!mejor) continue; // nunca hubo descuento comparable: nada que declarar
    if (mejor.casos.length < BASE_MIN_OBSERVACIONES) {
      sinBase.push({ tipo: 'descuento-cliente', clave: `descuento-cliente:${g.key}`, observaciones: mejor.casos.length,
        texto: `A ${g.nombre} se le cotizó con ${mejor.pct} % de descuento en ${mejor.casos.length} presupuesto(s): todavía no alcanza para proponer la regla (mínimo ${BASE_MIN_OBSERVACIONES}).` });
      continue;
    }
    if (!g.comparables || mejor.casos.length / g.comparables < DESCUENTO_PARTICIPACION_MIN) {
      sinPatron.push({ tipo: 'descuento-cliente', clave: `descuento-cliente:${g.key}`, observaciones: mejor.casos.length,
        texto: `El descuento a ${g.nombre} no es habitual: ${mejor.pct} % aparece en ${mejor.casos.length} de ${g.comparables} presupuestos comparables (menos del ${Math.round(DESCUENTO_PARTICIPACION_MIN * 100)} %): no se propone regla.` });
      continue;
    }
    candidatos.push({
      tipo: 'descuento-cliente', clave: `descuento-cliente:${g.key}`,
      titulo: `${mejor.pct} % de descuento habitual para ${g.nombre}`,
      texto: `En ${mejor.casos.length} de ${g.comparables} presupuestos ya cotizados a ${g.nombre}, el precio salió ${mejor.pct} % por debajo de tu lista de precios, y vos los aprobaste. Si aprobás la regla, los borradores nuevos para ${g.nombre} van a mostrar ese descuento como SUGERENCIA visible, con su cita — nunca se aplica a un total sin que lo veas en la tarjeta.`,
      patron: { cliente_campo: g.key, cliente_nombre: g.nombre, porcentaje: mejor.pct },
      evidencia: { base: `${mejor.casos.length} de ${g.comparables} presupuestos cotizados con precio comparable a la lista`, presupuestos: mejor.casos },
      observaciones: mejor.casos.length,
    });
  }
  return { candidatos, sinBase, sinPatron };
}

// ---------------------------------------------------------------------------
// DETECTOR (c) · Clasificación por contraparte (unanimidad en los
// papeles leídos de G-03; las correcciones del dueño, citadas)
// ---------------------------------------------------------------------------

function detectarClasificaciones(db, userId) {
  const { comprobantes: comps } = comprobantes.listComprobantes(db, userId, { limit: 500 });
  const grupos = new Map();
  for (const c of comps) {
    if (c.estado_lectura !== 'leido' || c.duplicado_de) continue;
    // Solo papeles RECIBIDOS y no-remitos: en los emitidos la
    // clasificación es estructural (venta) y en el remito viene
    // del tipo (stock) — ahí no hay nada que aprender.
    if (c.direccion !== 'recibida' || c.tipo === 'remito') continue;
    const nombre = c.emisor.nombre;
    const cuit = c.emisor.cuit;
    if (!nombre && !cuit) continue;
    const campo = campoContraparte(nombre, cuit);
    const clave = `clasificacion:${c.direccion}:${campo}`;
    if (!grupos.has(clave)) grupos.set(clave, { clave, direccion: c.direccion, campo, nombre: nombre || campo, cuit: cuit || '', papeles: [] });
    grupos.get(clave).papeles.push(c);
  }
  const candidatos = [], sinBase = [], sinPatron = [];
  for (const g of grupos.values()) {
    const definidos = g.papeles.filter((c) => c.clasificacion);
    const distintas = [...new Set(definidos.map((c) => c.clasificacion))];
    if (!definidos.length) continue;
    if (distintas.length > 1) {
      sinPatron.push({ tipo: 'clasificacion-contraparte', clave: g.clave, observaciones: definidos.length,
        texto: `Los papeles de ${g.nombre} no se clasifican siempre igual (${distintas.join(', ')}): no se propone regla.` });
      continue;
    }
    if (definidos.length < BASE_MIN_OBSERVACIONES) {
      sinBase.push({ tipo: 'clasificacion-contraparte', clave: g.clave, observaciones: definidos.length,
        texto: `De ${g.nombre} hay ${definidos.length} papel(es) clasificados como «${distintas[0]}»: todavía no alcanza para proponer la regla (mínimo ${BASE_MIN_OBSERVACIONES}).` });
      continue;
    }
    // Si las reglas genéricas de G-03 ya derivan esa misma
    // clasificación para un papel típico del grupo, no hay nada
    // que aprender: la «regla» repetiría el default.
    const tipico = definidos[0];
    const generica = comprobantes.clasificar({
      tipo: tipico.tipo, direccion: tipico.direccion,
      emisor_nombre: tipico.emisor.nombre, concepto: tipico.concepto || '',
    }).clasificacion;
    if (generica === distintas[0]) {
      sinPatron.push({ tipo: 'clasificacion-contraparte', clave: g.clave, observaciones: definidos.length,
        texto: `Los papeles de ${g.nombre} se clasifican «${distintas[0]}», que es lo que Gesty ya deriva sola sin regla: no se propone.` });
      continue;
    }
    // Las correcciones del dueño sobre estos papeles: la señal más
    // fuerte. Se cuentan sobre el registro durable (G-03 guarda
    // cada corrección con sus cambios).
    let correcciones = 0;
    for (const c of definidos) {
      const evs = gesty.listEvents(db, userId, { entidad_tipo: 'comprobante', entidad_id: String(c.id) });
      for (const e of evs) {
        if (e.tipo_evento === 'comprobante-corregido' && e.payload
          && e.payload.cambios && e.payload.cambios.clasificacion === distintas[0]) correcciones++;
      }
    }
    const clasificacion = distintas[0];
    candidatos.push({
      tipo: 'clasificacion-contraparte', clave: g.clave,
      titulo: `Los papeles de ${g.nombre} son «${clasificacion}»`,
      texto: `${definidos.length} de ${definidos.length} papeles de ${g.nombre} quedaron clasificados como «${clasificacion}»${correcciones ? `, incluyendo ${correcciones} corrección(es) tuya(s)` : ''}. Clasificar corre solo, así que si aprobás la regla Gesty clasifica los próximos papeles de ${g.nombre} así, dejando el rastro «regla aprendida» en cada uno. Si un día corregís uno en contra, la regla se debilita; dos veces, se apaga.`,
      patron: { direccion: g.direccion, contraparte_campo: g.campo, contraparte_nombre: g.nombre, contraparte_cuit: g.cuit, clasificacion },
      evidencia: {
        base: `${definidos.length} papeles leídos, todos «${clasificacion}»`,
        correcciones_dueno: correcciones,
        comprobantes: definidos.map((c) => ({ id: c.id, numero: c.numero || '', fecha: c.fecha || '', clasificacion: c.clasificacion })),
      },
      observaciones: definidos.length,
    });
  }
  return { candidatos, sinBase, sinPatron };
}

// ---------------------------------------------------------------------------
// OBSERVACIONES — patrones reales pero FUERA del alcance de una
// regla (la matriz es del dueño): se registran, no se proponen.
// Detector: el ritmo con que el dueño aprueba cada tipo de tarjeta.
// ---------------------------------------------------------------------------

function detectarObservaciones(db, userId) {
  ensureSchema(db);
  const filas = db.prepare(`SELECT tipo, ts FROM gesty_approvals
    WHERE user_id = ? AND accion = 'aprobar' AND resultado = 'ejecutada' ORDER BY id ASC`).all(userId);
  const porTipo = new Map();
  for (const f of filas) {
    const fecha = String(f.ts || '').slice(0, 10);
    if (!esFechaISO(fecha)) continue;
    const dow = new Date(Date.parse(fecha)).getUTCDay();
    if (!porTipo.has(f.tipo)) porTipo.set(f.tipo, { tipo: f.tipo, total: 0, porDia: new Map() });
    const g = porTipo.get(f.tipo);
    g.total++;
    g.porDia.set(dow, (g.porDia.get(dow) || 0) + 1);
  }
  let registradas = 0;
  for (const g of porTipo.values()) {
    if (g.total < 4) continue;
    const [dow, enEseDia] = [...g.porDia.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (enEseDia / g.total < 0.8) continue;
    const clave = `ritmo-aprobacion-${g.tipo}`;
    const legible = TIPO_TARJETA_LEGIBLE[g.tipo] || g.tipo;
    const texto = `El dueño aprueba las tarjetas de ${legible} los ${DIAS_SEMANA[dow]} (${enEseDia} de ${g.total} aprobaciones ejecutadas). Es un ritmo suyo: queda registrado como observación — ninguna regla lo toca, porque aprobar es siempre su toque.`;
    const evidencia = JSON.stringify({ tipo_tarjeta: g.tipo, total: g.total, dia_semana: dow, en_ese_dia: enEseDia });
    const prev = db.prepare('SELECT id FROM gesty_reglas_observaciones WHERE user_id = ? AND clave = ?').get(userId, clave);
    if (prev) {
      db.prepare(`UPDATE gesty_reglas_observaciones SET texto = ?, evidencia = ?, veces = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(texto, evidencia, g.total, prev.id);
    } else {
      db.prepare('INSERT INTO gesty_reglas_observaciones (user_id, clave, texto, evidencia, veces) VALUES (?,?,?,?,?)')
        .run(userId, clave, texto, evidencia, g.total);
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'regla-observacion', entidad_id: clave,
        tipo_evento: 'regla-observacion-registrada',
        resumen: `Observación en «Lo que Gesty aprendió»: el dueño aprueba ${legible} los ${DIAS_SEMANA[dow]}`,
        payload: { tipo_tarjeta: g.tipo, total: g.total, dia_semana: dow, en_ese_dia: enEseDia },
      });
    }
    registradas++;
  }
  return registradas;
}

// ---------------------------------------------------------------------------
// EL ESCANEO — explícito, con reloj inyectable (la corrida
// periódica la agenda G-21). Aplica el ciclo de vida por clave.
// ---------------------------------------------------------------------------

function crearPropuesta(db, userId, cand, generacion, reaparicion) {
  const info = db.prepare(`INSERT INTO gesty_reglas_propuestas
    (user_id, tipo, clave, titulo, texto, patron, evidencia, observaciones, generacion, reaparicion, estado)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'pendiente')`)
    .run(userId, cand.tipo, cand.clave, cand.titulo, cand.texto,
      JSON.stringify(cand.patron), JSON.stringify(cand.evidencia), cand.observaciones, generacion, reaparicion ? 1 : 0);
  const id = Number(info.lastInsertRowid);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'regla-aprendida', entidad_id: String(id),
    tipo_evento: 'regla-propuesta-creada',
    resumen: `Nueva propuesta en «Lo que Gesty aprendió»: ${cand.titulo}`,
    payload: { tipo: cand.tipo, clave: cand.clave, observaciones: cand.observaciones, generacion, reaparicion: !!reaparicion },
  });
  return getPropuesta(db, userId, id);
}

function escanearPatrones(db, userId, opts) {
  ensureSchema(db);
  const hoy = hoyDe(opts);
  const salida = {
    hoy, creadas: [], esperando: [], ya_rigen: [], sin_refuerzo: [], sin_reaparicion: [],
    declarados_sin_base: [], sin_patron: [], observaciones_registradas: 0,
  };
  const detectores = [detectarPlazosPago, detectarDescuentos, detectarClasificaciones];
  for (const detectar of detectores) {
    const { candidatos, sinBase, sinPatron } = detectar(db, userId);
    salida.declarados_sin_base.push(...sinBase);
    salida.sin_patron.push(...sinPatron);
    for (const cand of candidatos) {
      const historial = propuestasDeClave(db, userId, cand.clave);
      const ultima = historial[historial.length - 1];
      if (!ultima) { salida.creadas.push(crearPropuesta(db, userId, cand, 1, false)); continue; }
      if (ultima.estado === 'pendiente') { salida.esperando.push({ clave: cand.clave, propuesta_id: ultima.id }); continue; }
      if (ultima.estado === 'aprobada' && ultima.activa) { salida.ya_rigen.push({ clave: cand.clave, propuesta_id: ultima.id }); continue; }
      if (ultima.estado === 'revocada') { salida.creadas.push(crearPropuesta(db, userId, cand, 1, false)); continue; }
      // descartada o desactivada: reaparece UNA vez, con el doble
      // de evidencia de la que tenía al cerrarse (declarado).
      if (ultima.generacion >= 2) { salida.sin_reaparicion.push({ clave: cand.clave, propuesta_id: ultima.id }); continue; }
      const necesita = (Number(ultima.observaciones) || 0) * FACTOR_REAPARICION;
      if (cand.observaciones < necesita) {
        salida.sin_refuerzo.push({ clave: cand.clave, propuesta_id: ultima.id, observaciones: cand.observaciones, necesita });
        continue;
      }
      salida.creadas.push(crearPropuesta(db, userId, cand, ultima.generacion + 1, true));
    }
  }
  salida.observaciones_registradas = detectarObservaciones(db, userId);
  return salida;
}

// ---------------------------------------------------------------------------
// EL CICLO DE VIDA — los toques del dueño (actor 'dueno', como en
// toda la casa: ni el chat ni Gesty aprueban una regla por él)
// ---------------------------------------------------------------------------

function exigirDueno(opts) {
  if (String((opts || {}).actor || 'dueno') !== 'dueno') fail('Solo el dueño decide sobre las reglas aprendidas.');
}

function aprobarPropuesta(db, userId, id, opts) {
  ensureSchema(db);
  exigirDueno(opts);
  const p = getPropuesta(db, userId, id);
  if (!p) fail('Esa propuesta no es de esta cuenta.');
  if (p.estado !== 'pendiente') fail(`Esa propuesta ya está ${p.estado}: no se aprueba dos veces.`);
  const campo = campoFundamentoDe(p.id);
  const valor = {
    tipo: p.tipo, clave: p.clave, ...p.patron,
    activa: true, propuesta_id: p.id, contradicciones: 0, debilitada: false,
  };
  // La regla aprobada VIVE en el fundamento, con su procedencia:
  // origen «inferido» (la dedujo Gesty de los datos), origen_ref a
  // la propuesta, confirmada por el dueño con este mismo acto.
  const dato = gesty.setData(db, userId, {
    grupo: GRUPO_REGLAS, campo, valor,
    origen: 'inferido', origen_ref: `propuesta-regla-${p.id}`, cargado_por: 'gesty', confirmado: true,
  });
  db.prepare(`UPDATE gesty_reglas_propuestas SET estado = 'aprobada', activa = 1, fundamento_dato_id = ?,
    resuelto_en = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(dato.id, p.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'regla-aprendida', entidad_id: String(p.id),
    tipo_evento: 'regla-aprendida-aprobada',
    resumen: `El dueño aprobó la regla aprendida: ${p.titulo}`,
    payload: { tipo: p.tipo, clave: p.clave, fundamento_dato_id: dato.id },
  });
  return { propuesta: getPropuesta(db, userId, p.id), dato: gesty.datoParaApi(dato) };
}

function descartarPropuesta(db, userId, id, opts) {
  ensureSchema(db);
  exigirDueno(opts);
  const p = getPropuesta(db, userId, id);
  if (!p) fail('Esa propuesta no es de esta cuenta.');
  if (p.estado !== 'pendiente') fail(`Esa propuesta ya está ${p.estado}: no se descarta dos veces.`);
  const motivo = normTexto((opts || {}).motivo || '');
  db.prepare(`UPDATE gesty_reglas_propuestas SET estado = 'descartada', motivo = ?,
    resuelto_en = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(motivo, p.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'regla-aprendida', entidad_id: String(p.id),
    tipo_evento: 'regla-propuesta-descartada',
    resumen: `El dueño descartó la propuesta: ${p.titulo}`,
    payload: { tipo: p.tipo, clave: p.clave, observaciones_al_descartar: p.observaciones, motivo },
  });
  return { propuesta: getPropuesta(db, userId, p.id) };
}

// Revocar: la regla deja de aplicarse y la HISTORIA QUEDA (la
// propuesta, el dato del fundamento con su historial y los
// eventos; nada se borra).
function revocarRegla(db, userId, id, opts) {
  ensureSchema(db);
  exigirDueno(opts);
  const p = getPropuesta(db, userId, id);
  if (!p) fail('Esa regla no es de esta cuenta.');
  if (p.estado !== 'aprobada' || !p.activa) fail('Esa regla no está rigiendo: no hay nada para revocar.');
  const dato = datoDeRegla(db, userId, p.id);
  if (dato && dato.valor && typeof dato.valor === 'object') {
    gesty.setData(db, userId, {
      grupo: GRUPO_REGLAS, campo: dato.campo, valor: { ...dato.valor, activa: false },
      origen: 'dueno', origen_ref: 'vista-aprendio-revocar', cargado_por: 'dueno', confirmado: true,
    });
  }
  db.prepare(`UPDATE gesty_reglas_propuestas SET estado = 'revocada', activa = 0, updated_at = datetime('now') WHERE id = ?`).run(p.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'regla-aprendida', entidad_id: String(p.id),
    tipo_evento: 'regla-aprendida-revocada',
    resumen: `El dueño revocó la regla aprendida: ${p.titulo} (la historia queda)`,
    payload: { tipo: p.tipo, clave: p.clave },
  });
  return { propuesta: getPropuesta(db, userId, p.id) };
}

// ---------------------------------------------------------------------------
// LA APLICACIÓN — solo autopiloto, solo con rastro
// ---------------------------------------------------------------------------

function reglaActiva(db, userId, tipo, clave) {
  const r = db.prepare(`SELECT * FROM gesty_reglas_propuestas
    WHERE user_id = ? AND tipo = ? AND clave = ? AND estado = 'aprobada' AND activa = 1 ORDER BY id DESC LIMIT 1`)
    .get(userId, tipo, clave);
  if (!r) return null;
  const p = parsePropuestaRow(r);
  // El fundamento manda: si el dato no está o dejó de estar activo
  // (el dueño lo tocó en su vista), la regla NO se aplica.
  const dato = datoDeRegla(db, userId, p.id);
  if (!dato || !dato.valor || dato.valor.activa !== true) return null;
  return { propuesta: p, valor: dato.valor };
}

// El proveedor que G-03 consulta ANTES de sus reglas genéricas
// (y después de la corrección del dueño, que manda sobre todo).
// Devuelve { clasificacion, regla } o null — sin regla aprobada,
// null, y G-03 se comporta como siempre.
function clasificacionAprendida(db, userId, c) {
  ensureSchema(db);
  const esRecibida = c.direccion === 'recibida';
  const nombre = esRecibida ? c.emisor_nombre : c.receptor_nombre;
  const cuit = esRecibida ? c.emisor_cuit : c.receptor_cuit;
  if (!nombre && !cuit) return null;
  const campo = campoContraparte(nombre, cuit);
  const clave = `clasificacion:${c.direccion}:${campo}`;
  const activa = reglaActiva(db, userId, 'clasificacion-contraparte', clave);
  if (!activa || !activa.valor.clasificacion) return null;
  return { clasificacion: String(activa.valor.clasificacion), regla: `regla-aprendida-${activa.propuesta.id}` };
}

// Las correcciones del dueño EN CONTRA de una regla la debilitan;
// dos, la apagan. Lo llama G-03 por su registro de listeners
// cuando el dueño corrige la clasificación de un papel que una
// regla había clasificado.
function registrarCorreccionClasificacion(db, userId, info) {
  ensureSchema(db);
  const m = /^regla-aprendida-(\d+)$/.exec(String((info || {}).regla || ''));
  if (!m) return { ok: false, motivo: 'sin-regla' };
  const p = getPropuesta(db, userId, Number(m[1]));
  if (!p || p.tipo !== 'clasificacion-contraparte' || p.estado !== 'aprobada' || !p.activa) {
    return { ok: false, motivo: 'regla-no-activa' };
  }
  const contradicciones = (Number(p.contradicciones) || 0) + 1;
  const dato = datoDeRegla(db, userId, p.id);
  if (contradicciones >= CONTRADICCIONES_PARA_DESACTIVAR) {
    if (dato && dato.valor && typeof dato.valor === 'object') {
      gesty.setData(db, userId, {
        grupo: GRUPO_REGLAS, campo: dato.campo,
        valor: { ...dato.valor, activa: false, contradicciones, debilitada: true },
        origen: 'inferido', origen_ref: `correccion-dueno-comprobante-${(info || {}).comprobante_id || ''}`, cargado_por: 'gesty',
      });
    }
    db.prepare(`UPDATE gesty_reglas_propuestas SET estado = 'desactivada', activa = 0, contradicciones = ?,
      motivo = 'El dueño corrigió dos veces en contra de esta regla', updated_at = datetime('now') WHERE id = ?`)
      .run(contradicciones, p.id);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'regla-aprendida', entidad_id: String(p.id),
      tipo_evento: 'regla-aprendida-desactivada',
      resumen: `La regla «${p.titulo}» se apagó: el dueño corrigió ${contradicciones} veces en su contra`,
      payload: { contradicciones, comprobante_id: (info || {}).comprobante_id || null },
    });
    return { ok: true, desactivada: true, contradicciones };
  }
  if (dato && dato.valor && typeof dato.valor === 'object') {
    gesty.setData(db, userId, {
      grupo: GRUPO_REGLAS, campo: dato.campo,
      valor: { ...dato.valor, contradicciones, debilitada: true },
      origen: 'inferido', origen_ref: `correccion-dueno-comprobante-${(info || {}).comprobante_id || ''}`, cargado_por: 'gesty',
    });
  }
  db.prepare(`UPDATE gesty_reglas_propuestas SET contradicciones = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(contradicciones, p.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'regla-aprendida', entidad_id: String(p.id),
    tipo_evento: 'regla-aprendida-debilitada',
    resumen: `La regla «${p.titulo}» quedó debilitada: el dueño corrigió un papel en su contra (${contradicciones} de ${CONTRADICCIONES_PARA_DESACTIVAR})`,
    payload: { contradicciones, comprobante_id: (info || {}).comprobante_id || null },
  });
  return { ok: true, desactivada: false, contradicciones };
}

// ---------------------------------------------------------------------------
// SUGERENCIAS CONSUMIBLES (borradores de G-07 / G-08): devuelven el
// valor con su cita, o null. NO tocan ningún total ni ningún
// borrador: el que consume decide cómo mostrarla, visible.
// ---------------------------------------------------------------------------

function claveDeRef(tipo, ref) {
  if (ref && typeof ref === 'object') {
    if (ref.campo) return `${tipo}:${String(ref.campo)}`;
    if (ref.cuit) return `${tipo}:cuit_${soloDigitos(ref.cuit)}`;
    if (ref.nombre) return `${tipo}:${slug(ref.nombre)}`;
    return null;
  }
  if (typeof ref === 'string' && ref) return `${tipo}:${ref}`;
  return null;
}

function sugerenciaPagoProveedor(db, userId, ref) {
  ensureSchema(db);
  const clave = claveDeRef('pago-proveedor', ref);
  if (!clave) return null;
  const activa = reglaActiva(db, userId, 'pago-proveedor', clave);
  if (!activa) return null;
  const dias = Number(activa.valor.dias_plazo);
  if (!Number.isFinite(dias)) return null;
  return {
    dias_plazo: dias, proveedor_campo: activa.valor.proveedor_campo || '',
    regla: `regla-aprendida-${activa.propuesta.id}`, propuesta_id: activa.propuesta.id,
    texto: `A ${activa.valor.proveedor_nombre || 'este proveedor'} le pagás a los ~${dias} días de la factura (tu regla aprendida ${activa.propuesta.id}): fecha sugerida para la orden.`,
  };
}

function sugerenciaDescuentoCliente(db, userId, ref) {
  ensureSchema(db);
  const clave = claveDeRef('descuento-cliente', ref);
  if (!clave) return null;
  const activa = reglaActiva(db, userId, 'descuento-cliente', clave);
  if (!activa) return null;
  const pct = Number(activa.valor.porcentaje);
  if (!Number.isFinite(pct)) return null;
  return {
    porcentaje: pct, cliente_campo: activa.valor.cliente_campo || '',
    regla: `regla-aprendida-${activa.propuesta.id}`, propuesta_id: activa.propuesta.id,
    texto: `Sugerencia visible de tu regla aprendida ${activa.propuesta.id}: a ${activa.valor.cliente_nombre || 'este cliente'} le cotizás con ${pct} % de descuento sobre la lista. Se muestra en el borrador con esta cita; el total lo aprobás vos en la tarjeta.`,
  };
}

// ---------------------------------------------------------------------------
// CONSULTAS — propuestas, reglas activas, observaciones, resumen
// ---------------------------------------------------------------------------

function listPropuestas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const rows = o.estado
    ? db.prepare('SELECT * FROM gesty_reglas_propuestas WHERE user_id = ? AND estado = ? ORDER BY id DESC').all(userId, String(o.estado))
    : db.prepare('SELECT * FROM gesty_reglas_propuestas WHERE user_id = ? ORDER BY id DESC').all(userId);
  const propuestas = rows.map(parsePropuestaRow);
  return { propuestas, total: propuestas.length };
}

function listReglasActivas(db, userId) {
  ensureSchema(db);
  const rows = db.prepare(`SELECT * FROM gesty_reglas_propuestas
    WHERE user_id = ? AND estado = 'aprobada' AND activa = 1 ORDER BY id ASC`).all(userId);
  const reglas = [];
  for (const r of rows) {
    const p = parsePropuestaRow(r);
    const dato = datoDeRegla(db, userId, p.id);
    reglas.push({
      propuesta_id: p.id, tipo: p.tipo, clave: p.clave, titulo: p.titulo,
      valor: dato ? dato.valor : p.patron,
      fundamento_dato_id: p.fundamento_dato_id, contradicciones: p.contradicciones,
      aprobada_en: p.resuelto_en, regla: `regla-aprendida-${p.id}`,
    });
  }
  return { reglas, total: reglas.length };
}

function listObservaciones(db, userId) {
  ensureSchema(db);
  const rows = db.prepare('SELECT * FROM gesty_reglas_observaciones WHERE user_id = ? ORDER BY id ASC').all(userId);
  const observaciones = rows.map((r) => ({
    id: r.id, clave: r.clave, texto: r.texto, evidencia: safeJson(r.evidencia, {}),
    veces: Number(r.veces) || 0, creado_en: r.created_at, actualizado_en: r.updated_at,
  }));
  return { observaciones, total: observaciones.length };
}

function resumenReglas(db, userId, opts) {
  ensureSchema(db);
  const hoy = hoyDe(opts);
  const pendientes = listPropuestas(db, userId, { estado: 'pendiente' }).propuestas;
  const activas = listReglasActivas(db, userId).reglas;
  const observaciones = listObservaciones(db, userId).observaciones;
  return {
    hoy,
    propuestas_pendientes: pendientes.length,
    propuestas: pendientes.slice(0, 5).map((p) => ({ id: p.id, tipo: p.tipo, titulo: p.titulo })),
    reglas_activas: activas.length,
    observaciones: observaciones.length,
    texto: pendientes.length
      ? `Gesty aprendió ${pendientes.length} patrón(es) de tu negocio y esperan tu toque en «Lo que Gesty aprendió».`
      : 'Sin patrones nuevos esperando: lo aprendido está aplicado o todavía juntando evidencia.',
  };
}

// ---------------------------------------------------------------------------
// EL PUENTE CON G-03 (el patrón de registro de la casa): el
// clasificador consulta la regla aprobada antes de sus reglas
// genéricas, y la corrección del dueño en contra la debilita.
// Sin este módulo cargado, G-03 se comporta exactamente igual.
// ---------------------------------------------------------------------------

comprobantes.registerReglaClasificacion((db, userId, c) => clasificacionAprendida(db, userId, c));
comprobantes.registerCorreccionListener((db, userId, info) => registrarCorreccionClasificacion(db, userId, info));

module.exports = {
  // constantes
  BASE_MIN_OBSERVACIONES, FACTOR_REAPARICION, CONTRADICCIONES_PARA_DESACTIVAR,
  DESCUENTO_MIN_PCT, PAGO_VENTANA_MEDIANA_DIAS, TIPOS_PROPUESTA, GRUPO_REGLAS,
  // esquema
  ensureSchema,
  // detección
  escanearPatrones,
  // ciclo de vida (toques del dueño)
  aprobarPropuesta, descartarPropuesta, revocarRegla,
  // aplicación (autopiloto con rastro) y sugerencias consumibles
  clasificacionAprendida, registrarCorreccionClasificacion,
  sugerenciaPagoProveedor, sugerenciaDescuentoCliente,
  // consultas
  getPropuesta, listPropuestas, listReglasActivas, listObservaciones, resumenReglas,
  // piezas internas, exportadas para tests y reuso
  detectarPlazosPago, detectarDescuentos, detectarClasificaciones, detectarObservaciones,
  campoContraparte, mediana,
};
