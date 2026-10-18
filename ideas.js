// ideas.js — Loop de ideas semanal de Posty (2026-10-18, v218).
// Lógica PURA de señales: acá no hay DB ni red. Recibe snapshots ya leídos
// (competencia), conteos del propio negocio y efemérides ya filtradas, y
// devuelve CANDIDATOS con su evidencia determinística en español rioplatense.
// Regla de hierro del loop: sin señal real no hay candidato — jamás relleno.
// La redacción final (título + vuelta del porqué) la hace el pase de texto en
// server.js, pero la EVIDENCIA nace acá, calculada, y nunca la inventa el modelo.

// Parsea la lista de competidores desde profiles.competitors (texto libre del
// formulario de perfil: puede venir "@a, @b", "a b" o nombres sueltos).
// Devuelve handles IG válidos (charset de IG), sin duplicados, sin la cuenta
// propia, máximo 5. Los tokens que no parecen un handle se descartan en
// silencio (un nombre con espacios NO es un @ y no se adivina).
function parseCompetitorHandles(raw, ownHandle) {
  const own = String(ownHandle || '').trim().replace(/^@+/, '').toLowerCase();
  const toks = String(raw || '').split(/[\s,;|]+/).filter(Boolean);
  const out = [];
  for (const t of toks) {
    const h = String(t).trim().replace(/^@+/, '').toLowerCase();
    if (!/^[a-z0-9._]{2,40}$/.test(h)) continue;
    if (h.startsWith('.') || h.endsWith('.')) continue;
    if (own && h === own) continue;
    if (!out.includes(h)) out.push(h);
    if (out.length >= 5) break;
  }
  return out;
}

// Forma canónica para guardar en profiles.competitors desde la UI del loop.
function canonicalCompetitors(handles) {
  return (handles || []).map((h) => '@' + h).join(', ');
}

// Snapshot liviano de un competidor a partir de la salida de
// feedAudit.fetchAuditData + computeSignals (eso lo arma server.js).
function snapshotFromAudit(data, signals) {
  if (!data || !data.ok || !data.profile) return null;
  const posts = (data.posts || []).map((p) => ({
    type: p.type || '',
    comments: typeof p.comments === 'number' ? p.comments : null,
    caption_first: String(p.caption || '').split('\n')[0].trim().slice(0, 110),
    taken_at: p.taken_at || null,
    shortcode: p.shortcode || '',
  }));
  const top = posts.filter((p) => p.comments !== null)
    .sort((a, b) => (b.comments || 0) - (a.comments || 0)).slice(0, 4);
  return {
    handle: data.profile.handle,
    followers: data.profile.followers,
    posts_count: data.profile.posts_count,
    category: data.profile.category || '',
    signals: signals || null,
    posts,
    top,
  };
}

const FMT_LABEL = { video: ['videos/reels', 'un reel'], carousel: ['carruseles', 'un carrusel'], image: ['fotos', 'una foto'] };
const TYPE_TO_FMT = { GraphVideo: 'video', GraphSidecar: 'carousel', GraphImage: 'image' };
const MEDIA_TO_FMT = { video: 'reel', carousel: 'carrusel', image: 'post', story: 'post' };

function fmtOfType(t) { return TYPE_TO_FMT[t] || 'image'; }
function fmtLabel(fmt) { return (MEDIA_TO_FMT[fmt === 'video' ? 'video' : fmt === 'carousel' ? 'carousel' : 'image']) || 'post'; }

// ---------------------------------------------------------------------------
// buildIdeaSignals(input) → [candidatos] en orden de prioridad.
// input = {
//   competitors: [snapshot...],
//   ownFormats30: { image:n, video:n, carousel:n },   // publicados últimos 30 días
//   ownWinner: { id, caption_first, likes, comments, media_type, tipo } | null,
//   ephemeris: [{ name, emoji, angle, date, daysLeft }], // ya filtradas por rubro
// }
// Cada candidato: { source, angle_key, format, evidence, facts }
// ---------------------------------------------------------------------------
function buildIdeaSignals(input) {
  const out = [];
  const comps = (input && input.competitors || []).filter(Boolean);
  const own = (input && input.ownFormats30) || { image: 0, video: 0, carousel: 0 };

  // --- Señal 1: el posteo top de la competencia (prueba social más fuerte) ---
  let bestTop = null;
  for (const c of comps) {
    const t = (c.top || [])[0];
    if (!t || !t.caption_first) continue;
    if (!bestTop || (t.comments || 0) > (bestTop.post.comments || 0)) bestTop = { comp: c, post: t };
  }
  if (bestTop && (bestTop.post.comments || 0) >= 3) {
    const fmt = fmtOfType(bestTop.post.type);
    out.push({
      source: 'competitor',
      angle_key: `comp_top:${bestTop.comp.handle}:${bestTop.post.shortcode || bestTop.post.caption_first.slice(0, 24)}`,
      format: fmtLabel(fmt),
      evidence: `El posteo con más comentarios de @${bestTop.comp.handle} (${bestTop.post.comments} 💬) fue «${bestTop.post.caption_first}» — un ángulo que en tu rubro funciona y vos todavía no probaste`,
      facts: { handle: bestTop.comp.handle, comments: bestTop.post.comments, caption_first: bestTop.post.caption_first, fmt },
    });
  }

  // --- Señal 2: hueco de formato frente a la competencia ---
  // Un formato que la competencia usa en serio (≥1/3 de sus posteos o su top es
  // de ese formato) y el cliente no publicó en los últimos 30 días.
  for (const fmt of ['video', 'carousel']) {
    if ((own[fmt] || 0) > 0) continue;
    let best = null;
    for (const c of comps) {
      const posts = c.posts || [];
      if (posts.length < 4) continue;
      const nFmt = posts.filter((p) => fmtOfType(p.type) === fmt).length;
      const share = nFmt / posts.length;
      const topIsFmt = (c.top || [])[0] && fmtOfType(c.top[0].type) === fmt;
      if (share < 0.34 && !topIsFmt) continue;
      const topFmt = (c.top || []).filter((p) => fmtOfType(p.type) === fmt)[0];
      const cand = { comp: c, nFmt, total: posts.length, topFmt };
      if (!best || nFmt > best.nFmt) best = cand;
    }
    if (best) {
      const [plural, sing] = FMT_LABEL[fmt];
      const topTxt = best.topFmt && best.topFmt.comments !== null
        ? ` y su posteo con más comentarios (${best.topFmt.comments} 💬) fue ${sing}` : '';
      out.push({
        source: 'competitor',
        angle_key: `comp_fmt:${fmt}:${best.comp.handle}`,
        format: fmtLabel(fmt),
        evidence: `@${best.comp.handle} publicó ${best.nFmt} ${plural} en sus últimos ${best.total} posteos${topTxt}; vos no publicaste ${plural} en el último mes`,
        facts: { handle: best.comp.handle, fmt, n: best.nFmt, total: best.total },
      });
      break; // un solo hueco de formato por semana: el más fuerte
    }
  }

  // --- Señal 3: su propio ganador, con una vuelta nueva ---
  const w = input && input.ownWinner;
  if (w && ((w.likes || 0) + 3 * (w.comments || 0)) >= 4 && w.caption_first) {
    out.push({
      source: 'winner',
      angle_key: `winner:${w.id}`,
      format: MEDIA_TO_FMT[w.media_type] || 'post',
      evidence: `Tu posteo «${String(w.caption_first).slice(0, 60)}…» fue el que más respuesta tuvo en el último tiempo (${w.likes || 0} ❤️ · ${w.comments || 0} 💬): esa fórmula funciona, la repetimos con una vuelta nueva`,
      facts: { post_id: w.id, likes: w.likes || 0, comments: w.comments || 0, tipo: w.tipo || '' },
    });
  }

  // --- Señal 4: el calendario (efeméride del rubro dentro de ~21 días) ---
  const eph = (input && input.ephemeris || [])[0];
  if (eph && eph.name) {
    const when = eph.daysLeft === 0 ? 'es HOY' : eph.daysLeft === 1 ? 'es mañana' : `es en ${eph.daysLeft} días`;
    out.push({
      source: 'calendar',
      angle_key: `eph:${eph.date}:${String(eph.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
      format: 'post',
      evidence: `${eph.emoji || '📅'} ${eph.name} ${when} (${eph.date}): ${eph.angle} — si lo preparamos ahora, llegás con el posteo listo y no a las corridas`,
      facts: { name: eph.name, date: eph.date, daysLeft: eph.daysLeft, angle: eph.angle },
    });
  }

  return out;
}

// Interpreta la salida del pase de texto (gpt-4o-mini) contra las señales.
// Verificado en producción (2026-10-18): el modelo devolvió las 3 ideas SIN
// el campo "signal" y el loop se salteaba la semana entera en silencio.
// Mapeo robusto: el campo signal válido manda; si falta o no sirve, la
// idea i va a la señal i (el modelo responde en el orden de las señales).
// El porqué SIEMPRE queda anclado a la evidencia: si no cita un @, un
// número o una fecha, el código anexa la evidencia calculada.
function pickIdeas(parsed, signals) {
  const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.ideas) ? parsed.ideas : []);
  const sigs = Array.isArray(signals) ? signals : [];
  const out = [];
  const used = new Set();
  list.forEach((it, pos) => {
    if (!it || typeof it !== 'object') return;
    let idx = (parseInt(it.signal, 10) || 0) - 1;
    if (idx < 0 || idx >= sigs.length || used.has(idx)) idx = pos;
    if (idx < 0 || idx >= sigs.length || used.has(idx)) return;
    const s = sigs[idx];
    const title = String(it.title || '').trim().slice(0, 90);
    if (!title) return;
    let why = String(it.why || '').trim();
    const anchored = why && (/@[a-z0-9._]/i.test(why) || /[0-9]/.test(why));
    if (!anchored) why = (why ? why.replace(/[. ]+$/, '') + ' — ' : '') + s.evidence;
    why = String(why).slice(0, 320);
    const format = ['post', 'reel', 'carrusel'].includes(it.format) ? it.format : s.format;
    const brief = String(it.brief || '').trim().slice(0, 400) || title;
    used.add(idx);
    out.push({ signal: s, title, why, format, brief });
  });
  return out.slice(0, 3);
}

// Memoria de ángulos: dado el historial reciente del usuario (filas de
// posty_ideas), devuelve el Set de angle_key que NO hay que reproponer:
// descartados/hechos en 42 días, propuestos (pending/expired) en 21 días.
function blockedAngleKeys(history, nowMs) {
  const blocked = new Set();
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  for (const r of history || []) {
    if (!r || !r.angle_key) continue;
    const created = new Date(String(r.created_at || '').replace(' ', 'T') + 'Z').getTime();
    if (!Number.isFinite(created)) continue;
    const ageDays = (now - created) / 86400000;
    if ((r.status === 'dismissed' || r.status === 'made') && ageDays <= 42) blocked.add(r.angle_key);
    else if ((r.status === 'pending' || r.status === 'expired') && ageDays <= 21) blocked.add(r.angle_key);
  }
  return blocked;
}

module.exports = { parseCompetitorHandles, canonicalCompetitors, snapshotFromAudit, buildIdeaSignals, blockedAngleKeys, fmtLabel, pickIdeas };
