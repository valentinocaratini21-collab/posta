#!/usr/bin/env node
/* LOTE ESTRATEGIA-PRÓXIMO-PASO — suite nueva.
 * Corre: node work/test-loteestrategiaproximopaso.js  (desde el scratch)
 * Cubre: prioridad determinista, conteo de pendientes, textos ES/EN,
 * destinos (feed / scroll a Impulsar sin segundo botón de cobro),
 * cableado solo en camino actual, y alcance (app.js/server.js intactos,
 * styles solo +3 reglas). Control negativo: en prístino v559 la sección
 * no existe y estos asserts fallan.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const BASE = path.join(__dirname, '..');
const WORK = fs.existsSync(path.join(BASE, 'work', 'public', 'chunk-analisis.js')) ? path.join(BASE, 'work') : __dirname;
const BASE588 = path.join(BASE, '.loteinicio5-release-work');
const PRISTINE = path.join(BASE, 'pristine-v559');

let ok = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { ok++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' :: ' + extra : '')); }
}

const chunk = fs.readFileSync(path.join(WORK, 'public', 'chunk-analisis.js'), 'utf8');
const marker = '/* ---------- LOTE ESTRATEGIA-PRÓXIMO-PASO';
const secIdx = chunk.indexOf(marker);
t('sección próximo-paso presente en chunk-analisis.js', secIdx >= 0);
const section = secIdx >= 0 ? chunk.slice(secIdx) : '';

const styles = fs.readFileSync(path.join(WORK, 'public', 'styles.css'), 'utf8');
const pStyles = fs.readFileSync(path.join(BASE588, 'public', 'styles.css'), 'utf8');

// ---------- sandbox con stubs ----------
function makeSandbox(apiImpl) {
  const els = {};
  function mkEl(id) {    return {
      id, innerHTML: '', dataset: {}, scrolled: false,
      scrollIntoView() { this.scrolled = true; },
      insertAdjacentHTML(pos, html) {
        if (html.indexOf('id="anaNextStep"') >= 0) els.anaNextStep = mkEl('anaNextStep');
      },
    };
  }
  els.anaRoot = mkEl('anaRoot');
  let lang = 'es'; // cierre: el this del vm no refleja escrituras desde Node
  const sandbox = {
    anaLang: 'es',
    anaPastMode: false,
    anaT(es, en) { return lang === 'en' ? en : es; },
    setLang(l) { lang = l; },
    esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
    api: apiImpl,
    albumMondayKey() { return '2026-11-02'; },
    document: { getElementById(id) { return els[id] || null; } },
    location: { hash: '' },
    console,
  };
  sandbox.__els = els;
  sandbox.__mkEl = mkEl;
  vm.createContext(sandbox);
  if (section) vm.runInContext(section, sandbox);
  return sandbox;
}

const WK = '2026-11-02';
const P = (over) => Object.assign({ id: 1, status: 'scheduled', approval: 'pending', week_key: WK }, over);
const D = (over) => Object.assign({ id: 2, status: 'draft', approval: null, week_key: WK }, over);

// ---------- funciones puras ----------
{
  const sb = makeSandbox({ get: async () => null });
  t('Pendientes: programado pendiente semana actual = 1', sb.anaNextStepPendientes([P()], WK) === 1);
  t('Pendientes: programado otra semana = 0', sb.anaNextStepPendientes([P({ week_key: '2026-10-26' })], WK) === 0);
  t('Pendientes: programado aprobado = 0', sb.anaNextStepPendientes([P({ approval: 'approved' })], WK) === 0);
  t('Pendientes: borrador sin week_key = 1', sb.anaNextStepPendientes([D({ week_key: '' })], WK) === 1);
  t('Pendientes: borrador semana actual = 1', sb.anaNextStepPendientes([D()], WK) === 1);
  t('Pendientes: borrador otra semana = 0', sb.anaNextStepPendientes([D({ week_key: '2026-10-26' })], WK) === 0);
  t('Pendientes: borrador aprobado = 0', sb.anaNextStepPendientes([D({ approval: 'approved' })], WK) === 0);
  t('Pendientes: publicado/cancelado = 0', sb.anaNextStepPendientes([P({ status: 'published' }), P({ status: 'cancelled', id: 3 })], WK) === 0);
  t('Pendientes: sin mondayKey = 0 (fail-closed)', sb.anaNextStepPendientes([P()], '') === 0);
  t('Pendientes: lista nula = 0', sb.anaNextStepPendientes(null, WK) === 0);
  t('Pendientes: mezcla cuenta solo pendientes reales', sb.anaNextStepPendientes([P(), P({ week_key: '2026-10-26' }), D(), P({ status: 'published', id: 9 })], WK) === 2);

  t('Elegir: pendientes manda sobre mejor', sb.anaNextStepElegir(2, true) === 'aprobar');
  t('Elegir: sin pendientes + mejor = impulsar', sb.anaNextStepElegir(0, true) === 'impulsar');
  t('Elegir: sin pendientes ni mejor = null', sb.anaNextStepElegir(0, false) === null);

  sb.anaLang = 'es';
  const hAp = sb.anaNextStepHTML('aprobar');
  t('HTML ES aprobar: título + botón', hAp.includes('Próximo paso') && hAp.includes('Aprobá tu semana'));
  t('HTML aprobar: destino feed, no cobro', hAp.includes('anaNextStepIrInicio()') && !hAp.includes('anaBoostRecElegir') && !hAp.includes('$20'));
  const hIm = sb.anaNextStepHTML('impulsar');
  t('HTML ES impulsar: título + botón', hIm.includes('Próximo paso') && hIm.includes('Impulsá tu mejor posteo'));
  t('HTML impulsar: scroll a Impulsar, un solo botón, sin montos', hIm.includes('anaNextStepIrImpulsar()') && (hIm.match(/<button/g) || []).length === 1 && !hIm.includes('$20') && !hIm.includes('$50') && !hIm.includes('$100'));
  sb.setLang('en');
  const hEn = sb.anaNextStepHTML('aprobar');
  t('HTML EN aprobar: Next step + Approve your week', hEn.includes('Next step') && hEn.includes('Approve your week'));
  const hEnIm = sb.anaNextStepHTML('impulsar');
  t('HTML EN impulsar: Boost your best post', hEnIm.includes('Boost your best post'));
}

// ---------- destinos ----------
{
  const sb = makeSandbox({ get: async () => null });
  sb.anaNextStepIrInicio();
  t('IrInicio: hash a #/app/inicio', sb.location.hash === '#/app/inicio');
  sb.__els.anaBoostRec = sb.__mkEl('anaBoostRec');
  sb.anaNextStepIrImpulsar();
  t('IrImpulsar: scroll a #anaBoostRec', sb.__els.anaBoostRec.scrolled === true);
  const sb2 = makeSandbox({ get: async () => null });
  sb2.anaNextStepIrImpulsar(); // sin tarjeta Impulsar: no rompe
  t('IrImpulsar sin tarjeta: no rompe', true);
}

// ---------- carga end-to-end con DOM falso ----------
async function loadCases() {
  // A: pendientes -> aprobar, sin llamar a mejor-posteo
  {
    let calls = [];
    const sb = makeSandbox({ get: async (u) => { calls.push(u); if (u === '/api/posts') return [P(), D({ id: 5 })]; return null; } });
    sb.__els.anaNextStep = sb.__mkEl('anaNextStep');
    await sb.anaNextStepLoad();
    t('Load A: pendientes -> tarjeta aprobar', sb.__els.anaNextStep.innerHTML.includes('Aprobá tu semana'));
    t('Load A: con pendientes no consulta mejor-posteo', !calls.includes('/api/estrategia/mejor-posteo'));
  }
  // B: sin pendientes + mejor -> impulsar
  {
    const sb = makeSandbox({ get: async (u) => { if (u === '/api/posts') return [P({ status: 'published', id: 7 })]; if (u === '/api/estrategia/mejor-posteo') return { ok: true, mejor: { post_id: 7 } }; return null; } });
    sb.__els.anaNextStep = sb.__mkEl('anaNextStep');
    await sb.anaNextStepLoad();
    t('Load B: sin pendientes + mejor -> tarjeta impulsar', sb.__els.anaNextStep.innerHTML.includes('Impulsá tu mejor posteo'));
  }
  // C: sin pendientes ni mejor -> sin tarjeta
  {
    const sb = makeSandbox({ get: async (u) => { if (u === '/api/posts') return []; if (u === '/api/estrategia/mejor-posteo') return { ok: true, mejor: null }; return null; } });
    sb.__els.anaNextStep = sb.__mkEl('anaNextStep');
    await sb.anaNextStepLoad();
    t('Load C: sin pendientes ni mejor -> sin tarjeta', sb.__els.anaNextStep.innerHTML === '');
  }
  // D: fallo de /api/posts -> sin tarjeta y sin consultar mejor (fail-closed)
  {
    let calls = [];
    const sb = makeSandbox({ get: async (u) => { calls.push(u); if (u === '/api/posts') throw new Error('red'); return { ok: true, mejor: { post_id: 1 } }; } });
    sb.__els.anaNextStep = sb.__mkEl('anaNextStep');
    await sb.anaNextStepLoad();
    t('Load D: fallo de posts -> sin tarjeta (fail-closed)', sb.__els.anaNextStep.innerHTML === '');
    t('Load D: fallo de posts -> no consulta mejor', !calls.includes('/api/estrategia/mejor-posteo'));
  }
  // E: modo carta anterior -> no renderiza
  {
    const sb = makeSandbox({ get: async () => [P()] });
    sb.anaPastMode = true;
    sb.__els.anaNextStep = sb.__mkEl('anaNextStep');
    await sb.anaNextStepLoad();
    t('Load E: carta anterior -> sin tarjeta', sb.__els.anaNextStep.innerHTML === '');
  }
  // F: mount crea el contenedor una sola vez
  {
    const sb = makeSandbox({ get: async () => [] });
    sb.anaNextStepMount();
    const first = sb.__els.anaNextStep;
    t('Mount: crea #anaNextStep', !!first);
    sb.anaNextStepMount();
    t('Mount: segunda llamada no duplica', sb.__els.anaNextStep === first);
  }
}

// ---------- estáticos: cableado, alcance, M78 ----------
{
  const anaLoadIdx = chunk.indexOf('async function anaLoad(');
  const anaLoadBody = chunk.slice(anaLoadIdx, chunk.indexOf('function anaRefresh'));
  t('Cableado: anaLoad monta próximo-paso', anaLoadBody.includes('anaNextStepMount()'));
  const backIdx = chunk.indexOf('function anaBackCurrent(');
  const backBody = chunk.slice(backIdx, backIdx + 600);
  t('Cableado: anaBackCurrent monta próximo-paso', backBody.includes('anaNextStepMount()'));
  const pastIdx = chunk.indexOf('async function anaOpenPast(');
  const pastBody = chunk.slice(pastIdx, chunk.indexOf('function anaBackCurrent('));
  t('Cableado: anaOpenPast NO monta próximo-paso', !pastBody.includes('anaNextStepMount'));

  const fns = ['anaNextStepPendientes', 'anaNextStepElegir', 'anaNextStepHTML', 'anaNextStepIrInicio', 'anaNextStepIrImpulsar', 'anaNextStepMount', 'anaNextStepLoad'];
  for (const f of fns) {
    const defs = (chunk.match(new RegExp('function ' + f + '\\(', 'g')) || []).length;
    t('M78: ' + f + ' definida 1 vez', defs === 1, 'defs=' + defs);
  }
  t('M78: mount presente en def + 2 llamadas (anaLoad, anaBackCurrent)', (chunk.match(/anaNextStepMount\(\)/g) || []).length === 3);
  t('CSS: 3 reglas .ana-nextstep', styles.includes('.ana-nextstep{margin-bottom:14px}') && styles.includes('.ana-nextstep-t{') && styles.includes('.ana-nextstep-p{'));
  const pLines = new Set(pStyles.split('\n'));
  const addedLines = styles.split('\n').filter((l) => !pLines.has(l));
  t('CSS vs base v588: solo agrega líneas de la tanda (magia/boostrec/weeknums/nextstep/aprende/mano)', addedLines.length > 0 && addedLines.every((l) => l.trim() === '' || /^\s*(\/\*|\*)/.test(l) || /ana-magia|anaMagiaEntradaKF|ana-lhead|ana-boostrec-sec|ana-boostrec-saludo|ana-boostrec-despedida|ana-weeknum|ana-nextstep|ana-aprende|ana-carta-mano|CARTA-MANO|ESTRATEGIA-MAGIA/.test(l)), 'agregadas=' + JSON.stringify(addedLines));

  const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
  const _appB = fs.readFileSync(path.join(BASE588, 'public', 'app.js'), 'utf8');
  const _appW = fs.readFileSync(path.join(WORK, 'public', 'app.js'), 'utf8');
  const _appDiff = _appW.split('\n').filter((l, i) => l !== _appB.split('\n')[i]);
  t('Alcance: app.js vs base v588 SOLO cambia CHUNK_V', _appDiff.length === 1 && _appDiff[0].includes('CHUNK_V'));
  const _srvW = fs.readFileSync(path.join(WORK, 'server.js'), 'utf8').split('\n');
  const _srvB = fs.readFileSync(path.join(BASE588, 'server.js'), 'utf8');
  const _aS = _srvW.findIndex((l) => l.includes('LOTE ESTRATEGIA-APRENDE'));
  const _aE = _srvW.findIndex((l) => l.includes('} catch (e) { aprendizaje = null; }'));
  const _srvRev = _srvW.filter((_, i) => !(i >= _aS && i <= _aE) && _.trim() !== 'aprendizaje,').join('\n').replace('20261101-v589', '20261101-v588');
  t('Alcance: server.js vs base v588 SOLO BUILD + aprende', _srvRev === _srvB);
  t('Alcance: sin data/ en el árbol', !fs.existsSync(path.join(WORK, 'data')));
  const censo = (s) => [(s.match(/catsMatch|first_week/g) || []).length, 0];
  void censo;
}

loadCases().then(() => {
  console.log(`loteestrategiaproximopaso: ${ok} ok, ${fail} fallos`);
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.log('ERROR harness: ' + e.message); process.exit(1); });
