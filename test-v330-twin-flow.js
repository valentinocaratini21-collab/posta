'use strict';
/* test-v330-twin-flow.js — MISIÓN 2 v330, prueba de misión: semana de
 * prueba + generación de gemelas. El modelo (stub que se comporta como
 * el real: pega captions de ~390-520 caracteres) alimenta
 * generateContent; cada posteo resultante se gemela con createTwinStory.
 * Contrato: ≥80% de las historias se producen y ningún posteo quema
 * más de 5 candidatos (llamadas al modelo) para nacer — en la corrida
 * real de hoy fueron ~40 por historia y 5 historias no se produjeron.
 * Corre con: node test-v330-twin-flow.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let calls = 0;
const GIANT = {
  caption:
    'Salieron las medialunas de manteca bien calentitas, doradas por fuera y suaves por dentro, hechas con la receta de siempre de la panadería del barrio, esa que pasa de generación en generación y que todos los vecinos conocen desde chicos y vienen a buscar cada mañana temprano antes de ir a trabajar\n\n' +
    'Hay facturas surtidas también. Y pan casero del día.\n\n' +
    'Pasá por el local o escribinos por DM 📩',
  overlay: 'Medialunas calentitas', hashtags: '#panaderia #medialunas',
};
const LONG_OK = {
  caption:
    'Salieron las medialunas de manteca, calentitas 🥐\n\n' +
    'Hacemos las medialunas como siempre, con manteca de verdad y sin apuro, doradas por fuera y suaves por dentro. ' +
    'A la mañana temprano ya están en la vitrina y a la tarde sale otra tanda para la merienda. ' +
    'Mucha gente del barrio pasa antes de ir a trabajar y se lleva media docena para compartir en la oficina. ' +
    'También preparamos bandejas para cumpleaños y reuniones, con facturas surtidas y pan casero del día.\n\n' +
    'Pasá por el local o escribinos por DM 📩',
  overlay: 'Medialunas calentitas', hashtags: '#panaderia #medialunas',
};
global.fetch = async (url, opts) => {
  calls++;
  const body = JSON.parse(opts.body);
  const userMsg = body.messages[1].content;
  // Como el modelo real: sin feedback pega un caption larguísimo e
  // irreparable; con el motivo en el feedback, corrige a uno largo pero
  // reparable (la reparación determinística lo deja en contrato).
  const item = /Ajuste de calidad/.test(userMsg) ? LONG_OK : GIANT;
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(item) } }],
      usage: { prompt_tokens: 400, completion_tokens: 120, total_tokens: 520 },
    }),
  };
};

const G = require('./generator');
const S = require('./stories');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-v330-flow-'));
const MEDIA = path.join(TMP, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
const FOTO = path.join(MEDIA, 'fuente.png');
execFileSync('python3', ['-c', `from PIL import Image\nImage.new('RGB', (1080, 1920), (24, 34, 52)).save('${FOTO}')`], { stdio: 'pipe' });

const DDL = `
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT,
  status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image', tipo TEXT DEFAULT '',
  source TEXT DEFAULT '', source_topic TEXT DEFAULT '', intent TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '',
  category TEXT DEFAULT '', ig_username TEXT DEFAULT '');
CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '{}');
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE image_meta (media_path TEXT PRIMARY KEY, avatar_protagonist INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')));`;

const INPUT = {
  business: 'Panadería Sol', category: 'gastronomia', tone: 'canchero',
  description: 'Panadería de barrio en Caballito. Medialunas de manteca, facturas surtidas y pan casero.',
  topic: 'medialunas de manteca recién salidas del horno', tipo: 'social', goal: 'vender más',
};

(async () => {
  const db = new DatabaseSync(path.join(TMP, 'flow.db'));
  db.exec(DDL);
  db.prepare(`INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (2, 'Panadería Sol', 'gastronomia', 'panaderiasol')`).run();

  const N = 5;
  let produced = 0;
  const callsPerPost = [];
  for (let i = 0; i < N; i++) {
    const before = calls;
    const out = await G.generateContent({ ...INPUT, topic: `${INPUT.topic} (${i + 1})` }, 'sk-stub');
    callsPerPost.push(calls - before);
    const gate = G.captionPasses(out.caption, INPUT);
    assert.ok(gate.ok, `el posteo ${i + 1} nace dentro del contrato: ${gate.reason} :: ${out.caption.slice(0, 80)}`);
    const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type) VALUES (2, '/media/fuente.png', ?, 'published', 'image')`).run(out.caption);
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(r.lastInsertRowid));
    const twin = S.createTwinStory({ db, post, brand: { business: 'Panadería Sol', bgHex: '#0A1E33', textHex: '#FFFFFF' }, mediaDir: MEDIA, postImageAbs: FOTO, scheduleAt: '2026-10-22 18:00:00' });
    if (twin.status === 'created') produced++;
    else console.log(`  gemela ${i + 1} omitida: ${twin.reason}`);
  }
  db.close();
  console.log(`gemelas producidas: ${produced}/${N} · llamadas al modelo por posteo: ${callsPerPost.join(', ')}`);
  assert.ok(produced / N >= 0.8, `al menos 80% de historias producidas (${produced}/${N})`);
  assert.ok(Math.max(...callsPerPost) <= 5, `ningún posteo quema más de 5 candidatos (máx ${Math.max(...callsPerPost)})`);
  console.log('\n✓ prueba de misión v330 M2: semana + gemelas dentro del contrato');
})().catch((e) => { console.error(e); process.exit(1); });
