// postjardin.js — Jardín Posty DESPUÉS del nivel 50 + historia real.
// Lote 4. Solo Posty. Solo hechos reales. Sin nivel 51, sin reset,
// nada comprable, nada inventado. Las 4 post-jardín aparecen SOLO con
// nivel 50; la historia de meses sirve en cualquier nivel (el momento
// del avance la usa en cada premio real).
//
// Funciones puras (sin DB) para testear sin servidor; estadoPost50()
// arma los datos desde la DB y llama a las puras. El endpoint pasa
// metrics (oficina.metricas) como hace /api/oficina/nivel: este módulo
// NO requiere server.js ni oficina.js (sin ciclos).
'use strict';

// ---------- ZONAS NUEVAS (descubrimientos, no niveles) ----------
// Umbrales por semanas publicadas POST-50 (semana_publicada − 30, Lote 3).
// El estanque se descubre al completar (50); el resto, con constancia
// posterior. Decisión de diseño Lote 4, a reportar: umbrales 0/2/5/9.
const ZONAS_POST50 = [
  { id: 'estanque', nombre: 'El estanque con puente', descripcion: 'Agua tranquila entre el bambú, un lugar nuevo para descubrir.', umbral: 0 },
  { id: 'arroyo', nombre: 'El arroyo', descripcion: 'Agua que corre entre las cañas.', umbral: 2 },
  { id: 'sendero', nombre: 'Sendero nuevo', descripcion: 'Un sendero nuevo para recorrer el jardín.', umbral: 5 },
  { id: 'claro', nombre: 'Claro nuevo', descripcion: 'Un claro nuevo, cada uno un descubrimiento.', umbral: 9 },
];

function zonasPara(semanasPost50) {
  const n = Math.max(0, Math.floor(semanasPost50) || 0);
  return ZONAS_POST50.map((z) => ({
    id: z.id, nombre: z.nombre, descripcion: z.descripcion, umbral: z.umbral,
    desbloqueada: n >= z.umbral,
  }));
}

// ---------- ESTACIONES (fecha real + hemisferio por zona) ----------
const SUR = [
  'America/Argentina/', 'America/Santiago', 'America/Asuncion',
  'America/Montevideo', 'America/Sao_Paulo', 'America/Lima',
  'America/La_Paz', 'Australia/', 'Pacific/Auckland',
];
function hemisferioDe(tz) {
  const t = String(tz || '');
  for (const p of SUR) if (t === p || t.indexOf(p) === 0) return 'sur';
  return 'norte';
}

// Mes 1..12 → estación. Norte y sur invertidos.
const ESTACIONES = {
  norte: ['Invierno', 'Invierno', 'Primavera', 'Primavera', 'Primavera', 'Verano', 'Verano', 'Verano', 'Otoño', 'Otoño', 'Otoño', 'Invierno'],
  sur: ['Verano', 'Verano', 'Otoño', 'Otoño', 'Otoño', 'Invierno', 'Invierno', 'Invierno', 'Primavera', 'Primavera', 'Primavera', 'Verano'],
};
const ESTADO_ESTACION = {
  'Verano': 'el jardín en su plenitud',
  'Otoño': 'hojas doradas',
  'Primavera': 'el jardín florece',
  'Invierno': 'el jardín en calma',
};
const FLOR_ESTACION = {
  'Verano': 'Flor de verano',
  'Otoño': 'Hoja dorada de otoño',
  'Primavera': 'Flor de primavera',
  'Invierno': 'Flor de calma de invierno',
};

function fechaEnTz(ms, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { anio: get('year'), mes: get('month'), dia: get('day'), hora: get('hour') };
  } catch (e) {
    const d = new Date(ms);
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(), hora: d.getUTCHours() };
  }
}

function estacionPara(ms, tz) {
  const h = hemisferioDe(tz);
  const f = fechaEnTz(ms, tz);
  const estacion = ESTACIONES[h][f.mes - 1];
  return { hemisferio: h, estacion, estado: ESTADO_ESTACION[estacion], flor: FLOR_ESTACION[estacion], mes: f.mes, anio: f.anio };
}

// ---------- POSTY VIVE AHÍ: años completos con Posty ----------
// Desde la primera fecha real (primer hecho o created_at). 0 años =
// ninguna flor especial, nunca inventada.
function aniosConPosty(primerTs, ahoraMs, tz) {
  if (!primerTs) return 0;
  const a = fechaEnTz(primerTs, tz);
  const b = fechaEnTz(ahoraMs || Date.now(), tz);
  let anios = b.anio - a.anio;
  if (b.mes < a.mes || (b.mes === a.mes && b.dia < a.dia)) anios--;
  return Math.max(0, anios);
}

// ---------- HISTORIA: meses reales ----------
// rows normalizadas: {tipo: 'semana_publicada'|'subida_nivel'|'semilla_regalo',
// ts, nivel?}. resolver(nivel) → {premio, desbloqueo} (prestigio, opcional).
// Mes por zona de la cuenta. Sin filas no hay meses, nunca inventados.
function historiaMesesPara(rows, tz, resolver) {
  const meses = new Map();
  for (const r of rows || []) {
    if (!r || !r.ts) continue;
    const f = fechaEnTz(r.ts, tz);
    const mes = f.anio + '-' + String(f.mes).padStart(2, '0');
    if (!meses.has(mes)) meses.set(mes, { mes, semanas_publicadas: 0, subidas: [], regalos: 0 });
    const m = meses.get(mes);
    if (r.tipo === 'semana_publicada') m.semanas_publicadas++;
    else if (r.tipo === 'subida_nivel' && r.nivel) {
      const res = resolver ? resolver(r.nivel) : {};
      m.subidas.push({ nivel: r.nivel, premio: res.premio || null, desbloqueo: res.desbloqueo || null });
    } else if (r.tipo === 'semilla_regalo') m.regalos++;
  }
  return [...meses.values()].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
}

// ---------- TABLA DE SEMILLAS REGALADAS ----------
function semillasEnsure(db) {
  try { db.exec('CREATE TABLE IF NOT EXISTS jardin_semillas_regalo (user_id INTEGER NOT NULL, ts INTEGER NOT NULL)'); } catch (e) {}
}

// ---------- ESTADO COMPLETO (DB → puras) ----------
// metrics: oficina.metricas(db, uid), como /api/oficina/nivel.
// Devuelve null ante cualquier error (fail-closed: el cliente no pinta
// nada nuevo). Las 4 post-jardín solo con nivel 50; la historia sirve
// en cualquier nivel.
function estadoPost50(db, uid, metrics, tz, ahoraMs) {
  try {
    // Sin la tabla de eventos no hay estado: null, nunca un jardín inventado.
    const t = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'oficina_nivel_eventos' LIMIT 1").get();
    if (!t) return null;
    const np = require('./posty-nivel50');
    const pr = require('./prestigio');
    const niv = np.nivelPosty(db, uid, metrics, ahoraMs);
    if (!niv || typeof niv.nivel !== 'number') return null;
    const semanas = (niv.eventos && niv.eventos.semana_publicada) || 0;
    const completo = niv.nivel >= 50;
    const semanasPost50 = completo ? Math.max(0, semanas - 30) : 0;
    let primerTs = null;
    try {
      const f = db.prepare('SELECT MIN(ts) AS ts FROM oficina_nivel_eventos WHERE user_id = ? AND poder = ?').get(uid, 'posty');
      if (f && f.ts) primerTs = f.ts;
    } catch (e) {}
    semillasEnsure(db);
    let regalos = [];
    try { regalos = db.prepare('SELECT ts FROM jardin_semillas_regalo WHERE user_id = ? ORDER BY ts ASC').all(uid) || []; } catch (e) {}
    // Filas para la historia (río real, nada más).
    const rows = [];
    try {
      const sems = db.prepare("SELECT ts FROM oficina_nivel_eventos WHERE user_id = ? AND poder = 'posty' AND evento = 'semana_publicada' ORDER BY ts ASC").all(uid) || [];
      for (const r of sems) rows.push({ tipo: 'semana_publicada', ts: r.ts });
    } catch (e) {}
    try {
      const subs = db.prepare("SELECT registro_ref, ts FROM oficina_registros WHERE user_id = ? AND poder = 'posty' AND tipo = 'subida_nivel' ORDER BY ts ASC").all(uid) || [];
      for (const r of subs) {
        const m = String(r.registro_ref || '').match(/^nivel:posty:(\d+):/);
        if (m) rows.push({ tipo: 'subida_nivel', ts: r.ts, nivel: Number(m[1]) });
      }
    } catch (e) {}
    for (const g of regalos) rows.push({ tipo: 'semilla_regalo', ts: g.ts });
    const resolver = (n) => ({ premio: pr.premioEn(n), desbloqueo: pr.desbloqueoEn(n) });
    const historia = historiaMesesPara(rows, tz, resolver);
    const anios = aniosConPosty(primerTs, ahoraMs, tz);
    return {
      nivel: niv.nivel,
      hora: fechaEnTz(ahoraMs || Date.now(), tz).hora,
      completo,
      semanas_publicadas: semanas,
      semanas_post50: semanasPost50,
      // Las 4, solo con el jardín completo; si no, null/[] y el cliente
      // no pinta nada nuevo.
      estacion: completo ? estacionPara(ahoraMs || Date.now(), tz) : null,
      zonas: completo ? zonasPara(semanasPost50) : [],
      postyVive: completo ? { anios, flores_especiales: anios } : null,
      semillas: completo ? regalos.map((g) => ({ ts: g.ts })) : [],
      historia,
    };
  } catch (e) { return null; }
}

module.exports = {
  ZONAS_POST50, zonasPara, hemisferioDe, estacionPara, fechaEnTz,
  aniosConPosty, historiaMesesPara, semillasEnsure, estadoPost50,
};
