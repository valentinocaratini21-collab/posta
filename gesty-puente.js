// gesty-puente.js — G-16 · PUENTE POSTY → GESTY (la oficina
// trabaja junta). Spec: gesty-cola-builds.md G-16 (pasos +
// aceptación) · gesty-build-spec.md §13.4 · gesty-g02-build-spec.md
// §11 (el puente es una de las DOS interfaces nombradas de la
// oficina: no es duplicación, es la interfaz diseñada entre dos
// empleados — Posty no procesa papeles y Gesty no hace contenido).
//
// QUÉ HACE:
// (1) Cuando Posty programa una acción comercial que toca un
//     producto (promo, campaña, pico de demanda), Gesty chequea
//     contra el fundamento si el negocio da abasto — STOCK del
//     producto (G-10), AGENDA de esa semana (G-09) y CAJA (el
//     pronóstico de G-06) — y devuelve el veredicto POR PATA,
//     siempre con el número concreto y su fuente. «sin-datos» se
//     declara y JAMÁS se lee como «cierra».
// (2) Si algo no cierra (o no se pudo verificar), nace el AVISO
//     DE OFICINA en este módulo ANTES de que la acción salga, y
//     la salida queda trabada en el contrato del puente
//     (registrarSalidaAccion) hasta que el dueño se entera.
// (3) INVERSO: si una semana concentra vencimientos por encima
//     del umbral del fundamento, Gesty deja UN aviso de oficina
//     por semana y moneda (dedupe por registro) para que nadie
//     programe gasto comercial esa semana.
//
// LA TARJETA — decisión asentada (precedente G-15): la matriz
// de G-02 es una lista CERRADA de 10 tipos y NINGUNO cubre
// genuinamente este aviso: «caso-sensible» es resolver un caso
// escalado de WhatsApp/llamadas (reclamo, descuento, excepción —
// §4.1 de la spec G-02) y además encabeza la fila (R10), lo que
// desordenaría la bandeja con avisos de promo; «orden-compra»
// cubre solo el remedio de la pata de stock cuando el remedio
// es comprar (G-10 ya la levanta desde sus propias alertas) y
// este aviso abarca también agenda y caja, y su acto no es
// ejecutar nada: es que el dueño SE ENTERE antes de que la
// acción salga. Como en G-15, se implementa la MISMA disciplina
// dentro del módulo — veredicto congelado en la fila del aviso,
// reconocimiento SOLO del dueño (enterado/frenar) con rechazos
// registrados (tabla de acuses + registro durable) y una única
// vía de salida sellada (registrarSalidaAccion) — y queda como
// DECISIÓN DE FUNDACIÓN PENDIENTE si un día se suma un tipo 11
// («aviso-oficina») para que viva en la bandeja común.
//
// EL ACOPLE DEL LADO POSTY (inspección previa, 2026-10-24): en
// el repo NO existe una entidad «acción comercial» enchufable.
// · campaigns.js (server.js: CAMPAIGNS_MOD) es un calendario
//   ESTÁTICO de temas por rubro/fecha: sugiere el tema de la
//   semana, no es una acción del usuario ni referencia productos.
// · La pieza comercial programable de Posty es el POSTEO (tabla
//   posts, db.js): nace borrador, se programa (scheduled_at,
//   status 'scheduled') y lo publica el programador. Lleva
//   intención comercial en texto (sales_intent, intent,
//   source_topic, strategy_why) y product_ref es la RUTA DE LA
//   FOTO del producto usada como referencia visual — NO una
//   identidad de producto ni un vínculo con un ítem de stock, y
//   no hay magnitud esperada declarada en ningún campo.
// Por eso este build construye COMPLETO el lado Gesty (evaluación
// + avisos + escaneo inverso + el endpoint de ingesta que Posty
// llamará) y el cableado del lado Posty queda PENDIENTE con sus
// puntos exactos declarados en el reporte del build: (a) al
// planificar/programar la semana, cuando un posteo declare
// intención de venta sobre un producto, llamar a
// ingresarAccionComercial con el nombre del producto (del
// fundamento/Posty) para que Gesty lo cruce con su stock; y
// (b) antes de publicar un posteo marcado, consultar
// registrarSalidaAccion. Cablearlo hoy exigiría inventar el
// vínculo posteo↔producto, que no existe como dato.
//
// Alcance: SOLO lado servidor, ADITIVO. Las rutas viven en
// server.js detrás de requireAuth + gating de pack + capacidad
// «stock» (la dependencia declarada de la cola G-16 es G-10).
// Cero cambios para cuentas sin pack Gesty.
'use strict';

const gesty = require('./gesty');
const stock = require('./gesty-stock');
const agenda = require('./gesty-agenda');
const reportes = require('./gesty-reportes');
const proveedores = require('./gesty-proveedores');

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }

// ---------------------------------------------------------------------------
// Utilidades de fecha y formato (mismo estilo que los módulos
// hermanos: reloj inyectable, fechas 'YYYY-MM-DD')
// ---------------------------------------------------------------------------

function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function hoyDe(opts) {
  const o = opts || {};
  return esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
}
function addDias(fecha, n) {
  const d = new Date(String(fecha) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}
// La semana de oficina: lunes a domingo de la fecha dada.
function lunesDe(fecha) {
  const d = new Date(String(fecha) + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0 = domingo
  return addDias(fecha, -((dow + 6) % 7));
}
function semanaDe(fecha) {
  const desde = lunesDe(fecha);
  return { desde, hasta: addDias(desde, 6) };
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function fmtMonto(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function normTexto(s) { return String(s === null || s === undefined ? '' : s).trim(); }
function monedaKey(m) {
  const k = normTexto(m).toUpperCase();
  return k || 'ARS';
}

// Tipos de acción que VENDEN un producto: sin producto declarado,
// la pata de stock no es «no aplica» — es «sin verificar».
const TIPOS_CON_PRODUCTO = ['promo', 'promocion', 'campana', 'campaña', 'venta', 'liquidacion', 'liquidación', 'lanzamiento', 'pico-demanda'];

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_puente_evaluaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    origen TEXT NOT NULL DEFAULT 'posty',
    origen_ref TEXT NOT NULL DEFAULT '',
    accion TEXT NOT NULL DEFAULT '{}',
    semana_desde TEXT NOT NULL DEFAULT '',
    semana_hasta TEXT NOT NULL DEFAULT '',
    veredicto TEXT NOT NULL DEFAULT '{}',
    veredicto_global TEXT NOT NULL DEFAULT '',
    puede_salir INTEGER NOT NULL DEFAULT 0,
    aviso_id INTEGER,
    creado_por TEXT NOT NULL DEFAULT 'posty',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_puente_eval_user ON gesty_puente_evaluaciones(user_id, id);
  CREATE TABLE IF NOT EXISTS gesty_puente_avisos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'accion-comercial',
    clave_dedupe TEXT NOT NULL DEFAULT '',
    evaluacion_id INTEGER,
    semana_desde TEXT NOT NULL DEFAULT '',
    semana_hasta TEXT NOT NULL DEFAULT '',
    titulo TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '{}',
    estado TEXT NOT NULL DEFAULT 'esperando',
    creado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_puente_avisos_user ON gesty_puente_avisos(user_id, estado, id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_puente_avisos_dedupe
    ON gesty_puente_avisos(user_id, clave_dedupe) WHERE clave_dedupe != '';
  CREATE TABLE IF NOT EXISTS gesty_puente_acuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    aviso_id INTEGER NOT NULL,
    usuario TEXT NOT NULL DEFAULT 'dueno',
    accion TEXT NOT NULL DEFAULT '',
    resultado TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT '',
    ts TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_puente_acuses_aviso ON gesty_puente_acuses(aviso_id, id);
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// Configuración del puente (fundamento · «Tus reglas»)
// Umbrales del aviso inverso por moneda y techo de compromisos
// por día para la pata de agenda. Los defaults se DECLARAN
// (es_default) y el dueño los cambia en el fundamento: sin
// configuración suya, rigen estos y el aviso lo dice.
// ---------------------------------------------------------------------------

const CONFIG_DEFAULT = {
  umbrales_vencimiento: { ARS: 500000, USD: 1000 },
  max_compromisos_dia: 3,
};

function getConfig(db, userId) {
  gesty.ensureSchema(db);
  const dato = gesty.getData(db, userId, { grupo: 'reglas-dueno' }).find((d) => d.campo === 'puente');
  const v = dato && dato.valor && typeof dato.valor === 'object' && !Array.isArray(dato.valor) ? dato.valor : {};
  const umbrales = {};
  const fuenteUmbrales = v.umbrales_vencimiento && typeof v.umbrales_vencimiento === 'object' && !Array.isArray(v.umbrales_vencimiento)
    ? v.umbrales_vencimiento : CONFIG_DEFAULT.umbrales_vencimiento;
  for (const [k, val] of Object.entries(fuenteUmbrales)) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) umbrales[monedaKey(k)] = n;
  }
  if (!Object.keys(umbrales).length) Object.assign(umbrales, CONFIG_DEFAULT.umbrales_vencimiento);
  return {
    umbrales_vencimiento: umbrales,
    max_compromisos_dia: Number.isInteger(Number(v.max_compromisos_dia)) && Number(v.max_compromisos_dia) >= 1 && Number(v.max_compromisos_dia) <= 50
      ? Number(v.max_compromisos_dia) : CONFIG_DEFAULT.max_compromisos_dia,
    es_default: !dato,
  };
}

function setConfig(db, userId, cambios) {
  const actual = getConfig(db, userId);
  const c = cambios || {};
  const nueva = {
    umbrales_vencimiento: { ...actual.umbrales_vencimiento },
    max_compromisos_dia: actual.max_compromisos_dia,
  };
  if (c.umbrales_vencimiento !== undefined) {
    if (!c.umbrales_vencimiento || typeof c.umbrales_vencimiento !== 'object' || Array.isArray(c.umbrales_vencimiento)) {
      fail('Los umbrales de vencimiento grande van por moneda: { ARS: 500000, USD: 1000 }.');
    }
    for (const [k, val] of Object.entries(c.umbrales_vencimiento)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) fail(`El umbral para ${monedaKey(k)} tiene que ser un monto mayor que cero.`);
      nueva.umbrales_vencimiento[monedaKey(k)] = n;
    }
  }
  if (c.max_compromisos_dia !== undefined) {
    const n = Number(c.max_compromisos_dia);
    if (!Number.isInteger(n) || n < 1 || n > 50) fail('El máximo de compromisos por día es un entero entre 1 y 50.');
    nueva.max_compromisos_dia = n;
  }
  gesty.setData(db, userId, {
    grupo: 'reglas-dueno', campo: 'puente', valor: nueva,
    origen: 'dueno', origen_ref: 'config-puente', cargado_por: 'dueno', confirmado: true,
  });
  return { config: getConfig(db, userId) };
}

function umbralDe(config, moneda) {
  const k = monedaKey(moneda);
  const u = config.umbrales_vencimiento[k];
  return u === undefined ? null : Number(u);
}

// ---------------------------------------------------------------------------
// LAS TRES PATAS — cada una devuelve su veredicto SIEMPRE con
// el número concreto y la fuente de la que salió. Ninguna pata
// lanza por «no hay datos»: lo declara ('sin-datos').
// ---------------------------------------------------------------------------

const FUENTE_STOCK = 'Stock (G-10): el stock se deriva de los movimientos asentados del ítem';
const FUENTE_AGENDA = 'Agenda (G-09): la semana compuesta desde Facturación, Proveedores, Presupuestos, turnos y compromisos propios';
const FUENTE_CAJA = 'Reportes (G-06): pronóstico de caja de la semana (facturas a cobrar y comprobantes de proveedores por su vencimiento)';

function pataStock(db, userId, accion, hoy) {
  const tipo = normTexto(accion.tipo).toLowerCase();
  const textoProducto = normTexto(accion.producto_ref || accion.producto || accion.producto_nombre || '');
  const itemId = Number(accion.producto_item_id || accion.item_id || 0) || null;
  if (!itemId && !textoProducto) {
    if (TIPOS_CON_PRODUCTO.includes(tipo)) {
      return {
        pata: 'stock', estado: 'sin-datos', fuente: FUENTE_STOCK,
        numero: { items_en_stock: stock.listItems(db, userId, { hoy }).total },
        detalle: `La acción es de tipo «${tipo}» pero no declara qué producto vende: Gesty no puede chequear el stock de un producto sin nombre.`,
      };
    }
    return {
      pata: 'stock', estado: 'no-aplica', fuente: FUENTE_STOCK, numero: {},
      detalle: 'La acción no declara un producto: la pata de stock no aplica.',
    };
  }
  const { items, total } = stock.listItems(db, userId, { hoy });
  let item = null;
  if (itemId) item = items.find((i) => i.id === itemId) || null;
  if (!item && textoProducto) item = items.find((i) => stock.coincideItem(i, textoProducto)) || null;
  if (!item) {
    return {
      pata: 'stock', estado: 'sin-datos', fuente: FUENTE_STOCK,
      numero: { items_en_stock: total },
      detalle: total
        ? `El producto «${textoProducto || ('#' + itemId)}» no está en el stock cargado (hay ${total} ítem(s)): Gesty no puede verificar lo que no tiene registrado.`
        : 'Todavía no hay ítems de stock cargados: Gesty no puede verificar el stock de ningún producto.',
    };
  }
  const hay = item.stock;
  const magnitud = accion.magnitud === undefined || accion.magnitud === null || accion.magnitud === ''
    ? null : Number(accion.magnitud);
  const base = { item_id: item.id, item: item.nombre, unidad: item.unidad, hay, minimo: item.minimo };
  if (magnitud !== null && Number.isFinite(magnitud) && magnitud > 0) {
    const faltan = round2(magnitud - hay);
    if (faltan > 0) {
      return {
        pata: 'stock', estado: 'no-cierra', fuente: FUENTE_STOCK,
        numero: { ...base, compromete: magnitud, faltan },
        detalle: `Faltan ${fmtMonto(faltan)} ${item.unidad} de «${item.nombre}»: hay ${fmtMonto(hay)} y la acción compromete ${fmtMonto(magnitud)}.`,
      };
    }
    return {
      pata: 'stock', estado: 'cierra', fuente: FUENTE_STOCK,
      numero: { ...base, compromete: magnitud, sobran: round2(hay - magnitud) },
      detalle: `«${item.nombre}» alcanza: hay ${fmtMonto(hay)} ${item.unidad} y la acción compromete ${fmtMonto(magnitud)} (sobran ${fmtMonto(hay - magnitud)}).`,
    };
  }
  // Sin magnitud declarada: el juicio es contra el mínimo y el
  // ritmo de uso que el propio G-10 ya calcula (su alerta manda).
  if (hay <= 0) {
    return {
      pata: 'stock', estado: 'no-cierra', fuente: FUENTE_STOCK,
      numero: { ...base, faltan: null },
      detalle: `«${item.nombre}» está en cero: no hay unidades para vender. (La acción no declaró magnitud: el faltante exacto depende de cuánto espere vender.)`,
    };
  }
  if (item.alerta) {
    return {
      pata: 'stock', estado: 'no-cierra', fuente: FUENTE_STOCK,
      numero: { ...base, dias_hasta_agotar: item.dias_hasta_agotar },
      detalle: `«${item.nombre}» ya está en alerta de stock: ${item.alerta.texto}. (La acción no declaró magnitud.)`,
    };
  }
  return {
    pata: 'stock', estado: 'cierra', fuente: FUENTE_STOCK,
    numero: { ...base, dias_hasta_agotar: item.dias_hasta_agotar },
    detalle: `«${item.nombre}»: hay ${fmtMonto(hay)} ${item.unidad}${item.minimo !== null ? ` (mínimo ${fmtMonto(item.minimo)})` : ''} y ninguna alerta de stock. (La acción no declaró magnitud: el chequeo es contra el mínimo y el ritmo de uso.)`,
  };
}

function pataAgenda(db, userId, accion, semana, hoy, config) {
  let comp;
  try {
    comp = agenda.componerAgenda(db, userId, { desde: semana.desde, hasta: semana.hasta, hoy });
  } catch (e) {
    return {
      pata: 'agenda', estado: 'sin-datos', fuente: FUENTE_AGENDA, numero: {},
      detalle: `La agenda de esa semana no se pudo componer: ${e.message}`,
    };
  }
  const fuentesOk = (comp.fuentes || []).filter((f) => f.estado === 'ok').length;
  if ((comp.fuentes || []).length && fuentesOk === 0) {
    return {
      pata: 'agenda', estado: 'sin-datos', fuente: FUENTE_AGENDA, numero: {},
      detalle: 'Ninguna fuente de la agenda respondió en esta corrida: Gesty no puede verificar los compromisos de esa semana.',
    };
  }
  const items = comp.items || [];
  const fecha = esFechaISO(accion.fecha) ? String(accion.fecha) : null;
  const delDia = fecha ? items.filter((i) => i.fecha === fecha) : [];
  const conflictosDia = delDia.filter((i) => i.conflicto === true).length;
  const numero = {
    compromisos_semana: items.length,
    compromisos_dia: fecha ? delDia.length : null,
    conflictos_dia: fecha ? conflictosDia : null,
    max_compromisos_dia: config.max_compromisos_dia,
  };
  if (fecha && conflictosDia > 0) {
    return {
      pata: 'agenda', estado: 'no-cierra', fuente: FUENTE_AGENDA, numero,
      detalle: `El ${fecha} ya tiene ${conflictosDia} compromiso(s) en conflicto (se pisan entre sí): sumar una acción comercial ese día agrava el choque.`,
    };
  }
  if (fecha && delDia.length >= config.max_compromisos_dia) {
    return {
      pata: 'agenda', estado: 'no-cierra', fuente: FUENTE_AGENDA, numero,
      detalle: `El ${fecha} ya tiene ${delDia.length} compromisos (el máximo por día que fijaste es ${config.max_compromisos_dia}): ese día no da abasto.`,
    };
  }
  return {
    pata: 'agenda', estado: 'cierra', fuente: FUENTE_AGENDA, numero,
    detalle: fecha
      ? `El ${fecha} tiene ${delDia.length} compromiso(s) y la semana ${items.length}: hay lugar.`
      : `La semana tiene ${items.length} compromiso(s): hay lugar.`,
  };
}

function pataCaja(db, userId, semana, config) {
  let pron;
  try {
    pron = reportes.pronosticoCaja(db, userId, { desde: semana.desde, dias: 7 });
  } catch (e) {
    return {
      pata: 'caja', estado: 'sin-datos', fuente: FUENTE_CAJA, numero: {},
      detalle: `El pronóstico de caja de esa semana no se pudo calcular: ${e.message}`,
    };
  }
  if (!pron.movimientos || !pron.movimientos.length) {
    const fuentes = (pron.cobertura || []).map((c) => `${c.fuente}: ${c.estado}`).join(' · ');
    return {
      pata: 'caja', estado: 'sin-datos', fuente: FUENTE_CAJA,
      numero: { movimientos_semana: 0 },
      detalle: `Esa semana no tiene ningún movimiento de caja registrado (ni cobros ni pagos con vencimiento): Gesty no puede juzgar la caja sin datos. Cobertura del pronóstico — ${fuentes || 'sin fuentes'}.`,
    };
  }
  // El juicio de esta pata es sobre los VENCIMIENTOS
  // COMPROMETIDOS de la semana (el ejemplo de la cola: «la
  // semana ya tiene Y de vencimientos»). El pronóstico no
  // conoce saldo inicial (lo declara: saldo_inicial null), así
  // que un acumulado negativo desde cero NO prueba falta de
  // caja: no bloquea solo, viaja como número en el detalle.
  const porMoneda = {};
  let bloquea = null;
  for (const [moneda, agg] of Object.entries(pron.por_moneda || {})) {
    const umbral = umbralDe(config, moneda);
    porMoneda[moneda] = {
      entra: agg.entra, sale: agg.sale, neto: agg.queda,
      primer_dia_negativo: agg.primer_dia_negativo,
      minimo_acumulado: agg.minimo ? agg.minimo.monto : null,
      umbral_vencimiento: umbral,
    };
    if (umbral !== null && agg.sale >= umbral && !bloquea) {
      bloquea = { moneda, sale: agg.sale, umbral, neto: agg.queda };
    }
  }
  if (bloquea) {
    return {
      pata: 'caja', estado: 'no-cierra', fuente: FUENTE_CAJA,
      numero: { por_moneda: porMoneda },
      detalle: `Esa semana ya tiene ${bloquea.moneda} ${fmtMonto(bloquea.sale)} de vencimientos comprometidos (el umbral de «semana cargada» es ${bloquea.moneda} ${fmtMonto(bloquea.umbral)}): programar un gasto comercial encima es salir a vender con la caja comprometida.`,
    };
  }
  const resumen = Object.entries(porMoneda)
    .map(([m, v]) => `${m}: salen ${fmtMonto(v.sale)} y entran ${fmtMonto(v.entra)} (neto ${fmtMonto(v.neto)})`)
    .join(' · ');
  return {
    pata: 'caja', estado: 'cierra', fuente: FUENTE_CAJA,
    numero: { por_moneda: porMoneda },
    detalle: `Los vencimientos de la semana no llegan al umbral de «semana cargada» — ${resumen}. (Sin saldo inicial registrado: el juicio es sobre los vencimientos comprometidos, no sobre el saldo de una cuenta.)`,
  };
}

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }

function parseEvaluacionRow(r) {
  if (!r) return null;
  return {
    id: r.id, origen: r.origen, origen_ref: r.origen_ref || '',
    accion: safeJson(r.accion, {}),
    semana: { desde: r.semana_desde, hasta: r.semana_hasta },
    veredicto: safeJson(r.veredicto, {}),
    veredicto_global: r.veredicto_global,
    puede_salir: r.puede_salir === 1,
    aviso_id: r.aviso_id === null || r.aviso_id === undefined ? null : Number(r.aviso_id),
    creado_por: r.creado_por, creado_en: r.created_at,
  };
}

function parseAvisoRow(r) {
  if (!r) return null;
  return {
    id: r.id, tipo: r.tipo, clave_dedupe: r.clave_dedupe || '',
    evaluacion_id: r.evaluacion_id === null || r.evaluacion_id === undefined ? null : Number(r.evaluacion_id),
    semana: { desde: r.semana_desde, hasta: r.semana_hasta },
    titulo: r.titulo, detalle: safeJson(r.detalle, {}),
    estado: r.estado, creado_por: r.creado_por,
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function getEvaluacion(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_puente_evaluaciones WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return parseEvaluacionRow(r);
}

function listEvaluaciones(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const lim = Math.min(Math.max(Number(o.limit) || 100, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  let rows = db.prepare('SELECT * FROM gesty_puente_evaluaciones WHERE user_id = ? ORDER BY id DESC').all(userId);
  if (o.origen) rows = rows.filter((r) => r.origen === String(o.origen));
  if (o.veredicto_global) rows = rows.filter((r) => r.veredicto_global === String(o.veredicto_global));
  const total = rows.length;
  return { evaluaciones: rows.slice(off, off + lim).map(parseEvaluacionRow), total };
}

function getAviso(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_puente_avisos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return parseAvisoRow(r);
}

function listAvisos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const lim = Math.min(Math.max(Number(o.limit) || 100, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  let rows = db.prepare('SELECT * FROM gesty_puente_avisos WHERE user_id = ? ORDER BY id DESC').all(userId);
  if (o.solo_pendientes !== false) rows = rows.filter((r) => r.estado === 'esperando');
  if (o.tipo) rows = rows.filter((r) => r.tipo === String(o.tipo));
  const total = rows.length;
  return { avisos: rows.slice(off, off + lim).map(parseAvisoRow), total };
}

// ---------------------------------------------------------------------------
// EL AVISO DE OFICINA — nace del veredicto, con el documento
// (la evaluación completa) CONGELADO en su fila. Dedupe: la
// misma acción (mismo origen_ref) con un aviso todavía
// esperando no duplica el aviso: la evaluación nueva se ata
// al aviso vivo. Un aviso ya enterado/frenado no resucita:
// si la acción se reevalúa y sigue sin cerrar, nace otro.
// ---------------------------------------------------------------------------

function crearAviso(db, userId, datos) {
  const d = datos || {};
  if (d.clave_dedupe) {
    const vivo = db.prepare(`SELECT * FROM gesty_puente_avisos WHERE user_id = ? AND clave_dedupe = ? AND estado = 'esperando' ORDER BY id DESC LIMIT 1`)
      .get(userId, String(d.clave_dedupe));
    if (vivo) return { aviso: parseAvisoRow(vivo), reutilizado: true };
  }
  const info = db.prepare(`INSERT INTO gesty_puente_avisos
    (user_id, tipo, clave_dedupe, evaluacion_id, semana_desde, semana_hasta, titulo, detalle, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, String(d.tipo || 'accion-comercial'), String(d.clave_dedupe || ''),
      d.evaluacion_id === undefined || d.evaluacion_id === null ? null : Number(d.evaluacion_id),
      String(d.semana_desde || ''), String(d.semana_hasta || ''),
      String(d.titulo || ''), JSON.stringify(d.detalle || {}), String(d.creado_por || 'gesty'));
  const id = Number(info.lastInsertRowid);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'puente-aviso', entidad_id: String(id),
    tipo_evento: 'puente-aviso-creado',
    resumen: `Aviso de oficina: ${String(d.titulo || '')}`,
    payload: {
      tipo: String(d.tipo || 'accion-comercial'),
      evaluacion_id: d.evaluacion_id === undefined || d.evaluacion_id === null ? null : Number(d.evaluacion_id),
      semana: { desde: String(d.semana_desde || ''), hasta: String(d.semana_hasta || '') },
    },
  });
  return { aviso: getAviso(db, userId, id), reutilizado: false };
}

// ---------------------------------------------------------------------------
// LA EVALUACIÓN — el evento de oficina. Entrada: la acción
// comercial declarada por Posty (o por el dueño desde la API).
// Queda registrada SIEMPRE (sin registro no hay chequeo) y, si
// el veredicto no es «cierra», el aviso nace en el mismo acto —
// antes de cualquier publicación.
// ---------------------------------------------------------------------------

function normalizarAccion(accion) {
  const a = accion || {};
  const titulo = normTexto(a.titulo || a.nombre || '');
  if (!titulo) fail('La acción comercial necesita un título (ej. «Promo 2x1 en compresores»).');
  const fecha = esFechaISO(a.fecha) ? String(a.fecha) : null;
  let semana = null;
  if (esFechaISO(a.semana_desde) && esFechaISO(a.semana_hasta)) {
    if (String(a.semana_hasta) < String(a.semana_desde)) fail('La semana de la acción está invertida (hasta < desde).');
    semana = { desde: String(a.semana_desde), hasta: String(a.semana_hasta) };
  } else if (esFechaISO(a.semana)) {
    semana = semanaDe(String(a.semana));
  } else if (fecha) {
    semana = semanaDe(fecha);
  }
  if (!semana) fail('La acción comercial necesita su fecha (o su semana): sin cuándo no hay chequeo posible.');
  return {
    titulo,
    tipo: normTexto(a.tipo || 'promo') || 'promo',
    producto_ref: normTexto(a.producto_ref || a.producto || a.producto_nombre || ''),
    producto_item_id: Number(a.producto_item_id || a.item_id || 0) || null,
    fecha,
    semana_desde: semana.desde, semana_hasta: semana.hasta,
    magnitud: a.magnitud === undefined || a.magnitud === null || a.magnitud === '' ? null : Number(a.magnitud),
    magnitud_unidad: normTexto(a.magnitud_unidad || ''),
    detalle: normTexto(a.detalle || ''),
  };
}

function evaluarAccionComercial(db, userId, accion, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const origen = normTexto(o.origen || 'posty') || 'posty';
  const origenRef = normTexto(o.origen_ref || (accion && accion.origen_ref) || '');
  const a = normalizarAccion(accion);
  const semana = { desde: a.semana_desde, hasta: a.semana_hasta };
  const config = getConfig(db, userId);

  const patas = {
    stock: pataStock(db, userId, a, hoy),
    agenda: pataAgenda(db, userId, a, semana, hoy, config),
    caja: pataCaja(db, userId, semana, config),
  };
  const estados = Object.values(patas).map((p) => p.estado);
  const veredictoGlobal = estados.includes('no-cierra')
    ? 'no-cierra'
    : (estados.includes('sin-datos') ? 'sin-verificar' : 'cierra');
  const puedeSalir = veredictoGlobal === 'cierra';
  const veredicto = {
    global: veredictoGlobal, puede_salir: puedeSalir, patas,
    config: { umbrales_vencimiento: config.umbrales_vencimiento, max_compromisos_dia: config.max_compromisos_dia, config_es_default: config.es_default },
    evaluado_con_hoy: hoy,
  };

  const info = db.prepare(`INSERT INTO gesty_puente_evaluaciones
    (user_id, origen, origen_ref, accion, semana_desde, semana_hasta, veredicto, veredicto_global, puede_salir, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, origen, origenRef, JSON.stringify(a), semana.desde, semana.hasta,
      JSON.stringify(veredicto), veredictoGlobal, puedeSalir ? 1 : 0, origen === 'posty' ? 'posty' : 'gesty');
  const evaluacionId = Number(info.lastInsertRowid);
  gesty.recordEvent(db, userId, {
    actor: origen === 'posty' ? 'posty' : 'gesty', entidad_tipo: 'puente-evaluacion', entidad_id: String(evaluacionId),
    tipo_evento: 'puente-accion-evaluada',
    resumen: `Puente: «${a.titulo}» (semana ${semana.desde} → ${semana.hasta}) — veredicto ${veredictoGlobal}: stock ${patas.stock.estado} · agenda ${patas.agenda.estado} · caja ${patas.caja.estado}.`,
    payload: {
      origen_ref: origenRef, veredicto_global: veredictoGlobal, puede_salir: puedeSalir,
      patas: { stock: patas.stock.estado, agenda: patas.agenda.estado, caja: patas.caja.estado },
    },
  });

  let aviso = null;
  let avisoReutilizado = false;
  if (!puedeSalir) {
    const problemas = Object.values(patas)
      .filter((p) => p.estado === 'no-cierra' || p.estado === 'sin-datos')
      .map((p) => `${p.pata}: ${p.detalle}`);
    const titulo = veredictoGlobal === 'no-cierra'
      ? `Antes de que salga «${a.titulo}»: el negocio no da abasto`
      : `Antes de que salga «${a.titulo}»: Gesty no lo pudo verificar todo`;
    const creado = crearAviso(db, userId, {
      tipo: 'accion-comercial',
      clave_dedupe: origenRef ? `accion:${origenRef}` : `accion:eval:${evaluacionId}`,
      evaluacion_id: evaluacionId,
      semana_desde: semana.desde, semana_hasta: semana.hasta,
      titulo,
      detalle: { accion: a, veredicto, problemas },
      creado_por: 'gesty',
    });
    aviso = creado.aviso;
    avisoReutilizado = creado.reutilizado;
    db.prepare('UPDATE gesty_puente_evaluaciones SET aviso_id = ? WHERE id = ?').run(aviso.id, evaluacionId);
    if (avisoReutilizado) {
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'puente-evaluacion', entidad_id: String(evaluacionId),
        tipo_evento: 'puente-aviso-ya-esperando',
        resumen: `La acción «${a.titulo}» ya tenía su aviso de oficina esperando (aviso ${aviso.id}): la evaluación nueva se ata a ese aviso, no se duplica.`,
        payload: { aviso_id: aviso.id, veredicto_global: veredictoGlobal },
      });
    }
  }
  return {
    evaluacion: getEvaluacion(db, userId, evaluacionId),
    aviso, aviso_reutilizado: avisoReutilizado, puede_salir: puedeSalir,
  };
}

// La ingesta que el lado Posty llamará el día que se cablee
// (ver la nota de acople en la cabecera): mismo acto, origen
// declarado «posty».
function ingresarAccionComercial(db, userId, accion, opts) {
  return evaluarAccionComercial(db, userId, accion, { ...(opts || {}), origen: 'posty' });
}

// ---------------------------------------------------------------------------
// EL RECONOCIMIENTO DEL DUEÑO — la disciplina del aviso
// (precedente G-15): enterado/frenar NO lanzan por los
// rechazos esperados; todo queda en la tabla de acuses + el
// registro durable. Reconocer NO aprueba la acción comercial
// (eso es del flujo de Posty): registra que el dueño vio el
// aviso de Gesty, y es lo que destraba la salida en el
// contrato del puente cuando el veredicto no fue «cierra».
// ---------------------------------------------------------------------------

function logAcuse(db, userId, avisoId, usuario, accion, resultado, motivo) {
  db.prepare(`INSERT INTO gesty_puente_acuses (user_id, aviso_id, usuario, accion, resultado, motivo)
    VALUES (?,?,?,?,?,?)`).run(userId, avisoId, usuario || 'dueno', accion, resultado, motivo || '');
}

function acusarAviso(db, userId, avisoId, accion, opts) {
  ensureSchema(db);
  const o = opts || {};
  const usuario = String(o.usuario || 'dueno');
  const id = Number(avisoId);
  const row = db.prepare('SELECT * FROM gesty_puente_avisos WHERE id = ?').get(id);
  const rechazar = (motivo, error, aviso) => {
    logAcuse(db, userId, id, usuario, accion, 'rechazada', motivo);
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'puente-aviso', entidad_id: String(id),
      tipo_evento: 'puente-acuse-rechazado', resumen: `Acuse del aviso de oficina rechazado: ${error}`,
      payload: { motivo, accion },
    });
    return { ok: false, error, motivo, aviso: aviso || null };
  };
  if (!row) return rechazar('aviso-inexistente', 'El aviso no existe.');
  if (row.user_id !== userId) return rechazar('aviso-ajeno', 'Ese aviso no es de esta cuenta.');
  const aviso = parseAvisoRow(row);
  if (accion === 'enterado' && aviso.estado === 'enterado') {
    return { ok: true, idempotente: true, aviso };
  }
  if (aviso.estado !== 'esperando') {
    return rechazar('aviso-no-esperando', `El aviso está «${aviso.estado}»: ya no espera reconocimiento.`, aviso);
  }
  const nuevoEstado = accion === 'enterado' ? 'enterado' : 'frenado';
  db.prepare(`UPDATE gesty_puente_avisos SET estado = ?, updated_at = datetime('now') WHERE id = ?`).run(nuevoEstado, id);
  logAcuse(db, userId, id, usuario, accion, 'registrada', String(o.motivo || ''));
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'puente-aviso', entidad_id: String(id),
    tipo_evento: accion === 'enterado' ? 'puente-aviso-enterado' : 'puente-aviso-frenado',
    resumen: accion === 'enterado'
      ? `El dueño se enteró del aviso de oficina: ${aviso.titulo}`
      : `El dueño frenó el aviso de oficina: ${aviso.titulo}`,
    payload: { tipo: aviso.tipo, evaluacion_id: aviso.evaluacion_id, motivo: String(o.motivo || '') },
  });
  return { ok: true, aviso: getAviso(db, userId, id) };
}

function reconocerAviso(db, userId, avisoId, opts) { return acusarAviso(db, userId, avisoId, 'enterado', opts); }
function frenarAviso(db, userId, avisoId, opts) { return acusarAviso(db, userId, avisoId, 'frenar', opts); }

// ---------------------------------------------------------------------------
// EL CONTRATO DE SALIDA — lo que el publicador de Posty
// consultará antes de que la acción salga (aceptación de la
// cola: «sin el chequeo, la acción no sale»). Tres frenos,
// todos registrados: sin evaluación no hay salida; con
// veredicto que no cierra, la salida exige el aviso enterado;
// y un aviso FRENADO por el dueño frena la acción del todo.
// ---------------------------------------------------------------------------

function registrarSalidaAccion(db, userId, datos, opts) {
  ensureSchema(db);
  const d = datos || {};
  const o = opts || {};
  const evaluacionId = Number(d.evaluacion_id || 0) || null;
  const bloquear = (motivo, resumen, extra) => {
    gesty.recordEvent(db, userId, {
      actor: 'posty', entidad_tipo: 'puente-evaluacion', entidad_id: String(evaluacionId || ''),
      tipo_evento: 'puente-salida-bloqueada', resumen,
      payload: { motivo, evaluacion_id: evaluacionId, ...(extra || {}) },
    });
    return { ok: false, motivo, error: resumen };
  };
  if (!evaluacionId) {
    return bloquear('sin-chequeo', 'La acción intentó salir SIN el chequeo de Gesty: no sale. El puente no registra ninguna evaluación para esta salida.');
  }
  const ev = getEvaluacion(db, userId, evaluacionId);
  if (!ev) {
    return bloquear('sin-chequeo', `La acción intentó salir con una evaluación que no existe en esta cuenta (${evaluacionId}): no sale.`);
  }
  if (ev.puede_salir) {
    gesty.recordEvent(db, userId, {
      actor: 'posty', entidad_tipo: 'puente-evaluacion', entidad_id: String(ev.id),
      tipo_evento: 'puente-accion-salio',
      resumen: `Salió «${ev.accion.titulo}»: el chequeo de Gesty cerraba (stock, agenda y caja).`,
      payload: { evaluacion_id: ev.id, con_aviso: false, referencia_salida: normTexto(d.referencia || '') },
    });
    return { ok: true, evaluacion: ev, con_aviso: false };
  }
  const aviso = ev.aviso_id ? getAviso(db, userId, ev.aviso_id) : null;
  if (!aviso) {
    return bloquear('aviso-inexistente', `«${ev.accion.titulo}» no cerraba y no tiene aviso de oficina: no sale.`, { evaluacion_id: ev.id });
  }
  if (aviso.estado === 'frenado') {
    return bloquear('aviso-frenado', `«${ev.accion.titulo}» no sale: el dueño FRENÓ su aviso de oficina.`, { aviso_id: aviso.id });
  }
  if (aviso.estado !== 'enterado') {
    return bloquear('aviso-sin-enterado', `«${ev.accion.titulo}» no sale todavía: su aviso de oficina sigue esperando que el dueño se entere.`, { aviso_id: aviso.id });
  }
  gesty.recordEvent(db, userId, {
    actor: 'posty', entidad_tipo: 'puente-evaluacion', entidad_id: String(ev.id),
    tipo_evento: 'puente-accion-salio',
    resumen: `Salió «${ev.accion.titulo}» CON el aviso de oficina enterado por el dueño (el veredicto era «${ev.veredicto_global}»: la salida queda registrada como salida con aviso, no como chequeo aprobado).`,
    payload: { evaluacion_id: ev.id, aviso_id: aviso.id, con_aviso: true, veredicto_global: ev.veredicto_global, referencia_salida: normTexto(d.referencia || '') },
  });
  return { ok: true, evaluacion: ev, aviso, con_aviso: true };
}

// ---------------------------------------------------------------------------
// EL INVERSO — escaneo de semanas con vencimiento grande.
// Fuentes: las obligaciones con proveedores (G-07: comprobantes
// recibidos leídos por su saldo) + los vencimientos fiscales
// del fundamento SOLO con fecha y monto (G-06). Por semana y
// moneda, si el total comprometido llega al umbral, nace UN
// aviso (dedupe por clave semana+moneda): reescanear no
// duplica, y un aviso enterado no resucita en el mismo escaneo
// (la fila sigue existiendo bajo la misma clave).
// ---------------------------------------------------------------------------

function escanearVencimientosGrandes(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const semanas = Math.min(Math.max(Number(o.semanas) || 4, 1), 12);
  const config = getConfig(db, userId);
  const desde = lunesDe(hoy);
  const hasta = addDias(desde, semanas * 7 - 1);

  const porSemana = new Map(); // clave semana → { semana_desde, semana_hasta, por_moneda: Map }
  const anotar = (fecha, moneda, monto, fuente) => {
    if (!esFechaISO(fecha) || fecha < desde || fecha > hasta) return;
    const sem = semanaDe(fecha);
    const claveSem = sem.desde;
    if (!porSemana.has(claveSem)) porSemana.set(claveSem, { semana_desde: sem.desde, semana_hasta: sem.hasta, por_moneda: new Map() });
    const s = porSemana.get(claveSem);
    const k = monedaKey(moneda);
    const agg = s.por_moneda.get(k) || { total: 0, fuentes: [] };
    agg.total = round2(agg.total + (Number(monto) || 0));
    agg.fuentes.push(fuente);
    s.por_moneda.set(k, agg);
  };

  let nObligaciones = 0;
  for (const ob of proveedores.todasLasObligaciones(db, userId, hoy)) {
    if (ob.saldo === null || ob.saldo === undefined || ob.saldo <= 0) continue;
    if (!esFechaISO(ob.vencimiento)) continue;
    nObligaciones++;
    anotar(ob.vencimiento, ob.moneda, ob.saldo, {
      tipo: 'obligacion', comprobante_id: ob.comprobante_id,
      proveedor: ob.proveedor.nombre || '', vencimiento: ob.vencimiento, monto: ob.saldo,
    });
  }
  let nFiscales = 0;
  for (const f of reportes.vencimientosFiscalesFundamento(db, userId).conMonto) {
    nFiscales++;
    anotar(f.fecha, f.moneda, f.monto, {
      tipo: 'fiscal', dato_id: f.dato_id, concepto: f.concepto, vencimiento: f.fecha, monto: f.monto,
    });
  }

  const creados = [];
  const existentes = [];
  const semanasRevisadas = [];
  for (const s of [...porSemana.values()].sort((x, y) => (x.semana_desde < y.semana_desde ? -1 : 1))) {
    for (const [moneda, agg] of s.por_moneda.entries()) {
      const umbral = umbralDe(config, moneda);
      semanasRevisadas.push({
        semana_desde: s.semana_desde, semana_hasta: s.semana_hasta, moneda,
        total: agg.total, umbral, supera: umbral !== null && agg.total >= umbral,
      });
      if (umbral === null || agg.total < umbral) continue;
      const clave = `vto-grande:${s.semana_desde}:${moneda}`;
      const previo = db.prepare('SELECT * FROM gesty_puente_avisos WHERE user_id = ? AND clave_dedupe = ? ORDER BY id DESC LIMIT 1')
        .get(userId, clave);
      if (previo) { existentes.push(parseAvisoRow(previo)); continue; }
      const creado = crearAviso(db, userId, {
        tipo: 'vencimiento-grande', clave_dedupe: clave,
        semana_desde: s.semana_desde, semana_hasta: s.semana_hasta,
        titulo: `Semana cargada: ${moneda} ${fmtMonto(agg.total)} de vencimientos (${s.semana_desde} → ${s.semana_hasta})`,
        detalle: {
          semana: { desde: s.semana_desde, hasta: s.semana_hasta },
          moneda, total: agg.total, umbral,
          config_es_default: config.es_default,
          fuentes: agg.fuentes,
          criterio: `La semana concentra ${moneda} ${fmtMonto(agg.total)} de vencimientos comprometidos (obligaciones con proveedores por su saldo + vencimientos fiscales con monto), por encima del umbral de «semana cargada» (${moneda} ${fmtMonto(umbral)}${config.es_default ? ', el default de la casa: el dueño todavía no fijó el suyo' : ''}). Aviso de oficina: no programar gasto comercial esa semana.`,
        },
        creado_por: 'gesty',
      });
      creados.push(creado.aviso);
    }
  }
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'puente', entidad_id: 'escaneo-vencimientos',
    tipo_evento: 'puente-escaneo-vencimientos',
    resumen: `Escaneo del puente: ${nObligaciones} obligación(es) y ${nFiscales} vencimiento(s) fiscal(es) con monto en ${semanas} semana(s) — ${creados.length} aviso(s) nuevo(s) de semana cargada, ${existentes.length} ya registrado(s).`,
    payload: { semanas: semanasRevisadas, creados: creados.map((a) => a.id), existentes: existentes.map((a) => a.id) },
  });
  return { creados, existentes, semanas: semanasRevisadas, desde, hasta };
}

// ---------------------------------------------------------------------------
// Resumen para «La oficina»
// ---------------------------------------------------------------------------

function resumenPuente(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const pendientes = listAvisos(db, userId, { limit: 20 });
  const ultimas = listEvaluaciones(db, userId, { limit: 10 });
  return {
    avisos_pendientes: pendientes.total,
    avisos: pendientes.avisos,
    ultimas_evaluaciones: ultimas.evaluaciones,
    config: getConfig(db, userId),
    hoy,
  };
}

module.exports = {
  // constantes
  CONFIG_DEFAULT, TIPOS_CON_PRODUCTO,
  // esquema
  ensureSchema,
  // configuración (fundamento · reglas del dueño)
  getConfig, setConfig,
  // la evaluación y la ingesta (el evento de oficina)
  evaluarAccionComercial, ingresarAccionComercial,
  getEvaluacion, listEvaluaciones,
  // el aviso de oficina y su reconocimiento (disciplina G-15)
  getAviso, listAvisos, reconocerAviso, frenarAviso,
  // el contrato de salida (sin chequeo no sale)
  registrarSalidaAccion,
  // el inverso: semanas con vencimiento grande
  escanearVencimientosGrandes,
  // resumen para «La oficina»
  resumenPuente,
  // piezas internas, exportadas para tests y reuso
  semanaDe, lunesDe, pataStock, pataAgenda, pataCaja,
};
