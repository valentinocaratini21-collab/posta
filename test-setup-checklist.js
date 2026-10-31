'use strict';
global.pzIc = (name, px) => '<span class="pz-ic"></span>'; // stub: en producción pzIc es global de app.js (sistema de íconos 2026-10-25)
/* test-setup-checklist.js — (v426 · ÍTEM 4 «ARMA TODO») Checklist de
 * activación: pasos «primera semana» y «plan» sobre el checklist de setup
 * existente (setupChecklistHtml en public/app.js).
 *
 * Parte A: estáticos sobre app.js — filas nuevas con textos ES **y** EN
 *   (patrón ME.lang de la app), first_week_live consumido desde PROFILE,
 *   bindings de las filas nuevas y fila de Instagram intacta.
 * Parte B: COMPORTAMIENTO — se extrae setupChecklistHtml REAL de app.js
 *   y se ejecuta con stubs (sin bootear la app): conteo de pendientes,
 *   la fila informativa de trial NO suma ni frena la desaparición, la
 *   celebración recibe el conteo de pendientes, omitIg (v326) mantiene
 *   el mismo número en toda la app.
 * Parte C: estáticos sobre server.js — /api/profile expone
 *   first_week_live con la query definida (status scheduled/published),
 *   BUILD_ID v426 y canario HEADLINE_INFINITIVES = 3 ocurrencias intacto.
 *
 * Uso: node test-setup-checklist.js
 */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

/* ---------- util: extraer una función por balance de llaves ---------- */
// Lexer mínimo con pila de marcos (código / template literal): alcanza
// para setupChecklistHtml, que no usa regex literales.
function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return null;
  const stack = [{ tpl: false, braces: 0 }];
  let begun = false;
  let i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    const c = src[i], top = stack[stack.length - 1];
    if (!top.tpl) {
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
      if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
      if (c === '`') { stack.push({ tpl: true, braces: 0 }); continue; }
      if (c === '{') { top.braces++; begun = true; continue; }
      if (c === '}') {
        top.braces--;
        if (begun && top.braces === 0 && stack.length === 1) return src.slice(start, i + 1);
        if (top.braces < 0) { stack.pop(); }
        continue;
      }
    } else {
      if (c === '\\') { i++; continue; }
      if (c === '`') { stack.pop(); continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push({ tpl: false, braces: 0 }); i++; continue; }
    }
  }
  return null;
}

const fnSrc = extractFn(appJs, 'setupChecklistHtml');
ok(!!fnSrc, 'setupChecklistHtml existe y se pudo extraer de app.js');

/* ================= Parte A: estáticos sobre app.js ================= */
ok(fnSrc.includes('PROFILE.first_week_live'), 'la fila de semana consume PROFILE.first_week_live');
ok(fnSrc.includes("ME.lang === 'en'"), 'las filas nuevas siguen el patrón de idioma ME.lang === \'en\'');

// Paso «primera semana» — ES
ok(fnSrc.includes('id="setupWeekRow"'), 'fila de semana con id setupWeekRow');
ok(fnSrc.includes('Revisá tu primera semana'), 'semana ES: título «Revisá tu primera semana»');
ok(fnSrc.includes('Mirá los posteos que armé para vos y dejalos listos.'), 'semana ES: small exacto de la spec');
ok(fnSrc.includes('Ver mi semana ') && fnSrc.includes('pzIc("arrowRight"'), 'semana ES: botón «Ver mi semana» + flecha dibujada (íconos Lote 6)');
// Paso «primera semana» — EN espejo
ok(fnSrc.includes('Review your first week'), 'semana EN: «Review your first week»');
ok(fnSrc.includes('Take a look at the posts I made for you and get them ready.'), 'semana EN: small espejo');
ok(fnSrc.includes('See my week ') && fnSrc.includes('pzIc("arrowRight"'), 'semana EN: «See my week» + flecha dibujada (íconos Lote 6)');

// Paso «plan» pendiente — ES
ok(fnSrc.includes('id="setupPlanRow"'), 'fila de plan con id setupPlanRow');
ok(fnSrc.includes('Activá tu plan'), 'plan ES: «Activá tu plan»');
ok(fnSrc.includes('Tu prueba terminó: elegí un plan y sigo trabajando para vos.'), 'plan ES: small exacto de la spec');
ok(fnSrc.includes('Ver planes ') && fnSrc.includes('pzIc("arrowRight"'), 'plan ES: botón «Ver planes» + flecha dibujada (íconos Lote 6)');
// Paso «plan» pendiente — EN espejo
ok(fnSrc.includes('Activate your plan'), 'plan EN: «Activate your plan»');
ok(fnSrc.includes("Your trial is over: pick a plan and I'll keep working for you."), 'plan EN: small espejo');
ok(fnSrc.includes('See plans ') && fnSrc.includes('pzIc("arrowRight"'), 'plan EN: «See plans» + flecha dibujada (íconos Lote 6)');

// Trial vigente informativo — ES y EN
ok(fnSrc.includes('Tu prueba está en curso'), 'trial ES: «Tu prueba está en curso»');
ok(fnSrc.includes('días de prueba'), 'trial ES: «días de prueba»');
ok(fnSrc.includes('tu plan se activa cuando quieras.'), 'trial ES: cierre de la spec');
ok(fnSrc.includes('Your trial is in progress'), 'trial EN: «Your trial is in progress»');
ok(fnSrc.includes('days of trial left'), 'trial EN: «days of trial left»');
ok(fnSrc.includes('your plan starts whenever you want.'), 'trial EN: cierre espejo');

// La fila de trial NO suma al conteo de pendientes (lectura del código):
// va a infoRows (no a rows), la celebración y totalSteps miran `rows`.
ok(/infoRows\.push\(en/.test(fnSrc), 'la fila de trial se pushea a infoRows (no a rows)');
ok(fnSrc.includes('setupChecklistCelebrate(rows.length)'), 'la celebración recibe rows.length (solo pendientes)');
ok(!fnSrc.includes('setupChecklistCelebrate(infoRows'), 'la celebración NUNCA recibe infoRows');
ok(fnSrc.includes('const totalSteps = rows.length;'), 'totalSteps = rows.length (v326: pendientes reales)');
ok(fnSrc.includes('${infoRows.join(\'\')}'), 'el render pinta infoRows dentro de la tarjeta');

// Fila de Instagram EXACTAMENTE como estaba + binds de las filas nuevas
ok(fnSrc.includes('<b>Conectá tu Instagram</b><small>Dejá tu semana lista para publicar.</small>'), 'fila de IG intacta (texto histórico)');
const bindSrc = extractFn(appJs, 'bindSetupRows') || '';
ok(bindSrc.includes("$('#setupWeekRow')") && bindSrc.includes("location.hash = '#/app/schedule'"), 'bind: setupWeekRow → #/app/schedule');
ok(bindSrc.includes("$('#setupPlanRow')") && bindSrc.includes("location.hash = '#/app/ajustes'"), 'bind: setupPlanRow → #/app/ajustes (Mi plan)');
ok(bindSrc.includes("$('#setupIgRow')") && bindSrc.includes('igConnectHere'), 'bind: la fila de IG sigue enlazando al flujo existente');

// Título por defecto bilingüe
ok(fnSrc.includes('steps to go'), 'título EN: «N steps to go»');

/* ================= Parte B: comportamiento ================= */
const factory = new Function(
  'PROFILE', 'ME', 'pwaIsMobile', 'pwaIsInstalled', 'pwaDismissed',
  'pushSupported', 'pushPerm', 'setupChecklistCelebrate',
  'pzPushRowPending', 'pzPushRowDenied',
  fnSrc + '\nreturn setupChecklistHtml;'
);
function run(profile, me, opts) {
  const counts = [];
  const fn = factory(
    profile, me,
    () => false, () => true, () => true,      // PWA: sin fila
    () => false, () => 'granted',             // push: sin fila
    (n) => counts.push(n),
    // (Lote 7, avisos-telefono) La fila de push ahora pregunta a los
    // helpers pzPushRowPending/Denied: con push sin fila, ambos false,
    // igual que daría el helper real con pushSupported() === false.
    () => false, () => false
  );
  return { html: fn(undefined, opts), counts };
}
const DONE_PROFILE = { business_name: 'Café Sur', ig_connected: true, first_week_live: true };

// S1 · ES, todo pendiente (biz+IG+semana+plan cancelado = 4)
{
  const { html, counts } = run(
    { business_name: '', ig_connected: false, first_week_live: false },
    { lang: 'es', plan_status: 'cancelled' }
  );
  ok(html.includes('setupWeekRow') && html.includes('setupPlanRow'), 'S1: semana y plan pendientes se pintan');
  ok(html.indexOf('setupIgRow') > -1 && html.indexOf('setupIgRow') < html.indexOf('setupWeekRow'), 'S1: la semana va DESPUÉS de Instagram');
  ok(html.includes('faltan 4 pasos'), 'S1: el título cuenta 4 pasos (biz, IG, semana, plan)');
  ok(counts[counts.length - 1] === 4, 'S1: la celebración recibe 4 pendientes');
}

// S2 · EN espejo completo
{
  const { html } = run(
    { business_name: '', ig_connected: false, first_week_live: false },
    { lang: 'en', plan_status: 'cancelled' }
  );
  ok(html.includes('Review your first week') && html.includes('Activate your plan'), 'S2: filas nuevas en inglés con ME.lang=en');
  ok(html.includes('4 steps to go'), 'S2: título EN cuenta los mismos 4 pasos');
  ok(!html.includes('Revisá tu primera semana') && !html.includes('Activá tu plan'), 'S2: nada de las filas nuevas queda en español');
}

// S3 · Trial vigente + todo lo demás cumplido → la tarjeta DESAPARECE
{
  const { html, counts } = run(DONE_PROFILE, { lang: 'es', plan_status: 'trial', trial_expired: false, trial_days_left: 5 });
  ok(html === '', 'S3: trial vigente NO mantiene viva la tarjeta (devuelve \'\')');
  ok(counts[counts.length - 1] === 0, 'S3: la celebración recibe 0 (la transición a cero puede festejar)');
}

// S4 · Trial vigente + IG pendiente: la info se ve pero NO suma
{
  const { html, counts } = run(
    { business_name: 'Café Sur', ig_connected: false, first_week_live: true },
    { lang: 'es', plan_status: 'trial', trial_expired: false, trial_days_left: 5 }
  );
  ok(html.includes('Tu prueba está en curso') && html.includes('Te quedan 5 días de prueba'), 'S4: fila informativa de trial visible con sus días');
  ok(html.includes('setup-done'), 'S4: la fila de trial usa el estilo setup-done con ✓');
  ok(html.includes('falta 1 paso'), 'S4: el título cuenta SOLO el paso real (IG): «falta 1 paso»');
  ok(counts[counts.length - 1] === 1, 'S4: la celebración recibe 1 (trial excluido)');
}

// S5 · Trial EN con 1 día: singular correcto en ambos idiomas
{
  const en5 = run(
    { business_name: 'Café Sur', ig_connected: false, first_week_live: true },
    { lang: 'en', plan_status: 'trial', trial_expired: false, trial_days_left: 1 }
  );
  ok(en5.html.includes('Your trial is in progress') && en5.html.includes('You have 1 day of trial left'), 'S5: trial EN singular «1 day»');
  ok(en5.html.includes('1 step to go'), 'S5: título EN singular «1 step to go»');
  const es5 = run(
    { business_name: 'Café Sur', ig_connected: false, first_week_live: true },
    { lang: 'es', plan_status: 'trial', trial_expired: false, trial_days_left: 1 }
  );
  ok(es5.html.includes('Te queda 1 día de prueba'), 'S5: trial ES singular «Te queda 1 día»');
}

// S6 · Plan activo: sin fila de plan; semana cumplida: sin fila de semana
{
  const { html } = run(
    { business_name: 'Café Sur', ig_connected: false, first_week_live: true },
    { lang: 'es', plan_status: 'active' }
  );
  ok(!html.includes('setupPlanRow') && !html.includes('Tu prueba está en curso'), 'S6: plan activo no genera fila de plan ni de trial');
  ok(!html.includes('setupWeekRow'), 'S6: first_week_live=true no genera fila de semana');
  ok(run(DONE_PROFILE, { lang: 'es', plan_status: 'active' }).html === '', 'S6: todo cumplido + plan activo → tarjeta desaparece');
}

// S7 · Trial vencido → fila de plan pendiente (cuenta 1)
{
  const { html, counts } = run(DONE_PROFILE, { lang: 'es', plan_status: 'trial', trial_expired: true, trial_days_left: 0 });
  ok(html.includes('setupPlanRow') && html.includes('Activá tu plan'), 'S7: trial vencido muestra «Activá tu plan»');
  ok(html.includes('falta 1 paso') && counts[counts.length - 1] === 1, 'S7: el plan vencido SÍ cuenta como 1 paso pendiente');
}

// S8 · omitIg (v326): el número es el mismo con y sin la fila visible
{
  const profile = { business_name: 'Café Sur', ig_connected: false, first_week_live: false };
  const me = { lang: 'es', plan_status: 'active' };
  const full = run(profile, me);
  const omit = run(profile, me, { omitIg: true });
  ok(!omit.html.includes('setupIgRow') && full.html.includes('setupIgRow'), 'S8: omitIg oculta la fila de IG en Inicio');
  ok(omit.html.includes('faltan 2 pasos') && full.html.includes('faltan 2 pasos'), 'S8: el conteo (IG+semana=2) es idéntico en toda la app');
}

/* ================= Parte C: estáticos sobre server.js ================= */
const profStart = serverJs.indexOf("app.get('/api/profile'");
ok(profStart > -1, 'existe GET /api/profile en server.js');
const profSlice = profStart > -1 ? serverJs.slice(profStart, profStart + 1600) : '';
ok(profSlice.includes('first_week_live: firstWeekLive'), '/api/profile expone first_week_live en su payload');
ok(profSlice.includes("status IN ('scheduled', 'published')"), 'la query es la definida: status scheduled/published');
ok(profSlice.includes('FROM posts WHERE user_id = ?'), 'la query está acotada al usuario de la sesión');
ok(profSlice.includes('LIMIT 1'), 'la query es existencia (LIMIT 1), costo mínimo');
ok(serverJs.includes("const BUILD_ID = '20261031-v507';"), 'BUILD_ID bumpeado a 20261031-v507');
ok((serverJs.match(/HEADLINE_INFINITIVES/g) || []).length === 3, 'canario HEADLINE_INFINITIVES = 3 ocurrencias, intacto');
const setMatch = serverJs.match(/const HEADLINE_INFINITIVES = new Set\(\[([^\]]*)\]\)/);
ok(!!setMatch && setMatch[1].split(',').length === 26, 'el set HEADLINE_INFINITIVES conserva sus 26 infinitivos');
const vMatch = indexHtml.match(/\/app\.js\?v=(\d+)/);
ok(!!vMatch && Number(vMatch[1]) > 268, 'index.html bumpea el ?v= de app.js (regla anti-caché iOS)');

console.log(`\nsetup-checklist: ${okN} ok, ${failN} fallas`);
process.exit(failN ? 1 : 0);
