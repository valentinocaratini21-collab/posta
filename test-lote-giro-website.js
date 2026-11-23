// test-lote-giro-website.js — Suite del lote GIRO-WEBSITE (2026-11-23):
// barrido de coherencia del Modelo A (todo apunta al 1° de febrero; las
// pruebas abren desde el lanzamiento; la puerta pública está en modo
// lista) sobre TODAS las superficies públicas de texto del sitio ES+EN.
// Ninguna superficie puede dar a entender que hoy se puede probar gratis.
// Incluye A8: las dos respuestas del FAQ que invitaban a «mandar un audio»
// (notas de voz retiradas del producto el 20/11) ahora dicen mensaje
// escrito — sumado por observación del constructor de COSTURA-SOLO-WEB.
//   A · Estática: ningún literal viejo del censo queda en los 11 archivos
//       del lote y todos los textos nuevos están.
//   B · Boot real: el servidor sirve cada superficie por HTTP sin ningún
//       literal viejo y con los nuevos, en ambos idiomas.
//   C · No-sobre-alcance: lo declarado NO editado en el censo sigue
//       intacto (la cara pública de /prueba — B1 — y la demo — B2).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra || ''); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Literales exactos del censo (CENSO.md del lote): por archivo, los textos
// viejos que ya no pueden servirse y los nuevos que tienen que estar.
const TABLA = JSON.parse(String.raw`{
 "public/index.html": {
  "viejos": [
   "Probalo 3 días gratis, sin tarjeta.",
   "Por eso la prueba es gratis y sin tarjeta: ves tu semana armada antes de pagar, y si no te sirve, no pagás nada.",
   "Ya mismo: en la prueba gratis ves tu semana armada en unos toques, antes de registrarte.",
   "<a class=\"nav-cta\" href=\"/prueba\">Probá 3 días gratis</a>",
   "Ver mi semana · 3 días gratis <svg",
   ">te avisamos cuando salga cada posteo<",
   "Esto le hicimos a Tomoko. <span class=\"ej2-free\">Gratis.</span>",
   "Tu negocio se puede ver así esta misma semana.",
   "<span class=\"ej2-tag\">Prueba gratis</span>",
   "<a class=\"ej2-cta\" href=\"/prueba\">Quiero mi prueba así</a>",
   "<p>3 días gratis · sin tarjeta · cancelás cuando querás</p>",
   " — probá gratis cómo se ve la tuya 👇",
   "¿Algo no te cierra? Nos mandás un audio y te lo corregimos — otra foto, otro texto u otra idea — antes de que salga. Y aprendemos de lo que te gusta para que cada semana salga mejor.",
   "Sí: cada mañana ves el posteo del día y sale solo si no decís nada; si algo no te cierra, nos mandás un audio y te lo corregimos."
  ],
  "nuevos": [
   "Arrancamos el 1° de febrero: sumate a la lista y reservá tu lugar.",
   "Por eso la prueba va a ser gratis y sin tarjeta: cuando abran, el 1° de febrero, ves tu semana armada antes de pagar, y si no te sirve, no pagás nada. Hoy te sumás a la lista y tu lugar queda reservado.",
   "El 1° de febrero, cuando abran las pruebas: en unos toques ves tu semana armada, antes de pagar. Sumate hoy a la lista y entrá entre los primeros.",
   "<a class=\"nav-cta\" href=\"/prueba\">Sumate a la lista</a>",
   "Reservá mi lugar <svg",
   ">te avisamos cuando abran las pruebas<",
   "Esto le hicimos a Tomoko.",
   "Así se va a ver tu negocio cuando abran las pruebas, el 1° de febrero.",
   "<span class=\"ej2-tag\">Prueba de Tomoko</span>",
   "<a class=\"ej2-cta\" href=\"/prueba\">Quiero mi lugar en la fila</a>",
   "<p>Las pruebas abren el 1° de febrero · sumate a la lista</p>",
   " — sumate a la lista y reservá tu lugar 👇",
   "¿Algo no te cierra? Nos escribís un mensaje y te lo corregimos — otra foto, otro texto u otra idea — antes de que salga. Y aprendemos de lo que te gusta para que cada semana salga mejor.",
   "Sí: cada mañana ves el posteo del día y sale solo si no decís nada; si algo no te cierra, nos escribís un mensaje y te lo corregimos."
  ]
 },
 "public/app.js": {
  "viejos": [
   "<a class=\"nav-cta\" href=\"/prueba\">Probá 3 días gratis</a>",
   "Ver mi semana · 3 días gratis <svg",
   ">te avisamos cuando salga cada posteo<",
   "<a class=\"vd-btnglass\" href=\"/prueba\">Empezar mi prueba gratis</a>",
   "<a class=\"cap-cta\" href=\"/prueba\">Probalo 3 días gratis →</a>",
   "<a class=\"cap-cta\" href=\"/prueba\">Probá gratis 3 días →</a>",
   "<a class=\"at-glass-btn\" href=\"/prueba\">Empezar mi prueba gratis</a>",
   "<a class=\"sb-cta\" href=\"/prueba\"><span class=\"sb-cta-dot\"></span>Probá gratis 3 días</a>",
   "href=\"/prueba\">Probar gratis</a>",
   "<p class=\\\"ej-title\\\">Esto le hicimos a Tomoko. <span class=\\\"ej2-free\\\">Gratis.</span></p>",
   "Tu negocio se puede ver así esta misma semana.",
   "<span class=\\\"ej2-tag\\\">Prueba gratis</span>",
   "<a class=\\\"ej2-cta\\\" href=\\\"/prueba\\\">Quiero mi prueba así</a>",
   "<p>3 días gratis · sin tarjeta · cancelás cuando querás</p>",
   "<p class=\"lp-show-cert\">3 días gratis · sin tarjeta · cancelás cuando querés</p>",
   "<p class=\"lede\">Probá gratis 3 días. Si te gusta tu semana, este es tu plan.</p>",
   "<b>La oferta es simple:</b> probás 3 días gratis, ves tu semana armada antes de pagar nada y, si no te encanta, no pagás nada.",
   "<details><summary>¿Y si no me funciona?</summary><p>Por eso la prueba es gratis y sin tarjeta: ves tu semana armada antes de pagar, y si no te sirve, no pagás nada.</p></details>",
   "<details><summary>¿Cuándo veo mi primera semana?</summary><p>Ya mismo: en la prueba gratis ves tu semana armada en unos toques, antes de registrarte.</p></details>",
   "<h2>Probás 3 días gratis antes de pagar.</h2>",
   "<p>Conectá tu Instagram y mirá tu semana ya armada. Gratis, sin tarjeta.</p>",
   ">Empezar mis 3 días gratis</a>",
   "<a class=\"btn btn-primary btn-block\" href=\"/prueba\">Probá gratis 3 días</a>",
   "trialCta: 'Probar 3 días gratis'",
   "regSub: 'Probalo gratis, sin tarjeta.'",
   "trialCta: 'Try 3 days free'",
   "regSub: 'Try it free, no card needed.'",
   "<details><summary>¿Qué pasa si no me gusta un posteo?</summary><p>¿Algo no te cierra? Nos mandás un audio y te lo corregimos — otra foto, otro texto u otra idea — antes de que salga. Y aprendemos de lo que te gusta para que cada semana salga mejor.</p></details>",
   "<details><summary>¿Los posteos se publican solos?</summary><p>Sí: cada mañana ves el posteo del día y sale solo si no decís nada; si algo no te cierra, nos mandás un audio y te lo corregimos.</p></details>"
  ],
  "nuevos": [
   "<a class=\"nav-cta\" href=\"/prueba\">Sumate a la lista</a>",
   "Reservá mi lugar <svg",
   ">te avisamos cuando abran las pruebas<",
   "<a class=\"vd-btnglass\" href=\"/prueba\">Reservá tu lugar</a>",
   "<a class=\"cap-cta\" href=\"/prueba\">Reservá tu lugar →</a>",
   "<a class=\"cap-cta\" href=\"/prueba\">Reservá tu lugar →</a>",
   "<a class=\"at-glass-btn\" href=\"/prueba\">Reservá tu lugar</a>",
   "<a class=\"sb-cta\" href=\"/prueba\"><span class=\"sb-cta-dot\"></span>Reservá tu lugar</a>",
   "href=\"/prueba\">Reservá tu lugar</a>",
   "<p class=\\\"ej-title\\\">Esto le hicimos a Tomoko.</p>",
   "Así se va a ver tu negocio cuando abran las pruebas, el 1° de febrero.",
   "<span class=\\\"ej2-tag\\\">Prueba de Tomoko</span>",
   "<a class=\\\"ej2-cta\\\" href=\\\"/prueba\\\">Quiero mi lugar en la fila</a>",
   "<p>Las pruebas abren el 1° de febrero · sumate a la lista</p>",
   "<p class=\"lp-show-cert\">Las pruebas abren el 1° de febrero · sumate a la lista</p>",
   "<p class=\"lede\">Las pruebas abren el 1° de febrero. Si te gusta tu semana, este es tu plan.</p>",
   "<b>La oferta es simple:</b> el 1° de febrero abren las pruebas y probás 3 días gratis: ves tu semana armada antes de pagar nada y, si no te encanta, no pagás nada.",
   "<details><summary>¿Y si no me funciona?</summary><p>Por eso la prueba va a ser gratis y sin tarjeta: cuando abran, el 1° de febrero, ves tu semana armada antes de pagar, y si no te sirve, no pagás nada. Hoy te sumás a la lista y tu lugar queda reservado.</p></details>",
   "<details><summary>¿Cuándo veo mi primera semana?</summary><p>El 1° de febrero, cuando abran las pruebas: en unos toques ves tu semana armada, antes de pagar. Sumate hoy a la lista y entrá entre los primeros.</p></details>",
   "<h2>El 1° de febrero, probás 3 días gratis.</h2>",
   "<p>Sumate a la lista y reservá tu lugar: cuando abran las pruebas, ves tu semana armada gratis y sin tarjeta.</p>",
   ">Reservá mi lugar</a>",
   "<a class=\"btn btn-primary btn-block\" href=\"/prueba\">Sumate a la lista</a>",
   "trialCta: 'Sumate a la lista'",
   "regSub: 'Las pruebas abren el 1° de febrero: sumate a la lista.'",
   "trialCta: 'Join the waitlist'",
   "regSub: 'Trials open on February 1: join the waitlist.'",
   "<details><summary>¿Qué pasa si no me gusta un posteo?</summary><p>¿Algo no te cierra? Nos escribís un mensaje y te lo corregimos — otra foto, otro texto u otra idea — antes de que salga. Y aprendemos de lo que te gusta para que cada semana salga mejor.</p></details>",
   "<details><summary>¿Los posteos se publican solos?</summary><p>Sí: cada mañana ves el posteo del día y sale solo si no decís nada; si algo no te cierra, nos escribís un mensaje y te lo corregimos.</p></details>"
  ]
 },
 "public/en/index.html": {
  "viejos": [
   "<a class=\"btn btn-primary btn-block\" href=\"/en/prueba\">Try it free for 3 days</a>",
   "<p class=\"lede\">Try it free for 3 days. If you like your week, this is your plan.</p>",
   "<a class=\"btn btn-primary btn-block\" href=\"/en/prueba\">Try it free</a>",
   "Try it free for 3 days, no card required.",
   "That's why the trial is free and card-less: you see your week ready before paying, and if it's not for you, you pay nothing.",
   "Right away: in the free trial you see your week ready in a few taps, before signing up.",
   "<a class=\"nav-cta\" href=\"/en/prueba\">Try 3 days free</a>",
   "See my week · 3 days free <svg",
   ">We'll let you know when each post goes out<",
   "<a class=\"vd-btnglass\" href=\"/en/prueba\">Start my free trial</a>",
   "<a class=\"at-glass-btn\" href=\"/en/prueba\">Start my free trial</a>",
   "Try it free for 3 days",
   "This is what we made for Tomoko. <span class=\"ej2-free\">Free.</span>",
   "Your business can look like this, this very week.",
   "<span class=\"ej2-tag\">Free trial</span>",
   "<a class=\"ej2-cta\" href=\"/prueba\">I want my trial like this</a>",
   "<p>3 free days · no card · cancel anytime</p>",
   "<p class=\"lp-show-cert\">3 days free · no card · cancel anytime</p>",
   "<b>The offer is simple:</b> you try 3 days free, you see your week ready before paying a cent and, if you don't love it, you pay nothing.",
   "<h2>Try 3 days free before you pay.</h2>",
   "<p>Connect your Instagram and see your week already planned. Free, no card.</p>",
   ">Start my 3 free days</a>",
   " — try free how yours would look 👇",
   "Something doesn't feel right? Send us a voice note and we'll fix it — another photo, another caption or another idea — before it goes out. And we learn from what you like so every week comes out better.",
   "Yes: every morning you see the day's post and it goes out on its own if you don't say anything; if something doesn't feel right, send us a voice note and we'll fix it."
  ],
  "nuevos": [
   "<a class=\"btn btn-primary btn-block\" href=\"/en/prueba\">Join the waitlist</a>",
   "<p class=\"lede\">Trials open on February 1. If you like your week, this is your plan.</p>",
   "<a class=\"btn btn-primary btn-block\" href=\"/en/prueba\">Reserve your spot</a>",
   "We launch on February 1: join the list and reserve your spot.",
   "That's why the trial will be free and card-less: when trials open on February 1, you see your week ready before paying, and if it's not for you, you pay nothing. Join the list today and your spot is reserved.",
   "On February 1, when trials open: in a few taps you see your week ready, before paying. Join the list today and be among the first in.",
   "<a class=\"nav-cta\" href=\"/en/prueba\">Join the waitlist</a>",
   "Reserve my spot <svg",
   ">We'll let you know when trials open<",
   "<a class=\"vd-btnglass\" href=\"/en/prueba\">Reserve your spot</a>",
   "<a class=\"at-glass-btn\" href=\"/en/prueba\">Reserve your spot</a>",
   "Reserve your spot",
   "This is what we made for Tomoko.",
   "Your business will look like this when trials open on February 1.",
   "<span class=\"ej2-tag\">Tomoko's trial</span>",
   "<a class=\"ej2-cta\" href=\"/prueba\">I want my spot in line</a>",
   "<p>Trials open February 1 · join the waitlist</p>",
   "<p class=\"lp-show-cert\">Trials open February 1 · join the waitlist</p>",
   "<b>The offer is simple:</b> trials open on February 1 and you try 3 days free: you see your week ready before paying a cent and, if you don't love it, you pay nothing.",
   "<h2>On February 1, try 3 days free.</h2>",
   "<p>Join the list and reserve your spot: when trials open, you see your week ready, free and no card.</p>",
   ">Reserve my spot</a>",
   " — join the list and reserve your spot 👇",
   "Something doesn't feel right? Send us a message and we'll fix it — another photo, another caption or another idea — before it goes out. And we learn from what you like so every week comes out better.",
   "Yes: every morning you see the day's post and it goes out on its own if you don't say anything; if something doesn't feel right, send us a message and we'll fix it."
  ]
 },
 "public/fundadores.html": {
  "viejos": [
   "El 1 de enero empiezo a trabajar: probá gratis cómo se vería tu semana y sumate.",
   "<a class=\"btn\" href=\"/prueba?src=fundadores\">Probá gratis 3 días →</a>",
   "<p class=\"tiny\">Sin tarjeta. Ves la semana de tu negocio armada antes de decidir.</p>"
  ],
  "nuevos": [
   "El 1° de febrero empiezo a trabajar: sumate a la fila y reservá tu lugar de fundador.",
   "<a class=\"btn\" href=\"/prueba?src=fundadores\">Reservá tu lugar →</a>",
   "<p class=\"tiny\">Sin tarjeta. Tu lugar de fundador se asigna por orden de llegada.</p>"
  ]
 },
 "public/en-fundadores.html": {
  "viejos": [
   "I start working on January 1st: try for free how your week would look and join.",
   "<a class=\"btn\" href=\"/en/prueba?src=founders\">Try free for 3 days →</a>",
   "<p class=\"tiny\">No card. You see your business's week built before you decide.</p>"
  ],
  "nuevos": [
   "I start working on February 1st: join the line and reserve your founder spot.",
   "<a class=\"btn\" href=\"/en/prueba?src=founders\">Reserve your spot →</a>",
   "<p class=\"tiny\">No card. Your founder spot is assigned in order of arrival.</p>"
  ]
 },
 "public/auditoria.html": {
  "viejos": [
   "<a class=\"btn btn-primary btn-sm\" href=\"/prueba\">Probar gratis</a>",
   "<small>Tu semana armada gratis · Sin tarjeta</small>",
   "<a href=\"/prueba\">Probalo gratis</a>"
  ],
  "nuevos": [
   "<a class=\"btn btn-primary btn-sm\" href=\"/prueba\">Sumate a la lista</a>",
   "<small>Tu semana, desde el 1° de febrero · Sumate a la lista</small>",
   "<a href=\"/prueba\">Sumate a la lista</a>"
  ]
 },
 "public/en-auditoria.html": {
  "viejos": [
   "<a class=\"btn btn-primary btn-sm\" href=\"/en/prueba\">Try it free</a>",
   "<small>Your week built for free · No card required</small>",
   "<a href=\"/en/prueba\">Try it free</a>"
  ],
  "nuevos": [
   "<a class=\"btn btn-primary btn-sm\" href=\"/en/prueba\">Join the waitlist</a>",
   "<small>Your week, from February 1 · Join the waitlist</small>",
   "<a href=\"/en/prueba\">Join the waitlist</a>"
  ]
 },
 "public/lista-espera.html": {
  "viejos": [
   "Posty abre el 1 de diciembre"
  ],
  "nuevos": [
   "Posty abre el 1° de febrero"
  ]
 },
 "public/en-lista-espera.html": {
  "viejos": [
   "Posty opens on December 1"
  ],
  "nuevos": [
   "Posty opens on February 1"
  ]
 },
 "public/404.html": {
  "viejos": [
   "Probalo 3 días gratis, sin tarjeta.",
   "<a class=\"btn btn-primary\" href=\"/prueba\">Probar Posty gratis</a>"
  ],
  "nuevos": [
   "Arrancamos el 1° de febrero: sumate a la lista y reservá tu lugar.",
   "<a class=\"btn btn-primary\" href=\"/prueba\">Sumate a la lista</a>"
  ]
 },
 "public/404-en.html": {
  "viejos": [
   "Try it free for 3 days, no card required.",
   "<a class=\"btn btn-primary\" href=\"/en/prueba\">Try Posty free</a>"
  ],
  "nuevos": [
   "We launch on February 1: join the list and reserve your spot.",
   "<a class=\"btn btn-primary\" href=\"/en/prueba\">Join the waitlist</a>"
  ]
 }
}`);

const RUTAS = {
  'public/index.html': ['/', '/index.html'],
  'public/app.js': ['/app.js'],
  'public/en/index.html': ['/en/', '/en/index.html'],
  'public/fundadores.html': ['/fundadores.html'],
  'public/en-fundadores.html': ['/en-fundadores.html'],
  'public/auditoria.html': ['/auditoria.html'],
  'public/en-auditoria.html': ['/en-auditoria.html'],
  'public/lista-espera.html': ['/lista-espera.html'],
  'public/en-lista-espera.html': ['/en-lista-espera.html'],
  'public/404.html': ['/404.html'],
  'public/404-en.html': ['/404-en.html'],
};

function chequeoCuerpo(etiqueta, cuerpo, spec) {
  const quedanViejos = spec.viejos.filter(v => cuerpo.includes(v));
  ok(etiqueta + ': ningún literal viejo', quedanViejos.length === 0, quedanViejos.map(v => v.slice(0, 50)).join(' | '));
  const faltanNuevos = spec.nuevos.filter(n => !cuerpo.includes(n));
  ok(etiqueta + ': todos los textos nuevos', faltanNuevos.length === 0, faltanNuevos.map(n => n.slice(0, 50)).join(' | '));
}

// ---------------------------------------------------------------- A
console.log('\nA · Estática (los 11 archivos del lote)');
for (const [archivo, spec] of Object.entries(TABLA)) {
  chequeoCuerpo('A ' + archivo, read(archivo), spec);
}

// ---------------------------------------------------------------- C
console.log('\nC · No-sobre-alcance (declarado no editado en el censo)');
{
  ok('C1 la cara pública de /prueba sigue intacta (B1, decisión del tablero)',
    read('public/prueba.html').includes('<title>Posty — Descargá la app y te hacemos 3 posteos gratis</title>') &&
    read('public/en-prueba.html').includes("<title>Posty — Download the app and we'll make you 3 free posts</title>"));
  ok('C2 la demo sigue intacta (B2, ambigua declarada)',
    read('public/demo.html').includes('<title>Probá Posty gratis — 2 posteos + 1 video de muestra para tu negocio</title>') &&
    read('public/en-demo.html').includes('<title>Try Posty free — 2 sample posts + 1 video for your business</title>'));
}

// ---------------------------------------------------------------- B
console.log('\nB · Boot real (superficies servidas por HTTP)');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'giro-website-'));
  const port = 18777;
  const base = 'http://127.0.0.1:' + port;
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, MEDIA_DIR: path.join(dir, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', d => { log += d; });
  proc.stderr.on('data', d => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
    ok('B0 el servidor levanta', up, up ? '' : log.slice(-400));
    if (up) {
      for (const [archivo, spec] of Object.entries(TABLA)) {
        for (const ruta of RUTAS[archivo]) {
          const r = await fetch(base + ruta);
          const cuerpo = await r.text();
          ok('B ' + ruta + ' responde 200', r.status === 200, 'status ' + r.status);
          chequeoCuerpo('B ' + ruta + ' (' + archivo + ')', cuerpo, spec);
        }
      }
    }
  } finally {
    try { process.kill(proc.pid, 'SIGTERM'); } catch (e) {}
    await sleep(500);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nTOTAL: ' + pass + ' ✓ · ' + fail + ' ✗');
  if (fails.length) { console.log('FALLAS:\n - ' + fails.join('\n - ')); }
  process.exit(fail ? 1 : 0);
})();
