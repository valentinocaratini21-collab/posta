// test-visibilidad.js — mecanismos 3·4·5 (server) de la capa de visibilidad.
// Uso: NODE_PATH=~/workspace/posta-build/node_modules node test-visibilidad.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const V = require('./visibility');

let fails = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log('  ✓', m); else { fails++; console.error('  ✗', m); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-vis-'));
const db = new DatabaseSync(path.join(TMP, 't.db'));
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT, plan_status TEXT, referred_by INTEGER, lang TEXT DEFAULT 'es');
CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', category TEXT DEFAULT 'otro', subrubro TEXT DEFAULT '', ig_username TEXT DEFAULT '');
CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires');
CREATE TABLE client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT DEFAULT '{}');`);
V.initSchema(db);
V.initSchema(db); // idempotente
ok(true, 'initSchema corre dos veces sin romper');

db.prepare("INSERT INTO users (id, email, plan, plan_status) VALUES (1, 'dueno@test', 'esencial', 'active')").run();
db.prepare("INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (1, 'Café Uno', 'cafeteria', 'cafeuno')").run();
db.prepare("INSERT INTO settings (user_id) VALUES (1)").run();
db.prepare("INSERT INTO client_digest (user_id, digest_json) VALUES (1, ?)").run(JSON.stringify({ rubro: 'cafetería', ciudad: 'Palermo, Buenos Aires' }));

// --- Mecanismo 4: caps ---
let st = V.visibilityState(db, 1);
ok(st.prompts.ref_schedule.show === true && st.prompts.ref_letter.show === true, 'sin mostrar: ambas superficies elegibles');
ok(st.referral.count === 0 && st.referral.thanks === false, 'referidos 0: no agradece todavía');
// Referidos activos: 2 usuarios referidos por 1 con plan activo
db.prepare("INSERT INTO users (id, email, plan, plan_status, referred_by) VALUES (7, 'a@t', 'esencial', 'active', 1), (8, 'b@t', 'pro', 'active', 1), (9, 'c@t', 'esencial', 'trial', 1)").run();
st = V.visibilityState(db, 1);
ok(st.referral.count === 2 && st.referral.thanks === true && st.referral.discount_active === true, 'referidos: cuentan solo los activos (2), thanks con la meta cumplida');
// usuario sin referidos para probar caps puros
db.prepare("INSERT INTO users (id, email, plan, plan_status) VALUES (2, 'dos@test', 'esencial', 'active')").run();
db.prepare("INSERT INTO profiles (user_id, business_name) VALUES (2, 'Negocio Dos')").run();
db.prepare("INSERT INTO settings (user_id) VALUES (2)").run();
const tz = 'America/Argentina/Buenos_Aires';
const ymd = V._internal.localYmd(tz);
const week = V._internal.mondayOf(ymd);
V._internal.markShown(db, 2, 'ref_schedule', ymd, week);
st = V.visibilityState(db, 2);
ok(st.prompts.ref_schedule.show === false && st.prompts.ref_schedule.reason === 'cap_semanal', 'cap: misma superficie no repite en la semana');
ok(st.prompts.ref_letter.show === false && st.prompts.ref_letter.reason === 'otra_superficie_hoy', 'cap cruzado: la otra superficie no sale el mismo día');
// semana siguiente: vuelve a ser elegible (simulamos fila de la semana pasada)
db.prepare("UPDATE visibility_prompts SET last_shown_week = '2000-01-03', last_shown_day = '2000-01-03' WHERE user_id = 2").run();
st = V.visibilityState(db, 2);
ok(st.prompts.ref_schedule.show === true, 'semana nueva: la superficie vuelve a ser elegible');

// --- Mecanismo 3: FOMO ---
const stubDiscover = async () => ([
  { name: 'Café Rival', website: 'https://caferival.com.ar/' },
  { name: 'Café Rival Sucursal', website: 'https://www.caferival.com.ar/sucursal' }, // mismo dominio → dedupe
  { name: 'Café Tres', website: '' }, // sin website → clave por nombre+zona
]);
(async () => {
  const r1 = await V.enqueueForClient(db, 1, 'test', stubDiscover);
  ok(r1.queued === 2, 'FOMO: encola 2 (dedupe por dominio), obtuvo ' + r1.queued);
  const rows = db.prepare('SELECT * FROM fomo_queue').all();
  ok(rows.length === 2 && rows.every(r => r.status === 'encolado'), 'FOMO: filas en estado encolado (nada enviado)');
  ok(rows.every(r => !r.copy_body.includes('Café Uno')), 'FOMO: el copy NO nombra al cliente disparador');
  ok(rows[0].copy_subject.includes('cafetería') && rows[0].copy_subject.includes('Palermo'), 'FOMO: copy parametrizado rubro+zona');
  const r2 = await V.enqueueForClient(db, 1, 'test', stubDiscover);
  ok(r2.already === true, 'FOMO: segundo disparo del mismo cliente = idempotente');
  // Sweep: usuario 2 pago sin trigger → lo procesa (sin key de Places, descubre 0)
  delete process.env.GOOGLE_PLACES_KEY;
  const n = await V.sweepNewPaidUsers(db);
  const trig2 = db.prepare('SELECT * FROM fomo_triggers WHERE user_id = 2').get();
  ok(n >= 1 && !!trig2, 'FOMO sweep: detecta la cuenta paga nueva y registra el trigger');
  const n2 = await V.sweepNewPaidUsers(db);
  ok(n2 === 0, 'FOMO sweep: segunda pasada no reprocesa a nadie');

  // --- Mecanismo 5 + endpoints (HTTP smoke con express) ---
  const express = require('express');
  const app = express();
  const auth = (req, res, next) => { req.session = { userId: 1 }; next(); };
  const adm = (req, res, next) => next();
  V.registerVisibility(app, db, { requireAuth: auth, requireAdminToken: adm });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const get = (p) => fetch(base + p).then(r => r.json());

  let resp = await post('/api/visibility/bio-seal', { state: 'accepted' });
  const prof = db.prepare('SELECT bio_seal FROM profiles WHERE user_id = 1').get();
  ok(resp.ok === true && prof.bio_seal === 'accepted', 'sello de bio: accepted queda registrado en el perfil');
  resp = await post('/api/visibility/bio-seal', { state: 'cualquier' });
  ok(resp.ok === false, 'sello de bio: estado inválido rechazado');
  resp = await get('/api/visibility/state');
  ok(resp.bio_seal && resp.bio_seal.state === 'accepted', 'state: expone el sello aceptado (la tarjeta no vuelve a ofrecerse)');
  resp = await post('/api/visibility/shown', { surface: 'ref_letter' });
  ok(resp.ok === true, 'shown: marca la superficie de la carta');
  resp = await post('/api/visibility/shown', { surface: 'otra' });
  ok(resp.ok === false, 'shown: superficie inválida rechazada');
  resp = await get('/api/admin/visibility/fomo');
  ok(resp.ok === true && resp.counts.encolado === 2 && resp.email_configured === false, 'admin FOMO: cola visible, envío bloqueado sin RESEND_API_KEY');
  srv.close();

  console.log(`\n${total - fails}/${total} OK`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
