// level-boosts.js — Niveles que se sienten.
//
// Los desbloqueos del nivel de conocimiento de Posty (posty-level.js) cambian
// REALMENTE el payload que recibe el modelo, en todos los caminos de generación.
// Antes, los textos de niveles prometían cosas que el generador ignoraba
// (promesa vacía). Decisión del dueño: cablear, no bajar la promesa.
//
// Contrato:
//   applyLevelBoosts(db, userId, level, kind, payload)
//     kind:    'image' | 'caption' | 'ideas' | 'chat'
//     payload: objeto plano que viaja al generador (input de generator.js o
//              brief de imagen de conceptShotGenerate / /api/image-brief)
//     level:   1..5 (el llamador lo calcula con postyLevel; el harness lo fuerza)
//   Devuelve { payload, applied }:
//     - payload: NUEVO objeto. En nivel 1 es byte-idéntico al original (baseline).
//     - applied: [{ boost, level, detail }] — qué se activó (logs + harness).
//
// Boosts (estrictamente aditivos: nunca quitan comportamiento del baseline):
//   N1: nada — el payload sale idéntico al de hoy.
//   N2: las fotos reales del cliente tienen prioridad como referencia/input en
//       la generación de imágenes (no solo banco genérico).
//   N3: las reglas de gusto y el bloque NUNCA: se inyectan con peso fuerte como
//       bloque OBLIGATORIO (no sugerencia): reemplazan la formulación suave.
//   N4: Style Lock visual + Caption Style Lock activos y verificados en cada
//       generación: si el perfil existe se usa, y se agrega la instrucción de
//       verificación (si la generación lo ignora, el retry la corrige — en
//       imágenes, el brand-check post-generación ya regenera hasta 2 veces).
//   N5: hereda todo lo de N4 (sus desbloqueos son proactividad, no payload).
//
// Nunca lanza: ante cualquier falla de lectura devuelve el payload sin boosts.

const { getVisualStyle, visualStyleBlock } = require('./style-visual');
const { getCaptionStyle, captionStyleBlock } = require('./caption-style');

const KIND_IMAGE = 'image';
const KIND_CAPTION = 'caption';
const KIND_IDEAS = 'ideas';
const KIND_CHAT = 'chat';

function clampLevel(level) {
  const n = parseInt(level, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, n));
}

function activeStyleRules(db, userId) {
  try {
    return db.prepare('SELECT rule_key, rule_text FROM style_rules WHERE user_id = ? AND active = 1 ORDER BY rule_key ASC')
      .all(userId)
      .map((r) => ({ rule_key: String(r.rule_key || ''), rule_text: String(r.rule_text || '').trim() }))
      .filter((r) => r.rule_text);
  } catch (e) { return []; }
}

// Fotos reales del cliente (assets kind='photo', las más nuevas primero).
// Devuelve file_path tal como están guardados; el llamador los mapea a disco.
function realPhotoPaths(db, userId, limit = 2) {
  try {
    return db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'photo' ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(userId, limit)
      .map((r) => String(r.file_path || '').trim())
      .filter(Boolean);
  } catch (e) { return []; }
}

// NUNCA: derivadas de cada regla de gusto. Las conocidas tienen su prohibición
// a medida; las dictadas por el cliente se blindan como prohibición literal.
const NUNCA_BY_KEY = {
  sin_emojis: 'NUNCA uses 2 o más emojis en un caption (máximo 1, o ninguno)',
  corto: 'NUNCA escribas captions largos, con vueltas ni relleno: corto y directo',
  con_precios: 'NUNCA omitas el precio o las cuotas cuando el posteo habla de un producto',
};
function nuncaLine(rule) {
  const k = String(rule.rule_key || '').toLowerCase().trim();
  if (NUNCA_BY_KEY[k]) return NUNCA_BY_KEY[k];
  return `NUNCA hagas lo contrario de esta regla: "${rule.rule_text}"`;
}

function buildTasteBlock(rules, kind) {
  const entrega = kind === KIND_IMAGE ? 'tu imagen' : 'tu caption';
  const corrige = kind === KIND_IMAGE ? 'el brief' : 'el texto';
  const lines = [
    'BLOQUE OBLIGATORIO — GUSTO DEL CLIENTE (esto es ley, no sugerencia):',
    ...rules.map((r) => `- ${r.rule_text}`),
    'NUNCA:',
    ...rules.map((r) => `- ${nuncaLine(r)}`),
    `VERIFICACIÓN: antes de entregar ${entrega}, re-leé cada punto de este bloque y chequeá que lo cumplas. Si alguno no se cumple, corregí ${corrige} hasta que sí. Violar este bloque = posteo fallido.`,
  ];
  return lines.join('\n');
}

// Verificación de style locks (N4+): el perfil viaja en el payload por el
// pipeline existente; este bloque ordena verificarlo ANTES de entregar y
// reescribir/regenerar si no se cumple (retry).
function buildStyleLockVerify({ visual, caption }, kind) {
  if (kind === KIND_IMAGE) {
    if (!visual) return '';
    return [
      'STYLE LOCK CHECK: this image must look like it belongs to the client\'s real Instagram feed',
      '(the LÍNEA VISUAL OBLIGATORIA block in the brief above). If anything in this prompt contradicts',
      'the client\'s visual line, the CLIENT\'S VISUAL LINE wins. After generating, verify the visual line',
      'was respected; if it was ignored, the generation failed the style lock and must be retried.',
    ].join(' ');
  }
  if (!caption) return '';
  return [
    'VERIFICACIÓN DE STYLE LOCK (obligatoria antes de entregar): el caption tiene que sonar como el cliente',
    'escribe en su Instagram real (bloque "ESCRIBÍ COMO EL CLIENTE" de este prompt: tono, emojis, largo, CTA,',
    'apertura, persona). Re-leélo antes de cerrar y chequeá cada punto; si alguno no calza, reescribí el caption',
    'hasta que sí. Si ignorás el style lock, el posteo falla.',
  ].join(' ');
}

function photoPriorityLine() {
  return 'FOTOS DEL CLIENTE (reales, de su negocio): son tu referencia visual PRINCIPAL — opiná sobre lo que ves en ellas y usalas como base antes que cualquier idea genérica. Nada de banco de imágenes cuando el cliente ya tiene fotos propias.';
}

function applyLevelBoosts(db, userId, level, kind, payload) {
  const applied = [];
  const L = clampLevel(level);
  const base = (payload && typeof payload === 'object') ? payload : {};
  // N1: baseline idéntico — ni se copia el objeto.
  if (L <= 1) return { payload: base, applied, level: L };
  const out = { ...base };

  // ---- N2: fotos reales del cliente como referencia prioritaria ----
  if (L >= 2) {
    if (kind === KIND_IMAGE) {
      const photos = realPhotoPaths(db, userId, 2);
      if (photos.length) {
        out.photoRefs = photos;
        applied.push({ boost: 'foto-prioridad', level: L, detail: `${photos.length} foto(s) real(es) del cliente como referencia de imagen` });
      }
    } else if (kind === KIND_CHAT) {
      const hasPhotos = (Array.isArray(base.photos) && base.photos.length) || (Array.isArray(base.library) && base.library.length);
      if (hasPhotos) {
        out.photoPriorityLine = photoPriorityLine();
        applied.push({ boost: 'foto-prioridad', level: L, detail: 'línea de prioridad a fotos reales en el contexto del chat' });
      }
    }
  }

  // ---- N3: bloque obligatorio de gusto + NUNCA: (peso fuerte, no sugerencia) ----
  if (L >= 3) {
    const rules = activeStyleRules(db, userId);
    if (rules.length) {
      out.tasteBlock = buildTasteBlock(rules, kind);
      applied.push({ boost: 'gusto-obligatorio', level: L, detail: `${rules.length} regla(s) de gusto como bloque obligatorio + NUNCA:` });
    }
  }

  // ---- N4: style locks activos y verificados ----
  if (L >= 4) {
    let visual = '', caption = '';
    try {
      if (kind === KIND_IMAGE) {
        const vp = getVisualStyle(db, userId);
        visual = visualStyleBlock(vp);
      } else {
        const cp = getCaptionStyle(db, userId);
        caption = captionStyleBlock(cp);
      }
    } catch (e) { /* sin perfil = sin verificación */ }
    const verify = buildStyleLockVerify({ visual: !!visual, caption: !!caption }, kind);
    if (verify) {
      out.styleLockVerify = verify;
      if (kind === KIND_IMAGE) {
        // El perfil visual ya viaja en el brief por el pipeline (visualStyle);
        // el boost deja constancia de que el lock está activo para el retry.
        out.styleLockActive = true;
      } else if (kind === KIND_CAPTION || kind === KIND_CHAT) {
        // El bloque ESCRIBÍ COMO EL CLIENTE ya viaja en captionExtras por el
        // pipeline; la verificación lo hace obligatorio antes de entregar.
        out.captionExtras = String(base.captionExtras || '') + '\n' + verify;
      } else if (kind === KIND_IDEAS) {
        // Las ideas no reciben captionExtras: el lock viaja en su propio campo.
        out.styleLockExtras = (caption ? caption + '\n' : '') + verify;
      }
      applied.push({ boost: 'style-lock-verificado', level: L, detail: kind === KIND_IMAGE ? 'Style Lock visual activo + verificación con retry' : 'Caption Style Lock activo + verificación obligatoria' });
    }
  }

  return { payload: out, applied, level: L };
}

module.exports = { applyLevelBoosts, KIND_IMAGE, KIND_CAPTION, KIND_IDEAS, KIND_CHAT };
