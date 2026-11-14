// test-lote-nota-voz-unica-puerta.js
// LOTE NOTA-VOZ-ÚNICA-PUERTA — regla de Valentino (13/11 20:55–20:57,
// sobre la captura de la pantalla de chat de la corrida de Blind
// Barber): «esto no deberia aparecer mas» (el campo de texto libre
// «Dejar una nota a Posty» con su input y su botón Guardar nota) ·
// «lo unico que te lleva al chat de posty es la nota de voz desde el
// proximo posteo o desde "subir"» · «que casi no hay ida y vuelta. es
// el cliente pidiendo un cambio o un posteo nuevo».
// Qué cambia (solo public/app.js + el re-pin de la vecina chat-678):
//   (a) Sale la fila de la nota de texto de chatCardHTML — era la
//       única superficie: la tarjeta se renderiza en chatView, en la
//       hoja de Inicio, en el chat completo y en el dock de la
//       landing; la fila salía en las cuatro. Con ella salen su
//       delegado de clicks y su guardado, que eran el ÚNICO llamador
//       del cliente del endpoint de la nota: el camino de texto
//       queda cerrado del lado cliente. El endpoint del server NO
//       se toca (su comportamiento lo sigue pineando chat-678).
//   (b) Quedan las dos únicas puertas, ambas nota de voz anclada:
//       la tira de voz del posteo (hilo por posteo) y la tarjeta de
//       voz de Subir — su comportamiento no se toca.
//   (c) La pregunta de los lunes QUEDA (es el modelo válido de duda
//       con opciones de un toque), pero el invitado ya no la recibe:
//       en la prueba no hay semana de consultas que reportar (en la
//       corrida apareció un viernes dentro de una prueba). Para el
//       registrado el cuándo no cambia: queda pendiente toda la
//       semana hasta que la responde (diseño vigente, ver STATUS).
// Se corre desde la raíz del release:
//   DATA_DIR=$(mktemp -d) NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-nota-voz-unica-puerta.js
// Control contra la base v1026: PZ_ROOT=<base> (las aserciones del
// comportamiento nuevo caen ahí — es la captura de la corrida
// reproducida: el campo presente, su render y la pregunta de los
// lunes servida a un invitado; los pines de las puertas pasan en
// ambos árboles).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const PRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
const ENPRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
function seccion(s) { console.log('\n[' + s + ']'); }

/* ── A · Censo: el campo no existe en ninguna superficie del cliente ── */
seccion('A · la nota de texto libre no existe en el cliente');
{
  for (const id of ['pzNotaBtn', 'pzNotaForm', 'pzNotaInput', 'pzNotaSave', 'pzNotaGuardar', 'pzNotaDelegar', 'pzNotaRow']) {
    eq(count(APP, id), 0, 'A1 app.js sin rastro de ' + id);
  }
  for (const s of ['Dejar una nota a Posty', 'Leave a note for Posty', 'Guardar nota', 'Save note', 'esta semana no postees de eso', 'no posts about that this week']) {
    eq(count(APP, s), 0, 'A2 app.js sin el copy del campo: «' + s + '»');
  }
  ok(!APP.includes("api.post('/api/chat/nota'"), 'A3 el cliente ya no llama al endpoint de la nota (era su único llamador)');
  // Ninguna otra superficie del cliente lo renderiza: se escanea todo
  // public/ (html + js de primer nivel, incluidos los chunks).
  const pubDir = path.join(ROOT, 'public');
  const superficies = fs.readdirSync(pubDir).filter((f) => /\.(js|html)$/.test(f));
  const conNota = superficies.filter((f) => fs.readFileSync(path.join(pubDir, f), 'utf8').includes('pzNota'));
  eq(JSON.stringify(conNota), JSON.stringify([]), 'A4 ninguna superficie de public/ (app, chunks, html) contiene el campo');
  eq(count(PRUEBA, 'pzNota'), 0, 'A5 prueba.html sin el campo');
  eq(count(ENPRUEBA, 'pzNota'), 0, 'A6 en-prueba.html sin el campo');
  eq(count(SERVER, "app.post('/api/chat/nota'"), 1, 'A7 el endpoint del server queda intacto (el cierre es del lado cliente)');
}

/* ── B · Render de la tarjeta: sin fila de nota, con su barra de voz ── */
seccion('B · chatCardHTML renderiza sin la nota y con la voz');
{
  const a = APP.indexOf('function chatCardHTML(');
  const b = APP.indexOf('// Agrega un mensaje del asistente al chat', a);
  ok(a > 0 && b > a, 'B0 chatCardHTML extraible de app.js');
  let LANG = 'es';
  const sandbox = {
    console,
    CHAT: [],
    pzChatMsgFull: () => '',
    chatNextWeekHTML: () => '',
    proposalHTML: () => '',
    pzIc: () => '',
    gzT: (es, en) => (LANG === 'en' ? en : es),
  };
  vm.createContext(sandbox);
  let chatCardHTML = null;
  try {
    chatCardHTML = vm.runInContext(APP.slice(a, b) + '\n;chatCardHTML;', sandbox);
  } catch (e) { ok(false, 'B0b chatCardHTML evalúa en VM', String(e && e.message)); }
  if (typeof chatCardHTML === 'function') {
    for (const lang of ['es', 'en']) {
      LANG = lang;
      const compacto = chatCardHTML(true, true, true);
      const completo = chatCardHTML();
      for (const [cual, html] of [['compacto', compacto], ['completo', completo]]) {
        ok(!html.includes('pzNota') && !html.includes('pz-nota-row'), 'B1 render ' + cual + ' ' + lang + ': sin fila de nota');
        ok(!html.includes('Dejar una nota') && !html.includes('Leave a note') && !html.includes('Guardar nota') && !html.includes('Save note'), 'B2 render ' + cual + ' ' + lang + ': sin copy del campo');
        ok(html.includes('id="chatMicSend"'), 'B3 render ' + cual + ' ' + lang + ': la barra de voz de la tarjeta sigue (mic grande)');
        ok(html.includes('id="chatPhotoBtn"') && html.includes('id="chatFile"'), 'B4 render ' + cual + ' ' + lang + ': camarita y picker siguen');
      }
      ok(compacto.includes('data-chip='), 'B5 render compacto ' + lang + ': los chips de un toque siguen (no son texto libre)');
    }
  }
}

/* ── C · La pregunta de los lunes: viva para el registrado, fuera de la prueba ── */
seccion('C · pzTemaCargar: la pregunta de los lunes y el invitado');
{
  const a = APP.indexOf('async function pzTemaCargar()');
  const b = APP.indexOf('function pzTemaActual()', a);
  const c = APP.indexOf('function pzIsGuest()');
  const d = APP.indexOf('let PZ_GUEST_PENDING', c);
  ok(a > 0 && b > a && c > 0 && d > c, 'C0 pzTemaCargar y pzIsGuest extraibles de app.js');
  const fixtures = {
    '/api/ritual/hoy': null,
    '/api/weekly-consultas': { ok: true, rango: null, week_key: '2026-11-09' },
    '/api/comments': { comments: [] },
  };
  async function cargarCon(me, consultas) {
    const sandbox = {
      console,
      ME: me,
      PZ_TEMA: null,
      PZ_TEMA_DESPUES: {},
      document: { getElementById: () => ({ innerHTML: '' }) },
      api: { get: async (url) => (url === '/api/weekly-consultas' ? consultas : fixtures[url]) },
      pzTemaPintar: () => {},
      esc: (s) => String(s == null ? '' : s),
      pzTemaT: (es) => es,
    };
    vm.createContext(sandbox);
    vm.runInContext(APP.slice(c, d) + '\n' + APP.slice(a, b), sandbox);
    await vm.runInContext('pzTemaCargar()', sandbox);
    return sandbox.PZ_TEMA;
  }
  (async () => {
    try {
      const inv = await cargarCon({ is_guest: 1, lang: 'en' }, fixtures['/api/weekly-consultas']);
      ok(!!inv && !inv.temas.some((t) => t.kind === 'lunes'), 'C1 el invitado NO recibe la pregunta de los lunes (prueba sin semana de consultas)');
      const reg = await cargarCon({ lang: 'es' }, fixtures['/api/weekly-consultas']);
      ok(!!reg && reg.temas.some((t) => t.kind === 'lunes' && t.week_key === '2026-11-09'), 'C2 el registrado SÍ la recibe si la semana sigue sin respuesta (sigue viva)');
      const resp = await cargarCon({ lang: 'es' }, { ok: true, rango: '1-5', week_key: '2026-11-09' });
      ok(!!resp && !resp.temas.some((t) => t.kind === 'lunes'), 'C3 respondida la semana, la pregunta no se repite');
    } catch (e) { ok(false, 'C1-C3 pzTemaCargar corre en VM', String(e && e.message)); }

    /* ── D · Las dos puertas de voz, intactas ── */
    seccion('D · las dos puertas de voz siguen en pie');
    {
      ok(APP.includes('pzSubirVozOp') && APP.includes('data-pz-voz-mic'), 'D1 puerta Subir: la tarjeta de voz y su micrófono siguen en app.js');
      ok(APP.includes('/api/chat/hilo') && APP.includes('pzVozCerrar') && APP.includes('pzVozMsg'), 'D2 puerta posteo: la tira de voz del posteo sigue en app.js');
      ok(SERVER.includes("app.get('/api/chat/hilo'") && SERVER.includes("app.post('/api/chat/hilo/log'"), 'D3 el hilo por posteo del server sigue intacto');
      ok(SERVER.includes("app.get('/api/weekly-consultas'") && APP.includes('pzTemaLunesBoxHTML') && APP.includes('La pregunta de los lunes'), 'D4 la pregunta de los lunes sigue viva (endpoint + caja + tarjeta)');
      ok(APP.includes('function subirView') && APP.includes('pzSubirVozOp'), 'D5 la vista Subir y su tarjeta de voz no perdieron piezas por este lote');
    }

    /* ── E · Boot smoke: lo servido es lo construido ── */
    seccion('E · boot smoke del servidor');
    if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); }
    else {
      const port = 35700 + Math.floor(Math.random() * 300);
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-nota-voz-'));
      const child = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (dd) => { out += dd; });
      child.stderr.on('data', (dd) => { out += dd; });
      try {
        const t0 = Date.now();
        let version = null;
        while (Date.now() - t0 < 90000) {
          try { const r = await fetch('http://127.0.0.1:' + port + '/api/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
          await new Promise((r) => setTimeout(r, 1500));
        }
        ok(!!version && !!version.build, 'E1 el servidor botea y /api/version responde', version || out.slice(-300));
        if (version) {
          const rApp = await fetch('http://127.0.0.1:' + port + '/app.js');
          const bundle = await rApp.text();
          ok(rApp.ok && !bundle.includes('pzNotaBtn') && !bundle.includes('Dejar una nota a Posty'), 'E2 el bundle servido ya no trae el campo de nota');
          ok(bundle.includes('chatMicSend') && bundle.includes('pzSubirVozOp'), 'E3 el bundle servido conserva las puertas de voz');
        }
      } finally {
        try { child.kill('SIGTERM'); } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
        try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
      }
    }

    console.log('\n════════════════════════════════════════════════════');
    console.log('LOTE NOTA-VOZ-ÚNICA-PUERTA: ' + pass + ' ok · ' + fail + ' MAL');
    if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
    process.exit(fail ? 1 : 0);
  })();
}
