// Harness de reel-script.js + kinetic-captions.js (Motion v3, Fase 1).
// Corre: node test-reel-script.js — SIN llamadas de IA pagas (aiCall stub).
const { execFileSync } = require('child_process');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra || ''); }
}

// ---------- fixtures de fundamento (forma real de client-digest) ----------
const DIGEST_PELUQUERIA = {
  v: 1, business: 'Salón Aurora', category: 'peluqueria', subcat: 'peluqueria',
  servicios: [{ nombre: 'Balayage' }, { nombre: 'Corte y brushing' }, { nombre: 'Alisado sin formol' }],
  productos: [{ nombre: 'Máscara nutritiva de karité' }],
  promos: [{ titulo: 'Martes de balayage' }],
  temas_feed: ['Coloración sin amoníaco'], protagonista: '', paleta: [],
  registro: null, ciudad: 'Palermo', diferencial: 'coloristas certificados',
  has_booking: true, fuentes: {},
};
const DIGEST_CAFETERIA = {
  v: 1, business: 'Café Bruma', category: 'gastronomia', subcat: 'cafeteria',
  servicios: [],
  productos: [{ nombre: 'Flat white' }, { nombre: 'Medialunas de manteca' }, { nombre: 'Café en grano de Etiopía' }],
  promos: [], temas_feed: ['Café de especialidad'], protagonista: '', paleta: [],
  registro: null, ciudad: 'Belgrano', diferencial: 'tueste propio semanal',
  has_booking: false, fuentes: {},
};

// ---------- stubs de IA (JSON con la forma del contrato) ----------
const SCRIPT_PELU = { scenes: [
  { role: 'hook', line: '¿Tu balayage perdió el brillo del primer día?', visualHint: 'primer plano de pelo opaco que pasa a brillar, luz cálida' },
  { role: 'problem', line: 'Sin máscara nutritiva, el color se lava y queda opaco', visualHint: 'manos lavando pelo con espuma, tono apagado' },
  { role: 'solution', line: 'Nuestro balayage incluye nutrición profunda con karité siempre', visualHint: 'aplicación de máscara nutritiva en el salón' },
  { role: 'solution', line: 'El brushing final va incluido', visualHint: 'brushing final con secador, pelo en movimiento' },
  { role: 'cta', line: 'Reservá tu turno de balayage por DM', visualHint: 'agenda del salón con turnos marcados' },
]};
const SCRIPT_CAFE = { scenes: [
  { role: 'hook', line: 'El flat white que Belgrano ya hizo su ritual', visualHint: 'flat white con latte art recién servido, vapor' },
  { role: 'problem', line: 'La mayoría de los cafés de especialidad llegan quemados o pasados de tueste oscuro y amargo siempre', visualHint: 'granos de café quemados, expresión de rechazo' },
  { role: 'solution', line: 'Nuestro café en grano de Etiopía se tuesta cada semana en partidas chicas, sin apuro', visualHint: 'tostadora de café en acción, granos cayendo' },
  { role: 'solution', line: 'El flat white sale con leche texturizada a la temperatura justa, cremoso', visualHint: 'leche vaporizada vertida en la taza' },
  { role: 'solution', line: 'Y las medialunas de manteca se hornean cada mañana acá', visualHint: 'bandeja de medialunas doradas saliendo del horno' },
  { role: 'cta', line: 'Pedí tu flat white hoy mismo por DM', visualHint: 'mesa de cafetería con flat white y medialunas' },
]};
const SCRIPT_GENERICO = { scenes: [
  { role: 'hook', line: '¡Tenemos la mejor calidad y el mejor precio para vos!', visualHint: 'local genérico' },
  { role: 'problem', line: 'Sabemos que buscás siempre lo mejor para tu familia entera', visualHint: 'familia sonriendo' },
  { role: 'solution', line: 'Nosotros te ofrecemos atención personalizada y mucha experiencia real', visualHint: 'equipo trabajando' },
  { role: 'cta', line: 'Escribinos por DM y te respondemos hoy', visualHint: 'teléfono con mensajes' },
]};

async function main() {
  console.log('== test-reel-script.js ==');

  // 1. Sintaxis de los tres archivos nuevos
  for (const f of ['reel-script.js', 'kinetic-captions.js', 'test-reel-script.js']) {
    try { execFileSync('node', ['--check', path.join(__dirname, f)], { stdio: 'ignore' }); ok(true, `node --check ${f}`); }
    catch (e) { ok(false, `node --check ${f}`, e.message); }
  }

  const rs = require('./reel-script');
  const kc = require('./kinetic-captions');
  const cd = require('./client-digest');

  // 2. Presupuesto de palabras (craft del estudio)
  const b15 = rs.wordBudget(15);
  ok(b15.min >= 30 && b15.max <= 40, 'presupuesto 15s dentro de 30–40 palabras', JSON.stringify(b15));
  const b30 = rs.wordBudget(30);
  ok(b30.min >= 60 && b30.max <= 75, 'presupuesto 30s dentro de 60–75 palabras', JSON.stringify(b30));
  ok(b15.sections.hook >= 8 && b15.sections.hook <= 14, 'sección gancho 8–14 palabras');

  // 3. Ventanas canónicas: gancho abre en 0 y ≤3s; CTA cierra el total
  const w = rs.sectionWindows(30);
  ok(w.hook[0] === 0 && w.hook[1] <= 3, 'ventana gancho 0–3s', JSON.stringify(w.hook));
  ok(w.cta[1] === 30 && w.cta[0] < 30, 'ventana CTA cierra en el total', JSON.stringify(w.cta));

  // 4. Validación pura: guiones buenos pasan, con anclas reales
  const vPelu = rs.validateScript(SCRIPT_PELU.scenes, DIGEST_PELUQUERIA, { durationSec: 15, intent: 'reserva' });
  ok(vPelu.ok, 'guion peluquería (15s, reserva) válido', vPelu.errors.join(','));
  const vCafe = rs.validateScript(SCRIPT_CAFE.scenes, DIGEST_CAFETERIA, { durationSec: 30, intent: 'venta' });
  ok(vCafe.ok, 'guion cafetería (30s, venta) válido', vCafe.errors.join(','));

  // 5. Validación pura: lo genérico NO pasa el test de pertenencia
  const vGen = rs.validateScript(SCRIPT_GENERICO.scenes, DIGEST_PELUQUERIA, { durationSec: 15, intent: 'consulta' });
  ok(!vGen.ok && vGen.errors.some(e => e.startsWith('sin_ancla')), 'guion genérico rechazado por pertenencia', vGen.errors.join(','));

  // 6. Validación pura: CTA fijo prohibido + fuera de presupuesto
  const conProhibido = SCRIPT_PELU.scenes.map(s => s.role === 'cta' ? { ...s, line: '¡Seguinos!' } : s);
  const vProh = rs.validateScript(conProhibido, DIGEST_PELUQUERIA, { durationSec: 15, intent: 'reserva' });
  ok(!vProh.ok && vProh.errors.includes('cta_prohibido'), "CTA '¡Seguinos!' rechazado", vProh.errors.join(','));
  const inflado = SCRIPT_PELU.scenes.map(s => s.role === 'solution'
    ? { ...s, line: s.line + ' con mucho amor dedicación paciencia oficio detalle pasión esmero constancia siempre siempre siempre' } : s);
  const vInf = rs.validateScript(inflado, DIGEST_PELUQUERIA, { durationSec: 15, intent: 'reserva' });
  ok(!vInf.ok && vInf.errors.some(e => e.startsWith('sobre_presupuesto')), 'guion inflado rechazado por presupuesto', vInf.errors.join(','));

  // 7. buildReelScript con IA stub: sale guion de IA, con tiempos que suman el total
  const stubPelu = async () => JSON.parse(JSON.stringify(SCRIPT_PELU));
  const rPelu = await rs.buildReelScript({
    digest: DIGEST_PELUQUERIA, durationSec: 15,
    post: { caption: 'Balayage ✨\n#pelu', source_topic: 'Balayage', salesIntent: 'reserva' },
    aiCall: stubPelu,
  });
  ok(rPelu.source === 'ai' && !rPelu.degraded, 'buildReelScript peluquería: source ai');
  ok(rPelu.hook === SCRIPT_PELU.scenes[0].line && rPelu.cta === SCRIPT_PELU.scenes[4].line, 'hook/cta agregados desde escenas');
  const sumaSeg = rPelu.scenes.reduce((a, s) => a + s.seconds, 0);
  ok(Math.abs(sumaSeg - 15) < 0.1, 'segundos de escenas suman la duración', String(sumaSeg));
  ok(rPelu.scenes[0].start === 0 && Math.abs(rPelu.scenes[rPelu.scenes.length - 1].end - 15) < 0.05, 'escenas cubren [0, duración]');
  ok(rPelu.scenes.every(s => s.anchor || s.role === 'cta'), 'todas las escenas no-CTA llevan su ancla registrada');

  const stubCafe = async () => JSON.parse(JSON.stringify(SCRIPT_CAFE));
  const rCafe = await rs.buildReelScript({
    digest: DIGEST_CAFETERIA, durationSec: 30,
    post: { caption: 'Flat white ☕', source_topic: 'Flat white', salesIntent: 'venta' },
    aiCall: stubCafe,
  });
  ok(rCafe.source === 'ai' && rCafe.totalWords >= 60 && rCafe.totalWords <= 75, 'buildReelScript cafetería: 30s dentro de presupuesto', String(rCafe.totalWords));

  // 8. IA que insiste con lo genérico → reintentos agotados → fallback DECLARADO
  let llamadas = 0;
  const stubGenerico = async () => { llamadas++; return JSON.parse(JSON.stringify(SCRIPT_GENERICO)); };
  const rGen = await rs.buildReelScript({
    digest: DIGEST_PELUQUERIA, durationSec: 15,
    post: { caption: 'Balayage con nutrición profunda ✨\nReservá tu turno por DM\n#balayage', source_topic: 'Balayage', salesIntent: 'consulta' },
    aiCall: stubGenerico,
  });
  ok(llamadas === 3, 'IA genérica: 1 intento + 2 reintentos con feedback', String(llamadas));
  ok(rGen.source === 'caption' && rGen.degraded === true, 'fallback a caption declarado (degraded)');
  ok(rGen.cta !== '¡Seguinos!', 'el fallback tampoco usa el CTA fijo prohibido', rGen.cta);
  ok(rGen.hook.startsWith('Balayage con nutrición'), 'fallback: gancho = primera línea del caption', rGen.hook);

  // 9. Sin digest → fallback directo, sin excepción
  const rSin = await rs.buildReelScript({
    digest: cd.emptyDigest(), durationSec: 15,
    post: { caption: 'Promo de la semana\nEscribinos por DM', salesIntent: 'venta' },
    aiCall: stubPelu,
  });
  ok(rSin.degraded && rSin.degradeReason === 'sin_fundamento', 'digest vacío → degradado sin_fundamento', rSin.degradeReason);

  // 10. Sin API key y sin stub → degradado sin_api_key (no toca la red)
  const rKey = await rs.buildReelScript({
    digest: DIGEST_PELUQUERIA, durationSec: 15,
    post: { caption: 'Balayage ✨', source_topic: 'Balayage', salesIntent: 'reserva' },
  });
  ok(rKey.degraded && rKey.degradeReason === 'sin_api_key', 'sin apiKey → degradado sin_api_key', rKey.degradeReason);

  // 11. CTA determinístico por intención
  ok(rs.buildCtaForIntent('reserva', DIGEST_PELUQUERIA).includes('Balayage'), 'CTA reserva nombra el servicio real');
  ok(rs.buildCtaForIntent('venta', DIGEST_CAFETERIA).includes('Flat white'), 'CTA venta nombra el producto real');

  // 12. Subtítulos cinéticos: tamaños de chunk
  for (const n of [5, 7, 8, 10, 13, 17, 21]) {
    const sizes = kc.chunkSizes(n);
    ok(sizes.reduce((a, b) => a + b, 0) === n && sizes.every(s => s >= 2 && s <= 4), `chunkSizes(${n}) suma y queda en 2–4`, sizes.join(','));
  }
  ok(JSON.stringify(kc.chunkSizes(5)) === '[3,2]', 'chunkSizes(5) = [3,2]');

  // 13. Plan cinético sobre el guion de peluquería
  const plan = kc.planKineticCaptions(rPelu);
  ok(plan.timingMode === 'proportional', 'plan declara timingMode proportional');
  const vPlan = kc.validateCaptionPlan(plan);
  ok(vPlan.ok, 'plan cinético válido', vPlan.errors.join(','));
  ok(plan.chunks[0].start === 0 && plan.chunks[0].band === 'top', 'primer chunk: t=0, banda superior (gancho)');
  ok(plan.chunks.filter(c => c.role === 'problem').every(c => c.band === 'bottom'), 'chunks de problema en banda inferior');
  ok(Math.abs(plan.chunks[plan.chunks.length - 1].end - 15) < 0.05, 'último chunk cierra en la duración total');
  ok(plan.chunks.every(c => c.words >= 1 && c.words <= 4), 'todos los chunks de 1–4 palabras (máx. 4)');
  const textoPlan = plan.chunks.map(c => c.text).join(' ');
  const textoGuion = rPelu.scenes.map(s => s.line).join(' ');
  ok(textoPlan === textoGuion, 'los chunks reproducen el guion completo, sin perder palabras');

  console.log(`\n${pass} PASS · ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('ERROR', e); process.exit(1); });
