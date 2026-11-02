'use strict';
// LOTE POSTY APRENDE CLIENTES (decisión de Valentino 1/11 21:57): cada
// cuenta cliente aprende de SU PROPIO Instagram — sus posteos publicados
// y aprobados, la bio de su snapshot y su fundamento — y de nadie más.
// LÍMITE DURO, NO NEGOCIABLE: ningún caption, producto, imagen, tema ni
// dato de un cliente viaja a la generación de otro. El fundamento sigue
// siendo UNO por cliente. La casa NO pasa por acá: conserva su línea
// editorial del equipo (lote posty-aprende, gate por handle), intacta.
//
// Diseño anti-cruce (estructural, no una promesa):
// - La DB viene INYECTADA y cada consulta filtra por `user_id = ?` con
//   el uid de la cuenta que se está generando. El módulo nunca recibe
//   datos de otra cuenta.
// - El formateo es función pura de UN bundle (un solo cliente): dado
//   solo el bundle de A, es imposible que el bloque mencione a B.
// - Sin historia propia (cero publicados y cero aprobados) NO hay
//   bloque: la generación sigue EXACTAMENTE como hoy, sin inventar nada.
// - Solo se leen datos que ya existen en el sistema (posts,
//   post_signals, ig_home_snapshot, fundamento que el llamador ya tiene
//   en la mano). No se sale a leer IG en vivo ni se piden permisos nuevos.
// - Todo va envuelto en try/catch en el llamador: un fallo acá nunca
//   frena la generación.

const MAX_TITLES = 6;
const MAX_TITLE_LEN = 80;
const MAX_BLOCK_LEN = 1400;

function firstLine(s) {
  return String(s || '').split('\n')[0].trim().slice(0, MAX_TITLE_LEN).trim();
}

function cleanTitleStrings(list) {
  const seen = new Set();
  const out = [];
  for (const s of (Array.isArray(list) ? list : [])) {
    const t = firstLine(s);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function cleanTitles(rows) {
  return cleanTitleStrings((Array.isArray(rows) ? rows : []).map((r) => r && r.caption));
}

function productNames(fundamento) {
  const f = fundamento || {};
  const out = [];
  const push = (arr) => {
    for (const x of (Array.isArray(arr) ? arr : [])) {
      const n = String((x && (x.nombre || x.titulo)) || x || '').replace(/\s+/g, ' ').trim();
      if (n.length >= 3 && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
    }
  };
  push(f.products);
  push(f.servicios);
  if (f.star) push([f.star]);
  return out.slice(0, 5);
}

// Bundle propio de UNA cuenta: solo lecturas con `user_id = ?`.
// db es la DB real (server.js) o un doble en tests; nunca se consulta
// sin el filtro de uid.
function propiaBundleFor(db, uid) {
  const bundle = { published: [], approved: [], snapshotBio: '' };
  try {
    const pub = db.prepare(`SELECT caption FROM posts WHERE user_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 8`).all(uid);
    bundle.published = cleanTitles(pub);
  } catch (e) { /* sin historial publicado: no se filtra nada */ }
  try {
    const apr = db.prepare(`SELECT s.caption AS caption FROM post_signals s WHERE s.user_id = ? AND s.client_signal IN ('approved','edited','rating_4','rating_5') ORDER BY s.updated_at DESC LIMIT 8`).all(uid);
    bundle.approved = cleanTitles(apr);
  } catch (e) { /* sin aprobados: no se filtra nada */ }
  try {
    const snap = db.prepare('SELECT payload FROM ig_home_snapshot WHERE user_id = ?').get(uid);
    if (snap && snap.payload) {
      const p = JSON.parse(snap.payload);
      if (p && typeof p.bio === 'string' && p.bio.trim()) bundle.snapshotBio = p.bio.trim().slice(0, 160);
    }
  } catch (e) { /* sin snapshot: no se agrega bio */ }
  return bundle;
}

// Bloque para el prompt. fundamento = { business, category, products,
// servicios, star } del llamador (perfil + dna que ya tiene en la mano).
// null = sin historia propia → el llamador NO agrega nada.
function propiaLineaFor(bundle, fundamento) {
  const b = bundle || {};
  // Defensa en profundidad: el bloque garantiza dedupe + truncado aunque
  // el llamador no pase por propiaBundleFor.
  const pub = cleanTitleStrings(b.published).slice(0, MAX_TITLES);
  const apr = cleanTitleStrings(b.approved).slice(0, MAX_TITLES);
  if (!pub.length && !apr.length) return null;
  const f = fundamento || {};
  const parts = [];
  parts.push('REFERENCIA PROPIA — aprendé de ESTE negocio y de nadie más (manda sobre ideas genéricas; no uses temas, productos ni frases de otros negocios).');
  const biz = String(f.business || '').trim();
  const cat = String(f.category || '').trim();
  const prods = productNames(f);
  let head = '';
  if (biz) head += `Negocio: ${biz}.`;
  if (cat) head += ` Rubro: ${cat}.`;
  if (prods.length) head += ` Productos propios: ${prods.join(', ')}.`;
  if (head.trim()) parts.push(head.trim());
  if (b.snapshotBio) parts.push(`Bio de su Instagram: ${b.snapshotBio}`);
  if (pub.length) parts.push(`Lo que este negocio ya publicó: ${pub.join(' | ')}`);
  if (apr.length) parts.push(`Lo que este negocio ya aprobó: ${apr.join(' | ')}`);
  parts.push('Reglas: ideas nuevas en ESTE estilo y sobre ESTOS productos; variá los ángulos sin repetir los ya publicados; si un tema no es de este negocio, no sale; no inventes productos, precios ni servicios.');
  return parts.join('\n').slice(0, MAX_BLOCK_LEN);
}

// Atajo para server.js: bundle + bloque, o null si no hay nada que agregar.
function propiaLineaForClient(db, uid, fundamento) {
  try { return propiaLineaFor(propiaBundleFor(db, uid), fundamento); } catch (e) { return null; }
}

module.exports = { propiaBundleFor, propiaLineaFor, propiaLineaForClient, MAX_TITLES, MAX_BLOCK_LEN };
