/* LOTE CONSERJE-V1 — la consola del operador (bamboo) con la piel del
   mock v1 aprobado por Valentino. El cableado es el de VISTA-CONSERJE
   (v1184), intacto: mismos endpoints, mismas acciones, mismas fuentes.
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
      ['todos', 'Todos', cs.length],
      ['pruebas', 'Pruebas', cs.filter(function (f) { return f.plan_status === 'trial'; }).length],
      ['clientes', 'Clientes', cs.filter(function (f) { return f.plan_status === 'active'; }).length],
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
      + ' hoy:</b> ' + esc(lista) + '. Todo está en Decisiones →</div>';
  }
  function renderRoster() {
    renderFiltros();
    renderRosterFoot();
    var q = ($('buscador').value || '').trim().toLowerCase();
    var cs = ((vista && vista.clientes) || []).filter(pasaFiltro).filter(function (f) {
      if (!q) return true;
      return (f.business_name || '').toLowerCase().indexOf(q) >= 0 || (f.ig_username || '').toLowerCase().indexOf(q) >= 0;
    });
    if (!cs.length) { $('roster').innerHTML = '<div class="roster-empty">Ningún cliente coincide con ese filtro.</div>'; return; }
    $('roster').innerHTML = cs.map(function (f) {
      var dot = f.dot === 'green' ? 'green' : (f.dot === 'yellow' ? 'yellow' : 'grey');
      var meta = [f.categoria || '', f.plan_status === 'trial' ? 'Prueba' : (f.plan_status === 'active' ? 'Cliente' : '')].filter(Boolean).join(' · ');
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
    return '<article class="post"><div class="thumb">'
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
      '<div class="c-head"><div class="c-id"><span class="' + avaClass(c.user_id) + '">' + esc(ini) + '</span>'
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
        var img = t.poster_url || t.image_url || '';
        var esVideo = /video|reel/.test(String(t.media_type || ''));
        var aprobable = (t.status === 'scheduled' || t.status === 'draft') && porId[t.post_id] && porId[t.post_id].dia_key;
        var chip = t.status === 'published' ? '<span class="state-chip green">En su Instagram</span>'
          : t.status === 'scheduled' ? '<span class="state-chip sky">Programado</span>'
          : '<span class="state-chip yellow">' + esc(t.status || '') + '</span>';
        return '<article class="post"><div class="thumb">'
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

  // ---------------- decisiones ----------------
  function decTag(d) {
    if (d.tipo === 'voz') return d.es_idea ? '<span class="d-tag">💡 Idea escrita</span>' : '<span class="d-tag">🎙 Nota de voz</span>';
    if (d.tipo === 'pieza') return '<span class="d-tag">🖼 Pieza para aprobar</span>';
    if (d.tipo === 'pieza_falta') return '<span class="d-tag">🗓 Mañana sin posteo</span>';
    if (d.tipo === 'impulso') return '<span class="d-tag">🚀 Impulso</span>';
    if (d.tipo === 'alerta') return '<span class="d-tag alert">⚠ Alerta</span>';
    return '<span class="d-tag">📋 Caso</span>';
  }
  function decCard(d) {
    var head = '<div class="d-top">' + decTag(d) + (d.cuando ? '<span class="d-cuando">' + esc(d.cuando) + '</span>' : '') + '</div>';
    var who = '';
    if (d.tipo === 'alerta') {
      who = '<div class="d-who">' + esc(d.titulo || 'Alerta') + '</div>';
    } else if (d.business_name || d.ig_username) {
      who = '<div class="d-who">' + esc(d.business_name || '') + (d.ig_username ? ' <span class="h">@' + esc(d.ig_username) + '</span>' : '') + '</div>';
    }
    var cuerpo = '';
    if (d.tipo === 'voz' && d.es_idea) {
      cuerpo = '<div class="d-txt">Idea: <em>«' + esc(d.pedido || '') + '»</em></div>'
        + '<div id="ideaRes-' + d.message_id + '"></div>'
        + '<div class="d-actions"><button class="btn primary small" data-act="idea-resolver" data-mid="' + d.message_id + '" data-uid="' + d.user_id + '" type="button">Resolver y avisar</button>'
        + '<button class="btn small ghost-danger" data-act="voz-descartar" data-mid="' + d.message_id + '" type="button">Descartar</button></div>';
    } else if (d.tipo === 'voz') {
      cuerpo = '<div class="d-txt">Transcripción: <em>«' + esc(d.pedido || '') + '»</em></div>'
        + (d.posteo ? '<div class="thumbrow">' + (d.posteo.image_url || d.posteo.poster_url ? '<img src="' + esc(d.posteo.poster_url || d.posteo.image_url) + '" alt="">' : '')
          + '<div class="cap">Sobre el posteo #' + d.posteo.id + ' (' + esc(d.posteo.status || '') + ')<br>' + esc(trunc(d.posteo.caption || '', 110)) + '</div></div>' : '')
        + (d.respuesta ? '<div class="d-promise"><small>Posty entendió</small>' + esc(d.respuesta) + '</div>' : '')
        + '<div id="vozReply-' + d.message_id + '"></div>'
        + '<div class="d-actions"><button class="btn primary small" data-act="voz-responder" data-mid="' + d.message_id + '" data-uid="' + d.user_id + '" type="button">Responder</button>'
        + '<button class="btn small" data-act="voz-resuelto" data-mid="' + d.message_id + '" type="button">Resuelto a mano</button>'
        + '<button class="btn small ghost-danger" data-act="voz-descartar" data-mid="' + d.message_id + '" type="button">Descartar</button></div>';
    } else if (d.tipo === 'pieza') {
      var esVid = /video|reel/.test(String(d.media_type || ''));
      cuerpo = (d.necesita_atencion ? '<div class="d-txt"><span class="att">⚠ ' + esc(d.motivo_atencion || 'Necesita atención') + '</span></div>' : '')
        + (d.image_url || d.poster_url ? '<div class="d-thumb"><img src="' + esc(d.poster_url || d.image_url) + '" alt="">' + (esVid ? '<span class="play">▶</span>' : '') + '</div>' : '')
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
    } else if (d.tipo === 'caso') {
      cuerpo = '<div class="d-txt"><b style="color:var(--ink)">' + esc(d.titulo || 'Caso') + '</b></div>'
        + (d.texto ? '<div class="d-txt">' + esc(d.texto) + '</div>' : '')
        + (d.siguiente_paso ? '<div class="d-promise"><small>Siguiente paso</small>' + esc(d.siguiente_paso) + '</div>' : '')
        + '<div class="d-actions"><button class="btn small" data-act="ver-cliente" data-uid="' + d.user_id + '" type="button">Ver la ficha</button>'
        + '<button class="btn small ghost-danger" data-act="caso-cerrar" data-cid="' + d.case_id + '" type="button">Cerrar caso</button></div>';
    }
    return '<article class="decision">' + head + who + cuerpo + '</article>';
  }
  function renderDecisiones() {
    var ds = (vista && vista.decisiones) || [];
    setBadge('rightPending', ds.length);
    $('decisiones').innerHTML = ds.length ? ds.map(decCard).join('') : '';
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
    if (act === 'idea-resolver') {
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
