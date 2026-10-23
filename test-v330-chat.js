'use strict';
/* test-v330-chat.js — MISIÓN 1 v330 (2026-10-22): el chat del cliente
 * caía SIEMPRE al fallback porque su prompt de sistema medía 147.921
 * tokens contra la ventana de 128.000 de gpt-4o-mini. Este test fija el
 * contrato nuevo con fetch stub (USD 0):
 *  1) el sistema se arma con presupuesto: sysFull ≤ 100.000 tokens
 *     estimados (estimador conservador ÷3,2) y la petición completa
 *     entra en la ventana de 128.000 con aire;
 *  2) las prioridades se respetan: sys base primero, guías funcionales
 *     enteras, baterías zapatos más nuevas presentes (Parte 68/67),
 *     chatVoiceGuide SIEMPRE al final (la voz manda);
 *  3) las capacidades no se rompen: chatIdea parsea los bloques ```idea
 *     y ```edit de la respuesta del modelo (cero fallback en modo
 *     estricto: si el modelo responde, la respuesta llega).
 * Corre con: node test-v330-chat.js */
const assert = require('assert');

let captured = [];
let canned = 'dale, lo armo así 👇';
global.fetch = async (url, opts) => {
  captured.push(JSON.parse(opts.body));
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: canned } }],
      usage: { prompt_tokens: 88000, completion_tokens: 20, total_tokens: 88020 },
    }),
  };
};

const G = require('./generator');

let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); console.log('  ✗', name, '—', e.message); }
}

const PROFILE = {
  business_name: 'Panadería Sol', category: 'gastronomia', tone: 'canchero',
  description: 'Panadería de barrio en Caballito. Medialunas de manteca, facturas y pan casero.',
  competitors: '', goal: 'vender más',
};
const ARGS = {
  messages: [{ role: 'user', text: 'quiero un posteo de las medialunas de manteca' }],
  profile: PROFILE, drafts: [], photos: [], library: [], styleRules: [],
  dna: null, strict: true, userId: 999,
};

(async () => {
  console.log('== 1) Presupuesto de contexto ==');
  await t('chatIdea responde con el modelo (modo estricto, cero fallback)', async () => {
    captured = [];
    const r = await G.chatIdea(ARGS, 'sk-stub');
    assert.ok(r && typeof r.reply === 'string' && r.reply.includes('dale'), JSON.stringify(r).slice(0, 120));
  });
  await t('el modelo de texto sigue siendo gpt-4o-mini', () => {
    assert.strictEqual(captured[0].model, 'gpt-4o-mini');
  });
  await t('sysFull ≤ presupuesto de 100.000 tokens estimados (antes: 147.921 la petición)', () => {
    const sys = captured[0].messages[0].content;
    const est = Math.ceil(sys.length / 3.2);
    assert.ok(est <= 100000, `sysFull ${sys.length} chars ≈ ${est} tokens`);
    assert.ok(sys.length < 400000, 'el sistema se recortó de verdad (antes ~536.000 caracteres): ' + sys.length);
  });
  await t('la petición completa entra en la ventana de 128.000 con aire', () => {
    const totalChars = captured[0].messages.reduce((a, m) => a + String(m.content).length, 0);
    const estReal = Math.round(totalChars / 3.66); // ratio real medido en producción
    assert.ok(estReal < 120000, `petición ≈ ${estReal} tokens reales estimados`);
  });
  await t('prioridades: sys base primero y la voz (chatVoiceGuide) cierra el sistema', () => {
    const sys = captured[0].messages[0].content;
    assert.ok(sys.startsWith('Te llamás Posty'), 'arranca con el sys base');
    assert.ok(sys.trimEnd().endsWith('nunca en minúscula de chat.'), 'cierra con la guía de voz del chat');
  });
  await t('las baterías más nuevas están (Parte 68 y 67 re-enuncian las reglas vigentes)', () => {
    const sys = captured[0].messages[0].content;
    assert.ok(sys.includes('ZAPATOS-62'), 'Parte 68 presente');
    assert.ok(sys.includes('ZAPATOS-61'), 'Parte 67 presente');
  });
  await t('las guías funcionales (capacidades) están enteras', () => {
    const sys = captured[0].messages[0].content;
    assert.ok(sys.includes('show_drafts') || sys.includes('borradores'), 'guía de borradores');
    assert.ok(sys.includes('ESTILO DE ESCRITURA DE ESTE CHAT'), 'guía de voz');
  });

  console.log('== 2) Capacidades: los bloques de acción se parsean ==');
  await t('bloque idea → idea estructurada (propone y ejecuta)', async () => {
    canned = 'listo, te la dejo armada 👇\n\n```idea\n{"titulo":"Medialunas de manteca recién salidas","angulo":"Foto héroe de las medialunas con CTA por DM"}\n```';
    const r = await G.chatIdea(ARGS, 'sk-stub');
    assert.ok(r.idea && /Medialunas/.test(r.idea.titulo || ''), JSON.stringify(r).slice(0, 200));
  });
  await t('bloque edit → edición estructurada sobre un borrador', async () => {
    canned = 'hecho, le cambié el cierre 👇\n\n```edit\n{"draft":1,"caption":"Nuevas medialunas de manteca 🥐\\n\\nSalieron del horno hace un rato.\\n\\nEscribinos por DM 📩"}\n```';
    const r = await G.chatIdea({ ...ARGS, drafts: [{ id: 11, caption: 'borrador viejo', tipo: 'social' }] }, 'sk-stub');
    assert.ok(Array.isArray(r.edits) && r.edits.length >= 1, JSON.stringify(r).slice(0, 200));
  });

  console.log(`\n${passed} ok · ${failed} fallas`);
  if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
