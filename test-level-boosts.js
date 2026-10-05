// test-level-boosts.js — Harness de "Niveles que se sienten".
//
// Mismo negocio ficticio en niveles 1..5 → muestra concretamente qué cambia en
// el payload/prompt en cada nivel (diff de bloques inyectados) y verifica:
//   - N1: payload byte-idéntico al baseline (sin cambios)
//   - N2: usa foto real del cliente como referencia (photoRefs)
//   - N3: incluye bloque NUNCA: dentro del bloque obligatorio de gusto
//   - N4: incluye ambos Style Locks + verificación (visual en imagen, caption en texto)
//   - N5: hereda todo lo de N4
//
// Uso: node test-level-boosts.js
// No toca data/ ni llama a OpenAI: solo construye payloads. DB scratch en /tmp.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const { applyLevelBoosts } = require('./level-boosts');
const { postyLevel } = require('./posty-level');
const { visualStyleBlock } = require('./style-visual');
const { captionStyleBlock, CAPTION_CHECKLIST } = require('./caption-style');

const SCRATCH = '/tmp/levelboost-test';
const DB_PATH = path.join(SCRATCH, 'levelboost.db');

function buildDb() {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(path.join(SCRATCH, 'media'), { recursive: true });
  // Fotos "reales" del cliente (archivos vacíos, solo para que existan en disco).
  for (const f of ['foto-local-1.jpg', 'foto-producto-2.jpg', 'foto-equipo-3.jpg']) {
    fs.writeFileSync(path.join(SCRATCH, 'media', f), Buffer.from('fake'));
  }
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, posty_level INTEGER DEFAULT 0);
    CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', category TEXT DEFAULT 'otro', tone TEXT DEFAULT 'canchero', description TEXT DEFAULT '');
    CREATE TABLE settings (user_id INTEGER PRIMARY KEY, brand_colors TEXT DEFAULT '', ig_user_id TEXT DEFAULT '', ig_access_token TEXT DEFAULT '', timezone TEXT DEFAULT '');
    CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, file_path TEXT, kind TEXT DEFAULT 'photo', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE style_rules (user_id INTEGER, rule_key TEXT, rule_text TEXT, hits INTEGER DEFAULT 1, active INTEGER DEFAULT 0, PRIMARY KEY (user_id, rule_key));
    CREATE TABLE post_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, client_signal TEXT DEFAULT '');
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, caption TEXT DEFAULT '', status TEXT DEFAULT 'draft');
    CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '{}');
    CREATE TABLE ig_visual_style (user_id INTEGER PRIMARY KEY, profile_json TEXT DEFAULT '', analyzed_at TEXT DEFAULT '');
    CREATE TABLE ig_caption_style (user_id INTEGER PRIMARY KEY, profile_json TEXT DEFAULT '', analyzed_at TEXT DEFAULT '');
  `);
  const uid = 1;
  db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(uid, 'ficticio@test.com');
  db.prepare('INSERT INTO profiles (user_id, business_name, category, description) VALUES (?,?,?,?)')
    .run(uid, 'Café Ficticio', 'cafetería', 'Café de especialidad en Palermo, tueste propio y pastelería artesanal.');
  db.prepare(`INSERT INTO settings (user_id, brand_colors, ig_user_id, ig_access_token, timezone) VALUES (?,?,?,?,?)`)
    .run(uid, '#8B5E34,#F5EFE6', 'ig123', 'tok123', 'America/Argentina/Buenos_Aires');
  db.prepare(`INSERT INTO assets (user_id, file_path, kind) VALUES (?,?,?)`).run(uid, '/media/logo-cafe.png', 'logo');
  for (const f of ['foto-local-1.jpg', 'foto-producto-2.jpg', 'foto-equipo-3.jpg']) {
    db.prepare(`INSERT INTO assets (user_id, file_path, kind) VALUES (?,?,?)`).run(uid, '/media/' + f, 'photo');
  }
  db.prepare(`INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (?,?,?,?,?)`)
    .run(uid, 'sin_emojis', 'El cliente prefiere captions sin emojis (o máximo 1)', 3, 1);
  db.prepare(`INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (?,?,?,?,?)`)
    .run(uid, 'con_precios', 'Al cliente le sirve que el caption mencione precio/cuotas', 2, 1);
  const visualProfile = {
    recurring_subject: 'taza de café con arte latte', subject_always_present: false,
    text_overlay: 'titular grande siempre', palette: ['#8B5E34', '#F5EFE6'],
    composition: 'producto centrado, fondo cálido de madera', mood: 'cálido y cercano',
    notes: 'estética artesanal', ref_paths: [],
  };
  db.prepare(`INSERT INTO ig_visual_style (user_id, profile_json, analyzed_at) VALUES (?,?,?)`)
    .run(uid, JSON.stringify(visualProfile), new Date().toISOString());
  const captionProfile = {
    tone: 'informal rioplatense y canchero', emoji_style: 'escaso', avg_length: 40,
    cta_style: 'invita a pasar por el local', hashtag_style: '3-5 de nicho al final',
    opening_style: 'afirmación corta', persona: '1ra persona',
  };
  db.prepare(`INSERT INTO ig_caption_style (user_id, profile_json, analyzed_at) VALUES (?,?,?)`)
    .run(uid, JSON.stringify(captionProfile), new Date().toISOString());
  for (let i = 0; i < 3; i++) {
    db.prepare(`INSERT INTO posts (user_id, caption, status) VALUES (?,?,?)`).run(uid, 'Posteo ' + (i + 1), 'published');
  }
  db.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (?,?)`)
    .run(uid, JSON.stringify({ website_analyzed_at: '2026-09-01', comments_analyzed_at: '2026-09-02' }));
  return { db, uid, visualProfile, captionProfile };
}

// Payloads base tal como los arma el pipeline (sin boosts).
function basePayloads(visualProfile, captionProfile) {
  const styleRules = [
    'El cliente prefiere captions sin emojis (o máximo 1)',
    'Al cliente le sirve que el caption mencione precio/cuotas',
  ];
  const visualStyle = visualStyleBlock(visualProfile);
  const captionStyle = captionStyleBlock(captionProfile);
  const captionExtras = CAPTION_CHECKLIST + '\n\n' + captionStyle;
  return {
    image: {
      headline: 'Tueste nuevo de la semana', tipo: 'novedad', angle: 'mostrar el tueste propio',
      theme: 'llegó el blend de otoño', businessName: 'Café Ficticio', category: 'cafetería',
      paletteHex: ['#8B5E34', '#F5EFE6'], dnaBits: 'Producto: blend de otoño', learningsLine: '',
      styleRules, visualStyle,
    },
    caption: {
      business: 'Café Ficticio', category: 'cafetería', topic: 'blend de otoño',
      styleRules, captionExtras,
    },
    chat: {
      messages: [{ role: 'user', text: 'haceme un posteo del blend nuevo' }],
      profile: { business_name: 'Café Ficticio', category: 'cafetería' },
      photos: ['data:image/jpeg;base64,AAA'], library: ['data:image/jpeg;base64,BBB'],
      styleRules, captionExtras,
    },
    ideas: { business: 'Café Ficticio', category: 'cafetería', styleRules },
  };
}

function summarize(kind, boosted) {
  // Qué bloques de boost trae el payload (para el diff por nivel).
  const p = boosted;
  const blocks = [];
  if (p.photoRefs) blocks.push(`photoRefs[${p.photoRefs.length}]=${p.photoRefs.join(',')}`);
  if (p.tasteBlock) {
    const nunca = (p.tasteBlock.match(/^NUNCA:$/m) ? 'NUNCA:✓' : 'NUNCA:✗');
    blocks.push(`tasteBlock[obligatorio,${nunca}]`);
  }
  if (p.styleLockVerify) blocks.push(`styleLockVerify[${p.styleLockVerify.slice(0, 60)}…]`);
  if (p.photoPriorityLine) blocks.push('photoPriorityLine✓');
  if (p.styleLockActive) blocks.push('styleLockActive✓');
  if (p.styleLockExtras) blocks.push('styleLockExtras✓');
  return blocks;
}

function main() {
  const { db, uid, visualProfile, captionProfile } = buildDb();
  const realLevel = postyLevel(db, uid).level;
  console.log(`Negocio ficticio: Café Ficticio (uid=${uid}) → postyLevel real = ${realLevel}`);
  if (realLevel !== 5) { console.log('⚠️ el fixture no llega a N5, revisar'); process.exitCode = 1; }

  const bases = basePayloads(visualProfile, captionProfile);
  const kinds = ['image', 'caption', 'chat', 'ideas'];
  const results = {}; // level -> kind -> blocks
  const checks = [];
  const ok = (name, cond) => { checks.push({ name, pass: !!cond }); };

  for (let L = 1; L <= 5; L++) {
    results[L] = {};
    for (const kind of kinds) {
      const base = JSON.parse(JSON.stringify(bases[kind])); // clon fresco por corrida
      const { payload, applied } = applyLevelBoosts(db, uid, L, kind, base);
      results[L][kind] = { blocks: summarize(kind, payload), applied: applied.map((a) => a.boost) };
      // N1: byte-idéntico al baseline.
      if (L === 1) ok(`N1 ${kind}: payload idéntico al baseline`, JSON.stringify(payload) === JSON.stringify(base));
    }
  }

  // ---- Diff por nivel ----
  console.log('\n=== DIFF DE BLOQUES INYECTADOS POR NIVEL ===');
  let prev = null;
  for (let L = 1; L <= 5; L++) {
    console.log(`\n— Nivel ${L} —`);
    for (const kind of kinds) {
      const cur = results[L][kind].blocks;
      const added = prev ? cur.filter((b) => !results[prev][kind].blocks.includes(b)) : cur;
      const tag = L === 1 ? '(baseline)' : (added.length ? `(+${added.length} nuevo/s)` : '(sin cambios vs N' + prev + ')');
      console.log(`  [${kind}] ${tag}`);
      for (const b of cur) {
        const mark = added.includes(b) ? '  + ' : '    ';
        console.log(`  ${mark}${b.length > 110 ? b.slice(0, 110) + '…' : b}`);
      }
      if (!cur.length) console.log('    (ningún bloque de boost)');
    }
    prev = L;
  }

  // ---- Verificaciones pedidas ----
  const img2 = applyLevelBoosts(db, uid, 2, 'image', JSON.parse(JSON.stringify(bases.image))).payload;
  ok('N2 imagen: photoRefs con 2 fotos reales del cliente',
    Array.isArray(img2.photoRefs) && img2.photoRefs.length === 2 &&
    img2.photoRefs.every((p) => p.startsWith('/media/foto-')));
  const chat2 = applyLevelBoosts(db, uid, 2, 'chat', JSON.parse(JSON.stringify(bases.chat))).payload;
  ok('N2 chat: línea de prioridad a fotos reales', !!chat2.photoPriorityLine);

  for (const kind of kinds) {
    const p3 = applyLevelBoosts(db, uid, 3, kind, JSON.parse(JSON.stringify(bases[kind]))).payload;
    ok(`N3 ${kind}: tasteBlock obligatorio con NUNCA:`,
      !!p3.tasteBlock && /^NUNCA:$/m.test(p3.tasteBlock) && /BLOQUE OBLIGATORIO/.test(p3.tasteBlock) &&
      p3.tasteBlock.includes('El cliente prefiere captions sin emojis'));
  }

  const img4 = applyLevelBoosts(db, uid, 4, 'image', JSON.parse(JSON.stringify(bases.image))).payload;
  ok('N4 imagen: Style Lock visual verificado (verify + activo)',
    !!img4.styleLockVerify && /STYLE LOCK CHECK/.test(img4.styleLockVerify) && img4.styleLockActive === true);
  const cap4 = applyLevelBoosts(db, uid, 4, 'caption', JSON.parse(JSON.stringify(bases.caption))).payload;
  ok('N4 caption: Caption Style Lock verificado (bloque ESCRIBÍ COMO EL CLIENTE + verificación)',
    !!cap4.styleLockVerify && /ESCRIBÍ COMO EL CLIENTE/.test(cap4.styleLockVerify) &&
    cap4.captionExtras.includes('ESCRIBÍ COMO EL CLIENTE'));
  const chat4 = applyLevelBoosts(db, uid, 4, 'chat', JSON.parse(JSON.stringify(bases.chat))).payload;
  ok('N4 chat: Caption Style Lock verificado', !!chat4.styleLockVerify);
  const ideas4 = applyLevelBoosts(db, uid, 4, 'ideas', JSON.parse(JSON.stringify(bases.ideas))).payload;
  ok('N4 ideas: Caption Style Lock via styleLockExtras', !!ideas4.styleLockExtras && /ESCRIBÍ COMO EL CLIENTE/.test(ideas4.styleLockExtras));

  const img5 = applyLevelBoosts(db, uid, 5, 'image', JSON.parse(JSON.stringify(bases.image)));
  const cap5 = applyLevelBoosts(db, uid, 5, 'caption', JSON.parse(JSON.stringify(bases.caption)));
  ok('N5: hereda todos los boosts de N4',
    !!img5.payload.photoRefs && !!img5.payload.tasteBlock && !!img5.payload.styleLockVerify &&
    !!cap5.payload.tasteBlock && !!cap5.payload.styleLockVerify);

  // ---- Score ----
  const passed = checks.filter((c) => c.pass).length;
  console.log('\n=== VERIFICACIONES ===');
  for (const c of checks) console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
  const perLevel = [1, 2, 3, 4, 5].map((L) => {
    const rel = checks.filter((c) => c.name === `N${L}` || c.name.startsWith(`N${L} `) || c.name.startsWith(`N${L}:`));
    return { L, pass: rel.length > 0 && rel.every((c) => c.pass) };
  });
  const score = perLevel.filter((x) => x.pass).length;
  console.log(`\nSCORE: ${score}/5 niveles con efecto verificable ` +
    perLevel.map((x) => `N${x.L}${x.pass ? '✓' : '✗'}`).join(' '));
  console.log(`Checks: ${passed}/${checks.length}`);
  if (score < 5) process.exitCode = 1;
}

main();
