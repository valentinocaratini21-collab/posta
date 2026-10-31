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
// (la fila qa_audit): texto_ok && colores_ok && claims_ok && mobile_ok
// && brand_ok && anatomia_ok && headline_clear !== false. Los checks
// solo-auditoría (headline_complete, contraste_ok, elementos_ok) NO
// deciden el pase — pero si TAMBIÉN fallan junto a otro, entran en la
// corrección para que la regeneración los arregle de una vez.
//
// MÓDULO PURO: sin requires, sin DB, sin llamadas de red. Todo efecto
// (evaluar, generar, guardar, componer, retener) entra inyectado, así
// los tests corren sin gastar IA y sin levantar el servidor.
// Uso desde server.js: const qaGate = require('./qa-gate');
'use strict';

const QA_GATE_MAX_ATTEMPTS = 3;

// Checks que deciden el pase (definición del audit, ni uno más ni uno menos).
const GATE_CHECKS = [
  ['texto_ok', 'texto'],
  ['colores_ok', 'colores'],
  ['claims_ok', 'claims'],
  ['mobile_ok', 'mobile'],
  ['brand_ok', 'marca'],
  ['anatomia_ok', 'anatomia'],
  ['headline_clear', 'headline_clear'],
];
// Checks solo-auditoría: no deciden el pase, pero se corrigen si fallan junto a otro.
const AUDIT_ONLY_CHECKS = [
  ['headline_complete', 'headline_complete'],
  ['contraste_ok', 'contraste'],
  ['elementos_ok', 'elementos'],
];

// Línea de corrección por check (las 4 primeras son las del reintento
// correctivo 2026-10-16, textuales; el resto son nuevas para el gate).
const FIX_LINES = {
  texto: 'the previous attempt had readable or garbled baked-in text — regenerate with absolutely NO text, letters or numbers anywhere: every sign, screen, label and storefront blank, off or blurred until illegible',
  anatomia: 'the previous attempt had deformed anatomy — natural hands, fingers and faces only; show fewer hands if needed',
  claims: 'the previous attempt showed an invented price, promotion or claim — show only the real product and scene, no prices, no offers, no claim-like elements',
  headline_clear: 'elements intruded into the top headline zone — keep the entire top zone clean, soft and completely empty',
  colores: "the previous attempt did not show the client's brand colors in the scene — weave the exact brand colors into props, clothing, packaging and set details",
  mobile: 'the previous attempt did not work on a phone screen — keep the important subject large, centered and away from the edges, with strong contrast',
  marca: "the previous attempt imitated another brand's look — give the image its own visual identity for this business, never a famous brand's style",
  headline_complete: 'the previous attempt\'s visible headline was cut off mid-sentence — the headline must read complete on its own, or end with an ellipsis',
  contraste: 'text in the previous attempt did not contrast enough with what is behind it — strong contrast between text and background',
  elementos: 'the previous attempt had too many competing focal points — one single hero product and one single idea',
};

function qaGatePassed(qa) {
  if (!qa || typeof qa !== 'object') return false;
  return !!(qa.texto_ok && qa.colores_ok && qa.claims_ok && qa.mobile_ok &&
    qa.brand_ok && qa.anatomia_ok && qa.headline_clear !== false);
}

// Todos los checks en false, en orden fijo (decisivos primero). null →
// ['qa_unavailable'] (fail-closed: sin veredicto no hay pase).
function qaGateFailedChecks(qa) {
  if (!qa || typeof qa !== 'object') return ['qa_unavailable'];
  const out = [];
  for (const [field, name] of [...GATE_CHECKS, ...AUDIT_ONLY_CHECKS]) {
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
// Devuelve: { outcome: 'delivered'|'bandeja', path, attempts, failedChecks,
//   reason, firstQa, finalPrompt }.
//   - outcome 'delivered': el path pasó la vara (o es el original).
//   - outcome 'bandeja': se agotaron los intentos; el path es el ÚLTIMO
//     intento (fallido) y el llamador DEBE marcar needs_review=1.
//   - firstQa: la PRIMERA evaluación (la que va a la fila qa_audit, para
//     que la estadística de Mora no cambie de significado).
//   - finalPrompt: el prompt que produjo el path final.
async function runQaGate({ basePrompt, initialAbs, initialPub, maxAttempts, evaluate, generate, save, composite, retain }) {
  const cap = Math.max(1, Number(maxAttempts) || QA_GATE_MAX_ATTEMPTS);
  let abs = initialAbs;
  let pub = initialPub;
  let finalPrompt = basePrompt;
  let firstQa = null;
  let qa = null;
  let attempts = 0;
  while (true) {
    attempts++;
    try {
      qa = await evaluate(abs);
    } catch (e) {
      qa = null; // evaluar que lanza = sin veredicto (fail-closed)
    }
    if (attempts === 1) firstQa = qa;
    if (qaGatePassed(qa)) {
      return { outcome: 'delivered', path: pub, attempts, failedChecks: [], reason: '', firstQa, finalPrompt };
    }
    const failedChecks = qaGateFailedChecks(qa);
    const reason = qaGateReason(qa);
    if (attempts >= cap) {
      try { if (retain) await retain(abs, reason); } catch (e) {}
      return { outcome: 'bandeja', path: pub, attempts, failedChecks, reason, firstQa, finalPrompt };
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
  qaGatePassed,
  qaGateFailedChecks,
  qaGateFixesFor,
  qaGateCorrectionPrompt,
  qaGateReason,
  runQaGate,
};
