// test-hooks.js — Harness de hooks.js. NO VA AL DEPLOY.
// Uso: node test-hooks.js

const { execSync } = require('child_process');
const {
  INTENTS, HOOKS, BANNED_PATTERNS, isBanned,
  pickHook, renderHook, ensureCaptionOpensWithHook, hookIntentMap,
  captionOpenIsGarbled,
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

// 9. captionOpenIsGarbled: exención del nombre del negocio (2026-10-19)
t('garbled: nombre con artículo propio no es empalme (Lo de Marta)',
  captionOpenIsGarbled('En Lo de Marta las facturas salen calentitas y con dulce de leche casero', 'Lo de Marta') === false);
t('garbled: apertura con el nombre al frente (La Cocina de Ana)',
  captionOpenIsGarbled('La Cocina de Ana abre también los domingos al mediodía', 'La Cocina de Ana') === false);
t('garbled: empalme real sigue marcado (post 112)',
  captionOpenIsGarbled('El De escéptica a fan: cómo cambió mi rutina', 'Posty') === true);
t('garbled: tema-título cosido sigue marcado (id 406)',
  captionOpenIsGarbled('Lo que nos dijo una clienta después de probar Lo que nuestros usuarios dicen de Posty en Posty', 'Posty') === true);
t('garbled: caption sano sin el nombre no se toca',
  captionOpenIsGarbled('Las medialunas salen del horno a las ocho en punto', 'Lo de Marta') === false);

// 11. captionOpenIsGarbled LINT v4 (Parte 62, mediodía 2026-10-19):
// costuras sin la firma pelada + formas cortas del nombre.
t('v4: fórmula cosida tras coma',
  captionOpenIsGarbled('El pan de campo recién horneado, Regalá una presencia digital con Posty', 'Posty') === true);
t('v4: tema-título Cómo tras verbo',
  captionOpenIsGarbled('Te mostramos Cómo crear contenido sin estrés en tu cuenta', 'Posty') === true);
t('v4: pregunta incrustada sin apertura',
  captionOpenIsGarbled('Haciendo contenido sin estrés? en Posty te lo resolvemos', 'Posty') === true);
t('v4: fragmento De tras dos puntos',
  captionOpenIsGarbled('Novedad de la casa: De escéptica a fan: el cambio de una clienta real', 'Posty') === true);
t('v4: empalme tras el nombre enmascarado',
  captionOpenIsGarbled('En Lo de Marta, Lo que nuestros usuarios dicen de Posty en Posty', 'Lo de Marta') === true);
t('v4: nombre corto no es empalme (La Cocina)',
  captionOpenIsGarbled('La Cocina abre también los domingos al mediodía', 'La Cocina de Ana') === false);
t('v4: nombre corto de cadena (La Casa de Té)',
  captionOpenIsGarbled('La Casa de Té abre los sábados desde las diez', 'La Casa de Té de Ana') === false);
t('v4: artículo ajeno + nombre (El Café Aroma)',
  captionOpenIsGarbled('El Café Aroma abre temprano con medialunas recién hechas', 'Café Aroma') === false);
t('v4: persona con De no es tema-título',
  captionOpenIsGarbled('María De los Ángeles contó que las facturas son las mejores del barrio', 'Lo de Marta') === false);
t('v4: CTA tras punto es oración nueva, no costura',
  captionOpenIsGarbled('Esta semana 25% de descuento en tortas. Escribinos por DM y reservá la tuya.', 'Lo de Marta') === false);
t('v4: pregunta que abre y sigue en minúscula es estilo, no costura',
  captionOpenIsGarbled('¿te duele la uña encarnada? turno de podología esta semana', 'Posty') === false);
t('v4: cadena de imperativos del dueño no es costura',
  captionOpenIsGarbled('Vení, probá las facturas calentitas de siempre', 'Lo de Marta') === false);

// 12. captionOpenIsGarbled LINT v5 (Juli, 2026-10-24) — regla (g): el
// empalme h11 sin puntuación: el tema cosido tras «después de probar»
// es una frase imperativa (id 448 real, cuenta 81, generado sobre v383).
t('v5: id 448 real — tema-imperativo tras «después de probar» es empalme',
  captionOpenIsGarbled('Lo que nos dijo una clienta después de probar Unite a nuestra comunidad de negocios en Posty', 'Posty') === true);
t('v5: variante con «probarlo» + imperativo capitalizado',
  captionOpenIsGarbled('Lo que nos dijo un cliente después de probarlo Sumate a la comunidad de siempre', 'Posty') === true);
t('v5: tema sustantivo tras «después de probar» NO es empalme',
  captionOpenIsGarbled('Lo que nos dijo una clienta después de probar las medialunas de siempre', 'Lo de Marta') === false);
t('v5: el negocio tras «después de probar» NO es empalme (enmascarado)',
  captionOpenIsGarbled('Lo que nos dijo una clienta después de probar Posty por una semana entera', 'Posty') === false);
t('v5: «después de probar» + pronombre NO es empalme',
  captionOpenIsGarbled('Lo que nos dijo una clienta después de probarlo en su local de siempre', 'Posty') === false);
t('v5: imperativo en minúscula tras punto no es esta firma',
  captionOpenIsGarbled('Salió el menú nuevo de la casa. Después de probarlo, unite no tiene sentido acá', 'Posty') === false);

// 13. captionOpenIsGarbled LINT v6 (Juli, 2026-10-25) — regla (h):
// fórmula + imperativo tras preposición, sin puntuación entre medio
// (id 454 real, cuenta 80, semana 2026-10-19, generado 24/10).
t('v6: id 454 real — «cometen con Organizá…» es empalme',
  captionOpenIsGarbled('El error que casi todos cometen con Organizá tu agenda como un pro (y cómo lo evitamos en Gesty)', 'Gesty') === true);
t('v6: variante «de» + imperativo — «El ingrediente de Armá tu…» es empalme',
  captionOpenIsGarbled('El ingrediente de Armá tu semana en un día que casi nadie usa', 'Posty') === true);
t('v6: variante «por» + imperativo — respaldo del 488 (ya lo cazaba otra firma)',
  captionOpenIsGarbled('Vino por Formá parte de la comunidad Posty y se quedó por el trato', 'Posty') === true);
t('v6: tema sustantivo tras «con» NO es empalme',
  captionOpenIsGarbled('El error que casi todos cometen con el café frío de la mañana', 'Café Aroma') === false);
t('v6: imperativo que ABRE la línea NO es esta firma (es estilo del dueño)',
  captionOpenIsGarbled('Organizá tu agenda hoy y dejá de perder horas', 'Gesty') === false);
t('v6: «por tu» / pronombre tras preposición NO es empalme',
  captionOpenIsGarbled('Vení por tu café de siempre y quedate un rato', 'Café Aroma') === false);
t('v6: imperativo en minúscula tras preposición NO es esta firma',
  captionOpenIsGarbled('El error que casi todos cometen con organizá tu agenda', 'Gesty') === false);
t('v6: nombre propio tras «para» NO es empalme (dale fuera del banco)',
  captionOpenIsGarbled('Un regalo para Dale, nuestro cliente de siempre', 'Posty') === false);

// 10. node --check hooks.js
let checkOk = false;
try {
  execSync('node --check hooks.js', { cwd: __dirname, stdio: 'pipe' });
  checkOk = true;
} catch (e) { checkOk = false; }
t('node --check hooks.js', checkOk);

console.log(`\n${pass} pass, ${fail} fail (${pass + fail} tests)`);
if (failures.length) console.log('Fallaron:', failures.join(' | '));
process.exit(fail ? 1 : 0);
