// test-lote-creatividad.js
// LOTE CREATIVIDAD-COMO-SISTEMA (BUILD provisorio v1002 del builder;
// re-pineado por el preparador al BUILD definitivo v1058 sobre el vivo v1057)
//
// Requisito de Valentino (13/11 00:30): «distintos prompts para los
// posteos, cada posteo distinto al anterior, promocionando otra cosa
// y pensar estratégicamente el orden de los posteos».
//
// Verifica:
//  (A) Módulo creatividad.js (puro): la secuencia estratégica de
//      roles con saltos honestos (oferta sin promo real NO aparece;
//      prueba social sin evidencia NO aparece), la rotación de
//      estrellas (ningún posteo repite la del anterior; con una sola
//      estrella solo el héroe la lleva), las escenas determinísticas
//      que no repiten la del anterior, y la comparación anti-repetición
//      (misma estrella / mismo rol / prompt similar ≥ 0.6 = choque).
//  (B) Prueba (demo.buildDemoSpec) con una cuenta fixture de 3
//      estrellas: la semana de 3 sale con los roles en el orden
//      estratégico, cada specPost lleva su plan (rol, estrella,
//      escena) y ningún par seguido comparte estrella. Sin promo en
//      el digest, el rol oferta NO aparece (ni inventado).
//  (C) CONTROL sobre la base (../base-v992): el módulo no existe y
//      buildDemoSpec NO estampa plan creativo — la repetición de
//      estrella del ensure (ideaDiariaSintetica devolvía la estrella
//      validada todos los días) es el comportamiento de base.
//  (D) Cableado (pines de fuente): server.js estampa la metadata en
//      la semana (stampCreatividad ×3 sitios), en las ideas
//      (creaMetaDeIdea en los 2 INSERT de makeIdeaDraft), importa la
//      de la prueba (importTrialWeek) y la ruta IA de la prueba usa
//      la escena del plan; db.js crea la columna posts.creatividad.
//  (E) Boot: el árbol levanta, /api/version reporta el BUILD del
//      lote y la tabla posts nace con la columna creatividad.
//
// Uso: node test-lote-creatividad.js   (desde la raíz del árbol)

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');

let pass = 0, fail = 0, skip = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}
function SKIP(name, why) { skip++; console.log(`  ~ SKIP ${name} (${why})`); }

const ROOT = __dirname;
const BASE = path.join(ROOT, '..', 'base-v992');

// DATA_DIR efímero ANTES de requerir cualquier módulo del árbol
// (db.js abre la base al cargar; jamás la data/ del release).
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'crea-test-data-'));
process.env.DATA_DIR = TMP_DATA;

// ---------- (A) módulo puro ----------
console.log('\n[A] creatividad.js — secuencia, estrellas, escenas, comparación');
const creatividad = require(path.join(ROOT, 'creatividad.js'));

{
  const plan = creatividad.planSecuencia(7, { tienePromo: true, tienePrueba: true });
  T('semana de 7 con todo el material: orden estratégico completo',
    JSON.stringify(plan.pasos.map((p) => p.rol)) === JSON.stringify(creatividad.ROLES_SEMANA),
    JSON.stringify(plan.pasos.map((p) => p.rol)));
  T('sin saltos cuando todo está disponible', plan.saltados.length === 0);
}
{
  const plan = creatividad.planSecuencia(7, { tienePromo: false, tienePrueba: false });
  const roles = plan.pasos.map((p) => p.rol);
  T('sin promo real: el rol oferta NO aparece en la semana', !roles.includes('oferta'), roles.join(','));
  T('sin evidencia: el rol prueba_social NO aparece', !roles.includes('prueba_social'));
  T('los saltos quedan registrados', JSON.stringify(plan.saltados) === JSON.stringify(['prueba_social', 'oferta']), plan.saltados.join(','));
  T('la semana igual se arma (5 roles honestos)', roles.length === 7 && roles[0] === 'heroe' && roles[2] === 'lugar', roles.join(','));
}
{
  const plan = creatividad.planSecuencia(3, { tienePromo: true, tienePrueba: true });
  creatividad.asignarEstrellas(plan.pasos, ['Tesora', 'Mint Mojito', 'Wonderbar']);
  T('prueba de 3: roles héroe → detrás → prueba social',
    JSON.stringify(plan.pasos.map((p) => p.rol)) === JSON.stringify(['heroe', 'detras', 'prueba_social']));
  T('el héroe lleva la estrella principal', plan.pasos[0].estrella === 'Tesora');
  T('detrás de escena no vende un ítem (estrella vacía)', plan.pasos[1].estrella === '');
}
{
  const plan = creatividad.planSecuencia(7, { tienePromo: true, tienePrueba: true });
  creatividad.asignarEstrellas(plan.pasos, ['Tesora', 'Mint Mojito', 'Wonderbar']);
  const conEstrella = plan.pasos.filter((p) => p.estrella);
  let repite = false;
  for (let i = 1; i < plan.pasos.length; i++) {
    if (plan.pasos[i].estrella && plan.pasos[i].estrella === plan.pasos[i - 1].estrella) repite = true;
  }
  T('semana de 7 con 3 estrellas: ningún posteo repite la estrella del anterior', !repite,
    plan.pasos.map((p) => p.rol + ':' + (p.estrella || '—')).join(' | '));
  T('las posiciones con producto usan estrellas distintas en la vuelta', conEstrella.length >= 3);
}
{
  const plan = creatividad.planSecuencia(7, { tienePromo: true, tienePrueba: true });
  creatividad.asignarEstrellas(plan.pasos, ['Tesora']);
  const conEstrella = plan.pasos.filter((p) => p.estrella);
  T('una sola estrella: la lleva SOLO el primer paso con producto', conEstrella.length === 1 && conEstrella[0].rol === 'heroe');
  T('el resto queda marcado sin_alternativa (fail-honesto, no se frena)',
    plan.pasos.some((p) => p.sin_estrella_por_repeticion));
}
{
  const e1 = creatividad.escenarioPara('heroe', '2026-11-09:0', '');
  const e2 = creatividad.escenarioPara('heroe', '2026-11-09:0', e1.key);
  T('escena determinística por semilla', creatividad.escenarioPara('heroe', '2026-11-09:0', '').key === e1.key);
  T('la escena nunca repite la del posteo anterior', e2.key !== e1.key);
  T('cada rol tiene 3 escenarios concretos', Object.values(creatividad.ESCENARIOS).every((l) => l.length === 3));
}
{
  const pA = 'el producto heroe en primer plano sobre mesa de madera, luz natural calida, fondo simple, fotografia realista vertical';
  const pA2 = 'el producto heroe en primer plano sobre mesa de madera, luz natural calida, fondo simple, fotografia realista vertical con vapor';
  const pB = 'la fachada del local al atardecer con su cartel y la vereda del barrio, gente entrando, cielo despejado';
  T('prompt casi idéntico: similitud ≥ umbral declarado (0.6)',
    creatividad.similitudPrompt(pA, pA2) >= creatividad.UMBRAL_SIMILITUD_PROMPT,
    String(creatividad.similitudPrompt(pA, pA2)));
  T('prompts de verdad distintos: similitud < umbral', creatividad.similitudPrompt(pA, pB) < creatividad.UMBRAL_SIMILITUD_PROMPT);
  T('sin prompt no hay veredicto (null)', creatividad.similitudPrompt('', pA) === null);
  const choque = creatividad.compararConAnterior({ estrella: 'Tesora', rol: 'heroe', prompt: pA2 }, { estrella: 'Tesora', rol: 'heroe', prompt: pA });
  T('comparación: misma estrella + mismo rol + prompt similar = 3 choques',
    !choque.ok && choque.choques.length === 3, choque.choques.join(','));
  const okCmp = creatividad.compararConAnterior({ estrella: 'Mint Mojito', rol: 'oferta', prompt: pB }, { estrella: 'Tesora', rol: 'heroe', prompt: pA });
  T('comparación limpia: otra estrella, otro rol, otro prompt', okCmp.ok === true);
  T('prompt_hash estable y no vacío', creatividad.promptHashDe(pA).length === 16 && creatividad.promptHashDe(pA) === creatividad.promptHashDe(pA));
}
{
  const estrellas = creatividad.estrellasDeDigest({
    productos_nombrados: [{ nombre: 'Tesora' }, { nombre: 'Mint Mojito' }],
    productos: [{ nombre: 'Wonderbar' }, { nombre: 'Tesora' }],
  }, 'Tesora');
  T('estrellasDeDigest: nombrados primero, sin duplicar', JSON.stringify(estrellas) === JSON.stringify(['Tesora', 'Mint Mojito', 'Wonderbar']), estrellas.join(','));
  const ctx = creatividad.ctxDesdeDigest({ promos: [], ciudad: '', diferencial: '' });
  T('ctxDesdeDigest sin promo ni evidencia: todo cerrado', ctx.tienePromo === false && ctx.tienePrueba === false);
  const ctx2 = creatividad.ctxDesdeDigest({ promos: [{ titulo: '2x1' }], ciudad: 'Palermo', diferencial: '' });
  T('ctxDesdeDigest con promo y ciudad: oferta y prueba disponibles', ctx2.tienePromo === true && ctx2.tienePrueba === true);
  const huella = creatividad.huellaDesdePost({ id: 9, rg_producto: 'Tesora', image_prompt: 'abc', creatividad: JSON.stringify({ rol: 'heroe', estrella: 'Tesora' }) });
  T('huellaDesdePost lee la metadata del lote', huella.rol === 'heroe' && huella.estrella === 'Tesora' && huella.post_id === 9);
}

// ---------- (B) demo: la semana de la prueba con plan ----------
console.log('\n[B] demo.buildDemoSpec — la prueba sale como secuencia');
function specConDigest(digest) {
  const demo = require(path.join(ROOT, 'demo.js'));
  return demo.buildDemoSpec({
    business: 'Philz Coffee', category: 'cafeteria', country: 'US', tone: 'canchero',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 3, base: null, digest, lang: 'es', trialNoStock: true,
  });
}
const DIGEST_COMPLETO = {
  business: 'Philz Coffee', category: 'cafeteria', subcat: null,
  productos: [{ nombre: 'Tesora' }, { nombre: 'Mint Mojito' }, { nombre: 'Wonderbar' }],
  servicios: [], promos: [{ titulo: '2x1 en Mint Mojito' }], temas_feed: [],
  ciudad: 'San Francisco', diferencial: 'desde 2003', photo_map: null,
};
const DIGEST_SIN_PROMO = { ...DIGEST_COMPLETO, promos: [], ciudad: '', diferencial: '' };
{
  const spec = specConDigest(DIGEST_COMPLETO);
  const posts = spec.specPosts || [];
  T('la prueba arma 3 posteos', posts.length === 3, String(posts.length));
  T('cada posteo lleva su plan creativo (rol + escena)',
    posts.every((p) => p.creatividad && p.creatividad.rol && p.creatividad.escena_key && p.creatividad.escena),
    JSON.stringify(posts.map((p) => p.creatividad && p.creatividad.rol)));
  T('los roles salen en el orden estratégico de la secuencia',
    JSON.stringify(posts.map((p) => p.creatividad.rol)) === JSON.stringify(['heroe', 'detras', 'prueba_social']),
    posts.map((p) => p.creatividad && p.creatividad.rol).join(','));
  let repite = false;
  for (let i = 1; i < posts.length; i++) {
    const a = posts[i - 1].creatividad.estrella, b = posts[i].creatividad.estrella;
    if (a && b && creatividad.normNombre(a) === creatividad.normNombre(b)) repite = true;
  }
  T('ningún par seguido comparte estrella', !repite,
    posts.map((p) => p.creatividad.estrella || '—').join(' | '));
  T('las escenas de la semana no se repiten entre posteos seguidos',
    posts.every((p, i) => i === 0 || p.creatividad.escena_key !== posts[i - 1].creatividad.escena_key));
}
{
  const spec = specConDigest(DIGEST_SIN_PROMO);
  const posts = spec.specPosts || [];
  T('sin promo en el digest: NINGÚN posteo sale con rol oferta (no se inventa)',
    posts.length === 3 && posts.every((p) => !p.creatividad || p.creatividad.rol !== 'oferta'),
    posts.map((p) => p.creatividad && p.creatividad.rol).join(','));
  T('el plan registra los roles saltados', posts.length === 3
    && Array.isArray(posts[0].creatividad.roles_saltados)
    && posts[0].creatividad.roles_saltados.includes('oferta'));
  T('sin evidencia de prueba, el tercer rol es lugar (la secuencia comprime honesta)',
    posts.length === 3 && posts[2].creatividad.rol === 'lugar',
    posts.map((p) => p.creatividad && p.creatividad.rol).join(','));
}

// ---------- (C) control sobre la base ----------
console.log('\n[C] control sobre la base v992');
if (fs.existsSync(path.join(BASE, 'demo.js'))) {
  T('la base NO tiene el módulo creatividad.js', !fs.existsSync(path.join(BASE, 'creatividad.js')));
  delete require.cache[require.resolve(path.join(ROOT, 'demo.js'))];
  // La base comparte db.js por DATA_DIR: se requiere su demo con su
  // propio árbol (module paths relativos a su carpeta).
  const demoBase = require(path.join(BASE, 'demo.js'));
  const specBase = demoBase.buildDemoSpec({
    business: 'Philz Coffee', category: 'cafeteria', country: 'US', tone: 'canchero',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 3, base: null, digest: DIGEST_COMPLETO, lang: 'es', trialNoStock: true,
  });
  const postsBase = specBase.specPosts || [];
  T('CONTROL: la base arma la prueba SIN plan creativo en los posteos',
    postsBase.length === 3 && postsBase.every((p) => !p.creatividad));
  const srvBase = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
  T('CONTROL: ideaDiariaSintetica en la base devuelve la estrella sin rotación',
    srvBase.includes("if (star && star.item) {\n      return { title: String(star.item)") && !srvBase.includes('estrella_rotada'));
} else {
  SKIP('control sobre la base', 'base-v992 no está al lado');
}

// ---------- (D) pines de cableado ----------
console.log('\n[D] cableado en server.js / db.js / demo.js');
{
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const dbjs = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  const demojs = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
  T('db.js crea la columna posts.creatividad', dbjs.includes("ALTER TABLE posts ADD COLUMN creatividad TEXT DEFAULT ''"));
  T('server requiere el módulo', srv.includes("require('./creatividad')"));
  T('la semana estampa en los 3 sitios de creación', (srv.match(/stampCreatividad\(/g) || []).length >= 4); // definición + 3 llamadas
  T('la escena del plan manda en el conceptShot de la semana', srv.includes("sceneRole: (idea._creatividad && idea._creatividad.escena) || nextSceneRole()"));
  T('las ideas estampan su metadata (creaMetaDeIdea en makeIdeaDraft)', (srv.match(/creaMetaDeIdea\(uid, idea/g) || []).length >= 2);
  T('el ensure rota la estrella (estrella_rotada)', srv.includes('estrella_rotada: true'));
  T('importTrialWeek estampa el plan de la prueba', srv.includes('creaImp') && srv.includes("origen: 'prueba'"));
  T('la ruta IA de la prueba usa la escena del plan', srv.includes('(sp.creatividad && sp.creatividad.escena) || demoAi.SCENE_ROLES'));
  T('demo.js arma el plan en buildDemoSpec', demojs.includes('planSecuencia') && demojs.includes('creatividad: creaDemo[i] || undefined'));
}

// ---------- (E) boot ----------
console.log('\n[E] boot del árbol');
function getJson(port, pathName) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathName, timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}
async function boot() {
  const port = 35177;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crea-boot-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  try {
    let version = null;
    for (let i = 0; i < 40 && !version; i++) {
      try { version = await getJson(port, '/api/version'); } catch (e) { await new Promise((r) => setTimeout(r, 1500)); }
    }
    T('el servidor bootea y responde /api/version', !!version, log.slice(-300));
    if (version) {
      T('/api/version reporta el BUILD del lote (v1058)', String(version.build || '').includes('v1058'), String(version.build));
    }
    // La columna existe en la DB que el boot creó/migró.
    const { DatabaseSync } = require('node:sqlite');
    const dbf = new DatabaseSync(path.join(dataDir, 'posta.db'), { readOnly: true });
    const cols = dbf.prepare('PRAGMA table_info(posts)').all().map((r) => r.name);
    dbf.close();
    T('la tabla posts tiene la columna creatividad', cols.includes('creatividad'));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { if (child.pid) process.kill(child.pid, 'SIGKILL'); } catch (e) {}
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

(async () => {
  try { await boot(); } catch (e) { T('boot sin excepciones', false, e.message); }
  try { fs.rmSync(TMP_DATA, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n== creatividad: ${pass} ok · ${fail} fail · ${skip} skip ==`);
  process.exit(fail ? 1 : 0);
})();
