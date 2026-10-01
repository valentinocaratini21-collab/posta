// scrollstop.js — Scroll-stop QA: ¿la imagen FRENA el scroll en 0.5 segundos?
//
// Sin dependencias (puro Node): para diseños que renderizamos nosotros
// (brand-card.py / canvas) el chequeo es determinístico — contraste WCAG real
// + legibilidad del titular en miniatura (150px, tamaño típico del feed).
// Para fotos IA, un chequeo de visión barato con gpt-4o-mini.
//
// Score 0-100. < 60 → se reintenta con ajustes (máx 2) y si no levanta se
// marca needs_review (visible, nunca silencioso, nunca bloquea el pipeline).
'use strict';

const SCROLLSTOP_MIN = 60;
const SCROLLSTOP_RETRIES = 2;

function hexToRgb(hex) {
  const h = String(hex || '#000000').trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : (h + '000000').slice(0, 6);
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function luminance([r, g, b]) {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// Ratio de contraste WCAG entre texto y fondo (1 a 21).
function contrastRatio(hexText, hexBg) {
  const l1 = luminance(hexToRgb(hexText));
  const l2 = luminance(hexToRgb(hexBg));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Chequeo determinístico de una portada/diseño que renderizamos nosotros.
// layout: { headline, textHex, bgHex, fontPx, canvasW }
function scoreCanvasCover({ headline = '', textHex = '#FFFFFF', bgHex = '#0A1E33', fontPx = 96, canvasW = 1080 } = {}) {
  const checks = [];
  const fixes = [];
  let score = 0;
  // 1) Contraste texto/fondo (40 pts). WCAG AA para texto grande = 3:1;
  // para frenar el scroll pedimos 4.5:1.
  const cr = contrastRatio(textHex, bgHex);
  const crScore = cr >= 7 ? 40 : cr >= 4.5 ? 32 : cr >= 3 ? 18 : 6;
  score += crScore;
  checks.push({ id: 'contraste', ok: cr >= 4.5, detail: `contraste ${cr.toFixed(1)}:1` });
  if (cr < 4.5) fixes.push('subir el contraste entre el texto y el fondo (texto más claro o fondo más oscuro)');
  // 2) Titular legible en miniatura (35 pts). El feed muestra ~150px de ancho:
  // el tamaño efectivo tiene que dar ≥ 10px.
  const words = String(headline).trim().split(/\s+/).filter(Boolean).length;
  const thumbPx = fontPx * (150 / (canvasW || 1080));
  const legible = thumbPx >= 10 && words > 0 && words <= 10;
  score += legible ? 35 : (thumbPx >= 7 ? 15 : 5);
  checks.push({ id: 'miniatura', ok: legible, detail: `titular ≈${thumbPx.toFixed(0)}px en miniatura, ${words} palabras` });
  if (!legible) fixes.push(words > 10 ? 'acortar el titular (máx 10 palabras)' : 'agrandar el titular');
  // 3) Hay un mensaje (25 pts): sin titular no hay hook.
  const hasHook = String(headline).trim().length >= 3;
  score += hasHook ? 25 : 0;
  checks.push({ id: 'hook', ok: hasHook, detail: hasHook ? 'hay titular' : 'sin titular' });
  if (!hasHook) fixes.push('agregar un titular gancho a la portada');
  return { score: Math.min(100, Math.round(score)), checks, fixes, pass: score >= SCROLLSTOP_MIN };
}

// Chequeo de visión para fotos IA: ¿frena el scroll? Barato (gpt-4o-mini).
// Devuelve { score, checks, fixes, pass } o null si la API falla (no bloquea).
async function qaScrollStopB64(b64, apiKey) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 250,
        messages: [
          { role: 'system', content:
`Sos director de arte de una agencia. Mirás una imagen para Instagram y decidís si FRENA EL SCROLL en 0.5 segundos vista en un celular chico. Respondé SOLO con JSON, sin explicaciones:
{"single_subject":true,"not_cluttered":true,"readable_small":true,"thumb_hook":true,"detalle":"..."}
- single_subject: hay UN sujeto/protagonista claro (producto, cara, plato), no tres cosas compitiendo.
- not_cluttered: la composición es limpia, no saturada de elementos.
- readable_small: si hay texto, se lee aunque la imagen se vea chiquita; si no hay texto → true.
- thumb_hook: la imagen genera curiosidad o impacto inmediato (contraste, emoción, rareza).` },
          { role: 'user', content: [
            { type: 'text', text: '¿Esta imagen frena el scroll?' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ] },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const raw = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    let p = null;
    try { p = JSON.parse(raw); } catch (e) {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) { try { p = JSON.parse(m[0]); } catch (e2) {} }
    }
    if (!p || typeof p !== 'object') return null;
    const checks = [
      { id: 'sujeto', ok: p.single_subject !== false, detail: 'sujeto claro' },
      { id: 'limpieza', ok: p.not_cluttered !== false, detail: 'composición limpia' },
      { id: 'legible', ok: p.readable_small !== false, detail: 'legible en chico' },
      { id: 'gancho', ok: p.thumb_hook !== false, detail: 'gancho visual' },
    ];
    const fixes = [];
    if (p.single_subject === false) fixes.push('un solo protagonista claro en el centro, nada compitiendo');
    if (p.not_cluttered === false) fixes.push('composición más limpia, menos elementos');
    if (p.readable_small === false) fixes.push('texto más grande y con más contraste');
    if (p.thumb_hook === false) fixes.push('más impacto inmediato: contraste, emoción o rareza');
    const score = checks.reduce((a, c) => a + (c.ok ? 25 : 0), 0);
    return { score, checks, fixes, pass: score >= SCROLLSTOP_MIN, detalle: String(p.detalle || '').slice(0, 120) };
  } catch (e) {
    return null; // ante cualquier duda, no bloquea
  }
}

// Proxy barato desde el QA que YA corre en concept-shot (sin llamada extra):
// mobile_ok + colores_ok + brand_ok son las señales que más correlacionan
// con frenar el scroll.
function scoreFromQa(qa, brandCheck) {
  if (!qa) return null;
  let score = 30;
  if (qa.mobile_ok) score += 25;
  if (qa.colores_ok) score += 15;
  if (brandCheck && brandCheck.paleta_ok) score += 10;
  if (qa.texto_ok) score += 10;
  if (qa.anatomia_ok) score += 10;
  return Math.min(100, score);
}

module.exports = { SCROLLSTOP_MIN, SCROLLSTOP_RETRIES, contrastRatio, scoreCanvasCover, qaScrollStopB64, scoreFromQa };
