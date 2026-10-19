'use strict';
/* =====================================================================
 * rubro-id.js — IDENTIFICACIÓN ESPECIALISTA DE RUBRO (v235, 2026-10-18)
 * Orden de Valentino: "Tenemos que ser especialistas en identificar el
 * rubro de los Instagrams de los clientes y sus websites también" —
 * porque de esa identificación cuelgan las DOS decisiones del producto:
 * (1) QUÉ POSTEOS hacemos (temas/bancos) y (2) QUÉ PROMPTS usamos
 * (pools y picks del catálogo). Y su regla de oro, textual: "si no
 * estamos 100% seguros de su rubro, Posty pregunta".
 *
 * Reemplaza como cerebro de detección al regex único de
 * demo.categoryFromText (que queda como fallback histórico de un solo
 * texto): acá vota un CONJUNTO de señales que el sistema ya recolecta,
 * cada una con fuente y peso, y el resultado es SIEMPRE:
 *
 *   { rubro, subrubro, confianza, segura, nivel_duda,
 *     candidatas[{rubro, subrubro, score}], evidencia[{fuente, señal,
 *     rubro, subrubro, peso}], familias{...} }
 *
 * REGLA DE CONFIANZA (documentada, es LA definición operativa de "100%
 * seguro" de Valentino): la candidata N.º 1 es segura si y solo si
 *   · su puntaje de rubro es ≥ 6,
 *   · le gana a la N.º 2 por un margen ≥ 4, y
 *   · votaron por ella ≥ 2 FAMILIAS de señales independientes
 *     (jsonld / catalogo / perfil / feed / igcat / form / vision).
 *     Excepción: un @type JSON-LD que vota por el ganador es la
 *     auto-declaración estructurada del negocio y cuenta por dos.
 * Si el rubro es seguro pero el SUBRUBRO no tiene ganador claro
 * (puntaje < 3 o margen < 2 entre subrubros del mismo rubro), el rubro
 * queda firme, el subrubro queda VACÍO y la duda es de subrubro.
 * Ante cualquier duda NO se adivina: rubro = la candidata 1 (el padre
 * seguro), subrubro = '' y needs_question — la pregunta la hace Posty
 * (en /prueba ANTES de generar; en clientes vía question_candidates).
 * Un subrubro jamás se usa sin estar confirmado por esta vara o por la
 * respuesta del dueño.
 *
 * Familias de señales (todas ya existen en el sistema; USD 0):
 *   jsonld   — el @type declarado por la propia web (web-extract).
 *   catalogo — vocabulario de productos/servicios (catálogo web
 *              profundo + servicios de la web + ítems del digest/ADN).
 *   perfil   — bio + nombre visible + HANDLE del Instagram.
 *   feed     — captions + hashtags minados de sus posteos.
 *   igcat    — la categoría declarada por la cuenta de IG, si viene.
 *   form     — el texto libre del formulario (descripción del negocio).
 *   vision   — desempate SOLO si el voto queda cerca: una llamada batch
 *              gpt-4o-mini sobre 3-4 fotos (≤ USD 0,01), inyectada por
 *              el llamador vía signals.visionKey — este módulo es puro
 *              y nunca llama a la red.
 *
 * Subrubros SOLO donde cambian posteos Y prompts (auditoría §5b):
 * belleza{peluqueria, makeup, unas, estetica} · gastronomia{sushi,
 * parrilla, pizzeria} · cafeteria{cafe, panaderia} · mascotas
 * {veterinaria, petshop} · autos{taller, repuestos} · inmobiliaria
 * {inmobiliaria, constructora} · fitness{gimnasio, entrenador} ·
 * flores{floreria, vivero}.
 * ===================================================================== */

// Rubros canónicos = el vocabulario de categorías del demo/perfil.
const RUBROS = [
  'moda', 'gastronomia', 'belleza', 'fitness', 'mascotas', 'salud', 'hogar',
  'inmobiliaria', 'autos', 'educacion', 'turismo', 'eventos', 'tecnologia',
  'deco', 'joyeria', 'fotografia', 'profesionales', 'flores', 'bar',
  'cafeteria', 'barberia', 'servicios', 'viajes', 'arte', 'otro',
];
const SUBRUBROS = {
  belleza: ['peluqueria', 'makeup', 'unas', 'estetica'],
  gastronomia: ['sushi', 'parrilla', 'pizzeria'],
  cafeteria: ['cafe', 'panaderia'],
  mascotas: ['veterinaria', 'petshop'],
  autos: ['taller', 'repuestos'],
  inmobiliaria: ['inmobiliaria', 'constructora'],
  fitness: ['gimnasio', 'entrenador'],
  flores: ['floreria', 'vivero'],
};
const RUBRO_LABELS = {
  moda: 'Moda / Tienda de ropa', gastronomia: 'Gastronomía / Restaurante',
  cafeteria: 'Cafetería', bar: 'Bar / Cervecería', belleza: 'Belleza / Estética',
  barberia: 'Barbería', fitness: 'Fitness / Gimnasio', mascotas: 'Mascotas / Veterinaria',
  salud: 'Salud / Odontología', hogar: 'Servicios para el hogar', deco: 'Muebles / Decoración',
  inmobiliaria: 'Inmobiliaria', autos: 'Autos / Taller', educacion: 'Educación / Cursos',
  tecnologia: 'Tecnología / Celulares', turismo: 'Turismo / Hotelería', viajes: 'Agencia de viajes',
  eventos: 'Eventos / Fiestas', fotografia: 'Fotografía', arte: 'Arte / Diseño',
  joyeria: 'Joyería / Accesorios', flores: 'Florería / Vivero',
  profesionales: 'Servicios profesionales', servicios: 'Servicios', otro: 'Otro',
};
const SUBRUBRO_LABELS = {
  peluqueria: 'Peluquería', makeup: 'Maquillaje', unas: 'Uñas', estetica: 'Estética / Spa',
  sushi: 'Sushi / Nikkei', parrilla: 'Parrilla / Restaurante', pizzeria: 'Pizzería',
  cafe: 'Café de especialidad', panaderia: 'Panadería / Pastelería',
  veterinaria: 'Veterinaria', petshop: 'Pet shop',
  taller: 'Taller mecánico', repuestos: 'Repuestos / Accesorios',
  inmobiliaria: 'Inmobiliaria', constructora: 'Constructora / Obras',
  gimnasio: 'Gimnasio', entrenador: 'Entrenador personal',
  floreria: 'Florería', vivero: 'Vivero / Plantas',
};
function labelFor(rubro, subrubro) {
  if (subrubro && SUBRUBRO_LABELS[subrubro]) return SUBRUBRO_LABELS[subrubro];
  return RUBRO_LABELS[rubro] || 'Otro';
}

// ---------- @type de JSON-LD (schema.org) → rubro/subrubro ----------
// La señal más declarativa que existe: el negocio se auto-clasificó en
// su propio sitio. Peso alto (10) y familia propia.
const JSONLD_MAP = {
  beautysalon: ['belleza', ''], hairsalon: ['belleza', 'peluqueria'],
  nailsalon: ['belleza', 'unas'], dayspa: ['belleza', 'estetica'],
  healthandbeautybusiness: ['belleza', ''], barbershop: ['barberia', ''],
  petstore: ['mascotas', 'petshop'], veterinarycare: ['mascotas', 'veterinaria'],
  autorepair: ['autos', 'taller'], autopartsstore: ['autos', 'repuestos'],
  autodealer: ['autos', ''], autorental: ['autos', ''],
  bakery: ['cafeteria', 'panaderia'], cafeorcoffeeshop: ['cafeteria', 'cafe'],
  restaurant: ['gastronomia', ''], fastfoodrestaurant: ['gastronomia', ''],
  foodestablishment: ['gastronomia', ''], barorpub: ['bar', ''], brewery: ['bar', ''],
  winestore: ['bar', ''], liquorstore: ['bar', ''],
  florist: ['flores', 'floreria'],
  healthclub: ['fitness', 'gimnasio'], exercisegym: ['fitness', 'gimnasio'],
  sportsclub: ['fitness', 'gimnasio'], sportsactivitylocation: ['fitness', ''],
  realestateagent: ['inmobiliaria', 'inmobiliaria'],
  generalcontractor: ['inmobiliaria', 'constructora'],
  clothingstore: ['moda', ''], shoestore: ['moda', ''], jewelrystore: ['joyeria', ''],
  furniturestore: ['hogar', ''], homegoodsstore: ['hogar', ''],
  electronicsstore: ['tecnologia', ''], mobilephonestore: ['tecnologia', ''],
  computerstore: ['tecnologia', ''], hardwarestore: ['hogar', ''],
  dentist: ['salud', ''], medicalclinic: ['salud', ''], medicalbusiness: ['salud', ''],
  physician: ['salud', ''], optician: ['salud', ''], pharmacy: ['salud', ''],
  hotel: ['turismo', ''], lodgingbusiness: ['turismo', ''], hostel: ['turismo', ''],
  motel: ['turismo', ''], campground: ['turismo', ''],
  travelagency: ['viajes', ''], touristinformationcenter: ['turismo', ''],
  school: ['educacion', ''], collegeoruniversity: ['educacion', ''],
  educationalorganization: ['educacion', ''], preschool: ['educacion', ''],
  tattooparlor: ['arte', ''], artgallery: ['arte', ''],
  accountingservice: ['profesionales', ''], attorney: ['profesionales', ''],
  legalservice: ['profesionales', ''], notary: ['profesionales', ''],
  professionalservice: ['profesionales', ''],
  electrician: ['servicios', ''], plumber: ['servicios', ''], locksmith: ['servicios', ''],
  housepainter: ['servicios', ''], movingcompany: ['servicios', ''],
  grocerystore: ['gastronomia', ''], supermarket: ['gastronomia', ''],
  conveniencestore: ['gastronomia', ''], bookstore: ['educacion', ''],
  photographer: ['fotografia', ''], localbusiness: ['', ''], organization: ['', ''],
  store: ['', ''], place: ['', ''],
};
function jsonldVote(typeRaw) {
  const types = String(typeRaw || '').split(/[\s,|]+/).map((t) => t.trim().toLowerCase().replace(/^https?:\/\/schema\.org\//, '')).filter(Boolean);
  for (const t of types) {
    const hit = JSONLD_MAP[t];
    if (hit && hit[0]) return { rubro: hit[0], subrubro: hit[1] || '', tipo: t };
  }
  return null;
}

// ---------- Vocabulario de textos (bio/captions/catálogo/form) ----------
// [regex, rubro, subrubro, peso, etiqueta]. TODAS las regex llevan bordes
// \b donde la palabra puede aparecer DENTRO de otra (el bug histórico:
// "vacunas" y "algunas" caían en belleza por u[nñ]as sin borde).
const TEXT_VOTES = [
  // --- belleza y sus oficios ---
  [/\bmaquillaje\b|\bmake\s?-?\s?up\b|\bmakeup\b|\bmaquilladora\b|\bmakeup artist\b/i, 'belleza', 'makeup', 3, 'maquillaje/makeup'],
  [/\bpeluquer[ií]a\b(?!\s+canina)|\bpeluquer[oa]\b|\bbalayage\b|\bmechas\b|\balisado\b|\bkeratina\b|\bbrushing\b|\bpeinados?\b|\btintura\b|\bcolorista\b|\bcorte de pelo\b/i, 'belleza', 'peluqueria', 3, 'peluquería'],
  [/\bu[ñn]as\b|\bpesta[ñn]as\b|\bnails?\b|\bmanicur\w*\b|\besmaltado\b|\besculpidas\b|\bsemipermanente\b/i, 'belleza', 'unas', 3, 'uñas'],
  [/\best[eé]tica\b|\bspa\b|\bfaciales?\b|\bdepilaci[oó]n\b|\bmasajes?\b|\bskincare\b|\bcosmetolog\w*\b|\btratamientos? (corporales|faciales)\b|\blifting\b|\bmicropigmentaci[oó]n\b|\bcejas\b/i, 'belleza', 'estetica', 2, 'estética/spa'],
  [/\bbelleza\b|\bbeauty\b|\bsal[oó]n de belleza\b/i, 'belleza', '', 2, 'belleza'],
  [/\bbarber[ií]a\b|\bbarber\w*\b|\bbarba\b|\bfade\b|\bnavaja\b|\bcorte masculino\b|\bbarbershop\b/i, 'barberia', '', 3, 'barbería'],
  // --- mascotas: veterinaria ≠ petshop ---
  [/\bveterinari\w*\b|\bvacunas?\b|\bcastraci[oó]n\b|\bcirug[ií]as?\b|\bcl[ií]nica veterinaria\b|\burgencias 24\s?h\b/i, 'mascotas', 'veterinaria', 3, 'veterinaria'],
  [/\bpet\s?shop\b|\bpetshop\b|\bpeluquer[ií]a canina\b|\bba[ñn]o canino\b|\balimento balanceado\b|\bguarder[ií]a canina\b|\bjuguetes para (perros|gatos|mascotas)\b/i, 'mascotas', 'petshop', 3, 'pet shop'],
  [/\bmascotas?\b|\bperros?\b|\bgatos?\b|\bcanino\b|\bfelino\b/i, 'mascotas', '', 1, 'mascotas'],
  // --- gastronomía y sus cocinas ---
  [/\bsushi\b|\bnikkei\b|\brolls?\b|\bnigiris?\b|\bomakase\b|\bsashimi\b|\bmakis?\b|\btiradito\b/i, 'gastronomia', 'sushi', 3, 'sushi/nikkei'],
  [/\bparrilla\w*\b|\basado\b|\bachuras\b|\bvac[ií]o\b|\bbife\b|\bbodeg[oó]n\b/i, 'gastronomia', 'parrilla', 3, 'parrilla'],
  [/\bpizzer[ií]a\b|\bpizzas?\b|\bmuzzarella\b|\bfugazzeta\b/i, 'gastronomia', 'pizzeria', 3, 'pizza'],
  [/\bhelader[ií]a\b|\bhelados artesanales\b/i, 'gastronomia', '', 2, 'heladería'],
  [/\brestaurante?\b|\brestaurant\b|\brotiser[ií]a\b|\bhamburgues\w*\b/i, 'gastronomia', '', 2, 'restaurante'],
  [/\bcocina\b|\bchef\b|\bmen[uú]\b|\bempanadas\b|\bpastas\b|\bmilanesas?\b|\bcomida\b/i, 'gastronomia', '', 1, 'cocina/comida'],
  // --- cafetería: café de especialidad ≠ panadería ---
  [/\bcafeter[ií]a\b|\bcoffee shop\b|\btostadur[ií]a\b|\bcaf[eé] de especialidad\b/i, 'cafeteria', 'cafe', 3, 'cafetería'],
  [/\bespresso\b|\bbarista\b|\blatte\b|\bcappuccino\b|\bflat white\b|\bspecialty coffee\b/i, 'cafeteria', 'cafe', 2, 'café de especialidad'],
  [/\bpanader[ií]a\b|\bpasteler[ií]a\b|\bfacturas\b|\bmedialunas\b|\bpanader\w*\b|\bbudines\b|\bpan dulce\b|\btortas por encargo\b/i, 'cafeteria', 'panaderia', 3, 'panadería/pastelería'],
  [/\bbrunch\b|\bdesayunos?\b|\bmeriendas?\b/i, 'cafeteria', '', 1, 'brunch/merienda'],
  // --- fitness: gimnasio ≠ entrenador ---
  [/\bgimnasio\b|\bgym\b|\bcrossfit\b|\bmusculaci[oó]n\b/i, 'fitness', 'gimnasio', 3, 'gimnasio'],
  [/\bfuncional\b|\bpilates\b|\byoga\b|\bspinning\b/i, 'fitness', 'gimnasio', 2, 'clases/gimnasio'],
  [/\bentrenador personal\b|\bpersonal trainer\b|\bpreparador f[ií]sico\b|\bentrenamiento personalizado\b|\bcoach personal\b|\bentrenador online\b|\bentrenamiento online\b|\bplanes de entrenamiento\b/i, 'fitness', 'entrenador', 3, 'entrenador personal'],
  [/\bfitness\b|\bentrenamiento\b|\bentrenar\b|\brutinas\b/i, 'fitness', '', 1, 'fitness'],
  // --- inmobiliaria: vender ≠ construir ---
  [/\binmobiliaria\b|\bpropiedades\b|\btasaciones\b|\breal estate\b|\balquiler de (departamentos|propiedades|inmuebles)\b|\bventa de (departamentos|propiedades|inmuebles|casas)\b/i, 'inmobiliaria', 'inmobiliaria', 3, 'inmobiliaria'],
  [/\bconstructora\b|\bconstrucci[oó]n\b|\breformas integrales\b|\bremodelaciones\b|\bedificaci[oó]n\b|\bdesarrollos inmobiliarios\b/i, 'inmobiliaria', 'constructora', 3, 'constructora'],
  [/\bobras\b|\breformas\b/i, 'inmobiliaria', 'constructora', 1, 'obras/reformas'],
  // --- autos: reparar ≠ vender repuestos ---
  [/\btaller mec[aá]nico\b|\bmec[aá]nica automotriz\b|\bservice y mantenimiento\b|\bfrenos\b|\balineaci[oó]n y balanceo\b|\bgomer[ií]a\b|\breparamos\b/i, 'autos', 'taller', 3, 'taller mecánico'],
  [/\brepuestos\b|\bautopartes\b|\bneum[aá]ticos\b|\bbater[ií]as para autos\b/i, 'autos', 'repuestos', 3, 'repuestos'],
  [/\bconcesionaria\b|\bveh[ií]culos\b|\btaller\b|\bmotos?\b/i, 'autos', '', 1, 'autos'],
  // --- flores: florería ≠ vivero ---
  [/\bflorer[ií]a\b|\bramos\b|\barreglos florales\b|\bflores frescas\b|\bbouquets?\b|\bflorista\b/i, 'flores', 'floreria', 3, 'florería'],
  [/\bvivero\b|\bmacetas\b|\bsuculentas\b|\bjardiner[ií]a\b|\bplantines\b/i, 'flores', 'vivero', 3, 'vivero'],
  [/\bplantas\b|\bflores\b/i, 'flores', '', 1, 'flores/plantas'],
  // --- rubros de un nivel ---
  [/\bmoda\b|\bindumentaria\b|\bboutique\b|\bstreetwear\b|\btienda de ropa\b|\bcalzado\b|\bzapatillas\b|\bprendas\b|\bropa\b/i, 'moda', '', 2, 'moda/ropa'],
  [/\bodontolog\w*\b|\bdentista\b|\bkinesiolog\w*\b|\bnutricionista\b|\bpsic[oó]log\w*\b|\b[oó]ptica\b|\bfisioterapia\b|\bsalud\b/i, 'salud', '', 2, 'salud'],
  [/\bcl[ií]nica\b/i, 'salud', '', 1, 'clínica'],
  [/\bmuebles?\b|\bmuebler[ií]a\b|\bcolchones\b|\bblanquer[ií]a\b|\bferreter[ií]a\b|\bherramientas\b|\bpinturer[ií]a\b/i, 'hogar', '', 2, 'hogar/muebles'],
  [/\binteriorismo\b|\bdise[ñn]o de interiores\b|\bdecoraci[oó]n de interiores\b|\bdeco\b/i, 'deco', '', 2, 'deco/interiorismo'],
  [/\bjoyer[ií]a\b|\bjoyas\b|\brelojer[ií]a\b|\bplater[ií]a\b|\banillos\b/i, 'joyeria', '', 2, 'joyería'],
  [/\bfotograf\w*\b|\bphotography\b|\bsesiones de fotos\b|\bestudio fotogr[aá]fico\b/i, 'fotografia', '', 2, 'fotografía'],
  [/\bcommunity manager\b|\bagencia de (marketing|contenido|publicidad|redes)\b|\bmarketing digital\b|\bmanejo de redes\b|\bcreaci[oó]n de contenido\b/i, 'profesionales', '', 3, 'contenido/CM'],
  [/\babogad\w*\b|\bcontad\w*\b|\bescriban\w*\b|\bestudio jur[ií]dico\b|\bestudio contable\b|\bconsultora\b|\barquitecto\b|\bingeniero\b/i, 'profesionales', '', 2, 'profesionales'],
  [/\bbar\b|\bpub\b|\bcervecer[ií]a\b|\bcocteler[ií]a\b|\bcocktails?\b|\btragos\b|\bvinoteca\b|\bbirra\b|\bvinos?\b/i, 'bar', '', 2, 'bar'],
  [/\bhotel\b|\bhostel\b|\bposada\b|\bcaba[ñn]as\b|\bapart hotel\b|\bturismo\b|\bexcursiones\b/i, 'turismo', '', 2, 'turismo/hotel'],
  [/\bagencia de viajes\b|\bviajes\b|\bpasajes\b|\baerol[ií]nea\b/i, 'viajes', '', 2, 'viajes'],
  [/\beventos\b|\bcasamientos?\b|\bbodas?\b|\bquince\w*\b|\bsal[oó]n de (fiestas|eventos)\b|\bcatering\b|\bdj\b|\bnovias?\b/i, 'eventos', '', 1, 'eventos'],
  [/\bescuela\b|\bcolegio\b|\binstituto\b|\bacademia\b|\bcursos\b|\buniversidad\b|\beducaci[oó]n\b/i, 'educacion', '', 2, 'educación'],
  [/\bcelulares\b|\bsmartphones?\b|\biphone\b|\binform[aá]tica\b|\bcomputaci[oó]n\b|\bdesarrollo web\b|\bprogramaci[oó]n\b|\bsoftware\b/i, 'tecnologia', '', 2, 'tecnología'],
  [/\bplomero\b|\belectricista\b|\bfumigaci[oó]n\b|\bservicio t[eé]cnico\b|\binstalaciones\b|\blimpieza\b|\breparaciones\b/i, 'servicios', '', 1, 'servicios/oficios'],
  [/\btatuajes?\b|\btattoo\b|\bgaler[ií]a de arte\b|\bartista\b/i, 'arte', '', 2, 'arte/tatuaje'],
];

// El HANDLE habla: @milicaratinimakeup contiene "makeup" aunque la bio
// no diga nada. Substring sobre el handle limpio (sin guiones ni puntos),
// familia 'perfil' (es la misma identidad que bio+nombre).
const HANDLE_TERMS = [
  ['makeup', 'belleza', 'makeup', 3], ['maquillaje', 'belleza', 'makeup', 3],
  ['nails', 'belleza', 'unas', 3], ['unas', 'belleza', 'unas', 3],
  ['peluqueria', 'belleza', 'peluqueria', 3], ['barber', 'barberia', '', 3],
  ['sushi', 'gastronomia', 'sushi', 3], ['pizza', 'gastronomia', 'pizzeria', 3],
  ['parrilla', 'gastronomia', 'parrilla', 3], ['resto', 'gastronomia', '', 2],
  ['vet', 'mascotas', 'veterinaria', 3], ['petshop', 'mascotas', 'petshop', 3],
  ['pet', 'mascotas', '', 2], ['cafe', 'cafeteria', '', 2], ['coffee', 'cafeteria', 'cafe', 3],
  ['panaderia', 'cafeteria', 'panaderia', 3], ['pasteleria', 'cafeteria', 'panaderia', 3],
  ['gym', 'fitness', 'gimnasio', 3], ['fitness', 'fitness', '', 3], ['trainer', 'fitness', 'entrenador', 3],
  ['floreria', 'flores', 'floreria', 3], ['flores', 'flores', '', 2], ['vivero', 'flores', 'vivero', 3],
  ['taller', 'autos', 'taller', 3], ['repuestos', 'autos', 'repuestos', 3],
  ['inmobiliaria', 'inmobiliaria', 'inmobiliaria', 3], ['constructora', 'inmobiliaria', 'constructora', 3],
  ['muebles', 'hogar', '', 2], ['joyeria', 'joyeria', '', 3], ['joyas', 'joyeria', '', 3],
  ['foto', 'fotografia', '', 2], ['tattoo', 'arte', '', 3], ['tatuaje', 'arte', '', 3],
  ['hotel', 'turismo', '', 2], ['viajes', 'viajes', '', 2], ['dental', 'salud', '', 3],
  ['odonto', 'salud', '', 3], ['deco', 'deco', '', 2], ['spa', 'belleza', 'estetica', 2],
  ['estetica', 'belleza', 'estetica', 2], ['heladeria', 'gastronomia', '', 2],
  ['moda', 'moda', '', 2], ['indumentaria', 'moda', '', 2], ['eventos', 'eventos', '', 2],
];

// Categoría declarada por la cuenta de IG (etiquetas en inglés de Meta),
// cuando la fuente la trae. Familia propia, peso 6.
const IGCAT_VOTES = [
  [/makeup artist/i, 'belleza', 'makeup', 'makeup artist'],
  [/hair salon|hair care/i, 'belleza', 'peluqueria', 'hair salon'],
  [/nail salon/i, 'belleza', 'unas', 'nail salon'],
  [/beauty salon|beauty supply/i, 'belleza', '', 'beauty'],
  [/barber/i, 'barberia', '', 'barber'],
  [/sushi/i, 'gastronomia', 'sushi', 'sushi'],
  [/pizza/i, 'gastronomia', 'pizzeria', 'pizza'],
  [/restaurant|food/i, 'gastronomia', '', 'restaurant'],
  [/pet store/i, 'mascotas', 'petshop', 'pet store'],
  [/veterinarian/i, 'mascotas', 'veterinaria', 'veterinarian'],
  [/auto repair/i, 'autos', 'taller', 'auto repair'],
  [/auto parts/i, 'autos', 'repuestos', 'auto parts'],
  [/bakery/i, 'cafeteria', 'panaderia', 'bakery'],
  [/coffee|cafe/i, 'cafeteria', 'cafe', 'coffee shop'],
  [/gym/i, 'fitness', 'gimnasio', 'gym'],
  [/personal trainer/i, 'fitness', 'entrenador', 'personal trainer'],
  [/fitness|health club/i, 'fitness', '', 'fitness'],
  [/florist/i, 'flores', 'floreria', 'florist'],
  [/nursery|garden/i, 'flores', 'vivero', 'garden/nursery'],
  [/real estate/i, 'inmobiliaria', 'inmobiliaria', 'real estate'],
  [/contractor|construction/i, 'inmobiliaria', 'constructora', 'construction'],
  [/clothing|boutique|fashion/i, 'moda', '', 'clothing'],
  [/dentist|clinic|health|medical/i, 'salud', '', 'health'],
  [/jewel/i, 'joyeria', '', 'jewelry'],
  [/photograph/i, 'fotografia', '', 'photographer'],
  [/hotel|lodging/i, 'turismo', '', 'hotel'],
  [/travel/i, 'viajes', '', 'travel'],
  [/spa|massage/i, 'belleza', 'estetica', 'spa'],
  [/tattoo/i, 'arte', '', 'tattoo'],
  [/lawyer|accounting|consulting|business service/i, 'profesionales', '', 'professional'],
  [/school|education/i, 'educacion', '', 'education'],
  [/bar|pub|brewery/i, 'bar', '', 'bar'],
  [/interior design/i, 'deco', '', 'interior design'],
  [/furniture|home goods/i, 'hogar', '', 'home'],
];

// ---------- El voto ----------
// tally: Map 'rubro|sub' -> {rubro, subrubro, score, familias:Set}
// y un mapa por rubro con sus familias (para la regla ≥2 familias).
function addVote(tally, familiasPorRubro, evidencia, fuente, señal, rubro, subrubro, peso) {
  if (!rubro || !RUBROS.includes(rubro) || !peso) return;
  const key = rubro + '|' + (subrubro || '');
  const cur = tally.get(key) || { rubro, subrubro: subrubro || '', score: 0 };
  cur.score += peso;
  tally.set(key, cur);
  if (!familiasPorRubro[rubro]) familiasPorRubro[rubro] = new Set();
  familiasPorRubro[rubro].add(fuente);
  evidencia.push({ fuente, señal, rubro, subrubro: subrubro || '', peso });
}
function voteText(tally, familiasPorRubro, evidencia, text, fuente) {
  const t = String(text || '').slice(0, 20000);
  if (!t.trim()) return;
  for (const [re, rubro, sub, w, tag] of TEXT_VOTES) {
    if (re.test(t)) addVote(tally, familiasPorRubro, evidencia, fuente, tag, rubro, sub, w);
  }
}
function voteHandle(tally, familiasPorRubro, evidencia, handle) {
  const h = String(handle || '').toLowerCase().replace(/[^a-z0-9áéíóúñü]/g, '');
  if (!h) return;
  for (const [term, rubro, sub, w] of HANDLE_TERMS) {
    if (h.includes(term)) addVote(tally, familiasPorRubro, evidencia, 'perfil', '@' + term, rubro, sub, w);
  }
}
function hashtagsOf(captions) {
  const out = [];
  for (const c of captions || []) {
    const m = String(c || '').match(/#[\p{L}\p{N}_]+/gu);
    if (m) out.push(...m);
  }
  return out.join(' ');
}

/* classifyBusiness(signals)
 * signals = {
 *   jsonldType,              // @type de la web (web-extract.categoryHint)
 *   catalogText,             // servicios/ítems del catálogo web + digest
 *   webText,                 // nombre + descripción de la web (familia catalogo)
 *   bio, fullName, handle,   // perfil de IG (familia perfil)
 *   captions: [],            // textos del feed (familia feed; los hashtags
 *                            //   se re-apenden una vez: doble peso deliberado)
 *   igCategory,              // categoría declarada de IG (familia igcat)
 *   formText,                // texto libre del formulario (familia form)
 *   visionKey,               // 'rubro' o 'rubro/subrubro' del desempate
 * }                                                        (familia vision)
 */
function classifyBusiness(signals) {
  const s = signals || {};
  const tally = new Map();
  const familiasPorRubro = {};
  const evidencia = [];

  const jv = jsonldVote(s.jsonldType);
  if (jv) addVote(tally, familiasPorRubro, evidencia, 'jsonld', '@type ' + jv.tipo, jv.rubro, jv.subrubro, 10);
  voteText(tally, familiasPorRubro, evidencia, [s.catalogText, s.webText].filter(Boolean).join(' '), 'catalogo');
  voteText(tally, familiasPorRubro, evidencia, [s.bio, s.fullName].filter(Boolean).join(' '), 'perfil');
  voteHandle(tally, familiasPorRubro, evidencia, s.handle);
  const caps = Array.isArray(s.captions) ? s.captions : [];
  voteText(tally, familiasPorRubro, evidencia, caps.join(' \n '), 'feed');
  voteText(tally, familiasPorRubro, evidencia, hashtagsOf(caps), 'feed');
  if (s.igCategory) {
    for (const [re, rubro, sub, tag] of IGCAT_VOTES) {
      if (re.test(String(s.igCategory))) addVote(tally, familiasPorRubro, evidencia, 'igcat', tag, rubro, sub, 6);
    }
  }
  voteText(tally, familiasPorRubro, evidencia, s.formText, 'form');
  if (s.visionKey) {
    const [vr, vs] = String(s.visionKey).split('/');
    addVote(tally, familiasPorRubro, evidencia, 'vision', 'fotos del negocio', vr, vs || '', 9);
  }

  // Agregación por rubro (los votos de subrubro suman al padre).
  const porRubro = {};
  for (const v of tally.values()) {
    porRubro[v.rubro] = porRubro[v.rubro] || { score: 0, subs: {} };
    porRubro[v.rubro].score += v.score;
    if (v.subrubro) porRubro[v.rubro].subs[v.subrubro] = (porRubro[v.rubro].subs[v.subrubro] || 0) + v.score;
  }
  const candidatas = Object.keys(porRubro)
    .map((rubro) => {
      const subs = Object.entries(porRubro[rubro].subs).sort((a, b) => b[1] - a[1]);
      return { rubro, subrubro: subs.length ? subs[0][0] : '', score: porRubro[rubro].score };
    })
    .sort((a, b) => b.score - a.score);

  const top = candidatas[0] || null;
  const second = candidatas[1] || null;
  let rubro = 'otro'; let subrubro = ''; let segura = false; let nivel_duda = 'rubro';
  let confianza = 0;

  if (top && top.score > 0) {
    rubro = top.rubro;
    let famTop = familiasPorRubro[top.rubro] ? familiasPorRubro[top.rubro].size : 0;
    // Excepción documentada: un @type de JSON-LD con voto para el rubro
    // ganador es la auto-declaración estructurada del propio negocio
    // (equivalente a que lo escriba en el formulario): cuenta como dos
    // familias a efectos de la vara. Un @type genérico (Store/
    // LocalBusiness) no vota, así que nunca dispara solo.
    if (jv && jv.rubro === top.rubro) famTop = Math.max(famTop, 2);
    const margen = top.score - (second ? second.score : 0);
    const seguraRubro = top.score >= 6 && margen >= 4 && famTop >= 2;
    // Subrubro claro: ganador ≥3 y margen ≥2 contra el subrubro rival.
    const subsOrdenados = Object.entries(porRubro[top.rubro].subs).sort((a, b) => b[1] - a[1]);
    const subTop = subsOrdenados[0] || null;
    const subSegundo = subsOrdenados[1] || null;
    const subClaro = !!subTop && subTop[1] >= 3 && (subTop[1] - (subSegundo ? subSegundo[1] : 0)) >= 2;
    const tieneSubrubros = (SUBRUBROS[top.rubro] || []).length > 0;
    if (subClaro) subrubro = subTop[0];
    if (seguraRubro && (!tieneSubrubros || subClaro)) {
      segura = true; nivel_duda = null;
    } else if (seguraRubro) {
      nivel_duda = 'subrubro';
    } else {
      nivel_duda = 'rubro';
    }
    // Confianza: foto del voto — participación del ganador × familias ×
    // masa de evidencia. "Segura" la fija el predicado de arriba (que la
    // deja en ≥0,85); el número solo nunca declara certeza.
    const share = top.score / (top.score + (second ? second.score : 0));
    const famFactor = famTop >= 2 ? 1 : 0.55;
    const massFactor = Math.min(1, top.score / 10);
    confianza = Math.round(Math.min(0.99, share * famFactor * massFactor) * 100) / 100;
    if (segura) confianza = Math.max(confianza, 0.85);
    else confianza = Math.min(confianza, 0.79);
  }

  evidencia.sort((a, b) => b.peso - a.peso);
  return {
    rubro, subrubro, confianza, segura, nivel_duda,
    necesita_pregunta: !segura,
    candidatas: candidatas.slice(0, 5),
    evidencia: evidencia.slice(0, 12),
    familias: Object.fromEntries(Object.entries(familiasPorRubro).map(([r, set]) => [r, [...set]])),
  };
}

/* needsVisionTiebreak(result) — el desempate por visión SOLO se gasta
 * cuando el voto determinístico quedó cerca (nunca como primera vía). */
function needsVisionTiebreak(result) {
  if (!result || result.segura) return false;
  const c = result.candidatas || [];
  if (c.length < 2) return false;
  return (c[0].score - c[1].score) <= 3;
}

/* questionOptions(result) — las 2-4 opciones de un toque para la
 * pregunta ("¿Tu negocio es más bien…?"). Nivel 'rubro': las candidatas
 * por rubro con su mejor subrubro. Nivel 'subrubro': los subrubros del
 * rubro firme + la mejor alternativa de otro rubro si compite. */
function questionOptions(result) {
  const opts = [];
  const seen = new Set();
  const push = (rubro, subrubro) => {
    const key = rubro + '|' + (subrubro || '');
    if (seen.has(key) || opts.length >= 4) return;
    seen.add(key);
    opts.push({ rubro, subrubro: subrubro || '', label: labelFor(rubro, subrubro) });
  };
  if (!result) return opts;
  if (result.nivel_duda === 'subrubro' && result.rubro) {
    for (const sub of (SUBRUBROS[result.rubro] || [])) push(result.rubro, sub);
    const alt = (result.candidatas || []).find((c) => c.rubro !== result.rubro);
    if (alt && opts.length < 4) push(alt.rubro, alt.subrubro);
  } else {
    for (const c of (result.candidatas || []).slice(0, 4)) push(c.rubro, c.subrubro);
  }
  return opts;
}

/* resolveRubro({confirmed, cls}) — LA resolución que consume la cadena.
 * confirmed = {rubro, subrubro, fuente:'pregunta'|'form'} (manda siempre).
 * Sin confirmación y sin certeza: category = rubro padre seguro,
 * subcat = '' y sin_confirmar — ningún posteo usa un subrubro que el
 * dueño no confirmó o el voto no cerró. */
function resolveRubro(input) {
  const { confirmed, cls } = input || {};
  if (confirmed && confirmed.rubro && RUBROS.includes(confirmed.rubro)) {
    return {
      category: confirmed.rubro,
      subcat: confirmed.subrubro || '',
      rubroId: {
        v: 1, rubro: confirmed.rubro, subrubro: confirmed.subrubro || '',
        confianza: 1, fuente: confirmed.fuente || 'pregunta',
        segura: true, needs_question: false, sin_confirmar: false,
        candidatas: cls ? cls.candidatas : [],
      },
      rubroCheck: { needed: false, options: [], detected: cls || null },
    };
  }
  const c = cls || classifyBusiness({});
  const base = {
    v: 1, rubro: c.rubro, subrubro: c.subrubro || '', confianza: c.confianza,
    candidatas: c.candidatas, evidencia: c.evidencia,
  };
  if (c.segura) {
    return {
      category: c.rubro, subcat: c.subrubro || '',
      rubroId: { ...base, fuente: 'deteccion', segura: true, nivel_duda: null, needs_question: false, sin_confirmar: false },
      rubroCheck: { needed: false, options: [], detected: c },
    };
  }
  return {
    category: c.rubro === 'otro' && c.candidatas.length ? c.candidatas[0].rubro : c.rubro,
    subcat: '',
    rubroId: { ...base, subrubro: '', fuente: 'deteccion', segura: false, nivel_duda: c.nivel_duda, needs_question: c.candidatas.length > 0, sin_confirmar: true },
    rubroCheck: {
      needed: c.candidatas.length >= 2 || c.nivel_duda === 'subrubro',
      options: questionOptions(c), detected: c,
    },
  };
}

module.exports = {
  RUBROS, SUBRUBROS, RUBRO_LABELS, SUBRUBRO_LABELS, labelFor,
  JSONLD_MAP, jsonldVote, classifyBusiness, needsVisionTiebreak,
  questionOptions, resolveRubro,
};
