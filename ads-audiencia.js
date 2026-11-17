// ads-audiencia.js — LOTE ADS-ESTRATÉGICOS (dirección de Valentino
// 13/11 00:34–00:36): los ads se arman estratégicos por cliente y el
// cliente VE la audiencia y la acepta o la edita con toques antes de
// gastar. Este módulo es PURO (sin DB, sin red): el fundamento entra
// como objeto plano, la propuesta sale como objeto plano, la validación
// de lo que el cliente edita vive acá y la traducción final a
// targeting de Meta se resuelve con helpers inyectados (meta_ads).
//
// LAS 4 PIEZAS:
// 1. OBJETIVO DESDE EL FUNDAMENTO: la campaña nace con el objetivo que
//    el negocio declaró en la pregunta 2 del onboarding un clic
//    (digest.onboarding.cta: reservar / escribirte / local / comprar),
//    con las fuentes de respaldo del fundamento (dueno.meta del
//    onboarding registrado, texto del goal vía cm-objetivo). Sin
//    ninguna señal NO se inventa un objetivo: objetivo = null y el
//    impulso corre con el comportamiento histórico (engagement),
//    declarado como fuente 'sin_dato'.
// 2. AUDIENCIA AUTOMÁTICA: propuesta determinística desde el
//    fundamento — radio al local (2/5/10 km, default 5), edad estimada
//    por rubro y por la audiencia declarada, intereses del rubro
//    (NOMBRES de Meta: los ids se resuelven por la Targeting Search
//    API al crear, jamás ids escritos a mano), género desde la
//    audiencia declarada y audiencia parecida a los seguidores.
//    HONESTIDAD TÉCNICA (registrada con Valentino): en Meta no hay
//    filtro de búsqueda literal tipo Google; se llega a esa gente con
//    estas señales.
// 3. EDICIÓN CON TOQUES: el cliente solo puede elegir entre las
//    opciones prefijadas de la propuesta (validarAudiencia rechaza
//    cualquier valor fuera de ellas). Sin formularios, sin texto
//    libre, sin salir a Meta.
// 4. MEDICIÓN HONESTA: el resultado de un impulso se lee según su
//    objetivo persistido — conversaciones iniciadas cuando el
//    objetivo es de mensajes; clics en los demás. Nada de
//    conversiones inventadas.
//
// MAPEO A META (verificado contra la doc de la Marketing API):
// - escribirte → OUTCOME_ENGAGEMENT + optimization CONVERSATIONS +
//   destination INSTAGRAM_DIRECT (click-to-DM sobre el posteo).
// - reservar → el mismo camino de mensajes: las reservas de estos
//   negocios se cierran por DM (no hay integración de reservas ni
//   píxel conectado); declarado, no disfrazado de otra cosa.
// - comprar → el mismo camino de mensajes: sin píxel ni catálogo
//   conectado, OUTCOME_SALES no puede optimizar (exige dataset);
//   la compra de estos negocios se cierra por DM o en el local.
//   Cuando exista dataset, este mapeo pasa a OUTCOME_SALES.
// - local → OUTCOME_ENGAGEMENT + POST_ENGAGEMENT (el comportamiento
//   histórico) pero con la audiencia geográfica fina de este lote:
//   la palanca de «que vengan al local» es el radio, no el goal.
// - sin objetivo → histórico exacto (POST_ENGAGEMENT, país, 18-65).
'use strict';

// ── Objetivo del negocio (pregunta 2 del onboarding) ──────────────
// (LOTE ADS-PÚBLICO) 'seguir' se suma como objetivo elegible en la
// tarjeta: su mapeo honesto es el camino de engagement (mapeoMeta),
// sin prometer una optimización de seguidores que Meta no ofrece
// por esta vía.
const OBJETIVOS = ['reservar', 'escribirte', 'local', 'comprar', 'seguir'];

// Valores crudos del fundamento → objetivo canónico. Las claves son
// las de OC_CTA (onboarding un clic) y las de dueno.meta (onboarding
// registrado: venir/comprar/escribir).
const OBJETIVO_DESDE_CTA = {
  reservar: 'reservar', turno: 'reservar',
  escribirte: 'escribirte', escribir: 'escribirte', llamar: 'escribirte',
  local: 'local', venir: 'local',
  comprar: 'comprar', tienda: 'comprar', domicilio: 'comprar',
  // (LOTE ADS-PÚBLICO) seguir/seguirme/seguirnos → 'seguir': mapea al
  // camino de engagement (ver mapeoMeta), declarado y sin disfraz.
  seguir: 'seguir', seguirme: 'seguir', seguirnos: 'seguir',
};

const ETIQUETA_OBJETIVO = {
  reservar: { es: 'Que te reserven', en: 'Get bookings' },
  escribirte: { es: 'Que te escriban por Instagram', en: 'Get Instagram messages' },
  local: { es: 'Que vengan a tu local', en: 'Get store visits' },
  comprar: { es: 'Que te compren', en: 'Get purchases' },
  seguir: { es: 'Que me sigan', en: 'Get followers' },
};

// Objetivo canónico desde cualquier señal del fundamento.
// Devuelve { objetivo, fuente } con objetivo null si no hay señal.
function objetivoDesdeFundamento({ cta, meta, goalTexto } = {}) {
  const c = String(cta || '').trim().toLowerCase();
  if (c && OBJETIVO_DESDE_CTA[c]) return { objetivo: OBJETIVO_DESDE_CTA[c], fuente: 'onboarding' };
  const m = String(meta || '').trim().toLowerCase();
  if (m && OBJETIVO_DESDE_CTA[m]) return { objetivo: OBJETIVO_DESDE_CTA[m], fuente: 'onboarding' };
  if (goalTexto) {
    try {
      const cm = require('./cm-objetivo');
      const r = cm.elegirObjetivo({ goal: String(goalTexto || '') });
      if (r && r.objetivo) {
        const norm = r.objetivo === 'ir-al-local' ? 'local' : r.objetivo;
        if (OBJETIVOS.includes(norm)) return { objetivo: norm, fuente: 'fundamento' };
      }
    } catch (e) { /* cm-objetivo es respaldo: sin él, sin señal */ }
  }
  return { objetivo: null, fuente: 'sin_dato' };
}

// Objetivo del negocio → parámetros reales de campaña/conjunto Meta.
function mapeoMeta(objetivo) {
  if (objetivo === 'escribirte' || objetivo === 'reservar' || objetivo === 'comprar') {
    return {
      campaignObjective: 'OUTCOME_ENGAGEMENT',
      optimizationGoal: 'CONVERSATIONS',
      destinationType: 'INSTAGRAM_DIRECT',
      medicion: 'conversaciones',
    };
  }
  // local, seguir y sin_dato: el camino histórico de engagement.
  // 'seguir' cae acá con honestidad: por esta vía Meta optimiza
  // engagement sobre el posteo, no «conseguir seguidores».
  return {
    campaignObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'POST_ENGAGEMENT',
    destinationType: null,
    medicion: 'clics',
  };
}

// ── Opciones prefijadas (la ÚNICA fuente: la tarjeta del cliente se
// rinde desde acá y validarAudiencia valida contra lo mismo) ──────
const RADIOS_KM = [2, 5, 10];
const EDADES = [[18, 24], [25, 34], [25, 44], [35, 44], [35, 54], [45, 54], [55, 65], [18, 65]];
const GENEROS = ['todos', 'mujeres', 'hombres'];
const GENERO_META = { todos: [], mujeres: [2], hombres: [1] };

// ── Alcance geográfico (LOTE ADS-PÚBLICO) ──────────────────────────
// La pregunta «¿Dónde están?» reemplaza a la distancia fija al local
// (las preguntas viejas suponían un local: un negocio online no tiene
// ninguno — caso Valentino 17/11, su ciudad figuraba «Online» y el
// impulso fallaba porque eso no es un lugar apuntable). Alcances:
// cerca (recién ahí hay radio 2/5/10 km) · ciudad · pais · todos.
// REGLA DURA: una ciudad que no es un lugar («Online», «remoto»,
// «—», vacío y variantes) NUNCA es una ciudad: no se muestra como
// tal, no se geocodifica y no entra al targeting como lugar.
const ALCANCES = ['cerca', 'ciudad', 'pais', 'todos'];
const CIUDAD_NO_LUGAR = new Set([
  '', 'online', 'en linea', 'remoto', 'remote', 'virtual', 'internet', 'web',
  'sin ciudad', 'sin direccion', 'no aplica', 'na', 'n a', 'ninguna', 'ninguno',
  'todo el pais', 'todo el mundo', 'worldwide', 'global',
]);
function esCiudadReal(ciudad) {
  const c = String(ciudad || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  if (!c) return false;
  if (CIUDAD_NO_LUGAR.has(c)) return false;
  if (/^[-\u2014\u2013\u00b7./\s]+$/.test(c)) return false;
  return true;
}
// Default desde el fundamento: con ciudad real el anuncio nace
// cerca del negocio; sin ciudad real (online, remoto), nace al país.
function alcanceDesdeFundamento(ciudad) {
  return esCiudadReal(ciudad) ? 'cerca' : 'pais';
}

// Edad estimada por rubro (profiles.category / TRIAL_CAT_MAP). Es una
// estimación editorial declarada, no un dato del negocio: el cliente
// la puede cambiar con los chips de edades prefijadas. INVARIANTE:
// cada par vive en EDADES — la propuesta por defecto tiene que pasar
// validarAudiencia tal cual sale (si no, el «Sale así» sin editar
// rebotaría contra el propio servidor).
const EDAD_POR_RUBRO = {
  belleza: [25, 44], barberia: [25, 34], fitness: [25, 44], moda: [25, 44],
  gastronomia: [25, 44], cafeteria: [25, 44], mascotas: [25, 44],
  salud: [35, 54], hogar: [35, 54], educacion: [25, 44], viajes: [25, 44],
  eventos: [25, 44], tecnologia: [25, 44], servicios: [35, 54],
  inmobiliaria: [35, 54], arte: [25, 44], otro: [18, 65],
};

// Intereses por rubro: NOMBRES de intereses de Meta (los que muestra
// Ads Manager). Los ids NO viven acá: se resuelven al crear con la
// Targeting Search API (type=adinterest) y el que no resuelve se omite
// y queda registrado en el impulso (resuelto.intereses_omitidos).
const INTERESES_POR_RUBRO = {
  belleza: ['Skin care', 'Cosmetics', 'Makeup', 'Beauty salon', 'Perfume'],
  barberia: ['Barbershop', 'Hairstyle', 'Beard'],
  fitness: ['Physical fitness', 'Gym', 'Yoga', 'Running', 'CrossFit'],
  moda: ['Fashion', 'Clothing', 'Shopping and fashion', 'Shoes', 'Sneakers'],
  gastronomia: ['Restaurant', 'Foodie', 'Cooking', 'Pizza', 'Hamburger'],
  cafeteria: ['Coffee', 'Coffeehouse', 'Espresso', 'Brunch'],
  mascotas: ['Dog', 'Cat', 'Pet store', 'Veterinary medicine'],
  salud: ['Health', 'Wellness', 'Nutrition'],
  hogar: ['Interior design', 'Home improvement', 'Furniture'],
  educacion: ['Online education', 'English language', 'Language school'],
  viajes: ['Travel', 'Tourism', 'Airbnb', 'Beach'],
  eventos: ['Wedding', 'Party', 'Event planning'],
  tecnologia: ['Technology', 'Smartphone', 'Gadgets'],
  servicios: ['Small business', 'Entrepreneurship'],
  inmobiliaria: ['Real estate', 'House', 'Apartment'],
  arte: ['Art', 'Photography', 'Design'],
  otro: [],
};

function generoDesdeTexto(texto) {
  const t = String(texto || '').toLowerCase();
  if (/mujer|femenin|chicas?|damas/.test(t)) return 'mujeres';
  if (/hombre|varon|masculin|caballero/.test(t)) return 'hombres';
  return 'todos';
}

function edadDesdeTexto(texto, categoria) {
  const t = String(texto || '').toLowerCase();
  if (/j[oó]ven|jovenes|jóvenes|teens?|universitari/.test(t)) return [18, 24];
  if (/familia|padres|madres|mam[aá]s/.test(t)) return [25, 44];
  if (/adult|mayor|senior/.test(t)) return [45, 54];
  return (EDAD_POR_RUBRO[categoria] || EDAD_POR_RUBRO.otro).slice();
}

// Respaldo de la frase del comprador cuando el fundamento no trae
// ni cliente ideal ni audiencia declarada: se arma con los intereses
// del rubro (los mismos de la propuesta), nunca con un local ni una
// ciudad que el negocio no tenga.
function respaldoComprador(categoria, lang) {
  const nombres = INTERESES_POR_RUBRO[categoria] || [];
  if (!nombres.length) return lang === 'en' ? 'Your customers and people like them' : 'Tus clientes y personas parecidas a ellos';
  const lista = nombres.slice(0, 2).map((n) => (lang === 'en' ? n : (ETIQUETAS_INTERES[n] || n))).join(lang === 'en' ? ' and ' : ' y ');
  return lang === 'en' ? `People into ${lista}` : `Personas a las que les gusta ${lista}`;
}

// ── La propuesta ───────────────────────────────────────────────────
// Entrada: el fundamento aplanado que arma el servidor:
// { cta, meta, goalTexto, categoria, audienciaTexto, clienteIdeal,
//   ciudad, donde, pais, lang }
// Salida: { objetivo, objetivo_fuente, objetivo_label, audiencia,
//           opciones, geo: { ciudad, pais }, texto }
function propuestaDesdeFundamento(f) {
  const fund = f || {};
  const lang = fund.lang === 'en' ? 'en' : 'es';
  const { objetivo, fuente } = objetivoDesdeFundamento(fund);
  const categoria = String(fund.categoria || 'otro').toLowerCase();
  const textoAudiencia = [fund.audienciaTexto || '', fund.clienteIdeal || ''].join(' ');
  const genero = generoDesdeTexto(textoAudiencia);
  const edad = edadDesdeTexto(textoAudiencia, categoria);
  const intereses = (INTERESES_POR_RUBRO[categoria] || []).map((nombre) => ({ nombre, activo: true }));
  // (LOTE ADS-PÚBLICO) La ciudad del fundamento pasa el filtro de
  // lugar real UNA vez, acá: si no es un lugar («Online», «remoto»),
  // geo.ciudad queda vacía y ningún consumidor posterior (tarjeta,
  // texto humano, geocodificación, targeting) la ve como ciudad.
  const ciudadCruda = String(fund.ciudad || fund.donde || '').trim().slice(0, 80);
  const ciudad = esCiudadReal(ciudadCruda) ? ciudadCruda : '';
  const pais = String(fund.pais || 'AR').trim().toUpperCase() || 'AR';
  const audiencia = {
    radio_km: 5,
    alcance: alcanceDesdeFundamento(ciudad),
    edad_min: edad[0],
    edad_max: edad[1],
    genero,
    intereses,
    parecidos: true,
  };
  // (LOTE ADS-PÚBLICO) Pregunta 1 «¿Quién te compra?»: la frase del
  // comprador en palabras, del fundamento (cliente ideal o audiencia
  // declarada); sin frase, el respaldo por rubro desde sus intereses.
  // Es de LECTURA en la tarjeta: no abre ningún camino de texto libre
  // al targeting (el ajuste son los chips de intereses de siempre).
  const fraseFund = String(fund.clienteIdeal || '').trim() || String(fund.audienciaTexto || '').trim();
  const comprador_texto = (fraseFund || respaldoComprador(categoria, lang)).slice(0, 140);
  const propuesta = {
    objetivo,
    objetivo_fuente: fuente,
    objetivo_label: objetivo ? ETIQUETA_OBJETIVO[objetivo][lang] : (lang === 'en' ? 'Get more people engaging with your post' : 'Que más gente interactúe con tu posteo'),
    comprador_texto,
    audiencia,
    opciones: {
      radios: RADIOS_KM.slice(),
      edades: EDADES.map((e) => e.slice()),
      generos: GENEROS.slice(),
      alcances: ALCANCES.slice(),
      objetivos: OBJETIVOS.map((v) => ({ valor: v, etiqueta: ETIQUETA_OBJETIVO[v][lang] })),
    },
    geo: { ciudad, pais },
    lang,
  };
  propuesta.texto = textoHumano(propuesta, lang);
  return propuesta;
}

// La audiencia en lenguaje humano (la misma regla en el servidor para
// la propuesta inicial y en el cliente al editar): «Mujeres 25–44 ·
// a 5 km de tu local · siguen cuentas de skincare · parecido a tus
// seguidores».
function textoHumano(propuesta, lang) {
  const en = lang === 'en';
  const a = (propuesta && propuesta.audiencia) || {};
  const geo = (propuesta && propuesta.geo) || {};
  const partes = [];
  const gen = a.genero === 'mujeres' ? (en ? 'Women' : 'Mujeres')
    : a.genero === 'hombres' ? (en ? 'Men' : 'Hombres') : (en ? 'Everyone' : 'Todos');
  partes.push(`${gen} ${a.edad_min}–${a.edad_max}`);
  // (LOTE ADS-PÚBLICO) El segmento geo sigue al ALCANCE elegido, no a
  // la sola existencia de una ciudad: cerca → radio (solo con ciudad
  // real; sin ella la línea honesta es el país, como resuelve el
  // targeting) · ciudad → la ciudad · pais → todo el país · todos →
  // todos lados. geo.ciudad ya viene saneada de la propuesta (una
  // «ciudad» que no es lugar acá ya es cadena vacía).
  const alcanceTxt = String(a.alcance || (geo.ciudad ? 'cerca' : 'pais'));
  if (alcanceTxt === 'cerca' && geo.ciudad) partes.push(en ? `within ${a.radio_km} km of your spot in ${geo.ciudad}` : `a ${a.radio_km} km de tu local en ${geo.ciudad}`);
  else if (alcanceTxt === 'ciudad' && geo.ciudad) partes.push(en ? `in ${geo.ciudad}` : `en ${geo.ciudad}`);
  else if (alcanceTxt === 'todos') partes.push(en ? 'everywhere' : 'en todos lados');
  else partes.push(en ? 'all over the country' : 'en todo el país');
  const activos = (a.intereses || []).filter((i) => i && i.activo).map((i) => i.nombre);
  if (activos.length) {
    const lista = activos.slice(0, 3).join(', ') + (activos.length > 3 ? '…' : '');
    partes.push(en ? `into ${lista}` : `les gusta ${lista}`);
  }
  if (a.parecidos) partes.push(en ? 'similar to your followers' : 'parecido a tus seguidores');
  return partes.join(' · ');
}

// ── Validación de la audiencia editada por el cliente ─────────────
// El cliente SOLO puede mover lo que la propuesta ofrece: radio de la
// lista, un par de edades de la lista, género de la lista, intereses
// de la lista del rubro (prender/apagar) y parecidos sí/no. Cualquier
// otra cosa → { ok: false, motivo: 'audiencia_invalida' }.
function validarAudiencia(input, propuesta) {
  const no = (detalle) => ({ ok: false, motivo: 'audiencia_invalida', detalle });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return no('no_es_objeto');
  if (!propuesta || !propuesta.audiencia) return no('sin_propuesta');
  // (LOTE ADS-PÚBLICO) Alcance: viaja con la audiencia y valida contra
  // las opciones de la propuesta; sin alcance en el payload manda el
  // de la propuesta (compatibilidad con payloads viejos).
  const opcionesAlc = (propuesta.opciones && Array.isArray(propuesta.opciones.alcances) && propuesta.opciones.alcances.length)
    ? propuesta.opciones.alcances : ALCANCES;
  const alcance = (input.alcance == null || input.alcance === '')
    ? String(propuesta.audiencia.alcance || 'pais') : String(input.alcance);
  if (!opcionesAlc.includes(alcance)) return no('alcance_fuera_de_opciones');
  // (LOTE ADS-PÚBLICO) Objetivo elegido en la tarjeta: si viaja con
  // la audiencia, valida contra OBJETIVOS y MANDA en el mapeo; si no
  // viaja, manda el objetivo de la propuesta (el de siempre).
  let objetivo = propuesta.objetivo || null;
  if (input.objetivo != null && input.objetivo !== '') {
    const ob = String(input.objetivo);
    if (!OBJETIVOS.includes(ob)) return no('objetivo_fuera_de_opciones');
    objetivo = ob;
  }
  // El radio solo es obligatorio-válido con alcance 'cerca': con
  // cualquier otro alcance un radio fuera de lista NO invalida (se
  // normaliza al de la propuesta) — el radio no participa del geo.
  const radioIn = Number(input.radio_km);
  let radio;
  if (alcance === 'cerca') {
    if (!RADIOS_KM.includes(radioIn)) return no('radio_fuera_de_opciones');
    radio = radioIn;
  } else {
    radio = RADIOS_KM.includes(radioIn) ? radioIn : (Number(propuesta.audiencia.radio_km) || 5);
  }
  const emin = Number(input.edad_min), emax = Number(input.edad_max);
  if (!EDADES.some((e) => e[0] === emin && e[1] === emax)) return no('edad_fuera_de_opciones');
  const genero = String(input.genero || '');
  if (!GENEROS.includes(genero)) return no('genero_fuera_de_opciones');
  if (typeof input.parecidos !== 'boolean') return no('parecidos_invalido');
  const permitidos = new Set((propuesta.audiencia.intereses || []).map((i) => i.nombre));
  const entrada = Array.isArray(input.intereses) ? input.intereses : [];
  if (entrada.length > 10) return no('demasiados_intereses');
  const intereses = [];
  const vistos = new Set();
  for (const it of entrada) {
    const nombre = String((it && it.nombre) || it || '').trim();
    if (!permitidos.has(nombre)) return no('interes_fuera_de_opciones');
    if (vistos.has(nombre)) continue;
    vistos.add(nombre);
    intereses.push({ nombre, activo: !!(it && it.activo) });
  }
  // Los intereses de la propuesta que el cliente no mencionó quedan
  // como estaban (apagar es explícito, nunca por omisión).
  for (const p of (propuesta.audiencia.intereses || [])) {
    if (!vistos.has(p.nombre)) intereses.push({ nombre: p.nombre, activo: !!p.activo });
  }
  return {
    ok: true,
    audiencia: { radio_km: radio, alcance, edad_min: emin, edad_max: emax, genero, intereses, parecidos: input.parecidos },
    objetivo,
  };
}

// ── Resolución a targeting real de Meta ────────────────────────────
// Async: resuelve ids con los helpers de meta_ads inyectados
// (searchInterestId, searchGeo, findLookalikeAudienceId). Lo que no
// resuelve se OMITE y queda registrado en `resuelto` — jamás se
// inventa un id ni una coordenada.
// (LOTE ADS-CREACIÓN) ctx opcional { token, adAccountId }: la
// resolución corre EN LA CUENTA DE QUIEN PAUTA. En el riel del
// cliente, el llamador pasa el SUAT y la cuenta del cliente: la
// audiencia parecida (un activo DE una cuenta) se busca en SU cuenta
// y lo que no existe ahí degrada declarado ('sin_audiencia_
// disponible') — jamás entra el id de la audiencia de otra cuenta.
// Sin ctx (riel billetera), la resolución corre en la cuenta de
// Posty, como siempre.
// Sin ciudad en el fundamento, el geo cae al país (el comportamiento
// histórico) y queda declarado en resuelto.geo_modo = 'pais'.
async function resolverTargeting(audiencia, propuesta, meta, ctx) {
  const a = audiencia || {};
  const geo = (propuesta && propuesta.geo) || {};
  const resuelto = { intereses: [], intereses_omitidos: [], geo_modo: 'pais', parecidos_estado: a.parecidos ? 'sin_audiencia_disponible' : 'apagado' };
  const targeting = {
    age_min: Number(a.edad_min) || 18,
    age_max: Number(a.edad_max) || 65,
  };
  const genders = GENERO_META[a.genero] || [];
  if (genders.length) targeting.genders = genders.slice();

  // Intereses activos → ids reales por Targeting Search.
  const specs = [];
  for (const it of (a.intereses || [])) {
    if (!it || !it.activo) continue;
    let hit = null;
    try { hit = meta && typeof meta.searchInterestId === 'function' ? await meta.searchInterestId(it.nombre, ctx) : null; } catch (e) { hit = null; }
    if (hit && hit.id) { specs.push({ id: String(hit.id), name: String(hit.name || it.nombre) }); resuelto.intereses.push({ nombre: it.nombre, id: String(hit.id) }); }
    else resuelto.intereses_omitidos.push(it.nombre);
  }
  if (specs.length) targeting.flexible_spec = [{ interests: specs }];

  // Geo por ALCANCE (LOTE ADS-PÚBLICO): el alcance de la audiencia
  // manda; resuelto.geo_modo refleja lo que REALMENTE se aplicó y
  // toda degradación queda declarada en resuelto.geo_fallback.
  // - cerca: como siempre — ciudad resuelta → radio alrededor de su
  //   centro (la coordenada viene de la propia búsqueda de Meta, no
  //   de un mapa nuestro); sin coordenadas, la ciudad como target
  //   con radio; sin ciudad real o sin resolución, el país.
  // - ciudad: la ciudad como target, SIN radio custom.
  // - pais: el país del fundamento.
  // - todos: se intenta resolver «Worldwide» con la búsqueda de
  //   Meta; si resuelve, va como región; si no, el país — declarado.
  // La ciudad pasa el filtro de lugar real también acá (defensa en
  // profundidad: una propuesta armada a mano con ciudad «Online»
  // jamás se geocodifica ni entra como lugar).
  const alcanceGeo = String(a.alcance || (propuesta && propuesta.audiencia && propuesta.audiencia.alcance) || (geo.ciudad ? 'cerca' : 'pais'));
  const ciudadGeo = esCiudadReal(geo.ciudad) ? String(geo.ciudad) : '';
  const paisGeo = String(geo.pais || 'AR');
  const buscarGeo = async (q) => {
    if (!meta || typeof meta.searchGeo !== 'function') return null;
    try { return await meta.searchGeo(q, paisGeo, ctx); } catch (e) { return null; }
  };
  if (alcanceGeo === 'todos') {
    const hit = await buscarGeo('Worldwide');
    if (hit && hit.key) {
      targeting.geo_locations = { regions: [{ key: String(hit.key) }] };
      resuelto.geo_modo = 'todos';
      resuelto.geo_centro = { nombre: String(hit.name || 'Worldwide'), fuente: 'worldwide' };
    } else {
      targeting.geo_locations = { countries: [paisGeo] };
      resuelto.geo_modo = 'pais';
      resuelto.geo_fallback = 'todos_sin_resolver';
    }
  } else if (alcanceGeo === 'pais') {
    targeting.geo_locations = { countries: [paisGeo] };
    resuelto.geo_modo = 'pais';
  } else if (alcanceGeo === 'ciudad') {
    const geoLocC = ciudadGeo ? await buscarGeo(ciudadGeo) : null;
    if (geoLocC && geoLocC.key) {
      targeting.geo_locations = { cities: [{ key: String(geoLocC.key) }] };
      resuelto.geo_modo = 'ciudad';
      resuelto.geo_centro = { nombre: String(geoLocC.name || ciudadGeo), fuente: 'ciudad' };
    } else {
      targeting.geo_locations = { countries: [paisGeo] };
      resuelto.geo_modo = 'pais';
      resuelto.geo_fallback = 'ciudad_sin_resolver';
    }
  } else {
    // cerca (y cualquier audiencia legada sin alcance con ciudad).
    const geoLoc = ciudadGeo ? await buscarGeo(ciudadGeo) : null;
    if (geoLoc && Number.isFinite(Number(geoLoc.latitude)) && Number.isFinite(Number(geoLoc.longitude))) {
      targeting.geo_locations = {
        custom_locations: [{
          latitude: Number(geoLoc.latitude), longitude: Number(geoLoc.longitude),
          radius: Number(a.radio_km) || 5, distance_unit: 'kilometer',
        }],
      };
      resuelto.geo_modo = 'radio';
      resuelto.geo_centro = { nombre: String(geoLoc.name || ciudadGeo), fuente: 'ciudad' };
    } else if (geoLoc && geoLoc.key) {
      targeting.geo_locations = { cities: [{ key: String(geoLoc.key), radius: Number(a.radio_km) || 5, distance_unit: 'kilometer' }] };
      resuelto.geo_modo = 'ciudad';
      resuelto.geo_centro = { nombre: String(geoLoc.name || ciudadGeo), fuente: 'ciudad' };
    } else {
      targeting.geo_locations = { countries: [paisGeo] };
      resuelto.geo_modo = 'pais';
      if (alcanceGeo === 'cerca') resuelto.geo_fallback = 'cerca_sin_ciudad_resuelta';
    }
  }

  // Parecidos: solo si en la cuenta YA existe una audiencia lookalike
  // (crear una exige una audiencia origen y tiempo de población: no
  // se fabrica en el momento del impulso). Si no hay, se omite y el
  // impulso lo declara (persistido en audiencia_json).
  if (a.parecidos && meta && typeof meta.findLookalikeAudienceId === 'function') {
    let lid = null;
    try { lid = await meta.findLookalikeAudienceId(ctx); } catch (e) { lid = null; }
    if (lid) { targeting.custom_audiences = [{ id: String(lid) }]; resuelto.parecidos_estado = 'aplicado'; }
  }
  return { targeting, resuelto };
}

// ── «+ OTRA GENTE»: traducción de la descripción del cliente ──────
// El cliente cuenta con sus palabras (audio transcrito por el
// pipeline del chat, o texto) a quién quiere llegar. La traducción
// SOLO devuelve valores del vocabulario cerrado de la propuesta de
// su rubro (un interés de su tabla, un rango de edad prefijado, un
// género, un radio): nada arbitrario llega jamás al targeting, y el
// POST del impulso vuelve a validar la audiencia completa contra las
// mismas opciones. Sin mapeo → chip null; si apuntó a un interés
// real pero de otro rubro, `cercano` trae un interés que SÍ existe en
// su lista para que Posty lo proponga honestamente en el chat en vez
// de ignorar el pedido en silencio.
const ETIQUETAS_INTERES = {
  'Skin care': 'Cuidado de la piel', 'Cosmetics': 'Cosmética', 'Makeup': 'Maquillaje', 'Beauty salon': 'Salones de belleza', 'Perfume': 'Perfumes',
  'Barbershop': 'Barberías', 'Hairstyle': 'Peinados', 'Beard': 'Barbas',
  'Physical fitness': 'Fitness', 'Gym': 'Gimnasio', 'Yoga': 'Yoga', 'Running': 'Running', 'CrossFit': 'CrossFit',
  'Fashion': 'Moda', 'Clothing': 'Ropa', 'Shopping and fashion': 'Compras y moda', 'Shoes': 'Calzado', 'Sneakers': 'Zapatillas',
  'Restaurant': 'Restaurantes', 'Foodie': 'Foodies', 'Cooking': 'Cocina', 'Pizza': 'Pizza', 'Hamburger': 'Hamburguesas',
  'Coffee': 'Café', 'Coffeehouse': 'Cafeterías', 'Espresso': 'Espresso', 'Brunch': 'Brunch',
  'Dog': 'Perros', 'Cat': 'Gatos', 'Pet store': 'Tiendas de mascotas', 'Veterinary medicine': 'Veterinarias',
  'Health': 'Salud', 'Wellness': 'Bienestar', 'Nutrition': 'Nutrición',
  'Interior design': 'Decoración', 'Home improvement': 'Mejoras del hogar', 'Furniture': 'Muebles',
  'Online education': 'Educación online', 'English language': 'Inglés', 'Language school': 'Idiomas',
  'Travel': 'Viajes', 'Tourism': 'Turismo', 'Airbnb': 'Airbnb', 'Beach': 'Playa',
  'Wedding': 'Casamientos', 'Party': 'Fiestas', 'Event planning': 'Eventos',
  'Technology': 'Tecnología', 'Smartphone': 'Celulares', 'Gadgets': 'Gadgets',
  'Small business': 'Pequeños negocios', 'Entrepreneurship': 'Emprendedores',
  'Real estate': 'Propiedades', 'House': 'Casas', 'Apartment': 'Departamentos',
  'Art': 'Arte', 'Photography': 'Fotografía', 'Design': 'Diseño',
  'Parenting': 'Mamás y papás', 'Soccer': 'Fútbol', 'Tennis': 'Tenis', 'Golf': 'Golf', 'Cycling': 'Ciclismo', 'Swimming': 'Natación',
  'Wine': 'Vino', 'Beer': 'Cerveza', 'Hair care': 'Cuidado del pelo', 'Nail care': 'Uñas',
  'Movies': 'Cine y series', 'Music': 'Música', 'Video games': 'Videojuegos', 'Reading': 'Lectura',
  'Automobiles': 'Autos', 'Motorcycles': 'Motos', 'Investing': 'Inversiones', 'Gardening': 'Jardinería', 'Food': 'Comida', 'Pets': 'Mascotas',
};
// Patrones (texto ya normalizado: minúsculas, sin acentos) → NOMBRE
// de interés de Meta. El match solo vale si el nombre está en la
// tabla del rubro del cliente (propuesta.audiencia.intereses).
const SINONIMOS_INTERES = [
  [/mama|bebe|hijos|padres|embaraz/, 'Parenting'],
  [/corr|running|maraton/, 'Running'],
  [/perro/, 'Dog'], [/gato/, 'Cat'], [/mascota/, 'Pets'],
  [/futbol|soccer/, 'Soccer'], [/tenis/, 'Tennis'], [/golf/, 'Golf'],
  [/yoga|meditacion/, 'Yoga'],
  [/gimnasio|gym|fitness|pesas|entrenar|muscul/, 'Physical fitness'],
  [/crossfit/, 'CrossFit'], [/bici|ciclismo/, 'Cycling'], [/nadar|natacion|pileta/, 'Swimming'],
  [/cocina|cocinar|receta|chef/, 'Cooking'], [/cafe/, 'Coffee'], [/vino/, 'Wine'], [/cerveza|birra/, 'Beer'],
  [/viaj|turismo|vacaciones/, 'Travel'], [/moda|ropa|fashion|outfit/, 'Fashion'],
  [/maquillaje|makeup/, 'Cosmetics'], [/skincare|cuidado de la piel|cremas|belleza/, 'Skin care'],
  [/perfume|fragancia/, 'Fragrance'], [/unas|manicur/, 'Nail care'], [/pelo|cabello|peluquer/, 'Hair care'],
  [/foto|fotograf/, 'Photography'], [/musica|cantar|banda|dj/, 'Music'],
  [/videojuego|gaming|gamer/, 'Video games'], [/cine|pelicula|series|netflix/, 'Movies'],
  [/autos?\b|coches?/, 'Automobiles'], [/motos?/, 'Motorcycles'],
  [/emprend|negocio|pyme|empresa|oficina/, 'Entrepreneurship'],
  [/inversion|invertir|finanzas|bolsa|cripto/, 'Investing'],
  [/hogar|decoracion|muebles|casa/, 'Interior design'], [/jardin|plantas/, 'Gardening'],
  [/propiedad|inmueble|alquiler/, 'Real estate'], [/tecnologia|gadgets|celulares/, 'Technology'],
  [/salud|bienestar|wellness|sano/, 'Wellness'], [/comida|foodie|restaurante/, 'Food'],
  [/novias?|bodas?|casamiento/, 'Wedding'], [/libros|lectura|leer/, 'Reading'],
  [/arte|pintura|diseno/, 'Art'],
];
function normTxt(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function traducirDescripcion(texto, propuesta) {
  const vacio = { chip: null, cercano: null };
  if (!propuesta || !propuesta.audiencia || !propuesta.opciones) return vacio;
  const t = normTxt(texto);
  if (!t) return vacio;
  const lang = propuesta.lang === 'en' ? 'en' : 'es';
  const etiqueta = (nombre) => (lang === 'en' ? nombre : (ETIQUETAS_INTERES[nombre] || nombre));
  const interesesProp = (propuesta.audiencia.intereses || []).map((i) => i.nombre);
  // 1) Un interés del vocabulario de SU rubro.
  for (const [re, nombre] of SINONIMOS_INTERES) {
    if (re.test(t) && interesesProp.includes(nombre)) {
      return { chip: { etiqueta: etiqueta(nombre), filtro: { tipo: 'interes', nombre } }, cercano: null };
    }
  }
  // 2) Una edad de los rangos prefijados.
  const edades = propuesta.opciones.edades || [];
  const edadDe = (a, b) => (edades.some((e) => e[0] === a && e[1] === b) ? { tipo: 'edad', edad_min: a, edad_max: b } : null);
  let fe = null;
  if (/adolescent|teen/.test(t)) fe = edadDe(18, 24);
  else if (/mamas jovenes|madres jovenes/.test(t)) fe = edadDe(25, 34);
  else if (/joven|pibes|chicas/.test(t)) fe = edadDe(18, 24);
  else if (/\b(30|treinta)/.test(t)) fe = edadDe(25, 34);
  else if (/\b(40|cuarenta)/.test(t)) fe = edadDe(35, 44);
  else if (/\b(50|cincuenta)/.test(t)) fe = edadDe(45, 54);
  else if (/mayor|abuel|\b(60|65)\b/.test(t)) fe = edadDe(55, 65);
  if (fe) return { chip: { etiqueta: (lang === 'en' ? 'Ages ' : 'De ') + fe.edad_min + (lang === 'en' ? ' to ' : ' a ') + fe.edad_max, filtro: fe }, cercano: null };
  // 3) Género.
  if (/mujer|mamas|madres|femenin/.test(t)) return { chip: { etiqueta: lang === 'en' ? 'Women' : 'Mujeres', filtro: { tipo: 'genero', valor: 'mujeres' } }, cercano: null };
  if (/hombre|varones|papas/.test(t)) return { chip: { etiqueta: lang === 'en' ? 'Men' : 'Hombres', filtro: { tipo: 'genero', valor: 'hombres' } }, cercano: null };
  // 4) Radio.
  const radios = propuesta.opciones.radios || [];
  if (/cerca|barrio|cuadras|zona/.test(t) && radios.includes(2)) return { chip: { etiqueta: lang === 'en' ? 'Close by · 2 km' : 'Cerquita · 2 km', filtro: { tipo: 'radio', radio_km: 2 } }, cercano: null };
  if (/lejos|toda la ciudad|amplia/.test(t) && radios.includes(10)) return { chip: { etiqueta: lang === 'en' ? 'Wider area · 10 km' : 'Zona amplia · 10 km', filtro: { tipo: 'radio', radio_km: 10 } }, cercano: null };
  // 5) Apuntó a un interés real pero fuera de su rubro: lo más
  // cercano que SÍ se puede filtrar es un interés de su propia lista.
  for (const [re] of SINONIMOS_INTERES) {
    if (re.test(t)) {
      const lista = propuesta.audiencia.intereses || [];
      const cand = lista.find((i) => !i.activo) || lista[0];
      if (cand) return { chip: null, cercano: { etiqueta: etiqueta(cand.nombre), filtro: { tipo: 'interes', nombre: cand.nombre }, cercano: true } };
      break;
    }
  }
  return vacio;
}

// ── Medición: qué número real se le muestra al cliente ────────────
// Desde la fila persistida del impulso (objetivo + stats que Meta
// devolvió). Sin stats leídas todavía → null (no se muestra un 0
// inventado como si fuera medición).
function resultadoDe(boost) {
  if (!boost || typeof boost !== 'object') return null;
  if (!boost.stats_updated_at) return null;
  const objetivo = String(boost.objetivo || '');
  const mapeo = mapeoMeta(OBJETIVOS.includes(objetivo) ? objetivo : null);
  if (mapeo.medicion === 'conversaciones') {
    return { tipo: 'conversaciones', valor: Number(boost.last_conversaciones || 0), objetivo: objetivo || null };
  }
  return { tipo: 'clics', valor: Number(boost.last_clicks || 0), objetivo: objetivo || null };
}

module.exports = {
  OBJETIVOS,
  RADIOS_KM,
  EDADES,
  GENEROS,
  ALCANCES,
  esCiudadReal,
  INTERESES_POR_RUBRO,
  EDAD_POR_RUBRO,
  objetivoDesdeFundamento,
  mapeoMeta,
  propuestaDesdeFundamento,
  textoHumano,
  validarAudiencia,
  resolverTargeting,
  traducirDescripcion,
  ETIQUETAS_INTERES,
  resultadoDe,
};
