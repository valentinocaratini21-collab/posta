/* LOTE CONSERJE-V1 — la consola del operador (bamboo) con la piel del
   mock v1 aprobado por Valentino. El cableado es el de VISTA-CONSERJE
   (v1184), intacto: mismos endpoints, mismas acciones, mismas fuentes.
   La página no guarda estado propio: cada render sale de la API admin
   en el acto y cada acción escribe en la fuente real de la cosa (la
   decisión de la revisión, el chat del cliente, el registro del
   equipo, la tabla de tratamientos). Después de actuar, la vista se
   relee entera — lo que se ve es lo que la base tiene, nunca una
   copia local que pueda quedar vieja.

   LOTE CONSERJE-FORMA (2026-11-22) — la forma que dictó el dueño:
   arriba, el semáforo de mañana; a la izquierda, la cartera viva
   (los filtros leen la clase viva del servidor; la lista NUNCA se
   vacía al seleccionar — el vacío es solo de una búsqueda explícita,
   con su texto y su botón para limpiarla); al centro, la producción
   de mañana como vista de trabajo y la ficha como drill-in; a la
   derecha, «Hoy necesita una mano» agrupada en pedidos · decisiones
   · problemas · plata. Cada ítem de la derecha abre sobre la cosa
   misma (data-goto: la ficha, con el posteo referido marcado). */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var token = qs.get('token') || '';
  try {
    if (token) localStorage.setItem('posta_admin_token', token);
    else token = localStorage.getItem('posta_admin_token') || '';
  } catch (e) { /* sin storage: el gate pide el token */ }
  if (qs.get('token')) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }

  // (LOTE PUSH-DESTINO · 22/11) Deep link de la push «pidió un cambio»:
  // ?user=<uid> (&post=<id>) — al terminar la primera carga, la consola
  // abre la ficha de ese cliente con el posteo marcado (gotoFicha, el
  // mismo camino que un toque en la cartera o en la cola).
  var deepUser = Number(qs.get('user') || 0) || 0;
  var deepPost = Number(qs.get('post') || 0) || 0;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function iniciales(nombre) {
    var p = String(nombre || '?').trim().split(/\s+/);
    return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function avaClass(uid) { return 'avatar a' + (Math.abs(Number(uid) || 0) % 7); }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fechaCorta(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    return m ? Number(m[3]) + ' ' + MESES[Number(m[2]) - 1] : String(key || '');
  }
  function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 5200);
  }

  function api(path, opts) {
    opts = opts || {};
    var url = path + (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
    var init = { method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'respuesta_invalida' }; })
        .then(function (j) { j.__status = r.status; return j; });
    });
  }

  var vista = null;
  var selUser = null;
  var cliente = null;
  var filtro = 'todos';
  var centroVista = 'semana';
  var centroModo = 'manana'; // (CONSERJE-FORMA) el centro abre en la producción de mañana; la ficha es el drill-in
  var highlightPostId = null; // el posteo referido por un ítem de la derecha, abierto en la ficha
  var feedPorUsuario = {};

  // ---------------- tira superior ----------------
  function setBadge(id, n) {
    var b = $(id);
    if (!b) return;
    b.textContent = (n == null ? '—' : n);
    if (n === 0) b.classList.add('zero'); else b.classList.remove('zero');
  }
  function renderTop() {
    var h = (vista && vista.hoy) || {};
    $('hoyFecha').textContent = h.fecha_label || '';
    $('statPublica').innerHTML = '<span class="ts-label">Hoy publica</span><span class="ts-value">'
      + (h.publica_hoy != null ? h.publica_hoy : '—') + ' posteos</span>'
      + (h.proxima_hora ? '<span class="ts-label">· próximo ' + esc(h.proxima_hora) + '</span>' : '');
    $('statPruebas').innerHTML = '<span class="ts-label">Pruebas activas</span><span class="ts-value">'
      + (h.pruebas_activas != null ? h.pruebas_activas : '—') + '</span>';
    setBadge('topPending', h.decisiones_pendientes != null ? h.decisiones_pendientes : null);
    $('statSubs').innerHTML = '<span class="ts-label">Suscriptores</span><span class="ts-value">'
      + (h.suscriptores != null ? h.suscriptores : '—') + '/' + (h.meta_marzo || 30)
      + ' <span style="color:var(--ink-3);font-weight:500">marzo</span></span>';
    if (h.disco_mb != null) {
      $('statDisco').style.display = '';
      $('statDisco').innerHTML = '<span class="ts-label">Disco</span>'
        + (h.disco_mb < 1500
          ? '<span class="warn">⚠ ' + h.disco_mb + ' MB libres</span>'
          : '<span class="ts-value">' + h.disco_mb + ' MB libres</span>');
    }
  }
  function renderGasto() {
    api('/api/admin/ai-costs').then(function (j) {
      if (j && j.ok && j.today_spend_usd != null) {
        $('statGasto').innerHTML = '<span class="ts-label">Gasto IA hoy</span><span class="ts-value">US$'
          + Number(j.today_spend_usd).toFixed(2).replace('.', ',') + '</span>';
      }
    }).catch(function () { /* el gasto es una tira más: si falla, queda el guion */ });
  }

  // ---------------- semáforo de mañana ----------------
  // (LOTE CONSERJE-FORMA) La pregunta de la mañana del dueño, en una
  // línea arriba de todo: ¿mañana está cubierto? Los conteos son los
  // del tablero de producción de mañana (vista.manana), computados
  // por el servidor desde los datos reales — nada se marca a mano.
  function renderSemaforo() {
    var m = vista && vista.manana;
    var dot = $('semaforoDot'), txt = $('semaforoTxt');
    if (!m || !m.resumen) { dot.className = 'sem-dot'; txt.textContent = 'Mañana: sin datos todavía.'; return; }
    var r = m.resumen;
    dot.className = 'sem-dot ' + (r.faltan > 0 ? 'bad' : (r.en_preparacion > 0 ? 'warn' : 'ok'));
    txt.innerHTML = 'Mañana · ' + esc(m.fecha_label || '') + ' — '
      + (r.faltan > 0
        ? '<b>a ' + r.faltan + (r.faltan === 1 ? ' cliente le falta' : ' clientes les falta') + ' su posteo</b>'
        : '<b>mañana está cubierto</b>')
      + ' <span class="sem-sub">· ' + r.listos + ' listos · ' + r.en_preparacion + ' en preparación · ' + r.faltan + ' faltan (de ' + r.total + ')</span>';
  }

  // ---------------- roster ----------------
  // (LOTE CONSERJE-FORMA) Los filtros leen la CLASE VIVA que computa
  // el servidor (cartera viva: prueba corriendo o pendiente, cliente
  // pago, la casa) — no la columna plan_status guardada, que dejaba
  // 42 «pruebas» eternas. Los conteos salen de la misma lista viva.
  function pasaFiltro(f) {
    if (filtro === 'pruebas') return f.clase === 'prueba_corriendo' || f.clase === 'prueba_pendiente';
    if (filtro === 'clientes') return f.clase === 'pago';
    if (filtro === 'pendientes') return f.pendientes && f.pendientes.total > 0;
    return true;
  }
  function renderFiltros() {
    var cs = (vista && vista.clientes) || [];
    var defs = [
      ['todos', 'Todos', cs.length],
      ['pruebas', 'Pruebas', cs.filter(function (f) { return f.clase === 'prueba_corriendo' || f.clase === 'prueba_pendiente'; }).length],
      ['clientes', 'Clientes', cs.filter(function (f) { return f.clase === 'pago'; }).length],
      ['pendientes', 'Con pendientes', cs.filter(function (f) { return f.pendientes && f.pendientes.total > 0; }).length],
    ];
    $('filtros').innerHTML = defs.map(function (d) {
      return '<button class="chip' + (filtro === d[0] ? ' active' : '') + '" data-filtro="' + d[0] + '" type="button">'
        + esc(d[1]) + ' <span class="chip-n">' + d[2] + '</span></button>';
    }).join('');
    $('rosterCount').textContent = cs.length + (cs.length === 1 ? ' cuenta' : ' cuentas');
  }
  function renderRosterFoot() {
    var cs = ((vista && vista.clientes) || []).filter(function (f) { return f.pendientes && f.pendientes.total > 0; });
    if (!cs.length) { $('rosterFoot').innerHTML = ''; return; }
    var nombres = cs.slice(0, 4).map(function (f) { return f.business_name || ('@' + (f.ig_username || '')); });
    var lista = nombres.join(', ') + (cs.length > 4 ? ' y ' + (cs.length - 4) + ' más' : '');
    $('rosterFoot').innerHTML = '<div class="roster-foot"><b>' + cs.length + (cs.length === 1 ? ' cuenta te necesita' : ' cuentas te necesitan')
      + ' hoy:</b> ' + esc(lista) + '. Todo está a la derecha, en «Hoy necesita una mano» →</div>';
  }
  function renderRoster() {
    renderFiltros();
    renderRosterFoot();
    var q = ($('buscador').value || '').trim().toLowerCase();
    var base = ((vista && vista.clientes) || []).filter(pasaFiltro);
    var cs = base.filter(function (f) {
      if (!q) return true;
      return (f.business_name || '').toLowerCase().indexOf(q) >= 0 || (f.ig_username || '').toLowerCase().indexOf(q) >= 0;
    });
    // (LOTE CONSERJE-FORMA · la falla #1) La lista NUNCA se vacía como
    // efecto de seleccionar un cliente: el estado vacío existe SOLO
    // para una búsqueda explícita, con el texto visible y borrable en
    // el acto; sin búsqueda, una pestaña sin cuentas dice su verdad
    // («todavía no hay…») y la lista de la pestaña sigue a un toque.
    if (!cs.length) {
      if (q) {
        $('roster').innerHTML = '<div class="roster-empty">Ningún cliente coincide con tu búsqueda <b>«'
          + esc(q) + '»</b>.<br><button class="btn small" data-act="limpiar-busqueda" type="button">Limpiar búsqueda</button></div>';
      } else {
        var vacioTxt = filtro === 'clientes' ? 'Todavía no hay clientes pagos en la cartera viva.'
          : filtro === 'pruebas' ? 'No hay pruebas corriendo ni esperando conexión.'
          : filtro === 'pendientes' ? 'Ninguna cuenta tiene pendientes hoy.'
          : 'La cartera viva está vacía.';
        $('roster').innerHTML = '<div class="roster-empty">' + vacioTxt + '</div>';
      }
      return;
    }
    $('roster').innerHTML = cs.map(function (f) {
      var dot = f.dot === 'green' ? 'green' : (f.dot === 'yellow' ? 'yellow' : 'grey');
      var claseTxt = f.clase === 'prueba_corriendo' && f.prueba && f.prueba.dias_restantes != null
        ? 'Prueba · ' + (f.prueba.dias_restantes === 0 ? 'último día' : 'quedan ' + f.prueba.dias_restantes + (f.prueba.dias_restantes === 1 ? ' día' : ' días'))
        : (f.clase_label || '');
      var meta = [f.categoria || '', claseTxt].filter(Boolean).join(' · ');
      return '<button class="client-row' + (selUser === f.user_id ? ' selected' : '') + '" data-sel="' + f.user_id + '" type="button">'
        + '<span class="' + avaClass(f.user_id) + '">' + esc(iniciales(f.business_name)) + '</span>'
        + '<span class="cr-main"><span class="cr-name">' + esc(f.business_name || 'Sin nombre') + '</span>'
        + (f.racha >= 2 ? '<span class="racha">🔥 ' + f.racha + ' días</span>' : '')
        + ' <span class="cr-handle">@' + esc(f.ig_username || '—') + '</span>'
        + (meta ? '<span class="cr-meta">' + esc(meta) + '</span>' : '')
        + '<span class="cr-state"><span class="dot ' + dot + '"></span>' + esc(f.estado || '') + '</span></span></button>';
    }).join('');
  }

  // ---------------- centro: la ficha ----------------
  function chipDePost(p) {
    if (p.status === 'published') return '<span class="state-chip green">Publicado ✓</span>';
    if (p.status === 'scheduled') return '<span class="state-chip sky">Programado · ' + esc(fechaCorta(p.dia_key)) + '</span>';
    if (p.status === 'draft') return '<span class="state-chip yellow">Borrador</span>';
    // (LOTE CENSO-CONSERJE-2 · F6) El fallido se dice en español, como
    // los demás estados — nunca el status crudo de la base («failed»).
    if (p.status === 'failed') return '<span class="state-chip red">No salió ✗</span>';
    return '<span class="state-chip">' + esc(p.status || '') + '</span>';
  }
  function postCard(p, conAcciones, inicial) {
    var img = p.poster_url || p.image_url || '';
    var esVideo = /video|reel/.test(String(p.media_type || ''));
    var acts = '';
    if (conAcciones && (p.status === 'draft' || p.status === 'scheduled')) {
      acts = '<div class="p-actions">'
        + '<button class="btn primary small" data-act="post-sale" data-id="' + p.id + '" data-fecha="' + esc(p.dia_key || '') + '" type="button">✓ Sale así</button>'
        + '<button class="btn small" data-act="post-reprogramar" data-id="' + p.id + '" type="button">Reprogramar</button>'
        + '<button class="btn small ghost-danger" data-act="post-descartar" data-id="' + p.id + '" type="button">Descartar</button></div>';
    }
    // (LOTE CONSERJE-VER-GRANDE) La foto se toca y se ve en grande:
    // la miniatura lleva [data-ver] con su posteo y su respaldo.
    return '<article class="post' + (highlightPostId && Number(highlightPostId) === Number(p.id) ? ' destacado' : '') + '" id="post-' + p.id + '"><div class="thumb"' + (img ? ' data-ver data-ver-post="' + p.id + '" data-ver-fb="' + regVisorFallback({ media_type: p.media_type, image_url: p.image_url, poster_url: p.poster_url, caption: p.caption || '' }) + '"' : '') + '>'
      + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<div class="ph"><span class="ph-initial">' + esc(inicial || 'P') + '</span></div>')
      + (esVideo ? '<span class="play">▶</span>' : '')
      + chipDePost(p)
      + '</div><div class="p-body">'
      + (p.dia_key ? '<div class="p-day">' + esc(fechaCorta(p.dia_key)) + '</div>' : '')
      + '<div class="p-title">' + esc(p.titulo || 'Posteo') + '</div>'
      + (p.caption ? '<div class="p-cap">' + esc(trunc(p.caption, 280)) + '</div>' : '')
      + (p.tipo ? '<div class="p-meta"><span class="mini-chip celeste">' + esc(p.tipo) + '</span></div>' : '')
      + acts + '</div></article>';
  }
  function planCard(slot, inicial) {
    return '<article class="post"><div class="thumb"><div class="ph"><span class="ph-initial">' + esc(inicial || 'P') + '</span>'
      + '<span class="ph-txt">Pieza en producción<br>sale ' + esc(slot.fecha || '') + (slot.hora ? ' · ' + esc(slot.hora) : '') + '</span></div>'
      + '<span class="state-chip">Día ' + slot.dia + ' · plan de prueba</span></div>'
      + '<div class="p-body"><div class="p-title">' + esc(slot.nombre || 'Pieza del día ' + slot.dia) + '</div>'
      + (slot.formato ? '<div class="p-meta"><span class="fchip">' + esc(slot.formato) + '</span></div>' : '')
      + '</div></article>';
  }
  // ---------------- centro: producción de mañana / la ficha ----------------
  function renderCentro() {
    if (centroModo === 'ficha') { renderFicha(); return; }
    renderManana();
  }
  function renderManana() {
    var m = vista && vista.manana;
    if (!m) { $('centro').innerHTML = '<div class="cargando">Cargando la producción de mañana…</div>'; return; }
    var grupos = [
      ['falta', 'Faltan — mañana sin posteo'],
      ['en_preparacion', 'En preparación'],
      ['listo', 'Listos — salen solos'],
    ];
    var html = '<div class="manana-head"><span class="m-title">Producción de mañana</span>'
      + '<span class="m-fecha">' + esc(m.fecha_label || '') + '</span>'
      + '<span class="m-sub">El trabajo de hoy es mañana: lo de hoy ya está en curso. Tocá una cuenta para abrir su ficha.</span></div>';
    if (!m.items.length) {
      html += '<div class="vacio">La cartera viva no tiene cuentas en régimen diario: no hay producción de mañana para preparar.</div>';
    }
    for (var g = 0; g < grupos.length; g++) {
      var items = m.items.filter(function (i) { return i.estado === grupos[g][0]; });
      if (!items.length) continue;
      html += '<div class="m-group">' + grupos[g][1] + ' · ' + items.length + '</div>' + items.map(function (i) {
        var img = i.post ? (i.post.poster_url || i.post.image_url || '') : '';
        var esVid = i.post && /video|reel/.test(String(i.post.media_type || ''));
        var estadoTxt = i.estado === 'listo'
          ? (i.sin_posteo_decidido ? 'No sale · decidido' : 'Listo')
          : (i.estado === 'en_preparacion' ? (i.post ? 'Propuesta por decidir' : 'Posty lo arma') : 'Falta');
        return '<button class="m-row" data-goto="' + i.user_id + '" type="button">'
          + '<span class="m-thumb"' + (img ? ' data-ver data-ver-post="' + i.post.id + '" data-ver-uid="' + i.user_id + '" data-ver-fb="' + regVisorFallback({ media_type: i.post.media_type, image_url: i.post.image_url, poster_url: i.post.poster_url, caption: i.post.caption || '' }) + '"' : '') + '>' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="ph-initial">' + esc(iniciales(i.business_name)) + '</span>') + '</span>'
          + '<span class="m-main"><span class="m-name">' + esc(i.business_name || 'Sin nombre') + '</span>'
          + '<span class="m-post">' + (i.post ? esc(i.post.titulo || 'Posteo de mañana') : (i.sin_posteo_decidido ? 'El dueño decidió que mañana no sale' : 'Sin posteo para mañana')) + '</span>'
          + (i.necesita_atencion ? '<span class="m-att">⚠ ' + esc(i.motivo_atencion || 'Necesita atención') + '</span>' : '')
          + '</span>'
          + (esVid ? '<span class="play">▶</span>' : '')
          + '<span class="m-state ' + i.estado + '">' + estadoTxt + '</span></button>';
      }).join('');
    }
    $('centro').innerHTML = html;
  }
  function renderFicha() {
    var c = cliente;
    if (!c || !c.ok) { $('centro').innerHTML = '<div class="cargando">Elegí una cuenta de la lista para ver su ficha.</div>'; return; }
    var ficha = c.ficha || {};
    var vende = ficha.vende || {};
    var plan = c.plan_prueba_detalle || null;
    var pend = c.pendientes || { total: 0 };
    var publicadosSemana = c.semana ? c.semana.filter(function (d) { return d.estado === 'publicado'; }).length : 0;
    var proxPost = (c.posteos || []).filter(function (p) { return p.status === 'scheduled' || p.status === 'draft'; })
      .sort(function (a, b) { return String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || '')); })[0];
    var etapaTag = c.etapa && c.etapa.etiqueta
      ? '<span class="tag ' + (c.etapa.clave === 'en_rojo' ? 'warn' : 'grey') + '">' + esc(c.etapa.etiqueta) + '</span>' : '';
    var progresoHtml;
    if (plan) {
      var listos = plan.slots.filter(function (s) { return s.estado === 'listo'; }).length;
      progresoHtml = '<div class="kpi"><div class="k-label">Progreso de la prueba</div><div class="k-value">' + listos + ' de ' + plan.slots.length + ' piezas</div>'
        + '<div class="bar"><i style="width:' + Math.round(100 * listos / Math.max(1, plan.slots.length)) + '%"></i></div>'
        + '<div class="k-sub">' + (plan.estrategia_aprobada ? 'Estrategia aprobada por el cliente' : 'Estrategia todavía sin aprobar') + '</div></div>';
    } else {
      progresoHtml = '<div class="kpi"><div class="k-label">Esta semana</div><div class="k-value">' + publicadosSemana + ' posteos publicados</div><div class="k-sub">De lunes a domingo, su zona horaria</div></div>';
    }
    var necesita = pend.total === 0
      ? '<div class="kpi"><div class="k-label">Te necesita</div><div class="k-value green">Nada pendiente</div><div class="k-sub">Está al día con el equipo</div></div>'
      : '<div class="kpi"><div class="k-label">Te necesita</div><div class="k-value yellow">' + pend.total + (pend.total === 1 ? ' cosa' : ' cosas') + '</div><div class="k-sub">'
        + [pend.voz ? pend.voz + ' por voz' : '', pend.chat ? pend.chat + ' mensajes' : '', pend.revision ? 'la pieza de mañana' : '', pend.casos ? pend.casos + ' casos' : ''].filter(Boolean).join(' · ') + '</div></div>';
    var impulsoKpi = c.boost
      ? '<div class="kpi"><div class="k-label">Último impulso</div><div class="k-value">' + esc(c.boost.status === 'error' ? 'En error' : (c.boost.status || '—')) + '</div><div class="k-sub">US$ ' + (Number(c.boost.budget_cents || 0) / 100).toFixed(0) + ' de pauta · posteo #' + (c.boost.post_id || '—') + '</div></div>'
      : '<div class="kpi"><div class="k-label">Impulso</div><div class="k-value">Sin impulsos</div><div class="k-sub">Todavía no impulsó ningún posteo</div></div>';
    var sinReg = '<span class="sin">Sin registrar</span>';
    var funda = '<div class="fundamento">'
      + '<div class="fund"><div class="f-label">⭐ Producto estrella</div><div class="f-value">' + (vende.estrella ? esc(vende.estrella) : sinReg) + '</div></div>'
      + '<div class="fund"><div class="f-label">Estrategia</div><div class="f-value">' + (ficha.estrategia && ficha.estrategia.linea ? esc(ficha.estrategia.linea) : sinReg) + '</div>'
      + (ficha.estrategia && ficha.estrategia.fuente && ficha.estrategia.fuente !== 'sin_datos' ? '<span class="fuente">Fuente: ' + esc(ficha.estrategia.fuente) + '</span>' : '') + '</div>'
      + '<div class="fund"><div class="f-label">Audiencia estudiada</div><div class="f-value">' + (vende.audiencia ? esc(vende.audiencia) : sinReg) + '</div></div></div>';
    var familias = (vista && vista.familias) || [];
    var trat = familias.length
      ? '<div class="trat"><span class="t-label">Tratamiento</span><select id="tratSel">'
        + '<option value="">Sin tratamiento asignado</option>'
        + familias.map(function (f) { return '<option value="' + esc(f.key) + '"' + (c.tratamiento === f.key ? ' selected' : '') + '>' + esc(f.nombre) + '</option>'; }).join('')
        + '</select><span class="t-hint">Una familia por negocio: si otro ya la lleva, no se aplica y te avisamos.</span>'
        + (plan && plan.formatos && plan.formatos.length ? '<span class="fchips">' + plan.formatos.map(function (f) { return '<span class="fchip">' + esc(f) + '</span>'; }).join('') + '</span>' : '')
        + '</div>'
      : '';
    var nota = '<div class="nota"><input id="notaInput" maxlength="200" placeholder="Nota interna de la ficha (máx. 200)…" value="' + esc((ficha.nota && ficha.nota.texto) || '') + '">'
      + '<button class="btn small" data-act="nota-guardar" type="button">Guardar nota</button></div>';
    var week = '<div class="week">' + (c.semana || []).map(function (d) {
      var cls = '', sym = '—', note = '';
      if (d.estado === 'publicado') { cls = 'done'; sym = '✓'; note = 'Publicó'; }
      else if (d.estado === 'programado') { sym = '◷'; note = 'Sale ' + (d.hora || ''); }
      else if (d.estado === 'borrador') { sym = '✎'; note = 'Borrador'; }
      else if (d.estado === 'frenado') { cls = 'frenado'; sym = '⛔'; note = 'Frenado por el cliente'; }
      else if (d.estado === 'falta') { cls = 'missing'; sym = '⚠'; note = 'Falta'; }
      if (d.es_hoy) cls += ' today';
      return '<div class="day ' + cls + '"><div class="d-name">' + esc(d.dia) + ' ' + esc(d.fecha) + '</div><div class="d-state">' + sym + '</div><div class="d-note">' + esc(note) + '</div>'
        + (d.estado === 'falta' ? '<div class="d-mini"><button class="btn small" data-act="producir" data-fecha="' + esc(d.key) + '" type="button">Producir ahora</button></div>' : '')
        + '</div>';
    }).join('') + '</div>';
    var ini = iniciales(c.business_name);
    var enPosteos = {};
    (c.posteos || []).forEach(function (p) { enPosteos[p.id] = true; });
    var planCards = plan ? plan.slots.filter(function (s) { return s.estado !== 'listo' || !s.post_id || !enPosteos[s.post_id]; })
      .filter(function (s) { return s.estado !== 'listo'; }).map(function (s) { return planCard(s, ini); }).join('') : '';
    var grid = '<div class="posts">' + (c.posteos || []).map(function (p) { return postCard(p, true, ini); }).join('') + planCards + '</div>';
    if (!(c.posteos || []).length && !planCards) grid = '<div class="vacio">Esta cuenta todavía no tiene posteos.</div>';
    var boostStrip = c.boost && c.boost.status !== 'error'
      ? '<div class="boost"><span class="b-ico">🚀</span><div class="b-main"><div class="b-title">Impulso ' + esc(c.boost.status || '') + '</div><div class="b-txt">Posteo #' + (c.boost.post_id || '—') + ' · US$ ' + (Number(c.boost.budget_cents || 0) / 100).toFixed(0) + ' de pauta' + (c.boost.fee_cents ? ' · US$ ' + (Number(c.boost.fee_cents) / 100).toFixed(2) + ' de gestión' : '') + '</div></div></div>'
      : '';
    $('centro').innerHTML =
      '<div class="back-row"><button class="btn small" data-act="ir-manana" type="button">← Producción de mañana</button></div>'
      + '<div class="c-head"><div class="c-id"><span class="' + avaClass(c.user_id) + '">' + esc(ini) + '</span>'
      + '<div><div class="c-name">' + esc(c.business_name || 'Sin nombre') + '</div>'
      + '<div class="c-sub"><span class="handle">@' + esc(c.ig_username || '—') + '</span>' + (c.categoria ? ' · ' + esc(c.categoria) : '') + (c.es_invitado ? ' · invitado de la puerta' : '') + '</div></div></div>'
      + '<div class="c-side">' + etapaTag + (c.racha >= 2 ? '<span class="tag warn">🔥 Racha de ' + c.racha + ' días</span>' : '')
      + (c.ig_username ? '<a class="btn" href="https://instagram.com/' + esc(c.ig_username) + '" target="_blank" rel="noopener">Ver su Instagram ↗</a>' : '') + '</div></div>'
      + '<div class="control-strip">' + progresoHtml
      + '<div class="kpi"><div class="k-label">Próximo posteo</div><div class="k-value">' + (proxPost ? esc(fechaCorta(proxPost.dia_key)) : '—') + '</div><div class="k-sub">' + (proxPost ? esc(proxPost.titulo || '') + (proxPost.status === 'draft' ? ' · borrador por decidir' : '') : 'Nada programado') + '</div></div>'
      + necesita + impulsoKpi + '</div>'
      + funda + trat + nota
      + '<div class="sec-title">Su semana <span class="hint">así la ve el cliente</span><span class="spacer"></span>'
      + '<span class="toggle"><button data-vista="semana" class="' + (centroVista === 'semana' ? 'on' : '') + '" type="button">Semana</button><button data-vista="feed" class="' + (centroVista === 'feed' ? 'on' : '') + '" type="button">Su feed</button></span></div>'
      + '<div id="centroCuerpo">' + (centroVista === 'semana' ? week + grid : '<div class="cargando">Cargando su feed…</div>') + '</div>'
      + boostStrip;
    $('centro').classList.remove('fade-swap'); void $('centro').offsetWidth; $('centro').classList.add('fade-swap');
    var sel = $('tratSel');
    if (sel) sel.addEventListener('change', onTratamiento);
    if (centroVista === 'feed') renderFeed();
    // (LOTE CONSERJE-FORMA) El posteo referido por un ítem de la
    // derecha queda abierto en la ficha: se lo trae a la vista y se
    // lo marca, para decidir en el momento sin salir a buscarlo.
    if (highlightPostId) {
      var el = $('post-' + highlightPostId);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('flash');
      }
    }
  }

  function renderFeed() {
    var uid = selUser;
    var cuerpo = $('centroCuerpo');
    if (!cuerpo || !uid) return;
    function pintar(j) {
      if (!j || !j.ok) { cuerpo.innerHTML = '<div class="vacio">No se pudo leer el feed.</div>'; return; }
      if (!j.disponible) {
        cuerpo.innerHTML = '<div class="vacio">Este cliente todavía no tiene su Instagram en la vista del equipo (motivo: ' + esc(j.motivo || 'sin_feed') + '). Sin snapshot no mostramos un feed inventado.</div>';
        return;
      }
      var porId = {};
      ((cliente && cliente.posteos) || []).forEach(function (p) { porId[p.id] = p; });
      var ini = iniciales(cliente && cliente.business_name);
      cuerpo.innerHTML = '<div class="posts">' + (j.tiles || []).map(function (t) {
        var esVideo = /video|reel/.test(String(t.media_type || ''));
        // (LOTE CONSERJE-VER-GRANDE · cierra la F2 del censo 2) La
        // ruta del feed emite la foto en «img», no en «image_url»:
        // las fotos salían sin imagen y no había nada que tocar. El
        // video de un posteo propio sigue yendo por su póster — jamás
        // el .mp4 en un <img> (regla de CONSERJE-FOTO-VIDEO); la tile
        // que viene del Instagram del cliente trae siempre en «img»
        // una imagen real (su tapa), nunca el archivo de video.
        var img = t.poster_url || (esVideo && t.kind === 'post' ? '' : (t.img || t.image_url || ''));
        var aprobable = (t.status === 'scheduled' || t.status === 'draft') && porId[t.post_id] && porId[t.post_id].dia_key;
        var chip = t.status === 'published' ? '<span class="state-chip green">En su Instagram</span>'
          : t.status === 'scheduled' ? '<span class="state-chip sky">Programado</span>'
          : '<span class="state-chip yellow">' + esc(t.status || '') + '</span>';
        var verAttrs = '';
        if (img && t.kind === 'post' && t.post_id) verAttrs = ' data-ver data-ver-post="' + t.post_id + '" data-ver-fb="' + regVisorFallback({ media_type: t.media_type, image_url: '', poster_url: t.poster_url || '', img: t.img || '', caption: '' }) + '"';
        else if (img) verAttrs = ' data-ver data-ver-img="' + esc(img) + '"';
        return '<article class="post"><div class="thumb"' + verAttrs + '>'
          + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<div class="ph"><span class="ph-initial">' + esc(ini) + '</span></div>')
          + (esVideo ? '<span class="play">▶</span>' : '') + chip + '</div>'
          + '<div class="p-body"><div class="p-cap">' + esc(trunc(t.caption || '', 90)) + '</div>'
          + (t.es_revision ? '<div class="p-meta"><span class="mini-chip amarillo">Sale mañana</span></div>' : '')
          + (aprobable ? '<div class="p-actions"><button class="btn primary small" data-act="post-sale" data-id="' + t.post_id + '" data-fecha="' + esc(porId[t.post_id].dia_key) + '" type="button">✓ Sale así</button></div>' : '')
          + '</div></article>';
      }).join('') + '</div>';
    }
    if (feedPorUsuario[uid]) { pintar(feedPorUsuario[uid]); return; }
    api('/api/admin/support/conserje/feed?user_id=' + uid).then(function (j) {
      feedPorUsuario[uid] = j;
      if (selUser === uid && centroVista === 'feed') pintar(j);
    }).catch(function () { cuerpo.innerHTML = '<div class="vacio">No se pudo leer el feed.</div>'; });
  }

  function onTratamiento(ev) {
    var sel = ev.target;
    var fam = sel.value;
    var anterior = cliente ? cliente.tratamiento : '';
    api('/api/admin/conserje/vista/tratamiento', { method: 'POST', body: { user_id: selUser, familia: fam } }).then(function (j) {
      if (j && j.ok) {
        toast(fam ? 'Tratamiento asignado. Quedó registrado en la ficha.' : 'Tratamiento retirado de la ficha.');
        cargar(false);
      } else if (j && j.error === 'colision') {
        sel.value = anterior || '';
        toast('Esa familia ya la lleva ' + (j.ocupa.business_name || 'otro negocio') + (j.ocupa.ig_username ? ' (@' + j.ocupa.ig_username + ')' : '') + '. No se aplicó: dos negocios no salen con el mismo look.', 'warn');
      } else {
        sel.value = anterior || '';
        toast('No se pudo asignar el tratamiento (' + (j && j.error || 'error') + ').', 'err');
      }
    }).catch(function () { sel.value = anterior || ''; toast('No se pudo asignar el tratamiento.', 'err'); });
  }

  // ---------------- visor en grande (LOTE CONSERJE-VER-GRANDE) ----------------
  // Tocar la imagen de un posteo la abre ENTERA: sin recorte, con su
  // caption; el carrusel se recorre lámina a lámina y el video se
  // reproduce con su póster y sus controles. Un solo visor para todas
  // las superficies que muestran la imagen de un posteo (la tarjeta de
  // decisión, la ficha — su semana y su feed — y la producción de
  // mañana). El visor SOLO mira: no decide nada, y al cerrarlo la
  // consola queda exactamente como estaba — mismo scroll, mismo
  // estado: el visor no re-renderiza nada ni recarga nada.
  var visor = { items: [], idx: 0, caption: '', abierto: false };
  var visorFallbacks = {};
  var visorSeq = 0;
  // El respaldo de una superficie: la media que la miniatura YA tiene.
  // Si el pedido de la media completa falla, el visor abre igual con
  // eso que el dueño ya estaba viendo — nunca un hueco en silencio.
  function regVisorFallback(fb) {
    visorSeq += 1;
    var k = 'vf' + visorSeq;
    visorFallbacks[k] = fb || {};
    return k;
  }
  // La lista de piezas del visor desde un payload de media (el del
  // endpoint posteo-media o el respaldo de una superficie): video →
  // su URL reproducible con póster; carrusel → sus láminas en orden;
  // foto → ella sola. Función pura: la suite la ejercita tal cual.
  function visorItemsDe(m) {
    m = m || {};
    var mt = String(m.media_type || '').toLowerCase();
    if (/video|reel/.test(mt)) {
      var vsrc = m.video_url || m.image_url || m.img || '';
      return vsrc ? [{ tipo: 'video', src: vsrc, poster: m.poster_url || '' }] : [];
    }
    var slides = (m.slides || []).filter(Boolean);
    if (slides.length) return slides.map(function (s) { return { tipo: 'img', src: s }; });
    var img = m.image_url || m.img || '';
    return img ? [{ tipo: 'img', src: img }] : [];
  }
  function visorPintar() {
    var media = $('visorMedia');
    if (!media) return;
    var it = visor.items[visor.idx] || null;
    media.innerHTML = !it ? '<div class="v-cargando">Este posteo no tiene imagen para mostrar.</div>'
      : it.tipo === 'video'
        ? '<video src="' + esc(it.src) + '"' + (it.poster ? ' poster="' + esc(it.poster) + '"' : '') + ' controls autoplay muted playsinline></video>'
        : '<img src="' + esc(it.src) + '" alt="">';
    var multi = visor.items.length > 1;
    $('visorDots').innerHTML = multi ? visor.items.map(function (_, i) { return '<i class="' + (i === visor.idx ? 'on' : '') + '"></i>'; }).join('') : '';
    $('visorCount').textContent = multi ? (visor.idx + 1) + ' / ' + visor.items.length : '';
    $('visorCap').textContent = visor.caption || '';
    $('visorPrev').hidden = !multi;
    $('visorNext').hidden = !multi;
  }
  function abrirVisor(items, caption) {
    visor.items = items || [];
    visor.idx = 0;
    visor.caption = caption || '';
    visor.abierto = true;
    $('visor').classList.add('open');
    document.body.style.overflow = 'hidden';
    visorPintar();
  }
  function cerrarVisor() {
    if (!visor.abierto) return;
    visor.abierto = false;
    $('visor').classList.remove('open');
    $('visorMedia').innerHTML = ''; // el video se detiene al salir del DOM
    document.body.style.overflow = '';
  }
  function visorIrA(n) {
    var total = visor.items.length;
    if (!total) return;
    visor.idx = ((n % total) + total) % total;
    visorPintar();
  }
  // El toque en una miniatura ([data-ver]): con posteo propio pide la
  // media completa al endpoint (láminas, video, caption entero) y la
  // cambia en el acto cuando llega; con data-ver-img (las tiles del
  // feed que vienen del Instagram del cliente, sin posteo propio)
  // abre directo con esa imagen.
  function onVerThumb(el) {
    var fb = visorFallbacks[el.getAttribute('data-ver-fb')] || {};
    var imgDirecta = el.getAttribute('data-ver-img');
    if (imgDirecta) { abrirVisor([{ tipo: 'img', src: imgDirecta }], fb.caption || ''); return; }
    var uid = Number(el.getAttribute('data-ver-uid')) || selUser;
    var pid = Number(el.getAttribute('data-ver-post'));
    if (!uid || !pid) { var its0 = visorItemsDe(fb); if (its0.length) abrirVisor(its0, fb.caption || ''); return; }
    abrirVisor(visorItemsDe(fb), fb.caption || '');
    api('/api/admin/support/conserje/posteo-media?user_id=' + uid + '&post_id=' + pid).then(function (j) {
      if (!visor.abierto || !j || !j.ok) return;
      var items = visorItemsDe(j);
      if (items.length) { visor.items = items; visor.idx = 0; visor.caption = j.caption || visor.caption; visorPintar(); }
    }).catch(function () { /* queda el respaldo ya abierto */ });
  }

  // ---------------- decisiones ----------------
  function decTag(d) {
    if (d.tipo === 'voz') return d.es_idea ? '<span class="d-tag">💡 Idea escrita</span>' : '<span class="d-tag">✍ Pedido escrito</span>';
    if (d.tipo === 'subir') return '<span class="d-tag subir">📦 Material subido</span>';
    if (d.tipo === 'pieza') return '<span class="d-tag">🖼 Pieza para aprobar</span>';
    if (d.tipo === 'pieza_falta') return '<span class="d-tag problema">🗓 Mañana sin posteo</span>';
    if (d.tipo === 'post_fallido') return '<span class="d-tag problema">⛔ Posteo que no salió</span>';
    if (d.tipo === 'conexion') return '<span class="d-tag problema">🔌 Conexión caída</span>';
    if (d.tipo === 'impulso') return '<span class="d-tag">🚀 Impulso</span>';
    if (d.tipo === 'prueba_termina') return '<span class="d-tag plata">💛 Termina su prueba hoy</span>';
    if (d.tipo === 'pago_fallido') return '<span class="d-tag plata">💳 Pago fallido</span>';
    if (d.tipo === 'alerta') return '<span class="d-tag alert">⚠ Alerta</span>';
    return '<span class="d-tag">📋 Caso</span>';
  }
  function decCard(d) {
    var head = '<div class="d-top">' + decTag(d) + (d.cuando ? '<span class="d-cuando">' + esc(d.cuando) + '</span>' : '') + '</div>';
    var who = '';
    if (d.tipo === 'alerta') {
      who = '<div class="d-who">' + esc(d.titulo || 'Alerta') + '</div>';
    } else if (d.business_name || d.ig_username) {
      // (LOTE CONSERJE-FORMA) El nombre abre LA COSA MISMA: la ficha
      // del cliente — y si el ítem habla de un posteo, ese posteo
      // abierto dentro de la ficha.
      var postRef = (d.tipo === 'voz' && d.posteo) ? d.posteo.id : (d.post_id || '');
      who = '<div class="d-who"><button class="who-link" data-goto="' + d.user_id + '"' + (postRef ? ' data-goto-post="' + postRef + '"' : '') + ' type="button">'
        + esc(d.business_name || '') + (d.ig_username ? ' <span class="h">@' + esc(d.ig_username) + '</span>' : '') + '</button></div>';
    }
    var cuerpo = '';
    if (d.tipo === 'voz' && d.es_idea) {
      cuerpo = '<div class="d-txt">Idea: <em>«' + esc(d.pedido || '') + '»</em></div>'
        + '<div id="ideaRes-' + d.message_id + '"></div>'
        + '<div class="d-actions"><button class="btn primary small" data-act="idea-resolver" data-mid="' + d.message_id + '" data-uid="' + d.user_id + '" type="button">Resolver y avisar</button>'
        + '<button class="btn small ghost-danger" data-act="voz-descartar" data-mid="' + d.message_id + '" type="button">Descartar</button></div>';
    } else if (d.tipo === 'voz') {
      cuerpo = '<div class="d-txt">Transcripción: <em>«' + esc(d.pedido || '') + '»</em></div>'
        + (d.posteo ? '<div class="thumbrow">' + (d.posteo.image_url || d.posteo.poster_url ? '<span data-ver data-ver-post="' + d.posteo.id + '" data-ver-uid="' + d.user_id + '" data-ver-fb="' + regVisorFallback({ media_type: d.posteo.media_type, image_url: d.posteo.image_url, poster_url: d.posteo.poster_url, caption: d.posteo.caption || '' }) + '"><img src="' + esc(d.posteo.poster_url || d.posteo.image_url) + '" alt=""></span>' : '')
          + '<div class="cap">Sobre el posteo #' + d.posteo.id + ' (' + esc(d.posteo.status || '') + ')<br>' + esc(trunc(d.posteo.caption || '', 110)) + '</div></div>' : '')
        + (d.respuesta ? '<div class="d-promise"><small>Posty entendió</small>' + esc(d.respuesta) + '</div>' : '')
        + '<div id="vozReply-' + d.message_id + '"></div>'
        + '<div class="d-actions">' + (d.posteo ? '<button class="btn small" data-goto="' + d.user_id + '" data-goto-post="' + d.posteo.id + '" type="button">Ver el posteo</button>' : '')
        + '<button class="btn primary small" data-act="voz-responder" data-mid="' + d.message_id + '" data-uid="' + d.user_id + '" type="button">Responder</button>'
        + '<button class="btn small" data-act="voz-resuelto" data-mid="' + d.message_id + '" type="button">Resuelto a mano</button>'
        + '<button class="btn small ghost-danger" data-act="voz-descartar" data-mid="' + d.message_id + '" type="button">Descartar</button></div>';
    } else if (d.tipo === 'pieza') {
      var esVid = /video|reel/.test(String(d.media_type || ''));
      cuerpo = (d.necesita_atencion ? '<div class="d-txt"><span class="att">⚠ ' + esc(d.motivo_atencion || 'Necesita atención') + '</span></div>' : '')
        + (d.image_url || d.poster_url ? '<div class="d-thumb" data-ver data-ver-post="' + (d.post_id || '') + '" data-ver-uid="' + d.user_id + '" data-ver-fb="' + regVisorFallback({ media_type: d.media_type, image_url: d.image_url, poster_url: d.poster_url, caption: d.texto || '' }) + '"><img src="' + esc(d.poster_url || d.image_url) + '" alt="">' + (esVid ? '<span class="play">▶</span>' : '') + '</div>' : '')
        + '<div class="d-txt"><b style="color:var(--ink)">' + esc(d.titulo || '') + '</b><br>' + esc(trunc(d.texto || '', 160)) + '</div>'
        + '<div class="d-actions"><button class="btn primary small" data-act="pieza-sale" data-uid="' + d.user_id + '" data-fecha="' + esc(d.fecha || '') + '" data-pid="' + d.post_id + '" type="button">✓ Sale así</button>'
        + '<button class="btn small" data-act="pieza-arreglar" data-uid="' + d.user_id + '" data-fecha="' + esc(d.fecha || '') + '" data-pid="' + d.post_id + '" type="button">Pedir arreglo</button>'
        + '<button class="btn small ghost-danger" data-act="pieza-nosale" data-uid="' + d.user_id + '" data-fecha="' + esc(d.fecha || '') + '" data-pid="' + d.post_id + '" type="button">No sale</button></div>';
    } else if (d.tipo === 'pieza_falta') {
      cuerpo = '<div class="d-txt">' + esc(d.texto || '') + '</div>'
        + '<div class="d-actions"><button class="btn primary small" data-act="falta-pedir" data-uid="' + d.user_id + '" data-fecha="' + esc(d.fecha || '') + '" type="button">Posty lo arma</button>'
        + '<button class="btn small" data-act="ver-cliente" data-uid="' + d.user_id + '" type="button">Ver la ficha</button></div>';
    } else if (d.tipo === 'impulso') {
      cuerpo = '<div class="d-txt">El impulso del posteo #' + (d.post_id || '—') + ' (US$ ' + (Number(d.budget_cents || 0) / 100).toFixed(0) + ' de pauta) quedó en error. No se cobró gestión.</div>'
        + '<div class="d-error" id="err-' + d.boost_id + '">' + esc(d.texto || '') + '</div>'
        + '<div class="d-actions"><button class="btn primary small" data-act="impulso-ok" data-uid="' + d.user_id + '" data-bid="' + d.boost_id + '" data-pid="' + (d.post_id || '') + '" type="button">Entendido</button>'
        + '<button class="btn small" data-act="impulso-detalle" data-bid="' + d.boost_id + '" type="button">Ver error</button></div>';
    } else if (d.tipo === 'alerta') {
      cuerpo = '<div class="d-txt">' + esc(d.texto || '') + '</div>'
        + (d.kind === 'portada' ? '<div class="d-actions"><button class="btn primary small" data-act="portada-ok" data-uid="' + d.user_id + '" data-pid="' + d.post_id + '" type="button">Entendido</button>'
          + '<button class="btn small" data-act="ver-cliente" data-uid="' + d.user_id + '" type="button">Ver la ficha</button></div>'
          : '<div class="d-actions"><a class="btn small" href="/panel" target="_blank" rel="noopener" style="flex:1;justify-content:center">Ver el panel</a></div>');
    } else if (d.tipo === 'subir') {
      cuerpo = '<div class="d-txt">Subió material' + (d.kind ? ' (' + esc(d.kind) + ')' : '') + ' y espera que se lo armen como posteo.</div>'
        + (d.texto ? '<div class="d-txt"><em>«' + esc(d.texto) + '»</em></div>' : '')
        + '<div class="d-actions"><button class="btn primary small" data-goto="' + d.user_id + '" type="button">Ver la ficha</button></div>';
    } else if (d.tipo === 'post_fallido') {
      // (LOTE CENSO-CONSERJE-2 · F1) El motivo va ABIERTO: la tarjeta
      // lo anuncia («dejó este motivo:») y .d-error sin .open queda en
      // display:none para siempre — esta tarjeta no tiene botón que lo
      // abra, a diferencia de la de impulso, que sí tiene «Ver error».
      cuerpo = '<div class="d-txt">El posteo #' + (d.post_id || '—') + ' no salió. El publicador dejó este motivo:</div>'
        + '<div class="d-error open">' + esc(d.texto || '') + '</div>'
        + '<div class="d-actions"><button class="btn primary small" data-goto="' + d.user_id + '" data-goto-post="' + (d.post_id || '') + '" type="button">Ver el posteo</button>'
        + '<button class="btn small" data-goto="' + d.user_id + '" type="button">Ver la ficha</button></div>';
    } else if (d.tipo === 'conexion') {
      cuerpo = '<div class="d-txt">' + esc(d.texto || '') + '</div>'
        + '<div class="d-actions"><button class="btn primary small" data-goto="' + d.user_id + '" type="button">Ver la ficha</button></div>';
    } else if (d.tipo === 'prueba_termina') {
      cuerpo = '<div class="d-txt">' + esc(d.texto || '') + '</div>'
        + '<div class="d-actions"><button class="btn primary small" data-goto="' + d.user_id + '" type="button">Ver la ficha</button></div>';
    } else if (d.tipo === 'pago_fallido') {
      cuerpo = '<div class="d-txt">' + esc(d.texto || '') + '</div>'
        + '<div class="d-actions"><button class="btn primary small" data-goto="' + d.user_id + '" type="button">Ver la ficha</button></div>';
    } else if (d.tipo === 'caso') {
      cuerpo = '<div class="d-txt"><b style="color:var(--ink)">' + esc(d.titulo || 'Caso') + '</b></div>'
        + (d.texto ? '<div class="d-txt">' + esc(d.texto) + '</div>' : '')
        + (d.siguiente_paso ? '<div class="d-promise"><small>Siguiente paso</small>' + esc(d.siguiente_paso) + '</div>' : '')
        + '<div class="d-actions"><button class="btn small" data-act="ver-cliente" data-uid="' + d.user_id + '" type="button">Ver la ficha</button>'
        + '<button class="btn small ghost-danger" data-act="caso-cerrar" data-cid="' + d.case_id + '" type="button">Cerrar caso</button></div>';
    }
    return '<article class="decision">' + head + who + cuerpo + '</article>';
  }
  // (LOTE CONSERJE-FORMA) La derecha se agrupa por las cuatro clases
  // de «hoy necesita una mano»: pedidos · decisiones · problemas ·
  // plata. La lista llega ya ordenada por clase desde el servidor.
  var MANO_GRUPOS = [
    ['pedido', 'Pedidos de clientes'],
    ['decision', 'Decisiones de hoy'],
    ['problema', 'Problemas'],
    ['plata', 'Plata de hoy'],
  ];
  function renderDecisiones() {
    var ds = (vista && (vista.mano || vista.decisiones)) || [];
    setBadge('rightPending', ds.length);
    if (!ds.length) { $('decisiones').innerHTML = ''; }
    else {
      var html = '';
      for (var g = 0; g < MANO_GRUPOS.length; g++) {
        var items = ds.filter(function (d) { return (d.clase || 'pedido') === MANO_GRUPOS[g][0]; });
        if (!items.length) continue;
        html += '<div class="mano-group">' + MANO_GRUPOS[g][1] + '<span class="chip-n">' + items.length + '</span></div>'
          + items.map(decCard).join('');
      }
      $('decisiones').innerHTML = html;
    }
    $('allDone').classList.toggle('show', !ds.length);
  }
  var ETIQUETAS_VISTA = { tratamiento: 'Asignó tratamiento', voz_resuelta_mano: 'Resolvió un pedido de voz a mano' };
  function renderUltimas() {
    var us = (vista && vista.ultimas) || [];
    $('ultimas').innerHTML = us.length ? us.map(function (u) {
      return '<div class="logrow"><b>' + esc(ETIQUETAS_VISTA[u.action] || u.etiqueta || u.action || '') + '</b> '
        + (u.business_name ? '<span>· ' + esc(u.business_name) + '</span>' : '')
        + ' <span class="w">' + esc(u.cuando || '') + '</span>'
        + (u.detalle ? '<span class="d">' + esc(u.detalle) + '</span>' : '') + '</div>';
    }).join('') : '<div class="vacio">Todavía no hay decisiones registradas.</div>';
  }
  function renderCola() {
    var cs = (vista && vista.cola) || [];
    $('cola').innerHTML = cs.length ? cs.map(function (j) {
      return '<button class="q-chip" data-sel="' + j.user_id + '" type="button"><span class="pulse"></span><b>' + esc(j.business_name || '') + '</b><span class="q-state">· ' + esc(j.titulo || '') + '</span><span class="q-arrow">›</span>'
        + (j.detalle ? '<span class="q-det">' + esc(j.detalle) + '</span>' : '') + '</button>';
    }).join('') : '<span class="vacio">La cola está vacía: no hay producción a mano en curso.</span>';
  }

  // ---------------- carga ----------------
  function cargar(recargarCliente) {
    return api('/api/admin/conserje/vista').then(function (j) {
      if (!j || !j.ok) {
        if (j && (j.__status === 401 || j.__status === 403)) {
          var gm = $('gateMsg');
          if (gm) gm.textContent = 'Ese token no abrió la consola. Revisalo y probá de nuevo.';
          abrirGate(); return;
        }
        toast('No se pudo cargar la consola.', 'err');
        return;
      }
      vista = j;
      renderTop(); renderGasto(); renderSemaforo(); renderRoster(); renderDecisiones(); renderUltimas(); renderCola();
      // (LOTE CONSERJE-FORMA) Al abrir, el centro es la producción de
      // mañana — la vista de trabajo. La ficha se abre solo cuando el
      // dueño toca una cuenta o un ítem (el drill-in); un recargar la
      // conserva si ya estaba abierta, sin auto-abrir ninguna.
      if (recargarCliente && selUser && centroModo === 'ficha') return cargarCliente(selUser);
      renderCentro();
    }).catch(function () { toast('No se pudo cargar la consola.', 'err'); });
  }
  function cargarCliente(uid, postId) {
    centroModo = 'ficha';
    // (LOTE CENSO-CONSERJE-2 · F3) El posteo referido viaja en el
    // pedido: la ficha lo incluye aunque no esté entre los 12 últimos.
    return api('/api/admin/conserje/vista/cliente?user_id=' + uid + (postId ? '&post_id=' + Number(postId) : '')).then(function (j) {
      if (j && j.ok) { cliente = j; renderRoster(); renderCentro(); }
    }).catch(function () { /* la ficha anterior queda: el próximo refresh reintenta */ });
  }
  // (LOTE CONSERJE-FORMA) Cada ítem abre sobre la cosa misma: la
  // ficha del cliente, con el posteo referido marcado y a la vista.
  // (LOTE BOTONES-CONSERJE) Traer el centro a la vista: en el teléfono
  // (una sola columna) la ficha queda fuera de pantalla si nadie la
  // trae, y el toque parece no hacer nada. Las tres vías de entrada a
  // la ficha (la fila y el chip, «Ver…» y «Ver la ficha») usan ESTE
  // mismo gesto, sin segundas vías.
  function irAlCentro() {
    var centro = $('centro');
    if (centro) centro.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function gotoFicha(uid, postId) {
    highlightPostId = postId ? Number(postId) : null;
    selUser = Number(uid);
    // (LOTE BOTONES-CONSERJE) La ficha abre SIEMPRE en la semana, como
    // en las otras dos vías: si quedaba en «Su feed», el posteo
    // referido no existe en esa vista y el toque no mostraba nada.
    centroVista = 'semana';
    cargarCliente(selUser, highlightPostId);
    irAlCentro();
  }
  function despuesDeActuar(msg) {
    if (msg) toast(msg);
    feedPorUsuario = {};
    return cargar(true);
  }

  // ---------------- acciones ----------------
  function decidir(uid, fecha, postId, decision, nota) {
    var body = { user_id: Number(uid), fecha_posteo: fecha, decision: decision };
    if (postId) body.post_id = Number(postId);
    if (nota) body.nota = nota;
    return api('/api/admin/support/conserje/revision/decidir', { method: 'POST', body: body });
  }
  document.addEventListener('click', function (ev) {
    // (LOTE CONSERJE-VER-GRANDE) La imagen de un posteo se mira en
    // grande ANTES que cualquier otra cosa: la miniatura puede vivir
    // dentro de una fila que navega (data-goto) y el toque en la foto
    // es para VERLA, no para ir a la ficha.
    var ver = ev.target.closest('[data-ver]');
    if (ver) { onVerThumb(ver); return; }
    var sel = ev.target.closest('[data-sel]');
    if (sel) { selUser = Number(sel.getAttribute('data-sel')); centroVista = 'semana'; highlightPostId = null; cargarCliente(selUser); irAlCentro(); return; }
    var go = ev.target.closest('[data-goto]');
    if (go) { gotoFicha(go.getAttribute('data-goto'), go.getAttribute('data-goto-post')); return; }
    var f = ev.target.closest('[data-filtro]');
    if (f) { filtro = f.getAttribute('data-filtro'); renderRoster(); return; }
    var v = ev.target.closest('[data-vista]');
    if (v) { centroVista = v.getAttribute('data-vista'); renderCentro(); return; }
    var b = ev.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    b.disabled = true;
    var re = function () { b.disabled = false; };
    if (act === 'ir-manana') {
      centroModo = 'manana'; highlightPostId = null; renderCentro(); re();
    } else if (act === 'limpiar-busqueda') {
      $('buscador').value = ''; renderRoster(); re();
    } else if (act === 'idea-resolver') {
      var midI = b.getAttribute('data-mid'), uidI = b.getAttribute('data-uid');
      var boxI = $('ideaRes-' + midI);
      if (boxI) {
        boxI.innerHTML = '<textarea id="ideaText-' + midI + '" placeholder="Respuesta o pregunta, como Posty (si el resultado es un posteo, podés dejarlo vacío)…"></textarea>'
          + '<input id="ideaPost-' + midI + '" type="number" min="1" placeholder="N° del posteo hecho (opcional)" style="width:100%;margin-top:6px">'
          + '<div class="d-actions"><button class="btn primary small" data-act="idea-enviar" data-mid="' + midI + '" data-uid="' + uidI + '" type="button">Resolver y avisar (push)</button></div>';
        var taI = $('ideaText-' + midI); if (taI) taI.focus();
      }
      re();
    } else if (act === 'idea-enviar') {
      var midI2 = b.getAttribute('data-mid');
      var textoI = (($('ideaText-' + midI2) || {}).value || '').trim();
      var postI = Number((($('ideaPost-' + midI2) || {}).value || '')) || 0;
      if (!textoI && !postI) { toast('Escribí la respuesta o cargá el N° del posteo hecho.', 'warn'); re(); return; }
      var bodyI = { message_id: Number(midI2) };
      if (textoI) bodyI.texto = textoI;
      if (postI) bodyI.post_id = postI;
      api('/api/admin/support/conserje/pedidos-voz/resolver-idea', { method: 'POST', body: bodyI }).then(function (j) {
        if (j && j.ok) despuesDeActuar('Idea resuelta: el cliente recibió la push y ve el resultado en la tarjeta de su idea.');
        else { toast('No se pudo resolver la idea (' + ((j && j.error) || 'error') + ').', 'err'); re(); }
      }).catch(function () { toast('No se pudo resolver la idea.', 'err'); re(); });
    } else if (act === 'voz-responder') {
      var mid = b.getAttribute('data-mid'), uid = b.getAttribute('data-uid');
      var box = $('vozReply-' + mid);
      if (box) {
        box.innerHTML = '<textarea id="vozText-' + mid + '" placeholder="Tu respuesta, como Posty, en el chat del cliente…"></textarea>'
          + '<div class="d-actions"><button class="btn primary small" data-act="voz-enviar" data-mid="' + mid + '" data-uid="' + uid + '" type="button">Enviar y cerrar el pedido</button></div>';
        var ta = $('vozText-' + mid); if (ta) ta.focus();
      }
      re();
    } else if (act === 'voz-enviar') {
      var mid2 = b.getAttribute('data-mid'), uid2 = b.getAttribute('data-uid');
      var texto = ($('vozText-' + mid2) || {}).value || '';
      if (!texto.trim()) { toast('Escribí la respuesta primero.', 'warn'); re(); return; }
      api('/api/admin/support/' + uid2 + '/chat', { method: 'POST', body: { texto: texto } }).then(function (j) {
        if (!j || !j.ok) { toast('No se pudo enviar la respuesta.', 'err'); re(); return; }
        return api('/api/admin/conserje/vista/voz-resuelto', { method: 'POST', body: { message_id: Number(mid2) } }).then(function (j2) {
          if (j2 && j2.ok) despuesDeActuar('Respuesta enviada como Posty y pedido cerrado: lo resolviste a mano.');
          else despuesDeActuar('Respuesta enviada. El pedido quedó sin cerrar: marcalo «Resuelto a mano».');
        });
      }).catch(function () { toast('No se pudo enviar la respuesta.', 'err'); re(); });
    } else if (act === 'voz-resuelto') {
      api('/api/admin/conserje/vista/voz-resuelto', { method: 'POST', body: { message_id: Number(b.getAttribute('data-mid')) } })
        .then(function (j) { if (j && j.ok) despuesDeActuar('Pedido cerrado: resuelto a mano por el equipo.'); else { toast('No se pudo cerrar el pedido.', 'err'); re(); } })
        .catch(function () { toast('No se pudo cerrar el pedido.', 'err'); re(); });
    } else if (act === 'voz-descartar') {
      if (!confirm('¿Descartar este pedido de voz? Queda registrado como descartado.')) { re(); return; }
      api('/api/admin/support/conserje/pedidos-voz/decidir', { method: 'POST', body: { message_id: Number(b.getAttribute('data-mid')), decision: 'descartado' } })
        .then(function (j) { if (j && j.ok) despuesDeActuar('Pedido descartado.'); else { toast('No se pudo descartar.', 'err'); re(); } })
        .catch(function () { toast('No se pudo descartar.', 'err'); re(); });
    } else if (act === 'pieza-sale' || act === 'post-sale') {
      decidir(b.getAttribute('data-uid') || selUser, b.getAttribute('data-fecha'), b.getAttribute('data-pid') || b.getAttribute('data-id'), 'sale')
        .then(function (j) { if (j && j.ok) despuesDeActuar('Sale así: quedó aprobado y programado.'); else { toast('No se pudo aprobar (' + (j && (j.error || j.motivo) || 'error') + ').', 'err'); re(); } })
        .catch(function () { toast('No se pudo aprobar.', 'err'); re(); });
    } else if (act === 'pieza-arreglar') {
      var notaA = prompt('¿Qué hay que arreglar? (queda en la decisión)');
      if (notaA === null) { re(); return; }
      decidir(b.getAttribute('data-uid'), b.getAttribute('data-fecha'), b.getAttribute('data-pid'), 'arreglar', notaA || '')
        .then(function (j) { if (j && j.ok) despuesDeActuar('Arreglo pedido: el posteo no sale hasta rehacerlo.'); else { toast('No se pudo registrar.', 'err'); re(); } })
        .catch(function () { toast('No se pudo registrar.', 'err'); re(); });
    } else if (act === 'pieza-nosale') {
      decidir(b.getAttribute('data-uid'), b.getAttribute('data-fecha'), b.getAttribute('data-pid'), 'no_sale')
        .then(function (j) { if (j && j.ok) despuesDeActuar('No sale: quedó en borrador y el día marcado.'); else { toast('No se pudo registrar.', 'err'); re(); } })
        .catch(function () { toast('No se pudo registrar.', 'err'); re(); });
    } else if (act === 'falta-pedir') {
      decidir(b.getAttribute('data-uid'), b.getAttribute('data-fecha'), null, 'pedir')
        .then(function (j) { if (j && j.ok) despuesDeActuar('Registrado: Posty lo arma. Entró a la cola de producción.'); else { toast('No se pudo registrar.', 'err'); re(); } })
        .catch(function () { toast('No se pudo registrar.', 'err'); re(); });
    } else if (act === 'impulso-detalle') {
      var pre = $('err-' + b.getAttribute('data-bid'));
      if (pre) pre.classList.toggle('open');
      re();
    } else if (act === 'impulso-ok') {
      api('/api/admin/support/' + b.getAttribute('data-uid') + '/accion', { method: 'POST', body: { action: 'impulso_visto', post_id: Number(b.getAttribute('data-pid')) || undefined, detalle: 'boost:' + b.getAttribute('data-bid') + ' — error visto por el equipo desde la consola.' } })
        .then(function (j) { if (j && j.ok) despuesDeActuar('Impulso marcado como visto.'); else { toast('No se pudo registrar.', 'err'); re(); } })
        .catch(function () { toast('No se pudo registrar.', 'err'); re(); });
    } else if (act === 'portada-ok') {
      api('/api/admin/support/' + b.getAttribute('data-uid') + '/accion', { method: 'POST', body: { action: 'portada_vista', post_id: Number(b.getAttribute('data-pid')) || undefined, detalle: 'Alerta de portada vista desde la consola.' } })
        .then(function (j) { if (j && j.ok) despuesDeActuar('Alerta marcada como vista.'); else { toast('No se pudo registrar.', 'err'); re(); } })
        .catch(function () { toast('No se pudo registrar.', 'err'); re(); });
    } else if (act === 'caso-cerrar') {
      if (!confirm('¿Cerrar este caso? Solo si el trabajo ya está hecho: el cierre queda registrado a tu nombre.')) { re(); return; }
      api('/api/admin/conserje/vista/caso-cerrar', { method: 'POST', body: { case_id: Number(b.getAttribute('data-cid')) } })
        .then(function (j) { if (j && j.ok) despuesDeActuar('Caso cerrado.'); else { toast('No se pudo cerrar (' + (j && j.error || 'error') + ').', 'err'); re(); } })
        .catch(function () { toast('No se pudo cerrar.', 'err'); re(); });
    } else if (act === 'ver-cliente') {
      selUser = Number(b.getAttribute('data-uid')); centroVista = 'semana'; cargarCliente(selUser); irAlCentro(); re();
    } else if (act === 'post-reprogramar') {
      var nueva = prompt('Nueva fecha y hora del posteo (ej. 2026-11-21 19:00):', '');
      if (!nueva) { re(); return; }
      api('/api/admin/support/posts/' + b.getAttribute('data-id') + '/reprogramar', { method: 'POST', body: { scheduled_at: nueva } })
        .then(function (j) { if (j && j.ok) despuesDeActuar('Posteo reprogramado.'); else { toast('No se pudo reprogramar (' + (j && j.error || 'error') + ').', 'err'); re(); } })
        .catch(function () { toast('No se pudo reprogramar.', 'err'); re(); });
    } else if (act === 'post-descartar') {
      if (!confirm('¿Descartar este posteo? Es terminal: no se publica ni se reprograma solo.')) { re(); return; }
      api('/api/admin/posts/' + b.getAttribute('data-id') + '/descartar', { method: 'POST', body: { motivo: 'Descartado desde la consola del conserje' } })
        .then(function (j) { if (j && j.ok) despuesDeActuar('Posteo descartado.'); else { toast('No se pudo descartar (' + (j && (j.error || j.motivo) || 'error') + ').', 'err'); re(); } })
        .catch(function () { toast('No se pudo descartar.', 'err'); re(); });
    } else if (act === 'producir') {
      api('/api/admin/conserje/vista/producir', { method: 'POST', body: { user_id: selUser, detalle: 'Falta el posteo del ' + b.getAttribute('data-fecha') + ': producirlo a mano (orden abierta desde la consola).' } })
        .then(function (j) { if (j && j.ok) despuesDeActuar(j.duplicado ? 'Esa orden ya estaba en la cola de producción.' : 'Orden abierta: entró a la cola de producción a mano.'); else { toast('No se pudo abrir la orden.', 'err'); re(); } })
        .catch(function () { toast('No se pudo abrir la orden.', 'err'); re(); });
    } else if (act === 'nota-guardar') {
      var notaTxt = ($('notaInput') || {}).value || '';
      api('/api/admin/support/conserje/nota', { method: 'POST', body: { user_id: selUser, nota: notaTxt } })
        .then(function (j) { if (j && j.ok) despuesDeActuar('Nota guardada en la ficha.'); else { toast('No se pudo guardar la nota.', 'err'); re(); } })
        .catch(function () { toast('No se pudo guardar la nota.', 'err'); re(); });
    } else { re(); }
  });
  // (LOTE CONSERJE-VER-GRANDE) Los controles del visor: la ✕, el
  // toque fuera de la pieza y Esc cierran; las flechas, las teclas
  // ←/→ y el swipe recorren el carrusel. Cerrar no toca el estado de
  // la consola: se vuelve al mismo scroll y a la misma pantalla.
  $('visorCerrar').addEventListener('click', cerrarVisor);
  $('visorPrev').addEventListener('click', function () { visorIrA(visor.idx - 1); });
  $('visorNext').addEventListener('click', function () { visorIrA(visor.idx + 1); });
  $('visor').addEventListener('click', function (ev) { if (ev.target === $('visor')) cerrarVisor(); });
  document.addEventListener('keydown', function (ev) {
    if (!visor.abierto) return;
    if (ev.key === 'Escape') cerrarVisor();
    else if (ev.key === 'ArrowLeft') visorIrA(visor.idx - 1);
    else if (ev.key === 'ArrowRight') visorIrA(visor.idx + 1);
  });
  var visorTouchX = null;
  $('visor').addEventListener('touchstart', function (ev) { visorTouchX = ev.changedTouches[0].clientX; }, { passive: true });
  $('visor').addEventListener('touchend', function (ev) {
    if (visorTouchX == null) return;
    var dx = ev.changedTouches[0].clientX - visorTouchX;
    visorTouchX = null;
    if (Math.abs(dx) > 42) visorIrA(visor.idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
  $('buscador').addEventListener('input', renderRoster);
  $('btnRecargar').addEventListener('click', function () { cargar(true); });

  // ---------------- gate ----------------
  function abrirGate() { $('gate').classList.add('open'); var i = $('gateToken'); if (i) i.focus(); }
  $('gateBtn').addEventListener('click', function () {
    var v = ($('gateToken').value || '').trim();
    if (!v) return;
    token = v;
    try { localStorage.setItem('posta_admin_token', v); } catch (e) {}
    var gmB = $('gateMsg');
    if (gmB) gmB.textContent = '';
    $('gate').classList.remove('open');
    cargar(true);
  });
  $('gateToken').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') $('gateBtn').click(); });

  if (!token) abrirGate();
  else cargar(true).then(function () {
    if (deepUser) { try { gotoFicha(deepUser, deepPost || null); } catch (e) {} }
  });
})();
