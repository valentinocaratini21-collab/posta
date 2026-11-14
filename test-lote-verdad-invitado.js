'use strict';
/* test-lote-verdad-invitado.js — LOTE VERDAD-INVITADO (Blind Barber P7+P8).
 * Corrida Blind Barber (13/11, guest 101, posteos 674/675): dos
 * defectos de verdad para el invitado sin Instagram conectado:
 *  P7 — «sale solo» global falso: la burbuja de Inicio cerraba con
 *       «Tu semana ya está aprobada. Posty se ocupa de publicarla.»
 *       (y su variante «salen solos a su hora») sin mirar
 *       ig_connected, y el explicador pzPubInfoHTML era texto
 *       estático de piloto automático. La guarda del lote:
 *       ig_connected es entrada obligada de toda superficie que
 *       afirma «sale solo» para el invitado — burbuja, explicador,
 *       línea de semana aprobada, cuenta «sale en …» y la fila del
 *       posteo del día en Nivel — con variante honesta ES/EN (los
 *       posteos quedan listos acá; sin conexión no sale ninguno).
 *  P8 — la tarjeta de HOY del invitado con día vacío lo mandaba al
 *       chat («contale a Posty en el chat» + «Abrir el chat») en
 *       pzHoyTiraDetalleHTML, su gemela pzHoySemanaMiniHTML y la
 *       burbuja sin semana. v1025 las dejó así A PROPÓSITO para el
 *       invitado; este lote lo supera: los caminos vivos son los del
 *       registrado — «Que Posty lo arme» (POST /api/week/ensure
 *       {armar:1}, que corre con sesión guest: verificado con boot
 *       en la sección C) y «Subir algo mío».
 * La guarda nueva es de invitado (ME.is_guest) con
 * PROFILE.ig_connected falso; registrado e invitado conectado
 * conservan sus textos byte a byte (se pinea).
 * Uso: node test-lote-verdad-invitado.js   (sale 0 si todo pasa)
 *   VI_TREE=<dir>  árbol a probar (por defecto, este directorio).
 *   Contra la base sin el lote, las secciones 0/A/B fallan
 *   reproduciendo los dos defectos (control).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.env.VI_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; console.log('  ✓', name); }
  else { badN++; console.log('  ✗', name, extra ? String(extra).slice(0, 300) : ''); }
};
const seccion = (s) => console.log('\n— ' + s);

// ---------- Extracción de funciones reales ----------
function extractFunc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = src.indexOf('{', i);
  let d = 0, k = j;
  while (k < src.length) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) break; }
    k++;
  }
  return d === 0 ? src.slice(i, k + 1) : '';
}

// ---------- §0: estáticos ----------
seccion('§0 · estáticos del bundle');
t(!APP.includes('contale a Posty en el chat'), '§0: «contale a Posty en el chat» ×0 en app.js');
t(!APP.includes('Contame qué tenés para mostrar'), '§0: «Contame qué tenés para mostrar» ×0 en app.js');
t(!APP.includes('tell Posty in the chat'), '§0: «tell Posty in the chat» ×0 en app.js');
t(!APP.includes('Tell me what you have to show'), '§0: «Tell me what you have to show» ×0 en app.js');
const srcTira = extractFunc(APP, 'pzHoyTiraDetalleHTML');
const srcMini = extractFunc(APP, 'pzHoySemanaMiniHTML');
const srcSpeech = extractFunc(APP, 'pzHoySpeechHTML');
const srcPub = extractFunc(APP, 'pzPubInfoHTML');
const srcAprob = extractFunc(APP, 'pzSemanaAprobadaHTML');
const srcCuenta = extractFunc(APP, 'pzHoyCuentaSaleTxt');
const srcNivel = extractFunc(APP, 'pzNivelHoyHTML');
t(!!srcTira && !srcTira.includes('data-pz-hoy-chat') && srcTira.includes('data-pz-hoy-armar') && srcTira.includes('data-pz-hoy-subir'),
  '§0: pzHoyTiraDetalleHTML sin botón al chat; con armar + subir');
t(!!srcMini && !srcMini.includes('data-pz-hoy-chat') && srcMini.includes('data-pz-hoy-armar'),
  '§0: pzHoySemanaMiniHTML sin botón al chat; con armar');
t(!!srcSpeech && srcSpeech.includes('invSinIg'), '§0: pzHoySpeechHTML lleva la guarda invSinIg');
t(!!srcPub && srcPub.includes('invSinIg'), '§0: pzPubInfoHTML lleva la guarda invSinIg');
t(!!srcAprob && srcAprob.includes('invSinIg'), '§0: pzSemanaAprobadaHTML lleva la guarda invSinIg');
t(!!srcCuenta && srcCuenta.includes('pzIsGuest') && srcCuenta.includes('ig_connected'),
  '§0: pzHoyCuentaSaleTxt lleva la guarda de invitado sin conexión');
t(!!srcNivel && srcNivel.includes('detDia') && srcNivel.includes('invSinIgNivel'),
  '§0: pzNivelHoyHTML lleva el detalle honesto del posteo del día (detDia)');
t(APP.includes('[data-pz-hoy-armar]') && APP.includes('pzHoyArmarHoy'),
  '§0: el cableado de «Que Posty lo arme» (pzHoyArmarHoy + binder) sigue en pie');

// ---------- §A: VM con las funciones reales ----------
seccion('§A · VM: superficies del invitado con las funciones reales');
const sb = {
  console, Math, JSON, Intl, Date, Map, Set,
  setTimeout: () => 0, clearTimeout: () => {},
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (p) => p,
  pzIc: () => '',
  pcParseDate: (s0) => { const s = String(s0 || '').replace(' ', 'T'); if (!s) return null; const x = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'; const d = new Date(x); return isNaN(d) ? null : d; },
  pzRitualCuentaTxt: () => ({ faltan: '5 h 00 min' }),
  ME: { lang: 'es', is_guest: true },
  PROFILE: { ig_connected: false },
};
vm.createContext(sb);
const FUNCS = ['pzIsGuest', 'pzIsPubReal', 'pzHoySpeechHTML', 'pzHoyTiraDetalleHTML',
  'pzHoySemanaMiniHTML', 'pzPubInfoHTML', 'pzSemanaAprobadaHTML', 'pzHoyCuentaSaleTxt', 'pzNivelHoyHTML', 'pzNivelReelSemana'];
let vmOk = true;
for (const f of FUNCS) {
  const code = extractFunc(APP, f);
  if (!code) { t(false, '§A: falta function ' + f); vmOk = false; continue; }
  try { vm.runInContext(code, sb); } catch (e) { t(false, '§A: ' + f + ' no corre en VM', e.message); vmOk = false; }
}
try { vm.runInContext("var PZ_HOY_POST_ID = ''; var PZ_HOY_MEJOR = null;", sb); } catch (e) {}
const setUser = (guest, ig) => { sb.ME = { lang: 'es', is_guest: !!guest }; sb.PROFILE = { ig_connected: !!ig }; };
const speech = (o) => sb.pzHoySpeechHTML(Object.assign({ en: false, tz: 'America/New_York' }, o || {}));

if (vmOk) {
  // — Burbuja (P7 + P8) —
  setUser(true, false);
  const sPend = speech({ hoyPost: null, pendientes: 3, haySemana: true, manual: false, needOK: 0, schedSolo: 3 });
  t(sPend.includes('sin conexión no sale ninguno') && !sPend.includes('salen solos a su hora'),
    'A1 burbuja invitado sin IG, semana armada: honesta (no «salen solos»)', sPend);
  const sSem = speech({ hoyPost: null, pendientes: 0, haySemana: true });
  t(sSem.includes('Para que salga en tu Instagram, conectalo') && !sSem.includes('se ocupa de publicarla'),
    'A2 burbuja invitado sin IG, haySemana: honesta (no «se ocupa de publicarla»)', sSem);
  const sVacia = speech({ hoyPost: null, pendientes: 0, haySemana: false });
  t(sVacia.includes('Posty la arma con lo que ya publicás') && sVacia.includes('data-pz-hoy-armar') && !sVacia.includes('data-pz-hoy-chat'),
    'A3 burbuja invitado sin semana: arma (ensure), no manda al chat', sVacia);
  const sVaciaEn = sb.pzHoySpeechHTML({ en: true, tz: 'America/New_York', hoyPost: null, pendientes: 0, haySemana: false });
  t(sVaciaEn.includes('Posty builds it from what you already post') && sVaciaEn.includes('data-pz-hoy-armar'),
    'A3b burbuja invitado sin semana EN: espejo', sVaciaEn);
  setUser(true, true);
  const sPendOk = speech({ hoyPost: null, pendientes: 3, haySemana: true, manual: false, needOK: 0, schedSolo: 3 });
  t(sPendOk.includes('los posteos salen solos a su hora'), 'A4 burbuja invitado CON IG: el texto de siempre', sPendOk);
  const sSemOk = speech({ hoyPost: null, pendientes: 0, haySemana: true });
  t(sSemOk.includes('Tu semana ya está aprobada. Posty se ocupa de publicarla.'), 'A5 burbuja invitado CON IG, haySemana: intacta', sSemOk);
  setUser(false, false);
  const sSemReg = speech({ hoyPost: null, pendientes: 0, haySemana: true });
  t(sSemReg.includes('Tu semana ya está aprobada. Posty se ocupa de publicarla.'),
    'A6 burbuja registrado sin IG: intacta (la guarda es del invitado)', sSemReg);
  const sVaciaReg = speech({ hoyPost: null, pendientes: 0, haySemana: false });
  t(sVaciaReg.includes('data-pz-hoy-armar') && sVaciaReg.includes('Posty la arma con lo que ya publicás'),
    'A7 burbuja registrado sin semana: intacta (arma)', sVaciaReg);

  // — Tarjeta de HOY y mini (P8) —
  const diaVacio = { idx: 0, esHoy: true, esManana: false, esPasado: false, revelado: true, post: null, key: '2026-11-09' };
  setUser(true, false);
  const tira = sb.pzHoyTiraDetalleHTML(diaVacio, { en: false, tz: 'America/New_York', hoyKey: '2026-11-09' });
  t(tira.includes('data-pz-hoy-armar') && tira.includes('data-pz-hoy-subir') && !tira.includes('data-pz-hoy-chat') && tira.includes('Posty te lo arma, o subí algo tuyo'),
    'B1 tarjeta de hoy vacía del invitado: armar + subir, sin chat', tira);
  const tiraEn = sb.pzHoyTiraDetalleHTML(diaVacio, { en: true, tz: 'America/New_York', hoyKey: '2026-11-09' });
  t(tiraEn.includes('data-pz-hoy-armar') && !tiraEn.includes('Open the chat'), 'B1b tarjeta de hoy vacía EN: espejo', tiraEn);
  setUser(false, false);
  const tiraReg = sb.pzHoyTiraDetalleHTML(diaVacio, { en: false, tz: 'America/New_York', hoyKey: '2026-11-09' });
  t(tiraReg === tira.replace('Posty te lo arma', 'Posty te lo arma') && tiraReg.includes('data-pz-hoy-armar'),
    'B2 tarjeta de hoy vacía del registrado: el mismo HTML que la del invitado', tiraReg);
  const sem0 = { n: 0, dias: [{ estado: 'hoy' }, { estado: 'fut' }, { estado: 'fut' }, { estado: 'fut' }, { estado: 'fut' }, { estado: 'fut' }, { estado: 'fut' }] };
  setUser(true, false);
  const mini = sb.pzHoySemanaMiniHTML(sem0, false, 0);
  t(mini.includes('que lo arme Posty') && mini.includes('data-pz-hoy-armar') && !mini.includes('data-pz-hoy-chat') && !mini.includes('contale'),
    'B3 mini sin semana del invitado: «Que Posty lo arme», sin chat', mini);
  const sem5 = { n: 5, dias: [{ estado: 'pub' }, { estado: 'pub' }, { estado: 'pub' }, { estado: 'pub' }, { estado: 'pub' }, { estado: 'fut' }, { estado: 'fut' }] };
  const mini5 = sb.pzHoySemanaMiniHTML(sem5, false, 2);
  t(mini5.includes('Los próximos están en tu feed'), 'B4 mini con próximos: rama intacta', mini5);

  // — Explicador «i» (P7) —
  setUser(true, false);
  const pub0 = sb.pzPubInfoHTML(false);
  t(pub0.includes('Sin Instagram conectado, no sale ninguno') && !pub0.includes('Posty publica solo tus posteos programados'),
    'C1 explicador invitado sin IG: honesto, sin piloto automático afirmado', pub0);
  const pub0En = sb.pzPubInfoHTML(true);
  t(pub0En.includes('none of them goes out') && !pub0En.includes('publishes your scheduled posts on its own'),
    'C1b explicador invitado sin IG EN: espejo', pub0En);
  setUser(true, true);
  const pub1 = sb.pzPubInfoHTML(false);
  t(pub1.includes('Posty publica solo tus posteos programados (piloto automático).'), 'C2 explicador invitado CON IG: intacto', pub1);
  setUser(false, false);
  const pubReg = sb.pzPubInfoHTML(false);
  t(pubReg.includes('Posty publica solo tus posteos programados (piloto automático).'),
    'C3 explicador registrado: intacto', pubReg);

  // — Línea de semana aprobada (P7) —
  setUser(true, false);
  const ap0 = sb.pzSemanaAprobadaHTML(false);
  t(ap0.includes('sin conexión no se publica') && !ap0.includes('se ocupa de publicarla'),
    'D1 línea semana aprobada, invitado sin IG: honesta', ap0);
  setUser(true, true);
  const ap1 = sb.pzSemanaAprobadaHTML(false);
  t(ap1.includes('Tu semana está aprobada. Posty se ocupa de publicarla.'), 'D2 línea semana aprobada, invitado CON IG: intacta', ap1);

  // — Cuenta «sale en …» (P7) —
  const futuro = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
  setUser(true, false);
  t(sb.pzHoyCuentaSaleTxt(futuro, false) === '', 'E1 cuenta del invitado sin IG: no afirma la salida');
  setUser(true, true);
  t(sb.pzHoyCuentaSaleTxt(futuro, false).includes('sale en'), 'E2 cuenta del invitado CON IG: la de siempre');
  setUser(false, false);
  t(sb.pzHoyCuentaSaleTxt(futuro, false).includes('sale en'), 'E3 cuenta del registrado: intacta (guarda del invitado)');

  // — Nivel: fila del posteo del día (P7) —
  setUser(true, false);
  const niv0 = sb.pzNivelHoyHTML({ mission: null, ritualHoy: {}, posts: [], assets: [], comments: [] });
  t(niv0.includes('Sale a su hora cuando conectes tu Instagram') && !niv0.includes('Se publica solo hoy'),
    'F1 Nivel invitado sin IG: la fila del día no afirma que se publica solo', niv0.slice(0, 200));
  setUser(false, false);
  const nivReg = sb.pzNivelHoyHTML({ mission: null, ritualHoy: {}, posts: [], assets: [], comments: [] });
  t(nivReg.includes('Se publica solo hoy. Automático.'), 'F2 Nivel registrado: la fila intacta', nivReg.slice(0, 200));
}

// ---------- §C: boot — el ensure corre con sesión guest ----------
seccion('§C · boot: POST /api/week/ensure con sesión de invitado');
const PORT = 35131;
const BASEu = `http://127.0.0.1:${PORT}`;
const TRIAL_TEST_KEY = 'test-vi-suite';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-verdad-invitado-'));
function imgDataUri() {
  const buf = fs.readFileSync(path.join(TREE, 'public', 'siembra-nails', 'tira-nails-1.jpg'));
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}
function payloadFor(ig) {
  const img = imgDataUri();
  const caps = [
    'Esplar sneakers, handcrafted with organic cotton and wild rubber from the Amazon rainforest, made to last for years of daily wear.',
    'Our Esplar line pairs chrome-free leather with a recycled lining: a quiet design that goes with everything you already own.',
    'Small steps, honest materials. The Esplar is stitched by people who sign their work, in sizes for the whole family.',
  ];
  const posts = caps.map((caption, i) => ({
    type: 'image', image: img, caption, hashtags: '#vi #suite',
    headline: ['Uno', 'Dos', 'Tres'][i], style: 'foto', style_name: 'foto', text_mode: 'text',
  }));
  let ENGINE = 'v1';
  try { ENGINE = require(path.join(TREE, 'demo')).DEMO_ENGINE_V; } catch (e) {}
  return {
    ok: true, engine: ENGINE, lang: 'en', business: 'VI Suite', ig, category: 'sneakers',
    posts,
    design: { posts: posts.map((pp) => ({ headline: pp.headline, style: 'foto', kind: 'foto' })) },
    digest: { business: 'VI Suite', productos: [{ nombre: 'Esplar' }], servicios: [], ciudad: '' },
    content_lang: 'en',
  };
}
function cookieOf(res) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return sc.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  const srv = spawn('node', ['server.js'], {
    cwd: TREE,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-vi', SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(BASEu + '/api/version'); if (r.ok) up = true; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'G0 server booteó', log.slice(-300));
    if (!up) return;

    const dbPath = path.join(tmpDir, 'posta.db');
    const seedDb = new DatabaseSync(dbPath);
    seedDb.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('invitadovi', JSON.stringify(payloadFor('invitadovi')), Date.now());
    seedDb.close();

    const rG = await fetch(BASEu + '/api/guest/start?test_key=' + TRIAL_TEST_KEY, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ig: 'invitadovi', lang: 'en' }),
    });
    const jG = await rG.json().catch(() => ({}));
    t(rG.status === 200 && !!cookieOf(rG), 'G1 guest/start ok (sesión de invitado creada)', JSON.stringify(jG).slice(0, 200));
    const cookie = cookieOf(rG);
    const db = new DatabaseSync(dbPath);
    const gUser = db.prepare('SELECT id, is_guest FROM users WHERE guest_ig = ?').get('invitadovi');
    t(!!(gUser && gUser.is_guest === 1), 'G2 el dueño es invitado (is_guest=1)', JSON.stringify(gUser));

    const rAnon = await fetch(BASEu + '/api/week/ensure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    t(rAnon.status === 401, 'G3 ensure SIN sesión: 401 (requireAuth)', 'status=' + rAnon.status);

    // Día vacío real: el invitado se queda sin posteos y toca «Que
    // Posty lo arme» — el mismo POST que hace pzHoyArmarHoy.
    db.prepare('DELETE FROM posts WHERE user_id = ?').run(gUser.id);
    db.close();
    const rE = await fetch(BASEu + '/api/week/ensure', {
      method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ armar: 1 }),
    });
    const jE = await rE.json().catch(() => ({}));
    t(rE.status === 200 && (jE.generating === true || jE.complete === true || jE.reason === 'no_dna' || jE.ok === true),
      'G4 ensure {armar:1} CON sesión guest: 200 y procesa (generating / no_dna / complete)',
      'status=' + rE.status + ' ' + JSON.stringify(jE).slice(0, 200));

    const rApp = await fetch(BASEu + '/app.js');
    const bundle = await rApp.text();
    t(rApp.ok && md5(bundle) === md5(APP) && !bundle.includes('contale a Posty en el chat'),
      'G5 el bundle servido es el del árbol (md5) y ya no manda al invitado al chat en su tarjeta',
      'md5 servido=' + md5(bundle) + ' árbol=' + md5(APP));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main().then(() => {
  console.log('\n════════════════════════════════════════════════════');
  console.log(`LOTE VERDAD-INVITADO: ${okN} ok · ${badN} MAL`);
  process.exit(badN ? 1 : 0);
}).catch((e) => { console.error('ERROR FATAL', e); process.exit(2); });
