// =====================================================================
// GESTY · G-22 — AUDITORÍA DE PRECIOS DE PROVEEDORES
// Spec: gesty-cola-builds.md G-22 («sigue el precio del mismo
// ítem/concepto a lo largo del tiempo y entre proveedores; alerta
// solo sobre un umbral con el número concreto y la serie que lo
// respalda; las variaciones por debajo del umbral NO alertan» —
// aceptación: «suba sembrada del 12% detectada con la serie
// correcta; variaciones menores al umbral no alertan; toda alerta
// cita comprobantes reales») · gesty-sistema-operativo.md
// (detectar y registrar es autopilot; este build NO envía nada a
// nadie: su salida es la alerta durable para el dueño).
//
// LA SERIE. Para cada (proveedor, concepto) observable se arma la
// historia de precios con fecha, monto, moneda y la CITA del
// papel/orden que respalda cada punto. Dos familias, NUNCA
// mezcladas en una misma serie porque no son la misma magnitud:
//   · «concepto-comprobante»: los comprobantes recibidos leídos
//     de G-03 (factura/ticket/recibo/otro; el REMITO queda fuera —
//     acredita la entrega, no el precio: su precio manda en la
//     factura, mismo criterio que G-07 al derivar obligaciones).
//     La unidad es el CONCEPTO del papel (G-03 no trae líneas de
//     ítems — H-G10-1) y el precio es el MONTO del comprobante:
//     el neto si está, el total si no. La base usada (neto/total)
//     forma parte de la identidad de la serie: mezclar bases
//     fabricaría saltos falsos del tamaño del IVA.
//   · «item-orden»: el PRECIO UNITARIO de cada ítem de las
//     órdenes de compra de G-10 (todas menos las anuladas). Es la
//     serie histórica que G-10 no guarda: su flag de variación es
//     del momento de aprobar una orden; acá vive la evolución y
//     la alerta. Cada punto cita la orden y la fuente del precio
//     que la propia orden ya trae (patrón de cita de G-08/G-10).
// Lo que no se puede observar NO entra: papel sin concepto legible
// (ese dato no entra a ninguna serie), sin fecha o sin monto — el
// escaneo los CUENTA como excluidos, declarados, jamás rellena.
//
// LA IDENTIDAD. Proveedor = la identidad de G-07
// (proveedores.campoProveedorDe: cuit_<cuit> o slug del nombre).
// Concepto = clave exacta con la normalización de la casa (la de
// claveDe de G-10: minúsculas, sin acentos, no-alfanumérico a
// espacio). SIN fuzzy: si dos claves se contienen (una es prefijo
// de la otra, ej. «flete» y «flete expres») el escaneo las DECLARA
// como relación no fusionada — un match dudoso NO une dos series.
//
// LA ALERTA. Referencia doble, declarada: el precio más reciente
// se compara contra (a) el punto ANTERIOR de la serie y (b) la
// MEDIANA de los puntos previos (si hay ≥2 previos). Dispara la
// mayor de las dos variaciones y la alerta cita cuál mandó. Si la
// mayor supera el umbral del fundamento (grupo reglas-dueno,
// campo «precios»; default DECLARADO 10%), nace UNA alerta durable
// con el número concreto («Distribuidora Sur · Flete: subió de
// $ 18.000,00 a $ 20.160,00 (+12,0 %)…») y la serie completa
// citada (cada punto con su comprobante u orden). Por debajo del
// umbral: silencio — el escaneo lo registra como «sin alerta» en
// su detalle, jamás se notifica. Las BAJAS se registran en la
// serie y en el detalle del escaneo, pero la alerta es de SUBA.
// Serie de un solo precio: «sin base», declarado, cero alertas.
//
// UNA ALERTA ABIERTA POR SERIE. Re-escanear no duplica: mismo
// salto (serie + punto nuevo) = la misma alerta. Si entra un
// precio que salta DE NUEVO sobre la misma serie, la alerta
// abierta EVOLUCIONA: mismo id, números y serie citados
// actualizados, evento propio «precio-alerta-evolucion». Una
// alerta ya surfaceada (vista o cerrada) cuyo salto se vuelve a
// calcular NO se recrea: el dueño ya la vio. La identidad del
// salto vive en un índice único (user_id, salto).
//
// EL CIERRE. La alerta se cierra (a) cuando el dueño la marca
// vista, o (b) por REVERSIÓN: el precio más reciente ya no supera
// la referencia de la alerta vigente más el umbral — con su
// motivo escrito en la alerta y su evento. La reversión se mide
// contra la referencia de la alerta (si la alerta evolucionó, es
// la referencia del último salto).
//
// COMPARACIÓN ENTRE PROVEEDORES. Cuando el mismo concepto
// normalizado aparece en ≥2 proveedores con precio dentro de una
// ventana comparable (default DECLARADO: últimos 90 días, misma
// moneda y misma base; configurable en el fundamento), la
// consulta lo muestra lado a lado con la diferencia. Es
// información para decidir: este build NO sugiere cambiar de
// proveedor por ningún canal ni crea reglas — la comparación
// vive en la consulta y el resumen (podrá alimentar una regla
// aprendida de G-20 el día que el dueño la apruebe).
//
// RELOJ INYECTABLE: todo escaneo y consulta acepta opts.hoy —
// ningún cálculo usa la fecha del sistema cuando el llamador pasó
// la suya (lección del fix de Cobranzas G-08). El disparo es
// explícito: la rutina diaria de G-21 podrá sumar este escaneo
// después — este build NO lo cablea (declarado).
//
// Esquema ADITIVO e idempotente, en la misma base y patrón que
// gesty.js: no toca ninguna tabla existente ni el comportamiento
// de Posty para ninguna cuenta.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const comprobantes = require('./gesty-comprobantes');
const proveedores = require('./gesty-proveedores');
const stock = require('./gesty-stock');

// ---------------------------------------------------------------------------
// Constantes declaradas (ver cabecera)
// ---------------------------------------------------------------------------

const UMBRAL_DEFAULT_PCT = 10;        // suba mínima que alerta (%)
const VENTANA_DEFAULT_DIAS = 90;      // ventana de comparación entre proveedores
const GRUPO_CONFIG = 'reglas-dueno';  // el umbral vive en el fundamento
const CAMPO_CONFIG = 'precios';
const FAMILIA_COMPROBANTE = 'concepto-comprobante';
const FAMILIA_ORDEN = 'item-orden';
const FAMILIAS = [FAMILIA_COMPROBANTE, FAMILIA_ORDEN];
const ESTADOS_ALERTA = ['abierta', 'vista', 'cerrada-reversion'];

// ---------------------------------------------------------------------------
// Utilidades (el patrón de la casa: cada módulo trae las suyas)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function hoyDe(opts) { const o = opts || {}; return esFechaISO(o.hoy) ? String(o.hoy) : hoyISO(); }
function sumarDias(iso, dias) {
  const d = new Date(Date.parse(String(iso).slice(0, 10)) + Number(dias) * 86400000);
  return d.toISOString().slice(0, 10);
}
function fmtMonto(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}
// Porcentaje con signo y un decimal, a la argentina («+12,0 %»).
function fmtPct(n) {
  const v = Number(n) || 0;
  return `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')} %`;
}
function safeJson(s, def) { try { const v = JSON.parse(s); return v === null || v === undefined ? def : v; } catch (e) { return def; } }
// La normalización de concepto de la casa (la misma de claveDe en
// G-10): minúsculas, sin acentos, todo no-alfanumérico a un espacio.
function claveConcepto(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function mediana(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? round2(s[m]) : round2((s[m - 1] + s[m]) / 2);
}

// ---------------------------------------------------------------------------
// Esquema propio (idempotente): SOLO las alertas. Las series se
// derivan en cada lectura desde los papeles y las órdenes — como la
// agenda de G-09, la serie es una vista, no otra base.
// ---------------------------------------------------------------------------

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_precios_alertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    serie TEXT NOT NULL DEFAULT '',
    salto TEXT NOT NULL DEFAULT '',
    proveedor_campo TEXT NOT NULL DEFAULT '',
    proveedor_nombre TEXT NOT NULL DEFAULT '',
    familia TEXT NOT NULL DEFAULT '',
    concepto TEXT NOT NULL DEFAULT '',
    concepto_clave TEXT NOT NULL DEFAULT '',
    moneda TEXT NOT NULL DEFAULT '',
    base_monto TEXT NOT NULL DEFAULT '',
    referencia_tipo TEXT NOT NULL DEFAULT '',
    precio_referencia REAL,
    precio_anterior REAL,
    mediana_previa REAL,
    precio_nuevo REAL,
    variacion_pct REAL,
    ultimo_precio REAL,
    ultima_fecha TEXT NOT NULL DEFAULT '',
    texto TEXT NOT NULL DEFAULT '',
    detalle_json TEXT NOT NULL DEFAULT '{}',
    serie_json TEXT NOT NULL DEFAULT '[]',
    estado TEXT NOT NULL DEFAULT 'abierta',
    motivo_cierre TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    vista_en TEXT NOT NULL DEFAULT '',
    cerrada_en TEXT NOT NULL DEFAULT ''
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_precios_alertas_user ON gesty_precios_alertas (user_id, estado, id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_precios_alertas_salto ON gesty_precios_alertas (user_id, salto)');
}

// ---------------------------------------------------------------------------
// Configuración (fundamento · reglas del dueño): el umbral y la
// ventana de comparación. Sin dato cargado mandan los defaults
// declarados, y la respuesta lo dice (es_default).
// ---------------------------------------------------------------------------

function getConfig(db, userId) {
  gesty.ensureSchema(db);
  const dato = gesty.getData(db, userId, { grupo: GRUPO_CONFIG }).find((d) => d.campo === CAMPO_CONFIG);
  const v = dato && dato.valor && typeof dato.valor === 'object' && !Array.isArray(dato.valor) ? dato.valor : {};
  const umbral = Number(v.umbral_pct);
  const ventana = Number(v.ventana_comparacion_dias);
  return {
    umbral_pct: Number.isFinite(umbral) && umbral > 0 ? umbral : UMBRAL_DEFAULT_PCT,
    ventana_comparacion_dias: Number.isInteger(ventana) && ventana >= 1 ? ventana : VENTANA_DEFAULT_DIAS,
    es_default: !dato,
  };
}

function setConfig(db, userId, cambios) {
  const actual = getConfig(db, userId);
  const c = cambios || {};
  const nueva = {
    umbral_pct: c.umbral_pct === undefined ? actual.umbral_pct : Number(c.umbral_pct),
    ventana_comparacion_dias: c.ventana_comparacion_dias === undefined ? actual.ventana_comparacion_dias : Number(c.ventana_comparacion_dias),
  };
  if (!Number.isFinite(nueva.umbral_pct) || nueva.umbral_pct <= 0 || nueva.umbral_pct > 500) {
    fail('El umbral de alerta va de más de 0% a 500%.');
  }
  if (!Number.isInteger(nueva.ventana_comparacion_dias) || nueva.ventana_comparacion_dias < 1 || nueva.ventana_comparacion_dias > 3650) {
    fail('La ventana de comparación va de 1 a 3650 días.');
  }
  gesty.setData(db, userId, {
    grupo: GRUPO_CONFIG, campo: CAMPO_CONFIG, valor: nueva,
    origen: 'dueno', origen_ref: 'ajustes-precios', cargado_por: 'dueno',
  });
  return getConfig(db, userId);
}

// ---------------------------------------------------------------------------
// Los puntos: cada precio observable, con su cita
// ---------------------------------------------------------------------------

function recolectarPuntos(db, userId) {
  const puntos = [];
  const excluidos = { sin_concepto: 0, sin_fecha: 0, sin_monto: 0, remitos: 0, no_leidos: 0 };

  // Comprobantes recibidos (G-03), paginados: listComprobantes ya
  // excluye los duplicados; acá se filtra leído y no-remito.
  let offset = 0;
  const PAGE = 500;
  for (;;) {
    const { comprobantes: lista, total } = comprobantes.listComprobantes(db, userId, { limit: PAGE, offset });
    for (const c of lista) {
      if (c.direccion !== 'recibida') continue;
      if (c.estado_lectura !== 'leido') { excluidos.no_leidos++; continue; }
      if (c.tipo === 'remito') { excluidos.remitos++; continue; }
      const concepto = normTexto(c.concepto);
      if (!concepto) { excluidos.sin_concepto++; continue; }
      if (!esFechaISO(c.fecha)) { excluidos.sin_fecha++; continue; }
      const neto = Number(c.monto_neto);
      const totalM = Number(c.monto_total);
      let precio = null;
      let base = '';
      if (Number.isFinite(neto) && neto > 0) { precio = round2(neto); base = 'neto'; }
      else if (Number.isFinite(totalM) && totalM > 0) { precio = round2(totalM); base = 'total'; }
      if (precio === null) { excluidos.sin_monto++; continue; }
      puntos.push({
        fuente: 'comprobante', id: c.id, fecha: c.fecha, precio, base_monto: base,
        moneda: normTexto(c.moneda) || 'ARS',
        proveedor_campo: proveedores.campoProveedorDe(c.emisor.nombre, c.emisor.cuit),
        proveedor_nombre: c.emisor.nombre || '',
        familia: FAMILIA_COMPROBANTE, concepto,
        cita: {
          tipo: 'comprobante', id: c.id, numero: c.numero || '',
          texto: `comprobante ${c.numero || `#${c.id}`} del ${fmtFecha(c.fecha)}`,
        },
      });
    }
    offset += lista.length;
    if (!lista.length || offset >= total) break;
  }

  // Órdenes de compra (G-10): precio UNITARIO por ítem, con la
  // fuente del precio que la propia orden ya cita. La anulada no
  // es un precio que el negocio haya pagado ni vaya a pagar.
  const { ordenes } = stock.listOrdenesCompra(db, userId, { limit: 1000 });
  for (const o of ordenes) {
    if (o.estado === 'anulada') continue;
    const fecha = String(o.creado_en || '').slice(0, 10);
    if (!esFechaISO(fecha)) continue;
    for (const it of (o.items || [])) {
      const descripcion = normTexto(it.descripcion);
      const precio = Number(it.precio_unitario);
      if (!descripcion || !Number.isFinite(precio) || !(precio > 0)) continue;
      puntos.push({
        fuente: 'orden-compra', id: o.id, fecha, precio: round2(precio), base_monto: 'unitario',
        moneda: normTexto(o.moneda) || 'ARS',
        proveedor_campo: o.proveedor.campo || proveedores.campoProveedorDe(o.proveedor.nombre, o.proveedor.cuit),
        proveedor_nombre: o.proveedor.nombre || '',
        familia: FAMILIA_ORDEN, concepto: descripcion,
        cita: {
          tipo: 'orden-compra', id: o.id, numero: '',
          texto: `orden de compra #${o.id} del ${fmtFecha(fecha)}${it.precio_fuente && it.precio_fuente.texto ? ` (${it.precio_fuente.texto})` : ''}`,
        },
      });
    }
  }
  return { puntos, excluidos };
}

// ---------------------------------------------------------------------------
// Las series: (proveedor, familia, concepto, moneda, base)
// ---------------------------------------------------------------------------

function serieDe(p) {
  return [p.proveedor_campo, p.familia, claveConcepto(p.concepto), p.moneda, p.base_monto].join('|');
}

function construirSeries(puntos) {
  const mapa = new Map();
  for (const p of puntos) {
    const clave = serieDe(p);
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        serie: clave,
        proveedor: { campo: p.proveedor_campo, nombre: p.proveedor_nombre },
        familia: p.familia, concepto: p.concepto, concepto_clave: claveConcepto(p.concepto),
        moneda: p.moneda, base_monto: p.base_monto, puntos: [],
      });
    }
    mapa.get(clave).puntos.push(p);
  }
  const out = [];
  for (const s of mapa.values()) {
    s.puntos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
    const ult = s.puntos[s.puntos.length - 1];
    // El nombre visible es el del papel más reciente (la identidad
    // es el campo; el nombre puede variar entre papeles viejos).
    s.concepto = ult.concepto;
    if (ult.proveedor_nombre) s.proveedor.nombre = ult.proveedor_nombre;
    out.push(s);
  }
  return out.sort((a, b) => a.serie.localeCompare(b.serie));
}

// Las relaciones que NO se fusionan: dos claves de concepto (de la
// misma familia) donde una contiene a la otra. Se declaran para
// que el dueño sepa que existen dos series vecinas — Gesty no las
// une sin evidencia (ver cabecera).
function relacionesNoFusionadas(series) {
  const porFamilia = new Map();
  for (const s of series) {
    if (!porFamilia.has(s.familia)) porFamilia.set(s.familia, new Set());
    porFamilia.get(s.familia).add(s.concepto_clave);
  }
  const out = [];
  for (const [familia, clavesSet] of porFamilia) {
    const claves = [...clavesSet].sort();
    for (let i = 0; i < claves.length; i++) {
      for (let j = 0; j < claves.length; j++) {
        if (i === j) continue;
        const a = claves[i];
        const b = claves[j];
        if (a.length >= 4 && b.includes(a)) {
          out.push({
            familia, contenida: a, contenedora: b,
            motivo: 'una clave contiene a la otra: son series separadas y NO se fusionan sin evidencia — un match dudoso no une dos series',
          });
        }
      }
    }
  }
  return out.slice(0, 50);
}

// La evaluación de una serie contra el umbral: el último precio
// contra el anterior y contra la mediana de los previos.
function evaluarSerie(s, umbral) {
  const pts = s.puntos;
  if (pts.length < 2) return { evaluable: false, motivo: 'sin-base' };
  const nuevo = pts[pts.length - 1];
  const anterior = pts[pts.length - 2];
  const previos = pts.slice(0, -1).map((p) => p.precio);
  const med = previos.length >= 2 ? mediana(previos) : null;
  const pctAnt = round2((nuevo.precio - anterior.precio) / anterior.precio * 100);
  const pctMed = med !== null ? round2((nuevo.precio - med) / med * 100) : null;
  let referencia = { tipo: 'anterior', precio: anterior.precio, pct: pctAnt };
  if (pctMed !== null && pctMed > pctAnt) referencia = { tipo: 'mediana', precio: med, pct: pctMed };
  return {
    evaluable: true, nuevo, anterior, mediana_previa: med,
    pct_anterior: pctAnt, pct_mediana: pctMed, referencia,
    supera: referencia.pct > umbral, baja: pctAnt < 0,
  };
}

function puntoVista(p) {
  return { fuente: p.fuente, id: p.id, fecha: p.fecha, precio: p.precio, cita: p.cita.texto };
}

function serieVista(s, alertaAbiertaId) {
  const pts = s.puntos;
  const primero = pts[0];
  const ultimo = pts[pts.length - 1];
  const ev = evaluarSerie(s, Number.MAX_SAFE_INTEGER); // solo números, sin umbral
  return {
    serie: s.serie,
    proveedor: s.proveedor,
    familia: s.familia,
    concepto: s.concepto,
    concepto_clave: s.concepto_clave,
    moneda: s.moneda,
    base_monto: s.base_monto,
    cantidad: pts.length,
    puntos: pts.map(puntoVista),
    primer_precio: primero.precio, primera_fecha: primero.fecha,
    ultimo_precio: ultimo.precio, ultima_fecha: ultimo.fecha,
    minimo: round2(Math.min(...pts.map((p) => p.precio))),
    maximo: round2(Math.max(...pts.map((p) => p.precio))),
    variacion_ultima_pct: ev.evaluable ? ev.pct_anterior : null,
    variacion_mediana_pct: ev.evaluable ? ev.pct_mediana : null,
    sin_base: !ev.evaluable,
    alerta_abierta_id: alertaAbiertaId || null,
  };
}

// ---------------------------------------------------------------------------
// Alertas — filas y ciclo de vida
// ---------------------------------------------------------------------------

function parseAlertaRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    serie: r.serie, salto: r.salto,
    proveedor: { campo: r.proveedor_campo, nombre: r.proveedor_nombre },
    familia: r.familia, concepto: r.concepto, concepto_clave: r.concepto_clave,
    moneda: r.moneda, base_monto: r.base_monto,
    referencia_tipo: r.referencia_tipo,
    precio_referencia: r.precio_referencia === null ? null : Number(r.precio_referencia),
    precio_anterior: r.precio_anterior === null ? null : Number(r.precio_anterior),
    mediana_previa: r.mediana_previa === null ? null : Number(r.mediana_previa),
    precio_nuevo: r.precio_nuevo === null ? null : Number(r.precio_nuevo),
    variacion_pct: r.variacion_pct === null ? null : Number(r.variacion_pct),
    ultimo_precio: r.ultimo_precio === null ? null : Number(r.ultimo_precio),
    ultima_fecha: r.ultima_fecha || '',
    texto: r.texto || '',
    detalle: safeJson(r.detalle_json, {}),
    serie_citada: safeJson(r.serie_json, []),
    estado: r.estado, motivo_cierre: r.motivo_cierre || '',
    creada_en: r.created_at, actualizada_en: r.updated_at,
    vista_en: r.vista_en || '', cerrada_en: r.cerrada_en || '',
  };
}

function filaAlerta(db, userId, id) {
  const r = db.prepare('SELECT * FROM gesty_precios_alertas WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r || null;
}

function getAlerta(db, userId, id) {
  ensureSchema(db);
  const r = filaAlerta(db, userId, id);
  return r ? parseAlertaRow(r) : null;
}

function alertaAbiertaDe(db, userId, serie) {
  ensureSchema(db);
  const r = db.prepare("SELECT * FROM gesty_precios_alertas WHERE user_id = ? AND serie = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1")
    .get(userId, serie);
  return r ? parseAlertaRow(r) : null;
}

function listAlertas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_precios_alertas WHERE user_id = ? ORDER BY id DESC').all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  const total = rows.length;
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { alertas: rows.slice(off, off + lim).map(parseAlertaRow), total };
}

function textoAlerta(s, ev) {
  const nombre = s.proveedor.nombre || s.proveedor.campo;
  const refTxt = ev.referencia.tipo === 'mediana'
    ? `contra la mediana de la serie ($ ${fmtMonto(ev.mediana_previa)})`
    : `contra el precio anterior del ${fmtFecha(ev.anterior.fecha)} ($ ${fmtMonto(ev.anterior.precio)})`;
  const extra = ev.referencia.tipo === 'anterior' && ev.mediana_previa !== null
    ? ` La mediana de la serie es $ ${fmtMonto(ev.mediana_previa)}.` : '';
  return `${nombre} · ${s.concepto}: el precio subió de $ ${fmtMonto(ev.referencia.precio)} a $ ${fmtMonto(ev.nuevo.precio)} (${fmtPct(ev.referencia.pct)}) ${refTxt}.${extra} Serie: ${s.puntos.length} precios, del ${fmtFecha(s.puntos[0].fecha)} al ${fmtFecha(ev.nuevo.fecha)} — último: ${ev.nuevo.cita.texto}.`;
}

function detalleDe(s, ev, umbral) {
  return {
    anterior: { fuente: ev.anterior.fuente, id: ev.anterior.id, fecha: ev.anterior.fecha, precio: ev.anterior.precio, cita: ev.anterior.cita.texto },
    nuevo: { fuente: ev.nuevo.fuente, id: ev.nuevo.id, fecha: ev.nuevo.fecha, precio: ev.nuevo.precio, cita: ev.nuevo.cita.texto },
    mediana_previa: ev.mediana_previa,
    pct_anterior: ev.pct_anterior, pct_mediana: ev.pct_mediana,
    referencia_tipo: ev.referencia.tipo, umbral_pct: umbral,
  };
}

function crearAlerta(db, userId, s, ev, salto, umbral) {
  const texto = textoAlerta(s, ev);
  const info = db.prepare(`INSERT INTO gesty_precios_alertas
    (user_id, serie, salto, proveedor_campo, proveedor_nombre, familia, concepto, concepto_clave, moneda, base_monto,
     referencia_tipo, precio_referencia, precio_anterior, mediana_previa, precio_nuevo, variacion_pct,
     ultimo_precio, ultima_fecha, texto, detalle_json, serie_json, estado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'abierta')`)
    .run(userId, s.serie, salto, s.proveedor.campo, s.proveedor.nombre, s.familia, s.concepto, s.concepto_clave, s.moneda, s.base_monto,
      ev.referencia.tipo, ev.referencia.precio, ev.anterior.precio, ev.mediana_previa, ev.nuevo.precio, ev.referencia.pct,
      ev.nuevo.precio, ev.nuevo.fecha, texto,
      JSON.stringify(detalleDe(s, ev, umbral)), JSON.stringify(s.puntos.map(puntoVista)));
  const alerta = getAlerta(db, userId, Number(info.lastInsertRowid));
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'precio-alerta', entidad_id: String(alerta.id),
    tipo_evento: 'precio-alerta-creada', resumen: texto,
    payload: {
      serie: s.serie, salto, familia: s.familia, concepto: s.concepto,
      proveedor_campo: s.proveedor.campo, referencia_tipo: ev.referencia.tipo,
      precio_referencia: ev.referencia.precio, precio_nuevo: ev.nuevo.precio, variacion_pct: ev.referencia.pct,
    },
  });
  return alerta;
}

// El salto nuevo sobre la misma serie: la alerta abierta se
// actualiza con los números nuevos (mismo id, su evento propio).
function evolucionarAlerta(db, userId, abierta, s, ev, salto, umbral) {
  const texto = textoAlerta(s, ev);
  db.prepare(`UPDATE gesty_precios_alertas SET salto = ?, proveedor_nombre = ?, concepto = ?,
    referencia_tipo = ?, precio_referencia = ?, precio_anterior = ?, mediana_previa = ?, precio_nuevo = ?, variacion_pct = ?,
    ultimo_precio = ?, ultima_fecha = ?, texto = ?, detalle_json = ?, serie_json = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?`)
    .run(salto, s.proveedor.nombre, s.concepto,
      ev.referencia.tipo, ev.referencia.precio, ev.anterior.precio, ev.mediana_previa, ev.nuevo.precio, ev.referencia.pct,
      ev.nuevo.precio, ev.nuevo.fecha, texto,
      JSON.stringify(detalleDe(s, ev, umbral)), JSON.stringify(s.puntos.map(puntoVista)),
      abierta.id, userId);
  const alerta = getAlerta(db, userId, abierta.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'precio-alerta', entidad_id: String(abierta.id),
    tipo_evento: 'precio-alerta-evolucion',
    resumen: `La alerta de precios evolucionó con un salto nuevo: ${texto}`,
    payload: {
      serie: s.serie, salto, precio_nuevo: ev.nuevo.precio, variacion_pct: ev.referencia.pct,
      referencia_tipo: ev.referencia.tipo,
    },
  });
  return alerta;
}

// Sin salto nuevo: la alerta abierta sigue viva, pero su foto de
// la serie y su último precio quedan al día.
function refrescarAlerta(db, userId, abierta, s, ev) {
  db.prepare(`UPDATE gesty_precios_alertas SET ultimo_precio = ?, ultima_fecha = ?, serie_json = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?`)
    .run(ev.nuevo.precio, ev.nuevo.fecha, JSON.stringify(s.puntos.map(puntoVista)), abierta.id, userId);
  return getAlerta(db, userId, abierta.id);
}

function cerrarPorReversion(db, userId, abierta, s, ultimo, umbral) {
  const motivo = `El precio más reciente ($ ${fmtMonto(ultimo.precio)}, ${fmtFecha(ultimo.fecha)}) ya no supera la referencia de la alerta ($ ${fmtMonto(abierta.precio_referencia)}) más el umbral del ${fmtPct(umbral).replace('+', '')}: el salto revirtió.`;
  db.prepare(`UPDATE gesty_precios_alertas SET estado = 'cerrada-reversion', motivo_cierre = ?, cerrada_en = datetime('now'),
    ultimo_precio = ?, ultima_fecha = ?, serie_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(motivo, ultimo.precio, ultimo.fecha, JSON.stringify(s.puntos.map(puntoVista)), abierta.id, userId);
  const alerta = getAlerta(db, userId, abierta.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'precio-alerta', entidad_id: String(abierta.id),
    tipo_evento: 'precio-alerta-cerrada-reversion',
    resumen: `Alerta de precios cerrada por reversión: ${s.proveedor.nombre || s.proveedor.campo} · ${s.concepto}. ${motivo}`,
    payload: { serie: s.serie, ultimo_precio: ultimo.precio, precio_referencia: abierta.precio_referencia },
  });
  return alerta;
}

// El dueño la vio: la alerta sale de las abiertas y no vuelve a
// nacer por el mismo salto (el índice único la recuerda).
function marcarVista(db, userId, id) {
  ensureSchema(db);
  const fila = filaAlerta(db, userId, id);
  if (!fila) fail('Esa alerta no es de esta cuenta.');
  const actual = parseAlertaRow(fila);
  if (actual.estado === 'cerrada-reversion') fail('Esa alerta ya se cerró sola: el precio revirtió el salto.');
  if (actual.estado === 'vista') return actual;
  db.prepare("UPDATE gesty_precios_alertas SET estado = 'vista', vista_en = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(actual.id, userId);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'precio-alerta', entidad_id: String(actual.id),
    tipo_evento: 'precio-alerta-vista',
    resumen: `El dueño marcó vista la alerta de precios: ${actual.texto}`,
    payload: { serie: actual.serie },
  });
  return getAlerta(db, userId, actual.id);
}

// ---------------------------------------------------------------------------
// El escaneo (explícito; la rutina diaria es de G-21)
// ---------------------------------------------------------------------------

function escanearPrecios(db, userId, opts) {
  ensureSchema(db);
  gesty.ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const config = getConfig(db, userId);
  const umbral = config.umbral_pct;
  const { puntos, excluidos } = recolectarPuntos(db, userId);
  const series = construirSeries(puntos);
  const salida = {
    hoy, config, puntos: puntos.length, excluidos,
    series: series.length, series_evaluadas: 0,
    creadas: [], actualizadas: [], cerradas_reversion: [],
    sin_alerta: [], sin_base: [], ya_surfaceadas: 0,
    relaciones_no_fusionadas: relacionesNoFusionadas(series),
  };
  for (const s of series) {
    const ev = evaluarSerie(s, umbral);
    const abierta = alertaAbiertaDe(db, userId, s.serie);
    if (!ev.evaluable) {
      salida.sin_base.push({
        serie: s.serie, concepto: s.concepto, proveedor: s.proveedor, familia: s.familia,
        motivo: 'la serie tiene un solo precio: todavía no hay contra qué comparar',
      });
      continue;
    }
    salida.series_evaluadas++;
    if (ev.supera) {
      const salto = `${s.serie}|${ev.nuevo.fuente}:${ev.nuevo.id}`;
      if (abierta && abierta.salto === salto) {
        refrescarAlerta(db, userId, abierta, s, ev);
      } else if (abierta) {
        // Si ese salto ya vive en OTRA alerta (vista/cerrada), no se
        // pisa su identidad: la abierta se refresca y se cuenta.
        const choque = db.prepare('SELECT id FROM gesty_precios_alertas WHERE user_id = ? AND salto = ?').get(userId, salto);
        if (choque) { salida.ya_surfaceadas++; refrescarAlerta(db, userId, abierta, s, ev); }
        else salida.actualizadas.push(evolucionarAlerta(db, userId, abierta, s, ev, salto, umbral));
      } else {
        const previa = db.prepare('SELECT id FROM gesty_precios_alertas WHERE user_id = ? AND salto = ?').get(userId, salto);
        if (previa) salida.ya_surfaceadas++;
        else salida.creadas.push(crearAlerta(db, userId, s, ev, salto, umbral));
      }
    } else {
      salida.sin_alerta.push({
        serie: s.serie, concepto: s.concepto, proveedor: s.proveedor, familia: s.familia,
        variacion_pct: ev.referencia.pct, referencia: ev.referencia.tipo, baja: ev.baja,
        motivo: ev.baja ? 'el último precio bajó: queda registrado en la serie, sin alerta (la alerta es de suba)'
          : 'la variación no supera el umbral: silencio registrado, jamás notificado',
      });
      if (abierta) {
        if (ev.nuevo.precio <= round2(abierta.precio_referencia * (1 + umbral / 100))) {
          salida.cerradas_reversion.push(cerrarPorReversion(db, userId, abierta, s, ev.nuevo, umbral));
        } else {
          refrescarAlerta(db, userId, abierta, s, ev);
        }
      }
    }
  }
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'precios', entidad_id: 'auditoria',
    tipo_evento: 'precios-escaneo',
    resumen: `Auditoría de precios: ${series.length} series sobre ${puntos.length} precios · ${salida.creadas.length} alertas nuevas · ${salida.actualizadas.length} evolucionadas · ${salida.cerradas_reversion.length} cerradas por reversión · ${salida.sin_base.length} series sin base`,
    payload: {
      series: series.length, puntos: puntos.length,
      creadas: salida.creadas.length, actualizadas: salida.actualizadas.length,
      cerradas_reversion: salida.cerradas_reversion.length, sin_base: salida.sin_base.length,
      sin_alerta: salida.sin_alerta.length, umbral_pct: umbral,
    },
  });
  return salida;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

function listSeries(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const { puntos } = recolectarPuntos(db, userId);
  let series = construirSeries(puntos);
  if (o.proveedor) series = series.filter((s) => s.proveedor.campo === String(o.proveedor));
  if (o.familia) series = series.filter((s) => s.familia === String(o.familia));
  if (o.q) { const q = claveConcepto(o.q); if (q) series = series.filter((s) => s.concepto_clave.includes(q)); }
  const abiertas = new Map();
  for (const a of listAlertas(db, userId, { estado: 'abierta', limit: 1000 }).alertas) abiertas.set(a.serie, a.id);
  const vistas = series.map((s) => serieVista(s, abiertas.get(s.serie) || null));
  return { series: vistas, total: vistas.length, relaciones_no_fusionadas: relacionesNoFusionadas(series) };
}

function getSerie(db, userId, serieClave) {
  ensureSchema(db);
  const { puntos } = recolectarPuntos(db, userId);
  const s = construirSeries(puntos).find((x) => x.serie === String(serieClave || ''));
  if (!s) return null;
  const abierta = alertaAbiertaDe(db, userId, s.serie);
  return serieVista(s, abierta ? abierta.id : null);
}

// La comparación entre proveedores: mismo (familia, concepto,
// moneda, base) en ≥2 proveedores, último precio de cada uno
// dentro de la ventana. Información para decidir — ninguna
// sugerencia sale de acá (ver cabecera).
function compararProveedores(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const config = getConfig(db, userId);
  const dias = Number.isInteger(Number(o.dias)) && Number(o.dias) >= 1 ? Number(o.dias) : config.ventana_comparacion_dias;
  const desde = sumarDias(hoy, -dias);
  const { puntos } = recolectarPuntos(db, userId);
  const grupos = new Map();
  for (const p of puntos) {
    if (p.fecha < desde || p.fecha > hoy) continue;
    const gk = [p.familia, claveConcepto(p.concepto), p.moneda, p.base_monto].join('|');
    if (!grupos.has(gk)) {
      grupos.set(gk, {
        familia: p.familia, concepto: p.concepto, concepto_clave: claveConcepto(p.concepto),
        moneda: p.moneda, base_monto: p.base_monto, por_proveedor: new Map(),
      });
    }
    const g = grupos.get(gk);
    const prev = g.por_proveedor.get(p.proveedor_campo);
    if (!prev || p.fecha > prev.fecha || (p.fecha === prev.fecha && p.id > prev.id)) {
      g.por_proveedor.set(p.proveedor_campo, p);
      g.concepto = p.concepto;
    }
  }
  const comparaciones = [];
  for (const g of grupos.values()) {
    if (g.por_proveedor.size < 2) continue;
    const precios = [...g.por_proveedor.values()]
      .map((p) => ({
        proveedor: { campo: p.proveedor_campo, nombre: p.proveedor_nombre },
        precio: p.precio, fecha: p.fecha, cita: p.cita.texto,
      }))
      .sort((a, b) => a.precio - b.precio);
    const min = precios[0];
    const max = precios[precios.length - 1];
    comparaciones.push({
      familia: g.familia, concepto: g.concepto, concepto_clave: g.concepto_clave,
      moneda: g.moneda, base_monto: g.base_monto, precios,
      diferencia_pct: round2((max.precio - min.precio) / min.precio * 100),
      mas_barato: min.proveedor, mas_caro: max.proveedor,
    });
  }
  comparaciones.sort((a, b) => b.diferencia_pct - a.diferencia_pct);
  return {
    hoy, ventana: { desde, hasta: hoy, dias },
    comparaciones,
    relaciones_no_fusionadas: relacionesNoFusionadas(construirSeries(puntos)),
    nota: 'Comparación informativa: Gesty no sugiere cambiar de proveedor — muestra los precios lado a lado y la decisión es del dueño.',
  };
}

// El resumen para «La oficina»: la foto de la auditoría, solo de
// registros reales.
function resumenPrecios(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const abiertas = listAlertas(db, userId, { estado: 'abierta', limit: 1000 }).alertas;
  const vistas = listAlertas(db, userId, { estado: 'vista', limit: 1 }).total;
  const cerradas = listAlertas(db, userId, { estado: 'cerrada-reversion', limit: 1 }).total;
  const { puntos } = recolectarPuntos(db, userId);
  const series = construirSeries(puntos);
  const escaneos = gesty.listEvents(db, userId, { entidad_tipo: 'precios', entidad_id: 'auditoria' })
    .filter((e) => e.tipo_evento === 'precios-escaneo');
  const ultimo = escaneos.length ? escaneos[escaneos.length - 1] : null;
  return {
    hoy,
    config: getConfig(db, userId),
    alertas_abiertas: abiertas.length,
    alertas_vistas: vistas,
    alertas_cerradas_reversion: cerradas,
    peores_abiertas: abiertas
      .slice().sort((a, b) => (b.variacion_pct || 0) - (a.variacion_pct || 0)).slice(0, 3)
      .map((a) => ({ id: a.id, texto: a.texto, variacion_pct: a.variacion_pct, proveedor: a.proveedor, concepto: a.concepto })),
    series_con_precios: series.length,
    series_evaluables: series.filter((s) => s.puntos.length >= 2).length,
    series_sin_base: series.filter((s) => s.puntos.length < 2).length,
    comparaciones_disponibles: compararProveedores(db, userId, { hoy }).comparaciones.length,
    ultimo_escaneo: ultimo ? { fecha: ultimo.created_at, resumen: ultimo.resumen } : null,
  };
}

// ---------------------------------------------------------------------------

module.exports = {
  // constantes
  UMBRAL_DEFAULT_PCT, VENTANA_DEFAULT_DIAS, FAMILIAS, ESTADOS_ALERTA,
  // esquema
  ensureSchema,
  // configuración (fundamento)
  getConfig, setConfig,
  // escaneo
  escanearPrecios,
  // alertas
  listAlertas, getAlerta, marcarVista,
  // consultas
  listSeries, getSerie, compararProveedores, resumenPrecios,
  // piezas internas, exportadas para tests y reuso
  recolectarPuntos, construirSeries, evaluarSerie, claveConcepto, serieDe,
};
