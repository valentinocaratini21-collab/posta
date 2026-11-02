'use strict';
/* test-loteticfuente.js — LOTE TIC-FUENTE (1/11, reporte de Valentino:
   «sigue sin aparecer el verificado»).
   Causa verificada en vivo 1/11 18:27–18:33, NO es código ni app vieja:
   - La PÁGINA del perfil instagram.com/posty.communitymanager dice
     is_verified:true 1 vez, con identidad por username+bio (es la página
     donde Valentino ve el tic azul). La cuenta EN también da true.
   - La ventanita EMBED que lee hoy el servidor dice is_verified:false
     7 veces, todas del bloque propio de la cuenta (ES y EN igual).
   - La API oficial (perfil vía CLI: seguidores 8, seguidos 1, posteos 6)
     también da false. El nodo Graph NO es la salida.
   - El CSS del tic está servido y visible; el snapshot se refrescó con
     read_ok y el tic siguió sin aparecer. Conclusión: el embed miente o
     está desactualizado para este campo; la página del perfil manda.
   Fix (solo is_verified, solo en cadencia de refresh del snapshot):
   homeProfileReadAndStore lee además la página del perfil (demo.js
   fetchIgProfilePageHtml, con el juego de headers probado en vivo) y
   resuelve con feed-audit.js resolveHomeVerified: página con identidad
   clara GANA (true o false); si no, se conserva el embed. Fail-safe:
   página ilegible, sin identidad o ambigua -> embed, el home no se rompe.
   Repo-ejecutable: node test-loteticfuente.js (desde la raíz del repo).
   Sin red: el parser se alimenta con HTML sintético. La lectura real de
   la página se validó en vivo por fuera del test (curl + node contra la
   página real: ES true, EN true, ES-pedida-como-EN null). */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); }
}

const fa = require(path.join(__dirname, 'feed-audit.js'));
const demoSrc = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

/* ---------- 1. Parser de la página: identidad clara o nada ---------- */
function pageSnippet(user, ver, opts) {
  const o = opts || {};
  const bio = o.bio || 'Tu community manager completo';
  // Forma real de la página: username, luego bio, luego is_verified.
  if (o.escaped) {
    return 'xxx\\"username\\":\\"' + user + '\\",\\"full_name\\":\\"Posty\\",'
      + '\\"biography\\":\\"' + bio + '\\",\\"is_verified\\":' + ver + ',\\"follower_count\\":8yyy';
  }
  return 'xxx"username":"' + user + '","full_name":"Posty",'
    + '"biography":"' + bio + '","is_verified":' + ver + ',"follower_count":8yyy';
}

// P1: caso Posty real (comillas planas, true) -> true.
ok('P1 página ES true', fa.parseProfilePageVerified(pageSnippet('posty.communitymanager', 'true'), 'posty.communitymanager') === true);
// P2: forma escapada con true -> true.
ok('P2 forma escapada true', fa.parseProfilePageVerified(pageSnippet('posty.test', 'true', { escaped: true }), 'posty.test') === true);
// P3: página true de OTRA cuenta, se pide la propia -> null (nunca tic ajeno).
ok('P3 otro username -> null',
  fa.parseProfilePageVerified(pageSnippet('otra.cuenta', 'true'), 'posty.communitymanager') === null);
// P4: shell de login / página sin username -> null.
ok('P4 sin username -> null',
  fa.parseProfilePageVerified('<html><body>Log in to Instagram</body></html>', 'posty.communitymanager') === null);
// P5: valores en conflicto para el mismo handle -> null (ambiguo, se queda embed).
ok('P5 conflicto mismo handle -> null',
  fa.parseProfilePageVerified(
    pageSnippet('posty.test', 'true') + pageSnippet('posty.test', 'false'),
    'posty.test') === null);
// P6: false unánime para el handle -> false (la página también puede negar).
ok('P6 false unánime', fa.parseProfilePageVerified(pageSnippet('posty.test', 'false'), 'posty.test') === false);
// P7: handle con @ y mayúsculas -> igual matchea.
ok('P7 @ y mayúsculas', fa.parseProfilePageVerified(pageSnippet('posty.test', 'true'), '@Posty.Test') === true);
// P8: username a más de 4000 caracteres del is_verified -> null (fuera de ventana).
ok('P8 username fuera de ventana -> null',
  fa.parseProfilePageVerified('"username":"posty.test"' + 'x'.repeat(5000) + '"is_verified":true', 'posty.test') === null);
// P9: el username MÁS CERCANO manda: bloque propio false, luego bloque ajeno true -> false.
ok('P9 nearest manda (false propio)',
  fa.parseProfilePageVerified(
    pageSnippet('posty.test', 'false') + pageSnippet('otra.cuenta', 'true'),
    'posty.test') === false);
// P10: is_verified sin username antes -> null.
ok('P10 sin username antes -> null',
  fa.parseProfilePageVerified('xxx"is_verified":trueyyy', 'posty.test') === null);
// P11: página vacía / null -> null.
ok('P11 vacío -> null', fa.parseProfilePageVerified('', 'posty.test') === null
  && fa.parseProfilePageVerified(null, 'posty.test') === null);

/* ---------- 2. Precedencia: página clara gana, si no embed ---------- */
// R1: EL CASO POSTY: embed false + página true -> true, fuente page.
const r1 = fa.resolveHomeVerified(false, pageSnippet('posty.communitymanager', 'true'), 'posty.communitymanager');
ok('R1 embed false + página true -> true/page', r1.is_verified === true && r1.source === 'page', JSON.stringify(r1));
// R2: embed false + sin página -> false, fuente embed.
const r2 = fa.resolveHomeVerified(false, null, 'posty.communitymanager');
ok('R2 sin página -> embed', r2.is_verified === false && r2.source === 'embed', JSON.stringify(r2));
// R3: embed true + página false -> false, fuente page (la página también niega).
const r3 = fa.resolveHomeVerified(true, pageSnippet('posty.test', 'false'), 'posty.test');
ok('R3 embed true + página false -> false/page', r3.is_verified === false && r3.source === 'page', JSON.stringify(r3));
// R4: embed null + página true -> true, fuente page.
const r4 = fa.resolveHomeVerified(null, pageSnippet('posty.test', 'true'), 'posty.test');
ok('R4 embed null + página true -> true/page', r4.is_verified === true && r4.source === 'page', JSON.stringify(r4));
// R5: embed null + sin página -> null, fuente embed (nunca inventado).
const r5 = fa.resolveHomeVerified(null, null, 'posty.test');
ok('R5 sin datos -> null/embed', r5.is_verified === null && r5.source === 'embed', JSON.stringify(r5));
// R6: embed false + página de otra cuenta -> false, fuente embed.
const r6 = fa.resolveHomeVerified(false, pageSnippet('otra.cuenta', 'true'), 'posty.test');
ok('R6 página ajena -> embed', r6.is_verified === false && r6.source === 'embed', JSON.stringify(r6));

/* ---------- 3. El parser del embed NO cambia ---------- */
async function embedTests() {
  // E1: forma real del embed de Posty sigue dando false (el override vive
  // solo en homeProfileReadAndStore, no en fetchAuditData).
  const h = 'xxx\\"username\\":\\"posty.communitymanager\\",\\"verified\\":false,'
    + '\\"is_verified\\":false,\\"followers_count\\":8,\\"posts_count\\":6,'
    + '\\"edge_followed_by\\":{\\"count\\":8}yyy';
  const d = await fa.fetchAuditData('posty.communitymanager', async () => h, { pic: null, name: 'T' });
  ok('E1 embed false sigue false', d.profile.is_verified === false);
  ok('E1 embed followers 8 intactos', d.profile.followers === 8);
}

/* ---------- 4. Cableado estático (el re-base no debe perder el fix) ---------- */
function wiringTests() {
  ok('W1 demo exporta fetchIgProfilePageHtml', demoSrc.includes('fetchIgProfilePageHtml'));
  ok('W2 demo pide la página del perfil', demoSrc.includes("https://www.instagram.com/' + user + '/'"));
  ok('W3 demo manda Accept text/html (variante liviana sin él)', demoSrc.includes("'Accept': 'text/html,application/xhtml+xml'"));
  ok('W4 feed-audit exporta parseProfilePageVerified', fa.parseProfilePageVerified && typeof fa.parseProfilePageVerified === 'function');
  ok('W5 feed-audit exporta resolveHomeVerified', fa.resolveHomeVerified && typeof fa.resolveHomeVerified === 'function');
  ok('W6 server usa fetchIgProfilePageHtml', serverSrc.includes('fetchIgProfilePageHtml'));
  ok('W7 server usa resolveHomeVerified', serverSrc.includes('resolveHomeVerified'));
  ok('W8 server guarda verified_source', serverSrc.includes('payload.verified_source = verifiedSource'));
  ok('W9 admin expone is_verified + verified_source', serverSrc.includes('is_verified: payload.is_verified')
    && serverSrc.includes("verified_source: payload.verified_source || 'embed'"));
  ok('W10 server no toca otros campos del payload (solo is_verified)', !serverSrc.includes('data.profile.followers =')
    && !serverSrc.includes('data.profile.posts_count ='));
}

(async () => {
  await embedTests();
  wiringTests();
  console.log('loteticfuente: ' + pass + ' pass, ' + fail + ' fail');
  if (fails.length) { fails.forEach((f) => console.log('  FAIL: ' + f)); process.exit(1); }
})();
