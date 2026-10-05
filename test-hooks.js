// test-hooks.js — Harness de hooks.js. NO VA AL DEPLOY.
// Uso: node test-hooks.js

const { execSync } = require('child_process');
const {
  INTENTS, HOOKS, BANNED_PATTERNS, isBanned,
  pickHook, renderHook, ensureCaptionOpensWithHook, hookIntentMap,
} = require('./hooks');

let pass = 0, fail = 0;
const failures = [];
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.error('FAIL:', name); }
}

// 1. Banco: 50 hooks, ids únicos h01-h50
t('50 hooks', HOOKS.length === 50);
const ids = HOOKS.map((h) => h.id);
t('ids únicos', new Set(ids).size === 50);
t('ids h01-h50', ids.every((id) => /^h\d{2}$/.test(id)) &&
  Array.from({ length: 50 }, (_, i) => 'h' + String(i + 1).padStart(2, '0')).every((id) => ids.includes(id)));

// 2. Estructura: intents válidos, fórmula con slots, ejemplo no vacío
t('intents válidos y no vacíos', HOOKS.every((h) =>
  Array.isArray(h.intents) && h.intents.length > 0 &&
  h.intents.every((i) => INTENTS.includes(i))));
t('formula string con al menos un slot', HOOKS.every((h) =>
  typeof h.formula === 'string' && h.formula.length > 0 &&
  (h.formula.includes('{tema}') || h.formula.includes('{negocio}'))));
t('ejemplo no vacío', HOOKS.every((h) => typeof h.ejemplo === 'string' && h.ejemplo.trim().length > 0));
t('sin emojis en fórmula/ejemplo', HOOKS.every((h) =>
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(h.formula + ' ' + h.ejemplo)));
t('sin hashtags en fórmula/ejemplo', HOOKS.every((h) => !/(^|\s)#\w/.test(h.formula + ' ' + h.ejemplo)));

// 3. Cobertura: al menos 4-5 hooks por intención
const map = hookIntentMap();
t('hookIntentMap cubre las 10 intenciones', INTENTS.every((i) => Array.isArray(map[i]) && map[i].length >= 4));
t('hookIntentMap suma 50', Object.values(map).flat().length === 50);

// 4. Anti-patrones: ningún hook (fórmula, ejemplo ni nota) los matchea
const cleanHooks = HOOKS.filter((h) => isBanned(h.formula) || isBanned(h.ejemplo) || isBanned(h.nota || ''));
t('ningún hook matchea BANNED_PATTERNS', cleanHooks.length === 0);
if (cleanHooks.length) console.error('   hooks con anti-patrón:', cleanHooks.map((h) => h.id).join(','));

// 5. isBanned detecta los 10 anti-patrones (con contexto de frase real)
const bannedSamples = [
  '¿Sabías que el café tiene cafeína? te lo contamos',
  '¡Atención! Esto es importante para vos',
  'No te lo pierdas, entrá ahora',
  'El secreto mejor guardado de la cocina',
  'Última oportunidad para anotarte',
  'No vas a creer lo que pasó',
  'Esto te va a volar la cabeza, mirá',
  'Leé hasta el final porque vale la pena',
  'Te apuesto que no lo sabías',
  'Nadie te dice esto sobre los precios',
];
t('BANNED_PATTERNS tiene 10 regex', BANNED_PATTERNS.length === 10);
t('isBanned detecta los 10 anti-patrones', bannedSamples.every((s) => isBanned(s)));
t('isBanned no marca texto limpio', !isBanned('La milanesa que hacemos distinta (y por qué se nota)') && !isBanned('') && !isBanned(null));

// 6. pickHook: respeta intent, excluye usados hasta agotar
const promoIds = map.promo;
t('pickHook devuelve hook del intent pedido', (() => {
  for (let i = 0; i < 20; i++) {
    const h = pickHook({ intent: 'promo' });
    if (!h.intents.includes('promo')) return false;
  }
  return true;
})());
t('pickHook no devuelve ids usados (hasta agotar)', (() => {
  const used = promoIds.slice(0, promoIds.length - 1);
  for (let i = 0; i < 20; i++) {
    const h = pickHook({ intent: 'promo', usedHookIds: used });
    if (used.includes(h.id)) return false;
    if (h.reused) return false;
  }
  return true;
})());
t('pickHook agotado devuelve reused:true', (() => {
  const h = pickHook({ intent: 'promo', usedHookIds: promoIds });
  return h.reused === true && h.intents.includes('promo');
})());
t('pickHook intent desconocido usa todo el banco', (() => {
  const h = pickHook({ intent: 'inexistente' });
  return !!h && typeof h.id === 'string';
})());

// 7. renderHook: sin slots colgados
const r1 = renderHook(HOOKS[0], { tema: 'la merienda', negocio: 'Café Alvear' });
t('renderHook reemplaza slots', r1 === HOOKS[0].formula.replace('{tema}', 'la merienda').replace('{negocio}', 'Café Alvear'));
const rAll = HOOKS.map((h) => renderHook(h, { tema: 'el pan', negocio: 'Horno Sur' }));
t('renderHook: ningún "{"/"}" colgado en los 50', rAll.every((s) => !s.includes('{') && !s.includes('}')));
t('renderHook: sin dobles espacios en los 50', rAll.every((s) => !/  /.test(s)));
const rEmpty = renderHook(HOOKS[35], {});
t('renderHook slots faltantes -> limpio', !rEmpty.includes('{') && !rEmpty.includes('}') && !/  /.test(rEmpty) && rEmpty.length > 0);

// 8. ensureCaptionOpensWithHook: no duplica, antepone cuando falta
const hookText = 'La milanesa que hacemos distinta (y por qué se nota)';
const withHook = hookText + '\n\nEl cuerpo del caption acá.';
t('no duplica si ya abre con el hook', ensureCaptionOpensWithHook(withHook, hookText) === withHook);
const withHookCase = '  la MILANESA que hacemos distinta (y por qué se nota)  \n\nCuerpo.';
t('no duplica (trim + case-insensitive)', ensureCaptionOpensWithHook(withHookCase, hookText) === withHookCase);
const noHook = 'El cuerpo del caption sin hook.';
const prepended = ensureCaptionOpensWithHook(noHook, hookText);
t('antepone con \\n\\n cuando falta', prepended === hookText + '\n\n' + noHook);
t('idempotente: segunda llamada no duplica', ensureCaptionOpensWithHook(prepended, hookText) === prepended);
t('hook vacío no toca el caption', ensureCaptionOpensWithHook(noHook, '') === noHook);

// 9. node --check hooks.js
let checkOk = false;
try {
  execSync('node --check hooks.js', { cwd: __dirname, stdio: 'pipe' });
  checkOk = true;
} catch (e) { checkOk = false; }
t('node --check hooks.js', checkOk);

console.log(`\n${pass} pass, ${fail} fail (${pass + fail} tests)`);
if (failures.length) console.log('Fallaron:', failures.join(' | '));
process.exit(fail ? 1 : 0);
