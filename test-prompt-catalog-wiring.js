'use strict';
/* test-prompt-catalog-wiring.js — LOS PROMPTS DE VALENTINO MANDAN (v233)
 * El catálogo de presets que Valentino pasó (1.255 + 12 arquetipos del
 * Style Lock) cableado en la generación de posteos:
 *  (a) pick CONSCIENTE DEL DIGEST: dos negocios del mismo rubro con
 *      fundamentos opuestos eligen presets distintos, explicados por el
 *      match léxico contra sus productos reales;
 *  (b) el prompt final lleva el texto del preset UNA sola vez y en la
 *      posición de DIRECCIÓN DE ESTILO (tras composición/paleta, antes
 *      de HEADLINE ZONE) — en clientes y en la prueba IA;
 *  (c) el brief de arte NACE con el preset: expandArtBrief lo recibe y
 *      el mensaje al director de arte nombra el code elegido;
 *  (d) rotación de FAMILIA: dos piezas de la misma semana no comparten
 *      familia de dirección;
 *  (e) NEGATIVO: ni con match léxico perfecto sale un preset
 *      no-brandSafe ni uno prohibido por NEVER_STYLES;
 *  (f) los 12 arquetipos del Style Lock existen como presets y son
 *      elegibles por pickStyle en su rubro;
 *  (g) la prueba sin IA deriva más del preset (treatmentForStyle).
 * Costo IA: cero — expandArtBrief se evalúa con fetch stubbeado.
 * Corre con: node test-prompt-catalog-wiring.js */
const assert = require('assert');
const fs = require('fs');

const IS = require('./image-styles');
const cd = require('./client-digest');
const demoAi = require('./demo-ai');
const demo = require('./demo');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.error('  ✗', name, '—', e.message); }
}
const pending = [];
function okAsync(name, fn) {
  pending.push((async () => {
    try { await fn(); pass++; console.log('  ✓', name); }
    catch (e) { fail++; console.error('  ✗', name, '—', e.message); }
  })());
}
const count = (hay, needle) => hay.split(needle).length - 1;

// ---------- fixtures: los dos mundos opuestos de gastronomía ----------
const sushiDigest = cd.buildFromParts({
  business: 'Sushi Go', category: 'gastronomia',
  feed: { bio: 'Sushi y cocina nikkei en Palermo. Omakase los viernes. Reservas por DM.', captions: ['Omakase de viernes 🍣 el favorito de la casa', 'Rolls de salmón fresco, como siempre', 'Nigiris del día, recién hechos'], name: 'Sushi Go', handle: 'sushigo' },
  feedPalette: { principal: '#1D3557' }, registro: 'dark',
});
const parrillaDigest = cd.buildFromParts({
  business: 'La Parrilla de Juan', category: 'gastronomia',
  feed: { bio: 'Parrilla argentina en Belgrano. Asado, vacío y provoleta. Vino malbec de la casa.', captions: ['Asado del domingo con la familia', 'Provoleta a la parrilla, dorada y crocante', 'Vacío al punto con papas rústicas'], name: 'La Parrilla de Juan', handle: 'laparrilladejuan' },
  feedPalette: { principal: '#7B2D26' }, registro: 'warm',
});

console.log('== (a) pick consciente del digest ==');
ok('sushi y parrilla (mismo rubro) eligen presets DISTINTOS', () => {
  const a = IS.pickStyle({ tipo: 'promo', rubro: 'gastronomia', businessName: 'Sushi Go', digest: sushiDigest });
  const b = IS.pickStyle({ tipo: 'promo', rubro: 'gastronomia', businessName: 'La Parrilla de Juan', digest: parrillaDigest });
  assert.ok(a && b, 'ambos picks existen');
  assert.notStrictEqual(a.style.code, b.style.code, `ambos eligieron ${a.style.code}`);
});
ok('el match léxico EXPLICA la elección (anclas del propio digest)', () => {
  const a = IS.pickStyle({ tipo: 'promo', rubro: 'gastronomia', businessName: 'Sushi Go', digest: sushiDigest });
  const b = IS.pickStyle({ tipo: 'promo', rubro: 'gastronomia', businessName: 'La Parrilla de Juan', digest: parrillaDigest });
  assert.strictEqual(a.style.code, '/sushiart');
  assert.ok(a.digestMatch.points >= IS.DIGEST_MATCH_MIN && a.digestMatch.words.includes('sushi'), JSON.stringify(a.digestMatch));
  assert.strictEqual(b.style.code, '/asadofire');
  assert.ok(b.digestMatch.words.includes('asado') && b.digestMatch.words.includes('malbec'), JSON.stringify(b.digestMatch));
  // Y el preset ganador PERTENECE al digest rival en cero: el de sushi
  // no matchea nada del mundo parrilla y viceversa.
  assert.strictEqual(IS.digestStyleMatch(a.style, parrillaDigest).points, 0);
  assert.strictEqual(IS.digestStyleMatch(b.style, sushiDigest).points, 0);
});
ok('sin digest, el pick es el histórico (la ceguera vieja, intacta como fallback)', () => {
  const a = IS.pickStyle({ tipo: 'promo', rubro: 'gastronomia', businessName: 'Sushi Go' });
  const b = IS.pickStyle({ tipo: 'promo', rubro: 'gastronomia', businessName: 'La Parrilla de Juan' });
  assert.strictEqual(a.style.code, b.style.code);
  assert.strictEqual(a.digestMatch.points, 0);
});

console.log('== (b)+(c) el preset nace con la idea y manda en el prompt ==');
// Extracción de las funciones reales de server.js (mismo patrón que
// test-adoption-patterns) con fetch stubbeado: cero gasto de IA.
const srv = fs.readFileSync('server.js', 'utf8');
function extractFn(src, startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  const b = src.indexOf(endNeedle, a);
  assert.ok(a > 0 && b > a, `no se pudo extraer ${startNeedle}`);
  return src.slice(a, b);
}
const asmSeg = (() => {
  const s0 = srv.indexOf('const PROMPT_SCENE_STANDARD');
  const e0 = srv.indexOf("return parts.join('\\n');", s0);
  return srv.slice(s0, srv.indexOf('\n}', e0) + 2);
})();
const briefSeg = extractFn(srv, 'async function expandArtBrief(', '\n// idea puede venir como string');
const factory = new Function('fetch', 'costs', 'CONCEPT_FAMILIES', 'styleFragment', `${asmSeg}\n${briefSeg}\nreturn { assembleImagePrompt, expandArtBrief };`);
let capturedBody = null;
const stubFetch = async (url, opts) => {
  capturedBody = JSON.parse(opts.body);
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({
        sujeto: 'the omakase platter of Sushi Go with nigiri and maki',
        momento: 'the chef placing the last nigiri with tweezers',
        contexto: 'a small sushi bar in Palermo with a wooden counter',
        luz: 'warm pendant light from above',
        composicion: 'close three-quarter shot, platter low in frame',
      }) } }],
      usage: {},
    }),
  };
};
const { expandArtBrief } = factory(stubFetch, { trackUsage() {} }, {}, IS.styleFragment);
const sushiPreset = IS.getStyle('/sushiart');

okAsync('(c) el brief recibe el preset: el mensaje al director nombra el code elegido', async () => {
  capturedBody = null;
  await expandArtBrief({
    headline: 'Omakase de autor', tipo: 'novedad', theme: 'Omakase de los viernes',
    businessName: 'Sushi Go', category: 'gastronomia', paletteHex: ['#1D3557'],
    stylePreset: sushiPreset,
  }, 'sk-test', 'test');
  assert.ok(capturedBody, 'el fetch stub capturó el brief');
  const userMsg = capturedBody.messages[1].content;
  assert.ok(userMsg.includes('/sushiart'), 'el brief no nombra el code del preset');
  assert.ok(/Dirección de estilo elegida/.test(userMsg), 'el brief no declara la dirección elegida');
});

okAsync('(b) clientes: el texto del preset aparece UNA vez, en la posición de dirección de estilo', async () => {
  const prompt = await expandArtBrief({
    headline: 'Omakase de autor', tipo: 'novedad', theme: 'Omakase de los viernes',
    businessName: 'Sushi Go', category: 'gastronomia', paletteHex: ['#1D3557'],
    stylePreset: sushiPreset,
  }, 'sk-test', 'test');
  assert.strictEqual(count(prompt, sushiPreset.prompt), 1, 'el texto del preset no aparece exactamente una vez');
  const iStyle = prompt.indexOf('STYLE DIRECTION');
  const iComp = prompt.indexOf('COMPOSITION & LIGHT:');
  const iPal = prompt.indexOf('exact brand colors');
  const iZone = prompt.indexOf('HEADLINE ZONE');
  const iStd = prompt.indexOf('SCENE STANDARD');
  assert.ok(iComp >= 0 && iStyle > iComp, 'la dirección de estilo no va tras la composición');
  assert.ok(iPal >= 0 && iStyle > iPal, 'la dirección de estilo no va tras la paleta');
  assert.ok(iZone >= 0 && iStyle < iZone, 'la dirección de estilo no va antes de HEADLINE ZONE');
  assert.ok(iStd >= 0 && iStyle < iStd, 'la dirección de estilo quedó como apéndice final');
  assert.ok(prompt.includes('/sushiart'), 'el code del preset no viaja en el prompt (traza para auditar qué preset produjo qué pieza)');
});

okAsync('(b) sin preset, el prompt es el de siempre (cero dirección inyectada)', async () => {
  const prompt = await expandArtBrief({
    headline: 'Omakase de autor', tipo: 'novedad', theme: 'Omakase de los viernes',
    businessName: 'Sushi Go', category: 'gastronomia', paletteHex: ['#1D3557'],
  }, 'sk-test', 'test');
  assert.ok(!prompt.includes('STYLE DIRECTION'), 'sin preset no hay bloque de dirección');
});

okAsync('(b) prueba IA: brief + dirección de arte = el preset UNA sola vez en el prompt final', async () => {
  const prompt = await expandArtBrief({
    headline: 'Omakase de autor', tipo: 'social', theme: 'Omakase de los viernes',
    businessName: 'Sushi Go', category: 'gastronomia', paletteHex: ['#1D3557', '#E63946'],
    stylePreset: sushiPreset,
  }, 'sk-test', 'test');
  const full = prompt + '\n\n' + demoAi.artDirectionFor(sushiPreset);
  assert.strictEqual(count(full, sushiPreset.prompt), 1, 'en la prueba IA el preset se duplicó o se perdió');
  assert.ok(!demoAi.artDirectionFor(sushiPreset).includes('Style signature'), 'la dirección de arte sigue repitiendo la firma');
  // Cableado en el handler: stylePreset entra al brief y el fragmento
  // pegado tras el brief desapareció del código.
  assert.ok(srv.includes('stylePreset: styleObj'), 'el handler de la prueba no pasa stylePreset');
  assert.ok(!srv.includes("prompt += '\\n\\n' + styleFragment(styleObj"), 'el handler sigue pegando el fragmento tras el brief');
});

ok('(b) cableado de clientes: pre-pick en la semana + pick antes del brief, sin apéndice', () => {
  assert.ok(srv.includes('const pk = pickStyle({'), 'generateWeekDrafts no pre-elige el preset');
  assert.ok(srv.includes('style: preStyleCode'), 'el pre-pick no viaja como style a la generación');
  assert.ok(srv.includes('stylePreset: stylePick ? stylePick.style : null'), 'conceptShot no pasa el preset al brief');
  assert.ok(!/\bstyleFrag\b/.test(srv), 'queda una variable styleFrag (apéndice) viva en server.js');
  assert.ok(srv.includes('usedFamilies'), 'no hay memoria de familias en la generación');
});

console.log('== (d) rotación de familia en la semana ==');
ok('5 picks de una semana: 5 códigos y 5 familias distintas', () => {
  const used = [], fams = [], seen = [];
  for (const tipo of ['promo', 'novedad', 'social', 'promo', 'novedad']) {
    const pk = IS.pickStyle({ tipo, rubro: 'gastronomia', businessName: 'La Parrilla de Juan', digest: parrillaDigest, usedThisWeek: used, avoidFamilies: fams });
    assert.ok(pk && pk.style, 'pick vacío');
    assert.ok(!used.includes(pk.style.code), `código repetido: ${pk.style.code}`);
    assert.ok(!fams.includes(pk.family), `familia repetida: ${pk.family} (${pk.style.code})`);
    used.push(pk.style.code);
    if (!fams.includes(pk.family)) fams.push(pk.family);
    seen.push(pk.style.code);
  }
  assert.strictEqual(new Set(seen).size, 5);
  assert.strictEqual(fams.length, 5);
});
ok('sin alternativas de otra familia, el pick NO se bloquea (cae a repetir)', () => {
  const allFams = ['flatlay', 'studio', 'macro', 'levitation', 'cinematic', 'luxury', 'pop', 'lifestyle', 'duo_split', 'typo', 'tech', 'action', 'corporate', 'miniature', 'carousel', 'premium_generic'];
  const pk = IS.pickStyle({ tipo: 'promo', rubro: 'gastronomia', digest: parrillaDigest, avoidFamilies: allFams });
  assert.ok(pk && pk.style, 'con todas las familias evitadas el pick debe existir igual');
});

console.log('== (e) negativos: los filtros duros le ganan al match ==');
ok('preset no-brandSafe con match léxico perfecto NUNCA sale por automático', () => {
  const memeDigest = { business: 'Meme House', productos: [{ nombre: 'Meme viral' }], servicios: [], temas_feed: [] };
  const m = IS.digestStyleMatch(IS.getStyle('/arch-meme'), memeDigest);
  assert.ok(m.points >= IS.DIGEST_MATCH_MIN, `el match debería ser fuerte: ${JSON.stringify(m)}`);
  const pk = IS.pickStyle({ intent: 'promo', rubro: 'gastronomia', digest: memeDigest });
  assert.ok(pk && pk.style.brandSafe === true, `salió ${pk && pk.style.code} (brandSafe=${pk && pk.style.brandSafe})`);
  assert.notStrictEqual(pk.style.code, '/arch-meme');
});
ok('NEVER_STYLES le gana al match: funeraria jamás recibe /neon', () => {
  const funDigest = { business: 'Funeraria Paz', productos: [{ nombre: 'Cartel neon' }], servicios: [{ nombre: 'Luces de neon' }], temas_feed: [] };
  assert.ok(IS.digestStyleMatch(IS.getStyle('/neon'), funDigest).words.includes('neon'), 'el match con /neon existe');
  assert.ok(IS.forbiddenStyles({ rubro: 'funeraria' }).some((f) => f.code === '/neon'), '/neon no está prohibido para funeraria');
  const pk = IS.pickStyle({ intent: 'evento', rubro: 'funeraria', businessName: 'Funeraria Paz', digest: funDigest });
  assert.ok(pk && pk.style.code !== '/neon', `salió ${pk && pk.style.code}`);
});

console.log('== (f) los arquetipos del Style Lock, en el catálogo ==');
const ARCH = {
  '/arch-mascot3d': false, '/arch-foodmascot': false, '/arch-beigeminimal': true,
  '/arch-meme': false, '/arch-gymdark': true, '/arch-founder': true,
  '/arch-pastelflatlay': true, '/arch-ugcraw': true, '/arch-whitepackshot': true,
  '/arch-infographic': true, '/arch-warmfood': true, '/arch-fashioneditorial': true,
};
ok('los 12 arquetipos existen con su code y su brandSafe diseñado', () => {
  assert.strictEqual(IS.STYLES.length, 1267, `el catálogo debería tener 1267 presets, tiene ${IS.STYLES.length}`);
  for (const [code, safe] of Object.entries(ARCH)) {
    const s = IS.getStyle(code);
    assert.ok(s, `falta el arquetipo ${code}`);
    assert.strictEqual(s.brandSafe, safe, `${code}: brandSafe=${s.brandSafe}, esperado ${safe}`);
    assert.ok(s.prompt && s.prompt.length > 40 && Array.isArray(s.rubros), `${code} mal formado`);
    assert.ok(!/OFERTÓN|3 ERRORES CON TU DINERO/.test(s.prompt), `${code} conserva texto horneado del fixture`);
  }
});
ok('/arch-warmfood es ELEGIDO por pickStyle para el digest de parrilla', () => {
  const pk = IS.pickStyle({ intent: 'comida', rubro: 'gastronomia', businessName: 'La Parrilla de Juan', digest: parrillaDigest, usedThisWeek: ['/asadofire'], avoidFamilies: ['cinematic'] });
  assert.strictEqual(pk.style.code, '/arch-warmfood', `salió ${pk.style.code}`);
  assert.ok(IS.digestStyleMatch(IS.getStyle('/arch-warmfood'), parrillaDigest).words.includes('parrilla'));
});
ok('/arch-gymdark es elegible en su rubro (fitness) vía favoritos del cliente', () => {
  const pk = IS.pickStyle({ intent: 'producto', rubro: 'fitness', businessName: 'Gym X', favorites: ['/arch-gymdark'] });
  assert.strictEqual(pk.style.code, '/arch-gymdark', `salió ${pk && pk.style.code}`);
});
ok('el robot azul genérico NO es preset de mascota de cliente: /arch-mascot3d queda fuera del automático', () => {
  const pk = IS.pickStyle({ intent: 'producto', rubro: 'cafeteria', digest: { business: 'Café Sol', productos: [{ nombre: 'Mascota 3D del negocio' }], servicios: [], temas_feed: [] } });
  assert.ok(pk && pk.style.code !== '/arch-mascot3d' && pk.style.brandSafe === true, `salió ${pk && pk.style.code}`);
});

console.log('== (g) prueba sin IA: el preset dice más (treatmentForStyle) ==');
ok('grade por temperatura/luz del texto del preset', () => {
  assert.strictEqual(demo.treatmentForStyle({ code: '/x', prompt: 'Ember firelight and terracotta tones' }).grade, 'warm');
  assert.strictEqual(demo.treatmentForStyle({ code: '/x', prompt: 'Neon electric signage at night' }).grade, 'vivid');
  assert.strictEqual(demo.treatmentForStyle({ code: '/x', prompt: 'Airy delicate milky light' }).grade, 'soft');
  assert.strictEqual(demo.treatmentForStyle({ code: '/x', prompt: 'Frosty mint freshness' }).grade, 'cool');
});
ok('crop tight por encuadre que llena el cuadro', () => {
  assert.strictEqual(demo.treatmentForStyle({ code: '/x', prompt: 'The hero fills the frame completely' }).crop, 'tight');
  assert.strictEqual(demo.treatmentForStyle({ code: '/x', prompt: 'Wide establishing shot of the shop' }).crop, 'normal');
});
ok('lo histórico no cambia: before/after → duo, quote → centro, determinístico', () => {
  const ba = IS.getStyle('/ugcbeforeafter');
  assert.strictEqual(demo.treatmentForStyle(ba).skeleton, 'duo');
  const a = demo.treatmentForStyle(IS.getStyle('/cosmetic'));
  const b = demo.treatmentForStyle(IS.getStyle('/cosmetic'));
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

(async () => {
  await Promise.all(pending);
  console.log(`\n${fail ? '✗' : '✅'} test-prompt-catalog-wiring: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
