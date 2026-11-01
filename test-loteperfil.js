'use strict';
/* test-loteperfil.js — LOTE PERFIL (1/11, pedido de Valentino: «Agreguemos eso!»).
   En la cabecera del perfil (Inicio = el perfil de Instagram literal) faltaban:
   1) seguidos (following) junto a publicaciones/seguidores;
   2) el tic de verificado junto al usuario en perfiles verificados en IG.
   Hallazgo de auditoría (verificado contra el embed vivo de @posty.communitymanager):
   - El embed SÍ trae "is_verified" (false para Posty) en el bloque del perfil:
     el tic es extraíble de la misma fuente que followers/posts.
   - El embed NO trae following en ninguna forma (sin following_count, sin
     edge_follow, sin follows_count): seguidos NO se puede mostrar desde esta
     fuente y NO se inventa — el front ya lo renderiza cuando es número y lo
     oculta cuando es null (sin cero inventado). Este test fija ambas reglas.
   Repo-ejecutable: node test-loteperfil.js (desde la raíz del repo).
   Lee ./feed-audit.js y ./public/app.js. Sin dependencias, sin red
   (el parser se alimenta con HTML sintético vía fetchOverride). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); }
}

/* Extractor por llaves con estado de cadena (patrón de test-feed-16-17.js). */
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  let depth = 0, j = i, q = null, esc = false;
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = null;
    } else {
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
  }
  if (depth !== 0) return null;
  return src.slice(i, j + 1);
}

const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const fa = require(path.join(__dirname, 'feed-audit.js'));

/* ---------- 1. Parser: is_verified + following desde el embed ---------- */
async function parserTests() {
  // H1: verificado + seguidos presentes.
  const h1 = '{"username":"test.ok","is_verified":true,"followers_count":1234,'
    + '"posts_count":56,"following_count":78}';
  const d1 = await fa.fetchAuditData('test.ok', async () => h1, { pic: null, name: 'T' });
  ok('H1 ok', d1 && d1.ok);
  ok('H1 is_verified true', d1.profile.is_verified === true, JSON.stringify(d1.profile));
  ok('H1 following 78', d1.profile.following === 78);
  ok('H1 followers 1234', d1.profile.followers === 1234);
  ok('H1 posts 56', d1.profile.posts_count === 56);

  // H2: no verificado + sin seguidos en la fuente -> false/null, nunca invento.
  const h2 = '{"username":"test.no","is_verified":false,"followers_count":90,"posts_count":12}';
  const d2 = await fa.fetchAuditData('test.no', async () => h2, { pic: null, name: 'T' });
  ok('H2 is_verified false', d2.profile.is_verified === false);
  ok('H2 following null (sin dato, no cero)', d2.profile.following === null);

  // H3: edge_follow + sin is_verified -> null/42.
  const h3 = '{"username":"test.edge","followers_count":10,"posts_count":3,'
    + '"edge_follow":{"count":42}}';
  const d3 = await fa.fetchAuditData('test.edge', async () => h3, { pic: null, name: 'T' });
  ok('H3 is_verified null (sin dato)', d3.profile.is_verified === null);
  ok('H3 following 42 vía edge_follow', d3.profile.following === 42);

  // H4: forma real del embed de Posty (is_verified false, sin following).
  const h4 = 'xxx\\"username\\":\\"posty.communitymanager\\",\\"verified\\":false,'
    + '\\"is_verified\\":false,\\"followers_count\\":8,\\"posts_count\\":6,'
    + '\\"edge_followed_by\\":{\\"count\\":8}yyy';
  const d4 = await fa.fetchAuditData('posty.communitymanager', async () => h4, { pic: null, name: 'T' });
  ok('H4 is_verified false (forma real)', d4.profile.is_verified === false);
  ok('H4 following null (el embed no lo trae)', d4.profile.following === null);
  ok('H4 followers 8', d4.profile.followers === 8);
  ok('H4 posts 6', d4.profile.posts_count === 6);
}

/* ---------- 2. Cabecera: tic + seguidos ---------- */
function headerTests() {
  const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
  const pzDecEnt = extractFn(app, 'function pzDecEnt');
  const headFn = extractFn(app, 'function homeHeadHTML');
  ok('extrae esc', !!escLine);
  ok('extrae pzDecEnt', !!pzDecEnt);
  ok('extrae homeHeadHTML', !!headFn);
  if (!escLine || !pzDecEnt || !headFn) return;
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(escLine + '\n' + pzDecEnt + '\n' + headFn, ctx);
  const H = ctx.homeHeadHTML;
  const base = { username: 'test.ok', name: 'Test Ok', pic: 'x.jpg',
    posts_count: 120, followers: 5432 };

  // C1: verificado + seguidos -> tic + 3 stats.
  const c1 = H(Object.assign({}, base, { following: 321, is_verified: true }), '', { splitHead: true });
  ok('C1 tic presente', c1.includes('hf-verified'));
  ok('C1 tic con aria Verificado', c1.includes('Cuenta verificada'));
  ok('C1 seguidos presente', c1.includes('seguidos') && c1.includes('>321<'));
  ok('C1 seguidores 5.432', c1.includes('>5.432<'));
  ok('C1 publicaciones 120', c1.includes('>120<'));
  ok('C1 orden IG (publicaciones, seguidores, seguidos)',
    c1.indexOf('publicaciones') < c1.indexOf('seguidores')
    && c1.indexOf('seguidores') < c1.indexOf('seguidos'));

  // C2: no verificado + sin seguidos -> sin tic, sin seguidos, sin cero inventado.
  const c2 = H(Object.assign({}, base, { following: null, is_verified: false }), '', { splitHead: true });
  ok('C2 sin tic', !c2.includes('hf-verified'));
  ok('C2 sin seguidos', !c2.includes('seguidos'));
  ok('C2 sin cero inventado de seguidos', !c2.includes('>0<'));
  ok('C2 seguidores intactos', c2.includes('>5.432<'));

  // C3: sin dato de verificado -> sin tic (nunca inventado).
  const c3 = H(Object.assign({}, base, { following: 10 }), '', { splitHead: true });
  ok('C3 sin dato -> sin tic', !c3.includes('hf-verified'));
  ok('C3 seguidos con dato sí se muestra', c3.includes('seguidos'));

  // C4: espejo EN.
  const c4 = H(Object.assign({}, base, { following: 7, is_verified: true }), '', { splitHead: true, en: true });
  ok('C4 EN following', c4.includes('>following<') || c4.includes('following'));
  ok('C4 EN aria Verified', c4.includes('Verified account'));
  ok('C4 EN followers', c4.includes('followers'));

  // C5: following 0 real -> se muestra 0 (es un número real, no un invento).
  const c5 = H(Object.assign({}, base, { following: 0, is_verified: false }), '', { splitHead: true });
  ok('C5 following 0 real se muestra', c5.includes('seguidos') && c5.includes('>0<'));

  // C6: sin usuario -> no hay línea hf-user ni tic, sin crash.
  const c6 = H({ name: 'X', pic: 'x.jpg', posts_count: 1, followers: 2 }, '', { splitHead: true });
  ok('C6 sin usuario no rompe', typeof c6 === 'string' && !c6.includes('hf-verified'));
}

(async () => {
  await parserTests();
  headerTests();
  console.log(`loteperfil: ${pass} pass, ${fail} fail`);
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
})();
