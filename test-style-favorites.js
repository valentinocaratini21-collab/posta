// test-style-favorites.js — v186 PARTE A: elegir estilos con vista previa.
//
// - GET /api/image-styles sin posteo: trae recommended de la galería y el
//   campo favorites (aditivo: el camino con ?post= no cambia).
// - GET /api/style-sample?style=<code>: compone la muestra con el motor
//   real (demo_render.py + treatmentForStyle) y la CACHEA en MEDIA_DIR:
//   la segunda llamada sirve el mismo archivo (mtime intacto). Un estilo
//   fuera del pool del rubro devuelve 404.
// - PUT/GET /api/style-favorites: hasta 3, validados contra el pool del
//   cliente (bogus fuera, duplicados fuera), persistidos en
//   settings.favorite_styles.
// - pickStyle({ favorites }): un favorito válido ordena PRIMERO; uno
//   prohibido para el rubro NO resucita; sin favorites, determinístico
//   como siempre.
// In-process con DATA_DIR temporal. Sin IA paga (las muestras se componen
// localmente, igual que la prueba).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-styles-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18766';
process.env.BASE_URL = 'http://127.0.0.1:18766';

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

const BASE = 'http://127.0.0.1:18766';
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  const db = require('./db');
  require('./server');
  ok(await waitBoot(), 'server booteó');

  // ---------- pickStyle: favoritos primero (función real, sin server) ----------
  console.log('— pickStyle con favorites:');
  {
    const IS = require('./image-styles');
    // Buscar empíricamente una combinación (intención × rubro) con ≥3
    // candidatos válidos en el pool que pickStyle realmente puntúa
    // (intención ∩ rubro, brandSafe, no prohibidos): el favorito se elige
    // de ahí, así que SÍ o SÍ tiene que poder ganar con favorites.
    let combo = null;
    for (const intent of Object.keys(IS.INTENT_STYLES)) {
      for (const rubro of ['belleza', 'gastronomia', 'moda', 'barberia', 'fitness', 'mascotas', '']) {
        const forb = new Set(IS.forbiddenStyles({ intent, rubro, businessName: '' }).map((f) => f.code));
        const cands = (IS.INTENT_STYLES[intent] || []).map(IS.getStyle).filter(Boolean)
          .filter((s) => s.brandSafe && IS.rubroMatch(s, rubro) && !forb.has(s.code));
        if (cands.length < 3) continue;
        const base = IS.pickStyle({ intent, rubro, businessName: '' });
        if (!base || !base.style) continue;
        const target = cands.find((s) => s.code !== base.style.code && cands.indexOf(s) >= 1) || cands[cands.length - 1];
        if (target && target.code !== base.style.code) { combo = { intent, rubro, base, target }; break; }
      }
      if (combo) break;
    }
    ok(!!combo, 'hay una combinación intención×rubro con candidato no-primero para favorito');
    if (combo) {
      const { intent, rubro, base, target } = combo;
      const withFav = IS.pickStyle({ intent, rubro, businessName: '', favorites: [target.code] });
      ok(withFav && withFav.style && withFav.style.code === target.code, `el favorito (${target.code}, ${intent}/${rubro || 'sin rubro'}) ordena primero`);
      const again = IS.pickStyle({ intent, rubro, businessName: '' });
      ok(again && again.style && again.style.code === base.style.code, 'sin favorites: mismo resultado determinístico de siempre');
    }
    const badFav = IS.forbiddenStyles({ rubro: 'belleza', businessName: '' })[0];
    if (badFav) {
      const r = IS.pickStyle({ intent: 'producto', rubro: 'belleza', businessName: '', favorites: [badFav.code] });
      ok(r && r.style && r.style.code !== badFav.code, `un favorito prohibido (${badFav.code}) no resucita`);
    } else {
      console.log('  · (sin estilos prohibidos para belleza: se salta el chequeo de resurrección)');
    }
  }

  // ---------- Usuario + perfil de belleza con paleta propia ----------
  const rr = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'styles@example.com', password: 'secreto1' }),
  });
  const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  ok(rr.status === 200 || rr.status === 201, `register (${rr.status})`);
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('styles@example.com').id;
  // getProfile crea la fila perezosamente: la tocamos vía un endpoint y sembramos.
  await fetch(`${BASE}/api/image-styles`, { headers: { Cookie: cookie } });
  db.prepare('UPDATE profiles SET category = ?, business_name = ? WHERE user_id = ?').run('belleza', 'Estética Alma Test', uid);
  db.prepare('UPDATE settings SET brand_colors = ? WHERE user_id = ?').run('["#C98BA6","#F6E7EC"]', uid);

  const getStyles = async () => (await fetch(`${BASE}/api/image-styles`, { headers: { Cookie: cookie } })).json();

  // ---------- GET /api/image-styles sin posteo: galería + favorites ----------
  console.log('— Galería (GET /api/image-styles sin post):');
  const data = await getStyles();
  ok(data.ok && Array.isArray(data.styles) && data.styles.length > 10, `pool del rubro (${(data.styles || []).length} estilos)`);
  ok(Array.isArray(data.recommended) && data.recommended.length >= 3, `recommended de galería (${(data.recommended || []).length})`);
  ok(Array.isArray(data.favorites) && data.favorites.length === 0, 'favorites arranca vacío');

  // ---------- Muestra: render real + caché ----------
  console.log('— Muestra de estilo (GET /api/style-sample):');
  const code = data.recommended[0].code;
  const mediaDir = path.join(TMP, 'media');
  const sampleFiles = () => fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).filter((f) => f.startsWith('style-sample-')) : [];
  const s1 = await fetch(`${BASE}/api/style-sample?style=${encodeURIComponent(code)}`, { headers: { Cookie: cookie } });
  const b1 = Buffer.from(await s1.arrayBuffer());
  ok(s1.status === 200, `muestra ${code} → 200`);
  ok((s1.headers.get('content-type') || '').includes('image/jpeg'), 'content-type image/jpeg');
  ok(b1.length > 5000, `JPEG real (${b1.length} bytes)`);
  ok(sampleFiles().length === 1, 'quedó 1 archivo de muestra en MEDIA_DIR');
  const f1 = path.join(mediaDir, sampleFiles()[0]);
  const m1 = fs.statSync(f1).mtimeMs;
  await new Promise((r) => setTimeout(r, 1100));
  const s2 = await fetch(`${BASE}/api/style-sample?style=${encodeURIComponent(code)}`, { headers: { Cookie: cookie } });
  ok(s2.status === 200, 'segunda llamada → 200');
  ok(fs.statSync(f1).mtimeMs === m1 && sampleFiles().length === 1, 'segunda llamada servida de caché (mismo archivo, mtime intacto)');
  // Otro estilo recomendado = otra muestra (tratamiento distinto, otra key).
  const code2 = data.recommended[1].code;
  const s3 = await fetch(`${BASE}/api/style-sample?style=${encodeURIComponent(code2)}`, { headers: { Cookie: cookie } });
  ok(s3.status === 200 && sampleFiles().length === 2, `segunda muestra (${code2}) cacheada aparte`);
  // Estilo fuera del pool → 404.
  const IS = require('./image-styles');
  const inPool = new Set(data.styles.map((s) => s.code));
  const outsider = IS.STYLES.map((s) => s.code).find((c) => !inPool.has(c));
  if (outsider) {
    const s4 = await fetch(`${BASE}/api/style-sample?style=${encodeURIComponent(outsider)}`, { headers: { Cookie: cookie } });
    ok(s4.status === 404, `estilo fuera del pool (${outsider}) → 404`);
  }
  const s5 = await fetch(`${BASE}/api/style-sample?style=${encodeURIComponent('/no-existe')}`, { headers: { Cookie: cookie } });
  ok(s5.status === 404, 'estilo inexistente → 404');

  // ---------- Favoritos: guardar, validar, persistir ----------
  console.log('— Favoritos (PUT/GET /api/style-favorites):');
  const put = async (favorites) => (await fetch(`${BASE}/api/style-favorites`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ favorites }),
  })).json();
  const c1 = data.recommended[0].code, c2 = data.recommended[1].code, c3 = data.recommended[2].code;
  let r = await put([c1, c2]);
  ok(r.ok && JSON.stringify(r.favorites) === JSON.stringify([c1, c2]), `guardar 2 favoritos (${JSON.stringify(r.favorites)})`);
  const gf = await (await fetch(`${BASE}/api/style-favorites`, { headers: { Cookie: cookie } })).json();
  ok(JSON.stringify(gf.favorites) === JSON.stringify([c1, c2]), 'GET devuelve los 2 guardados');
  const d2 = await getStyles();
  ok(JSON.stringify(d2.favorites) === JSON.stringify([c1, c2]), 'GET /api/image-styles también los trae');
  const row = db.prepare('SELECT favorite_styles FROM settings WHERE user_id = ?').get(uid);
  ok(row && JSON.stringify(JSON.parse(row.favorite_styles || '[]')) === JSON.stringify([c1, c2]), 'persistidos en settings.favorite_styles');
  r = await put([c1, c2, c3, c1, '/no-existe', outsider || '/fantasma']);
  ok(r.ok && r.favorites.length === 3 && new Set(r.favorites).size === 3 && r.favorites.every((c) => inPool.has(c)), `cap 3 + solo pool + sin duplicados (${JSON.stringify(r.favorites)})`);
  r = await put([]);
  ok(r.ok && r.favorites.length === 0, 'vaciar favoritos funciona (volver a "Posty elige")');

  console.log(fails ? `\n❌ test-style-favorites: ${fails} fallas` : '\n✅ test-style-favorites: todo OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('❌ test-style-favorites explotó:', e); process.exit(1); });
