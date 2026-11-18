// venty-series.js — VENTY F5: SERIES CON NOMBRE (lección C14 de Posty).
// Cada negocio tiene sus jugadas EN SERIE con nombre propio, derivadas de
// su rubro y su fundamento — el espíritu de los formatos de Posty
// («The Dish», «Handmade»): nombres cortos, con identidad del negocio,
// nunca genéricos tipo «Serie 1». El método es el mismo para todos; la
// identidad, jamás.
//
// LAS 4 SERIES (cubren los 6 tipos del playbook de emails):
//   · primer_contacto  → [T1 primer contacto]
//   · seguimiento      → [T2 seguimiento 1 (24–48 h), T3 seguimiento 2
//                         (4–5 días), T4 cierre suave] — máximo 3 toques,
//                         silencio tras el tercero = partida cerrada.
//   · reactivacion     → [T5 reactivación, solo lista del cliente]
//   · resena_referido  → [T6 reseña/referido, solo tras venta cerrada y
//                         ganada, una vez por venta, en el canal del cierre]
//
// MODELO DE DATOS (nuevo, declarado):
//   venty_series: una fila por (user_id, tipo) con nombre, si el nombre
//     tiene identidad (nombre_es_identidad), el hash del fundamento del
//     que nació, los pasos en pasos_json y la firma (siempre el negocio).
//   venty_series_meta: por user_id, el hash del fundamento sustancial y
//     la versión con la que se generaron las series (regeneración solo
//     ante cambio sustancial: rubro, estrella, nombres de la lista de
//     precios, oferta o rituales; paleta, web o tono NO regeneran).
//
// REGLAS DURAS QUE ESTE MÓDULO HACE CUMPLIR:
//   · CADA PASO VENDE UNA SOLA IDEA: el paso lleva idea y cta singulares
//     y validarPaso/validarSerie rechazan cualquier paso con dos ideas
//     o dos ctas (estructural: arrays ideas/ctas de largo distinto de 1,
//     o campos idea/cta en formato lista).
//   · Se firma como el negocio, nunca como Venty: la firma de cada paso
//     es «el equipo de {negocio}» y el validador rechaza firmas de Venty.
//   · La voz de Venty: minúsculas y sin signos de apertura (¿/¡) en todo
//     texto generado por este módulo (nombres, asuntos y textos).
//   · Nada inventado: el nombre nace del fundamento real. Si el
//     fundamento es pobre (sin producto estrella, sin lista de precios,
//     sin rituales ni oferta), NO se inventa identidad: la serie nace
//     con su nombre funcional y se deja UNA jugada en Bandeja
//     (tipo 'serie_sin_nombre') proponiendo completar el fundamento
//     para que las series puedan nombrarse.
//   · Nada se envía desde acá: las series son estructura y plantillas.
//     La salida sigue viviendo en espejo + Bandeja + gobernador.
//
// DISPARO (punto mínimo viable, declarado): en v1111 no hay endpoint
// separado de aceptación de fundamento; el fundamento vigente en
// venty_fundamento es el aceptado. server.js llama asegurarSeries()
// desde ventyUid() tras asegurarSemilla: genera la primera vez que hay
// fundamento y regenera solo ante cambio sustancial (hash). La ruta
// POST /api/venty/series/generar permite regenerar a mano.
'use strict';

const crypto = require('crypto');
const venty = require('./venty');

const TIPOS_SERIE = ['primer_contacto', 'seguimiento', 'reactivacion', 'resena_referido'];
const NOMBRES_FUNCIONALES = {
  primer_contacto: 'primer contacto',
  seguimiento: 'seguimiento',
  reactivacion: 'reactivación',
  resena_referido: 'reseña y referido',
};
// toque (oleada / motor) → serie. Los tipos del playbook T1..T6 mapean
// directo; los nombres de toque del motor también.
const SERIE_POR_TOQUE = {
  T1: 'primer_contacto', primer_contacto: 'primer_contacto', oleada_primer_contacto: 'primer_contacto',
  T2: 'seguimiento', T3: 'seguimiento', T4: 'seguimiento', seguimiento: 'seguimiento', cierre_suave: 'seguimiento',
  T5: 'reactivacion', reactivacion: 'reactivacion',
  T6: 'resena_referido', resena: 'resena_referido', resena_referido: 'resena_referido', referido: 'resena_referido',
};

function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    nombre TEXT NOT NULL DEFAULT '',
    nombre_es_identidad INTEGER NOT NULL DEFAULT 0,
    fundamento_hash TEXT NOT NULL DEFAULT '',
    pasos_json TEXT NOT NULL DEFAULT '[]',
    firma_negocio TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    UNIQUE(user_id, tipo)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_series_user ON venty_series(user_id, tipo)');
  db.exec(`CREATE TABLE IF NOT EXISTS venty_series_meta (
    user_id INTEGER PRIMARY KEY,
    fundamento_hash TEXT NOT NULL DEFAULT '',
    fundamento_version INTEGER NOT NULL DEFAULT 0,
    nombres_con_identidad INTEGER NOT NULL DEFAULT 0,
    generado_at TEXT NOT NULL DEFAULT ''
  )`);
}

// ---- fundamento: lectura flexible (fila de venty.leerFundamento o un
// objeto fundamento pasado por el llamador/test, con campos opcionales
// negocio, oferta y rituales que el fundamento extendido puede traer) --
function negocioDe(db, userId, f) {
  if (f && (f.negocio || f.nombre_negocio || f.nombre)) return String(f.negocio || f.nombre_negocio || f.nombre).slice(0, 80);
  try {
    const p = db.prepare('SELECT business_name FROM profiles WHERE user_id = ?').get(userId);
    if (p && p.business_name) return String(p.business_name).slice(0, 80);
  } catch (e) { /* sin tabla profiles (tests unitarios): se prueba la siguiente fuente */ }
  try {
    const u = db.prepare('SELECT business_name FROM users WHERE id = ?').get(userId);
    if (u && u.business_name) return String(u.business_name).slice(0, 80);
  } catch (e) { /* sin tabla users: la firma usa plantilla */ }
  return '';
}

// Campos SUSTANCIALES del fundamento: si cambia alguno, las series se
// regeneran. Paleta, website_url y tono quedan fuera a propósito.
function huellaFundamento(f) {
  const x = f || {};
  const precios = (x.precios || []).map((p) => norm(p && p.item)).filter(Boolean).sort();
  const rituales = (Array.isArray(x.rituales) ? x.rituales : []).map(norm).filter(Boolean).sort();
  return sha(JSON.stringify({
    rubro: norm(x.rubro || x.modo || ''),
    estrella: norm(x.estrella || ''),
    precios,
    oferta: norm(x.oferta || ''),
    rituales,
  }));
}

// ---- derivación determinística del nombre -------------------------------
// Núcleo con identidad: las primeras palabras significativas de un texto
// del fundamento (sin «para dos», sin artículos), conservando su forma.
const PALABRAS_VACIAS = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'y', 'e', 'del', 'al', 'en', 'por']);
function nucleoDe(texto, maxPalabras) {
  const limpio = String(texto || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bpara\s+(dos|uno|una|cuatro|seis|\d+)\b.*$/i, ' ')
    .replace(/[^a-záéíóúñü0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!limpio) return '';
  const palabras = limpio.split(' ').filter((w) => !PALABRAS_VACIAS.has(norm(w)));
  return palabras.slice(0, maxPalabras || 3).join(' ');
}

// Stem con identidad del negocio, en orden de fuerza del fundamento:
// producto estrella CON NOMBRE → primer ítem de la lista → ritual →
// oferta. Sin ninguno de esos materiales, no hay stem (no se inventa).
function derivarStem(f) {
  const x = f || {};
  const deEstrella = nucleoDe(x.estrella || '', 3);
  if (deEstrella) return { stem: deEstrella, fuente: 'estrella' };
  const precios = Array.isArray(x.precios) ? x.precios : [];
  for (const p of precios) {
    const n = nucleoDe((p && p.item) || '', 3);
    if (n) return { stem: n, fuente: 'lista_precios' };
  }
  const rituales = Array.isArray(x.rituales) ? x.rituales : [];
  for (const r of rituales) {
    const n = nucleoDe(typeof r === 'string' ? r : ((r && (r.nombre || r.que)) || ''), 3);
    if (n) return { stem: n, fuente: 'ritual' };
  }
  const deOferta = nucleoDe(x.oferta || '', 3);
  if (deOferta) return { stem: deOferta, fuente: 'oferta' };
  return { stem: '', fuente: '' };
}

// Palabra de serie por rubro: evoca el ritual del rubro (como «The Dish»
// evoca el plato). El stem aporta la identidad; esta palabra, el oficio.
const PALABRAS_POR_RUBRO = [
  { claves: ['gastronom', 'cafe', 'restaur', 'cocina', 'panader', 'pizzer', 'helader'],
    palabras: { primer_contacto: 'la mesa', seguimiento: 'la sobremesa', reactivacion: 'la vuelta a la mesa', resena_referido: 'el boca a boca' } },
  { claves: ['barber', 'peluquer', 'estetica', 'belleza', 'unas', 'spa'],
    palabras: { primer_contacto: 'la primera silla', seguimiento: 'la silla', reactivacion: 'de vuelta a la silla', resena_referido: 'el boca a boca' } },
  { claves: ['retail', 'tienda', 'moda', 'ropa', 'indumentaria', 'calzado'],
    palabras: { primer_contacto: 'la vidriera', seguimiento: 'la vidriera sigue', reactivacion: 'de vuelta a la vidriera', resena_referido: 'la recomendación' } },
  { claves: ['inmuebl', 'propiedad', 'profesional', 'abogad', 'contador', 'estudio'],
    palabras: { primer_contacto: 'la visita', seguimiento: 'la visita sigue', reactivacion: 'la puerta abierta', resena_referido: 'la recomendación' } },
  { claves: ['taller', 'biciclet', 'mecanic', 'reparac', 'servicio'],
    palabras: { primer_contacto: 'el primer arreglo', seguimiento: 'el arreglo sigue', reactivacion: 'la vuelta al taller', resena_referido: 'la recomendación' } },
  { claves: ['fitness', 'gimnasio', 'pilates', 'yoga', 'entrenamiento'],
    palabras: { primer_contacto: 'la primera clase', seguimiento: 'la clase sigue', reactivacion: 'la vuelta a entrenar', resena_referido: 'el boca a boca' } },
];
const PALABRAS_DEFAULT = { primer_contacto: 'el arranque', seguimiento: 'la vuelta', reactivacion: 'el regreso', resena_referido: 'el boca a boca' };

function palabraDeRubro(rubro, tipo) {
  const r = norm(rubro || '');
  for (const fila of PALABRAS_POR_RUBRO) {
    if (fila.claves.some((c) => r.includes(norm(c)))) return fila.palabras[tipo];
  }
  return PALABRAS_DEFAULT[tipo];
}

// derivarNombreSerie(tipo, fundamento) → { nombre, es_identidad, stem, fuente }
// Determinística: mismo fundamento → mismo nombre, siempre.
function derivarNombreSerie(tipo, fundamento) {
  if (!TIPOS_SERIE.includes(tipo)) return { nombre: '', es_identidad: false, stem: '', fuente: '', error: 'tipo_invalido' };
  const f = fundamento || {};
  const { stem, fuente } = derivarStem(f);
  if (!stem) return { nombre: NOMBRES_FUNCIONALES[tipo], es_identidad: false, stem: '', fuente: '' };
  const palabra = palabraDeRubro(f.rubro || f.modo || '', tipo);
  return { nombre: `${stem} · ${palabra}`, es_identidad: true, stem, fuente };
}

// ---- validador: una sola idea por paso (regla dura 1 y 3 del playbook) --
// Un paso pasa solo si lleva exactamente UNA idea y UNA cta (campos
// singulares, texto no vacío), firma del negocio y voz sin ¿/¡. Cualquier
// lista ideas/ctas con largo distinto de 1, o idea/cta dados como lista,
// lo rechaza: un paso con dos ideas NO pasa.
function validarPaso(paso) {
  const p = paso || {};
  const errores = [];
  if (Array.isArray(p.idea)) errores.push('idea_en_lista');
  if (Array.isArray(p.cta)) errores.push('cta_en_lista');
  if (p.ideas !== undefined && (!Array.isArray(p.ideas) || p.ideas.length !== 1)) errores.push('dos_ideas');
  if (p.ctas !== undefined && (!Array.isArray(p.ctas) || p.ctas.length !== 1)) errores.push('dos_ctas');
  if (p.ideas !== undefined && Array.isArray(p.ideas) && p.idea !== undefined && norm(p.ideas[0]) !== norm(p.idea)) errores.push('idea_no_coincide');
  if (typeof p.idea !== 'string' || !p.idea.trim()) errores.push('sin_idea');
  if (typeof p.cta !== 'string' || !p.cta.trim()) errores.push('sin_cta');
  if (!p.tipo_email || !/^T[1-6]$/.test(String(p.tipo_email))) errores.push('tipo_email_invalido');
  const texto = String(p.texto || '');
  if (!texto.trim()) errores.push('sin_texto');
  if (/[¿¡]/.test(texto + ' ' + String(p.asunto || '') + ' ' + String(p.idea || ''))) errores.push('signo_apertura');
  if (texto.split(/\s+/).filter(Boolean).length > 90) errores.push('texto_largo');
  const firma = String(p.firma || '');
  if (!firma || /venty/i.test(firma)) errores.push('firma_no_es_del_negocio');
  if (/\bventy\b/i.test(texto.replace(/ventysalesmanager\.com/gi, ''))) errores.push('texto_menciona_a_venty');
  return { ok: errores.length === 0, errores };
}

function validarSerie(serie) {
  const s = serie || {};
  const errores = [];
  if (!TIPOS_SERIE.includes(s.tipo)) errores.push('tipo_invalido');
  if (!s.nombre || !String(s.nombre).trim()) errores.push('sin_nombre');
  if (/[¿¡]/.test(String(s.nombre || ''))) errores.push('signo_apertura');
  if (!Array.isArray(s.pasos) || !s.pasos.length) errores.push('sin_pasos');
  (s.pasos || []).forEach((paso, i) => {
    const v = validarPaso(paso);
    if (!v.ok) errores.push(`paso_${i + 1}:${v.errores.join(',')}`);
  });
  return { ok: errores.length === 0, errores };
}

// ---- construcción de los pasos (estructura del playbook, datos del
// fundamento: estrella CON NOMBRE, oferta y tono; lo que no está en el
// fundamento no se escribe — los huecos van como {dato} a completar) ----
function construirPasos(tipo, f, ctx) {
  const negocio = ctx.negocio || '{negocio}';
  const firma = `el equipo de ${negocio}`;
  const estrella = String(f.estrella || '').trim();
  const estrellaTxt = estrella ? estrella.toLowerCase() : 'nuestro producto estrella';
  const precios = Array.isArray(f.precios) ? f.precios : [];
  const precioEstrella = precios.find((p) => norm(p.item) === norm(estrella));
  const precioTxt = precioEstrella ? ` a ${venty.fmtPesos(precioEstrella.precio)}` : '';
  const otroItem = precios.find((p) => norm(p.item) !== norm(estrella));
  const otroTxt = otroItem ? otroItem.item.toLowerCase() : 'otra opción de la lista';
  const oferta = String(f.oferta || '').trim();
  const base = { firma };
  if (tipo === 'primer_contacto') {
    return [{
      ...base, orden: 1, tipo_email: 'T1',
      espera: { min_horas: 0, max_horas: 0, desde: 'ingreso_del_prospecto' },
      idea: `presentar ${estrellaTxt} con una oferta concreta para prospectos como el destinatario`,
      cta: 'responder si le sirve una degustación o primera visita en una fecha concreta',
      asunto: `${estrellaTxt}, para tu equipo`,
      texto: `hola, soy del equipo de ${negocio}. hacemos ${oferta ? oferta.toLowerCase() : 'una propuesta para negocios como el tuyo'} y lo más pedido es ${estrellaTxt}${precioTxt}. te llevamos una muestra esta semana, sin compromiso.`,
    }];
  }
  if (tipo === 'seguimiento') {
    return [
      {
        ...base, orden: 1, tipo_email: 'T2',
        espera: { min_horas: 24, max_horas: 48, desde: 'T1' },
        idea: 'traer una novedad real del fundamento, sin repetir el primer contacto',
        cta: 'responder si le guardamos un lugar en la fecha nueva',
        asunto: `re: ${estrellaTxt}`,
        texto: `hola, te escribo de nuevo del equipo de ${negocio}. novedad de esta semana: abrimos una fecha nueva para ${estrellaTxt}. te guardo un lugar sin compromiso.`,
      },
      {
        ...base, orden: 2, tipo_email: 'T3',
        espera: { min_horas: 96, max_horas: 120, desde: 'T1' },
        idea: `cambiar de ángulo con otra oferta concreta de la lista: ${otroTxt}`,
        cta: 'responder qué día le queda mejor para probarlo',
        asunto: `otra idea: ${otroTxt}`,
        texto: `hola, otra idea del equipo de ${negocio}: además de ${estrellaTxt}, lo que más sale es ${otroTxt}. si te sirve, te muestro cómo quedaría para tu equipo.`,
      },
      {
        ...base, orden: 3, tipo_email: 'T4',
        espera: { min_horas: 48, max_horas: 72, desde: 'T3' },
        idea: 'cerrar el loop con una salida amable y una puerta abierta, sin presión',
        cta: 'responder solo si alguna vez le sirve retomar',
        asunto: 'cierro el loop por ahora',
        texto: `hola, no tuve respuesta así que cierro el loop de mi lado, sin ningún problema. si alguna vez te sirve ${estrellaTxt}, la puerta queda abierta. gracias por tu tiempo.`,
      },
    ];
  }
  if (tipo === 'reactivacion') {
    return [{
      ...base, orden: 1, tipo_email: 'T5',
      espera: { min_horas: 0, max_horas: 0, desde: 'contacto_dormido_de_la_lista_del_cliente' },
      idea: 'traer una novedad real del fundamento como única razón para volver ahora',
      cta: 'responder si quiere recibir la novedad completa',
      asunto: 'cambió algo desde tu última visita',
      texto: `hola, soy del equipo de ${negocio}. pasó un tiempo desde tu última visita y cambió algo: ${estrellaTxt} sigue siendo lo más pedido${precioTxt}. te mando la novedad completa con una sola respuesta tuya.`,
    }];
  }
  // resena_referido — T6: solo tras venta cerrada y ganada, una vez por
  // venta, dentro de la conversación de cierre y en su mismo canal.
  return [{
    ...base, orden: 1, tipo_email: 'T6',
    espera: { min_horas: 0, max_horas: 0, desde: 'cierre_ganado' },
    solo_tras_cierre: true, una_vez_por_venta: true, canal: 'el_del_cierre',
    idea: 'agradecer la compra nombrando lo que compró y pedir la reseña con su referido en la misma nota breve',
    cta: 'dejar la reseña en google desde el link directo',
    asunto: 'gracias, un favor chico',
    texto: `hola, gracias por tu compra de ${estrellaTxt}. si tenés 30 segundos, una reseña en google nos ayuda muchísimo: {link_resena}. y si conocés a alguien a quien le sirva, nos encantaría que nos presentes.`,
  }];
}

// ---- generación / persistencia -------------------------------------------
function filaASerie(row) {
  if (!row) return null;
  let pasos = [];
  try { pasos = JSON.parse(row.pasos_json || '[]'); } catch (e) { pasos = []; }
  return {
    id: row.id, user_id: row.user_id, tipo: row.tipo, nombre: row.nombre,
    nombre_es_identidad: row.nombre_es_identidad === 1, es_identidad: row.nombre_es_identidad === 1,
    fundamento_hash: row.fundamento_hash, pasos, firma_negocio: row.firma_negocio,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

function listarSeries(db, userId) {
  ensureSchema(db);
  const rows = db.prepare('SELECT * FROM venty_series WHERE user_id = ?').all(userId);
  const porTipo = new Map(rows.map((r) => [r.tipo, filaASerie(r)]));
  return TIPOS_SERIE.map((t) => porTipo.get(t)).filter(Boolean);
}

function obtenerSerie(db, userId, tipo) {
  ensureSchema(db);
  return filaASerie(db.prepare('SELECT * FROM venty_series WHERE user_id = ? AND tipo = ?').get(userId, tipo));
}

function tieneSeries(db, userId) {
  ensureSchema(db);
  const r = db.prepare('SELECT COUNT(*) c FROM venty_series WHERE user_id = ?').get(userId);
  return !!(r && r.c) && r.c >= TIPOS_SERIE.length;
}

// Genera (o regenera) las 4 series del negocio desde su fundamento.
// opts: { fundamento, negocio, forzar } — sin fundamento, se lee el
// vigente de venty_fundamento (el aceptado). Idempotente por hash: si el
// fundamento sustancial no cambió y ya hay series, no reescribe nada.
function generarSeries(db, userId, opts) {
  const o = opts || {};
  ensureSchema(db);
  const ventyMod = o.venty || venty;
  const f = o.fundamento || (ventyMod.leerFundamento ? ventyMod.leerFundamento(db, userId) : null);
  if (!f) return { ok: false, error: 'sin_fundamento' };
  const hash = huellaFundamento(f);
  const meta = db.prepare('SELECT * FROM venty_series_meta WHERE user_id = ?').get(userId);
  if (!o.forzar && meta && meta.fundamento_hash === hash && tieneSeries(db, userId)) {
    return { ok: true, ya_existia: true, regenerada: false, fundamento_hash: hash, series: listarSeries(db, userId) };
  }
  const negocio = String(o.negocio || negocioDe(db, userId, f) || '').slice(0, 80);
  const ctx = { negocio };
  const ahora = ahoraIso();
  const up = db.prepare(`INSERT INTO venty_series (user_id, tipo, nombre, nombre_es_identidad, fundamento_hash, pasos_json, firma_negocio, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, tipo) DO UPDATE SET nombre = excluded.nombre, nombre_es_identidad = excluded.nombre_es_identidad,
      fundamento_hash = excluded.fundamento_hash, pasos_json = excluded.pasos_json, firma_negocio = excluded.firma_negocio,
      updated_at = excluded.updated_at`);
  const series = [];
  let conIdentidad = 0;
  for (const tipo of TIPOS_SERIE) {
    const der = derivarNombreSerie(tipo, f);
    if (der.es_identidad) conIdentidad++;
    const pasos = construirPasos(tipo, f, ctx);
    const serie = { tipo, nombre: der.nombre, nombre_es_identidad: der.es_identidad, pasos, firma_negocio: `el equipo de ${negocio || '{negocio}'}` };
    const v = validarSerie(serie);
    if (!v.ok) return { ok: false, error: 'serie_invalida', tipo, errores: v.errores };
    up.run(userId, tipo, der.nombre, der.es_identidad ? 1 : 0, hash, JSON.stringify(pasos), serie.firma_negocio, ahora, ahora);
    series.push(serie);
  }
  db.prepare(`INSERT INTO venty_series_meta (user_id, fundamento_hash, fundamento_version, nombres_con_identidad, generado_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET fundamento_hash = excluded.fundamento_hash, fundamento_version = excluded.fundamento_version,
      nombres_con_identidad = excluded.nombres_con_identidad, generado_at = excluded.generado_at`)
    .run(userId, hash, Number(f.version || 0) || 0, conIdentidad, ahora);
  // Fundamento pobre: sin identidad no se inventa — queda la jugada en
  // Bandeja proponiendo completar el fundamento para poder nombrarlas.
  let jugadaNombreId = null;
  if (conIdentidad === 0) {
    try {
      const previa = db.prepare(`SELECT id FROM venty_jugadas WHERE user_id = ? AND tipo = 'serie_sin_nombre' AND estado = 'pendiente'`).get(userId);
      if (!previa) {
        const r = db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?, 'serie_sin_nombre', ?, ?, 'pendiente')`)
          .run(userId, null, JSON.stringify({
            que: 'completar el fundamento con el producto estrella con nombre para que las series de este negocio tengan nombre propio',
            nombres_actuales: series.map((s) => s.nombre),
            propuesta: 'cuando el fundamento tenga producto estrella, lista de precios o un ritual propio, las series se regeneran y esta jugada propone sus nombres',
          }), 'el fundamento todavía no tiene material con identidad (producto estrella, lista o ritual): las series nacieron con nombre funcional y no se inventa identidad');
        jugadaNombreId = Number(r.lastInsertRowid);
      } else jugadaNombreId = previa.id;
    } catch (e) { /* la Bandeja es de venty.js; si no está, las series igual quedan */ }
  }
  try { ventyMod.registrarEvento(db, userId, 'series_generadas', null, { fundamento_hash: hash, nombres_con_identidad: conIdentidad, regenerada: !!meta }); } catch (e) {}
  return { ok: true, ya_existia: false, regenerada: !!meta, fundamento_hash: hash, nombres_con_identidad: conIdentidad, jugada_nombre_id: jugadaNombreId, series: listarSeries(db, userId) };
}

// Asegurar = generar si falta o si el fundamento cambió de forma
// sustancial. Es el disparo enganchado en server.js (ventyUid).
function asegurarSeries(db, userId, opts) {
  ensureSchema(db);
  const ventyMod = (opts && opts.venty) || venty;
  const f = (opts && opts.fundamento) || (ventyMod.leerFundamento ? ventyMod.leerFundamento(db, userId) : null);
  if (!f) return { ok: false, error: 'sin_fundamento' };
  return generarSeries(db, userId, { ...(opts || {}), fundamento: f });
}

// ¿El fundamento cambió de forma sustancial respecto del que generó las
// series vigentes? (comparación de huellas de campos sustanciales)
function fundamentoCambioSustancial(db, userId, fundamento) {
  ensureSchema(db);
  const meta = db.prepare('SELECT * FROM venty_series_meta WHERE user_id = ?').get(userId);
  if (!meta) return true;
  const f = fundamento || (venty.leerFundamento ? venty.leerFundamento(db, userId) : null);
  if (!f) return false;
  return meta.fundamento_hash !== huellaFundamento(f);
}

// ---- uso por nombre: qué serie (y qué paso) corresponde a cada toque ----
function serieParaToque(db, userId, toque) {
  const tipoSerie = SERIE_POR_TOQUE[String(toque || '')] || SERIE_POR_TOQUE[norm(toque || '')];
  if (!tipoSerie) return null;
  const serie = obtenerSerie(db, userId, tipoSerie);
  if (!serie) return null;
  const t = String(toque || '').toUpperCase();
  let paso = null;
  if (/^T[1-6]$/.test(t)) paso = (serie.pasos || []).find((p) => p.tipo_email === t) || null;
  if (!paso) paso = (serie.pasos || [])[0] || null;
  return { serie, serie_tipo: tipoSerie, serie_nombre: serie.nombre, paso };
}

module.exports = {
  TIPOS_SERIE, NOMBRES_FUNCIONALES, SERIE_POR_TOQUE,
  ensureSchema, huellaFundamento, derivarStem, derivarNombreSerie, nucleoDe,
  validarPaso, validarSerie, construirPasos,
  generarSeries, asegurarSeries, fundamentoCambioSustancial,
  listarSeries, obtenerSerie, tieneSeries, serieParaToque, negocioDe,
};
