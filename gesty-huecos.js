// =====================================================================
// GESTY · G-18 — DETECTOR DE HUECOS
// Spec: gesty-cola-builds.md G-18 («correlatividad de facturas
// propias: número faltante = alerta con el rango exacto; proveedor
// habitual que no facturó en su ciclo; entran como faltantes
// tipados del cierre» — aceptación: «hueco sembrado detectado el
// mismo día del cierre con número exacto; proveedor ausente
// detectado al vencer su ciclo + gracia; cero alertas sobre
// series completas») · gesty-sistema-operativo.md (detectar y
// registrar es autopilot; este build NO envía nada a nadie: su
// salida es el faltante para el dueño y para el cierre).
//
// TRES DETECTORES, UNA SOLA FORMA DE SALIDA. Todo hueco nace como
// registro durable tipado con la forma del acople de G-15 —
// { tipo, clave, dato_que_falta, detalle, ids } — para que el
// cierre (G-06) y la carpeta del contador (G-15) lo consuman sin
// raspar textos. La vista unificada `faltantesDelPeriodo` junta
// los huecos propios con los que ya devuelve
// contador.faltantesParaDetector (cierre + pedidos del contador)
// SIN modificar G-06 ni G-15: este módulo consume sus contratos.
//
// DETECTOR 1 · CORRELATIVIDAD DE FACTURAS PROPIAS. La serie se
// arma con los números REALES que el negocio ya tiene: las
// facturas de G-04 que pasaron por un emisor (emision.numero —
// la numeración interna de borrador B-0001 NO es correlatividad
// fiscal y no se audita) y los papeles emitidos leídos por G-03.
// Se agrupa por tipo/letra/punto de venta cuando el dato existe
// (un papel de G-03 sin letra se fusiona con la serie de G-04
// del mismo punto de venta SOLO si comparten al menos un número
// — sin evidencia no se fusiona). Entre el mínimo y el máximo
// observados, cada número ausente es hueco con su rango EXACTO.
// La serie parcial es honesta: se juzga solo entre lo conocido,
// jamás se presume el inicio. Una factura ANULADA con su motivo
// registrado (G-04) no es hueco: es hueco EXPLICADO — sale de la
// serie válida, entra en `explicados` del escaneo con su motivo
// y nunca alerta.
//
// DETECTOR 2 · PROVEEDOR HABITUAL QUE NO FACTURÓ. De los
// comprobantes recibidos (G-03) se deriva el ritmo observado de
// cada proveedor: ciclo típico = MEDIANA de los intervalos entre
// comprobantes consecutivos. BASE MÍNIMA DECLARADA: 3
// comprobantes con fecha — con menos, no hay ciclo inferible y
// el proveedor se declara «sin base» en el escaneo, sin alerta.
// TOLERANCIA DECLARADA: el ciclo vence recién a los
// max(7 días, 25% del ciclo) posteriores a la fecha esperada
// (último comprobante + un ciclo). El faltante cita su base:
// cuántos comprobantes, cada cuánto, cuándo era el esperado.
//
// DETECTOR 3 · PAPELES ESPERADOS DEL FUNDAMENTO. Solo datos
// ESTRUCTURADOS: grupo «papeles-esperados», cada dato un objeto
// { concepto, periodicidad: 'mensual', contraparte_cuit?,
// contraparte_nombre?, tipo? }. Una regla en texto libre NO
// genera faltante (patrón de honestidad de G-06/G-09): se cuenta
// como «no estructurado» en el escaneo. Solo alertan los
// períodos CERRADOS (anteriores al mes en curso): el mes en
// curso se declara «en curso» — el papel todavía puede llegar.
//
// RESOLUCIÓN. Un hueco se resuelve cuando el papel aparece
// (re-escaneo: el número entró a la serie / el proveedor volvió
// a facturar / el papel del período está — queda el vínculo al
// comprobante) o cuando el dueño lo explica con una nota
// (explicarHueco, queda en el registro). Re-escanear NO duplica
// un hueco abierto NI resucita uno resuelto: si el número sigue
// faltando pero el hueco ya fue explicado, no se crea otro.
//
// RELOJ INYECTABLE: todo el escaneo acepta opts.hoy — ningún
// cálculo usa la fecha del sistema cuando el llamador pasó la
// suya (lección del fix de Cobranzas G-08). La corrida diaria
// la agenda G-21; acá el disparo es explícito.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const comprobantes = require('./gesty-comprobantes');
const facturacion = require('./gesty-facturacion');
const reportes = require('./gesty-reportes');
const contador = require('./gesty-contador');

// ---------------------------------------------------------------------------
// Constantes declaradas (ver cabecera)
// ---------------------------------------------------------------------------

const BASE_MINIMA_PROVEEDOR = 3;      // comprobantes para inferir un ciclo
const GRACIA_MIN_DIAS = 7;            // tolerancia mínima tras la fecha esperada
const GRACIA_FRACCION = 0.25;         // tolerancia = max(7, 25% del ciclo)
const GRUPO_PAPELES = 'papeles-esperados';
const TIPOS_HUECO = ['numeracion', 'proveedor', 'fundamento'];

// ---------------------------------------------------------------------------
// Utilidades (el patrón de la casa)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function addDias(iso, n) {
  const t = Date.parse(String(iso).slice(0, 10)) + Number(n) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function diffDias(a, b) {
  if (!esFechaISO(a) || !esFechaISO(b)) return null;
  return Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 86400000);
}
function safeJson(s, def) { try { const v = JSON.parse(s); return v === null || v === undefined ? def : v; } catch (e) { return def; } }
function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function hoyDe(opts) { const o = opts || {}; return esFechaISO(o.hoy) ? String(o.hoy) : hoyISO(); }
function periodoDe(fechaISO) { return String(fechaISO || '').slice(0, 7); }
function mediana(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// ---------------------------------------------------------------------------
// Esquema propio (idempotente): los huecos durables.
// ---------------------------------------------------------------------------

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_huecos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT '',
    clave TEXT NOT NULL DEFAULT '',
    periodo TEXT NOT NULL DEFAULT '',
    dato_que_falta TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '',
    ids TEXT NOT NULL DEFAULT '[]',
    extra TEXT NOT NULL DEFAULT '{}',
    estado TEXT NOT NULL DEFAULT 'abierto',
    resolucion TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_huecos_clave ON gesty_huecos (user_id, clave)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_huecos_user_periodo ON gesty_huecos (user_id, periodo, estado)');
}

// ---------------------------------------------------------------------------
// Entidad hueco — lectura
// ---------------------------------------------------------------------------

function parseHuecoRow(r) {
  if (!r) return null;
  return {
    id: r.id, user_id: r.user_id,
    tipo: r.tipo, clave: r.clave, periodo: r.periodo || '',
    dato_que_falta: r.dato_que_falta || '', detalle: r.detalle || '',
    ids: safeJson(r.ids, []),
    extra: safeJson(r.extra, {}),
    estado: r.estado || 'abierto',
    resolucion: r.resolucion ? safeJson(r.resolucion, null) : null,
    detectado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function getHueco(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_huecos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r ? parseHuecoRow(r) : null;
}

function huecoPorClave(db, userId, clave) {
  const r = db.prepare('SELECT * FROM gesty_huecos WHERE user_id = ? AND clave = ?').get(userId, String(clave));
  return r ? parseHuecoRow(r) : null;
}

function listHuecos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const rows = db.prepare('SELECT * FROM gesty_huecos WHERE user_id = ? ORDER BY id ASC').all(userId);
  let out = rows.map(parseHuecoRow);
  if (o.periodo) out = out.filter((h) => h.periodo === String(o.periodo));
  if (o.estado) out = out.filter((h) => h.estado === String(o.estado));
  if (o.tipo) out = out.filter((h) => h.tipo === String(o.tipo));
  const total = out.length;
  const lim = Math.min(Math.max(Number(o.limit) || 500, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { huecos: out.slice(off, off + lim), total };
}

function crearHueco(db, userId, datos) {
  const info = db.prepare(`INSERT INTO gesty_huecos
    (user_id, tipo, clave, periodo, dato_que_falta, detalle, ids, extra)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(userId, datos.tipo, datos.clave, datos.periodo || '',
      datos.dato_que_falta || '', datos.detalle || '',
      JSON.stringify(datos.ids || []), JSON.stringify(datos.extra || {}));
  const h = getHueco(db, userId, Number(info.lastInsertRowid));
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'hueco', entidad_id: String(h.id),
    tipo_evento: 'hueco-detectado',
    resumen: `Hueco detectado: ${h.dato_que_falta}`,
    payload: { tipo: h.tipo, clave: h.clave, periodo: h.periodo },
  });
  return h;
}

function actualizarHueco(db, userId, h, cambios) {
  db.prepare(`UPDATE gesty_huecos SET dato_que_falta = ?, detalle = ?, ids = ?, extra = ?, periodo = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?`)
    .run(cambios.dato_que_falta !== undefined ? cambios.dato_que_falta : h.dato_que_falta,
      cambios.detalle !== undefined ? cambios.detalle : h.detalle,
      JSON.stringify(cambios.ids !== undefined ? cambios.ids : h.ids),
      JSON.stringify(cambios.extra !== undefined ? cambios.extra : h.extra),
      cambios.periodo !== undefined ? cambios.periodo : h.periodo,
      h.id, userId);
  return getHueco(db, userId, h.id);
}

function resolverHueco(db, userId, h, resolucion, tipoEvento, resumen) {
  db.prepare(`UPDATE gesty_huecos SET estado = ?, resolucion = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(resolucion.estado, JSON.stringify(resolucion), h.id, userId);
  const nuevo = getHueco(db, userId, h.id);
  gesty.recordEvent(db, userId, {
    actor: resolucion.tipo === 'nota' ? 'dueno' : 'gesty',
    entidad_tipo: 'hueco', entidad_id: String(h.id),
    tipo_evento: tipoEvento,
    resumen,
    payload: { tipo: h.tipo, clave: h.clave, resolucion: resolucion.tipo, comprobante_id: resolucion.comprobante_id || null },
  });
  return nuevo;
}

// ---------------------------------------------------------------------------
// Números de comprobante: parseo y formato. El número fiscal
// argentino trae punto de venta y número (0001-00000123), a veces
// precedido de la letra (A0001-00000123); un número pelado se
// acepta como serie sin punto de venta declarado. Lo que no se
// puede parsear NO se juzga: se cuenta como no juzgable.
// ---------------------------------------------------------------------------

function parseNumero(v) {
  const s = normTexto(v).toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  let m = /^([A-Z])?(\d{1,5})-(\d{1,8})$/.exec(s);
  if (m) return { letra: m[1] || '', punto_venta: Number(m[2]), numero: Number(m[3]) };
  m = /^(\d{1,8})$/.exec(s);
  if (m) return { letra: '', punto_venta: null, numero: Number(m[1]) };
  return null;
}

function fmtNumero(p, ancho) {
  if (!p) return '';
  const num = String(p.numero).padStart(ancho || 8, '0');
  return p.punto_venta !== null && p.punto_venta !== undefined
    ? `${String(p.punto_venta).padStart(4, '0')}-${num}` : num;
}

// ---------------------------------------------------------------------------
// DETECTOR 1 · la serie de facturas propias
// ---------------------------------------------------------------------------

function todosLosComprobantes(db, userId) {
  const out = [];
  let offset = 0;
  for (;;) {
    const { comprobantes: pagina, total } = comprobantes.listComprobantes(db, userId, { limit: 500, offset });
    out.push(...pagina);
    offset += pagina.length;
    if (!pagina.length || out.length >= total || out.length >= 5000) break;
  }
  return out;
}

// Arma las series: Map clave -> { clave, etiqueta, letra,
// punto_venta, conocidos: Map numero -> {numero, fecha, fuentes:[]},
// explicados: Map numero -> {motivo, factura_id} }
function armarSeries(db, userId, papeles) {
  const series = new Map();
  let noJuzgables = 0;
  const nuevaSerie = (clave, etiqueta, letra, pv) => {
    if (!series.has(clave)) series.set(clave, { clave, etiqueta, letra: letra || '', punto_venta: pv, conocidos: new Map(), explicados: new Map() });
    return series.get(clave);
  };
  const agregarConocido = (serie, p, fecha, fuente) => {
    const prev = serie.conocidos.get(p.numero);
    if (prev) { prev.fuentes.push(fuente); if (!prev.fecha && fecha) prev.fecha = fecha; }
    else serie.conocidos.set(p.numero, { numero: p.numero, fecha: fecha || '', fuentes: [fuente] });
  };

  // (a) G-04: facturas que pasaron por un emisor (número real).
  const { facturas } = facturacion.listFacturas(db, userId, { limit: 1000 });
  for (const f of facturas) {
    if (!['lista-para-emitir', 'enviada', 'cobrada', 'anulada'].includes(f.estado)) continue;
    const numEmision = f.emision && f.emision.numero !== null && f.emision.numero !== undefined ? f.emision.numero : null;
    if (numEmision === null || numEmision === '') continue;
    const p = parseNumero(numEmision);
    if (!p) { noJuzgables++; continue; }
    const letra = (normTexto(f.letra).toUpperCase() || p.letra || '');
    const clave = `g04|${normTexto(f.tipo_comprobante).toLowerCase() || 'factura'}|${letra}|${p.punto_venta === null ? 'sin-pv' : p.punto_venta}`;
    const etiqueta = `${normTexto(f.tipo_comprobante) || 'Factura'}${letra ? ' ' + letra : ''} · ${p.punto_venta === null ? 'sin punto de venta declarado' : 'punto de venta ' + String(p.punto_venta).padStart(4, '0')}`;
    const serie = nuevaSerie(clave, etiqueta, letra, p.punto_venta);
    if (f.estado === 'anulada' && normTexto(f.motivo_anulacion)) {
      serie.explicados.set(p.numero, { motivo: f.motivo_anulacion, factura_id: f.id });
    } else {
      agregarConocido(serie, p, f.fecha, { fuente: 'g04', factura_id: f.id });
    }
  }

  // (b) G-03: papeles emitidos leídos (la lectura dudosa no juzga).
  const gruposPapel = new Map();
  for (const c of papeles) {
    if (c.tipo !== 'factura-emitida' || c.estado_lectura !== 'leido') continue;
    const p = parseNumero(c.numero);
    if (!p) { noJuzgables++; continue; }
    const clave = `g03|${p.letra}|${p.punto_venta === null ? 'sin-pv' : p.punto_venta}`;
    if (!gruposPapel.has(clave)) {
      gruposPapel.set(clave, {
        letra: p.letra, punto_venta: p.punto_venta,
        etiqueta: `Comprobantes emitidos (papeles) · ${p.punto_venta === null ? 'sin punto de venta declarado' : 'punto de venta ' + String(p.punto_venta).padStart(4, '0')}`,
        conocidos: new Map(),
      });
    }
    const g = gruposPapel.get(clave);
    const prev = g.conocidos.get(p.numero);
    if (prev) prev.fuentes.push({ fuente: 'g03', comprobante_id: c.id });
    else g.conocidos.set(p.numero, { numero: p.numero, fecha: c.fecha || '', fuentes: [{ fuente: 'g03', comprobante_id: c.id }] });
  }
  // Fusión papel → G-04 SOLO con evidencia: mismo punto de venta,
  // letra compatible y al menos un número compartido; si el grupo
  // de papeles toca dos series de G-04, no se fusiona con ninguna.
  for (const [clavePapel, g] of gruposPapel) {
    const candidatas = [];
    for (const s of series.values()) {
      if (!s.clave.startsWith('g04|')) continue;
      if (s.punto_venta !== g.punto_venta) continue;
      if (g.letra && s.letra && g.letra !== s.letra) continue;
      const comparte = [...g.conocidos.keys()].some((n) => s.conocidos.has(n) || s.explicados.has(n));
      if (comparte) candidatas.push(s);
    }
    if (candidatas.length === 1) {
      const s = candidatas[0];
      for (const [n, ref] of g.conocidos) {
        const prev = s.conocidos.get(n);
        if (prev) prev.fuentes.push(...ref.fuentes);
        else s.conocidos.set(n, ref);
      }
    } else {
      const s = nuevaSerie(clavePapel, g.etiqueta, g.letra, g.punto_venta);
      for (const [n, ref] of g.conocidos) s.conocidos.set(n, ref);
    }
  }
  return { series, noJuzgables };
}

// Los rangos faltantes de una serie: números entre el mínimo y el
// máximo conocidos que no están ni conocidos ni explicados,
// agrupados en rangos contiguos.
function rangosFaltantes(serie) {
  const nums = [...serie.conocidos.keys()].sort((a, b) => a - b);
  if (nums.length < 2) return [];
  const faltan = [];
  for (let n = nums[0] + 1; n < nums[nums.length - 1]; n++) {
    if (!serie.conocidos.has(n) && !serie.explicados.has(n)) faltan.push(n);
  }
  const rangos = [];
  for (const n of faltan) {
    const ult = rangos[rangos.length - 1];
    if (ult && n === ult.hasta + 1) ult.hasta = n;
    else rangos.push({ desde: n, hasta: n });
  }
  return rangos.map((r) => {
    const numeros = [];
    for (let n = r.desde; n <= r.hasta; n++) numeros.push(n);
    const anterior = serie.conocidos.get(Math.max(...[...serie.conocidos.keys()].filter((x) => x < r.desde))) || null;
    const siguiente = serie.conocidos.get(Math.min(...[...serie.conocidos.keys()].filter((x) => x > r.hasta))) || null;
    return { ...r, numeros, anterior, siguiente };
  });
}

function textoRango(serie, rango) {
  const lista = rango.numeros.map((n) => fmtNumero({ punto_venta: serie.punto_venta, numero: n })).join(', ');
  return lista;
}

function detalleNumeracion(serie, rango) {
  const lista = textoRango(serie, rango);
  const ant = rango.anterior ? `el ${fmtNumero({ punto_venta: serie.punto_venta, numero: rango.anterior.numero })}${rango.anterior.fecha ? ' del ' + rango.anterior.fecha : ''}` : 'el inicio conocido';
  const sig = rango.siguiente ? `el ${fmtNumero({ punto_venta: serie.punto_venta, numero: rango.siguiente.numero })}${rango.siguiente.fecha ? ' del ' + rango.siguiente.fecha : ''}` : 'el último conocido';
  return `En la serie ${serie.etiqueta} faltan los comprobantes ${lista}: entre ${ant} y ${sig} no hay registro de ${rango.numeros.length === 1 ? 'ese número' : 'esos números'}. Si se emitieron y no llegaron a Gesty, el papel falta; si se anularon, queda explicado con una nota.`;
}

function detectarNumeracion(db, userId, series, salida) {
  for (const serie of series.values()) {
    const rangos = rangosFaltantes(serie);
    // Explicados dentro del rango observado: se reportan, no alertan.
    const nums = [...serie.conocidos.keys()].sort((a, b) => a - b);
    if (nums.length >= 2) {
      for (const [n, ex] of serie.explicados) {
        if (n > nums[0] && n < nums[nums.length - 1]) {
          salida.explicados.push({
            serie: serie.etiqueta, numero: fmtNumero({ punto_venta: serie.punto_venta, numero: n }),
            motivo: ex.motivo, factura_id: ex.factura_id,
          });
        }
      }
    }
    const clavesVivas = new Set();
    for (const rango of rangos) {
      const clave = `numeracion:${serie.clave}:${rango.desde}`;
      clavesVivas.add(clave);
      const periodo = periodoDe((rango.siguiente && rango.siguiente.fecha) || (rango.anterior && rango.anterior.fecha) || '');
      const ids = [];
      for (const ref of [rango.anterior, rango.siguiente]) {
        if (!ref) continue;
        for (const f of ref.fuentes) if (f.comprobante_id) ids.push(f.comprobante_id);
      }
      const datos = {
        dato_que_falta: `los comprobantes ${textoRango(serie, rango)} de la serie ${serie.etiqueta}`,
        detalle: detalleNumeracion(serie, rango),
        ids,
        periodo,
        extra: {
          serie_clave: serie.clave, serie: serie.etiqueta,
          desde_numero: rango.desde, hasta_numero: rango.hasta, numeros: rango.numeros,
          anterior: rango.anterior ? { numero: rango.anterior.numero, fecha: rango.anterior.fecha } : null,
          siguiente: rango.siguiente ? { numero: rango.siguiente.numero, fecha: rango.siguiente.fecha } : null,
        },
      };
      const previo = huecoPorClave(db, userId, clave);
      if (!previo) {
        salida.creados.push(crearHueco(db, userId, { tipo: 'numeracion', clave, ...datos }));
      } else if (previo.estado === 'abierto') {
        if (previo.extra.hasta_numero !== rango.hasta || previo.detalle !== datos.detalle) {
          salida.actualizados.push(actualizarHueco(db, userId, previo, datos));
        }
      }
      // resuelto con la misma clave: no se resucita (ver cabecera).
    }
    // Resolución: huecos abiertos de esta serie cuyo ancla ya entró.
    const abiertos = listHuecos(db, userId, { tipo: 'numeracion', estado: 'abierto', limit: 1000 }).huecos
      .filter((h) => h.extra && h.extra.serie_clave === serie.clave);
    for (const h of abiertos) {
      if (clavesVivas.has(h.clave)) continue;
      const ancla = Number(h.extra.desde_numero);
      const ref = serie.conocidos.get(ancla);
      const explicado = serie.explicados.get(ancla);
      if (ref) {
        const compId = (ref.fuentes.find((f) => f.comprobante_id) || {}).comprobante_id || null;
        const factId = (ref.fuentes.find((f) => f.factura_id) || {}).factura_id || null;
        salida.resueltos.push(resolverHueco(db, userId, h, {
          estado: 'resuelto-papel', tipo: 'papel', comprobante_id: compId, factura_id: factId,
        }, 'hueco-resuelto', `Hueco resuelto: apareció el comprobante ${fmtNumero({ punto_venta: serie.punto_venta, numero: ancla })} de la serie ${serie.etiqueta}.`));
      } else if (explicado) {
        salida.resueltos.push(resolverHueco(db, userId, h, {
          estado: 'resuelto-nota', tipo: 'anulada', nota: explicado.motivo, factura_id: explicado.factura_id,
        }, 'hueco-explicado', `Hueco explicado: el comprobante ${fmtNumero({ punto_venta: serie.punto_venta, numero: ancla })} de la serie ${serie.etiqueta} estaba anulado (${explicado.motivo}).`));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// DETECTOR 2 · el ritmo de cada proveedor (desde G-03 recibidos)
// ---------------------------------------------------------------------------

function claveProveedor(c) {
  const cuit = String((c.emisor && c.emisor.cuit) || '').replace(/\D/g, '');
  if (cuit) return `cuit_${cuit}`;
  return `nombre_${slug(c.emisor && c.emisor.nombre)}`;
}

function ritmosProveedores(papeles) {
  const grupos = new Map();
  for (const c of papeles) {
    if (c.tipo !== 'factura-recibida' || c.estado_lectura !== 'leido' || !esFechaISO(c.fecha)) continue;
    const key = claveProveedor(c);
    if (!grupos.has(key)) {
      grupos.set(key, {
        key, nombre: normTexto(c.emisor && c.emisor.nombre) || 'Proveedor sin nombre',
        cuit: String((c.emisor && c.emisor.cuit) || '').replace(/\D/g, ''),
        fechas: [], ids: [],
      });
    }
    const g = grupos.get(key);
    g.fechas.push(c.fecha);
    g.ids.push(c.id);
    if (c.fecha >= (g.ultima_fecha || '')) { g.ultima_fecha = c.fecha; g.ultimo_id = c.id; }
    if (!g.nombre && c.emisor && c.emisor.nombre) g.nombre = normTexto(c.emisor.nombre);
  }
  const ritmos = [];
  const sinBase = [];
  for (const g of grupos.values()) {
    const fechas = g.fechas.slice().sort();
    const distintas = [...new Set(fechas)];
    if (distintas.length < BASE_MINIMA_PROVEEDOR) {
      sinBase.push({ proveedor: g.nombre, cuit: g.cuit, comprobantes: distintas.length, motivo: 'base-insuficiente' });
      continue;
    }
    const intervalos = [];
    for (let i = 1; i < distintas.length; i++) intervalos.push(diffDias(distintas[i - 1], distintas[i]));
    const ciclo = mediana(intervalos);
    if (!ciclo || ciclo <= 0) {
      sinBase.push({ proveedor: g.nombre, cuit: g.cuit, comprobantes: distintas.length, motivo: 'sin-ciclo-inferible' });
      continue;
    }
    const ultima = distintas[distintas.length - 1];
    const esperada = addDias(ultima, ciclo);
    const tolerancia = Math.max(GRACIA_MIN_DIAS, Math.ceil(ciclo * GRACIA_FRACCION));
    ritmos.push({
      ...g, fechas: distintas, base: distintas.length, ciclo_dias: ciclo,
      ultima_fecha: ultima, fecha_esperada: esperada, tolerancia_dias: tolerancia,
      fecha_limite: addDias(esperada, tolerancia),
    });
  }
  return { ritmos, sinBase };
}

function detalleProveedor(r, hoy) {
  const atraso = diffDias(r.fecha_limite, hoy);
  return `${r.nombre} factura cada ~${r.ciclo_dias} días (${r.base} comprobantes observados; el último, el ${r.ultima_fecha}). Se esperaba su comprobante hacia el ${r.fecha_esperada} y, con la gracia de ${r.tolerancia_dias} días, el ciclo venció el ${r.fecha_limite}: al ${hoy} no llegó (atraso de ${atraso} día(s)). Puede ser un papel que no entró a Gesty o un ciclo que cambió.`;
}

function detectarProveedores(db, userId, papeles, hoy, salida) {
  const { ritmos, sinBase } = ritmosProveedores(papeles);
  salida.sin_base.push(...sinBase);
  const porKey = new Map(ritmos.map((r) => [r.key, r]));
  for (const r of ritmos) {
    if (hoy <= r.fecha_limite) continue;
    const clave = `proveedor:${r.key}:${r.fecha_esperada}`;
    const datos = {
      dato_que_falta: `el comprobante del ciclo de ${r.nombre} (esperado hacia el ${r.fecha_esperada})`,
      detalle: detalleProveedor(r, hoy),
      ids: r.ids,
      periodo: periodoDe(r.fecha_esperada),
      extra: {
        proveedor_key: r.key, proveedor: r.nombre, cuit: r.cuit,
        base_comprobantes: r.base, ciclo_dias: r.ciclo_dias,
        ultima_fecha: r.ultima_fecha, fecha_esperada: r.fecha_esperada,
        tolerancia_dias: r.tolerancia_dias, fecha_limite: r.fecha_limite,
      },
    };
    const previo = huecoPorClave(db, userId, clave);
    if (!previo) salida.creados.push(crearHueco(db, userId, { tipo: 'proveedor', clave, ...datos }));
    else if (previo.estado === 'abierto' && previo.detalle !== datos.detalle) {
      salida.actualizados.push(actualizarHueco(db, userId, previo, datos));
    }
  }
  // Resolución: el proveedor volvió a facturar después de la base.
  const abiertos = listHuecos(db, userId, { tipo: 'proveedor', estado: 'abierto', limit: 1000 }).huecos;
  for (const h of abiertos) {
    const r = porKey.get(h.extra && h.extra.proveedor_key);
    if (!r) continue;
    if (r.ultima_fecha > (h.extra.ultima_fecha || '')) {
      const compId = r.ultimo_id || null;
      salida.resueltos.push(resolverHueco(db, userId, h, {
        estado: 'resuelto-papel', tipo: 'papel', comprobante_id: compId,
      }, 'hueco-resuelto', `Hueco resuelto: ${r.nombre} volvió a facturar (comprobante del ${r.ultima_fecha}).`));
    }
  }
  return ritmos.length;
}

// ---------------------------------------------------------------------------
// DETECTOR 3 · papeles esperados del fundamento (estructurados)
// ---------------------------------------------------------------------------

function papelesEsperados(db, userId) {
  const datos = gesty.getData(db, userId, { grupo: GRUPO_PAPELES });
  const validos = [];
  let noEstructurados = 0;
  for (const d of datos) {
    const v = d.valor;
    if (!v || typeof v !== 'object' || Array.isArray(v)) { noEstructurados++; continue; }
    const periodicidad = normTexto(v.periodicidad || 'mensual').toLowerCase();
    const concepto = normTexto(v.concepto) || d.campo;
    const cuit = String(v.contraparte_cuit || '').replace(/\D/g, '');
    const nombre = normTexto(v.contraparte_nombre);
    if (periodicidad !== 'mensual' || (!cuit && !nombre && !normTexto(v.concepto))) { noEstructurados++; continue; }
    validos.push({
      dato_id: d.id, campo: d.campo, concepto,
      contraparte_cuit: cuit, contraparte_nombre: nombre,
      tipo: normTexto(v.tipo),
    });
  }
  return { validos, noEstructurados };
}

// ¿Este papel recibido respalda al papel esperado? Cuit manda;
// nombre normalizado después; concepto por tokens SOLO si no se
// declaró contraparte (nunca un parecido difuso).
function papelRespalda(pe, c) {
  if (!c || c.direccion !== 'recibida') return false;
  if (pe.tipo && c.tipo !== pe.tipo) return false;
  const cuitC = String((c.emisor && c.emisor.cuit) || '').replace(/\D/g, '');
  if (pe.contraparte_cuit) return cuitC === pe.contraparte_cuit;
  if (pe.contraparte_nombre) return slug(c.emisor && c.emisor.nombre) === slug(pe.contraparte_nombre);
  const tokens = slug(pe.concepto).split('-').filter((t) => t.length >= 4);
  if (!tokens.length) return false;
  const conceptoC = slug(c.concepto);
  return tokens.every((t) => conceptoC.split('-').includes(t));
}

function buscarRespaldo(pe, papeles, periodo) {
  const { desde, hasta } = reportes.rangoPeriodo(periodo);
  return papeles.find((c) => c.estado_lectura === 'leido' && esFechaISO(c.fecha)
    && c.fecha >= desde && c.fecha <= hasta && papelRespalda(pe, c)) || null;
}

function detectarFundamento(db, userId, papeles, hoy, periodoPedido, salida) {
  const { validos, noEstructurados } = papelesEsperados(db, userId);
  salida.fundamento = { declarados: validos.length, no_estructurados: noEstructurados, en_curso: [] };
  const mesActual = periodoDe(hoy);
  const periodos = [];
  if (periodoPedido) {
    reportes.rangoPeriodo(periodoPedido);
    periodos.push(periodoPedido);
  } else {
    const [y, m] = mesActual.split('-').map(Number);
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    periodos.push(`${prevY}-${String(prevM).padStart(2, '0')}`, mesActual);
  }
  for (const periodo of periodos) {
    // Solo los períodos cerrados alertan: el mes en curso (o uno
    // futuro) todavía puede recibir su papel — se declara.
    if (periodo >= mesActual) { salida.fundamento.en_curso.push(periodo); continue; }
    for (const pe of validos) {
      const respaldo = buscarRespaldo(pe, papeles, periodo);
      const clave = `fundamento:${pe.dato_id}:${periodo}`;
      const previo = huecoPorClave(db, userId, clave);
      if (respaldo) {
        if (previo && previo.estado === 'abierto') {
          salida.resueltos.push(resolverHueco(db, userId, previo, {
            estado: 'resuelto-papel', tipo: 'papel', comprobante_id: respaldo.id,
          }, 'hueco-resuelto', `Hueco resuelto: llegó el papel de «${pe.concepto}» de ${periodo} (comprobante ${respaldo.numero || respaldo.id}).`));
        }
        continue;
      }
      if (previo) continue; // abierto: ya alertado · resuelto: no resucita
      const contraparteTxt = pe.contraparte_nombre || (pe.contraparte_cuit ? `CUIT ${pe.contraparte_cuit}` : 'sin contraparte declarada');
      salida.creados.push(crearHueco(db, userId, {
        tipo: 'fundamento', clave, periodo,
        dato_que_falta: `el papel de ${pe.concepto} de ${periodo}`,
        detalle: `El fundamento declara «${pe.concepto}» como papel mensual esperado (${contraparteTxt}) y en ${periodo} no apareció ningún comprobante recibido que lo respalde. Si llegó y no entró a Gesty, falta cargarlo; si no correspondía ese mes, queda explicado con una nota.`,
        ids: [],
        extra: { dato_id: pe.dato_id, campo: pe.campo, concepto: pe.concepto, contraparte_cuit: pe.contraparte_cuit, contraparte_nombre: pe.contraparte_nombre },
      }));
    }
  }
  // Resolución fuera de los períodos del escaneo: un hueco de
  // fundamento abierto se re-evalúa en SU período.
  const abiertos = listHuecos(db, userId, { tipo: 'fundamento', estado: 'abierto', limit: 1000 }).huecos
    .filter((h) => !periodos.includes(h.periodo));
  for (const h of abiertos) {
    const pe = validos.find((x) => x.dato_id === (h.extra && h.extra.dato_id));
    if (!pe || !h.periodo) continue;
    const respaldo = buscarRespaldo(pe, papeles, h.periodo);
    if (respaldo) {
      salida.resueltos.push(resolverHueco(db, userId, h, {
        estado: 'resuelto-papel', tipo: 'papel', comprobante_id: respaldo.id,
      }, 'hueco-resuelto', `Hueco resuelto: llegó el papel de «${pe.concepto}» de ${h.periodo} (comprobante ${respaldo.numero || respaldo.id}).`));
    }
  }
  return validos.length;
}

// ---------------------------------------------------------------------------
// ESCANEO — el disparo explícito (la corrida diaria es de G-21)
// ---------------------------------------------------------------------------

function escanearHuecos(db, userId, opts) {
  ensureSchema(db);
  gesty.ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const papeles = todosLosComprobantes(db, userId);
  const salida = {
    hoy, creados: [], actualizados: [], resueltos: [], explicados: [],
    sin_base: [], fundamento: { declarados: 0, no_estructurados: 0, en_curso: [] },
    series_revisadas: 0, numeros_no_juzgables: 0, proveedores_con_ritmo: 0,
  };
  const { series, noJuzgables } = armarSeries(db, userId, papeles);
  salida.series_revisadas = series.size;
  salida.numeros_no_juzgables = noJuzgables;
  detectarNumeracion(db, userId, series, salida);
  salida.proveedores_con_ritmo = detectarProveedores(db, userId, papeles, hoy, salida);
  detectarFundamento(db, userId, papeles, hoy, o.periodo ? String(o.periodo) : null, salida);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'huecos-escaneo', entidad_id: hoy,
    tipo_evento: 'huecos-escaneo',
    resumen: `Escaneo de huecos al ${hoy}: ${salida.creados.length} nuevo(s), ${salida.resueltos.length} resuelto(s), ${salida.explicados.length} explicado(s) por anulación.`,
    payload: {
      creados: salida.creados.map((h) => h.id), resueltos: salida.resueltos.map((h) => h.id),
      actualizados: salida.actualizados.map((h) => h.id),
      explicados: salida.explicados.map((e) => e.numero),
      sin_base: salida.sin_base.map((s) => s.proveedor),
      series: salida.series_revisadas,
    },
  });
  return salida;
}

// ---------------------------------------------------------------------------
// RESOLUCIÓN MANUAL — la nota del dueño y el vínculo a un papel
// ---------------------------------------------------------------------------

function explicarHueco(db, userId, id, datos) {
  ensureSchema(db);
  const nota = normTexto((datos || {}).nota);
  if (!nota) fail('Explicar un hueco exige la nota: queda registrada siempre.');
  const h = getHueco(db, userId, id);
  if (!h) fail('Ese hueco no es de esta cuenta.');
  if (h.estado !== 'abierto') fail(`Ese hueco ya está ${h.estado}: no se explica de nuevo.`);
  return resolverHueco(db, userId, h, {
    estado: 'resuelto-nota', tipo: 'nota', nota,
  }, 'hueco-explicado', `Hueco explicado por el dueño: ${h.dato_que_falta} — ${nota}`);
}

function vincularPapel(db, userId, id, datos) {
  ensureSchema(db);
  const compId = Number((datos || {}).comprobante_id);
  if (!Number.isInteger(compId)) fail('Para vincular hace falta el comprobante (comprobante_id).');
  const h = getHueco(db, userId, id);
  if (!h) fail('Ese hueco no es de esta cuenta.');
  if (h.estado !== 'abierto') fail(`Ese hueco ya está ${h.estado}.`);
  const c = comprobantes.getComprobante(db, userId, compId);
  if (!c) fail('Ese comprobante no es de esta cuenta.');
  if (h.tipo === 'numeracion') {
    const p = parseNumero(c.numero);
    const numeros = (h.extra && h.extra.numeros) || [];
    if (c.tipo !== 'factura-emitida' || !p || !numeros.includes(p.numero)) {
      fail('Ese papel no cubre el número que falta en este hueco: el vínculo tiene que cerrar el hueco, no decorarlo.');
    }
  } else if (h.tipo === 'proveedor') {
    if (claveProveedor(c) !== (h.extra && h.extra.proveedor_key)) {
      fail('Ese comprobante no es del proveedor de este hueco.');
    }
  } else if (h.tipo === 'fundamento') {
    const pe = {
      contraparte_cuit: (h.extra && h.extra.contraparte_cuit) || '',
      contraparte_nombre: (h.extra && h.extra.contraparte_nombre) || '',
      concepto: (h.extra && h.extra.concepto) || '', tipo: '',
    };
    if (!papelRespalda(pe, c) || !h.periodo || periodoDe(c.fecha) !== h.periodo) {
      fail('Ese comprobante no respalda el papel esperado de este hueco en su período.');
    }
  }
  return resolverHueco(db, userId, h, {
    estado: 'resuelto-papel', tipo: 'papel', comprobante_id: c.id, vinculado_por: 'dueno',
  }, 'hueco-resuelto', `Hueco resuelto: el dueño vinculó el comprobante ${c.numero || c.id} a ${h.dato_que_falta}.`);
}

// ---------------------------------------------------------------------------
// VISTA UNIFICADA — los huecos junto a los faltantes del cierre
// (G-06) y los pedidos del contador (G-15), por el acople tipado.
// ---------------------------------------------------------------------------

function faltantesDelPeriodo(db, userId, periodo) {
  ensureSchema(db);
  const p = normTexto(periodo);
  reportes.rangoPeriodo(p); // valida el formato (falla en voz alta)
  const propios = listHuecos(db, userId, { periodo: p, estado: 'abierto', limit: 1000 }).huecos
    .map((h) => ({
      tipo: 'hueco', detector: h.tipo, clave: h.clave,
      dato_que_falta: h.dato_que_falta, detalle: h.detalle,
      ids: h.ids || [], hueco_id: h.id,
    }));
  const acople = contador.faltantesParaDetector(db, userId, p);
  const delCierre = acople.faltantes.filter((f) => f.tipo === 'cierre');
  const dePedidos = acople.faltantes.filter((f) => f.tipo === 'pedido-contador');
  return {
    periodo: p,
    cierre_id: acople.cierre_id,
    faltantes: [...propios, ...acople.faltantes],
    totales: {
      del_detector: propios.length, del_cierre: delCierre.length,
      pedidos_del_contador: dePedidos.length, total: propios.length + acople.faltantes.length,
    },
  };
}

// ---------------------------------------------------------------------------
// RESUMEN PARA «LA OFICINA»
// ---------------------------------------------------------------------------

function resumenHuecos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const todos = listHuecos(db, userId, { limit: 1000 }).huecos;
  const abiertos = todos.filter((h) => h.estado === 'abierto');
  const porTipo = { numeracion: 0, proveedor: 0, fundamento: 0 };
  for (const h of abiertos) if (porTipo[h.tipo] !== undefined) porTipo[h.tipo]++;
  const escaneos = gesty.listEvents(db, userId, { limit: 5000 }).filter((e) => e.tipo_evento === 'huecos-escaneo');
  const ultimo = escaneos.length ? escaneos[escaneos.length - 1] : null;
  return {
    hoy,
    abiertos: abiertos.length,
    por_tipo: porTipo,
    resueltos: todos.length - abiertos.length,
    del_periodo_en_curso: abiertos.filter((h) => h.periodo === periodoDe(hoy)).length,
    ultimo_escaneo: ultimo ? { fecha: ultimo.creado_en || null, resumen: ultimo.resumen } : null,
  };
}

module.exports = {
  // constantes declaradas
  BASE_MINIMA_PROVEEDOR, GRACIA_MIN_DIAS, GRACIA_FRACCION, GRUPO_PAPELES, TIPOS_HUECO,
  // esquema
  ensureSchema,
  // escaneo (el disparo)
  escanearHuecos,
  // entidad y resolución
  getHueco, listHuecos, explicarHueco, vincularPapel,
  // vista unificada + resumen
  faltantesDelPeriodo, resumenHuecos,
  // piezas internas, exportadas para tests y reuso
  parseNumero, fmtNumero, armarSeries, rangosFaltantes, ritmosProveedores, papelesEsperados, papelRespalda,
};
