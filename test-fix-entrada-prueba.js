#!/usr/bin/env node
// FIX-ENTRADA-PRUEBA (5/11, aprobado 19:06): la entrada acepta el trial
// fresco que se acaba de generar, el error se ve con honestidad y ninguna
// variable de plantilla llega al cliente.
//  1) La generación registra candado + uso con user_id NULL: ESO ES LA
//     GENERACIÓN MISMA, no un uso. Solo bloquea lo consumido de verdad:
//     trial_used con user_id de cuenta real, o una fila invitada que ya
//     entró con ese @/dominio. El candado de 90 días sigue bloqueando la
//     RE-generación, no la entrada.
//  2) doGuestEnter: error con scroll a la vista + timeout de 30 s (el
//     botón nunca queda girando ni vuelve en silencio).
//  3) Variables de plantilla: la línea del draft salía como pares
//     clave=valor («tema=tip») y se minaba como si fueran productos —
//     los titulares salían «3 claves de tema=tip» y
//     «Protagonista=producto: pedilo hoy». Capas: (a) draftGoalLines
//     emite etiquetas humanas con «:»; (b) el digest se compila sin la
//     línea del draft; (c) isPlausibleOfferItem rechaza «=»/«{{»/«${»;
//     (d) dropTemplateVarTopics saca del pool todo tema con variable
//     sin reemplazar (fail-closed).
// Uso: node test-fix-entrada-prueba.js
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3993;
const BASE = `http://127.0.0.1:${PORT}`;
const DAY = 24 * 3600 * 1000;
const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
};
const HAS_TVAR = /\b[a-zA-Z_][\w.-]*=[^\s]{1,60}|\{\{[^}]*\}\}|\$\{[^}]*\}/;
const cleanText = (s) => !HAS_TVAR.test(String(s || ''));

// ── A. draftGoalLines: etiquetas humanas, sin clave=valor ───────────────
{
  const d = require('./draft-onboarding');
  const draft = {
    version: 1,
    dims: ['foto', 'protagonista', 'texto', 'tema'],
    rondas: [
      { dim: 'foto', opciones: [{ v: 'producto' }, { v: 'accion' }, { v: 'marca' }], elegida: 'producto' },
      { dim: 'protagonista', opciones: [{ v: 'producto' }, { v: 'gente' }, { v: 'lugar' }], elegida: 'producto' },
      { dim: 'texto', opciones: [{ v: 'limpia' }, { v: 'equilibrada' }, { v: 'titulares' }], elegida: 'limpia' },
      { dim: 'tema', opciones: [{ v: 'tip' }, { v: 'social' }, { v: 'novedad' }], elegida: 'tip' },
    ],
    campeona: { dim: 'texto', v: 'limpia' },
  };
  const es = d.draftGoalLines(draft, 'es')[0] || '';
  const en = d.draftGoalLines(draft, 'en')[0] || '';
  ok('A1 draft ES sin "="', !es.includes('='), es);
  ok('A2 draft EN sin "="', !en.includes('='), en);
  ok('A3 draft ES trae las etiquetas', /Protagonista: El producto/.test(es) && /Texto: Solo la foto, limpia/.test(es) && /Tema: Consejos/.test(es), es);
  ok('A4 draft EN trae las etiquetas', /Star: The product/.test(en) && /Theme: Tips/.test(en), en);
  ok('A5 draft sin draft → []', d.draftGoalLines(null, 'es').length === 0);
}

// ── B. Puerta de admisibilidad: «=» nunca es un producto ────────────────
{
  const cd = require('./client-digest');
  ok('B1 gate rechaza tema=tip', cd.isPlausibleOfferItem('tema=tip') === false);
  ok('B2 gate rechaza Protagonista=producto', cd.isPlausibleOfferItem('Protagonista=producto') === false);
  ok('B3 gate rechaza Texto=limpia', cd.isPlausibleOfferItem('Texto=limpia') === false);
  ok('B4 gate rechaza {{x}} y ${x}', cd.isPlausibleOfferItem('{{producto}}') === false && cd.isPlausibleOfferItem('${producto}') === false);
  ok('B5 gate acepta productos reales', cd.isPlausibleOfferItem('café de especialidad') === true && cd.isPlausibleOfferItem('medialunas') === true && cd.isPlausibleOfferItem('Café') === true);
}

// ── C. Regresión: la línea VIEJA del draft ya no se mina ─────────────────
{
  const cd = require('./client-digest');
  const oldLine = 'Gusto del draft (draft del onboarding): foto=producto · protagonista=producto · texto=limpia · tema=tip';
  const mined = cd.offeringsFromText(oldLine).items;
  ok('C1 línea vieja no mina ningún dim=valor', mined.length === 0, mined);
  ok('C2 línea vieja no mina nada en absoluto', !mined.some((m) => HAS_TVAR.test(m)), mined);
  const newLine = 'Gusto del draft (draft del onboarding): Foto: El producto, bien grande · Protagonista: El producto · Texto: Solo la foto, limpia · Tema: Consejos';
  ok('C3 línea nueva no se mina', cd.offeringsFromText(newLine).items.length === 0, cd.offeringsFromText(newLine).items);
}

// ── D. Digest + temas: la semana no ancla en variables ───────────────────
{
  const cd = require('./client-digest');
  const oldLine = 'Gusto del draft (draft del onboarding): foto=producto · protagonista=producto · texto=limpia · tema=tip';
  const dg = cd.buildFromParts({
    business: 'Café Lumen', category: 'cafeteria',
    form: { description: 'Café de especialidad\n' + oldLine },
  });
  const names = [...(dg.productos || []), ...(dg.servicios || [])].map((x) => x.nombre);
  ok('D1 digest sin ítems dim=valor', !names.some((n) => HAS_TVAR.test(n)), names);
  ok('D2 digest conserva el producto real', names.includes('Café de especialidad'), names);
  const topics = cd.deriveTopics(dg, { count: 5, category: 'cafeteria', lang: 'es' });
  const texts = topics.flatMap((t) => [t.headline, t.subline, t.caption, t.cta]);
  ok('D3 ningún titular/caption con variable', texts.every(cleanText), texts);
  ok('D4 la semana nace del producto real', topics.length >= 3 && topics.some((t) => /Café de especialidad/i.test((t.headline || '') + ' ' + (t.caption || ''))), topics.map((t) => t.headline));
}

// ── E. Red fail-closed del demo: el tema envenenado no entra ─────────────
{
  const demo = require('./demo');
  const poisoned = [
    { kind: 'tip', headline: '3 claves de tema=tip', subline: '', caption: 'Mirá este tip', cta: '' },
    { kind: 'novedad', headline: 'Protagonista=producto', subline: '', caption: 'Llegó lo nuevo', cta: '' },
    { kind: 'reserva', headline: 'Protagonista=producto: pedilo hoy', subline: '', caption: 'Pedilo hoy', cta: 'Pedir ahora' },
    { kind: 'social', headline: 'El café de siempre', subline: '', caption: 'Como siempre', cta: '' },
  ];
  ok('E1 topicHasTemplateVar caza los 3 envenenados', poisoned.slice(0, 3).every((t) => demo.topicHasTemplateVar(t)));
  ok('E2 topicHasTemplateVar deja pasar el limpio', demo.topicHasTemplateVar(poisoned[3]) === false);
  const kept = demo.dropTemplateVarTopics(poisoned);
  ok('E3 drop saca los 3 y deja 1', kept.length === 1 && kept[0].kind === 'social', kept.map((t) => t.headline));
  // Digest envenenado a propósito (salta la puerta de ingesta): la red
  // del demo lo tiene que sacar igual antes de armar la semana.
  const dg = {
    business: 'Café Lumen', category: 'cafeteria', subcat: '',
    productos: [{ nombre: 'Café de especialidad' }, { nombre: 'Medialunas' }],
    servicios: [{ nombre: 'Tema=tip' }, { nombre: 'Protagonista=producto' }, { nombre: 'Texto=limpia' }],
    promos: [], temas_feed: [], protagonista: '', paleta: [], registro: null,
    ciudad: '', diferencial: '', has_booking: false, etapa: '', lanzamiento_fecha: null,
  };
  const spec = demo.buildDemoSpec({
    business: 'Café Lumen', category: 'cafeteria', country: 'AR', tone: 'vos',
    goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D', count: 5,
    lang: 'es', trialNoStock: true, digest: dg,
  });
  const specTexts = [...(spec.topics || []).flatMap((t) => [t.headline, t.subline, t.caption, t.cta]),
    ...(spec.specPosts || []).flatMap((p) => [p.headline, p.subline, p.cta])];
  ok('E4 spec con digest envenenado: cero variables', specTexts.every(cleanText), specTexts);
  ok('E5 la semana se completa con temas limpios', (spec.topics || []).length === 5, (spec.topics || []).map((t) => t.headline));
}

// ── F. Estático: doGuestEnter muestra el error, con tope ─────────────────
{
  const es = fs.readFileSync(path.join(__dirname, 'public', 'prueba.html'), 'utf8');
  const en = fs.readFileSync(path.join(__dirname, 'public', 'en-prueba.html'), 'utf8');
  const sliceFn = (html) => {
    const i = html.indexOf('async function doGuestEnter()');
    const j = html.indexOf('function openRegTrial()', i);
    return html.slice(i, j);
  };
  for (const [tag, html, timeoutMsg] of [
    ['ES', es, 'Tardó demasiado en responder'],
    ['EN', en, 'Taking too long to respond'],
  ]) {
    const fn = sliceFn(html);
    ok(`F1 ${tag}: error con scroll a la vista`, fn.includes('scrollIntoView'), '');
    ok(`F2 ${tag}: timeout con AbortController`, fn.includes('AbortController') && fn.includes('30000'), '');
    ok(`F3 ${tag}: mensaje honesto de timeout`, fn.includes(timeoutMsg), '');
    ok(`F4 ${tag}: error de red honesto (no "Failed to fetch")`, fn.includes('El servidor no responde') || fn.includes('The server is not responding'), '');
    ok(`F5 ${tag}: el botón se restaura en el catch`, fn.includes("b.disabled = false"), '');
  }
}

// ── G. Unit: fresco vs consumido (DB en memoria) ─────────────────────────
{
  const { DatabaseSync } = require('node:sqlite');
  const tl = require('./trial-lock');
  const gt = require('./guest-trial');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE trial_used (kind TEXT NOT NULL, value TEXT NOT NULL, user_id INTEGER, created_at INTEGER NOT NULL, PRIMARY KEY (kind, value))`);
  db.exec(`CREATE TABLE trial_locks (id INTEGER PRIMARY KEY, ig TEXT, domain TEXT, business TEXT, lang TEXT, payload TEXT, generated_at INTEGER, created_at INTEGER)`);
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, is_guest INTEGER DEFAULT 0, guest_ig TEXT DEFAULT '', guest_domain TEXT DEFAULT '', guest_device TEXT DEFAULT '')`);
  const now = Date.now();
  // Generación sola: candado + uso con user_id NULL (trialLockRecordFor).
  db.prepare(`INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run('fresco', 'fresco.com', 'Fresco', 'es', null, now - DAY, now - DAY);
  db.prepare(`INSERT INTO trial_used (kind, value, user_id, created_at) VALUES ('ig','fresco',NULL,?)`).run(now - DAY);
  db.prepare(`INSERT INTO trial_used (kind, value, user_id, created_at) VALUES ('domain','fresco.com',NULL,?)`).run(now - DAY);
  // Consumido por cuenta real: uso con user_id.
  db.prepare(`INSERT INTO trial_used (kind, value, user_id, created_at) VALUES ('ig','consumido',77,?)`).run(now - 10 * DAY);
  // Ya entró: fila invitada (guest_ig), sin uso consumido.
  db.prepare(`INSERT INTO users (email, is_guest, guest_ig, guest_domain) VALUES ('guest-x@guest.invalid',1,'entrado','')`).run();
  // Migrado: is_guest=0 pero guest_ig queda (el upgrade no lo borra).
  db.prepare(`INSERT INTO users (email, is_guest, guest_ig, guest_domain) VALUES ('dueno@migrado.com',0,'migrado','')`).run();

  ok('G1 fresco: findUsed lo ve (registro de generación)', !!tl.findUsed(db, 'fresco', 'fresco.com'));
  ok('G2 fresco: findConsumedUsed NO lo ve (user_id NULL)', tl.findConsumedUsed(db, 'fresco', 'fresco.com') === null);
  ok('G3 fresco: findLock lo ve (candado de 90 días)', !!tl.findLock(db, 'fresco', 'fresco.com', now));
  ok('G4 fresco: sin fila invitada', gt.findGuestByIdentity(db, 'fresco', 'fresco.com') === null);
  ok('G5 consumido: findConsumedUsed lo ve', !!tl.findConsumedUsed(db, 'consumido', ''));
  ok('G6 consumido por dominio con user_id', (() => {
    db.prepare(`INSERT INTO trial_used (kind, value, user_id, created_at) VALUES ('domain','dom.com',55,?)`).run(now - 5 * DAY);
    return !!tl.findConsumedUsed(db, '', 'dom.com');
  })());
  ok('G7 entrado: findGuestByIdentity lo ve', !!gt.findGuestByIdentity(db, 'entrado', ''));
  ok('G8 migrado: findGuestByIdentity lo ve igual (guest_ig queda)', !!gt.findGuestByIdentity(db, 'migrado', ''));
  ok('G9 desconocido: nada lo ve', tl.findConsumedUsed(db, 'nadie', '') === null && gt.findGuestByIdentity(db, 'nadie', '') === null);
  db.close();
}

// ── H. E2E en boot aislado: generar → entrar → 200; 2ª entrada → 409 ────
(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-fix-entrada-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch {}
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    assert(up, 'el servidor no levantó:\n' + bootLog.slice(-1500));
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = path.join(dataDir, 'posta.db');
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    const rw = new DatabaseSync(dbPath);
    const now = Date.now();
    const mkWeek = (ig, business) => ({
      business, category: 'cafeteria', lang: 'es', ig, engine: 25,
      posts: [1, 2, 3].map((i) => ({
        type: 'image', image: PNG1, headline: `Posteo ${i} de ${business}`,
        caption: `Caption ${i} de ${business}`, hashtags: '#cafe',
      })),
      week: [], spots_left: 40,
    });
    const seedFresh = (ig, business) => {
      rw.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)')
        .run(ig, JSON.stringify(mkWeek(ig, business)), now);
      rw.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(ig, '', business, 'es', JSON.stringify(mkWeek(ig, business)), now - DAY, now - DAY);
      // La generación registra el uso con user_id NULL (trialLockRecordFor).
      rw.prepare(`INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('ig',?,NULL,?)`).run(ig, now - DAY);
    };
    seedFresh('frescoe2e', 'Café Fresco');
    seedFresh('consumidoe2e', 'Café Consumido');
    // Consumido de verdad: una cuenta real usó esa @ (user_id presente).
    rw.prepare(`UPDATE trial_used SET user_id = 999 WHERE kind = 'ig' AND value = 'consumidoe2e'`).run();
    seedFresh('viejolocke2e', 'Café Viejo');
    // Solo candado, sin fila en trial_used (generación anterior al lote
    // de uso permanente): tampoco bloquea la entrada.
    rw.prepare(`DELETE FROM trial_used WHERE kind = 'ig' AND value = 'viejolocke2e'`).run();

    const enter = async (ig, device) => {
      const r = await fetch(BASE + '/api/guest/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ig, domain: '', device, lang: 'es' }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    };

    // Trial fresco, mismo dispositivo que genera → 200 + sesión invitada.
    let e = await enter('frescoe2e', 'dvc_fresco_1');
    ok('H1 fresco entra: 200 + user_id', e.status === 200 && !!e.body.user_id, e);
    ok('H2 fresco entra: 3 posteos importados', e.body.posts === 3, e.body);
    const gRow = ro.prepare('SELECT id, is_guest, guest_ig FROM users WHERE id = ?').get(e.body.user_id);
    ok('H3 fresco entra: fila invitada con guest_ig', !!gRow && gRow.is_guest === 1 && gRow.guest_ig === 'frescoe2e', gRow);
    const usedAfter = ro.prepare("SELECT user_id FROM trial_used WHERE kind = 'ig' AND value = 'frescoe2e'").get();
    ok('H4 entrar no consume trial_used (sigue NULL: el reintento tras fallo sigue posible)', usedAfter && usedAfter.user_id === null, usedAfter);
    // Segunda entrada, otro dispositivo → 409 (ya entró).
    e = await enter('frescoe2e', 'dvc_otro_2');
    ok('H5 segunda entrada (otro dispositivo): 409 trial_used', e.status === 409 && e.body.trial_used === true, e);
    // Segunda entrada, MISMO dispositivo → 409 también (ya entró, no es
    // un segundo trial: la fila invitada manda sobre el dispositivo).
    e = await enter('frescoe2e', 'dvc_fresco_1');
    ok('H6 segunda entrada (mismo dispositivo): 409 trial_used', e.status === 409 && e.body.trial_used === true, e);
    // Consumido por cuenta real → 409 aunque tenga semana en caché.
    e = await enter('consumidoe2e', 'dvc_nuevo_9');
    ok('H7 consumido por cuenta real: 409 trial_used', e.status === 409 && e.body.trial_used === true, e);
    // La regla de dispositivo/IP (una prueba por dispositivo/IP) sigue
    // viva: como este test corre todo desde la misma IP, se limpia la
    // tabla entre casos para aislar el gate de identidad del de red.
    rw.prepare('DELETE FROM trial_devices').run();
    // Solo candado de 90 días, sin uso registrado → entra (el candado
    // bloquea la re-generación, no la entrada).
    e = await enter('viejolocke2e', 'dvc_viejo_1');
    ok('H8 solo candado (sin trial_used): 200, entra', e.status === 200 && !!e.body.user_id, e);
    // La misma IP con otro @ fresco → 409 device_used (la regla dura de
    // un trial por dispositivo/IP no se tocó: segunda persona en el mismo
    // Wi-Fi queda bloqueada, como antes).
    seedFresh('otroipe2e', 'Café Otra IP');
    e = await enter('otroipe2e', 'dvc_otraip_1');
    ok('H8b mismo IP, otro @ fresco: 409 device_used', e.status === 409 && e.body.device_used === true, e);
    rw.prepare('DELETE FROM trial_devices').run();
    // Sin semana en caché → 404 honesto, no 409 ni silencio.
    e = await enter('sinsemana', 'dvc_sin_1');
    ok('H9 sin semana: 404 no_week', e.status === 404 && e.body.no_week === true, e);
    ro.close(); rw.close();
  } finally {
    child.kill('SIGKILL');
  }
  console.log(`\n${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
