// test-feed-director.js — v332 DIRECCIÓN DE FEED para clientes (mandato
// 2026-10-22: la pericia de grilla del dogfood de Posty, aplicada a la
// grilla real de cada cliente).
//
// Parte A (pura, sin server): familias desde la medición, roles,
// similitud, el verificador mecánico de reglas y el compositor de orden
// sobre grillas sintéticas — feed cargado a oscuro, feed con patrón
// fuerte (v224), feed vacío/nacimiento, anclas ya programadas, piezas
// casi idénticas pegadas, cálida solitaria, pieza que pelea más allá de
// lo reparable (queda MARCADA, no escondida) — y la compuerta de
// portadas (natural / otro frame / grado solo a la portada).
//
// Parte B (sembrada de punta a punta): server real con DATA_DIR temporal,
// un feed real oscuro (2 publicados navy medidos de archivos reales), una
// semana desordenada (su orden de entrada viola la regla de las 3
// oscuras contra la cabeza real) y un reel navy; POST schedule-all →
// la composición queda registrada en feed_compositions, el orden
// programado ES el compuesto y la secuencia final pasa el verificador.
// Uso: node test-feed-director.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const fd = require('./feed-director');
const gridPattern = require('./grid-pattern');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

// ---------- fixtures de medición (como los devuelve grid-stats.py) ------
const DARK_NAVY = { lum: 0.12, sat: 0.55, hueFam: 'azul', hueShare: 0.8 };
const DARK_GREEN = { lum: 0.2, sat: 0.4, hueFam: 'verde', hueShare: 0.7 };
const LIGHT = { lum: 0.82, sat: 0.08, hueFam: 'neutro', hueShare: 0.1 };
const MID = { lum: 0.52, sat: 0.2, hueFam: 'azul', hueShare: 0.5 };
const WARM = { lum: 0.55, sat: 0.62, hueFam: 'naranja', hueShare: 0.9 };

const piece = (stats, extra) => Object.assign({ media_type: 'image', tipo: '', intent: '' }, stats, extra || {});
// lectura (más nuevo → más viejo) de un orden de publicación compuesto
const readingOf = (res, pieces, existing) => res.order.slice().reverse().map((ix) => pieces[ix]).concat(existing || []);
const weekViolations = (res, pieces, existing) => {
  const reading = readingOf(res, pieces, existing);
  return fd.verifyComposition(reading).filter((v) => v.at.some((i) => i < pieces.length));
};

console.log('— A1. Familias desde la medición (la paleta es la del feed del cliente)');
ok(fd.familyOf(DARK_NAVY) === 'escena-oscura', 'navy medido → escena-oscura');
ok(fd.familyOf(LIGHT) === 'placa-clara', 'claro neutro → placa-clara');
ok(fd.familyOf(WARM) === 'calida', 'naranja saturado y dominante → cálida (manda la temperatura)');
ok(fd.familyOf({ lum: 0.55, sat: 0.1, hueFam: 'naranja', hueShare: 0.9 }) === 'otra', 'naranja lavado (sat baja) NO es cálida: cae a otra');
ok(fd.familyOf({ lum: 0.55, sat: 0.6, hueFam: 'naranja', hueShare: 0.1 }) === 'otra', 'naranja apenas presente (share baja) NO es cálida');
ok(fd.familyOf({ lum: null }) === 'otra' && fd.familyOf(null) === 'otra', 'sin medición → otra (nunca se inventa familia)');

console.log('— A2. Roles rítmicos');
ok(fd.roleOf({ avatarProtagonist: true, media_type: 'image' }) === 'protagonista', 'avatar protagonista (marca v330) → protagonista');
ok(fd.roleOf({ media_type: 'video' }) === 'escena', 'video → escena');
ok(fd.roleOf({ media_type: 'image', tipo: 'producto estrella' }) === 'protagonista', 'tipo producto → protagonista');
ok(fd.roleOf({ media_type: 'image', tipo: 'placa de texto' }) === 'placa', 'tipo placa → placa');
ok(fd.roleOf({ media_type: 'image', role: 'placa', tipo: 'producto' }) === 'placa', 'rol explícito gana sobre el tipo');

console.log('— A3. Verificador mecánico y similitud');
const ident = piece(DARK_NAVY, { tipo: 'producto' });
ok(fd.nearIdentical(ident, piece(DARK_NAVY, { tipo: 'producto' })) === true, 'misma medición + mismo tipo + mismo formato = casi idénticas');
ok(fd.nearIdentical(ident, piece(DARK_NAVY, { tipo: 'ambiente' })) === false, 'distinto tipo no es idéntica');
ok(fd.nearIdentical(ident, piece(DARK_NAVY, { tipo: 'producto', media_type: 'video' })) === false, 'distinto formato no es idéntica');
ok(fd.nearIdentical(ident, piece({ lum: 0.35, sat: 0.5, hueFam: 'azul', hueShare: 0.7 }, { tipo: 'producto' })) === false, 'luminancia lejos (>0.08) no es idéntica');
ok(fd.verifyComposition([piece(DARK_NAVY), piece(DARK_GREEN), piece(DARK_NAVY)]).some((v) => v.rule === 'dark-run'), 'verificador: 3 oscuras seguidas = dark-run');
ok(fd.verifyComposition([piece(DARK_NAVY), piece(LIGHT), piece(DARK_NAVY)]).length === 0, 'verificador: oscuro-claro-oscuro pasa limpio');

console.log('— A4. Feed cargado a oscuro: la semana corta la racha contra la cabeza real');
{
  const existing = [piece(DARK_NAVY), piece(DARK_GREEN)]; // cabeza real: 2 oscuras (más nueva primero)
  const pieces = [
    piece(DARK_NAVY, { tipo: 'producto' }),   // 0
    piece(DARK_GREEN, { tipo: 'ambiente' }),  // 1
    piece(LIGHT, { tipo: 'placa de texto' }), // 2 — la clara que corta
    piece(MID, { tipo: 'proceso' }),          // 3
  ];
  // el orden de entrada (publicación 0,1,2,3) deja lectura [3,2,1,0,+cabeza]:
  // la pieza 0 (oscura) queda pegada a las 2 oscuras reales = racha de 3.
  const naive = fd.verifyComposition([pieces[3], pieces[2], pieces[1], pieces[0]].concat(existing));
  ok(naive.some((v) => v.rule === 'dark-run'), 'sanidad: el orden de entrada SÍ violaba la regla (test no vacío)');
  const res = fd.composeOrder({ pieces, existing, pattern: null, ahead: 0 });
  ok(weekViolations(res, pieces, existing).length === 0, 'compuesto: ninguna violación dura involucra piezas de la semana');
  ok(res.moves >= 1, 'compuesto: el orden cambió (moves ≥ 1)');
  ok(res.assignments.every((a) => a.family && a.role && a.why.length >= 1), 'cada pieza lleva familia, rol y su porqué');
  const res2 = fd.composeOrder({ pieces, existing, pattern: null, ahead: 0 });
  ok(JSON.stringify(res.order) === JSON.stringify(res2.order), 'determinístico: misma entrada, mismo orden');
}

console.log('— A5. Patrón fuerte del feed (v224): se respeta y se extiende');
{
  const pattern = { has: true, usable: true, checker: null, columns: { 0: { tone: 'claro' }, 1: { tone: 'oscuro' }, 2: { tone: 'claro' } } };
  const pieces = [
    piece(DARK_NAVY, { tipo: 'producto' }),
    piece(LIGHT, { tipo: 'placa de texto' }),
    piece(DARK_GREEN, { tipo: 'ambiente' }),
  ];
  const mismatches = (orderPub) => {
    const reading = orderPub.slice().reverse().map((ix) => pieces[ix]);
    let m = 0;
    reading.forEach((p, readPos) => {
      const t = gridPattern.toneTargetForFinalPos(pattern, readPos, pieces.length);
      if (!t || !t.tone) return;
      const fam = fd.familyOf(p);
      if (t.tone === 'claro' && fam === 'escena-oscura') m++;
      if (t.tone === 'oscuro' && fam === 'placa-clara') m++;
    });
    return m;
  };
  ok(mismatches([0, 1, 2]) === 3, 'sanidad: el orden de entrada pelea con el patrón en las 3 posiciones');
  const res = fd.composeOrder({ pieces, existing: [], pattern, ahead: 0 });
  ok(mismatches(res.order) < mismatches([0, 1, 2]), 'compuesto: menos choques con el patrón que la entrada');
  const mid = res.order.slice().reverse()[1];
  ok(fd.familyOf(pieces[mid]) === 'escena-oscura', 'la posición central (columna oscura del patrón) la ocupa una oscura');
}

console.log('— A6. Feed vacío / nacimiento: se impone el ritmo');
{
  const pieces = [
    piece(LIGHT, { tipo: 'placa de texto' }),
    piece(DARK_NAVY, { tipo: 'producto' }),
    piece(DARK_GREEN, { tipo: 'ambiente' }),
    piece(DARK_NAVY, { tipo: 'proceso' }),
  ];
  const res = fd.composeOrder({ pieces, existing: [], pattern: null, ahead: 0 });
  ok(fd.verifyComposition(readingOf(res, pieces, [])).length === 0, 'nacimiento: la semana sola ya cumple las reglas duras');
  ok(res.moves >= 1, 'nacimiento: hubo que mover (la entrada dejaba 3 oscuras en lectura)');
}

console.log('— A7. Anclas: lo ya programado no se mueve');
{
  const pieces = [
    piece(DARK_NAVY, { tipo: 'producto', fixed: true }),
    piece(DARK_GREEN, { tipo: 'ambiente' }),
    piece(DARK_NAVY, { tipo: 'proceso' }),
    piece(LIGHT, { tipo: 'placa de texto' }),
  ];
  const res = fd.composeOrder({ pieces, existing: [], pattern: null, ahead: 0 });
  ok(res.order[0] === 0, 'la pieza fijada conserva su rango de publicación');
  ok(fd.verifyComposition(readingOf(res, pieces, [])).length === 0, 'con el ancla puesta, el resto se acomoda sin violaciones');
}

console.log('— A8. Casi idénticas pegadas: se separan');
{
  const pieces = [
    piece(LIGHT, { tipo: 'placa de texto' }),
    piece(DARK_NAVY, { tipo: 'producto' }),
    piece(DARK_NAVY, { tipo: 'producto' }),
  ];
  const res = fd.composeOrder({ pieces, existing: [], pattern: null, ahead: 0 });
  const reading = readingOf(res, pieces, []);
  ok(!fd.verifyComposition(reading).some((v) => v.rule === 'identical-adjacent'), 'las dos escenas idénticas ya no quedan pegadas');
}

console.log('— A9. Lo irreparable se marca, no se esconde');
{
  const existing = [piece(DARK_NAVY), piece(DARK_GREEN)];
  const pieces = [piece(DARK_NAVY, { tipo: 'producto' }), piece(DARK_GREEN, { tipo: 'ambiente' }), piece(DARK_NAVY, { tipo: 'proceso' })];
  const res = fd.composeOrder({ pieces, existing, pattern: null, ahead: 0 });
  ok(res.remainingViolations.length >= 1, 'semana toda oscura contra feed oscuro: quedan violaciones declaradas');
  ok(res.flags.length >= 1 && res.flags.every((f) => f.reasons.length >= 1), 'las piezas en conflicto quedan marcadas con su motivo');
}
{
  const existing = [piece(LIGHT), piece(LIGHT)];
  const pieces = [piece(LIGHT, { tipo: 'placa de texto' }), piece(WARM, { tipo: 'producto' })];
  const res = fd.composeOrder({ pieces, existing, pattern: null, ahead: 0 });
  const warmFlag = res.flags.find((f) => f.idx === 1);
  ok(!!warmFlag && /única pieza cálida/.test(warmFlag.reasons.join(' ')), 'cálida solitaria en feed frío: marcada por temperatura ajena');
}

console.log('— A10. Compuerta de portadas (el video no se toca; la portada sí)');
{
  const g1 = fd.coverGate({ frames: [piece(LIGHT), piece(DARK_NAVY)], wantFamily: 'placa-clara' });
  ok(g1.action === 'natural' && g1.frameIx === 0, 'frame natural que combina → natural');
  const g2 = fd.coverGate({ frames: [piece(DARK_NAVY), piece(MID), piece(LIGHT)], wantFamily: 'placa-clara' });
  ok(g2.action === 'alt-frame' && g2.frameIx === 2, 'otro frame del mismo video combina → alt-frame');
  const g3 = fd.coverGate({ frames: [piece(DARK_NAVY), piece(DARK_GREEN)], wantFamily: 'placa-clara' });
  ok(g3.action === 'grade' && Math.abs(g3.targetLum - 0.8) < 0.001, 'ningún frame claro → grado a la portada (centro de la banda clara)');
  const g4 = fd.coverGate({ frames: [piece(LIGHT), piece(LIGHT)], wantFamily: 'escena-oscura' });
  ok(g4.action === 'grade' && Math.abs(g4.targetLum - 0.2) < 0.001, 'portada clara en slot oscuro → grado hacia la banda oscura');
  const g5 = fd.coverGate({ frames: [piece(DARK_NAVY)], wantFamily: 'calida' });
  ok(g5.action === 'keep', 'la familia cálida no se fabrica por tono → keep declarado');
  const g6 = fd.coverGate({ frames: [], wantFamily: 'placa-clara' });
  ok(g6.action === 'keep', 'sin frames medibles → keep');
}

// ============================ PARTE B ===================================
const TZ = 'America/Argentina/Buenos_Aires';
function todayYmdTz() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); }
function mondayKeyOf(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function shiftDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const THIS_MON = mondayKeyOf(todayYmdTz());
const NEXT_MON = shiftDays(THIS_MON, 7);
const PORT = 18746;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  console.log(`— B. Semana sembrada de punta a punta (lunes de la semana: ${NEXT_MON})`);
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-feeddir-'));
  const mediaDir = path.join(TMP, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  // Archivos reales medibles: sólidos con los colores del escenario.
  const mkImg = (name, rgb) => {
    execFileSync('python3', ['-c',
      `from PIL import Image; Image.new('RGB',(240,300),(${rgb})).save(r'''${path.join(mediaDir, name)}''','JPEG',quality=90)`]);
  };
  mkImg('pub-dark1.jpg', '12,26,44');
  mkImg('pub-dark2.jpg', '16,30,48');
  mkImg('d-dark1.jpg', '14,28,46');
  mkImg('d-dark2.jpg', '20,36,58');
  mkImg('d-light.jpg', '238,236,228');
  mkImg('d-warm.jpg', '226,138,44');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x0A1E33:s=96x96:d=2:r=10',
    '-pix_fmt', 'yuv420p', path.join(mediaDir, 'vid.mp4')]);

  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken215' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'server booteó');
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const bcrypt = require('bcryptjs');
    const ins = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('feeddir@test.local', bcrypt.hashSync('test1234', 10));
    const uid = Number(ins.lastInsertRowid);
    db.prepare("UPDATE users SET plan = 'premium' WHERE id = ?").run(uid);
    db.prepare('INSERT INTO profiles (user_id, business_name, category) VALUES (?, ?, ?)').run(uid, 'Feed Test', 'cafeteria');
    const insPost = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, published_at, status, media_type, needs_review, week_key, tipo, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const pubAt = (daysAgo) => `${shiftDays(todayYmdTz(), -daysAgo)} 15:00:00`;
    insPost.run(uid, '/media/pub-dark1.jpg', 'pub1', '', null, pubAt(1), 'published', 'image', 0, THIS_MON, 'ambiente', pubAt(1));
    insPost.run(uid, '/media/pub-dark2.jpg', 'pub2', '', null, pubAt(2), 'published', 'image', 0, THIS_MON, 'proceso', pubAt(2));
    // Semana DESORDENADA (orden de creación = orden de publicación de entrada):
    // lectura de entrada [vid osc, cálida, clara, osc2, osc1, pub1, pub2] →
    // osc1+osc2 quedan contra las 2 publicadas oscuras: racha de oscuras.
    const seed = [
      ['/media/d-dark1.jpg', 'image', 'producto'],
      ['/media/d-dark2.jpg', 'image', 'ambiente'],
      ['/media/d-light.jpg', 'image', 'placa de texto'],
      ['/media/d-warm.jpg', 'image', 'novedad'],
      ['/media/vid.mp4', 'video', 'reel'],
    ];
    const ids = seed.map(([img, mt, tipo], i) => Number(insPost.run(
      uid, img, 'draft ' + i, '', null, null, 'draft', mt, 0, NEXT_MON, tipo,
      `2026-10-20 10:00:0${i}`).lastInsertRowid));
    db.close();

    const lr = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'feeddir@test.local', password: 'test1234' }),
    });
    const cookies = lr.headers.getSetCookie ? lr.headers.getSetCookie() : [];
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    ok(lr.ok && !!cookie, 'login del usuario sembrado');
    const sr = await fetch(`${BASE}/api/posts/schedule-all`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}',
    });
    const sdata = await sr.json().catch(() => ({}));
    ok(sr.ok && sdata.ok, `schedule-all programó la semana (status ${sr.status})`);

    const db2 = new DatabaseSync(path.join(TMP, 'posta.db'));
    const compRow = db2.prepare('SELECT data_json FROM feed_compositions WHERE user_id = ? AND week_key = ?').get(uid, NEXT_MON);
    ok(!!compRow, 'la composición quedó registrada en feed_compositions');
    const rec = compRow ? JSON.parse(compRow.data_json) : {};
    ok(JSON.stringify(rec.beforeOrder) === JSON.stringify(ids), 'el registro guarda el orden de entrada (beforeOrder)');
    ok(Array.isArray(rec.order) && rec.order.length === ids.length && ids.every((id) => rec.order.includes(id)), 'el registro trae el orden compuesto completo');
    ok(rec.moves >= 1, 'la composición movió piezas (la entrada violaba la regla)');
    const sched = db2.prepare(`SELECT id FROM posts WHERE user_id = ? AND week_key = ? AND status = 'scheduled' ORDER BY scheduled_at ASC`).all(uid, NEXT_MON).map((r) => r.id);
    ok(JSON.stringify(sched) === JSON.stringify(rec.order), 'el orden PROGRAMADO es exactamente el orden compuesto');
    // Verificación mecánica sobre la secuencia final, con las familias del
    // propio registro + la cabeza real medida.
    const famById = new Map((rec.assignments || []).map((a) => [a.postId, a.family]));
    const seedById = new Map(ids.map((id, i) => [id, seed[i]]));
    const readingFinal = rec.order.slice().reverse().map((id) => ({
      family: famById.get(id), media_type: seedById.get(id)[1], tipo: seedById.get(id)[2], lum: null,
    }));
    const head = (rec.existingHead || []).map((t) => ({ family: t.family, media_type: t.media_type || 'image', tipo: '', lum: t.lum }));
    const viols = fd.verifyComposition(readingFinal.concat(head)).filter((v) => v.at.some((i) => i < rec.order.length));
    ok(viols.length === 0, 'la secuencia final pasa el verificador (sin rachas de 3 oscuras ni idénticas pegadas)');
    const vidAsg = (rec.assignments || []).find((a) => a.postId === ids[4]);
    ok(!!vidAsg && !!vidAsg.cover && ['natural', 'alt-frame', 'grade', 'keep'].includes(vidAsg.cover.action),
      `el reel pasó por la compuerta de portadas (acción: ${vidAsg && vidAsg.cover ? vidAsg.cover.action : '—'})`);
    if (vidAsg && vidAsg.cover && (vidAsg.cover.action === 'alt-frame' || vidAsg.cover.action === 'grade')) {
      const vidRow = db2.prepare('SELECT cover_path FROM posts WHERE id = ?').get(ids[4]);
      ok(!!vidRow.cover_path && fs.existsSync(path.join(mediaDir, path.basename(vidRow.cover_path))),
        'la portada elegida/graduada existe en disco y quedó en posts.cover_path (el video intacto)');
    }
    ok((rec.assignments || []).every((a) => a.family && a.why && a.why.length >= 1), 'cada pieza del registro lleva familia y porqué');
    db2.close();
  } catch (e) {
    fails++; console.error('  ✗ excepción en la parte B:', e.message);
    console.error(srvLog.slice(-1500));
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
  }

  console.log(`\n${fails === 0 ? '✅' : '❌'} test-feed-director: ${total - fails}/${total} verificaciones OK`);
  process.exit(fails ? 1 : 0);
})();
