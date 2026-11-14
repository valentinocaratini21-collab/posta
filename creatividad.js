'use strict';
/* =====================================================================
 * creatividad.js — CREATIVIDAD COMO SISTEMA (LOTE v1002, 2026-11-13)
 * Requisito de Valentino (13/11 00:30): «tienen que sentir que somos
 * muy creativos con los posteos y con su marca. y que usamos distintos
 * prompts para los posteos! cada posteo tiene que ser distinto al
 * anterior, promocionando otra cosa y pensar estratégicamente el orden
 * de los posteos».
 *
 * Hasta este lote la variedad era EMERGENTE (rotación de tipos por día
 * en ideaDiariaSintetica, rotación de temas/ángulos en el demo vía
 * enforceTopicRotation, roles de escena a ciegas por índice) pero
 * NADA garantizaba como sistema:
 *   (a) que el posteo de hoy no venda la MISMA estrella que el de ayer
 *       (ideaDiariaSintetica devolvía la estrella validada TODOS los
 *       días: con estrella, el ensure vendía siempre lo mismo);
 *   (b) que la semana tenga un ORDEN pensado (qué abre, qué sigue,
 *       qué cierra) y no una lista;
 *   (c) que quede REGISTRO por posteo de su rol, su estrella y la
 *       huella de su prompt, comparable contra el posteo anterior.
 *
 * Este módulo es la capa determinística (USD 0, sin IA nueva):
 *   · SECUENCIA ESTRATÉGICA de roles por posición de semana:
 *     héroe → detrás de escena → prueba social → lugar → oferta →
 *     tip → comunidad. Un rol sin material honesto NO se fuerza:
 *     'oferta' exige una promo REAL del digest (nunca se inventa una
 *     oferta) y 'prueba_social' exige evidencia real (evidencia de la
 *     estrella, años del negocio o ciudad — las mismas fuentes que
 *     sales-brain acepta como prueba). El rol saltado queda registrado.
 *   · ESTRELLAS ROTADAS: la posición héroe lleva la estrella
 *     principal; las demás posiciones con producto rotan por los
 *     productos/servicios NOMBRADOS del fundamento (digest.productos
 *     _nombrados si el correctivo-4 ya aterrizó; si no, digest
 *     .productos/servicios) y NINGÚN posteo repite la estrella del
 *     posteo anterior. Con una sola estrella, solo el héroe la lleva:
 *     el resto de la semana se diferencia por rol y escena, no por
 *     vender lo mismo siete veces.
 *   · ESCENA POR ROL: cada rol trae su lista corta de escenarios
 *     concretos (texto de brief de imagen, canal sceneRole que ya
 *     consumen conceptShotGenerateInner y la ruta IA de la prueba);
 *     la elección es determinística por semilla (semana+posición) y
 *     nunca repite la escena del posteo anterior.
 *   · ANTI-REPETICIÓN CON REGISTRO: compararConAnterior() compara la
 *     huella de una pieza {estrella, rol, prompt} contra la del
 *     posteo anterior de la cuenta: misma estrella, mismo rol o
 *     prompt con similitud de tokens (Jaccard) >= UMBRAL_SIMILITUD
 *     _PROMPT (0.6, declarado acá) = choque. La huella (con
 *     prompt_hash sha1) se guarda en posts.creatividad (JSON) y el
 *     choque queda en el log — la semana NUNCA se frena por esto
 *     (fail-honesto: sin alternativa real, se entrega y se marca).
 *
 * Todo puro y testeable: sin DB, sin red, sin reloj (la semilla la
 * pasa el llamador). Los llamadores (demo.js buildDemoSpec, server.js
 * generateWeekDrafts / ideaDiariaSintetica / makeIdeaDraft /
 * importTrialWeek) resuelven su contexto y estampan el resultado.
 * ===================================================================== */
const crypto = require('crypto');

// Orden estratégico de la semana (rotación aprobada por Valentino:
// héroe · detrás de escena · prueba social · lugar/experiencia ·
// oferta real · educación/tip · comunidad/historia).
const ROLES_SEMANA = ['heroe', 'detras', 'prueba_social', 'lugar', 'oferta', 'tip', 'comunidad'];

// Roles que llevan un producto/estrella nombrada como protagonista.
// 'detras', 'lugar' y 'comunidad' venden el negocio, no un ítem: su
// estrella queda vacía a propósito (la diferencia la hacen rol+escena).
const ROLES_CON_ESTRELLA = new Set(['heroe', 'oferta', 'tip', 'prueba_social']);

// Similitud de prompts: Jaccard sobre tokens significativos >= 0.6 se
// considera "el mismo prompt con otro nombre" (umbral declarado).
const UMBRAL_SIMILITUD_PROMPT = 0.6;

// Escenarios por rol: textos de escena para el brief de imagen (el
// canal sceneRole del pipeline). Concretos, sin personas obligadas
// (funcionan con o sin permiso de gente) y distintos entre sí.
const ESCENARIOS = {
  heroe: [
    { key: 'heroe-primer-plano', texto: 'el producto héroe en primer plano, protagonista absoluto del cuadro, fondo simple que lo hace brillar' },
    { key: 'heroe-en-manos', texto: 'el producto héroe sostenido en manos, presentado a cámara como «esto es lo nuestro»' },
    { key: 'heroe-recien-hecho', texto: 'el producto héroe recién hecho, en su mejor momento, humeante o recién terminado según el rubro' },
  ],
  detras: [
    { key: 'detras-proceso', texto: 'detrás de escena: el proceso de trabajo en curso, las manos y las herramientas del oficio' },
    { key: 'detras-preparacion', texto: 'detrás de escena: la preparación antes de abrir, todo quedando listo' },
    { key: 'detras-detalle-oficio', texto: 'detrás de escena: un detalle del oficio que el cliente nunca ve, en primer plano' },
  ],
  prueba_social: [
    { key: 'prueba-momento-cliente', texto: 'el momento de disfrute del cliente con el producto, escena cálida y real, sin posar' },
    { key: 'prueba-resultado', texto: 'el resultado terminado y entregado, listo para el cliente, como prueba del trabajo' },
    { key: 'prueba-ambiente-lleno', texto: 'el negocio en su momento de más vida, con clientes disfrutando, ambiente real' },
  ],
  lugar: [
    { key: 'lugar-fachada', texto: 'el lugar desde afuera, su frente y su identidad, como invitando a entrar' },
    { key: 'lugar-rincon', texto: 'el rincón con más personalidad del lugar, su ambiente y su luz propia' },
    { key: 'lugar-mesa-lista', texto: 'el espacio del cliente ya preparado y esperando, todo en su lugar' },
  ],
  oferta: [
    { key: 'oferta-producto-precio', texto: 'el producto de la oferta como héroe, presentación limpia y directa, listo para aprovechar' },
    { key: 'oferta-combo', texto: 'la combinación de la oferta completa en una sola escena apetecible' },
    { key: 'oferta-urgencia', texto: 'el producto de la oferta en su contexto de uso, sensación de oportunidad del momento' },
  ],
  tip: [
    { key: 'tip-paso', texto: 'un paso concreto del saber del oficio, mostrado de cerca y con claridad' },
    { key: 'tip-comparacion', texto: 'la comparación que enseña: el detalle bien hecho contra el error común, en una escena' },
    { key: 'tip-herramienta', texto: 'la herramienta o el ingrediente clave del tip, protagonista de la escena' },
  ],
  comunidad: [
    { key: 'comunidad-historia', texto: 'la escena que cuenta la historia del negocio: su objeto o rincón con más memoria' },
    { key: 'comunidad-barrio', texto: 'el negocio como parte de su barrio, su calle y su gente alrededor' },
    { key: 'comunidad-equipo', texto: 'el equipo del negocio en su momento genuino, el detrás humano de la marca' },
  ],
};

function normNombre(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Productos/servicios NOMBRADOS del fundamento, en orden de trabajo:
 * la estrella principal primero (la pasa el llamador, que la resuelve
 * con effectiveStarOf), después productos_nombrados (correctivo-4) o
 * productos y servicios del digest. Sin genéricos de rubro: la lista
 * sale de los ítems con nombre que el digest ya validó. */
function estrellasDeDigest(digest, estrellaPrincipal) {
  const out = [];
  const seen = new Set();
  const push = (nombre) => {
    const n = String(nombre || '').trim();
    if (!n) return;
    const k = normNombre(n);
    if (!k || seen.has(k)) return;
    seen.add(k); out.push(n);
  };
  if (estrellaPrincipal) push(estrellaPrincipal);
  const d = digest || {};
  const nombrados = Array.isArray(d.productos_nombrados) ? d.productos_nombrados : [];
  for (const p of nombrados) push(typeof p === 'string' ? p : (p && (p.nombre || p.titulo)));
  const productos = Array.isArray(d.productos) ? d.productos : [];
  for (const p of productos) push(typeof p === 'string' ? p : (p && (p.nombre || p.titulo)));
  const servicios = Array.isArray(d.servicios) ? d.servicios : [];
  for (const p of servicios) push(typeof p === 'string' ? p : (p && (p.nombre || p.titulo)));
  return out;
}

/* Contexto de disponibilidad desde el digest, con las fuentes de
 * prueba que sales-brain ya acepta: la ciudad del negocio y sus años
 * (del diferencial). La evidencia de la estrella (ventas) la suma el
 * llamador, que es quien puede resolver effectiveStarOf. */
function ctxDesdeDigest(digest) {
  const d = digest || {};
  let tienePrueba = false;
  try {
    const dif = String(d.diferencial || '');
    if (d.ciudad) tienePrueba = true;
    if (/\d+\s*a[ñn]os/i.test(dif) || /desde\s+(el\s+)?(19|20)\d{2}/i.test(dif)) tienePrueba = true;
  } catch (e) { /* sin diferencial legible: sin prueba declarada */ }
  return { tienePromo: Array.isArray(d.promos) && d.promos.length > 0, tienePrueba };
}

/* ¿El rol tiene material honesto en este negocio?
 * ctx = { tienePromo, tienePrueba } — lo resuelve el llamador desde
 * el digest (promo real declarada; evidencia real de prueba). */
function rolDisponible(rol, ctx) {
  const c = ctx || {};
  if (rol === 'oferta') return !!c.tienePromo;
  if (rol === 'prueba_social') return !!c.tienePrueba;
  return true;
}

/* La secuencia de la semana para n posiciones: recorre ROLES_SEMANA
 * en orden y salta (registrando) los roles sin material honesto; si
 * n supera los roles disponibles, sigue ciclando la secuencia ya
 * filtrada (una semana nunca pasa de 7, pero el plan no se rompe).
 * Devuelve { pasos: [{orden, rol}], saltados: [rol...] }. */
function planSecuencia(n, ctx) {
  const total = Math.max(0, parseInt(n, 10) || 0);
  const disponibles = ROLES_SEMANA.filter((r) => rolDisponible(r, ctx));
  const saltados = ROLES_SEMANA.filter((r) => !rolDisponible(r, ctx));
  const pasos = [];
  if (!disponibles.length) return { pasos, saltados };
  for (let i = 0; i < total; i++) {
    pasos.push({ orden: i, rol: disponibles[i % disponibles.length] });
  }
  return { pasos, saltados };
}

/* Asigna la estrella de cada paso (muta y devuelve los pasos):
 * · el paso 'heroe' lleva la estrella principal (estrellas[0]);
 * · los demás pasos con producto rotan por el resto de la lista;
 * · ningún paso repite la estrella del paso anterior: si la rotación
 *   cae en la misma (lista de 1), el paso queda SIN estrella y marcado
 *   (sin_estrella_por_repeticion) — se diferencia por rol y escena;
 * · los roles sin producto quedan con estrella '' siempre. */
function asignarEstrellas(pasos, estrellas) {
  const stars = (Array.isArray(estrellas) ? estrellas : []).filter(Boolean);
  let cursor = 0; // rotación sobre toda la lista de estrellas
  let prevPostStar = ''; // estrella del posteo inmediatamente anterior
  let principalUsada = false;
  for (const paso of pasos || []) {
    paso.estrella = '';
    if (!ROLES_CON_ESTRELLA.has(paso.rol) || !stars.length) { prevPostStar = ''; continue; }
    if (stars.length === 1) {
      // Una sola estrella: la lleva SOLO el primer paso con producto
      // (el héroe en el plan normal). Repetirla en cada paso con
      // producto es exactamente la semana monótona que este lote
      // viene a matar; el resto se diferencia por rol y escena.
      if (!principalUsada) { paso.estrella = stars[0]; principalUsada = true; }
      else paso.sin_estrella_por_repeticion = true;
    } else if (paso.rol === 'heroe' && normNombre(stars[0]) !== normNombre(prevPostStar)) {
      paso.estrella = stars[0];
      cursor = 1 % stars.length;
    } else {
      for (let k = 0; k < stars.length; k++) {
        const cand = stars[(cursor + k) % stars.length];
        if (normNombre(cand) !== normNombre(prevPostStar)) {
          paso.estrella = cand;
          cursor = (cursor + k + 1) % stars.length;
          break;
        }
      }
      if (!paso.estrella) paso.sin_estrella_por_repeticion = true;
    }
    prevPostStar = paso.estrella;
  }
  return pasos;
}

/* Escena determinística de un rol: la semilla (semana + posición, o
 * lo que pase el llamador) elige la variante; si cae en la escena del
 * posteo anterior, avanza a la siguiente variante. */
function escenarioPara(rol, semilla, evitarKey) {
  const lista = ESCENARIOS[rol] || ESCENARIOS.comunidad;
  let h = 0;
  const s = String(semilla || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  let idx = h % lista.length;
  if (evitarKey && lista[idx].key === evitarKey && lista.length > 1) idx = (idx + 1) % lista.length;
  return lista[idx];
}

// ---------- huella de prompt ----------
const STOPWORDS = new Set(('the a an and or of to in on at for with without from by as is are be this that it its ' +
  'el la los las un una unos unas de del en y o con sin por para que es son al lo su sus como mas ' +
  'image photo photograph photography photorealistic realistic vertical composition lighting light background scene style modern clean warm soft natural detailed detail high quality product business post instagram portrait close shot view angle camera color colors palette').split(' '));

function tokensPrompt(texto) {
  const out = new Set();
  const norm = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const t of norm.split(/[^a-z0-9]+/)) {
    if (t.length >= 4 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

/* Similitud Jaccard entre dos prompts (0..1). null si alguno no
 * tiene tokens comparables (sin prompt registrado no hay veredicto). */
function similitudPrompt(a, b) {
  const ta = tokensPrompt(a), tb = tokensPrompt(b);
  if (!ta.size || !tb.size) return null;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : null;
}

function promptHashDe(texto) {
  const t = String(texto || '');
  if (!t.trim()) return '';
  return crypto.createHash('sha1').update(t).digest('hex').slice(0, 16);
}

/* La comparación del sistema: pieza actual contra la anterior de la
 * cuenta. actual/anterior = { estrella, rol, prompt }. Devuelve
 * { ok, choques: [...], similitud } — el llamador registra el
 * veredicto en la metadata del posteo y en el log; NUNCA frena. */
function compararConAnterior(actual, anterior) {
  const choques = [];
  if (!actual || !anterior) return { ok: true, choques, similitud: null };
  if (actual.estrella && anterior.estrella
    && normNombre(actual.estrella) === normNombre(anterior.estrella)) choques.push('misma_estrella');
  if (actual.rol && anterior.rol && actual.rol === anterior.rol) choques.push('mismo_rol');
  const sim = similitudPrompt(actual.prompt || '', anterior.prompt || '');
  if (sim != null && sim >= UMBRAL_SIMILITUD_PROMPT) choques.push('prompt_similar');
  return { ok: choques.length === 0, choques, similitud: sim };
}

/* Huella comparable desde una fila de posts: la estrella sale de la
 * metadata del lote si está, si no del producto del fundamento
 * (rg_producto); el prompt, de image_prompt (el texto real con el
 * que se generó la imagen, vía promptForMedia). */
function huellaDesdePost(row) {
  if (!row) return null;
  let meta = null;
  try { meta = row.creatividad ? JSON.parse(row.creatividad) : null; } catch (e) { meta = null; }
  return {
    post_id: row.id || null,
    estrella: (meta && meta.estrella) || row.rg_producto || '',
    rol: (meta && meta.rol) || '',
    prompt: row.image_prompt || '',
  };
}

/* El ensure diario no arma una semana: su rol sale del tipo del día
 * (la rotación vigente social/detras/novedad/promo) para que la
 * metadata hable el mismo idioma que el plan semanal. */
function rolDesdeTipo(tipo, esEstrellaPrincipal) {
  switch (String(tipo || '').toLowerCase()) {
    case 'promo': return 'oferta';
    case 'detras': return 'detras';
    case 'novedad': return 'tip';
    case 'social': return esEstrellaPrincipal ? 'heroe' : 'comunidad';
    default: return 'comunidad';
  }
}

module.exports = {
  ROLES_SEMANA,
  ROLES_CON_ESTRELLA,
  UMBRAL_SIMILITUD_PROMPT,
  ESCENARIOS,
  normNombre,
  ctxDesdeDigest,
  estrellasDeDigest,
  rolDisponible,
  planSecuencia,
  asignarEstrellas,
  escenarioPara,
  tokensPrompt,
  similitudPrompt,
  promptHashDe,
  compararConAnterior,
  huellaDesdePost,
  rolDesdeTipo,
};
