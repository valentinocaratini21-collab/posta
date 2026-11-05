// draft-onboarding.js — DRAFT-ONBOARDING (4/11, sin push).
// La prueba divertida del onboarding, estilo draft de FIFA: 4 rondas de 3
// opciones, el cliente elige 1 por ronda, y Posty entiende qué tipo de
// posteos quiere ANTES de armar la primera semana.
//
// REGLAS DURAS (órdenes de Valentino 21:40 + 21:44):
// - 4 rondas, ni una más (tope para que el onboarding siga siendo de un
//   minuto: 4 toques + 1 de campeona).
// - Cada ronda mide UNA dimensión distinta.
// - Las rondas son SIEMPRE del rubro del cliente: el tema nunca sale del
//   rubro literal (el primo que vende campos ve SOLO campos, nunca flores
//   ni genéricos). Las opciones se arman con SUS productos reales (lista
//   del espejo aprobado); sin productos reales, el draft NO corre
//   (fail-closed: el flujo sigue como hoy, sin opciones falsas).
// - Las 5 preguntas exactas no cambian; el draft va DESPUÉS del espejo
//   aprobado y ANTES de generar la semana.
// - Magia solo Posty (✦ 4 puntas dorado/celeste, nunca puntos/polvo).
//
// Este módulo es PURO (sin red, sin DB, sin fechas): define dimensiones,
// selección por rubro, validación del payload que manda el front y la
// aplicación del gusto sobre el spec de la semana (demo.buildDemoSpec).
// El front (prueba.html / en-prueba.html) espeja la tabla de dimensiones
// y la de kinds por rubro; el test cruza ambas contra este módulo.
'use strict';

const VENTA_KINDS = new Set(['promo', 'reserva', 'novedad', 'sorteo']);
const ALL_KINDS = ['tip', 'social', 'novedad', 'promo', 'reserva', 'sorteo'];

// Dimensiones. knob = qué mueve en el spec:
//   photo: preferencia de foto (se guarda en spec + digest; el render de
//     la prueba NO la mueve porque no hay señal fiable de tags para
//     ordenar fotos — decisión documentada en el STATUS).
//   text: cantidad de piezas con titular quemado (assignTextModes).
//   mix: mezcla venta/marca de la ventana de temas.
//   front: el kind que abre la ventana (posición 0).
//   veto: exclusión de un kind de la ventana (con reemplazo o nada).
const DRAFT_DIMS = {
  foto: {
    knob: 'photo',
    q: '¿Cómo querés que salga tu producto?',
    q_en: 'How should your product look?',
    options: [
      { v: 'producto', l: 'El producto, bien grande', en: 'The product, front and center' },
      { v: 'accion', l: 'El producto en acción', en: 'The product in action' },
      { v: 'marca', l: 'Tu marca al frente', en: 'Your brand up front' },
    ],
  },
  protagonista: {
    knob: 'photo',
    q: '¿Quién protagoniza tus posteos?',
    q_en: 'Who stars in your posts?',
    options: [
      { v: 'producto', l: 'El producto', en: 'The product' },
      { v: 'gente', l: 'La gente', en: 'The people' },
      { v: 'lugar', l: 'El lugar', en: 'The place' },
    ],
  },
  texto: {
    knob: 'text',
    q: '¿Querés texto en la foto?',
    q_en: 'Do you want text on the photo?',
    options: [
      { v: 'limpia', l: 'Solo la foto, limpia', en: 'Just the photo, clean', textCount: 0 },
      { v: 'equilibrada', l: 'Un poco de texto', en: 'A little text', textCount: 2 },
      { v: 'titulares', l: 'Con titulares', en: 'With headlines', textCount: 3 },
    ],
  },
  enfoque: {
    knob: 'mix',
    q: '¿Tu semana tira más a…?',
    q_en: 'Should your week lean more toward…?',
    options: [
      { v: 'venta', l: 'Vender', en: 'Selling' },
      { v: 'marca', l: 'Mostrar el negocio', en: 'Showing the business' },
      { v: 'mezcla', l: 'Mezcla', en: 'A mix' },
    ],
  },
  tema: {
    knob: 'front',
    q: '¿Qué tema querés que predomine?',
    q_en: 'Which theme should lead?',
    // Opciones por rubro: kinds presentes en el pool de ese rubro (ver
    // temaOptionsFor). Etiquetas por kind:
    kindLabels: {
      tip: { l: 'Consejos', en: 'Tips' },
      social: { l: 'Comunidad', en: 'Community' },
      novedad: { l: 'Novedades', en: "What's new" },
      promo: { l: 'Promos', en: 'Promos' },
      reserva: { l: 'Reservas', en: 'Bookings' },
      sorteo: { l: 'Sorteos', en: 'Giveaways' },
    },
  },
  veto: {
    knob: 'veto',
    q: '¿Hay algo que preferís que no salga?',
    q_en: 'Anything you would rather leave out?',
    options: [
      { v: 'promo', l: 'Menos promos', en: 'Fewer promos', kind: 'promo' },
      { v: 'sorteo', l: 'Menos sorteos', en: 'Fewer giveaways', kind: 'sorteo' },
      { v: 'ninguno', l: 'Todo me sirve', en: 'All good' },
    ],
  },
};

// Conjuntos por rubro (4 dimensiones distintas; cada conjunto tiene al
// menos 2 rondas que mueven el render de la prueba — texto, mezcla,
// tema o veto — para que el gusto SIEMPRE se vea en la semana).
const DRAFT_SETS = {
  gastronomia: ['foto', 'protagonista', 'texto', 'tema'],
  cafeteria: ['foto', 'protagonista', 'texto', 'tema'],
  bar: ['foto', 'protagonista', 'texto', 'tema'],
  moda: ['foto', 'protagonista', 'tema', 'enfoque'],
  belleza: ['foto', 'protagonista', 'texto', 'enfoque'],
  barberia: ['foto', 'protagonista', 'texto', 'enfoque'],
  flores: ['foto', 'protagonista', 'texto', 'tema'],
  mascotas: ['foto', 'protagonista', 'texto', 'tema'],
  fitness: ['foto', 'texto', 'tema', 'enfoque'],
  salud: ['foto', 'texto', 'tema', 'enfoque'],
  hogar: ['foto', 'protagonista', 'texto', 'tema'],
  deco: ['foto', 'protagonista', 'texto', 'tema'],
  joyeria: ['foto', 'protagonista', 'texto', 'tema'],
  fotografia: ['foto', 'protagonista', 'texto', 'tema'],
  inmobiliaria: ['texto', 'enfoque', 'tema', 'veto'],
  autos: ['foto', 'texto', 'enfoque', 'tema'],
  educacion: ['texto', 'enfoque', 'tema', 'veto'],
  turismo: ['foto', 'protagonista', 'texto', 'tema'],
  eventos: ['foto', 'protagonista', 'texto', 'tema'],
  tecnologia: ['texto', 'enfoque', 'tema', 'veto'],
  profesionales: ['texto', 'enfoque', 'tema', 'veto'],
  servicios: ['texto', 'enfoque', 'tema', 'veto'],
  viajes: ['foto', 'protagonista', 'texto', 'tema'],
  arte: ['foto', 'protagonista', 'texto', 'tema'],
  boliche: ['foto', 'protagonista', 'texto', 'tema'],
  otro: ['foto', 'texto', 'enfoque', 'tema'],
};
const DRAFT_DEFAULT_SET = ['foto', 'texto', 'enfoque', 'tema'];

function draftDimsFor(category) {
  const set = DRAFT_SETS[String(category || '').trim()] || DRAFT_DEFAULT_SET;
  return set.slice();
}

// Kinds de tema por rubro, desde el catálogo real (DEMO_TOPICS). Orden:
// consejos, comunidad y UN kind de venta si el pool lo tiene (promo
// primero, si no novedad) — así el cliente puede aceptar o descartar
// venta de forma explícita, y el descarte de venta es señal (ver
// discardVentaKinds). Si el pool no da 3 kinds, se completa con el resto
// del catálogo en orden fijo (nunca se inventa un kind fuera del pool:
// el front solo ofrece estos; el servidor valida contra ALL_KINDS y el
// spec no-op si el kind no está en la ventana ni en el pool).
function temaKindsFor(category, topicsByCat) {
  const pool = (topicsByCat && topicsByCat[String(category || '').trim()]) || null;
  const kinds = [];
  const push = (k) => { if (k && !kinds.includes(k)) kinds.push(k); };
  if (Array.isArray(pool)) {
    const present = new Set(pool.map((t) => t && t.kind).filter(Boolean));
    if (present.has('tip')) push('tip');
    if (present.has('social')) push('social');
    if (present.has('promo')) push('promo');
    else if (present.has('novedad')) push('novedad');
    for (const k of ['tip', 'social', 'novedad', 'promo', 'reserva', 'sorteo']) {
      if (kinds.length >= 3) break;
      if (present.has(k)) push(k);
    }
    if (kinds.length >= 3) return kinds.slice(0, 3);
    return kinds;
  }
  return ['tip', 'social', 'novedad'];
}

// ---------- Validación del payload del front (fail-closed) ----------
// El front manda: { version:1, dims:[4 ids], rondas:[{dim, opciones:
// [{v, kind?} x3], elegida}], campeona:{dim, v, kind?} | null }.
// Las descartadas NO se confían: se recomputan (toda opción no elegida).
// Inválido → null (la semana se genera como hoy, sin draft).
function draftGustoFrom(raw) {
  let d = null;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  if (d.version !== 1) return null;
  const dims = Array.isArray(d.dims) ? d.dims : null;
  if (!dims || dims.length !== 4) return null;
  if (new Set(dims).size !== 4) return null;
  for (const dim of dims) if (!DRAFT_DIMS[dim]) return null;
  const rondas = Array.isArray(d.rondas) ? d.rondas : null;
  if (!rondas || rondas.length !== 4) return null;
  const out = { version: 1, dims: dims.slice(), rondas: [], campeona: null, descartadas: [] };
  const picks = [];
  for (let i = 0; i < 4; i++) {
    const r = rondas[i];
    if (!r || r.dim !== dims[i]) return null;
    const opts = Array.isArray(r.opciones) ? r.opciones : null;
    if (!opts || opts.length !== 3) return null;
    const seen = new Set();
    const normOpts = [];
    for (const o of opts) {
      if (!o || typeof o.v !== 'string') return null;
      const v = String(o.v).trim();
      if (!v || seen.has(v)) return null;
      seen.add(v);
      const def = DRAFT_DIMS[r.dim];
      let kind = null;
      if (r.dim === 'tema') {
        if (!ALL_KINDS.includes(v)) return null;
        kind = v;
      } else if (r.dim === 'veto') {
        const match = (def.options || []).find((x) => x.v === v);
        if (!match) return null;
        kind = match.kind || null;
      } else {
        const match = (def.options || []).find((x) => x.v === v);
        if (!match) return null;
      }
      normOpts.push({ v, ...(kind ? { kind } : {}) });
    }
    if (!normOpts.some((o) => o.v === String(r.elegida))) return null;
    const elegida = normOpts.find((o) => o.v === String(r.elegida));
    out.rondas.push({ dim: r.dim, opciones: normOpts, elegida: elegida.v, ...(elegida.kind ? { kind: elegida.kind } : {}) });
    picks.push({ dim: r.dim, v: elegida.v, ...(elegida.kind ? { kind: elegida.kind } : {}) });
    for (const o of normOpts) {
      if (o.v !== elegida.v) out.descartadas.push({ dim: r.dim, v: o.v, ...(o.kind ? { kind: o.kind } : {}) });
    }
  }
  if (d.campeona != null) {
    const c = d.campeona;
    if (!c || typeof c.v !== 'string') return null;
    const match = picks.find((p) => p.dim === c.dim && p.v === String(c.v));
    if (!match) return null;
    out.campeona = { dim: match.dim, v: match.v, ...(match.kind ? { kind: match.kind } : {}) };
  }
  return out;
}

// Líneas legibles para richGoal (registro; el consumo real va por el
// spec, no por texto — ver applyDraftToTopics).
function draftGoalLines(draft, lang) {
  if (!draft) return [];
  const en = lang === 'en';
  const pick = (dim) => {
    const r = (draft.rondas || []).find((x) => x.dim === dim);
    return r ? r.elegida : null;
  };
  const parts = [];
  for (const dim of (draft.dims || [])) {
    const v = pick(dim);
    if (v) parts.push(dim + '=' + v);
  }
  if (draft.campeona) parts.push((en ? 'champion' : 'campeona') + '=' + draft.campeona.dim + ':' + draft.campeona.v);
  if (!parts.length) return [];
  return [(en ? 'Draft taste (onboarding draft): ' : 'Gusto del draft (draft del onboarding): ') + parts.join(' · ')];
}

// Cantidad de piezas con titular quemado según la ronda de texto.
function draftTextCount(draft) {
  if (!draft) return 2;
  const r = (draft.rondas || []).find((x) => x.dim === 'texto');
  if (!r) return 2;
  const opt = (DRAFT_DIMS.texto.options || []).find((o) => o.v === r.elegida);
  return opt && typeof opt.textCount === 'number' ? opt.textCount : 2;
}

// Texto forzado de la pieza principal según la campeona (solo si la
// campeona es de la ronda de texto; 'equilibrada' no fuerza nada).
function draftChampionText(draft) {
  if (!draft || !draft.campeona || draft.campeona.dim !== 'texto') return null;
  if (draft.campeona.v === 'titulares') return 'text';
  if (draft.campeona.v === 'limpia') return 'clean';
  return null;
}

// Kinds de venta ofrecidos como opción de tema y NO elegidos: señal de
// descarte (ejemplo de Valentino: si nunca elige promos, la semana 1 no
// trae promos). Solo venta, solo ofrecidos como opción propia: descartar
// "consejos" no veta "comunidad" (eso solo se degrada, ver abajo).
function discardVentaKinds(draft) {
  const out = new Set();
  if (!draft) return out;
  for (const r of (draft.rondas || [])) {
    if (r.dim !== 'tema') continue;
    for (const o of (r.opciones || [])) {
      if (o.kind && VENTA_KINDS.has(o.kind) && o.v !== r.elegida) out.add(o.kind);
    }
  }
  return out;
}

// Kinds de contenido ofrecidos como opción de tema y no elegidos: se
// degradan (van últimos al elegir reemplazos), no se vetan.
function discardDemotedKinds(draft) {
  const out = new Set();
  if (!draft) return out;
  for (const r of (draft.rondas || [])) {
    if (r.dim !== 'tema') continue;
    for (const o of (r.opciones || [])) {
      if (o.kind && !VENTA_KINDS.has(o.kind) && o.v !== r.elegida) out.add(o.kind);
    }
  }
  return out;
}

// ---------- Aplicación sobre la ventana de temas (pura, testeable) ----------
// topics: ventana ya elegida (array, se copia). pool: lista completa de
// temas (allTopics) para reemplazos. Nunca achica la ventana, nunca
// inventa un tema: si no hay reemplazo válido, el slot queda como está.
// Orden: veto → mezcla → tema al frente → campeona al frente (gana).
function applyDraftToTopics({ topics, pool, draft }) {
  if (!draft || !Array.isArray(topics) || !topics.length) return topics;
  const win = topics.slice();
  const all = Array.isArray(pool) ? pool : [];
  const inWin = () => new Set(win);
  const demoted = discardDemotedKinds(draft);
  // Candidatos de reemplazo: fuera de la ventana, no vetados, con los
  // degradados últimos (orden estable).
  const veto = new Set();
  const vetoRound = (draft.rondas || []).find((x) => x.dim === 'veto');
  if (vetoRound) {
    const v = (DRAFT_DIMS.veto.options || []).find((o) => o.v === vetoRound.elegida);
    if (v && v.kind) veto.add(v.kind);
  }
  for (const k of discardVentaKinds(draft)) veto.add(k);
  const candidates = (excludeKinds) => {
    const used = inWin();
    const list = all.filter((t) => t && !used.has(t) && !(excludeKinds && excludeKinds.has(t.kind)));
    list.sort((a, b) => ((demoted.has(a.kind) ? 1 : 0) - (demoted.has(b.kind) ? 1 : 0)));
    return list;
  };
  // 1) VETO: fuera los vetados, con reemplazo si hay.
  if (veto.size) {
    for (let i = 0; i < win.length; i++) {
      if (!win[i] || !veto.has(win[i].kind)) continue;
      const rep = candidates(veto).find((t) => t.kind !== win[i].kind);
      if (rep) win[i] = rep;
    }
  }
  // 2) MEZCLA (enfoque): venta = al menos 2 de venta; marca = a lo sumo 1.
  const enfoque = (draft.rondas || []).find((x) => x.dim === 'enfoque');
  if (enfoque && (enfoque.elegida === 'venta' || enfoque.elegida === 'marca')) {
    const isVenta = (t) => !!(t && VENTA_KINDS.has(t.kind));
    if (enfoque.elegida === 'venta') {
      while (win.filter(isVenta).length < 2) {
        const idx = win.map((t, i) => (!isVenta(t) ? i : -1)).filter((i) => i >= 0).pop();
        if (idx == null) break;
        const rep = candidates(veto).find((t) => isVenta(t));
        if (!rep) break;
        win[idx] = rep;
      }
    } else {
      while (win.filter(isVenta).length > 1) {
        const idx = win.map((t, i) => (isVenta(t) ? i : -1)).filter((i) => i >= 0).pop();
        if (idx == null) break;
        const rep = candidates(veto).find((t) => !isVenta(t));
        if (!rep) break;
        win[idx] = rep;
      }
    }
  }
  // 3) TEMA al frente: primer tema de ese kind a la posición 0; si no
  // está en la ventana, entra desde el pool (desplaza al 0 actual).
  const frontKind = (kind) => {
    if (!kind) return;
    const at = win.findIndex((t) => t && t.kind === kind);
    if (at > 0) { const [t] = win.splice(at, 1); win.unshift(t); return; }
    if (at === 0) return;
    const rep = candidates(veto).find((t) => t.kind === kind);
    if (rep) win[0] = rep;
  };
  const tema = (draft.rondas || []).find((x) => x.dim === 'tema');
  if (tema) frontKind(tema.kind || tema.elegida);
  // 4) CAMPEONA al frente (gana la posición 0 si trae kind).
  if (draft.campeona && draft.campeona.kind) frontKind(draft.campeona.kind);
  return win;
}

// ---------- Aplicación sobre el pool de la semana de la APP (lote 2/8) ----------
// Misma semántica que applyDraftToTopics (veto → mezcla → tema → campeona),
// adaptada al vocabulario de la semana de la app: las ideas llevan `tipo`
// (promo/tip/social/detras/novedad), no `kind`. Mapeo: tip→tip, social→
// social, novedad→novedad, promo→promo; reserva y sorteo NO tienen tipo
// en la app (sin efecto observable — se documenta, no se inventa otro).
// VENTA en la app = los kinds de venta que existen como tipo (promo,
// novedad), igual que en la prueba. Diferencias deliberadas con la prueba:
// - Nunca achica el pool por debajo de `deficit` (fail-open como
//   filtrarPool de sabe-siempre): un veto que dejaría la semana
//   incompleta no se aplica.
// - La mezcla y el frente ORDENAN, no reemplazan: la semana de la app
//   ya viene con ideas generadas; reordenar alcanza para que el gusto
//   se vea en los picks (el slice posterior toma los primeros).
// - Tras reordenar, se preserva la garantía de fixTipos (nunca dos
//   seguidas del mismo tipo) con canjes locales; esa garantía dura gana
//   sobre el conteo exacto de la mezcla en casos borde.
// - La campeona queda primera (posteo principal/preferido); pasos
//   posteriores del pipeline (rebalance de intención, cerebro) pueden
//   reordenar, igual que en la prueba el filtro pre-lanzamiento puede
//   reescribir un tema del draft.
const KIND_TO_TIPO = { tip: 'tip', social: 'social', novedad: 'novedad', promo: 'promo', reserva: null, sorteo: null };
const VENTA_APP = new Set(['promo', 'novedad']);

function applyDraftToPool({ pool, draft, deficit }) {
  const orig = Array.isArray(pool) ? pool.slice() : [];
  const out = { pool: orig, quitados: [], frente: null, aplicado: false };
  if (!draft || !orig.length) return out;
  const def = Math.max(1, Number(deficit) || 1);
  const tipoOf = (i) => String((i && i.tipo) || '').toLowerCase();
  let cur = orig.slice();
  // 1) VETO: kind del veto explícito + kinds de venta descartados en tema.
  const veto = new Set();
  const vetoRound = (draft.rondas || []).find((x) => x.dim === 'veto');
  if (vetoRound) {
    const v = (DRAFT_DIMS.veto.options || []).find((o) => o.v === vetoRound.elegida);
    if (v && v.kind && KIND_TO_TIPO[v.kind]) veto.add(KIND_TO_TIPO[v.kind]);
  }
  for (const k of discardVentaKinds(draft)) if (KIND_TO_TIPO[k]) veto.add(k);
  if (veto.size) {
    const kept = cur.filter((i) => !veto.has(tipoOf(i)));
    if (kept.length >= def) {
      for (const i of cur) if (veto.has(tipoOf(i))) out.quitados.push({ titulo: String(i.titulo || ''), motivo: 'draft_veto' });
      cur = kept;
    }
    // Si quitar rompería el déficit, el veto no se aplica (fail-open).
  }
  // 2) DEGRADADOS: kinds no-venta descartados en tema → van últimos.
  const demoted = new Set();
  for (const k of discardDemotedKinds(draft)) if (KIND_TO_TIPO[k]) demoted.add(KIND_TO_TIPO[k]);
  if (demoted.size) {
    const head = cur.filter((i) => !demoted.has(tipoOf(i)));
    const tail = cur.filter((i) => demoted.has(tipoOf(i)));
    cur = head.concat(tail);
  }
  // 3) MEZCLA (enfoque) sobre la ventana efectiva (los primeros `def`):
  // venta → al menos 2 de venta; marca → a lo sumo 1. Solo canjes dentro
  // del pool, nunca se descarta nada.
  const enfoque = (draft.rondas || []).find((x) => x.dim === 'enfoque');
  const esVenta = (i) => VENTA_APP.has(tipoOf(i));
  if (enfoque && (enfoque.elegida === 'venta' || enfoque.elegida === 'marca')) {
    if (enfoque.elegida === 'venta') {
      while (cur.slice(0, def).filter(esVenta).length < 2) {
        let ri = -1;
        for (let i = def; i < cur.length; i++) if (esVenta(cur[i])) { ri = i; break; }
        let wi = -1;
        for (let i = def - 1; i >= 0; i--) if (!esVenta(cur[i])) { wi = i; break; }
        if (ri < 0 || wi < 0) break;
        const tmp = cur[wi]; cur[wi] = cur[ri]; cur[ri] = tmp;
      }
    } else {
      while (cur.slice(0, def).filter(esVenta).length > 1) {
        let wi = -1;
        for (let i = def - 1; i >= 0; i--) if (esVenta(cur[i])) { wi = i; break; }
        let ri = -1;
        for (let i = def; i < cur.length; i++) if (!esVenta(cur[i])) { ri = i; break; }
        if (wi < 0 || ri < 0) break;
        const tmp = cur[wi]; cur[wi] = cur[ri]; cur[ri] = tmp;
      }
    }
  }
  // 4) FRENTE: tema al frente, campeona al frente (gana la posición 0).
  const frontTipo = (tipo) => {
    if (!tipo) return;
    const at = cur.findIndex((i) => tipoOf(i) === tipo);
    if (at > 0) { const [t] = cur.splice(at, 1); cur.unshift(t); }
  };
  const tema = (draft.rondas || []).find((x) => x.dim === 'tema');
  if (tema) frontTipo(KIND_TO_TIPO[tema.kind || tema.elegida]);
  if (draft.campeona && draft.campeona.kind) frontTipo(KIND_TO_TIPO[draft.campeona.kind]);
  // 5) Preservar fixTipos: nunca dos seguidas del mismo tipo (la
  // posición 0 no se toca: la campeona/tema queda al frente).
  for (let i = 1; i < cur.length; i++) {
    if (!tipoOf(cur[i]) || tipoOf(cur[i]) !== tipoOf(cur[i - 1])) continue;
    let j = -1;
    for (let k = i + 1; k < cur.length; k++) if (tipoOf(cur[k]) !== tipoOf(cur[i])) { j = k; break; }
    if (j < 0) break;
    const tmp = cur[i]; cur[i] = cur[j]; cur[j] = tmp;
  }
  out.pool = cur;
  out.frente = cur.length ? tipoOf(cur[0]) : null;
  out.aplicado = true;
  return out;
}

module.exports = {
  DRAFT_VERSION: 1,
  VENTA_KINDS,
  ALL_KINDS,
  DRAFT_DIMS,
  DRAFT_SETS,
  DRAFT_DEFAULT_SET,
  draftDimsFor,
  temaKindsFor,
  draftGustoFrom,
  draftGoalLines,
  draftTextCount,
  draftChampionText,
  discardVentaKinds,
  discardDemotedKinds,
  applyDraftToTopics,
  KIND_TO_TIPO,
  VENTA_APP,
  applyDraftToPool,
};
