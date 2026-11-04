// test-lotecontenidofoto.js — LOTE CONTENIDO-FOTO.
// Caso que lo motiva (Valentino 1/11 18:40): foto de un estadio de
// fútbol americano con caption promo de Posty ("3 días gratis para
// probar a tu community manager… escribime por DM") que no tiene nada
// que ver con la foto. Ese desajuste tiene que ser imposible.
// Invariantes: (1) antes de generar, nota de visión guardada; caption
// y titular salen DE la nota; foto ajena + caption promo NO se empareja
// (reintento con ángulo de la foto o se descarta la foto). (2) el texto
// sobre la foto es un dato propio: línea propia en aprobación/detalle,
// se cambia por el chat y re-renderiza sin regenerar el posteo.
// Node puro, lee el árbol. Uso: node test-lotecontenidofoto.js
'use strict';
const fs = require('fs');
const path = require('path');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const db = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const gen = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const fgSrc = fs.readFileSync(path.join(__dirname, 'foto-grounding.js'), 'utf8');
const g = require('./foto-grounding.js');

// ---------- 1. Gate: el caso del estadio ----------
const ESTADIO = 'estadio de fútbol americano con cancha y tribuna llena';
const PROMO = 'Probá 3 días gratis tu community manager, escribime por DM';
const PARTIDO = 'El estadio rugió hasta el final del partido';
t(g.groundingGate({ tag: 'otro', visionNote: ESTADIO, caption: PROMO }).ok === false, 'gate: estadio + promo de prueba -> bloqueado');
t(g.groundingGate({ tag: 'otro', visionNote: ESTADIO, caption: PROMO }).reason === 'foto-promo-desajuste', 'gate: estadio + promo -> motivo foto-promo-desajuste');
t(g.groundingGate({ tag: 'otro', visionNote: ESTADIO, caption: PARTIDO }).ok === true, 'gate: estadio + caption del partido -> permitido');
t(g.groundingGate({ tag: 'otro', visionNote: ESTADIO, caption: PROMO, overlay: 'Probá gratis' }).ok === false, 'gate: estadio + titular promo -> bloqueado también por overlay');
t(g.groundingGate({ tag: 'producto', visionNote: 'brunch para dos con café y tostadas', caption: 'El brunch que merecés, todos los días' }).ok === true, 'gate: producto + caption del producto -> permitido');
t(g.groundingGate({ tag: 'producto', visionNote: 'brunch para dos', caption: PROMO }).ok === true, 'gate: producto + promo -> permitido (la foto SÍ muestra el producto)');
t(g.groundingGate({ tag: 'local', visionNote: 'interior del café con mesas de madera', caption: PROMO }).ok === true, 'gate: local + promo -> permitido');
t(g.groundingGate({ tag: 'equipo', visionNote: 'el dueño sirviendo café', caption: PROMO }).ok === true, 'gate: equipo + promo -> permitido');
t(g.groundingGate({ tag: '', visionNote: '', caption: PARTIDO }).reason === 'sin-vision', 'gate: sin visión -> sin-vision');
t(g.groundingGate({ tag: 'producto', visionNote: '', caption: PARTIDO }).ok === true, 'gate: tag sin nota -> permitido sin titular (celebrate anula el titular)');
t(g.groundingGate({ tag: '', visionNote: '', caption: PROMO }).ok === false, 'gate: sin visión + promo -> bloqueado');
t(g.isPromoCaption(PROMO) === true, 'promo: gratis + DM detectado');
t(g.isPromoCaption('Try 3 days free') === true, 'promo: days free EN detectado');
t(g.isPromoCaption('feel free to ask us anything') === false, 'promo: feel free no es promo');
t(g.isPromoCaption('20% off esta semana') === true, 'promo: % off detectado');
t(g.isPromoCaption('El estadio rugió hasta el final') === false, 'promo: caption neutro no es promo');
t(g.isPromoCaption('') === false, 'promo: vacío no es promo');
t(g.groundingGate({ tag: 'producto', visionNote: 'torta de chocolate con frutillas', caption: 'El brunch que merecés' }).ok === true, 'gate: titular conceptual legítimo no se rechaza por falta de solape literal');
t(!fgSrc.includes('require('), 'foto-grounding puro: sin requires');
t(!fgSrc.includes('fetch('), 'foto-grounding puro: sin red');

// ---------- 2. Visión guardada + gate en celebrate ----------
t(srv.includes("require('./foto-grounding')"), 'server requiere foto-grounding');
t(/function tagAlbumPhoto\(uid, assetId, filePath, lang/.test(srv), 'tagAlbumPhoto recibe lang');
t(srv.includes('max_tokens: 200'), 'tagAlbumPhoto max_tokens 200');
t(srv.includes('album_vision'), 'server guarda album_vision');
t(/function ensurePhotoVision/.test(srv), 'ensurePhotoVision existe');
t(srv.includes('photoVision') && srv.includes('photoTag'), 'celebrate pasa visión al input');
t(srv.includes('fotoGate = fotoGrounding.groundingGate'), 'celebrate: el reintento actualiza el gate');
t(srv.includes('if (!fotoGate.ok)'), 'celebrate: gate fallido no crea el posteo (fail-closed)');
t(srv.includes("if (!fotoVis.note) headline = ''"), 'celebrate: sin nota no hay titular (defensivo)');
t(/INSERT INTO posts \(user_id, image_path, caption, hashtags, status, media_type, needs_review, source, client_photo, week_key, tipo, strategy_why, overlay_text, vision_note\)/.test(srv), 'INSERT celebrate con overlay_text/vision_note');
t(db.includes('ADD COLUMN album_vision'), 'db ALTER album_vision');
t(db.includes('ADD COLUMN overlay_text') && db.split('ADD COLUMN overlay_text').length - 1 === 2, 'db ALTER overlay_text en posts y versions');
t(db.includes('ADD COLUMN vision_note'), 'db ALTER vision_note');

// ---------- 3. Generador: la nota viaja en el prompt ----------
t(/photoVision, photoVisionLang/.test(gen), 'openaiGenerate recibe photoVision');
t(gen.includes('lo que SE VE en la foto'), 'prompt de grounding ES');
t(gen.includes('actually visible in the photo'), 'prompt de grounding EN');

// ---------- 4. Texto en la foto como dato propio ----------
t(/function recompositePostOverlay/.test(srv), 'recompositePostOverlay definida');
t(srv.includes('overlay_rerender_failed'), 'PATCH 409 overlay_rerender_failed');
const recStart = srv.indexOf('function recompositePostOverlay');
const recEnd = srv.indexOf('async function enhancePhotoGenerate');
const recBody = srv.slice(recStart, recEnd);
t(recBody.length > 500, 'recomposite: cuerpo presente');
t(!recBody.includes('UPDATE posts SET caption'), 'recomposite no toca caption');
t(!recBody.includes('needs_review'), 'recomposite no toca estado/revisión');
t(recBody.includes('cleanSister'), 'recomposite usa hermana limpia');
t(recBody.includes('captionOutName'), 'recomposite compone a archivo nuevo');
t(recBody.includes('makeHeadline(') && recBody.includes(', 6, 70,'), 'recomposite titular ≤6 palabras');
t(recBody.includes('--grade') && recBody.includes('brandFontOf'), 'recomposite respeta grado del feed y fuente de marca');
t(srv.includes("String(post.overlay_text || '').trim() || makeHeadline"), 'enhance prefiere overlay_text guardado');
t(/SELECT id, caption, scheduled_for, scheduled_at, status, media_type, needs_review, overlay_text FROM posts/.test(srv), 'chat SELECT trae overlay_text');
t(srv.includes("overlay: String(r.overlay_text || '')"), 'chat mapa lleva overlay');
t(gen.includes('[texto en la foto:'), 'chatIdea muestra texto en la foto');
t(gen.includes('agregá "overlay" con el texto nuevo exacto'), 'chatIdea guía overlay');
t(gen.includes("if (typeof j.overlay === 'string')"), 'parseEditBlock acepta overlay');
t(srv.includes('overlayEdits'), 'chat junta overlayEdits');
t(srv.includes('DESPUÉS de cualquier regeneración'), 'chat aplica overlay tras regen');
t(srv.includes('overlay_text = ? WHERE id = ?'), 'revert restaura overlay_text');

// ---------- 5. UI: línea propia en detalle y aprobación ----------
t(app.includes('hf-d-overlay'), 'detalle: línea hf-d-overlay');
t(app.includes('apv-overlay'), 'aprobación: línea apv-overlay');
t(app.includes('Texto en la foto') && app.includes('Text on the photo'), 'línea overlay ES/EN');
t(css.includes('.hf-d-overlay,.apv-overlay'), 'styles regla overlay');

// ---------- 2b. Gate en albumPropuesta (BLOQUEANTE de esta liberación) ----------
const propStart = srv.indexOf('async function albumPropuesta');
const propBody = srv.slice(propStart, srv.indexOf('// ---------- (Gap 2', propStart));
t(propBody.includes('ensurePhotoVision'), 'propuesta: captura visión del modelo antes de generar');
t(propBody.includes('photoVision') && propBody.includes('photoTag'), 'propuesta: visión viaja al input');
t(propBody.includes('groundingGate'), 'propuesta: gate foto↔texto');
t(propBody.includes('foto-promo-desajuste'), 'propuesta: reintento en desajuste promo');
t(propBody.includes('gated: true'), 'propuesta: gate fallido devuelve gated:true');
t(propBody.includes('gateNote'), 'propuesta: descripción del dueño cubre solo sin-visión');
t(gen.includes('input.feedback || null'), 'generateContent: feedback inicial del llamador (reintento del gate)');
t((app.match(/r\.gated/g) || []).length >= 3, 'cliente: 3 ramas gated en propuesta (IrAPropuesta/OtraVersion/PedirCambio)');
t(app.includes('no muestra tu producto'), 'cliente: mensaje honesto promo ES');
t(app.includes("doesn't show your product"), 'cliente: mensaje honesto promo EN');
t(app.includes('no me dice nada claro'), 'cliente: mensaje honesto sin-visión ES');

// ---------- 6. Invariantes que NO se tocan ----------
t(app.includes('hfWhenChip'), 'hfWhenChip intacto');
t(g.groundingGate({ tag: 'otro', visionNote: 'atardecer en la plaza', caption: 'Tardes así' }).ok === true, 'gate: foto ajena + caption no promo -> permitido (solo se bloquea la promo)');
t(app.includes('pzGoBack'), 'navegación intacta (sanidad)');

console.log(`lotecontenidofoto: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
