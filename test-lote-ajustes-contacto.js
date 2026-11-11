'use strict';
// test-lote-ajustes-contacto.js — LOTE AJUSTES-CONTACTO (base v879)
// Valentino 11/11 00:42: en Ajustes, un botón para contactarnos si algo
// no funciona o hay un problema. Hoy el cliente que se traba en silencio
// no tiene camino visible para avisar y se va; el botón es la vía de escape.
//
// Qué se construye:
//  - Fila visible en el menú de Ajustes (grupo «Más», fuera de Avanzado):
//    «¿Algo no funciona? Contactanos» + «Te ayudamos».
//  - Sección ajsec-contacto (mismo patrón que el resto de secciones):
//    subtítulo en una línea, un campo de texto y «Enviar». Nada de
//    formularios largos.
//  - POST /api/soporte/contacto (sesión, requireAuth): abre un caso de
//    soporte tipo 'ayuda' en support_cases (el mismo panel del equipo:
//    GET /api/admin/support/cases + overview), con el user_id del cliente
//    y su texto como detalle. Doble toque con el mismo texto NO duplica
//    el caso (dedup_key). Sin texto no se envía nada (400 texto_vacio).
//  - Confirmación en el acto: «Listo, ya nos llegó. Te escribimos en
//    breve.» (sin prometer horario). No toca el chat principal.
//  - Estampado: BUILD 20261105-v890; app.js cambia (CHUNK_V) así
//    que ?v=606 en el index ES (el EN no carga app.js); chunk-ajustes
//    se sirve con ?v=CHUNK_V. styles.css NO se toca (el .field textarea
//    ya está estilado): sin bump de styles?v=.
// Node puro: asserts estáticos + boot real por HTTP con DATA_DIR aislada.
// Puerto 34741. Uso: node test-lote-ajustes-contacto.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const DIR = __dirname;
const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const chunk = fs.readFileSync(path.join(DIR, 'public/chunk-ajustes.js'), 'utf8');
const idxES = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---------- 1. Estampado ----------
  t(srv.includes("const BUILD_ID = '20261105-v890';"), 'server: BUILD v890');
  t(cnt(srv, '20261105-v890') === 1, 'server: BUILD v890 ×1 (solo el estampado)');
  t(cnt(srv, '20261105-v880') === 0, 'server: sin restos del BUILD anterior (v880)');
  t(app.includes("const CHUNK_V = '20261105-v890';"), 'app: CHUNK_V v890');
  t(cnt(app, '20261105-v890') === 1, 'app: CHUNK_V v890 ×1');
  t(idxES.includes('/app.js?v=606'), 'index ES: app.js?v=606');
  t(!idxEN.includes('/app.js?v='), 'index EN: no carga app.js (sin ?v= que tocar)');
  t(idxES.includes('/styles.css?v=20261233') && idxEN.includes('/styles.css?v=20261233'), 'index ES+EN: styles?v=20261233 sin tocar (styles.css no cambia)');

  // ---------- 2. Endpoint servidor (estático) ----------
  const ep = srv.indexOf("app.post('/api/soporte/contacto'");
  t(ep !== -1, 'server: existe POST /api/soporte/contacto');
  const epNext = srv.indexOf("app.get('/api/posts/:id/quality'", ep);
  const epBody = (ep !== -1 && epNext > ep) ? srv.slice(ep, epNext) : '';
  t(epBody.includes('requireAuth'), 'endpoint: con requireAuth (sesión del cliente)');
  t(epBody.includes("tipo: 'ayuda'"), "endpoint: abre caso tipo 'ayuda'");
  t(epBody.includes('supportCases.openCase'), 'endpoint: usa supportCases.openCase (el panel del equipo)');
  t(epBody.includes('texto_vacio'), 'endpoint: sin texto → 400 texto_vacio');
  t(epBody.includes('dedupKey') && epBody.includes("dedupKey = 'contacto:'"), 'endpoint: dedup_key contacto:<uid>:<md5> (doble toque no duplica)');
  t(epBody.includes('.slice(0, 2000)'), 'endpoint: texto recortado a 2000');
  t(epBody.includes('siguientePaso') && epBody.includes('Responder al cliente'), 'endpoint: siguiente paso «Responder al cliente»');
  t(epBody.includes('Ayuda pedida desde Ajustes'), 'endpoint: título «Ayuda pedida desde Ajustes»');
  t(!epBody.includes('/api/admin/support/cases'), 'endpoint: el cliente NO usa la ruta admin (es ruta propia con sesión)');

  // ---------- 3. UI Ajustes (estático) ----------
  t(chunk.includes('data-ajnav="contacto"'), 'chunk: fila del menú data-ajnav="contacto"');
  t(chunk.includes('¿Algo no funciona? Contactanos'), 'chunk: fila «¿Algo no funciona? Contactanos»');
  t(chunk.includes('id="ajsec-contacto"'), 'chunk: sección ajsec-contacto');
  t(chunk.includes('Si algo no anda o tenés un problema, escribinos y te ayudamos.'), 'chunk: subtítulo en una línea');
  t(chunk.includes('id="s_contactoTexto"') && chunk.includes('<textarea'), 'chunk: campo de texto s_contactoTexto');
  t(chunk.includes('id="btnContactoEnviar"'), 'chunk: botón Enviar btnContactoEnviar');
  t(chunk.includes("api.post('/api/soporte/contacto'"), 'chunk: Enviar llama a POST /api/soporte/contacto');
  t(chunk.includes('Listo, ya nos llegó. Te escribimos en breve.'), 'chunk: confirmación en el acto sin prometer horario');
  t(chunk.includes('Contanos qué te pasa primero.'), 'chunk: sin texto no se envía (aviso en la UI)');
  t(chunk.includes("AJ_SECCIONES = ['notif', 'plan', 'auto', 'conex', 'marca', 'pagina', 'contacto', 'avanzado']"), 'chunk: contacto en AJ_SECCIONES');
  t(chunk.includes("q.get('contacto') ? 'contacto'"), 'chunk: deep-link ?contacto=1 en ajInitSec');
  t(chunk.includes("if (pq.get('contacto')) return 'contacto';"), 'chunk: deep-link ?contacto=1 en ajDeepSec');
  // La fila vive en el menú principal (grupo «Más»), NO dentro de Avanzado.
  const menuIdx = chunk.indexOf('id="ajMenu"');
  const advIdx = chunk.indexOf('id="ajsec-avanzado"');
  const rowIdx = chunk.indexOf('data-ajnav="contacto"');
  t(menuIdx !== -1 && rowIdx > menuIdx, 'chunk: la fila está en el menú principal');
  t(advIdx !== -1 && rowIdx < advIdx, 'chunk: la fila está ANTES de Configuración avanzada (no dentro)');
  const secIdx = chunk.indexOf('id="ajsec-contacto"');
  t(secIdx !== -1 && secIdx < chunk.indexOf('id="ajsec-avanzado"'), 'chunk: la sección está antes de Avanzado (no dentro)');
  // EN (el cliente en inglés ve lo mismo).
  t(chunk.includes('Something not working? Contact us'), 'chunk EN: título «Something not working? Contact us»');
  t(chunk.includes('Done, we got it. We will write to you soon.'), 'chunk EN: confirmación en inglés');
  // Sin CSS nuevo: el textarea ya se estila con .field textarea.
  t(css.includes('.field textarea{resize:vertical;min-height:110px'), 'css: .field textarea ya estilado (sin cambios de CSS en el lote)');

  // ---------- 4b. Render real de ajustesView en VM ----------
  // El node --check no evalúa el template: un ${} roto solo se ve al
  // renderizar. Mismo stub que test-lote-ajustes-carpetas.js (sección 8).
  {
    const vm = require('vm');
    const aStart = chunk.indexOf('function ajustesView() {');
    const aEnd = chunk.indexOf('// TikTok semanal', aStart);
    t(aStart !== -1 && aEnd > aStart, 'vm: ajustesView extraíble del chunk');
    const viewSrc = chunk.slice(aStart, aEnd);
    const renderVm = (hash, lang) => {
      const sandbox = {
        console, URLSearchParams, IS_NATIVE: false,
        location: { hash: hash || '#/app/ajustes' },
        ME: { lang: lang || 'es', plan: 'posty', is_trial: false },
        PROFILE: { ig_username: 'test', ig_connected: true, business_name: 'Test', category: 'otro', tone: '', goal: '', monthly_goal: '', description: '', page_slug: 'test', whatsapp: '', page_enabled: 1 },
        SETTINGS: { ig_token_warning: false, timezone: 'America/New_York', demo_mode: false },
        pzIc: () => '', esc: (v) => String(v == null ? '' : v),
        brandColors: () => [], assetLogo: () => null, igSince: () => '',
        IG_VERIFIED_AT: '', IG_MODE_WARN: false,
        CATS: [], catSel: () => 'otro', catCustom: () => '',
        TONES: [], GOALS: [], TIMEZONES: [],
        NEUTRAL_TRIO: ['#111111', '#222222', '#333333'],
      };
      vm.createContext(sandbox);
      vm.runInContext(viewSrc + '\nthis.__html = ajustesView();', sandbox);
      return sandbox.__html;
    };
    for (const lang of ['es', 'en']) {
      const html = renderVm('#/app/ajustes', lang);
      t(html.indexOf('<div id="ajMenu">') !== -1, 'vm ' + lang + ': menú visible');
      t(html.indexOf('data-ajnav="contacto"') !== -1, 'vm ' + lang + ': fila contacto en el menú');
      const pPag = html.indexOf('data-ajnav="pagina"');
      const pCon = html.indexOf('data-ajnav="contacto"');
      const pAv = html.indexOf('data-ajnav="avanzado"');
      t(pPag !== -1 && pCon > pPag && pAv > pCon, 'vm ' + lang + ': contacto entre Tu página y Avanzado');
      t(html.indexOf('id="ajsec-contacto"') !== -1, 'vm ' + lang + ': sección ajsec-contacto presente');
      t(html.indexOf('id="s_contactoTexto"') !== -1, 'vm ' + lang + ': textarea presente');
      t(html.indexOf('id="btnContactoEnviar"') !== -1, 'vm ' + lang + ': botón Enviar presente');
      t(html.indexOf('id="contactoOk"') !== -1, 'vm ' + lang + ': caja de confirmación presente');
      const htmlCon = renderVm('#/app/ajustes?contacto=1', lang);
      t(htmlCon.indexOf('<div id="ajMenu" hidden>') !== -1, 'vm ' + lang + ' ?contacto=1: menú oculto');
      t(htmlCon.indexOf('<div id="ajDetail">') !== -1, 'vm ' + lang + ' ?contacto=1: detalle visible');
      t(htmlCon.indexOf('<div class="card ajsec ajflat" id="ajsec-contacto">') !== -1, 'vm ' + lang + ' ?contacto=1: Contactanos visible sin hidden');
      t(htmlCon.indexOf('<div class="card ajsec ajflat" hidden id="ajsec-notif">') !== -1, 'vm ' + lang + ' ?contacto=1: resto oculto');
    }
  }

  // ---------- 5. Boot real ----------
  let booted = false;
  try { require.resolve('express'); booted = true; } catch (e) {
    if (!process.env.VCONTACTO_BOOTSTRAPPED) {
      const { spawnSync } = require('child_process');
      const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
        stdio: 'inherit',
        env: { ...process.env, NODE_PATH: '/home/hatch/workspace/posta/node_modules', VCONTACTO_BOOTSTRAPPED: '1' },
      });
      process.exit(r.status == null ? 1 : r.status);
    }
  }
  if (booted) {
    const { spawn } = require('child_process');
    const { DatabaseSync } = require('node:sqlite');
    const PORT = 34741;
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-ajustes-contacto-'));
    const TEST_KEY = 'boot-test-key-ajustes-contacto';
    const ADMIN_TOKEN = 'test-admin-token-ajustes-contacto';
    const env = { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN, SESSION_SECRET: 'test', NODE_PATH: '/home/hatch/workspace/posta/node_modules', TRIAL_TEST_KEY: TEST_KEY };
    delete env.OPENAI_API_KEY; delete env.RESEND_API_KEY;
    const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: 'ignore' });
    const BASE = 'http://127.0.0.1:' + PORT;
    const dbPath = path.join(TMP, 'posta.db');
    const dbRead = (sql, ...args) => {
      for (let i = 0; i < 10; i++) {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        try { return db.prepare(sql).get(...args); }
        catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { try { db.close(); } catch (_) {} Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
        finally { try { db.close(); } catch (_) {} }
      }
    };
    const dbAll = (sql, ...args) => {
      for (let i = 0; i < 10; i++) {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        try { return db.prepare(sql).all(...args); }
        catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { try { db.close(); } catch (_) {} Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
        finally { try { db.close(); } catch (_) {} }
      }
    };
    async function reqJson(method, p, body, cookie, timeoutMs) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || 30000) });
      let j = null; try { j = await r.json(); } catch (e) { j = null; }
      return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
    }
    try {
      let up = false;
      for (let i = 0; i < 90; i++) {
        try { const r = await fetch(BASE + '/api/version'); if (r.ok) { up = true; break; } } catch (e) {}
        await sleep(1000);
      }
      t(up, 'boot: el servidor levanta en ' + PORT);
      if (!up) throw new Error('no levanta');
      const ver = await reqJson('GET', '/api/version');
      t(ver.status === 200 && ver.json && ver.json.build === '20261105-v890', 'boot: /api/version trae el BUILD v890', JSON.stringify(ver.json));
      const idx = await (await fetch(BASE + '/')).text();
      t(idx.includes('/app.js?v=606'), 'boot: el index servido trae app.js?v=606');
      const appSrv = await (await fetch(BASE + '/app.js?v=606')).text();
      t(appSrv.includes("const CHUNK_V = '20261105-v890';"), 'boot: el bundle servido trae CHUNK_V v890');
      const chunkSrv = await (await fetch(BASE + '/chunk-ajustes.js?v=20261105-v890')).text();
      t(chunkSrv.includes('id="ajsec-contacto"') && chunkSrv.includes('btnContactoEnviar'), 'boot: el chunk servido trae la sección Contactanos');
      t(chunkSrv.includes('¿Algo no funciona? Contactanos'), 'boot: el chunk servido trae la fila del menú');

      // Usuario de prueba con sesión (join de prueba).
      const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'contacto-a', device: 'test-device-contacto-a' });
      t(join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, 'boot: join ok', JSON.stringify(join.json));
      if (!join.json || !join.json.user_id) throw new Error('sin join');
      const uid = join.json.user_id;
      const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';
      t(!!cookie, 'boot: la sesión trae cookie');

      // Sin sesión → 401. Sin texto → 400.
      const noAuth = await reqJson('POST', '/api/soporte/contacto', { texto: 'hola' });
      t(noAuth.status === 401, 'boot: sin sesión → 401', String(noAuth.status));
      const vacio = await reqJson('POST', '/api/soporte/contacto', { texto: '   ' }, cookie);
      t(vacio.status === 400 && vacio.json && vacio.json.error === 'texto_vacio', 'boot: texto vacío → 400 texto_vacio', JSON.stringify(vacio.json));
      const vacio2 = await reqJson('POST', '/api/soporte/contacto', {}, cookie);
      t(vacio2.status === 400 && vacio2.json && vacio2.json.error === 'texto_vacio', 'boot: sin campo texto → 400 texto_vacio');

      // Envío real → caso de soporte tipo ayuda con el contexto del cliente.
      const texto1 = 'No me carga la foto del posteo de hoy, queda en blanco.';
      const r1 = await reqJson('POST', '/api/soporte/contacto', { texto: texto1 }, cookie);
      t(r1.status === 200 && r1.json && r1.json.ok === true && r1.json.caso_id > 0, 'boot: envío ok con caso_id', JSON.stringify(r1.json));
      const caso1 = dbRead('SELECT * FROM support_cases WHERE id = ?', r1.json.caso_id);
      t(!!caso1, 'boot: el caso existe en support_cases');
      t(caso1 && caso1.user_id === uid, 'boot: el caso lleva el user_id del cliente', caso1 && String(caso1.user_id));
      t(caso1 && caso1.tipo === 'ayuda', 'boot: el caso es tipo ayuda', caso1 && caso1.tipo);
      t(caso1 && caso1.titulo === 'Ayuda pedida desde Ajustes', 'boot: título del caso', caso1 && caso1.titulo);
      t(caso1 && caso1.detalle === texto1, 'boot: el detalle es el texto del cliente');
      t(caso1 && caso1.estado === 'abierto', 'boot: el caso queda abierto');
      t(caso1 && caso1.siguiente_paso === 'Responder al cliente', 'boot: siguiente paso «Responder al cliente»');
      t(caso1 && String(caso1.dedup_key || '').indexOf('contacto:' + uid + ':') === 0, 'boot: dedup_key contacto:<uid>:<md5>');

      // Doble toque con el mismo texto → el MISMO caso, sin duplicar.
      const r1b = await reqJson('POST', '/api/soporte/contacto', { texto: texto1 }, cookie);
      t(r1b.status === 200 && r1b.json && r1b.json.caso_id === r1.json.caso_id && r1b.json.duplicado === true, 'boot: doble envío mismo texto → mismo caso (duplicado)', JSON.stringify(r1b.json));
      const count1 = dbRead('SELECT COUNT(*) AS n FROM support_cases WHERE user_id = ?', uid);
      t(count1 && count1.n === 1, 'boot: sigue habiendo 1 solo caso tras el doble toque', JSON.stringify(count1));

      // Otro texto → segundo caso (no se come los mensajes distintos).
      const texto2 = 'La app se cierra cuando toco Impulsar.';
      const r2 = await reqJson('POST', '/api/soporte/contacto', { texto: texto2 }, cookie);
      t(r2.status === 200 && r2.json && r2.json.caso_id > 0 && r2.json.caso_id !== r1.json.caso_id, 'boot: otro texto → caso nuevo', JSON.stringify(r2.json));
      const count2 = dbRead('SELECT COUNT(*) AS n FROM support_cases WHERE user_id = ?', uid);
      t(count2 && count2.n === 2, 'boot: ahora hay 2 casos', JSON.stringify(count2));

      // Texto largo → se recorta a 2000 sin romper.
      const largo = 'x'.repeat(2500);
      const r3 = await reqJson('POST', '/api/soporte/contacto', { texto: largo }, cookie);
      t(r3.status === 200 && r3.json && r3.json.ok === true, 'boot: texto de 2500 caracteres → 200', JSON.stringify(r3.json));
      const caso3 = dbRead('SELECT * FROM support_cases WHERE id = ?', r3.json.caso_id);
      t(caso3 && caso3.detalle.length === 2000, 'boot: el detalle se recorta a 2000', caso3 && String(caso3.detalle.length));

      // El equipo lo ve en su consola (misma cola de casos de soporte).
      const lista = await reqJson('GET', '/api/admin/support/cases?user_id=' + uid + '&token=' + ADMIN_TOKEN);
      t(lista.status === 200 && lista.json && Array.isArray(lista.json.casos) && lista.json.casos.length === 3, 'boot: admin ve los 3 casos del cliente', JSON.stringify((lista.json || {}).casos && lista.json.casos.length));
      t(lista.json && lista.json.casos.every((c) => c.tipo === 'ayuda' && c.estado === 'abierto'), 'boot: los casos en la consola son tipo ayuda y abiertos');
      const over = await reqJson('GET', '/api/admin/support/overview?token=' + ADMIN_TOKEN);
      t(over.status === 200 && over.json && over.json.ok === true, 'boot: overview del panel de soporte ok');
    } finally {
      try { child.kill('SIGTERM'); } catch (e) {}
    }
  }

  console.log('\ntest-lote-ajustes-contacto: ' + ok + ' ok, ' + bad + ' mal');
  console.log('md5 server.js: ' + md5(srv));
  console.log('md5 app.js: ' + md5(app));
  console.log('md5 chunk-ajustes.js: ' + md5(chunk));
  console.log('md5 index.html: ' + md5(idxES));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
