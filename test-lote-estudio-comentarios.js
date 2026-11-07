// test-lote-estudio-comentarios.js — ESTUDIO-PROFUNDO M1 · COMENTARIOS (lote 7/11, base v760).
// La mejora 1 del estudio profundo: leer los comentarios de los posteos
// recientes del cliente (misma vía Graph API que ig-comments.js, mismo
// token conectado) y extraer, DETERMINÍSTICO y con procedencia:
//  - preguntas repetidas → FAQ (regla de la casa en preguntas-posteos.js:
//    >= 3 veces Y >= 2 autores distintos; 1 vez = anécdota, no se promueve)
//  - elogios en palabras exactas → ganchos (problema primero)
//  - quejas → lista con procedencia
//  - cero comentarios → rama honesta (sin comentarios, nada inventado)
//  - sin token conectado (la prueba invitada NO tiene OAuth: el embed
//    público trae solo conteos, nunca el texto) → available:false,
//    reason:'no_ig_connected', sin inventar nada.
// El resultado vive en su propio espacio de nombres (fundamento.comments)
// y NO reescribe el fundamento existente.
// Uso: node test-lote-estudio-comentarios.js — sale 0 si todo pasa.
'use strict';
const sc = require('./study-comments');

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 500) : ''}`); }
}

// ---------- Fixtures ----------
const BUNDLE_REPETIDA = {
  posts: 2, comments: 4,
  items: [
    { post_id: 'IG_MEDIA_1', shortcode: 'ABC1', caption: 'Promo del mes', comments: [
      { username: 'ana', text: '¿Hacen envíos a CABA?' },
      { username: 'luis', text: '¿Hacen envíos a CABA?' },
      { username: 'maria', text: '¿hacen envios a caba?' },
    ] },
    { post_id: 'IG_MEDIA_2', shortcode: 'ABC2', caption: 'Nuevo producto', comments: [
      { username: 'sol', text: 'Me encanta, el mejor café de la zona, siempre vuelvo' },
    ] },
  ],
};
const BUNDLE_UNICA = {
  posts: 1, comments: 1,
  items: [
    { post_id: 'IG_MEDIA_9', shortcode: 'ZZZ9', caption: 'Promo', comments: [
      { username: 'ana', text: '¿Cuánto sale el combo?' },
    ] },
  ],
};
const BUNDLE_VACIA = { posts: 3, comments: 0, items: [] };
const BUNDLE_QUEJA = {
  posts: 1, comments: 2,
  items: [
    { post_id: 'IG_MEDIA_5', shortcode: 'QQQ5', caption: 'Nuevo', comments: [
      { username: 'pedro', text: 'Pedí hace una semana y nunca me llegó, una demora terrible' },
      { username: 'lau', text: 'Hermoso todo, gracias!' },
    ] },
  ],
};

(async () => {
  // 1) Pregunta repetida 3 veces (2+ autores) → FAQ con procedencia.
  const r1 = sc.extractFromBundle(BUNDLE_REPETIDA);
  check('1a repetida 3x → 1 FAQ', Array.isArray(r1.faqs) && r1.faqs.length === 1, JSON.stringify(r1.faqs));
  check('1b FAQ trae la pregunta en palabras de los clientes',
    r1.faqs[0] && /env[ií]os a caba/i.test(r1.faqs[0].pregunta), JSON.stringify(r1.faqs[0]));
  check('1c FAQ trae veces=3', r1.faqs[0] && r1.faqs[0].veces === 3, JSON.stringify(r1.faqs[0]));
  check('1d FAQ trae procedencia (id del posteo)',
    r1.faqs[0] && Array.isArray(r1.faqs[0].post_ids) && r1.faqs[0].post_ids.includes('IG_MEDIA_1'),
    JSON.stringify(r1.faqs[0]));
  check('1e FAQ trae autores distintos', r1.faqs[0] && (r1.faqs[0].autores || []).length >= 2, JSON.stringify(r1.faqs[0]));

  // 2) Pregunta dicha una sola vez → NO se promueve a FAQ.
  const r2 = sc.extractFromBundle(BUNDLE_UNICA);
  check('2a una sola vez → 0 FAQs', Array.isArray(r2.faqs) && r2.faqs.length === 0, JSON.stringify(r2.faqs));
  check('2b la pregunta única queda registrada como observada, no como FAQ',
    r2.counts && r2.counts.questions_total === 1, JSON.stringify(r2.counts));

  // 3) Elogio en palabras exactas → gancho con esas palabras.
  check('3a elogio → 1 gancho', Array.isArray(r1.hooks) && r1.hooks.length === 1, JSON.stringify(r1.hooks));
  check('3b gancho con las palabras exactas del cliente',
    r1.hooks[0] && r1.hooks[0].texto === 'Me encanta, el mejor café de la zona, siempre vuelvo',
    JSON.stringify(r1.hooks[0]));
  check('3c gancho con procedencia (id del posteo)',
    r1.hooks[0] && r1.hooks[0].post_id === 'IG_MEDIA_2', JSON.stringify(r1.hooks[0]));

  // 4) Queja → lista con procedencia, sin inventar respuesta.
  const r4 = sc.extractFromBundle(BUNDLE_QUEJA);
  check('4a queja → 1 queja listada', Array.isArray(r4.complaints) && r4.complaints.length === 1, JSON.stringify(r4.complaints));
  check('4b queja con texto verbatim y procedencia',
    r4.complaints[0] && /nunca me llegó/.test(r4.complaints[0].texto) && r4.complaints[0].post_id === 'IG_MEDIA_5',
    JSON.stringify(r4.complaints[0]));
  check('4c queja NO se promueve a FAQ ni a gancho',
    r4.faqs.length === 0 && r4.hooks.length === 1, JSON.stringify({ faqs: r4.faqs, hooks: r4.hooks }));

  // 5) Cero comentarios → rama honesta, nada inventado.
  const r5 = sc.extractFromBundle(BUNDLE_VACIA);
  check('5a cero comentarios → available true pero vacío',
    r5.available === true && r5.faqs.length === 0 && r5.hooks.length === 0 && r5.complaints.length === 0,
    JSON.stringify(r5));
  check('5b cero comentarios → nota honesta sin_comentarios',
    r5.note === 'sin_comentarios', JSON.stringify(r5));
  check('5c cero comentarios → counts en 0', r5.counts && r5.counts.comments === 0, JSON.stringify(r5.counts));

  // 6) Sin token → rama honesta, SIN intentar fetch.
  let fetchCalled = false;
  const r6 = await sc.studyForAccount({
    igUserId: '', accessToken: '',
    fetchBundle: async () => { fetchCalled = true; return BUNDLE_REPETIDA; },
  });
  check('6a sin token → available false', r6.available === false, JSON.stringify(r6));
  check('6b sin token → reason no_ig_connected', r6.reason === 'no_ig_connected', JSON.stringify(r6));
  check('6c sin token → NO se intenta ningún fetch', fetchCalled === false, 'fetchCalled=' + fetchCalled);
  check('6d sin token → nada inventado', r6.faqs.length === 0 && r6.hooks.length === 0, JSON.stringify(r6));

  // 7) Con token → usa el fetch inyectado (misma vía que ig-comments) y extrae.
  const r7 = await sc.studyForAccount({
    igUserId: '123', accessToken: 'TOKEN',
    fetchBundle: async () => BUNDLE_REPETIDA,
  });
  check('7a con token → available true', r7.available === true, JSON.stringify(r7));
  check('7b con token → FAQ extraída del bundle', r7.faqs.length === 1 && r7.counts.comments === 4, JSON.stringify(r7));

  // 8) studyForTrial (prueba invitada, sin OAuth) → rama honesta.
  const r8 = sc.studyForTrial();
  check('8a trial invitada → available false', r8.available === false, JSON.stringify(r8));
  check('8b trial invitada → reason no_ig_connected', r8.reason === 'no_ig_connected', JSON.stringify(r8));

  // 9) commentsGoalLines: la generación usa las palabras exactas.
  const lines = sc.commentsGoalLines(r1, 'es');
  check('9a goal lines no vacías con datos', lines.length >= 2, JSON.stringify(lines));
  check('9b goal lines citan la pregunta real',
    lines.some((l) => /env[ií]os a caba/i.test(l)), JSON.stringify(lines));
  check('9c goal lines citan el elogio exacto',
    lines.some((l) => l.includes('el mejor café de la zona')), JSON.stringify(lines));
  check('9d goal lines vacías sin datos (nada inventado)',
    sc.commentsGoalLines(r5, 'es').length === 0 && sc.commentsGoalLines(r8, 'es').length === 0,
    JSON.stringify(sc.commentsGoalLines(r5, 'es')));
  const linesEn = sc.commentsGoalLines(r1, 'en');
  check('9e goal lines EN existen y citan lo mismo',
    linesEn.length >= 2 && linesEn.some((l) => /env[ií]os a caba/i.test(l)), JSON.stringify(linesEn));

  // 10) extractFromBundle nunca lanza con entrada rota.
  let r10 = null; let threw = false;
  try { r10 = sc.extractFromBundle(null); } catch (e) { threw = true; }
  check('10a entrada null → no lanza y responde sin datos', !threw && r10 && r10.available === false, JSON.stringify(r10));
  let r10b = null;
  try { r10b = sc.extractFromBundle({ items: [{ post_id: 'X', comments: [{ username: '', text: '   ' }, null] }] }); } catch (e) { threw = true; }
  check('10b comentarios vacíos/rotos → no lanza, 0 comentarios', !threw && r10b && r10b.counts.comments === 0, JSON.stringify(r10b));

  console.log(`\ntest-lote-estudio-comentarios: ${pass} pass, ${fail} fail`);
  if (fail) { console.log('FALLIDOS:', fails.join(' | ')); process.exit(1); }
})();
