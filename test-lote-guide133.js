// Suite LOTE GUIDE133 (v1096) — la guía zapatosGuide133 (Parte 139, MANANA-133:
// 200 casos, rondas 16735–16934) entra al generator.js de producción trasplantada
// VERBATIM desde el árbol de entrenamiento, cableada en zapatosAll tras la cola
// vigente (zapatosGuide62), y entra ENTERA al system prompt real de chatIdea
// dentro del presupuesto (CHAT_SYS_TOKEN_BUDGET 100.000 ≈ 320.000 caracteres).
// La batería canónica (204/204 = 200 vcov + 2×(existe+cableada), chunks
// ronda-16735/16835 de posty-training) corre aparte, dos veces, sobre este árbol.
// Uso: node test-lote-guide133.js   (PZ_TREE apunta a otro árbol para el control)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.env.PZ_TREE || __dirname;
let pass = 0, fail = 0;
function check(name, cond, note) {
  if (cond) { pass++; console.log('ok — ' + name); }
  else { fail++; console.log('MAL — ' + name + (note ? ' :: ' + note : '')); }
}
const gen = fs.readFileSync(path.join(ROOT, 'generator.js'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const idxEs = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');
const sched = fs.readFileSync(path.join(ROOT, 'scheduler.js'), 'utf8');

// 1. La guía existe, una sola vez, con su largo canónico (13.840 caracteres).
check('guide133/existe', gen.includes('ZAPATOS-133 (Parte 139'));
const i133 = gen.indexOf('  const zapatosGuide133 =\n');
check('guide133/bloque', i133 >= 0);
let bloque = '';
if (i133 >= 0) {
  const fin = gen.indexOf('  const zapatosAll = [', i133);
  bloque = gen.slice(i133, fin);
}
check('guide133/largo-canonico-13840', bloque.length === 13840, 'largo=' + bloque.length);
check('guide133/una-sola-vez', gen.split('const zapatosGuide133').length - 1 === 1);

// 2. Cableada en zapatosAll tras la cola vigente; 134/135 NO entran en este lote.
check('guide133/cableada-tras-62', gen.includes('zapatosGuide61, zapatosGuide62, zapatosGuide133];'));
check('guide134/fuera-del-lote', !gen.includes('zapatosGuide134'));
check('guide135/fuera-del-lote', !gen.includes('zapatosGuide135'));

// 3. Los 200 anchors de la guía están en el bloque (9 dimensiones, únicos).
const anchors = [...new Set((bloque.match(/[A-Z][A-Z0-9]+-133-[A-Z0-9][A-Z0-9-]*/g) || []))];
check('guide133/200-anchors', anchors.length === 200, 'anchors=' + anchors.length);

// 4. Stamps del lote en paridad (frescura): BUILD v1096 / PZ_BUILD v1096 / ?v=743 solo ES.
check('stamp/server-build-v1096', srv.includes("const BUILD_ID = '20261105-v1096';"));
check('stamp/app-pzbuild-v1096', app.includes("PZ_BUILD = '20261105-v1096'"));
check('stamp/index-es-v743', idxEs.includes('app.js?v=743'));
check('stamp/styles-sin-bump', idxEs.includes('styles.css?v=20261286') && idxEn.includes('styles.css?v=20261286'));

// 5. Marcadores de los frentes ajenos intactos en la fuente.
check('ajeno/v1095-ruta-descartar', srv.includes('/api/admin/posts/:id/descartar'));
check('ajeno/v1093-pzAdsAutorizarPagina', app.includes('pzAdsAutorizarPagina'));
check('ajeno/v1094-serieFeedSweep', srv.includes('serieFeedSweep') && sched.includes('serieFeedSweep'));
check('ajeno/v1094-cron-07', sched.includes("'7 * * * *'") || sched.includes('"7 * * * *"'));

// 6. Cobertura REAL: el system prompt de chatIdea (fetch stubbeado) trae la guía
//    entera y queda dentro del presupuesto de caracteres.
let captured = null;
global.fetch = async (url, opts) => {
  captured = JSON.parse(opts.body);
  return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
};
(async () => {
  const g = require(path.join(ROOT, 'generator.js'));
  const base = {
    profile: { business_name: 'Lo de Marta', category: 'panadería' },
    taste: '', photos: [], library: [], performance: '', dna: null,
    needDna: false, dnaMissing: [], igAnalysis: '', frustrated: false,
    styleRules: [], voice: '', note: '', tz: 'America/Argentina/Buenos_Aires',
    sales: { isTrial: true, trialExpired: false, trialDaysLeft: 2, planName: '' },
    outcome: '', userId: 999,
  };
  await g.chatIdea({ ...base, messages: [{ role: 'user', text: 'hola' }] }, 'fake-key');
  const sys = captured.messages[0].content + '\n' + captured.messages[1].content;
  const faltan = anchors.filter(a => !sys.includes(a));
  check('vcov/200-anchors-en-el-system', faltan.length === 0, 'faltan=' + faltan.slice(0, 3).join(','));
  check('presupuesto/sysFull<=320000', captured.messages[0].content.length <= 320000, 'sys=' + captured.messages[0].content.length);
  console.log('---');
  console.log(pass + ' ok · ' + fail + ' mal');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
