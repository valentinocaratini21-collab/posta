// test-lote-gate-qa-v865.js — LOTE v865: FIX DEL GATE QA (M183 + MORA-10).
//
// Qué caza esta suite (todo sin IA paga, sin red, sin claves):
//  A. qaGatePassed: los 11 sub-checks deciden el pase (uno en false = no pasa). // re-pin v865: +headline_empty_space_ok (v862)
//  B. qaGateFailedChecks: cualquier false puebla el nombre (caso 593: 4 nombres).
//  C. runQaGate (contrastes con adaptadores stubbeados):
//     C1 pieza con headline_complete=false NO se entrega (regresión 589/593:
//        antes del fix salía 'delivered' con failedChecks []).
//     C2 pieza limpia SÍ se entrega.
//     C3 titular cortado → fallback de TEXTO, sin regenerar la imagen.
//     C4 fallback a pieza sin titular.
//     C5 fallback agotado → bandeja SIN quemar generaciones.
//     C6 fallo mixto → retext + regeneración (la imagen nueva lleva el
//        titular nuevo).
//     C7 texto horneado sin titular compuesto → { regenerate: true }.
//     C8 cada uno de los 11 checks en false, solo, bloquea y se nombra. // re-pin v865
//     C9 sin veredicto (null) → bandeja fail-closed con ['qa_unavailable'].
//     C10 retext que lanza → se trata como null, nunca rompe el loop.
//  D. qaHeadlineFallbacks (el makeHeadline REAL de server.js): siguiente
//     oración completa, nunca el titular en uso, nunca pregunta cortada,
//     '' final (pieza sin titular).
//  E. Estáticos sobre server.js / qa-gate.js (BUILD, retext cableado,
//     currentHeadline en los adaptadores, sin "SOLO AUDITORÍA").
//  F. Boot in-process (patrón test-album-ritual.js): /api/version = v865.
//
// Se corre con `node test-lote-gate-qa-v865.js` desde la raíz del repo.
// Contra-prueba: en el árbol v851 prístino esta suite FALLA (C1 entrega la
// pieza rota, C3/C5/C6/C7 no tienen retext) — la suite caza el cambio.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-gate-v865-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '34671';
process.env.BASE_URL = 'http://127.0.0.1:34671';
delete process.env.RESEND_API_KEY;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (!cond) { fail++; console.error('  ✗', msg); }
  else { pass++; console.log('  ✓', msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (esp ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`); }

const BASE = 'http://127.0.0.1:34671';
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const CLEAN = {
  texto_ok: true, headline_complete: true, headline_clear: true,
  brand_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true,
  anatomia_ok: true, contraste_ok: true, elementos_ok: true,
  headline_empty_space_ok: true, // (re-pin v865: v862, 11º check)
};
// Nombre que el gate usa en failedChecks por campo (convención histórica).
const CHECK_NAMES = {
  texto_ok: 'texto', headline_complete: 'headline_complete',
  headline_clear: 'headline_clear', brand_ok: 'marca', colores_ok: 'colores',
  claims_ok: 'claims', mobile_ok: 'mobile', anatomia_ok: 'anatomia',
  contraste_ok: 'contraste', elementos_ok: 'elementos',
  headline_empty_space_ok: 'headline_empty_space_ok', // (re-pin v865: v862)
};
// Eval 593 (9/11 14:43): 4 sub-checks en false, ENTREGADA con failed [].
const EVAL_593 = { ...CLEAN, headline_complete: false, brand_ok: false, colores_ok: false, claims_ok: false };
// Eval 589 (7/11): solo headline_complete en false, entregada.
const EVAL_589 = { ...CLEAN, headline_complete: false };

function stubGate(script, retextFn) {
  // script: lista de QA a devolver por evaluate (se repite el último).
  // Devuelve { calls, run } donde run es la promesa de runQaGate.
  const qaGate = require('./qa-gate');
  const calls = { evaluate: 0, generate: 0, save: 0, composite: 0, retain: 0, retext: 0 };
  let n = 0;
  const run = qaGate.runQaGate({
    basePrompt: 'prompt base',
    initialAbs: '/tmp/fake-v865.png',
    initialPub: '/media/fake-v865.png',
    maxAttempts: qaGate.QA_GATE_MAX_ATTEMPTS,
    evaluate: async () => { calls.evaluate++; return script[Math.min(n++, script.length - 1)]; },
    generate: async () => { calls.generate++; return Buffer.from('fake').toString('base64'); },
    save: async () => { calls.save++; return { abs: '/tmp/fake-v865-r.png', pub: '/media/fake-v865-r.png' }; },
    composite: async () => { calls.composite++; },
    retain: async () => { calls.retain++; },
    retext: retextFn ? async (a) => { calls.retext++; return retextFn(a); } : undefined,
  });
  return { calls, run };
}

(async () => {
  const qaGate = require('./qa-gate');
  const srv = require('./server');
  const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const gateText = fs.readFileSync(path.join(__dirname, 'qa-gate.js'), 'utf8');

  // ---------- A. qaGatePassed: los 11 deciden ---------- // re-pin v865
  console.log('A. qaGatePassed (10b: passed incluye headline_complete, contraste, elementos)');
  ok(qaGatePassedSafe(qaGate, CLEAN) === true, 'pieza limpia pasa');
  for (const field of Object.keys(CLEAN)) {
    ok(qaGatePassedSafe(qaGate, { ...CLEAN, [field]: false }) === false, `solo ${field}=false NO pasa`);
  }
  ok(qaGatePassedSafe(qaGate, null) === false, 'sin veredicto (null) NO pasa');
  ok(qaGatePassedSafe(qaGate, EVAL_593) === false, 'eval 593 (4 falses) NO pasa');
  eq((qaGate.GATE_CHECKS || []).length, 11, 'GATE_CHECKS tiene los 11'); // re-pin v865: v862 sumó headline_empty_space_ok
  eq((qaGate.AUDIT_ONLY_CHECKS || []).length, 0, 'AUDIT_ONLY_CHECKS vacío (M183)');

  // ---------- B. qaGateFailedChecks ----------
  console.log('B. qaGateFailedChecks (M183 regla 1: cualquier false se nombra)');
  eq(qaGate.qaGateFailedChecks(CLEAN), [], 'pieza limpia → []');
  eq(qaGate.qaGateFailedChecks(EVAL_593), ['headline_complete', 'marca', 'colores', 'claims'], 'eval 593 → 4 nombres en orden fijo');
  eq(qaGate.qaGateFailedChecks(EVAL_589), ['headline_complete'], 'eval 589 → [headline_complete]');
  eq(qaGate.qaGateFailedChecks(null), ['qa_unavailable'], 'null → [qa_unavailable]');
  eq(qaGate.qaGateFailedChecks({ ...CLEAN, contraste_ok: false }), ['contraste'], 'contraste_ok=false se nombra');
  eq(qaGate.qaGateFailedChecks({ ...CLEAN, elementos_ok: false }), ['elementos'], 'elementos_ok=false se nombra');

  // ---------- C. runQaGate: contrastes ----------
  console.log('C. runQaGate (contrastes con stubs, sin red)');
  { // C1 — regresión 589/593: sin retext, pieza rota NO se entrega.
    const { calls, run } = stubGate([EVAL_589]);
    const r = await run;
    eq(r.outcome, 'bandeja', 'C1 pieza con headline_complete=false → bandeja (no delivered)');
    eq(r.failedChecks, ['headline_complete'], 'C1 failedChecks poblado con headline_complete');
    eq(r.attempts, 3, 'C1 agota los 3 intentos');
    eq(calls.generate, 2, 'C1 regenera 2 veces (camino viejo, sin retext)');
  }
  { // C2 — pieza limpia se entrega.
    const { calls, run } = stubGate([CLEAN]);
    const r = await run;
    eq(r.outcome, 'delivered', 'C2 pieza limpia → delivered');
    eq(r.failedChecks, [], 'C2 failedChecks [] (pase real, no bug)');
    eq(r.attempts, 1, 'C2 un solo intento');
    eq(calls.generate, 0, 'C2 sin regeneración');
  }
  { // C3 — titular cortado → fallback de TEXTO, sin regenerar la imagen.
    let retextHeadline = null;
    const { calls, run } = stubGate(
      [EVAL_589, CLEAN],
      async () => { retextHeadline = 'Posty lo deja listo por vos.'; return { headline: retextHeadline }; },
    );
    const r = await run;
    eq(r.outcome, 'delivered', 'C3 tras fallback de texto → delivered');
    eq(r.attempts, 2, 'C3 dos evaluaciones, sin generación extra');
    eq(calls.generate, 0, 'C3 generate NUNCA se llama (10c: no se regenera la imagen)');
    eq(calls.retext, 1, 'C3 retext llamado una vez');
    eq(r.headline, 'Posty lo deja listo por vos.', 'C3 el titular final es el fallback');
  }
  { // C4 — fallback a pieza sin titular.
    const { calls, run } = stubGate(
      [EVAL_589, CLEAN],
      async () => ({ headline: '' }),
    );
    const r = await run;
    eq(r.outcome, 'delivered', 'C4 pieza sin titular → delivered');
    eq(r.headline, '', 'C4 headline final vacío');
    eq(calls.generate, 0, 'C4 sin regeneración');
  }
  { // C5 — fallback agotado → bandeja SIN quemar generaciones.
    const { calls, run } = stubGate([EVAL_589], async () => null);
    const r = await run;
    eq(r.outcome, 'bandeja', 'C5 sin fallback → bandeja');
    eq(r.failedChecks, ['headline_complete'], 'C5 failedChecks poblado');
    eq(r.attempts, 1, 'C5 un solo intento (no se queman generaciones en vano)');
    eq(calls.generate, 0, 'C5 generate nunca (566: regenerar no arregla texto)');
  }
  { // C6 — fallo mixto → retext + regeneración con el titular nuevo.
    const { calls, run } = stubGate(
      [{ ...CLEAN, headline_complete: false, brand_ok: false }, CLEAN],
      async () => ({ headline: 'Nuevo titular completo.' }),
    );
    const r = await run;
    eq(r.outcome, 'delivered', 'C6 fallo mixto con retext+regen → delivered');
    eq(calls.retext, 1, 'C6 retext llamado (el titular también se arregla)');
    eq(calls.generate, 1, 'C6 una regeneración (fallo de imagen real)');
    eq(calls.composite, 1, 'C6 composite sobre la imagen nueva');
    eq(r.headline, 'Nuevo titular completo.', 'C6 el titular final es el fallback');
  }
  { // C7 — texto horneado sin titular compuesto → regenerar puede limpiar.
    const { calls, run } = stubGate(
      [EVAL_589, CLEAN],
      async () => ({ regenerate: true }),
    );
    const r = await run;
    eq(r.outcome, 'delivered', 'C7 { regenerate: true } → se regenera y se entrega');
    eq(calls.generate, 1, 'C7 una regeneración');
    eq(calls.retext, 1, 'C7 retext consultado');
  }
  { // C8 — cada uno de los 11, solo, bloquea y se nombra. // re-pin v865
    for (const field of Object.keys(CLEAN)) {
      const { run } = stubGate([{ ...CLEAN, [field]: false }]);
      const r = await run;
      ok(r.outcome === 'bandeja' && r.failedChecks.includes(CHECK_NAMES[field]),
        `C8 solo ${field}=false → bandeja con '${CHECK_NAMES[field]}'`);
    }
  }
  { // C9 — sin veredicto: fail-closed.
    const { calls, run } = stubGate([null]);
    const r = await run;
    eq(r.outcome, 'bandeja', 'C9 evaluate null → bandeja');
    eq(r.failedChecks, ['qa_unavailable'], 'C9 failedChecks [qa_unavailable]');
  }
  { // C10 — retext que lanza no rompe el loop.
    const { calls, run } = stubGate([EVAL_589], async () => { throw new Error('retext roto'); });
    const r = await run;
    eq(r.outcome, 'bandeja', 'C10 retext que lanza → bandeja (no crash)');
    eq(r.failedChecks, ['headline_complete'], 'C10 failedChecks poblado');
    eq(calls.generate, 0, 'C10 sin regeneración tras retext fallido');
  }

  // ---------- D. qaHeadlineFallbacks (makeHeadline REAL) ----------
  console.log('D. qaHeadlineFallbacks (siguiente oración completa / pieza sin titular)');
  ok(typeof srv.qaHeadlineFallbacks === 'function', 'D0 qaHeadlineFallbacks exportado');
  const fallbacks = srv.qaHeadlineFallbacks;
  if (typeof fallbacks !== 'function') {
    // Contra-prueba (árbol prístino): sin la función no hay D que correr;
    // se registran como fallas en vez de romper la suite.
    ok(false, 'D1 sin qaHeadlineFallbacks no hay candidatos que probar');
    ok(false, 'D2 sin qaHeadlineFallbacks no hay candidatos que probar');
    ok(false, 'D3/D4/D5 sin qaHeadlineFallbacks');
  } else {
  {
    const src = '¿Cuántas veces te pasó de mirar tu feed y sentir que no vende? Posty lo deja listo por vos todos los días. Sin esfuerzo, con tu producto real.';
    const cands = fallbacks(src, '¿Cuántas veces te pasó…?', null);
    ok(cands.length >= 2 && cands[cands.length - 1] === '', 'D1 la cola termina en \'\' (pieza sin titular)');
    ok(!cands.includes('¿Cuántas veces te pasó…?'), 'D1 el titular en uso no se repite');
    ok(cands.slice(0, -1).every((c) => !(c.startsWith('¿') && c.endsWith('…'))), 'D1 ningún candidato es pregunta cortada');
    ok(cands[0] && !cands[0].startsWith('¿'), 'D1 el primer candidato es la siguiente oración (no la pregunta rota)');
    console.log('    candidatos D1:', JSON.stringify(cands));
  }
  {
    // Segunda pregunta cortada en la fuente: se salta, gana la declarativa.
    const src = '¿Cuántas veces te pasó de mirar tu feed? ¿Y si hoy empezás de nuevo con todo? Posty publica por vos.';
    const cands = fallbacks(src, '¿Cuántas veces te pasó…?', null);
    ok(cands.includes('Posty publica por vos.'), 'D2 la declarativa completa gana sobre la 2ª pregunta cortada');
    ok(cands.slice(0, -1).every((c) => !(c.startsWith('¿') && c.endsWith('…'))), 'D2 ningún candidato es pregunta cortada');
    console.log('    candidatos D2:', JSON.stringify(cands));
  }
  eq(fallbacks('Solo una oración completa acá.', 'Solo una oración completa', null), [''], 'D3 una sola oración → solo pieza sin titular');
  eq(fallbacks('', '¿Cuántas veces te pasó…?', null), [''], 'D4 fuente vacía → solo pieza sin titular');
  eq(fallbacks(null, '¿Cuántas veces te pasó…?', null), [''], 'D5 fuente null → solo pieza sin titular');
  }

  // ---------- E. Estáticos ----------
  console.log('E. Estáticos (cableado del gate en server.js)');
  eq((serverText.match(/20261105-v865/g) || []).length, 1, 'E1 BUILD v865 ×1');
  eq((serverText.match(/20261105-v851/g) || []).length, 0, 'E1 BUILD v851 ×0');
  ok(serverText.includes('retext: async'), 'E2 el call-site del gate pasa adaptador retext');
  ok(serverText.includes('headline: currentHeadline'), 'E3 evaluate usa currentHeadline');
  ok(serverText.includes('if (!currentHeadline) return;'), 'E3 composite usa currentHeadline');
  ok(serverText.includes('if (currentHeadline) {'), 'E3 save usa currentHeadline');
  ok(!serverText.includes('SOLO AUDITOR'), 'E4 sin "SOLO AUDITORÍA" en server.js (contraste/elementos ya bloquean)');
  ok(gateText.includes("['headline_complete', 'headline_complete']"), 'E5 headline_complete en GATE_CHECKS');
  ok(gateText.includes("['contraste_ok', 'contraste']"), 'E5 contraste_ok en GATE_CHECKS');
  ok(gateText.includes("['elementos_ok', 'elementos']"), 'E5 elementos_ok en GATE_CHECKS');
  ok(serverText.includes('qaHeadlineFallbacks'), 'E6 qaHeadlineFallbacks en module.exports');

  // ---------- F. Boot ----------
  console.log('F. Boot in-process');
  ok(await waitBoot(), 'F1 server booteó en 34671');
  try {
    const r = await fetch(`${BASE}/api/version`);
    const j = await r.json();
    eq(j.build, '20261105-v865', 'F2 /api/version = v865');
  } catch (e) { ok(false, 'F2 /api/version legible: ' + e.message); }

  console.log(`\n${pass} ok, ${fail} fallas.`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('SUITE ROTA:', e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(2);
});

function qaGatePassedSafe(qaGate, qa) {
  return qaGate.qaGatePassed(qa);
}
