// test-image-pro.js — Harness del batch "mejores posteos":
// intención explícita cableada, restyle, producto consistente (reference lock),
// rescate de fotos, carousels, scroll-stop QA y estética UGC.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const S = require('./image-styles');
const SS = require('./scrollstop');
const C = require('./carousel');

let pass = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

async function main() {
  // ---------- 1. resolveExplicitIntent ----------
  t('rei: tipo promo → promo/tipo', JSON.stringify(S.resolveExplicitIntent({ tipo: 'promo', theme: 'x', angle: '' })) === JSON.stringify({ intent: 'promo', source: 'tipo' }));
  t('rei: keywords refinan sobre tipo (meme→viral)', S.resolveExplicitIntent({ tipo: 'tip', theme: 'meme divertido', angle: '' }).intent === 'viral');
  t('rei: sin señal → null', S.resolveExplicitIntent({ tipo: '', theme: 'zzz', angle: '' }).intent === null);
  t('rei: plato del día → comida por keywords', S.resolveExplicitIntent({ tipo: 'novedad', theme: 'plato del día', angle: '' }).intent === 'comida');
  t('detectIntent: igual que antes (keywords > tipo > default)',
    S.detectIntent({ tipo: 'promo', theme: 'meme', angle: '' }) === 'viral' &&
    S.detectIntent({ tipo: 'tip', theme: 'horarios', angle: '' }) === 'tips' &&
    S.detectIntent({ tipo: '', theme: 'zzz', angle: '' }) === 'producto');

  // ---------- 2. intentSource='explicit' en el flujo real ----------
  const resolved = S.resolveExplicitIntent({ tipo: 'promo', theme: 'descuento', angle: '' });
  const picked = S.pickStyle({ intent: resolved.intent, tipo: 'promo', theme: 'descuento', angle: '', rubro: 'moda' });
  t('pickStyle con intent resuelto → intentSource explicit', picked && picked.intentSource === 'explicit', picked && picked.intentSource);
  t('conceptShotGenerate usa resolveExplicitIntent', /resolveExplicitIntent\(\{/.test(serverSrc));
  t('conceptShotGenerate pasa intent explícito a pickStyle', /pickStyle\(\{\s*intent:\s*explicitIntent\.intent/.test(serverSrc));

  // ---------- 3. Restyle ----------
  t('endpoint photo-restyle existe', serverSrc.includes("app.post('/api/drafts/:id/photo-restyle'"));
  t('restyle usa EDITS con la foto como base (refs:[basePath])', /refs:\s*\[basePath\][\s\S]{0,80}restyle:\s*true/.test(serverSrc));
  t('restyle: refNote exige MISMO producto', /keep the EXACT same product\/subject from the reference photo/.test(serverSrc));
  t('restyle: nunca inventa el producto', /Do NOT invent a different product/.test(serverSrc));

  // ---------- 4. Reference lock ----------
  t('db.js: columna product_ref', dbSrc.includes('ADD COLUMN product_ref'));
  t('conceptShotGenerate acepta productRef', /productRef\s*=\s*null/.test(serverSrc));
  t('reference lock: refNote de producto idéntico', /must appear IDENTICAL in the new image/.test(serverSrc));
  t('pipeline: weekProductRef lookup por intent=producto', serverSrc.includes('weekProductRef'));
  t('pipeline: guarda product_ref en INSERT', serverSrc.includes('finalProductRef'));
  t('regenerateOneDraft usa reference lock', /regenProductRef/.test(serverSrc));
  {
    const tdb = new DatabaseSync(':memory:');
    tdb.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, week_key TEXT, intent TEXT, image_path TEXT, status TEXT)');
    tdb.exec(`INSERT INTO posts (user_id, week_key, intent, image_path, status) VALUES
      (1, 'W1', 'promo', '/media/a.png', 'draft'),
      (1, 'W1', 'producto', '/media/prod1.png', 'draft'),
      (1, 'W1', 'producto', '/media/prod2.png', 'draft'),
      (1, 'W2', 'producto', '/media/other.png', 'draft')`);
    const r = tdb.prepare(`SELECT image_path FROM posts WHERE user_id = ? AND week_key = ?
      AND intent = 'producto' AND image_path LIKE '/media/%' AND status != 'cancelled'
      ORDER BY id ASC LIMIT 1`).get(1, 'W1');
    t('reference lock: primera foto de producto de la semana', r && r.image_path === '/media/prod1.png', r && r.image_path);
    tdb.close();
  }

  // ---------- 5. Rescate de fotos ----------
  t('endpoint photo-enhance existe', serverSrc.includes("app.post('/api/drafts/:id/photo-enhance'"));
  t('enhance: mantiene la MISMA foto', /remain recognizably the SAME photo/.test(serverSrc));
  t('enhance: no agrega ni quita nada', /Do not add, remove or move anything/.test(serverSrc));

  // ---------- 6. Carousels ----------
  t('endpoint carousel-generate existe', serverSrc.includes("app.post('/api/carousel-generate'"));
  t('generateCarouselSet existe', serverSrc.includes('async function generateCarouselSet'));
  t('carousel: media_type carousel en INSERT', /'carousel',\[?\s*\$?[\s\S]{0,60}carousel_paths/.test(serverSrc) || serverSrc.includes("media_type,\n              carousel_paths"));
  t('carousel: caption con Deslizá', /Deslizá/.test(fs.readFileSync(path.join(__dirname, 'carousel.js'), 'utf8')));
  t('carousel: portada con scroll-stop determinístico', /scoreCanvasCover/.test(serverSrc));
  t('carousel: placas con scroll-stop QA de visión', /qaScrollStopB64/.test(serverSrc));
  t('carousel: pipeline integra max 1/semana (carouselClaimed)', serverSrc.includes('carouselClaimed'));
  t('buildCarouselCaption agrega Deslizá 👉', C.buildCarouselCaption('Hola') === 'Hola\n\nDeslizá 👉');
  t('buildCarouselCaption no duplica si ya está', C.buildCarouselCaption('Deslizá para ver') === 'Deslizá para ver');
  {
    const realFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({
        cover: 'El truco que nadie te cuenta',
        slides: [
          { title: 'Punto uno', text: 'Texto uno' },
          { title: 'Punto dos', text: 'Texto dos' },
          { title: 'Punto tres', text: 'Texto tres' },
        ],
      }) } }] }),
    });
    try {
      const sp = await C.splitCarouselSlides({ titulo: 'Test', porque: 'x', caption: 'y' }, 'fake-key');
      t('splitCarouselSlides: cover + 3 slides', sp && sp.cover.length > 0 && sp.slides.length === 3, JSON.stringify(sp));
    } catch (e) { t('splitCarouselSlides: no lanza', false, e.message); }
    global.fetch = realFetch;
  }

  // ---------- 7. Scroll-stop QA ----------
  {
    const hi = SS.scoreCanvasCover({ headline: 'Oferta imperdible hoy', textHex: '#FFFFFF', bgHex: '#0A1E33', fontPx: 104, canvasW: 1080 });
    t('scrollstop: alto contraste → score alto', hi.score >= 80 && hi.pass, 'score=' + hi.score);
    const lo = SS.scoreCanvasCover({ headline: '', textHex: '#888888', bgHex: '#999999', fontPx: 40, canvasW: 1080 });
    t('scrollstop: bajo contraste + sin titular → no pasa', !lo.pass && lo.score < 60 && lo.fixes.length > 0, 'score=' + lo.score);
    t('scrollstop: score siempre 0-100', hi.score >= 0 && hi.score <= 100 && lo.score >= 0 && lo.score <= 100);
    t('scrollstop: contraste WCAG blanco/navy > 4.5', SS.contrastRatio('#FFFFFF', '#0A1E33') > 4.5);
    const proxy = SS.scoreFromQa({ mobile_ok: true, colores_ok: true, texto_ok: true, anatomia_ok: true }, { paleta_ok: true });
    t('scrollstop: proxy desde QA existente en rango', proxy >= 60 && proxy <= 100, 'proxy=' + proxy);
    t('scrollstop: sin QA → null (no bloquea)', SS.scoreFromQa(null) === null);
  }

  // ---------- 8. UGC ----------
  {
    const ugc = S.STYLES.filter(s => String(s.code).startsWith('/ugc'));
    t('UGC: 15 presets', ugc.length === 15, 'hay ' + ugc.length);
    t('UGC: todos brandSafe', ugc.every(s => s.brandSafe === true));
    t('UGC: 0 duplicados', new Set(ugc.map(s => s.code)).size === ugc.length);
    t('UGC: en mapa viral o testimonio', ugc.every(s => S.INTENT_STYLES.viral.includes(s.code) || S.INTENT_STYLES.testimonio.includes(s.code)));
    t('UGC: NO en FANTASY_STYLES', !S.FANTASY_STYLES.some(c => String(c).startsWith('/ugc')));
    t('UGC: prompts descriptivos', ugc.every(s => String(s.prompt).length > 40));
    const up = S.pickStyle({ intent: 'viral', rubro: 'moda', usedThisWeek: [] });
    t('pickStyle viral sigue funcionando', !!up && !!up.style);
  }

  // ---------- 9. Frontend ----------
  t('UI: botón 🎨 Restylear', appSrc.includes('data-revrestyle'));
  t('UI: botón ✨ Mejorar', appSrc.includes('data-revenhance'));
  t('UI: botón 🎠 Carousel', appSrc.includes('data-revcarousel'));
  t('UI: handlers bindeados', appSrc.includes('restyleDraftPhoto') && appSrc.includes('enhanceDraftPhoto') && appSrc.includes('carouselDraft'));
  t('UI: carousel no se ofrece en carousels existentes', appSrc.includes("d.media_type !== 'carousel'"));

  console.log(`\ntest-image-pro: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(1); });
