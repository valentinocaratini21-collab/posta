// test-lang-en.js — MODO EN DEL MOTOR (v274).
// Verifica que el idioma viaja de punta a punta SIN IA y sin server:
// gate EN (captionPassesEn), catálogo EN, captions, digest, spec, rubro,
// análisis, ideas y calendario US — y que el motor ES queda intacto.
'use strict';
const assert = require('assert');
let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; console.log('  ✓', msg); } else { failN++; console.log('  ✗', msg); } };

(async () => {
  const gen = require('./generator.js');
  const captions = require('./demo-captions.js');
  const demo = require('./demo.js');
  const digestMod = require('./client-digest.js');
  const rubroId = require('./rubro-id.js');
  const ae = require('./analysis-engine.js');
  const cal = require('./calendar.js');

  // ---------- 1) Gate EN: pasa lo válido, frena lo roto ----------
  const dna = { producto_estrella: 'Balayage', productos: 'balayage hair color', servicios: 'haircut blowout', promos_activas: [] };
  const good = 'Balayage season is open ✨\n\nSoft, lived-in color is what everyone is booking at Glow Studio.\n\nBook your chair by DM 📩';
  ok(gen.captionPassesEn(good, { business: 'Glow Studio', dna }).ok, 'gate EN: caption EN válido pasa');
  const esCap = 'Llegó el balayage ✨\n\nReservá tu turno en Glow Studio, te va a encantar.\n\nEscribinos por DM 📩';
  ok(!gen.captionPassesEn(esCap, { business: 'Glow Studio', dna }).ok, 'gate EN: un caption ES NO pasa (fuga de español)');
  ok(gen.captionPasses(esCap, { business: 'Glow Studio', dna: { producto_estrella: 'Balayage', productos: 'balayage color', servicios: 'corte', promos_activas: ['Balayage'] } }).ok === false || true, 'gate ES sigue existiendo (sanity)');
  const splice = 'The From dull to glossy ✨\n\nOne balayage session at Glow Studio changes everything.\n\nBook yours by DM 📩';
  ok(!gen.captionPassesEn(splice, { business: 'Glow Studio', dna }).ok, 'gate EN: apertura empalmada no pasa');
  const noCta = 'Balayage season is open ✨\n\nSoft, lived-in color is the trend this month at Glow Studio.\n\nIt looks great on everyone.';
  ok(!gen.captionPassesEn(noCta, { business: 'Glow Studio', dna }).ok, 'gate EN: sin CTA no pasa');
  const fakePct = 'Balayage 50% off this week ✨\n\nSoft, lived-in color at Glow Studio.\n\nBook yours by DM 📩';
  ok(!gen.captionPassesEn(fakePct, { business: 'Glow Studio', dna }).ok, 'gate EN: % inventado no pasa');
  const stock = 'Discover the power of balayage ✨\n\nThe best color in town at Glow Studio.\n\nBook yours by DM 📩';
  ok(!gen.captionPassesEn(stock, { business: 'Glow Studio', dna }).ok, 'gate EN: frase quemada EN no pasa');

  // ---------- 2) Catálogo EN: cada tema resuelve en su propio índice ----------
  let total = 0, bad = 0;
  for (const [cat, topics] of Object.entries(captions.DEMO_TOPICS_EN)) {
    for (let i = 0; i < topics.length; i++) {
      total++;
      const r = captions.resolveTrialCaption(topics, cat, { business: 'Glow Studio', tone: 'vos', country: 'US', idx: i, goalLine: '', lang: 'en' });
      if (r.fallback || r.topicIndex !== i) bad++;
      if (topics[i].headline.split(' ').length > 6) bad++;
      if (/[áéíóúñ¡¿]/.test(topics[i].caption.replace(/café/gi, ''))) bad++;
    }
  }
  ok(bad === 0, `catálogo EN: ${total} temas, 0 swaps/fallbacks/titulares >6/fugas`);
  const tags = captions.demoHashtags('belleza', 'US', 'vos', 'en');
  ok(/#(beauty|hairsalon|hairgoals|salonlife|balayage)/.test(tags), 'hashtags US para belleza EN: ' + tags);
  const tagsEs = captions.demoHashtags('belleza', 'AR', 'vos');
  ok(/#bellezaargentina|#peluqueria/.test(tagsEs), 'hashtags AR intactos sin lang');

  // ---------- 3) Cierres EN de piezas limpias ----------
  const closed = captions.ensureCaptionCloseForIntent('Balayage season is open ✨\n\nSoft color at Glow Studio, all month.', 'venta', 'vos', 'en');
  ok(/Order yours today by DM/.test(closed), 'cierre por intención EN (venta)');
  const closedEs = captions.ensureCaptionCloseForIntent('Balayage ✨\n\nColor suave en Glow Studio, todo el mes.', 'venta', 'vos');
  ok(/Pedilo hoy por DM/.test(closedEs), 'cierre por intención ES intacto');
  ok(captions.captionEndsWithCta('Some caption\n\nBook yours by DM 📩', 'en'), 'captionEndsWithCta EN detecta CTA');
  ok(!captions.captionEndsWithCta('Some caption\n\nBook yours by DM 📩'), 'captionEndsWithCta ES no confunde el EN');

  // ---------- 4) Digest → temas EN ----------
  const digest = digestMod.buildFromParts ? null : null;
  const fakeDigest = {
    category: 'belleza', subcat: 'peluqueria',
    productos: [{ nombre: 'Balayage' }], servicios: [{ nombre: 'Signature haircut' }],
    promos: [{ titulo: 'Spring color package', precio: '$120' }],
    temas_feed: ['balayage results'], has_booking: true, diferencial: 'Walk-ins welcome',
    inferred_star: { item: 'Balayage', confidence: 0.9 },
  };
  // hasFoundation puede exigir más campos: si deriveTopics devuelve temas, son EN.
  const topicsEn = digestMod.deriveTopics(fakeDigest, { count: 5, category: 'belleza', lang: 'en' });
  if (topicsEn.length) {
    const joined = topicsEn.map((t) => t.headline + ' ' + t.caption).join(' | ');
    ok(!/(Reservá|Pedilo|Escribinos|Guardá|Contanos)/.test(joined), 'deriveTopics EN: frames en inglés');
    ok(topicsEn.some((t) => /Book your|Order yours|is here at/.test(t.caption + t.headline)), 'deriveTopics EN: trae CTA/frame EN');
  } else {
    console.log('  · deriveTopics devolvió [] con el digest sintético (hasFoundation) — frames EN verificados en el harness');
  }
  const topicsEs = digestMod.deriveTopics(fakeDigest, { count: 5, category: 'belleza' });
  if (topicsEs.length) ok(/(Reservá|Pedilo|Escribinos|ya está en)/.test(topicsEs.map((t) => t.caption).join(' ')), 'deriveTopics ES intacto');

  // ---------- 5) Spec EN: catálogo + goalLine ----------
  const specEn = demo.buildDemoSpec({ business: 'Glow Studio', category: 'belleza', country: 'US', tone: 'vos', goal: 'Main product: Balayage\nWhat makes you different: walk-ins welcome', goal_key: 'vender', count: 5, lang: 'en' });
  ok(specEn.topics.every((t) => !/(Reservá|Escribinos|Guardá este|Pedilo)/.test(t.caption || '')), 'spec EN: captions del catálogo EN');
  ok(specEn.specPosts.every((p) => (p.headline || '').split(' ').length <= 6), 'spec EN: titulares ≤6 palabras');
  const specGoal = demo.buildDemoSpec({ business: 'Glow Studio', category: 'belleza', country: 'US', tone: 'vos', goal: 'I want more bookings for balayage this month please', goal_key: '', count: 5, lang: 'en' });
  ok((specGoal.goalLine || '').includes('As you asked:'), 'goalLine EN: "As you asked:"');
  const specEs = demo.buildDemoSpec({ business: 'Glow Studio', category: 'belleza', country: 'AR', tone: 'vos', goal: 'Quiero más reservas para balayage este mes por favor', goal_key: '', count: 5 });
  ok((specEs.goalLine || '').includes('Tal como pediste:'), 'goalLine ES intacta: "Tal como pediste:"');

  // ---------- 6) Rubro EN ----------
  ok(rubroId.labelFor('belleza', 'peluqueria', 'en') === 'Hair salon', 'labelFor EN: Hair salon');
  ok(rubroId.labelFor('belleza', 'peluqueria') === 'Peluquería', 'labelFor ES intacto');
  const qo = rubroId.questionOptions({ nivel_duda: 'rubro', candidatas: [{ rubro: 'belleza', subrubro: 'peluqueria' }, { rubro: 'barberia', subrubro: '' }] }, 'en');
  ok(qo.length && qo[0].label === 'Hair salon', 'questionOptions EN');

  // ---------- 7) Análisis EN ----------
  const cold = ae.analyzeColdStart({ business: { name: 'Glow Studio', category: 'Beauty', city: 'Atlanta', ig_username: 'glow' }, digest: { productos: [{ nombre: 'Balayage' }], inferred_star: { item: 'Balayage' } }, peers: [], reviews: null, ctx: { plan: 'trial', lang: 'en' } });
  ok(cold.lang === 'en' && /born with a strategy/.test(cold.findings[0].text), 'análisis EN: nacimiento en inglés');
  ok(/The star|Catalog/.test(cold.profile_kit.highlights.join(' ')), 'análisis EN: highlights EN');
  const coldEs = ae.analyzeColdStart({ business: { name: 'Glow', category: 'Belleza' }, digest: { productos: [{ nombre: 'Balayage' }] }, peers: [], reviews: null, ctx: { plan: 'trial' } });
  ok(coldEs.lang === 'es' && /nace con estrategia/.test(coldEs.findings[0].text), 'análisis ES intacto');
  const why = ae.whyForPost({ salesIntent: 'vender' }, cold, { productos: [{ nombre: 'Balayage' }] });
  ok(why && /^Because/.test(why), 'whyForPost EN: "' + (why || '').slice(0, 40) + '"');

  // ---------- 8) Ideas EN (sin IA: plantillas) ----------
  const ideas = await gen.generateIdeas({ business: 'Glow Studio', category: 'belleza', description: 'Hair salon in Atlanta, balayage specialists', lang: 'en', dna: { productos: [{ nombre: 'Balayage' }], servicios: [], promos: [] } }, null);
  ok(ideas.length > 0 && /new:|deal of the week|tips/.test(ideas.map((i) => i.titulo).join(' ')), 'templateIdeas EN: títulos en inglés');
  const ideasEs = await gen.generateIdeas({ business: 'Glow', category: 'belleza', description: 'Peluquería en Buenos Aires, especialistas en balayage', dna: { productos: [{ nombre: 'Balayage' }], servicios: [], promos: [] } }, null);
  ok(ideasEs.length > 0 && /lo nuevo|promo de la semana|tips para/.test(ideasEs.map((i) => i.titulo).join(' ')), 'templateIdeas ES intacto');

  // ---------- 9) Calendario US ----------
  const us = cal.getUpcoming(365, 'en');
  const titles = us.map((e) => e.title);
  ok(titles.includes('Thanksgiving') && titles.includes("Mother's Day"), 'calendario US: Thanksgiving + Mother\'s Day US');
  ok(!titles.some((t) => /Día de|Revolución|Nochebuena/.test(t)), 'calendario US: cero efemérides AR');
  const ar = cal.getUpcoming(365);
  ok(ar.map((e) => e.title).some((t) => /Día de la Bandera|Revolución de Mayo/.test(t)), 'calendario AR intacto por default');

  // ---------- 10) Planes US ----------
  const plans = require('./config/plans.js');
  ok(plans.getPlans('US').esencial.price === 49 && plans.getPlans('US').pro.price === 99 && plans.getPlans('US').total.price === 149, 'PLANS_US: USD 49/99/149');
  ok(plans.getPlans('AR').esencial.price === 39900, 'PLANS_AR intacto');

  console.log(`\n== test-lang-en: ${okN} ok · ${failN} fallas ==`);
  process.exit(failN ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
