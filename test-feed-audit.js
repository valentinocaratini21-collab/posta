// test-feed-audit.js — Harness del Feed Audit.
// 3 perfiles ficticios (desprolijo / decente / bueno) → JSON válido, scores
// ordenados, fixes con evidencia, sin clichés. Corre sin red ni API key
// (inyecta fetch/llm/palette mocks).
'use strict';

const fa = require('./feed-audit.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
}

// --- Perfiles ficticios -------------------------------------------------------
function mkPost({ type = 'GraphImage', daysAgo = 1, caption = '', comments = 5 }) {
  return {
    type, shortcode: 'ABC' + Math.floor(Math.random() * 1e6),
    taken_at: Math.floor(Date.now() / 1000) - daysAgo * 86400,
    caption, comments, thumb: null,
  };
}
// MALO: 12 posteos en 90 días, sin CTA, sin hashtags, captions vacíos, bio vacía
const badPosts = Array.from({ length: 12 }, (_, i) => mkPost({
  daysAgo: 90 - i * 7,
  caption: i % 3 === 0 ? '' : ['promo', 'nuevo', 'mirá'][i % 3],
}));
// DECENTE: 12 posteos en 30 días, algunos CTA, pocos hashtags
const okPosts = Array.from({ length: 12 }, (_, i) => mkPost({
  type: i % 4 === 0 ? 'GraphVideo' : 'GraphImage',
  daysAgo: 30 - i * 2.5,
  caption: i % 3 === 0
    ? 'Nuevo ingreso 🔥 Escribinos por WhatsApp #moda'
    : 'Colección nueva disponible en el local',
}));
// BUENO: 12 posteos en 21 días, CTA siempre, hashtags, emojis, bio completa
const goodPosts = Array.from({ length: 12 }, (_, i) => mkPost({
  type: i % 3 === 0 ? 'GraphVideo' : 'GraphImage',
  daysAgo: 21 - i * 1.8,
  caption: `Llegó ${['la campera', 'el buzo', 'la remera'][i % 3]} que pedían 🔥 Escribinos por WhatsApp y te la reservamos #modaargentina #streetwear #nuevacoleccion`,
  comments: 20 + i,
}));

const badProfile = { handle: 'kiosco.donpepe', name: 'Kiosco Don Pepe', bio: '', followers: 320, posts_count: 48, category: 'otro', pic: null };
const okProfile = { handle: 'tienda.maria.ok', name: 'Tienda María', bio: 'Ropa de mujer · Palermo · Lun a Sáb 10-20h', followers: 2400, posts_count: 210, category: 'moda', pic: null };
const goodProfile = { handle: 'urbana.ba', name: 'Urbana BA', bio: 'Streetwear argentino 🔥 Envíos a todo el país · WhatsApp 11-5555-0000 · Local en Palermo', followers: 18500, posts_count: 640, category: 'moda', pic: null };

// --- Respuestas mock del LLM (canned, una por perfil) --------------------------
function mockLlmFor(score, fixes, wins) {
  return async () => ({
    ok: true,
    text: JSON.stringify({
      score,
      summary: 'Resumen de prueba para el harness.',
      dimensions: [
        { key: 'bio', label: 'Bio', score: score - 5, line: 'Línea con dato concreto 1.' },
        { key: 'consistencia', label: 'Consistencia visual', score, line: 'Línea con dato concreto 2.' },
        { key: 'captions', label: 'Captions que venden', score: score + 5, line: 'Línea con dato concreto 3.' },
        { key: 'frecuencia', label: 'Frecuencia', score, line: 'Línea con dato concreto 4.' },
        { key: 'marca', label: 'Marca y confianza', score: score - 3, line: 'Línea con dato concreto 5.' },
      ],
      fixes, wins,
    }),
  });
}
const mkFix = (title, evidence) => ({ title, evidence, fix: 'Hacé X concreto.', example: 'Ejemplo: "..."' });

// --- Tests --------------------------------------------------------------------
async function main() {
  console.log('== 1. computeSignals distingue los 3 perfiles ==');
  const sBad = fa.computeSignals(badProfile, badPosts);
  const sOk = fa.computeSignals(okProfile, okPosts);
  const sGood = fa.computeSignals(goodProfile, goodPosts);
  ok('malo: frecuencia baja', sBad.posts_per_week < 1.5, sBad.posts_per_week);
  ok('bueno: frecuencia alta', sGood.posts_per_week > 3, sGood.posts_per_week);
  ok('malo: 0% CTA', sBad.cta_pct === 0, sBad.cta_pct);
  ok('bueno: 100% CTA', sGood.cta_pct === 100, sGood.cta_pct);
  ok('malo: bio vacía detectada', sBad.bio_length === 0 && !sBad.bio_has_what);
  ok('bueno: bio dice qué vende', sGood.bio_has_what);
  ok('decente: hashtags parciales', sOk.hashtag_pct > 0 && sOk.hashtag_pct < 100, sOk.hashtag_pct);

  console.log('== 2. Prompt incluye datos concretos (anti-genérico) ==');
  const p = fa.buildAuditPrompt(goodProfile, sGood, goodPosts.map((x) => x.caption));
  ok('prompt cita frecuencia', p.user.includes(String(sGood.posts_per_week)));
  ok('prompt cita CTA%', p.user.includes(sGood.cta_pct + '%'));
  ok('prompt incluye captions reales', p.user.includes('Escribinos por WhatsApp'));

  console.log('== 3. validateAudit: 3 perfiles → scores ordenados ==');
  const audits = [];
  for (const [name, score] of [['malo', 34], ['decente', 61], ['bueno', 87]]) {
    const llmRes = await mockLlmFor(score,
      [mkFix('T1', '0 de tus 12 posteos tienen CTA'), mkFix('T2', '3 paletas distintas en 6 posteos'), mkFix('T3', 'bio de 0 caracteres')],
      ['Win 1 con dato 5', 'Win 2 con dato 7'])({});
    const v = fa.validateAudit(JSON.parse(llmRes.text));
    ok(name + ': JSON válido', v.ok, v.errors);
    if (v.ok) audits.push({ name, score: v.audit.score });
  }
  ok('scores ordenados malo<decente<bueno',
    audits.length === 3 && audits[0].score < audits[1].score && audits[1].score < audits[2].score);

  console.log('== 4. Anti-clichés ==');
  const clicheRes = await mockLlmFor(50,
    [mkFix('Constancia', 'posteás 1 vez por semana, publicá más seguido para crecer'), mkFix('T2', '2 de 10 sin hashtag'), mkFix('T3', 'bio corta: 20 caracteres')],
    ['Win 1'])({});
  const cliche = JSON.parse(clicheRes.text);
  const vc = fa.validateAudit(cliche);
  ok('cliché "publicá más seguido" rechazado', !vc.ok && vc.errors.includes('cliche_detected'), vc.errors);
  ok('containsCliche detecta variantes', fa.containsCliche('Deberías mejorar tus fotos urgentemente'));

  console.log('== 5. Evidencia obligatoria ==');
  const noEvRes = await mockLlmFor(50,
    [mkFix('T1', 'tus posteos podrían mejorar'), mkFix('T2', '2 de 10 sin hashtag'), mkFix('T3', 'bio de 20 caracteres')],
    ['Win 1'])({});
  const noEv = JSON.parse(noEvRes.text);
  const ve = fa.validateAudit(noEv);
  ok('fix sin número ni cita rechazado', !ve.ok && ve.errors.some((e) => e.startsWith('fix_no_evidence')), ve.errors);

  console.log('== 6. E2E auditFeed con mocks (fetch + llm) ==');
  const mockFetch = async (ig) => {
    const map = { 'kiosco.donpepe': [badProfile, badPosts], 'tienda.maria.ok': [okProfile, okPosts], 'urbana.ba': [goodProfile, goodPosts] };
    const [prof, posts] = map[ig] || map['urbana.ba'];
    // HTML mínimo que fetchAuditData puede parsear: bio + posts JSON
    const postJson = posts.map((pt) =>
      `{\\"__typename\\":\\"${pt.type}\\",\\"shortcode\\":\\"${pt.shortcode}\\",\\"taken_at_timestamp\\":${pt.taken_at},\\"display_url\\":\\"\\",\\"edge_media_to_comment\\":{\\"count\\":${pt.comments}},\\"edge_media_to_caption\\":{\\"edges\\":[{\\"node\\":{\\"text\\":\\"${pt.caption}\\"}}]}}`
    ).join(',');
    return `<html>\\"username\\":\\"${ig}\\",\\"biography\\":\\"${prof.bio}\\",\\"followers_count\\":${prof.followers},\\"posts_count\\":${prof.posts_count},${postJson}</html>`;
  };
  // fetchAuditData usa demo.fetchIgEmbedHtml + parseEmbedPosts; el mock devuelve
  // HTML directo. Pero fetchAuditData también llama demo.fetchIgProfile (red) → lo
  // evitamos pasando perfiles ya armados vía un fetch que devuelva null pic.
  // Para el E2E usamos el camino real con HTML mock (fetchIgProfile falla grácil).
  const scores = {};
  for (const [ig, want] of [['kiosco.donpepe', 34], ['tienda.maria.ok', 61], ['urbana.ba', 87]]) {
    const r = await fa.auditFeed(null, ig, {
      fetch: mockFetch,
      llm: mockLlmFor(want,
        [mkFix('T1', '0 de 12 posteos con CTA'), mkFix('T2', '4 paletas en 6 posteos'), mkFix('T3', 'bio de ' + (ig === 'kiosco.donpepe' ? 0 : 40) + ' caracteres')],
        ['Win con dato 9']),
      palette: 4,
    });
    ok(ig + ': audit ok', r.ok && r.audit.score === want, r.error || (r.audit && r.audit.score));
    if (r.ok) scores[ig] = r.audit.score;
    // segunda llamada → cache
    const r2 = await fa.auditFeed(null, ig, { fetch: () => { throw new Error('no debería llamarse'); }, llm: null });
    ok(ig + ': segunda llamada sale del cache', r2.ok && r2.cached === true);
  }
  ok('E2E: scores ordenados', scores['kiosco.donpepe'] < scores['tienda.maria.ok'] && scores['tienda.maria.ok'] < scores['urbana.ba']);

  console.log('== 7. Anti-spam 5/día ==');
  const ip = '9.9.9.9-harness';
  let oks = 0;
  for (let i = 0; i < 6; i++) if (fa.consumeAuditAttempt(ip).ok) oks++;
  ok('5 permitidos, 6to bloqueado', oks === 5, oks);
  fa.refundAuditAttempt(ip);
  ok('refund libera un intento', fa.consumeAuditAttempt(ip).ok);

  console.log('== 8. sanitizeHandle ==');
  ok('saca @ y basura', fa.sanitizeHandle('@Tienda.Maria!') === 'Tienda.Maria');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
