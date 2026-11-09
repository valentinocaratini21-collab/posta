/* chunk-conserje.js — Lazy chunk de Posty.
 * Se carga bajo demanda vía loadChunk('conserje') desde app.js (NO va con <script> en index.html).
 * Es un <script> clásico: comparte el scope global con app.js; las funciones declaradas
 * acá quedan disponibles como globales una vez cargado el chunk.
 * REGLA: no agregar top-level let/const/var con nombres que ya existan en app.js u otro chunk
 * (duplicar un let/const entre scripts clásicos es SyntaxError).
 * Versión del archivo: ?v=PLACEHOLDER — la reemplaza el coordinador al armar el zip.
 */

/* ---------- 🧑‍💼 Conserje — la revisión de la noche (solo el dueño) ---------- */
// Ruta #/app/conserje. Gate: token de admin (el mismo ADMIN_TOKEN del servidor).
// Valentino + Posty revisan juntos, DE NOCHE (19:00–00:00), los posteos DEL
// DÍA SIGUIENTE y deciden qué posteo va en cada perfil. La revisión es una
// capa extra del dueño: nunca publica por sí sola y nunca veta el ritual
// del cliente de las 9:00. La ficha de cada cliente está en su detalle,
// ahí mismo donde se decide.
var conserjeEstado = { datos: null, vistaId: null, notaGuardada: null };
// (v849) Deep link de la push de cambio de posteo: #/app/conserje?user=<uid>
// abre el detalle de ese cliente. Parser puro: 0 si no hay ?user= válido.
// Un uid que no está en la revisión de esa noche no abre nada (fail-soft:
// vistaId se resetea al cargar y el conserje cae en la lista).
function conserjeUserFromHash(hash) {
  try {
    const h = String(hash || '');
    const q = h.split('?')[1] || '';
    const m = q.split('&').find((p) => p.split('=')[0] === 'user');
    if (!m) return 0;
    const n = Number(decodeURIComponent(m.split('=')[1] || ''));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch (e) { return 0; }
}

// Etiqueta corta para mostrar una decisión ya tomada (solo presentación:
// la decisión guardada sigue siendo 'sale'/'arreglar'/'no_sale'/'pedir').
function conserjeEtiquetaCorta(dec) {
  const d = typeof dec === 'string' ? dec : (dec && dec.decision) || '';
  if (d === 'arreglar') return 'A arreglar';
  if (d === 'sale') return 'Sale así';
  if (d === 'no_sale') return 'No sale';
  if (d === 'pedir') return 'Posty lo arma';
  if (d === 'retenido') return 'Retenido';
  return (dec && dec.etiqueta) || d || '';
}

// Conteo local de la noche: TODOS los clientes de la revisión cuentan,
// también los sin posteo (el resumen del servidor solo cuenta los que
// tienen posteo). Es solo presentación; los endpoints no cambian.
function conserjeConteo(d) {
  const todos = d ? (d.items || []).concat(d.sin_posteo || []) : [];
  const decididos = todos.filter((i) => i.decision).length;
  return { total: todos.length, decididos, todo: todos.length > 0 && decididos === todos.length };
}

// Siguiente cliente pendiente: el siguiente sin decidir DESPUÉS del
// actual en el orden de la lista (atención primero, después el resto,
// después los sin posteo); si no hay ninguno después, el primer pendiente
// de la lista. null si no queda ninguno. Así la revisión se camina de
// arriba abajo sin volver a la lista a buscar el siguiente.
function conserjeSiguientePendiente(d, uidActual) {
  const todos = d ? (d.items || []).concat(d.sin_posteo || []) : [];
  const idx = todos.findIndex((i) => String(i.user_id) === String(uidActual));
  for (let k = idx + 1; k < todos.length; k++) { if (!todos[k].decision) return todos[k]; }
  for (let k = 0; k < todos.length; k++) { if (!todos[k].decision && String(todos[k].user_id) !== String(uidActual)) return todos[k]; }
  return null;
}

function conserjeFechaLinda(fecha) {
  try {
    const d = new Date(String(fecha || '') + 'T12:00:00');
    if (isNaN(d)) return String(fecha || '');
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return dias[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  } catch (e) { return String(fecha || ''); }
}

function conserjeEtapaDot(etapa) {
  const e = etapa || {};
  const color = e.color === 'rojo' ? '#d64545' : (e.color === 'amarillo' ? '#e8a100' : '#22a06b');
  const label = e.etiqueta || '';
  return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--mut)">'
    + '<span style="width:9px;height:9px;border-radius:50%;background:' + color + ';display:inline-block"></span>'
    + esc(label) + '</span>';
}

function conserjeFotoHTML(it, grande) {
  const url = it && it.post && it.post.image_url ? it.post.image_url : '';
  const h = grande ? 240 : 180;
  if (url) {
    return '<div style="border-radius:14px;overflow:hidden;background:#0A1E33"><img src="' + esc(url) + '" alt="" style="width:100%;height:' + h + 'px;object-fit:cover;display:block"></div>';
  }
  const ini = String((it && it.business_name) || '?').trim().charAt(0).toUpperCase() || '?';
  return '<div style="border-radius:14px;background:#2793C8;display:flex;align-items:center;justify-content:center;height:' + h + 'px;color:#fff;font-size:44px;font-weight:800">' + esc(ini) + '</div>';
}

function conserjeFichaHTML(f) {
  if (!f || !f.ok) return '';
  const v = f.vende || {};
  const g = f.gusta || {};
  const et = f.etapa || {};
  const est = f.estrategia || {};
  const pp = f.proximo_paso || {};
  const nota = f.nota || {};
  const falta = (f.faltantes || []).length ? '<p style="color:var(--mut);font-size:12px;margin:8px 0 0">Sin registrar todavía: ' + esc(f.faltantes.join(', ').replace(/_/g, ' ')) + '.</p>' : '';
  const paleta = (f.paleta || []).map((p) => '<span title="' + esc(p.hex) + '" style="display:inline-block;width:22px;height:22px;border-radius:7px;background:' + esc(p.hex) + ';border:1px solid var(--line);margin-right:6px"></span>').join('');
  const hist = (f.historial || []).map((h) => '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px"><span>' + esc(h.etiqueta) + (h.nota ? ' — ' + esc(h.nota) : '') + '</span><span style="color:var(--mut);white-space:nowrap">' + esc(String(h.fecha_posteo || '').slice(5)) + '</span></div>').join('');
  return '<div class="card" style="padding:16px;margin-top:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="font-size:16px;font-weight:800">Ficha de ' + esc(f.business_name || '') + '</div>' + conserjeEtapaDot(et) + '</div>'
    + '<div style="font-size:13.5px;line-height:1.55;margin-top:8px">'
    + '<div><b>Lo que vende:</b> ' + esc(v.estrella || 'Sin estrella registrada') + (v.rubro ? ' · ' + esc(v.rubro) : '') + '</div>'
    + ((v.productos || []).length ? '<div style="color:var(--mut)">También: ' + esc(v.productos.join(' · ')) + '</div>' : '')
    + (v.diferencial ? '<div style="color:var(--mut)">Diferencial: ' + esc(v.diferencial) + '</div>' : '')
    + (v.objetivo ? '<div style="color:var(--mut)">Quiere: ' + esc(v.objetivo) + '</div>' : '')
    + '<div style="margin-top:8px"><b>Le gusta:</b> ' + esc(g.tono || 'Sin tono registrado') + '</div>'
    + ((g.gustos || []).length ? '<div style="color:var(--mut)">' + esc(g.gustos.join(' · ')) + '</div>' : '')
    + ((g.pidio_cambiar || []).length ? '<div style="color:var(--mut)">Pidió cambiar: ' + esc(g.pidio_cambiar.join(' · ')) + '</div>' : '')
    + '<div style="margin-top:8px"><b>Líneas rojas:</b> ' + ((f.lineas_rojas || []).length ? esc(f.lineas_rojas.join(' · ')) : 'Sin líneas rojas registradas') + '</div>'
    + (paleta ? '<div style="margin-top:8px"><b>Paleta:</b><br>' + paleta + '</div>' : '')
    + '<div style="margin-top:8px"><b>Plan:</b> ' + esc((f.plan && f.plan.plan) || '') + ' · ' + esc((f.plan && f.plan.plan_status) || '') + ' · cliente desde ' + esc((f.plan && f.plan.desde) || '') + '</div>'
    + '<div style="margin-top:8px"><b>Estrategia:</b> ' + (est.linea ? esc(est.linea) : 'Sin estrategia registrada todavía') + '</div>'
    + '<div style="margin-top:4px"><b>Próximo paso:</b> ' + esc(pp.texto || '') + '</div>'
    + '</div>'
    + (hist ? '<div style="margin-top:12px"><div style="font-weight:800;font-size:13.5px">Decisiones de cada noche</div>' + hist + '</div>'
      : '<p style="color:var(--mut);font-size:12.5px;margin:10px 0 0">Todavía no hay decisiones de noche registradas para este cliente.</p>')
    + '<div style="margin-top:12px"><label style="font-size:13px;font-weight:700" for="cjNota">Tu nota (solo vos la ves, una línea)</label>'
    + '<div style="display:flex;gap:8px;margin-top:6px"><input id="cjNota" type="text" maxlength="200" placeholder="Algo que solo vos sabés de este cliente…" value="' + esc(nota.texto || '') + '" style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid var(--line);font-size:14px">'
    + '<button class="btn btn-secondary" data-cj="nota-guardar" data-user="' + esc(String(f.user_id)) + '">Guardar</button></div>'
    + '<div id="cjNotaMsg" style="font-size:12.5px;color:#14743f;font-weight:700;margin-top:4px">' + (conserjeEstado.notaGuardada === String(f.user_id) ? 'Guardada ✓' : '') + '</div></div>'
    + falta
    + '</div>';
}

function conserjeCardHTML(it) {
  const p = it.post;
  const dec = it.decision;
  // La píldora vive ENCIMA de la foto (arriba a la derecha): el estado se
  // lee de un vistazo sin bajar la vista. Colores Posty exactos.
  const pillTxt = dec ? conserjeEtiquetaCorta(dec)
    : (it.necesita_atencion ? '⚠ Necesita atención' : '✓ Listo');
  const pillBg = dec ? 'background:#2793C8;color:#fff'
    : (it.necesita_atencion ? 'background:#FEC14D;color:#0A1E33' : 'background:#e7f6ee;color:#14743f');
  return '<div class="card" style="padding:14px;cursor:pointer" data-cj="ver" data-user="' + esc(String(it.user_id)) + '">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="font-weight:800;font-size:15px">' + esc(it.business_name || '') + '</div>' + conserjeEtapaDot(it.ficha && it.ficha.etapa) + '</div>'
    + '<div class="cj-foto" style="position:relative;margin-top:10px">' + conserjeFotoHTML(it, false)
    + '<span class="pill" style="position:absolute;top:10px;right:10px;margin:0;box-shadow:0 2px 10px rgba(10,30,51,.28);' + pillBg + '">' + esc(pillTxt) + '</span></div>'
    + '<div style="font-size:14px;font-weight:700;margin-top:10px;line-height:1.35">' + esc(p ? p.titulo : 'Sin posteo para mañana') + '</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px"><span style="font-size:12.5px;color:var(--mut)">' + esc(p && p.cuando ? p.cuando : 'Mañana · hora por confirmar') + '</span>' + (dec && dec.nota ? '<span style="font-size:12.5px;color:var(--mut);text-align:right">' + esc(String(dec.nota).slice(0, 90)) + '</span>' : '') + '</div>'
    + (it.necesita_atencion && it.motivo_atencion ? '<div style="font-size:12.5px;color:#8a6d00;margin-top:6px">' + esc(it.motivo_atencion) + '</div>' : '')
    + '</div>';
}

function conserjeDetalleHTML(it, d) {
  const p = it.post;
  const dec = it.decision;
  const f = it.ficha || {};
  const ig = it.ig_username ? '<a href="https://instagram.com/' + esc(it.ig_username) + '" target="_blank" rel="noopener" style="font-size:13.5px">Ver el feed de ' + esc(it.business_name) + ' →</a>' : '';
  const sig = it.siguiente ? '<div class="card" style="padding:14px;margin-top:12px"><div style="font-size:13px;color:var(--mut)">Siguiente posteo</div><div style="font-weight:700;margin-top:2px">' + esc(it.siguiente.titulo) + '</div><div style="font-size:12.5px;color:var(--mut)">' + esc(it.siguiente.scheduled_at || '') + '</div></div>' : '';
  let botones = '';
  if (p) {
    // Un toque por decisión, sin confirmaciones: los botones son grandes
    // (52 px) y van justo después del posteo, sin bajar a buscarlos.
    botones = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">'
      + '<button class="btn btn-primary" style="min-height:52px;font-size:16px" data-cj="decidir" data-decision="sale" data-user="' + esc(String(it.user_id)) + '" data-post="' + esc(String(p.id)) + '" data-fecha="' + esc(d.fecha) + '">✓ Sale así</button>'
      + '<button class="btn btn-secondary" style="min-height:52px;font-size:16px" data-cj="arreglar" data-user="' + esc(String(it.user_id)) + '">Pedir que lo arregle</button>'
      + '<button class="btn btn-secondary" style="min-height:52px;font-size:16px" data-cj="decidir" data-decision="no_sale" data-user="' + esc(String(it.user_id)) + '" data-post="' + esc(String(p.id)) + '" data-fecha="' + esc(d.fecha) + '">✕ No sale</button>'
      + '</div>'
      + '<div id="cjArreglo" style="display:none;margin-top:12px"><label style="font-size:13px;font-weight:700" for="cjArregloNota">Qué hay que arreglar</label>'
      + '<textarea id="cjArregloNota" rows="2" placeholder="Ej.: que no hable del precio, que el producto se vea entero" style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--line);font-size:14px;margin-top:6px"></textarea>'
      + '<button class="btn btn-primary" style="margin-top:8px;min-height:48px;font-size:15px" data-cj="decidir" data-decision="arreglar" data-user="' + esc(String(it.user_id)) + '" data-post="' + esc(String(p.id)) + '" data-fecha="' + esc(d.fecha) + '" data-nota="1">Enviar arreglo</button></div>';
  } else {
    botones = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">'
      + '<button class="btn btn-primary" style="min-height:52px;font-size:16px" data-cj="armar" data-user="' + esc(String(it.user_id)) + '" data-fecha="' + esc(d.fecha) + '">Posty lo arma</button></div>';
  }
  const conteoDet = conserjeConteo(d);
  return '<button class="btn btn-secondary" data-cj="volver" style="margin-bottom:12px">← Volver a la revisión</button>'
    + '<div style="font-size:20px;font-weight:800">' + esc(it.business_name || '') + '</div>'
    + '<div style="margin-top:4px">' + conserjeEtapaDot(f.etapa) + '</div>'
    + '<div style="font-size:13px;color:var(--mut);margin-top:6px">' + conteoDet.decididos + ' de ' + conteoDet.total + ' revisados</div>'
    + '<div style="margin-top:12px">' + conserjeFotoHTML(it, true) + '</div>'
    + (p ? '<div style="font-size:17px;font-weight:800;margin-top:12px;line-height:1.35">' + esc(p.titulo) + '</div>'
      + '<div style="font-size:13px;color:var(--mut);margin-top:4px">' + esc(p.cuando || 'Mañana · hora por confirmar') + (p.tipo ? ' · ' + esc(p.tipo) : '') + '</div>'
      + (p.status === 'draft' ? '<div style="font-size:13px;color:var(--mut);margin-top:2px">Propuesta · todavía no está programada</div>' : '')
      // El dueño ve el posteo COMPLETO (caption incluido) aunque para el
      // cliente siga oculto/velado: sin el texto no se puede decidir.
      + (p.caption ? '<div class="card" style="padding:14px;margin-top:12px"><div style="font-size:12px;font-weight:800;color:var(--mut)">TEXTO DEL POSTEO</div><div style="font-size:14px;line-height:1.6;margin-top:6px;white-space:pre-wrap">' + esc(p.caption) + '</div></div>' : '') : '')
    + (it.necesita_atencion && it.motivo_atencion ? '<div class="card" style="padding:14px;margin-top:12px;background:#FFF6D6;border:1px solid #FEC14D"><div style="font-weight:800;font-size:14px">⚠ Qué pasó</div><div style="font-size:13.5px;line-height:1.55;margin-top:4px">' + esc(it.motivo_atencion) + '</div><div style="font-size:12.5px;color:var(--mut);margin-top:6px">No sale hasta que lo revises.</div></div>' : '')
    + (dec ? '<div class="card" style="padding:14px;margin-top:12px"><div style="font-size:13.5px">Ya decidiste: <b>' + esc(conserjeEtiquetaCorta(dec)) + '</b>' + (dec.nota ? ' — ' + esc(dec.nota) : '') + '</div><div style="font-size:12.5px;color:var(--mut)">Podés cambiarlo: elegí de nuevo abajo.</div></div>' : '')
    + botones
    + '<div style="margin-top:12px"><button class="btn btn-secondary" data-cj="chat" data-user="' + esc(String(it.user_id)) + '">💬 Ver el chat con Posty</button><div id="cjChat" style="margin-top:12px"></div></div>'
    + '<div style="margin-top:12px">' + ig + '</div>'
    + conserjeFichaHTML(f)
    + sig;
}

function conserjeRender() {
  const card = $('#conserjeCard');
  if (!card) return;
  const d = conserjeEstado.datos;
  if (!d || !d.ok) {
    card.innerHTML = '<div class="d">No se pudo cargar la revisión. Probá de nuevo.</div>';
    return;
  }
  const r = d.resumen || {};
  const ventana = d.ventana || {};
  const fechaTxt = conserjeFechaLinda(d.fecha);
  if (conserjeEstado.vistaId) {
    const it = (d.items || []).concat(d.sin_posteo || []).find((x) => String(x.user_id) === String(conserjeEstado.vistaId));
    if (it) { card.innerHTML = conserjeDetalleHTML(it, d); return; }
    conserjeEstado.vistaId = null;
  }
  const atencion = (d.items || []).filter((i) => i.necesita_atencion);
  const resto = (d.items || []).filter((i) => !i.necesita_atencion);
  const sinPosteo = d.sin_posteo || [];
  const estadoVentana = ventana.estado === 'abierta' ? 'Abierta ahora · ' + esc(ventana.ahora || '') : 'Abre a las 19:00';
  // El conteo es local: cuenta TODOS los clientes (también los sin
  // posteo), como en el mock aprobado. La barra crece con cada decisión.
  const conteo = conserjeConteo(d);
  const pct = conteo.total ? Math.round((conteo.decididos / conteo.total) * 100) : 0;
  let html = '<div class="card" style="padding:16px"><div style="font-size:15px;font-weight:800">Revisión de la noche · ' + esc(fechaTxt) + '</div>'
    + '<div style="font-size:13.5px;color:var(--mut);margin-top:4px">19:00–00:00 · ' + estadoVentana + '</div>'
    + '<div style="font-size:13.5px;font-weight:700;margin-top:10px">' + conteo.decididos + ' de ' + conteo.total + ' revisados</div>'
    + '<div class="cj-progreso" style="height:8px;border-radius:999px;background:#E2EDF5;margin-top:6px;overflow:hidden"><div style="width:' + pct + '%;height:100%;border-radius:999px;background:#2793C8"></div></div>'
    + '<div style="font-size:13.5px;margin-top:8px">Mañana salen ' + esc(String(r.total || 0)) + ' posteos' + (r.necesitan_atencion ? ' · ' + esc(String(r.necesitan_atencion)) + ' necesitan atención' : ' · ninguno necesita atención') + '</div>'
    + (conteo.todo ? '<div style="font-size:14px;font-weight:800;color:#14743f;margin-top:8px">✓ Todo decidido — la noche está cerrada</div>' : '')
    + '</div>';
  if (!d.items.length && !sinPosteo.length) {
    html += '<div class="card" style="padding:18px;margin-top:12px"><p style="font-size:14px;line-height:1.6">Nada para revisar esta noche: no hay clientes con posteo para mañana.</p></div>';
  }
  if (atencion.length) {
    html += '<div style="font-size:14px;font-weight:800;margin:16px 0 8px">⚠ Necesitan atención primero</div><div class="cj-lista">' + atencion.map(conserjeCardHTML).join('') + '</div>';
  }
  if (resto.length) {
    html += '<div style="font-size:14px;font-weight:800;margin:16px 0 8px">Listos</div><div class="cj-lista">' + resto.map(conserjeCardHTML).join('') + '</div>';
  }
  if (sinPosteo.length) {
    html += '<div style="font-size:14px;font-weight:800;margin:16px 0 8px">Sin posteo para mañana</div><div class="cj-lista">'
      + sinPosteo.map((it) => {
        // Un cliente ya decidido (p. ej. "No sale", cuyo posteo rechazado
        // ya no está en la cola) muestra su decisión, no "Posty lo arma".
        const decTxt = it.decision ? conserjeEtiquetaCorta(it.decision) : '';
        return '<div class="card" style="padding:14px;cursor:pointer" data-cj="ver" data-user="' + esc(String(it.user_id)) + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="font-weight:800;font-size:15px">' + esc(it.business_name || '') + '</div>' + conserjeEtapaDot(it.ficha && it.ficha.etapa) + '</div>'
        + '<div style="font-size:13.5px;color:var(--mut);margin-top:8px">No tiene posteo programado para mañana.</div>'
        + (it.decision
          ? '<div style="margin-top:8px"><span class="pill" style="background:#2793C8;color:#fff;margin:0">' + esc(decTxt) + '</span>' + (it.decision.nota ? '<span style="font-size:12.5px;color:var(--mut);margin-left:8px">' + esc(String(it.decision.nota).slice(0, 90)) + '</span>' : '') + '</div>'
          : '<div style="font-size:13.5px;margin-top:8px;font-weight:700">Posty lo arma →</div>')
        + '</div>';
      }).join('') + '</div>';
  }
  html += '<style>@media (min-width:720px){.cj-lista{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cj-lista .card{margin:0}}</style>';
  card.innerHTML = html;
}

async function conserjeCargar() {
  const card = $('#conserjeCard');
  if (card) card.innerHTML = '<div class="d">⏳ Cargando…</div>';
  if (typeof adminApi !== 'function') {
    if (card) card.innerHTML = '<div class="d">No se pudo cargar el conserje. Probá de nuevo.</div>';
    return;
  }
  try {
    const d = await adminApi('support/conserje/revision', 'GET');
    conserjeEstado.datos = d;
    conserjeRender();
  } catch (e) {
    if (e && e.adminAuthFailed) return;
    if (card) card.innerHTML = '<div class="d">No se pudo cargar la revisión. Probá de nuevo.</div>';
  }
}

async function conserjeView() {
  return `<div class="page-head"><div class="ph-ico">${pzIc('concierge', 26) || pzIc('users', 26)}</div><div class="ph-txt"><h1>Conserje</h1><p class="sub">La revisión de la noche · para mañana</p></div></div>
  <div id="conserjeCard"><div class="d">⏳ Cargando…</div></div>`;
}

async function bindConserje() {
  const card = $('#conserjeCard');
  if (!card) return;
  // adminToken/adminApi viven en chunk-admin.js: si se entra directo a
  // #/app/conserje, ese chunk todavía no cargó — se trae antes de usarlos.
  try { await loadChunk('admin'); } catch (e) {}
  if (typeof adminToken !== 'function' || typeof adminApi !== 'function') {
    card.innerHTML = '<div class="d">No se pudo cargar el conserje. Probá de nuevo.</div>';
    return;
  }
  if (!adminToken()) {
    let gateMsg = '';
    try { gateMsg = sessionStorage.getItem('posta_admin_msg') || ''; sessionStorage.removeItem('posta_admin_msg'); } catch (e) {}
    card.innerHTML = `<h3 style="margin:0 0 8px">${pzIc('lock', 16)} Acceso restringido</h3>
      <p style="color:var(--mut);font-size:13.5px;line-height:1.6">El conserje es solo para el dueño. Pegá el token de admin para entrar.</p>
      ${gateMsg ? `<p style="color:var(--mut);font-size:13px">${esc(gateMsg)}</p>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px"><input id="cjToken" type="password" placeholder="Token de admin" autocomplete="off" style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid var(--line);font-size:14px"><button class="btn btn-primary" id="cjTokenBtn">Entrar</button></div>`;
    const btn = $('#cjTokenBtn');
    if (btn) btn.onclick = () => {
      const v = ($('#cjToken') || {}).value || '';
      if (!v.trim()) return;
      try { localStorage.setItem('posta_admin_token', v.trim()); } catch (e) {}
      conserjeCargar();
    };
    return;
  }
  if (card.__cjBound) return;
  card.__cjBound = true;
  card.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-cj]');
    if (!t) return;
    const acc = t.getAttribute('data-cj');
    const uid = t.getAttribute('data-user');
    const d = conserjeEstado.datos || {};
    if (acc === 'ver') { conserjeEstado.notaGuardada = null; conserjeEstado.vistaId = uid; conserjeRender(); window.scrollTo(0, 0); return; }
    if (acc === 'volver') { conserjeEstado.notaGuardada = null; conserjeEstado.vistaId = null; conserjeRender(); window.scrollTo(0, 0); return; }
    if (acc === 'arreglar') {
      const box = $('#cjArreglo');
      if (box) { box.style.display = box.style.display === 'none' ? 'block' : 'none'; }
      return;
    }
    if (acc === 'nota-guardar') {
      const inp = $('#cjNota');
      const msg = $('#cjNotaMsg');
      const nota = inp ? inp.value : '';
      try {
        await adminApi('support/conserje/nota', 'POST', { user_id: Number(uid), nota });
        // Guardar en local y mostrar "Guardada ✓" sin recargar toda la
        // revisión: el reload borraba el aviso. La nota ya vive en la
        // ficha del ítem, que es lo que re-renderiza.
        const dd = conserjeEstado.datos;
        const todos = dd ? (dd.items || []).concat(dd.sin_posteo || []) : [];
        const it2 = todos.find((x) => String(x.user_id) === String(uid));
        if (it2 && it2.ficha) it2.ficha.nota = { texto: nota };
        conserjeEstado.notaGuardada = String(uid);
        conserjeRender();
      } catch (e) { if (msg) { msg.textContent = 'No se pudo guardar. Probá de nuevo.'; msg.style.color = '#d64545'; } }
      return;
    }
    if (acc === 'chat') {
      // (CHAT-FOTO) El conserje lee el hilo del cliente: el pedido de cambio
      // de una foto vive en el chat, y sin leerlo el cambio no se puede hacer.
      const box = $('#cjChat');
      if (!box) return;
      // Si el chat ya se cargó, el botón alterna mostrar/ocultar sin
      // volver a pedirlo: el hilo vive en el box hasta el próximo render.
      if (box.dataset && box.dataset.cjChat === '1') {
        const oculto = box.style.display === 'none';
        box.style.display = oculto ? '' : 'none';
        t.textContent = oculto ? '💬 Ocultar el chat' : '💬 Ver el chat con Posty';
        return;
      }
      if (box) box.innerHTML = '<div class="d">⏳ Cargando el chat…</div>';
      try {
        const j = await adminApi('support/' + Number(uid) + '/journey', 'GET');
        if (!j || !j.ok) throw new Error('sin journey');
        const msgs = (j.chat || []).map((m) => {
          let t = String(m.text || '');
          const fm = t.match(/\[foto:([^\]]+)\]/);
          const img = fm ? '<img src="' + esc((fm[1] || '').trim()) + '" alt="" style="width:100%;border-radius:12px;display:block;margin-top:6px" onerror="this.style.display=\'none\'">' : '';
          t = t.replace(/\[foto:[^\]]+\]/g, '').trim();
          return '<div style="padding:8px 10px;border-radius:12px;margin-bottom:6px;background:' + (m.role === 'user' ? '#E8F4FB' : '#fff') + ';border:1px solid var(--line);font-size:13.5px;line-height:1.5"><b style="font-size:12px;color:var(--mut)">' + (m.role === 'user' ? 'Cliente' : 'Posty') + '</b><div>' + esc(t) + '</div>' + img + '</div>';
        }).join('');
        const fotos = (j.fotos_recientes || []).map((f) => '<img src="' + esc(f.file_path || '') + '" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:10px" onerror="this.style.display=\'none\'">').join('');
        if (box) {
          box.innerHTML = '<div style="font-weight:800;font-size:14px;margin-bottom:8px">Chat con Posty (últimos ' + (j.chat || []).length + ' mensajes)</div>'
          + (fotos ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' + fotos + '</div><div style="font-size:12.5px;color:var(--mut);margin-bottom:10px">Fotos recientes del cliente, las que el chat menciona.</div>' : '')
          + (msgs || '<div class="d">Sin mensajes todavía.</div>');
          if (box.dataset) box.dataset.cjChat = '1';
        }
        t.textContent = '💬 Ocultar el chat';
      } catch (e) { if (box) box.innerHTML = '<div class="d">No se pudo cargar el chat. Probá de nuevo.</div>'; }
      return;
    }
    if (acc === 'decidir' || acc === 'armar') {
      const decision = acc === 'armar' ? 'pedir' : t.getAttribute('data-decision');
      let nota = '';
      if (t.getAttribute('data-nota') === '1') {
        const ta = $('#cjArregloNota');
        nota = ta ? ta.value : '';
      }
      t.disabled = true;
      try {
        const body = { user_id: Number(uid), fecha_posteo: t.getAttribute('data-fecha'), decision, nota };
        if (acc === 'decidir') body.post_id = Number(t.getAttribute('data-post'));
        const r = acc === 'armar'
          ? await adminApi('support/conserje/revision/armar', 'POST', body)
          : await adminApi('support/conserje/revision/decidir', 'POST', body);
        if (!r || !r.ok) throw new Error((r && r.error) || 'error');
        await conserjeCargar();
        // Avanzar SOLO al siguiente cliente pendiente (un toque por
        // decisión, sin volver a la lista a buscar el siguiente). Si no
        // queda ninguno, la lista muestra "la noche está cerrada".
        conserjeEstado.notaGuardada = null;
        const sig = conserjeSiguientePendiente(conserjeEstado.datos, uid);
        if (sig) { conserjeEstado.vistaId = String(sig.user_id); conserjeRender(); }
        else { conserjeEstado.vistaId = null; conserjeRender(); }
        window.scrollTo(0, 0);
      } catch (e) {
        t.disabled = false;
        if (card) {
          const warn = document.createElement('div');
          warn.className = 'card';
          warn.style.cssText = 'padding:12px;margin-top:12px;background:#FFF6D6;border:1px solid #FEC14D;font-size:13.5px';
          warn.textContent = 'No se pudo guardar la decisión. Probá de nuevo.';
          card.prepend(warn);
        }
      }
      return;
    }
  });
  // (v849) Deep link ?user=<uid>: abrir el detalle de ese cliente.
  // Se fija ANTES de cargar para que conserjeCargar no lo resetee.
  const cjDeepUser = conserjeUserFromHash(typeof location !== 'undefined' ? location.hash : '');
  if (cjDeepUser) conserjeEstado.vistaId = String(cjDeepUser);
  await conserjeCargar();
  // Si el detalle se abrió, ir directo al chat con Posty (el botón
  // «Ver el chat con Posty»): la push avisa de un cambio y el dueño
  // quiere verlo en un toque. Fail-soft: si no hay botón, no pasa nada.
  if (cjDeepUser) {
    try {
      const b = card.querySelector('[data-cj="chat"]');
      if (b) b.click();
    } catch (e) {}
  }
}
