// test-lote-patrones-serie.js — LOTE PATRONES-DE-SERIE
// Posty aprende PATRONES de serie y los aplica solo (orden de
// Valentino 14/11 14:24 EST: «si se suben tres posteos seguidos, el
// mismo rubro, que no rehaga un posteo de el avatar de Posti»).
// Diseño: ~/workspace/.diag-patrones-serie/DISENO.md.
// Causa raíz: el ROL de la pieza dentro de su serie no existía como
// dato — cada camino que rehace/regenera/re-agenda trataba el posteo
// como una isla. El lote: posts.rol_serie + posts.frenada (db.js),
// el perfil de continuidad extendido con rol_avatar (demo.js), la
// clasificación de recientes por visión al sembrarse el snapshot
// (deep-read.js + server.js) y los candados C1–C5.
// Batería:
//   S0 contrato en la fuente (ALTERs tras el CREATE de posts y tras
//      reel_receta, filtros y marcas en cada camino).
//   S1 el helper puro patrones-serie.js (parseo, ejes, veredicto C1,
//      estampa y marca contra una DB en memoria).
//   S2 el perfil + el pase de serie (demo.js): C2 — dos fotos con el
//      avatar EN ESCENA en la misma tira → la extra queda REGISTRADA
//      con 'rol-avatar-roto', su imagen NO se toca y NO va al armado
//      (rehacerla sería el incidente 653); el patrón sano (una en
//      escena + sello) pasa entero; el caso cero (el feed trae al
//      avatar en escena y la serie ninguna) deja su nota de serie.
//   S3 el clasificador de recientes (deep-read.js, visión falsa):
//      en_escena/sello/ausente; sin los dos booleanos no hay
//      veredicto; la falla de red devuelve {} (fail-closed).
//   S4 boot del servidor real — los casos de hoy:
//      C4 replay 679/680/681: las tres piezas de la tira frenadas por
//        soporte quedan frenada=1 y el schedule-all NO las resucita
//        (esperan con motivo 'frenada'); un cuarto borrador sano sí
//        se agenda; el ensure tampoco impone la pieza frenada.
//      C5 con serie viva, el borrador nacido fuera del plan
//        (source='subir') espera 'fuera_de_serie'; sin serie, la
//        subida se agenda como siempre.
//      C1·D1 rol 'no_determinado' → el rehacer de soporte se frena
//        con error 'rol_no_determinado' y la pieza NO se borra; con
//        rol determinado, regenera como siempre.
//      Conserje: 'no_sale' marca la pieza frenada; 'sale' la desmarca.
// Uso: node test-lote-patrones-serie.js (desde la raíz del árbol).
// CONTROL contra la base: en el árbol SIN el lote, S0–S4 fallan
// reproduciendo el hueco (el dato no existe y lo frenado resucita);
// las piezas heredadas que la batería toca de refilón (rehacer de un
// programado, pausa del dueño) siguen pasando.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const TREE = __dirname;
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const DBJS = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');
const DEMO_SRC = fs.readFileSync(path.join(TREE, 'demo.js'), 'utf8');
const SC = fs.readFileSync(path.join(TREE, 'support-cases.js'), 'utf8');
const CR = fs.readFileSync(path.join(TREE, 'conserje-revision.js'), 'utf8');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-data-'));
// En el árbol base (control) el módulo del lote no existe: la batería
// lo registra como falla de su sección y sigue, para que el control
// muestre el hueco completo en vez de abortar.
let patrones = null;
try { patrones = require(path.join(TREE, 'patrones-serie.js')); } catch (e) { patrones = null; }
const demo = require(path.join(TREE, 'demo.js'));
const deepRead = require(path.join(TREE, 'deep-read.js'));
const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));

// ---------- zona horaria segura (mismo criterio que freno-dia) ----
const ZONES = ['Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Dubai', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Honolulu', 'UTC'];
function hourIn(zone, d) {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hour12: false }).format(d)) % 24; } catch (e) { return -1; }
}
const NOW = new Date();
const TZ = ZONES.find((z) => { const h = hourIn(z, NOW); return h >= 10 && h <= 16; }) || 'UTC';
const TODAY = dayKeyInTz(NOW, TZ);
const shiftDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const TOMORROW = shiftDays(TODAY, 1);
const DAY2 = shiftDays(TODAY, 2);
const mondayOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
};
function wallToUtc(s, tz) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return null;
  const Y = +m[1], Mo = +m[2], D = +m[3], h = +m[4], mi = +m[5];
  const guess = Date.UTC(Y, Mo - 1, D, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(guess))) parts[p.type] = p.value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, (+parts.hour % 24), +parts.minute, +parts.second);
  return new Date(guess - (asUtc - guess)).toISOString();
}
const atHour = (ymd, hh) => wallToUtc(`${ymd} ${String(hh).padStart(2, '0')}:00`, TZ);

// ================= S0 · contrato en la fuente =================
function parteFuente() {
  console.log('\n== S0 · contrato en la fuente ==');
  const iReel = DBJS.indexOf('ADD COLUMN reel_receta');
  const iRol = DBJS.indexOf('ADD COLUMN rol_serie');
  const iFre = DBJS.indexOf('ADD COLUMN frenada');
  t('S0.1 db.js suma posts.rol_serie y posts.frenada DESPUÉS del ALTER de reel_receta (bloque de posts)',
    iReel > 0 && iRol > iReel && iFre > iReel, `reel=${iReel} rol=${iRol} frenada=${iFre}`);
  t('S0.2 demo.js: el motivo rol-avatar-roto entra a CONTINUIDAD_SERIE_MOTIVOS',
    DEMO_SRC.includes("'rol-avatar-roto'") && DEMO_SRC.includes('CONTINUIDAD_SERIE_MOTIVOS'));
  t('S0.3 server.js: el embudo (scheduleAllDrafts) excluye frenada en su SELECT',
    SRV.includes('COALESCE(frenada,0)=0'));
  t('S0.4 server.js: el planificador espera con motivo frenada y fuera_de_serie (C4+C5)',
    SRV.includes("reason: 'frenada'") && SRV.includes("reason: 'fuera_de_serie'"));
  t('S0.5 server.js: el ensure (paso 2) excluye frenada y source subir',
    SRV.includes("AND COALESCE(frenada, 0) = 0") && SRV.includes("AND COALESCE(source,'') != 'subir'"));
  t('S0.6 server.js: la pausa del dueño marca la pieza y programar/aceptar la desmarcan',
    SRV.includes('patronesSerie.marcarFrenada(db, post.id, true)') && SRV.includes('user_stopped=0, frenada=0') && SRV.includes('user_stopped = 0, frenada = 0'));
  t('S0.7 server.js: el candado C1 vive en el run del chat (veredicto + recibo rol_no_determinado)',
    SRV.includes('veredictoCandadoFoto') && SRV.includes("settleFallo('rol_no_determinado')") && SRV.includes('rol_no_determinado:'));
  t('S0.8 server.js: el reemplazo de revisión nace con rol_serie y la ruta admin pasa el 4º argumento',
    SRV.includes('image_prompt, rol_serie') && SRV.includes('(uid, wk, topic, rolInfo) => regenerateOneDraft(uid, wk, topic, rolInfo)'));
  t('S0.9 support-cases.js: redoPost frena con rol_no_determinado, pasa el rol al regen y marca frenada',
    SC.includes("error: 'rol_no_determinado'") && SC.includes("{ rol_serie: post.rol_serie || '' }") && SC.includes('patronesSerie.marcarFrenada(db, post.id, true)'));
  t('S0.10 conserje-revision.js: no_sale/arreglar marcan la pieza y sale la desmarca',
    CR.includes('patronesSerie.marcarFrenada(db, post.id, true)') && CR.includes('patronesSerie.marcarFrenada(db, post.id, false)'));
  t('S0.11 server.js: la siembra del snapshot clasifica el rol UNA vez (classifyAvatarPresence)',
    SRV.includes('deepRead.classifyAvatarPresence') && SRV.includes('rol_avatar:'));
}

// ================= S1 · el helper puro =================
function parteHelper() {
  console.log('\n== S1 · patrones-serie.js (puro + DB en memoria) ==');
  if (!patrones) { t('S1.0 el módulo patrones-serie.js existe', false, 'no está en este árbol (control base)'); return; }
  t('S1.1 parseRolSerie: JSON válido, basura y vacío',
    patrones.parseRolSerie('{"avatar":"en_escena","texto":"con-texto"}').avatar === 'en_escena'
    && patrones.parseRolSerie('no-json') === null && patrones.parseRolSerie('') === null
    && patrones.parseRolSerie('{"avatar":"otro"}') === null);
  t('S1.2 ejeAvatar distingue eje ausente (null) de no_determinado (valor)',
    patrones.ejeAvatar({ rol_serie: '' }) === null
    && patrones.ejeAvatar({ rol_serie: '{"avatar":"no_determinado"}' }) === 'no_determinado'
    && patrones.ejeAvatar({ rol_serie: '{"texto":"con-texto"}' }) === null
    && patrones.rolAvatarEfectivo({ rol_serie: '' }) === 'no_determinado');
  const V = patrones.veredictoCandadoFoto;
  t('S1.3 C1: sello/ausente + personaje verificado en la pieza nueva → bloquea rol_avatar',
    V({ ejePresente: true, avatar: 'sello', character: 'passed' }).bloquea === true
    && V({ ejePresente: true, avatar: 'ausente', character: 'passed' }).motivo === 'rol_avatar');
  t('S1.4 C1: en_escena + character failed → bloquea; en_escena + passed → pasa',
    V({ ejePresente: true, avatar: 'en_escena', character: 'failed' }).bloquea === true
    && V({ ejePresente: true, avatar: 'en_escena', character: 'passed' }).bloquea === false);
  t('S1.5 C1: eje presente no_determinado → bloquea rol_no_determinado; eje ausente → nunca bloquea',
    V({ ejePresente: true, avatar: 'no_determinado', character: 'passed' }).motivo === 'rol_no_determinado'
    && V({ ejePresente: false, avatar: null, character: 'passed' }).bloquea === false
    && V({ ejePresente: true, avatar: 'sello', character: 'n/a' }).bloquea === false);
  const mdb = new DatabaseSync(':memory:');
  mdb.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, rol_serie TEXT DEFAULT '', frenada INTEGER DEFAULT 0)`);
  mdb.prepare(`INSERT INTO posts (id) VALUES (1)`).run();
  patrones.sellarRolSerie(mdb, 1, { avatar: 'en_escena' });
  patrones.sellarRolSerie(mdb, 1, { texto: 'con-texto' });
  const row1 = mdb.prepare('SELECT * FROM posts WHERE id = 1').get();
  t('S1.6 sellarRolSerie fusiona ejes sin pisarse (avatar + texto conviven)',
    row1.rol_serie.includes('"avatar":"en_escena"') && row1.rol_serie.includes('"texto":"con-texto"'), row1.rol_serie);
  patrones.sellarRolSerie(mdb, 1, { avatar: 'valor-invalido' });
  const row1b = mdb.prepare('SELECT * FROM posts WHERE id = 1').get();
  t('S1.7 sellarRolSerie ignora valores fuera del catálogo', row1b.rol_serie === row1.rol_serie);
  patrones.marcarFrenada(mdb, 1, true);
  const f1 = patrones.esFrenada(mdb.prepare('SELECT * FROM posts WHERE id = 1').get());
  patrones.marcarFrenada(mdb, 1, false);
  const f0 = patrones.esFrenada(mdb.prepare('SELECT * FROM posts WHERE id = 1').get());
  t('S1.8 marcarFrenada/esFrenada ida y vuelta', f1 === true && f0 === false);
  mdb.close();
}

// ================= S2 · perfil y pase de serie =================
const FX = path.join(TREE, 'test-fixtures', 'juicio-final');
const FOTO_A = path.join(FX, 'foto-speakeasy.jpg');
const FOTO_B = path.join(FX, 'foto-glasshouse.jpg');
const FOTO_C = path.join(FX, 'post-677.jpg');
const spBase = (photo, extra = {}) => ({
  photo, photo_source: 'real-product-brand', photo_product: 'Medialuna',
  style: 'promo', style_name: '', kind: 'novedad', pill: '', bar: 'PANADERÍA SOL',
  headline: 'Medialuna tibia', subline: 'recién horneada', cta: '', text_mode: 'text',
  creatividad: { rol: 'heroe', estrella: 'Medialuna', escena_key: 'x', escena: '' },
  ...extra,
});
const estrellaDistinta = (nombre) => ({ photo_product: nombre, creatividad: { rol: 'tip', estrella: nombre, escena_key: 'x', escena: '' } });
const postImg = (marca, extra = {}) => ({
  type: 'image', image: 'data:image/jpeg;base64,' + marca, caption: 'cap', hashtags: '',
  headline: 'Medialuna tibia', style: 'promo', style_name: '', text_mode: 'text', ...extra,
});
const optsPase = (posts, specPosts, extra = {}) => ({
  posts, specPosts,
  digest: { texto_feed: { modo: 'con-texto', n: 10, superpuestos: 9, ratio: 0.9 }, producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna', 'Torta de chocolate', 'Café de especialidad'] },
  spec: { foto_gate: { fotos: [] } },
  business: 'Panadería Sol', category: 'gastronomia', country: 'AR', tone: 'vos', lang: 'es', subcat: '',
  accent: '#0A1E33', btn: '#FEC14D', photoPath: null, extraPhotos: [], feedRecents: [],
  ...extra,
});

async function parteSerie() {
  console.log('\n== S2 · perfil de serie + pase (C2) ==');
  // La tira de pastelería de hoy: foto con Posty EN ESCENA · video ·
  // foto OTRA VEZ con Posty en escena (el patrón roto).
  const posts = [postImg('P0'), { type: 'video', image: null, video: 'v', caption: 'cap', text_mode: 'text' }, postImg('P2')];
  const sps = [
    spBase(FOTO_A, { rol_avatar: 'en_escena' }),
    spBase(FOTO_B, { ...estrellaDistinta('Torta de chocolate'), type: 'video' }),
    spBase(FOTO_C, { ...estrellaDistinta('Café de especialidad'), rol_avatar: 'en_escena' }),
  ];
  const perfil = demo.perfilContinuidadSerie(posts, sps, optsPase(posts, sps).digest, []);
  t('S2.1 el perfil expone la dimensión avatar: en_escena_idx = [0, 2] y el invariante del sello',
    !!perfil.avatar && JSON.stringify(perfil.avatar.en_escena_idx) === '[0,2]'
    && perfil.avatar.sello_complementario === 'sello<=>no-en_escena',
    JSON.stringify(perfil.avatar));
  const r = await demo.aplicarContinuidadSerieTrial(optsPase(posts, sps));
  const rec2 = r.registro.find((x) => x.i === 2);
  t('S2.2 C2: la segunda foto en escena queda registrada con rol-avatar-roto',
    !!rec2 && rec2.motivos.includes('rol-avatar-roto') && rec2.salida === 'registrado' && rec2.pasa === false,
    JSON.stringify(rec2));
  t('S2.3 C2: la pieza registrada NO se toca — misma imagen, no va al armado, no cuenta como cambiada',
    posts[2].image === 'data:image/jpeg;base64,P2' && !posts[2].armando && !r.cambiados.includes(2),
    'armando=' + posts[2].armando + ' cambiados=' + JSON.stringify(r.cambiados));
  t('S2.4 la primera foto en escena (el patrón) pasa directa y el rol determinado viaja con la pieza',
    r.registro.find((x) => x.i === 0).salida === 'directa' && posts[0].rol_avatar === 'en_escena' && posts[2].rol_avatar === 'en_escena');
  // El patrón SANO de la regla: una en escena + la otra de sello.
  const postsOk = [postImg('Q0'), postImg('Q1')];
  const spsOk = [spBase(FOTO_A, { rol_avatar: 'en_escena' }), spBase(FOTO_B, { ...estrellaDistinta('Torta de chocolate'), rol_avatar: 'sello' })];
  const rOk = await demo.aplicarContinuidadSerieTrial(optsPase(postsOk, spsOk));
  t('S2.5 el patrón sano (en escena + sello) pasa entero sin tocar nada',
    rOk.cambiados.length === 0 && rOk.registro.every((x) => x.pasa === true) && postsOk[1].image === 'data:image/jpeg;base64,Q1',
    JSON.stringify(rOk.registro));
  // Caso cero: el feed trae al avatar en escena y la serie, no.
  const recents = [{ type: 'image', rol_avatar: 'en_escena' }, { type: 'image', rol_avatar: 'sello' }, { type: 'image', rol_avatar: 'sello' }];
  const postsCero = [postImg('R0'), postImg('R1')];
  const spsCero = [spBase(FOTO_A, { rol_avatar: 'sello' }), spBase(FOTO_B, { ...estrellaDistinta('Torta de chocolate'), rol_avatar: 'ausente' })];
  const perfilCero = demo.perfilContinuidadSerie(postsCero, spsCero, {}, recents);
  const fCero = demo.fallasContinuidadSerie(perfilCero, postsCero);
  t('S2.6 caso cero: nota de serie sin-avatar-en-escena y ninguna pieza condenada',
    fCero.notas.some((n) => n.motivo === 'rol-avatar-roto' && n.detalle === 'sin-avatar-en-escena') && fCero.fallas.size === 0,
    'notas=' + JSON.stringify(fCero.notas) + ' fallas=' + fCero.fallas.size);
  t('S2.7 el perfil lee el rol también del JSON persistido (rol_serie) cuando el spec no lo trae',
    demo.perfilContinuidadSerie([postImg('S0', { rol_serie: '{"avatar":"sello"}' })], [spBase(FOTO_A)], {}, []).piezas[0].rol_avatar === 'sello');
}

// ================= S3 · el clasificador de recientes =================
async function parteClasificador() {
  console.log('\n== S3 · classifyAvatarPresence (visión falsa, fail-closed) ==');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-fotos-'));
  const srcJpg = fs.existsSync(FOTO_A) ? FOTO_A : path.join(TREE, 'stock', 'barberia', '2061820.jpg');
  const fotos = [];
  for (let i = 0; i < 4; i++) {
    const p = path.join(dir, 'f' + i + '.jpg');
    fs.copyFileSync(srcJpg, p);
    fotos.push({ key: 'k' + i, path: p });
  }
  const fetchOk = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ results: [
        { i: 0, personaje_en_escena: true, sello: false, detalle: 'agarra la medialuna' },
        { i: 1, personaje_en_escena: false, sello: true, detalle: 'cara en círculo arriba a la izquierda' },
        { i: 2, personaje_en_escena: false, sello: false, detalle: 'solo el producto' },
        { i: 3, personaje_en_escena: true, detalle: 'falta el campo sello: sin veredicto' },
      ] }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }),
  });
  const out = await deepRead.classifyAvatarPresence({ photos: fotos, business: 'Panadería Sol', apiKey: 'test', fetchImpl: fetchOk });
  t('S3.1 mapea en_escena / sello / ausente por índice',
    out.k0 && out.k0.rol === 'en_escena' && out.k1 && out.k1.rol === 'sello' && out.k2 && out.k2.rol === 'ausente',
    JSON.stringify(out));
  t('S3.2 sin los DOS booleanos no hay veredicto (la foto dudosa queda fuera)',
    !('k3' in out), JSON.stringify(Object.keys(out)));
  const outFalla = await deepRead.classifyAvatarPresence({ photos: fotos, business: 'X', apiKey: 'test', fetchImpl: async () => { throw new Error('red caída'); } });
  t('S3.3 la falla de red devuelve {} — ningún llamador lo lee como rol', Object.keys(outFalla).length === 0);
  const outSinClave = await deepRead.classifyAvatarPresence({ photos: fotos, business: 'X', apiKey: '', fetchImpl: fetchOk });
  t('S3.4 sin clave devuelve {}', Object.keys(outSinClave).length === 0);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

// ================= S4 · boot del servidor real =================
const PORT = 34651;
const SECRET = 'patrones-secret';
const ADMIN = 'boot-test-token-patrones';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patrones-'));
const NODE_MODULES = '/home/hatch/workspace/posta/node_modules';
const FIXTURE_JPG = path.join(TREE, 'stock', 'barberia', '2061820.jpg');

function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
const cookieFor = (sid) => 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
async function api(method, pth, sid, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${pth}`, {
    method,
    headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
async function adminPost(pth, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${pth}?token=${ADMIN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function parteBoot() {
  console.log('\n== S4 · boot del servidor real (los casos de hoy) ==');
  console.log('zona de la batería:', TZ, '| hoy:', TODAY, '| mañana:', TOMORROW, '| +2:', DAY2);
  fs.mkdirSync(path.join(tmpDir, 'media'), { recursive: true });
  fs.copyFileSync(FIXTURE_JPG, path.join(tmpDir, 'media', 'fixture.jpg'));
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: ADMIN,
    SESSION_SECRET: SECRET,
    NODE_PATH: NODE_MODULES,
    OPENAI_API_KEY: 'test',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  process.on('exit', kill);
  const dbFile = path.join(tmpDir, 'posta.db');
  const openDb = () => new DatabaseSync(dbFile);
  try {
    let up = false;
    for (let i = 0; i < 45 && !up; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) up = true; } catch (e) {}
      if (!up) await sleep(1000);
    }
    t('S4.0 el servidor levanta con el lote', up);
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }

    // ---------- siembra ----------
    const bcrypt = require(path.join(NODE_MODULES, 'bcryptjs'));
    const db0 = openDb();
    const insUser = db0.prepare(`INSERT INTO users (id, email, password_hash, plan_status) VALUES (?, ?, ?, 'active')`);
    const insSet = db0.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`);
    const insProf = db0.prepare(`INSERT INTO profiles (user_id, business_name, description) VALUES (?, ?, ?)`);
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({ cookie: { originalMaxAge: 604800000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' }, userId: uid });
    const insSess = db0.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`);
    const DESC = 'Negocio de prueba de la batería patrones-serie: pastelería casera, medialunas y café de especialidad todos los días.';
    for (const uid of [401, 402, 403, 404, 405, 406]) {
      insUser.run(uid, `ps-${uid}@test.invalid`, bcrypt.hashSync('ps-pass-' + uid, 10));
      insSet.run(uid, TZ);
      insProf.run(uid, 'Negocio PS ' + uid, DESC);
      insSess.run('ps-' + uid, sessJson(uid), exp);
    }
    const insPost = db0.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, media_type, week_key, needs_review, source, rol_serie, frenada)
      VALUES (?, ?, '/media/fixture.jpg', ?, '', ?, ?, ?, ?, ?, ?, ?, ?)`);
    const CAP = 'Las medialunas de la casa, recién horneadas, como cada mañana de esta semana.';
    // La tira de hoy (401): foto · video · foto, las tres programadas.
    insPost.run(9401, 401, CAP, atHour(TODAY, 21), 'scheduled', 'image', mondayOf(TODAY), 0, 'trial', '{"avatar":"en_escena","texto":"con-texto"}', 0);
    insPost.run(9402, 401, 'El video de la semana: así sale la medialuna del horno, tibia y dorada.', atHour(TOMORROW, 19), 'scheduled', 'video', mondayOf(TOMORROW), 0, 'trial', '', 0);
    insPost.run(9403, 401, 'La segunda foto de la tira: la medialuna con café, como la piden siempre.', atHour(DAY2, 19), 'scheduled', 'image', mondayOf(DAY2), 0, 'trial', '{"avatar":"sello","texto":"con-texto"}', 0);
    // El cuarto borrador sano de la misma cuenta (sí debe agendarse).
    insPost.run(9404, 401, 'El café de especialidad de la tarde, recién molido, para acompañar la merienda.', null, 'draft', 'image', mondayOf(TODAY), 0, 'trial', '', 0);
    // C5 (402): serie viva (borrador del plan) + subida del cliente.
    insPost.run(9410, 402, 'La pieza del plan de esta semana, con su texto de siempre.', null, 'draft', 'image', mondayOf(TODAY), 0, 'trial', '', 0);
    insPost.run(9411, 402, 'La foto que subió el cliente desde su teléfono, sin pasar por el plan.', null, 'draft', 'image', mondayOf(TODAY), 0, 'subir', '', 0);
    // C5 control (403): SOLO una subida, sin serie. Su week_key es la
    // semana que viene: el planificador heredado nunca agenda una
    // pieza que no es de la prueba fuera de su semana, y si hoy es el
    // último día de la semana corriente no quedaría día libre en
    // NINGÚN árbol (ese no_slot no es de este lote).
    insPost.run(9412, 403, 'La única pieza de la cuenta: una foto subida por el cliente.', null, 'draft', 'image', mondayOf(TOMORROW), 0, 'subir', '', 0);
    // C1·D1 (404): borrador en revisión con rol no determinado + otro con rol determinado.
    insPost.run(9413, 404, 'El borrador cuyo rol en la serie no se pudo determinar.', null, 'draft', 'image', mondayOf(TODAY), 1, 'trial', '{"avatar":"no_determinado"}', 0);
    insPost.run(9414, 404, 'El borrador con el avatar en escena, rol determinado.', null, 'draft', 'image', mondayOf(TODAY), 1, 'trial', '{"avatar":"en_escena","texto":"con-texto"}', 0);
    // Ensure (405): un único borrador de hoy, ya frenado a nivel pieza.
    insPost.run(9415, 405, 'El borrador frenado que el ensure no debe imponer como posteo de hoy.', null, 'draft', 'image', mondayOf(TODAY), 0, 'trial', '', 1);
    // Conserje (406): dos programados de mañana; uno nace frenado.
    insPost.run(9416, 406, 'El posteo de mañana que el dueño va a decir que no sale.', atHour(TOMORROW, 19), 'scheduled', 'image', mondayOf(TOMORROW), 0, 'trial', '', 0);
    insPost.run(9417, 406, 'El posteo frenado que el dueño va a decir que sale.', atHour(TOMORROW, 19), 'scheduled', 'image', mondayOf(TOMORROW), 0, 'trial', '', 1);
    db0.close();
    const q1 = (sql, ...args) => { const d = openDb(); const r = d.prepare(sql).get(...args); d.close(); return r; };

    // ================= C4 · replay del 679/680/681 =================
    console.log('\n== C4 · las tres piezas frenadas NO resucitan por agenda ==');
    for (const id of [9401, 9402, 9403]) {
      const re = await adminPost(`/api/admin/support/posts/${id}/rehacer`, { note: 'freno de la batería patrones' });
      t(`C4.${id} el rehacer de soporte responde modo borrador`, re.status === 200 && !!(re.json && re.json.modo === 'borrador'),
        'status=' + re.status + ' body=' + JSON.stringify(re.json).slice(0, 160));
    }
    const frenadas = [9401, 9402, 9403].map((id) => q1('SELECT * FROM posts WHERE id = ?', id));
    t('C4.1 las tres quedan borrador sin fecha Y con la marca durable frenada=1',
      frenadas.every((p) => p.status === 'draft' && !p.scheduled_at && Number(p.frenada) === 1),
      JSON.stringify(frenadas.map((p) => ({ id: p.id, s: p.status, f: p.frenada }))));
    const sa = await api('POST', '/api/posts/schedule-all', 'ps-401', {});
    t('C4.2 el schedule-all corre (200) por el cuarto borrador sano', sa.status === 200,
      'status=' + sa.status + ' body=' + JSON.stringify(sa.json).slice(0, 200));
    const waiting = (sa.json && sa.json.waiting) || [];
    t('C4.3 las tres frenadas esperan con motivo frenada (no se agendan en silencio)',
      [9401, 9402, 9403].every((id) => waiting.some((w) => w.id === id && w.reason === 'frenada')),
      'waiting=' + JSON.stringify(waiting));
    const despues = [9401, 9402, 9403].map((id) => q1('SELECT * FROM posts WHERE id = ?', id));
    t('C4.4 tras el schedule-all las tres SIGUEN borrador sin fecha (en la base resucitaban)',
      despues.every((p) => p.status === 'draft' && !p.scheduled_at),
      JSON.stringify(despues.map((p) => ({ id: p.id, s: p.status, at: p.scheduled_at }))));
    const p9404 = q1('SELECT * FROM posts WHERE id = 9404');
    t('C4.5 el cuarto borrador sano sí quedó agendado (el planificador no se rompió)',
      p9404.status === 'scheduled' && !!p9404.scheduled_at, JSON.stringify({ s: p9404.status, at: p9404.scheduled_at }));

    // ================= C5 · fuera de serie =================
    console.log('\n== C5 · lo que nace fuera de la serie no se auto-agenda dentro de la tira ==');
    const sa2 = await api('POST', '/api/posts/schedule-all', 'ps-402', {});
    const w2 = (sa2.json && sa2.json.waiting) || [];
    const p9410 = q1('SELECT * FROM posts WHERE id = 9410');
    const p9411 = q1('SELECT * FROM posts WHERE id = 9411');
    t('C5.1 con serie viva: la pieza del plan se agenda y la subida espera fuera_de_serie',
      sa2.status === 200 && p9410.status === 'scheduled' && p9411.status === 'draft'
      && w2.some((w) => w.id === 9411 && w.reason === 'fuera_de_serie'),
      'sa=' + sa2.status + ' plan=' + p9410.status + ' subir=' + p9411.status + ' waiting=' + JSON.stringify(w2));
    const sa3 = await api('POST', '/api/posts/schedule-all', 'ps-403', {});
    const p9412 = q1('SELECT * FROM posts WHERE id = 9412');
    t('C5.2 sin serie: la subida se agenda como siempre (comportamiento heredado intacto)',
      sa3.status === 200 && p9412.status === 'scheduled',
      'sa=' + sa3.status + ' subir=' + p9412.status + ' body=' + JSON.stringify(sa3.json).slice(0, 160));

    // ================= C1·D1 · rol no determinado =================
    console.log('\n== C1·D1 · el rehacer no improvisa sobre un rol no determinado ==');
    const reNd = await adminPost('/api/admin/support/posts/9413/rehacer', { note: 'rehacer de la batería' });
    const p9413 = q1('SELECT * FROM posts WHERE id = 9413');
    t('C1.1 rol no_determinado → 400 rol_no_determinado y la pieza NO se borra ni se regenera',
      reNd.status === 400 && !!(reNd.json && reNd.json.error === 'rol_no_determinado') && !!p9413 && p9413.status === 'draft',
      'status=' + reNd.status + ' body=' + JSON.stringify(reNd.json).slice(0, 160) + ' post=' + JSON.stringify(p9413 && { s: p9413.status }));
    const reDet = await adminPost('/api/admin/support/posts/9414/rehacer', { note: 'rehacer de la batería' });
    const p9414 = q1('SELECT * FROM posts WHERE id = 9414');
    t('C1.2 rol determinado → regenerar como siempre (la pieza vieja se borra)',
      reDet.status === 200 && !!(reDet.json && reDet.json.modo === 'regenerar') && !p9414,
      'status=' + reDet.status + ' body=' + JSON.stringify(reDet.json).slice(0, 160));

    // ================= ensure no impone la pieza frenada =================
    console.log('\n== C4b · el ensure no impone la pieza frenada como posteo de hoy ==');
    await Promise.race([api('POST', '/api/week/ensure', 'ps-405', {}), sleep(25000)]);
    await sleep(3000);
    const p9415 = q1('SELECT * FROM posts WHERE id = 9415');
    t('C4b.1 la pieza frenada sigue borrador sin fecha tras el ensure',
      !!p9415 && p9415.status === 'draft' && !p9415.scheduled_at,
      JSON.stringify(p9415 && { s: p9415.status, at: p9415.scheduled_at }));

    // ================= conserje marca / desmarca =================
    console.log('\n== Conserje · no_sale marca la pieza, sale la desmarca ==');
    const conserje = require(path.join(TREE, 'conserje-revision.js'));
    const dbC = openDb();
    const dNo = conserje.decidirRevision(dbC, { user_id: 406, fecha_posteo: TOMORROW, post_id: 9416, decision: 'no_sale' });
    const dSale = conserje.decidirRevision(dbC, { user_id: 406, fecha_posteo: TOMORROW, post_id: 9417, decision: 'sale' });
    dbC.close();
    const p9416 = q1('SELECT * FROM posts WHERE id = 9416');
    const p9417 = q1('SELECT * FROM posts WHERE id = 9417');
    t('CJ.1 no_sale: la pieza queda borrador y frenada=1',
      !!(dNo && dNo.ok) && p9416.status === 'draft' && Number(p9416.frenada) === 1,
      'dec=' + JSON.stringify(dNo).slice(0, 120) + ' post=' + JSON.stringify({ s: p9416.status, f: p9416.frenada }));
    t('CJ.2 sale: el gesto expreso desmarca la pieza (frenada=0) y la aprueba',
      !!(dSale && dSale.ok) && Number(p9417.frenada) === 0 && p9417.approval === 'approved',
      'dec=' + JSON.stringify(dSale).slice(0, 120) + ' post=' + JSON.stringify({ f: p9417.frenada, a: p9417.approval }));
  } catch (e) {
    fail++; console.log('FAIL excepción de la batería de boot: ' + e.message);
    console.log(out.split('\n').slice(-25).join('\n'));
  } finally {
    kill();
    await sleep(600);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  const seccion = async (nombre, fn) => {
    try { await fn(); } catch (e) { fail++; console.log('FAIL sección ' + nombre + ' explotó: ' + e.message); }
  };
  await seccion('S0', parteFuente);
  await seccion('S1', parteHelper);
  await seccion('S2', parteSerie);
  await seccion('S3', parteClasificador);
  await seccion('S4', parteBoot);
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
