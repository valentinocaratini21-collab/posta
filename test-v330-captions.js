'use strict';
/* test-v330-captions.js — MISIÓN 2 v330 (2026-10-22): desacuerdo de
 * compuertas. /api/generate devolvía captions de 339-621 caracteres y
 * twinSourceCheck rechaza todo lo que pase 320 → las gemelas quemaban
 * ~40 candidatos por historia. Causa raíz: generateContent reintentaba
 * UNA vez y devolvía el segundo intento SIN volver a pasar la puerta.
 * Contrato nuevo (sin debilitar ninguna compuerta):
 *  1) generateContent chequea la puerta en CADA intento (hasta 3) con
 *     el motivo exacto como feedback;
 *  2) si el único problema es el largo, repairCaptionLength acorta el
 *     desarrollo por oraciones enteras — jamás la primera línea
 *     (gancho), jamás la única oración con CTA — y el resultado vuelve
 *     a pasar la puerta COMPLETA antes de aceptarse;
 *  3) el caption final de generateContent pasa captionPasses (o es el
 *     mejor candidato medido, nunca el último a ciegas).
 * Fetch stub, USD 0. Corre con: node test-v330-captions.js */
const assert = require('assert');

let calls = 0;
let script = [];
global.fetch = async (url, opts) => {
  calls++;
  const body = JSON.parse(opts.body);
  const item = script[Math.min(calls - 1, script.length - 1)];
  const content = typeof item === 'function' ? item(body) : item;
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 400, completion_tokens: 120, total_tokens: 520 },
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

const INPUT = {
  business: 'Panadería Sol', category: 'gastronomia', tone: 'canchero',
  description: 'Panadería de barrio en Caballito. Medialunas de manteca, facturas surtidas y pan casero.',
  topic: 'medialunas de manteca recién salidas del horno', tipo: 'social', goal: 'vender más',
};

// Caption válido en todo EXCEPTO el largo (~520 caracteres): gancho bien,
// 3 bloques, CTA con DM, sin frases quemadas ni gritos.
const LONG_OK = {
  caption:
    'Salieron las medialunas de manteca, calentitas 🥐\n\n' +
    'Hacemos las medialunas como siempre, con manteca de verdad y sin apuro, doradas por fuera y suaves por dentro. ' +
    'A la mañana temprano ya están en la vitrina y a la tarde sale otra tanda para la merienda. ' +
    'Mucha gente del barrio pasa antes de ir a trabajar y se lleva media docena para compartir en la oficina. ' +
    'También preparamos bandejas para cumpleaños y reuniones, con facturas surtidas y pan casero del día.\n\n' +
    'Pasá por el local o escribinos por DM 📩',
  overlay: 'Medialunas calentitas',
  hashtags: '#panaderia #medialunas #caballito',
};
const GOOD = {
  caption:
    'Salieron las medialunas de manteca, calentitas 🥐\n\n' +
    'Doradas por fuera, suaves por dentro, recién hechas como todos los días.\n\n' +
    'Pasá por el local o escribinos por DM 📩',
  overlay: 'Medialunas calentitas',
  hashtags: '#panaderia #medialunas #caballito',
};

(async () => {
  console.log('== 1) repairCaptionLength (determinística) ==');
  await t('caption dentro de contrato → intacto', () => {
    assert.strictEqual(G.repairCaptionLength(GOOD.caption), GOOD.caption);
  });
  await t('caption largo → ≤320, primera línea intacta, CTA vivo, puerta completa OK', () => {
    assert.ok(LONG_OK.caption.length > 400, 'fixture largo: ' + LONG_OK.caption.length);
    const fixed = G.repairCaptionLength(LONG_OK.caption);
    assert.ok(fixed.trim().length <= 320, 'largo final: ' + fixed.trim().length);
    assert.strictEqual(fixed.split('\n')[0], LONG_OK.caption.split('\n')[0], 'la línea gancho no se toca');
    assert.ok(/escribinos por DM/i.test(fixed), 'el CTA sobrevive');
    const gate = G.captionPasses(fixed, INPUT);
    assert.ok(gate.ok, 'pasa la puerta completa: ' + gate.reason);
  });
  await t('bloque único largo → se acorta sin matar la primera oración ni el CTA', () => {
    const oneBlock = 'Medialunas de manteca recién salidas del horno para la merienda de hoy. ' +
      'Se hacen con manteca de verdad, sin apuro y con la receta de siempre del barrio. '.repeat(4) +
      'Escribinos por DM y te guardamos tu docena.';
    assert.ok(oneBlock.length > 320);
    const fixed = G.repairCaptionLength(oneBlock);
    assert.ok(fixed.trim().length <= 320, 'largo final: ' + fixed.trim().length);
    assert.ok(fixed.startsWith('Medialunas de manteca recién salidas'), 'primera oración intacta');
    assert.ok(/escribinos por DM/i.test(fixed), 'CTA intacto');
  });

  console.log('== 2) generateContent: la puerta se chequea en cada intento ==');
  await t('intento 1 bueno → 1 sola llamada, caption que pasa la puerta', async () => {
    calls = 0; script = [GOOD];
    const out = await G.generateContent(INPUT, 'sk-stub');
    assert.strictEqual(calls, 1);
    const gate = G.captionPasses(out.caption, INPUT);
    assert.ok(gate.ok, gate.reason);
    assert.ok(out.caption.trim().length <= 320);
  });
  await t('intento 1 largo pero reparable → la reparación cierra el contrato sin gastar otro intento', async () => {
    calls = 0; script = [LONG_OK, GOOD];
    const out = await G.generateContent(INPUT, 'sk-stub');
    assert.strictEqual(calls, 1, 'la reparación determinística alcanzó: ' + calls);
    assert.ok(out.caption.trim().length <= 320, 'largo final: ' + out.caption.trim().length);
    const gate = G.captionPasses(out.caption, INPUT);
    assert.ok(gate.ok, 'puerta completa: ' + gate.reason);
    assert.ok(/escribinos por DM/i.test(out.caption), 'CTA vivo tras hook+reparación');
  });
  await t('intento 1 sin CTA (falla no reparable), intento 2 bueno → sale el bueno CHEQUEADO', async () => {
    const NO_CTA = {
      caption:
        'Salieron las medialunas de manteca, calentitas 🥐\n\n' +
        'Doradas por fuera, suaves por dentro, recién hechas como todos los días.\n\n' +
        'Estamos en Caballito, a dos cuadras de la estación.',
      overlay: 'Medialunas calentitas', hashtags: '#panaderia #medialunas #caballito',
    };
    assert.ok(!G.captionPasses(NO_CTA.caption, INPUT).ok, 'fixture sin CTA no pasa la puerta');
    calls = 0; script = [NO_CTA, GOOD];
    const out = await G.generateContent(INPUT, 'sk-stub');
    assert.strictEqual(calls, 2, 'hubo reintento con feedback');
    assert.ok(out.caption.includes('Doradas por fuera'), 'salió el caption del intento 2');
    assert.ok(G.captionPasses(out.caption, INPUT).ok);
  });
  await t('largo IRREPARABLE (gancho gigante) → feedback con el motivo exacto y reintento que cierra', async () => {
    const GIANT = {
      caption:
        'Salieron las medialunas de manteca bien calentitas, doradas por fuera y suaves por dentro, hechas con la receta de siempre de la panadería del barrio, esa que pasa de generación en generación y que todos los vecinos conocen desde chicos y vienen a buscar cada mañana temprano antes de ir a trabajar\n\n' +
        'Hay facturas surtidas también. Y pan casero del día.\n\n' +
        'Pasá por el local o escribinos por DM 📩',
      overlay: 'Medialunas calentitas', hashtags: '#panaderia #medialunas #caballito',
    };
    assert.ok(GIANT.caption.length > 320, 'fixture: ' + GIANT.caption.length);
    assert.ok(G.repairCaptionLength(GIANT.caption).trim().length > 320, 'la reparación sola no lo puede cerrar');
    let sawFeedback = '';
    calls = 0;
    script = [(body) => {
      const u = body.messages[1].content;
      if (/Ajuste de calidad/.test(u)) { sawFeedback = u; return GOOD; }
      return GIANT;
    }];
    const out = await G.generateContent(INPUT, 'sk-stub');
    assert.strictEqual(calls, 2);
    assert.ok(/demasiado largo/.test(sawFeedback), 'el motivo de largo viajó en el feedback del reintento');
    assert.ok(G.captionPasses(out.caption, INPUT).ok, 'el resultado final pasa la puerta');
  });

  console.log(`\n${passed} ok · ${failed} fallas`);
  if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
