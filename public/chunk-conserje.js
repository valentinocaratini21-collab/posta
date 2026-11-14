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
var conserjeEstado = { datos: null, vistaId: null, notaGuardada: null, pedidosVoz: null, pedidoAbierto: 0 };
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

// Mini de la revisión (v887 detalle, v906 lista): la foto COMPLETA en
// chiquito (96×96, contain — sin recortar), con el fondo oscuro actual
// detrás. La lista también la usa desde v906; conserjeFotoHTML queda sin
// uso (se conserva: la suite v887 A7 afirma que existe intacta).
function conserjeMiniFotoHTML(it) {
  const url = it && it.post && it.post.image_url ? it.post.image_url : '';
  if (url) {
    return '<div style="width:96px;height:96px;flex:none;border-radius:12px;overflow:hidden;background:#0A1E33;display:flex;align-items:center;justify-content:center"><img src="' + esc(url) + '" alt="" style="width:96px;height:96px;object-fit:contain;display:block"></div>';
  }
  const ini = String((it && it.business_name) || '?').trim().charAt(0).toUpperCase() || '?';
  return '<div style="width:96px;height:96px;flex:none;border-radius:12px;background:#2793C8;display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:800">' + esc(ini) + '</div>';
}

// El «Ver más» del caption solo aparece si el texto no entra en 3 líneas.
// Fail-soft en vm (document.querySelector puede no existir): try/catch.
function conserjeCapAjustar() {
  try {
    // (v906) La lista tiene UN caption por tarjeta: se ajusta cada par
    // caption/botón dentro de su propia tarjeta. En el detalle el caption
    // no vive dentro de una .card y el fallback document-wide lo cubre.
    const todos = document.querySelectorAll('.cj-cap-txt');
    todos.forEach((txt) => {
      const cardEl = txt.closest ? txt.closest('.card') : null;
      const mas = (cardEl && cardEl.querySelector('[data-cj="cap-mas"]')) || document.querySelector('[data-cj="cap-mas"]');
      if (!txt || !mas) return;
      if (txt.scrollHeight <= txt.clientHeight + 1) mas.style.display = 'none';
    });
  } catch (e) {}
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

// (v906) Tarjeta de la LISTA con el diseño aprobado de la variante 1
// (v887), igual que el detalle: foto completa en chiquito a la izquierda,
// caption a la derecha, botones para decidir abajo. La píldora ya NO va
// encima de la foto (tapaba la imagen): vive en línea en el encabezado,
// sin tapar nada. El titular va ARRIBA de la fila, nunca encima de la
// foto. Un toque en la tarjeta abre el detalle; los botones deciden sin
// salir de la lista (mismo data-cj, mismo flujo que el detalle).
function conserjeCardHTML(it, fecha) {
  const p = it.post;
  const dec = it.decision;
  const pillTxt = dec ? conserjeEtiquetaCorta(dec)
    : (it.necesita_atencion ? '⚠ Necesita atención' : '✓ Listo');
  const pillBg = dec ? 'background:#2793C8;color:#fff'
    : (it.necesita_atencion ? 'background:#FEC14D;color:#0A1E33' : 'background:#e7f6ee;color:#14743f');
  const botones = p
    ? '<div style="display:flex;gap:8px;margin-top:12px">'
      + '<button class="btn" style="flex:1;min-height:48px;font-size:15px;background:#14743F;color:#fff" data-cj="decidir" data-decision="sale" data-user="' + esc(String(it.user_id)) + '" data-post="' + esc(String(p.id)) + '" data-fecha="' + esc(String(fecha || '')) + '">✓ Sale así</button>'
      + '<button class="btn btn-secondary" style="flex:1;min-height:48px;font-size:15px" data-cj="arreglar" data-user="' + esc(String(it.user_id)) + '">✎ Editar</button>'
      + '</div>'
      + '<div style="text-align:center;margin-top:8px"><button type="button" data-cj="decidir" data-decision="no_sale" data-user="' + esc(String(it.user_id)) + '" data-post="' + esc(String(p.id)) + '" data-fecha="' + esc(String(fecha || '')) + '" style="background:none;border:0;color:#B3261E;font-size:13.5px;font-weight:700;padding:6px 0;cursor:pointer">✕ No sale</button></div>'
      + '<div class="cj-arreglo" style="display:none;margin-top:12px"><label style="font-size:13px;font-weight:700">Qué hay que arreglar</label>'
      + '<textarea class="cj-arreglo-nota" rows="2" placeholder="Ej.: que no hable del precio, que el producto se vea entero" style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--line);font-size:14px;margin-top:6px"></textarea>'
      + '<button class="btn btn-primary" style="margin-top:8px;min-height:48px;font-size:15px" data-cj="decidir" data-decision="arreglar" data-user="' + esc(String(it.user_id)) + '" data-post="' + esc(String(p.id)) + '" data-fecha="' + esc(String(fecha || '')) + '" data-nota="1">Enviar arreglo</button></div>'
    : '';
  return '<div class="card" style="padding:14px;cursor:pointer" data-cj="ver" data-user="' + esc(String(it.user_id)) + '">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap"><div style="font-weight:800;font-size:15px;flex:1;min-width:0">' + esc(it.business_name || '') + '</div>' + conserjeEtapaDot(it.ficha && it.ficha.etapa) + '<span class="pill" style="margin:0;flex:none;' + pillBg + '">' + esc(pillTxt) + '</span></div>'
    + '<div style="font-size:14px;font-weight:700;margin-top:10px;line-height:1.35">' + esc(p ? p.titulo : 'Sin posteo para mañana') + '</div>'
    + (p ? '<div style="display:flex;gap:12px;margin-top:10px;align-items:flex-start">' + conserjeMiniFotoHTML(it)
      + '<div style="flex:1;min-width:0">'
      + (p.caption
        ? '<div class="cj-cap-txt" style="font-size:14px;line-height:1.6;white-space:pre-wrap">' + esc(p.caption) + '</div>'
          + '<button type="button" data-cj="cap-mas" style="background:none;border:0;color:#2793C8;font-size:13px;font-weight:700;padding:4px 0;cursor:pointer">Ver más</button>'
        : '<div style="font-size:13.5px;color:var(--mut)">Sin texto todavía.</div>')
      + '<div style="font-size:13px;color:var(--mut);margin-top:4px">' + esc(p.cuando || 'Mañana · hora por confirmar') + (p.tipo ? ' · ' + esc(p.tipo) : '') + '</div>'
      + '</div></div>' : '')
    + (dec && dec.nota ? '<div style="font-size:12.5px;color:var(--mut);margin-top:8px">' + esc(String(dec.nota).slice(0, 90)) + '</div>' : '')
    + (it.necesita_atencion && it.motivo_atencion ? '<div style="font-size:12.5px;color:#8a6d00;margin-top:6px">' + esc(it.motivo_atencion) + '</div>' : '')
    + botones
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
    // (v887) Un toque por decisión, sin confirmaciones: los dos botones
    // van A LA PAR (flex:1) justo debajo de la fila del posteo. «Sale así»
    // es VERDE #14743F, como en el mock aprobado; «Editar» reusa el flujo
    // arreglar existente (mismo data-cj, mismo textarea). «No sale» queda
    // como link chico debajo: no se pierde ninguna decisión.
    botones = '<div style="display:flex;gap:8px;margin-top:12px">'
      + '<button class="btn" style="flex:1;min-height:52px;font-size:16px;background:#14743F;color:#fff" data-cj="decidir" data-decision="sale" data-user="' + esc(String(it.user_id)) + '" data-post="' + esc(String(p.id)) + '" data-fecha="' + esc(d.fecha) + '">✓ Sale así</button>'
      + '<button class="btn btn-secondary" style="flex:1;min-height:52px;font-size:16px" data-cj="arreglar" data-user="' + esc(String(it.user_id)) + '">✎ Editar</button>'
      + '</div>'
      + '<div style="text-align:center;margin-top:10px"><button type="button" data-cj="decidir" data-decision="no_sale" data-user="' + esc(String(it.user_id)) + '" data-post="' + esc(String(p.id)) + '" data-fecha="' + esc(d.fecha) + '" style="background:none;border:0;color:#B3261E;font-size:13.5px;font-weight:700;padding:6px 0;cursor:pointer">✕ No sale</button></div>'
      + '<div id="cjArreglo" class="cj-arreglo" style="display:none;margin-top:12px"><label style="font-size:13px;font-weight:700" for="cjArregloNota">Qué hay que arreglar</label>'
      + '<textarea id="cjArregloNota" class="cj-arreglo-nota" rows="2" placeholder="Ej.: que no hable del precio, que el producto se vea entero" style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--line);font-size:14px;margin-top:6px"></textarea>'
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
    + (p ? '<div style="font-size:17px;font-weight:800;margin-top:12px;line-height:1.35">' + esc(p.titulo) + '</div>'
      + (p.status === 'draft' ? '<div style="font-size:13px;color:var(--mut);margin-top:2px">Propuesta · todavía no está programada</div>' : '')
      // (v887) Fila de revisión: foto completa en chiquito a la izquierda,
      // caption a la derecha. El dueño ve el posteo COMPLETO aunque para el
      // cliente siga oculto/velado: sin el texto no se puede decidir — el
      // caption entero sigue en el HTML, recortado a 3 líneas con «Ver más»
      // que lo expande en el mismo lugar (sin navegar).
      + '<style>.cj-cap-txt{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.cj-cap-txt.cj-cap-full{display:block;-webkit-line-clamp:unset;overflow:visible}</style>'
      + '<div style="display:flex;gap:12px;margin-top:12px;align-items:flex-start">' + conserjeMiniFotoHTML(it)
      + '<div style="flex:1;min-width:0">'
      + (p.caption
        ? '<div class="cj-cap-txt" style="font-size:14px;line-height:1.6;white-space:pre-wrap">' + esc(p.caption) + '</div>'
          + '<button type="button" data-cj="cap-mas" style="background:none;border:0;color:#2793C8;font-size:13px;font-weight:700;padding:4px 0;cursor:pointer">Ver más</button>'
        : '<div style="font-size:13.5px;color:var(--mut)">Sin texto todavía.</div>')
      + '<div style="font-size:13px;color:var(--mut);margin-top:4px">' + esc(p.cuando || 'Mañana · hora por confirmar') + (p.tipo ? ' · ' + esc(p.tipo) : '') + '</div>'
      + '</div></div>' : '')
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
    if (it) { card.innerHTML = conserjeDetalleHTML(it, d); conserjeCapAjustar(); return; }
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
  // (v906) El clamp del caption vive acá, una sola vez para toda la lista
  // (mismo patrón que el <style> del detalle): sin esto, las tarjetas de
  // la lista no recortarían el caption a 3 líneas.
  if (atencion.length || resto.length) {
    html += '<style>.cj-cap-txt{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.cj-cap-txt.cj-cap-full{display:block;-webkit-line-clamp:unset;overflow:visible}</style>';
  }
  if (atencion.length) {
    html += '<div style="font-size:14px;font-weight:800;margin:16px 0 8px">⚠ Necesitan atención primero</div><div class="cj-lista">' + atencion.map((it) => conserjeCardHTML(it, d.fecha)).join('') + '</div>';
  }
  if (resto.length) {
    html += '<div style="font-size:14px;font-weight:800;margin:16px 0 8px">Listos</div><div class="cj-lista">' + resto.map((it) => conserjeCardHTML(it, d.fecha)).join('') + '</div>';
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
  // (LOTE CONSERJE-PEDIDOS-VOZ) Sección propia, fuera de la revisión de
  // la noche: los pedidos por voz de los clientes con lo que salió.
  html += '<div style="font-size:14px;font-weight:800;margin:16px 0 8px">🎙 Pedidos por voz</div>'
    + '<div class="card" style="padding:14px">'
    + '<div style="font-size:13.5px;color:var(--mut);line-height:1.55">El pedido específico por voz no se hace en el momento: queda <b>pendiente de revisión</b>. Acá se ve qué pidió el cliente y qué entendió Posty; al aprobar, el pedido queda listo para armarlo al día siguiente — descartar lo cierra sin construir nada. Sin la interpretación de Posty no se aprueba: aprobar a ciegas no. El audio no se guarda: lo que se lee es la transcripción, tal cual la usó Posty.</div>'
    + '<div style="font-size:13px;color:var(--mut);line-height:1.5;margin-top:6px">Ojo: la nota de voz del tab Subir (la que acompaña una foto al subirla) todavía no se guarda en ningún lado — esos pedidos no aparecen acá.</div>'
    + '<button class="btn btn-secondary" data-cj="pedidos-voz" style="margin-top:10px">' + (conserjeEstado.pedidosVoz ? 'Actualizar los pedidos' : 'Ver los pedidos') + '</button>'
    + '<div id="cjPedidosVoz" style="margin-top:12px"></div></div>';
  html += '<style>@media (min-width:720px){.cj-lista{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cj-lista .card{margin:0}}</style>';
  card.innerHTML = html;
  conserjeCapAjustar();
  conserjePedidosVozPintar();
}

// ---------- 🎙 Pedidos por voz (LOTE CONSERJE-PEDIDOS-VOZ) ----------
// Lee GET support/conserje/pedidos-voz (voiceRequests en el servidor):
// cada pedido trae su respuesta de Posty y, si fue sobre un posteo, el
// posteo que quedó. Pedido y entregado se miran lado a lado al abrirlo.
function conserjePedidoEstadoLabel(status) {
  const m = { draft: 'Borrador', scheduled: 'Programado', published: 'Publicado', publishing: 'Publicando', paused: 'Pausado', cancelled: 'Cancelado', dismissed: 'Descartado' };
  return m[String(status || '')] || String(status || '');
}

function conserjePedidoDetalleHTML(p) {
  const izq = '<div style="flex:1;min-width:240px;background:#E8F4FB;border:1px solid var(--line);border-radius:12px;padding:10px 12px">'
    + '<div style="font-weight:800;font-size:13px;margin-bottom:6px">Lo que pidió</div>'
    + '<div style="font-size:13.5px;line-height:1.55">' + esc(p.pedido) + '</div>'
    + '<div style="font-weight:800;font-size:13px;margin:12px 0 6px">Lo que entendió Posty</div>'
    + (p.entendido
      ? '<div style="font-size:13.5px;line-height:1.55">' + esc(p.entendido) + '</div>'
      : '<div style="font-size:13.5px;color:#B3261E">Sin entregar todavía: Posty todavía no respondió este pedido, así que tampoco hay una interpretación registrada para revisar.</div>')
    + '</div>';
  let der;
  if (p.ambito === 'semana') {
    der = '<div style="flex:1;min-width:240px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px">'
      + '<div style="font-weight:800;font-size:13px;margin-bottom:6px">El posteo que quedó</div>'
      + '<div style="font-size:13.5px;line-height:1.55;color:var(--mut)">Fue un pedido sobre la semana, no sobre un posteo puntual: no hay un único posteo para mostrar. Lo entregado se lee en la respuesta de Posty.</div></div>';
  } else if (!p.posteo) {
    der = '<div style="flex:1;min-width:240px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px">'
      + '<div style="font-weight:800;font-size:13px;margin-bottom:6px">El posteo que quedó</div>'
      + '<div style="font-size:13.5px;line-height:1.55;color:var(--mut)">El posteo de este pedido ya no está: no se puede mostrar lo entregado.</div></div>';
  } else {
    const po = p.posteo;
    const fecha = po.status === 'published'
      ? 'Publicado' + (po.published_at ? ' · ' + esc(String(po.published_at).slice(0, 16)) : '')
      : (po.scheduled_at ? 'Programado · ' + esc(String(po.scheduled_at).slice(0, 16)) : 'Sin fecha');
    der = '<div style="flex:1;min-width:240px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px">'
      + '<div style="font-weight:800;font-size:13px;margin-bottom:6px">El posteo que quedó</div>'
      + (po.image_url ? '<div style="border-radius:10px;overflow:hidden;background:#0A1E33;margin-bottom:8px"><img src="' + esc(po.image_url) + '" alt="" style="width:100%;height:200px;object-fit:contain;display:block" onerror="this.style.display=\'none\'"></div>' : '')
      + '<div><span class="pill" style="background:#2793C8;color:#fff;margin:0">' + esc(conserjePedidoEstadoLabel(po.status)) + '</span> <span style="font-size:12.5px;color:var(--mut)">' + fecha + '</span></div>'
      + (po.caption ? '<div style="font-size:13.5px;line-height:1.5;margin-top:6px">' + esc(po.caption) + '</div>' : '')
      + (po.tiene_anterior ? '<div style="font-size:12.5px;color:var(--mut);margin-top:6px">Tiene una imagen anterior guardada (se puede volver).</div>' : '')
      + '</div>';
  }
  // La puerta de revisión: se aprueba lo entendido, no a ciegas (sin
  // interpretación registrada el botón de aprobar nace deshabilitado y
  // el servidor además lo rechaza). Aprobar = listo para el armado de
  // mañana; descartar = se cierra sin construir nada.
  const estado = (p.revision && p.revision.estado) || 'pendiente';
  let acciones;
  if (estado === 'aprobado') {
    acciones = '<div style="font-size:13.5px;font-weight:700;color:#14743F">✅ Aprobado: queda listo para armarlo mañana.</div>'
      + '<div style="margin-top:8px"><button type="button" class="btn-mod bad" data-cj="pedido-decidir" data-id="' + esc(String(p.id)) + '" data-decision="descartado">Descartar</button>'
      + '<button type="button" class="btn-mod" data-cj="pedido-decidir" data-id="' + esc(String(p.id)) + '" data-decision="pendiente">Volver a pendiente</button></div>';
  } else if (estado === 'descartado') {
    acciones = '<div style="font-size:13.5px;font-weight:700;color:var(--mut)">Descartado: no se construye nada.</div>'
      + '<div style="margin-top:8px"><button type="button" class="btn-mod" data-cj="pedido-decidir" data-id="' + esc(String(p.id)) + '" data-decision="pendiente">Volver a pendiente</button></div>';
  } else {
    acciones = '<div>'
      + '<button type="button" class="btn-mod ok" data-cj="pedido-decidir" data-id="' + esc(String(p.id)) + '" data-decision="aprobado"' + (p.entendido ? '' : ' disabled') + '>✓ Aprobar — se arma mañana</button>'
      + '<button type="button" class="btn-mod bad" data-cj="pedido-decidir" data-id="' + esc(String(p.id)) + '" data-decision="descartado">Descartar</button></div>'
      + (p.entendido ? '' : '<div style="font-size:12.5px;color:#B3261E;margin-top:6px">Sin la interpretación de Posty no se aprueba: aprobar a ciegas no.</div>');
  }
  return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">' + izq + der + '</div>'
    + '<div style="margin-top:10px">' + acciones + '</div>';
}

async function conserjePedidoDecidir(t) {
  const id = Number(t.getAttribute('data-id') || '');
  const dec = t.getAttribute('data-decision') || '';
  if (!id || !dec) return;
  t.disabled = true;
  try {
    const r = await adminApi('support/conserje/pedidos-voz/decidir', 'POST', { message_id: id, decision: dec });
    if (!r || !r.ok) {
      t.disabled = false;
      const box = $('#cjPedidosVoz');
      if (box) {
        const warn = document.createElement('div');
        warn.className = 'warn';
        warn.textContent = (r && r.error === 'sin_interpretacion')
          ? 'No se aprobó: Posty todavía no registró qué entendió de este pedido.'
          : 'No se pudo guardar la decisión. Probá de nuevo.';
        box.prepend(warn);
      }
      return;
    }
    const d = conserjeEstado.pedidosVoz;
    if (d && d.pedidos) {
      const it = d.pedidos.find((x) => Number(x.id) === id);
      if (it) it.revision = { estado: r.estado, decidido_en: r.decidido_en || null };
    }
    conserjePedidosVozPintar();
  } catch (e) { t.disabled = false; }
}

function conserjePedidoRevisionChip(p) {
  const estado = (p.revision && p.revision.estado) || 'pendiente';
  if (estado === 'aprobado') return '<span class="pill" style="background:#14743F;color:#fff;margin:0">Aprobado · para mañana</span>';
  if (estado === 'descartado') return '<span class="pill" style="background:#E2EDF5;color:#0A1E33;margin:0">Descartado</span>';
  return '<span class="pill" style="background:#FEC14D;color:#0A1E33;margin:0">Pendiente de revisión</span>';
}

function conserjePedidoItemHTML(p) {
  const abierto = String(conserjeEstado.pedidoAbierto || '') === String(p.id);
  const chip = conserjePedidoRevisionChip(p);
  let h = '<div class="card" style="padding:12px;margin-bottom:10px;background:#FBFDFE">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="font-weight:800;font-size:14.5px">' + esc(p.business_name || ('Cliente ' + p.user_id)) + (p.ig_username ? ' <span style="font-weight:600;color:var(--mut);font-size:13px">@' + esc(p.ig_username) + '</span>' : '') + '</div>' + chip + '</div>'
    + '<div style="font-size:12.5px;color:var(--mut);margin-top:2px">' + esc(p.cuando || '') + (p.ambito === 'semana' ? ' · sobre la semana' : '') + '</div>'
    + '<div style="font-size:14px;line-height:1.5;margin-top:6px">🎙 ' + esc(p.pedido) + '</div>'
    + '<button type="button" class="btn btn-secondary" data-cj="pedido-ver" data-id="' + esc(String(p.id)) + '" style="margin-top:8px;min-height:40px;font-size:13.5px">' + (abierto ? 'Ocultar' : 'Ver qué salió →') + '</button>';
  if (abierto) h += conserjePedidoDetalleHTML(p);
  return h + '</div>';
}

function conserjePedidosVozHTML() {
  const d = conserjeEstado.pedidosVoz;
  if (!d) return '';
  if (!d.pedidos || !d.pedidos.length) return '<div class="d">Todavía no hay pedidos por voz de clientes.</div>';
  return d.pedidos.map(conserjePedidoItemHTML).join('');
}

function conserjePedidosVozPintar() {
  try {
    const box = $('#cjPedidosVoz');
    if (box && conserjeEstado.pedidosVoz) box.innerHTML = conserjePedidosVozHTML();
  } catch (e) { /* sin DOM (vm): la sección se pinta al cargar */ }
}

async function conserjePedidosVozCargar() {
  const box = $('#cjPedidosVoz');
  if (box) box.innerHTML = '<div class="d">⏳ Cargando los pedidos…</div>';
  try {
    const d = await adminApi('support/conserje/pedidos-voz', 'GET');
    if (!d || !d.ok) throw new Error('sin datos');
    conserjeEstado.pedidosVoz = d;
    conserjePedidosVozPintar();
    const btn = document.querySelector('[data-cj="pedidos-voz"]');
    if (btn) btn.textContent = 'Actualizar los pedidos';
  } catch (e) { if (box) box.innerHTML = '<div class="d">No se pudieron cargar los pedidos. Probá de nuevo.</div>'; }
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
    if (acc === 'ver') {
      // (v906) Un clic dentro de la caja de arreglo de una tarjeta de la
      // lista (el textarea) no debe abrir el detalle: la caja no tiene
      // data-cj y el closest caería en la tarjeta (data-cj="ver").
      if (ev.target.closest && ev.target.closest('.cj-arreglo')) return;
      conserjeEstado.notaGuardada = null; conserjeEstado.vistaId = uid; conserjeRender(); window.scrollTo(0, 0); return;
    }
    if (acc === 'volver') { conserjeEstado.notaGuardada = null; conserjeEstado.vistaId = null; conserjeRender(); window.scrollTo(0, 0); return; }
    if (acc === 'arreglar') {
      // (v906) En la lista, cada tarjeta lleva su propia caja (.cj-arreglo):
      // se busca dentro de la tarjeta del botón. En el detalle la caja no
      // vive dentro de una .card y el fallback por id la cubre.
      const cardEl = t.closest ? t.closest('.card') : null;
      const box = (cardEl && cardEl.querySelector && cardEl.querySelector('.cj-arreglo')) || $('#cjArreglo');
      if (box) { box.style.display = box.style.display === 'none' ? 'block' : 'none'; }
      return;
    }
    if (acc === 'cap-mas') {
      // (v906) En la lista hay UN caption por tarjeta: se expande el de la
      // propia tarjeta. En el detalle el caption no vive dentro de una
      // .card y el fallback document-wide lo cubre.
      const cardEl = t.closest ? t.closest('.card') : null;
      const txt = (cardEl && cardEl.querySelector && cardEl.querySelector('.cj-cap-txt')) || document.querySelector('.cj-cap-txt');
      if (txt) {
        const full = txt.classList.toggle('cj-cap-full');
        t.textContent = full ? 'Ver menos' : 'Ver más';
      }
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
    if (acc === 'pedidos-voz') { await conserjePedidosVozCargar(); return; }
    if (acc === 'pedido-ver') {
      const pidVoz = t.getAttribute('data-id');
      conserjeEstado.pedidoAbierto = String(conserjeEstado.pedidoAbierto || '') === String(pidVoz) ? 0 : pidVoz;
      conserjePedidosVozPintar();
      return;
    }
    if (acc === 'pedido-decidir') { await conserjePedidoDecidir(t); return; }
    if (acc === 'decidir' || acc === 'armar') {
      const decision = acc === 'armar' ? 'pedir' : t.getAttribute('data-decision');
      let nota = '';
      if (t.getAttribute('data-nota') === '1') {
        // (v906) En la lista, cada tarjeta lleva su propio textarea
        // (.cj-arreglo-nota): se busca dentro de la tarjeta del botón. En
        // el detalle el textarea no vive dentro de una .card y el fallback
        // por id lo cubre.
        const cardEl = t.closest ? t.closest('.card') : null;
        const ta = (cardEl && cardEl.querySelector && cardEl.querySelector('.cj-arreglo-nota')) || $('#cjArregloNota');
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
