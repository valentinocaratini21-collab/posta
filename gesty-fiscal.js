// =====================================================================
// GESTY · G-19 — CALENDARIO FISCAL CALCULADO
// Spec: gesty-cola-builds.md G-19 («vencimientos del organismo
// calculados desde CUIT + régimen del fundamento — tabla de reglas
// por jurisdicción, versionada — sin carga manual»; aceptación:
// «para 3 perfiles fiscales de prueba, la agenda coincide 1:1 con
// el calendario oficial calculado a mano; si el régimen no está en
// la tabla, Gesty lo dice y pide el dato — nunca estima») ·
// gesty-build-spec.md §12 (pilar «preguntas correctas»: lo que no
// se sabe se pregunta, no se inventa).
//
// HASTA G-09, la agenda solo fechaba un vencimiento fiscal si el
// fundamento traía el dato estructurado {fecha, monto}; la regla
// «día 20» se declaraba sin fecha porque nadie la calculaba. Este
// build CALCULA las fechas que la tabla de reglas cubre, desde el
// CUIT y el régimen del fundamento (grupo datos-fiscales), y las
// expone en la MISMA forma que hoy consumen G-09/G-16 (la de
// reportes.vencimientosFiscalesFundamento: {concepto, fecha,
// monto, moneda, fuente_campo, dato_id}) más la cita de la regla.
// SIN MONTO, siempre: la fecha se calcula, el importe lo liquida
// el contador (patrón G-06) — ningún vencimiento calculado trae un
// número de plata.
//
// LA TABLA MANDA, NO LA INTUICIÓN. Cada regla declara obligación,
// regímenes a los que aplica, cómo se calcula, VERSIÓN y vigencia
// (desde/hasta, por período): las reglas fiscales cambian y todo
// cálculo cita la versión que usó. Un período se calcula con la
// versión vigente EN ESE período; si ninguna versión cubre el
// período, esa obligación se declara sin cobertura — jamás se
// aplica una versión fuera de su vigencia. Una regla marcada
// `confirmada: false` NO calcula nunca: aparece declarada como
// «sin confirmar» con su motivo (regla de la casa: nada fiscal
// inventado). Régimen o jurisdicción fuera de la tabla →
// `sin-cobertura` + la PREGUNTA ÚNICA al dueño; cero fechas.
//
// AJUSTE POR DÍA INHÁBIL — QUÉ ESTÁ VERIFICADO Y QUÉ NO. La regla
// general de ARCA sí está verificada: si el vencimiento cae en día
// inhábil, se traslada al día hábil siguiente (RG 2819/2010 para
// Monotributo; cronogramas mensuales de ARCA para IVA). Lo que
// este build calcula es SOLO el corrimiento por fin de semana
// (sábado/domingo — matemática de calendario, sin datos externos).
// El corrimiento por FERIADOS no está calculado: no hay una tabla
// de feriados verificada cargada, así que cada vencimiento lo
// declara («sin ajuste por feriados verificado»): si la fecha cae
// en un feriado, ARCA la corre al día hábil siguiente y esa fecha
// real manda. Para el IVA, cuyo cronograma real corre EN BLOQUE
// (los cinco días se suceden en días hábiles consecutivos desde
// el primer hábil ≥ 18 — verificado contra los cronogramas
// publicados 2025–2026), el cálculo replica el bloque contando
// días hábiles de fin de semana desde el 18.
//
// ES UNA VISTA, NO OTRA BASE (patrón G-09): el cálculo es función
// pura del fundamento + la tabla; no hay tablas propias ni
// eventos por calcular. La convivencia con lo cargado a mano la
// hace `vencimientosUnificados`: si una fecha calculada y una
// cargada coinciden en obligación y fecha, se declara UNA con
// sus dos fuentes. G-09 no se modifica: la fuente calculada se
// ofrece como función consumible y la composición vive en los
// endpoints de este módulo (el front de la agenda la consumirá
// cuando se construya — hueco de cableado declarado H-G19-1).
// =====================================================================
'use strict';

const gesty = require('./gesty');
const reportes = require('./gesty-reportes');

// ---------------------------------------------------------------------------
// Utilidades (el patrón de la casa)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function sinAcentos(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function normClave(s) { return sinAcentos(String(s || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function esPeriodo(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || '')); }
function addDias(iso, n) {
  const t = Date.parse(String(iso).slice(0, 10)) + Number(n) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function periodoDe(fechaISO) { return String(fechaISO).slice(0, 7); }
function addMeses(periodo, n) {
  const [a, m] = String(periodo).split('-').map(Number);
  const t = (a * 12 + (m - 1)) + Number(n);
  const na = Math.floor(t / 12); const nm = (t % 12) + 1;
  return `${na}-${String(nm).padStart(2, '0')}`;
}
function hoyDe(opts) { const o = opts || {}; return esFechaISO(o.hoy) ? String(o.hoy) : hoyISO(); }
// Día de semana con el calendario puro (0 = domingo … 6 = sábado).
function diaSemana(fechaISO) { return new Date(Date.parse(`${String(fechaISO).slice(0, 10)}T00:00:00Z`)).getUTCDay(); }
function esFinde(fechaISO) { const d = diaSemana(fechaISO); return d === 0 || d === 6; }
// La única parte del ajuste por inhábil que este build calcula:
// correr hacia adelante mientras sea sábado o domingo.
function correrFinDeSemana(fechaISO) { let f = fechaISO; while (esFinde(f)) f = addDias(f, 1); return f; }
// El n-ésimo día no-fin-de-semana contando desde el primer día
// hábil (sin feriados) en o después de `fechaISO` (n = 0 → ese día).
function enesimoHabilDesde(fechaISO, n) {
  let f = correrFinDeSemana(fechaISO);
  for (let i = 0; i < n; i++) f = correrFinDeSemana(addDias(f, 1));
  return f;
}

// ---------------------------------------------------------------------------
// LA TABLA DE REGLAS — versionada, por jurisdicción.
// `vigente_desde`/`vigente_hasta` se comparan contra el PERÍODO
// (YYYY-MM) del vencimiento. `confirmada: false` = la regla está
// identificada pero su dato concreto NO está verificado: jamás
// produce una fecha, solo la declaración.
// ---------------------------------------------------------------------------

const PARES_IVA = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
const ANCLAS_IVA = [18, 19, 20, 21, 22];

const REGLAS = [
  {
    id: 'ar-iva-mensual', jurisdiccion: 'AR', organismo: 'ARCA (ex AFIP)',
    obligacion: 'IVA', obligacion_clave: 'iva',
    etiqueta: 'IVA — declaración jurada y pago (F.2002)',
    regimenes: ['responsable-inscripto'],
    tipo: 'mensual-bloque-terminacion', anclas: ANCLAS_IVA, pares: PARES_IVA,
    mes_offset: 1,
    version: '2018.1', vigente_desde: '2017-12', vigente_hasta: null,
    confirmada: true,
    fuente: 'RG AFIP 4172/2017, anexo de vencimientos generales, en la redacción de la RG AFIP 4186/2018, que restauró el esquema 2-2-2-2-2 (terminaciones 0-1 → día 18, 2-3 → 19, 4-5 → 20, 6-7 → 21, 8-9 → 22) con vigencia para el devengado diciembre/2017 en adelante; verificada contra los cronogramas mensuales publicados por ARCA (octubre/2025 a octubre/2026), incluido el corrimiento en bloque por días inhábiles.',
  },
  {
    id: 'ar-autonomos-aporte', jurisdiccion: 'AR', organismo: 'ARCA (ex AFIP)',
    obligacion: 'Autónomos', obligacion_clave: 'autonomos',
    etiqueta: 'Autónomos — aporte mensual del titular',
    regimenes: ['responsable-inscripto'],
    // El aporte de autónomos es de la persona física titular: una
    // sociedad no lo paga. Sin el dato en el fundamento, no aplica.
    requiere: { grupo: 'datos-fiscales', campo: 'tipo_persona', valor: 'fisica', motivo: 'el aporte de Autónomos corresponde al titular persona física; el fundamento no declara tipo_persona «fisica»' },
    tipo: 'mensual-grupos-terminacion',
    grupos: [
      { terminaciones: [0, 1, 2, 3], dia: 5 },
      { terminaciones: [4, 5, 6], dia: 6 },
      { terminaciones: [7, 8, 9], dia: 7 },
    ],
    mes_offset: 1,
    version: '2018.1', vigente_desde: '2017-12', vigente_hasta: null,
    confirmada: true,
    fuente: 'RG AFIP 2217, art. 32, según el anexo de vencimientos generales de la RG AFIP 4172/2017 (redacción RG 4186/2018): terminaciones 0-1-2-3 → día 5, 4-5-6 → 6, 7-8-9 → 7. El aporte se paga a mes vencido (verificado: el cronograma del período noviembre/2010 operó en diciembre/2010, y los cronogramas 2025–2026 lo listan en los primeros días del mes siguiente).',
  },
  {
    id: 'ar-monotributo-cuota', jurisdiccion: 'AR', organismo: 'ARCA (ex AFIP)',
    obligacion: 'Monotributo', obligacion_clave: 'monotributo',
    etiqueta: 'Monotributo — cuota mensual',
    regimenes: ['monotributo'],
    tipo: 'mensual-dia-fijo', dia: 20,
    mes_offset: 0,
    version: '2010.2', vigente_desde: '2010-05', vigente_hasta: null,
    confirmada: true,
    fuente: 'RG AFIP 2819/2010 (sobre la Ley 26.565): los pagos mensuales del Monotributo vencen los días 20 de cada mes a partir de mayo/2010, inclusive; verificada contra los cronogramas mensuales de ARCA 2025–2026 (septiembre/2026: el 20 fue domingo y venció el lunes 21).',
  },
  {
    id: 'ar-monotributo-cuota', jurisdiccion: 'AR', organismo: 'ARCA (ex AFIP)',
    obligacion: 'Monotributo', obligacion_clave: 'monotributo',
    etiqueta: 'Monotributo — cuota mensual',
    regimenes: ['monotributo'],
    tipo: 'mensual-dia-fijo', dia: 7,
    mes_offset: 0,
    version: '2004.1', vigente_desde: null, vigente_hasta: '2010-04',
    confirmada: true,
    fuente: 'Régimen anterior a la RG AFIP 2819/2010: la cuota mensual vencía el día 7 de cada mes (la propia RG 2819/2010 y la prensa especializada de mayo/2010 registran el paso del día 7 al día 20).',
  },
  {
    id: 'ar-ganancias-anticipos-ddjj', jurisdiccion: 'AR', organismo: 'ARCA (ex AFIP)',
    obligacion: 'Ganancias', obligacion_clave: 'ganancias',
    etiqueta: 'Ganancias — anticipos y declaración jurada anual',
    regimenes: ['responsable-inscripto'],
    tipo: 'anual',
    version: null, vigente_desde: null, vigente_hasta: null,
    confirmada: false,
    motivo_sin_confirmar: 'el calendario de anticipos y de la declaración jurada anual de Ganancias lo fija ARCA por resolución para cada período fiscal (y los anticipos dependen además del impuesto determinado del año anterior): no hay una tabla estable verificada que este build pueda cargar sin inventar fechas.',
    fuente: null,
  },
];

// Lo que la tabla declara que NO cubre, para decirlo en voz alta
// en vez de callarlo: jurisdicciones sin tabla (todas menos AR) y,
// dentro de AR, lo provincial.
const FUERA_DE_TABLA = [
  { clave: 'ingresos-brutos', detalle: 'Ingresos Brutos es un impuesto PROVINCIAL (y el Convenio Multilateral tiene su propio calendario por jurisdicción): no hay tabla de ninguna provincia cargada en este build, así que Gesty no calcula ni estima esos vencimientos.' },
  { clave: 'otras-jurisdicciones', detalle: 'La tabla de este build cubre solo Argentina nacional (ARCA). Cualquier otra jurisdicción queda sin cobertura, declarada.' },
];

const DECLARACION_FERIADOS = 'sin ajuste por feriados verificado: el corrimiento calculado es solo por fin de semana; si la fecha cae en un feriado, ARCA la corre al día hábil siguiente y esa fecha real manda.';

// ---------------------------------------------------------------------------
// Perfil fiscal — se lee del fundamento (grupo datos-fiscales;
// la jurisdicción también puede venir del grupo calendario-fiscal)
// ---------------------------------------------------------------------------

const REGIMENES_CONOCIDOS = ['monotributo', 'responsable-inscripto', 'exento'];

function normalizarRegimen(raw) {
  const t = normClave(raw);
  if (!t) return null;
  if (t.includes('monotribut')) return 'monotributo';
  if (t.includes('responsable inscript') || t === 'ri') return 'responsable-inscripto';
  if (t.includes('exento')) return 'exento';
  return null;
}

function normalizarJurisdiccion(raw) {
  const t = normClave(raw);
  if (!t) return null;
  if (t === 'ar' || t.includes('argentina') || t.includes('nacional') || t.includes('arca') || t.includes('afip')) return 'AR';
  return String(raw).trim().toUpperCase().slice(0, 8);
}

function perfilFiscal(db, userId) {
  gesty.ensureSchema(db);
  const fiscales = gesty.getData(db, userId, { grupo: 'datos-fiscales' });
  const por = {};
  for (const d of fiscales) por[d.campo] = d.valor;
  const calFiscal = gesty.getData(db, userId, { grupo: 'calendario-fiscal' });
  const porCal = {};
  for (const d of calFiscal) porCal[d.campo] = d.valor;

  const cuit = String(por.cuit || '').replace(/\D/g, '');
  const regimenRaw = normTexto(por.condicion_iva || por['condicion-iva'] || por.regimen || '');
  const regimen = normalizarRegimen(regimenRaw);
  const jurisRaw = por.jurisdiccion || porCal.jurisdiccion || '';
  const jurisdiccion = normalizarJurisdiccion(jurisRaw) || 'AR';
  const jurisdiccionFuente = normTexto(jurisRaw) ? 'fundamento' : 'default';
  const tipoPersona = normClave(por.tipo_persona || '') || null;

  const perfil = {
    cuit: cuit || null,
    terminacion_cuit: cuit.length === 11 ? Number(cuit.slice(-1)) : null,
    regimen, regimen_raw: regimenRaw || null,
    jurisdiccion, jurisdiccion_fuente: jurisdiccionFuente,
    tipo_persona: tipoPersona,
    estado: 'ok', pregunta: null,
  };

  // Cobertura, en orden: jurisdicción → régimen → CUIT. Lo primero
  // que falta es LA pregunta (una sola, como manda la casa).
  if (jurisdiccion !== 'AR') {
    perfil.estado = 'sin-cobertura';
    perfil.pregunta = {
      campo: 'jurisdiccion', grupo: 'datos-fiscales',
      texto: `Tu fundamento dice jurisdicción «${normTexto(jurisRaw)}» y la tabla de reglas de Gesty cubre solo Argentina nacional (ARCA). ¿El negocio tributa en Argentina o en otra jurisdicción?`,
      motivo: 'jurisdiccion-sin-tabla',
    };
    return perfil;
  }
  if (!regimen) {
    perfil.estado = 'sin-cobertura';
    perfil.pregunta = {
      campo: 'condicion_iva', grupo: 'datos-fiscales',
      texto: regimenRaw
        ? `Tu condición frente al IVA figura como «${regimenRaw}» y no está en la tabla de reglas de Gesty. ¿Es monotributo, responsable inscripto o exento?`
        : 'Para calcular tus vencimientos fiscales falta tu condición frente al IVA. ¿Es monotributo, responsable inscripto o exento?',
      opciones: ['monotributo', 'responsable-inscripto', 'exento'],
      motivo: regimenRaw ? 'regimen-fuera-de-tabla' : 'regimen-sin-cargar',
    };
    return perfil;
  }
  const necesitaCuit = REGLAS.some((r) => r.confirmada && r.regimenes.includes(regimen)
    && (r.tipo === 'mensual-bloque-terminacion' || r.tipo === 'mensual-grupos-terminacion'));
  if (necesitaCuit && perfil.terminacion_cuit === null) {
    perfil.estado = 'sin-datos';
    perfil.pregunta = {
      campo: 'cuit', grupo: 'datos-fiscales',
      texto: 'Para calcular tus vencimientos por terminación falta el CUIT del negocio (11 dígitos) en el fundamento. ¿Cuál es?',
      motivo: 'cuit-sin-cargar',
    };
    return perfil;
  }
  return perfil;
}

// ---------------------------------------------------------------------------
// La tabla: selección de versión vigente EN el período
// ---------------------------------------------------------------------------

function versionVigente(reglaId, periodo) {
  const versiones = REGLAS.filter((r) => r.id === reglaId);
  return versiones.find((r) => (r.vigente_desde === null || periodo >= r.vigente_desde)
    && (r.vigente_hasta === null || periodo <= r.vigente_hasta)) || null;
}

function reglasDeLaJurisdiccion(jurisdiccion) {
  const ids = [];
  for (const r of REGLAS) if (r.jurisdiccion === jurisdiccion && !ids.includes(r.id)) ids.push(r.id);
  return ids;
}

// ---------------------------------------------------------------------------
// El cálculo de UN vencimiento según el tipo de regla
// ---------------------------------------------------------------------------

function calcularConRegla(regla, perfil, periodo) {
  const mesVto = addMeses(periodo, regla.mes_offset || 0);
  let fechaNominal = null;
  let base = '';
  if (regla.tipo === 'mensual-dia-fijo') {
    fechaNominal = `${mesVto}-${String(regla.dia).padStart(2, '0')}`;
    base = `día ${regla.dia} de cada mes`;
  } else if (regla.tipo === 'mensual-bloque-terminacion') {
    const idx = regla.pares.findIndex((p) => p.includes(perfil.terminacion_cuit));
    if (idx < 0) return null;
    const ancla = regla.anclas[idx];
    fechaNominal = `${mesVto}-${String(ancla).padStart(2, '0')}`;
    base = `terminación de CUIT ${perfil.terminacion_cuit} (par ${regla.pares[idx].join(' y ')} → día ${ancla}, ${idx + 1}.º día del bloque)`;
    // El bloque se cuenta desde SU inicio (el primer ancla), no
    // desde el ancla de cada par: los cinco días se suceden en
    // días no-fin-de-semana consecutivos desde el primer hábil.
    const fecha = enesimoHabilDesde(`${mesVto}-${String(regla.anclas[0]).padStart(2, '0')}`, idx);
    const ajusteDetalle = fecha !== fechaNominal
      ? `el bloque se corrió por fin de semana: sus cinco días se suceden en días hábiles desde el ${regla.anclas[0]} del mes de vencimiento, y a este par le toca el ${fecha} (su día nominal era el ${fechaNominal})`
      : 'el bloque corre en sus días nominales: ningún día del bloque cayó fin de semana';
    return armarVencimiento(regla, perfil, periodo, fechaNominal, fecha, base, ajusteDetalle);
  } else if (regla.tipo === 'mensual-grupos-terminacion') {
    const g = regla.grupos.find((x) => x.terminaciones.includes(perfil.terminacion_cuit));
    if (!g) return null;
    fechaNominal = `${mesVto}-${String(g.dia).padStart(2, '0')}`;
    base = `terminación de CUIT ${perfil.terminacion_cuit} (grupo ${g.terminaciones.join('-')} → día ${g.dia})`;
  } else {
    return null;
  }
  return armarVencimiento(regla, perfil, periodo, fechaNominal, correrFinDeSemana(fechaNominal), base);
}

function armarVencimiento(regla, perfil, periodo, fechaNominal, fecha, base, ajusteDetalle) {
  return {
    concepto: `Vencimiento fiscal · ${regla.obligacion} (${periodo})`,
    obligacion: regla.obligacion, obligacion_clave: regla.obligacion_clave,
    periodo, fecha, fecha_nominal: fechaNominal,
    monto: null, moneda: '',
    regla_id: regla.id, regla_version: regla.version,
    base,
    ajuste: {
      aplicado: fecha !== fechaNominal ? 'fin-de-semana' : 'ninguno',
      detalle: ajusteDetalle || (fecha !== fechaNominal
        ? `la fecha nominal ${fechaNominal} cae fin de semana: se corre al día hábil siguiente (${fecha})`
        : 'la fecha nominal no cae fin de semana'),
      feriados: DECLARACION_FERIADOS,
    },
    fuente: {
      area: 'fiscal', entidad: 'calculo-fiscal', id: regla.id,
      detalle: `Regla ${regla.id} v${regla.version} · ${base} · ${regla.fuente}`,
    },
    // La forma que consumen G-09/G-16 (la de vencimientos del
    // fundamento): el cálculo se cita como su campo de origen.
    fuente_campo: 'calculo-fiscal', dato_id: null,
    organismo: regla.organismo,
  };
}

// ---------------------------------------------------------------------------
// Cálculo de un período completo para una cuenta
// ---------------------------------------------------------------------------

function calcularPeriodo(db, userId, periodo, opts) {
  if (!esPeriodo(periodo)) fail('El período tiene que venir como AAAA-MM.');
  const perfil = perfilFiscal(db, userId);
  const salida = {
    periodo, perfil, estado: perfil.estado,
    pregunta: perfil.pregunta,
    vencimientos: [], reglas_aplicadas: [], reglas_sin_confirmar: [],
    reglas_no_aplicables: [], sin_version_en_periodo: [],
    fuera_de_tabla: FUERA_DE_TABLA,
    declaraciones: [DECLARACION_FERIADOS],
  };
  if (perfil.jurisdiccion_fuente === 'default') {
    salida.declaraciones.push('La jurisdicción no está cargada en el fundamento: se asume Argentina nacional (el mercado de lanzamiento) y se declara; si el negocio tributa en otra jurisdicción, hay que cargarla.');
  }
  if (perfil.estado !== 'ok') return salida;

  for (const reglaId of reglasDeLaJurisdiccion(perfil.jurisdiccion)) {
    const versiones = REGLAS.filter((r) => r.id === reglaId);
    const cualquiera = versiones[0];
    if (!cualquiera.regimenes.includes(perfil.regimen)) continue;
    if (cualquiera.requiere) {
      const datos = gesty.getData(db, userId, { grupo: cualquiera.requiere.grupo });
      const dato = datos.find((d) => d.campo === cualquiera.requiere.campo);
      const valor = normClave(dato ? dato.valor : '');
      if (valor !== cualquiera.requiere.valor) {
        salida.reglas_no_aplicables.push({
          regla_id: reglaId, obligacion: cualquiera.obligacion, motivo: cualquiera.requiere.motivo,
        });
        continue;
      }
    }
    const regla = versionVigente(reglaId, periodo);
    if (!regla) {
      salida.sin_version_en_periodo.push({
        regla_id: reglaId, obligacion: cualquiera.obligacion,
        motivo: `ninguna versión de la regla cubre el período ${periodo} (vigencias: ${versiones.map((v) => `v${v.version || '—'} ${v.vigente_desde || '…'}→${v.vigente_hasta || '…'}`).join(' · ')})`,
      });
      continue;
    }
    if (!regla.confirmada) {
      salida.reglas_sin_confirmar.push({
        regla_id: regla.id, obligacion: regla.obligacion,
        motivo: regla.motivo_sin_confirmar || 'regla sin confirmar',
      });
      continue;
    }
    const v = calcularConRegla(regla, perfil, periodo);
    if (v) {
      salida.vencimientos.push(v);
      salida.reglas_aplicadas.push({ regla_id: regla.id, version: regla.version, obligacion: regla.obligacion });
    }
  }
  if (perfil.regimen === 'exento') {
    salida.declaraciones.push('Régimen exento: la tabla no le asigna vencimientos nacionales mensuales; cualquier obligación particular del negocio se sigue cargando a mano en el fundamento.');
  }
  salida.vencimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return salida;
}

// Lista plana en la forma G-09 para un rango de fechas (la fuente
// calculada que la agenda puede consumir).
function vencimientosCalculados(db, userId, opts) {
  const o = opts || {};
  const desde = esFechaISO(o.desde) ? String(o.desde) : hoyDe(o);
  const hasta = esFechaISO(o.hasta) ? String(o.hasta) : addDias(desde, 92);
  if (hasta < desde) fail('El rango está invertido (hasta < desde).');
  // Un vencimiento del período P puede caer hasta un mes después:
  // se calculan los períodos desde un mes antes de `desde`.
  const items = [];
  let periodo = addMeses(periodoDe(desde), -1);
  const ultimo = periodoDe(hasta);
  let guardia = 0;
  while (periodo <= ultimo && guardia++ < 40) {
    const r = calcularPeriodo(db, userId, periodo, o);
    for (const v of r.vencimientos) if (v.fecha >= desde && v.fecha <= hasta) items.push(v);
    periodo = addMeses(periodo, 1);
  }
  return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ---------------------------------------------------------------------------
// Convivencia calculado ↔ cargado a mano (sin tocar G-06/G-09)
// ---------------------------------------------------------------------------

function claveCoincideManual(manual, calculado) {
  const texto = normClave(`${manual.concepto || ''} ${manual.fuente_campo || ''}`);
  return texto.split(' ').includes(calculado.obligacion_clave)
    || (calculado.obligacion_clave === 'autonomos' && texto.includes('autonomo'));
}

function vencimientosUnificados(db, userId, opts) {
  const o = opts || {};
  let desde; let hasta;
  if (esPeriodo(o.periodo)) {
    desde = `${o.periodo}-01`;
    hasta = `${addMeses(o.periodo, 1)}-01`;
    hasta = addDias(hasta, -1);
    // El vencimiento del período cae en el mes siguiente (offset):
    // la ventana de la vista cubre el período y su mes de vto.
    hasta = addDias(`${addMeses(o.periodo, 2)}-01`, -1);
  } else {
    desde = esFechaISO(o.desde) ? String(o.desde) : hoyDe(o);
    hasta = esFechaISO(o.hasta) ? String(o.hasta) : addDias(desde, 92);
  }
  const perfil = perfilFiscal(db, userId);
  const { conMonto, sinMonto } = reportes.vencimientosFiscalesFundamento(db, userId);
  const items = [];
  const usados = new Set();
  const calculados = perfil.estado === 'ok' ? vencimientosCalculados(db, userId, { desde, hasta, hoy: o.hoy }) : [];
  for (const c of calculados) {
    const idx = conMonto.findIndex((m, i) => !usados.has(i) && m.fecha === c.fecha && claveCoincideManual(m, c));
    if (idx >= 0) {
      usados.add(idx);
      const m = conMonto[idx];
      items.push({
        ...c, monto: m.monto, moneda: m.moneda,
        fuentes: ['fundamento', 'calculo'],
        fundamento: { fuente_campo: m.fuente_campo, dato_id: m.dato_id },
        fusionada: true,
      });
    } else {
      items.push({ ...c, fuentes: ['calculo'], fusionada: false });
    }
  }
  conMonto.forEach((m, i) => {
    if (usados.has(i)) return;
    if (m.fecha < desde || m.fecha > hasta) return;
    items.push({
      concepto: m.concepto, fecha: m.fecha, monto: m.monto, moneda: m.moneda,
      fuente_campo: m.fuente_campo, dato_id: m.dato_id,
      fuentes: ['fundamento'], fusionada: false, calculada: false,
      fuente: { area: 'fiscal', entidad: 'calendario-fiscal', id: m.dato_id, detalle: `Dato «${m.fuente_campo}» del fundamento` },
    });
  });
  items.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return {
    desde, hasta, perfil,
    estado: perfil.estado, pregunta: perfil.pregunta,
    items,
    // Las reglas del fundamento que no se pudieron fechar siguen
    // declaradas, como en G-09: nada se pierde en silencio.
    compromisos_sin_fecha: sinMonto.map((s) => ({
      fuente: { area: 'fiscal', entidad: 'calendario-fiscal', id: s.dato_id, detalle: `Dato «${s.campo}» del fundamento` },
      descripcion: typeof s.valor === 'string' ? s.valor : JSON.stringify(s.valor),
      motivo: 'dato del fundamento sin {fecha, monto}: no es un vencimiento calculado ni uno cargado con fecha',
    })),
    declaraciones: [DECLARACION_FERIADOS, ...FUERA_DE_TABLA.map((f) => f.detalle)],
  };
}

// ---------------------------------------------------------------------------
// Resumen para «La oficina»
// ---------------------------------------------------------------------------

function resumenFiscal(db, userId, opts) {
  const o = opts || {};
  const hoy = hoyDe(o);
  const perfil = perfilFiscal(db, userId);
  const salida = {
    fecha: hoy, perfil, estado: perfil.estado, pregunta: perfil.pregunta,
    proximo: null, en_30_dias: 0, reglas_sin_confirmar: [], sin_version_en_periodo: [],
    declaraciones: [DECLARACION_FERIADOS],
  };
  if (perfil.estado !== 'ok') return salida;
  const vista = vencimientosUnificados(db, userId, { desde: hoy, hasta: addDias(hoy, 92), hoy });
  const futuros = vista.items.filter((i) => i.fecha >= hoy);
  salida.proximo = futuros[0] || null;
  salida.en_30_dias = futuros.filter((i) => i.fecha <= addDias(hoy, 30)).length;
  const periodo = periodoDe(hoy);
  const calc = calcularPeriodo(db, userId, periodo, o);
  salida.reglas_sin_confirmar = calc.reglas_sin_confirmar;
  salida.sin_version_en_periodo = calc.sin_version_en_periodo;
  return salida;
}

// La tabla misma, legible: qué reglas hay, con qué versión,
// vigencia y fuente — y cuáles están sin confirmar.
function tablaDeReglas() {
  return {
    jurisdicciones: [...new Set(REGLAS.map((r) => r.jurisdiccion))],
    reglas: REGLAS.map((r) => ({
      id: r.id, jurisdiccion: r.jurisdiccion, organismo: r.organismo,
      obligacion: r.obligacion, regimenes: r.regimenes, tipo: r.tipo,
      version: r.version, vigente_desde: r.vigente_desde, vigente_hasta: r.vigente_hasta,
      confirmada: r.confirmada, fuente: r.fuente,
      motivo_sin_confirmar: r.motivo_sin_confirmar || null,
      requiere: r.requiere || null,
    })),
    fuera_de_tabla: FUERA_DE_TABLA,
    ajuste_dia_inhabil: {
      calculado: 'corrimiento por fin de semana (sábado/domingo) al día siguiente; en el IVA, el bloque de cinco días se sucede en días no-fin-de-semana desde el 18',
      no_calculado: DECLARACION_FERIADOS,
      regla_general_verificada: 'si el vencimiento coincide con día feriado o inhábil, se traslada al día hábil inmediato siguiente (RG AFIP 2819/2010 para Monotributo; cronogramas mensuales ARCA para IVA)',
    },
  };
}

module.exports = {
  // constantes
  REGLAS, FUERA_DE_TABLA, DECLARACION_FERIADOS, REGIMENES_CONOCIDOS,
  // perfil
  perfilFiscal, normalizarRegimen, normalizarJurisdiccion,
  // cálculo
  calcularPeriodo, vencimientosCalculados, vencimientosUnificados,
  // resumen / tabla
  resumenFiscal, tablaDeReglas,
  // piezas internas, exportadas para tests y reuso
  versionVigente, correrFinDeSemana, enesimoHabilDesde, addMeses,
};
