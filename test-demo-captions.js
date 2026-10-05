// test-demo-captions.js — Harness de calidad para los captions de /prueba.
// Genera semanas para 5 rubros x 2 tonos, gatea cada caption con captionPasses
// y lo puntúa con rúbrica 0-2: específico, 1 idea, CTA, tono humano, no-genérico.
// Objetivo: promedio ≥ 1.5 en todo y CERO captions que el gate rechace.
// Uso: node test-demo-captions.js

const {
  DEMO_TOPICS, TU_MAP, toTu, TU_HEADLINES,
  demoHashtags, topicDna, buildFinalCaption,
  resolveTrialCaption, SAFE_FALLBACK_CAPTIONS,
} = require('./demo-captions');
const { captionPasses, BANNED_PHRASES } = require('./generator');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const CTA_RES = ['comenta', 'guarda', 'escribinos', 'pasa por', 'link', 'turno', 'pedilo', 'reserva', /\bdm\b/];
const hasCta = (t) => { const n = norm(t); return CTA_RES.some((r) => typeof r === 'string' ? n.includes(r) : r.test(n)); };
const AI_TELLS = ['te presentamos', 'les presentamos', 'atencion, que', 'mira lo que tenemos para vos',
  'descubri el poder de', 'desbloquea tu', 'no te lo pierdas', 'no te lo podes perder',
  'sumergite', 'en el mundo actual', 'en el mundo de hoy', 'al siguiente nivel',
  'de otro nivel', 'no hay otra igual', 'no existe otra igual', 'todo en un solo lugar', 'revoluciona'];
const FILLER = ['novedades', 'lo mejor', 'la mejor calidad', 'excelencia', 'atencion personalizada',
  'todo lo que necesitas', 'productos de calidad', 'servicios de calidad', 'gran variedad',
  'los mejores productos', 'ultima tecnologia'];
// Voseo inequívoco en texto CRUDO (sin normalizar): formas que en tuteo llevan
// otra grafía (traé→trae, llevate→llévate, reservá→reserva…). 'Llegó',
// 'evaluación' o 'sábado' NO están: son iguales en voseo y tuteo.
const VOSEO_TOKENS = ['reservá', 'reservalo', 'reservala', 'pasá', 'vení', 'probá', 'elegí',
  'pedí', 'pedilo', 'pedilos', 'pedila', 'pedilas', 'mirá', 'fijate', 'guardá', 'guardala',
  'comentá', 'anotate', 'sumate', 'traé', 'llevate', 'quedate', 'empezá', 'armá', 'coordiná',
  'contanos', 'consultanos', 'etiquetá', 'pagás', 'tenés', 'querés', 'podés', 'sabés',
  'dudás', 'preguntá', 'cortá', 'lavalo', 'cambiá', 'sumá', 'renová', 'enrollá', 'confirmá',
  'sacatela', 'conocé', 'probate', 'salí', 'festejá', 'estrená', 'viajá', 'escribinos',
  'venís', 'decís', 'hacés', 'salís', 'notás', 'entrenás'];
const VOSEO_RE = new RegExp('\\b(' + VOSEO_TOKENS.join('|') + ')\\b');

function scoreCaption(text, topic) {
  const n = norm(text);
  const s = {};
  // específico: nombra algo concreto (palabra del titular, número, 2x1…)
  const hlWords = norm(topic.headline).split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
  const echo = hlWords.some((w) => n.includes(w));
  s.especifico = (/\d/.test(text) || echo) ? 2 : (text.length > 80 ? 1 : 0);
  // 1 idea: pocas oraciones, CTA único
  const sentences = text.split(/[.!?…]+/).map((x) => x.trim()).filter(Boolean).length;
  const ctaCount = CTA_RES.filter((r) => typeof r === 'string' ? n.includes(r) : r.test(n)).length;
  s.una_idea = (sentences <= 4 && ctaCount <= 2) ? 2 : (sentences <= 6 ? 1 : 0);
  // CTA concreto
  s.cta = hasCta(text) ? 2 : 0;
  // tono humano: sin tells de IA, sin griterío de emojis
  const emojis = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  let th = 2;
  if (AI_TELLS.some((t) => n.includes(t))) th -= 2;
  if (emojis > 3) th -= 1;
  if (/^(hola|buenas)[,!.\s]/i.test(text.trim())) th -= 1;
  s.tono_humano = Math.max(0, th);
  // no-genérico: sin relleno de folleto
  const fills = FILLER.filter((f) => n.includes(f)).length;
  s.no_generico = fills === 0 ? 2 : (fills === 1 ? 1 : 0);
  s.avg = (s.especifico + s.una_idea + s.cta + s.tono_humano + s.no_generico) / 5;
  return s;
}

const WEEKS = [
  { cat: 'cafeteria', business: 'Café Cultura', country: 'AR', tone: 'vos' },
  { cat: 'barberia', business: 'Peluquería Unisex Diva', country: 'AR', tone: 'vos' },
  { cat: 'moda', business: 'MORADA', country: 'AR', tone: 'vos' },
  { cat: 'mascotas', business: 'Veterinaria Patitas', country: 'UY', tone: 'tu' },
  { cat: 'fitness', business: 'Gym Esparta', country: 'UY', tone: 'tu' },
];

let total = 0, sum = 0, fails = [], voseoFails = [], gateFails = [];
const perRubro = {};
const accentedTu = new Set();

for (const w of WEEKS) {
  const topics = DEMO_TOPICS[w.cat];
  perRubro[w.cat] = { n: 0, sum: 0 };
  for (let i = 0; i < topics.length; i++) {
    const r = resolveTrialCaption(topics, w.cat, {
      business: w.business, tone: w.tone, country: w.country,
      idx: i, goalLine: i === 0 ? '\nTal como pediste: vender más esta semana' : '',
    });
    if (r.fallback) fails.push(`${w.cat}[${i}]: usó SAFE_FALLBACK (ningún tema pasó el gate)`);
    const full = r.caption + '\n' + r.hashtags;
    const check = captionPasses(full, { business: w.business, dna: topicDna(topics[r.topicIndex]) });
    if (!check.ok) gateFails.push(`${w.cat}[${i}] "${topics[r.topicIndex].headline}": ${check.reason}`);
    const sc = scoreCaption(r.caption, topics[r.topicIndex]);
    total++; sum += sc.avg;
    perRubro[w.cat].n++; perRubro[w.cat].sum += sc.avg;
    // tuteo: sin fragmentos voseantes sin convertir (texto crudo)
    if (w.tone === 'tu') {
      for (const [vos] of TU_MAP) {
        if (r.caption.includes(vos)) voseoFails.push(`${w.cat}[${i}]: quedó sin convertir "${vos}"`);
      }
      const m = r.caption.match(VOSEO_RE);
      if (m) voseoFails.push(`${w.cat}[${i}]: voseo en tuteo: "${m[0]}" :: ${r.caption.slice(0, 80)}…`);
      const hl = TU_HEADLINES[topics[r.topicIndex].headline] || topics[r.topicIndex].headline;
      const hm = hl.match(VOSEO_RE);
      if (hm) voseoFails.push(`${w.cat}[${i}]: voseo en titular tuteo: "${hm[0]}" (${hl})`);
      // auditoría amplia: juntar palabras acentuadas del tuteo para revisión manual
      for (const mm of r.caption.matchAll(/\b[\p{L}]*[áéíóúü][\p{L}]*\b/gu)) accentedTu.add(mm[0].toLowerCase());
      for (const mm of hl.matchAll(/\b[\p{L}]*[áéíóúü][\p{L}]*\b/gu)) accentedTu.add(mm[0].toLowerCase());
    }
    if (sc.avg < 1.2) {
      fails.push(`${w.cat}[${i}] score ${sc.avg.toFixed(2)}: ${r.caption.slice(0, 90)}…`);
    }
  }
}

// Retry: un tema envenenado primero debe caer al segundo tema.
{
  const topics = DEMO_TOPICS.moda.slice();
  const poisoned = { ...topics[0], caption: 'Atención, que esto es posta 👇\n\nMirá lo que tenemos para vos ✨\n\nEscribinos por DM 📩' };
  const r = resolveTrialCaption([poisoned, ...topics.slice(1)], 'moda', {
    business: 'MORADA', tone: 'vos', country: 'AR', idx: 0, goalLine: '',
  });
  if (r.topicIndex !== 1) fails.push(`retry: esperaba topicIndex 1, dio ${r.topicIndex}`);
  else console.log('✓ retry: el tema envenenado se descartó y se usó el siguiente');
}

// Safe fallbacks: todos tienen que pasar el gate.
for (const [kind, cap] of Object.entries(SAFE_FALLBACK_CAPTIONS)) {
  const c = buildFinalCaption({ caption: cap }, { business: 'Test', tone: 'vos', goalLine: '' });
  const h = demoHashtags('moda', 'AR', 'vos');
  const check = captionPasses(c + '\n' + h, { business: 'Test', dna: topicDna({ tag: kind, headline: kind, subline: kind }) });
  if (!check.ok) gateFails.push(`SAFE_FALLBACK ${kind}: ${check.reason}`);
  const cTu = buildFinalCaption({ caption: cap }, { business: 'Test', tone: 'tu', goalLine: '' });
  for (const [vos] of TU_MAP) {
    if (cTu.includes(vos)) voseoFails.push(`SAFE_FALLBACK ${kind}: quedó sin convertir "${vos}"`);
  }
}
console.log('✓ safe fallbacks verificados');

// Hashtags: siempre ≤ 5
for (let i = 0; i < 20; i++) {
  const h = demoHashtags('moda', 'AR', 'vos').split(' ');
  if (h.length > 5) fails.push(`hashtags: ${h.length} > 5`);
}

console.log('\n=== HARNESS demo-captions ===');
console.log(`Captions evaluados: ${total}`);
for (const [cat, p] of Object.entries(perRubro)) {
  console.log(`  ${cat}: promedio ${(p.sum / p.n).toFixed(2)} (${p.n} captions)`);
}
const avg = sum / total;
console.log(`Promedio general: ${avg.toFixed(2)} (objetivo ≥ 1.50)`);
console.log(`Rechazos del gate: ${gateFails.length}`);
console.log(`Voseo sin convertir (tu): ${voseoFails.length}`);
console.log(`Palabras acentuadas en tuteo (revisión manual): ${[...accentedTu].sort().join(', ')}`);
if (gateFails.length) { console.log('\n-- GATE FAILS --'); gateFails.forEach((f) => console.log('  ' + f)); }
if (voseoFails.length) { console.log('\n-- VOSEO FAILS --'); voseoFails.slice(0, 20).forEach((f) => console.log('  ' + f)); }
if (fails.length) { console.log('\n-- SCORE/OTROS --'); fails.slice(0, 20).forEach((f) => console.log('  ' + f)); }
const ok = avg >= 1.5 && gateFails.length === 0 && voseoFails.length === 0 && !fails.some((f) => f.startsWith('retry'));
console.log(ok ? '\n✅ HARNESS OK' : '\n❌ HARNESS FALLÓ');
process.exit(ok ? 0 : 1);
