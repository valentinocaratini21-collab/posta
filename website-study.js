// website-study.js — "Posta estudia tu web"
// Lee la web del cliente (homepage + hasta 4 páginas clave) y deja que GPT
// gpt-4o-mini la estructure en JSON para el ADN del negocio.
// Si la URL es de MercadoLibre, delega en meli.js (API pública sin key).
// Esto SOLO lee y analiza: nunca publica nada.
//
// Exporta: { analyzeWebsite, extractCleanText }
'use strict';

const FETCH_TIMEOUT_MS = 15000;          // 15s por fetch
const MAX_TOTAL_CHARS = 200 * 1024;      // tope ~200KB de texto acumulado
const MAX_EXTRA_PAGES = 4;               // además de la homepage
const KEY_PAGE_RE = /producto|servicio|precio|nosotros|about|tienda|shop|carta|menu/i;

// MercadoLibre: API pública sin key en vez de scrape (meli.js)
const meli = require('./meli');

// ---------------------------------------------------------------------------
// Texto limpio
// ---------------------------------------------------------------------------
function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return ''; } });
}

// Extrae texto útil de un HTML: title, h1-h3, p, li.
// Saca scripts/styles/nav/footer/header/aside/svg/iframe y colapsa whitespace.
function extractCleanText(html) {
  let s = String(html || '');
  s = s.replace(/<(script|style|noscript|svg|iframe|canvas|template)[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<(nav|header|footer|aside|form)[\s>][\s\S]*?<\/\1\s*>/gi, ' ');
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(s);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : '';
  s = s.replace(/<title[^>]*>[\s\S]*?<\/title\s*>/i, ' '); // el título ya va como prefijo
  s = s.replace(/<\/(h1|h2|h3|p|li|div|tr|section|article)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  const lines = s.split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 1 && !/^[.,;:!?·•\-\s]+$/.test(l));
  if (title.replace(/\s+/g, ' ').trim()) lines.unshift('TÍTULO: ' + title.replace(/\s+/g, ' ').trim());
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Fetch con timeout
// ---------------------------------------------------------------------------
async function fetchHtml(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PostaBot/1.0; +https://postahacetodo.com)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null; // solo HTML
    return await res.text();
  } catch (e) {
    return null; // timeout, DNS, red caída, etc.: la página se saltea sin romper
  } finally {
    clearTimeout(timer);
  }
}

// Descubre hasta N links internos del mismo dominio cuyo href o texto
// matchee /producto|servicio|precio|nosotros|about|tienda|shop|carta|menu/i.
function discoverKeyPages(html, baseUrl, max) {
  const base = new URL(baseUrl);
  const found = [];
  const seen = new Set([base.href]);
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a\s*>/gi;
  let m;
  while ((m = re.exec(html)) && found.length < max) {
    const href = (m[1] || '').trim();
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!href || href.startsWith('#') || /^mailto:|^tel:|^javascript:|^data:/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, base); } catch (e) { continue; }
    if (abs.hostname !== base.hostname) continue; // solo el mismo dominio
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = '';
    const key = abs.href;
    if (seen.has(key)) continue;
    if (!KEY_PAGE_RE.test(href) && !KEY_PAGE_RE.test(text)) continue;
    seen.add(key);
    found.push(key);
  }
  return found;
}

// ---------------------------------------------------------------------------
// GPT: estructura el texto en JSON
// ---------------------------------------------------------------------------
async function structureWithGpt(text, url, apiKey) {
  const system =
    'Sos un asistente que extrae datos de negocios desde el texto de su sitio web. Respondé SOLO con un JSON.\n' +
    'REGLA DURA: PROHIBIDO INVENTAR. Usá SOLO lo que está literalmente escrito en el texto. ' +
    'Si el texto no dice los precios, el campo "precios" queda vacío (string vacío). ' +
    'No completes con datos genéricos, no adivines, no supongas.\n' +
    'Respondé SOLO con este JSON, sin texto extra:\n' +
    '{ "productos": ["..."], "precios": "...", "servicios": ["..."], "promos": ["..."], ' +
    '"diferencial": "...", "resumen": "..." }\n' +
    '- "productos": lista de productos o platos que la web menciona (máx 15). Si no hay, [].\n' +
    '- "precios": lo que la web diga sobre precios (rangos, lista, "desde $X"). Vacío si no hay.\n' +
    '- "servicios": servicios que ofrecen (delivery, asesoramiento, etc). Si no hay, [].\n' +
    '- "promos": promociones o descuentos vigentes que la web mencione. Si no hay, [].\n' +
    '- "diferencial": qué hace diferente al negocio según su web (1-2 frases). Vacío si no está claro.\n' +
    '- "resumen": resumen del negocio en 2-3 frases, en español rioplatense.';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `URL: ${url}\n\nTexto de la web:\n${text.slice(0, 12000)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  let parsed = {};
  try { parsed = JSON.parse(data.choices[0].message.content || '{}'); } catch (e) { parsed = {}; }
  const arr = v => (Array.isArray(v) ? v.map(x => String(x).slice(0, 200)).filter(Boolean).slice(0, 15) : []);
  return {
    productos: arr(parsed.productos),
    precios: String(parsed.precios || '').slice(0, 500),
    servicios: arr(parsed.servicios),
    promos: arr(parsed.promos),
    diferencial: String(parsed.diferencial || '').slice(0, 500),
    resumen: String(parsed.resumen || '').slice(0, 800),
  };
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------
// analyzeWebsite(url, apiKey) → { website_url, productos, precios, servicios,
//   promos, diferencial, resumen, partial }
// Lanza Error con mensaje amable si no se pudo leer nada.
async function analyzeWebsite(url, apiKey) {
  let clean = String(url || '').trim();
  if (!clean) throw new Error('Pasame la URL de tu web');
  if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
  let base;
  try { base = new URL(clean); } catch (e) { throw new Error('Esa URL no parece válida, fijate si está bien escrita'); }
  if (!/^https?:$/.test(base.protocol)) throw new Error('Esa URL no parece válida, fijate si está bien escrita');

  // MercadoLibre: la API pública (meli.js) en vez del scrape
  if (meli.isMeliUrl(base.href)) return meli.analyzeMeli(base.href);

  const homeHtml = await fetchHtml(base.href);
  if (!homeHtml) throw new Error('No pudimos abrir tu web. Revisá que el link esté bien y que la página esté en línea.');

  const texts = [];
  let budget = MAX_TOTAL_CHARS;
  const homeText = extractCleanText(homeHtml);
  texts.push(homeText);
  budget -= homeText.length;

  const keyPages = discoverKeyPages(homeHtml, base.href, MAX_EXTRA_PAGES);
  for (const pageUrl of keyPages) {
    if (budget <= 0) break;
    const html = await fetchHtml(pageUrl); // URLs no-HTML se saltean adentro
    if (!html) continue;
    const t = extractCleanText(html);
    if (t.length < 60) continue; // página casi vacía: no aporta
    texts.push('--- ' + pageUrl + ' ---\n' + t);
    budget -= t.length;
  }

  const combined = texts.join('\n\n').slice(0, MAX_TOTAL_CHARS);
  const sparse = combined.replace(/\s/g, '').length < 500; // texto pobrísimo

  let structured;
  if (!apiKey) {
    // Sin OpenAI: devolvemos lo extraído crudo como resumen, marcado partial.
    structured = { productos: [], precios: '', servicios: [], promos: [], diferencial: '', resumen: combined.slice(0, 800) };
  } else {
    structured = await structureWithGpt(combined, base.href, apiKey);
  }

  const filledFields = [
    structured.productos.length ? 'productos' : null,
    structured.precios ? 'precios' : null,
    structured.servicios.length ? 'servicios' : null,
    structured.promos.length ? 'promos' : null,
    structured.diferencial ? 'diferencial' : null,
    structured.resumen ? 'resumen' : null,
  ].filter(Boolean);

  return {
    website_url: base.href,
    ...structured,
    partial: sparse || filledFields.length < 2, // poco texto o casi nada extraíble
  };
}

module.exports = { analyzeWebsite, extractCleanText };
