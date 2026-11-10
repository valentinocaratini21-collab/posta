'use strict';
/* test-lote-memoria-cliente-v873.js — LOTE v873 · MEMORIA POR CLIENTE
 * (Regla de Valentino 10/11 09:33): cada conversación del chat con un
 * cliente, Posty tiene que recordarla — para entender más al cliente,
 * caerle mejor, hacer los posteos más rápido y entender sus cambios.
 *
 * Este test prueba la garantía nueva en tres niveles:
 *  1. Módulo (memoria-cliente.js): guardar → listar → leer para el brief;
 *     dedupe por texto normalizado; tope de 30 activas (las más viejas se
 *     desactivan); olvidar; esSaludo; último intercambio; extraerYGuardar
 *     fail-open (sin clave no guarda nada; LLM que devuelve [] no guarda).
 *  2. Generador (generator.js, fetch stubbeado): generateIdeas con
 *     memoriaCliente en el input manda la memoria en el prompt (bloque
 *     MEMORIA DEL CLIENTE); sin memoriaCliente el prompt NO la trae
 *     (fail-open: genera como antes).
 *  3. Captions en lote: generateCaptions con memoriaCliente también la
 *     manda en el prompt.
 * Corre con: node test-lote-memoria-cliente-v873.js  (sin red real: fetch
 * stub; DB en memoria). */
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const mc = require('./memoria-cliente');
const gen = require('./generator');

let passed = 0, failed = 0;
const failures = [];
function ok(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { passed++; console.log('  ✓', name); })
        .catch((e) => { failed++; failures.push(name + ': ' + e.message); console.log('  ×', name, '—', e.message); });
    }
    passed++; console.log('  ✓', name);
    return Promise.resolve();
  } catch (e) {
    failed++; failures.push(name + ': ' + e.message); console.log('  ×', name, '—', e.message);
    return Promise.resolve();
  }
}

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  mc.ensureSchema(db);
  return db;
}
function seedExchange(db, uid, userText, assistantText) {
  db.prepare("INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'user', ?)").run(uid, userText);
  db.prepare("INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)").run(uid, assistantText);
}

const UID = 1234;
const MEMORIA = '- (decisión) de ahora en más vendemos solo los fines de semana';

async function main() {
  console.log('== 1. Módulo: guardar → listar → brief ==');
  await ok('guardarMemoria guarda y listar la devuelve', () => {
    const db = freshDb();
    const n = mc.guardarMemoria(db, UID, [{ tipo: 'decision', texto: 'de ahora en más vendemos solo los fines de semana' }], 'de ahora en más vendemos solo los fines de semana');
    assert.strictEqual(n, 1);
    const list = mc.listar(db, UID);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].tipo, 'decision');
    assert.strictEqual(list[0].texto, 'de ahora en más vendemos solo los fines de semana');
    assert.strictEqual(list[0].ejemplo, 'de ahora en más vendemos solo los fines de semana');
    db.close();
  });
  await ok('memoriaParaBrief devuelve el bloque con la entrada', () => {
    const db = freshDb();
    mc.guardarMemoria(db, UID, [{ tipo: 'decision', texto: 'de ahora en más vendemos solo los fines de semana' }], '');
    const brief = mc.memoriaParaBrief(db, UID);
    assert.ok(brief.includes('de ahora en más vendemos solo los fines de semana'), 'el brief no trae la entrada: ' + brief);
    assert.ok(brief.includes('decisión'), 'el brief no trae el tipo: ' + brief);
    db.close();
  });
  await ok('sin memoria, memoriaParaBrief devuelve vacío (fail-open)', () => {
    const db = freshDb();
    assert.strictEqual(mc.memoriaParaBrief(db, UID), '');
    db.close();
  });

  console.log('== 2. Módulo: dedupe, tope 30, olvidar ==');
  await ok('dedupe: el mismo texto dos veces guarda una sola entrada', () => {
    const db = freshDb();
    mc.guardarMemoria(db, UID, [{ tipo: 'correccion', texto: 'el precio es $50, no $40' }], '');
    const n2 = mc.guardarMemoria(db, UID, [{ tipo: 'correccion', texto: 'El precio es $50, no $40' }], '');
    assert.strictEqual(n2, 0, 'el duplicado (con mayúsculas) no se dedupeó');
    assert.strictEqual(mc.listar(db, UID).length, 1);
    db.close();
  });
  await ok('tope 30: al guardar 31, quedan 30 activas y la más vieja se desactiva', () => {
    const db = freshDb();
    for (let i = 0; i < 31; i++) {
      mc.guardarMemoria(db, UID, [{ tipo: 'contexto', texto: 'hecho número ' + i }], '');
    }
    const list = mc.listar(db, UID);
    assert.strictEqual(list.length, 30, 'activas: ' + list.length);
    assert.ok(!list.some(e => e.texto === 'hecho número 0'), 'la más vieja sigue activa');
    assert.ok(list.some(e => e.texto === 'hecho número 30'), 'la más nueva no está');
    db.close();
  });
  await ok('olvidar desactiva la entrada', () => {
    const db = freshDb();
    mc.guardarMemoria(db, UID, [{ tipo: 'preferencia', texto: 'prefiero que los posteos salgan a la mañana' }], '');
    const id = mc.listar(db, UID)[0].id;
    const r = mc.olvidar(db, UID, id);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(mc.listar(db, UID).length, 0);
    assert.strictEqual(mc.memoriaParaBrief(db, UID), '');
    db.close();
  });

  console.log('== 3. Módulo: último intercambio y saludo ==');
  await ok('ultimoIntercambio lee el último mensaje del usuario y la respuesta que le siguió', () => {
    const db = freshDb();
    seedExchange(db, UID, 'hola', 'hola! ¿qué necesitás?');
    seedExchange(db, UID, 'el precio es $50, no $40', 'anotado, $50 de ahora en más');
    const x = mc.ultimoIntercambio(db, UID);
    assert.ok(x, 'no leyó el intercambio');
    assert.strictEqual(x.usuario, 'el precio es $50, no $40');
    assert.strictEqual(x.asistente, 'anotado, $50 de ahora en más');
    db.close();
  });
  await ok('sin respuesta del asistente después del último mensaje, no hay intercambio', () => {
    const db = freshDb();
    db.prepare("INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'user', ?)").run(UID, 'el precio es $50');
    assert.strictEqual(mc.ultimoIntercambio(db, UID), null);
    db.close();
  });
  await ok('esSaludo: saludo solo → sí; frase con un dato → no', () => {
    assert.strictEqual(mc.esSaludo('hola'), true);
    assert.strictEqual(mc.esSaludo('gracias'), true);
    assert.strictEqual(mc.esSaludo('el precio es $50, no $40'), false);
    assert.strictEqual(mc.esSaludo('de ahora en más vendemos solo los fines de semana'), false);
  });

  console.log('== 4. Módulo: extraerYGuardar fail-open ==');
  await ok('sin clave, extraerYGuardar no guarda nada y no tira', async () => {
    const db = freshDb();
    seedExchange(db, UID, 'el precio es $50, no $40', 'anotado');
    const r = await mc.extraerYGuardar(db, UID, '');
    assert.strictEqual(r.saved, 0);
    assert.strictEqual(mc.listar(db, UID).length, 0);
    db.close();
  });
  await ok('sin intercambio completo, extraerYGuardar no guarda nada', async () => {
    const db = freshDb();
    const r = await mc.extraerYGuardar(db, UID, 'sk-test');
    assert.strictEqual(r.saved, 0);
    db.close();
  });
  await ok('con LLM stubbeado que devuelve una decisión, se guarda', async () => {
    const db = freshDb();
    seedExchange(db, UID, 'de ahora en más vendemos solo los fines de semana', 'perfecto, así lo anoto');
    const realFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ entradas: [{ tipo: 'decision', texto: 'de ahora en más vendemos solo los fines de semana' }] }) } }] }),
    });
    try {
      const r = await mc.extraerYGuardar(db, UID, 'sk-test');
      assert.strictEqual(r.saved, 1, 'saved: ' + JSON.stringify(r));
      assert.strictEqual(mc.listar(db, UID).length, 1);
      assert.ok(mc.memoriaParaBrief(db, UID).includes('fines de semana'));
    } finally { global.fetch = realFetch; }
    db.close();
  });
  await ok('con LLM stubbeado que devuelve [], no se guarda nada', async () => {
    const db = freshDb();
    seedExchange(db, UID, 'hola, ¿qué tal?', 'hola! todo bien, ¿qué necesitás?');
    const realFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ entradas: [] }) } }] }),
    });
    try {
      const r = await mc.extraerYGuardar(db, UID, 'sk-test');
      assert.strictEqual(r.saved, 0);
      assert.strictEqual(mc.listar(db, UID).length, 0);
    } finally { global.fetch = realFetch; }
    db.close();
  });

  console.log('== 5. Generador: la memoria viaja en el prompt de ideas ==');
  const realFetch = global.fetch;
  let captured = '';
  function stubIdeas() {
    global.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      captured = body.messages.map(m => m.content).join('\n');
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ ideas: [
          { titulo: 'El color que te pide la mano', formato: 'Contenido', tipo: 'tip', angulo: 'elegir el color en la mano', porque: 'es lo que pide el cliente' },
          { titulo: 'Así cae el color', formato: 'Contenido', tipo: 'tip', angulo: 'el video del color', porque: 'muestra el producto real' },
        ] }) } }] }),
      };
    };
  }
  const baseInput = { business: 'Nails Studio', category: 'belleza', tone: 'cercano', dna: null, ig_username: 'nails.studio' };
  await ok('generateIdeas con memoriaCliente manda la memoria en el prompt', async () => {
    stubIdeas();
    try {
      const ideas = await gen.generateIdeas({ ...baseInput, memoriaCliente: MEMORIA }, 'sk-test');
      assert.ok(Array.isArray(ideas) && ideas.length > 0, 'no devolvió ideas');
      assert.ok(captured.includes('MEMORIA DEL CLIENTE'), 'el prompt no trae el bloque MEMORIA DEL CLIENTE');
      assert.ok(captured.includes('fines de semana'), 'el prompt no trae el texto de la memoria');
    } finally { global.fetch = realFetch; }
  });
  await ok('generateIdeas sin memoriaCliente NO trae el bloque (fail-open: genera como antes)', async () => {
    stubIdeas();
    try {
      const ideas = await gen.generateIdeas({ ...baseInput }, 'sk-test');
      assert.ok(Array.isArray(ideas) && ideas.length > 0, 'no devolvió ideas');
      assert.ok(!captured.includes('MEMORIA DEL CLIENTE'), 'el prompt trae MEMORIA DEL CLIENTE sin haber memoria');
    } finally { global.fetch = realFetch; }
  });

  console.log('== 6. Generador: la memoria viaja en el prompt de captions en lote ==');
  await ok('generateCaptions con memoriaCliente manda la memoria en el prompt', async () => {
    global.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      captured = body.messages.map(m => m.content).join('\n');
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ captions: ['Caption uno para el posteo.', 'Caption dos para el posteo.'], overlays: ['Titular uno', 'Titular dos'], hashtags: '' }) } }] }),
      };
    };
    try {
      const out = await gen.generateCaptions({ ...baseInput, topic: 'El color de siempre', memoriaCliente: MEMORIA }, 2, 'sk-test');
      assert.ok(out && Array.isArray(out.captions) && out.captions.length >= 1, 'no devolvió captions');
      assert.ok(captured.includes('MEMORIA DEL CLIENTE'), 'el prompt de captions no trae el bloque MEMORIA DEL CLIENTE');
      assert.ok(captured.includes('fines de semana'), 'el prompt de captions no trae el texto de la memoria');
    } finally { global.fetch = realFetch; }
  });

  console.log(`\nmemoria-cliente v873: ${passed} ok / ${failed} fail`);
  if (failed) { console.log('FALLOS:', failures.join(' | ')); process.exit(1); }
}

main().catch((e) => { console.error('SUITE ROTA:', e); process.exit(1); });
