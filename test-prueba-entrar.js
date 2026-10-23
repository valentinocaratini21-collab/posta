#!/usr/bin/env node
// (v323 · pieza 15 + superficies de las piezas 1–21) Botón ENTRAR visible en
// /prueba y /en/prueba, consciente de sesión, y presencia de las superficies
// nuevas de la tanda en AMBOS idiomas. Asserts estáticos + server booteado.
// Uso: node test-prueba-entrar.js
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3992;
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 200) : ''); }
};

const es = fs.readFileSync(path.join(__dirname, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(__dirname, 'public', 'en-prueba.html'), 'utf8');

for (const [tag, html, entrar, cuenta] of [['ES', es, 'Entrar', 'Ir a mi cuenta'], ['EN', en, 'Log in', 'Go to my account']]) {
  ok(`${tag}: botón btnEntrar en la nav`, html.includes('id="btnEntrar"'), '');
  ok(`${tag}: texto "${entrar}"`, html.includes('>' + entrar + '<') || html.includes(entrar));
  ok(`${tag}: texto de sesión "${cuenta}"`, html.includes(cuenta));
  ok(`${tag}: destino login por defecto`, html.includes('href="/#/login"'));
  ok(`${tag}: wireEntrarBtn cableado`, html.includes('wireEntrarBtn'));
  ok(`${tag}: destino app con sesión`, html.includes('/app/schedule') && html.includes('/app/inicio'));
  // Superficies de la tanda (piezas 1–21)
  ok(`${tag}: detalle opcional colapsado`, html.includes('opt-detail') && html.includes('f_desc') && html.includes('pf_desc'));
  ok(`${tag}: honeypot invisible`, html.includes('hp_empresa'));
  ok(`${tag}: tarjeta de candado`, html.includes('lockCard') && html.includes('showLockCard'));
  ok(`${tag}: versus (pieza 12)`, html.includes('versusBox') && html.includes('renderVersus'));
  ok(`${tag}: competencia en una línea (19)`, html.includes('compLine') && html.includes('renderCompLine'));
  ok(`${tag}: semana con fechas (18)`, html.includes('weekStartLine') && html.includes('renderWeekStart'));
  ok(`${tag}: precio en el pico (17)`, html.includes('priceCard') && html.includes('/api/billing/plans'));
  ok(`${tag}: tímido primero (16)`, html.includes('v-example') && html.includes('openExample'));
  ok(`${tag}: módulo de fundador (20)`, html.includes('founderCard') && html.includes('valentino-posty-fundador.jpg'));
  ok(`${tag}: foto entera sin recorte (20)`, html.includes('.phone-feed .day .db'));
  ok(`${tag}: beneficios (21)`, html.includes('benefitsCard') && html.includes('prueba_benefits_view'));
  ok(`${tag}: regalo por email (5)`, html.includes('giftEmail') && html.includes('/api/trial/gift-email'));
  ok(`${tag}: reel de muestra (7)`, html.includes('reelGo') && html.includes('/api/trial/sample-reel'));
  ok(`${tag}: compartir con src (6)`, html.includes('src=prueba-compartida'));
  ok(`${tag}: chips nuevos (4)`, html.includes('Más elegantes') || html.includes('More elegant'));
  ok(`${tag}: primera edición instrumentada (4)`, html.includes('prueba_first_edit'));
  ok(`${tag}: primer posteo instrumentado (1/10)`, html.includes('prueba_first_post'));
}

const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
ok('server: endpoint gift-email', srv.includes("/api/trial/gift-email"));
ok('server: endpoint sample-reel', srv.includes("/api/trial/sample-reel"));
ok('server: candado en generate y stream', (srv.match(/trialLockGate\(fields/g) || []).length >= 2);
ok('server: carta — asunto aprobado', srv.includes('Tus posteos ya están listos') && srv.includes('Your posts are ready'));
ok('server: carta — remitente Posty', srv.includes("from: 'Posty <hola@postycommunitymanager.com>'"));
ok('server: carta — avatar saludando', srv.includes('posty-avatar-saludando.png'));
ok('server: carta — tono amigo y despedida final', srv.includes('Con amor,') && srv.includes('estuve chusmeando') && srv.includes('With love,'));
ok('server: carta — firma literal', srv.includes('firma-posty.png'));
ok('server: carta — sin pregunta, sin posdata, sin texto bajo la foto', !srv.includes('Una pregunta antes de firmar') && !srv.includes('P.D.: tu posteo del') && !srv.includes('Y detrás mío está Valentino'));
ok('server: carta — link al sitio tras la firma', srv.includes('postycommunitymanager.com</a>'));
ok('server: carta — carrusel con posteos 2 y 3 (enmienda 11)', srv.includes('también son tuyos') && srv.includes('Y quedan'));
ok('server: carta — evento carta_entregada (rescate 72 h)', srv.includes("'carta_entregada'"));
ok('server: activos de la carta en el repo', fs.existsSync(path.join(__dirname, 'public', 'valentino-posty-fundador.jpg')) && fs.existsSync(path.join(__dirname, 'public', 'firma-posty.png')) && fs.existsSync(path.join(__dirname, 'public', 'posty-avatar-saludando.png')));

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-entrar-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', d => { bootLog += d; });
  child.stderr.on('data', d => { bootLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch {}
      if (!up) await new Promise(r => setTimeout(r, 500));
    }
    assert(up, 'el servidor no levantó:\n' + bootLog.slice(-1500));
    for (const [tag, url] of [['ES', '/prueba'], ['EN', '/en/prueba']]) {
      const r = await fetch(BASE + url);
      const body = await r.text();
      ok(`${tag}: ${url} sirve 200 con el botón`, r.status === 200 && body.includes('btnEntrar'), r.status);
    }
    for (const f of ['valentino-posty-fundador.jpg', 'firma-posty.png', 'posty-avatar-saludando.png']) {
      const fr = await fetch(BASE + '/' + f);
      ok(`activo ${f} sirve 200`, fr.status === 200, fr.status);
    }
  } finally {
    child.kill('SIGKILL');
  }
  console.log(`\n${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
