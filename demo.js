// Demo pública self-service — Posta
// Genera 2 posteos + 1 video de muestra sin registro: imágenes 1080×1350
// renderizadas con PIL (Python3) en el lenguaje premium de la marca (foto
// full-bleed + fundido blanco + barra celeste #2793C8 + titular navy + pill
// amarillo); el 3er diseño se anima con ffmpeg (Ken Burns) a MP4 1080×1350
// para Reels. Captions con copy que vende + hashtags. Sin registro ni WhatsApp.

const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const db = require('./db');
const captions = require('./demo-captions');

const DEMO_SCRIPT = path.join(__dirname, 'demo_render.py');
const DEMO_VIDEO_SCRIPT = path.join(__dirname, 'demo_video.py');
const FONTS_DIR = path.join(__dirname, 'assets', 'fonts');
const STOCK_DIR = path.join(__dirname, 'public', 'demo-stock');

// Auto-extrae public/demo-stock.zip (librería de 59 fotos) si faltan fotos.
// Permite subir la librería como un solo archivo en vez de 59 sueltos.
(function ensureStock() {
  try {
    const zip = path.join(__dirname, 'public', 'demo-stock.zip');
    if (!fs.existsSync(zip)) return;
    let have = 0;
    try { have = fs.readdirSync(STOCK_DIR).filter((f) => f.endsWith('.webp')).length; } catch (_) {}
    if (have >= 59) return;
    fs.mkdirSync(STOCK_DIR, { recursive: true });
    execFileSync('python3', ['-c',
      'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
      zip, STOCK_DIR], { stdio: 'ignore', timeout: 60000 });
  } catch (_) {}
})();

const DEMO_LIMIT_PER_DAY = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// 20 rubros (key → etiqueta del select en demo.html)
const CATEGORIES = [
  'moda', 'gastronomia', 'belleza', 'fitness', 'mascotas', 'salud', 'hogar',
  'inmobiliaria', 'autos', 'educacion', 'turismo', 'eventos', 'tecnologia',
  'deco', 'joyeria', 'fotografia', 'profesionales', 'flores', 'bar',
  'cafeteria', 'barberia', 'servicios', 'viajes', 'arte', 'otro',
];
const CATEGORY_LABELS = {
  moda: 'Moda / Tienda de ropa',
  gastronomia: 'Gastronomía / Restaurante',
  belleza: 'Belleza / Estética',
  barberia: 'Barbería / Peluquería',
  cafeteria: 'Cafetería',
  fitness: 'Fitness / Gimnasio',
  mascotas: 'Mascotas / Veterinaria',
  salud: 'Salud / Odontología',
  hogar: 'Servicios para el hogar',
  inmobiliaria: 'Inmobiliaria',
  autos: 'Autos / Taller',
  educacion: 'Educación / Cursos',
  turismo: 'Turismo / Hotelería',
  viajes: 'Agencia de viajes',
  eventos: 'Eventos / Fiestas',
  tecnologia: 'Tecnología / Celulares',
  deco: 'Muebles / Decoración',
  joyeria: 'Joyería / Accesorios',
  fotografia: 'Fotografía',
  arte: 'Arte / Diseño',
  profesionales: 'Servicios profesionales',
  servicios: 'Servicios',
  flores: 'Florería / Vivero',
  bar: 'Bar / Cervecería',
  otro: 'Otro',
};
const COUNTRIES = ['AR', 'UY'];

// Familia fotográfica por rubro (8 fotos high-key en public/demo-stock/).
// 65 fotos stock en public/demo-stock/: 10 familias ({fam}.webp original +
// {fam}-1..N.webp). Cada rubro tiene un pool de ~10 fotos creibles; cada demo
// usa 3 fotos distintas elegidas al azar del pool.
function fam(f, n) { const a = [f]; for (let i = 1; i <= n; i++) a.push(f + '-' + i); return a; }
const FASHION = fam('fashion', 6), FOOD = fam('food', 6), BEAUTY = fam('beauty', 6),
      FITNESS = fam('fitness', 5), PETS = fam('pets', 5), HOME = fam('home', 6),
      LIFE = fam('lifestyle', 6), BAR = fam('bar', 5), FLORES = fam('flores', 5);
// OJO: office-3 y office-5 son fotos de un consultorio DENTAL (mal etiquetadas
// como "oficina"): solo las usa el rubro salud. El resto de los rubros usa
// la oficina genérica, para que un dentista nunca aparezca en otro negocio.
const OFFICE = ['office', 'office-1', 'office-2', 'office-4'],
      DENTAL = ['office-3', 'office-5'],
      TECH = fam('tech', 3);

// Pool curado solo para cafés: si el nombre del negocio suena a café,
// usamos únicamente fotos creíbles de café (nada de cerveza, ensaladas
// ni lifestyle genérico). Un café con foto de cerveza rompe la magia.
const CAFE_POOL = ['food', 'food-2', 'food-4', 'lifestyle', 'lifestyle-1', 'food-1'];
const CAFE_RE = /caf[eé]|coffee|cafeter[ií]a|barista|tostadur[ií]a|espresso|cappuccino|latte|pasteler[ií]a|panader[ií]a|brunch|medialuna|churro|desayuno|merienda/i;
function isCafeBusiness(business) { return CAFE_RE.test(String(business || '')); }

const CATEGORY_PHOTOS = {
  moda: [...FASHION, ...LIFE.slice(0, 2), ...BEAUTY.slice(0, 2)],
  joyeria: [...FASHION.slice(0, 4), 'fashion-5', ...BEAUTY, ...LIFE.slice(0, 2)],
  gastronomia: [...FOOD, ...LIFE.slice(0, 2)],
  bar: [...BAR, ...FOOD.slice(0, 3), ...LIFE.slice(0, 2)],
  belleza: [...BEAUTY, 'beauty-7', 'beauty-8', 'beauty-9', 'beauty-10', 'beauty-11', 'beauty-12', 'beauty-13', ...FASHION.slice(0, 2), ...LIFE.slice(0, 2)],
  fitness: [...FITNESS, ...LIFE.slice(0, 3), ...HOME.slice(0, 2)],
  mascotas: [...PETS, ...HOME.slice(0, 3), ...LIFE.slice(0, 2)],
  hogar: [...HOME, ...LIFE.slice(0, 2), ...OFFICE.slice(0, 2)],
  deco: [...HOME, ...LIFE.slice(0, 2), ...OFFICE.slice(0, 2)],
  flores: [...FLORES],
  inmobiliaria: [...HOME.slice(0, 5), ...OFFICE.slice(0, 3), ...LIFE.slice(0, 2)],
  salud: [...DENTAL, ...OFFICE.slice(0, 2), ...BEAUTY.slice(0, 3), ...LIFE.slice(0, 3)],
  profesionales: [...OFFICE, ...HOME.slice(0, 2), ...LIFE.slice(0, 3)],
  educacion: [...OFFICE, ...LIFE.slice(0, 3), ...HOME.slice(0, 2)],
  tecnologia: [...TECH, ...OFFICE.slice(0, 2)],
  turismo: [...LIFE, ...BAR.slice(0, 2), ...FOOD.slice(0, 2)],
  eventos: [...BAR, ...LIFE.slice(0, 5), ...FOOD.slice(0, 2)],
  fotografia: [...LIFE.slice(0, 5), ...FASHION.slice(0, 4), ...OFFICE.slice(0, 2)],
  autos: [...OFFICE.slice(0, 4), ...LIFE.slice(0, 5), 'lifestyle-6', ...HOME.slice(0, 2)],
  cafeteria: [...FOOD.slice(0, 5), ...LIFE.slice(0, 4), ...BAR.slice(0, 2)],
  barberia: [...BEAUTY.slice(0, 5), ...FASHION.slice(0, 5), ...LIFE.slice(0, 2)],
  servicios: [...OFFICE.slice(0, 4), ...HOME.slice(0, 5), ...LIFE.slice(0, 2)],
  viajes: [...LIFE, ...BAR.slice(0, 3), ...FOOD.slice(0, 2)],
  arte: [...FASHION.slice(0, 4), 'fashion-5', ...BEAUTY.slice(0, 4), 'beauty-5', ...LIFE.slice(0, 3)],
  otro: [...LIFE.slice(0, 5), ...OFFICE.slice(0, 3), ...HOME.slice(0, 2)],
};

function stockPhotosN(category, n, business) {
  // Los cafés tienen pool propio: solo fotos que un café publicaría.
  const pool = (category === 'gastronomia' && isCafeBusiness(business))
    ? CAFE_POOL.slice()
    : (CATEGORY_PHOTOS[category] || CATEGORY_PHOTOS.otro).slice();
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).map((fam) => {
    const p = path.join(STOCK_DIR, fam + '.webp');
    if (!fs.existsSync(p)) throw new Error('Foto de muestra no disponible');
    return p;
  });
}

function stockPhotos3(category, business) {
  return stockPhotosN(category, 3, business);
}

// ---------- Motor de la prueba v182: estilos reales + fotos con match ----------
// DEMO_ENGINE_V versiona TODO lo que la prueba cachea (trial_cache del
// servidor e IndexedDB del navegador): si el motor cambia, ninguna semana
// vieja se sirve ni se importa. Sincronizado con TRIAL_ENGINE_V en
// public/prueba.html.
const DEMO_ENGINE_V = 17;

// Tags de las fotos de la biblioteca demo (verificados A OJO sobre el
// archivo real, 2026-10-17 — la familia "beauty" mezclaba barbería
// masculina, peluquería, makeup, skincare y uñas bajo un mismo nombre).
// `temas`: lo que la foto MUESTRA de forma específica. Una foto sin entrada
// acá es "desconocida": solo se usa como último recurso genérico.
const PHOTO_TAGS = {
  'beauty':   { temas: ['barberia', 'pelo'] },        // barbero cortando a un hombre
  'beauty-1': { temas: ['barberia', 'local'] },       // interior de barbería (poste de barbero)
  'beauty-2': { temas: ['pelo', 'local'] },           // interior de peluquería (bachas)
  'beauty-3': { temas: ['makeup'] },                  // brochas de maquillaje (flat lay)
  'beauty-4': { temas: ['skincare', 'cosmetica'] },  // crema cosmética sobre mármol
  'beauty-5': { temas: ['makeup', 'rostro'] },        // retrato femenino con makeup completo
  'beauty-6': { temas: ['unas'] },                    // manos con esmaltado rojo
  'beauty-7': { temas: ['pelo'] },                    // peluquero secando el pelo de una clienta
  'beauty-8': { temas: ['pelo'] },                    // peluquera cortando el pelo rubio de una clienta
  'beauty-9': { temas: ['pelo'] },                    // brushing con cepillo redondo, primer plano
  // (v199) Stock nuevo de Pexels (licencia libre, verificado a ojo) para que
  // los mundos por subrubro no se queden sin fotos: makeup y peluquería
  // necesitan pools propios de ≥5 sin pedirle fotos al subrubro hermano.
  'beauty-10': { temas: ['makeup', 'rostro'] },       // maquilladora delineando a una clienta (Pexels 22364778)
  'beauty-11': { temas: ['makeup', 'rostro'] },       // aplicación de labial en primer plano (Pexels 5178024)
  'beauty-12': { temas: ['pelo'] },                   // lavado de pelo en la bacha, primer plano (Pexels 23349891)
  'beauty-13': { temas: ['pelo', 'local'] },          // clienta en la bacha del salón (Pexels 7755482)
  'fashion':   { temas: ['moda', 'retrato'] },
  'fashion-1': { temas: ['moda', 'retrato'] },
  'fashion-2': { temas: ['moda', 'local'] },
  'lifestyle':   { temas: ['cafe', 'comida'] },       // mesa de café con latte art
  'lifestyle-1': { temas: ['cafe', 'personas'] },    // dos amigas con café y medialunas
  'lifestyle-2': { temas: ['playa', 'retrato', 'moda'] },
};
// La familia food hereda la curaduría existente (pool de cafés CAFE_POOL):
// temas genéricos de comida; las del pool de café suman 'cafe'.
for (const f of fam('food', 6)) PHOTO_TAGS[f] = { temas: CAFE_POOL.includes(f) ? ['cafe', 'comida'] : ['comida'] };
// Familia flores (2026-10-17): fotos REALES de florería de la biblioteca
// curada (antes el rubro reusaba interiores de hogar y una "docena de rosas"
// salía con foto de un comedor). Tags verificados a ojo sobre el archivo.
PHOTO_TAGS['flores']   = { temas: ['flores', 'ramos', 'local'] };     // interior de florería con ramos en exhibición
PHOTO_TAGS['flores-1'] = { temas: ['flores', 'ramos', 'rosas'] };     // ramos coloridos en la puerta de la florería
PHOTO_TAGS['flores-2'] = { temas: ['flores', 'florero'] };            // exhibición de flores blancas
PHOTO_TAGS['flores-3'] = { temas: ['flores', 'ramos', 'personas'] };  // florista sonriendo con un ramo
PHOTO_TAGS['flores-4'] = { temas: ['flores', 'local', 'personas'] };  // florería de noche con clientes
PHOTO_TAGS['flores-5'] = { temas: ['flores', 'ramos'] };              // puesto de flores al sol, ramos artesanales

// (v196) Tags del RESTO de las familias, verificados a ojo sobre hojas de
// contacto del archivo real (2026-10-18). Con esto las 69 fotos del stock
// quedan taggeadas y el gate foto↔tema puede ser UNIVERSAL y DURO: una foto
// sin tags ya no es "genérica válida" — es inutilizable.
Object.assign(PHOTO_TAGS, {
  'fashion-3': { temas: ['moda', 'retrato', 'calle'] },   // mujer de vestido blanco en la calle
  'fashion-4': { temas: ['moda', 'retrato'] },            // hombre de traje
  'fashion-5': { temas: ['moda', 'retrato'] },            // editorial: mujer de vestido recostada
  'fashion-6': { temas: ['moda', 'producto', 'calzado'] },// zapatilla blanca sobre cubos
  'lifestyle-3': { temas: ['moda', 'retrato', 'calle'] }, // mujer urbana con campera
  'lifestyle-4': { temas: ['personas', 'retrato', 'pareja'] }, // pareja abrazada al aire libre
  'lifestyle-5': { temas: ['fitness', 'personas', 'hogar'] },  // mujer haciendo yoga en casa
  'lifestyle-6': { temas: ['autos', 'viaje', 'personas'] },    // pareja en auto de viaje
  'fitness':   { temas: ['fitness', 'local'] },           // interior de gimnasio luminoso
  'fitness-1': { temas: ['fitness'] },                    // mancuernas en primer plano
  'fitness-2': { temas: ['fitness', 'personas', 'retrato'] }, // mujer en banco de gym con toalla
  'fitness-3': { temas: ['fitness', 'personas'] },        // clase de yoga/pilates
  'fitness-4': { temas: ['fitness', 'personas', 'equipo'] },  // entrenamiento con cuerdas + profe
  'fitness-5': { temas: ['fitness', 'personas', 'airelibre'] }, // corredor al atardecer en el parque
  'pets':   { temas: ['mascotas', 'local'] },             // interior de pet shop
  'pets-1': { temas: ['mascotas', 'retrato'] },           // border collie
  'pets-2': { temas: ['mascotas', 'retrato'] },           // gato
  'pets-3': { temas: ['mascotas', 'bano'] },              // perro bañándose (peluquería canina)
  'pets-4': { temas: ['mascotas'] },                      // cachorro husky en el pasto
  'pets-5': { temas: ['mascotas', 'personas', 'veterinaria'] }, // veterinario con un pomerania
  'home':   { temas: ['hogar'] },                         // living luminoso con plantas
  'home-1': { temas: ['hogar'] },                         // living amarillo con sillones
  'home-2': { temas: ['hogar', 'cocina'] },               // cocina moderna con isla
  'home-3': { temas: ['hogar'] },                         // dormitorio
  'home-4': { temas: ['hogar'] },                         // living boho con plantas
  'home-5': { temas: ['hogar'] },                         // living verde con ventanal
  'home-6': { temas: ['hogar'] },                         // comedor minimalista
  'bar':   { temas: ['bar', 'local'] },                   // canillas de cerveza en barra luminosa
  'bar-1': { temas: ['bar'] },                            // tragos de colores en la barra
  'bar-2': { temas: ['bar', 'personas'] },                // brindis con pintas
  'bar-3': { temas: ['bar', 'noche', 'personas'] },       // bartender sirviendo un cóctel
  'bar-4': { temas: ['bar', 'local'] },                   // interior de bar elegante vacío
  'bar-5': { temas: ['bar', 'personas'] },                // brindis con copas de vino
  'office':   { temas: ['oficina', 'laptop'] },           // escritorio con laptop junto a la ventana
  'office-1': { temas: ['oficina', 'equipo', 'personas'] }, // equipo reunido en sala de juntas
  'office-2': { temas: ['oficina', 'local'] },            // lounge de oficina moderna
  'office-3': { temas: ['dental', 'salud', 'local'] },    // consultorio odontológico (sillón dental)
  'office-4': { temas: ['oficina', 'equipo', 'personas'] }, // reunión en oficina luminosa
  'office-5': { temas: ['dental', 'salud', 'personas'] }, // odontólogos atendiendo a una paciente
  'tech':   { temas: ['tech', 'producto'] },              // celular exhibido en tienda
  'tech-1': { temas: ['tech', 'local', 'personas'] },     // tienda de celulares: vendedor y clienta
  'tech-2': { temas: ['tech', 'producto'] },              // accesorios de celular (fundas, cables)
  'tech-3': { temas: ['tech', 'reparacion', 'personas'] },// reparación de celular con lupa
});

// Temas de foto PROHIBIDOS según el tema del posteo: la foto nunca puede ser
// de OTRO servicio puntual (uñas vendiendo tintura fue el caso real).
const TEMA_CONFLICTS = {
  pelo: ['unas', 'makeup', 'barberia'],
  makeup: ['unas', 'pelo', 'barberia'],
  unas: ['pelo', 'makeup', 'barberia'],
  skincare: ['barberia', 'unas'],
  barberia: ['unas', 'makeup'],
};
// Temas de foto prohibidos para TODA la semana según el público del negocio
// (una maquilladora no recibe fotos de pelo ni de barbería en ningún posteo;
// una barbería no recibe uñas ni makeup aunque el tema sea genérico).
const AUDIENCE_FORBIDDEN_TEMAS = {
  makeup: ['pelo', 'barberia', 'unas'],
  belleza: ['barberia'],
  barberia: ['unas', 'makeup'],
};
// La guarda de tags cubre las categorías cuyos pools usan las familias
// taggeadas (beauty/fashion/lifestyle). El resto conserva la curaduría
// actual (photo asignada por tema + pool del rubro).
const TAG_GUARD_CATS = new Set(['belleza', 'makeup', 'barberia']);

function photoTemas(famName) {
  const t = PHOTO_TAGS[famName];
  return t ? t.temas : null; // null = desconocida
}

// Elige la foto de un tema con match obligatorio. Rangos:
//  1) la foto MUESTRA el tema del posteo (match exacto de tema)
//  2) foto conocida y sin ningún tema prohibido (genérica válida del rubro)
//  3) la foto curada del tema, si no está prohibida
//  4) foto desconocida (sin tags: no se conoce conflicto)
//  5) cualquier foto del pool sin temas prohibidos (puede repetir)
function pickPhotoTagged(topic, poolFams, used, forbiddenTemas) {
  const forb = new Set(forbiddenTemas || []);
  if (topic && topic.tema) for (const c of (TEMA_CONFLICTS[topic.tema] || [])) forb.add(c);
  const banned = (f) => { const t = photoTemas(f); return !!t && t.some((x) => forb.has(x)); };
  // Match exacto = muestra el tema Y no muestra ningún tema prohibido (el
  // barbero cortando pelo es "pelo", pero para una peluquería femenina es
  // barbería: no es match).
  const exact = (f) => { const t = photoTemas(f); return !!(topic && topic.tema && t && t.includes(topic.tema) && !t.some((x) => forb.has(x))); };
  const knownSafe = (f) => { const t = photoTemas(f); return !!t && !t.some((x) => forb.has(x)); };
  const tiers = [
    (f) => exact(f),
    (f) => knownSafe(f),
    (f) => !!topic && topic.photo === f && !banned(f),
    (f) => photoTemas(f) === null,
    (f) => !banned(f),
  ];
  for (const tier of tiers) {
    const hit = poolFams.find((f) => !used.has(f) && tier(f));
    if (hit) return hit;
  }
  return poolFams.find((f) => !banned(f)) || poolFams[0];
}

// ---------- (v196) GATE DURO FOTO↔TEMA universal ----------
// Hasta v195 el matching con tags solo cubría belleza/makeup/barbería; el
// resto de los rubros usaba la foto curada del tema SIN chequeo — así una
// foto de playa terminó vendiendo "Sorteamos una auditoría completa" en la
// semana de una agencia (la misma familia del error uñas↔tintura de Mili).
// Ahora TODA pieza del demo (las 5 de la semana y los extras de la grilla)
// pasa por este gate:
//   · el mundo visual del rubro (PHOTO_WORLD): los temas que una foto puede
//     mostrar para ese negocio;
//   · los temas FUERTES (PHOTO_STRONG_TEMAS) nombran un mundo concreto
//     (playa, barbería, uñas, dental…): si la foto muestra uno que NO es del
//     mundo del rubro, queda afuera — sin excepciones;
//   · los conflictos duros de siempre (TEMA_CONFLICTS por tema del posteo +
//     AUDIENCE_FORBIDDEN_TEMAS por público) siguen mandando;
//   · la foto tiene que pertenecer AL MENOS en un tema al mundo del rubro;
//   · foto sin tags = inutilizable (las 69 del stock están taggeadas).
// Un tema para el que ninguna foto pasa el gate NO fuerza la foto: el tema
// se cambia por otro del pool que sí matchea (selección en buildDemoSpec).
const PHOTO_WORLD = {
  moda: ['moda', 'retrato', 'local', 'personas', 'producto', 'calzado', 'calle', 'rostro'],
  joyeria: ['moda', 'retrato', 'personas', 'local', 'producto', 'calzado', 'calle', 'rostro', 'makeup', 'skincare', 'cosmetica', 'unas'],
  gastronomia: ['comida', 'cafe', 'local', 'personas', 'retrato'],
  bar: ['bar', 'local', 'personas', 'noche', 'comida', 'cafe', 'retrato'],
  belleza: ['pelo', 'makeup', 'unas', 'skincare', 'cosmetica', 'rostro', 'retrato', 'local', 'personas', 'moda', 'cafe'],
  // (v199) Mundos por SUBRUBRO: la categoría belleza mezcla dos oficios y
  // el mundo ancho dejaba pasar las fotos fuertes del subrubro hermano a
  // los posteos genéricos (las brochas de makeup en "Turnos de esta
  // semana" de una peluquería; el antes/despues de makeup sobre una foto
  // fashion). peluqueria = belleza sin subrubro (sus temas SON de pelo):
  // solo pelo/local/personas — ni makeup, ni uñas, ni skincare, ni moda.
  // makeup pierde 'moda': la familia fashion (ropa) no ilustra NINGÚN
  // posteo de un estudio de makeup, y menos un antes/despues.
  peluqueria: ['pelo', 'local', 'personas', 'retrato', 'rostro'],
  makeup: ['makeup', 'skincare', 'cosmetica', 'rostro', 'retrato', 'personas', 'local', 'cafe'],
  barberia: ['barberia', 'pelo', 'local', 'retrato', 'personas', 'moda', 'cafe'],
  fitness: ['fitness', 'personas', 'retrato', 'local', 'equipo', 'airelibre'],
  mascotas: ['mascotas', 'local', 'retrato', 'personas', 'bano', 'veterinaria', 'hogar', 'cafe'],
  hogar: ['hogar', 'cocina', 'local', 'personas', 'cafe', 'retrato'],
  deco: ['hogar', 'cocina', 'local', 'personas', 'cafe', 'retrato'],
  flores: ['flores', 'ramos', 'rosas', 'florero', 'local', 'personas'],
  inmobiliaria: ['hogar', 'cocina', 'oficina', 'local', 'personas', 'equipo', 'cafe', 'retrato', 'laptop'],
  salud: ['dental', 'salud', 'personas', 'local', 'oficina', 'laptop', 'retrato', 'cafe'],
  profesionales: ['oficina', 'laptop', 'equipo', 'personas', 'local', 'retrato', 'cafe'],
  contenido: ['oficina', 'laptop', 'equipo', 'personas', 'local', 'retrato', 'cafe'],
  servicios: ['oficina', 'laptop', 'equipo', 'personas', 'local', 'hogar', 'cocina', 'cafe', 'retrato'],
  educacion: ['oficina', 'laptop', 'equipo', 'personas', 'local', 'cafe', 'retrato'],
  tecnologia: ['tech', 'producto', 'reparacion', 'personas', 'local', 'oficina', 'laptop'],
  turismo: ['playa', 'retrato', 'moda', 'calle', 'personas', 'pareja', 'viaje', 'autos', 'bar', 'local', 'comida', 'cafe', 'noche'],
  viajes: ['playa', 'retrato', 'moda', 'calle', 'personas', 'pareja', 'viaje', 'autos', 'bar', 'local', 'comida', 'cafe', 'noche'],
  eventos: ['bar', 'local', 'personas', 'noche', 'retrato', 'pareja', 'moda', 'calle', 'comida', 'cafe'],
  fotografia: ['cafe', 'comida', 'personas', 'retrato', 'playa', 'moda', 'calle', 'pareja', 'oficina', 'laptop', 'local'],
  autos: ['autos', 'viaje', 'personas', 'local', 'retrato', 'pareja', 'oficina', 'laptop', 'equipo'],
  cafeteria: ['cafe', 'comida', 'local', 'personas', 'retrato'],
  arte: ['moda', 'retrato', 'personas', 'local', 'calle', 'producto', 'calzado', 'cafe', 'comida'],
  otro: ['cafe', 'comida', 'personas', 'retrato', 'oficina', 'laptop', 'equipo', 'local', 'hogar', 'cocina', 'pareja', 'moda', 'calle'],
};
const PHOTO_STRONG_TEMAS = new Set([
  'pelo', 'makeup', 'unas', 'barberia', 'skincare', 'cosmetica',
  'comida', 'cafe', 'bar', 'moda', 'calzado',
  'flores', 'ramos', 'rosas', 'florero',
  'mascotas', 'bano', 'veterinaria', 'fitness',
  'hogar', 'cocina', 'oficina', 'laptop',
  'dental', 'salud', 'tech', 'reparacion', 'autos', 'viaje', 'playa',
]);

function photoGateCtx({ category, subcat, topic, isCafe }) {
  // (v199) El mundo se resuelve por subrubro: belleza sin subrubro es
  // peluquería (ver PHOTO_WORLD.peluqueria). AUDIENCE_FORBIDDEN_TEMAS no
  // tiene entrada 'peluqueria': cae a la de la categoría (belleza).
  const key = subcat || (category === 'belleza' ? 'peluqueria' : category);
  const world = new Set(PHOTO_WORLD[key] || PHOTO_WORLD[category] || PHOTO_WORLD.otro);
  const forb = new Set(AUDIENCE_FORBIDDEN_TEMAS[key] || AUDIENCE_FORBIDDEN_TEMAS[category] || []);
  if (topic && topic.tema) for (const c of (TEMA_CONFLICTS[topic.tema] || [])) forb.add(c);
  return { world, forb, isCafe: !!isCafe };
}

function photoPassesGate(famName, ctx) {
  const t = photoTemas(famName);
  if (!t) return false; // sin tags: el gate es duro, no entra
  if (t.some((x) => ctx.forb.has(x))) return false;
  if (t.some((x) => PHOTO_STRONG_TEMAS.has(x) && !ctx.world.has(x))) return false;
  if (!t.some((x) => ctx.world.has(x))) return false;
  return true;
}

// Elige la foto de un tema PASANDO el gate. Rangos:
//  1) muestra el tema del posteo (match exacto)
//  2) la foto curada del tema (photo / photoCafe)
//  3) cualquier foto del pool que pase
//  4) una que pase aunque ya esté usada (los extras la descartan solos)
// Devuelve null si NINGUNA candidata pasa: el llamador cambia el tema.
function pickPhotoGated(topic, poolFams, used, ctx) {
  const cands = (poolFams || []).slice();
  if (topic) {
    for (const key of [topic.photo, topic.photoCafe]) {
      if (key && !cands.includes(key)) cands.push(key);
    }
  }
  const curated = topic ? ((ctx.isCafe && topic.photoCafe) ? topic.photoCafe : topic.photo) : null;
  const tiers = [
    (f) => { const t = photoTemas(f); return !!(topic && topic.tema && t && t.includes(topic.tema)); },
    (f) => !!curated && f === curated,
    () => true,
  ];
  for (const tier of tiers) {
    const hit = cands.find((f) => !used.has(f) && photoPassesGate(f, ctx) && tier(f));
    if (hit) return hit;
  }
  return cands.find((f) => photoPassesGate(f, ctx)) || null;
}

// ¿Existe AL MENOS una foto (pool o curada) que pase el gate para el tema?
function topicPhotoMatchable(topic, poolFams, ctx) {
  const cands = (poolFams || []).slice();
  if (topic) {
    for (const key of [topic.photo, topic.photoCafe]) {
      if (key && !cands.includes(key)) cands.push(key);
    }
  }
  return cands.some((f) => photoPassesGate(f, ctx));
}

// ---------- Subrubro: makeup NO es peluquería ----------
// La palabra específica manda sobre la familia genérica: si el negocio se
// describe como makeup/maquillaje, los ángulos son de maquillaje aunque la
// categoría del select sea "belleza". Una barbería declarada (barbero/barba
// en el texto) no se convierte en makeup por mencionar la palabra al pasar.
const MAKEUP_RE = /maquillaje|make\s?-?\s?up|makeup/i;
const BARBER_RE = /barber|barba|corte masculino|fade/i;
// (v192) Servicio de contenido / community manager: frases que OFRECEN el
// servicio (no un CTA suelto tipo "seguinos en redes"). Lo comparten
// demoSubcat (temas de contenido) y categoryFromText (nunca "tecnología").
// Los strings de la propia marca Posty ("Posta. | Contenido para tu
// negocio") matchean acá a propósito: Posty ES un servicio de contenido.
const CONTENIDO_SERVICE_RE = /community manager|social media manager|manejo de redes|gesti[oó]n de redes|contenido para (tu|su|mi)|contenidos? para (tu|su) (marca|negocio|emprendimiento)|creaci[oó]n de contenido|marketing digital|agencia de (marketing|contenido|publicidad|redes)/i;
function demoSubcat({ business, category, goal, bioText }) {
  const text = `${business || ''} ${goal || ''} ${bioText || ''}`;
  if (MAKEUP_RE.test(text)) {
    if (category === 'belleza' || category === 'otro') return 'makeup';
    if (category === 'barberia' && !BARBER_RE.test(text)) return 'makeup';
  }
  // (v192) Contenido/CM — la bio del perfil (bioText) manda tanto como el
  // nombre y la descripción del formulario. Va después de makeup: una
  // maquilladora que además crea contenido sigue siendo makeup (su palabra
  // específica manda, como siempre en este sistema).
  if (CONTENIDO_SERVICE_RE.test(text)) return 'contenido';
  return null;
}

// ---------- Estilos REALES del catálogo del producto ----------
// La prueba usa los mismos estilos que el selector "Otro estilo" del
// producto (GET /api/image-styles): brandSafe, no prohibidos para el rubro
// y con match de rubro. El demo NO llama IA: el estilo se materializa como
// TRATAMIENTO VISUAL determinístico en demo_render.py (ver DEMO-STYLES.md).
let _IS = null;
function imageStyles() {
  if (_IS) return _IS;
  try { _IS = require('./image-styles'); } catch (e) { _IS = null; }
  return _IS;
}

// Pool de estilos del rubro: MISMA lógica que GET /api/image-styles.
function demoStylePool(category, business) {
  const IS = imageStyles();
  if (!IS) return [];
  let forbSet = new Set();
  try { forbSet = new Set(IS.forbiddenStyles({ rubro: category, businessName: business || '' }).map((f) => f.code)); } catch (e) {}
  const ok = (s) => !!(s && s.brandSafe && !forbSet.has(s.code));
  let all = IS.STYLES.filter((s) => ok(s) && IS.rubroMatch(s, category));
  if (!all.length) all = IS.STYLES.filter((s) => ok(s) && (s.rubros || []).includes('otro'));
  if (!all.length) all = IS.STYLES.filter(ok);
  return all;
}

// Estilos que nombran OTRO servicio puntual quedan fuera según el público
// (una maquilladora no recibe el estilo "Uñas con esmaltado perfecto").
const STYLE_AUDIENCE_EXCLUDE = {
  makeup: /u[nñ]as|nails|barb|peluquer|hair|pelo|peinado|depilac|cera|cejas|pestañas|brow|lash/i,
  belleza: /barb/i,
  barberia: /u[nñ]as|nails|makeup|maquillaje|lipstick|cosmetic/i,
};

// Tratamiento visual determinístico derivado de los campos del estilo
// (code + prompt del catálogo). Mapeo documentado en DEMO-STYLES.md:
//  - skeleton: duo (antes/después) · centro (cita) · velo (oscuro/cine) ·
//    claro (luminoso/estudio) · abajo/arriba (degradé de marca, por hash)
//  - grade: warm/vivid/soft/cool/neutral según el vocabulario del prompt
//  - crop: 'tight' si el estilo es macro/detalle
function treatmentForStyle(style) {
  const code = String((style && style.code) || '').toLowerCase();
  const pr = String((style && style.prompt) || '').toLowerCase();
  const both = code + ' ' + pr;
  let skeleton;
  if (/before/.test(both) && /after|despu/.test(both)) skeleton = 'duo';
  else if (code.includes('quote') || /\bquote\b/.test(pr)) skeleton = 'centro';
  else if (/dark|night|neon|cinematic|noir|moody|midnight/.test(both)) skeleton = 'velo';
  else if (/bright|airy|clean|minimal|studio|packshot|flat[ -]?lay/.test(both)) skeleton = 'claro';
  else {
    let h = 0;
    for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    skeleton = h % 2 === 0 ? 'abajo' : 'arriba';
  }
  let grade = 'neutral';
  if (/warm|golden|cozy|sunset|gold/.test(both)) grade = 'warm';
  else if (/vibrant|pop|saturated|vivid|colorful/.test(both)) grade = 'vivid';
  else if (/soft|pastel|muted|dreamy|gentle/.test(both)) grade = 'soft';
  else if (/cool|fresh|blue/.test(both)) grade = 'cool';
  const crop = /macro|close[ -]?up|detail|zoom/.test(both) ? 'tight' : 'normal';
  return { skeleton, grade, crop };
}

const KIND_INTENT = { promo: 'promo', tip: 'tips', social: 'testimonio', novedad: 'lanzamiento', reserva: 'producto', sorteo: 'promo' };
// El NOMBRE del estilo se imprime en la pieza: un estilo que nombra un plato
// ("Hamburguesa", "Cazuela de mariscos") solo puede etiquetar un posteo DE
// ESE plato. dishOf devuelve el plato canónico mencionado o null.
const DISH_PATTERNS = [
  ['burger', /hamburgues|burger/i], ['pizza', /pizza/i], ['sushi', /sushi/i],
  ['taco', /taco|burrito/i], ['pasta', /pasta|fideos|ñoquis/i], ['risotto', /risotto/i],
  ['cazuela', /cazuela/i], ['mariscos', /mariscos|marisco/i], ['provoleta', /provoleta/i],
  ['milanesa', /milanesa/i], ['empanada', /empanada/i], ['asado', /asado|parrilla/i],
  ['helado', /helado|ice ?cream/i], ['ramen', /ramen/i],
  ['cafe', /caf[eé]|coffee|latte|cappuccino|espresso|capuchino/i],
  ['croissant', /croissant|medialuna/i], ['brunch', /brunch/i],
  ['pescado', /pescado|fish|salm[oó]n|at[uú]n/i], ['pollo', /pollo|chicken/i],
  ['carne', /carne|meat|steak|bife/i], ['ensalada', /ensalada|salad/i],
  ['sopa', /sopa|soup|caldo/i], ['postre', /postre|dessert|torta|pastel/i],
];
function dishOf(text) {
  const t = String(text || '');
  for (const [key, re] of DISH_PATTERNS) if (re.test(t)) return key;
  return null;
}

// Elige UN estilo del catálogo por posteo: todos distintos, intención del
// posteo primero (misma tabla INTENT_STYLES del producto), diversidad de
// composición garantizada (≥3 esqueletos si hay 3+ posteos).
function pickDemoStyles({ topics, category, subcat, business }) {
  const IS = imageStyles();
  if (!IS) return topics.map(() => null);
  let pool = demoStylePool(category, business);
  const excl = STYLE_AUDIENCE_EXCLUDE[subcat || category];
  if (excl) pool = pool.filter((s) => !excl.test(s.code + ' ' + s.name));
  if (!pool.length) pool = demoStylePool(category, business);
  const used = new Set();
  const usedSkeletons = new Set();
  const picks = topics.map((t) => {
    const intent = KIND_INTENT[t.kind] || 'producto';
    const intentList = (IS.INTENT_STYLES && IS.INTENT_STYLES[intent]) || [];
    let best = null, bestScore = -Infinity;
    for (const s of pool) {
      if (used.has(s.code)) continue;
      const tr = treatmentForStyle(s);
      let score = Math.random() * 9;
      const ii = intentList.indexOf(s.code);
      if (ii >= 0) score += 100 - ii;
      // Un posteo de ANTES/DESPUÉS pide el estilo antes/después: la pieza
      // tiene que mostrar lo que su etiqueta promete (skeleton duo).
      if (/antes/i.test(String(t.tag || '')) && /before/.test(s.code)) score += 130;
      // Un estilo que nombra un plato solo etiqueta posteos de ese plato.
      const sd = dishOf(`${s.code} ${s.name}`);
      if (sd && dishOf(`${t.headline} ${t.sub} ${t.tag}`) !== sd) score -= 200;
      if (!usedSkeletons.has(tr.skeleton)) score += 40;
      if (subcat === 'makeup' && /makeup|beauty|cosmet|glow|skin|lipstick|editorial/i.test(s.code + ' ' + s.name + ' ' + (s.prompt || ''))) score += 15;
      // (v192) Contenido/CM: primero los estilos "de marca" — esqueletos
      // gráficos (cita central, luminoso de estudio) y vocabulario de
      // identidad/diseño. La semana de una agencia tiene que verse como
      // piezas de marca, no como fotos sueltas de stock.
      if (subcat === 'contenido') {
        if (tr.skeleton === 'centro' || tr.skeleton === 'claro') score += 30;
        if (/brand|logo|corporate|identidad|minimal|editorial|magazine|poster|graphic|dise[ñn]o/i.test(s.code + ' ' + s.name + ' ' + (s.prompt || ''))) score += 20;
      }
      if (score > bestScore) { bestScore = score; best = s; }
    }
    if (best) { used.add(best.code); usedSkeletons.add(treatmentForStyle(best).skeleton); }
    return best;
  });
  // Reparación de diversidad: si quedaron <3 esqueletos, cambiar picks
  // tardíos por estilos sin usar que aporten un esqueleto nuevo.
  if (topics.length >= 3) {
    const skels = new Set(picks.filter(Boolean).map((s) => treatmentForStyle(s).skeleton));
    if (skels.size < 3) {
      for (let i = picks.length - 1; i >= 0 && skels.size < 3; i--) {
        const alt = pool.find((s) => !used.has(s.code) && !skels.has(treatmentForStyle(s).skeleton)
          && ((IS.INTENT_STYLES[KIND_INTENT[topics[i].kind] || 'producto'] || []).includes(s.code) || true));
        if (!alt) break;
        if (picks[i]) used.delete(picks[i].code);
        picks[i] = alt;
        used.add(alt.code);
        skels.add(treatmentForStyle(alt).skeleton);
      }
    }
  }
  return picks;
}

// ---------- (v197) VARIEDAD ESTRUCTURAL de la semana ----------
// Hasta v196 una semana podía repetir ESQUELETO de render con distinto
// titular (el caso que marcó Valentino: 3 "pósters de marca" idénticos).
// Acá la variedad deja de ser un puntaje y pasa a ser GARANTÍA: ninguna
// semana repite style_code (ya lo hacía pickDemoStyles) NI esqueleto de
// render NI par (esqueleto × tipo de fondo). Si el estilo de una pieza
// colisiona, primero se cambia el ESTILO por otro del pool sin usar cuyo
// esqueleto natural esté libre (respetando exclusión de público, regla
// de platos y que el antes/después solo etiqueta posteos de
// antes/después); si el pool no da, se reasigna el esqueleto de render
// a uno genérico libre (nunca duo ni poster: tienen semántica propia)
// conservando grade y crop del estilo. El póster de marca cuenta como
// esqueleto 'poster' en la misma contabilidad (máximo 1 por semana).
const VARIETY_FALLBACK_SKELS = ['abajo', 'arriba', 'claro', 'velo', 'centro'];
function enforceSkeletonVariety({ styleObjs, topics, category, subcat, business, posterAt }) {
  const overrides = new Map();
  const IS = imageStyles();
  if (!IS) return overrides;
  let pool = demoStylePool(category, business);
  const excl = STYLE_AUDIENCE_EXCLUDE[subcat || category];
  if (excl) pool = pool.filter((s) => !excl.test(s.code + ' ' + s.name));
  const usedCodes = new Set(styleObjs.filter(Boolean).map((s) => s.code));
  const usedSkels = new Set();
  if (posterAt && posterAt.size) usedSkels.add('poster');
  const wantsDuo = (t) => /antes/i.test(String((t && t.tag) || ''));
  const skelOf = (s) => treatmentForStyle(s).skeleton;
  const counted = new Set();
  // Fase A: un posteo de antes/después con su estilo before reserva duo.
  styleObjs.forEach((s, i) => {
    if (!s || (posterAt && posterAt.has(i))) return;
    if (wantsDuo(topics[i]) && /before/.test(s.code) && skelOf(s) === 'duo') {
      usedSkels.add('duo');
      counted.add(i);
    }
  });
  styleObjs.forEach((s, i) => {
    if (!s || counted.has(i) || (posterAt && posterAt.has(i))) return;
    const t = topics[i] || {};
    const sk = skelOf(s);
    // Un duo sin tema de antes/después también "colisiona": sus chips
    // ANTES/DESPUÉS mentirían en un posteo común.
    const collision = usedSkels.has(sk) || (sk === 'duo' && !wantsDuo(t));
    if (!collision) { usedSkels.add(sk); return; }
    const alt = pool.find((c) => {
      if (usedCodes.has(c.code)) return false;
      const cs = skelOf(c);
      if (usedSkels.has(cs)) return false;
      if (cs === 'duo' && !wantsDuo(t)) return false;
      const sd = dishOf(`${c.code} ${c.name}`);
      if (sd && dishOf(`${t.headline || ''} ${t.sub || ''} ${t.tag || ''}`) !== sd) return false;
      return true;
    });
    if (alt) {
      usedCodes.delete(s.code);
      usedCodes.add(alt.code);
      styleObjs[i] = alt;
      usedSkels.add(skelOf(alt));
      return;
    }
    const free = VARIETY_FALLBACK_SKELS.find((x) => !usedSkels.has(x));
    if (free) {
      const tr = treatmentForStyle(s);
      overrides.set(i, { skeleton: free, grade: tr.grade, crop: tr.crop });
      usedSkels.add(free);
    }
  });
  return overrides;
}

// ---------- (v205) LENGUAJES DE DISEÑO de la semana ----------
// Ampliación de Valentino (2026-10-18, con la galería de Predis por
// rubro como referencia): no alcanza con que cada pieza tenga un
// esqueleto distinto (v197) si las 5 se LEEN con un solo lenguaje —
// la semana de Mili salió con tratamientos distintos pero el mismo
// sistema visual (masthead + bloque + CTA idénticos). Un LENGUAJE es
// el sistema que el ojo distingue de un vistazo: dónde vive el
// titular, qué superficie manda y cómo se compone. Los esqueletos de
// foto con bloque abajo (abajo + velo, su variante cine) cuentan como
// UN solo lenguaje. Regla exigible de la semana (n>=3):
//   - al menos 3 lenguajes distintos;
//   - ningún lenguaje más de 2 veces.
// La reparación mueve ESQUELETOS vía el mismo mapa de overrides de
// v197 (nunca rompe la unicidad de esqueleto, nunca toca el póster ni
// un dúo de antes/después, y solo usa esqueletos sin prerrequisitos:
// claro/centro/arriba/abajo).
const DESIGN_LANGUAGES = {
  abajo: 'foto-abajo', velo: 'foto-abajo',
  arriba: 'foto-arriba',
  claro: 'editorial',
  centro: 'panel',
  duo: 'split',
  poster: 'grafico',
};
function designLanguageOf(skeleton) {
  return DESIGN_LANGUAGES[skeleton] || 'foto-abajo';
}
const DESIGN_REPAIR_SKELS = ['claro', 'centro', 'arriba', 'abajo'];
function enforceDesignLanguages({ styleObjs, topics, overrides, posterAt }) {
  const n = (styleObjs || []).length;
  if (n < 3) return overrides;
  const effTr = (i) => (overrides.get(i) || (styleObjs[i] ? treatmentForStyle(styleObjs[i]) : null));
  const skelAt = (i) => (posterAt && posterAt.has(i)) ? 'poster' : ((effTr(i) || {}).skeleton || 'abajo');
  const counts = () => {
    const m = new Map();
    for (let i = 0; i < n; i++) {
      const L = designLanguageOf(skelAt(i));
      m.set(L, (m.get(L) || 0) + 1);
    }
    return m;
  };
  let guard = 0;
  while (guard++ < 16) {
    const m = counts();
    const langs = [...m.keys()];
    const over = langs.filter((L) => m.get(L) > 2);
    if (langs.length >= 3 && !over.length) break;
    // Posteo a mover: de un lenguaje sobrerrepresentado o, si faltan
    // lenguajes, de uno con más de un posteo. Nunca el póster (su
    // slot manda) ni un dúo (su split ES la promesa del posteo).
    let idx = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (posterAt && posterAt.has(i)) continue;
      if (skelAt(i) === 'duo') continue;
      const L = designLanguageOf(skelAt(i));
      if (over.includes(L) || (langs.length < 3 && (m.get(L) || 0) > 1)) { idx = i; break; }
    }
    if (idx < 0) break;
    const usedSkels = new Set(Array.from({ length: n }, (_, i) => skelAt(i)));
    const cur = effTr(idx) || { grade: 'neutral', crop: 'normal' };
    const cand = DESIGN_REPAIR_SKELS.find((s) => {
      if (usedSkels.has(s)) return false; // unicidad de esqueleto (v197) intacta
      const L = designLanguageOf(s);
      if (langs.length < 3 && (m.get(L) || 0) > 0) return false; // falta variedad: solo suma un lenguaje NUEVO
      if ((m.get(L) || 0) >= 2) return false; // no crear un lenguaje con 3
      return true;
    });
    if (!cand) break;
    overrides.set(idx, { skeleton: cand, grade: cur.grade, crop: cur.crop });
  }
  return overrides;
}

// ---------- Colores elegidos por el visitante ----------
const DEMO_COLOR_DEFAULTS = { accent: '#2793C8', btn: '#FEC14D' };

function cleanHex(v, fallback) {
  const s = String(v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
}

// Texto legible sobre un fondo de color: blanco o navy según luminancia.
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#0A1E33' : '#FFFFFF';
}

// (v196) El color OSCURO de la paleta para el fondo pleno del póster de
// marca: se toma el más oscuro entre accent y btn y se lo baja a una
// luminancia ~0,145 preservando el tono (escala RGB). Con la paleta de
// Posty (amarillo #F9C00E / celeste #1386C7) da un azul profundo de marca.
function posterBgFor(accent, btn) {
  const lum = (h) => {
    const v = parseInt(h.slice(1), 16);
    return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  };
  const base = lum(accent) <= lum(btn) ? accent : btn;
  const v = parseInt(base.slice(1), 16);
  let r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255 || 1;
  const target = 0.145;
  if (L > target) {
    const s = target / L;
    r = Math.round(r * s); g = Math.round(g * s); b = Math.round(b * s);
  }
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// (v197) El fondo CLARO del póster cuando el feed del visitante es
// LUMINOSO: el color más claro de su paleta llevado a una luminancia
// ~0,86 (crema/tinte de su marca, no un blanco genérico). Con la paleta
// de Posty da un crema amarillo — el registro de su feed real.
function posterBgLightFor(accent, btn) {
  const lum = (h) => {
    const v = parseInt(h.slice(1), 16);
    return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  };
  const base = lum(accent) >= lum(btn) ? accent : btn;
  const v = parseInt(base.slice(1), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const target = 0.86;
  if (L >= target) return base.toUpperCase();
  const t = (target - L) / (1 - L);
  const mix = (c) => Math.round(c + (255 - c) * t);
  return '#' + [mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function demoColors(accent, btn, register) {
  const a = cleanHex(accent, DEMO_COLOR_DEFAULTS.accent);
  const b = cleanHex(btn, DEMO_COLOR_DEFAULTS.btn);
  return {
    accent: a,
    accent_text: textOn(a),
    headline: '#0A1E33',
    subline: '#47617A',
    btn: b,
    btn_text: textOn(b),
    watermark: '#47617A',
    // (v197) Registro heredado del feed: luminoso → póster claro con
    // textos oscuros (poster_dark = el color oscuro de su paleta);
    // oscuro o sin perfil → el póster oscuro de siempre.
    poster_bg: register === 'light' ? posterBgLightFor(a, b) : posterBgFor(a, b),
    poster_dark: posterBgFor(a, b),
  };
}

// ---------- Rate limit: 5 generaciones por IP por día ----------
function clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown';
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Anti-spam honesto: 5 generaciones por IP por día ----------
// El intento se RESERVA al arrancar (consumeTrialAttempt, atómico) y se
// REEMBOLSA si la generación falla o el stream se corta antes de entregar el
// resultado (refundTrialAttempt). Una generación fallida nunca consume.
//
// Concurrencia: consumeTrialAttempt hace check+increment en UNA sola sentencia
// SQL atómica, así que 2 requests simultáneos no pueden pasar de 5
// (node:sqlite es sincrónico: tampoco hay interleaving en JS).
function trialDayCount(ip) {
  const row = db.prepare('SELECT count FROM demo_usage WHERE ip = ? AND day = ?').get(ip, todayStr());
  return row ? row.count : 0;
}

// Solo lectura: { allowed, remaining }. No consume nada.
function checkTrialAllowed(ip) {
  const count = trialDayCount(ip);
  return { allowed: count < DEMO_LIMIT_PER_DAY, remaining: Math.max(0, DEMO_LIMIT_PER_DAY - count) };
}

// Reserva un intento de forma ATÓMICA. Devuelve { ok, remaining }:
// ok=false si ya llegó al tope del día (no se consume nada).
function consumeTrialAttempt(ip) {
  const day = todayStr();
  // Limpieza liviana de días viejos (cada tanto)
  try {
    if (Math.random() < 0.05) db.exec(`DELETE FROM demo_usage WHERE day < date('now', '-7 days')`);
  } catch (_) {}
  const info = db.prepare(
    `INSERT INTO demo_usage (ip, day, count) VALUES (?, ?, 1)
     ON CONFLICT(ip, day) DO UPDATE SET count = count + 1 WHERE count < ?`
  ).run(ip, day, DEMO_LIMIT_PER_DAY);
  if (!info || info.changes < 1) return { ok: false, remaining: 0 };
  const count = trialDayCount(ip);
  return { ok: true, remaining: Math.max(0, DEMO_LIMIT_PER_DAY - count) };
}

// Reembolsa un intento reservado (falla de generación / stream cortado a mitad).
// Nunca baja de 0.
function refundTrialAttempt(ip) {
  try {
    db.prepare(
      `UPDATE demo_usage SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END
       WHERE ip = ? AND day = ?`
    ).run(ip, todayStr());
  } catch (_) {}
}

// Compat: antes checkRateLimit() además incrementaba el contador. Ahora es solo
// lectura (ver checkTrialAllowed); el consumo se hace con
// consumeTrialAttempt() + refundTrialAttempt().
function checkRateLimit(ip) {
  return checkTrialAllowed(ip);
}

// ---------- Parser multipart/form-data mínimo (sin dependencias) ----------
// Espera el body crudo como Buffer (express.raw). Devuelve { fields, file }.
function parseMultipart(req, body) {
  const ct = req.headers['content-type'] || '';
  const m = ct.match(/boundary=([^;]+)/);
  if (!m) throw new Error('Formulario inválido');
  const boundary = Buffer.from('--' + m[1].trim().replace(/^"|"$/g, ''));
  const endMark = Buffer.from('--' + m[1].trim().replace(/^"|"$/g, '') + '--');
  if (!Buffer.isBuffer(body) || body.length === 0) throw new Error('Formulario vacío');

  const fields = {};
  let file = null;
  let pos = 0;
  while (true) {
    const bStart = body.indexOf(boundary, pos);
    if (bStart === -1) break;
    if (body.indexOf(endMark, bStart) === bStart) break;
    let p = bStart + boundary.length;
    if (body[p] === 0x0d && body[p + 1] === 0x0a) p += 2; // \r\n
    const hEnd = body.indexOf('\r\n\r\n', p);
    if (hEnd === -1) break;
    const headers = body.slice(p, hEnd).toString('latin1');
    const contentStart = hEnd + 4;
    let contentEnd = body.indexOf(boundary, contentStart);
    if (contentEnd === -1) break;
    contentEnd -= 2; // quita \r\n previo
    const disp = (headers.match(/Content-Disposition:[^\r\n]*/i) || [''])[0];
    const nameM = disp.match(/name="([^"]*)"/);
    const fileM = disp.match(/filename="([^"]*)"/);
    const typeM = (headers.match(/Content-Type:\s*([^\r\n;]+)/i) || [])[1];
    const data = body.slice(contentStart, contentEnd);
    if (fileM && nameM && nameM[1] === 'photo') {
      const filename = fileM[1];
      if (filename && data.length > 0) {
        if (data.length > MAX_FILE_BYTES) throw new Error('La foto no puede superar los 5MB');
        file = { buffer: data, filename, mimetype: (typeM || '').trim().toLowerCase() };
      }
    } else if (nameM) {
      fields[nameM[1]] = data.toString('utf8');
    }
    pos = contentEnd + 2;
  }
  return { fields, file };
}

function validImageKind(file) {
  const b = file.buffer;
  if (!b || b.length < 12) return null;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isWebp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  const okType = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype);
  if ((isPng || isJpg || isWebp) && okType) return isPng ? 'png' : isJpg ? 'jpg' : 'webp';
  return null;
}

// ---------- Objetivo del visitante ("¿Qué querés lograr?") ----------
// Detección simple por palabras clave: reordena los temas para que el más
// relevante vaya primero, y suma su frase al caption del primer posteo.
function sanitizeGoal(g) {
  return String(g || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

const GOAL_RULES = [
  { kind: 'promo', kws: ['promo', 'descuento', 'oferta', '2x1', 'off', 'liquidaci', 'vender', 'venta', 'vend', 'canje', 'usado', 'trade'] },
  { kind: 'reserva', kws: ['reserva', 'turno', 'cita', 'visita'] },
  { kind: 'novedad', kws: ['nuevo', 'nueva', 'lanzamiento', 'lleg', 'modelo'] },
  { kind: 'sorteo', kws: ['sorteo'] },
  { kind: 'social', kws: ['comunidad', 'clientes', 'fidelizar', 'familia'] },
];
// Objetivo elegido en las preguntas previas de /prueba: se inyecta como
// palabras clave para que el reorder de arriba lo tenga en cuenta siempre.
const GOAL_KEY_KWS = {
  vender: 'vender promo oferta',
  seguidores: 'sorteo seguidores',
  lanzamiento: 'lanzamiento nuevo',
  fidelizar: 'comunidad clientes',
};

// Palabras vacías para extraer frases con sentido del párrafo del cliente.
const GOAL_STOP = new Set(('que de la el los las un una y o en con para por mi mis tu tus su sus del al se me te nos como mas muy tan este esta esto estos estas ese esa hay son es esta estan quiero queremos busco buscamos hago hacemos tengo tenemos vendo vendemos nuestro nuestra nuestros nuestras a e ni pero si no si tambien algo asi hacer hacen ser estoy estan este los del').split(' '));

// Extrae la frase del cliente alrededor de una palabra clave ("plan canje",
// "últimos modelos"): 1 a 3 palabras previas (sin cruzar comas ni puntos) +
// la palabra completa. Devuelve '' si no hay una frase de 2+ palabras usable.
function phraseAround(goal, kw) {
  const clean = sanitizeGoal(goal);
  if (clean.length < 30) return '';
  const low = clean.toLowerCase();
  const k = String(kw).toLowerCase();
  let idx = low.indexOf(k);
  while (idx >= 0) {
    const m = clean.slice(idx).match(/^[a-záéíóúñü]+/i);
    const word = m ? m[0] : kw;
    // Solo las palabras después de la última coma/punto: no cruzar de cláusula.
    const before = clean.slice(0, idx).split(/[.!?;,]+/).pop().split(/\s+/).filter(Boolean)
      .map((w) => w.replace(/^[¿¡"'«(]+|[.,;:!?)"'»)]+$/g, ''));
    // Probar de la frase más corta a la más larga: titulares punchy.
    for (let take = 1; take <= 3 && take <= before.length; take++) {
      const words = [...before.slice(-take), word];
      while (words.length > 1 && GOAL_STOP.has(words[0].toLowerCase())) words.shift();
      const phrase = words.join(' ');
      if (phrase.split(/\s+/).length >= 2 && phrase.length >= 6 && phrase.length <= 42) return phrase;
    }
    idx = low.indexOf(k, idx + 1);
  }
  return '';
}

function applyGoal(topics, goal, goal_key, hasPhoto) {
  const clean = sanitizeGoal(goal);
  const keyKws = (goal_key && GOAL_KEY_KWS[goal_key]) ? GOAL_KEY_KWS[goal_key] + ' ' : '';
  if (!clean && !keyKws) return { topics, goalLine: '' };
  const g = (keyKws + clean).toLowerCase();
  let ordered = topics;
  for (const r of GOAL_RULES) {
    const i = topics.findIndex((t) => t.kind === r.kind);
    if (i >= 0 && r.kws.some((k) => g.includes(k))) {
      if (i > 0) ordered = [topics[i], ...topics.slice(0, i), ...topics.slice(i + 1)];
      break;
    }
  }
  // SIN foto real del cliente el posteo usa foto stock genérica del rubro: NO
  // se personaliza el titular con el producto específico que nombró ("buzo
  // adidas última"), porque la foto no sería ese producto y el posteo quedaría
  // roto (regla: la foto tiene que coincidir con el producto). El "Tal como
  // pediste" igual muestra en el caption que lo escuchamos.
  if (!hasPhoto) {
    const short = clean.length > 140 ? clean.slice(0, 140).trimEnd() + '…' : clean;
    return { topics: ordered, goalLine: '\nTal como pediste: ' + short };
  }
  // Titular con las palabras del cliente: si el párrafo nombra algo que un
  // posteo también nombra (ej. "plan canje"), ese posteo usa su frase como
  // titular. Solo el primer match, para no recargar.
  let usedPhrase = false;
  const personalized = ordered.map((t) => {
    if (usedPhrase) return t;
    const hay = (t.headline + ' ' + t.caption).toLowerCase();
    for (const r of GOAL_RULES) {
      if (r.kind !== t.kind) continue;
      const kw = r.kws.find((k) => g.includes(k) && hay.includes(k));
      if (!kw) continue;
      const phrase = phraseAround(clean, kw);
      if (!phrase) continue;
      usedPhrase = true;
      return { ...t, headline: phrase.charAt(0).toUpperCase() + phrase.slice(1) };
    }
    return t;
  });
  // Si ya se personalizó un titular, no hace falta el "Tal como pediste".
  if (usedPhrase) return { topics: personalized, goalLine: '' };
  const short = clean.length > 140 ? clean.slice(0, 140).trimEnd() + '…' : clean;
  return { topics: personalized, goalLine: '\nTal como pediste: ' + short };
}

// ---------- Render con PIL (Python3) ----------
let _pythonOk = null;
function pythonAvailable() {
  if (_pythonOk !== null) return _pythonOk;
  try {
    execFileSync('python3', ['-c', 'import PIL.Image'], { timeout: 20000, stdio: 'ignore' });
    _pythonOk = true;
  } catch (_) {
    _pythonOk = false;
  }
  return _pythonOk;
}

function runDemoRender(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    execFile('python3', args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message).split('\n').slice(-6).join(' ').slice(0, 400);
        return reject(new Error('Render falló: ' + msg));
      }
      resolve(stdout);
    });
  });
}

// El video de la semana: demo_video.py anima los diseños con zoom suave
// (zoompan de ffmpeg). Con 2+ diseños hace un TOUR: recorre las piezas con
// cortes cortos (como un reel de verdad); con 1 solo, el Ken Burns clásico
// de 6 segundos.
// TIMEOUT DURO (fix 2026-10-18): antes el execFile no tenía timeout — si
// ffmpeg quedaba hambriento de CPU en el contenedor (en vez de morir), el
// paso de video colgaba sin techo y la semana entera esperaba. En local el
// tour tarda ~4-7 s: 60 s es ~10x de margen para CPU compartida; el clásico
// (menos frames, una sola entrada) lleva 45 s. Si se excede, execFile mata
// el proceso (SIGKILL) y la degradación de renderVideoB64 decide.
const VIDEO_TOUR_TIMEOUT_MS = 60000;
const VIDEO_CLASSIC_TIMEOUT_MS = 45000;
function renderDemoVideo(imagePaths, runDir, idx) {
  return new Promise((resolve, reject) => {
    const out = path.join(runDir, `post-${idx == null ? 2 : idx}.mp4`);
    let paths = (Array.isArray(imagePaths) ? imagePaths : [imagePaths]).filter(Boolean);
    if (paths.length >= 2) {
      // El tour ARRANCA en el diseño del propio posteo video (v195): si
      // empezara en el diseño N°1, la celda del reel mostraría al inicio
      // (y en foto fija) el mismo diseño que la celda del primer posteo —
      // se lee como repetido. Wrap-around: [idx, idx+1, …, n-1, 0, …, idx-1].
      // Si el diseño del video ya es el primero, nada cambia.
      const start = Math.min(Math.max(idx == null ? 2 : idx, 0), paths.length - 1);
      if (start > 0) paths = paths.slice(start).concat(paths.slice(0, start));
    }
    const isTour = paths.length >= 2;
    const args = isTour
      ? [DEMO_VIDEO_SCRIPT, '--tour', out, '1.4', ...paths]
      : [DEMO_VIDEO_SCRIPT, paths[0], out, '6'];
    const opts = {
      timeout: isTour ? VIDEO_TOUR_TIMEOUT_MS : VIDEO_CLASSIC_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024,
    };
    execFile('python3', args, opts, (err, stdout, stderr) => {
      if (err) return reject(new Error('video: ' + String(stderr || err.message).slice(0, 200)));
      try { resolve(fs.readFileSync(out)); }
      catch (e) { reject(e); }
    });
  });
}

// ---------- Orquestador ----------
// count: cantidad de posteos a generar (3 = demo clásica 2+1; 5 = semana de prueba Pro)
// Construye el spec de diseño (textos, estilos, fotos) sin renderizar.
// Si recibe `base` ({styles, photos}), reusa esos diseños/fotos en vez de
// sortear nuevos: así el recolor cambia SOLO los colores, nada más.
function buildDemoSpec({ business, category, country, tone, photoPath, goal, goal_key, accent, btn, count, base, topicOffset = 0, excludePhotos = null, bioText = '', profilePicPath = null, feedRegister = null }) {
  const n = Math.min(Math.max(parseInt(count, 10) || 3, 1), 6);
  const cat = CATEGORIES.includes(category) ? category : 'otro';
  // Subrubro (makeup ≠ peluquería; contenido ≠ servicios genéricos): cambia
  // los ÁNGULOS, no la categoría. bioText = la bio real del perfil (v192):
  // la semana hereda los temas de SU línea, no solo los del formulario.
  const subcat = demoSubcat({ business, category: cat, goal, bioText });
  const topicsBase = (subcat && captions.DEMO_TOPICS[subcat])
    ? captions.DEMO_TOPICS[subcat]
    : (captions.DEMO_TOPICS[cat] || captions.DEMO_TOPICS.otro);
  const { topics: allTopics, goalLine } = applyGoal(topicsBase, goal, goal_key, !!photoPath);
  // topicOffset (v187): temas desde una posición del pool — lo usan los
  // visuales extra de la grilla CON Posty para NO repetir los temas (ni las
  // fotos, vía excludePhotos) de la semana ya generada.
  let topics = allTopics.slice(topicOffset, topicOffset + n);
  const bar = String(business || '').toUpperCase().slice(0, 26) || 'TU NEGOCIO';

  // (v196, acotado en v197) MODO PÓSTER DE MARCA: un perfil de
  // servicios/contenido (agencia, CM, profesionales) no es un catálogo
  // de fotos — su semana incluye UNA pieza de marca: un póster de color
  // pleno con su foto de perfil como medallón protagonista. En v196 las
  // posiciones pares salían TODAS como ese mismo póster (3 plantillas
  // idénticas con distinto titular: "estilos repetidos", veredicto de
  // Valentino) — ahora el póster es la PRIMERA pieza de la semana
  // principal y nada más: máximo 1 por semana, elegido como un estilo
  // más dentro de la variedad estructural (enforceSkeletonVariety).
  const posterMode = !photoPath && (subcat === 'contenido' || cat === 'profesionales' || cat === 'servicios');
  const posterAt = new Set();

  let styleObjs, photos;
  const baseStylesOk = base && Array.isArray(base.styles) && base.styles.length >= n
    && base.styles.every((c) => { const IS = imageStyles(); return IS && IS.getStyle(c); });
  if (baseStylesOk && Array.isArray(base.photos) && base.photos.length >= n) {
    const IS = imageStyles();
    styleObjs = base.styles.slice(0, n).map((c) => IS.getStyle(c));
    photos = base.photos.slice(0, n);
  } else if (photoPath) {
    // Estilos REALES del catálogo del producto: uno distinto por posteo.
    styleObjs = pickDemoStyles({ topics, category: cat, subcat, business });
    photos = topics.map(() => ({ userPhoto: true }));
  } else {
    // (v196) SELECCIÓN CON GATE DURO: se recorren los temas del pool desde
    // topicOffset y un tema SOLO entra a la semana si alguna foto pasa el
    // gate para él (o si su posición es de póster, que no necesita foto).
    // El que no matchea se cambia por el siguiente que sí — la foto jamás
    // se fuerza (así murió el "sorteo de auditoría" sobre la foto de playa).
    const isCafe = (cat === 'gastronomia' || cat === 'cafeteria') && isCafeBusiness(business);
    const poolFams = isCafe
      ? CAFE_POOL.slice()
      : (CATEGORY_PHOTOS[subcat === 'makeup' ? 'belleza' : cat] || CATEGORY_PHOTOS.otro).slice();
    const chosen = [];
    const chosenPoster = [];
    for (let k = topicOffset; k < allTopics.length && chosen.length < n; k++) {
      const t = allTopics[k];
      const isPoster = posterMode && topicOffset === 0 && chosen.length === 0;
      if (!isPoster) {
        const ctx = photoGateCtx({ category: cat, subcat, topic: t, isCafe });
        if (!topicPhotoMatchable(t, poolFams, ctx)) continue;
      }
      chosen.push(t);
      chosenPoster.push(isPoster);
    }
    if (chosen.length) {
      topics = chosen;
      chosenPoster.forEach((b, i) => { if (b) posterAt.add(i); });
    }
    // Estilos REALES del catálogo del producto: uno distinto por posteo.
    // (La variedad de esqueletos la garantiza enforceSkeletonVariety más
    // abajo, para todas las ramas — el remiendo puntual de v196 que solo
    // miraba los dos primeros posteos con foto quedó subsumido.)
    styleObjs = pickDemoStyles({ topics, category: cat, subcat, business });
    // Fotos con el gate, en dos pasadas: primero los temas CON tema (las
    // fotos exactas son pocas y son para ellos), después los genéricos — si
    // no, un posteo sin tema se queda con la única foto de pelo y los de
    // pelo caen en fotos de otro servicio (caso real 2026-10-17).
    photos = new Array(topics.length).fill(null);
    const usedFams = new Set((excludePhotos || []).map((x) => path.basename(String(x)).replace(/\.webp$/i, '')));
    const order = topics.map((t, i) => i)
      .filter((i) => !posterAt.has(i))
      .sort((a, b) => (topics[b].tema ? 1 : 0) - (topics[a].tema ? 1 : 0));
    for (const i of order) {
      const ctx = photoGateCtx({ category: cat, subcat, topic: topics[i], isCafe });
      const famName = pickPhotoGated(topics[i], poolFams, usedFams, ctx);
      if (!famName) {
        // No debería pasar (la selección ya exigió match): si pasa, el
        // slot sale como póster SOLO si la semana todavía no tiene el
        // suyo (v197: máximo 1) y si no, con la primera foto del pool —
        // nunca con una foto que el gate rechazó.
        if (posterMode && posterAt.size === 0) { posterAt.add(i); photos[i] = profilePicPath || null; continue; }
        const p0 = path.join(STOCK_DIR, poolFams[0] + '.webp');
        if (!fs.existsSync(p0)) throw new Error('Foto de muestra no disponible');
        photos[i] = p0;
        continue;
      }
      usedFams.add(famName);
      const p = path.join(STOCK_DIR, famName + '.webp');
      if (!fs.existsSync(p)) throw new Error('Foto de muestra no disponible');
      photos[i] = p;
    }
    for (const i of posterAt) photos[i] = profilePicPath || null;
  }
  // (v197) VARIEDAD ESTRUCTURAL: ningún esqueleto de render se repite
  // en la semana (garantía, no puntaje — ver enforceSkeletonVariety).
  const treatmentOverrides = enforceSkeletonVariety({ styleObjs, topics, category: cat, subcat, business, posterAt });
  // (v205) VARIEDAD DE LENGUAJES DE DISEÑO: sobre los esqueletos ya
  // únicos de v197, la semana reparte ≥3 lenguajes distinguibles a
  // ojo y ninguno pasa de 2 posteos (ver enforceDesignLanguages).
  enforceDesignLanguages({ styleObjs, topics, overrides: treatmentOverrides, posterAt });
  const focuses = Array.from({ length: n }, (_, i) => 0.3 + (i % 4) * 0.13);
  const specPosts = topics.map((t, i) => {
    let headline = t.headline;
    let subline = t.subline;
    if (tone === 'tu') {
      headline = captions.TU_HEADLINES[headline] || headline;
      subline = captions.toTu(subline);
    }
    // (v209) TITULARES ≤ 6 PALABRAS, DURO (regla de pieza de Valentino):
    // el catálogo cumple, pero NINGÚN titular sale del armado sin pasar
    // por el cap — recorte limpio por cláusula, nunca a mitad de idea.
    headline = captions.capHeadlineWords(headline, 6);
    const st = styleObjs[i] || null;
    const isPoster = posterAt.has(i);
    // (v196) El slot de póster manda sobre el tratamiento del estilo: la
    // pieza es un póster de marca (fondo pleno + medallón), no una foto.
    const trFinal = isPoster
      ? { skeleton: 'poster', grade: 'neutral', crop: 'normal' }
      : (treatmentOverrides.get(i) || (st ? treatmentForStyle(st) : null));
    return {
      photo: photos[i],
      style: st ? st.code : 'promo',
      style_name: st ? st.name : '',
      treatment: trFinal,
      // (v205) El lenguaje de diseño de la pieza, registrado en el
      // payload (design.posts[i].design_code) y exigible por tests.
      design_code: designLanguageOf(trFinal ? trFinal.skeleton : 'abajo'),
      poster: isPoster || undefined,
      kind: t.kind,
      tema: t.tema || null,
      focus: focuses[i],
      pill: t.tag,
      bar,
      headline,
      subline,
      cta: t.cta,
    };
  });
  // (v209) DOSIFICACIÓN DE TEXTO: exactamente 2 piezas de la semana
  // llevan titular+CTA quemados sobre la imagen; las demás salen con la
  // foto limpia y su idea+CTA viven en el caption (que cierra con el
  // CTA: ver generateDemo y el stream de /prueba). El modo queda
  // registrado en el payload (design.posts[i].text_mode) y el renderer
  // lo cumple vía paraRender + la vía limpia de render_v2.
  const textModes = captions.assignTextModes(topics, Math.min(2, Math.max(0, specPosts.length - 1)), 2);
  // El póster es una pieza tipográfica: sin texto no existe. Si quedó
  // limpio, entra en las 2 y sale la pieza con texto de menor prioridad.
  for (const pi of posterAt) {
    if (textModes[pi] !== 'text') {
      textModes[pi] = 'text';
      let worst = -1; let worstRank = -1;
      textModes.forEach((m, j) => {
        if (m === 'text' && j !== pi && !posterAt.has(j)) {
          const r = captions.TEXT_KIND_RANK[topics[j] && topics[j].kind] != null ? captions.TEXT_KIND_RANK[topics[j].kind] : 5;
          if (r >= worstRank) { worstRank = r; worst = j; }
        }
      });
      if (worst >= 0 && textModes.filter((m) => m === 'text').length > 2) textModes[worst] = 'clean';
    }
  }
  specPosts.forEach((sp, i) => { sp.text_mode = textModes[i] || 'text'; });
  // (v197) La foto de perfil aparece como máximo en 2 piezas y con
  // tratamientos DISTINTOS entre sí: el medallón protagonista del
  // póster (si lo hay) y una marca suave grande sobre UNA pieza con
  // foto. Jamás el mismo medallón centrado repetido; si no hay póster
  // o no hay foto de perfil, la identidad la cargan paleta+temas.
  if (posterMode && profilePicPath && posterAt.size) {
    const wi = specPosts.findIndex((p, i) => !posterAt.has(i)
      && typeof p.photo === 'string'
      && (!p.treatment || p.treatment.skeleton !== 'duo'));
    if (wi >= 0) {
      specPosts[wi].pic_mark = 'watermark';
      specPosts[wi].pic_path = profilePicPath;
    }
  }
  const stylesN = specPosts.map((p) => p.style);
  return { specPosts, styles: stylesN, photos, videoIdx: Math.min(2, Math.max(0, specPosts.length - 1)), count: specPosts.length, goalLine, topics, subcat, feedRegister: feedRegister || null };
}

// Renderiza un spec (lista de posteos) a PNGs con los colores dados.
// Devuelve los buffers en el mismo orden. No toca textos: solo diseño.
// La etiqueta de estilo (nombre interno del catálogo, ej "Depilación láser")
// NO se dibuja en la imagen del cliente: es jerga interna (pedido 2026-10-17).
const sinEtiqueta = (posts) => posts.map((p) => ({ ...p, label: '', style_name: '' }));
// (v209) Proyección de RENDER de la dosificación: las piezas 'clean' le
// llegan al renderer SIN titular, sublínea, CTA ni pill — la foto sale
// limpia de verdad (el renderer además tiene su vía limpia en
// render_v2). El spec guardado conserva los textos (payload/captions).
const paraRender = (posts) => posts.map((p) => (p && p.text_mode === 'clean'
  ? { ...p, label: '', style_name: '', headline: '', subline: '', cta: '', pill: '' }
  : { ...p, label: '', style_name: '' }));
async function renderSpecPngs(specPosts, colors) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-spec-'));
  try {
    const specPath = path.join(runDir, 'spec.json');
    fs.writeFileSync(specPath, JSON.stringify({ fonts_dir: FONTS_DIR, colors: demoColors(colors.accent, colors.btn, colors.register), posts: paraRender(specPosts) }));
    await runDemoRender([DEMO_SCRIPT, specPath, runDir]);
    return { bufs: specPosts.map((_, i) => fs.readFileSync(path.join(runDir, `post-${i}.jpg`))), runDir };
  } catch (e) {
    try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
    throw e;
  }
}

async function renderVideoB64(imagePaths, runDir, idx) {
  // Política de degradación rápida (fix 2026-10-18): UN intento principal
  // (tour si hay 2+ diseños) y, si falla, UN solo intento barato con el Ken
  // Burns del diseño del propio posteo video. Nada de reintentar el tour:
  // sus fallos reales son deterministas (memoria del contenedor: el grafo
  // del tour sostiene las 5 entradas a la vez y ffmpeg muere por
  // allocation; binario ausente) y la política vieja — 4 intentos del tour
  // con esperas 1,5/3/6 s + fallback — quemaba 10+ s extra y moría igual.
  // El clásico usa una sola entrada y una fracción de la memoria: es la
  // degradación que sí puede pasar cuando el tour no. Peor caso acotado:
  // timeout del tour (60 s) + timeout del clásico (45 s); un fallo de video
  // nunca bloquea la entrega de la semana (el llamador cae a celda imagen).
  try {
    return (await renderDemoVideo(imagePaths, runDir, idx)).toString('base64');
  } catch (e) {
    console.error('[posta] Video falló (intento principal):', e.message);
  }
  const paths = (Array.isArray(imagePaths) ? imagePaths : [imagePaths]).filter(Boolean);
  if (paths.length >= 2) {
    const vi = Math.min(Math.max(idx == null ? 2 : idx, 0), paths.length - 1);
    try { return (await renderDemoVideo(paths[vi], runDir, idx)).toString('base64'); }
    catch (e) { console.error('[posta] Video degradado (Ken Burns) también falló:', e.message); }
  }
  console.error('[posta] ⚠️ VIDEO FALLÓ — la semana sale sin reel');
  return null;
}

// Resuelve las fotos del spec a rutas reales. {userPhoto:true} se restaura
// desde el dataUrl (la subida original se borra tras generar).
function resolveSpecPhotos(specPosts, userPhotoDataUrl) {
  const cleanups = [];
  const resolved = specPosts.map((p) => {
    const ph = p.photo;
    if (ph && typeof ph === 'object' && ph.userPhoto) {
      const m = /^data:(image\/(png|jpeg|webp));base64,([\s\S]+)$/.exec(String(userPhotoDataUrl || ''));
      if (!m) throw new Error('No encontramos tu foto original');
      const tmp = path.join(os.tmpdir(), `posta-reup-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`);
      fs.writeFileSync(tmp, Buffer.from(m[3], 'base64'));
      cleanups.push(tmp);
      return { ...p, photo: tmp };
    }
    // data URL persistida en el spec (foto subida en un rediseño anterior)
    if (typeof ph === 'string' && ph.startsWith('data:image/')) {
      const m = /^data:(image\/(png|jpeg|webp));base64,([\s\S]+)$/.exec(ph);
      if (m) {
        const tmp = path.join(os.tmpdir(), `posta-redata-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`);
        fs.writeFileSync(tmp, Buffer.from(m[3], 'base64'));
        cleanups.push(tmp);
        return { ...p, photo: tmp };
      }
    }
    return p;
  });
  return { resolved, cleanups };
}

async function generateDemo({ business, category, country, tone, photoPath, goal, goal_key, accent, btn, count, bioText, profilePicPath, feedRegister }) {
  if (!pythonAvailable()) throw new Error('Generador no disponible en este momento');
  const spec = buildDemoSpec({ business, category, country, tone, photoPath, goal, goal_key, accent, btn, count, bioText: bioText || '', profilePicPath: profilePicPath || null, feedRegister: feedRegister || null });
  const { specPosts, videoIdx, count: n, goalLine, topics } = spec;
  const cat = CATEGORIES.includes(category) ? category : 'otro';

  // Las fotos del spec guardado usan marcador para la subida del usuario
  // (el tmp se borra); las de stock son rutas estables.
  const savedSpec = {
    posts: specPosts,
    styles: spec.styles,
    photos: spec.photos,
    videoIdx, count: n,
    engine: DEMO_ENGINE_V,
    subcat: spec.subcat || null,
  };
  // En generación inicial photoPath existe: lo inyectamos directo.
  const withPhotos = specPosts.map((p) => (
    (p.photo && typeof p.photo === 'object' && p.photo.userPhoto && photoPath) ? { ...p, photo: photoPath } : p
  ));
  const { bufs, runDir } = await renderSpecPngsStream(withPhotos, { accent, btn, register: spec.feedRegister }, () => {});
  try {
    // Captions gateados por captionPasses (demo-captions.js): si una plantilla
    // no pasa el gate, se reintenta con otro tema del rubro. Nunca sale un
    // caption que el gate rechazaría.
    const made = topics.map((t, i) => {
      const r = captions.resolveTrialCaption(topics, cat, {
        business, tone, country, idx: i, goalLine,
      });
      // (v209) Pieza LIMPIA: sin titular ni botón en la imagen, el
      // caption carga la idea y CIERRA con el CTA — garantizado acá.
      const cleanPiece = specPosts[i].text_mode === 'clean';
      return {
        image: 'data:image/jpeg;base64,' + bufs[i].toString('base64'),
        caption: cleanPiece
          ? captions.ensureCaptionCtaClose(r.caption, (topics[r.topicIndex] || t).kind, tone)
          : r.caption,
        hashtags: r.hashtags,
        headline: specPosts[i].headline, // titular del diseño (en piezas limpias vive solo en el caption)
        style: specPosts[i].style,
        style_name: specPosts[i].style_name,
        text_mode: specPosts[i].text_mode || 'text',
      };
    });

    // El video recorre TODOS los diseños con cortes (tour): ya no es una
    // sola tarjeta estática animada. Los JPG ya están en runDir.
    const designPaths = specPosts.map((_, i) => path.join(runDir, `post-${i}.jpg`));
    const videoB64 = await renderVideoB64(designPaths, runDir, videoIdx);

    const posts = made.map((m, i) => (
      i === videoIdx && videoB64
        ? { type: 'video', video: 'data:video/mp4;base64,' + videoB64, caption: m.caption, hashtags: m.hashtags, headline: m.headline, style: m.style, style_name: m.style_name, text_mode: m.text_mode }
        : { type: 'image', image: m.image, caption: m.caption, hashtags: m.hashtags, headline: m.headline, style: m.style, style_name: m.style_name, text_mode: m.text_mode }
    ));
    return { posts, spec: savedSpec };
  } finally {
    try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// Rediseño de la prueba: re-renderiza los posteos del spec guardado con
// nuevos colores y/o nuevas fotos, SIN tocar textos ni diseños.
// colors: {accent, btn} (re-render completo). photoOverrides: [{index, photo}]
// donde photo es ruta de stock o dataUrl subido. Devuelve imágenes nuevas.
async function redesignDemo({ spec, colors, photoOverrides, userPhotoDataUrl }) {
  if (!pythonAvailable()) throw new Error('Generador no disponible en este momento');
  if (!spec || !Array.isArray(spec.posts) || !spec.posts.length) throw new Error('Sin diseño guardado');
  const n = spec.posts.length;
  const idxs = photoOverrides && photoOverrides.length
    ? [...new Set(photoOverrides.map((o) => o.index).filter((i) => Number.isInteger(i) && i >= 0 && i < n))]
    : spec.posts.map((_, i) => i); // sin overrides = todos (recolor)
  if (!idxs.length) throw new Error('Nada para rediseñar');

  const { resolved, cleanups } = resolveSpecPhotos(spec.posts, userPhotoDataUrl);
  const tmpUploads = [];
  try {
    const sub = idxs.map((i) => {
      let p = { ...resolved[i] };
      const ov = (photoOverrides || []).find((o) => o.index === i);
      if (ov && ov.photo) {
        const ph = String(ov.photo);
        const m = /^data:(image\/(png|jpeg|webp));base64,([\s\S]+)$/.exec(ph);
        if (m) {
          const tmp = path.join(os.tmpdir(), `posta-reph-${Date.now()}-${i}-${crypto.randomBytes(4).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`);
          fs.writeFileSync(tmp, Buffer.from(m[3], 'base64'));
          tmpUploads.push(tmp);
          p.photo = tmp;
        } else if (fs.existsSync(ph)) {
          p.photo = ph;
        }
      }
      return p;
    });
    const { bufs, runDir } = await renderSpecPngs(sub, colors || {});
    try {
      const images = bufs.map((b) => 'data:image/jpeg;base64,' + b.toString('base64'));
      let video = null;
      const vIdx = idxs.indexOf(spec.videoIdx);
      if (vIdx >= 0) {
        const vpath = path.join(runDir, `post-${vIdx}.jpg`);
        fs.writeFileSync(vpath, bufs[vIdx]);
        const b64 = await renderVideoB64(vpath, runDir, vIdx);
        if (b64) video = 'data:video/mp4;base64,' + b64;
      }
      return { idxs, images, videoIdx: spec.videoIdx, video };
    } finally {
      try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
    }
  } finally {
    for (const f of [...cleanups, ...tmpUploads]) { try { fs.unlinkSync(f); } catch (_) {} }
  }
}

// Opciones de fotos "nuestras" para cambiar la foto de un posteo de la prueba:
// devuelve URLs públicas del pool del rubro (excluye las ya usadas).
// (v199, cierre del gate) Las opciones pasan por el MISMO gate foto↔tema
// que la generación de la semana (photoPassesGate): antes salía el pool
// crudo de la categoría y el usuario podía elegir a mano justo lo que la
// generación ya no deja pasar — una foto de makeup para una peluquería,
// una fashion para un estudio de makeup. El contexto se deriva de lo que
// la función ya recibe: demoSubcat sobre el texto del negocio (igual que
// en buildDemoSpec; sin subrubro, belleza = mundo peluqueria) y, sin tema
// de posteo, mandan el mundo del subrubro + los temas prohibidos por
// público. Las exclusiones del llamador ya traen TODA la semana (la foto
// actual del posteo y las usadas en los demás).
function trialPhotoOptions(category, business, excludeFams, n) {
  const cat = CATEGORIES.includes(category) ? category : 'otro';
  const cafeBiz = isCafeBusiness(business);
  const basePool = (cat === 'gastronomia' && cafeBiz)
    ? CAFE_POOL.slice()
    : (CATEGORY_PHOTOS[cat] || CATEGORY_PHOTOS.otro).slice();
  const subcat = demoSubcat({ business, category: cat });
  const ctx = photoGateCtx({
    category: cat, subcat, topic: null,
    isCafe: (cat === 'gastronomia' || cat === 'cafeteria') && cafeBiz,
  });
  const gated = (fams) => fams.filter((f) => photoPassesGate(f, ctx));
  const excl = new Set(excludeFams || []);
  let pool = gated(basePool).filter((f) => !excl.has(f));
  // Si quedan pocas (pool chico como el de café), completar con el pool general del rubro
  const want = n || 8;
  if (pool.length < Math.min(4, want)) {
    const extra = gated((CATEGORY_PHOTOS[cat] || CATEGORY_PHOTOS.otro).slice())
      .filter((f) => !excl.has(f) && !pool.includes(f));
    pool = pool.concat(extra);
  }
  if (!pool.length) {
    // El selector nunca queda vacío: primero las fotos del mundo aunque
    // ya estén usadas en la semana; solo si el pool no tiene NINGUNA foto
    // que pase el gate se vuelve al pool crudo sin las excluidas.
    pool = gated(basePool);
    if (!pool.length) pool = basePool.filter((f) => !excl.has(f));
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, want).map((fam) => ({ fam, url: '/demo-stock/' + fam + '.webp' }));
}
const CATEGORY_COLORS = {
  moda: ['#232323', '#F0B429'],
  gastronomia: ['#8B2E2E', '#F2A93B'],
  cafeteria: ['#5C3D2E', '#D9A679'],
  bar: ['#1F2A44', '#E8B44A'],
  belleza: ['#C98BA6', '#F6E7EC'],
  barberia: ['#1C1C1E', '#C9A227'],
  fitness: ['#16283F', '#FF5A3C'],
  mascotas: ['#2E7D6F', '#FFC53D'],
  salud: ['#2A9DB8', '#E8F6F8'],
  hogar: ['#4A6741', '#E9D8A6'],
  deco: ['#B08968', '#F1E3D3'],
  inmobiliaria: ['#1F3A5F', '#F2C14E'],
  autos: ['#333333', '#E63946'],
  educacion: ['#2B6CB0', '#F6C453'],
  tecnologia: ['#2D2D44', '#00D2FF'],
  turismo: ['#1B9AAA', '#FFC300'],
  viajes: ['#0E7C7B', '#F4D35F'],
  eventos: ['#7B2D8B', '#FEC14D'],
  fotografia: ['#262626', '#E8B44A'],
  arte: ['#E4572E', '#F3A712'],
  joyeria: ['#8C6A3C', '#F6E7C1'],
  flores: ['#3E7C4F', '#F2A7C3'],
  profesionales: ['#1F3A5F', '#7FB3D5'],
  servicios: ['#1F2937', '#F59E0B'],
  otro: ['#2793C8', '#FEC14D'],
};

// ---------- Colores reales del perfil de Instagram (best-effort) ----------
// Trae la foto de perfil pública vía la página de embed (sin login ni API)
// y extrae hasta 2 colores dominantes. Timeouts acotados: si Instagram no
// colabora, devuelve null y se usa la paleta del rubro.
const IG_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const EXTRACT_COLORS_SCRIPT = path.join(__dirname, 'extract_colors.py');

// Extrae hasta 2 colores dominantes (hex) de un buffer de imagen.
// Para el logo del cliente: así los colores quedan idénticos a su marca.
function extractColorsFromBuffer(buf) {
  return new Promise((resolve, reject) => {
    if (!Buffer.isBuffer(buf) || !buf.length) return reject(new Error('Imagen vacía'));
    const tmp = path.join(os.tmpdir(), `posta-logo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`);
    fs.writeFileSync(tmp, buf);
    execFile('python3', [EXTRACT_COLORS_SCRIPT, tmp], { timeout: 10000 }, (err, stdout) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (err) return reject(new Error('No pudimos leer los colores'));
      const cols = String(stdout || '').trim().split(/\s+/).filter((c) => /^#[0-9A-F]{6}$/.test(c));
      if (!cols.length) return reject(new Error('No encontramos colores en esa imagen'));
      resolve(cols.slice(0, 2));
    });
  });
}

// Variante "rica" de la extracción, SOLO para la paleta del feed: hasta 10
// colores por foto con la fracción de píxeles que ocupa cada uno
// (extract_colors.py rich). El modo clásico de 2 colores queda intacto para
// los logos. Si el script no devuelve el formato con pesos (deploy parcial),
// resuelve [] y extractPaletteFromBuffers degrada al modo clásico.
function extractRichColorsFromBuffer(buf) {
  return new Promise((resolve) => {
    if (!Buffer.isBuffer(buf) || !buf.length) return resolve([]);
    const tmp = path.join(os.tmpdir(), `posta-feed-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`);
    try { fs.writeFileSync(tmp, buf); } catch (e) { return resolve([]); }
    execFile('python3', [EXTRACT_COLORS_SCRIPT, tmp, 'rich'], { timeout: 10000 }, (err, stdout) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (err) return resolve([]);
      const out = [];
      for (const line of String(stdout || '').split('\n')) {
        const m = /^#([0-9A-F]{6})\s+([0-9]*\.?[0-9]+)$/.exec(line.trim());
        if (m) out.push({ hex: '#' + m[1], w: parseFloat(m[2]) });
      }
      resolve(out);
    });
  });
}

// ---------- Paleta HEREDADA del feed (v192, criterio v202) ----------
// La semana hereda la línea visual del perfil que ya existe. El criterio
// viejo contaba recurrencia por HEX EXACTO entre fotos (el mismo verde de
// marca con dos hex apenas distintos contaba como dos colores distintos) y
// desempataba por saturación: ganaba el color más vivo de UNA foto suelta
// (el rosa de un refresher de Starbucks, el rojo de una zapatilla de
// Adidas). El criterio nuevo:
//  1. Se leen hasta 10 colores por foto CON su fracción de píxeles
//     (extractRichColorsFromBuffer) y se AGRUPAN por cercanía (distancia
//     RGB < 48, la misma diversidad que usa extract_colors.py) ANTES de
//     contar: la recurrencia se mide por GRUPO entre fotos, y el tono que
//     representa al grupo es el hex exacto con más píxeles del grupo
//     (tono real, no promedio — la misma filosofía que para los logos).
//  2. Orden de mérito: primero en cuántas fotos aparece el grupo; la
//     fracción total de píxeles y la saturación solo desempatan. "Aparecer"
//     exige presencia real: >= 0,5% de los píxeles de esa foto (un logo o
//     un detalle de 0,2% no es el color de la foto, y sin este piso los
//     tonos residuales de un collage "aparecen" en todas las fotos y le
//     ganan a un color que ocupa media foto en dos). El accent tiene que
//     ser un color VIVO (saturación >= 0.25): un fondo crema repetido es
//     fondo, no acento de marca. Y tiene que tener PRESENCIA LUMINOSA:
//     luminancia relativa (WCAG) >= 0.18. El accent es el color de ACCIÓN
//     de las piezas — tiñe botones, resaltados y CTAs — y un tono
//     casi-negro no funciona ahí aunque se repita en todas las fotos (el
//     marrón piel/estadio que domina un feed de deportes, el navy de un
//     logo): para los fondos oscuros ya existe el rol oscuro derivado
//     (poster_dark), que se calcula aparte. Un grupo que no llega al piso
//     de luz no desaparece del feed: sigue pudiendo ser botón si cumple
//     el criterio del botón (punto 4, que ya excluye casi-negros y
//     casi-blancos: ambos pisos son la misma idea — los extremos de luz
//     no son colores de acción).
//  3. Un color de una sola foto NO es accent si existe algún grupo vivo
//     presente en 2+ fotos. Y si NINGÚN grupo vivo se repite, solo gana
//     uno que DOMINE el color del feed: más de la mitad del peso de
//     todos los grupos vivos y al menos ~1/3 de foto de píxeles. Si no
//     hay ni recurrencia ni dominancia, se devuelve null y el llamador
//     conserva la paleta anterior (foto de perfil o rubro): el feed no
//     tenía un color de marca claro y es más honesto no inventarlo.
//  4. El botón es un color de acción: distinguible del accent (distancia
//     RGB > 90), nunca un extremo casi-negro o casi-blanco (eso no es un
//     color, es una sombra o un brillo), y preferentemente vivo de verdad
//     (saturación >= 0.40: un tierra de fondo con 0,35 no es un CTA) con
//     presencia real (>= 2% de píxeles del feed) y recurrente; si no hay
//     uno así, el distinguible más recurrente/pesado, aunque sea apagado.
// El contraste legible lo sigue garantizando demoColors/textOn, como hoy.
const PALETTE_GROUP_DIST = 48;   // cercanía RGB para agrupar tonos
const PALETTE_SAT_MIN = 0.25;    // saturación mínima de un color "vivo"
const PALETTE_PRESENCE_MIN_W = 0.005; // presencia real de un grupo en una foto
const PALETTE_DOM_SHARE = 0.5;   // cuota de dominancia sobre grupos vivos
const PALETTE_DOM_MIN_W = 0.3;   // peso absoluto mínimo del dominante
const PALETTE_BTN_SAT_MIN = 0.40; // saturación mínima de un botón "vivo"
const PALETTE_BTN_MIN_W = 0.02;  // presencia mínima de un botón vivo
const PALETTE_ACCENT_LUM_MIN = 0.18; // luminancia relativa (WCAG) mínima del accent: es color de acción, necesita presencia luminosa
function hexToRgbArr(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colorSat(hex) {
  const [r, g, b] = hexToRgbArr(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}
function colorDist(a, b) {
  const A = hexToRgbArr(a), B = hexToRgbArr(b);
  return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
}
// Luminancia relativa WCAG (sRGB linealizado): 0 = negro, 1 = blanco.
function colorLum(hex) {
  const [r, g, b] = hexToRgbArr(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
async function extractPaletteFromBuffers(buffers) {
  const list = (buffers || []).filter((b) => Buffer.isBuffer(b) && b.length).slice(0, 6);
  if (!list.length) return null;
  // Colores por foto con su peso (fracción de píxeles). Si el modo rico no
  // devolvió nada en NINGUNA foto, se degrada al modo clásico de 2 colores
  // por foto con peso 1 (la recurrencia por grupo sigue funcionando).
  let perPhoto = [];
  for (const b of list) perPhoto.push(await extractRichColorsFromBuffer(b).catch(() => []));
  if (perPhoto.every((cols) => !cols.length)) {
    perPhoto = [];
    for (const b of list) {
      let cols = [];
      try { cols = await extractColorsFromBuffer(b); } catch (e) { cols = []; }
      perPhoto.push(cols.map((hex) => ({ hex, w: 1 })));
    }
  }
  // Agrupar por cercanía ANTES de contar recurrencia: cada color entra al
  // primer grupo cuyo tono representativo esté a < 48 RGB; si no hay, abre
  // grupo nuevo. El representativo es el hex exacto con más peso del grupo.
  const groups = []; // { hexW: Map(hex->peso), pesoFoto: Map(foto->peso), peso }
  const repOf = (g) => [...g.hexW.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // Presencia real del grupo: en cuántas fotos pesa >= PALETTE_PRESENCE_MIN_W.
  const fotosDe = (g) => [...g.pesoFoto.values()].filter((w) => w >= PALETTE_PRESENCE_MIN_W).length;
  const flat = [];
  perPhoto.forEach((cols, i) => cols.forEach((c) => flat.push({ hex: c.hex, w: c.w, photo: i })));
  flat.sort((a, b) => b.w - a.w);
  for (const c of flat) {
    let g = null;
    for (const cand of groups) {
      if (colorDist(c.hex, repOf(cand)) < PALETTE_GROUP_DIST) { g = cand; break; }
    }
    if (!g) { g = { hexW: new Map(), pesoFoto: new Map(), peso: 0 }; groups.push(g); }
    g.hexW.set(c.hex, (g.hexW.get(c.hex) || 0) + c.w);
    g.pesoFoto.set(c.photo, (g.pesoFoto.get(c.photo) || 0) + c.w);
    g.peso += c.w;
  }
  if (!groups.length) return null;
  // Mérito: recurrencia entre fotos → peso total → saturación.
  const byMerit = (a, b) =>
    (fotosDe(b) - fotosDe(a)) || (b.peso - a.peso) || (colorSat(repOf(b)) - colorSat(repOf(a)));
  const vivos = groups.filter((g) => colorSat(repOf(g)) >= PALETTE_SAT_MIN);
  if (!vivos.length) return null;
  // Piso de luz del accent (punto 2): solo los grupos vivos con
  // luminancia relativa >= PALETTE_ACCENT_LUM_MIN compiten por accent.
  // Los demás no se descartan del todo: quedan en `groups` y pueden
  // salir como botón si cumplen su propio criterio.
  const elegibles = vivos.filter((g) => colorLum(repOf(g)) >= PALETTE_ACCENT_LUM_MIN);
  if (!elegibles.length) return null; // hay color vivo pero ninguno sirve de acción: fallback del llamador
  let accentG = elegibles.filter((g) => fotosDe(g) >= 2).sort(byMerit)[0] || null;
  if (!accentG) {
    // Sin recurrencia: solo un dominante claro del color vivo y
    // luminoso del feed (la cuota se mide sobre los elegibles).
    const totalElegibles = elegibles.reduce((s, g) => s + g.peso, 0);
    accentG = elegibles
      .filter((g) => g.peso >= PALETTE_DOM_MIN_W && totalElegibles > 0 && g.peso / totalElegibles > PALETTE_DOM_SHARE)
      .sort(byMerit)[0] || null;
  }
  if (!accentG) return null; // el feed no tiene color de marca claro: fallback del llamador
  const accent = repOf(accentG);
  // Botón: distinguible del accent y jamás un extremo (casi-negro o
  // casi-blanco, con el mismo criterio con que extract_colors.py ignora
  // esos píxeles). Se prefiere un color de acción de verdad: vivo
  // (sat >= PALETTE_BTN_SAT_MIN) con presencia (peso >= PALETTE_BTN_MIN_W).
  const esExtremo = (hex) => {
    const [r, g, b] = hexToRgbArr(hex);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx < 60 || (mx > 242 && mn > 225);
  };
  const distinguibles = groups
    .filter((g) => g !== accentG && !esExtremo(repOf(g)) && colorDist(repOf(g), accent) > 90)
    .sort(byMerit);
  const btnG = distinguibles.find((g) => colorSat(repOf(g)) >= PALETTE_BTN_SAT_MIN && g.peso >= PALETTE_BTN_MIN_W)
    || distinguibles[0] || null;
  return { accent, btn: btnG ? repOf(btnG) : null };
}

// ---------- Paleta COMPLETA de los últimos posteos (v203) ----------
// Sobre extractPaletteFromBuffers (accent/btn), esta variante devuelve
// el SET COMPLETO de roles desde los posteos MÁS RECIENTES del feed
// (hasta 6 buffers, en orden de feed): principal, acento, oscuro,
// claro/crema y fondo dominante. Es la fuente de la directiva dura de
// paleta del demo con IA: los fondos de las piezas salen de ESTOS hex,
// no de colores que el modelo inventa. Los grupos se forman con la
// misma agrupación por cercanía que la paleta base. oscuro/claro salen
// de los grupos reales del feed cuando tienen presencia; si no, se
// derivan del principal preservando el tono (misma matemática que
// posterBgFor/posterBgLightFor: bajar o subir luminancia).
function lumOfHex(hex) {
  const [r, g, b] = hexToRgbArr(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function hexToLum(hex, target) {
  let [r, g, b] = hexToRgbArr(hex);
  const L = lumOfHex(hex) || 1;
  if (Math.abs(L - target) < 0.01) return String(hex).toUpperCase();
  if (L > target) {
    const s = target / L;
    r = Math.round(r * s); g = Math.round(g * s); b = Math.round(b * s);
  } else {
    const t = (target - L) / (1 - L);
    const mix = (c) => Math.round(c + (255 - c) * t);
    r = mix(r); g = mix(g); b = mix(b);
  }
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}
async function extractFeedPaletteFromBuffers(buffers) {
  const list = (buffers || []).filter((b) => Buffer.isBuffer(b) && b.length).slice(0, 6);
  if (!list.length) return null;
  const base = await extractPaletteFromBuffers(list).catch(() => null);
  if (!base || !base.accent) return null; // sin color de marca claro no se fuerza paleta
  let perPhoto = [];
  for (const b of list) perPhoto.push(await extractRichColorsFromBuffer(b).catch(() => []));
  if (perPhoto.every((cols) => !cols.length)) {
    perPhoto = [];
    for (const b of list) {
      let cols = [];
      try { cols = await extractColorsFromBuffer(b); } catch (e) { cols = []; }
      perPhoto.push(cols.map((hex) => ({ hex, w: 1 })));
    }
  }
  const groups = [];
  const repOf = (g) => [...g.hexW.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const flat = [];
  perPhoto.forEach((cols, i) => cols.forEach((c) => flat.push({ hex: c.hex, w: c.w, photo: i })));
  flat.sort((a, b) => b.w - a.w);
  for (const c of flat) {
    let g = null;
    for (const cand of groups) {
      if (colorDist(c.hex, repOf(cand)) < PALETTE_GROUP_DIST) { g = cand; break; }
    }
    if (!g) { g = { hexW: new Map(), fotos: new Set(), peso: 0 }; groups.push(g); }
    g.hexW.set(c.hex, (g.hexW.get(c.hex) || 0) + c.w);
    g.fotos.add(c.photo);
    g.peso += c.w;
  }
  const principal = base.accent;
  const acento = base.btn || null;
  let bg = null, dark = null, light = null;
  if (groups.length) {
    const byPeso = [...groups].sort((a, b) => b.peso - a.peso);
    bg = repOf(byPeso[0]); // fondo dominante: el grupo con más píxeles del feed reciente
    const darkG = byPeso.find((g) => lumOfHex(repOf(g)) <= 0.30);
    if (darkG) dark = hexToLum(repOf(darkG), Math.min(0.22, lumOfHex(repOf(darkG))));
    const lightG = byPeso.find((g) => lumOfHex(repOf(g)) >= 0.70);
    if (lightG) light = hexToLum(repOf(lightG), Math.max(0.86, lumOfHex(repOf(lightG))));
  }
  if (!dark) dark = posterBgFor(principal, acento || principal);
  if (!light) light = posterBgLightFor(principal, acento || principal);
  if (!bg) bg = light;
  const hexes = [...new Set([principal, acento, dark, light, bg].filter(Boolean))];
  return { principal, accent: acento, dark, light, bg, hexes, source: 'latest-posts' };
}

// ---------- (v197) REGISTRO LUMÍNICO heredado del feed ----------
// La luminancia media de hasta 3 fotos del feed (las mismas que ya se
// leyeron para la paleta — cero fetches nuevos) decide el registro de
// las piezas gráficas de la semana: un feed luminoso (crema, amarillo,
// pastel — como el de @posty.hacetodo, que mide ~0,62) produce fondos
// CLAROS; un feed oscuro mantiene el registro oscuro. Devuelve la
// luminancia 0..1 o null si no se pudo medir (sin perfil → el llamador
// conserva el comportamiento de siempre). El umbral vive en el
// llamador (server.js): >= 0,55 = luminoso.
const FEED_LUMINANCE_SCRIPT = path.join(__dirname, 'feed-luminance.py');
function feedLuminanceFromBuffers(buffers) {
  const list = (buffers || []).filter((b) => Buffer.isBuffer(b) && b.length).slice(0, 3);
  if (!list.length) return Promise.resolve(null);
  const tmps = list.map((b, i) => {
    const tmp = path.join(os.tmpdir(), `posta-lum-${Date.now()}-${i}-${crypto.randomBytes(4).toString('hex')}.jpg`);
    fs.writeFileSync(tmp, b);
    return tmp;
  });
  return new Promise((resolve) => {
    execFile('python3', [FEED_LUMINANCE_SCRIPT, ...tmps], { timeout: 10000 }, (err, stdout) => {
      for (const t of tmps) { try { fs.unlinkSync(t); } catch (_) {} }
      if (err) return resolve(null);
      const v = parseFloat(String(stdout || '').trim());
      resolve(Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
    });
  });
}

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': IG_UA, 'Accept-Language': 'es-AR,es;q=0.9' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return httpsGet(res.headers.location, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('http ' + res.statusCode)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  });
}

async function fetchIgProfile(ig) {
  // Devuelve { colors, pic, name } o null. Best-effort con timeouts acotados.
  const user = String(ig || '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 40);
  if (!user) return null;
  const page = await httpsGet('https://www.instagram.com/' + user + '/embed/', 8000);
  const html = page.body.toString('utf8');
  // Verificamos que la página sea realmente del usuario pedido (no un challenge)
  const who = '\\"username\\":\\"' + user.toLowerCase() + '\\"';
  if (!html.toLowerCase().includes(who)) return null;
  const m = html.match(/profile_pic_url.{0,6}?"(https:[^"]+)"/);
  if (!m) return null;
  const picUrl = m[1].replace(/\\/g, '');
  // Solo aceptamos la CDN oficial de Instagram (anti-SSRF)
  if (!/^https:\/\/[a-z0-9.-]*cdninstagram\.com\//i.test(picUrl)) return null;
  const img = await httpsGet(picUrl, 6000);
  if (!String(img.headers['content-type'] || '').startsWith('image/')) return null;
  const nm = html.match(/\\"full_name\\":\\"([^\\]+)\\"/);
  const name = nm ? nm[1].replace(/[\u0000-\u001F]/g, '').slice(0, 60) : '';
  const tmp = path.join(os.tmpdir(), 'igpic-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.jpg');
  fs.writeFileSync(tmp, img.body);
  try {
    const out = await new Promise((resolve, reject) => {
      execFile('python3', [EXTRACT_COLORS_SCRIPT, tmp], { timeout: 8000 }, (err, stdout) => {
        if (err) return reject(err);
        resolve(String(stdout || '').trim());
      });
    });
    const cols = out.split(/\s+/).filter((c) => /^#[0-9A-F]{6}$/.test(c));
    return {
      colors: cols.length ? cols : null,
      pic: 'data:image/jpeg;base64,' + img.body.toString('base64'),
      name,
    };
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}
// ---------- Prueba en 1 campo: prefill por @ de Instagram ----------
// Devuelve el HTML crudo de la página embed del perfil, o null si el perfil
// no existe, es privado o Instagram devuelve otra cosa (mismo chequeo de
// identidad que fetchIgProfile). No descarga la foto: solo el HTML.
async function fetchIgEmbedHtml(ig) {
  const user = String(ig || '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 40);
  if (!user) return null;
  let page;
  try {
    page = await httpsGet('https://www.instagram.com/' + user + '/embed/', 8000);
  } catch (e) {
    return null;
  }
  const html = page.body.toString('utf8');
  // Verificamos que la página sea realmente del usuario pedido (no un challenge)
  const who = '\\"username\\":\\"' + user.toLowerCase() + '\\"';
  if (!html.toLowerCase().includes(who)) return null;
  return html;
}

// Extrae la biografía del HTML del embed (mismo patrón de JSON escapado que
// full_name en fetchIgProfile). Solo acepta escapes conocidos (\n \r \t \/
// \uXXXX) dentro del valor: así el match se detiene en el PRIMER cierre \" y
// no se come el resto del HTML. Devuelve '' si no hay biografía.
function extractIgBiography(html) {
  const m = String(html || '').match(/\\"biography\\":\\"((?:\\[nrt\\/]|\\u[0-9a-fA-F]{4}|[^"\\])*)\\"/);
  if (!m) return '';
  return m[1]
    .replace(/\\([nrt])/g, ' ')
    .replace(/\\\//g, '/')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => {
      try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return ''; }
    })
    .replace(/[\u0000-\u001F]/g, '')
    .slice(0, 500);
}

// Keywords → una de las 25 CATEGORIES. Orden: primero las más específicas
// (barberia antes que bar, cafeteria antes que gastronomia genérica).
const CATEGORY_KEYWORDS = [
  [/caf[eé]|coffee|cafeter[ií]a|barista|tostadur[ií]a|espresso|cappuccino|latte|pasteler[ií]a|panader[ií]a|brunch|medialuna|churro|desayuno|merienda/i, 'cafeteria'],
  [/peluquer[ií]a|barber[ií]a|\bbarber\b|corte de pelo|peluquer[ií]a canina/i, 'barberia'],
  [/\bbar\b|pub|cocteler[ií]a|cocktail|trago|cervecer[ií]a|birra|\bvino\b|vinoteca/i, 'bar'],
  [/gimnasio|fitness|\bgym\b|entreno|crossfit|personal trainer|musculaci[oó]n|yoga|pilates/i, 'fitness'],
  [/restaurant|parrilla|pizzer[ií]a|sushi|hamburguesa|comida|empanada|men[uú]|chef|cocina|gastronom|rotiser[ií]a|helader[ií]a|chiviter[ií]a/i, 'gastronomia'],
  [/hotel|hostel|excursi[oó]n|aerol[ií]nea|vacaci[oó]n|posada|caba[nñ]a|apart hotel/i, 'turismo'],
  [/ropa|moda|indumentaria|vestimenta|boutique|streetwear|prenda|tienda de ropa|calzado|zapatilla/i, 'moda'],
  [/belleza|beauty|maquillaje|make ?up|est[eé]tica|skincare|\bspa\b|u[nñ]as|pesta[nñ]as|depilaci[oó]n|masaje|cosm[eé]tica/i, 'belleza'],
  [/mascota|perr[oa]|gat[oa]|veterinaria|\bpet\b|guarder[ií]a canina/i, 'mascotas'],
  [/odontolog|cl[ií]nica|kinesiolog|nutricionista|psic[oó]log|m[eé]dic[oa]|salud dental|fisioterapia|optica/i, 'salud'],
  [/mueble|muebler[ií]a|colch[oó]n|blanquer[ií]a|\bhogar\b/i, 'hogar'],
  [/inmobiliaria|real estate|propiedad|alquiler|departamento|terreno|tasaci[oó]n/i, 'inmobiliaria'],
  [/concesionaria|veh[ií]culo|taller mec[aá]nico|repuesto|\bmoto\b|neum[aá]tico|gomer[ií]a/i, 'autos'],
  [/escuela|colegio|universidad|curs[ao]s|clases|academia|instituto|educaci[oó]n|taller de/i, 'educacion'],
  [/hotel|hostel|excursi[oó]n|aerol[ií]nea|vacaci[oó]n|posada|caba[nñ]a|apart hotel/i, 'turismo'],
  [/casamiento|boda|quince|fiesta de 15|\bdj\b|sal[oó]n de|organizaci[oó]n de eventos|catering/i, 'eventos'],
  [/software|celular|smartphone|iphone|inform[aá]tica|computaci[oó]n|desarrollo web|programaci[oó]n|desarrollo de apps|aplicaciones m[oó]viles|apps m[oó]viles/i, 'tecnologia'],
  [/interiorismo|diseño de interiores|diseno de interiores|decoraci[oó]n de interiores/i, 'deco'],
  [/joyer[ií]a|relojer[ií]a|\boro\b|plater[ií]a|anillo/i, 'joyeria'],
  [/fotograf|photography|retrato|estudio fotogr[aá]fico/i, 'fotografia'],
  [/abogad|contad[oó]r|arquitecto|ingeniero|escribano|estudio jur[ií]dico|consultora/i, 'profesionales'],
  [/flores|florer[ií]a|florister[ií]a/i, 'flores'],
  [/plomero|electricista|alba[nñ]il|carpintero|limpieza|fumigaci[oó]n|reparaci[oó]n|servicio t[eé]cnico/i, 'servicios'],
  [/viajes|agencia de viajes/i, 'viajes'],
  [/tatuaje|tattoo|galer[ií]a|m[uú]sic[oa]|banda|\barte\b|artista/i, 'arte'],
];
// Mapea texto libre (biografía + nombre) a una categoría válida. Si nada
// matchea, devuelve 'otro'.
function categoryFromText(text) {
  const t = String(text || '');
  // La palabra ESPECÍFICA manda sobre la familia genérica: una bio que dice
  // maquillaje/make-up es belleza (y el subrubro makeup lo resuelve
  // demoSubcat), aunque también mencione "peluquería" al pasar. Solo una
  // barbería declarada (barbero/barba) le gana a esa regla.
  if (MAKEUP_RE.test(t) && !/barber|barba/i.test(t)) return 'belleza';
  // (v192) Un servicio de contenido / community manager NO es "tecnología"
  // aunque su bio diga "app" o "celular" (así se contaminó la semana de
  // @posty.hacetodo: reparación de celulares para un CM). Vende contenido,
  // comunidad y ventas: su base es 'profesionales' y demoSubcat le da los
  // temas de 'contenido'. Y la palabra "app" sola ya no categoriza en la
  // tabla de abajo: hoy la tiene cualquier negocio (pedidos, turnos...).
  if (CONTENIDO_SERVICE_RE.test(t)) return 'profesionales';
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(t)) return cat;
  }
  return 'otro';
}

// ---------- Render con streaming: emite cada PNG a medida que aparece ----------
// Variante de renderSpecPngs para el endpoint SSE: el python corre en segundo
// plano y hacemos poll del runDir cada ~400ms. Cuando post-{i}.png aparece y
// su tamaño queda estable ≥400ms (ya no lo está escribiendo el render), se
// llama a onPng(i, buf) en orden de índice. Resuelve { bufs, runDir } como
// renderSpecPngs. Si el render falla a mitad de camino, rechaza.
async function renderSpecPngsStream(specPosts, colors, onPng) {
  if (!pythonAvailable()) throw new Error('Generador no disponible en este momento');
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-spec-'));
  const specPath = path.join(runDir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify({ fonts_dir: FONTS_DIR, colors: demoColors(colors.accent, colors.btn, colors.register), posts: paraRender(specPosts) }));
  let renderErr = null;
  let renderDone = false;
  // NOTA (2026-10-17): se probó partir el render en dos procesos Python
  // en paralelo y en la instancia actual NO ayudó (la CPU es compartida:
  // el trabajo total manda). Queda el proceso único de siempre.
  const renderPromise = runDemoRender([DEMO_SCRIPT, specPath, runDir])
    .then(() => { renderDone = true; }, (e) => { renderErr = e; renderDone = true; });
  try {
    const n = specPosts.length;
    const emitted = new Array(n).fill(false);
    const lastSize = new Array(n).fill(-1);
    let emittedCount = 0;
    while (emittedCount < n) {
      if (renderErr) throw renderErr; // el render murió: no van a aparecer más PNGs
      await new Promise((r) => setTimeout(r, 150));
      for (let i = 0; i < n; i++) {
        if (emitted[i]) continue;
        const p = path.join(runDir, `post-${i}.jpg`);
        let st;
        try { st = fs.statSync(p); } catch (_) { continue; }
        if (!st.isFile() || st.size < 1024) continue;
        if (lastSize[i] === st.size) {
          // Tamaño estable por ≥400ms: el python ya terminó de escribirlo.
          let buf;
          try { buf = fs.readFileSync(p); } catch (_) { continue; }
          emitted[i] = true;
          emittedCount++;
          try { await onPng(i, buf); } catch (_) { /* el consumidor maneja sus errores */ }
        } else {
          lastSize[i] = st.size;
        }
      }
    }
    await renderPromise;
    if (renderErr) throw renderErr;
    const bufs = specPosts.map((_, i) => fs.readFileSync(path.join(runDir, `post-${i}.jpg`)));
    return { bufs, runDir };
  } catch (e) {
    try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
    throw e;
  }
}
module.exports = {
  parseMultipart,
  validImageKind,
  checkRateLimit,
  checkTrialAllowed,
  consumeTrialAttempt,
  refundTrialAttempt,
  clientIp,
  generateDemo,
  buildDemoSpec,
  redesignDemo,
  trialPhotoOptions,
  extractColorsFromBuffer,
  extractPaletteFromBuffers,
  extractFeedPaletteFromBuffers,
  feedLuminanceFromBuffers,
  demoColors,
  posterBgLightFor,
  toTu: captions.toTu,
  demoHashtags: captions.demoHashtags,
  // Prueba en 1 campo (prefill + streaming)
  fetchIgEmbedHtml,
  extractIgBiography,
  categoryFromText,
  renderSpecPngs,
  renderSpecPngsStream,
  renderVideoB64,
  DEMO_TOPICS: captions.DEMO_TOPICS,
  resolveTrialCaption: captions.resolveTrialCaption,
  capHeadlineWords: captions.capHeadlineWords,
  assignTextModes: captions.assignTextModes,
  captionEndsWithCta: captions.captionEndsWithCta,
  ensureCaptionCtaClose: captions.ensureCaptionCtaClose,
  DEMO_LIMIT_PER_DAY,
  DEMO_ENGINE_V,
  PHOTO_TAGS,
  TEMA_CONFLICTS,
  AUDIENCE_FORBIDDEN_TEMAS,
  PHOTO_WORLD,
  PHOTO_STRONG_TEMAS,
  photoGateCtx,
  photoPassesGate,
  pickPhotoGated,
  topicPhotoMatchable,
  posterBgFor,
  treatmentForStyle,
  dishOf,
  demoSubcat,
  pickDemoStyles,
  DESIGN_LANGUAGES,
  designLanguageOf,
  enforceDesignLanguages,
  pickPhotoTagged,
  MAX_FILE_BYTES,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_PHOTOS,
  CATEGORY_COLORS,
  COUNTRIES,
  fetchIgProfile,
};
