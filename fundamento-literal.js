'use strict';
/* =====================================================================
 * fundamento-literal.js — LOTE FUNDAMENTO-LITERAL ×5 (aprobado Valentino
 * 3/11, «dale, arma todo»).
 * Motivo: un cliente que vende campos recibió posteos de flores porque
 * Posty no captó su producto real. Doctrina: si no es literal lo que
 * venden, el producto es malísimo. Nunca adivinar, nunca mapear a una
 * categoría vecina, nunca generar sobre un producto sin procedencia.
 *
 * Las 5 piezas:
 *  1) ESPEJO antes de la semana: lista literal con procedencia, aprobar
 *     o corregir; sin aprobación no hay semana (el gate vive en el
 *     flujo de /prueba y en las rutas de fundamento).
 *  2) FOTO como prueba: la visión nombra el producto concreto o lo deja
 *     pendiente; nunca inventa un producto desde una foto.
 *  3) LINK donde ya vende: se leen datos PÚBLICOS (servicios de la web
 *     o JSON-LD de producto); si no se puede leer, se dice, no se
 *     inventa. Sin OAuth, sin logins, sin credenciales.
 *  4) CONFIRMACIÓN SEMANAL: «sigue igual» no cambia nada; editar cambia
 *     solo lo editado; no tocarla no inventa nada.
 *  5) VETOS PERMANENTES: «esto NO vendo» guardado en el fundamento y
 *     respetado como puerta dura en todos los caminos de generación
 *     (ideasInputFor → excluded + post-filtro en generateIdeas, que
 *     cubre plantillas, IA y efemérides).
 *
 * Todo puro y determinista, USD 0, salvo la visión de fotos (misma
 * llamada gpt-4o-mini que ya usa tagAlbumPhoto). Se apoya en la puerta
 * fail-closed del lote rubro-literal y NO la reescribe.
 * ===================================================================== */
const STOP = new Set(('de del la el los las un una unos unas en a y o con sin por para que tu su al mas muy nuestro nuestra nuestros nuestras este esta esto como cuando donde desde hasta sobre entre vos the and for with from this that of to in on at by').split(' '));
const GENERIC = new Set(('producto productos servicio servicios local negocio tienda tiendaonline envios envio oferta ofertas promo promocion descuento descuentos nuevo nueva nuevos nuevas semana hoy dia dias cliente clientes calidad precio precios venta ventas catalogo ver mas inicio home contacto nosotros').split(' '));

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function cleanNombre(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}
// Palabras con peso para el match de vetos: >= 4 letras, fuera de stop.
function distinctiveWords(text) {
  const out = [];
  const seen = new Set();
  for (const w of norm(text).split(' ')) {
    if (w.length < 4 || STOP.has(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
  }
  return out;
}
function procedenciaLabel(proc, lang) {
  const en = lang === 'en';
  const m = {
    bio: en ? 'from your bio' : 'de tu bio',
    web: en ? 'from your website' : 'de tu web',
    cliente: en ? 'written by you' : 'escrito por vos',
    foto: en ? 'from your photo' : 'de tu foto',
    link: en ? 'from your store link' : 'de tu link de venta',
  };
  return m[proc] || (en ? 'from your business' : 'de tu negocio');
}
// ---------- 1) ESPEJO ----------
/* construirEspejo: junta las fuentes en una lista literal, sin duplicar
 * (por nombre normalizado) y sin inventar nada. Orden: estrella elegida
 * por el dueño primero, después bio, web, link y fotos. Cap 8. */
function construirEspejo(fuentes) {
  const f = fuentes || {};
  const out = [];
  const seen = new Set();
  const push = (item, proc) => {
    if (!item) return;
    const nombre = cleanNombre(typeof item === 'string' ? item : (item.nombre || ''));
    if (nombre.length < 3) return;
    const k = norm(nombre);
    if (!k || seen.has(k)) return;
    seen.add(k);
    const precio = (item && typeof item === 'object' && item.precio) ? String(item.precio).slice(0, 20) : '';
    out.push({ nombre, precio, procedencia: proc });
  };
  if (f.estrella) push(f.estrella, 'cliente');
  for (const p of (f.bio || [])) push(p, 'bio');
  for (const p of (f.web || [])) push(p, 'web');
  for (const p of (f.link || [])) push(p, 'link');
  for (const p of (f.fotos || [])) push(p, 'foto');
  // Texto libre del cliente (pregunta 1 de rubro-literal o corrección del
  // espejo): entra literal con procedencia 'cliente'. Una frase larga
  // no es un nombre de producto y se descarta, nunca se recorta a un
  // producto inventado.
  for (const c of (f.cliente || [])) {
    if (typeof c !== 'string') continue;
    const plain = c.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (plain.length < 3 || plain.length > 60) continue;
    if (plain.split(' ').length > 8) continue;
    push(c, 'cliente');
  }
  return out.slice(0, 8);
}
/* parsearCorreccion: el cliente reescribe la lista (una línea por
 * producto). Cada línea válida queda con procedencia 'cliente'. Las
 * líneas inválidas se descartan en silencio, nunca se inventa un
 * reemplazo. Lista vacía → [] (el llamador decide: espejo vacío = sin
 * aprobación, no semana). */
function parsearCorreccion(texto) {
  const out = [];
  const seen = new Set();
  for (const raw of String(texto || '').split('\n')) {
    // Validar ANTES de recortar: una frase larga no se convierte en un
    // producto truncado; se descarta y el cliente la reescribe corta.
    const plain = String(raw || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (plain.length < 3 || plain.length > 60) continue;
    if (plain.split(' ').length > 8) continue;
    const nombre = cleanNombre(raw);
    if (nombre.length < 3) continue;
    const k = norm(nombre);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ nombre, precio: '', procedencia: 'cliente' });
  }
  return out.slice(0, 8);
}
// ---------- 1b) ESPEJO: parseo del formulario de /prueba ----------
// Devuelve null en flujos viejos (sin espejo_flujo=1) y cuando el espejo
// no está aprobado: sin aprobación no hay semana, y el llamador no
// inyecta nada. Solo el espejo aprobado siembra productos y vetos.
function espejoFromFields(fields) {
  try {
    if (!fields || String(fields.espejo_flujo || '') !== '1') return null;
    if (String(fields.espejo_aprobado || '') !== '1') return null;
    const list = JSON.parse(String(fields.espejo_productos || '[]'));
    const prods = (Array.isArray(list) ? list : []).map((p) => ({ nombre: String((p && p.nombre) || p || '').trim(), procedencia: String((p && p.procedencia) || 'cliente') })).filter((p) => p.nombre);
    const vetos = normalizarVetos(JSON.parse(String(fields.espejo_vetos || '[]')));
    return { aprobado: true, productos: prods.slice(0, 8), vetos };
  } catch (e) { return null; }
}
function espejoGoalLines(fields, lang) {
  const esp = espejoFromFields(fields);
  if (!esp) return [];
  const lines = [];
  if (esp.productos.length) lines.push((lang === 'en' ? 'Products confirmed by the owner in the mirror (use EXACTLY these, never others): ' : 'Productos confirmados por el dueño en el espejo (usar EXACTAMENTE estos, nunca otros): ') + esp.productos.map((p) => p.nombre).join(', '));
  const lv = lineaVetos(esp.vetos, lang);
  if (lv) lines.push(lv);
  return lines;
}
// ---------- 5) VETOS ----------
function normalizarVetos(vetos) {
  const out = [];
  const seen = new Set();
  for (const v of (Array.isArray(vetos) ? vetos : [])) {
    const t = cleanNombre(v);
    if (t.length < 3) continue;
    const k = norm(t);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(k); // los vetos son claves de match: minúsculas, sin acentos
  }
  return out.slice(0, 30);
}
function agregarVeto(vetos, termino) {
  return normalizarVetos([...(vetos || []), termino]);
}
function quitarVeto(vetos, termino) {
  const k = norm(termino);
  return normalizarVetos((vetos || []).filter((v) => norm(v) !== k));
}
/* ideaVetada: match por frase exacta o por palabra distintiva del veto
 * dentro de título/ángulo/tipo/caption, con raíz (flor = flores, campo
 * = campos): un veto no se escapa por singular/plural. «flores» veta
 * «promo de flores», «ramo de flores» y «flores de estación». No veta
 * por palabras genéricas. */
function ideaVetada(idea, vetos) {
  if (!idea || !vetos || !vetos.length) return false;
  const texto = norm(`${idea.titulo || ''} ${idea.angulo || ''} ${idea.tipo || ''} ${idea.formato || ''} ${idea.caption || ''}`);
  if (!texto) return false;
  const palabras = new Set(texto.split(' ').filter(Boolean));
  const stem = (w) => { let s = w; if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2); else if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1); return s; };
  const raices = new Set([...palabras].map(stem));
  for (const v of vetos) {
    const nv = norm(v);
    if (!nv) continue;
    if (texto.includes(nv)) return true;
    const dw = distinctiveWords(v).filter((w) => !GENERIC.has(w));
    if (dw.length && dw.some((w) => palabras.has(w) || raices.has(stem(w)))) return true;
  }
  return false;
}
function filtrarIdeasVetadas(ideas, vetos) {
  if (!Array.isArray(ideas)) return [];
  if (!vetos || !vetos.length) return ideas;
  return ideas.filter((id) => !ideaVetada(id, vetos));
}
function lineaVetos(vetos, lang) {
  const vs = normalizarVetos(vetos);
  if (!vs.length) return '';
  return lang === 'en'
    ? `NEVER (banned by the owner, do not propose even with a twist): ${vs.join(' | ')}`
    : `NUNCA (vetado por el dueño, no proponer ni con otra vuelta): ${vs.join(' | ')}`;
}
// ---------- 3) LINK ----------
function stripTags(s) {
  return String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function precioDeJsonLd(o) {
  try {
    const p = o && (o.offers || o.aggregateOffer);
    const pr = p && (p.price || (Array.isArray(p) && p[0] && p[0].price));
    return pr != null ? String(pr).slice(0, 20) : '';
  } catch (e) { return ''; }
}
/* extraerProductosDeLink: lee datos PÚBLICOS de un HTML ya bajado.
 * Fuentes, en orden: JSON-LD Product / ItemList (nombre + precio),
 * og:title como fallback solo si parece producto (nunca el nombre del
 * negocio solo). Sin productos → { productos: [], razon: 'sin_datos' }:
 * el llamador avisa y pide otro dato, jamás inventa. */
function extraerProductosDeLink(html, url) {
  const out = [];
  const seen = new Set();
  const push = (nombre, precio) => {
    const n = cleanNombre(nombre);
    if (n.length < 3 || n.length > 60) return;
    const nw = distinctiveWords(n);
    if (!nw.length || nw.every((w) => GENERIC.has(w))) return;
    const k = norm(n);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ nombre: n, precio: precio || '', procedencia: 'link' });
  };
  const src = String(html || '');
  try {
    const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = ldRe.exec(src)) && out.length < 8) {
      let j;
      try { j = JSON.parse(m[1]); } catch (e) { continue; }
      const arr = Array.isArray(j) ? j : [j];
      for (const o of arr) {
        if (!o || typeof o !== 'object') continue;
        const types = (Array.isArray(o['@type']) ? o['@type'] : [o['@type']]).map((t) => String(t || '').toLowerCase());
        if (types.includes('product') && o.name) push(o.name, precioDeJsonLd(o));
        if (types.includes('itemlist') && Array.isArray(o.itemListElement)) {
          for (const el of o.itemListElement) {
            const it = el && (el.item || el);
            if (it && it.name) push(it.name, precioDeJsonLd(it));
          }
        }
      }
    }
  } catch (e) { /* JSON-LD roto: se sigue con el resto */ }
  if (!out.length) return { productos: [], razon: 'sin_datos', url: String(url || '') };
  return { productos: out.slice(0, 8), razon: '', url: String(url || '') };
}
// ---------- 2) FOTO ----------
/* productoDesdeVision: la visión ya respondió. Si nombró un producto
 * concreto (3-60 caracteres, con palabra distintiva, no genérico) →
 * producto literal con procedencia 'foto'. Si no puede afirmar →
 * { pendiente: true }: la foto queda pendiente de confirmación del
 * cliente, nunca se inventa un producto desde ella. */
function productoDesdeVision(vision) {
  const v = (vision && typeof vision === 'object') ? vision : {};
  const nombre = cleanNombre(v.producto || v.nombre || '');
  if (nombre.length >= 3 && nombre.length <= 60) {
    const dw = distinctiveWords(nombre).filter((w) => !GENERIC.has(w));
    if (dw.length) return { producto: { nombre, precio: '', procedencia: 'foto' }, pendiente: false };
  }
  return { producto: null, pendiente: true };
}
// ---------- 4) CONFIRMACIÓN SEMANAL ----------
/* aplicarEdicionSemanal: la confirmación semanal es una EDICIÓN, no un
 * reemplazo (la UI manda un solo producto: nuevo o corregido). Cada
 * línea: si nombra un producto vigente (mismo nombre o la línea lo
 * contiene, ej. «chacras en venta» sobre «chacras») lo reemplaza con
 * procedencia 'cliente'; si no coincide con ninguno, se suma. Edición
 * vacía → lista vigente intacta (no se borra el fundamento por un
 * campo vacío). Vetos y confirmación no se tocan acá. */
function aplicarEdicionSemanal(actual, lineas) {
  const cur = Array.isArray(actual) ? actual.slice() : [];
  const parsed = parsearCorreccion(Array.isArray(lineas) ? lineas.join('\n') : String(lineas || ''));
  if (!parsed.length) return cur;
  const out = cur.slice();
  for (const p of parsed) {
    const pn = norm(p.nombre);
    let idx = out.findIndex((q) => norm(q.nombre) === pn);
    if (idx < 0) idx = out.findIndex((q) => { const qn = norm(q.nombre); return qn.length >= 3 && pn.includes(qn); });
    if (idx >= 0) out[idx] = { nombre: p.nombre, precio: out[idx].precio || '', procedencia: 'cliente' };
    else out.push(p);
  }
  return out.slice(0, 8);
}

module.exports = {
  norm, distinctiveWords, cleanNombre, procedenciaLabel,
  construirEspejo, parsearCorreccion, espejoFromFields, espejoGoalLines,
  normalizarVetos, agregarVeto, quitarVeto, ideaVetada, filtrarIdeasVetadas, lineaVetos,
  extraerProductosDeLink, productoDesdeVision, aplicarEdicionSemanal,
};
