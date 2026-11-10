'use strict';
// (LOTE ESTRATEGIA-SEMANA · 10/11 · v852) Suite de la estrategia de la
// semana (§§11–13 de la spec): la fila se escribe por admin y se lee en
// ideasInputFor (brief) y en el pipeline (PORQUÉ por posición) · sin fila,
// la generación corre como hoy · la estrategia llega al prompt de
// openaiIdeas junto a businessContext y la REGLA CRÍTICA · el PORQUÉ del
// plan aterriza en strategy_why (ES con porque, EN con porque_en) ·
// needs_review nunca se salta por estrategia · los gates (veto,
// placeholder, rubro) ganan a la estrategia · espejo ES+EN en el PORQUÉ
// · un mensaje por día: la fila no crea push ni chat. Boot real del
// servidor en proceso (patrón test-album-ritual.js) + generador directo
// (patrón test-lote-analisis-diario.js).
const fs = require('fs');
const os = require('os');
const path = require('path');

// Bootstrap: server.js necesita express & co. de ~/workspace/posta/
// node_modules. Si NODE_PATH no lo incluye, re-ejecuto este mismo script
// con NODE_PATH (una sola vez; el flag evita el bucle).
const POSTA_NM = '/home/hatch/workspace/posta/node_modules';
try { require.resolve('express'); } catch (e) {
  if (!process.env.V852_BOOTSTRAPPED) {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_PATH: POSTA_NM, V852_BOOTSTRAPPED: '1' },
    });
    process.exit(r.status == null ? 1 : r.status);
  }
  throw new Error('express no resuelve ni con NODE_PATH=' + POSTA_NM);
}

const TREE = __dirname;
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const GEN = fs.readFileSync(path.join(TREE, 'generator.js'), 'utf8');
const { generateIdeas } = require(path.join(TREE, 'generator.js'));

const PORT = 34660;
const ADMIN_TOKEN = 'boot-test-token-estrategia';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-estrategia-'));
process.env.DATA_DIR = TMP;
process.env.PORT = String(PORT);
process.env.ADMIN_TOKEN = ADMIN_TOKEN;
process.env.SESSION_SECRET = 'estrategia-secret';
delete process.env.OPENAI_API_KEY;
delete process.env.RESEND_API_KEY;

let pass = 0, fail = 0;
function t(name, ok, extra) {
  if (ok) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); }
}
function mondayOfInTz(tz, instant) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function shiftYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const TZ = 'America/New_York';
const WEEK = mondayOfInTz(TZ, new Date());
const BASE = 'http://127.0.0.1:' + PORT;
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function api(method, pathUrl, body) {
  const r = await fetch(BASE + pathUrl, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}

const ESTRATEGIA = {
  narrativa: 'Semana del 2x1: el gancho es el 2x1 del latte, con la foto del producto al frente.',
  pesar_mas: 'fotos del producto',
  no_repetir: 'el reel largo de la semana pasada',
  dias: [
    { dia: WEEK, angulo: 'el 2x1 del latte', formato: 'foto', porque: 'el 2x1 es tu gancho de la semana', porque_en: 'the 2-for-1 is your hook this week' },
    { dia: shiftYmd(WEEK, 1), angulo: 'detrás del mostrador', formato: 'foto', porque: 'la gente quiere ver quién hace el café' },
    { dia: shiftYmd(WEEK, 2), angulo: 'el testimonio de Ana', formato: 'foto', porque: 'el testimonio vende más que la promo', porque_en: 'the testimonial sells more than the promo' },
  ],
};
const INPUT_BASE = {
  business: 'Café de la casa',
  category: 'cafetería',
  description: 'Cafetería de barrio con latte de la casa y medialunas caseras.',
  dna: { producto_estrella: 'Latte de la casa', cliente_ideal: 'vecinos del barrio', diferencial: 'el latte lo hace Ana a mano' },
  tone: 'cercano',
  learnings: '',
};
function stubIdeasList() {
  return [
    { titulo: 'El 2x1 del latte', formato: 'foto', tipo: 'promo', angulo: 'el 2x1 del latte', porque: 'porque el 2x1 trae gente nueva' },
    { titulo: 'Detrás del mostrador', formato: 'foto', tipo: 'social', angulo: 'detrás del mostrador', porque: 'porque la gente quiere ver quién hace el café' },
    { titulo: 'El latte de la casa, hecho con amor', formato: 'foto', tipo: 'social', angulo: 'el latte de la casa', porque: 'porque es tu producto estrella' },
    { titulo: 'La medialuna de la casa', formato: 'foto', tipo: 'social', angulo: 'la medialuna casera', porque: 'porque es lo que más se vende a la mañana' },
    { titulo: 'El testimonio de Ana', formato: 'foto', tipo: 'social', angulo: 'el testimonio de Ana', porque: 'porque el testimonio vende más que la promo' },
    { titulo: 'El café de la tarde', formato: 'foto', tipo: 'social', angulo: 'el café de la tarde', porque: 'porque la tarde es tu hora floja' },
    { titulo: 'El rincón del café', formato: 'foto', tipo: 'social', angulo: 'el rincón del local', porque: 'porque el local es parte del producto' },
  ];
}

(async () => {
  const db = require('./db');
  const srv = require('./server');
  t('boot: el servidor levanta con el lote', await waitBoot());
  t('boot: helpers de estrategia exportados', typeof srv.estrategiaSemanaParaBrief === 'function' && typeof srv.estrategiaPorqueParaPos === 'function' && typeof srv.aplicarEstrategiaAPicks === 'function' && typeof srv.leerEstrategiaSemana === 'function' && typeof srv.normalizarEstrategia === 'function',
    'brief=' + typeof srv.estrategiaSemanaParaBrief + ' porque=' + typeof srv.estrategiaPorqueParaPos + ' aplicar=' + typeof srv.aplicarEstrategiaAPicks);

  // Siembra: user 12 (es) + user 14 (en) + user 13 vacío (sin estrategia).
  db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (12, 'estrategia-12@test.invalid', 'x')`).run();
  db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (13, 'estrategia-13@test.invalid', 'x')`).run();
  db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (14, 'estrategia-14@test.invalid', 'x')`).run();
  db.prepare(`UPDATE users SET lang = 'en' WHERE id = 14`).run();
  db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, 'America/New_York')`).run();
  db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (13, 'America/New_York')`).run();
  db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (14, 'America/New_York')`).run();
  const countPush = () => {
    try { return db.prepare('SELECT COUNT(*) AS n FROM morning_post_push WHERE user_id IN (12, 14)').get().n; } catch (e) { return 0; }
  };
  const countChats = () => {
    try { return db.prepare('SELECT COUNT(*) AS n FROM posty_chats WHERE user_id IN (12, 14)').get().n; } catch (e) { return 0; }
  };
  const pushAntes = countPush();
  const chatsAntes = countChats();

  // ===== A) POST /api/admin/estrategia-semana =====
  const aSin = await api('POST', '/api/admin/estrategia-semana', { user_id: 12, week_key: WEEK, estrategia: ESTRATEGIA });
  t('A1: POST sin token → 403', aSin.status === 403, 'status=' + aSin.status);
  const aUid = await api('POST', `/api/admin/estrategia-semana?token=${ADMIN_TOKEN}`, { week_key: WEEK, estrategia: ESTRATEGIA });
  t('A2: sin user_id → 400 sin_usuario', aUid.status === 400 && aUid.json && aUid.json.error === 'sin_usuario',
    'status=' + aUid.status + ' body=' + JSON.stringify(aUid.json));
  const aWk = await api('POST', `/api/admin/estrategia-semana?token=${ADMIN_TOKEN}`, { user_id: 12, week_key: 'no-fecha', estrategia: ESTRATEGIA });
  t('A3: week_key inválido → 400 week_key_invalido', aWk.status === 400 && aWk.json && aWk.json.error === 'week_key_invalido',
    'status=' + aWk.status + ' body=' + JSON.stringify(aWk.json));
  const aInv = await api('POST', `/api/admin/estrategia-semana?token=${ADMIN_TOKEN}`, { user_id: 12, week_key: WEEK, estrategia: 'texto' });
  t('A4: estrategia no-objeto → 400 estrategia_invalida', aInv.status === 400 && aInv.json && aInv.json.error === 'estrategia_invalida',
    'status=' + aInv.status + ' body=' + JSON.stringify(aInv.json));
  const aVacia = await api('POST', `/api/admin/estrategia-semana?token=${ADMIN_TOKEN}`, { user_id: 12, week_key: WEEK, estrategia: {} });
  t('A5: estrategia vacía → 400 estrategia_vacia', aVacia.status === 400 && aVacia.json && aVacia.json.error === 'estrategia_vacia',
    'status=' + aVacia.status + ' body=' + JSON.stringify(aVacia.json));
  const aOk = await api('POST', `/api/admin/estrategia-semana?token=${ADMIN_TOKEN}`, { user_id: 12, week_key: WEEK, estrategia: ESTRATEGIA });
  t('A6: POST válido → 200 + ok + user_id + week_key', aOk.status === 200 && aOk.json && aOk.json.ok === true && aOk.json.user_id === 12 && aOk.json.week_key === WEEK,
    'status=' + aOk.status + ' body=' + JSON.stringify(aOk.json));
  let row12 = null;
  try { row12 = db.prepare('SELECT * FROM estrategia_semana WHERE user_id = 12 AND week_key = ?').get(WEEK); } catch (e) { row12 = null; }
  let parsed12 = null;
  try { parsed12 = row12 && JSON.parse(row12.estrategia_json); } catch (e) {}
  t('A7: la fila quedó guardada (narrativa + pesar_más + no_repetir + 3 días con porque_en)',
    !!parsed12 && parsed12.narrativa === ESTRATEGIA.narrativa && parsed12.pesar_mas === 'fotos del producto' && parsed12.no_repetir === 'el reel largo de la semana pasada' && parsed12.dias.length === 3 && parsed12.dias[0].porque_en === 'the 2-for-1 is your hook this week',
    'row=' + JSON.stringify(row12));
  const aUp = await api('POST', `/api/admin/estrategia-semana?token=${ADMIN_TOKEN}`, { user_id: 12, week_key: WEEK, estrategia: { ...ESTRATEGIA, narrativa: 'Semana del 2x1, segunda vuelta.' } });
  let nFilas = -1;
  try { nFilas = db.prepare('SELECT COUNT(*) AS n FROM estrategia_semana WHERE user_id = 12 AND week_key = ?').get(WEEK).n; } catch (e) { nFilas = -1; }
  let rowUp = null;
  try { rowUp = db.prepare('SELECT estrategia_json FROM estrategia_semana WHERE user_id = 12 AND week_key = ?').get(WEEK); } catch (e) { rowUp = null; }
  t('A8: upsert — dos POST de la misma semana dejan UNA sola fila, con el contenido nuevo',
    aUp.status === 200 && nFilas === 1 && !!rowUp && JSON.parse(rowUp.estrategia_json).narrativa === 'Semana del 2x1, segunda vuelta.',
    'status=' + aUp.status + ' n=' + nFilas);
  // Restauro la narrativa original para las secciones siguientes.
  await api('POST', `/api/admin/estrategia-semana?token=${ADMIN_TOKEN}`, { user_id: 12, week_key: WEEK, estrategia: ESTRATEGIA });
  const aEn = await api('POST', `/api/admin/estrategia-semana?token=${ADMIN_TOKEN}`, { user_id: 14, week_key: WEEK, estrategia: ESTRATEGIA });
  t('A9: POST válido para el usuario EN → 200', aEn.status === 200 && aEn.json && aEn.json.ok === true,
    'status=' + aEn.status + ' body=' + JSON.stringify(aEn.json));
  const aDiaMalo = await api('POST', `/api/admin/estrategia-semana?token=${ADMIN_TOKEN}`, { user_id: 13, week_key: WEEK, estrategia: { narrativa: 'Semana de prueba', dias: [{ dia: 'no-fecha', angulo: 'x', porque: 'y' }, { dia: shiftYmd(WEEK, 3), angulo: 'el rincón', porque: 'porque el local es parte del producto' }] } });
  let row13 = null;
  try { row13 = db.prepare('SELECT estrategia_json FROM estrategia_semana WHERE user_id = 13 AND week_key = ?').get(WEEK); } catch (e) { row13 = null; }
  const parsed13 = row13 ? JSON.parse(row13.estrategia_json) : null;
  t('A10: día sin fecha válida se descarta (fail-open) y el resto del plan se guarda',
    aDiaMalo.status === 200 && !!parsed13 && parsed13.dias.length === 1 && parsed13.dias[0].dia === shiftYmd(WEEK, 3),
    'status=' + aDiaMalo.status + ' dias=' + JSON.stringify(parsed13 && parsed13.dias));

  // ===== H) Boot: versión e index =====
  const ver = await fetch(BASE + '/api/version');
  const verJ = await ver.json().catch(() => null);
  t('H1: /api/version → build 20261105-v852', ver.ok && verJ && verJ.build === '20261105-v852',
    'build=' + (verJ && verJ.build));
  const idx = await fetch(BASE + '/');
  t('H2: index → 200', idx.status === 200, 'status=' + idx.status);

  // ===== B) Helpers directos (brief + PORQUÉ por posición + espejo) =====
  // Si el árbol no exporta los helpers (contra-prueba en v851), cada
  // test B se marca como falla en vez de romper la suite con un throw.
  const HAS_HELPERS = typeof srv.estrategiaSemanaParaBrief === 'function' && typeof srv.estrategiaPorqueParaPos === 'function' && typeof srv.aplicarEstrategiaAPicks === 'function' && typeof srv.leerEstrategiaSemana === 'function' && typeof srv.normalizarEstrategia === 'function';
  let brief12 = '';
  if (!HAS_HELPERS) {
    ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15'].forEach((n) => t(n + ': helper no exportado', false, 'contra-prueba: el árbol no trae la estrategia'));
  } else {
  brief12 = srv.estrategiaSemanaParaBrief(db, 12, WEEK);
  t('B1: el brief lleva narrativa + pesar más + no repetir + plan día por día con los ángulos',
    brief12.includes('Semana del 2x1') && brief12.includes('Pesar más: fotos del producto') && brief12.includes('No repetir: el reel largo de la semana pasada') && brief12.includes('Plan día por día:') && brief12.includes('el 2x1 del latte') && brief12.includes('el testimonio de Ana'),
    'brief=' + brief12.slice(0, 300));
  t('B2: sin fila, el brief es vacío (la generación corre como hoy)',
    srv.estrategiaSemanaParaBrief(db, 13, shiftYmd(WEEK, 7)) === '',
    'brief=' + JSON.stringify(srv.estrategiaSemanaParaBrief(db, 13, shiftYmd(WEEK, 7))));
  t('B3: sin weekKey, el brief es vacío', srv.estrategiaSemanaParaBrief(db, 12, undefined) === '');
  t('B4: PORQUÉ pos 0 en ES → porque', srv.estrategiaPorqueParaPos(db, 12, WEEK, 0, 'es') === 'el 2x1 es tu gancho de la semana',
    'porque=' + JSON.stringify(srv.estrategiaPorqueParaPos(db, 12, WEEK, 0, 'es')));
  t('B5: PORQUÉ pos 0 en EN → porque_en', srv.estrategiaPorqueParaPos(db, 12, WEEK, 0, 'en') === 'the 2-for-1 is your hook this week',
    'porque=' + JSON.stringify(srv.estrategiaPorqueParaPos(db, 12, WEEK, 0, 'en')));
  t('B6: PORQUÉ pos 2 en EN → porque_en', srv.estrategiaPorqueParaPos(db, 12, WEEK, 2, 'en') === 'the testimonial sells more than the promo',
    'porque=' + JSON.stringify(srv.estrategiaPorqueParaPos(db, 12, WEEK, 2, 'en')));
  t('B7: EN sin porque_en → fallback a porque (espejo, nunca vacío)',
    srv.estrategiaPorqueParaPos(db, 12, WEEK, 1, 'en') === 'la gente quiere ver quién hace el café',
    'porque=' + JSON.stringify(srv.estrategiaPorqueParaPos(db, 12, WEEK, 1, 'en')));
  t('B8: sin entrada para esa posición → vacío (el pick conserva su porque)',
    srv.estrategiaPorqueParaPos(db, 12, WEEK, 5, 'es') === '');
  t('B9: sin fila → vacío', srv.estrategiaPorqueParaPos(db, 13, shiftYmd(WEEK, 7), 0, 'es') === '');
  const picks = [
    { titulo: 'p0', porque: 'porque IA 0' }, { titulo: 'p1', porque: 'porque IA 1' },
    { titulo: 'p2', porque: 'porque IA 2' }, { titulo: 'p3', porque: 'porque IA 3' },
  ];
  const nAplic = srv.aplicarEstrategiaAPicks(db, 12, WEEK, picks, 0);
  t('B10: aplicar a la ventana pone el PORQUÉ del plan en los 3 primeros picks y deja el 4º con su porque',
    nAplic === 3 && picks[0]._estrategiaPorque === 'el 2x1 es tu gancho de la semana' && picks[1]._estrategiaPorque === 'la gente quiere ver quién hace el café' && picks[2]._estrategiaPorque === 'el testimonio vende más que la promo' && picks[3]._estrategiaPorque === undefined && picks[3].porque === 'porque IA 3',
    'n=' + nAplic + ' picks=' + JSON.stringify(picks));
  const picksOff = [{ titulo: 'q0', porque: 'porque IA 0' }, { titulo: 'q1', porque: 'porque IA 1' }];
  const nOff = srv.aplicarEstrategiaAPicks(db, 12, WEEK, picksOff, 1);
  t('B11: offset=1 (semana parcial) — el primer pick de la ventana lleva la 2ª entrada del plan',
    nOff === 2 && picksOff[0]._estrategiaPorque === 'la gente quiere ver quién hace el café' && picksOff[1]._estrategiaPorque === 'el testimonio vende más que la promo',
    'n=' + nOff + ' picks=' + JSON.stringify(picksOff));
  const picksSin = [{ titulo: 's0', porque: 'porque IA 0' }];
  t('B12: sin fila, aplicar no toca los picks y devuelve 0',
    srv.aplicarEstrategiaAPicks(db, 13, shiftYmd(WEEK, 7), picksSin, 0) === 0 && picksSin[0]._estrategiaPorque === undefined);
  db.prepare(`INSERT OR REPLACE INTO estrategia_semana (user_id, week_key, estrategia_json) VALUES (13, ?, 'no-json{')`).run(shiftYmd(WEEK, 7));
  t('B13: JSON roto en la DB → leer devuelve null (nunca tira)',
    srv.leerEstrategiaSemana(db, 13, shiftYmd(WEEK, 7)) === null && srv.estrategiaSemanaParaBrief(db, 13, shiftYmd(WEEK, 7)) === '');
  const normLarga = srv.normalizarEstrategia({ narrativa: 'x'.repeat(1500), dias: [{ dia: WEEK, angulo: 'a', porque: 'p'.repeat(300) }] });
  t('B14: normalizar topa largos (narrativa ≤1000, porque ≤200)',
    !!normLarga && normLarga.narrativa.length === 1000 && normLarga.dias[0].porque.length === 200,
    'narrativa=' + (normLarga && normLarga.narrativa.length) + ' porque=' + (normLarga && normLarga.dias[0].porque.length));
  t('B15: normalizar sin objeto → null; sin contenido → null',
    srv.normalizarEstrategia('texto') === null && srv.normalizarEstrategia({}) === null && srv.normalizarEstrategia(null) === null);
  } // else HAS_HELPERS

  // ===== C) Generador: la estrategia llega al prompt; los gates ganan =====
  const origFetch = globalThis.fetch;
  let captured = null;
  function stubFetchOk() {
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('api.openai.com')) {
        captured = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ideas: stubIdeasList() }) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }) };
      }
      return origFetch(url, opts);
    };
  }
  function stubFetchThrow() {
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('api.openai.com')) throw new Error('red caída');
      return origFetch(url, opts);
    };
  }
  const userContentOf = (body) => {
    try {
      const msgs = body.messages || [];
      const u = msgs.find((m) => m.role === 'user');
      return String((u && u.content) || '');
    } catch (e) { return ''; }
  };
  stubFetchOk();
  let ideasCon = null;
  try { ideasCon = await generateIdeas({ ...INPUT_BASE, estrategia: brief12 }, 'test-key'); } finally { globalThis.fetch = origFetch; }
  const promptCon = captured ? userContentOf(captured) : '';
  t('C1: con estrategia, el prompt de openaiIdeas lleva la estrategia (narrativa + ángulos)',
    promptCon.includes('ESTRATEGIA DE LA SEMANA') && promptCon.includes('Semana del 2x1') && promptCon.includes('el 2x1 del latte') && promptCon.includes('el testimonio de Ana'),
    'prompt=' + promptCon.slice(0, 300));
  t('C2: el mismo prompt sigue llevando el fundamento y la REGLA CRÍTICA (no un prompt nuevo)',
    promptCon.includes('REGLA CRÍTICA') && promptCon.includes('Café de la casa'),
    'prompt=' + promptCon.slice(0, 300));
  t('C3: con estrategia, generateIdeas devuelve las 7 ideas con su porque',
    Array.isArray(ideasCon) && ideasCon.length === 7 && ideasCon.every((i) => typeof i.porque === 'string' && i.porque.length > 0),
    'n=' + (ideasCon && ideasCon.length));
  captured = null;
  stubFetchOk();
  let ideasSin = null;
  try { ideasSin = await generateIdeas({ ...INPUT_BASE }, 'test-key'); } finally { globalThis.fetch = origFetch; }
  const promptSin = captured ? userContentOf(captured) : '';
  t('C4: sin estrategia, el prompt NO lleva la línea de estrategia y las ideas salen como hoy',
    !promptSin.includes('ESTRATEGIA DE LA SEMANA') && Array.isArray(ideasSin) && ideasSin.length === 7 && promptSin.includes('REGLA CRÍTICA'),
    'prompt=' + promptSin.slice(0, 200));
  stubFetchThrow();
  let ideasFallback = null;
  try { ideasFallback = await generateIdeas({ ...INPUT_BASE, estrategia: brief12 }, 'test-key'); } finally { globalThis.fetch = origFetch; }
  t('C5: si la IA falla, generateIdeas cae a plantillas y devuelve ideas (sin fila / sin IA, corre como hoy)',
    Array.isArray(ideasFallback) && ideasFallback.length > 0 && ideasFallback.every((i) => i.titulo),
    'n=' + (ideasFallback && ideasFallback.length));
  // Gates: la estrategia pide algo vetado / con placeholder / sin producto.
  const stubVeto = () => {
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('api.openai.com')) {
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ideas: [
          { titulo: 'Gran descuento de la semana', formato: 'foto', tipo: 'promo', angulo: 'descuento del 50%', porque: 'porque el descuento trae gente' },
          { titulo: 'El latte de la casa, hecho con amor', formato: 'foto', tipo: 'social', angulo: 'el latte de la casa', porque: 'porque es tu producto estrella' },
        ] }) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }) };
      }
      return origFetch(url, opts);
    };
  };
  stubVeto();
  let ideasVeto = null;
  try {
    ideasVeto = await generateIdeas({ ...INPUT_BASE, estrategia: 'Narrativa: esta semana, descuento del 50% en todo.', vetos: ['descuento'] }, 'test-key');
  } finally { globalThis.fetch = origFetch; }
  t('C6: el veto gana a la estrategia — la idea de descuento se descarta aunque el plan la pida',
    Array.isArray(ideasVeto) && ideasVeto.length === 1 && ideasVeto[0].titulo.includes('latte'),
    'ideas=' + JSON.stringify(ideasVeto));
  const stubPlaceholder = () => {
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('api.openai.com')) {
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ideas: [
          { titulo: 'Nuevo XYZ de la casa', formato: 'foto', tipo: 'social', angulo: 'el producto XYZ', porque: 'porque es nuevo' },
          { titulo: 'El latte de la casa, hecho con amor', formato: 'foto', tipo: 'social', angulo: 'el latte de la casa', porque: 'porque es tu producto estrella' },
        ] }) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }) };
      }
      return origFetch(url, opts);
    };
  };
  stubPlaceholder();
  let ideasPh = null;
  try { ideasPh = await generateIdeas({ ...INPUT_BASE, estrategia: 'Narrativa: presentamos el nuevo XYZ.' }, 'test-key'); } finally { globalThis.fetch = origFetch; }
  t('C7: el filtro anti-placeholder gana — la idea XYZ se descarta aunque el plan la pida',
    Array.isArray(ideasPh) && ideasPh.length === 1 && ideasPh[0].titulo.includes('latte'),
    'ideas=' + JSON.stringify(ideasPh));
  stubFetchOk();
  let ideasRg = null;
  try {
    ideasRg = await generateIdeas({ ...INPUT_BASE, estrategia: brief12, productos: [{ nombre: 'Latte de la casa', procedencia: 'fundamento' }] }, 'test-key');
  } finally { globalThis.fetch = origFetch; }
  t('C8: con estrategia, la anotación de rubro sigue corriendo (cada idea queda con _rgProducto o _rgSinProducto)',
    Array.isArray(ideasRg) && ideasRg.length > 0 && ideasRg.every((i) => ('_rgProducto' in i) || ('_rgSinProducto' in i)),
    'ideas=' + JSON.stringify(ideasRg && ideasRg.slice(0, 2)));
  const latteIdea = Array.isArray(ideasRg) ? ideasRg.find((i) => (i.titulo || '').includes('latte de la casa')) : null;
  t('C9: la idea del producto real queda anotada con su producto (no cae en revisión por rubro)',
    !!latteIdea && !!latteIdea._rgProducto && latteIdea._rgProducto.nombre === 'Latte de la casa',
    'idea=' + JSON.stringify(latteIdea));

  // ===== D) needs_review nunca se salta por estrategia (estática) =====
  const needRevOnce = (SRV.match(/const needRev = \(\!isFounder && autopilot\.trustLevel\(db, uid\) === 0\) \? 1 : 0;/g) || []).length;
  t('D1: el cálculo de needRev sigue intacto (una sola ocurrencia, sin tocar)',
    needRevOnce === 1, 'ocurrencias=' + needRevOnce);
  t('D2: los 3 INSERT del pipeline usan el PORQUÉ del plan con fallback al porque de la IA',
    (SRV.match(/String\(idea\._estrategiaPorque \|\| idea\.porque \|\| ''\)\.slice\(0, 500\)/g) || []).length === 3,
    'ocurrencias=' + (SRV.match(/String\(idea\._estrategiaPorque \|\| idea\.porque \|\| ''\)\.slice\(0, 500\)/g) || []).length);
  const oldPorqueLines = (SRV.match(/String\(idea\.porque \|\| ''\)\.slice\(0, 500\)[^\n]*/g) || []);
  t('D3: el único INSERT con el porque viejo es el regen de un borrador rechazado (fuera del pipeline: un regen no tiene posición en el plan)',
    oldPorqueLines.length === 1 && oldPorqueLines[0].includes('trainingWheelsActive(uid)'),
    'líneas=' + JSON.stringify(oldPorqueLines));
  t('D4: las 3 expresiones de needs_review del pipeline están byte-idénticas a v851',
    SRV.includes('(needRev || (idea._rgSinProducto ? 1 : 0))') && SRV.includes("((characterBlocksDelivery(genOut) || (genOut.qaGate && genOut.qaGate.outcome === 'bandeja') || idea._rgSinProducto) ? 1 : needRev)") && SRV.includes('(needRev || carouselGen.needsReview || idea._rgSinProducto) ? 1 : 0'),
    'las 3 presentes');
  t('D5: el pipeline aplica la estrategia DESPUÉS de semana-aprende (el plan manda) y antes del insStmt',
    SRV.indexOf('aplicarEstrategiaAPicks(db, uid, weekKey, picks, existing)') > SRV.indexOf('porqueConAprendizaje(m.pick, apSem)') && SRV.indexOf('aplicarEstrategiaAPicks(db, uid, weekKey, picks, existing)') < SRV.indexOf('const insStmt = db.prepare(`INSERT INTO posts'),
    'orden=' + [SRV.indexOf('porqueConAprendizaje'), SRV.indexOf('aplicarEstrategiaAPicks(db, uid, weekKey, picks, existing)'), SRV.indexOf('const insStmt = db.prepare(`INSERT INTO posts')].join(','));

  // ===== E) Un mensaje por día: la fila no crea push ni chat =====
  t('E1: escribir las filas no encola ninguna push de la mañana',
    countPush() === pushAntes, 'antes=' + pushAntes + ' después=' + countPush());
  t('E2: escribir las filas no crea ningún mensaje de chat',
    countChats() === chatsAntes, 'antes=' + chatsAntes + ' después=' + countChats());
  t('E3: la respuesta del POST no trae ningún campo de push ni chat',
    aOk.json && Object.keys(aOk.json).sort().join(',') === 'ok,user_id,week_key',
    'claves=' + Object.keys(aOk.json || {}).join(','));
  const h0 = SRV.indexOf("// POST /api/admin/estrategia-semana");
  const hN = h0 >= 0 ? SRV.indexOf('// ---------- Publicidad', h0) : -1;
  const handlerBlock = h0 >= 0 && hN > h0 ? SRV.slice(h0, hN) : '';
  t('E4: el bloque de estrategia no toca pushes, chats ni posteos (solo su tabla)',
    handlerBlock && !handlerBlock.includes('morning_post_push') && !handlerBlock.includes('posty_chats') && !handlerBlock.includes('push.notify') && !handlerBlock.includes('INSERT INTO posts') && handlerBlock.includes('INSERT INTO estrategia_semana'),
    'bloque=' + handlerBlock.length + ' chars');

  // ===== F) Sin fila, la generación corre como hoy (estática + B/C) =====
  t('F1: ideasInputFor suma la estrategia solo si el brief no es vacío (fail-open, con try/catch)',
    SRV.includes('const estBrief = estrategiaSemanaParaBrief(db, uid, weekKey);') && SRV.includes('if (estBrief) ideasInput.estrategia = estBrief;'),
    'wiring presente');
  t('F2: solo el POST de admin escribe estrategia_semana (un único INSERT en todo el servidor)',
    (SRV.match(/INSERT INTO estrategia_semana/g) || []).length === 1,
    'ocurrencias=' + (SRV.match(/INSERT INTO estrategia_semana/g) || []).length);
  t('F3: el generador y el scheduler no escriben estrategia_semana',
    !fs.readFileSync(path.join(TREE, 'generator.js'), 'utf8').includes('INSERT INTO estrategia_semana') && !fs.readFileSync(path.join(TREE, 'scheduler.js'), 'utf8').includes('INSERT INTO estrategia_semana'),
    'generator/scheduler limpios');
  t('F4: la tabla nace en db.js (boot) con PRIMARY KEY (user_id, week_key)',
    fs.readFileSync(path.join(TREE, 'db.js'), 'utf8').includes('CREATE TABLE IF NOT EXISTS estrategia_semana') && fs.readFileSync(path.join(TREE, 'db.js'), 'utf8').includes('PRIMARY KEY(user_id, week_key)'),
    'tabla en db.js');

  // ===== S) Estática: el puente v843 sigue intacto =====
  t('S1: el puente v843 sigue en su lugar (analisis_diario + señal en learnings)',
    SRV.includes("app.post('/api/admin/analisis-diario'") && fs.readFileSync(path.join(TREE, 'generator.js'), 'utf8').includes('veredicto diario'),
    'puente v843 presente');

  console.log(`\nESTRATEGIA-SEMANA: ${pass} ok, ${fail} fallas`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('ERROR:', e && e.message);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
