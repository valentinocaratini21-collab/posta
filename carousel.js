// carousel.js — Carousels automáticos de Posty.
//
// Un carousel = portada que frena el scroll (diseño canvas con titular grande)
// + 3 placas (fotos IA, una idea cada una). Rinden más que la foto sola y
// nadie los hace a mano porque dan trabajo — por eso los arma Posty.
//
// Este módulo tiene la lógica pura (split de la idea en placas, caption).
// La generación vive en server.js (generateCarouselSet) porque necesita
// conceptShotGenerate, DB y MEDIA_DIR.
'use strict';

const CAROUSEL_SLIDES = 3; // portada + 3 placas
const CAROUSEL_MAX = 5;    // tope de placas (portada + 4)

// Parte una idea en portada + placas con gpt-4o-mini (barato, JSON).
// Devuelve { cover, slides: [{ title, text }] } o null si falla.
async function splitCarouselSlides({ titulo = '', porque = '', angulo = '', caption = '' }, apiKey) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 500,
        messages: [
          { role: 'system', content:
`Armás carousels de Instagram que la gente DESLIZA hasta el final. Respondé SOLO con JSON, sin explicaciones:
{"cover":"...","slides":[{"title":"...","text":"..."},{"title":"...","text":"..."},{"title":"...","text":"..."}]}
- cover: el GANCHO de la portada — 8 palabras máximo, curiosidad o promesa fuerte. Sin emojis.
- slides: exactamente 3 placas. Cada una: title (5 palabras máx, el punto) y text (1-2 líneas que desarrollan el punto, tono de amigo, sin emojis).
- Nada de relleno: si la idea no da para 3 placas distintas, igual entregá 3 pero que cada una aporte algo real.
- Español rioplatense.` },
          { role: 'user', content: `Idea: ${String(titulo).slice(0, 200)}\nPorqué: ${String(porque || angulo).slice(0, 300)}\nCaption: ${String(caption).slice(0, 400)}` },
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
    if (!p || !p.cover || !Array.isArray(p.slides) || p.slides.length < 2) return null;
    const slides = p.slides.slice(0, CAROUSEL_SLIDES).map(s => ({
      title: String(s.title || '').slice(0, 60),
      text: String(s.text || '').slice(0, 280),
    })).filter(s => s.title);
    if (slides.length < 2) return null;
    return { cover: String(p.cover).slice(0, 80), slides };
  } catch (e) {
    return null;
  }
}

// El caption del carousel termina invitando a deslizar.
function buildCarouselCaption(baseCaption) {
  const base = String(baseCaption || '').trim();
  if (/desliz[aá]/i.test(base)) return base;
  return `${base}\n\nDeslizá 👉`.trim();
}

module.exports = { CAROUSEL_SLIDES, CAROUSEL_MAX, splitCarouselSlides, buildCarouselCaption };
