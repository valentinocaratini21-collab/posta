// test-lang-founder-audit.js — v395 · DEUDA DE PARIDAD (CAMBIO DE IDIOMA =
// CAMBIO TOTAL). Cubre las tres piezas que eran solo-ES:
//  1. Toque del fundador: selección ES/EN del borrador (email.js).
//  2. Auditoría pública: prompt EN completo, caché SEPARADA por idioma
//     (mismo @: la ES cacheada no tapa la EN), errores EN (feed-audit.js).
//  3. Claim de Tiendanube: mensajes de validación por idioma (tn-install.js).
// Corre sin red ni API key: DB temporal (DATA_DIR), fetch/llm mocks.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-parity-data-'));

let ok = 0, bad = 0;
const t = (name, cond, extra) => { if (cond) { ok++; console.log('  ✓', name); } else { bad++; console.log('  ✗', name, extra || ''); } };

const E = require('./email');
const fa = require('./feed-audit.js');
const tn = require('./tn-install.js');

function mockFetchFor(profile, posts) {
  return async (ig) => {
    const postJson = posts.map((pt) =>
      `{\\"__typename\\":\\"${pt.type}\\",\\"shortcode\\":\\"${pt.shortcode}\\",\\"taken_at_timestamp\\":${pt.taken_at},\\"display_url\\":\\"\\",\\"edge_media_to_comment\\":{\\"count\\":${pt.comments}},\\"edge_media_to_caption\\":{\\"edges\\":[{\\"node\\":{\\"text\\":\\"${pt.caption}\\"}}]}}`
    ).join(',');
    return `<html>\\"username\\":\\"${ig}\\",\\"biography\\":\\"${profile.bio}\\",\\"followers_count\\":${profile.followers},\\"posts_count\\":${profile.posts_count},${postJson}</html>`;
  };
}

const auditJson = (labels, lineWord) => JSON.stringify({
  score: 61,
  summary: 'A solid account summary with ' + lineWord + ' and room to grow.',
  dimensions: [
    { key: 'bio', label: labels[0], score: 56, line: 'Line with a concrete fact 1.' },
    { key: 'consistencia', label: labels[1], score: 61, line: 'Line with a concrete fact 2.' },
    { key: 'captions', label: labels[2], score: 66, line: 'Line with a concrete fact 3.' },
    { key: 'frecuencia', label: labels[3], score: 61, line: 'Line with a concrete fact 4.' },
    { key: 'marca', label: labels[4], score: 58, line: 'Line with a concrete fact 5.' },
  ],
  fixes: [
    { title: 'T1', evidence: '0 of 12 posts have a CTA', fix: 'Do concrete X.', example: 'Example: "..."' },
    { title: 'T2', evidence: '4 palettes across 6 posts', fix: 'Do concrete Y.', example: '' },
    { title: 'T3', evidence: 'bio of 40 characters', fix: 'Do concrete Z.', example: '' },
  ],
  wins: ['Win with fact 9'],
});

async function main() {
  console.log('== 1. Toque del fundador: selección de idioma ==');
  const link = 'https://postycommunitymanager.com/#/semana/tok';
  t('param lang=en → EN', E.founderTouchEmail({}, 'https://x', link, 'en').subject === "I'm Valentino — writing to you myself");
  t('lead.lang=en sin param → EN', E.founderTouchEmail({ lang: 'en' }, 'https://x', link).subject === "I'm Valentino — writing to you myself");
  t('sin lang → ES histórico', E.founderTouchEmail({}, 'https://x', link).subject === 'Soy Valentino — te escribo yo');
  t('lang=es explícito → ES', E.founderTouchEmail({ lang: 'en' }, 'https://x', link, 'es').subject === 'Soy Valentino — te escribo yo');

  console.log('== 2. buildAuditPrompt EN ==');
  const profile = { handle: 'shop.test', name: 'Shop Test', bio: 'Coffee and brunch in Austin · Open daily 8-18', followers: 2400, posts_count: 210, category: 'gastronomia', pic: null };
  const posts = Array.from({ length: 12 }, (_, i) => ({
    type: 'GraphImage', shortcode: 'S' + i, taken_at: Math.floor(Date.now() / 1000) - i * 2 * 86400,
    caption: 'New roast just landed 🔥 Order on WhatsApp #coffee', comments: 5,
  }));
  const signals = fa.computeSignals(profile, posts);
  const pEn = fa.buildAuditPrompt(profile, signals, posts.map((p) => p.caption), 'en');
  t('system EN (You are Posty)', /You are Posty/.test(pEn.system) && !/Sos Posty/.test(pEn.system));
  t('prompt EN (señales + labels + write in English)', /SIGNALS/.test(pEn.user) && /Write EVERY string in the JSON in English/.test(pEn.system) && /"Visual consistency"/.test(pEn.system) && !/SEÑALES/.test(pEn.user));
  const pEs = fa.buildAuditPrompt(profile, signals, posts.map((p) => p.caption));
  t('sin lang → ES histórico (Sos Posty)', /Sos Posty/.test(pEs.system) && /SEÑALES/.test(pEs.user) && /posteos\/semana/.test(pEs.user));

  console.log('== 3. auditFeed EN + caché separada por idioma ==');
  const fetchMock = mockFetchFor(profile, posts);
  let llmCalls = 0; let lastPrompt = null;
  const llmEs = async (p) => { llmCalls++; lastPrompt = p; return { ok: true, text: auditJson(['Bio', 'Consistencia visual', 'Captions que venden', 'Frecuencia', 'Marca y confianza'], 'datos') }; };
  const llmEn = async (p) => { llmCalls++; lastPrompt = p; return { ok: true, text: auditJson(['Bio', 'Visual consistency', 'Captions that sell', 'Posting frequency', 'Brand & trust'], 'data') }; };

  const r1 = await fa.auditFeed(null, 'shop.test', { fetch: fetchMock, llm: llmEs, palette: 4 });
  t('ES corre y cachea', r1.ok === true && r1.cached === false && llmCalls === 1, JSON.stringify(r1).slice(0, 120));
  const r2 = await fa.auditFeed(null, 'shop.test', { fetch: fetchMock, llm: llmEs, palette: 4 });
  t('ES segunda vez = caché (sin LLM)', r2.ok === true && r2.cached === true && llmCalls === 1);
  const r3 = await fa.auditFeed(null, 'shop.test', { fetch: fetchMock, llm: llmEn, palette: 4, lang: 'en' });
  t('EN con la ES ya cacheada NO usa la caché ES (llama al LLM)', r3.ok === true && r3.cached === false && llmCalls === 2, JSON.stringify(r3).slice(0, 120));
  t('EN el prompt que llegó al LLM es el EN', !!lastPrompt && /You are Posty/.test(lastPrompt.system) && !/Sos Posty/.test(lastPrompt.system));
  t('EN la auditoría trae labels EN', !!r3.audit && r3.audit.dimensions[1].label === 'Visual consistency');
  const r4 = await fa.auditFeed(null, 'shop.test', { fetch: fetchMock, llm: llmEn, palette: 4, lang: 'en' });
  t('EN segunda vez = SU caché', r4.ok === true && r4.cached === true && llmCalls === 2);
  const cEs = fa.getCachedAudit('shop.test');
  const cEn = fa.getCachedAudit('shop.test', 'en');
  t('getCachedAudit separa idiomas', !!cEs && !!cEn && cEs.audit.dimensions[1].label === 'Consistencia visual' && cEn.audit.dimensions[1].label === 'Visual consistency');
  t('getCachedAudit sin cache EN de otro handle = null', fa.getCachedAudit('nadie.test', 'en') === null);

  console.log('== 4. Errores de auditFeed por idioma ==');
  const rBad = await fa.auditFeed(null, '', {});
  t('handle vacío ES histórico', rBad.ok === false && rBad.error === 'Pasame tu @ de Instagram', rBad.error);
  const rBadEn = await fa.auditFeed(null, '', { lang: 'en' });
  t('handle vacío EN', rBadEn.ok === false && rBadEn.error === 'Send me your Instagram @', rBadEn.error);

  console.log('== 5. Claim Tiendanube: validación por idioma ==');
  const vEs = tn.validateClaimBody({ email: 'mal', password: 'x' });
  t('ES email inválido histórico', vEs.ok === false && vEs.error === 'Escribí un email válido para tu cuenta 📧');
  const vEn = tn.validateClaimBody({ email: 'mal', password: 'x', lang: 'en' });
  t('EN email inválido', vEn.ok === false && vEn.error === 'Enter a valid email for your account 📧');
  const vEn2 = tn.validateClaimBody({ email: 'a@b.com', password: '123', lang: 'en' });
  t('EN contraseña corta', vEn2.ok === false && vEn2.error === 'Your password needs at least 6 characters 🔑');
  const vEs2 = tn.validateClaimBody({ email: 'a@b.com', password: '123' });
  t('ES contraseña corta histórica', vEs2.ok === false && vEs2.error === 'La contraseña necesita 6 caracteres como mínimo 🔑');
  const vOkEn = tn.validateClaimBody({ email: 'a@b.com', password: '123456', lang: 'en' });
  t('EN claim válido marca lang', vOkEn.ok === true && vOkEn.lang === 'en');

  console.log(`\n== test-lang-founder-audit: ${ok} ok · ${bad} fallas ==`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
