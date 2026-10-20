// test-feed-audit-datafixes.js — Regresión de los 3 bugs de datos que encontró
// la práctica de 200 análisis (2026-10-20):
//  D4: parseEmbedPosts dejaba residuo JSON en el 40% de los captions.
//  D3: los likes (edge_liked_by) estaban en el HTML y el parser los tiraba.
//  D1/D2: fetchAuditData leía 0 bios/0 links porque el HTML del embed NO trae
//         biography/external_url — bio vacía significaba NO LEÍDA, pero el
//         sistema la puntuaba como vacía. Ahora viaja bio_unread/link_unread
//         y las señales de bio salen null (sin datos), nunca 0/false.
// Corre sin red: fixtures con la estructura de escape real del embed.
'use strict';

const fa = require('./feed-audit.js');
const ae = require('./analysis-engine.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}

const B = String.fromCharCode(92); // backslash
const Q = B + '"';                  // \" en el archivo

// Posteo con la forma real del embed: caption escapado (\n y \/), seguido por
// edge_media_to_comment y edge_liked_by — el orden que hacía que la captura
// vieja se comiera el cierre y tragara el JSON siguiente.
function postNode({ shortcode, ts, captionFile, comments, likes }) {
  let s = '{' + Q + '__typename' + Q + ':' + Q + 'GraphImage' + Q
    + ',' + Q + 'shortcode' + Q + ':' + Q + shortcode + Q
    + ',' + Q + 'taken_at_timestamp' + Q + ':' + ts
    + ',' + Q + 'display_url' + Q + ':' + Q + 'https:' + B + '/' + B + '/cdn.example.com/x.jpg' + Q
    + ',' + Q + 'edge_media_to_caption' + Q + ':{' + Q + 'edges' + Q + ':[{' + Q + 'node' + Q + ':{' + Q + 'text' + Q + ':' + Q + captionFile + Q + '}}]}'
    + ',' + Q + 'edge_media_to_comment' + Q + ':{' + Q + 'count' + Q + ':' + comments + '}';
  if (likes != null) s += ',' + Q + 'edge_liked_by' + Q + ':{' + Q + 'count' + Q + ':' + likes + '}';
  return s + '}';
}

async function main() {
  console.log('== D4/D3: parser — captions limpios y likes extraídos ==');
  // Caption real con escapes de nivel embed: \n (newline) y \\/ (slash).
  const cap1 = 'OFERTA DE LA SEMANA' + B + 'n' + 'Pedidos por DM, $3500 C' + B + B + '/U.';
  const htmlPosts = '<html>' + Q + 'username' + Q + ':' + Q + 'tienda.test' + Q + ','
    + postNode({ shortcode: 'AAA111', ts: 1791000000, captionFile: cap1, comments: 4, likes: 42 })
    + ',' + postNode({ shortcode: 'BBB222', ts: 1791600000, captionFile: 'Nuevo ingreso de temporada, escribinos', comments: 0, likes: 8 })
    + ',' + postNode({ shortcode: 'CCC333', ts: 1792200000, captionFile: 'Gracias a todas las que ya reservaron su turno', comments: 1, likes: 10 })
    + ',' + postNode({ shortcode: 'DDD444', ts: 1792800000, captionFile: 'Sin likes en el objeto', comments: 2, likes: null })
    + '</html>';
  const posts = fa.parseEmbedPosts(htmlPosts);
  ok('parsea 4 posteos', posts.length === 4, posts.length);
  ok('caption 1 exacto, sin residuo', posts[0].caption === 'OFERTA DE LA SEMANA Pedidos por DM, $3500 C/U.', JSON.stringify(posts[0].caption));
  // Test D4 de la síntesis: ningún caption puede contener edge_, ":{ ni count"
  const sucios = posts.filter((p) => /edge_|":\{|count"/.test(p.caption || ''));
  ok('ningún caption contiene edge_ / ":{ / count"', sucios.length === 0, JSON.stringify(sucios.map((p) => p.caption)));
  ok('comentarios siguen saliendo', posts[0].comments === 4, posts[0].comments);
  ok('D3: likes extraídos del objeto', posts[0].likes === 42 && posts[1].likes === 8 && posts[2].likes === 10,
    JSON.stringify(posts.map((p) => p.likes)));
  ok('D3: posteo sin edge_liked_by → likes null (no 0)', posts[3].likes === null, posts[3].likes);
  const sig = ae.signalsFromPosts(posts);
  ok('D3: analysis-engine promedia likes (42+8+10)/3 = 20', sig.avg_likes === 20, sig.avg_likes);

  console.log('== D4: cleanCaptionResidue sobre el residuo textual de la práctica ==');
  const dirty = 'Texto lindo del posteo"}},"edge_media_to_comment":{"count":0},"edge_liked_by":{"count":2},"commenter_count":0';
  ok('corta en el primer marcador', fa.cleanCaptionResidue(dirty) === 'Texto lindo del posteo', fa.cleanCaptionResidue(dirty));
  ok('normaliza escapes de slash', fa.cleanCaptionResidue('sale C' + B + B + '/U.') === 'sale C/U.');
  ok('saca el escape \\u cortado por el tope', fa.cleanCaptionResidue('Reserv' + B + 'u00') === 'Reserv');
  ok('caption limpio queda intacto', fa.cleanCaptionResidue('Promo de verano 🌞 escribinos') === 'Promo de verano 🌞 escribinos');

  console.log('== D1/D2: embed sin biography → no leída, jamás "vacía" ==');
  const htmlSinBio = '<html>' + Q + 'username' + Q + ':' + Q + 'tienda.test' + Q + ','
    + Q + 'followers_count' + Q + ':1500,' + Q + 'posts_count' + Q + ':120,'
    + postNode({ shortcode: 'AAA111', ts: 1791000000, captionFile: cap1, comments: 4, likes: 42 }) + '</html>';
  const d1 = await fa.fetchAuditData('tienda.test', async () => htmlSinBio, { pic: null, name: 'Tienda Test' });
  ok('fetch ok', d1.ok === true, d1.error);
  ok('bio_unread = true (la fuente no la trae)', d1.profile.bio_unread === true, d1.profile.bio_unread);
  ok('link_unread = true', d1.profile.link_unread === true, d1.profile.link_unread);
  const s1 = fa.computeSignals(d1.profile, d1.posts);
  ok('señales de bio en null (sin datos), no 0/false', s1.bio_length === null && s1.bio_has_what === null,
    JSON.stringify({ l: s1.bio_length, w: s1.bio_has_what }));
  const p1 = fa.buildAuditPrompt(d1.profile, s1, d1.posts.map((x) => x.caption));
  ok('el prompt NO afirma bio "(vacía)"', !p1.user.includes('(vacía)'));
  ok('el prompt declara la bio no leída', p1.user.includes('no se pudo leer'), p1.user.split('\n')[1]);
  const tp1 = fa.trialProfileFromAudit(d1);
  ok('trialProfile propaga bio_unread/link_unread', tp1.bio_unread === true && tp1.link_unread === true);
  ok('trialProfile lleva los captions limpios', tp1.captions.length === 1 && !/edge_/.test(tp1.captions[0]), JSON.stringify(tp1.captions));

  console.log('== D1/D2: HTML con biography (como el fixture histórico) → leída ==');
  const bioReal = 'Ropa de mujer · Palermo · Lun a Sáb 10-20h · WhatsApp 11-5555-0000';
  const htmlConBio = '<html>' + Q + 'username' + Q + ':' + Q + 'tienda.test' + Q + ','
    + Q + 'biography' + Q + ':' + Q + bioReal + Q + ','
    + Q + 'external_url' + Q + ':' + Q + 'https://tienda.example.com' + Q + ','
    + Q + 'followers_count' + Q + ':1500,' + Q + 'posts_count' + Q + ':120,'
    + postNode({ shortcode: 'AAA111', ts: 1791000000, captionFile: cap1, comments: 4, likes: 42 }) + '</html>';
  const d2 = await fa.fetchAuditData('tienda.test', async () => htmlConBio, { pic: null, name: 'Tienda Test' });
  ok('bio leída completa', d2.profile.bio === bioReal, JSON.stringify(d2.profile.bio));
  ok('bio_unread = false', d2.profile.bio_unread === false, d2.profile.bio_unread);
  ok('link leído', d2.profile.link === 'https://tienda.example.com' && d2.profile.link_unread === false,
    JSON.stringify({ link: d2.profile.link, u: d2.profile.link_unread }));
  const s2 = fa.computeSignals(d2.profile, d2.posts);
  ok('señales de bio numéricas como siempre', s2.bio_length === bioReal.length && s2.bio_has_what === false,
    JSON.stringify({ l: s2.bio_length, w: s2.bio_has_what }));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
