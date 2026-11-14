// test-lote-auditoria-email.js
// LOTE AUDITORÍA-EN-EL-EMAIL — aprobada por Valentino (13/11 23:01,
// «dale, armemos la auditoría, y la incluimos en el email»; precisión
// del tablero con la carta v5, 13/11 23:06): cada email del fundador a
// un negocio lleva enlazada la auditoría del Instagram de ESE negocio,
// generada de su feed vivo con la misma lectura del fundamento.
//
// Qué prueba esta suite (contra fixtures de feed controlados, sin red):
//   · Cada hallazgo afirmado tiene su evidencia en los datos leídos.
//   · Un eje sin evidencia NO aparece (estrella presente / ritmo sano
//     → esos hallazgos no salen; la página sale con los que haya).
//   · El orden y las secciones exactos de la vara visual, sin la banda
//     de muestra de la pieza de ejemplo.
//   · El cierre es la única puerta a la prueba (carta v5): qué
//     haríamos nosotros → prueba de 3 días con precio y link.
//   · La sección 1 nombra LA MISMA estrella que nombra la carta
//     (payload.estrella, de la misma lectura).
//   · Sin feed suficiente (o sin línea de fan verificable) NO se
//     genera y el motivo queda declarado.
//   · La URL no es adivinable: token de 48 hex, token falso → 404,
//     admin gateado por ADMIN_TOKEN.
//   · Voz del fundador en todo el copy generado: sin rayas largas,
//     sin «Posty arma/hace» en tercera persona.
//
// Se corre desde la raíz del release:
//   DATA_DIR=$(mktemp -d) NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-auditoria-email.js
// Control contra la base v1029: PZ_ROOT=<base> (la pieza no existe
// ahí: no hay forma de producir la auditoría).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-audit-email-'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function seccion(s) { console.log('\n[' + s + ']'); }

const MOD_PATH = path.join(ROOT, 'email-audit.js');
if (!fs.existsSync(MOD_PATH)) {
  console.log('\nLOTE AUDITORÍA-EN-EL-EMAIL: la pieza NO existe en este árbol (control contra la base: sin email-audit.js no hay forma de producir la auditoría).');
  process.exit(1);
}
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const EA = require(MOD_PATH);

const NOW = Date.UTC(2026, 10, 13, 15, 0, 0); // 13/11/2026 15:00 UTC
const DAY = 86400;
const nowSec = Math.floor(NOW / 1000);
const post = (daysAgo, caption, likes, comments, type) => ({
  type: type || 'GraphImage',
  shortcode: 'FIX' + daysAgo,
  taken_at: nowSec - daysAgo * DAY,
  caption, likes, comments,
  thumb: null, pinned: null, video_duration: null,
});

/* Fixture A — el caso completo: estrella identificada que casi no
 * aparece, ritmo cortado, cero llamados a comprar. */
const PROFILE_A = { handle: 'ligre.arg', name: 'Ligre', bio: '', bio_unread: true, link: '', link_unread: true, followers: 4200, posts_count: 210, following: 300, is_verified: false, category: 'restaurant', pic: null };
const ITEMS_A = [
  { nombre: 'La Milanga', fuente: 'web-catalog' },
  { nombre: 'Zucchina', fuente: 'web-catalog' },
  { nombre: 'La Polpetta', fuente: 'web-catalog' },
];
const POSTS_A = [
  post(9, 'sábado de horno y mostrador lleno, así trabajamos acá', 40, 2),
  post(11, 'la zucchina recién salida, con el queso burbujeante', 25, 1),
  post(13, 'nuestra cocina a las siete de la mañana, antes de abrir', 18, 0),
  post(15, 'La Milanga con fritas, la que junta a todo el barrio', 900, 30),
  post(29, 'masa madre de todos los días, sin apuro', 22, 3),
  post(31, 'el equipo amasando antes de que salga el sol', 15, 0),
  post(33, 'una de la casa, con albahaca fresca del mercado', 12, 1),
  post(35, 'el mostrador del mediodía, como siempre', 9, 0),
  post(37, 'horno a leña y paciencia, la fórmula de siempre', 30, 2),
  post(39, 'la polpetta de la abuela en su salsa de domingo', 11, 0),
  post(41, 'cerramos el día con la última tanda del horno', 8, 0),
  post(45, 'primera foto de esta grilla, el local recién pintado', 6, 1),
];

/* Fixture C — estrella presente, ritmo sano, con llamados: solo queda
 * el eje de videos. La página sale con el hallazgo que hay. */
const POSTS_C = [];
for (let i = 0; i < 10; i++) {
  const menciona = i % 2 === 0; // 5 de 10 nombran a la estrella
  const conGancho = i < 6;
  POSTS_C.push(post(i, (conGancho ? '¿ya probaste esto? ' : '') + (menciona ? 'La Milanga de hoy salió tremenda' : 'el local a la tarde, tranquilo') + (i < 3 ? ', reservá tu mesa por whatsapp' : ''), 50 + i, 2));
}

/* Fixture E — hay hallazgo de ritmo pero NINGUNA señal positiva
 * verificable: no se genera (la línea de fan no se inventa). */
const POSTS_E = [
  post(60, 'foto del local un martes cualquiera', null, null),
  post(40, 'el mostrador vacío antes de abrir', null, null),
  post(20, 'una mesa puesta y nada más', null, null),
  post(5, 'la puerta del negocio de noche', null, null),
];

function vozLimpia(s, name) {
  ok(!/—/.test(s), name + ': sin rayas largas');
  ok(!/Posty (arma|hace|crea|genera|publica)\b/.test(s), name + ': sin trabajo atribuido a Posty en tercera persona');
}

(async () => {
  /* ── A · Cableado en server.js ── */
  seccion('A · cableado');
  {
    eq(SERVER.split("require('./email-audit')").length - 1, 1, 'A1 server.js requiere el módulo una sola vez');
    eq(SERVER.split("app.post('/api/admin/email-audit', requireAdminToken").length - 1, 1, 'A2 endpoint admin de generación, gateado');
    eq(SERVER.split("app.get('/a/:token'").length - 1, 1, 'A3 ruta pública de la página por token');
    ok(SERVER.includes('noindex, nofollow'), 'A4 la ruta manda noindex');
    eq(SERVER.split("app.get('/a/").length - 1, 1, 'A5 la única ruta /a/… es la del token (sin listado ni ruta por @)');
  }

  /* ── B · Fixture A: los tres ejes, con su evidencia ── */
  seccion('B · fixture A: estrella, ritmo y CTA con evidencia');
  let builtA = null;
  {
    builtA = EA.buildAudit({ profile: PROFILE_A, posts: POSTS_A, items: ITEMS_A, lang: 'es', paletteHues: null, now: NOW });
    ok(builtA.ok === true, 'B0 la auditoría se construye', builtA);
    if (builtA.ok) {
      eq(JSON.stringify(builtA.findings.map((f) => f.eje)), JSON.stringify(['estrella', 'ritmo', 'cta']), 'B1 los tres ejes, en el orden de la pieza');
      eq(builtA.evidence.estrella.estrella, 'La Milanga', 'B2 evidencia: la estrella es La Milanga (inferida del catálogo real)');
      eq(builtA.evidence.estrella.apariciones, 1, 'B3 evidencia: aparece en 1 posteo');
      eq(builtA.evidence.estrella.en_posteos, 12, 'B4 evidencia: sobre los últimos 12');
      eq(builtA.evidence.ritmo.dias_desde_ultimo, 9, 'B5 evidencia: 9 días desde el último posteo');
      eq(builtA.evidence.ritmo.racha_max_dias, 14, 'B6 evidencia: racha máxima de 14 días');
      eq(builtA.evidence.ritmo.posteos_por_semana, 2.3, 'B7 evidencia: 2.3 posteos por semana');
      eq(builtA.evidence.cta.con_llamado_pct, 0, 'B8 evidencia: 0% de captions con llamado');
      eq(builtA.evidence.cta.captions_revisados, 12, 'B9 evidencia: 12 captions revisados');
      eq(builtA.evidence.fan.tipo, 'estrella_mas_querida', 'B10 la línea de fan nombra a la estrella (la misma de la carta v5)');
      eq(builtA.evidence.fan.interacciones, 930, 'B11 evidencia del fan: 930 interacciones reales');
      ok(builtA.fan.text.includes('La Milanga'), 'B12 el texto de fan nombra a La Milanga');
      ok(builtA.findings[0].texto.includes('La Milanga') && builtA.findings[0].texto.includes('1 de tus últimos 12'), 'B13 el hallazgo estrella nombra la estrella y su conteo real');
      ok(builtA.findings[1].texto.includes('9 días') && builtA.findings[1].texto.includes('14 días'), 'B14 el hallazgo ritmo lleva sus números reales');
      eq(builtA.signals.estrella, 'La Milanga', 'B15 signals.estrella: la estrella de esta lectura para la plantilla de la carta');
      for (const f of builtA.findings) ok(!!builtA.evidence[f.eje], 'B16 evidencia guardada para el eje ' + f.eje);
      vozLimpia(JSON.stringify(builtA.findings) + builtA.fan.text, 'B17 voz en hallazgos y fan');
    }
  }

  /* ── C · Fixture C: el eje sin evidencia no aparece ── */
  seccion('C · fixture C: solo sale el hallazgo verificado');
  {
    const builtC = EA.buildAudit({ profile: PROFILE_A, posts: POSTS_C, items: ITEMS_A, lang: 'es', paletteHues: null, now: NOW });
    ok(builtC.ok === true, 'C0 se construye con los hallazgos que hay', builtC);
    if (builtC.ok) {
      eq(JSON.stringify(builtC.findings.map((f) => f.eje)), JSON.stringify(['videos']), 'C1 solo el eje verificado (videos): estrella presente y ritmo sano NO salen');
      const html = EA.renderAuditHtml({ handle: 'ligre.arg', lang: 'es', business_name: 'Ligre', fan: builtC.fan, findings: builtC.findings });
      ok(!html.includes('Tu estrella casi no aparece'), 'C2 la página no afirma el eje estrella sin evidencia');
      ok(!html.includes('El ritmo se corta'), 'C3 la página no afirma el eje ritmo sin evidencia');
    }
  }

  /* ── D · Sin datos suficientes no se genera; el motivo queda ── */
  seccion('D · negativas honestas');
  {
    eq(EA.buildAudit({ profile: PROFILE_A, posts: [], items: ITEMS_A, lang: 'es', now: NOW }).motivo, 'feed_sin_posteos', 'D1 feed sin posteos → motivo declarado');
    const builtE = EA.buildAudit({ profile: { handle: 'x', name: 'X', bio: '', bio_unread: true }, posts: POSTS_E, items: [], lang: 'es', paletteHues: null, now: NOW });
    eq(builtE.ok, false, 'D2 sin señal positiva verificable no se genera');
    eq(builtE.motivo, 'sin_linea_de_fan_verificada', 'D3 el motivo es la línea de fan (no se inventa un elogio)');
    const r1 = await EA.generateEmailAudit({ ig: 'ligre.arg' }, { data: { ok: false, error: 'x' } });
    eq(r1.motivo, 'instagram_no_leido', 'D4 Instagram no leído → motivo declarado');
    const r2 = await EA.generateEmailAudit({ ig: '!!!' }, {});
    eq(r2.motivo, 'arroba_invalida', 'D5 arroba inválida → motivo declarado');
  }

  /* ── E · Generación completa: persistencia, token, puente ── */
  seccion('E · generación, URL no adivinable y puente de la carta');
  let genA = null;
  {
    genA = await EA.generateEmailAudit({ ig: '@ligre.arg', domain: 'ligre.example', lang: 'es' }, { data: { ok: true, profile: PROFILE_A, posts: POSTS_A }, items: ITEMS_A, paletteHues: null, now: NOW });
    ok(genA.ok === true, 'E0 genera con la lectura inyectada', genA);
    if (genA.ok) {
      ok(/^\/a\/[a-f0-9]{48}$/.test(genA.url), 'E1 la URL es /a/ + 48 hex (no adivinable)', genA.url);
      eq(genA.payload.estrella, 'La Milanga', 'E2 el payload trae la estrella para el hueco de la carta');
      const back = EA.getByToken(genA.token);
      ok(!!back && back.business_name === 'Ligre' && back.findings.length === 3, 'E3 la auditoría persiste y se recupera por token, con su evidencia', back && back.evidence && Object.keys(back.evidence));
      ok(!!back.evidence && !!back.evidence.estrella && !!back.evidence.ritmo && !!back.evidence.cta && !!back.evidence.fan, 'E4 la evidencia quedó guardada junto a la auditoría');
      const genA2 = await EA.generateEmailAudit({ ig: 'ligre.arg', lang: 'es' }, { data: { ok: true, profile: PROFILE_A, posts: POSTS_A }, items: ITEMS_A, paletteHues: null, now: NOW });
      ok(genA2.ok && genA2.token !== genA.token, 'E5 cada generación tiene un token distinto');
    }
    eq(EA.getByToken('a'.repeat(48)), null, 'E6 token inexistente → null (la ruta da 404)');
    eq(EA.getByToken('basura'), null, 'E7 token con formato inválido → null');
    eq(EA.getByToken(''), null, 'E8 token vacío → null');
    eq(EA.auditBridgeText('es', 'https://postycommunitymanager.com/a/xyz'),
      'Te armamos una auditoría corta de tu cuenta y esto fue lo que vimos: https://postycommunitymanager.com/a/xyz. Todo esto lo podemos mejorar nosotros.',
      'E9 el puente ES es el textual de la carta v5 con el link llenado');
    eq(EA.auditBridgeText('en', 'https://postycommunitymanager.com/a/xyz'),
      "We put together a short audit of your account and here's what we saw: https://postycommunitymanager.com/a/xyz. All of this is stuff we can make better.",
      'E10 el puente EN es el espejo de la carta v5');
  }

  /* ── F · La página: orden, secciones y vara visual ── */
  seccion('F · render: orden fijo y vara visual');
  {
    const html = EA.renderAuditHtml(genA.payload);
    const idx = (s) => html.indexOf(s);
    ok(idx('Auditoría de tu Instagram') >= 0 && idx('Auditoría de tu Instagram') < idx('Primero, lo que nos gustó'), 'F1 kicker y título antes de las secciones');
    ok(idx('Primero, lo que nos gustó') < idx('Lo que vimos para mejorar'), 'F2 orden: primero lo que nos gustó');
    ok(idx('Lo que vimos para mejorar') < idx('Lo que haríamos nosotros'), 'F3 orden: hallazgos antes de lo que haríamos');
    ok(idx('Lo que haríamos nosotros') < idx('Probalo 3 días gratis con tu Instagram'), 'F4 orden: el cierre a la prueba va después de lo que haríamos (carta v5: es la única puerta)');
    ok(html.includes('https://postycommunitymanager.com/prueba'), 'F5 el cierre enlaza a /prueba');
    ok(html.includes('USD 199 por mes'), 'F6 el cierre lleva el precio');
    ok(html.includes('1. Tu estrella casi no aparece') && html.includes('2. El ritmo se corta') && html.includes('3. Ningún posteo invita a comprar'), 'F7 los tres hallazgos numerados y en orden');
    ok(html.includes('Hola, Ligre. Esto fue lo que vimos.'), 'F8 saluda al negocio por su nombre real');
    ok(html.includes('#2793C8') && html.includes('#FEC14D') && html.includes('#0A1E33'), 'F9 colores de marca de la vara visual');
    ok(html.includes('class="hariamos"') && html.includes('class="bien"') && html.includes('class="hallazgo"'), 'F10 estructura comparable a la muestra aprobada');
    ok(!html.includes('MUESTRA DE FORMATO'), 'F11 la auditoría real NO lleva la banda de muestra');
    ok(html.includes('<meta name="robots" content="noindex,nofollow">'), 'F12 noindex en la propia página');
    ok(html.includes('Valentino Caratini') && html.includes('Founder de Posty'), 'F13 firma del fundador');
    vozLimpia(html, 'F14 voz en la página entera');
    ok(html.includes('<img class="foto" src="/foto-equipo.jpg" alt="Valentino y Posty, espalda con espalda">'), 'F15 (carta v6) la foto aprobada del equipo va en la página, sobre la firma');
    ok(idx('USD 199 por mes') < idx('class="foto"') && idx('class="foto"') < idx('<p class="firma">'), 'F16 la foto queda entre el precio y la firma, como la muestra');
    ok(html.includes('img.foto { width:100%; border-radius:12px; margin:26px 0 14px; display:block; }'), 'F17 el estilo de la foto es el de la muestra');
  }

  /* ── G · Espejo EN ── */
  seccion('G · la página en inglés');
  {
    const builtEn = EA.buildAudit({ profile: PROFILE_A, posts: POSTS_A, items: ITEMS_A, lang: 'en', paletteHues: null, now: NOW });
    ok(builtEn.ok === true, 'G0 se construye en inglés', builtEn);
    if (builtEn.ok) {
      const htmlEn = EA.renderAuditHtml({ handle: 'ligre.arg', lang: 'en', business_name: 'Ligre', fan: builtEn.fan, findings: builtEn.findings });
      ok(htmlEn.includes('First, what we liked') && htmlEn.includes('What we would do') && htmlEn.includes('Try it free for 3 days'), 'G1 secciones en inglés');
      ok(htmlEn.includes('La Milanga'), 'G2 la estrella nombrada es la misma');
      ok(!htmlEn.includes('Tu estrella casi no aparece'), 'G3 sin títulos en español');
      vozLimpia(htmlEn, 'G4 voz en la página EN');
    }
  }

  /* ── H · HTTP: la página se sirve, el admin está gateado ── */
  seccion('H · HTTP de punta a punta');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); }
  else {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-audit-http-'));
    const dataDir = path.join(tmpRoot, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const fixturePath = path.join(tmpRoot, 'fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify({ profile: PROFILE_A, posts: POSTS_A, items: ITEMS_A, now: NOW }));
    const driverPath = path.join(tmpRoot, 'driver.js');
    fs.writeFileSync(driverPath, [
      'const fs = require("fs");',
      'const fx = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));',
      'const EA = require(process.argv[3]);',
      'EA.generateEmailAudit({ ig: "ligre.arg", domain: "ligre.example", lang: "es" }, { data: { ok: true, profile: fx.profile, posts: fx.posts }, items: fx.items, paletteHues: null, now: fx.now })',
      '  .then((r) => { console.log(JSON.stringify(r.ok ? { ok: true, token: r.token } : r)); })',
      '  .catch((e) => { console.log(JSON.stringify({ ok: false, error: String(e && e.message) })); });',
    ].join('\n'));
    const gen = await new Promise((resolve) => {
      const ch = spawn('node', [driverPath, fixturePath, MOD_PATH], { env: { ...process.env, DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '' } });
      let out = '';
      ch.stdout.on('data', (d) => { out += d; });
      ch.on('close', () => { try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch (e) { resolve({ ok: false, raw: out }); } });
    });
    ok(gen.ok === true && /^[a-f0-9]{48}$/.test(gen.token || ''), 'H0 la generación por proceso separado persiste en el DATA_DIR', gen);

    const port = 35800 + Math.floor(Math.random() * 200);
    const child = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin-token', NODE_PATH: process.env.NODE_PATH || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    try {
      const t0 = Date.now();
      let up = false;
      while (Date.now() - t0 < 90000) {
        try { const r = await fetch('http://127.0.0.1:' + port + '/api/version'); if (r.ok) { up = true; break; } } catch (e) {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      ok(up, 'H1 el servidor botea', out.slice(-200));
      if (up && gen.ok) {
        const page = await fetch('http://127.0.0.1:' + port + '/a/' + gen.token);
        const body = await page.text();
        eq(page.status, 200, 'H2 la página del token responde 200');
        ok((page.headers.get('x-robots-tag') || '').includes('noindex'), 'H3 header X-Robots-Tag noindex');
        ok(body.includes('Tu estrella casi no aparece') && body.includes('Primero, lo que nos gustó') && body.includes('Probalo 3 días gratis'), 'H4 la página servida es la auditoría generada');
        const nf = await fetch('http://127.0.0.1:' + port + '/a/' + 'b'.repeat(48));
        eq(nf.status, 404, 'H5 token inexistente → 404');
        const bad = await fetch('http://127.0.0.1:' + port + '/a/cualquier-cosa');
        eq(bad.status, 404, 'H6 slug adivinable → 404 (no hay URLs cortas ni por @)');
        const noGate = await fetch('http://127.0.0.1:' + port + '/api/admin/email-audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ig: 'ligre.arg' }) });
        eq(noGate.status, 403, 'H7 el endpoint admin sin token → 403');
        const gated = await fetch('http://127.0.0.1:' + port + '/api/admin/email-audit?token=test-admin-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ig: '!!!' }) });
        const gj = await gated.json().catch(() => null);
        ok(gated.status === 200 && gj && gj.ok === false && gj.motivo === 'arroba_invalida', 'H8 el endpoint admin con token responde con el contrato de motivos', gj);
        const foto = await fetch('http://127.0.0.1:' + port + '/foto-equipo.jpg');
        ok(foto.status === 200 && (foto.headers.get('content-type') || '').includes('image'), 'H9 la foto del equipo se sirve desde el sitio (la página la referencia)');
        const fotoBuf = Buffer.from(await foto.arrayBuffer());
        const crypto2 = require('crypto');
        eq(crypto2.createHash('md5').update(fotoBuf).digest('hex'), '9c9434f842969bee4541ec2f61638c98', 'H10 la foto servida es byte-idéntica a la aprobada de la carpeta de la carta');
      }
    } finally {
      try { child.kill('SIGTERM'); } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
    }
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('LOTE AUDITORÍA-EN-EL-EMAIL: ' + pass + ' ok · ' + fail + ' MAL');
  if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})();
