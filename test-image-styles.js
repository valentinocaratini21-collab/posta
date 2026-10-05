// Harness de image-styles.js (NO va al zip). node test-image-styles.js
'use strict';
const { STYLES, getStyle, listStyles, INTENT_STYLES, INTENT_PHRASE, detectIntent, pickStyle, styleFragment } = require('./image-styles');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, extra || ''); }
}

// 1. Presets
t('1227 presets (179 + 1001 por rubro + 23 vectorayush + 9 sifuyik + 15 UGC)', STYLES.length === 1227, STYLES.length);
t('todos con campos', STYLES.every(s => s.code && s.name && s.prompt && Array.isArray(s.rubros) && typeof s.brandSafe === 'boolean'));
const safe = ['/food', '/flatlay', '/luxury', '/product', '/macro', '/lifestyle', '/cozy'];
t('brandSafe core', safe.every(c => getStyle(c) && getStyle(c).brandSafe === true));
const fantasyAll = ['/legoify', '/clay', '/miniatureworld', '/isometric', '/papercraft',
  '/oilpainting', '/animeart', '/pixelart', '/collageart', '/graffitiart', '/vaporwaveart',
  '/cyberpunkart', '/pencilsketch', '/inkwash', '/mosaicart', '/stainedglass', '/embroidery',
  '/origamiart', '/charcoalart', '/muralart', '/lineart', '/screenprint', '/risograph',
  '/ukiyoe', '/lowpolyart',
  '/toydoll', '/actionfigure', '/dollhouse', '/crystal', '/glass', '/iceversion',
  '/goldform', '/candyversion', '/toyversion', '/blueprint', '/wireframe', '/cutaway',
  '/aging', '/explodedview', '/tinyhumans', '/timetravel'];
t('fantasía no brandSafe (41)', fantasyAll.every(c => getStyle(c) && getStyle(c).brandSafe === false), fantasyAll.filter(c => !getStyle(c) || getStyle(c).brandSafe !== false));
t('getStyle case-insensitive y sin slash', getStyle('/LEGOIFY') && getStyle('/LEGOIFY').code === '/legoify' && getStyle('food').code === '/food');
t('getStyle inválido → null', getStyle('/noexiste') === null);
t('listStyles 1227', listStyles().length === 1227);

// 2. Fragmento: contiene estilo + paleta, y la supremacía de paleta
const frag = styleFragment('/food', ['#E63946', '#F4A261']);
t('fragmento tiene prompt del estilo', frag.includes('Appetizing commercial food photography'));
t('fragmento tiene los hex', frag.includes('#E63946') && frag.includes('#F4A261'));
t('fragmento supremacía de paleta', /NEVER change.*brand colors/i.test(frag));
t('fragmento inválido → vacío', styleFragment('/nope', ['#fff']) === '');

// 3. Prompt final simulado: fragmento DESPUÉS del style lock visual
const visualBlock = 'LÍNEA VISUAL OBLIGATORIA: paleta cálida, plano cenital';
const finalPrompt = `base del prompt\n\n${visualBlock}\n\n${frag}`;
t('fragmento después del style lock', finalPrompt.indexOf(frag) > finalPrompt.indexOf(visualBlock));
t('prompt final tiene paleta + estilo', finalPrompt.includes('#E63946') && finalPrompt.includes('/food'));

// 4. 10 intenciones × 3 rubros → top-3 del mapa, razón menciona intención
const intents = [
  ['promo', 'promo', '20% OFF en toda la tienda, solo hoy', 'indumentaria'],
  ['producto', 'novedad', 'nuestro sérum facial en stock, nuevo ingreso', 'cosmetica'],
  ['comida', 'promo', 'plato del día: milanesa a la napolitana', 'gastronomia'],
  ['detras', 'detras', 'conocé a nuestro equipo, así trabajamos día a día', 'cafeteria'],
  ['testimonio', 'social', 'lo que dijo una clienta de su cambio de look', 'peluqueria'],
  ['evento', 'novedad', 'este sábado fiesta en vivo en el bar', 'bar'],
  ['frase', 'tip', 'frase motivacional para arrancar la semana', 'indumentaria'],
  ['lanzamiento', 'novedad', 'lanzamiento de la nueva colección invierno', 'indumentaria'],
  ['tips', 'tip', 'tip: cómo cuidar tu planta, guía paso a paso', 'vivero'],
  ['viral', 'social', 'un meme divertido sobre los lunes', 'gimnasio'],
];
const rubros3 = ['gastronomia', 'indumentaria', 'cosmetica'];
for (const [intent, tipo, theme, rubro0] of intents) {
  for (const rubro of rubros3) {
    const p = pickStyle({ tipo, theme, angle: '', rubro });
    const top3 = (INTENT_STYLES[intent] || []).slice(0, 3);
    const isRubro = p && (p.style.rubros || []).some(x => rubro.includes(x) || x.includes(rubro));
    t(`pick ${intent}/${rubro} en top-3 o del rubro`, p && (top3.includes(p.style.code) || isRubro), p && p.style.code);
    t(`pick ${intent}/${rubro} razón menciona intención`, p && p.reason.includes(INTENT_PHRASE[intent].split(' ')[0].replace(/[()]/g, '').slice(0, 6)), p && p.reason);
    t(`pick ${intent}/${rubro} no fantasía salvo viral`, p && (intent === 'viral' || p.style.brandSafe), p && p.style.code);
  }
}

// 5. No repite en la semana
const first = pickStyle({ tipo: 'promo', theme: 'plato del día', rubro: 'gastronomia', usedThisWeek: [] });
const second = pickStyle({ tipo: 'promo', theme: 'plato del día', rubro: 'gastronomia', usedThisWeek: [first.style.code] });
t('no repite estilo en la semana', second.style.code !== first.style.code, `${first.style.code} vs ${second.style.code}`);

// 6. Fallback: intención desconocida → brandSafe
const fb = pickStyle({ tipo: 'zzz', theme: 'algo raro', rubro: 'kiosco' });
t('fallback brandSafe', fb && fb.style.brandSafe === true, fb && fb.style.code);

// 7. detectIntent por keywords
t('detect comida', detectIntent({ tipo: 'promo', theme: 'plato del día: pizza' }) === 'comida');
t('detect viral', detectIntent({ tipo: 'tip', theme: 'meme divertido' }) === 'viral');
t('detect tipo fallback', detectIntent({ tipo: 'detras', theme: '' }) === 'detras');
t('detect default producto', detectIntent({ tipo: '', theme: '' }) === 'producto');

// 8. Presets nuevos (Graphical Guru)
const nuevos = ['/productad', '/billboard', '/360view', '/anatomy', '/aerialview'];
t('nuevos presets existen', nuevos.every(c => getStyle(c)), nuevos);
t('nuevos presets con prompt no vacío', nuevos.every(c => getStyle(c).prompt && getStyle(c).prompt.length > 40), nuevos);
t('nuevos presets brandSafe', nuevos.every(c => getStyle(c).brandSafe === true), nuevos);
t('pick anuncio → /billboard', (() => { const p = pickStyle({ theme: 'gran anuncio en vía pública' }); return p && p.style.code === '/billboard'; })());
t('pick educativo → /anatomy', (() => { const p = pickStyle({ theme: 'cómo funciona cada parte de nuestra máquina' }); return p && p.style.code === '/anatomy'; })());
t('pick local_venue → /aerialview', (() => { const p = pickStyle({ theme: 'nuestra sucursal en palermo, esta es la dirección' }); return p && p.style.code === '/aerialview'; })());
t('pick lanzamiento puede → /productad', (() => {
  const p = pickStyle({ theme: 'lanzamiento de la nueva colección invierno', usedThisWeek: ['/luxury', '/gold', '/neon', '/cinematic', '/product'] });
  return p && p.style.code === '/productad';
})());
t('nuevos en mapa de intenciones', ['/productad', '/billboard'].every(c => INTENT_STYLES.promo.includes(c)) &&
  ['/productad', '/billboard'].every(c => INTENT_STYLES.lanzamiento.includes(c)) &&
  INTENT_STYLES.anuncio[0] === '/billboard' && INTENT_STYLES.educativo[0] === '/anatomy' &&
  INTENT_STYLES.local_venue[0] === '/aerialview');
t('frases de nuevas intenciones', INTENT_PHRASE.anuncio && INTENT_PHRASE.educativo && INTENT_PHRASE.local_venue);

// 9. 150 presets nuevos: unicidad y calidad de datos
const codes = STYLES.map(s => s.code);
t('codes únicos (1227)', new Set(codes).size === 1227, codes.length - new Set(codes).size);
const normPrompt = p => p.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const prompts = STYLES.map(s => normPrompt(s.prompt));
t('prompts distintos entre sí (1227)', new Set(prompts).size === 1227, prompts.length - new Set(prompts).size);
t('prompts con largo razonable (15-60 palabras)', STYLES.every(s => { const w = s.prompt.split(/\s+/).length; return w >= 15 && w <= 60; }),
  STYLES.filter(s => { const w = s.prompt.split(/\s+/).length; return w < 15 || w > 60; }).map(s => s.code));
t('toda intención con ≥3 estilos válidos', Object.entries(INTENT_STYLES).every(([k, arr]) => arr.length >= 3 && arr.every(c => getStyle(c))),
  Object.entries(INTENT_STYLES).filter(([k, arr]) => arr.length < 3 || !arr.every(c => getStyle(c))).map(([k]) => k));
t('INTENT_PHRASE cubre todas las intenciones', Object.keys(INTENT_STYLES).every(k => INTENT_PHRASE[k]),
  Object.keys(INTENT_STYLES).filter(k => !INTENT_PHRASE[k]));
t('ninguna intención no-viral rankea fantasía', Object.keys(INTENT_STYLES).filter(k => k !== 'viral').every(k => INTENT_STYLES[k].every(c => getStyle(c).brandSafe === true)),
  Object.keys(INTENT_STYLES).filter(k => k !== 'viral' && !INTENT_STYLES[k].every(c => getStyle(c).brandSafe === true)));
const catSamples = [
  ['/breakfast', '/asadofire', '/chefaction'],        // comida
  ['/heroshot', '/levitate', '/ghostmannequin'],      // producto
  ['/studiportrait', '/teamwork', '/beautyclose'],    // personas
  ['/storefront', '/kitchenfire', '/nightglow'],      // locales
  ['/oilpainting', '/ukiyoe', '/risograph'],          // arte
  ['/actionfigure', '/tinyhumans', '/timetravel'],    // viral
  ['/movieposter', '/couponburst', '/neonsign'],      // publicidad
  ['/xmaswarm', '/blackfriday', '/carnivalcolor'],    // temporada
  ['/bluehour', '/filmgrain', '/doubleexposure'],     // moods
];
t('muestreo de las 9 categorías nuevas', catSamples.every(g => g.every(c => getStyle(c) && getStyle(c).prompt.length > 40)));

// 10. Nuevas intenciones: temporada y retrato
t('pick temporada → /xmaswarm', (() => { const p = pickStyle({ theme: 'llegó la navidad a nuestro local' }); return p && p.style.code === '/xmaswarm'; })());
t('pick retrato → /studiportrait', (() => { const p = pickStyle({ theme: 'retrato de la fundadora, quiénes somos' }); return p && p.style.code === '/studiportrait'; })());
t('pick temporada es brandSafe', (() => { const p = pickStyle({ theme: 'promo de halloween este finde' }); return p && p.style.brandSafe === true; })());
t('detect no roba intenciones existentes', detectIntent({ tipo: 'novedad', theme: 'lanzamiento de la nueva colección invierno' }) === 'lanzamiento'
  && detectIntent({ tipo: 'detras', theme: 'conocé a nuestro equipo, así trabajamos día a día' }) === 'detras'
  && detectIntent({ tipo: 'tip', theme: 'cómo funciona cada parte de nuestra máquina' }) === 'educativo');

// 11. Presets por rubro: cobertura ≥30 y pickStyle prefiere el rubro
const RUBROS25 = ['moda','gastronomia','belleza','fitness','mascotas','salud','hogar','inmobiliaria','autos','educacion','turismo','eventos','tecnologia','deco','joyeria','fotografia','profesionales','flores','bar','cafeteria','barberia','servicios','viajes','arte','otro'];
const rubroHit = (s, r) => (s.rubros || []).some(x => r.includes(x) || x.includes(r));
for (const r of RUBROS25) {
  const n = STYLES.filter(s => rubroHit(s, r)).length;
  t(`rubro ${r} ≥30 presets`, n >= 30, n);
}
const rubroThemes = [
  ['gastronomia', 'plato del día: sorrentinos caseros'],
  ['belleza', 'nuevo servicio de balayage, reservá tu turno'],
  ['autos', 'service completo de frenos'],
  ['inmobiliaria', 'nueva casa en venta en el barrio'],
  ['fitness', 'clase de funcional este sábado'],
  ['mascotas', 'peluquería canina con turno'],
  ['moda', 'nueva colección invierno en el local'],
  ['eventos', 'salón armado para casamientos'],
  ['tecnologia', 'reparamos tu celular en el día'],
  ['flores', 'ramo especial para san valentín'],
  ['bar', 'happy hour 2x1 en tragos'],
  ['cafeteria', 'merienda con medialunas caseras'],
  ['deco', 'nuevo sillón nórdico en vidriera'],
  ['salud', 'blanqueamiento dental, primera consulta'],
  ['educacion', 'nuevo curso de pastelería presencial'],
  ['turismo', 'escapada al sur este finde largo'],
  ['joyeria', 'anillos de compromiso, nuevos diseños'],
  ['fotografia', 'sesión de 15, reservá tu fecha'],
  ['profesionales', 'asesoramiento contable para pymes'],
  ['hogar', 'pintamos tu living en 48 horas'],
  ['servicios', 'electricista matriculado a domicilio'],
  ['barberia', 'fade quirúrgico, sacá tu turno'],
  ['viajes', 'paquete al caribe con vuelo incluido'],
  ['arte', 'nueva obra en la galería'],
  ['otro', 'abrimos de lunes a sábado'],
];
let rubroTop3 = 0;
for (const [rubro, theme] of rubroThemes) {
  const seen = [];
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const p = pickStyle({ theme, rubro, usedThisWeek: seen });
    if (!p) break;
    picks.push(p.style.code); seen.push(p.style.code);
  }
  const hit = picks.some(c => { const s = getStyle(c); return s && rubroHit(s, rubro); });
  if (hit) rubroTop3++;
  else console.log('FAIL: rubro top-3', rubro, '->', picks.join(','));
}
t('pickStyle devuelve preset del rubro en top-3 (25/25)', rubroTop3 === rubroThemes.length, rubroTop3 + '/' + rubroThemes.length);

// 12. Performance del require con 1227 presets
const t0 = Date.now();
delete require.cache[require.resolve('./image-styles')];
delete require.cache[require.resolve('./image-styles-data')];
Object.keys(require.cache).filter(k => k.includes('image-styles-rubros')).forEach(k => delete require.cache[k]);
require('./image-styles');
const reqMs = Date.now() - t0;
t('require image-styles < 500ms', reqMs < 500, reqMs + 'ms');
console.log('require ms:', reqMs);

// 13. Presets @vectorayush (23): tech / producto / diseño / social / cinematic
const vayush = ['/techad','/futuristic','/minimal','/workspace','/gaming','/cyberpunk',
  '/mockup','/floating','/splash','/premium',
  '/branding','/logo','/poster','/magazine',
  '/reelcover','/thumbnail','/ad','/infographic',
  '/noir','/action','/night','/drone','/filmstill'];
t('v@ los 23 existen', vayush.every(c => getStyle(c)), vayush.filter(c => !getStyle(c)));
t('v@ prompts 15-60 palabras y no vacíos', vayush.every(c => { const w = getStyle(c).prompt.split(/\s+/).length; return w >= 15 && w <= 60; }),
  vayush.filter(c => { const w = getStyle(c).prompt.split(/\s+/).length; return w < 15 || w > 60; }));
t('v@ brandSafe honesto (/logo false, resto true)',
  getStyle('/logo').brandSafe === false && vayush.filter(c => c !== '/logo').every(c => getStyle(c).brandSafe === true),
  vayush.filter(c => (c === '/logo') === getStyle(c).brandSafe));
t('v@ /logo no rankea en ninguna intención (solo manual)',
  Object.keys(INTENT_STYLES).every(k => !INTENT_STYLES[k].includes('/logo')),
  Object.keys(INTENT_STYLES).filter(k => INTENT_STYLES[k].includes('/logo')));
t('v@ en mapa de intenciones',
  ['/techad','/futuristic','/minimal','/workspace','/mockup','/floating','/splash'].every(c => INTENT_STYLES.producto.includes(c)) &&
  ['/techad','/futuristic','/premium'].every(c => INTENT_STYLES.lanzamiento.includes(c)) &&
  ['/premium','/ad'].every(c => INTENT_STYLES.promo.includes(c)) &&
  ['/poster','/action','/night','/gaming','/cyberpunk','/noir'].every(c => INTENT_STYLES.evento.includes(c)) &&
  ['/poster','/ad','/magazine','/branding','/reelcover','/thumbnail'].every(c => INTENT_STYLES.anuncio.includes(c)) &&
  INTENT_STYLES.educativo.includes('/infographic') && INTENT_STYLES.tips.includes('/infographic') &&
  INTENT_STYLES.local_venue.includes('/drone') && INTENT_STYLES.detras.includes('/filmstill') &&
  INTENT_STYLES.detras.includes('/workspace'));
t('v@ pick tips+educacion → /infographic', (() => {
  const p = pickStyle({ theme: 'tutorial con infografía paso a paso', rubro: 'educacion' });
  return p && p.style.code === '/infographic';
})());
t('v@ pick producto+tecnologia → /techad', (() => {
  const p = pickStyle({ theme: 'nuevo celular en stock, producto', rubro: 'tecnologia',
    usedThisWeek: ['/product','/luxury','/macro','/packaging','/flatlay','/productad','/360view','/anatomy','/heroshot','/levitate','/unboxing','/ingredientflat','/mockup','/floating','/splash'] });
  return p && p.style.code === '/techad';
})());
t('v@ pick local_venue+turismo → /drone', (() => {
  const p = pickStyle({ theme: 'vista aérea de nuestro hotel, esta es la dirección', rubro: 'turismo',
    usedThisWeek: ['/aerialview','/goldenhour','/cozy','/cinematic','/storefront','/droneexterior','/nightglow'] });
  return p && p.style.code === '/drone';
})());
t('v@ pick evento+bar → /noir', (() => {
  const p = pickStyle({ theme: 'fiesta en vivo este sábado', rubro: 'bar',
    usedThisWeek: ['/cinematic','/neon','/goldenhour','/gold','/aerialview','/eventflyer','/barmidnight','/rooftopterrace','/poster','/action','/night','/gaming','/cyberpunk'] });
  return p && p.style.code === '/noir';
})());
t('v@ pick evento+eventos → /poster', (() => {
  const p = pickStyle({ theme: 'fiesta en vivo este sábado', rubro: 'eventos',
    usedThisWeek: ['/cinematic','/neon','/goldenhour','/gold','/aerialview','/eventflyer','/barmidnight','/rooftopterrace'] });
  return p && p.style.code === '/poster';
})());

// 11. Presets @sifuyik (9; /blueprint3d descartado: duplica a /wireframe)
const sif = ['/packshot', '/timelapse', '/sizecompare', '/materialswap', '/popup', '/mapview', '/crackedopen', '/assemblyguide', '/weatherchange'];
t('sif presets existen', sif.every(c => getStyle(c)), sif);
t('sif presets prompt válido (15-60 palabras)', sif.every(c => { const s = getStyle(c); const w = s.prompt.split(/\s+/).length; return w >= 15 && w <= 60; }), sif);
t('sif brandSafe honestos', ['/packshot', '/timelapse', '/materialswap', '/mapview', '/assemblyguide', '/weatherchange'].every(c => getStyle(c).brandSafe === true) &&
  ['/sizecompare', '/popup', '/crackedopen'].every(c => getStyle(c).brandSafe === false), sif);
t('sif en mapas de intención', INTENT_STYLES.producto.includes('/packshot') && INTENT_STYLES.producto.includes('/assemblyguide') &&
  INTENT_STYLES.educativo.includes('/timelapse') && INTENT_STYLES.educativo.includes('/assemblyguide') &&
  INTENT_STYLES.tips.includes('/timelapse') && INTENT_STYLES.tips.includes('/assemblyguide') &&
  INTENT_STYLES.viral.includes('/sizecompare') && INTENT_STYLES.viral.includes('/popup') && INTENT_STYLES.viral.includes('/crackedopen') &&
  INTENT_STYLES.local_venue.includes('/mapview') && INTENT_STYLES.local_venue.includes('/weatherchange') &&
  INTENT_STYLES.temporada.includes('/weatherchange') && INTENT_STYLES.evento.includes('/mapview'));
t('/blueprint3d NO existe (duplica a /wireframe)', !getStyle('/blueprint3d') && !!getStyle('/wireframe'));
t('sif pick local_venue → /mapview', (() => {
  const p = pickStyle({ theme: 'mapa con la ruta a nuestra sucursal, esta es la dirección',
    usedThisWeek: ['/aerialview', '/goldenhour', '/cozy', '/cinematic', '/storefront', '/droneexterior', '/nightglow', '/drone'] });
  return p && p.style.code === '/mapview';
})());
t('sif pick tips → /assemblyguide', (() => {
  const p = pickStyle({ theme: 'guía de armado paso a paso de tu mueble',
    usedThisWeek: ['/flatlay', '/quote', '/product', '/anatomy', '/beforeafter', '/knolling', '/infographic', '/timelapse'] });
  return p && p.style.code === '/assemblyguide';
})());
t('sif pick educativo → /timelapse', (() => {
  const p = pickStyle({ theme: 'las etapas de evolución de nuestro cultivo',
    usedThisWeek: ['/anatomy', '/360view', '/flatlay', '/quote', '/knolling', '/beforeafter', '/infographic'] });
  return p && p.style.code === '/timelapse';
})());
t('sif pick viral → /sizecompare', (() => {
  const p = pickStyle({ theme: 'meme divertido viral para compartir',
    usedThisWeek: ['/legoify', '/miniatureworld', '/clay', '/popart', '/isometric', '/papercraft', '/actionfigure', '/dollhouse', '/crystal', '/candyversion', '/tinyhumans', '/timetravel', '/toydoll'] });
  return p && p.style.code === '/sizecompare';
})());
t('sif pick temporada → /weatherchange', (() => {
  const p = pickStyle({ theme: 'nuestro local en invierno con nieve',
    usedThisWeek: ['/xmaswarm', '/blackfriday', '/summerheat', '/halloweenspook', '/valentinered', '/newyearglow', '/parentsday'] });
  return p && p.style.code === '/weatherchange';
})());

console.log(`\nimage-styles: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);