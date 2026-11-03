// LOTE ESTRATEGIA-NÚMEROS — suite nueva.
// Extrae la función REAL anaWeekNumsTiles de public/chunk-analisis.js y la
// evalúa con stubs mínimos (anaLang/anaT replican la semántica del chunk).
// Correr: node work/test-loteestrategianumeros.js  (sale 0 solo si todo pasa)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const CHUNK = fs.readFileSync(path.join(ROOT, 'public', 'chunk-analisis.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + label); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label + ' (esperado ' + JSON.stringify(b) + ', real ' + JSON.stringify(a) + ')'); }

function loadTiles(lang) {
  const start = CHUNK.indexOf('function anaWeekNumsTiles');
  const end = CHUNK.indexOf('\nasync function anaWeekNumsLoad');
  if (start < 0 || end < 0 || end <= start) throw new Error('no se pudo extraer anaWeekNumsTiles');
  const sandbox = {
    anaLang: lang,
    anaT: function (es, en) { return sandbox.anaLang === 'en' ? en : es; },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(CHUNK.slice(start, end), sandbox);
  return sandbox.anaWeekNumsTiles;
}

const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const digits = (s) => String(s).replace(/\D/g, '');

// --- ES: los 3 números con datos reales ---
{
  const f = loadTiles('es');
  const tiles = f(
    { posts_7d: 7, reach_7d: 1234 },
    [
      { status: 'published', published_at: daysAgo(2), likes: 120 },
      { status: 'published', published_at: daysAgo(5), likes: 80 },
      { status: 'published', published_at: daysAgo(1), likes: null }, // sin métrica: no suma ni bloquea
      { status: 'draft', published_at: daysAgo(1), likes: 999 },      // no publicado: ignorado
      { status: 'published', published_at: daysAgo(9), likes: 500 },  // fuera de ventana: ignorado
    ]
  );
  eq(tiles.map((t) => t.l), ['Posteos', 'Likes', 'Alcance'], 'ES: orden Posteos, Likes, Alcance');
  eq(tiles[0].n, '7', 'ES: Posteos = posts_7d');
  eq(tiles[1].n, '200', 'ES: Likes = suma real 120+80');
  eq(digits(tiles[2].n), '1234', 'ES: Alcance = reach_7d (dígitos)');
}

// --- EN: etiquetas espejo ---
{
  const f = loadTiles('en');
  const tiles = f({ posts_7d: 3, reach_7d: 90 }, [{ status: 'published', published_at: daysAgo(1), likes: 4 }]);
  eq(tiles.map((t) => t.l), ['Posts', 'Likes', 'Reach'], 'EN: etiquetas Posts/Likes/Reach');
  eq(tiles.map((t) => t.n), ['3', '4', '90'], 'EN: valores');
}

// --- Sin dato: fila vacía (nunca un 0 inventado) ---
{
  const f = loadTiles('es');
  eq(f({ posts_7d: 0, reach_7d: 0, reach_30d: 0, interactions_30d: 0, followers: 0, posts_prev7d: 0, best_post: null }, []), [], 'cero de stats/ig + sin posteos = sin fila');
  eq(f(null, null), [], 'endpoints caídos = sin fila');
  // Posteos publicados en ventana pero SIN likes todavía: Likes no se dibuja.
  eq(f({ posts_7d: 0, reach_7d: 0 }, [{ status: 'published', published_at: daysAgo(1), likes: null }]).map((t) => t.l), [], 'publicado sin métrica = ningún número');
}

// --- Fuentes independientes: cae una, la otra sigue ---
{
  const f = loadTiles('es');
  eq(f(null, [{ status: 'published', published_at: daysAgo(1), likes: 15 }]).map((t) => t.l), ['Likes'], 'stats/ig caído: solo Likes');
  const t2 = f({ posts_7d: 5, reach_7d: 400 }, null);
  eq(t2.map((t) => t.l), ['Posteos', 'Alcance'], 'posts caído: Posteos + Alcance, sin Likes');
}

// --- Likes 0 real SÍ se dibuja (hay dato, suma 0) ---
{
  const f = loadTiles('es');
  const tiles = f({ posts_7d: 0, reach_7d: 0 }, [{ status: 'published', published_at: daysAgo(1), likes: 0 }]);
  eq(tiles.map((t) => t.l), ['Likes'], 'likes 0 con dato real = tile Likes');
  eq(tiles[0].n, '0', 'likes 0 real se muestra como 0');
}

// --- created_at como respaldo de published_at (igual que buildSummary) ---
{
  const f = loadTiles('es');
  const tiles = f({ posts_7d: 0, reach_7d: 0 }, [{ status: 'published', created_at: daysAgo(3), likes: 9 }]);
  eq(tiles.map((t) => t.n), ['9'], 'created_at respalda a published_at');
}

// --- Marcadores estructurales en el chunk (carta e Impulsar intactos) ---
ok(CHUNK.includes('<div id="anaWeekNums"></div>'), 'placeholder anaWeekNums en anaCartaHTML');
ok(CHUNK.includes('function anaLetterMinimalHTML'), 'carta mínima intacta');
ok(CHUNK.includes('function anaBoostRecLoad'), 'Impulsar (anaBoostRecLoad) intacto');
ok(CHUNK.includes('anaWeekNumsLoad();'), 'loader llamado desde anaLoad/anaBackCurrent');
ok(/async function anaWeekNumsLoad\(\) \{\n  const box = document\.getElementById\('anaWeekNums'\);\n  if \(!box \|\| anaPastMode\) return;/.test(CHUNK), 'loader con guarda anaPastMode (cartas anteriores sin números)');
ok(CHUNK.includes("api.get('/api/stats/ig')"), 'loader lee /api/stats/ig');
ok(CHUNK.includes("api.get('/api/posts')"), 'loader lee /api/posts');
ok(!CHUNK.includes('interactions_30d'), 'nunca se usa interactions_30d como Likes (mezcla comentarios/guardados)');
ok(CSS.includes('.ana-weeknums'), 'estilos .ana-weeknums en styles.css');
ok(CSS.includes('.ana-weeknum b'), 'estilo número grande en styles.css');

console.log(`loteestrategianumeros: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
