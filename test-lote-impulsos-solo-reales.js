'use strict';
/* test-lote-impulsos-solo-reales.js — LOTE IMPULSOS-SOLO-REALES
 * (orden de Valentino 17/11 21:18, con captura): en «Tus impulsos»
 * (tab Ads) aparecen las veces que intentó impulsar y NO funcionó,
 * como si fueran impulsos. La lista tiene que mostrar SOLO las
 * veces que el impulso sí salió.
 *
 * Censo sobre la base v1168:
 *  - El historial del cliente lo alimenta UN solo endpoint:
 *    GET /api/ads/boosts (server.js) leía ad_boosts ENTERA
 *    (status cualquiera, id DESC, LIMIT 20) y la devolvía tal cual.
 *    De ahí comen las dos superficies vivas: «Tus impulsos»
 *    (adsView → pzAdsHistorialHTML, public/app.js) y «Últimos
 *    impulsos» de la billetera (anaBilleteraHistorialHTML,
 *    public/chunk-analisis.js).
 *  - El intento de creación que Meta rechaza queda asentado por
 *    TODOS los rieles como status 'error' SIN meta_campaign_id
 *    (riel cliente directo, Destacado, registrar tipo 'error' de la
 *    billetera): es un registro de diagnóstico del equipo, no un
 *    impulso. La cuenta del dueño (user 12) tiene 9 de esas y su
 *    lista mostraba 5 filas $20 idénticas con chip «Revisar».
 *  - El 'error' CON meta_campaign_id es otra cosa: el anuncio SÍ se
 *    creó en Meta (activación fallida → quedó pausado; creado sin
 *    débito): es un estado creado y se sigue mostrando.
 *  - 'pending' es el impulso pago en cola de activación manual (el
 *    producto lo trata como impulsado en todos sus chequeos) y
 *    'active'/'finished' son los creados de siempre: se muestran.
 *  - La lectura de admin (/api/admin/client/:id) tiene su PROPIA
 *    consulta sin filtro: sigue viendo todos los intentos con su
 *    error. Este lote NO toca registros ni esa lectura.
 *  - El error EN EL MOMENTO del intento (bloque «Meta no aceptó la
 *    campaña. No se cobró nada.» de la tarjeta de audiencia) nace de
 *    la respuesta del POST (s.boostError en app.js), no de este GET:
 *    el filtro no lo toca.
 *
 * El arreglo: el filtro vive en el SQL del endpoint —
 *   NOT (status = 'error' AND COALESCE(meta_campaign_id, '') = '')
 * — para que el LIMIT 20 cuente solo impulsos reales y las dos
 * superficies queden corregidas de una. Sin filas visibles, ambas
 * superficies ya caen en su vacío de siempre («Todavía no
 * impulsaste ningún posteo.» / "You haven't boosted any post
 * yet."): no se toca cliente.
 *
 * §A estáticos · §B boot aislado con siembra (la verdad del
 * servidor: el GET filtrado + la lectura admin intacta).
 * En la base prístina v1168 los tests nuevos FALLAN (cazan el
 * cambio). Uso: node test-lote-impulsos-solo-reales.js — sale 0
 * si todo pasa. ISR_TREE=<dir> árbol a probar (def.: este dir).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TREE = path.resolve(process.env.ISR_TREE || __dirname);
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');

let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; console.log('ok  -', name); }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 300) : ''); }
};
const count = (s, sub) => (s.split(sub).length - 1);

// ---------- §A: estáticos ----------
console.log('— §A: estáticos');
const PRED = "NOT (status = 'error' AND COALESCE(meta_campaign_id, '') = '')";
t(count(SRV, PRED) === 1, '§A: el predicado de impulso real existe ×1 en server.js', count(SRV, PRED));
// El predicado vive en la consulta del GET /api/ads/boosts.
{
  const i0 = SRV.indexOf("app.get('/api/ads/boosts'");
  const i1 = SRV.indexOf("app.get('", i0 + 10);
  const bloque = SRV.slice(i0, i1 > i0 ? i1 : i0 + 4000);
  t(i0 > 0 && bloque.includes(PRED), '§A: el filtro está en la consulta de GET /api/ads/boosts');
  t(/ORDER BY id DESC LIMIT 20/.test(bloque), '§A: el endpoint mantiene orden id DESC y LIMIT 20 (ahora sobre reales)');
}
// La lectura de admin NO lleva el filtro: sigue viendo todo.
{
  const i0 = SRV.indexOf("app.get('/api/admin/client/:id'");
  const i1 = SRV.indexOf('FROM ad_boosts', i0);
  const bloque = SRV.slice(i0, i1 > i0 ? i1 + 200 : i0 + 4000);
  t(i0 > 0 && !bloque.includes(PRED) && !/status\s*=/.test(bloque.split('FROM ad_boosts')[0] || ''),
    '§A: /api/admin/client/:id lee ad_boosts sin el filtro (diagnóstico completo)');
}
// El cliente no se tocó: el vacío de siempre y el error del momento siguen.
t(APP.includes('Todavía no impulsaste ningún posteo.') && APP.includes("You haven't boosted any post yet."),
  '§A: el vacío de «Tus impulsos» (ES/EN) sigue en app.js — el usuario solo-fallos cae ahí');
t(count(APP, 's.boostError = { motivo, monto, cobroId') >= 1,
  '§A: el error en el momento del intento sigue naciendo de la respuesta del POST (s.boostError)');

// ---------- §B: boot ----------
console.log('— §B: boot');
const PORT = 34711;
const SECRET = 'lote-impulsos-solo-reales-secret';
const ADMIN = 'boot-admin-isr';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impulsos-solo-reales-'));
function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) { return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid)); }
async function api(sid, method, p) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method, headers: sid ? { Cookie: cookieFor(sid) } : {},
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}

async function runBoot() {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), ADMIN_TOKEN: ADMIN,
    SESSION_SECRET: SECRET, NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    OPENAI_API_KEY: 'test-no-real-key',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, '§B: el servidor levanta con el lote (puerto ' + PORT + ')');
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }

    // Siembra.
    // Usuario 1: SOLO intentos fallidos (la forma exacta de la
    // cuenta del dueño: 9 filas 'error' sin campaña, con su texto).
    // Usuario 2: mixto — un fallo de creación y cinco estados
    // creados/aceptados. Usuario 3: sin filas (control).
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const insUser = db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')`);
    const insSet = db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')`);
    for (const uid of [1, 2, 3]) { insUser.run(uid, `isr-${uid}@example.com`); insSet.run(uid); }
    const insBoost = db.prepare(`INSERT INTO ad_boosts
      (user_id, post_id, ig_media_id, budget_cents, fee_cents, spend_cents, currency, status, meta_campaign_id, meta_adset_id, meta_ad_id, objective, duration_days, error)
      VALUES (?, ?, ?, ?, 0, ?, 'USD', ?, ?, '', '', 'engagement', 7, ?)`);
    const ERR_CREA = 'creación fallida en la cuenta del cliente (riel cliente): Meta Ads: Invalid parameter';
    for (let i = 0; i < 9; i++) insBoost.run(1, 696, 'ig696', 2000, 0, 'error', '', ERR_CREA);
    insBoost.run(2, 501, 'ig501', 2000, 0, 'error', '', ERR_CREA);                       // a: fallo de creación → fuera
    insBoost.run(2, 502, 'ig502', 2000, 2000, 'active', 'camp_ok', '');                  // b: activo con campaña → adentro
    insBoost.run(2, 503, 'ig503', 2000, 2000, 'error', 'camp_act', 'activación fallida en Meta (ref r1): paused'); // c: creado, error de activación → adentro
    insBoost.run(2, 504, 'ig504', 2000, 2000, 'error', 'camp_deb', 'ad creado sin débito (ref r2)');              // d: creado sin débito → adentro
    insBoost.run(2, 505, 'ig505', 2000, 0, 'pending', '', '');                           // e: pago en cola de activación → adentro
    insBoost.run(2, 506, 'ig506', 5000, 5000, 'finished', 'camp_fin', '');               // f: terminado con campaña → adentro
    const insSes = db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`);
    for (const [sid, uid] of [['isr-sid-1', 1], ['isr-sid-2', 2], ['isr-sid-3', 3]]) {
      insSes.run(sid, JSON.stringify({ cookie: { originalMaxAge: 7 * 24 * 3600 * 1000, httpOnly: true, path: '/' }, userId: uid }), Date.now() + 7 * 24 * 3600 * 1000);
    }
    db.close();

    // Sin sesión → 401.
    const sinAuth = await api(null, 'GET', '/api/ads/boosts');
    t(sinAuth.status === 401, '§B: GET /api/ads/boosts sin sesión → 401', String(sinAuth.status));

    // Usuario 1 (solo fallos): el historial del cliente sale VACÍO.
    const u1 = await api('isr-sid-1', 'GET', '/api/ads/boosts');
    t(u1.status === 200 && u1.json && u1.json.ok === true, '§B: usuario 1 — el endpoint responde 200 ok:true');
    t(Array.isArray(u1.json.boosts) && u1.json.boosts.length === 0,
      '§B: usuario 1 (9 intentos fallidos) ve el historial VACÍO → cae en «Todavía no impulsaste ningún posteo.»',
      JSON.stringify(u1.json && u1.json.boosts).slice(0, 200));

    // Usuario 2 (mixto): entran los 5 creados/aceptados, sale el fallo.
    const u2 = await api('isr-sid-2', 'GET', '/api/ads/boosts');
    const rows2 = (u2.json && u2.json.boosts) || [];
    t(rows2.length === 5, '§B: usuario 2 — 5 impulsos visibles de 6 filas (fuera solo el fallo de creación)', rows2.length);
    t(!rows2.some((b) => b.status === 'error' && !b.meta_campaign_id),
      '§B: usuario 2 — ninguna fila visible es error-sin-campaña');
    t(rows2.some((b) => b.status === 'active' && b.meta_campaign_id === 'camp_ok'),
      '§B: usuario 2 — el activo con campaña se ve');
    t(rows2.some((b) => b.status === 'error' && b.meta_campaign_id === 'camp_act'),
      '§B: usuario 2 — el creado con error de activación (campaña creada) se ve');
    t(rows2.some((b) => b.status === 'error' && b.meta_campaign_id === 'camp_deb'),
      '§B: usuario 2 — el creado sin débito (campaña creada) se ve');
    t(rows2.some((b) => b.status === 'pending'),
      '§B: usuario 2 — el pago en cola de activación manual se ve');
    t(rows2.some((b) => b.status === 'finished' && b.meta_campaign_id === 'camp_fin'),
      '§B: usuario 2 — el terminado se ve');
    t(rows2.every((b, i, a) => i === 0 || a[i - 1].id > b.id),
      '§B: usuario 2 — el orden sigue id DESC');

    // Usuario 3 (sin filas): vacío, como siempre.
    const u3 = await api('isr-sid-3', 'GET', '/api/ads/boosts');
    t(Array.isArray(u3.json.boosts) && u3.json.boosts.length === 0,
      '§B: usuario 3 (sin impulsos) — historial vacío, sin cambios');

    // La lectura de admin sigue viendo TODO, con el error completo.
    const a1 = await api(null, 'GET', `/api/admin/client/1?token=${ADMIN}`);
    const ab1 = (a1.json && a1.json.ads && a1.json.ads.boosts) || [];
    t(ab1.length === 9 && ab1.every((b) => b.status === 'error'),
      '§B: admin — la cuenta solo-fallos sigue mostrando sus 9 intentos', ab1.length);
    t(ab1.length > 0 && String(ab1[0].error || '').includes('creación fallida'),
      '§B: admin — el texto completo del error sigue en el registro');
    const a2 = await api(null, 'GET', `/api/admin/client/2?token=${ADMIN}`);
    const ab2 = (a2.json && a2.json.ads && a2.json.ads.boosts) || [];
    t(ab2.length === 6, '§B: admin — la cuenta mixta sigue mostrando las 6 filas (incluido el fallo)', ab2.length);
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  try { await runBoot(); } catch (e) { badN++; console.log('✗ boot:', e && e.message); }
  console.log(`\n== impulsos-solo-reales: ${okN} ok · ${badN} fallos`);
  process.exit(badN ? 1 : 0);
})();
