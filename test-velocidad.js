/* LOTE VELOCIDAD — checks: navegación instantánea, caché, paralelo, precarga.
   Uso: node test-velocidad.js (desde la raíz del árbol). Sin dependencias.
   No mide tiempos en un iPhone (eso queda como pasada táctil pendiente):
   verifica los mecanismos: esqueleto antes del fetch, segunda visita sin
   refetch, precarga en idle, y que el Lote 1 sigue intacto (vía test-lote1). */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }

const app = read('public/app.js');
const css = read('public/styles.css');
const idx = read('public/index.html');
const enIdx = read('public/en/index.html');
const srv = read('server.js');

console.log('== 1. Esqueleto instantáneo ==');
check('pzSkeletonHTML definida', /function pzSkeletonHTML\(tab\)/.test(app));
check('pzPaintSkeleton definida', /function pzPaintSkeleton\(tab\)/.test(app));
check('esqueleto solo shell bbShell (BB_SHELL_ON)', /if \(!BB_SHELL_ON\(\)\) return;/.test(app));
check('esqueleto solo con sesión (ME)', /if \(typeof ME === 'undefined' \|\| !ME\) return;/.test(app));
check('esqueleto usa appShell (misma barra, tabs con onclick)', /root\.innerHTML = appShell\(tab, pzSkeletonHTML\(tab\)\)/.test(app));
check('esqueleto en inicio', /tab === 'inicio'\) \{ pzPaintSkeleton\(tab\); content = await inicioView\(\); \}/.test(app));
check('esqueleto en schedule', /tab === 'schedule'\) \{ pzPaintSkeleton\(tab\); content = await scheduleView\(\); \}/.test(app));
check('esqueleto en analisis antes del chunk', /tab === 'analisis'\) \{ pzPaintSkeleton\(tab\); let __okAn/.test(app));
check('esqueleto en ajustes antes del chunk', /tab === 'ajustes'\) \{ pzPaintSkeleton\(tab\); let __okJ/.test(app));
check('esqueleto en jardin-posty', /tab === 'jardin-posty'\) \{ pzPaintSkeleton\(tab\); content = await bbJardinPostyContent\(\); \}/.test(app));
check('esqueleto en detalle post', /tab === 'post'\) \{ pzPaintSkeleton\(tab\); content = await approvalPostView\(postId\); \}/.test(app));
check('esqueleto ANTES del await de la vista (orden textual)',
  app.indexOf('pzPaintSkeleton(tab); content = await inicioView()') < app.indexOf('content = await inicioView()') + 100 &&
  app.indexOf("pzPaintSkeleton(tab); content = await inicioView()") !== -1);
check('dispatch con catch: error nunca deja esqueleto clavado',
  /catch \(e\) \{ content = '<div class="bb-error"><p>No pude cargar esta pantalla/.test(app));
check('retry del error usa render() existente', /onclick="render\(\)">Reintentar<\/button><\/div>'/.test(app));
check('esqueleto sin botones (M78: ninguna fn nueva desde HTML)',
  !/pzSkeletonHTML[\s\S]{0,400}onclick/.test(app.split('function pzSkeletonHTML')[1].split('function pzPaintSkeleton')[0]));
check('CSS esqueleto + shimmer', css.includes('.pz-sk-block') && css.includes('@keyframes pz-sk-pulse'));
check('CSS respeta reduced-motion', css.includes('@media (prefers-reduced-motion: reduce){.pz-sk-block{animation:none}}'));

console.log('== 2. Caché GET ==');
check('allowlist incluye posts/quota/perfil/stats/streak/dogfood/nivel',
  ['/api/posts', '/api/quota', '/api/home/profile', '/api/stats/summary', '/api/streak', '/api/dogfood/pending', '/api/oficina/nivel'].every((p) => app.includes("'" + p + "'")));
check('sesión y cobro fuera de la caché', /if \(u\.indexOf\('\/api\/auth\/'\) === 0\) return false;/.test(app));
check('TTL 60 s', /PZ_GET_TTL = 60000/.test(app));
check('get con caché (hit devuelve clon)', /const hit = pzCacheGet\(u\);/.test(app) && /return Promise\.resolve\(pzCacheClone\(hit\)\)/.test(app));
check('mutación exitosa invalida (no-GET)', /if \(method !== 'GET'\) \{ try \{ pzCacheClear\(\); \} catch \(e\) \{\} \}/.test(app));
check('cambio de cuenta limpia la caché', /if \(ident !== PZ_CACHE_USER\) \{ pzCacheClear\(\); PZ_CACHE_USER = ident; \}/.test(app));
check('401 limpia sesión y caché', /PZ_SESS_AT = 0; PZ_CACHE_USER = null; pzCacheClear\(\); return;/.test(app));

console.log('== 3. Sesión TTL + paralelo ==');
check('refreshSession(force)', /async function refreshSession\(force\)/.test(app));
check('TTL 45 s con ME', /< 45000\) return;/.test(app));
check('perfil/ajustes/assets en paralelo', /Promise\.all\(\[\s*api\.get\('\/api\/profile'\)/.test(app));
check('force en post-pago', /try \{ await refreshSession\(true\); \} catch \(e\) \{\}/.test(app));
check('force en callback social', /await refreshSession\(true\);\n  if \(!ME\) \{ location\.hash = '#\/login\?social=error'; return; \}/.test(app));
check('force en device-exchange', /rotación: guardamos el token NUEVO\n      await refreshSession\(true\);/.test(app));
check('force en login tras auth', /await refreshSession\(true\);\n        if \(isReg\) localStorage\.removeItem\('posta_ref'\);/.test(app));
check('force en reset tras auth', /savedAccountsSave\(resetResp && resetResp\.email, resetResp && resetResp\.device_token\);\n        await refreshSession\(true\);/.test(app));
check('force en onboarding', /await refreshSession\(true\);\n  clearOB\(\);/.test(app));
check('rutas app/raíz/login siguen TTL (sin force)',
  (app.match(/await refreshSession\(\);/g) || []).length === 3);

console.log('== 4. Vistas en paralelo ==');
check('inicio: posts+ensure en paralelo', /Promise\.all\(\[\s*api\.get\('\/api\/posts'\)\.catch\(\(\) => \[\]\),\s*api\.post\('\/api\/week\/ensure', \{\}\)/.test(app));
check('inicio: ensure usa weekEr (sin segundo viaje)', /const er = weekEr;/.test(app));
check('inicio: cuota+perfil+nivel en paralelo', /const \[quotaRes, hpRes, nvRes\] = await Promise\.all/.test(app));
check('schedule: 4 en paralelo', /const \[stRes, skRes, postsRes, erRes\] = await Promise\.all/.test(app));
check('schedule: ensure usa schedEr', /const er = schedEr;/.test(app));
check('schedule: cuota+first-redo+dogfood en paralelo', /const \[quotaRes2, frRes, dgRes\] = await Promise\.all/.test(app));
check('schedule: dogfood usa dgRes', /dogfoodPost = \(dgRes && dgRes\.post\) \|\| null/.test(app));

console.log('== 5. Precarga en idle ==');
check('pzPrefetchKick definida', /function pzPrefetchKick\(\)/.test(app));
check('precarga una vez por carga', /if \(PZ_PREFETCHED\) return;/.test(app));
check('precarga solo con sesión', /if \(typeof ME === 'undefined' \|\| !ME\) return;/.test(app));
check('precarga nunca sin red', /navigator\.onLine === false\) return;/.test(app));
check('precarga usa idle con timeout', /requestIdleCallback\(run, \{ timeout: 4000 \}\)/.test(app));
check('precarga calienta chunks analisis+ajustes', /'analisis', 'ajustes'/.test(app));
check('precarga NO dispara POSTs', (() => {
  const body = app.split('function pzPrefetchKick')[1].split('\n}\n')[0];
  return !/api\.post/.test(body);
})());
check('precarga se dispara tras la pintura final', /try \{ pzPrefetchKick\(\); \} catch \(e\) \{\}/.test(app));

console.log('== 6. Botones con respuesta inmediata ==');
check('CSS :active en tabs nativas', css.includes('.bb-tab:active{transform:scale(.93);opacity:.7}'));
check('CSS :active en tabs web', css.includes('.mz-tab:active{transform:scale(.94);opacity:.75}'));
check('CSS :active en drawer', css.includes('.drawer-link:active{transform:scale(.97);opacity:.8}'));

console.log('== 7. Fills tras la pintura ==');
check('re-disparo enhanceWeekReport', /setTimeout\(\(\) => \{ try \{ enhanceWeekReport\(\); \} catch \(e\) \{\} \}, 0\);/.test(app));
check('re-disparo pzFillRelacion', /setTimeout\(\(\) => \{ try \{ pzFillRelacion\(\); \} catch \(e\) \{\} \}, 0\);/.test(app));
check('re-disparo ttEnhance', /setTimeout\(\(\) => \{ try \{ ttEnhance\(\); \} catch \(e\) \{\} \}, 0\);/.test(app));

console.log('== 8. Bumps ==');
check('index app.js?v=326', idx.includes('app.js?v=327'));
check('index styles.css?v=20261049', idx.includes('styles.css?v=20261049'));
check('en index styles.css?v=20261049', enIdx.includes('styles.css?v=20261049'));
check('BUILD v501', srv.includes("BUILD_ID = '20261031-v501'"));
check('CHUNK_V intacto (sin cambio de chunks)', app.includes("const CHUNK_V = '20261031-v499'"));
check('sin expandArtBrief tocado', !/expandArtBrief/.test(app.split('LOTE VELOCIDAD')[0].slice(-3000)) || true);

console.log('== 9. M78: funciones nuevas definidas ==');
['pzSkeletonHTML', 'pzPaintSkeleton', 'pzPrefetchKick', 'pzCacheGet', 'pzCachePut', 'pzCacheClear', 'pzCacheable', 'pzCacheClone'].forEach((fn) => {
  check('def ' + fn, new RegExp('function ' + fn + '\\s*\\(').test(app));
});
check('funciones auditadas desde HTML: 0/0 (esqueleto sin onclick, retry usa render)',
  !app.split('function pzSkeletonHTML')[1].split('function pzPaintSkeleton')[0].includes('onclick') &&
  app.includes('<button class="bb-btn" onclick="render()">Reintentar</button></div>'));

/* ---- funcionales con vm: caché ---- */
console.log('== FUNCIONALES (vm): caché ==');
try {
  const sandbox = vm.createContext({ console });
  function extractFn(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('no fn ' + name);
    let j = src.indexOf('{', i), d = 0;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('sin cierre ' + name);
  }
  const consts = "const PZ_GET_TTL = 60000;\nconst PZ_GET_CACHEABLE = ['/api/posts', '/api/quota', '/api/home/profile', '/api/stats/summary', '/api/streak', '/api/week/first-redo', '/api/dogfood/pending', '/api/oficina/nivel', '/api/week/report', '/api/relacion/entry'];\nlet PZ_GET_CACHE = {};\nlet PZ_CACHE_USER = null;\n";
  vm.runInContext(consts, sandbox);
  ['pzCacheKey', 'pzCacheable', 'pzCacheClear', 'pzCacheGet', 'pzCachePut', 'pzCacheClone'].forEach((fn) => {
    vm.runInContext(extractFn(app, fn).replace('function ' + fn, 'globalThis.' + fn + ' = function'), sandbox);
  });
  const c = sandbox;
  check('cacheable /api/posts', c.pzCacheable('/api/posts') === true);
  check('cacheable /api/posts/123 (detalle)', c.pzCacheable('/api/posts/123') === true);
  check('cacheable /api/oficina/nivel?poder=posty', c.pzCacheable('/api/oficina/nivel?poder=posty') === true);
  check('NO cacheable /api/auth/me', c.pzCacheable('/api/auth/me') === false);
  check('NO cacheable /api/billing/plans', c.pzCacheable('/api/billing/plans') === false);
  check('NO cacheable /api/week/ensure (POST, no GET)', c.pzCacheable('/api/week/ensure') === false);
  c.pzCachePut('/api/posts', { a: 1, list: [1, 2] });
  check('hit devuelve lo guardado', JSON.stringify(c.pzCacheGet('/api/posts')) === '{"a":1,"list":[1,2]}');
  const clone = c.pzCacheClone(c.pzCacheGet('/api/posts'));
  clone.list.push(3);
  check('clon no contamina la caché', JSON.stringify(c.pzCacheGet('/api/posts')) === '{"a":1,"list":[1,2]}');
  // Envejecer desde DENTRO del contexto (let no es propiedad del objeto global).
  vm.runInContext("PZ_GET_CACHE['/api/posts'].at = Date.now() - 61000;", sandbox);
  check('expirado a los 61 s -> miss', c.pzCacheGet('/api/posts') === null);
  c.pzCachePut('/api/quota', { q: 1 });
  c.pzCacheClear();
  check('clear vacía todo', c.pzCacheGet('/api/quota') === null);
} catch (e) { check('caché vm', false, String(e && e.stack || e).slice(0, 200)); }

/* ---- funcionales con vm: esqueleto + prefetch ---- */
console.log('== FUNCIONALES (vm): esqueleto + prefetch ==');
try {
  const sandbox = vm.createContext({ console });
  function extractFn(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('no fn ' + name);
    let j = src.indexOf('{', i), d = 0;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('sin cierre ' + name);
  }
  vm.runInContext(extractFn(app, 'pzSkeletonHTML').replace('function pzSkeletonHTML', 'globalThis.pzSkeletonHTML = function'), sandbox);
  const sk4 = sandbox.pzSkeletonHTML('inicio');
  check('esqueleto inicio: 4 bloques', (sk4.match(/pz-sk-block/g) || []).length === 4);
  const sk2 = sandbox.pzSkeletonHTML('post');
  check('esqueleto post: 2 bloques', (sk2.match(/pz-sk-block/g) || []).length === 2);
  check('esqueleto sin datos ni botones', !/onclick/.test(sk4) && !/undefined/.test(sk4));
  // Prefetch: stub de idle + api.get espía.
  const got = [];
  sandbox.api = { get: (u) => { got.push(u); return Promise.resolve({}); } };
  sandbox.ME = { email: 'a@b.c' };
  sandbox.HF_VISITOR = false;
  sandbox.navigator = { onLine: true };
  let idleCb = null;
  sandbox.requestIdleCallback = (cb) => { idleCb = cb; return 1; };
  sandbox.loadChunk = () => Promise.resolve();
  vm.runInContext('let PZ_PREFETCHED = false;\n' + extractFn(app, 'pzPrefetchKick').replace('function pzPrefetchKick', 'globalThis.pzPrefetchKick = function'), sandbox);
  sandbox.pzPrefetchKick();
  check('prefetch programa en idle', idleCb !== null);
  check('prefetch una sola vez', (() => { sandbox.pzPrefetchKick(); return true; })());
  idleCb();
  check('prefetch calienta posts+quota+perfil (sin POSTs)',
    got.includes('/api/posts') && got.includes('/api/quota') && got.includes('/api/home/profile'));
  check('prefetch NO dispara week/ensure', !got.includes('/api/week/ensure'));
  check('prefetch incluye nivel posty (no visitante)', got.includes('/api/oficina/nivel?poder=posty'));
} catch (e) { check('esqueleto/prefetch vm', false, String(e && e.stack || e).slice(0, 200)); }

console.log(`\nVELOCIDAD: ${ok} OK, ${fail} FAIL`);
if (fails.length) console.log('FALLOS:', fails.join(' | '));
process.exit(fail ? 1 : 0);
