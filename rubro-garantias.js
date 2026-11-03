'use strict';
/* =====================================================================
 * rubro-garantias.js — LOTE RUBRO-GARANTÍAS ×6 (aprobado Valentino 3/11,
 * «dale, armemos todo»). Motivo: un cliente que vende campos recibió
 * posteos de flores. Para que SIEMPRE se postee del rubro literal del
 * cliente, 6 garantías que se suman a lo ya construido (puerta
 * fail-closed de rubro-literal, espejo, vetos y confirmación semanal de
 * fundamento-literal) y NO lo reescriben:
 *  1) PUERTA EN LA GENERACIÓN MISMA: cada idea, antes de existir como
 *     borrador programable, debe calzar con un producto del fundamento
 *     (match por raíz, igual criterio que el veto: flor = flores, sin
 *     falso positivo en «florecer»). Sin calce: queda en revisión con
 *     motivo, nunca se programa en silencio. NO duplica el post-filtro
 *     de fundamento-literal (ese filtra vetos); este es el chequeo FINAL
 *     de producto.
 *  2) «NO ES MI RUBRO» en revisión: veta con el mecanismo existente y
 *     regenera el hueco (rehacer vigente, que ya evita el tema vetado
 *     vía excludedTopicsLine).
 *  3) RUBRO VISIBLE en cada borrador: línea display-only con producto +
 *     procedencia; sin producto → «Sin producto asociado» + revisión.
 *  4) DOS FUENTES O PALABRA DEL CLIENTE: un producto entra al
 *     fundamento por vía automática solo con 2 fuentes distintas o
 *     palabra del cliente; 1 señal débil = hipótesis (se muestra para
 *     confirmar, nunca genera en silencio).
 *  5) TEMAS GENÉRICOS BORRADOS con fundamento no vacío: los pools de
 *     relleno solo existen para el caso sin fundamento (ya bloqueado
 *     por la puerta fail-closed).
 *  6) RUBRO SEGÚN SU PROPIO FEED: los temas de sus posteos con más
 *     respuesta refuerzan los productos con procedencia «tu feed».
 * Todo puro y determinista, USD 0. Sin credenciales ni logins nuevos.
 * ===================================================================== */
const fl = require('./fundamento-literal');
const norm = fl.norm;
const distinctiveWords = fl.distinctiveWords;
// Palabras que nunca bastan solas para afirmar un producto (genéricos del
// negocio). Copia del criterio de fundamento-literal: un producto cuyo
// único distintivo es genérico solo calza por frase exacta.
const GENERIC = new Set(('producto productos servicio servicios local negocio tienda tiendaonline envios envio oferta ofertas promo promocion descuento descuentos nuevo nueva nuevos nuevas semana hoy dia dias cliente clientes calidad precio precios venta ventas catalogo ver mas inicio home contacto nosotros').split(' '));

function stem(w) {
  let s = String(w || '');
  if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1);
  return s;
}
function textoIdea(idea) {
  if (!idea) return '';
  return norm(`${idea.titulo || ''} ${idea.angulo || ''} ${idea.tipo || ''} ${idea.formato || ''} ${idea.caption || ''} ${idea.porque || ''}`);
}
/* productoDeIdea: el producto del fundamento que calza con la idea, o
 * null. Calce por frase exacta del nombre, o por palabra distintiva del
 * producto (≥4 letras, no genérica) presente en el texto o en su raíz. */
function productoDeIdea(idea, productos) {
  const texto = textoIdea(idea);
  if (!texto || !Array.isArray(productos) || !productos.length) return null;
  const palabras = new Set(texto.split(' ').filter(Boolean));
  const raices = new Set([...palabras].map(stem));
  for (const p of productos) {
    const nombre = String((p && p.nombre) || p || '').trim();
    if (nombre.length < 3) continue;
    const nn = norm(nombre);
    if (!nn) continue;
    if (texto.includes(nn)) return p;
    const dw = distinctiveWords(nombre).filter((w) => !GENERIC.has(w));
    if (dw.length && dw.some((w) => palabras.has(w) || raices.has(stem(w)))) return p;
  }
  return null;
}
/* anotarIdeas: cada idea lleva _rgProducto {nombre, procedencia} o
 * _rgSinProducto=true. Sin productos en el input, no anota nada (los
 * caminos viejos sin fundamento no se ven afectados). */
function anotarIdeas(ideas, productos) {
  if (!Array.isArray(ideas)) return [];
  if (!Array.isArray(productos) || !productos.length) return ideas;
  return ideas.map((id) => {
    const m = productoDeIdea(id, productos);
    if (m) return { ...id, _rgProducto: { nombre: String(m.nombre || ''), procedencia: String(m.procedencia || 'negocio') } };
    return { ...id, _rgSinProducto: true };
  });
}
/* filtrarGenericos: con fundamento no vacío, un pool de plantillas solo
 * conserva las ideas ancladas a un producto real (título/ángulo que lo
 * nombra). Sin productos, el pool queda intacto (el caso sin fundamento
 * ya lo bloquea la puerta fail-closed en el llamador). */
function filtrarGenericos(pool, productos) {
  if (!Array.isArray(pool)) return [];
  if (!Array.isArray(productos) || !productos.length) return pool;
  return pool.filter((id) => !!productoDeIdea(id, productos));
}
/* ---------- 4) DOS FUENTES O PALABRA DEL CLIENTE ---------- */
/* clasificarFuentes: fuentes = {bio:[], web:[], foto:[], link:[],
 * feed:[], cliente:[]} (nombres). Devuelve {confirmados, hipotesis}:
 * un producto con fuente 'cliente' (texto libre, espejo aprobado,
 * confirmación semanal) está confirmado siempre; con 2+ fuentes
 * distintas, confirmado; con 1 sola fuente no-cliente, hipótesis. */
function clasificarFuentes(fuentes) {
  const f = fuentes || {};
  const orden = ['cliente', 'bio', 'web', 'foto', 'link', 'feed'];
  const porNombre = new Map();
  for (const src of orden) {
    for (const raw of (Array.isArray(f[src]) ? f[src] : [])) {
      const nombre = String((raw && raw.nombre) || raw || '').trim();
      if (nombre.length < 3) continue;
      const k = norm(nombre);
      if (!k) continue;
      if (!porNombre.has(k)) porNombre.set(k, { nombre, fuentes: [] });
      const e = porNombre.get(k);
      if (!e.fuentes.includes(src)) e.fuentes.push(src);
    }
  }
  const confirmados = [];
  const hipotesis = [];
  for (const e of porNombre.values()) {
    if (e.fuentes.includes('cliente') || e.fuentes.length >= 2) confirmados.push(e);
    else hipotesis.push(e);
  }
  return { confirmados, hipotesis };
}
/* productosDesdeDigest: normaliza productos del digest + ADN a la forma
 * {nombre, procedencia} sin duplicar (por nombre normalizado). El ADN
 * aporta productos/servicios/estrella con procedencia 'adn'. */
function productosDesdeDigest(digestProductos, dna) {
  const out = [];
  const seen = new Set();
  const push = (item, proc) => {
    const nombre = String((item && item.nombre) || item || '').trim();
    if (nombre.length < 3) return;
    const k = norm(nombre);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ nombre, procedencia: String((item && item.procedencia) || proc || 'negocio') });
  };
  for (const p of (Array.isArray(digestProductos) ? digestProductos : [])) push(p, 'negocio');
  if (dna) {
    for (const p of (Array.isArray(dna.productos) ? dna.productos : [])) push(p, 'adn');
    for (const p of (Array.isArray(dna.servicios) ? dna.servicios : [])) push(p, 'adn');
    if (dna.producto_estrella) push(dna.producto_estrella, 'adn');
  }
  return out;
}
/* ---------- 6) RUBRO SEGÚN SU PROPIO FEED ---------- */
/* temasFeedPropio: filas {caption, likes, comments} de posteos
 * PUBLICADOS propios → palabras distintivas rankeadas por respuesta
 * (likes + 3×comments, el mismo peso que usa el reporte semanal). Si
 * NO hay engagement en ninguna fila (todo 0 o null), usa frecuencia de
 * mención (nunca inventa engagement: el score queda en menciones). */
function temasFeedPropio(rows) {
  const acc = new Map();
  let hayEngagement = false;
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const cap = String((r && r.caption) || '');
    if (!cap.trim()) continue;
    const likes = Number((r && (r.likes ?? r.ig_likes)) || 0) || 0;
    const comments = Number((r && (r.comments ?? r.ig_comments)) || 0) || 0;
    const score = likes + comments * 3;
    if (score > 0) hayEngagement = true;
    for (const w of distinctiveWords(cap)) {
      if (GENERIC.has(w)) continue;
      const e = acc.get(w) || { palabra: w, score: 0, menciones: 0 };
      e.score += score;
      e.menciones += 1;
      acc.set(w, e);
    }
  }
  const list = [...acc.values()];
  if (hayEngagement) list.sort((a, b) => (b.score - a.score) || (b.menciones - a.menciones));
  else list.sort((a, b) => (b.menciones - a.menciones));
  return list;
}
/* reforzarConFeed: si una palabra distintiva de un producto está entre
 * los temas top del feed propio, agrega 'feed' a sus fuentes. No muta. */
function reforzarConFeed(productos, temas, topN) {
  const top = new Set((Array.isArray(temas) ? temas : []).slice(0, topN || 20).map((t) => t.palabra));
  const raicesTop = new Set([...top].map(stem));
  return (Array.isArray(productos) ? productos : []).map((p) => {
    const dw = distinctiveWords(String((p && p.nombre) || p || ''));
    if (!dw.length) return p;
    const calza = dw.some((w) => top.has(w) || raicesTop.has(stem(w)));
    if (!calza) return p;
    const fuentes = [...new Set([...((p && p.fuentes) || []), 'feed'])];
    return { ...p, fuentes };
  });
}
/* ---------- 3) LÍNEA VISIBLE ---------- */
function etiquetaProcedencia(proc, lang) {
  const en = lang === 'en';
  const m = {
    bio: en ? 'your bio' : 'tu bio',
    web: en ? 'your website' : 'tu web',
    cliente: en ? 'what you wrote' : 'lo que escribiste',
    foto: en ? 'your photo' : 'tu foto',
    link: en ? 'your store link' : 'tu link de venta',
    feed: en ? 'your own feed' : 'tu feed',
    adn: en ? 'your business' : 'tu negocio',
    negocio: en ? 'your business' : 'tu negocio',
  };
  return m[proc] || (en ? 'your business' : 'tu negocio');
}
function lineaRubro(producto, procedencia, lang) {
  const en = lang === 'en';
  if (!producto) return en ? 'No product linked' : 'Sin producto asociado';
  return (en ? 'This post is about: ' : 'Este posteo es de: ') + producto + ' — ' + (en ? 'seen in ' : 'visto en ') + etiquetaProcedencia(procedencia, lang);
}

module.exports = {
  stem, textoIdea, productoDeIdea, anotarIdeas, filtrarGenericos,
  clasificarFuentes, productosDesdeDigest, temasFeedPropio, reforzarConFeed,
  etiquetaProcedencia, lineaRubro,
};
