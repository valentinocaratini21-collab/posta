// prestigio.js — PRESTIGIO DEL JARDÍN DE POSTY (sin reset).
// Aprobado por Valentino 30/10 (tap «Sí, armalo así, sin reset» +
// premios en cada prestigio, hasta nivel 50).
//
// Leyes duras (no se tocan, heredadas del jardín):
//   1. Nunca baja: el cálculo es monótono; los eventos son append-only.
//   2. Sin reset: el prestigio es un ciclo nuevo que se ABRE al completar
//      5 niveles; todo lo ganado se conserva. Nada vuelve a cero.
//   3. El dinero no compra niveles: ningún premio es descuento, mes gratis
//      ni nivel comprable. Premios SOLO del jardín y reconocimiento.
//   4. Solo hechos reales: cada umbral es un conteo de eventos reales
//      (o racha de semanas con semana_publicada real). Sin dato, no hay
//      avance ni premio, nunca inventado.
//   5. Revelado gradual: cada nivel desbloquea UNA cosa chica; cada
//      prestigio, UN premio. Nada aparece todo junto.
//
// Alcance: SOLO Posty. Los demás poderes siguen con sus 5 niveles en
// niveles.js, intactos. Este módulo no edita niveles.js: lo requiere para
// reutilizar semanaISO y conteoEventos, y extiende el cómputo solo cuando
// Posty ya está en nivel 5.
//
// Estructura: 50 niveles, un prestigio cada 5 niveles.
//   Prestigio 0: niveles 1–5 (los nombres originales, sin insignia).
//   Prestigio 1: niveles 6–10, 2: 11–15, …, 9: 46–50.
//   El premio del prestigio P se entrega al ENTRAR a P (niveles 6, 11,
//   16, 21, 26, 31, 36, 41, 46). El nivel 50 es la meta final.
'use strict';

let NIVELES = null;
try { NIVELES = require('./niveles'); } catch (e) { /* en este árbol vive en fresh/ */ }
if (!NIVELES) { try { NIVELES = require('./fresh/niveles'); } catch (e2) { NIVELES = null; } }

// ---------- NOMBRES ----------
const NOMBRES_50 = [
  // Prestigio 0 — los 5 originales, idénticos a niveles.js.
  'Nuevo en tu feed', 'Leyendo tu mundo', 'De la casa',
  'Mano derecha de tu Instagram', 'Tu socio de contenido',
  // Prestigio 1 — Brote dorado (6–10).
  'Primer brote dorado', 'Hojas doradas', 'Riego dorado', 'Sol del jardín', 'Guardián dorado',
  // Prestigio 2 — Raíz firme (11–15).
  'Raíz profunda', 'Tierra fértil', 'Semilla del barrio', 'Vecino del jardín', 'Corazón de la cuadra',
  // Prestigio 3 — Tallo alto (16–20).
  'Tallo firme', 'Bambú joven', 'Caña alta', 'Mirador del tallo', 'Vigía del jardín',
  // Prestigio 4 — Copa verde (21–25).
  'Primera copa', 'Sombra fresca', 'Nido en la copa', 'Viento a favor', 'Copa que acoge',
  // Prestigio 5 — Flor del local (26–30).
  'Primer botón', 'Flor abierta', 'Abejas de paso', 'Perfume del local', 'Jardín en flor',
  // Prestigio 6 — Fruto de la casa (31–35).
  'Primer fruto', 'Cosecha chica', 'Mesa puesta', 'Sabor de la casa', 'Cosecha del barrio',
  // Prestigio 7 — Claro del bosque (36–40).
  'Claro del bosque', 'Sendero propio', 'Fuente del bosque', 'Farol encendido', 'Guardián del bosque',
  // Prestigio 8 — Leyenda del barrio (41–45).
  'Historia que se cuenta', 'Nombre en el barrio', 'Puerta abierta', 'Faro del barrio', 'Leyenda del barrio',
  // Prestigio 9 — Maestro del jardín (46–50).
  'Manos maestras', 'Jardín que enseña', 'Semillas para otros', 'El jardín entero', 'Maestro del jardín',
];

const PRESTIGIOS = [
  { prestigio: 0, nombre: null, entrada: 1, insignia: null, premio: null },
  { prestigio: 1, nombre: 'Brote dorado', entrada: 6, insignia: 'Brote dorado', premio: 'Insignia «Brote dorado» + primer brote dorado en el jardín' },
  { prestigio: 2, nombre: 'Raíz firme', entrada: 11, insignia: 'Raíz firme', premio: 'Insignia «Raíz firme» + zona nueva «Rincón de la raíz»' },
  { prestigio: 3, nombre: 'Tallo alto', entrada: 16, insignia: 'Tallo alto', premio: 'Insignia «Tallo alto» + tallo dorado en el jardín' },
  { prestigio: 4, nombre: 'Copa verde', entrada: 21, insignia: 'Copa verde', premio: 'Insignia «Copa verde» + zona nueva «Mirador de la copa»' },
  { prestigio: 5, nombre: 'Flor del local', entrada: 26, insignia: 'Flor del local', premio: 'Insignia «Flor del local» + póster del local «Jardín en flor» para imprimir' },
  { prestigio: 6, nombre: 'Fruto de la casa', entrada: 31, insignia: 'Fruto de la casa', premio: 'Insignia «Fruto de la casa» + canasta dorada en el jardín' },
  { prestigio: 7, nombre: 'Claro del bosque', entrada: 36, insignia: 'Claro del bosque', premio: 'Insignia «Claro del bosque» + zona nueva «Claro del bosque» + farol encendido' },
  { prestigio: 8, nombre: 'Leyenda del barrio', entrada: 41, insignia: 'Leyenda del barrio', premio: 'Insignia «Leyenda del barrio» + placa dorada en la entrada del jardín' },
  { prestigio: 9, nombre: 'Maestro del jardín', entrada: 46, insignia: 'Maestro del jardín', premio: 'Insignia «Maestro del jardín» + zona nueva «El jardín maestro» + corona dorada' },
];

// Desbloqueo chico por nivel (6–50): un elemento o detalle del jardín.
// Nada de precios, nada comprable, nada fuera del jardín.
const DESBLOQUEOS = {
  6: 'Hoja dorada pequeña', 7: 'Piedra del sendero', 8: 'Flor silvestre', 9: 'Gota de rocío', 10: 'Mariposa dorada',
  11: 'Raíz visible', 12: 'Montículo fértil', 13: 'Semilla nueva', 14: 'Banco del vecino', 15: 'Farolito de la cuadra',
  16: 'Caña nueva', 17: 'Hoja larga', 18: 'Nudo del bambú', 19: 'Escalera del mirador', 20: 'Catalejo del vigía',
  21: 'Hoja de copa', 22: 'Rama con sombra', 23: 'Nido pequeño', 24: 'Cometa del viento', 25: 'Silla bajo la copa',
  26: 'Botón floral', 27: 'Pétalo abierto', 28: 'Abeja dorada', 29: 'Maceta perfumada', 30: 'Arco de flores',
  31: 'Fruto pequeño', 32: 'Cesto de cosecha', 33: 'Mantel de la mesa', 34: 'Taza de la casa', 35: 'Canasta del barrio',
  36: 'Claro iluminado', 37: 'Piedra del sendero nuevo', 38: 'Fuente pequeña', 39: 'Farol del sendero', 40: 'Capa del guardián',
  41: 'Libro de historias', 42: 'Letrero del barrio', 43: 'Puerta entreabierta', 44: 'Faro pequeño', 45: 'Estrella de la leyenda',
  46: 'Guantes del maestro', 47: 'Pizarra del jardín', 48: 'Semillero', 49: 'Llave del jardín', 50: 'Corona del maestro',
};

// Meta final: al completar el nivel 50 (no es un prestigio nuevo).
const META_FINAL = 'Marco dorado permanente en el perfil + título «Maestro del jardín»';

// ---------- FUNCIONES PURAS ----------
function prestigioDe(nivel) {
  const n = Math.max(1, Math.min(50, Math.floor(nivel) || 1));
  const p = Math.floor((n - 1) / 5);
  const def = PRESTIGIOS[p];
  return {
    nivel: n,
    prestigio: p,
    nombre_prestigio: def.nombre,
    nivel_en_ciclo: ((n - 1) % 5) + 1,
    entrada_prestigio: n >= 6 && ((n - 1) % 5) === 0,
    insignia: def.insignia,
    nombre_nivel: NOMBRES_50[n - 1],
  };
}

function nombreNivel(nivel) {
  const n = Math.max(1, Math.min(50, Math.floor(nivel) || 1));
  return NOMBRES_50[n - 1];
}

// Texto que muestran la tirita y Mi negocio. P0 conserva el formato viejo
// (nivel + nombre); desde P1, «Prestigio P · Nivel N».
function etiquetaTirita(nivel) {
  const d = prestigioDe(nivel);
  if (d.prestigio === 0) return `Nivel ${d.nivel} · ${d.nombre_nivel}`;
  return `Prestigio ${d.prestigio} · Nivel ${d.nivel}`;
}

function premioEn(nivel) {
  const d = prestigioDe(nivel);
  if (!d.entrada_prestigio) return null;
  return PRESTIGIOS[d.prestigio].premio;
}

function desbloqueoEn(nivel) {
  return DESBLOQUEOS[nivel] || null;
}

// ---------- UMBRALES (solo hechos reales) ----------
// Fórmulas originales (v495, escalera a ~94 semanas):
// k = nivel - 5 (1..45).
// Req A (siempre): semana_publicada ≥ 4 + 2k.
// Req B: k impar → pieza_aceptada_primera ≥ 3 + k;
//        k par   → decision_bandeja ≥ 4 + 2k.
// Entrada de prestigio (6, 11, …, 46): además racha ≥ 3 + prestigio
// (semanas ISO consecutivas con semana_publicada, con gracia de una
// semana: si la semana en curso aún no publicó, la racha se mide hasta la
// semana anterior; si ni la actual ni la anterior tienen publicación, 0).
//
// REESCALADO 7 MESES (Lote 3, decisión vigente: el proceso completo tarda
// 7 meses): 7 meses ≈ 30 semanas publicadas (1 por semana). Modelo PAREJO:
// un solo factor F = 30/94 aplicado a TODOS los umbrales viejos, con
// redondeo al entero más cercano y mínimo 1. La forma (fórmulas en k y p)
// no cambia; solo la escala. Nivel 50: semana 94 → 30. Los premios, los
// nombres y los desbloqueos NO cambian.
// Consecuencia honesta del factor: 45 niveles en 30 semanas obligan a ~1,5
// niveles por semana en un usuario plenamente activo, así que umbrales
// consecutivos pueden coincidir y dos niveles pueden abrirse con la misma
// tanda de hechos; el cómputo toma el mayor nivel cuyos gates se cumplen
// todos, en orden, sin saltos.
// El guard de no-baja está en computarNivelPosty50 (max con los umbrales
// viejos): cada umbral nuevo ≤ su viejo (F < 1 y el redondeo nunca supera
// el valor viejo para min ≥ 1, porque m·(1−F) ≥ 0,68 > 0,5), así que el
// nivel nuevo nunca es menor que el viejo, pero el guard existe igual.
const ESCALA_7M = 30 / 94;
const esc7m = (m) => Math.max(1, Math.round(m * ESCALA_7M));
function gatesParaOriginal(nivel) {
  if (nivel < 6 || nivel > 50) return [];
  const k = nivel - 5;
  const reqs = [{ evento: 'semana_publicada', min: 4 + 2 * k }];
  if (k % 2 === 1) reqs.push({ evento: 'pieza_aceptada_primera', min: 3 + k });
  else reqs.push({ evento: 'decision_bandeja', min: 4 + 2 * k });
  const p = Math.floor((nivel - 1) / 5);
  if ((nivel - 1) % 5 === 0) reqs.push({ racha: true, min: 3 + p });
  return reqs;
}
function gatesPara(nivel) {
  return gatesParaOriginal(nivel).map((r) => Object.assign({}, r, { min: esc7m(r.min) }));
}

// Racha de semanas ISO consecutivas con semana_publicada real.
// db: conexión con oficina_nivel_eventos (user_id, poder, evento, ts).
function rachaSemanas(db, uid, ahoraMs) {
  try {
    const rows = db.prepare(
      "SELECT ts FROM oficina_nivel_eventos WHERE user_id = ? AND poder = 'posty' AND evento = 'semana_publicada'"
    ).all(uid);
    const semanas = new Set();
    const aISO = (ts) => {
      const d = new Date(ts);
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
      return x.toISOString().slice(0, 10);
    };
    for (const r of rows || []) semanas.add(aISO(r.ts));
    if (!semanas.size) return 0;
    const ahora = new Date(ahoraMs || Date.now());
    const lunes = (d) => {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
      return x;
    };
    let cur = lunes(ahora);
    let curISO = cur.toISOString().slice(0, 10);
    if (!semanas.has(curISO)) {
      cur.setUTCDate(cur.getUTCDate() - 7);
      curISO = cur.toISOString().slice(0, 10);
      if (!semanas.has(curISO)) return 0;
    }
    let n = 0;
    while (semanas.has(curISO)) {
      n++;
      cur.setUTCDate(cur.getUTCDate() - 7);
      curISO = cur.toISOString().slice(0, 10);
    }
    return n;
  } catch (e) { return 0; }
}

// ---------- CÓMPUTO EXTENDIDO (solo Posty) ----------
// Si Posty no llegó a nivel 5, devuelve el cómputo base intacto (con
// prestigio 0 agregado). Si llegó a 5, continúa evaluando 6–50 con los
// mismos conteos y la racha, en orden, sin saltos.
function computarNivelPosty50(db, uid, metrics, ahoraMs) {
  if (!NIVELES) return null;
  const base = NIVELES.computarNivel(db, uid, 'posty', metrics);
  if (!base) return null;
  const conteos = base.eventos || {};
  const racha = rachaSemanas(db, uid, ahoraMs);
  const cumple = (req) => {
    if (req.racha) return racha >= req.min;
    return (conteos[req.evento] || 0) >= req.min;
  };
  const prog = (req) => {
    if (req.racha) return Math.min(racha, req.min);
    return Math.min(conteos[req.evento] || 0, req.min);
  };
  let nivel = base.nivel;
  const hitos = [];
  if (nivel >= 5) {
    for (let L = 6; L <= 50; L++) {
      const gate = gatesPara(L);
      const todos = gate.every(cumple);
      for (const req of gate) {
        hitos.push({
          nivel_objetivo: L,
          clave: req.racha ? 'racha_semanas' : req.evento,
          cumplido: cumple(req),
          progreso: prog(req),
          min: req.min,
        });
      }
      if (todos && nivel === L - 1) nivel = L;
      else if (!todos && nivel === L - 1) break;
    }
  }
  // GUARD DE NO-BAJA (Lote 3): el nivel con los umbrales viejos se calcula
  // igual y se toma el mayor. En la práctica el nuevo nunca es menor (cada
  // umbral nuevo ≤ su viejo), así que el guard no se dispara, pero existe:
  // el reescalado nunca baja a nadie.
  if (base.nivel >= 5) {
    let nivelViejo = base.nivel;
    for (let L = 6; L <= 50; L++) {
      const gate = gatesParaOriginal(L);
      if (gate.every(cumple) && nivelViejo === L - 1) nivelViejo = L;
      else if (nivelViejo === L - 1) break;
    }
    if (nivelViejo > nivel) nivel = nivelViejo;
  }
  const d = prestigioDe(nivel);
  const premios = [];
  for (const pr of PRESTIGIOS) {
    if (pr.prestigio >= 1 && pr.entrada <= nivel) premios.push({ prestigio: pr.prestigio, premio: pr.premio });
  }
  const desbloqueos = [];
  for (let L = 6; L <= nivel; L++) desbloqueos.push({ nivel: L, desbloqueo: DESBLOQUEOS[L] });
  let gateSig = null;
  if (nivel < 50) {
    const gate = gatesPara(nivel + 1);
    const pendientes = gate.filter((r) => !cumple(r));
    const tot = gate.reduce((a, r) => a + r.min, 0);
    const hec = gate.reduce((a, r) => a + prog(r), 0);
    gateSig = {
      nivel_objetivo: nivel + 1,
      progreso_pct: tot ? Math.round(100 * hec / tot) : 100,
      pendientes: pendientes.map((r) => ({ clave: r.racha ? 'racha_semanas' : r.evento, min: r.min })),
    };
  } else {
    gateSig = { nivel_objetivo: 50, progreso_pct: 100, pendientes: [] };
  }
  return {
    poder: 'posty',
    nivel,
    nombre_nivel: d.nombre_nivel,
    prestigio: d.prestigio,
    nombre_prestigio: d.nombre_prestigio,
    nivel_en_ciclo: d.nivel_en_ciclo,
    insignia: d.insignia,
    etiqueta_tirita: etiquetaTirita(nivel),
    premios,
    desbloqueos,
    meta_final: nivel >= 50 ? META_FINAL : null,
    gate: gateSig,
    proximo_paso: nivel >= 50 ? null : (gateSig.pendientes[0] ? gateSig.pendientes[0].clave : null),
    racha_semanas: racha,
    eventos: conteos,
    hitos_extendidos: hitos,
  };
}

module.exports = {
  NOMBRES_50, PRESTIGIOS, DESBLOQUEOS, META_FINAL, ESCALA_7M,
  prestigioDe, nombreNivel, etiquetaTirita, premioEn, desbloqueoEn,
  gatesPara, gatesParaOriginal, rachaSemanas, computarNivelPosty50,
};
