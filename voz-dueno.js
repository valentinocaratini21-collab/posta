'use strict';
/* =====================================================================
 * voz-dueno.js — «Voz del dueño → posteo» (aprobado por Valentino 29/10/2026).
 *
 * El dueño habla ~30s en el chat (qué hay hoy en su local) y Posty le
 * devuelve un borrador de posteo del día: transcripción + foto REAL del
 * producto + texto con su style lock + 3 toques (Aprobar / Cambiar foto /
 * Rehacer texto). Con un toque en Aprobar sale en el horario del día.
 * Variante fuerte: el reel usa EL AUDIO REAL del dueño como voz en off.
 *
 * REGLAS DURAS (vara Posty, no negociables):
 *  - Nunca inventar: ni cantidad, ni precio, ni producto, ni foto que no
 *    sea del cliente. Lo que no se dijo, no se escribe.
 *  - Transcripción dudosa o producto ambiguo → el borrador queda en
 *    estado 'aclarar' con opciones de UN toque; nunca pide grabar de nuevo.
 *  - Sin preguntas de estrategia, sin manuales, sin paneles: un toque por
 *    decisión. El texto sale con el style lock del cliente, no template.
 *  - STT con gate explícito: sin llave, el paso queda declarado como
 *    pendiente (codigo 'stt_sin_llave'), NUNCA simulado como si transcribiera.
 *
 * Diseño: funciones puras + funciones que toman `db` (interfaz
 * prepare().get/.all/.run, la de node:sqlite) para que los tests corran
 * sin red ni modelo. El modelo solo aparece en generarCaptionVoz y en
 * el hook del servidor; el caption que sale SIEMPRE pasa por
 * verificarCaptionSinInvento antes de mostrarse.
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const STOPWORDS = new Set(['de', 'la', 'el', 'en', 'con', 'y', 'a', 'su', 'sus', 'los', 'las', 'un', 'una', 'unos', 'unas', 'del', 'al', 'para', 'por', 'que', 'se', 'es', 'son', 'mi', 'mis', 'tu', 'tus']);

const NUMEROS_ES = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, docena: 12,
};

const CANTIDAD_QUALIFIERS = ['pocas', 'pocos', 'algunas', 'algunos', 'varias', 'varios', 'poquitas', 'poquitos', 'un monton'];

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s) {
  return normalize(s).split(' ').filter(Boolean);
}

function contentTokens(s) {
  return tokens(s).filter(t => !STOPWORDS.has(t));
}

// Formas de un token para matchear singular/plural rioplatense.
function tokenForms(t) {
  const out = new Set([t]);
  if (t.endsWith('s') && t.length > 2) out.add(t.slice(0, -1));
  if (t.endsWith('es') && t.length > 3) out.add(t.slice(0, -2));
  return out;
}

// ¿Todos los tokens de contenido del nombre aparecen en el texto?
// Se comparan con singularización en ambos sentidos (torta↔tortas,
// pan↔panes), porque el dueño habla en plural y el fundamento en singular.
function nombreEnTexto(nombre, textoNormTokens) {
  const nt = contentTokens(nombre);
  if (!nt.length) return false;
  const hay = new Set();
  for (const tok of textoNormTokens) {
    hay.add(tok);
    if (tok.endsWith('s') && tok.length > 2) hay.add(tok.slice(0, -1));
    if (tok.endsWith('es') && tok.length > 3) hay.add(tok.slice(0, -2));
  }
  return nt.every(tok => {
    if (hay.has(tok)) return true;
    for (const f of tokenForms(tok)) if (hay.has(f)) return true;
    return false;
  });
}

// ¿El transcript suena a reporte del día (novedad de hoy), no a pedido?
function esReporteDelDia(raw) {
  const txt = String(raw || '');
  if (/[?¿]/.test(txt)) return false;
  const n = normalize(txt);
  const words = n.split(' ').filter(Boolean);
  if (words.length < 3) return false;
  if (/^(haceme|hace|crea|genera|cambia|publica|subi|escribi|armame|mostrame|decime|ayudame|prepara|preparame|fijate|contame|pasame)\b/.test(n)) return false;
  const MARCAS = ['llegaron', 'llego', 'hoy', 'esta tarde', 'esta manana', 'esta semana', 'tenemos', 'tengo', 'hay', 'quedan', 'queda', 'trajimos', 'trajeron', 'nuevo', 'nueva', 'estrenamos', 'salio', 'salieron', 'volvio', 'volvieron', 'ademas', 'nos llego', 'acaba de llegar', 'recien', 'temporada'];
  return MARCAS.some(m => n.includes(m));
}

function numeroDePalabra(w) {
  if (/^\d+$/.test(w)) return parseInt(w, 10);
  return Object.prototype.hasOwnProperty.call(NUMEROS_ES, w) ? NUMEROS_ES[w] : null;
}

// Extrae hechos SOLO de lo dicho. Nunca completa lo que falta.
function extraerHechos(transcript, digest) {
  const d = digest || {};
  const tNorm = normalize(transcript);
  const tToks = tNorm.split(' ').filter(Boolean);
  const productos = [];
  const seen = new Set();
  const items = [...(Array.isArray(d.productos) ? d.productos : []), ...(Array.isArray(d.servicios) ? d.servicios : [])];
  for (const it of items) {
    const nombre = it && (it.nombre || it);
    if (typeof nombre !== 'string' || !nombre.trim()) continue;
    if (nombreEnTexto(nombre, tToks) && !seen.has(nombre)) { seen.add(nombre); productos.push(nombre); }
  }
  // Léxico: si el cliente lo nombra como lo nombra siempre (apodo) y ese
  // apodo comparte token con un producto real, ancla a ese producto.
  const entries = (d.lexicon && Array.isArray(d.lexicon.entries)) ? d.lexicon.entries : [];
  for (const e of entries) {
    const formas = [e.dice, ...(Array.isArray(e.apodos) ? e.apodos : [])].filter(s => typeof s === 'string');
    for (const f of formas) {
      if (!nombreEnTexto(f, tToks)) continue;
      const ft = new Set(contentTokens(f));
      for (const it of items) {
        const nombre = it && (it.nombre || it);
        if (typeof nombre !== 'string') continue;
        if (contentTokens(nombre).some(tok => ft.has(tok)) && !seen.has(nombre)) { seen.add(nombre); productos.push(nombre); }
      }
    }
  }
  // Cantidad: solo en contexto de stock/llegada, dígito o palabra.
  let cantidad = null;
  let cantidadTexto = null;
  const numAlt = '(\\d+|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|treinta|cuarenta|cincuenta|docena)';
  const mCant = tNorm.match(new RegExp('(?:quedan|queda|hay|tenemos|tengo|llegaron|llego|trajimos|trajeron|nos quedan)\\s+(?:solo\\s+|solamente\\s+|unas?\\s+|alrededor de\\s+|como\\s+)?' + numAlt));
  if (mCant) {
    cantidad = mCant[1] === 'media docena' ? 6 : numeroDePalabra(mCant[1]);
  } else {
    const mMedia = tNorm.match(/media docena/);
    if (mMedia) cantidad = 6;
  }
  if (cantidad === null) {
    const mQ = tNorm.match(/(?:quedan|queda|hay)\s+(pocas|pocos|algunas|algunos|varias|varios|poquitas|poquitos|un monton)\b/);
    if (mQ) cantidadTexto = mQ[1];
  }
  // Precio: solo si se dijo ($ o pesos). Se busca sobre el texto crudo
  // porque el normalizado ya perdió el signo $.
  let precio = null;
  const rawLower = String(transcript || '').toLowerCase();
  const mPrecio = rawLower.match(/\$\s*([\d]+(?:[.,][\d]{3})*(?:[.,]\d{2})?)/) || rawLower.match(/(\d+)\s+pesos\b/);
  if (mPrecio) precio = mPrecio[1];
  const novedad = /(llegaron|llego|nuevo|nueva|estrenamos|salio|salieron|hoy)/.test(tNorm);
  const dudas = [];
  const nombres = items.map(it => (it && (it.nombre || it))).filter(s => typeof s === 'string');
  if (!productos.length) dudas.push({ codigo: 'sin_producto', opciones: nombres.slice(0, 8) });
  else if (productos.length > 1) dudas.push({ codigo: 'varios_productos', opciones: productos.slice() });
  return { productos, cantidad, cantidadTexto, precio, novedad, dudas, opciones: dudas.length ? dudas[0].opciones : [] };
}

// Foto REAL del producto: (1) tag del álbum que mencione el producto,
// (2) si no hay, NO adivina: falta + últimas fotos del local para elegir.
function elegirFoto(db, userId, producto) {
  try {
    const tok = (contentTokens(producto || '').find(t => t.length >= 3)) || '';
    if (tok) {
      const rows = db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND album_tag LIKE ? ORDER BY id DESC LIMIT 5`).all(userId, `%${tok}%`);
      if (rows && rows.length) {
        return { foto: rows[0].file_path, origen: 'conocida', alternativas: rows.slice(1).map(r => r.file_path) };
      }
    }
    const ult = db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'photo' ORDER BY id DESC LIMIT 5`).all(userId);
    return { foto: null, origen: 'falta', alternativas: (ult || []).map(r => r.file_path) };
  } catch (_) {
    return { foto: null, origen: 'falta', alternativas: [] };
  }
}

// Prompt del caption: SOLO los hechos + estilo del cliente. Sin dígitos
// fuera de los hechos (el template no lleva números).
function armarPromptCaption({ transcript, hechos, styleExtras }) {
  const h = hechos || {};
  const lineas = ['HECHOS REALES DE HOY (solo estos, no agregues ningún otro dato):'];
  lineas.push('- producto: ' + ((h.productos || []).join(', ') || 'sin producto dicho'));
  if (h.cantidad !== null && h.cantidad !== undefined) lineas.push('- cantidad: ' + h.cantidad);
  else if (h.cantidadTexto) lineas.push('- cantidad: ' + h.cantidadTexto + ' (textual, no es un número)');
  else lineas.push('- cantidad: sin cantidad dicha');
  lineas.push('- precio: ' + (h.precio ? h.precio : 'sin precio dicho'));
  lineas.push('- novedad: ' + (h.novedad ? 'sí' : 'no'));
  lineas.push('Transcripción literal del dueño: "' + String(transcript || '').slice(0, 1000) + '"');
  lineas.push('Escribí el caption con la voz del dueño. REGLAS DURAS: no inventes cantidades, precios ni productos; si un dato no está arriba, no lo escribas; una sola idea; rioplatense; sin preguntas de estrategia.');
  if (styleExtras) lineas.push(styleExtras);
  return lineas.join('\n');
}

// Separa hashtags finales del caption (máximo cinco, como el checklist).
function separarHashtags(texto) {
  const t = String(texto || '').trim();
  const m = t.match(/((?:\s*#[^\s#]+)+)\s*$/);
  if (!m) return { caption: t, hashtags: [] };
  const tags = m[1].trim().split(/\s+/).slice(0, 5);
  return { caption: t.slice(0, t.length - m[0].length).trim(), hashtags: tags };
}

// Gate anti-invento: todo número y todo producto del caption tiene que
// estar en la transcripción o en los hechos. Si no, el caption NO sale.
function numerosEnTexto(texto) {
  const out = [];
  const n = normalize(texto);
  for (const w of n.split(' ').filter(Boolean)) {
    const v = numeroDePalabra(w);
    if (v !== null) out.push(v);
  }
  return out;
}

function verificarCaptionSinInvento(caption, hechos, transcript, digest) {
  const problemas = [];
  const cap = String(caption || '');
  const permitidos = new Set(numerosEnTexto(transcript || ''));
  if (hechos && hechos.cantidad !== null && hechos.cantidad !== undefined) permitidos.add(hechos.cantidad);
  if (hechos && hechos.precio) {
    const pd = parseInt(String(hechos.precio).replace(/[.,]/g, ''), 10);
    if (Number.isFinite(pd)) permitidos.add(pd);
  }
  for (const v of numerosEnTexto(cap)) {
    if (!permitidos.has(v)) problemas.push('numero_no_dicho:' + v);
  }
  const d = digest || {};
  const items = [...(Array.isArray(d.productos) ? d.productos : []), ...(Array.isArray(d.servicios) ? d.servicios : [])];
  const capToks = normalize(cap).split(' ').filter(Boolean);
  for (const it of items) {
    const nombre = it && (it.nombre || it);
    if (typeof nombre !== 'string') continue;
    if (nombreEnTexto(nombre, capToks) && !(hechos && (hechos.productos || []).includes(nombre))) {
      problemas.push('producto_no_dicho:' + nombre);
    }
  }
  return { ok: problemas.length === 0, problemas };
}

// STT con gate: sin llave, pendiente declarado, nunca simulado.
async function transcribirVoz(dataUrl, apiKey, fetchImpl) {
  const fetchFn = fetchImpl || fetch;
  const m = String(dataUrl || '').match(/^data:(audio\/[\w+.-]+);base64,(.+)$/);
  if (!m) return { ok: false, codigo: 'audio_invalido' };
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > 12 * 1024 * 1024) return { ok: false, codigo: 'audio_invalido' };
  if (!apiKey) return { ok: false, codigo: 'stt_sin_llave', pendiente: true };
  try {
    const form = new FormData();
    form.append('file', new Blob([buf], { type: m[1] }), 'audio.webm');
    form.append('model', 'whisper-1');
    form.append('language', 'es');
    const r = await fetchFn('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body: form,
    });
    if (!r.ok) return { ok: false, codigo: 'stt_error', detalle: 'whisper ' + r.status };
    const j = await r.json();
    const text = String((j && j.text) || '').trim();
    if (!text) return { ok: false, codigo: 'stt_vacio' };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, codigo: 'stt_error', detalle: String((e && e.message) || e).slice(0, 120) };
  }
}

function guardarAudioVoz(mediaDir, dataUrl, userId) {
  const m = String(dataUrl || '').match(/^data:(audio\/([\w+.-]+));base64,(.+)$/);
  if (!m) throw new Error('audio inválido');
  const buf = Buffer.from(m[3], 'base64');
  if (!buf.length || buf.length > 12 * 1024 * 1024) throw new Error('audio inválido');
  const extMap = { webm: 'webm', mp4: 'mp4', mpeg: 'mp3', ogg: 'ogg', wav: 'wav', 'x-m4a': 'm4a' };
  const ext = extMap[m[2]] || 'webm';
  const name = 'voz-' + String(userId) + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, name), buf);
  return '/media/' + name;
}

// --- Slot del día (puro, con Intl; sin depender de los helpers de server.js) ---
function ymdEnTz(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(date);
}
function weekdayEnTz(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(f.format(date));
}
function offsetMsEn(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = dtf.formatToParts(date);
  const get = t => parseInt(parts.find(p => p.type === t).value, 10);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
function wallToUtc(ymd, hour, tz) {
  const [y, mo, d] = ymd.split('-').map(Number);
  let guess = Date.UTC(y, mo - 1, d, hour, 0, 0);
  const off1 = offsetMsEn(new Date(guess), tz);
  const off2 = offsetMsEn(new Date(guess - off1), tz);
  return new Date(guess - off2);
}
// Hoy a bestHour si falta y es futuro; si no, el próximo día libre.
function slotDelDia({ tz, bestHour, takenYmd, closedWeekdays, nowMs }) {
  const hour = (Number.isFinite(bestHour) && bestHour >= 9 && bestHour <= 21) ? Math.floor(bestHour) : 19;
  const now = new Date(nowMs);
  const taken = takenYmd instanceof Set ? takenYmd : new Set(takenYmd || []);
  const closed = closedWeekdays instanceof Set ? closedWeekdays : new Set(closedWeekdays || []);
  for (let i = 0; i < 31; i++) {
    const cand = new Date(now.getTime() + i * 86400000);
    const ymd = ymdEnTz(cand, tz);
    if (closed.has(weekdayEnTz(cand, tz))) continue;
    if (taken.has(ymd)) continue;
    const slot = wallToUtc(ymd, hour, tz);
    if (slot.getTime() > now.getTime()) return slot.toISOString();
  }
  return null;
}

// --- Persistencia (tablas perezosas; nunca rompe si ya existen) ---
function ensureVoiceTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS voice_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    transcripcion TEXT NOT NULL DEFAULT '',
    hechos_json TEXT NOT NULL DEFAULT '{}',
    foto TEXT DEFAULT '',
    foto_origen TEXT DEFAULT '',
    audio_path TEXT DEFAULT '',
    caption TEXT DEFAULT '',
    hashtags TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'aclarar',
    post_id INTEGER DEFAULT NULL,
    reel_path TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

function crearBorradorVoz(db, d) {
  ensureVoiceTables(db);
  const hechos = d.hechos || {};
  const estado = (hechos.dudas && hechos.dudas.length) ? 'aclarar' : (d.caption ? 'listo' : 'texto_pendiente');
  const r = db.prepare(`INSERT INTO voice_posts (user_id, transcripcion, hechos_json, foto, foto_origen, audio_path, caption, hashtags, estado) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(d.userId, d.transcript || '', JSON.stringify(hechos), d.foto || '', d.fotoOrigen || '', d.audioPath || '', d.caption || '', d.hashtags || '', estado);
  const id = Number(r.lastInsertRowid);
  return { id, estado, dudas: hechos.dudas || [], opciones: hechos.opciones || [] };
}

function leerBorradorVoz(db, id, userId) {
  ensureVoiceTables(db);
  const row = db.prepare(`SELECT * FROM voice_posts WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!row) return null;
  return { ...row, hechos: JSON.parse(row.hechos_json || '{}') };
}

function aprobarVoz(db, id, slotIso) {
  const row = db.prepare(`SELECT * FROM voice_posts WHERE id = ?`).get(id);
  if (!row) return { ok: false, codigo: 'sin_borrador' };
  const hechos = JSON.parse(row.hechos_json || '{}');
  if (hechos.dudas && hechos.dudas.length) return { ok: false, codigo: 'falta_aclarar', dudas: hechos.dudas };
  if (!row.foto) return { ok: false, codigo: 'sin_foto' };
  if (!slotIso) return { ok: false, codigo: 'sin_slot' };
  const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, tipo) VALUES (?,?,?,?,?,'scheduled','')`)
    .run(row.user_id, row.foto, row.caption || '', row.hashtags || '', slotIso);
  const postId = Number(ins.lastInsertRowid);
  db.prepare(`UPDATE voice_posts SET estado='aprobado', post_id=?, updated_at=datetime('now') WHERE id=?`).run(postId, id);
  return { ok: true, postId, scheduled_at: slotIso };
}

function aclararVoz(db, id, producto) {
  const row = db.prepare(`SELECT * FROM voice_posts WHERE id = ?`).get(id);
  if (!row) return { ok: false, codigo: 'sin_borrador' };
  const hechos = JSON.parse(row.hechos_json || '{}');
  hechos.productos = [producto];
  hechos.dudas = (hechos.dudas || []).filter(d => d.codigo !== 'sin_producto' && d.codigo !== 'varios_productos');
  hechos.opciones = hechos.dudas.length ? hechos.dudas[0].opciones : [];
  const estado = hechos.dudas.length ? 'aclarar' : (row.caption ? 'listo' : 'texto_pendiente');
  db.prepare(`UPDATE voice_posts SET hechos_json=?, estado=?, updated_at=datetime('now') WHERE id=?`).run(JSON.stringify(hechos), estado, id);
  return { ok: true, estado, hechos };
}

function cambiarFotoVoz(db, id, foto) {
  const row = db.prepare(`SELECT * FROM voice_posts WHERE id = ?`).get(id);
  if (!row) return { ok: false, codigo: 'sin_borrador' };
  if (typeof foto === 'string' && foto.startsWith('/media/')) {
    db.prepare(`UPDATE voice_posts SET foto=?, foto_origen='elegida', updated_at=datetime('now') WHERE id=?`).run(foto, id);
    return { ok: true, foto, foto_origen: 'elegida' };
  }
  const hechos = JSON.parse(row.hechos_json || '{}');
  const sel = elegirFoto(db, row.user_id, (hechos.productos || [])[0] || '');
  return { ok: true, foto: row.foto, foto_origen: row.foto_origen, alternativas: sel.alternativas || [] };
}

function rehacerTextoVoz(db, id, caption, hechos, transcript, digest) {
  const ver = verificarCaptionSinInvento(caption, hechos, transcript, digest);
  if (!ver.ok) return { ok: false, codigo: 'caption_con_invento', problemas: ver.problemas };
  const sep = separarHashtags(caption);
  db.prepare(`UPDATE voice_posts SET caption=?, hashtags=?, estado='listo', updated_at=datetime('now') WHERE id=?`).run(sep.caption, sep.hashtags.join(' '), id);
  return { ok: true, caption: sep.caption, hashtags: sep.hashtags };
}

// Caption por modelo (wrapper fino; el prompt y el gate viven arriba).
async function generarCaptionVoz({ apiKey, prompt, fetchImpl }) {
  const fetchFn = fetchImpl || fetch;
  if (!apiKey) return null;
  const r = await fetchFn('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Sos el editor de Posty. Escribí UN caption, rioplatense, con la voz del dueño, una sola idea. Nunca inventes datos.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const text = String((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
  if (!text) return null;
  const sep = separarHashtags(text);
  return { text: sep.caption, hashtags: sep.hashtags, raw: text };
}

// --- Reel con la voz real del dueño (ffmpeg local, como story-reel.js) ---
function armarReelVozArgs({ fotoAbs, audioAbs, outAbs, durSeg }) {
  const dur = Number.isFinite(durSeg) && durSeg > 0 ? Math.floor(durSeg) : 16;
  const fps = 25;
  const vf = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.15)':d=${dur * fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${fps}[v]`;
  return ['-y', '-loop', '1', '-i', fotoAbs, '-i', audioAbs,
    '-filter_complex', vf, '-map', '[v]', '-map', '1:a',
    '-t', String(dur), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', outAbs];
}

function mezclarVozEnReel(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: timeoutMs || 120000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const lines = String(stderr || '').split('\n').map(l => l.trim()).filter(Boolean);
        return reject(new Error('ffmpeg: ' + (lines.filter(l => !/^frame=/.test(l)).slice(-2).join(' · ') || err.message).slice(0, 250)));
      }
      resolve(true);
    });
  });
}

module.exports = {
  normalize, esReporteDelDia, extraerHechos, elegirFoto, armarPromptCaption,
  separarHashtags, verificarCaptionSinInvento, transcribirVoz, guardarAudioVoz,
  slotDelDia, ensureVoiceTables, crearBorradorVoz, leerBorradorVoz, aprobarVoz,
  aclararVoz, cambiarFotoVoz, rehacerTextoVoz, generarCaptionVoz,
  armarReelVozArgs, mezclarVozEnReel, NUMEROS_ES,
};
