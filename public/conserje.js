/* LOTE VISTA-CONSERJE — la consola del operador (bamboo).
   La página no guarda estado propio: cada render sale de la API admin
   en el acto y cada acción escribe en la fuente real de la cosa (la
   decisión de la revisión, el chat del cliente, el registro del
   equipo, la tabla de tratamientos). Después de actuar, la vista se
   relee entera — lo que se ve es lo que la base tiene, nunca una
   copia local que pueda quedar vieja. */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var token = qs.get('token') || '';
  try {
    if (token) localStorage.setItem('posta_admin_token', token);
    else token = localStorage.getItem('posta_admin_token') || '';
  } catch (e) { /* sin storage: el gate pide el token */ }
  if (qs.get('token')) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }

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
  function avaClass(uid) { return 'ava a' + (Math.abs(Number(uid) || 0) % 6); }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fechaCorta(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    return m ? Number(m[3]) + ' ' + MESES[Number(m[2]) - 1] : String(key || '');
  }
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 5200);
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
  var filtro = 'todas';
  var centroVista = 'semana';
  var feedPorUsuario = {};

  // ---------------- tira superior ----------------
  function renderTop() {
    var h = (vista && vista.hoy) || {};
    $('hoyFecha').textContent = h.fecha_label || '';
    $('statPublica').innerHTML = 'Hoy publica <b>' + (h.publica_hoy != null ? h.publica_hoy : '—') + '</b> posteos'
      + (h.proxima_hora ? ' · próximo ' + esc(h.proxima_hora) : '');
    $('statPruebas').innerHTML = 'Pruebas activas <b>' + (h.pruebas_activas != null ? h.pruebas_activas : '—') + '</b>';
    $('statDecisiones').innerHTML = 'Decisiones <span class="pill">' + (h.decisiones_pendientes != null ? h.decisiones_pendientes : '—') + '</span>';
    $('statSubs').innerHTML = 'Suscriptores <b>' + (h.suscriptores != null ? h.suscriptores : '—') + '/' + (h.meta_marzo || 30) + '</b> marzo';
    if (h.disco_mb != null) {
      $('statDisco').style.display = '';
      $('statDisco').innerHTML = 'Disco libre <b>' + h.disco_mb + ' MB</b>';
    }
  }
  function renderGasto() {
    api('/api/admin/ai-costs').then(function (j) {
      if (j && j.ok && j.today_spend_usd != null) {
        $('statGasto').innerHTML = 'Gasto IA hoy <b>US$ ' + Number(j.today_spend_usd).toFixed(2) + '</b>';
      }
    }).catch(function () { /* el gasto es una tira más: si falla, queda el guion */ });
  }

  // ---------------- roster ----------------
  function pasaFiltro(f) {
    if (filtro === 'pruebas') return f.plan_status === 'trial';
    if (filtro === 'clientes') return f.plan_status === 'active';
    if (filtro === 'pendientes') return f.pendientes && f.pendientes.total > 0;
    return true;
  }
  function renderFiltros() {
    var cs = (vista && vista.clientes) || [];
    var defs = [
      ['todas', 'Todas · ' + cs.length],
      ['pruebas', 'Pruebas · ' + cs.filter(function (f) { return f.plan_status === 'trial'; }).length],
      ['clientes', 'Clientes · ' + cs.filter(function (f) { return f.plan_status === 'active'; }).length],
      ['pendientes', 'Con pendientes · ' + cs.filter(function (f) { return f.pendientes && f.pendientes.total > 0; }).length],
    ];
    $('filtros').innerHTML = defs.map(function (d) {
      return '<button class="chip' + (filtro === d[0] ? ' on' : '') + '" data-filtro="' + d[0] + '" type="button">' + esc(d[1]) + '</button>';
    }).join('');
  }
  function renderRoster() {
    renderFiltros();
    var q = ($('buscador').value || '').trim().toLowerCase();
    var cs = ((vista && vista.clientes) || []).filter(pasaFiltro).filter(function (f) {
      if (!q) return true;
      return (f.business_name || '').toLowerCase().indexOf(q) >= 0 || (f.ig_username || '').toLowerCase().indexOf(q) >= 0;
    });
    if (!cs.length) { $('roster').innerHTML = '<div class="vacio">Ninguna cuenta coincide.</div>'; return; }
    $('roster').innerHTML = cs.map(function (f) {
      var dot = f.dot === 'green' ? 'g' : (f.dot === 'yellow' ? 'y' : 'gr');
      var estado = esc(f.estado || '');
      if (f.pendientes && f.pendientes.revision) estado = '<b>●</b> ' + estado;
      return '<div class="client' + (selUser === f.user_id ? ' sel' : '') + '" data-sel="' + f.user_id + '">'
        + '<div class="' + avaClass(f.user_id) + '">' + esc(iniciales(f.business_name)) + '</div>'
        + '<div style="flex:1;min-width:0"><div class="nm">' + esc(f.business_name || 'Sin nombre')
        + (f.racha >= 2 ? '<span class="racha">🔥 ' + f.racha + ' días</span>' : '') + '</div>'
        + '<div class="ig">@' + esc(f.ig_username || '—') + (f.categoria ? ' · ' + esc(f.categoria) : '') + '</div>'
        + '<div class="st">' + estado + '</div></div>'
        + '<span class="dotst ' + dot + '"></span></div>';
    }).join('');
  }

  // ---------------- centro: la ficha ----------------
  function estadoPill(p) {
    if (p.status === 'published') return '<span class="estado pub">Publicado</span>';
    if (p.status === 'scheduled') return '<span class="estado prog">Programado · ' + esc(fechaCorta(p.dia_key)) + '</span>';
    if (p.status === 'draft') return '<span class="estado draft">Borrador</span>';
    return '<span class="estado plan">' + esc(p.status || '') + '</span>';
  }
  function postCard(p, conAcciones) {
    var img = p.poster_url || p.image_url || '';
    var esVideo = /video|reel/.test(String(p.media_type || ''));
    var acts = '';
    if (conAcciones && (p.status === 'draft' || p.status === 'scheduled')) {
      acts = '<div class="acts">'
        + '<button class="btn small primary" data-act="post-sale" data-id="' + p.id + '" data-fecha="' + esc(p.dia_key || '') + '" type="button">✓ Sale así</button>'
        + '<button class="btn small" data-act="post-reprogramar" data-id="' + p.id + '" type="button">Reprogramar</button>'
        + '<button class="btn small warn" data-act="post-descartar" data-id="' + p.id + '" type="button">Descartar</button></div>';
    }
    return '<article class="post"><div class="thumb">'
      + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="ph">🖼</span>')
      + (esVideo ? '<span class="play">▶</span>' : '')
      + '</div><div class="body"><div class="t">' + esc(p.titulo || 'Posteo') + '</div>'
      + (p.caption ? '<div class="c">' + esc(p.caption) + '</div>' : '')
      + '<div class="meta">' + estadoPill(p) + (p.tipo ? '<span class="estado plan">' + esc(p.tipo) + '</span>' : '') + '</div>'
      + acts + '</div></article>';
  }
  function planCard(slot) {
    return '<article class="post"><div class="thumb"><div class="plan-veil"><div>Día ' + slot.dia + '<br><span style="color:var(--ink70);font-weight:500">En producción · sale ' + esc(slot.fecha || '') + (slot.hora ? ' ' + esc(slot.hora) : '') + '</span></div></div></div>'
      + '<div class="body"><div class="t">' + esc(slot.nombre || 'Pieza del día ' + slot.dia) + '</div>'
      + '<div class="meta"><span class="estado plan">Plan de prueba</span>'
      + (slot.formato ? '<span class="fchip">' + esc(slot.formato) + '</span>' : '') + '</div></div></article>';
  }
  function renderCentro() {
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
      ? '<span class="tag ' + (c.etapa.clave === 'en_rojo' ? 'warn' : '') + '">' + esc(c.etapa.etiqueta) + '</span>' : '';
    var progresoHtml;
    if (plan) {
      var listos = plan.slots.filter(function (s) { return s.estado === 'listo'; }).length;
      progresoHtml = '<div class="kpi"><small>Progreso de la prueba</small><b>' + listos + ' de ' + plan.slots.length + ' piezas</b>'
        + '<div class="bar"><i style="width:' + Math.round(100 * listos / Math.max(1, plan.slots.length)) + '%"></i></div>'
        + '<span>' + (plan.estrategia_aprobada ? 'Estrategia aprobada por el cliente' : 'Estrategia todavía sin aprobar') + '</span></div>';
    } else {
      progresoHtml = '<div class="kpi"><small>Esta semana</small><b>' + publicadosSemana + ' posteos publicados</b><span>De lunes a domingo, su zona horaria</span></div>';
    }
    var necesita = pend.total === 0
      ? '<div class="kpi"><small>Te necesita</small><b style="color:#8FE3A5">Nada pendiente</b><span>Está al día con el equipo</span></div>'
      : '<div class="kpi"><small>Te necesita</small><b style="color:#FFD98A">' + pend.total + (pend.total === 1 ? ' cosa' : ' cosas') + '</b><span>'
        + [pend.voz ? pend.voz + ' por voz' : '', pend.chat ? pend.chat + ' mensajes' : '', pend.revision ? 'la pieza de mañana' : '', pend.casos ? pend.casos + ' casos' : ''].filter(Boolean).join(' · ') + '</span></div>';
    var impulsoKpi = c.boost
      ? '<div class="kpi"><small>Último impulso</small><b>' + esc(c.boost.status === 'error' ? 'En error' : (c.boost.status || '—')) + '</b><span>US$ ' + (Number(c.boost.budget_cents || 0) / 100).toFixed(0) + ' de pauta · posteo #' + (c.boost.post_id || '—') + '</span></div>'
      : '<div class="kpi"><small>Impulso</small><b>Sin impulsos</b><span>Todavía no impulsó ningún posteo</span></div>';
    var funda = '<div class="funda">'
      + '<div class="fcard"><small>⭐ Producto estrella</small><p>' + (vende.estrella ? esc(vende.estrella) : '<span style="color:var(--ink50)">Sin registrar</span>') + '</p></div>'
      + '<div class="fcard"><small>Estrategia</small><p>' + (ficha.estrategia && ficha.estrategia.linea ? esc(ficha.estrategia.linea) : '<span style="color:var(--ink50)">Sin registrar</span>') + '</p>'
      + (ficha.estrategia && ficha.estrategia.fuente && ficha.estrategia.fuente !== 'sin_datos' ? '<span class="fuente">Fuente: ' + esc(ficha.estrategia.fuente) + '</span>' : '') + '</div>'
      + '<div class="fcard"><small>Audiencia estudiada</small><p>' + (vende.audiencia ? esc(vende.audiencia) : '<span style="color:var(--ink50)">Sin registrar</span>') + '</p></div></div>';
    var familias = (vista && vista.familias) || [];
    var trat = familias.length
      ? '<div class="trat"><small>Tratamiento</small><select id="tratSel">'
        + '<option value="">Sin tratamiento asignado</option>'
        + familias.map(function (f) { return '<option value="' + esc(f.key) + '"' + (c.tratamiento === f.key ? ' selected' : '') + '>' + esc(f.nombre) + '</option>'; }).join('')
        + '</select><span style="color:var(--ink50);font-size:11.5px">Una familia por negocio: si otro ya la lleva, no se aplica y te avisamos.</span>'
        + (plan && plan.formatos && plan.formatos.length ? '<span class="fchips">' + plan.formatos.map(function (f) { return '<span class="fchip">' + esc(f) + '</span>'; }).join('') + '</span>' : '')
        + '</div>'
      : '';
    var nota = '<div class="nota"><input id="notaInput" maxlength="200" placeholder="Nota interna de la ficha (máx. 200)…" value="' + esc((ficha.nota && ficha.nota.texto) || '') + '">'
      + '<button class="btn small" data-act="nota-guardar" type="button">Guardar nota</button></div>';
    var week = '<div class="week">' + (c.semana || []).map(function (d) {
      var cls = d.estado === 'publicado' ? 'ok' : (d.estado === 'falta' ? 'miss' : '');
      if (d.es_hoy) cls += ' hoy';
      var inner = d.estado === 'publicado' ? 'Publicó' : d.estado === 'programado' ? 'Sale ' + esc(d.hora || '')
        : d.estado === 'borrador' ? 'Borrador' : d.estado === 'frenado' ? 'Frenado por el cliente'
        : d.estado === 'falta' ? '⚠ Falta' : '—';
      return '<div class="day ' + cls + '"><b>' + esc(d.dia) + ' ' + esc(d.fecha) + '</b>' + inner
        + (d.estado === 'falta' ? '<div class="mini"><button class="btn small warn" data-act="producir" data-fecha="' + esc(d.key) + '" type="button">Producir ahora</button></div>' : '')
        + '</div>';
    }).join('') + '</div>';
    var enPosteos = {};
    (c.posteos || []).forEach(function (p) { enPosteos[p.id] = true; });
    var planCards = plan ? plan.slots.filter(function (s) { return s.estado !== 'listo' || !s.post_id || !enPosteos[s.post_id]; })
      .filter(function (s) { return s.estado !== 'listo'; }).map(planCard).join('') : '';
    var grid = '<div class="grid">' + (c.posteos || []).map(function (p) { return postCard(p, true); }).join('') + planCards + '</div>';
    if (!(c.posteos || []).length && !planCards) grid = '<div class="vacio">Esta cuenta todavía no tiene posteos.</div>';
    var boostStrip = c.boost && c.boost.status !== 'error'
      ? '<div class="boost"><div style="flex:1"><b>🚀 Impulso ' + esc(c.boost.status || '') + '</b><span>Posteo #' + (c.boost.post_id || '—') + ' · US$ ' + (Number(c.boost.budget_cents || 0) / 100).toFixed(0) + ' de pauta' + (c.boost.fee_cents ? ' · US$ ' + (Number(c.boost.fee_cents) / 100).toFixed(2) + ' de gestión' : '') + '</span></div></div>'
      : '';
    $('centro').innerHTML =
      '<div class="head"><div class="' + avaClass(c.user_id) + '">' + esc(iniciales(c.business_name)) + '</div>'
      + '<div style="flex:1;min-width:200px"><h2>' + esc(c.business_name || 'Sin nombre') + '</h2>'
      + '<div class="sub">@' + esc(c.ig_username || '—') + (c.categoria ? ' · ' + esc(c.categoria) : '') + (c.es_invitado ? ' · invitado de la puerta' : '') + '</div></div>'
      + etapaTag + (c.racha >= 2 ? '<span class="tag warn">🔥 Racha de ' + c.racha + ' días</span>' : '') + '</div>'
      + '<div class="kpis">' + progresoHtml
      + '<div class="kpi"><small>Próximo posteo</small><b>' + (proxPost ? esc(fechaCorta(proxPost.dia_key)) : '—') + '</b><span>' + (proxPost ? esc(proxPost.titulo || '') + (proxPost.status === 'draft' ? ' · borrador por decidir' : '') : 'Nada programado') + '</span></div>'
      + necesita + impulsoKpi + '</div>'
      + funda + trat + nota
      + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:var(--ink50)">Su semana</h3>'
      + '<span class="toggle"><button data-vista="semana" class="' + (centroVista === 'semana' ? 'on' : '') + '" type="button">Semana</button><button data-vista="feed" class="' + (centroVista === 'feed' ? 'on' : '') + '" type="button">Su feed</button></span></div>'
      + '<div id="centroCuerpo">' + (centroVista === 'semana' ? week + grid : '<div class="cargando">Cargando su feed…</div>') + '</div>'
      + boostStrip;
    var sel = $('tratSel');
    if (sel) sel.addEventListener('change', onTratamiento);
    if (centroVista === 'feed') renderFeed();
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
      cuerpo.innerHTML = '<div class="grid">' + (j.tiles || []).map(function (t) {
        var img = t.poster_url || t.image_url || '';
        var esVideo = /video|reel/.test(String(t.media_type || ''));
        var aprobable = (t.status === 'scheduled' || t.status === 'draft') && porId[t.post_id] && porId[t.post_id].dia_key;
        return '<article class="post"><div class="thumb">'
          + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="ph">🖼</span>')
          + (esVideo ? '<span class="play">▶</span>' : '') + '</div>'
          + '<div class="body"><div class="c">' + esc(trunc(t.caption || '', 90)) + '</div>'
          + '<div class="meta">' + (t.status === 'published' ? '<span class="estado pub">En su Instagram</span>'
            : t.status === 'scheduled' ? '<span class="estado prog">Programado</span>'
            : '<span class="estado draft">' + esc(t.status || '') + '</span>')
          + (t.es_revision ? '<span class="estado draft">Sale mañana</span>' : '') + '</div>'
          + (aprobable ? '<div class="acts"><button class="btn small primary" data-act="post-sale" data-id="' + t.post_id + '" data-fecha="' + esc(porId[t.post_id].dia_key) + '" type="button">✓ Sale así</button></div>' : '')
          + '</div></article>';
      }).join('') + '</div>';
    }
    if (feedPorUsuario[uid]) { pintar(feedPorUsuario[uid]); return; }
    api('/api/admin/support/conserje/feed?user_id=' + uid).then(function (j) {
      feedPorUsuario[uid] = j;
      if (selUser === uid && centroVista === 'feed') pintar(j);
    }).catch(function () { cuerpo.innerHTML = '<div class="vacio">No se pudo leer el feed.</div>'; });
  }
  function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

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

  // ---------------- decisiones ----------------
  function decCard(d) {
    var who = '<div class="who"><span class="kind ' + (d.tipo === 'voz' ? 'voice' : d.tipo === 'alerta' ? 'alert' : 'piece') + '">'
      + (d.tipo === 'voz' ? '🎙 Nota de voz' : d.tipo === 'pieza' ? '🖼 Pieza para aprobar' : d.tipo === 'pieza_falta' ? '🗓 Mañana sin posteo'
        : d.tipo === 'impulso' ? '🚀 Impulso en error' : d.tipo === 'alerta' ? '⚠ Alerta' : '📋 Caso') + '</span>'
      + (d.business_name ? '<span>' + esc(d.business_name) + (d.ig_username ? ' · @' + esc(d.ig_username) : '') + '</span>' : '')
      + (d.cuando ? '<span style="margin-left:auto">' + esc(d.cuando) + '</span>' : '') + '</div>';
    var cuerpo = '';
    if (d.tipo === 'voz') {
      cuerpo = '<p><b>Pidió:</b> «' + esc(d.pedido || '') + '»</p>'
        + (d.respuesta ? '<div class="promise">Posty entendió: ' + esc(d.respuesta) + '</div>' : '')
        + (d.posteo ? '<div class="thumbrow">' + (d.posteo.image_url || d.posteo.poster_url ? '<img src="' + esc(d.posteo.poster_url || d.posteo.image_url) + '" alt="">' : '')
          + '<div class="cap">Sobre el posteo #' + d.posteo.id + ' (' + esc(d.posteo.status || '') + ')<br>' + esc(trunc(d.posteo.caption || '', 110)) + '</div></div>' : '')
        + '<div id="vozReply-' + d.message_id + '"></div>'
        + '<div class="acts"><button class="btn small primary" data-act="voz-responder" data-mid="' + d.message_id + '" data-uid="' + d.user_id + '" type="button">Responder</button>'
        + '<button class="btn small" data-act="voz-resuelto" data-mid="' + d.message_id + '" type="button">Resuelto a mano</button>'
        + '<button class="btn small warn" data-act="voz-descartar" data-mid="' + d.message_id + '" type="button">Descartar</button></div>';
    } else if (d.tipo === 'pieza') {
      cuerpo = (d.necesita_atencion ? '<p style="color:#FFD98A"><b>⚠ ' + esc(d.motivo_atencion || 'Necesita atención') + '</b></p>' : '')
        + '<div class="thumbrow">' + (d.image_url || d.poster_url ? '<img src="' + esc(d.poster_url || d.image_url) + '" alt="">' : '')
        + '<div class="cap"><b style="color:var(--ink)">' + esc(d.titulo || '') + '</b><br>' + esc(trunc(d.texto || '', 160)) + '</div></div>'
        + '<div class="acts"><button class="btn small primary" data-act="pieza-sale" data-uid="' + d.user_id + '" data-fecha="' + esc(d.fecha || '') + '" data-pid="' + d.post_id + '" type="button">✓ Sale así</button>'
        + '<button class="btn small" data-act="pieza-arreglar" data-uid="' + d.user_id + '" data-fecha="' + esc(d.fecha || '') + '" data-pid="' + d.post_id + '" type="button">Pedir arreglo</button>'
        + '<button class="btn small warn" data-act="pieza-nosale" data-uid="' + d.user_id + '" data-fecha="' + esc(d.fecha || '') + '" data-pid="' + d.post_id + '" type="button">No sale</button></div>';
    } else if (d.tipo === 'pieza_falta') {
      cuerpo = '<p>' + esc(d.texto || '') + '</p>'
        + '<div class="acts"><button class="btn small primary" data-act="falta-pedir" data-uid="' + d.user_id + '" data-fecha="' + esc(d.fecha || '') + '" type="button">Posty lo arma</button>'
        + '<button class="btn small" data-act="ver-cliente" data-uid="' + d.user_id + '" type="button">Ver la ficha</button></div>';
    } else if (d.tipo === 'impulso') {
      cuerpo = '<p>El impulso del posteo #' + (d.post_id || '—') + ' (US$ ' + (Number(d.budget_cents || 0) / 100).toFixed(0) + ' de pauta) quedó en error. No se cobró gestión.</p>'
        + '<pre class="err" id="err-' + d.boost_id + '">' + esc(d.texto || '') + '</pre>'
        + '<div class="acts"><button class="btn small" data-act="impulso-detalle" data-bid="' + d.boost_id + '" type="button">Ver el error</button>'
        + '<button class="btn small primary" data-act="impulso-ok" data-uid="' + d.user_id + '" data-bid="' + d.boost_id + '" data-pid="' + (d.post_id || '') + '" type="button">Entendido</button></div>';
    } else if (d.tipo === 'alerta') {
      cuerpo = '<p><b>' + esc(d.titulo || 'Alerta') + '</b></p><p>' + esc(d.texto || '') + '</p>'
        + (d.kind === 'portada' ? '<div class="acts"><button class="btn small primary" data-act="portada-ok" data-uid="' + d.user_id + '" data-pid="' + d.post_id + '" type="button">Entendido</button>'
          + '<button class="btn small" data-act="ver-cliente" data-uid="' + d.user_id + '" type="button">Ver la ficha</button></div>'
          : '<div class="acts"><a class="btn small" href="/panel" target="_blank" rel="noopener">Ver el panel</a></div>');
    } else if (d.tipo === 'caso') {
      cuerpo = '<p><b>' + esc(d.titulo || 'Caso') + '</b></p>'
        + (d.texto ? '<p style="color:var(--ink70)">' + esc(d.texto) + '</p>' : '')
        + (d.siguiente_paso ? '<div class="quote"><small>Siguiente paso</small>' + esc(d.siguiente_paso) + '</div>' : '')
        + '<div class="acts"><button class="btn small" data-act="ver-cliente" data-uid="' + d.user_id + '" type="button">Ver la ficha</button>'
        + '<button class="btn small warn" data-act="caso-cerrar" data-cid="' + d.case_id + '" type="button">Cerrar caso</button></div>';
    }
    return '<div class="dec' + (d.tipo === 'alerta' ? ' alert' : '') + '">' + who + cuerpo + '</div>';
  }
  function renderDecisiones() {
    var ds = (vista && vista.decisiones) || [];
    $('decN').textContent = ds.length;
    $('decisiones').innerHTML = ds.length ? ds.map(decCard).join('') : '<div class="vacio">Nada espera decisión. 🎉</div>';
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
      return '<div class="job" data-sel="' + j.user_id + '"><span class="spin"></span><span><b>' + esc(j.business_name || '') + '</b> · ' + esc(j.titulo || '')
        + (j.detalle ? '<br><small>' + esc(j.detalle) + '</small>' : '') + '</span></div>';
    }).join('') : '<span class="vacio">La cola está vacía: no hay producción a mano en curso.</span>';
  }

  // ---------------- carga ----------------
  function cargar(recargarCliente) {
    return api('/api/admin/conserje/vista').then(function (j) {
      if (!j || !j.ok) {
        if (j && (j.__status === 401 || j.__status === 403)) { abrirGate(); return; }
        toast('No se pudo cargar la consola.', 'err');
        return;
      }
      vista = j;
      renderTop(); renderGasto(); renderRoster(); renderDecisiones(); renderUltimas(); renderCola();
      if (!selUser && vista.clientes.length) {
        var conPend = vista.clientes.filter(function (f) { return f.pendientes && f.pendientes.total > 0; })[0];
        selUser = (conPend || vista.clientes[0]).user_id;
      }
      if (selUser) return cargarCliente(selUser);
    }).catch(function () { toast('No se pudo cargar la consola.', 'err'); });
  }
  function cargarCliente(uid) {
    return api('/api/admin/conserje/vista/cliente?user_id=' + uid).then(function (j) {
      if (j && j.ok) { cliente = j; renderRoster(); renderCentro(); }
    }).catch(function () { /* la ficha anterior queda: el próximo refresh reintenta */ });
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
    var sel = ev.target.closest('[data-sel]');
    if (sel) { selUser = Number(sel.getAttribute('data-sel')); centroVista = 'semana'; cargarCliente(selUser); return; }
    var f = ev.target.closest('[data-filtro]');
    if (f) { filtro = f.getAttribute('data-filtro'); renderRoster(); return; }
    var v = ev.target.closest('[data-vista]');
    if (v) { centroVista = v.getAttribute('data-vista'); renderCentro(); return; }
    var b = ev.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    b.disabled = true;
    var re = function () { b.disabled = false; };
    if (act === 'voz-responder') {
      var mid = b.getAttribute('data-mid'), uid = b.getAttribute('data-uid');
      var box = $('vozReply-' + mid);
      if (box) {
        box.innerHTML = '<textarea id="vozText-' + mid + '" placeholder="Tu respuesta, como Posty, en el chat del cliente…"></textarea>'
          + '<div class="acts"><button class="btn small primary" data-act="voz-enviar" data-mid="' + mid + '" data-uid="' + uid + '" type="button">Enviar y cerrar el pedido</button></div>';
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
      var notaA = prompt('¿Qué hay que arreglar? (queda en la decisión)') || '';
      decidir(b.getAttribute('data-uid'), b.getAttribute('data-fecha'), b.getAttribute('data-pid'), 'arreglar', notaA)
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
      selUser = Number(b.getAttribute('data-uid')); centroVista = 'semana'; cargarCliente(selUser); re();
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
  $('buscador').addEventListener('input', renderRoster);
  $('btnRecargar').addEventListener('click', function () { cargar(true); });

  // ---------------- gate ----------------
  function abrirGate() { $('gate').classList.add('open'); var i = $('gateToken'); if (i) i.focus(); }
  $('gateBtn').addEventListener('click', function () {
    var v = ($('gateToken').value || '').trim();
    if (!v) return;
    token = v;
    try { localStorage.setItem('posta_admin_token', v); } catch (e) {}
    $('gate').classList.remove('open');
    cargar(true);
  });
  $('gateToken').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') $('gateBtn').click(); });

  if (!token) abrirGate();
  else cargar(true);
})();
