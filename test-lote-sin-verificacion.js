// ════════════════════════════════════════════════════════════════════
// LOTE SIN-VERIFICACION + APROBALO-FUERA (dueño, 26/11 + 27/11/2026)
//
// Doctrina: un posteo PROGRAMADO sale a su hora SIN aprobación del
// dueño; el botón «Aprobalo» es innecesario y sale de la app. Lo
// único que frena una salida es la mano del dueño (Frenar / Eliminar
// / vetar) o los frenos que no son aprobación (plan/prueba, control
// de calidad needs_review, integridad).
//
// Esta suite prueba, contra el árbol del lote:
//   A. Anclas estáticas: la compuerta murió en scheduler.js (sin
//      evento gate_no_approval, sin «sin aprobación», sin notifyMissed
//      en processDuePosts) y ningún render del cliente emite ya el
//      botón de aprobar un posteo (hoy, detalle, tarjeta unificada).
//      El Aceptar del BORRADOR (programarlo es una decisión) queda.
//   B. El aviso de 30 minutos: un pending con trust 0 ya se trata
//      como piloto automático (freno de emergencia), nunca como
//      «última llamada» de aprobación.
//   C. Conducta real con la DB y el scheduler reales (modo demo):
//      (i) un programado SIN aprobación y con trust 0 PUBLICA a su
//      hora y su approval queda asentado 'auto'; (ii) un vetado
//      (rejected) NO publica: queda cancelado; un borrador frenado
//      queda intacto; el hold de calidad (needs_review) sigue
//      frenando; un aprobado de control publica como siempre.
//   D. Render real (VM) de la tarjeta de Hoy: sin botón «Aprobalo»,
//      con la línea «Sale … ✓» y Editar / Frenar / Eliminar vivos.
//
// Uso: NODE_PATH=~/workspace/posta/node_modules node test-lote-sin-verificacion.js
// ════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let okN = 0, malN = 0;
function ok(cond, label) {
  if (cond) { okN++; console.log('  ✓ ' + label); }
  else { malN++; console.log('  ✗ MAL: ' + label); }
}
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// Extrae el cuerpo completo de `function nombre(...) { ... }` por
// balanceo de llaves (para anclas acotadas a una función y para VM).
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return '';
}

async function main() {
  console.log('— A. anclas estáticas —');
  const sch = read('scheduler.js');
  const app = read('public/app.js');
  const dueBody = extractFn(sch, 'processDuePosts');
  ok(dueBody.length > 500, 'processDuePosts extraído del scheduler');
  ok(!dueBody.includes("kind: 'gate_no_approval'"), 'scheduler: processDuePosts ya no emite el evento gate_no_approval');
  ok(!dueBody.includes('await approval.notifyMissed'), 'scheduler: processDuePosts ya no avisa «no publiqué» por falta de aprobación');
  ok(!dueBody.includes('trustLevel'), 'scheduler: processDuePosts ya no lee el nivel de confianza para publicar');
  ok(!sch.includes(".run('sin aprobación'"), 'scheduler: ningún camino marca failed «sin aprobación»');
  ok(dueBody.includes("=== 'rejected'") && dueBody.includes("'cancelled'"), 'scheduler: el veto del dueño (rejected) sigue cancelando el posteo');

  const hoyBody = extractFn(app, 'pzHoyCardHTML');
  ok(hoyBody.length > 500, 'pzHoyCardHTML extraída del bundle');
  ok(!hoyBody.includes('data-pz-hoy-aprobar=') && !hoyBody.includes('Aprobalo ✓</button>'), 'hoy: la tarjeta no emite botón «Aprobalo» en ninguna variante');
  ok(hoyBody.includes('data-pz-hoy-editar') && hoyBody.includes('data-pz-hoy-frenar') && hoyBody.includes('data-pz-hoy-eliminar'), 'hoy: Editar / Frenar / Eliminar siguen en la tarjeta');

  const cardBody = extractFn(app, 'postCardHTML');
  ok(cardBody.length > 500 && !cardBody.includes('data-pc-act="approve"'), 'semana/agenda: la tarjeta unificada ya no emite «Aprobar»');

  const detBody = extractFn(app, 'approvalPostView');
  ok(detBody.length > 500 && !detBody.includes('id="apvAccept"'), 'detalle: el primario «Aceptar» del programado salió');
  ok(detBody.includes('id="apvAcceptDraft"'), 'detalle: el «Aceptar» del BORRADOR queda (programar es una decisión, no una aprobación)');
  ok(detBody.includes('apvSaleZone') && detBody.includes('id="apvHold"'), 'detalle: la zona de salida (Sale ✓ + Frenar) cubre a todo programado no vetado');
  ok(!app.includes('id="apvAccept"'), 'bundle: no queda ningún render con id apvAccept');
  ok(!app.includes('data-pz-hoy-aprobar='), 'bundle: ningún render emite el atributo del botón de hoy');
  ok(!app.includes('En modo manual, nada sale sin tu OK.') && !app.includes('In manual mode, nothing goes out without your OK.'), 'copia: la tarjeta «¿Cómo publica Posty?» ya no promete un modo que espera OK (ES+EN)');

  console.log('— B. aviso de 30 minutos = freno, no compuerta —');
  const UN = require('./upcoming-notice');
  const fakeDb = { prepare: () => ({ get: () => null }) };
  ok(UN._internal.modeFor(fakeDb, { auto_published: 0, approval: 'pending' }, { trust_level: 0 }) === 'autopilot',
    'upcoming-notice: pending con trust 0 → modo autopilot (el aviso es el freno de emergencia)');
  ok(UN._internal.eligible(fakeDb, { auto_published: 0, approval: 'pending' }, { trust_level: 0 }) === true,
    'upcoming-notice: el pending trust 0 SIGUE recibiendo el aviso de 30 min');

  console.log('— C. conducta real: el scheduler publica sin aprobación —');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-sv-'));
  const dataDir = path.join(tmp, 'data');
  const mediaDir = path.join(tmp, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  for (let i = 1; i <= 5; i++) fs.writeFileSync(path.join(mediaDir, 'semilla' + i + '.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9, i]));
  process.env.DATA_DIR = dataDir;
  process.env.MEDIA_DIR = mediaDir;
  const db = require('./db');
  const scheduler = require('./scheduler');
  const past = new Date(Date.now() - 10 * 60000).toISOString().replace('T', ' ').slice(0, 19);
  const insU = db.prepare("INSERT INTO users (email, password_hash, plan_status, trust_level) VALUES (?, 'x', 'active', 0)");
  const uid = Number(insU.run('sv@test.dev').lastInsertRowid);
  db.prepare("INSERT INTO settings (user_id, demo_mode, timezone) VALUES (?, 1, 'America/New_York')").run(uid);
  const insP = db.prepare(`INSERT INTO posts (user_id, image_path, caption, scheduled_at, status, approval, auto_published, needs_review, media_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'image')`);
  const pSinOk = Number(insP.run(uid, '/media/semilla1.jpg', 'Posteo sin aprobación (trust 0)', past, 'scheduled', 'pending', 0, 0).lastInsertRowid);
  const pVetado = Number(insP.run(uid, '/media/semilla2.jpg', 'Posteo vetado por el dueño', past, 'scheduled', 'rejected', 0, 0).lastInsertRowid);
  const pFrenado = Number(insP.run(uid, '/media/semilla3.jpg', 'Borrador frenado por el dueño', past, 'draft', 'pending', 0, 0).lastInsertRowid);
  const pCalidad = Number(insP.run(uid, '/media/semilla4.jpg', 'Posteo en control de calidad', past, 'scheduled', 'pending', 0, 1).lastInsertRowid);
  const pControl = Number(insP.run(uid, '/media/semilla5.jpg', 'Posteo aprobado de control', past, 'scheduled', 'approved', 0, 0).lastInsertRowid);

  await scheduler.processDuePosts(db);
  const row = (id) => db.prepare('SELECT status, approval, error FROM posts WHERE id = ?').get(id);
  const r1 = row(pSinOk);
  ok(r1.status === 'published', '(i) el programado SIN aprobación y con trust 0 PUBLICÓ a su hora');
  ok(r1.approval === 'auto', "(i) su approval quedó asentado 'auto' (se publica solo; dato, no compuerta)");
  const gateEvents = db.prepare("SELECT COUNT(*) AS n FROM events WHERE name = 'post_failed' AND props LIKE '%gate_no_approval%'").get().n;
  ok(gateEvents === 0, '(i) no existe ningún evento post_failed gate_no_approval');
  const r2 = row(pVetado);
  ok(r2.status === 'cancelled', '(ii) el posteo vetado (rejected) NO publicó: quedó cancelado');
  ok(row(pFrenado).status === 'draft', '(ii) el borrador frenado por el dueño quedó intacto');
  ok(row(pCalidad).status === 'scheduled', '(ii) el hold de calidad (needs_review) sigue frenando la salida');
  ok(row(pControl).status === 'published', '(control) el posteo aprobado publica como siempre');

  console.log('— D. render de la tarjeta de Hoy (VM) —');
  const fns = ['mv', 'pcParseDate', 'pzWhenRelDay', 'pzHoyHoraCorta', 'pzHoyCuandoCorto', 'pzHoyPillSalida', 'pzHoyCardHTML'];
  const parts = fns.map((n) => extractFn(app, n));
  ok(parts.every((s) => s.length > 100), 'VM: funciones de la tarjeta extraídas del bundle real');
  const code = parts.join('\n');
  const sandbox = {
    console,
    pzIc: () => '',
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const schedIso = new Date(Date.now() + 2 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const carta = {
    id: 501, status: 'scheduled', approval: 'pending', media_type: 'image',
    image_path: '/media/semilla1.jpg', caption: 'Promo del día en el local',
    caption_corta: 'Promo del día', rubro: 'Cafetería', scheduled_at: schedIso,
  };
  const hero = sandbox.pzHoyCardHTML(carta, { hero: true, tz: 'UTC' });
  ok(typeof hero === 'string' && hero.length > 200, 'VM: la tarjeta héroe rinde');
  ok(!hero.includes('Aprobalo') && !hero.includes('pz-hoy-aprobar'), '(iii) la tarjeta de hoy NO muestra el botón «Aprobalo»');
  ok(/Sale hoy · .* ✓/.test(hero), '(iii) la tarjeta dice la verdad de la salida: «Sale hoy · hora ✓»');
  ok(hero.includes('Editar') && hero.includes('Frenar') && hero.includes('Eliminar') && hero.includes('data-pz-hoy-frenar'), '(iii) Editar / Frenar / Eliminar intactos en la tarjeta');
  const compacta = sandbox.pzHoyCardHTML(carta, { tz: 'UTC' });
  ok(!compacta.includes('Aprobalo') && /Sale hoy · .* ✓/.test(compacta),
    '(iii) la variante compacta: sin «Aprobalo», con su «Sale … ✓»');

  try { db.close(); } catch (e) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n== RESULTADO: ${okN} ok · ${malN} MAL ==`);
  process.exit(malN ? 1 : 0);
}

main().catch((e) => { console.error('EXCEPCIÓN:', e); process.exit(2); });
