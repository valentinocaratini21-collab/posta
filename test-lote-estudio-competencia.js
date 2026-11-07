// test-lote-estudio-competencia.js — ESTUDIO-PROFUNDO · MEJORA 5 COMPETENCIA.
// SOLO la pieza del estudio: 3-5 cuentas del MISMO rubro y MISMA ciudad que
// el cliente, con sus tipos de posteo y temas extraídos; el hueco (lo que
// nadie de la competencia hace y el cliente podría hacer) es la oportunidad,
// guardada en el fundamento con procedencia (fundamento.competitors).
// El lote semanal de tendencias es APARTE: este archivo documenta el esquema
// como contrato para que ese lote reutilice estos datos sin re-estudiar.
//
// RED-PRIMERO: exige ./study-competitors (módulo nuevo) + el hook en
// server.js (trialDigest.competitors en las dos rutas de prueba) + el
// espacio de nombres en client-digest.js (emptyDigest). Sin el módulo,
// la suite falla antes de la primera aserción.
// Uso: node test-lote-estudio-competencia.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('OK  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 500) : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

let mod = null;
try {
  mod = require('./study-competitors');
} catch (e) {
  console.log('RED: no se pudo cargar ./study-competitors :: ' + e.message);
  console.log('0/' + 0 + ' — módulo ausente (rojo-primero esperado antes del build)');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Fixtures: café de especialidad en Palermo (cliente) + competencia.
// ---------------------------------------------------------------------------
const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);
function mkPost(type, daysAgo, caption, likes) {
  return { type, shortcode: 'X' + daysAgo + type.slice(5, 9), taken_at: NOW - daysAgo * DAY, caption, likes: likes || 0, comments: 0 };
}
function auditData(handle, bio, posts, followers) {
  return {
    ok: true,
    profile: { handle, name: handle, bio, followers: followers || 100, posts_count: posts.length, following: 50 },
    posts,
  };
}
const CLIENT_POSTS = [
  mkPost('GraphImage', 1, 'Nuestro brunch de domingo ☕ #brunch #palermo', 40),
  mkPost('GraphImage', 3, 'Café de especialidad recién tostado #cafe #palermo', 35),
  mkPost('GraphVideo', 5, 'Así preparamos tu flat white #cafe', 60),
  mkPost('GraphImage', 8, 'Brunch para dos este finde #brunch', 30),
];
const COMP_A = auditData('cafe.a.palermo', 'Café de especialidad en Palermo ☕ brunch todos los días',
  [mkPost('GraphImage', 1, 'Brunch de hoy #brunch #palermo', 20), mkPost('GraphImage', 4, 'Café filtrado #cafe #palermo', 15),
   mkPost('GraphImage', 7, 'Desayuno completo #desayuno', 10), mkPost('GraphImage', 10, 'Tostadas y café #cafe', 12)], 500);
const COMP_B = auditData('cafe.b.palermo', 'Palermo Soho — brunch y café de especialidad',
  [mkPost('GraphImage', 2, 'Merienda para compartir #merienda #palermo', 25), mkPost('GraphVideo', 5, 'Nuestro barista en acción #cafe', 30),
   mkPost('GraphImage', 9, 'Brunch del sábado #brunch', 18)], 800);
const COMP_C = auditData('cafe.c.palermo', 'Cafetería en Palermo, café de especialidad y pastelería',
  [mkPost('GraphImage', 1, 'Pastelería casera #pasteleria', 9), mkPost('GraphImage', 3, 'Desayuno #desayuno #cafe', 11),
   mkPost('GraphImage', 6, 'Café con leche #cafe', 8), mkPost('GraphImage', 11, 'Torta del día #pasteleria', 7),
   mkPost('GraphImage', 14, 'Brunch #brunch', 6)], 300);
// Misma rubro, OTRA ciudad: pin 📍 distinto de la ciudad del cliente.
const COMP_ROSARIO = auditData('cafe.rosario', '📍 Rosario, Santa Fe · Cafetería de especialidad y brunch',
  [mkPost('GraphImage', 2, 'Brunch rosarino #brunch', 50), mkPost('GraphVideo', 6, 'Reel del local #cafe', 70)], 2000);
// Sin ciudad en la bio: no se puede afirmar que sea local.
const COMP_SIN_CIUDAD = auditData('cafe.sin.ciudad', 'Café de especialidad y brunch, te esperamos',
  [mkPost('GraphImage', 2, 'Brunch #brunch', 5)], 90);

const CLIENT = {
  rubro: 'cafeteria', ciudad: 'Palermo', ciudadSource: 'web',
  clientHandle: 'mi.cafe.palermo',
  clientBio: 'Café de especialidad en Palermo ☕',
  clientCaptions: CLIENT_POSTS.map((p) => p.caption),
  clientPosts: CLIENT_POSTS,
  clientTopics: ['café de especialidad', 'brunch'],
};

async function main() {
  // --- 0. Módulo y forma -------------------------------------------------
  ok('modulo exporta studyCompetitors', typeof mod.studyCompetitors === 'function');
  ok('modulo exporta profileCompetitor', typeof mod.profileCompetitor === 'function');
  ok('modulo exporta findGap', typeof mod.findGap === 'function');
  ok('modulo exporta extractMentionedHandles', typeof mod.extractMentionedHandles === 'function');
  ok('modulo exporta summarizePosts', typeof mod.summarizePosts === 'function');
  ok('modulo exporta searchPlacesBusinesses', typeof mod.searchPlacesBusinesses === 'function');
  ok('modulo exporta attachCompetitorsToDigest', typeof mod.attachCompetitorsToDigest === 'function');
  ok('MAX_COMPETITORS es 5', mod.MAX_COMPETITORS === 5);

  // --- 1. Fixture principal: 3 locales, tipos + temas + hueco ----------
  const fetchStub = async (h) => {
    const m = { 'cafe.a.palermo': COMP_A, 'cafe.b.palermo': COMP_B, 'cafe.c.palermo': COMP_C }[h];
    return m || null;
  };
  const block = await mod.studyCompetitors({
    ...CLIENT,
    competitorsField: '@cafe.a.palermo, cafe.b.palermo cafe.c.palermo',
    fetchAuditData: fetchStub,
  });
  ok('F1 status ok', block.status === 'ok', block.status);
  ok('F1 rubro y ciudad del fundamento, no inferidos', block.rubro === 'cafeteria' && block.ciudad === 'Palermo');
  ok('F1 se guardan 3 competidores locales', Array.isArray(block.competitors) && block.competitors.length === 3, JSON.stringify((block.competitors || []).map((c) => c.handle)));
  ok('F1 cada competidor trae tipos de posteo', block.competitors.every((c) => c.post_types && typeof c.post_types.total === 'number' && c.post_types.total > 0
    && (c.post_types.images + c.post_types.videos + c.post_types.carousels) === c.post_types.total), JSON.stringify(block.competitors.map((c) => c.post_types)));
  ok('F1 cada competidor trae temas extraídos con procedencia', block.competitors.every((c) => Array.isArray(c.topics) && c.topics.length > 0
    && c.topics.every((t) => t.topic && typeof t.count === 'number' && t.source)), JSON.stringify(block.competitors.map((c) => c.topics)));
  ok('F1 cada competidor trae procedencia y ciudad', block.competitors.every((c) => c.source && c.discovered_via && c.city_match === 'same' && c.city_evidence), JSON.stringify(block.competitors.map((c) => [c.source, c.city_match])));
  ok('F1 hay un hueco identificado con evidencia', !!block.gap && !!block.gap.kind && Array.isArray(block.gap.evidence.competitor_handles)
    && block.gap.evidence.competitor_handles.length === 3, JSON.stringify(block.gap));
  ok('F1 el hueco es formato reels (pooled video_share < 0.15)', block.gap.kind === 'formato' && /reel/i.test(block.gap.label_es || block.gap.detail_es || ''),
    JSON.stringify(block.gap));
  ok('F1 version y studied_at presentes', block.version === 1 && !!block.studied_at);

  // --- 2. Otra ciudad: no cuenta como local ----------------------------
  const fetchRos = async (h) => (h === 'cafe.rosario' ? COMP_ROSARIO : (h === 'cafe.a.palermo' ? COMP_A : null));
  const block2 = await mod.studyCompetitors({
    ...CLIENT, competitorsField: '@cafe.a.palermo @cafe.rosario', fetchAuditData: fetchRos,
  });
  ok('F2 la cuenta de otra ciudad NO es competidora local', block2.competitors.length === 1 && block2.competitors[0].handle === 'cafe.a.palermo',
    JSON.stringify(block2.competitors.map((c) => c.handle)));
  ok('F2 la cuenta de otra ciudad queda marcada distinto', Array.isArray(block2.other_city) && block2.other_city.length === 1
    && block2.other_city[0].handle === 'cafe.rosario' && block2.other_city[0].city_match === 'other'
    && /Rosario/.test(block2.other_city[0].city_evidence || ''), JSON.stringify(block2.other_city));

  // --- 2b. Sin ciudad en la bio: tampoco es local ------------------------
  const fetchSin = async (h) => (h === 'cafe.sin.ciudad' ? COMP_SIN_CIUDAD : null);
  const block2b = await mod.studyCompetitors({
    ...CLIENT, competitorsField: '@cafe.sin.ciudad', fetchAuditData: fetchSin,
  });
  ok('F2b sin evidencia de ciudad no se afirma local', block2b.competitors.length === 0
    && block2b.other_city.length === 1 && block2b.other_city[0].city_match === 'unknown', JSON.stringify(block2b.other_city));

  // --- 3. Sin competidores descubribles: rama honesta --------------------
  let fetchCalls = 0;
  const block3 = await mod.studyCompetitors({
    ...CLIENT, competitorsField: '', fetchAuditData: async () => { fetchCalls++; return null; },
  });
  ok('F3 sin descubribles: status sin_competidores', block3.status === 'sin_competidores', block3.status);
  ok('F3 sin descubribles: lista vacía, nada inventado', block3.competitors.length === 0 && block3.gap === null
    && block3.other_city.length === 0 && fetchCalls === 0, JSON.stringify(block3));
  ok('F3 sin descubribles: nota honesta documentada', Array.isArray(block3.notes) && block3.notes.length > 0);

  // --- 4. Sin ciudad / sin rubro: no se estudia ni se infiere -----------
  let calls4 = 0;
  const block4 = await mod.studyCompetitors({
    ...CLIENT, ciudad: '', competitorsField: '@cafe.a.palermo',
    fetchAuditData: async () => { calls4++; return COMP_A; },
  });
  ok('F4 sin ciudad: status sin_ciudad y cero fetches', block4.status === 'sin_ciudad' && calls4 === 0 && block4.competitors.length === 0, block4.status);
  let calls5 = 0;
  const block5 = await mod.studyCompetitors({
    ...CLIENT, rubro: '', competitorsField: '@cafe.a.palermo',
    fetchAuditData: async () => { calls5++; return COMP_A; },
  });
  ok('F5 sin rubro: status sin_rubro y cero fetches', block5.status === 'sin_rubro' && calls5 === 0, block5.status);

  // --- 6. Menciones: del propio feed, sin el propio @, sin duplicados ----
  const mentions = mod.extractMentionedHandles(
    'Gracias @cafe.a.palermo y @Cafe.B.Palermo por la visita 🙌 @mi.cafe.palermo',
    ['Seguimos a @cafe.c.palermo todos los días', 'nada acá'], 'mi.cafe.palermo');
  ok('F6 menciones extraídas, propio @ fuera, sin duplicados', eq(mentions, ['cafe.a.palermo', 'cafe.b.palermo', 'cafe.c.palermo']), JSON.stringify(mentions));

  // --- 7. Hueco de tema: tema del cliente que nadie cubre ----------------
  const localsTema = [
    { handle: 'a', topics: [{ topic: 'brunch', count: 3, source: 'hashtags' }], post_types: { total: 4, images: 2, videos: 2, carousels: 0, video_share: 0.5, carousel_share: 0 } },
    { handle: 'b', topics: [{ topic: 'cafe', count: 2, source: 'hashtags' }], post_types: { total: 4, images: 4, videos: 0, carousels: 0, video_share: 0, carousel_share: 0 } },
  ];
  const gapTema = mod.findGap({ clientTopics: ['brunch', 'merienda temática'], clientPostTypes: mod.summarizePosts(CLIENT_POSTS), locals: localsTema });
  ok('F7 hueco de tema: tema propio sin cobertura', !!gapTema && gapTema.kind === 'tema' && /merienda/i.test(gapTema.label_es || gapTema.detail_es || ''), JSON.stringify(gapTema));

  // --- 8. Hueco de formato carrusel cuando reels ya están cubiertos ------
  const localsCar = [
    { handle: 'a', topics: [{ topic: 'brunch', count: 2, source: 'hashtags' }], post_types: { total: 5, images: 2, videos: 2, carousels: 1, video_share: 0.4, carousel_share: 0.2 } },
    { handle: 'b', topics: [{ topic: 'brunch', count: 2, source: 'hashtags' }], post_types: { total: 5, images: 3, videos: 2, carousels: 0, video_share: 0.4, carousel_share: 0 } },
  ];
  const gapCar = mod.findGap({ clientTopics: ['brunch'], clientPostTypes: mod.summarizePosts(CLIENT_POSTS), locals: localsCar });
  ok('F8 sin hueco de tema y reels cubiertos: hueco carrusel', !!gapCar && gapCar.kind === 'formato' && /carrusel/i.test(gapCar.label_es || gapCar.detail_es || ''), JSON.stringify(gapCar));

  // --- 9. Pocos datos: sin hueco inventado --------------------------------
  const gapPoco = mod.findGap({ clientTopics: ['brunch'], clientPostTypes: mod.summarizePosts(CLIENT_POSTS), locals: [localsTema[0]] });
  ok('F9 con 1 solo competidor no se afirma hueco', gapPoco === null, JSON.stringify(gapPoco));

  // --- 10. Tope 5 locales --------------------------------------------------
  const many = {};
  const fieldMany = [];
  for (let i = 1; i <= 7; i++) {
    const h = 'cafe.x' + i + '.palermo';
    fieldMany.push('@' + h);
    many[h] = auditData(h, 'Café en Palermo número ' + i, [mkPost('GraphImage', 1, 'Café #cafe', 5)], 100 + i);
  }
  const block10 = await mod.studyCompetitors({
    ...CLIENT, competitorsField: fieldMany.join(' '), fetchAuditData: async (h) => many[h] || null,
  });
  ok('F10 tope: 7 candidatos → 5 locales como máximo', block10.competitors.length === 5, String(block10.competitors.length));

  // --- 11. Places: descubiertos sin handle van aparte, sin analizar ------
  const block11 = await mod.studyCompetitors({
    ...CLIENT,
    competitorsField: '@cafe.a.palermo',
    fetchAuditData: fetchStub,
    searchPlacesFn: async () => ({
      available: true,
      results: [
        { name: 'Café Palermo Central', address: 'Av. Santa Fe 1234, Palermo, Buenos Aires', city_match: 'same', city_evidence: 'Palermo, Buenos Aires', source: 'places' },
        { name: 'Café Lejano', address: 'Calle Falsa 123, Rosario', city_match: 'other', city_evidence: 'Rosario', source: 'places' },
      ],
    }),
  });
  ok('F11 places mismo rubro/ciudad: descubierto sin analizar', block11.discovered_not_analyzed.length === 1
    && block11.discovered_not_analyzed[0].name === 'Café Palermo Central' && block11.discovered_not_analyzed[0].analyzed === false
    && block11.discovered_not_analyzed[0].reason === 'sin_handle_ig', JSON.stringify(block11.discovered_not_analyzed));
  ok('F11 places otra ciudad no entra ni como descubierto local', block11.discovered_not_analyzed.every((d) => d.city_match === 'same'));

  // --- 12. preFetchedPeers: no se re-fetchan los del campo ---------------
  let refetch = 0;
  const block12 = await mod.studyCompetitors({
    ...CLIENT,
    competitorsField: '@cafe.a.palermo',
    preFetchedPeers: [{ handle: 'cafe.a.palermo', followers: 500, posts: COMP_A.posts }],
    fetchAuditData: async () => { refetch++; return null; },
  });
  ok('F12 peers ya leídos no se vuelven a bajar', block12.competitors.length === 1 && refetch === 0, 'refetch=' + refetch);

  // --- 13. attach: namespace propio, no reescribe el fundamento ----------
  const digest = { business: 'Mi café', ciudad: 'Palermo', productos: [{ nombre: 'café' }] };
  const out = mod.attachCompetitorsToDigest(digest, block);
  ok('F13 attach pone fundamento.competitors sin tocar el resto', out.competitors === block && out.business === 'Mi café' && out.productos.length === 1);

  // --- 14. Contrato para el lote de tendencias (esquema) ------------------
  const itemKeys = ['handle', 'name', 'bio_head', 'followers', 'posts_count', 'posts_analyzed', 'city_match', 'city_evidence', 'source', 'discovered_via', 'post_types', 'posts_per_week', 'topics', 'analyzed_at'];
  ok('F14 esquema competidor: campos del contrato', block.competitors.every((c) => itemKeys.every((k) => k in c)), JSON.stringify(Object.keys(block.competitors[0] || {})));
  ok('F14 esquema bloque: campos del contrato', ['version', 'status', 'studied_at', 'rubro', 'ciudad', 'competitors', 'other_city', 'discovered_not_analyzed', 'gap', 'notes'].every((k) => k in block));
  ok('F14 esquema gap: campos del contrato', !!block.gap && ['kind', 'label_es', 'label_en', 'detail_es', 'detail_en', 'evidence'].every((k) => k in block.gap));
  ok('F14 esquema post_types: campos del contrato', ['images', 'videos', 'carousels', 'total', 'video_share', 'carousel_share'].every((k) => k in block.competitors[0].post_types));

  // --- 15. Cableado en server.js (las dos rutas de prueba) ---------------
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok('F15 server.js requiere study-competitors', srv.includes("require('./study-competitors')"));
  const hookCount = srv.split('trialCompetitorsStudy(').length - 1;
  ok('F15 helper + llamadas en las dos rutas de prueba', hookCount >= 3, 'ocurrencias=' + hookCount);
  ok('F15 el hook ancla en trialDigest.competitors', srv.includes('trialDigest.competitors'));
  ok('F15 el hook nunca frena la prueba (carrera + try/catch)', /Promise\.race\(\[/.test(srv) && srv.includes('nunca frena la prueba'));

  // --- 16. Espacio de nombres en el fundamento ----------------------------
  const cd = fs.readFileSync(path.join(__dirname, 'client-digest.js'), 'utf8');
  ok('F16 emptyDigest declara competitors: null', /competitors:\s*null/.test(cd));
  ok('F16 el hash de anclas no cubre competitors', !/competitors/.test(cd.split('function digestHashOf')[1].split('}')[0] || ''));

  console.log('\n' + pass + ' OK, ' + fail + ' FAIL' + (fails.length ? ' :: ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('ERROR suite:', e); process.exit(1); });
