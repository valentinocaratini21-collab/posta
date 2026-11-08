'use strict';
// study-offer.js — M3 ESTUDIO-PROFUNDO: FICHA DE OFERTA CON FECHAS (7/11).
//
// El estudio (web + IG) extrae la oferta REAL del negocio — producto,
// precio, promo CON fecha de fin, cómo se compra/reserva, horarios,
// ubicación — y la guarda como ficha en el fundamento
// (fundamento.offerSheet = digest.offerSheet). Cada dato lleva
// procedencia (fuente + evidencia); si falta un dato, rama honesta:
// nunca se inventa.
//
// PUERTA (mata la clase de fallo del posteo 531, tease de promo sin
// términos): un posteo solo puede presentar una promo como vigente si
// existe una oferta con fecha de fin vigente en el fundamento. Una promo
// sin fecha de fin o vencida NUNCA se presenta como vigente: la pieza
// promo no nace (deriveTopics) y, si igual llegara al spec (defensa en
// profundidad), buildDemoSpec la reescribe (sanitizePromoPost).
//
// Regla de alcance del gate: el gate SOLO actúa cuando el estudio corrió
// (digest.offerSheet presente). Sin ficha, la promo del dueño (ADN) sigue
// como siempre — el estudio nunca veta la palabra del dueño por no haber
// mirado. Con ficha, la fecha manda: ni siquiera la promo del dueño se
// presenta como vigente sin fecha; el escape es la corrección del
// cliente (un toque en /prueba), que pone la fecha con fuente 'dueno'.
//
// CORRECCIONES DEL CLIENTE (para la mejora 6, re-estudio semanal): una
// corrección se guarda en offerSheet.correcciones_cliente como
// { campo, titulo, valor, ends_at, at, origen: 'dueno' } y el dato
// corregido queda marcado { fuente: 'dueno', corregido_por_cliente: true }.
// mergeOfferSheet(fresh, saved) re-aplica esas correcciones DESPUÉS de la
// extracción fresca: el re-estudio nunca pisa lo que el cliente corrigió
// a mano; si la web ya no muestra esa promo, la corrección la sostiene
// (palabra del dueño) y queda registrado en la evidencia.
//
// Determinístico, USD 0, sin IA. No requiere client-digest (evita ciclos);
// client-digest y demo.js lo consumen a él.

const MESES_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8,
  sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};
const MESES_EN = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9,
  sept: 9, oct: 10, nov: 11, dec: 12,
};

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function todayStr(now) {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function isoOf(y, m, d) {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }

// parseOfferDate(text, now) → 'YYYY-MM-DD' o null.
// Acepta: 30/11/2026 · 30-11-2026 · 2026-11-30 · 15 de noviembre de 2026
// · 15 de noviembre · 15 nov 2026 · November 30, 2026 · Nov 30, 2026.
// Sin año: vale solo si la fecha todavía no pasó este año; si ya pasó,
// null (no se inventa el año que viene: una promo «hasta el 4 de
// noviembre» leída el 7/11 no tiene fecha determinable).
function parseOfferDate(text, now) {
  const s = String(text || '');
  const today = todayStr(now);
  const year = Number(today.slice(0, 4));
  let m;
  const reNum = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/;
  if ((m = reNum.exec(s))) {
    const iso = isoOf(+m[3], +m[2], +m[1]);
    if (iso) return iso;
  }
  const reIso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/;
  if ((m = reIso.exec(s))) {
    const iso = isoOf(+m[1], +m[2], +m[3]);
    if (iso) return iso;
  }
  const reName = /\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(20\d{2}))?\b/i;
  if ((m = reName.exec(s))) {
    const mo = MESES_ES[norm(m[2])];
    if (mo) {
      if (m[3]) return isoOf(+m[3], mo, +m[1]);
      const iso = isoOf(year, mo, +m[1]);
      if (iso && iso >= today) return iso;
      return null;
    }
  }
  const reShort = /\b(\d{1,2})\s+([a-z]{3,4})\.?\s+(20\d{2})\b/i;
  if ((m = reShort.exec(s))) {
    const mo = MESES_ES[norm(m[2])] || MESES_EN[norm(m[2])];
    if (mo) return isoOf(+m[3], mo, +m[1]);
  }
  const reShortNoYear = /\b(\d{1,2})\s+([a-z]{3,4})\.?\b/i;
  if ((m = reShortNoYear.exec(s))) {
    const mo = MESES_ES[norm(m[2])] || MESES_EN[norm(m[2])];
    if (mo) {
      const iso = isoOf(year, mo, +m[1]);
      if (iso && iso >= today) return iso;
      return null;
    }
  }
  const reEn = /\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(20\d{2})?\b/i;
  if ((m = reEn.exec(s))) {
    const mo = MESES_EN[norm(m[1])];
    if (mo) {
      if (m[3]) return isoOf(+m[3], mo, +m[2]);
      const iso = isoOf(year, mo, +m[2]);
      if (iso && iso >= today) return iso;
      return null;
    }
  }
  const reNumNoYear = /\b(\d{1,2})[/\-.](\d{1,2})\b/;
  if ((m = reNumNoYear.exec(s))) {
    const iso = isoOf(year, +m[2], +m[1]);
    if (iso && iso >= today) return iso;
    return null;
  }
  return null;
}

const PROMO_RE = /\b(promo|promocion|descuento|oferta|liquidacion|2x1|3x2|% ?off|black friday|cyber ?monday|cyber ?week|hot sale|rebaja|descuentos)\b/i;
const PRICE_RE = /\$\s?\d[\d.,]*|\bUSD\s?\d[\d.,]*|\bARS\s?\d[\d.,]*|\b\d[\d.,]*\s?(pesos|d[oó]lares|USD)\b/i;
const DISCOUNT_RE = /(\d+(?:[.,]\d+)?\s?%(\s?off)?|2x1|3x2|2\s?x\s?1|3\s?x\s?2)/i;
const URGENCY_RE = /tiempo limitado|limited time|cuando se termina|when it'?s gone|por tiempo limitado/i;
const PROMO_WORD_RE = /cyber|black friday|promo|oferta|descuento|% ?off|2x1|3x2|liquidacion|hot sale/i;

function sentencesOf(text) {
  const out = [];
  for (const line of String(text || '').split(/\n+/)) {
    const l = line.trim();
    if (!l) continue;
    // Corte por fin de frase (el punto de «12.500» no corta: lo sigue un dígito).
    for (const seg of l.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9"“(])/)) {
      const s = seg.trim();
      if (s) out.push(s);
    }
  }
  return out;
}
function cleanSnippet(s, max) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max || 140);
}
function statusOf(endsAt, today) {
  if (!endsAt) return 'sin_fecha';
  return endsAt >= today ? 'vigente' : 'vencida';
}

function emptyOfferSheet(now) {
  return {
    v: 1, at: new Date(now instanceof Date ? now : Date.now()).toISOString(),
    productos: [], precios: [], promos: [],
    compra: { vende_online: false, toma_reservas: false, tiene_local: false, evidencia: '' },
    horarios: null, ubicacion: null,
    faltantes: ['precio', 'promo_con_fecha', 'horarios', 'ubicacion'],
    correcciones_cliente: [],
  };
}
function recomputeFaltantes(sheet, now) {
  const today = todayStr(now);
  const f = [];
  const hasPrice = (sheet.productos || []).some((p) => p && p.precio)
    || (sheet.precios || []).length > 0;
  if (!hasPrice) f.push('precio');
  const hasVigente = (sheet.promos || []).some((p) => p && p.ends_at && statusOf(p.ends_at, today) === 'vigente');
  if (!hasVigente) f.push('promo_con_fecha');
  if (!sheet.horarios || !sheet.horarios.texto) f.push('horarios');
  if (!sheet.ubicacion || !sheet.ubicacion.texto) f.push('ubicacion');
  sheet.faltantes = f;
  return sheet;
}

// extractOfferSheet({ webText, igText, webUrl, igHandle, items, facts,
// address, now }) — extracción determinística de la oferta desde los
// textos que el estudio ya leyó (web + IG). `items` = nombres de
// productos/servicios conocidos (web + catálogo) para asociar precios.
// `facts` = extractBusinessFacts de la web (compra/reservas/local).
function extractOfferSheet(input) {
  const inp = input || {};
  const now = inp.now instanceof Date ? inp.now : new Date(inp.now || Date.now());
  const today = todayStr(now);
  const sheet = emptyOfferSheet(now);
  const items = (Array.isArray(inp.items) ? inp.items : []).map((x) => String(x || '').trim()).filter((x) => x.length >= 3);
  const facts = inp.facts || {};

  const sources = [];
  if (inp.webText) sources.push({ text: inp.webText, fuente: 'web' });
  if (inp.igText) sources.push({ text: inp.igText, fuente: 'ig' });

  const seenPromo = new Set();
  const seenPrice = new Set();
  for (const { text, fuente } of sources) {
    const sents = sentencesOf(text);
    for (let i = 0; i < sents.length; i++) {
      const s = sents[i];
      // --- promos: la frase con la palabra promo + fecha en la misma
      // frase o en la siguiente si habla de vigencia («válido hasta…»). ---
      if (PROMO_RE.test(s)) {
        const next = sents[i + 1] || '';
        const dateText = parseOfferDate(s, now) ? s
          : (/hasta|v[aá]lido|vigencia|ends|valid|until/i.test(next) ? s + ' ' + next : s);
        const endsAt = parseOfferDate(dateText, now);
        const titulo = cleanSnippet(s, 140);
        const key = norm(titulo).slice(0, 80);
        if (titulo.length >= 8 && !seenPromo.has(key)) {
          seenPromo.add(key);
          const dsc = (DISCOUNT_RE.exec(s) || [])[0] || '';
          sheet.promos.push({
            titulo,
            descuento: dsc ? String(dsc).trim() : '',
            ends_at: endsAt,
            vigente: statusOf(endsAt, today) === 'vigente',
            status: statusOf(endsAt, today),
            fuente,
            evidencia: cleanSnippet(s, 160),
          });
        }
      }
      // --- precios: monto con moneda; se asocia al ítem nombrado en la
      // misma frase, si no, queda como precio suelto con procedencia. ---
      const pm = PRICE_RE.exec(s);
      if (pm) {
        const precio = cleanSnippet(pm[0].replace(/[.,;:]+$/, ''), 24);
        const key = norm(precio);
        if (!seenPrice.has(key)) {
          seenPrice.add(key);
          let nombre = '';
          for (const it of items) {
            if (it.length >= 4 && norm(s).includes(norm(it))) { nombre = it; break; }
          }
          if (nombre) {
            if (!sheet.productos.some((p) => norm(p.nombre) === norm(nombre) && p.precio === precio)) {
              sheet.productos.push({ nombre, precio, fuente, evidencia: cleanSnippet(s, 160) });
            }
          } else {
            sheet.precios.push({ precio, contexto: cleanSnippet(s, 140), fuente, evidencia: cleanSnippet(s, 160) });
          }
        }
      }
      // --- horarios: frase con rango horario. ---
      if (!sheet.horarios && /\b\d{1,2}(:\d{2})?\s*(a|-|–|—)\s*\d{1,2}(:\d{2})?\s*(hs|h\b)?/i.test(s)
        && /(lun|mar|mi[eé]|jue|vie|s[aá]b|dom|horario|abierto|atendemos|todos los d[ií]as)/i.test(s)) {
        sheet.horarios = { texto: cleanSnippet(s, 120), fuente, evidencia: cleanSnippet(s, 160) };
      }
    }
  }

  // --- compra / reservas / local: de los hechos de la web (fuente
  // principal) + evidencia textual. ---
  const compraEv = [];
  if (facts.address) compraEv.push(String(facts.address).slice(0, 80));
  sheet.compra = {
    vende_online: !!facts.sells_online,
    toma_reservas: !!facts.takes_reservations,
    tiene_local: !!facts.has_local,
    evidencia: compraEv.join(' · '),
  };
  // --- ubicación: dirección declarada (JSON-LD/<address>) o «Estamos en…». ---
  const addr = String(inp.address || facts.address || '').trim().slice(0, 120);
  if (addr) {
    sheet.ubicacion = { texto: addr, fuente: inp.webText ? 'web' : 'ig', evidencia: addr };
  } else {
    for (const { text, fuente } of sources) {
      const m = String(text).match(/estamos en ([^\n.!?]{4,120})/i) || String(text).match(/📍\s*([^\n.!?]{4,120})/);
      if (m) { sheet.ubicacion = { texto: m[1].trim(), fuente, evidencia: cleanSnippet(m[0], 160) }; break; }
    }
  }
  sheet.promos = sheet.promos.slice(0, 5);
  sheet.productos = sheet.productos.slice(0, 12);
  sheet.precios = sheet.precios.slice(0, 8);
  recomputeFaltantes(sheet, now);
  return sheet;
}

// vigenteOffers(sheet, now) / currentOffer(sheet, now): solo promos con
// fecha de fin vigente. Una promo sin fecha o vencida no es oferta vigente.
function vigenteOffers(sheet, now) {
  const today = todayStr(now);
  return ((sheet && Array.isArray(sheet.promos)) ? sheet.promos : [])
    .filter((p) => p && p.ends_at && statusOf(p.ends_at, today) === 'vigente');
}
function currentOffer(sheet, now) {
  const list = vigenteOffers(sheet, now);
  return list.length ? list[0] : null;
}

// promoVigentePara(digest, now) → { titulo, ends_at, fuente } o null.
// La promo que la generación PUEDE presentar como vigente. Sin ficha
// (estudio nunca corrió) manda la promo del dueño como siempre (legacy).
// Con ficha, solo una oferta con fecha vigente — de la ficha o de una
// promo del dueño que ya traiga ends_at (p. ej. puesta por corrección).
function promoVigentePara(digest, now) {
  const today = todayStr(now);
  const d = digest || {};
  const sheet = d.offerSheet || null;
  const dnaPromos = Array.isArray(d.promos) ? d.promos : [];
  if (!sheet) {
    const first = dnaPromos[0];
    if (!first) return null;
    return { titulo: String(first.titulo || first.nombre || first || ''), ends_at: first.ends_at || null, fuente: 'dueno' };
  }
  const cands = [];
  for (const p of vigenteOffers(sheet, now)) {
    cands.push({ titulo: String(p.titulo || ''), ends_at: p.ends_at, fuente: p.fuente === 'dueno' ? 'dueno' : 'estudio', descuento: p.descuento || '' });
  }
  for (const pr of dnaPromos) {
    if (pr && pr.ends_at && String(pr.ends_at) >= today) {
      const titulo = String(pr.titulo || pr.nombre || '');
      if (!cands.some((c) => norm(c.titulo) === norm(titulo))) {
        cands.push({ titulo, ends_at: String(pr.ends_at), fuente: 'dueno', descuento: '' });
      }
    }
  }
  if (!cands.length) return null;
  // La promo del dueño (si coincide con una vigente) manda sobre la del estudio.
  const dnaTitles = dnaPromos.map((pr) => norm(pr.titulo || pr.nombre || pr));
  const owned = cands.find((c) => dnaTitles.includes(norm(c.titulo)));
  return owned || cands[0];
}

// priceMentionAllowed(digest, priceText): el precio mencionado tiene
// fuente en el fundamento (productos/servicios/promos/catálogo/ficha).
// Un número sin fuente no se menciona.
function priceMentionAllowed(digest, priceText) {
  const nums = numbersOf(String(priceText || ''));
  if (!nums.length) return true;
  const allowed = new Set();
  const d = digest || {};
  const grab = (list, fields) => {
    for (const x of (Array.isArray(list) ? list : [])) {
      if (!x) continue;
      if (typeof x === 'object') for (const f of fields) for (const n of numbersOf(String(x[f] || ''))) allowed.add(n);
      else for (const n of numbersOf(String(x))) allowed.add(n);
    }
  };
  grab(d.productos, ['nombre', 'precio']);
  grab(d.servicios, ['nombre', 'precio']);
  grab(d.promos, ['titulo', 'nombre', 'precio']);
  if (d.catalog) grab(d.catalog.items, ['nombre', 'precio']);
  if (d.bio_link) grab(d.bio_link.items, ['nombre', 'precio']);
  const sh = d.offerSheet || {};
  grab(sh.productos, ['nombre', 'precio']);
  grab(sh.precios, ['precio', 'contexto']);
  grab(sh.promos, ['titulo', 'descuento']);
  for (const n of nums) if (!allowed.has(n)) return false;
  return true;
}
function numbersOf(text) {
  const out = new Set();
  const re = /\d+(?:[.,]\d+)*/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    let tok = m[0];
    if (/^\d{1,3}(\.\d{3})+$/.test(tok)) tok = tok.replace(/\./g, '');
    else tok = tok.replace(',', '.');
    if (tok.includes('.')) tok = tok.replace(/\.?0+$/, '');
    if (tok) out.add(tok);
  }
  return [...out];
}

const stripNums = (s) => String(s || '')
  .replace(/\$\s?\d[\d.,]*/g, '')
  .replace(/\b\d+(?:[.,]\d+)?\s?%/g, '')
  .replace(/\b\d+\s?x\s?\d+\b/gi, '')
  .replace(/\s{2,}/g, ' ')
  .replace(/\s+([.,;:!?)])/g, '$1')
  .trim();
function stripUrgency(caption) {
  return String(caption || '').split(/\n/)
    .filter((line) => !URGENCY_RE.test(line))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// sanitizePromoPost(sp, topic, digest, now) → { post, topic }.
// Defensa en profundidad en el camino real de generación (demo.js):
// una pieza promo sin oferta vigente se reescribe como novedad —
// pierde el reclamo de promo, los números y la urgencia — nunca sale
// como promo. Con oferta vigente, pasa intacta.
function sanitizePromoPost(sp, topic, digest, now) {
  if (!sp || sp.kind !== 'promo') return { post: sp, topic };
  if (promoVigentePara(digest, now)) return { post: sp, topic };
  let headline = stripNums(sp.headline || '');
  if (!headline || PROMO_WORD_RE.test(headline)) {
    const anchor = (topic && (topic.digest_anchor || '')) || '';
    headline = (!PROMO_WORD_RE.test(anchor) && anchor.length >= 3) ? anchor : 'Novedad de la semana';
  }
  const post = {
    ...sp,
    kind: 'novedad',
    headline,
    subline: stripNums(sp.subline || ''),
    pill: '',
    cta: /aprovech|oferta|promo/i.test(String(sp.cta || '')) ? 'Quiero saber más' : (sp.cta || ''),
  };
  const t2 = topic ? { ...topic, kind: 'novedad', caption: stripUrgency(topic.caption || '') } : topic;
  return { post, topic: t2 };
}

// applyClientCorrection(sheet, correction, now) → { ok, sheet, error }.
// La corrección del cliente es palabra del dueño: el dato corregido
// queda { fuente: 'dueno', corregido_por_cliente: true } y la
// corrección se registra en correcciones_cliente (origen 'dueno') para
// que el re-estudio la respete. Nunca muta la ficha recibida.
function applyClientCorrection(sheet, correction, now) {
  const nowD = now instanceof Date ? now : new Date(now || Date.now());
  const base = clone(sheet || emptyOfferSheet(nowD));
  if (!Array.isArray(base.correcciones_cliente)) base.correcciones_cliente = [];
  const c = correction || {};
  const campo = String(c.campo || '');
  const titulo = String(c.titulo || c.producto || '').trim();
  const valor = String(c.valor || '').trim();
  const findPromo = () => (base.promos || []).findIndex((p) => p && titulo
    && (norm(p.titulo).includes(norm(titulo)) || norm(titulo).includes(norm(p.titulo))));
  const record = { campo, titulo, valor, ends_at: c.ends_at || null, at: new Date(nowD).toISOString(), origen: 'dueno' };
  const done = () => {
    base.correcciones_cliente.push(record);
    recomputeFaltantes(base, nowD);
    base.at = new Date(nowD).toISOString();
    return { ok: true, sheet: base, error: '' };
  };
  if (campo === 'promo_ends_at') {
    const iso = typeof c.ends_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.ends_at)
      ? (isoOf(+c.ends_at.slice(0, 4), +c.ends_at.slice(5, 7), +c.ends_at.slice(8, 10)) ? c.ends_at : null)
      : parseOfferDate(String(c.ends_at || valor || ''), nowD);
    if (!iso) return { ok: false, sheet: base, error: 'fecha_invalida' };
    const idx = findPromo();
    if (idx < 0) return { ok: false, sheet: base, error: 'promo_no_encontrada' };
    const p = base.promos[idx];
    p.ends_at = iso;
    p.vigente = statusOf(iso, todayStr(nowD)) === 'vigente';
    p.status = statusOf(iso, todayStr(nowD));
    p.fuente = 'dueno';
    p.corregido_por_cliente = true;
    record.ends_at = iso;
    return done();
  }
  if (campo === 'promo_nueva') {
    if (!valor) return { ok: false, sheet: base, error: 'titulo_vacio' };
    let endsAt = null;
    if (c.ends_at) {
      endsAt = /^\d{4}-\d{2}-\d{2}$/.test(String(c.ends_at)) ? String(c.ends_at) : parseOfferDate(String(c.ends_at), nowD);
      if (!endsAt) return { ok: false, sheet: base, error: 'fecha_invalida' };
    }
    const dsc = (DISCOUNT_RE.exec(valor) || [])[0] || '';
    base.promos.push({
      titulo: valor.slice(0, 140), descuento: dsc ? String(dsc).trim() : '',
      ends_at: endsAt, vigente: statusOf(endsAt, todayStr(nowD)) === 'vigente',
      status: statusOf(endsAt, todayStr(nowD)),
      fuente: 'dueno', corregido_por_cliente: true, evidencia: 'Corrección del cliente',
    });
    record.ends_at = endsAt;
    return done();
  }
  if (campo === 'promo_titulo') {
    const idx = findPromo();
    if (idx < 0 || !valor) return { ok: false, sheet: base, error: 'promo_no_encontrada' };
    base.promos[idx].titulo = valor.slice(0, 140);
    base.promos[idx].fuente = 'dueno';
    base.promos[idx].corregido_por_cliente = true;
    return done();
  }
  if (campo === 'precio') {
    if (!titulo || !valor) return { ok: false, sheet: base, error: 'dato_incompleto' };
    const idx = (base.productos || []).findIndex((p) => p && norm(p.nombre) === norm(titulo));
    if (idx >= 0) {
      base.productos[idx].precio = valor.slice(0, 24);
      base.productos[idx].fuente = 'dueno';
      base.productos[idx].corregido_por_cliente = true;
    } else {
      base.productos.push({ nombre: titulo.slice(0, 80), precio: valor.slice(0, 24), fuente: 'dueno', corregido_por_cliente: true, evidencia: 'Corrección del cliente' });
    }
    return done();
  }
  if (campo === 'horarios') {
    if (!valor) return { ok: false, sheet: base, error: 'dato_incompleto' };
    base.horarios = { texto: valor.slice(0, 120), fuente: 'dueno', corregido_por_cliente: true, evidencia: 'Corrección del cliente' };
    return done();
  }
  if (campo === 'ubicacion') {
    if (!valor) return { ok: false, sheet: base, error: 'dato_incompleto' };
    base.ubicacion = { texto: valor.slice(0, 120), fuente: 'dueno', corregido_por_cliente: true, evidencia: 'Corrección del cliente' };
    return done();
  }
  return { ok: false, sheet: base, error: 'campo_invalido' };
}

// mergeOfferSheet(fresh, saved, now) — para el re-estudio semanal
// (mejora 6): la extracción fresca manda en lo leído, pero cada
// corrección del cliente guardada se re-aplica DESPUÉS, así que el
// re-estudio nunca pisa lo corregido a mano. Si la promo corregida ya
// no aparece en lo fresco (la web ya no la muestra), la corrección la
// sostiene como palabra del dueño.
function mergeOfferSheet(fresh, saved, now) {
  const nowD = now instanceof Date ? now : new Date(now || Date.now());
  // Sin extracción fresca no hay nada que fusionar: la guardada manda.
  if (!fresh || typeof fresh !== 'object') return clone(saved || emptyOfferSheet(nowD));
  let out = clone(fresh);
  if (!saved || typeof saved !== 'object') return out;
  if (!Array.isArray(out.correcciones_cliente)) out.correcciones_cliente = [];
  for (const corr of (saved.correcciones_cliente || [])) {
    if (!corr || corr.origen !== 'dueno') continue;
    const r = applyClientCorrection(out, corr, nowD);
    if (r.ok) { out = r.sheet; continue; }
    // La promo corregida ya no está en lo fresco: se sostiene igual.
    if (corr.campo === 'promo_ends_at' && corr.titulo && corr.ends_at) {
      const re = applyClientCorrection(out, { campo: 'promo_nueva', valor: corr.titulo, ends_at: corr.ends_at }, nowD);
      if (re.ok) out = re.sheet;
    }
  }
  // Cinturón extra: datos con marca de corrección que el fresco perdió,
  // y promos guardadas todavía dentro de su fecha declarada (la web ya no
  // las muestra, pero su vigencia declarada sigue corriendo).
  const todayM = todayStr(nowD);
  for (const p of (saved.promos || [])) {
    if (p && (p.corregido_por_cliente || (p.ends_at && p.ends_at >= todayM))
      && !(out.promos || []).some((x) => norm(x.titulo) === norm(p.titulo))) {
      out.promos.push(clone(p));
    }
  }
  for (const p of (saved.productos || [])) {
    if (p && p.corregido_por_cliente && !(out.productos || []).some((x) => norm(x.nombre) === norm(p.nombre))) {
      out.productos.push(clone(p));
    }
  }
  for (const c of (saved.correcciones_cliente || [])) {
    const k = `${c.campo}|${c.titulo}|${c.valor}|${c.ends_at}`;
    if (!out.correcciones_cliente.some((x) => `${x.campo}|${x.titulo}|${x.valor}|${x.ends_at}` === k)) {
      out.correcciones_cliente.push(clone(c));
    }
  }
  recomputeFaltantes(out, nowD);
  return out;
}

module.exports = {
  parseOfferDate,
  extractOfferSheet,
  emptyOfferSheet,
  vigenteOffers,
  currentOffer,
  promoVigentePara,
  priceMentionAllowed,
  sanitizePromoPost,
  applyClientCorrection,
  mergeOfferSheet,
  stripNums,
};
