'use strict';
/*
 * LOTE REHACER-ANCLADO — suite propia.
 * Incidente 13/11 18:17 (posteo 649): la nota de voz «sacá el avatar de
 * Posty…» corrió por el cerebro, la Palanca 7 regeneró con refs: [] (la
 * foto actual no viajó), el resultado (la cara de Posty como imagen
 * entera) reemplazó a la foto SIN verificación y SIN prev_image_path, y
 * el recibo salió cortado a 40 caracteres a mitad de frase.
 *
 * Secciones:
 *  1. Detector pzChatPedidoSobreFoto (extraído del server real).
 *  2. pzRegenParaPost + verificarRehacerAnclado (extraídos, con stubs):
 *     la forma del incidente y sus variantes — fail-closed siempre.
 *  3. chatReceiptLines REAL (generator.js): la respuesta no se trunca y
 *     las líneas honestas del rehacer bloqueado existen.
 *  4. Pines estáticos de cableado (release) + CONTROL contra base/
 *     (el incidente reproducido a nivel de carril).
 *  5. Boot smoke: /api/version y la ruta del hilo responden.
 * La visión real NO se ejercita (sin claves de IA en sandbox): la
 * verificación se prueba con veredictos stubbeados por la misma vía
 * HTTP que usa el código (fetch inyectado).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const BASE = path.join(ROOT, '..', 'base');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const hasBase = fs.existsSync(path.join(BASE, 'server.js'));
const baseServerSrc = hasBase ? fs.readFileSync(path.join(BASE, 'server.js'), 'utf8') : '';
const baseAppSrc = hasBase ? fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8') : '';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, name) { if (cond) { pass++; } else { fail++; bad.push(name); console.log('  ✗ ' + name); } }
function eq(a, b, name) { ok(a === b, name + ` (esperado ${JSON.stringify(b)}, vino ${JSON.stringify(a)})`); }

// ── 1. Detector ──────────────────────────────────────────────────────
console.log('· 1. Detector de pedido sobre la foto');
{
  const m = serverSrc.match(/function pzChatPedidoSobreFoto[\s\S]*?\n\}/);
  ok(!!m, 'detector extraíble del server');
  const f = eval('(' + m[0].replace('function pzChatPedidoSobreFoto', 'function f') + ')');
  const cases = [
    ['Quiero que saques el avatar de Posty de arriba a la izquierda, en la imagen.', true, 'la frase del incidente'],
    ['sacá el logo de la foto', true, 'sacar + foto'],
    ['remove the logo from the photo', true, 'EN remove + photo'],
    ['mejorá la foto, está oscura', true, 'mejorar + foto'],
    ['tapá el precio que se ve en la imagen', true, 'tapar + imagen'],
    ['rehacé el posteo entero, no me gusta el enfoque', false, 'rehacer sin foto = concepto'],
    ['cambiá el caption por uno más corto', false, 'caption no es la foto'],
    ['la foto está perfecta, dejala así', false, 'sin verbo de edición'],
    ['hacé un posteo nuevo sobre el café', false, 'creación, no edición'],
  ];
  for (const [t, want, name] of cases) eq(f(t), want, 'detector: ' + name);
}

// ── 2. Regen anclada + verificación fail-closed ─────────────────────
console.log('· 2. pzRegenParaPost / verificarRehacerAnclado (stubs)');
const MEDIA = fs.mkdtempSync(path.join(os.tmpdir(), 'rehacer-media-'));
fs.writeFileSync(path.join(MEDIA, 'orig.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
fs.writeFileSync(path.join(MEDIA, 'nueva.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
function buildLane({ key, verdict, fidelity, genThrows }) {
  const src = serverSrc.slice(serverSrc.indexOf('function pzChatPedidoSobreFoto'), serverSrc.indexOf('// Red anti-silencio'));
  const calls = { gen: [], fetch: 0 };
  const conceptShotGenerateQueued = async (args) => {
    calls.gen.push(args);
    if (genThrows) throw new Error('kill-switch');
    if (args.resultOut) { if (fidelity) args.resultOut.fidelity = fidelity; args.resultOut.qaGate = { outcome: 'ok' }; }
    return '/media/nueva.jpg';
  };
  const fetchStub = async () => {
    calls.fetch++;
    if (verdict === 'THROW') throw new Error('red caída');
    const content = verdict === 'GARBAGE' ? 'no json acá' : JSON.stringify(verdict);
    return { json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const factory = new Function('db', 'makeHeadline', 'rubroOf', 'MEDIA_DIR', 'fs', 'path', 'costs', 'openaiKeyFor', 'fetch', 'conceptShotGenerateQueued',
    src + '; return { pzRegenParaPost, verificarRehacerAnclado };');
  const lane = factory(
    { prepare: () => ({ get: () => ({ image_path: '/media/orig.jpg' }) }) },
    () => 'Titular', () => '', MEDIA, fs, path,
    { trackUsage: () => {} },
    () => key, fetchStub, conceptShotGenerateQueued,
  );
  return { lane, calls };
}
const PEDIDO = 'Quiero que saques el avatar de Posty de arriba a la izquierda, en la imagen.';
(async () => {
  // 2a. LA FORMA DEL INCIDENTE, bien: pedido sobre la foto → anclada.
  {
    const { lane, calls } = buildLane({ key: 'sk-test', verdict: { producto_sigue: true, misma_escena: true, pedido_cumplido: true, motivo: 'ok' } });
    const rr = await lane.pzRegenParaPost({ uid: 12, postId: 649, capForImg: 'Torta de frutas', tipoForImg: '', pedido: PEDIDO });
    eq(rr.anclada, true, 'incidente: el carril se ancla');
    eq(rr.issue, null, 'incidente: veredicto positivo no frena');
    eq(rr.newPath, '/media/nueva.jpg', 'incidente: verificado → hay imagen nueva');
    eq(calls.gen.length, 1, 'incidente: una sola generación');
    const g = calls.gen[0] || {};
    ok(Array.isArray(g.refs) && g.refs.length === 1 && g.refs[0] === '/media/orig.jpg', 'incidente: la foto actual viaja como referencia');
    ok(Array.isArray(g.refRoles) && g.refRoles[0] === 'restyle' && g.restyle === true, 'incidente: modo restyle (edición, no creación)');
    ok(String(g.extraPrompt || '').includes('saques el avatar de Posty'), 'incidente: el pedido literal viaja en la instrucción');
    eq(calls.fetch, 1, 'incidente: la verificación corre ANTES de devolver');
  }
  // 2b. EL RESULTADO DEL INCIDENTE: sin el producto → NO reemplaza.
  {
    const { lane } = buildLane({ key: 'sk-test', verdict: { producto_sigue: false, misma_escena: false, pedido_cumplido: false, motivo: 'es un personaje solo' } });
    const rr = await lane.pzRegenParaPost({ uid: 12, postId: 649, capForImg: 'Torta de frutas', tipoForImg: '', pedido: PEDIDO });
    eq(rr.newPath, null, 'sin producto: no hay imagen para reemplazar');
    eq(rr.issue, 'regen_no_verificada', 'sin producto: issue honesto regen_no_verificada');
  }
  // 2c. Producto sigue pero el elemento NO se fue → tampoco.
  {
    const { lane } = buildLane({ key: 'sk-test', verdict: { producto_sigue: true, misma_escena: true, pedido_cumplido: false, motivo: 'el avatar sigue' } });
    const rr = await lane.pzRegenParaPost({ uid: 12, postId: 649, capForImg: 'Torta', tipoForImg: '', pedido: PEDIDO });
    eq(rr.newPath, null, 'pedido no cumplido: no reemplaza');
    eq(rr.issue, 'regen_no_verificada', 'pedido no cumplido: issue');
  }
  // 2d. FAIL-CLOSED: sin clave de visión no se reemplaza.
  {
    const { lane, calls } = buildLane({ key: '', verdict: { producto_sigue: true, misma_escena: true, pedido_cumplido: true } });
    const rr = await lane.pzRegenParaPost({ uid: 12, postId: 649, capForImg: 'Torta', tipoForImg: '', pedido: PEDIDO });
    eq(rr.newPath, null, 'sin clave: no reemplaza (fail-closed)');
    eq(rr.issue, 'regen_no_verificada', 'sin clave: issue honesto');
    eq(calls.fetch, 0, 'sin clave: ni se llama a visión');
  }
  // 2e. FAIL-CLOSED: la visión cae (red) → no se reemplaza.
  {
    const { lane } = buildLane({ key: 'sk-test', verdict: 'THROW' });
    const rr = await lane.pzRegenParaPost({ uid: 12, postId: 649, capForImg: 'Torta', tipoForImg: '', pedido: PEDIDO });
    eq(rr.newPath, null, 'visión caída: no reemplaza');
    eq(rr.issue, 'regen_no_verificada', 'visión caída: issue');
  }
  // 2f. Fidelidad fallback (el pipeline devolvió la original) = el
  // cambio NO se aplicó: issue propio, sin gastar la verificación.
  {
    const { lane, calls } = buildLane({ key: 'sk-test', fidelity: 'fallback', verdict: { producto_sigue: true, misma_escena: true, pedido_cumplido: true } });
    const rr = await lane.pzRegenParaPost({ uid: 12, postId: 649, capForImg: 'Torta', tipoForImg: '', pedido: PEDIDO });
    eq(rr.newPath, null, 'fidelity fallback: no hay reemplazo');
    eq(rr.issue, 'regen_sin_cambio', 'fidelity fallback: issue regen_sin_cambio');
    eq(calls.fetch, 0, 'fidelity fallback: no se gasta la verificación');
  }
  // 2g. Pedido de concepto (no sobre la foto): la vía de siempre,
  // refs vacías y SIN verificación (no hay original que preservar).
  {
    const { lane, calls } = buildLane({ key: 'sk-test', verdict: { producto_sigue: true, misma_escena: true, pedido_cumplido: true } });
    const rr = await lane.pzRegenParaPost({ uid: 12, postId: 649, capForImg: 'Café de especialidad', tipoForImg: '', pedido: 'rehacé el posteo entero con otro enfoque' });
    eq(rr.anclada, false, 'concepto: no ancla');
    eq(rr.newPath, '/media/nueva.jpg', 'concepto: genera como siempre');
    const g = calls.gen[0] || {};
    ok(Array.isArray(g.refs) && g.refs.length === 0, 'concepto: refs [] (sin foto que editar)');
    eq(calls.fetch, 0, 'concepto: no verifica contra una foto');
  }

  // ── 3. Recibo: la respuesta no se trunca ─────────────────────────
  console.log('· 3. chatReceiptLines (generator real)');
  {
    const gen = require(path.join(ROOT, 'generator.js'));
    const tituloIncidente = 'Así queda un posteo de pastelería cuando la rompe toda la semana';
    const lines = gen.chatReceiptLines({ edited: [tituloIncidente], imageRegen: 1 });
    const l = lines.find(x => x.startsWith('editado:')) || '';
    ok(l.includes('…'), 'recibo: el título largo cierra con «…» (corte declarado)');
    ok(!l.includes('cuando"'), 'recibo: NO reproduce el corte del incidente («…pastelería cuando")');
    ok(l.includes('pastelería…') || l.includes('pastelería …') || /de pastelería[^"]*…/.test(l), 'recibo: corta en límite de palabra');
    const cortos = gen.chatReceiptLines({ edited: ['Torta de frutas'] });
    ok(cortos.some(x => x === 'editado: "Torta de frutas"'), 'recibo: título corto intacto, sin «…»');
    const honesta = gen.chatReceiptLines({ issues: [{ kind: 'regen_no_verificada', title: 'Torta de frutas' }] });
    ok(honesta.some(x => x.includes('no quedó como pediste') && x.includes('dejé la imagen como estaba')), 'recibo: línea honesta regen_no_verificada');
    const sinCambio = gen.chatReceiptLines({ issues: [{ kind: 'regen_sin_cambio', title: 'Torta de frutas' }] });
    ok(sinCambio.some(x => x.includes('no pude aplicar el cambio') && x.includes('foto original')), 'recibo: línea honesta regen_sin_cambio');
    const festejo = gen.chatReceiptLines({ edited: ['Torta de frutas'], imageRegen: 0, issues: [{ kind: 'regen_no_verificada', title: 'Torta de frutas' }] });
    ok(!festejo.some(x => x.includes('con imagen nueva')), 'recibo: con el rehacer bloqueado NO se anuncia imagen nueva');
  }

  // ── 4. Pines estáticos + control contra la base ──────────────────
  console.log('· 4. Pines de cableado' + (hasBase ? ' + control base' : ' (sin base: control omitido)'));
  {
    const count = (s, sub) => s.split(sub).length - 1;
    ok(serverSrc.includes("refs: [baseImg], refRoles: ['restyle'], restyle: true"), 'pin: la rama anclada pasa la foto como restyle');
    ok(serverSrc.includes('EDICIÓN SOBRE LA FOTO ACTUAL DEL POSTEO'), 'pin: instrucción de edición sobre la foto');
    ok(serverSrc.includes("image_path: String(post.image_path || '')"), 'pin: GET /api/chat/hilo devuelve image_path');
    ok(appSrc.includes('r.edit.imageRegen') && appSrc.includes("api.get('/api/chat/hilo?post_id='"), 'pin: la tira repinta tras el carril del cerebro');
    eq(count(appSrc, 'pzVozVolverPintar(strip, pid)'), count(baseAppSrc || appSrc, 'pzVozVolverPintar(strip, pid)') + (hasBase ? 1 : 0), 'pin: Volver se pinta en AMBOS carriles');
    const idxHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    // RE-PIN del preparador (aterrizaje sobre v1022): el 699 provisorio del scratch lo tomó DETALLE (v1021); el stamp definitivo de este lote es 700.
    ok(idxHtml.includes('app.js?v=700'), 'pin: index ES con app.js?v=700');
    if (hasBase) {
      // El incidente, reproducido a nivel de carril en la base:
      ok(baseServerSrc.includes("conceptShotGenerateQueued({ uid, idea: capForImg, tipo: tipoForImg, headline, refs: [], resultOut: redoGate })"), 'control base: la Palanca 7 generaba con refs: []');
      ok(!serverSrc.includes("conceptShotGenerateQueued({ uid, idea: capForImg, tipo: tipoForImg, headline, refs: [], resultOut: redoGate })"), 'release: esa generación sin ancla ya no existe');
      eq(count(baseServerSrc, "conceptShotGenerateQueued({ uid, idea: capForImg, tipo: post.tipo || '', headline, refs: [], resultOut: gate })"), 2, 'control base: redo copia + en el lugar con refs: []');
      eq(count(serverSrc, "conceptShotGenerateQueued({ uid, idea: capForImg, tipo: post.tipo || '', headline, refs: [], resultOut: gate })"), 0, 'release: ningún redo del chat genera sin ancla');
      eq(count(serverSrc, 'prev_image_path = ?') - count(baseServerSrc, 'prev_image_path = ?'), 5, 'pin: +5 reemplazos guardan prev_image_path (palanca, redo×2, trabajo×2)');
      ok(!baseServerSrc.includes("image_path: String(post.image_path || '')"), 'control base: el hilo no devolvía image_path');
      // El veto de rehacer sin pedido y el carril directo no se tocaron:
      const laneOf = (s) => { const a = s.indexOf('function pzVozLane'); const b = s.indexOf('\nfunction ', a + 10); return s.slice(a, b); };
      eq(laneOf(appSrc), laneOf(baseAppSrc), 'pin: pzVozLane idéntico (detector directo intacto)');
      eq(fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8'), fs.readFileSync(path.join(BASE, 'public', 'en', 'index.html'), 'utf8'), 'pin: index EN intacto');
      eq(fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8'), fs.readFileSync(path.join(BASE, 'public', 'styles.css'), 'utf8'), 'pin: styles.css intacto (sin bump)');
      // Control del recibo en la base: el corte seco del incidente.
      const genBase = require(path.join(BASE, 'generator.js'));
      const lb = (genBase.chatReceiptLines({ edited: ['Así queda un posteo de pastelería cuando la rompe toda la semana'] }) || []).find(x => x.startsWith('editado:')) || '';
      ok(lb.includes('"Así queda un posteo de pastelería cuando"'), 'control base: el recibo cortaba a 40 exactos, a mitad de frase');
    }
  }

  // ── 5. Boot smoke ────────────────────────────────────────────────
  console.log('· 5. Boot smoke');
  {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehacer-data-'));
    const port = 18799;
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' }, stdio: 'ignore' });
    try {
      let version = null, hiloStatus = 0;
      for (let i = 0; i < 40 && !version; i++) {
        try { const r = await fetch(`http://127.0.0.1:${port}/api/version`); if (r.ok) version = await r.json(); } catch (e) {}
        if (!version) await new Promise(r => setTimeout(r, 500));
      }
      ok(!!version, 'boot: /api/version responde');
      try { const r = await fetch(`http://127.0.0.1:${port}/api/chat/hilo?post_id=1`); hiloStatus = r.status; } catch (e) {}
      eq(hiloStatus, 401, 'boot: GET /api/chat/hilo existe y exige sesión (401)');
    } finally {
      try { child.kill('SIGKILL'); } catch (e) {}
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }

  fs.rmSync(MEDIA, { recursive: true, force: true });
  console.log(`\nREHACER-ANCLADO: ${pass} ok · ${fail} fallas`);
  if (bad.length) { console.log('Fallaron:'); bad.forEach(b => console.log(' - ' + b)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR:', e); process.exit(2); });
