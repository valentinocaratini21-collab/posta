#!/usr/bin/env node
// v192 — HERENCIA VISUAL DEL PERFIL en la prueba.
// (a) Con fotos del perfil, la paleta de la semana sale de ESAS fotos.
// (b) "Posta. | Contenido para tu negocio" (y cualquier servicio de
//     contenido/CM) NO categoriza "tecnología": la palabra "app" en una bio
//     de servicios contaminó la semana de @posty.hacetodo con reparación
//     de celulares. Los temas de un CM son de contenido/crecimiento.
// (c) Sin perfil, el flujo queda idéntico al de siempre.
// Uso: node test-demo-heritage.js
const fs = require('fs');
const path = require('path');
const demo = require('./demo');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✓' : '✗ FALLO') + ' ' + msg); if (!cond) fails++; };

(async () => {
  // ---------- (b) Categorización: la regresión de @posty.hacetodo ----------
  ok(demo.categoryFromText('Posta. | Contenido para tu negocio') === 'profesionales',
    '"Posta. | Contenido para tu negocio" → profesionales (no tecnología)');
  ok(demo.categoryFromText('Tu community manager: posteos, reels e historias para tu negocio. Probá la app 3 días gratis') === 'profesionales',
    'bio de CM con la palabra "app" → profesionales (no tecnología)');
  ok(demo.categoryFromText('Venta de celulares, smartphones e iPhone, accesorios') === 'tecnologia',
    'una tienda de celulares sigue siendo tecnología (sin sobrecorrección)');
  ok(demo.categoryFromText('Café de especialidad. Pedidos por la app, brunch y medialunas') === 'cafeteria',
    '"la app" en la bio de un café ya no lo saca de cafetería');
  ok(demo.categoryFromText('') === 'otro', 'sin texto → otro (como siempre)');

  // ---------- (b) Temas heredados: contenido, no servicios genéricos -------
  const specCm = demo.buildDemoSpec({
    business: 'Posta. | Contenido para tu negocio', category: 'profesionales',
    country: 'AR', tone: 'vos', goal: '', count: 5,
  });
  ok(specCm.subcat === 'contenido', 'subrubro del CM = contenido');
  const heads = specCm.specPosts.map((p) => p.headline).join(' | ');
  ok(/carrusel|horario|comunidad|contenido|auditor/i.test(heads),
    'los titulares son de contenido/crecimiento: ' + heads);
  ok(!/celular|bater[ií]a|reparaci|instalacion|visita t[eé]cnica/i.test(heads),
    'ningún titular de tecnología ni de oficios');
  ok(specCm.specPosts.every((p) => p.style && p.style_name), 'cada pieza nombra su estilo real');
  ok(new Set(specCm.specPosts.map((p) => p.style)).size === 5, '5 estilos distintos');
  ok(specCm.specPosts.every((p) => p.poster
      ? (p.photo === null || (typeof p.photo === 'string' && fs.existsSync(p.photo)))
      : (typeof p.photo === 'string' && fs.existsSync(p.photo))),
    'toda foto usada existe (v196: los pósters sin foto de perfil van tipográficos, photo null)');

  // La bio manda aunque el nombre del formulario sea neutro:
  const specBio = demo.buildDemoSpec({
    business: 'Estudio Creativo Sur', category: 'otro', country: 'AR', tone: 'vos',
    goal: '', count: 5,
    bioText: 'Community manager para emprendimientos: manejo de redes y contenido para tu negocio.',
  });
  ok(specBio.subcat === 'contenido', 'la bio del perfil dispara el subrubro contenido');

  // Una maquilladora que crea contenido SIGUE siendo makeup (su palabra manda):
  const specMk = demo.buildDemoSpec({
    business: 'Milagros Makeup', category: 'belleza', country: 'AR', tone: 'vos',
    goal: 'maquillaje para novias y contenido para tu marca', count: 5,
  });
  ok(specMk.subcat === 'makeup', 'maquillaje + contenido → makeup (no contenido)');

  // ---------- (a) Paleta heredada de las fotos del feed --------------------
  // El avatar oficial de Posty ES su línea visual (navy/amarillo/celeste).
  const avatar = fs.readFileSync(path.join(__dirname, 'public', 'ai-avatar.png'));
  const pal = await demo.extractPaletteFromBuffers([avatar, avatar, avatar]);
  ok(!!pal && /^#[0-9A-F]{6}$/.test(pal.accent), 'paleta extraída de las fotos: ' + JSON.stringify(pal));
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const isBrandish = (h) => { const [r, g, b] = rgb(h); return b > r || (r > 180 && g > 140 && b < 120); }; // azul/navy o amarillo
  ok(isBrandish(pal.accent) || (pal.btn && isBrandish(pal.btn)),
    'la paleta cae en la familia de su marca (azules/amarillo): ' + JSON.stringify(pal));
  if (pal.btn) {
    const d = Math.hypot(...rgb(pal.accent).map((v, i) => v - rgb(pal.btn)[i]));
    ok(d > 90, 'acento y botón se distinguen (distancia ' + Math.round(d) + ')');
  }
  const palNone = await demo.extractPaletteFromBuffers([]);
  ok(palNone === null, 'sin fotos → null (el llamador conserva la paleta anterior)');

  // ---------- (c) Sin perfil: el flujo de siempre --------------------------
  const specCafe = demo.buildDemoSpec({
    business: 'Café Aurora', category: 'cafeteria', country: 'AR', tone: 'vos', goal: '', count: 5,
  });
  ok(specCafe.subcat === null, 'un café sin bio de CM no gana subrubro nuevo');
  ok(specCafe.specPosts.length === 5 && specCafe.specPosts.every((p) => p.style_name),
    'la semana clásica sigue saliendo igual (5 piezas con estilo)');

  console.log(fails ? `\n❌ ${fails} FALLOS` : '\n✅ TODO OK — herencia visual');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
