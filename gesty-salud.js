// =====================================================================
// GESTY · G-24 — SALUD ADMINISTRATIVA («La oficina»)
// Spec: gesty-cola-builds.md G-24 · gesty-experiencia-cliente.md §5
// (las varas medibles de la experiencia: ESTE panel las mide).
//
// EL PANEL ES UNA COMPOSICIÓN DE LECTURAS, NO UNA BASE NUEVA.
// Ningún indicador se guarda ni se acumula en una tabla de
// métricas: cada número se calcula al leer, desde los registros
// vivos de su área, y sale con su fuente y su período. Si mañana
// un área corrige un registro, el panel de hoy lee el número
// corregido — una base paralela de indicadores mentiría en
// silencio. La ÚNICA tabla propia es la foto durable versionada
// (patrón G-21): una foto fechada del panel, congelada tal como
// se compuso, para ver la evolución entre fotos. La foto es de
// este módulo; las fuentes, jamás se tocan.
//
// SOLO LEE. Este módulo no crea ejecutores, no aprueba, no
// envía, no escribe en ninguna fuente (la única escritura es su
// foto). Por eso hay dos lecturas que van por SQL directo sobre
// la tabla fuente en vez de por el resumen del área:
//   · Reservas del canal (G-09b): su resumen sincroniza estados
//     ESCRIBIENDO en su tabla al leer (espeja el estado del
//     turno); acá se cuentan sus registros tal como están
//     guardados, sin disparar esa sincronización.
//   · Buzón (G-23): su resumen es de totales históricos, sin
//     ventana; acá se cuentan las ingestas del período de su
//     tabla, que ES su registro.
// Y el registro durable de G-02 (gesty_events) y el fundamento
// se leen por SQL porque son, ellos mismos, la fuente.
//
// LAS FÓRMULAS (exactas, una por indicador):
// · Ventanas: hoy = opts.hoy (default: hoy real); días =
//   opts.dias (default 30). Ventana actual = [hoy−(días−1), hoy];
//   ventana anterior = los `días` días inmediatos previos.
// (a) PAPELES AL DÍA % — gesty_comprobantes (G-03), por su marca
//   de ingesta created_at. ingresados(W) = papeles de W sin los
//   duplicados (un duplicado no es un papel nuevo del negocio:
//   se cuenta aparte y no castiga el %). leídos(W) = de los
//   ingresados, estado_lectura 'leido'; en_revision = el resto.
//   huecos_al(cierre) = huecos de G-18 creados hasta el cierre y
//   no resueltos a esa fecha (siguen 'abierto', o su updated_at
//   es posterior al cierre). porcentaje(W) = leídos(W) /
//   (ingresados(W) + huecos_al(W.hasta)) × 100 — cada hueco
//   abierto ES un papel que falta: entra al denominador, y por
//   eso baja el número. Denominador 0 → porcentaje null
//   («sin datos»: jamás un 100% sin papeles).
// (b) COBRANZAS AL DÍA — gesty_facturas (G-04) vía listFacturas.
//   foto(D): emitidas = estado ∈ {lista-para-emitir, enviada,
//   cobrada} con fecha ≤ D (borrador y anulada fuera; el estado
//   es el ACTUAL — la foto histórica que el registro permite,
//   declarado). vencibles(D) = emitidas con vencimiento ≤ D.
//   vencidas_impagas(D) = vencibles con vencimiento < D y
//   saldo_al(D) > 0, donde saldo_al(D) = total − Σ pagos con
//   fecha ≤ D (cada pago trae su fecha como dato). al_dia =
//   vencibles > 0 ? vencidas == 0 : null (sin facturas
//   vencibles no hay veredicto, no hay un «al día» de regalo).
// (c) HUECOS ABIERTOS — gesty_huecos (G-18) vía listHuecos:
//   abiertos hoy por tipo (numeración / proveedor / fundamento)
//   + abiertos al cierre de la ventana anterior, reconstruidos
//   de created_at/updated_at con la misma regla de (a).
// (d) DATOS CARGADOS A MANO — gesty_events: eventos
//   dato-creado / dato-corregido con actor 'dueno'. Se EXCLUYE
//   el grupo 'reglas-dueno': son ajustes de configuración que el
//   dueño elige una vez, no datos de su negocio que haya tenido
//   que cargar (la vara de la experiencia mide carga de datos,
//   no clics de ajuste). SEMANA DE VIDA: inicio = el primer
//   registro durable de la cuenta (MIN entre el primer ts de
//   gesty_events y el primer created_at del fundamento);
//   semana n = ⌊días(inicio → hoy) / 7⌋ + 1, y la cantidad es
//   la de ESA semana. LA VARA (§5): en la semana 1, cumple =
//   cantidad < 5; desde la semana 2 la vara ya no aplica — el
//   indicador lo declara, no la fuerza.
// (e) PARA TU OK — la bandeja de G-02 (countPending +
//   listCards por tipo). Estado actual: sin tendencia.
// (f) ALERTAS DE PRECIO — resumenPrecios de G-22 (abiertas +
//   las 3 peores). Requiere la capacidad «proveedores».
// (g) CONCILIACIÓN — resumenConciliacion de G-17 (sin conciliar
//   = 'sin-conciliar' + 'sin-par', propuestas esperando,
//   extractos sin detalle). Requiere «comprobantes».
// (h) RESERVAS DEL CANAL — gesty_reservas_canal (G-09b) por
//   SQL: activas (estado 'tomada' tal como está guardado),
//   tomadas en el período (por created_at: el día del turno
//   vive en booking y su vista es la agenda de G-09, no este
//   panel) y derivadas. Requiere «agenda».
// (i) BUZÓN — gesty_buzon_ingestas (G-23) por SQL +
//   estadoBuzon: ingestas del período, con papeles / sin papel
//   (contados, nunca escondidos) y papeles entrados. Requiere
//   «comprobantes».
//
// TENDENCIA: los indicadores con historia reconstruible
// (papeles, cobranzas, huecos, datos a mano) traen el valor del
// período anterior comparable, calculado de los mismos registros
// con la misma fórmula. Sin base real → 'sin-base', declarado:
// jamás una tendencia inventada. Los de estado actual (bandeja,
// precios, conciliación, reservas, buzón) no fingen historia:
// tendencia null con su motivo.
//
// DEGRADACIÓN HONESTA (patrón G-06b): capacidad que la cuenta
// no tiene → el indicador sale NO DISPONIBLE con motivo
// 'sin-capacidad'; fuente que lanza → NO DISPONIBLE con motivo
// 'fuente-no-respondio' y el error citado. Nunca un cero
// disfrazado ni un hueco silencioso: la respuesta declara su
// cobertura (qué fuentes respondieron) y una `declaraciones`
// en lenguaje del dueño por cada faltante.
//
// RELOJ INYECTABLE: toda función que compara períodos acepta
// opts.hoy (YYYY-MM-DD) y opts.dias; ningún cálculo usa la
// fecha del sistema cuando el llamador pasó la suya.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const comprobantes = require('./gesty-comprobantes');
const facturacion = require('./gesty-facturacion');
const huecosMod = require('./gesty-huecos');
const precios = require('./gesty-precios');
const conciliacion = require('./gesty-conciliacion');
const reservasCanal = require('./gesty-reservas-canal');
const buzon = require('./gesty-buzon');

// ---------------------------------------------------------------------------
// Utilidades (el patrón de la casa)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function addDias(iso, n) {
  const t = Date.parse(String(iso).slice(0, 10)) + Number(n) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function diffDias(desde, hasta) {
  return Math.round((Date.parse(String(hasta).slice(0, 10)) - Date.parse(String(desde).slice(0, 10))) / 86400000);
}
function round1(n) { return Math.round((Number(n) + Number.EPSILON) * 10) / 10; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function hoyDe(opts) { const o = opts || {}; return esFechaISO(o.hoy) ? String(o.hoy) : hoyISO(); }
function diasDe(opts) {
  const n = Number((opts || {}).dias);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(Math.max(Math.floor(n), 1), 366);
}
function fechaDeTs(ts) { return String(ts || '').slice(0, 10); }

// La ventana actual y la anterior comparable (misma longitud).
function ventanaDe(hoy, dias) {
  const desde = addDias(hoy, -(dias - 1));
  const anteriorHasta = addDias(hoy, -dias);
  const anteriorDesde = addDias(hoy, -(2 * dias - 1));
  return {
    dias, desde, hasta: hoy,
    anterior: { desde: anteriorDesde, hasta: anteriorHasta },
  };
}

const MAX_DETALLE = 10; // ítems citados por indicador: el detalle vive en cada área
const TOPE_LECTURA = 5000; // por fuente paginada (declarado si se topa)

// ---------------------------------------------------------------------------
// Esquema propio (idempotente): SOLO la foto durable del panel.
// Una fila por (cuenta, fecha del panel, versión); la vigente es
// la mayor versión de la fecha. El contenido va congelado en
// JSON tal como se compuso: la historia no se reescribe.
// ---------------------------------------------------------------------------

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_salud_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    contenido TEXT NOT NULL DEFAULT '{}',
    generado_por TEXT NOT NULL DEFAULT 'dueno',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_salud_fotos_version ON gesty_salud_fotos (user_id, fecha, version)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_salud_fotos_fecha ON gesty_salud_fotos (user_id, fecha)');
}

// ---------------------------------------------------------------------------
// SEMANA DE VIDA DE LA CUENTA — el primer registro durable manda
// ---------------------------------------------------------------------------

function inicioVida(db, userId) {
  gesty.ensureSchema(db);
  const r = db.prepare(`SELECT MIN(v) AS v FROM (
      SELECT MIN(ts) AS v FROM gesty_events WHERE user_id = ?
      UNION ALL SELECT MIN(created_at) AS v FROM gesty_foundation WHERE user_id = ?
    )`).get(userId, userId);
  const f = r && r.v ? fechaDeTs(r.v) : '';
  return esFechaISO(f) ? f : null;
}

function semanaDeVida(db, userId, hoy) {
  const inicio = inicioVida(db, userId);
  if (!inicio) return null;
  if (hoy < inicio) return { inicio, numero: null, desde: null, hasta: null, motivo: 'el hoy pedido es anterior al primer registro de la cuenta' };
  const numero = Math.floor(diffDias(inicio, hoy) / 7) + 1;
  const desde = addDias(inicio, (numero - 1) * 7);
  const hasta = addDias(inicio, numero * 7 - 1);
  return { inicio, numero, desde, hasta };
}

// ---------------------------------------------------------------------------
// LAS FUENTES — cada indicador lee la suya y cita su procedencia
// ---------------------------------------------------------------------------

// (a) Papeles al día % — G-03 por marca de ingesta + huecos de
// G-18 al cierre de cada ventana (compartido con el indicador c).
function filasPapeles(db, userId, declaraciones) {
  const filas = [];
  let offset = 0;
  for (;;) {
    const { comprobantes: pagina, total } = comprobantes.listComprobantes(db, userId, { limit: 500, offset, incluir_duplicados: true });
    for (const c of pagina) filas.push(c);
    offset += pagina.length;
    if (!pagina.length || offset >= total || offset >= TOPE_LECTURA) {
      if (total > TOPE_LECTURA) declaraciones.push(`La cuenta tiene ${total} papeles y el panel lee los primeros ${TOPE_LECTURA}: el porcentaje de papeles puede ser parcial.`);
      break;
    }
  }
  return filas;
}

function conteoPapeles(filas, w) {
  let ingresados = 0, leidos = 0, duplicados = 0;
  for (const c of filas) {
    const f = fechaDeTs(c.creado_en);
    if (f < w.desde || f > w.hasta) continue;
    const esDup = (c.duplicado_de !== null && c.duplicado_de !== undefined) || c.estado_lectura === 'duplicado';
    if (esDup) { duplicados++; continue; }
    ingresados++;
    if (c.estado_lectura === 'leido') leidos++;
  }
  return { ingresados, leidos, en_revision: ingresados - leidos, duplicados };
}

function huecosAlCierre(filasHuecos, cierre) {
  let n = 0;
  for (const h of filasHuecos) {
    if (fechaDeTs(h.detectado_en) > cierre) continue;
    if (h.estado === 'abierto' || fechaDeTs(h.actualizado_en) > cierre) n++;
  }
  return n;
}

function porcentajePapeles(conteo, huecosCierre) {
  const denominador = conteo.ingresados + huecosCierre;
  if (denominador <= 0) return { porcentaje: null, denominador: 0 };
  return { porcentaje: round1((conteo.leidos / denominador) * 100), denominador };
}

function indicadorPapeles(db, userId, ctx) {
  const filas = filasPapeles(db, userId, ctx.declaraciones);
  const actual = conteoPapeles(filas, ctx.ventana);
  const anterior = conteoPapeles(filas, ctx.ventana.anterior);
  const huecosAhora = huecosAlCierre(ctx.filasHuecos, ctx.ventana.hasta);
  const huecosAntes = huecosAlCierre(ctx.filasHuecos, ctx.ventana.anterior.hasta);
  const pAct = porcentajePapeles(actual, huecosAhora);
  const pAnt = porcentajePapeles(anterior, huecosAntes);
  let tendencia;
  if (pAct.porcentaje === null || pAnt.porcentaje === null) {
    tendencia = {
      porcentaje_anterior: pAnt.porcentaje, direccion: 'sin-base',
      diferencia_pp: null,
      detalle: pAnt.porcentaje === null
        ? 'La ventana anterior no tiene papeles ni huecos que comparar: no hay base para una tendencia.'
        : 'La ventana actual no tiene papeles: no hay porcentaje que comparar.',
    };
  } else {
    const dif = round1(pAct.porcentaje - pAnt.porcentaje);
    tendencia = {
      porcentaje_anterior: pAnt.porcentaje,
      direccion: dif > 0 ? 'sube' : dif < 0 ? 'baja' : 'igual',
      diferencia_pp: dif,
      detalle: `Ventana anterior: ${pAnt.porcentaje}% (${anterior.leidos} leídos de ${pAnt.denominador}, con ${huecosAntes} hueco(s) abierto(s) a su cierre).`,
    };
  }
  return {
    porcentaje: pAct.porcentaje,
    estado_dato: pAct.porcentaje === null ? 'sin-datos' : 'con-datos',
    leidos: actual.leidos, ingresados: actual.ingresados,
    en_revision: actual.en_revision, duplicados: actual.duplicados,
    huecos_en_el_denominador: huecosAhora, denominador: pAct.denominador,
    tendencia,
  };
}

// (b) Cobranzas al día — la foto de un día D, reconstruida de
// las facturas de G-04 y de la fecha dato de cada pago.
function filasFacturas(db, userId, declaraciones) {
  const filas = [];
  let offset = 0;
  for (;;) {
    const { facturas: pagina, total } = facturacion.listFacturas(db, userId, { limit: 1000, offset });
    for (const f of pagina) filas.push(f);
    offset += pagina.length;
    if (!pagina.length || offset >= total || offset >= TOPE_LECTURA) {
      if (total > TOPE_LECTURA) declaraciones.push(`La cuenta tiene ${total} facturas y el panel lee las primeras ${TOPE_LECTURA}: la foto de cobranzas puede ser parcial.`);
      break;
    }
  }
  return filas;
}

function fotoCobranzas(filas, dia) {
  const ESTADOS_EMITIDOS = ['lista-para-emitir', 'enviada', 'cobrada'];
  let vencibles = 0;
  const vencidas = [];
  for (const f of filas) {
    if (!ESTADOS_EMITIDOS.includes(f.estado)) continue;
    if (!f.fecha || f.fecha > dia) continue;
    if (!f.vencimiento || f.vencimiento > dia) continue;
    vencibles++;
    if (f.vencimiento >= dia) continue; // vence ese día: todavía no es vencida
    const pagadoAlDia = round2((f.pagos || []).reduce((a, p) => a + (String(p.fecha || '') <= dia ? (Number(p.monto) || 0) : 0), 0));
    const saldoAlDia = round2((Number(f.total) || 0) - pagadoAlDia);
    if (saldoAlDia > 0) vencidas.push({ factura: f, saldo_al_dia: saldoAlDia });
  }
  return { vencibles, vencidas };
}

function indicadorCobranzas(db, userId, ctx) {
  const filas = filasFacturas(db, userId, ctx.declaraciones);
  const hoyFoto = fotoCobranzas(filas, ctx.hoy);
  const antFoto = fotoCobranzas(filas, ctx.ventana.anterior.hasta);
  const montoVencido = {};
  for (const v of hoyFoto.vencidas) {
    const saldoActual = Number(v.factura.saldo) || 0;
    const k = String(v.factura.moneda || '').toUpperCase() || 'SIN-MONEDA';
    montoVencido[k] = round2((montoVencido[k] || 0) + saldoActual);
  }
  const alDia = hoyFoto.vencibles > 0 ? hoyFoto.vencidas.length === 0 : null;
  let tendencia;
  if (antFoto.vencibles <= 0) {
    tendencia = {
      vencidas_anterior: null, al_dia_anterior: null, direccion: 'sin-base',
      detalle: `Al cierre de la ventana anterior (${ctx.ventana.anterior.hasta}) no había facturas emitidas vencibles: no hay base para comparar.`,
    };
  } else {
    const va = antFoto.vencidas.length, vh = hoyFoto.vencidas.length;
    tendencia = {
      vencidas_anterior: va, al_dia_anterior: va === 0,
      direccion: vh < va ? 'mejora' : vh > va ? 'empeora' : 'igual',
      detalle: `Al cierre de la ventana anterior había ${va} vencida(s) impaga(s) de ${antFoto.vencibles} vencible(s).`,
    };
  }
  return {
    al_dia: alDia,
    estado_dato: hoyFoto.vencibles > 0 ? 'con-datos' : 'sin-datos',
    vencidas_impagas: hoyFoto.vencidas.length,
    monto_vencido: montoVencido,
    total_vencible: hoyFoto.vencibles,
    detalle: hoyFoto.vencidas.slice(0, MAX_DETALLE).map((v) => ({
      factura_id: v.factura.id, numero: v.factura.numero,
      cliente: (v.factura.cliente && v.factura.cliente.nombre) || '',
      vencimiento: v.factura.vencimiento, saldo: Number(v.factura.saldo) || 0,
      moneda: v.factura.moneda || '',
    })),
    tendencia,
  };
}

// (c) Huecos abiertos — G-18 tal cual están + la reconstrucción
// al cierre anterior.
function indicadorHuecos(db, userId, ctx) {
  const resumen = huecosMod.resumenHuecos(db, userId, { hoy: ctx.hoy });
  const antes = huecosAlCierre(ctx.filasHuecos, ctx.ventana.anterior.hasta);
  const hayBase = ctx.filasHuecos.some((h) => fechaDeTs(h.detectado_en) <= ctx.ventana.anterior.hasta)
    || !!resumen.ultimo_escaneo;
  const tendencia = !hayBase
    ? { abiertos_anterior: null, direccion: 'sin-base', detalle: 'Antes de esta ventana no hay huecos registrados ni escaneos de G-18: no hay base para comparar.' }
    : {
      abiertos_anterior: antes,
      direccion: resumen.abiertos < antes ? 'mejora' : resumen.abiertos > antes ? 'empeora' : 'igual',
      detalle: `Al cierre de la ventana anterior había ${antes} hueco(s) abierto(s).`,
    };
  return {
    abiertos: resumen.abiertos,
    por_tipo: resumen.por_tipo,
    resueltos: resumen.resueltos,
    ultimo_escaneo: resumen.ultimo_escaneo,
    detalle: ctx.filasHuecos.filter((h) => h.estado === 'abierto').slice(0, MAX_DETALLE)
      .map((h) => ({ id: h.id, tipo: h.tipo, periodo: h.periodo, dato_que_falta: h.dato_que_falta })),
    tendencia,
  };
}

// (d) Datos cargados a mano — el registro durable de G-02,
// semana de vida de la cuenta.
function indicadorDatosAMano(db, userId, ctx) {
  const semana = ctx.semanaVida;
  if (!semana) {
    return { disponible: false, motivo: 'sin-registros', detalle_error: null,
      valor: null, nota: 'La cuenta todavía no tiene registros de Gesty: no hay semana de vida que medir.' };
  }
  if (semana.numero === null) {
    return { disponible: false, motivo: 'sin-registros', detalle_error: null,
      valor: null, nota: semana.motivo };
  }
  const rows = db.prepare(`SELECT ts, payload FROM gesty_events WHERE user_id = ?
    AND actor = 'dueno' AND tipo_evento IN ('dato-creado', 'dato-corregido')
    ORDER BY id ASC LIMIT ?`).all(userId, TOPE_LECTURA);
  const eventos = [];
  for (const r of rows) {
    let p = {};
    try { p = JSON.parse(r.payload || '{}'); } catch (e) { p = {}; }
    if (p && p.grupo === 'reglas-dueno') continue; // configuración, no carga de datos (declarado en la cabecera)
    eventos.push({ fecha: fechaDeTs(r.ts), grupo: (p && p.grupo) || '', campo: (p && p.campo) || '' });
  }
  const enSemana = (n) => {
    const desde = addDias(semana.inicio, (n - 1) * 7);
    const hastaExcl = addDias(semana.inicio, n * 7);
    return eventos.filter((e) => e.fecha >= desde && e.fecha < hastaExcl);
  };
  const actuales = enSemana(semana.numero);
  const vara = semana.numero === 1
    ? { aplica: true, vara: '<5 en la primera semana', cumple: actuales.length < 5 }
    : { aplica: false, vara: '<5 en la primera semana', cumple: null, motivo: 'La vara mide la primera semana; esta cuenta ya está en la semana ' + semana.numero + '.' };
  const tendencia = semana.numero === 1
    ? { cantidad_anterior: null, direccion: 'sin-base', detalle: 'Es la primera semana de la cuenta: no hay semana anterior.' }
    : (() => {
      const ant = enSemana(semana.numero - 1).length;
      return {
        cantidad_anterior: ant,
        direccion: actuales.length < ant ? 'baja' : actuales.length > ant ? 'sube' : 'igual',
        detalle: `En la semana ${semana.numero - 1} cargaste ${ant} dato(s) a mano.`,
      };
    })();
  return {
    disponible: true,
    semana_vida: semana.numero, semana_desde: semana.desde, semana_hasta: semana.hasta,
    cantidad: actuales.length, vara, tendencia,
    detalle: actuales.slice(0, 20).map((e) => ({ fecha: e.fecha, grupo: e.grupo, campo: e.campo })),
    nota: 'Cuenta los datos de tu negocio que cargaste o corregiste vos (registro de G-02). Los ajustes de reglas (grupo reglas-dueno) no cuentan: son configuración, no carga de datos.',
  };
}

// (e) Para tu OK — la bandeja de G-02, contada y jamás tocada.
function indicadorParaTuOk(db, userId) {
  const tarjetas = gesty.listCards(db, userId, {});
  const porTipo = {};
  for (const t of tarjetas) {
    const g = porTipo[t.tipo] || (porTipo[t.tipo] = { cantidad: 0, tarjetas: [] });
    g.cantidad++;
    if (g.tarjetas.length < MAX_DETALLE) g.tarjetas.push(t.id);
  }
  return {
    total: gesty.countPending(db, userId),
    por_tipo: porTipo,
    tendencia: null,
    nota_tendencia: 'Es un estado de este momento (la bandeja ahora), no un período: no lleva tendencia.',
  };
}

// (f) Alertas de precio — el resumen de G-22.
function indicadorPrecios(db, userId, ctx) {
  const r = precios.resumenPrecios(db, userId, { hoy: ctx.hoy });
  return {
    alertas_abiertas: r.alertas_abiertas,
    peores_abiertas: r.peores_abiertas,
    series_con_precios: r.series_con_precios,
    ultimo_escaneo: r.ultimo_escaneo,
    tendencia: null,
    nota_tendencia: 'Las alertas abiertas son un estado de este momento: no llevan tendencia.',
  };
}

// (g) Conciliación — el resumen de G-17.
function indicadorConciliacion(db, userId, ctx) {
  const r = conciliacion.resumenConciliacion(db, userId, { hoy: ctx.hoy });
  return {
    movimientos_sin_conciliar: r.movimientos_sin_conciliar,
    propuestas_esperando: r.propuestas_esperando,
    movimientos_conciliados: r.movimientos_conciliados,
    extractos_sin_detalle: r.extractos_sin_detalle,
    ultimo_escaneo: r.ultimo_escaneo,
    tendencia: null,
    nota_tendencia: 'Los movimientos sin conciliar son un estado de este momento: no llevan tendencia.',
  };
}

// (h) Reservas del canal — SQL de solo lectura sobre la tabla
// de G-09b (su resumen sincroniza escribiendo: acá no se toca).
function indicadorReservas(db, userId, ctx) {
  reservasCanal.ensureSchema(db);
  const cont = (sql, params) => {
    const r = db.prepare(sql).get(userId, ...(params || []));
    return Number(r ? r.n : 0);
  };
  const activas = cont("SELECT COUNT(*) AS n FROM gesty_reservas_canal WHERE user_id = ? AND estado = 'tomada'");
  const delPeriodo = cont('SELECT COUNT(*) AS n FROM gesty_reservas_canal WHERE user_id = ? AND date(created_at) BETWEEN ? AND ?',
    [ctx.ventana.desde, ctx.ventana.hasta]);
  const derivadas = cont("SELECT COUNT(*) AS n FROM gesty_reservas_canal WHERE user_id = ? AND estado = 'derivada'");
  const cumplidas = cont("SELECT COUNT(*) AS n FROM gesty_reservas_canal WHERE user_id = ? AND estado = 'cumplida'");
  return {
    activas, ingresadas_en_el_periodo: delPeriodo, derivadas, cumplidas,
    tendencia: null,
    nota_tendencia: 'Las reservas activas son un estado de este momento: no llevan tendencia. El día de cada turno vive en la agenda (G-09).',
  };
}

// (i) Buzón de papeles — SQL de solo lectura sobre la tabla de
// G-23 + su estado (sin dirección no hay buzón, declarado ahí).
function indicadorBuzon(db, userId, ctx) {
  buzon.ensureSchema(db);
  const rows = db.prepare(`SELECT resultado, papeles FROM gesty_buzon_ingestas
    WHERE user_id = ? AND date(created_at) BETWEEN ? AND ?`).all(userId, ctx.ventana.desde, ctx.ventana.hasta);
  let conPapeles = 0, sinPapel = 0, papelesEntrados = 0;
  for (const r of rows) {
    if (r.resultado === 'con-papeles') conPapeles++; else sinPapel++;
    papelesEntrados += Number(r.papeles || 0);
  }
  const estado = buzon.estadoBuzon(db, userId);
  return {
    direccion_activa: !!estado.activa,
    ingestas_en_el_periodo: rows.length,
    con_papeles: conPapeles, sin_papel: sinPapel,
    papeles_entrados: papelesEntrados,
    nota: estado.activa ? '' : (estado.nota || ''),
    tendencia: null,
    nota_tendencia: 'La actividad del buzón se cuenta por período; su estado (dirección activa o no) es de este momento.',
  };
}

// ---------------------------------------------------------------------------
// EL ENVOLTORIO DE DEGRADACIÓN — capacidad, error, cobertura
// ---------------------------------------------------------------------------

const DEFINICIONES = [
  { clave: 'papeles_al_dia', titulo: 'Papeles al día', capacidad: 'comprobantes', fuente: { area: 'comprobantes', detalle: 'Comprobantes ingresados (G-03) y huecos abiertos (G-18)' }, fn: indicadorPapeles },
  { clave: 'cobranzas_al_dia', titulo: 'Cobranzas al día', capacidad: 'facturacion', fuente: { area: 'facturacion', detalle: 'Facturas emitidas y sus pagos (G-04)' }, fn: indicadorCobranzas },
  { clave: 'huecos_abiertos', titulo: 'Huecos abiertos', capacidad: 'comprobantes', fuente: { area: 'huecos', detalle: 'Faltantes detectados (G-18)' }, fn: indicadorHuecos },
  { clave: 'datos_cargados_a_mano', titulo: 'Datos cargados a mano', capacidad: null, fuente: { area: 'fundamento', detalle: 'Registro durable de datos del dueño (G-02)' }, fn: null }, // se compone aparte: su «no disponible» es sin-registros, no sin-capacidad
  { clave: 'para_tu_ok', titulo: 'Para tu OK', capacidad: null, fuente: { area: 'bandeja', detalle: 'Tarjetas esperando tu OK (G-02)' }, fn: indicadorParaTuOk },
  { clave: 'alertas_precio', titulo: 'Alertas de precio', capacidad: 'proveedores', fuente: { area: 'precios', detalle: 'Auditoría de precios de proveedores (G-22)' }, fn: indicadorPrecios },
  { clave: 'conciliacion', titulo: 'Conciliación', capacidad: 'comprobantes', fuente: { area: 'conciliacion', detalle: 'Movimientos y propuestas (G-17)' }, fn: indicadorConciliacion },
  { clave: 'reservas_canal', titulo: 'Reservas por tus canales', capacidad: 'agenda', fuente: { area: 'reservas-canal', detalle: 'Reservas tomadas por los canales de Gesty (G-09b)' }, fn: indicadorReservas },
  { clave: 'buzon', titulo: 'Buzón de papeles', capacidad: 'comprobantes', fuente: { area: 'buzon', detalle: 'Ingestas del buzón de papeles (G-23)' }, fn: indicadorBuzon },
];

function componerIndicador(db, userId, def, ctx) {
  const base = { clave: def.clave, titulo: def.titulo, fuente: def.fuente };
  if (def.capacidad && !gesty.hasCapacidad(db, userId, def.capacidad)) {
    return {
      ...base, disponible: false, motivo: 'sin-capacidad', capacidad_requerida: def.capacidad,
      detalle_error: null,
      nota: `Tu pack no incluye el área «${def.capacidad}»: este indicador no se calcula (no es un cero: es un área que tu cuenta no tiene).`,
    };
  }
  try {
    const valor = def.fn(db, userId, ctx);
    return { ...base, disponible: true, motivo: null, ...valor };
  } catch (e) {
    return {
      ...base, disponible: false, motivo: 'fuente-no-respondio', capacidad_requerida: def.capacidad || null,
      detalle_error: e.message || 'error de la fuente',
      nota: `La fuente de este indicador no respondió: ${e.message}. El resto del panel sigue vivo; este número no se inventa.`,
    };
  }
}

// ---------------------------------------------------------------------------
// COMPOSICIÓN DEL PANEL — pura lectura (no persiste nada)
// ---------------------------------------------------------------------------

function componerPanel(db, userId, opts) {
  ensureSchema(db);
  gesty.ensureSchema(db);
  const hoy = hoyDe(opts);
  const dias = diasDe(opts);
  const ventana = ventanaDe(hoy, dias);
  const declaraciones = [];

  // Lecturas compartidas: los huecos alimentan dos indicadores
  // (su conteo propio y el denominador de papeles).
  let filasHuecos = [];
  let huecosError = null;
  try {
    filasHuecos = huecosMod.listHuecos(db, userId, { limit: 1000 }).huecos;
  } catch (e) {
    huecosError = e;
  }

  const semanaVida = semanaDeVida(db, userId, hoy);
  const ctx = { hoy, ventana, declaraciones, filasHuecos, semanaVida };

  const indicadores = {};
  for (const def of DEFINICIONES) {
    if (def.clave === 'huecos_abiertos' && huecosError) {
      indicadores[def.clave] = {
        clave: def.clave, titulo: def.titulo, fuente: def.fuente,
        disponible: false, motivo: 'fuente-no-respondio', capacidad_requerida: def.capacidad,
        detalle_error: huecosError.message,
        nota: `La fuente de este indicador no respondió: ${huecosError.message}. El resto del panel sigue vivo; este número no se inventa.`,
      };
      continue;
    }
    if (def.clave === 'datos_cargados_a_mano') {
      // Su envoltorio es propio: sin capacidad de por medio, su
      // único «no disponible» es que la cuenta no tenga vida.
      const base = { clave: def.clave, titulo: def.titulo, fuente: def.fuente };
      try {
        const valor = indicadorDatosAMano(db, userId, ctx);
        indicadores[def.clave] = valor.disponible === false
          ? { ...base, ...valor }
          : { ...base, disponible: true, motivo: null, ...valor };
      } catch (e) {
        indicadores[def.clave] = {
          ...base, disponible: false, motivo: 'fuente-no-respondio', capacidad_requerida: null,
          detalle_error: e.message || 'error de la fuente',
          nota: `La fuente de este indicador no respondió: ${e.message}. El resto del panel sigue vivo; este número no se inventa.`,
        };
      }
      continue;
    }
    if (def.clave === 'papeles_al_dia' && huecosError && gesty.hasCapacidad(db, userId, def.capacidad)) {
      // Sin la fuente de huecos el denominador quedaría corto:
      // el % saldría inflado. No disponible, declarado — jamás
      // un porcentaje calculado con una fuente caída escondida.
      indicadores[def.clave] = {
        clave: def.clave, titulo: def.titulo, fuente: def.fuente,
        disponible: false, motivo: 'fuente-no-respondio', capacidad_requerida: def.capacidad,
        detalle_error: huecosError.message,
        nota: `Sin la fuente de huecos (G-18) el porcentaje de papeles saldría inflado: no se calcula. El resto del panel sigue vivo.`,
      };
      continue;
    }
    indicadores[def.clave] = componerIndicador(db, userId, def, ctx);
  }

  const noDisponibles = Object.values(indicadores).filter((i) => !i.disponible);
  for (const i of noDisponibles) {
    declaraciones.push(`«${i.titulo}» no está disponible (${i.motivo === 'sin-capacidad' ? `tu pack no incluye «${i.capacidad_requerida}»` : i.motivo === 'sin-registros' ? 'la cuenta todavía no tiene registros' : `la fuente no respondió: ${i.detalle_error}`}). No se muestra un número inventado en su lugar.`);
  }
  if (semanaVida && semanaVida.numero !== null && semanaVida.numero > 1) {
    declaraciones.push(`La cuenta está en su semana ${semanaVida.numero} de vida: la vara de datos cargados a mano (<5) midió la primera semana y ya no aplica.`);
  }
  if (!semanaVida) {
    declaraciones.push('La cuenta todavía no tiene registros de Gesty: varios indicadores no tienen base todavía.');
  }

  return {
    hoy,
    periodo: {
      dias, desde: ventana.desde, hasta: ventana.hasta,
      anterior_desde: ventana.anterior.desde, anterior_hasta: ventana.anterior.hasta,
    },
    semana_vida: semanaVida,
    indicadores,
    cobertura: {
      total: DEFINICIONES.length,
      disponibles: DEFINICIONES.length - noDisponibles.length,
      no_disponibles: noDisponibles.map((i) => ({ clave: i.clave, motivo: i.motivo })),
      fuentes_ok: Object.values(indicadores).filter((i) => i.disponible).map((i) => i.fuente.area),
    },
    declaraciones,
  };
}

// ---------------------------------------------------------------------------
// LA FOTO DURABLE — generar, leer, historial (patrón G-21)
// ---------------------------------------------------------------------------

function parseFotoRow(r) {
  if (!r) return null;
  let contenido = {};
  try { contenido = JSON.parse(r.contenido || '{}'); } catch (e) { contenido = {}; }
  return {
    id: r.id, user_id: r.user_id, fecha: r.fecha, version: r.version,
    contenido, generado_por: r.generado_por || 'dueno',
    creado_en: r.created_at,
  };
}

function generarFoto(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const contenido = componerPanel(db, userId, { hoy, dias: o.dias });
  const prev = db.prepare('SELECT MAX(version) AS v FROM gesty_salud_fotos WHERE user_id = ? AND fecha = ?').get(userId, hoy);
  const version = (prev && prev.v ? Number(prev.v) : 0) + 1;
  const generadoPor = o.generado_por === 'rutina' ? 'rutina' : 'dueno';
  const info = db.prepare(`INSERT INTO gesty_salud_fotos (user_id, fecha, version, contenido, generado_por)
    VALUES (?,?,?,?,?)`).run(userId, hoy, version, JSON.stringify(contenido), generadoPor);
  const foto = parseFotoRow(db.prepare('SELECT * FROM gesty_salud_fotos WHERE id = ?').get(Number(info.lastInsertRowid)));
  gesty.recordEvent(db, userId, {
    actor: generadoPor === 'rutina' ? 'gesty' : 'dueno',
    entidad_tipo: 'salud', entidad_id: hoy,
    tipo_evento: 'foto-salud-generada',
    resumen: `Foto de salud administrativa del ${hoy} (versión ${version}): ${contenido.cobertura.disponibles} de ${contenido.cobertura.total} indicadores disponibles.`,
    payload: { version, reemplaza_version: version > 1 ? version - 1 : null, disponibles: contenido.cobertura.disponibles },
  });
  return foto;
}

function getFoto(db, userId, fecha) {
  ensureSchema(db);
  const f = esFechaISO(fecha) ? String(fecha) : hoyDe({});
  const r = db.prepare('SELECT * FROM gesty_salud_fotos WHERE user_id = ? AND fecha = ? ORDER BY version DESC LIMIT 1').get(userId, f);
  return parseFotoRow(r);
}

function listFotos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_salud_fotos WHERE user_id = ? ORDER BY fecha DESC, version DESC').all(userId);
  if (esFechaISO(o.desde)) rows = rows.filter((r) => r.fecha >= String(o.desde));
  if (esFechaISO(o.hasta)) rows = rows.filter((r) => r.fecha <= String(o.hasta));
  const vigentes = new Set();
  const out = rows.map((r) => {
    const f = parseFotoRow(r);
    f.es_vigente = !vigentes.has(r.fecha);
    if (f.es_vigente) vigentes.add(r.fecha);
    return f;
  });
  const lim = Math.min(Math.max(Number(o.limit) || 60, 1), 500);
  return { fotos: o.todas_las_versiones ? out.slice(0, lim) : out.filter((f) => f.es_vigente).slice(0, lim), total: out.length };
}

// ---------------------------------------------------------------------------
// RESUMEN PARA «LA OFICINA» — el panel en una mirada
// ---------------------------------------------------------------------------

function resumenSalud(db, userId, opts) {
  ensureSchema(db);
  const hoy = hoyDe(opts);
  const panel = componerPanel(db, userId, { hoy, dias: (opts || {}).dias });
  const ind = panel.indicadores;
  const fotoHoy = getFoto(db, userId, hoy);
  const partes = [];
  if (ind.papeles_al_dia.disponible) {
    partes.push(ind.papeles_al_dia.porcentaje === null
      ? 'Papeles: todavía sin papeles en el período'
      : `Papeles al día: ${ind.papeles_al_dia.porcentaje}%`);
  }
  if (ind.cobranzas_al_dia.disponible) {
    partes.push(ind.cobranzas_al_dia.al_dia === null
      ? 'Cobranzas: sin facturas vencibles todavía'
      : ind.cobranzas_al_dia.al_dia ? 'Cobranzas al día' : `Cobranzas: ${ind.cobranzas_al_dia.vencidas_impagas} vencida(s) impaga(s)`);
  }
  if (ind.huecos_abiertos.disponible) partes.push(`Huecos abiertos: ${ind.huecos_abiertos.abiertos}`);
  if (ind.para_tu_ok.disponible) partes.push(`Esperan tu OK: ${ind.para_tu_ok.total}`);
  if (ind.alertas_precio.disponible && ind.alertas_precio.alertas_abiertas) partes.push(`Alertas de precio abiertas: ${ind.alertas_precio.alertas_abiertas}`);
  return {
    hoy,
    semana_vida: panel.semana_vida ? panel.semana_vida.numero : null,
    papeles_al_dia_pct: ind.papeles_al_dia.disponible ? ind.papeles_al_dia.porcentaje : null,
    cobranzas_al_dia: ind.cobranzas_al_dia.disponible ? ind.cobranzas_al_dia.al_dia : null,
    cobranzas_vencidas: ind.cobranzas_al_dia.disponible ? ind.cobranzas_al_dia.vencidas_impagas : null,
    huecos_abiertos: ind.huecos_abiertos.disponible ? ind.huecos_abiertos.abiertos : null,
    datos_a_mano_semana: ind.datos_cargados_a_mano.disponible
      ? { cantidad: ind.datos_cargados_a_mano.cantidad, cumple_vara: ind.datos_cargados_a_mano.vara.cumple }
      : null,
    para_tu_ok: ind.para_tu_ok.disponible ? ind.para_tu_ok.total : null,
    alertas_precio_abiertas: ind.alertas_precio.disponible ? ind.alertas_precio.alertas_abiertas : null,
    cobertura: panel.cobertura,
    foto_de_hoy: fotoHoy
      ? { existe: true, version: fotoHoy.version }
      : { existe: false, version: null },
    texto: partes.length ? partes.join(' · ') + '.' : 'Todavía no hay indicadores para mostrar.',
  };
}

// ---------------------------------------------------------------------------

module.exports = {
  // esquema
  ensureSchema,
  // composición del panel (solo lectura)
  componerPanel,
  // foto durable versionada
  generarFoto, getFoto, listFotos,
  // resumen para «La oficina»
  resumenSalud,
  // piezas internas, exportadas para tests y reuso
  inicioVida, semanaDeVida, ventanaDe, fotoCobranzas, conteoPapeles,
};
