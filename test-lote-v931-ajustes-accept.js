// test-lote-v931-ajustes-accept.js — LOTE v931 (QA nocturna 11/11).
// Dos bugs críticos de v925/v928, ambos reproducidos en boot local antes
// del fix y verificados después en el release:
//  A) Ajustes muere con "No pude cargar esta pantalla": la limpieza
//     ONBOARDING-SIMPLE (v898) borró del app.js las declaraciones que
//     chunk-ajustes.js lee (IG_VERIFIED_AT, igSince, IG_MODE_WARN).
//  B) Aceptar un borrador SIN CTA con IG conectado muestra "¡Listo!"
//     y acto seguido "Ese posteo no existe": el lint al programar lo
//     marcaba needs_review=1 pero GET /api/posts/:id lo filtraba (404)
//     y el toast era incondicional.
// Uso: node test-lote-v931-ajustes-accept.js [repo-dir]  (default: .)
// Cero red, cero envíos, no toca producción.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || '.');
const appSrc = fs.readFileSync(path.join(repo, 'public', 'app.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(repo, 'server.js'), 'utf8');
const chunkSrc = fs.readFileSync(path.join(repo, 'public', 'chunk-ajustes.js'), 'utf8');
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('ok ' + pass + ' - ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function count(src, sub) { return src.split(sub).length - 1; }

// ---------- A) Ajustes: los globales existen y el chunk los puede leer ----------
ok(appSrc.includes('let IG_VERIFIED_AT = null;'), 'A1 app.js declara IG_VERIFIED_AT');
ok(appSrc.includes('let IG_MODE_WARN = false;'), 'A2 app.js declara IG_MODE_WARN');
ok(appSrc.includes('const igSince = (s) => {'), 'A3 app.js define igSince');
ok(count(appSrc, 'IG_VERIFIED_AT') >= 1, 'A4 IG_VERIFIED_AT presente en app.js');
ok(count(appSrc, 'igSince') >= 1, 'A5 igSince presente en app.js');
// Las lecturas del chunk ya no pueden tirar ReferenceError: simular el
// entorno mínimo (PROFILE/SETTINGS + los globales) y evaluar las
// expresiones que ajustesView usa en sus dos ramas.
const sandbox = {
  console, Math, JSON, Date, String, Number, Array, Object,
  PROFILE: { ig_connected: 1, ig_username: 'cafe.aroma.qa' },
  SETTINGS: { demo_mode: false },
  pzIc: () => '', esc: (s) => String(s == null ? '' : s),
};
vm.createContext(sandbox);
vm.runInContext('let IG_VERIFIED_AT = null; const igSince = (s) => { try { const d = String(s.ig_token_issued_at || "").slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}/${d[1]}` : ""; } catch (e) { return ""; } }; let IG_MODE_WARN = false;', sandbox);
vm.runInContext('const s = SETTINGS; const p = PROFILE;', sandbox);
ok(vm.runInContext('IG_VERIFIED_AT ? "ok" : ""', sandbox) === '', 'A6 lectura IG_VERIFIED_AT (falsy) no tira');
ok(vm.runInContext('igSince(s)', sandbox) === '', 'A7 igSince(s) sin token no tira y da ""');
ok(vm.runInContext('IG_MODE_WARN ? "warn" : ""', sandbox) === '', 'A8 lectura IG_MODE_WARN no tira');
// El chunk sigue leyendo los tres identificadores (si se borran, el test A1-A3 cae).
ok(chunkSrc.includes('IG_VERIFIED_AT'), 'A9 chunk-ajustes lee IG_VERIFIED_AT');
ok(chunkSrc.includes('igSince(s)'), 'A10 chunk-ajustes llama igSince(s)');
ok(chunkSrc.includes('IG_MODE_WARN'), 'A11 chunk-ajustes lee IG_MODE_WARN');

// ---------- B) Aceptar sin CTA: GET no filtra, PATCH avisa, toasts honestos ----------
ok(!srvSrc.includes('WHERE id = ? AND user_id = ? AND COALESCE(needs_review,0)=0'),
   'B1 GET /api/posts/:id ya no filtra needs_review');
ok(srvSrc.includes('"SELECT * FROM posts WHERE id = ? AND user_id = ?"'),
   'B2 GET /api/posts/:id selecciona por id+usuario');
ok(srvSrc.includes('lintRes = scheduleLintForPost(req.session.userId, post.id);'),
   'B3 PATCH captura el resultado del lint al programar');
ok(srvSrc.includes("in_review: true, lint_reason: lintRes.reason"),
   'B4 PATCH devuelve in_review + lint_reason cuando el lint falla');
ok(appSrc.includes("if (pr && pr.in_review) toast(`✨ <b>Quedó en revisión.</b>"),
   'B5 apvAcceptDraft: toast honesto si quedó en revisión');
ok(appSrc.includes("if (pr && pr.in_review) toast(`✨ <b>Quedó en revisión.</b><br>${esc(pr.lint_reason"),
   'B6 bindReview: toast honesto si quedó en revisión');
ok(appSrc.includes('if (prF3 && prF3.in_review)'),
   'B7 f3GestureApprove: toast honesto si quedó en revisión');
ok(appSrc.includes("const canAccept = st === 'scheduled' && ap === 'pending' && !p.needs_review;"),
   'B8 apv: sin botón Aceptar cuando el posteo está en revisión');
ok(appSrc.includes('Este posteo está en revisión'),
   'B9 apv: aviso visible de "en revisión"');
ok(appSrc.includes("const draftActions = (isDraft && !apvInReview) ? `"),
   'B10 apv: sin Aceptar de borrador cuando está en revisión');

// ---------- Estampado ----------
ok(srvSrc.includes("const BUILD_ID = '20261105-v957';"), 'C1 BUILD v957 estampado');
ok(count(srvSrc, "20261105-v942") === 0, 'C2 sin restos de v942 en server.js');
const idxEs = fs.readFileSync(path.join(repo, 'public', 'index.html'), 'utf8');
ok(idxEs.includes('app.js?v=667'), 'C3 index ES apunta a app.js?v=667');
ok(!idxEs.includes('app.js?v=652'), 'C4 index ES sin resto de ?v=652');
const idxEn = fs.readFileSync(path.join(repo, 'public', 'en', 'index.html'), 'utf8');
ok(!idxEn.includes('app.js?v='), 'C5 index EN estático: no carga app.js (sin ?v=)');

console.log(`\n${pass} OK — ${fail} FALLOS`);
process.exit(fail ? 1 : 0);
