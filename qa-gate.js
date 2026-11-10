// qa-gate.js — "QA QUE REHACE SOLA" (2026-10-26, ítem 3 ARMA TODO).
//
// Antes: el QA de visión auditaba en modo auditoría DESPUÉS de entregar
// (background desacoplado, 2026-10-14/16) y, solo ante 4 fallas duras,
// regeneraba UNA vez — también en background, con carrera contra lo que
// el dueño ya veía. La pieza fallida llegaba al dueño.
//
// Ahora: el gate corre SÍNCRONO dentro del motor (concept-shot) ANTES de
// devolver la imagen. Ninguna pieza que no pase la vara llega al dueño:
// si el QA la rechaza, el motor la regenera sola con la corrección
// explícita, hasta QA_GATE_MAX_ATTEMPTS generaciones en total. Si agota
// los intentos, la pieza va a la BANDEJA marcada (needs_review=1, puesto
// por el llamador vía resultOut.qaGate) y NUNCA se entrega como final.
//
// FAIL-CLOSED: sin veredicto del QA (null: red, timeout, API caída) el
// intento cuenta como FALLIDO. Durante una caída del servicio de visión,
// las piezas van a revisión en vez de entregarse sin verificar.
//
// DEFINICIÓN DE "PASAR LA VARA": EXACTAMENTE la del audit de siempre
// (la fila qa_audit) MÁS los tres checks que eran solo-auditoría,
// MÁS headline_empty_space_ok (v862, HUECO VACÍO — el 583 y el 590:
// el titular tapaba la imagen; el titular va en el hueco vacío,
// nunca sobre el sujeto; si no hay hueco, la pieza sale LIMPIA
// sin titular).
// MÁS client_logo_ok y no_posty_face (v869: el logo del cliente arriba
// a la izquierda y nunca la cara de Posty en posteos de clientes;
// ausente = pasa).
// (M183/M188, 2026-11-08/09 — MORA-10): texto_ok, headline_complete,
// headline_clear, brand_ok, colores_ok, claims_ok, mobile_ok,
// anatomia_ok, contraste_ok, elementos_ok, headline_empty_space_ok,
// client_logo_ok y no_posty_face — los 13. Cualquier sub-check en false puebla qa_gate_failed_checks
// con su nombre y BLOQUEA la entrega: `failed_checks` vacío + un
// sub-check en false es un bug del gate, no un pase (evidencia: evals
// 589/593 entregadas con headline_complete=false y failed_checks=[]
// en producción v803/v851).
// La definición vieja (solo 7, el resto "SOLO AUDITORÍA") quedó
// SUPERSEDED: el juez ya marcaba estos fallos y el gate los ignoraba.
//
// CORRECCIÓN A NIVEL TEXTO (MORA-10c): un titular roto es un defecto de
// TEXTO, no de imagen — regenerar la imagen NO lo arregla (probado: 566,
// 2 intentos, mismo titular). Cuando el fallo es solo de texto
// (headline_complete), el gate pide al llamador un fallback de texto
// (adaptador `retext`: siguiente oración completa, o pieza sin titular)
// y re-evalúa LA MISMA imagen, sin gastar una generación. Si no queda
// fallback, la pieza va a bandeja con failed_checks poblado: nunca se
// entrega, nunca se queman generaciones en vano.
//
// MÓDULO PURO: sin requires, sin DB, sin llamadas de red. Todo efecto
// (evaluar, generar, guardar, componer, retener) entra inyectado, así
// los tests corren sin gastar IA y sin levantar el servidor.
// Uso desde server.js: const qaGate = require('./qa-gate');
'use strict';

const QA_GATE_MAX_ATTEMPTS = 3;

// Checks que deciden el pase (M183/M188 + v862: los 11, ni uno más ni uno menos).
// Orden fijo: el orden en que qaGateFailedChecks los nombra.
const GATE_CHECKS = [
  ['texto_ok', 'texto'],
  ['headline_complete', 'headline_complete'],
  ['headline_clear', 'headline_clear'],
  ['client_logo_ok', 'client_logo_ok'],
  ['no_posty_face', 'no_posty_face'],
  ['brand_ok', 'marca'],
  ['colores_ok', 'colores'],
  ['claims_ok', 'claims'],
  ['mobile_ok', 'mobile'],
  ['anatomia_ok', 'anatomia'],
  ['contraste_ok', 'contraste'],
  ['elementos_ok', 'elementos'],
  ['headline_empty_space_ok', 'headline_empty_space_ok'],
];
// Checks solo-auditoría: NINGUNO desde M183 (2026-11-08). La lista queda
// como constante vacía para que el concepto no se reintroduzca por
// accidente: todo check que el juez devuelve decide el pase.
const AUDIT_ONLY_CHECKS = [];

// Línea de corrección por check (las 4 primeras son las del reintento
// correctivo 2026-10-16, textuales; el resto son nuevas para el gate).
const FIX_LINES = {
  texto: 'the previous attempt had readable or garbled baked-in text — regenerate with absolutely NO text, letters or numbers anywhere: every sign, screen, label and storefront blank, off or blurred until illegible',
  anatomia: 'the previous attempt had deformed anatomy — natural hands, fingers and faces only; show fewer hands if needed',
  claims: 'the previous attempt showed an invented price, promotion or claim — show only the real product and scene, no prices, no offers, no claim-like elements',
  headline_clear: 'elements intruded into the top headline zone — keep the entire top zone clean, soft and completely empty',
  headline_empty_space_ok: 'the headline is not in the empty space of the image, or it overlaps the subject — place the headline only in the detected empty space (the clear area with no subject or elements, top, bottom or wherever the empty space is), never over faces, eyes, body, hands or product; if there is no empty space, deliver the image clean with NO headline',
  colores: "the previous attempt did not show the client's brand colors in the scene — weave the exact brand colors into props, clothing, packaging and set details",
  mobile: 'the previous attempt did not work on a phone screen — keep the important subject large, centered and away from the edges, with strong contrast',
  marca: "the previous attempt imitated another brand's look — give the image its own visual identity for this business, never a famous brand's style",
  headline_complete: 'the previous attempt\'s visible headline was cut off mid-sentence — the headline must read complete on its own, or end with an ellipsis',
  contraste: 'text in the previous attempt did not contrast enough with what is behind it — strong contrast between text and background',
  elementos: 'the previous attempt had too many competing focal points — one single hero product and one single idea',
  // (v869) Logo del cliente arriba a la izquierda + nunca la cara de Posty
  // en posteos de clientes. Ausente = pasa (el evaluador solo los devuelve
  // cuando aplican: client_logo_ok en posteos de clientes, no_posty_face
  // solo fuera de la casa).
  client_logo_ok: "the client's logo must sit small in the top-left corner, identical to the real logo, never covering the product or the headline — if there is no real logo, the piece stays clean with no logo at all",
  no_posty_face: 'the Posty mascot (small blue robot face) must never appear in a client post — remove any robot mascot or platform face from the image',
};

function qaGatePassed(qa) {
  if (!qa || typeof qa !== 'object') return false;
  // Única fuente de verdad: GATE_CHECKS (los 13). Si un check nuevo se
  // agrega a la lista, pasa a decidir el pase sin tocar esta función.
  for (const [field] of GATE_CHECKS) {
    if (qa[field] === false) return false;
  }
  return true;
}

// Todos los checks en false, en orden fijo (el de GATE_CHECKS). null →
// ['qa_unavailable'] (fail-closed: sin veredicto no hay pase).
function qaGateFailedChecks(qa) {
  if (!qa || typeof qa !== 'object') return ['qa_unavailable'];
  const out = [];
  for (const [field, name] of GATE_CHECKS) {
    if (qa[field] === false) out.push(name);
  }
  return out;
}

function qaGateFixesFor(qa) {
  const fixes = [];
  for (const name of qaGateFailedChecks(qa)) {
    if (FIX_LINES[name]) fixes.push(FIX_LINES[name]);
  }
  if (qa && typeof qa === 'object' && qa.detalle) {
    fixes.push(`specific defect to fix: ${String(qa.detalle).slice(0, 140)}`);
  }
  return fixes;
}

// Misma forma del prompt correctivo 2026-10-16: base + CORRECTION.
function qaGateCorrectionPrompt(basePrompt, qa) {
  const fixes = qaGateFixesFor(qa);
  return `${basePrompt}\nCORRECTION — the previous version of this image failed quality control: ${fixes.join('; ')}. Regenerate fixing exactly that, keeping the same subject, scene, palette and style.`;
}

function qaGateReason(qa) {
  if (!qa || typeof qa !== 'object') return 'QA sin veredicto (visión no disponible)';
  const failed = qaGateFailedChecks(qa);
  const base = failed.length ? `QA rechazó: ${failed.join(', ')}` : 'QA rechazó (sin detalle)';
  return qa.detalle ? `${base} — ${String(qa.detalle).slice(0, 140)}` : base;
}

// El loop. Adaptadores (todos async salvo que se indique):
//   evaluate(absPath) -> objeto QA o null (null = sin veredicto, fail-closed)
//   generate(corrPrompt) -> b64 de la imagen regenerada (si LANZA, el loop
//     propaga: fallar generando no es fallar el QA — el llamador decide
//     (sus loops de 3 intentos) o no se crea el borrador, como siempre)
//   save(b64, corrPrompt) -> { abs, pub } (guardar + base limpia + prompt)
//   composite(absPath) -> void (titular por código o no-op sin titular)
//   retain(absPath, reason) -> void (retener la imagen rechazada; un error
//     acá nunca rompe el loop: es diagnóstico)
//   retext({ abs, failedChecks, qa }) -> { headline } | null (OPCIONAL —
//     corrección a NIVEL TEXTO, MORA-10c: el llamador recompone LA MISMA
//     imagen con el siguiente titular (o la deja limpia si headline es
//     ''); null = no queda fallback de texto (bandeja sin regenerar);
//     { regenerate: true } = no hay fix de texto pero una imagen nueva
//     puede salir limpia (texto horneado sin titular compuesto: el loop
//     sigue el camino normal de regeneración). Si LANZA o devuelve otra
//     cosa, se trata como null: nunca rompe el loop)
// Devuelve: { outcome: 'delivered'|'bandeja', path, attempts, failedChecks,
//   reason, firstQa, finalPrompt, headline }.
//   - outcome 'delivered': el path pasó la vara (o es el original).
//   - outcome 'bandeja': se agotaron los intentos (o el texto no tiene
//     fallback); el path es el ÚLTIMO intento (fallido) y el llamador
//     DEBE marcar needs_review=1.
//   - firstQa: la PRIMERA evaluación (la que va a la fila qa_audit, para
//     que la estadística de Mora no cambie de significado).
//   - finalPrompt: el prompt que produjo el path final.
//   - headline: el titular en uso al final (solo si se llamó a retext
//     alguna vez; si no, el llamador ya lo sabe).
//   - failedChecks NUNCA es [] con un sub-check en false: 'delivered'
//     solo se devuelve tras un qaGatePassed (los 11 en true).
// Checks de solo-texto: un fallo que vive en la cadena del titular y que
// ninguna regeneración de imagen puede arreglar.
const TEXT_ONLY_CHECKS = new Set(['headline_complete']);
async function runQaGate({ basePrompt, initialAbs, initialPub, maxAttempts, evaluate, generate, save, composite, retain, retext }) {
  const cap = Math.max(1, Number(maxAttempts) || QA_GATE_MAX_ATTEMPTS);
  let abs = initialAbs;
  let pub = initialPub;
  let finalPrompt = basePrompt;
  let firstQa = null;
  let qa = null;
  let attempts = 0;
  let headline = undefined; // último titular aplicado por retext (si lo hubo)
  while (true) {
    attempts++;
    try {
      qa = await evaluate(abs);
    } catch (e) {
      qa = null; // evaluar que lanza = sin veredicto (fail-closed)
    }
    if (attempts === 1) firstQa = qa;
    if (qaGatePassed(qa)) {
      return { outcome: 'delivered', path: pub, attempts, failedChecks: [], reason: '', firstQa, finalPrompt, headline };
    }
    const failedChecks = qaGateFailedChecks(qa);
    const reason = qaGateReason(qa);
    const textOnly = failedChecks.length > 0 && failedChecks.every((c) => TEXT_ONLY_CHECKS.has(c));
    // (MORA-10c) Corrección a NIVEL TEXTO antes de decidir regenerar:
    // si el titular es el problema, se pide el siguiente titular y se
    // recompone la MISMA imagen. Sin adaptador, o sin fallback, se sigue
    // el camino viejo (regenerar hasta agotar, luego bandeja).
    let textFixed = false;
    let textRegenOk = false;
    if (retext && failedChecks.includes('headline_complete')) {
      try {
        const next = await retext({ abs, failedChecks, qa });
        if (next && typeof next.headline === 'string') {
          headline = next.headline;
          textFixed = true;
        } else if (next && next.regenerate === true) {
          textRegenOk = true;
        }
      } catch (e) {
        textFixed = false; // retext que falla = sin fallback (no rompe el loop)
      }
    }
    if (textOnly) {
      if (textFixed) {
        // Misma imagen, titular nuevo: re-evaluar sin gastar una generación.
        // El cap de intentos acota la cadena de fallbacks.
        if (attempts >= cap) {
          try { if (retain) await retain(abs, reason); } catch (e) {}
          return { outcome: 'bandeja', path: pub, attempts, failedChecks, reason, firstQa, finalPrompt, headline };
        }
        continue;
      }
      if (retext && !textRegenOk) {
        // Hay adaptador de texto y no queda fallback: la imagen nueva
        // llevaría el mismo titular roto (566). Bandeja con los checks
        // poblados, sin quemar generaciones.
        try { if (retain) await retain(abs, reason); } catch (e) {}
        return { outcome: 'bandeja', path: pub, attempts, failedChecks, reason, firstQa, finalPrompt, headline };
      }
      // Sin adaptador retext, o con { regenerate: true } (texto horneado
      // sin titular compuesto): la imagen nueva puede salir limpia — cae
      // al camino de regeneración de abajo (comportamiento anterior).
    }
    if (attempts >= cap) {
      try { if (retain) await retain(abs, reason); } catch (e) {}
      return { outcome: 'bandeja', path: pub, attempts, failedChecks, reason, firstQa, finalPrompt, headline };
    }
    const corrPrompt = qaGateCorrectionPrompt(basePrompt, qa);
    const b64 = await generate(corrPrompt); // si lanza, propaga
    const saved = await save(b64, corrPrompt); // si lanza, propaga
    if (composite) await composite(saved.abs);
    try { if (retain) await retain(abs, reason); } catch (e) {}
    abs = saved.abs;
    pub = saved.pub;
    finalPrompt = corrPrompt;
  }
}

module.exports = {
  QA_GATE_MAX_ATTEMPTS,
  GATE_CHECKS,
  AUDIT_ONLY_CHECKS,
  qaGatePassed,
  qaGateFailedChecks,
  qaGateFixesFor,
  qaGateCorrectionPrompt,
  qaGateReason,
  runQaGate,
};
