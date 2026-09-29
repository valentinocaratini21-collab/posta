// fb-page.js — "Posta estudia tu página de Facebook"
// Lee la Página de Facebook vinculada al cliente vía Graph API
// (/{page-id}?fields=about,description,hours,price_range,location,website
//  + /{page-id}/ratings si el token lo permite) y deja los datos
// estructurados para el ADN del negocio.
// Esto SOLO lee y analiza: nunca publica nada.
//
// Exporta: { analyzeFbPage, extractPageId, formatHours }
'use strict';

const API_VERSION = 'v26.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
const FETCH_TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
// extractPageId: acepta un ID numérico, un slug o una URL de Facebook
// (facebook.com/tu-negocio, www./m./es-la.facebook.com/..., con o sin /about).
// Devuelve el ID/slug o '' si no se entiende nada.
// ---------------------------------------------------------------------------
function extractPageId(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  // ID numérico pelado
  if (/^\d{5,}$/.test(s)) return s;
  // ?id=12345 (links del tipo facebook.com/pages/X/12345)
  const qid = /[?&]id=(\d{5,})/.exec(s);
  if (qid) return qid[1];
  let path = s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (!/\.?facebook\.com$/i.test(u.hostname) && !/\.?fb\.com$/i.test(u.hostname)) return s;
    path = u.pathname;
  } catch (e) { /* no era URL: lo tratamos como slug */ }
  const segs = path.split('/').filter(Boolean);
  if (!segs.length) return '';
  // /pages/<nombre>/<id> → nos quedamos con el id
  if (segs[0].toLowerCase() === 'pages' && segs.length >= 3 && /^\d+$/.test(segs[segs.length - 1])) {
    return segs[segs.length - 1];
  }
  let last = segs[segs.length - 1];
  // se pegó una sub-sección (/about, /reviews, /posts...) → el slug es el anterior
  if (/^(about|reviews|posts|photos|videos|shop|services|events|community|home)$/i.test(last) && segs.length >= 2) {
    last = segs[segs.length - 2];
  }
  return /^[A-Za-z0-9.\-_]{3,}$/.test(last) ? last : '';
}

// ---------------------------------------------------------------------------
// formatHours: convierte el objeto "hours" de Graph API
// ({mon_1_open:'09:00', mon_1_close:'18:00', ...}) a un string legible:
// "Lun a Vie: 09:00–18:00 · Sáb: 09:00–13:00". '' si no hay datos.
// ---------------------------------------------------------------------------
const DAYS = [
  ['mon', 'Lun'], ['tue', 'Mar'], ['wed', 'Mié'],
  ['thu', 'Jue'], ['fri', 'Vie'], ['sat', 'Sáb'], ['sun', 'Dom'],
];

function dayRanges(hours, day) {
  const ranges = [];
  for (let i = 1; i <= 3; i++) {
    const o = hours[`${day}_${i}_open`];
    const c = hours[`${day}_${i}_close`];
    if (o && c) ranges.push(`${String(o).slice(0, 5)}–${String(c).slice(0, 5)}`);
  }
  return ranges;
}

function formatHours(hours) {
  if (!hours || typeof hours !== 'object') return '';
  const perDay = DAYS.map(([k, name]) => ({ name, r: dayRanges(hours, k).join(' y ') }));
  if (!perDay.some(d => d.r)) return '';
  // Agrupar días contiguos con el mismo horario
  const groups = [];
  for (const d of perDay) {
    const g = groups[groups.length - 1];
    if (g && g.r === d.r) g.names.push(d.name);
    else groups.push({ r: d.r, names: [d.name] });
  }
  return groups
    .map(g => {
      const label = g.names.length === 1 ? g.names[0] : `${g.names[0]} a ${g.names[g.names.length - 1]}`;
      return g.r ? `${label}: ${g.r}` : `${label}: cerrado`;
    })
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Graph API
// ---------------------------------------------------------------------------
async function graphFetch(path, token) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Graph ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function formatLocation(loc) {
  if (!loc || typeof loc !== 'object') return '';
  return [loc.street, loc.city, loc.country].filter(x => String(x || '').trim()).join(', ');
}

function formatPriceRange(pr) {
  const s = String(pr || '').trim();
  if (!s) return '';
  const tag = { $: 'económico', '$$': 'precio medio', '$$$': 'precio alto', '$$$$': 'lujo' }[s];
  return tag ? `${s} (${tag})` : s;
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------
// analyzeFbPage({ pageId, accessToken }) →
//   { fb_page, name, horarios, ubicacion, precio_rango, descripcion_fb,
//     reviews_fb[], partial }
// Lanza Error con mensaje amable si no se pudo leer nada.
async function analyzeFbPage({ pageId, accessToken }) {
  const id = extractPageId(pageId);
  if (!id) throw new Error('Esa página de Facebook no parece válida, fijate si está bien escrita');
  if (!accessToken) throw new Error('Conectá tu Instagram para que podamos leer tu página de Facebook');

  let page;
  try {
    page = await graphFetch(`/${encodeURIComponent(id)}?fields=id,name,about,description,hours,price_range,location,website,category`, accessToken);
  } catch (e) {
    const m = String(e.message || '');
    if (/does not exist|cannot be loaded|not found|(#100|#803)/i.test(m)) {
      throw new Error('No encontramos esa página de Facebook. Revisá que la URL esté bien y que sea una página pública.');
    }
    if (/permission|authorized|OAuth|(#10|#200)/i.test(m)) {
      throw new Error('No tenemos permiso para leer tu página. Reconectá tu Instagram y probá de nuevo.');
    }
    throw new Error('No pudimos leer tu página de Facebook, probá de nuevo en un rato');
  }

  // Reviews: mejor esfuerzo, muchos tokens no tienen el permiso y varias
  // páginas lo tienen deshabilitado. Si falla, seguimos sin reviews.
  let reviews = [];
  try {
    const r = await graphFetch(`/${encodeURIComponent(page.id || id)}/ratings?fields=review_text,rating&limit=10`, accessToken);
    reviews = (Array.isArray(r.data) ? r.data : [])
      .map(x => String((x && x.review_text) || '').trim())
      .filter(Boolean)
      .slice(0, 5)
      .map(t => (t.length > 200 ? t.slice(0, 200).trimEnd() + '…' : t));
  } catch (e) { /* sin reviews: no bloquea */ }

  const descripcion = String(page.about || page.description || '').trim().slice(0, 800);
  const out = {
    fb_page: page.id ? `https://www.facebook.com/${page.id}` : String(pageId).trim(),
    name: String(page.name || '').trim(),
    horarios: formatHours(page.hours),
    ubicacion: formatLocation(page.location),
    precio_rango: formatPriceRange(page.price_range),
    descripcion_fb: descripcion,
    reviews_fb: reviews,
  };
  const filled = [out.descripcion_fb, out.horarios, out.ubicacion, out.precio_rango].filter(Boolean).length
    + (out.reviews_fb.length ? 1 : 0);
  out.partial = filled < 2; // la página existe pero casi no dice nada útil
  return out;
}

module.exports = { analyzeFbPage, extractPageId, formatHours };
