'use strict';
/* test-digest-foundation.js — FUNDAMENTO (v229, 2026-10-18)
 * La vara de Valentino: "si los posteos que armamos no son exactos del
 * producto del cliente, Posty no sirve de nada". Re-corre las evidencias
 * de la auditoría de fundamento con el código nuevo:
 *  E2) "Sushi Go" (bio nikkei/omakase) → los 5 temas anclados a SU
 *      mundo; CERO pizzas/milanesa/risotto (antes: la lista fija de
 *      gastronomía, cero pertenencia).
 *  E1) Bio rica vs bio vacía → los temas CAMBIAN con la bio.
 *  E3) templateIdeas con ADN rico → títulos con productos reales; sin
 *      ADN ni descripción → [] (el fallback no fabrica la semana).
 *  Conversión) una cuenta registrada desde una prueba nace con el
 *      digest sembrado (DB real, server real, sin IA paga).
 *  + chequeo de pertenencia y cableado (fuentes).
 * Corre con: node test-digest-foundation.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-digest-'));
process.env.DATA_DIR = TMP;

const clientDigest = require('./client-digest');
const demo = require('./demo');
const generator = require('./generator');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

const SUSHI_BIO = 'Sushi y cocina nikkei en Palermo. Omakase los viernes. Reservas por DM.';
const SUSHI_CAPTIONS = [
  'Omakase de viernes 🍣 el favorito de la casa',
  'Rolls de salmón fresco, como siempre',
  'Nigiris del día, recién hechos',
];
function sushiDigest() {
  return clientDigest.buildFromParts({
    business: 'Sushi Go', category: 'gastronomia',
    feed: { bio: SUSHI_BIO, captions: SUSHI_CAPTIONS, name: 'Sushi Go', handle: 'sushigo' },
    feedPalette: { principal: '#1D3557', accent: '#E63946', dark: '#0B1D2A', light: '#F1FAEE' },
    registro: 'dark',
  });
}
const topicText = (t) => `${t.headline || ''} ${t.caption || ''}`.toLowerCase();

console.log('== E2) Sushi Go nikkei: temas de SU mundo, cero plantilla ajena ==');
{
  const digest = sushiDigest();
  ok((digest.servicios || []).length >= 2, `digest minó servicios de la bio (${(digest.servicios || []).map((s) => s.nombre).join(' · ')})`);
  ok(digest.ciudad === 'Palermo', `ciudad minada de la bio: ${digest.ciudad}`);
  ok(digest.has_booking === true, 'has_booking detectado (Reservas por DM)');
  const spec = demo.buildDemoSpec({ business: 'Sushi Go', category: 'gastronomia', country: 'AR', tone: 'vos', count: 5, bioText: SUSHI_BIO, digest });
  const joined = spec.topics.map(topicText).join(' | ');
  ok(!joined.includes('pizza'), 'CERO pizzas');
  ok(!joined.includes('milanesa'), 'CERO milanesa');
  ok(!joined.includes('risotto'), 'CERO risotto');
  const anchors = clientDigest.anchorsOf(digest);
  const anchored = spec.topics.filter((t) => clientDigest.pieceAnchored(topicText(t), anchors).ok).length;
  ok(anchored >= 4, `${anchored}/5 temas con ancla del digest (antes: 0)`);
  const fromDigest = spec.topics.filter((t) => t._digest).length;
  ok(fromDigest >= 3, `${fromDigest}/5 temas derivados del digest`);
  ok(/sushi|nikkei|omakase/.test(joined), 'el mundo sushi/nikkei/omakase está en los temas');
}

console.log('== E1) La bio mueve los temas (rica vs vacía) ==');
{
  const BIO_RICA = 'Tostamos nuestro café de especialidad en el barrio · Medialunas recién horneadas · Brunch los fines de semana';
  const rich = clientDigest.buildFromParts({ business: 'Café Martínez', category: 'gastronomia', feed: { bio: BIO_RICA, captions: [], name: 'Café Martínez', handle: 'cafemartinez' } });
  const empty = clientDigest.buildFromParts({ business: 'Café Martínez', category: 'gastronomia', feed: { bio: '', captions: [], name: 'Café Martínez', handle: 'cafemartinez' } });
  const tRich = clientDigest.deriveTopics(rich, { count: 5, category: 'gastronomia' });
  const tEmpty = clientDigest.deriveTopics(empty, { count: 5, category: 'gastronomia' });
  ok(tRich.length >= 3, `bio rica → ${tRich.length} temas derivados`);
  ok(tEmpty.length === 0, 'bio vacía → 0 temas derivados (sin fundamento no se deriva)');
  const specRich = demo.buildDemoSpec({ business: 'Café Martínez', category: 'gastronomia', country: 'AR', tone: 'vos', count: 5, bioText: BIO_RICA, digest: rich });
  const specBase = demo.buildDemoSpec({ business: 'Café Martínez', category: 'gastronomia', country: 'AR', tone: 'vos', count: 5, bioText: '', digest: empty });
  const hRich = specRich.topics.map((t) => t.headline).join('|');
  const hBase = specBase.topics.map((t) => t.headline).join('|');
  ok(hRich !== hBase, 'los titulares de la semana CAMBIAN con la bio');
  ok(/medialuna|brunch|especialidad/.test(specRich.topics.map(topicText).join(' ')), 'la semana rica habla de medialunas/brunch/café de especialidad');
}

console.log('== E3) templateIdeas interpola el ADN; sin ADN no fabrica ==');
{
  const dna = {
    productos: [{ nombre: 'Omakase de autor' }, { nombre: 'Roll de salmón nikkei' }],
    promos_activas: [{ titulo: '2x1 en rolls los jueves' }],
  };
  const ideas = generator.templateIdeas({ business: 'Sushi Go', category: 'gastronomia', dna, description: 'Sushi y cocina nikkei' });
  const titles = ideas.map((i) => i.titulo).join(' | ');
  ok(ideas.length >= 5, `templateIdeas devolvió ${ideas.length} ideas con ADN rico`);
  ok(/omakase/i.test(titles), 'un título lleva el producto real (Omakase)');
  ok(titles.includes('2x1 en rolls los jueves'), 'la promo real del ADN es el título de la promo');
  const none = generator.templateIdeas({ business: 'Sushi Go', category: 'gastronomia', dna: {}, description: '' });
  ok(Array.isArray(none) && none.length === 0, 'sin ADN ni descripción → [] (no fabrica la semana)');
  const trial = generator.templateIdeas({ business: 'Sushi Go', category: 'gastronomia' });
  ok(trial.length === 7, 'sin campo dna (ruta prueba) → los 7 esqueletos de siempre');
}

console.log('== Pertenencia: el chequeo determinístico ==');
{
  const digest = sushiDigest();
  const anchors = clientDigest.anchorsOf(digest);
  ok(clientDigest.pieceAnchored('Omakase de los viernes, recién hecho', anchors).ok, 'pieza con producto real → pasa');
  ok(!clientDigest.pieceAnchored('2x1 en pizzas todos los miércoles', anchors).ok, 'pieza de otro negocio → no pasa');
  ok(!clientDigest.pieceAnchored('Promo de la semana en Sushi Go, no te la pierdas', anchors).ok, 'el nombre del negocio solo NO ancla');
}
(async () => {
  console.log('== generateContent: _anchored sin IA (ruta plantilla) ==');
  {
    const a = await generator.generateContent({ business: 'Sushi Go', category: 'gastronomia', tone: 'canchero', topic: 'Omakase de los viernes', anchors: ['Omakase', 'Sushi y cocina nikkei'] }, null);
    ok(a._anchored === true, 'tema anclado → _anchored=true');
    const b = await generator.generateContent({ business: 'Sushi Go', category: 'gastronomia', tone: 'canchero', topic: 'promo de la semana', anchors: ['Omakase'] }, null);
    ok(b._anchored === false, 'tema genérico → _anchored=false (queda marcado)');
  }

  console.log('== Conversión: la cuenta nace con el digest sembrado ==');
  const PORT = 18777;
  const BASE = `http://127.0.0.1:${PORT}`;
  const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken229' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    let booted = false;
    for (let i = 0; i < 60 && !booted; i++) {
      try { const r = await fetch(`${BASE}/api/version`); if (r.ok) booted = true; } catch (e) {}
      if (!booted) await new Promise((r) => setTimeout(r, 500));
    }
    ok(booted, 'server booteó');
    const digest = sushiDigest();
    const payload = JSON.stringify({
      ok: true, engine: demo.DEMO_ENGINE_V, business: 'Sushi Go', category: 'gastronomia',
      digest,
      profile: { handle: 'sushigo', name: 'Sushi Go', bio: SUSHI_BIO, captions: SUSHI_CAPTIONS },
      posts: [{ type: 'image', image: TINY_JPG, caption: 'Omakase de los viernes 🍣 recién hecho, como siempre', hashtags: '#sushi' }],
      design: { posts: [{ style: 'centro', kind: 'novedad', headline: 'Omakase los viernes' }], styles: [], photos: [], videoIdx: 0, count: 1, engine: demo.DEMO_ENGINE_V },
      week: [],
    });
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)').run('sushigo', payload, Date.now());
    const r = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sushi-test@example.com', password: 'secreto1', trial_ig: 'sushigo' }),
    });
    ok(r.ok, `register (${r.status})`);
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get('sushi-test@example.com');
    ok(!!u, 'usuario creado');
    const drow = db.prepare('SELECT hash, digest_json FROM client_digest WHERE user_id = ?').get(u.id);
    ok(!!drow, 'client_digest persistido al registrarse');
    ok(drow && drow.hash === digest.hash, `hash del digest sembrado = ${drow && drow.hash}`);
    const prof = db.prepare('SELECT category, description, ig_username FROM profiles WHERE user_id = ?').get(u.id);
    ok(prof && prof.category === 'gastronomia', `profiles.category = ${prof && prof.category} (no 'otro')`);
    ok(prof && /omakase|sushi/i.test(prof.description || ''), 'profiles.description nace del digest');
    const dnaRow = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(u.id);
    const dnaObj = dnaRow ? JSON.parse(dnaRow.dna_json) : {};
    ok(JSON.stringify(dnaObj).toLowerCase().includes('omakase'), 'business_dna sembrado con los servicios reales');
    ok(String(dnaObj.producto_estrella || '').length >= 3, `producto_estrella sembrado: ${dnaObj.producto_estrella}`);
    const st = db.prepare('SELECT brand_colors FROM settings WHERE user_id = ?').get(u.id);
    ok(st && String(st.brand_colors || '').includes('#1D3557'), `brand_colors desde la paleta del digest: ${st && st.brand_colors}`);
    const post = db.prepare('SELECT digest_hash FROM posts WHERE user_id = ? ORDER BY id LIMIT 1').get(u.id);
    ok(post && post.digest_hash === digest.hash, `posteo importado con digest_hash=${post && post.digest_hash}`);
    db.close();
  } catch (e) {
    fails++;
    console.error('  ✗ excepción en conversión:', e.message);
    console.error(srvLog.slice(-1500));
  } finally {
    srv.kill('SIGKILL');
  }

  console.log('== Cableado (contrato de fuentes) ==');
  {
    const srvSrc = fs.readFileSync('server.js', 'utf8');
    const schSrc = fs.readFileSync('scheduler.js', 'utf8');
    const demoSrc = fs.readFileSync('demo.js', 'utf8');
    ok(demoSrc.includes('const DEMO_ENGINE_V = 18;'), 'DEMO_ENGINE_V = 18 (cachés sin fundamento invalidadas)');
    ok(srvSrc.includes('seedFromTrialDigest(r.lastInsertRowid, trial_ig)'), 'register siembra el digest');
    ok(srvSrc.includes('seedFromTrialDigest(userId, payload.trial_ig)'), 'magic-link siembra el digest');
    ok(srvSrc.includes('qaFactsLine(dna, digestForUser(uid))'), 'qaFactsLine contrasta contra ADN + digest completos');
    ok(srvSrc.includes('[qa-claims-block]'), 'claims_ok=false bloqueante con degradación');
    ok(srvSrc.includes('runWeeklyDigestRefresh: refreshDigestsSweep'), 'sweep de refresco exportado');
    ok(schSrc.includes("'30 6 * * 1'"), 'scheduler: refresco lunes 06:30 antes del loop de ideas');
    ok(srvSrc.includes('digest: trialDigest'), 'el digest viaja en el payload de la prueba (ambas rutas)');
  }

  console.log(fails ? `\n✗ ${fails} fallas` : '\n✓ TODO VERDE — test-digest-foundation');
  process.exit(fails ? 1 : 0);
})();
