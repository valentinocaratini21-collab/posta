// LOTE PRUEBA-CHAT (6/11) — huecos determinísticos del onboarding.
// Portado del lote preguntas-dinámicas (work/preguntas-dinamicas.js,
// parte determinística). SOLO esto se usa: las 8 preguntas fijas se
// preguntan en el chat como Posty, UNA por vez, y SOLO lo que no se supo
// con seguridad (gaps). La orquestación con AI del lote origen
// (buildDynQuestionsPrompt / validateDynQuestions / generarPreguntasDinamicas)
// NO se porta: no hay llamada de AI para redactar preguntas ni
// POST /api/trial/questions. Las opciones salen de los hechos extraídos
// de web/IG + las listas genéricas con respaldo; si algo no se sabe, se
// pregunta — nunca se adivina el rubro ni un producto.
// Módulo UMD: require() en Node (tests) o <script> en el navegador.
// En prueba.html / en-prueba.html estas mismas funciones viven portadas
// dentro del IIFE (el front no carga este archivo); este archivo es la
// fuente de verdad para los tests y debe mantenerse idéntico al bloque
// del IIFE.

// Los 12 targets posibles. `field` = el campo del fundamento que la
// respuesta alimenta (q1..q8, como las 8 fijas) o un hecho (facts.*).
// `kind` = 'answer' (pregunta del cuestionario) o 'fact' (pregunta que
// resuelve un hecho: local / reservas / venta online).
const DYN_TARGETS = [
  { target: 'local', field: 'facts.has_local', order: 0, kind: 'fact' },
  { target: 'reservas', field: 'facts.takes_reservations', order: 1, kind: 'fact' },
  { target: 'venta_online', field: 'facts.sells_online', order: 2, kind: 'fact' },
  { target: 'producto', field: 'q1', order: 3, kind: 'answer' },
  { target: 'estrella', field: 'q1', order: 3, kind: 'answer' },
  { target: 'objetivo', field: 'q2', order: 4, kind: 'answer' },
  { target: 'promo', field: 'q3', order: 5, kind: 'answer' },
  { target: 'tono', field: 'q4', order: 6, kind: 'answer' },
  { target: 'precios', field: 'q5', order: 7, kind: 'answer' },
  { target: 'audiencia', field: 'q6', order: 8, kind: 'answer' },
  { target: 'diferencial', field: 'q7', order: 9, kind: 'answer' },
  { target: 'lineas_rojas', field: 'q8', order: 10, kind: 'answer' },
];
const DYN_TARGET_SET = new Set(DYN_TARGETS.map((t) => t.target));
const MAX_DYN_QUESTIONS = 8;

// Rubros donde el hecho importa y vale preguntarlo si no se ve.
// (best-effort: si el rubro no se reconoce, el hecho no se pregunta y
// el objetivo lo cubre con sus opciones, como hoy.)
const PRESENCIAL = ['cafeter', 'gastronom', 'restaurant', 'bar', 'peluquer', 'barber', 'estetic', 'salon', 'spa', 'gimnasi', 'tienda', 'panader', 'pasteler', 'helader', 'farmacia', 'veterinar', 'hotel', 'hospedaje', 'caf'];
const SERVICIO = ['peluquer', 'barber', 'estetic', 'salon', 'spa', 'gimnasi', 'salud', 'clinic', 'odontolog', 'abogad', 'contador', 'consultor', 'construcc', 'contratista', 'remodel', 'plomer', 'electric', 'limpieza', 'mudanza', 'fotograf', 'disen', 'marketing', 'educacion', 'clase', 'curso', 'coach', 'terapia', 'servicio'];
const PRODUCTO = ['tienda', 'e-commerce', 'ecommerce', 'ropa', 'moda', 'calzado', 'mueble', 'decoracion', 'joyer', 'cosmetic', 'alimento', 'bebida', 'electronic', 'librer', 'jugueter', 'mascota', 'arte', 'artesani', 'panader', 'pasteler', 'cafeter'];

function normCat(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function catHas(cat, list) {
  const c = normCat(cat);
  if (!c) return false;
  return list.some((k) => c.includes(k));
}

// Listas genéricas por target, en los dos idiomas (el dueño elige, nunca
// se inventa). Las extraídas (audiencia/diferencial/productos) van primero.
const GEN = {
  es: {
    audiencia: ['Mujeres', 'Hombres', 'Familias', 'Jóvenes', 'Empresas'],
    diferencial: ['Hecho a mano', 'Atención personalizada', 'Calidad antes que precio', 'Años de experiencia', 'Lo local, de barrio'],
    lineas_rojas: ['Fotos de clientes sin permiso', 'Temas sensibles / política', 'Hablar mal de la competencia', 'Mi vida personal', 'Memes / humor'],
    si_no: ['Sí', 'No'],
  },
  en: {
    audiencia: ['Women', 'Men', 'Families', 'Young people', 'Businesses'],
    diferencial: ['Handmade', 'Personal attention', 'Quality over price', 'Years of experience', 'Local, from the neighborhood'],
    lineas_rojas: ['Photos of clients without permission', 'Sensitive topics / politics', 'Talking badly about competitors', 'My personal life', 'Memes / humor'],
    si_no: ['Yes', 'No'],
  },
};

// Opciones canónicas (los valores que el fundamento entiende) por target.
// El AI puede reescribir el rótulo (l), nunca el valor (v).
const CANON = {
  objetivo: [
    { v: 'reservar', l: 'Reservar', need: 'reservas' },
    { v: 'escribirte', l: 'Escribirte', need: null },
    { v: 'local', l: 'Ir al local', need: 'local' },
    { v: 'comprar', l: 'Comprar', need: 'online' },
    { v: 'seguirme', l: 'Seguirme', need: 'creador' },
  ],
  promo: [
    { v: 'ninguna', l: 'Sin promo' },
    { v: 'porcentaje', l: '% de descuento' },
    { v: '2x1', l: '2x1' },
    { v: 'envio', l: 'Envío gratis' },
  ],
  tono: [
    { v: 'cercano', l: 'Cercano' },
    { v: 'profesional', l: 'Profesional' },
    { v: 'divertido', l: 'Divertido' },
    { v: 'elegante', l: 'Elegante' },
  ],
  precios: [
    { v: 'si', l: 'Sí' },
    { v: 'ofertas', l: 'Solo en ofertas' },
    { v: 'no', l: 'No' },
  ],
};

// Huecos: qué necesita preguntar el AI para completar el fundamento.
// Determinístico (sin AI): solo decide QUÉ falta; el AI decide CÓMO
// preguntarlo. Devuelve { needed: [{target, why}], known: {campo:
// {value, mix}} } — `known` son las respuestas que el estudio ya resolvió
// con seguridad y que el cliente NO tiene que contestar.
function preguntasDinamicasGaps(input) {
  const f = (input && input.facts) || {};
  const productos = ((input && input.productos) || [])
    .map((p) => String((p && p.nombre) || p || '').trim())
    .filter(Boolean).slice(0, 4);
  const cat = (input && input.category) || '';
  const needed = [];
  const known = {};
  const push = (target, why) => needed.push({ target, why });
  // Hechos (solo si el rubro sugiere que el hecho importa y no se ve).
  if (!f.has_local && catHas(cat, PRESENCIAL)) push('local', 'no se ve local físico en web/IG');
  if (!f.takes_reservations && catHas(cat, SERVICIO)) push('reservas', 'no se ven turnos/reservas');
  if (!f.sells_online && catHas(cat, PRODUCTO)) push('venta_online', 'no se ve tienda online');
  // Producto: con productos detectados se elige la estrella; sin ellos,
  // se pregunta qué vende (con las opciones de servicio/marca/sin oferta).
  if (productos.length) push('estrella', 'elegir la estrella entre los productos detectados');
  else push('producto', 'sin productos detectados');
  // Objetivo: siempre (es una decisión del dueño, no un hecho).
  push('objetivo', 'el objetivo lo elige el dueño');
  // Promo: si no hay promo en ningún lado, la respuesta es ninguna.
  if (f.has_promo) push('promo', 'hay promo: confirmar si sigue esta semana');
  else known.q3 = { value: 'ninguna' };
  // Tono: si se detectó voseo/usted, no se pregunta (manda el hecho).
  if (f.tone === 'vos') known.q4 = { value: 'cercano' };
  else if (f.tone === 'usted') known.q4 = { value: 'profesional' };
  else push('tono', 'tono no detectado');
  // Precios: si publican precios, la respuesta es sí.
  if (f.has_prices) known.q5 = { value: 'si' };
  else push('precios', 'no se ven precios');
  // Audiencia: si se detectó, no se pregunta.
  if (Array.isArray(f.audience) && f.audience.length) known.q6 = { value: String(f.audience[0]).slice(0, 60), mix: 'uno' };
  else push('audiencia', 'sin audiencia detectada');
  // Diferencial: si se detectó, no se pregunta.
  if (Array.isArray(f.diferencial) && f.diferencial.length) known.q7 = { value: String(f.diferencial[0]).slice(0, 120), mix: 'uno' };
  else push('diferencial', 'sin diferencial detectado');
  // Líneas rojas: siempre (las pone el dueño, nunca se saben).
  push('lineas_rojas', 'las líneas rojas las pone el dueño');
  // Cap a 8: los hechos sobran primero (el objetivo ya los cubre con
  // sus opciones, como hoy).
  let list = needed.slice();
  while (list.length > MAX_DYN_QUESTIONS) {
    const i = list.findIndex((n) => n.target === 'local' || n.target === 'reservas' || n.target === 'venta_online');
    if (i < 0) break;
    list.splice(i, 1);
  }
  return { needed: list, known, productos };
}

// Opciones con respaldo para un target: solo lo leído (hechos/productos)
// + las listas genéricas/canónicas. El AI elige entre estas; nunca
// inventa una opción.
function groundedOptionsFor(target, input, gaps) {
  const lang = (input && input.lang) === 'en' ? 'en' : 'es';
  const f = (input && input.facts) || {};
  const gen = GEN[lang];
  const productos = (gaps && gaps.productos) || [];
  switch (target) {
    case 'producto':
    case 'estrella':
      return productos.map((p) => ({ v: p, l: p }));
    case 'objetivo': {
      // Mismo filtro que la Q2 adaptativa: cada opción solo si aplica.
      const known = !!(f && f._known);
      return CANON.objetivo.filter((o) => {
        if (!o.need) return true;
        if (o.need === 'local') return known ? !!f.has_local : true;
        if (o.need === 'reservas') return known ? !!f.takes_reservations : true;
        if (o.need === 'online') return known ? !!f.sells_online : true;
        if (o.need === 'creador') return !!f.is_creator;
        return true;
      }).map((o) => ({ v: o.v, l: o.l, need: o.need }));
    }
    case 'promo': return CANON.promo.map((o) => ({ v: o.v, l: o.l }));
    case 'tono': return CANON.tono.map((o) => ({ v: o.v, l: o.l }));
    case 'precios': return CANON.precios.map((o) => ({ v: o.v, l: o.l }));
    case 'audiencia': {
      const out = [];
      const seen = new Set();
      ((f.audience || []).slice(0, 4)).forEach((a) => { const s = String(a || '').trim(); if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push({ v: s, l: s }); } });
      gen.audiencia.forEach((a) => { if (!seen.has(a.toLowerCase())) { seen.add(a.toLowerCase()); out.push({ v: a, l: a }); } });
      return out;
    }
    case 'diferencial': {
      const out = [];
      const seen = new Set();
      ((f.diferencial || []).slice(0, 4)).forEach((a) => { const s = String(a || '').trim(); if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push({ v: s, l: s }); } });
      gen.diferencial.forEach((a) => { if (!seen.has(a.toLowerCase())) { seen.add(a.toLowerCase()); out.push({ v: a, l: a }); } });
      return out;
    }
    case 'lineas_rojas': return gen.lineas_rojas.map((a) => ({ v: a, l: a }));
    case 'local':
    case 'reservas':
    case 'venta_online': return [{ v: 'si', l: gen.si_no[0] }, { v: 'no', l: gen.si_no[1] }];
    default: return [];
  }
}

// Prompt para gpt-4o-mini: los hechos + los huecos + las opciones con
// respaldo. El modelo solo redacta y elige; la validación después
// descarta todo lo que no tenga respaldo.

// UMD.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DYN_TARGETS, DYN_TARGET_SET, MAX_DYN_QUESTIONS,
    preguntasDinamicasGaps, groundedOptionsFor,
  };
}
if (typeof window !== 'undefined') {
  window.PreguntasDinamicas = {
    DYN_TARGETS, DYN_TARGET_SET, MAX_DYN_QUESTIONS,
    preguntasDinamicasGaps, groundedOptionsFor,
  };
}
