'use strict';
// (LOTE ANALISIS-DIARIO · 9/11 · v843) Suite del análisis diario del
// posteo por cliente (§9 de la spec): la fila se escribe por admin y se
// lee en /api/ritual/hoy · sin fila, d.analisis no viene y la hoja/Hoy
// se rinden sin la línea · la línea nunca trae un número fuera de
// numeros_json · el multiplicador, si lo hay, es el cociente real de
// dos números reales · shares solo si la API lo devuelve · espejo
// ES+EN · la señal llega a los learnings y no cambia el dedup · un
// mensaje por día: la línea no crea ninguna push ni mensaje de chat
// nuevo. Boot real del servidor + VM del bundle (patrón
// test-ritual-hoy-contrato.js).
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const TREE = __dirname;
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const SRC = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const INS = fs.readFileSync(path.join(TREE, 'insights.js'), 'utf8');
const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));
const { performanceBrief } = require(path.join(TREE, 'generator.js'));

const TZ = 'America/New_York';
const TODAY = dayKeyInTz(new Date(), TZ);
const shiftDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const YESTERDAY = shiftDays(TODAY, -1);
const TWO_AGO = shiftDays(TODAY, -2);
const at2200Z = (ymd) => ymd + 'T22:00:00.000Z'; // 17:00 EST, formato de producción

let pass = 0, fail = 0;
function t(name, ok, extra) {
  if (ok) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); }
}

// ---------- sandbox vm (mínimo del patrón proximoritual) ----------
function elStub() {
  return {
    tagName: 'DIV', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild() {}, removeChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    closest: () => null,
    getBoundingClientRect: () => ({ width: 390, height: 100, top: 0, left: 0 }),
    focus() {}, click() {}, blur() {},
    innerHTML: '', textContent: '', value: '', hidden: false,
    src: '', href: '', disabled: false, checked: false,
    children: [], parentNode: null, isConnected: false,
  };
}
function storeStub() {
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
  s._keys = () => [...m.keys()];
  return s;
}
const locObj = { hash: '#/app/ritual', href: 'https://postycommunitymanager.com/#/app/ritual', pathname: '/', search: '', host: 'postycommunitymanager.com' };
const sandbox = {
  console,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
  location: locObj,
  navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', language: 'es-AR', onLine: true },
  localStorage: storeStub(), sessionStorage: storeStub(),
  performance: { now: () => Date.now() },
  AbortSignal, URL, URLSearchParams,
  CustomEvent: function CustomEvent() {}, Event: function Event() {},
  Date,
};
sandbox.window = {
  addEventListener() {}, removeEventListener() {},
  innerHeight: 844, innerWidth: 390, location: locObj,
  scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  navigator: sandbox.navigator, document: null,
};
sandbox.document = {
  addEventListener() {}, removeEventListener() {},
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => elStub(), body: elStub(), documentElement: elStub(),
  title: 'Posty', hidden: false, visibilityState: 'visible',
};
sandbox.window.document = sandbox.document;
sandbox.self = sandbox.window;
vm.createContext(sandbox);
try {
  vm.runInContext(SRC, sandbox, { filename: 'app.js' });
} catch (e) {
  console.log('FAIL bundle no carga: ' + (e && e.message));
  process.exit(2);
}
const pzRitualHTML = sandbox.pzRitualHTML;
const pzHoySpeechHTML = sandbox.pzHoySpeechHTML;
if (typeof pzRitualHTML !== 'function' || typeof pzHoySpeechHTML !== 'function') {
  console.log('FAIL pzRitualHTML/pzHoySpeechHTML no existen en el bundle');
  process.exit(2);
}

// ---------- boot del servidor real ----------
const PORT = 34572;
const SECRET = 'analisis-diario-secret';
const ADMIN_TOKEN = 'boot-test-token-analisis';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analisis-diario-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';

function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function api(method, pathUrl, body, sid) {
  const headers = { 'Content-Type': 'application/json' };
  if (sid) headers.Cookie = cookieFor(sid);
  const r = await fetch(`http://127.0.0.1:${PORT}${pathUrl}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}

const LINEA_ES = 'Ayer: 12 likes, 3 comentarios — la foto del producto rindió 3× más que el texto';
const LINEA_EN = 'Yesterday: 12 likes, 3 comments — the product photo did 3× better than the text';
const INSIGHT_ES = 'la foto del producto rinde más que el texto — esta semana pesamos las fotos de tu producto';
const INSIGHT_EN = 'the product photo does better than text — this week we lean on photos of your product';
const SENIAL = 'la foto del producto rinde más que el texto; pesar fotos de producto en la próxima semana';
const NUMEROS = { post_id: 570, reach: 120, likes: 12, comments: 3, saved: 8, shares: 2, reach_30d: 120, interactions_30d: 23, ventana_dias: 30 };

(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN,
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'test',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (r.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t('boot: el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }

    // Siembra directa en la DB del boot (patrón conserje-panel-v2-boot):
    // user 12 (es) con posteo publicado ayer (570, con métricas) +
    // posteo de hoy (518) y fila pz_ritual; user 14 (en) con posteo de
    // hoy (618); user 13 vacío (sin posteos).
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    db.exec(`CREATE TABLE IF NOT EXISTS pz_ritual (
      user_id INTEGER NOT NULL, day_key TEXT NOT NULL,
      recommended_post_id INTEGER NOT NULL,
      alt_post_ids TEXT NOT NULL DEFAULT '[]', picked_post_id INTEGER,
      gold INTEGER NOT NULL DEFAULT 0, picked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, day_key))`);
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({
      cookie: { originalMaxAge: 604800000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' },
      userId: uid,
    });
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (12, 'analisis-12@test.invalid', 'x')`).run();
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (13, 'analisis-13@test.invalid', 'x')`).run();
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (14, 'analisis-14@test.invalid', 'x')`).run();
    db.prepare(`UPDATE users SET lang = 'en' WHERE id = 14`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, 'America/New_York')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (13, 'America/New_York')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (14, 'America/New_York')`).run();
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, published_at, status, tipo, media_type, ig_media_id) VALUES (570, 12, '/media/570.jpg', 'Latte de la casa', '', ?, ?, 'published', 'social', 'image', 'ig_570')`).run(at2200Z(YESTERDAY), at2200Z(YESTERDAY));
    db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved, shares, fetched_at) VALUES (570, 120, 12, 3, 8, 2, datetime('now'))`).run();
    const insPost = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type) VALUES (?, ?, ?, ?, '', ?, 'scheduled', ?, 'image')`);
    insPost.run(518, 12, '/media/518.jpg', 'Café de la casa, hecho con amor', at2200Z(TODAY), 'social');
    insPost.run(519, 12, '/media/519.jpg', 'Detrás del mostrador', at2200Z(shiftDays(TODAY, 1)), 'detras');
    insPost.run(618, 14, '/media/618.jpg', 'Morning coffee', at2200Z(TODAY), 'social');
    db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold) VALUES (12, ?, 518, '[519]', NULL, 0)`).run(TODAY);
    db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold) VALUES (14, ?, 618, '[]', NULL, 0)`).run(TODAY);
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES ('analisis-12', ?, ?)`).run(sessJson(12), exp);
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES ('analisis-13', ?, ?)`).run(sessJson(13), exp);
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES ('analisis-14', ?, ?)`).run(sessJson(14), exp);
    const countPush = () => {
      try { return db.prepare('SELECT COUNT(*) AS n FROM morning_post_push WHERE user_id IN (12, 14)').get().n; } catch (e) { return 0; }
    };
    const countChats = () => {
      try { return db.prepare('SELECT COUNT(*) AS n FROM posty_chats WHERE user_id IN (12, 14)').get().n; } catch (e) { return 0; }
    };
    const pushAntes = countPush();
    const chatsAntes = countChats();
    db.close();

    // ===== A) GET /api/admin/analisis-diario/ayer =====
    const aSin = await api('GET', '/api/admin/analisis-diario/ayer?user_id=12');
    t('A1: GET ayer sin token → 403', aSin.status === 403, 'status=' + aSin.status);
    const a12 = await api('GET', `/api/admin/analisis-diario/ayer?user_id=12&token=${ADMIN_TOKEN}`);
    t('A2: GET ayer con token → 200 + ok + ayer', a12.status === 200 && a12.json && a12.json.ok === true && a12.json.ayer === YESTERDAY,
      'status=' + a12.status + ' body=' + JSON.stringify(a12.json).slice(0, 300));
    const aj = a12.json || {};
    t('A3: ayer trae el posteo publicado ayer (id real, ig_media_id real, nunca demo)',
      aj.post && aj.post.id === 570 && aj.post.ig_media_id === 'ig_570' && !String(aj.post.ig_media_id).startsWith('demo_'),
      'post=' + JSON.stringify(aj.post));
    t('A4: ayer trae las métricas reales (reach/likes/comments/saved/shares)',
      aj.metricas && aj.metricas.reach === 120 && aj.metricas.likes === 12 && aj.metricas.comments === 3 && aj.metricas.saved === 8 && aj.metricas.shares === 2,
      'metricas=' + JSON.stringify(aj.metricas));
    t('A5: ayer trae el contexto de 30 días y los ejes del fundamento',
      aj.contexto_30d && typeof aj.contexto_30d.reach_30d === 'number' && ('ejes' in aj) && aj.ejes && typeof aj.ejes === 'object',
      'contexto=' + JSON.stringify(aj.contexto_30d) + ' ejes=' + JSON.stringify(aj.ejes).slice(0, 200));
    const a13 = await api('GET', `/api/admin/analisis-diario/ayer?user_id=13&token=${ADMIN_TOKEN}`);
    t('A6: sin posteo ayer → post null y metricas null (bamboo no escribe línea)',
      a13.status === 200 && a13.json && a13.json.post === null && a13.json.metricas === null,
      'status=' + a13.status + ' body=' + JSON.stringify(a13.json).slice(0, 200));

    // ===== B) POST /api/admin/analisis-diario =====
    const base = { user_id: 12, day_key: TODAY, linea_es: LINEA_ES, linea_en: LINEA_EN, insight_es: INSIGHT_ES, insight_en: INSIGHT_EN, senial: SENIAL, numeros: NUMEROS };
    const bSin = await api('POST', '/api/admin/analisis-diario', base);
    t('B1: POST sin token → 403', bSin.status === 403, 'status=' + bSin.status);
    const bFalta = await api('POST', `/api/admin/analisis-diario?token=${ADMIN_TOKEN}`, { ...base, linea_en: '' });
    t('B2: falta un texto del espejo → 400 falta_texto', bFalta.status === 400 && bFalta.json && bFalta.json.error === 'falta_texto',
      'status=' + bFalta.status + ' body=' + JSON.stringify(bFalta.json));
    const bNum = await api('POST', `/api/admin/analisis-diario?token=${ADMIN_TOKEN}`, { ...base, linea_es: 'Ayer: 47 likes, 3 comentarios — la foto rindió' });
    t('B3: número sin respaldo (47 likes) → 400 numero_sin_respaldo', bNum.status === 400 && bNum.json && bNum.json.error === 'numero_sin_respaldo' && bNum.json.numero === '47',
      'status=' + bNum.status + ' body=' + JSON.stringify(bNum.json));
    const bMult = await api('POST', `/api/admin/analisis-diario?token=${ADMIN_TOKEN}`, { ...base, linea_es: 'Ayer: 12 likes — el alcance fue 10× los likes', linea_en: 'Yesterday: 12 likes — reach was 10× the likes', insight_es: INSIGHT_ES, insight_en: INSIGHT_EN });
    t('B4: multiplicador = cociente real (120/12 = 10×) → 200', bMult.status === 200 && bMult.json && bMult.json.ok === true,
      'status=' + bMult.status + ' body=' + JSON.stringify(bMult.json));
    const bOk = await api('POST', `/api/admin/analisis-diario?token=${ADMIN_TOKEN}`, base);
    t('B5: POST válido → 200 + ok', bOk.status === 200 && bOk.json && bOk.json.ok === true && bOk.json.day_key === TODAY,
      'status=' + bOk.status + ' body=' + JSON.stringify(bOk.json));
    const bEn = await api('POST', `/api/admin/analisis-diario?token=${ADMIN_TOKEN}`, { ...base, user_id: 14 });
    t('B5b: POST válido para el usuario EN → 200', bEn.status === 200 && bEn.json && bEn.json.ok === true,
      'status=' + bEn.status + ' body=' + JSON.stringify(bEn.json));
    const db2 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const row12 = db2.prepare('SELECT * FROM analisis_diario WHERE user_id = 12 AND day_key = ?').get(TODAY);
    t('B6: la fila quedó guardada (línea ES + insight ES + señal + numeros_json)',
      !!row12 && row12.linea_es === LINEA_ES && row12.insight_es === INSIGHT_ES && row12.senial === SENIAL && JSON.parse(row12.numeros_json).likes === 12,
      'row=' + JSON.stringify(row12));
    const nFilas = db2.prepare('SELECT COUNT(*) AS n FROM analisis_diario WHERE user_id = 12 AND day_key = ?').get(TODAY).n;
    t('B7: upsert — dos POST del mismo día dejan UNA sola fila', nFilas === 1, 'n=' + nFilas);
    db2.close();

    // ===== C) GET /api/ritual/hoy — d.analisis =====
    const hoy12 = await api('GET', '/api/ritual/hoy', undefined, 'analisis-12');
    t('C1: /api/ritual/hoy (ES) trae d.analisis con la línea y el insight en español',
      hoy12.status === 200 && hoy12.json && hoy12.json.analisis && hoy12.json.analisis.linea === LINEA_ES && hoy12.json.analisis.insight === INSIGHT_ES,
      'status=' + hoy12.status + ' analisis=' + JSON.stringify(hoy12.json && hoy12.json.analisis));
    const hoy14 = await api('GET', '/api/ritual/hoy', undefined, 'analisis-14');
    t('C2: /api/ritual/hoy (EN) trae d.analisis en inglés (espejo, no la línea ES)',
      hoy14.status === 200 && hoy14.json && hoy14.json.analisis && hoy14.json.analisis.linea === LINEA_EN && hoy14.json.analisis.insight === INSIGHT_EN,
      'status=' + hoy14.status + ' analisis=' + JSON.stringify(hoy14.json && hoy14.json.analisis));
    const hoy13 = await api('GET', '/api/ritual/hoy', undefined, 'analisis-13');
    t('C3: sin fila, d.analisis NO viene (ni null ni placeholder)',
      hoy13.status === 200 && hoy13.json && !('analisis' in hoy13.json),
      'status=' + hoy13.status + ' claves=' + Object.keys(hoy13.json || {}).join(','));

    // ===== D) pzRitualHTML — la línea en la hoja =====
    const d12 = hoy12.json;
    const htmlRev = String(pzRitualHTML(d12, false, d12.recomendada && d12.recomendada.id));
    t('D1: la hoja revelada rinde la línea arriba del posteo (clase + texto)',
      htmlRev.includes('pz-ritual-analisis') && htmlRev.includes(LINEA_ES) && htmlRev.indexOf('pz-ritual-analisis') < htmlRev.indexOf('pz-ritual-revelada'),
      htmlRev.slice(0, 300));
    const dEleg = { ...d12, elegida: d12.recomendada && d12.recomendada.id };
    const htmlEleg = String(pzRitualHTML(dEleg, false));
    t('D2: la hoja elegida rinde la línea (misma clase + texto)',
      htmlEleg.includes('pz-ritual-analisis') && htmlEleg.includes(LINEA_ES),
      htmlEleg.slice(0, 300));
    const dSin = { ...d12 };
    delete dSin.analisis;
    const htmlSin = String(pzRitualHTML(dSin, false, dSin.recomendada && dSin.recomendada.id));
    t('D3: sin d.analisis la hoja se rinde sin la línea (sin clase, sin «Ayer:», sin placeholder)',
      !htmlSin.includes('pz-ritual-analisis') && !htmlSin.includes('Ayer:'),
      htmlSin.slice(0, 300));

    // ===== E) pzHoySpeechHTML — el insight en la burbuja =====
    const speechCon = String(pzHoySpeechHTML({ hoyPost: null, pendientes: 0, haySemana: false, en: false, tz: TZ, manual: false, needOK: 0, schedSolo: 0, insight: INSIGHT_ES }));
    t('E1: Hoy rinde el insight como segundo párrafo de la misma burbuja',
      speechCon.includes('pz-hoy-insight') && speechCon.includes(INSIGHT_ES) && speechCon.includes('pz-hoy-speech'),
      speechCon.slice(0, 300));
    const speechSin = String(pzHoySpeechHTML({ hoyPost: null, pendientes: 0, haySemana: false, en: false, tz: TZ, manual: false, needOK: 0, schedSolo: 0 }));
    t('E2: sin insight, Hoy se rinde sin el segundo párrafo (sin clase, sin placeholder)',
      !speechSin.includes('pz-hoy-insight'),
      speechSin.slice(0, 300));

    // ===== F) performanceBrief — la señal llega al generador =====
    const db3 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    db3.prepare(`INSERT OR REPLACE INTO analisis_diario (user_id, day_key, linea_es, linea_en, insight_es, insight_en, senial, numeros_json) VALUES (12, ?, 'x', 'x', 'x', 'x', 'el reel corto rindió más que el posteo largo; pesar reels cortos', '{}')`).run(YESTERDAY);
    db3.prepare(`INSERT OR REPLACE INTO analisis_diario (user_id, day_key, linea_es, linea_en, insight_es, insight_en, senial, numeros_json) VALUES (12, ?, 'x', 'x', 'x', 'x', 'el reel corto rindió más que el posteo largo; pesar reels cortos', '{}')`).run(TWO_AGO);
    db3.close();
    const db4 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const brief = performanceBrief(db4, 12);
    const nSenial = (brief.split(SENIAL).length - 1);
    const nReel = (brief.split('el reel corto rindió más que el posteo largo; pesar reels cortos').length - 1);
    t('F1: la señal llega a los learnings (la de hoy + la repetida de ayer/antier)',
      brief.includes(SENIAL) && nSenial === 1 && nReel === 1 && brief.includes('veredicto diario'),
      'brief=' + brief.slice(0, 500));
    t('F2: el top 3 por alcance sigue en los learnings (la señal suma, no reemplaza)',
      brief.includes('Tus posteos con más alcance') && brief.includes('Latte de la casa'),
      'brief=' + brief.slice(0, 500));
    const db5 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    db5.prepare('DELETE FROM analisis_diario WHERE user_id = 12').run();
    db5.close();
    const db6 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const briefSin = performanceBrief(db6, 12);
    t('F3: sin filas, los learnings son los de hoy (top 3, sin veredicto)',
      briefSin.includes('Tus posteos con más alcance') && !briefSin.includes('veredicto diario'),
      'brief=' + briefSin.slice(0, 300));
    const db7 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    db7.prepare('DELETE FROM post_metrics WHERE post_id = 570').run();
    db7.close();
    const db8 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const briefVacio = performanceBrief(db8, 12);
    t('F4: sin top 3 ni filas, el brief es vacío (nunca inventa)', briefVacio === '', 'brief=' + JSON.stringify(briefVacio));
    db8.close();

    // ===== G) Un mensaje por día: la línea no crea push ni chat =====
    const db9 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const countPush2 = (() => { try { return db9.prepare('SELECT COUNT(*) AS n FROM morning_post_push WHERE user_id IN (12, 14)').get().n; } catch (e) { return 0; } })();
    const countChats2 = (() => { try { return db9.prepare('SELECT COUNT(*) AS n FROM posty_chats WHERE user_id IN (12, 14)').get().n; } catch (e) { return 0; } })();
    db9.close();
    t('G1: escribir la fila no encola ninguna push de la mañana (morning_post_push sin cambios)',
      countPush2 === pushAntes, 'antes=' + pushAntes + ' después=' + countPush2);
    t('G2: escribir la fila no crea ningún mensaje de chat (posty_chats sin cambios)',
      countChats2 === chatsAntes, 'antes=' + chatsAntes + ' después=' + countChats2);
    t('G3: la respuesta del POST no trae ningún campo de push ni chat',
      bOk.json && Object.keys(bOk.json).sort().join(',') === 'day_key,ok,user_id',
      'claves=' + Object.keys(bOk.json || {}).join(','));

    // ===== S) Estática: el motor no escribe; la sonda de shares es aislada =====
    t('S1: solo el POST de admin escribe analisis_diario (un único INSERT en todo el servidor)',
      (SRV.match(/INSERT INTO analisis_diario/g) || []).length === 1,
      'ocurrencias=' + (SRV.match(/INSERT INTO analisis_diario/g) || []).length);
    const h0 = SRV.indexOf("app.get('/api/ritual/hoy'");
    const hN = h0 >= 0 ? SRV.indexOf('\napp.', h0 + 1) : -1;
    const handler = h0 >= 0 && hN > h0 ? SRV.slice(h0, hN) : '';
    t('S2: /api/ritual/hoy solo LEE la fila (sin INSERT ni UPDATE en su handler)',
      handler && !handler.includes('INSERT INTO analisis_diario') && !handler.includes('UPDATE analisis_diario'),
      'handler=' + handler.length + ' chars');
    t('S3: shares se pide en llamada aparte (propio try/catch) y la base sigue siendo reach,likes,comments,saved',
      INS.includes("metric: 'shares'") && INS.includes("metric: 'reach,likes,comments,saved'"),
      'shares=' + INS.includes("metric: 'shares'"));
    t('S4: el generador y el scheduler no escriben analisis_diario',
      !fs.readFileSync(path.join(TREE, 'generator.js'), 'utf8').includes('INSERT INTO analisis_diario') && !fs.readFileSync(path.join(TREE, 'scheduler.js'), 'utf8').includes('INSERT INTO analisis_diario'),
      'generator/scheduler limpios');

    console.log(`\nANALISIS-DIARIO: ${pass} ok, ${fail} fallas`);
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('ERROR:', e && e.message);
    console.log(out.split('\n').slice(-30).join('\n'));
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }
})();
