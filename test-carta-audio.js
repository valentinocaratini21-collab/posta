'use strict';
/* v384 — LA CARTA CON AUDIO (ítem 8): guion fiel desde el texto real de
   la carta, token firmado, página servida, audio generado UNA vez y
   cacheado, costo cero sin apertura, y la página sobrevive a la falla
   del proveedor. Integración con stubs (RESEND_API_URL + TTS_API_URL). */
process.env.APPROVAL_SECRET = process.env.APPROVAL_SECRET || 'test-secret-carta';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-carta';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const chunkAn = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const holaInbox = fs.readFileSync(path.join(__dirname, 'hola-inbox.js'), 'utf8');

/* ---------- estáticos ---------- */
ok(serverJs.includes("app.get('/carta/:token'"), 'ruta de la página de la carta');
ok(serverJs.includes("app.get('/carta/:token/audio.json'"), 'ruta de estado del audio');
ok(serverJs.includes('Escuchá tu carta') && serverJs.includes('Listen to your letter'), 'botón del email ES + EN');
ok(serverJs.includes('carta_url'), 'la respuesta del regalo y el análisis traen carta_url');
ok(chunkAn.includes('carta_url') && chunkAn.includes('Escuchá tu carta'), 'botón en la carta mínima de Análisis');
ok(holaInbox.includes('escucha tu carta') && holaInbox.includes('listen to your letter'), 'marcadores de respuesta actualizados');
ok(fs.existsSync(path.join(__dirname, 'carta-audio.js')), 'módulo carta-audio presente');

/* ---------- unidad: guion fiel ---------- */
const ca = require('./carta-audio.js');
const textoCarta = [
  'Hola — soy Posty, tu community manager.',
  'Ya empecé, de hecho: estuve chusmeando @cafe.aurora y te preparé la semana entera. El primero: Merienda completa',
  'Ver mi semana completa: https://postycommunitymanager.com/prueba?ig=cafe.aurora&src=email-salida',
  'Con amor,\nPosty\npostycommunitymanager.com',
].join('\n\n');
const script = ca.scriptFromLetterText(textoCarta);
ok(script.includes('Merienda completa'), 'el guion trae el héroe literal');
ok(script.includes('arroba cafe aurora'), 'el @ se lee «arroba» sin puntos');
ok(!/https?:\/\//.test(script), 'el guion no lee URLs');
ok(!script.includes('postycommunitymanager.com'), 'la firma no lee el dominio');
ok(script.includes('Ver mi semana completa.'), 'el CTA queda como frase hablada');
const dom = ca.sundayLetterSegments({ letter: { greeting: 'Hola, soy Posty.', body: [{ t: 'p', text: 'Tu semana rindió.' }, { t: 'photo', src: '/media/x.jpg' }, { t: 'action', text: 'Subí 2 fotos' }], closing: 'Domingo 3 conmigo.' } });
ok(dom.length === 4 && !dom.some((x) => x.includes('/media/')), 'guion dominical: greeting + body sin foto + closing');
ok(ca.sundayLetterSegments({ letter: null }).length === 0, 'sin carta no hay guion dominical');

/* ---------- unidad: token ---------- */
const approval = require('./approval.js');
const tok = approval.signCartaLink('prueba', 'cafe.aurora');
const ver = approval.verifyCartaLink(tok);
ok(ver && ver.kind === 'prueba' && ver.ref === 'cafe.aurora', 'token válido con ref con puntos');
ok(approval.verifyCartaLink(tok.slice(0, -2) + 'xx') === null, 'token adulterado rechazado');
ok(approval.verifyCartaLink('basura') === null, 'token basura rechazado');

/* ---------- integración: gift → página → audio (1 sola síntesis) ---------- */
(async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-audio-'));
  let ttsCalls = 0; const captures = [];
  const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url.includes('/audio/speech')) {
        ttsCalls++;
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        res.end(Buffer.from('FAKE-MP3-' + ttsCalls));
      } else {
        try { captures.push(JSON.parse(body || '{}')); } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'stub-email-1' }));
      }
    });
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const stubPort = stub.address().port;
  process.env.RESEND_API_URL = `http://127.0.0.1:${stubPort}/emails`;
  process.env.TTS_API_URL = `http://127.0.0.1:${stubPort}/audio/speech`;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.RESEND_API_KEY = 'test-key';
  process.env.DATA_DIR = TMP;

  const { spawn } = require('child_process');
  const PORT = 18777;
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  const base = `http://127.0.0.1:${PORT}`;
  const waitUp = async () => {
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(base + '/api/version'); if (r.ok) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };
  try {
    ok(await waitUp(), 'el servidor levanta');
    // Sembrar la semana en trial_cache (como la dejaría una prueba real).
    const db = require('./db');
    const payload = {
      business: 'Café Aurora', ig: 'cafe.aurora', category: 'cafeteria', lang: 'es',
      posts: [{ type: 'image', image: '/media/test-hero.jpg', headline: 'Merienda completa', why: 'vende la tarde' }],
      digest: { star_product: 'merienda' }, competition_line: null,
    };
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('cafe.aurora', JSON.stringify(payload), Date.now());
    // Pedir el regalo: compone la Carta (email stub) y devuelve carta_url.
    const gift = await fetch(base + '/api/trial/gift-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ig: 'cafe.aurora', email: 'duena@example.com', lang: 'es' }),
    }).then((r) => r.json());
    ok(gift.ok === true && gift.carta_url && gift.carta_url.startsWith('/carta/'), 'el regalo devuelve carta_url');
    ok(gift.sent === true, 'el regalo se envió al stub de email');
    ok(captures.some((c) => String(c.html || '').includes('Escuchá tu carta')), 'el email lleva el botón de audio');
    const cartaCap = captures.find((c) => String(c.html || '').includes('Escuchá tu carta'));
    ok(cartaCap && String(cartaCap.text || '').includes('Escuchá tu carta:'), 'el texto plano lleva la línea de escucha');
    ok(ttsCalls === 0, 'sin apertura no hay gasto de TTS');
    // Abrir la página: 200 con el texto de la carta; dispara la síntesis.
    const page = await fetch(base + gift.carta_url);
    const pageHtml = await page.text();
    ok(page.status === 200 && pageHtml.includes('Merienda completa'), 'la página sirve el texto real de la carta');
    let ready = null;
    for (let i = 0; i < 20; i++) {
      ready = await fetch(base + gift.carta_url + '/audio.json').then((r) => r.json()).catch(() => null);
      if (ready && ready.state === 'ready') break;
      await new Promise((r) => setTimeout(r, 400));
    }
    ok(ready && ready.state === 'ready' && ready.url && ready.url.startsWith('/media/carta-'), 'el audio queda listo y cacheado');
    const mp3 = await fetch(base + ready.url);
    ok(mp3.status === 200 && (await mp3.text()).startsWith('FAKE-MP3'), 'el mp3 se sirve desde /media');
    // Segunda apertura: NO regenera.
    await fetch(base + gift.carta_url);
    await new Promise((r) => setTimeout(r, 600));
    ok(ttsCalls === 1, 'dos aperturas = una sola síntesis');
    // Token adulterado: 404.
    const bad = await fetch(base + '/carta/' + gift.carta_url.split('/carta/')[1].slice(0, -2) + 'xx');
    ok(bad.status === 404, 'token adulterado en la página → 404');
  } catch (e) {
    ok(false, 'integración: ' + e.message);
    console.log(srvLog.slice(-800));
  } finally {
    srv.kill('SIGKILL');
    stub.close();
  }
  console.log(`test-carta-audio: ${okN} ok / ${failN} fallas`);
  process.exit(failN ? 1 : 0);
})();
