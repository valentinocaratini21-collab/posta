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

  // (LOTE CONSERJE-INSTALABLE) La consola instalada registra el mismo
  // /sw.js de la casa. Su política ya es la que la consola necesita:
  // SOLO cachea la lista de íconos de la app del cliente; el HTML, el
  // JS, el CSS y la API van siempre por red — ningún asset de la
  // consola se sirve desde caché y la frescura la sigue mandando el
  // sello ?v= de esta hoja. Registrarlo no cambia esa política.
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('/sw.js').catch(function () { /* sin SW la consola anda igual, por red */ }); } catch (e) { /* idem */ }
  }

  // (LOTE PUSH-DESTINO · 22/11) Deep link de la push «pidió un cambio»:
  // ?user=<uid> (&post=<id>) — al terminar la primera carga, la consola
  // abre la ficha de ese cliente con el posteo marcado (gotoFicha, el
  // mismo camino que un toque en la cartera o en la cola).
  var deepUser = Number(qs.get('user') || 0) || 0;
  var deepPost = Number(qs.get('post') || 0) || 0;
  // (LOTE CONSERJE-INICIO · AGREGADO C) El destino de la push se
  // consume al abrir y se limpia de la URL en el acto: no queda
  // pegado cuando el dueño pasa a otro cliente con las flechas.
  if (qs.get('user') || qs.get('post')) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }

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
  // (LOTE CONSERJE-PRODUCTO-DISENO) El degradé del avatar por negocio,
  // determinista por user_id: el mismo en el riel, la barra y el teléfono.
  var AVA_GRADS = ['linear-gradient(135deg,#b0722e,#6b3f14)','linear-gradient(135deg,#3a4a5a,#101c28)','linear-gradient(135deg,#c0392b,#6e1f14)','linear-gradient(135deg,#b04a8a,#5f2350)','linear-gradient(135deg,#2793C8,#0A1E33)','linear-gradient(135deg,#1E9E5A,#0d5c31)','linear-gradient(135deg,#7a4ab0,#33184a)','linear-gradient(135deg,#d4692a,#7a3410)'];
  function avaGrad(uid) { return AVA_GRADS[Math.abs(Number(uid) || 0) % AVA_GRADS.length]; }
  var rosterOrden = [];
  // (LOTE CONSERJE-INICIO) El mini-estado de la fila del roster, en
  // las dos pieles: hoy ✓/✗, mañana ✓/✗ y los pedidos sin revisar.
  function miniSym(e) { return e === 'salio' ? '✓' : e === 'programado' ? '◷' : e === 'falta' ? '⚠' : e === 'fallo' ? '✗' : e === 'freno' ? '⛔' : '—'; }
  function miniTxt(m) {
    return 'hoy ' + miniSym(m.hoy) + ' · mañana ' + miniSym(m.manana)
      + (m.pedidos_nuevos ? ' · <span class="nuevo">' + m.pedidos_nuevos + (m.pedidos_nuevos === 1 ? ' pedido nuevo' : ' pedidos nuevos') + '</span>' : '');
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

  // ---------------- Avisos del operador (LOTE CONSERJE-PUSH-OPERADOR) --
  // La consola instalada ofrece activar los avisos: el permiso y la
  // suscripción de ESTE dispositivo, registrados por la puerta admin
  // (la consola entra con token, no con sesión de cliente) y atados a
  // la identidad del operador en el servidor (la cuenta de la casa).
  // El flujo de permiso/suscripción es el mismo de la app del cliente
  // (vapid-key → permiso → pushManager.subscribe), cambia la puerta.
  var opPushSuscrito = null; // null = todavía no se consultó el estado
  function opPushKeyToU8(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = window.atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function opPushPintar() {
    var b = $('btnOpPush');
    if (b) b.textContent = opPushSuscrito ? '🔔 Avisos ✓' : '🔔 Activar avisos';
    if (mTab === 'mas') renderMovil();
  }
  function opPushRefrescar() {
    api('/api/admin/conserje/push/estado').then(function (j) {
      opPushSuscrito = !!(j && j.ok && j.suscrito);
      opPushPintar();
    }).catch(function () { /* sin estado: el botón queda en «activar» */ });
  }
  function activarAvisosOperador() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast('Este dispositivo no puede recibir avisos desde acá.', 'err'); return;
    }
    if (Notification.permission === 'denied') {
      toast('Los avisos están bloqueados en este dispositivo. Activalos desde los ajustes del navegador.', 'err'); return;
    }
    api('/api/push/vapid-key').then(function (r) {
      if (!r || !r.key) { toast('Los avisos no están disponibles en el servidor.', 'err'); return null; }
      var pedir = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
      return pedir.then(function (perm) {
        if (perm !== 'granted') { toast('Sin permiso no puedo avisarte.', 'err'); return null; }
        return navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.getSubscription().then(function (sub) {
            return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: opPushKeyToU8(r.key) });
          });
        });
      });
    }).then(function (sub) {
      if (!sub) return;
      var j = sub.toJSON();
      api('/api/admin/conserje/push/suscribir', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } }).then(function (res) {
        if (res && res.ok) {
          opPushSuscrito = true; opPushPintar();
          toast('Avisos activados: te aviso cuando un negocio te necesite.');
        } else toast('No se pudo activar el aviso en este dispositivo.', 'err');
      }).catch(function () { toast('No se pudo activar el aviso en este dispositivo.', 'err'); });
    }).catch(function () { toast('No se pudo activar el aviso en este dispositivo.', 'err'); });
  }

  var vista = null;
  // (LOTE CONSERJE-VIVO) La consola se refresca sola y avisa los
  // pedidos nuevos. Hasta hoy la vista era la foto del momento en
  // que se abrió la página: un pedido que llegaba con la consola
  // abierta no aparecía hasta tocar «Actualizar» (pasó el 26/11 con
  // el pedido 1099: estaba en la cola desde las 21:33 y el dueño no
  // lo vio en el panel). pedidosConocidos = ids de decisiones clase
  // «pedido» de la última carga (null = todavía no hubo ninguna);
  // pedidosSinVer = los nuevos que el aviso todavía no llevó a la
  // vista.
  var pedidosConocidos = null;
  var pedidosSinVer = [];
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
      + (h.pruebas_activas != null ? h.pruebas_activas : '—') + '</span>'
      + (h.pruebas_esperando ? '<span class="ts-label">· ' + h.pruebas_esperando + ' esperando conexión</span>' : '');
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
    var conProb = ((vista && vista.clientes) || []).filter(function (f) { return f.urgencia && f.urgencia.nivel < 3; });
    $('proxBar').innerHTML = conProb.length ? '<button class="btn primary prox-btn" data-act="ir-proximo" type="button">Ir al próximo con problemas → (' + conProb.length + ')</button>' : '';
    renderRosterFoot();
    var q = ($('buscador').value || '').trim().toLowerCase();
    var base = ((vista && vista.clientes) || []).filter(pasaFiltro);
    var cs = base.filter(function (f) {
      if (!q) return true;
      return (f.business_name || '').toLowerCase().indexOf(q) >= 0 || (f.ig_username || '').toLowerCase().indexOf(q) >= 0 || (f.email || '').toLowerCase().indexOf(q) >= 0;
    });
    // (LOTE CONSERJE-PRODUCTO-ACCION) La lista se ordena por
    // urgencia: pedido vencido, hoy sin posteo, semana incompleta,
    // el resto — y dentro del mismo nivel, el que más espera.
    cs.sort(function (a, b) {
      var na = a.urgencia ? a.urgencia.nivel : 3, nb = b.urgencia ? b.urgencia.nivel : 3;
      if (na !== nb) return na - nb;
      return ((b.urgencia && b.urgencia.espera_min) || 0) - ((a.urgencia && a.urgencia.espera_min) || 0);
    });
    // (LOTE CONSERJE-PRODUCTO-DISENO) El orden visible del riel es el
    // orden del switcher ‹ › y de las flechas del teclado.
    rosterOrden = cs.map(function (f) { return f.user_id; });
    var rcEl = $('railCount'); if (rcEl) rcEl.textContent = cs.length + ' de ' + ((vista && vista.clientes) || []).length;
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
      var chipCls = 'd-ok', chipTxt = 'todo ok';
      if (f.urgencia && f.urgencia.nivel === 0) { var np = (f.pendientes ? (f.pendientes.voz || 0) + (f.pendientes.ideas || 0) : 0); chipCls = 'd-req'; chipTxt = np > 0 ? (np + (np === 1 ? ' pedido' : ' pedidos')) : 'pedido'; }
      else if (f.urgencia && f.urgencia.nivel === 1) { chipCls = 'd-bad'; chipTxt = 'sin posteo'; }
      else if (f.urgencia && f.urgencia.nivel === 2) { chipCls = 'd-req'; chipTxt = 'incompleta'; }
      return '<button class="client-row' + (selUser === f.user_id ? ' selected' : '') + '" data-sel="' + f.user_id + '" type="button">'
        + '<span class="' + avaClass(f.user_id) + '" style="--avag:' + avaGrad(f.user_id) + '">' + esc(iniciales(f.business_name)) + '</span>'
        + '<span class="cr-main"><span class="cr-name">' + esc(f.business_name || 'Sin nombre') + '</span>'
        + (f.racha >= 2 ? '<span class="racha">🔥 ' + f.racha + ' días</span>' : '')
        + ' <span class="cr-handle">@' + esc(f.ig_username || '—') + '</span>'
        + (meta ? '<span class="cr-meta">' + esc(meta) + '</span>' : '')
        + (f.urgencia && f.urgencia.nivel < 3 ? '<span class="cr-urg urg' + f.urgencia.nivel + '">' + esc(f.urgencia.detalle || '') + '</span>' : '')
        + '<span class="cr-state"><span class="dot ' + dot + '"></span>' + esc(f.estado || '') + '</span>'
        + (f.mini ? '<span class="cr-mini">' + miniTxt(f.mini) + '</span>' : '') + '</span>'
        + '<span class="cr-chip ' + chipCls + '">' + esc(chipTxt) + '</span></button>';
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
    // (LOTE CONSERJE-PRODUCTO-DISENO) Con una ficha abierta, la página
    // entera toma el marco del mock v2 (body.ficha-open).
    document.body.classList.toggle('ficha-open', centroModo === 'ficha');
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
  // (LOTE CONSERJE-TAP) El cambio de tratamiento de la ficha. La
  // función se había perdido y el render la seguía enlazando: cada
  // apertura de ficha en la vista «semana» (la del teléfono SIEMPRE;
  // en escritorio, la de data-goto y la pestaña «Su ficha») moría con
  // ReferenceError dentro del .then de cargarCliente — la ficha no
  // abría y el .catch mentía «No se pudo cargar la ficha.». Acá está,
  // contra la puerta de siempre: aplica, avisa el choque de familia
  // con el nombre del que la lleva y restaura el selector si no se
  // pudo.
  function onTratamiento() {
    var selT = $('tratSel');
    if (!selT || !cliente) return;
    var fam = selT.value || '';
    selT.disabled = true;
    api('/api/admin/conserje/vista/tratamiento', { method: 'POST', body: { user_id: Number(cliente.user_id), familia: fam } })
      .then(function (j) {
        if (j && j.ok) {
          cliente.tratamiento = fam || null;
          despuesDeActuar(fam ? 'Tratamiento aplicado a la ficha.' : 'Tratamiento retirado de la ficha.');
        } else if (j && j.error === 'colision' && j.ocupa) {
          toast('Esa familia ya la lleva ' + (j.ocupa.business_name || ('@' + (j.ocupa.ig_username || ''))) + ': no se aplicó.', 'warn');
          renderFicha();
        } else {
          toast('No se pudo aplicar el tratamiento.', 'err');
          renderFicha();
        }
      })
      .catch(function () { toast('No se pudo aplicar el tratamiento.', 'err'); renderFicha(); });
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
    var descHtml = mDescHtml(c);
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
    var filaSelf = ((vista && vista.clientes) || []).filter(function (x) { return x.user_id === c.user_id; })[0] || null;
    var planChipTxt = filaSelf
      ? (filaSelf.clase === 'prueba_corriendo' && filaSelf.prueba && filaSelf.prueba.dias_restantes != null
        ? 'Prueba · quedan ' + filaSelf.prueba.dias_restantes + (filaSelf.prueba.dias_restantes === 1 ? ' día' : ' días')
        : (filaSelf.clase_label || ''))
      : (c.clase_label || '');
    var urgSelf = filaSelf && filaSelf.urgencia ? filaSelf.urgencia : null;
    var alertChip = urgSelf && urgSelf.nivel < 3
      ? '<span class="mkchip ' + (urgSelf.nivel === 1 ? 'bad' : 'warn') + '">' + esc(urgSelf.detalle || urgSelf.motivo || '') + '</span>' : '';
    var posIdx = rosterOrden.indexOf(c.user_id);
    var fichaTop = '<div class="mkbizbar">'
      + '<span class="mkbizava" style="background:' + avaGrad(c.user_id) + '">' + esc(ini) + '</span>'
      + '<div class="mkbizid"><div class="mkbizname">' + esc(c.business_name || 'Sin nombre') + '</div>'
      + '<div class="mkbizig">@' + esc(c.ig_username || '—') + (c.categoria ? ' · ' + esc(c.categoria) : '') + '</div></div>'
      + (planChipTxt ? '<span class="mkchip">' + esc(planChipTxt) + '</span>' : '')
      + alertChip
      + (c.ig_username ? '<a class="mkiglink" href="https://instagram.com/' + esc(c.ig_username) + '" target="_blank" rel="noopener">Ver su Instagram ↗</a>' : '')
      + '<div class="mkswitcher"><button class="mkswbtn" data-act="cli-prev" type="button" title="Cliente anterior">‹</button>'
      + '<span class="mkswpos">' + (posIdx >= 0 ? (posIdx + 1) + ' / ' + rosterOrden.length : '—') + '</span>'
      + '<button class="mkswbtn" data-act="cli-next" type="button" title="Cliente siguiente">›</button></div>'
      + '<button class="mkvolver" data-act="ir-manana" type="button">← Hoy</button>'
      + '</div>'
      + '<div class="mktabs">'
      + '<button data-vista="producto" class="mktab' + (centroVista === 'producto' ? ' on' : '') + '" type="button">Su producto</button>'
      + '<button data-vista="feed" class="mktab' + (centroVista === 'feed' ? ' on' : '') + '" type="button">Su feed</button>'
      + '<button data-vista="material" class="mktab' + (centroVista === 'material' ? ' on' : '') + '" type="button">Material</button>'
      + '<button data-vista="semana" class="mktab' + (centroVista === 'semana' ? ' on' : '') + '" type="button">Su ficha</button>'
      + '</div>';
    var fichaDetalle = '<div class="control-strip">' + progresoHtml
      + '<div class="kpi"><div class="k-label">Próximo posteo</div><div class="k-value">' + (proxPost ? esc(fechaCorta(proxPost.dia_key)) : '—') + '</div><div class="k-sub">' + (proxPost ? esc(proxPost.titulo || '') + (proxPost.status === 'draft' ? ' · borrador por decidir' : '') : 'Nada programado') + '</div></div>'
      + necesita + impulsoKpi + '</div>'
      + funda + trat + nota + descHtml;
    $('centro').innerHTML = fichaTop
      + '<div id="centroCuerpo">'
      + (centroVista === 'semana' ? fichaDetalle + week + grid : centroVista === 'material' ? materialHTML(c) : '<div class="cargando">Cargando…</div>')
      + '</div>'
      + (centroVista === 'semana' ? boostStrip : '');
    $('centro').classList.remove('fade-swap'); void $('centro').offsetWidth; $('centro').classList.add('fade-swap');
    var sel = $('tratSel');
    if (sel) sel.addEventListener('change', onTratamiento);
    if (centroVista === 'feed') renderFeed();
    if (centroVista === 'producto') renderProducto();
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

  // La grilla literal, compartida: la pinta «Su feed» y la pinta
  // «Su producto» (LOTE CONSERJE-PRODUCTO) — una sola fuente del
  // marcado para que el espejo no derive de la vista original.
  function feedTilesHTML(j) {
    var porId = {};
    ((cliente && cliente.posteos) || []).forEach(function (p) { porId[p.id] = p; });
    var ini = iniciales(cliente && cliente.business_name);
    return '<div class="feedgrid">' + (j.tiles || []).map(function (t) {
      var esVideo = /video|reel/.test(String(t.media_type || ''));
      var img = t.poster_url || (esVideo && t.kind === 'post' ? '' : (t.img || t.image_url || ''));
      var aprobable = (t.status === 'scheduled' || t.status === 'draft') && porId[t.post_id] && porId[t.post_id].dia_key;
      var verAttrs = '';
      if (img && t.kind === 'post' && t.post_id) verAttrs = ' data-ver data-ver-post="' + t.post_id + '" data-ver-fb="' + regVisorFallback({ media_type: t.media_type, image_url: '', poster_url: t.poster_url || '', img: t.img || '', caption: '' }) + '"';
      else if (img) verAttrs = ' data-ver data-ver-img="' + esc(img) + '"';
      // (LOTE CONSERJE-ORDEN-SALIDA · agregado del dueño 24/11)
      // La tile compone como la de su producto: las de su
      // Instagram atenuadas (.pub), el borrador con el borde
      // punteado (.fg-draft) y la que él todavía no vio, velada
      // en su lugar (.fg-rev), como en «Su producto».
      var clsTile = 'fg-tile' + (t.kind === 'ig' ? ' pub' : '') + (t.es_revision ? ' fg-rev' : '') + (t.kind === 'post' && t.status === 'draft' ? ' fg-draft' : '');
      return '<div class="' + clsTile + '"' + verAttrs + '>'
        + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<div class="ph"><span class="ph-initial">' + esc(ini) + '</span></div>')
        + (t.es_revision ? '<span class="fg-lock">🔒</span>' : '')
        + (esVideo ? '<span class="fg-play">▶</span>' : '')
        + (t.marca ? '<span class="fg-marca">' + esc(t.marca) + '</span>' : '')
        + (aprobable ? '<button class="fg-sale" data-act="post-sale" data-id="' + t.post_id + '" data-fecha="' + esc(porId[t.post_id].dia_key) + '" type="button" aria-label="Sale así" title="Sale así">✓</button>' : '')
        + '</div>';
    }).join('') + '</div>';
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
      // (LOTE CONSERJE-FEED-GRILLA · pedido del dueño 24/11) «Su
      // feed» es el feed LITERAL de Instagram: la grilla tal cual
      // está hoy con los posteos armados en su posición final —
      // el servidor ya ordena las tiles así — y cada pieza todavía
      // no publicada con su marca chica de día y hora («marca» del
      // servidor). Nada de lista con captions: el dueño aprueba
      // viendo el resultado. La foto sigue siendo la tapa real
      // (el póster en videos propios; la tile de IG trae su tapa)
      // y el toque abre el visor en grande, como siempre.
      cuerpo.innerHTML = feedTilesHTML(j);
    }
    if (feedPorUsuario[uid]) { pintar(feedPorUsuario[uid]); return; }
    api('/api/admin/support/conserje/feed?user_id=' + uid).then(function (j) {
      feedPorUsuario[uid] = j;
      if (selUser === uid && centroVista === 'feed') pintar(j);
    }).catch(function () { cuerpo.innerHTML = '<div class="vacio">No se pudo leer el feed.</div>'; });
  }

  // ---------------- su producto: el espejo del cliente ----------------
  // (LOTE CONSERJE-PRODUCTO · idea del dueño 24/11 19:12) La ficha
  // muestra el producto TAL COMO LO VE EL CLIENTE: su Inicio de hoy
  // con sus palabras y su idioma, la grilla literal, sus pedidos
  // abiertos con la espera, y la próxima pieza marcada como todavía
  // no vista. Lo que su producto esconde (la cola de revisión) acá
  // no se pinta como visto: el servidor compone el espejo.
  // (LOTE CONSERJE-PRODUCTO-DISENO) La pestaña «Material»: el álbum
  // del negocio tal como lo ve él en «Subir», más nuevo primero.
  function materialHTML(c) {
    var mats = (c && c.material) || [];
    if (!mats.length) return '<div class="vacio">Este negocio todavía no subió material. Lo que suba en «Subir» aparece acá, tal como lo ve él.</div>';
    return '<div class="mksec">Su material <span class="hint">lo que subió en Subir, más nuevo primero</span></div>'
      + '<div class="mkmatgrid">' + mats.map(function (m) {
          return '<div class="mkmat"' + (m.img ? ' data-ver data-ver-img="' + esc(m.img) + '"' : '') + '>'
            + (m.img ? '<img src="' + esc(m.img) + '" alt="" loading="lazy">' : '<div class="ph"><span class="ph-initial">—</span></div>')
            + (m.kind === 'video' ? '<span class="fg-play">▶</span>' : '')
            + (m.tag ? '<span class="mkmat-tag">' + esc(m.tag) + '</span>' : '') + '</div>';
        }).join('') + '</div>';
  }

  function renderProducto() {
    var uid = selUser;
    var cuerpo = $('centroCuerpo');
    if (!cuerpo || !uid) return;
    function pintar(j, feed) {
      if (!j || !j.ok) { cuerpo.innerHTML = '<div class="vacio">No se pudo leer su producto.</div>'; return; }
      cuerpo.innerHTML = productoHTML(j, feed);
    }
    api('/api/admin/conserje/vista/producto?user_id=' + uid).then(function (j) {
      var f = feedPorUsuario[uid];
      if (f) { pintar(j, f); return; }
      api('/api/admin/support/conserje/feed?user_id=' + uid).then(function (fj) {
        if (fj && fj.ok) feedPorUsuario[uid] = fj;
        pintar(j, fj && fj.ok ? fj : null);
      }).catch(function () { pintar(j, null); });
    }).catch(function () { cuerpo.innerHTML = '<div class="vacio">No se pudo leer su producto.</div>'; });
  }

  // (LOTE CONSERJE-PRODUCTO-DISENO) «Su producto» con el diseño EXACTO
  // del mock v2 que aprobó el dueño: a la izquierda el TELÉFONO del
  // espejo (perfil, tarjeta del día con su pill y su título en glass,
  // su semana en grilla) y a la derecha las tarjetas blancas — pidió
  // algo, el próximo velado, el estado prometido contra real, su
  // Instagram real y su actividad. La LÓGICA es la de v1327/v1328 sin
  // tocar: mismo payload, mismas acciones por las mismas puertas.
  function productoHTML(j, feed) {
    var en = j.lang === 'en';
    function L(es, enT) { return en ? enT : es; }
    var p = j, h = p.hoy || {};
    var ini = iniciales(j.business_name);
    var grad = avaGrad(j.user_id);
    // --- la tarjeta del día ---
    var pillCls = h.estado === 'publicado' ? 'pub' : (h.estado === 'sale_hoy' || h.estado === 'borrador' ? 'sched' : 'build');
    var daycard = '<div class="mkdaycard">'
      + '<div class="mkcover"' + (h.img ? '' : ' style="background:' + grad + '"') + '>'
      + (h.img ? '<img class="mkcover-img" src="' + esc(h.img) + '" alt="">' : '')
      + '<span class="mkpill ' + pillCls + '">' + esc(h.linea || '') + '</span>'
      + '<div class="mkglass">' + esc(h.titulo || L('Su posteo de hoy', "Today's post")) + '</div></div>'
      + '<div class="mkdaymeta"><b>' + L('Posteo de hoy', "Today's post") + '</b> · ' + esc(h.linea || '')
      + (h.estado === 'sale_hoy' && h.post_id ? '<div class="mkdayact"><button class="btn small" data-act="pieza-arreglar" data-uid="' + j.user_id + '" data-pid="' + h.post_id + '" data-fecha="' + esc(h.fecha_key || '') + '" type="button">↩ ' + L('Rehacer esta pieza', 'Redo this piece') + '</button></div>' : '')
      + '</div></div>';
    // --- su semana en grilla (las piezas del feed, en su orden final) ---
    var porId = {};
    ((cliente && cliente.posteos) || []).forEach(function (x) { porId[x.id] = x; });
    var cells = [];
    ((feed && feed.tiles) || []).slice(0, 9).forEach(function (t) {
      var esVideo = /video|reel/.test(String(t.media_type || ''));
      var img = t.poster_url || (esVideo && t.kind === 'post' ? '' : (t.img || t.image_url || ''));
      var tit = t.post_id && porId[t.post_id] ? (porId[t.post_id].titulo || '') : '';
      var verAttrs = '';
      if (img && t.kind === 'post' && t.post_id) verAttrs = ' data-ver data-ver-post="' + t.post_id + '" data-ver-fb="' + regVisorFallback({ media_type: t.media_type, image_url: '', poster_url: t.poster_url || '', img: t.img || '', caption: '' }) + '"';
      else if (img) verAttrs = ' data-ver data-ver-img="' + esc(img) + '"';
      if (t.en_revision) {
        // (LOTE CONSERJE-INICIO) La pieza que todavía no le mandamos:
        // ocupa su lugar en la grilla, pero VELADA — borrosa y con
        // candado, sin título y sin visor. Él no la vio; el espejo
        // muestra que está y dónde va a caer, nada más.
        cells.push('<div class="mkcell velada">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '')
          + '<span class="mkvel">🔒</span>'
          + (t.marca ? '<span class="mkmark">' + esc(t.marca) + '</span>' : '') + '</div>');
        return;
      }
      // (LOTE SEMANA-CONSERJE · dueño 25/11) La pieza se muestra
      // LIMPIA, como en su producto: la imagen a todo el marco y solo
      // la marca de día/hora adentro. El título NO va más sobre la
      // foto — las piezas ya traen su texto diseñado adentro y la
      // segunda capa lo pisaba (dos textos encimados, cortados a mitad
      // de palabra por el overflow). Sin imagen, la pieza ES el texto:
      // tarjeta con el degradé del negocio, el título en flujo normal
      // y corte limpio con «…» por line-clamp, sin pisar la marca.
      if (img) {
        cells.push('<div class="mkcell"' + verAttrs + '><img src="' + esc(img) + '" alt="" loading="lazy">'
          + (t.marca ? '<span class="mkmark">' + esc(t.marca) + '</span>' : '') + '</div>');
      } else {
        cells.push('<div class="mkcell texto" style="background:' + grad + '">'
          + (t.marca ? '<span class="mkmark">' + esc(t.marca) + '</span>' : '')
          + (tit ? '<span class="mkcell-txt' + (t.marca ? ' conmarca' : '') + '">' + esc(tit) + '</span>' : '') + '</div>');
      }
    });
    // (LOTE SEMANA-CONSERJE) El hueco que completa la grilla se ve
    // VELADO, como promete la nota al pie del espejo («lo que todavía
    // no le mandamos se ve velado, en su lugar»): degradé del negocio
    // y candado — nunca más la caja beige con un guion solo.
    var celdaVacia = '<div class="mkcell velada vacia" style="background:' + grad + '"><span class="mkvel">🔒</span></div>';
    while (cells.length && cells.length % 3 !== 0) cells.push(celdaVacia);
    if (!cells.length) cells = [celdaVacia, celdaVacia, celdaVacia];
    var phone = '<div class="mkphone">'
      + '<div class="mkprof"><span class="mkpava" style="background:' + grad + '">' + esc(ini) + '</span>'
      + '<div><div class="mkpname">' + esc(j.business_name || '') + ' <span class="mkver">✔</span></div>'
      + '<div class="mkpsub">@' + esc(j.ig_username || '—') + (cliente && cliente.categoria ? ' · ' + esc(cliente.categoria) : '') + '</div></div></div>'
      + daycard
      + '<div class="mksec">' + L('Su semana', 'His week') + '</div>'
      + '<div class="mkgrid">' + cells.join('') + '</div>'
      + '<div class="mkchatmir"><span class="mkcm-dot">P</span><div><div class="mkcm-t">Posty</div><div class="mkcm-s">' + L('Su chat: nos escribe y le respondemos', 'His chat: he writes to us and we reply') + '</div></div></div>'
      + '<div class="mkfnote">' + L('Espejo fiel de su Inicio y su grilla, en su idioma y su horario. Lo que todavía no le mandamos se ve velado, en su lugar.', 'A faithful mirror of his Home and his grid, in his language and his timezone. What we have not sent him yet shows veiled, in its place.') + '</div>'
      + '</div>';
    // --- pidió algo (con su semáforo y sus acciones) ---
    var reqs;
    if (!p.pedidos.length) {
      reqs = '<div class="mknone">' + L('No pidió nada.', 'He asked for nothing.')
        + (p.actividad && p.actividad.acepto_hace ? ' ' + L('Su último toque: aceptó un posteo', 'His last touch: he accepted a post') + ' ' + esc(p.actividad.acepto_hace) + '.' : '') + '</div>';
    } else {
      reqs = p.pedidos.map(function (pd) {
        var esIdea = pd.tipo === 'idea';
        var ico = esIdea ? '💡' : '✎';
        var sema = pd.espera_min != null
          ? '<div class="mkreqmeta' + (pd.espera_min > 30 ? ' bad' : '') + '">⏱ ' + (pd.espera_min > 30 ? L('Promesa vencida · ', 'Promise missed · ') : '') + L('espera ', 'waiting ') + esc(pd.hace || '') + '</div>' : '';
        var acts = esIdea
          ? '<button class="btn small" data-act="idea-resolver" data-mid="' + pd.message_id + '" data-uid="' + j.user_id + '" type="button">' + L('Resolver con una pieza', 'Resolve with a piece') + '</button>'
          : '<button class="btn small" data-act="voz-responder" data-mid="' + pd.message_id + '" data-uid="' + j.user_id + '" type="button">' + L('Responder', 'Reply') + '</button>';
        return '<div class="mkreq"><div class="mkreqico' + (esIdea ? ' idea' : '') + '">' + ico + '</div><div class="mkreqmain">'
          + '<div class="mkreqtxt">«' + esc(pd.texto || '') + '»</div>' + sema
          + '<div class="prod-acts">' + acts + '</div>'
          + '<div id="vozReply-' + pd.message_id + '"></div><div id="ideaRes-' + pd.message_id + '"></div>'
          + '</div></div>';
      }).join('');
    }
    // --- el próximo que va a salir (velado) ---
    var s = p.siguiente, nextCard;
    if (!s) {
      nextCard = '<div class="mknone">' + L('Nada en preparación todavía: su semana está completa o su plan arranca cuando conecte.', 'Nothing in preparation yet: his week is complete or his plan starts when he connects.') + '</div>';
    } else {
      var saleTxt = s.fecha ? ' ' + L('Sale', 'Goes out') + ' <b>' + esc(s.fecha) + (s.hora ? ' · ' + esc(s.hora) : '') + '</b>.' : '';
      // (LOTE CONSERJE-ORDEN-SALIDA) La pieza «programada» ya está
      // en su producto: se muestra SIN velo y con su sello propio;
      // el velo y el «todavía no lo vio» son solo para lo que el
      // cliente todavía no vio (en revisión o en preparación).
      var esProg = s.estado === 'programado';
      nextCard = '<div class="mknext">'
        + '<div class="mkveil' + (esProg ? ' clara' : '') + '">' + (s.img ? '<img src="' + esc(s.img) + '" alt="">' : '<span class="mkveil-ph" style="background:' + grad + '"></span>') + '</div>'
        + '<div class="mknexttxt"><span class="' + (esProg ? 'mkseen' : 'mkunseen') + '">' + (esProg ? L('YA LO VE EN SU PRODUCTO', 'ALREADY IN HIS PRODUCT') : L('TODAVÍA NO LO VIO', "HE HASN'T SEEN IT YET")) + '</span><br>'
        + '<b>«' + esc(s.titulo || L('La próxima pieza', 'The next piece')) + '»</b> — ' + esc(s.detalle || '') + saleTxt
        + (s.estado === 'en_revision' && s.post_id ? '<div class="prod-acts"><button class="btn small primary" data-act="pieza-sale" data-uid="' + j.user_id + '" data-pid="' + s.post_id + '" data-fecha="' + esc(s.fecha_key || '') + '" type="button">✓ ' + L('Aceptar — que la vea', 'Accept — let him see it') + '</button></div>' : '')
        + '</div></div>';
    }
    // --- estado: lo prometido contra lo real ---
    var status = (p.promesas || []).map(function (pr) {
      var ic = pr.estado === 'cumplida' ? '<span class="ok">✔</span>' : pr.estado === 'rota' ? '<span class="bad">✖</span>' : '<span class="warn">●</span>';
      return '<li>' + ic + '<span><b>' + esc(pr.texto) + '</b>' + (pr.detalle ? ' — ' + esc(pr.detalle) : '') + '</span></li>';
    }).join('');
    // --- su Instagram real ---
    var ig = p.ig_real || {}, igBody;
    if (ig.estado === 'confirma') {
      igBody = '<div class="mkigrow">' + (ig.ultimo_real && ig.ultimo_real.img ? '<img class="mkigth" src="' + esc(ig.ultimo_real.img) + '" alt="">' : '')
        + '<div><div class="mkigline"><span class="ok">✔</span> ' + L('Su Instagram confirma el último posteo', 'His Instagram confirms the latest post') + (ig.ultimo_producto ? ': <b>«' + esc(ig.ultimo_producto.titulo || '') + '»</b>' : '') + '</div>'
        + '<div class="mkigsub">' + (ig.ultimo_real && ig.ultimo_real.cuando ? L('Último posteo real: ', 'Latest real post: ') + esc(ig.ultimo_real.cuando) + ' · ' : '') + L('lectura', 'read') + ' ' + esc(ig.leido_hace || '') + '</div></div></div>';
    } else if (ig.estado === 'no_esta') {
      igBody = '<div class="mkigline"><span class="bad">✖</span> ' + L('El último posteo figura publicado pero NO está en su Instagram real', 'The latest post shows as published but is NOT on his real Instagram') + (ig.ultimo_producto ? ': <b>«' + esc(ig.ultimo_producto.titulo || '') + '»</b>' : '') + '</div>'
        + '<div class="mkigsub">' + L('Lectura', 'Read') + ' ' + esc(ig.leido_hace || '') + '.</div>';
    } else if (ig.estado === 'sin_publicados') {
      igBody = '<div class="mkigline"><span class="warn">●</span> ' + L('Todavía no publicó nada: no hay nada que contrastar.', 'He has not published anything yet: nothing to cross-check.') + '</div>';
    } else {
      igBody = '<div class="mkigline"><span class="warn">●</span> ' + L('Sin lectura reciente de su Instagram: no afirmamos nada.', 'No recent read of his Instagram: we claim nothing.') + '</div>'
        + (ig.ultimo_real && ig.ultimo_real.cuando ? '<div class="mkigsub">' + L('Último posteo real visto: ', 'Latest real post seen: ') + esc(ig.ultimo_real.cuando) + '.</div>' : '');
    }
    // --- su actividad ---
    var a = p.actividad, actBody;
    if (!a || (!a.ultima_hace && !a.vio_hace && !a.acepto_hace)) {
      actBody = '<div class="mknone">' + L('Sin actividad registrada todavía.', 'No activity recorded yet.') + '</div>';
    } else {
      actBody = '<ul class="mkstatus">'
        + (a.ultima_hace ? '<li><span class="warn">●</span><span>' + L('Última actividad en su producto', 'Last activity in his product') + ' — <b>' + esc(a.ultima_hace) + '</b></span></li>' : '')
        + (a.vio_hace ? '<li><span class="warn">●</span><span>' + L('Vio su Inicio', 'He saw his Home') + ' — <b>' + esc(a.vio_hace) + '</b></span></li>' : '')
        + (a.acepto_hace ? '<li><span class="ok">✔</span><span>' + L('Aceptó un posteo', 'He accepted a post') + ' — <b>' + esc(a.acepto_hace) + '</b></span></li>' : '')
        + '</ul>';
    }
    // --- el chat del dueño con bamboo ---
    var chatBody = (j.dueno_chat || []).map(function (m) {
      var mio = m.autor === 'dueno';
      return '<div class="mkmsg' + (mio ? ' mio' : '') + '"><div class="mkmsg-b">' + esc(m.texto) + '</div><div class="mkmsg-h">' + (mio ? L('Vos', 'You') : 'bamboo') + (m.hace ? ' · ' + esc(m.hace) : '') + '</div></div>';
    }).join('');
    var chatCard = '<div class="mksec">' + L('Chat con bamboo', 'Chat with bamboo') + '</div><div class="mkcard">'
      + '<div class="mkthread">' + (chatBody || '<div class="mknone">' + L('Pedile el cambio que quieras sobre este negocio: me llega como tarea y te respondo acá.', 'Ask for any change about this business: it reaches me as a task and I reply here.') + '</div>') + '</div>'
      + '<div class="mkchatrow"><input id="duenoChatIn" type="text" maxlength="1000" placeholder="' + L('Pedile un cambio a bamboo…', 'Ask bamboo for a change…') + '"><button class="btn primary small" data-act="dueno-enviar" type="button">' + L('Enviar', 'Send') + '</button></div></div>';
    return '<div class="mkcols">'
      + '<div><div class="mksec">' + L('Su producto — así lo ve él', 'His product — as he sees it') + ' <span class="mklive">' + L('ESPEJO EN VIVO', 'LIVE MIRROR') + '</span></div>' + phone + '</div>'
      + '<div>'
      + '<div class="mksec">' + L('Pidió algo', 'He asked for something') + '</div><div class="mkcard">' + reqs + '</div>'
      + '<div class="mksec">' + L('El próximo que va a salir', 'The next one going out') + '</div><div class="mkcard">' + nextCard + '</div>'
      + '<div class="mksec">' + L('Estado', 'Status') + '</div><div class="mkcard"><ul class="mkstatus">' + status + '</ul></div>'
      + '<div class="mksec">' + L('Su Instagram real', 'His real Instagram') + '</div><div class="mkcard">' + igBody + '</div>'
      + '<div class="mksec">' + L('Su actividad', 'His activity') + '</div><div class="mkcard">' + actBody + '</div>'
      + chatCard
      + '</div></div>';
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
      // (LOTE RESPUESTA-HILO-IDEA) Si la idea ya es un hilo (el
      // cliente siguió la conversación desde su tarjeta), la tarjeta
      // muestra la conversación ENTERA en orden: quien resuelve
      // tiene todo el contexto antes de contestar. Con un solo
      // mensaje queda la línea «Idea:» de siempre.
      var ideaHead = '';
      if (d.idea_hilo && d.idea_hilo.length > 1) {
        ideaHead = '<div class="d-hilo">' + d.idea_hilo.map(function (mm) {
          return '<div class="d-hilo-m ' + (mm.rol === 'posty' ? 'posty' : 'cliente') + '"><small>' + (mm.rol === 'posty' ? 'Posty' : 'Cliente') + '</small>' + esc(mm.texto || '') + '</div>';
        }).join('') + '</div>';
      } else {
        ideaHead = '<div class="d-txt">Idea: <em>«' + esc(d.pedido || '') + '»</em></div>';
      }
      cuerpo = ideaHead
        + ((d.idea_piezas && d.idea_piezas.length) ? '<div class="thumbrow">' + d.idea_piezas.map(function (pz) { return pz.thumb ? '<span><img src="' + esc(pz.thumb) + '" alt=""></span>' : ''; }).join('') + '<div class="cap">' + (d.idea_piezas.length === 1 ? 'La pieza que mandó con la idea' : 'Las ' + d.idea_piezas.length + ' piezas que mandó con la idea') + '</div></div>' : '')
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
        // (LOTE CONSERJE-ACCION-REHACER) «Que se rehaga»: la orden
        // queda atada a ESTE posteo. Si ya se pidió, la tarjeta lo
        // muestra registrado y no vuelve a ofrecer el botón.
        + (d.rehacer_pedida
          ? '<div class="d-promise"><small>Rehacer</small>✓ Orden de rehacer registrada (caso #' + (d.rehacer_caso_id || '—') + '): la línea a mano ya lo tiene en su cola.</div>'
            + '<div class="d-actions"><button class="btn primary small" data-goto="' + d.user_id + '" data-goto-post="' + (d.post_id || '') + '" type="button">Ver el posteo</button>'
            + '<button class="btn small" data-goto="' + d.user_id + '" type="button">Ver la ficha</button></div>'
          : '<div class="d-actions"><button class="btn primary small" data-act="fallido-rehacer" data-uid="' + d.user_id + '" data-pid="' + (d.post_id || '') + '" type="button">Que se rehaga</button>'
            + '<button class="btn small" data-goto="' + d.user_id + '" data-goto-post="' + (d.post_id || '') + '" type="button">Ver el posteo</button>'
            + '<button class="btn small" data-goto="' + d.user_id + '" type="button">Ver la ficha</button></div>');
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
  // (LOTE LIMPIEZA-23/11 · ÚLTIMAS-FUERA) La sección «Últimas
  // decisiones» salió de la consola (orden del dueño 23/11): ni el
  // escritorio ni el «Más» del móvil la pintan; el dato
  // vista.ultimas queda en la vista, sin superficie.
  function renderCola() {
    var cs = (vista && vista.cola) || [];
    $('cola').innerHTML = cs.length ? cs.map(function (j) {
      return '<button class="q-chip" data-sel="' + j.user_id + '" type="button"><span class="pulse"></span><b>' + esc(j.business_name || '') + '</b><span class="q-state">· ' + esc(j.titulo || '') + '</span><span class="q-arrow">›</span>'
        + (j.detalle ? '<span class="q-det">' + esc(j.detalle) + '</span>' : '') + '</button>';
    }).join('') : '<span class="vacio">La cola está vacía: no hay producción a mano en curso.</span>';
  }

  // ---------------- LOTE CONSERJE-BANDEJA · la capa móvil ----------------
  // El rediseño phone-first del mock 1 «La bandeja»: la MISMA vista y
  // las MISMAS acciones de la consola, re-presentadas en el teléfono.
  // Hoy reusa decCard — las tarjetas de siempre, con su compositor de
  // respuesta en la tarjeta (resolver-idea / responder por el chat) y
  // sus botones ya cableados por el handler delegado. Negocios
  // compone el tablero semáforo desde vista.clientes + vista.mano y
  // abre la ficha actual (la misma que pinta el escritorio, con su
  // semana y sus posteos). Posteos es la cola de revisión de mañana
  // con las decisiones POR PIEZA de revision/* — «Aprobar todo» no
  // existe del lado operador: la tanda la aprueba el dueño del
  // negocio, es su puerta (fork del CENSO-CONSERJE-3 §5.1). Más trae
  // los accesos. La capa solo pinta: cada acción va
  // por los handlers de siempre y la vista se relee entera.
  var mTab = 'hoy';
  var mFichaUid = null;
  // (LOTE CONSERJE-INICIO) La ficha del cliente en la bandeja es su
  // INICIO (la pantalla simple); la ficha completa de siempre queda
  // detrás del botón «Ver su ficha completa» (mCompleta).
  var mCompleta = false;
  function mProblemaDe(uid) {
    return ((vista && vista.mano) || []).filter(function (d) { return d.user_id === uid && (d.clase || '') === 'problema'; });
  }
  function renderMovil() {
    var body = $('mBody');
    if (!body) return;
    var navBtns = document.querySelectorAll('#movil [data-mtab]');
    for (var i = 0; i < navBtns.length; i++) navBtns[i].classList.toggle('on', navBtns[i].getAttribute('data-mtab') === mTab);
    if (!vista) { body.innerHTML = '<div class="m-cargando">Cargando…</div>'; return; }
    var h = vista.hoy || {};
    $('mSub').textContent = (h.fecha_label ? h.fecha_label + ' · ' : '') + 'todo lo que te necesita, acá';
    var n = (vista.mano || []).length;
    var chip = $('mChip');
    chip.hidden = false;
    if (n > 0) { chip.className = 'm-chip'; chip.textContent = n + (n === 1 ? ' te necesita' : ' te necesitan'); }
    else { chip.className = 'm-chip ok'; chip.textContent = '✓ Todo al día'; }
    if (mTab === 'negocios') body.innerHTML = (mFichaUid && cliente && Number(cliente.user_id) === Number(mFichaUid)) ? (mCompleta ? mFichaCompletaHtml() : mInicioHtml()) : mTableroHtml();
    else if (mTab === 'posteos') body.innerHTML = mPosteosHtml();
    else if (mTab === 'mas') body.innerHTML = mMasHtml();
    else if (mTab === 'descuentos') { body.innerHTML = descuentosHtml(); bindDescuentos(body); }
    else body.innerHTML = mHoyHtml();
    if (mTab === 'negocios' && highlightPostId) {
      var el = $('post-' + highlightPostId);
      if (el) el.scrollIntoView({ block: 'center' });
    }
  }
  // ---------------- datos de la bandeja (LOTE CONSERJE-DATOS-BANDEJA) --
  // La línea del preflight de la casa y los impulsos activos de la
  // cartera, tal como los expone vista.hoy (servidor): sin corrida
  // persistida no hay línea (nada inventado) y sin impulsos activos
  // la tira no aparece. La usan el Hoy móvil y la franja de escritorio.
  function datosBandejaHtml() {
    var h = (vista && vista.hoy) || {};
    var out = '';
    var pf = h.preflight;
    if (pf) {
      if (pf.estado === 'con_defectos') {
        out += '<div class="pf-line bad">⚠ Preflight de la casa: ' + (pf.con_defectos || 0) + ' con defectos de ' + (pf.revisados || 0) + ' revisados'
          + (pf.causas && pf.causas.length ? ' — ' + esc(pf.causas[0]) : '') + '</div>';
      } else {
        out += '<div class="pf-line ok">✓ Preflight de la casa: todo sano — ' + (pf.revisados || 0) + ' revisados</div>';
      }
    }
    var im = h.impulsos_activos || [];
    for (var i = 0; i < im.length; i++) {
      var b = im[i];
      out += '<div class="pf-line boost">🚀 Impulso activo · ' + esc(b.negocio || '') + ' — día ' + (b.dia != null ? b.dia : '—') + ' de ' + (b.dias_total != null ? b.dias_total : '—')
        + ' · gastados US$ ' + (Number(b.gasto_cents || 0) / 100).toFixed(2).replace('.', ',') + ' de US$ ' + (Number(b.presupuesto_cents || 0) / 100).toFixed(0)
        + (b.visitas_perfil != null ? ' · ' + b.visitas_perfil + ' visitas al perfil' : '') + '</div>';
    }
    return out;
  }
  function renderDatosBandeja() {
    var w = $('pfWrap');
    if (!w) return;
    var html = datosBandejaHtml();
    w.innerHTML = html;
    w.hidden = !html;
  }
  function mHoyHtml() {
    var ds = (vista && (vista.mano || vista.decisiones)) || [];
    var top = datosBandejaHtml();
    if (!ds.length) return top + '<div class="m-done">✓ Todo resuelto — nada necesita una mano hoy.</div>';
    var html = top;
    for (var g = 0; g < MANO_GRUPOS.length; g++) {
      var items = ds.filter(function (d) { return (d.clase || 'pedido') === MANO_GRUPOS[g][0]; });
      if (!items.length) continue;
      html += '<div class="mano-group">' + MANO_GRUPOS[g][1] + '<span class="chip-n">' + items.length + '</span></div>' + items.map(decCard).join('');
    }
    return html;
  }
  function mTableroHtml() {
    var cs = (vista && vista.clientes) || [];
    var conPend = cs.filter(function (f) { return f.pendientes && f.pendientes.total > 0; }).length;
    var probUids = {};
    ((vista && vista.mano) || []).forEach(function (d) { if ((d.clase || '') === 'problema' && d.user_id) probUids[d.user_id] = true; });
    var nProb = Object.keys(probUids).length;
    var orden = cs.slice().sort(function (a, b) {
      var pa = probUids[a.user_id] ? 0 : (a.pendientes && a.pendientes.total > 0 ? 1 : 2);
      var pb = probUids[b.user_id] ? 0 : (b.pendientes && b.pendientes.total > 0 ? 1 : 2);
      return pa - pb;
    });
    var html = '<div class="m-sums"><div class="m-sum"><div class="n">' + cs.length + '</div><div class="l">Negocios</div></div>'
      + '<div class="m-sum oro"><div class="n">' + conPend + '</div><div class="l">Para vos</div></div>'
      + '<div class="m-sum rojo"><div class="n">' + nProb + '</div><div class="l">Problema</div></div></div>';
    if (!orden.length) html += '<div class="m-cargando">La cartera viva está vacía.</div>';
    html += orden.map(function (f) {
      var probs = mProblemaDe(f.user_id);
      var dot = probs.length ? 'red' : (f.pendientes && f.pendientes.total > 0 ? 'yellow' : (f.dot === 'green' ? 'green' : (f.dot === 'yellow' ? 'yellow' : 'grey')));
      var ds = probs.length ? trunc(probs[0].texto || probs[0].titulo || 'Tiene un problema', 70)
        : (f.pendientes && f.pendientes.total > 0 ? f.pendientes.total + (f.pendientes.total === 1 ? ' pendiente' : ' pendientes') + (f.estado ? ' · ' + f.estado : '')
          : (f.estado || 'Todo al día'));
      return '<button class="m-biz" data-mbiz="' + f.user_id + '" type="button"><span class="dot ' + dot + '"></span>'
        + '<span><span class="nm">' + esc(f.business_name || 'Sin nombre') + '</span>'
        + '<span class="ds" style="display:block">' + esc(ds) + '</span>'
        + (f.mini ? '<span class="mini">' + miniTxt(f.mini) + '</span>' : '') + '</span><span class="go">›</span></button>';
    }).join('');
    html += '<p class="m-note">Los que necesitan algo suben solos arriba.</p>';
    return html;
  }
  // ---------------- (LOTE CONSERJE-INICIO) el inicio del cliente ----
  // La pantalla simple que el dueño pidió: una sola vista por cliente
  // con el posteo de hoy, el de mañana, su semana de un vistazo, lo
  // que pidió por el chat, lo que subió y qué se hizo con eso, su
  // impulso y su billetera, y el chat de correcciones para bamboo.
  // Cada sección sale de la vista del cliente (conserje-vista); lo
  // que no tiene dato real no se pinta o dice su línea tranquila.
  function keyMasDias(key, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    function p2(x) { return String(x).padStart(2, '0'); }
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  }
  function iniOrdenClientes() {
    if (rosterOrden && rosterOrden.length) return rosterOrden;
    return ((vista && vista.clientes) || []).map(function (f) { return f.user_id; });
  }
  function stepInicioCliente(d) {
    var orden = iniOrdenClientes();
    if (orden.length < 2 || !mFichaUid) return;
    var idx = orden.indexOf(Number(mFichaUid));
    if (idx < 0) return;
    var next = orden[(((idx + d) % orden.length) + orden.length) % orden.length];
    if (!next || next === Number(mFichaUid)) return;
    mFichaUid = next; selUser = next; mCompleta = false; highlightPostId = null;
    cargarCliente(next);
    window.scrollTo(0, 0);
  }
  function iniChipDe(estado) {
    if (estado === 'publicado') return '<span class="ini-chip verde">Ya salió ✓</span>';
    if (estado === 'programado') return '<span class="ini-chip ambar">Programado</span>';
    if (estado === 'en_preparacion') return '<span class="ini-chip ambar">En preparación</span>';
    if (estado === 'fallido') return '<span class="ini-chip rojo">No salió ✗</span>';
    return '';
  }
  // (CORRECCIÓN DEL DUEÑO 27/11 23:5x) El bloque principal NO son
  // tarjetas de operador: es el INICIO LITERAL del cliente, tal como
  // lo ve en su app — su perfil y la grilla de su semana con cada
  // posteo EN SU POSICIÓN FINAL, hoy y mañana etiquetados ADENTRO de
  // su miniatura. Se arma de la misma semana/posteos que trae la
  // vista (la misma fuente de «Su feed» de su ficha). Tocar una pieza
  // abre la hoja de decisión/cambio de ese posteo.
  function iniCeldaHtml(c, d, manKey, horaSalida) {
    var porId = {};
    (c.posteos || []).forEach(function (x) { porId[Number(x.id)] = x; });
    var post = d.post_id ? porId[Number(d.post_id)] : null;
    if (!post && c.inicio) {
      if (d.es_hoy && c.inicio.hoy) post = c.inicio.hoy;
      else if (manKey && d.key === manKey && c.inicio.manana) post = c.inicio.manana;
    }
    var esMan = manKey && d.key === manKey;
    var hora = d.hora || (post && post.hora) || horaSalida || '';
    var marca = '';
    if (post) {
      if (post.estado === 'fallido') marca = d.es_hoy ? 'Hoy · no salió' : 'No salió';
      else if (d.es_hoy) marca = 'Hoy · ' + hora;
      else if (esMan) marca = 'Mañana · ' + hora;
      else if (post.estado === 'publicado') marca = 'Salió ✓';
      else if (post.estado === 'en_preparacion') marca = esc(String(d.dia || '')) + ' · en preparación';
      else marca = esc(String(d.dia || '')) + (hora ? ' · ' + hora : '');
      var img = post.poster_url || post.image_url || '';
      var esVid = /video|reel/.test(String(post.media_type || ''));
      var marcado = highlightPostId && Number(highlightPostId) === Number(post.id);
      return '<button class="ini-cell' + (d.es_hoy ? ' hoy' : '') + '" data-hoja-post="' + post.id + '" id="post-' + post.id + '" type="button"'
        + (marcado ? ' style="box-shadow:0 0 0 3px #2793C8;border-color:#2793C8"' : '') + '>'
        + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="ini-cellph" style="background:' + avaGrad(c.user_id) + '">' + esc(iniciales(c.business_name)) + '</span>')
        + (esVid ? '<span class="ini-play">▶</span>' : '')
        + '<span class="ini-marca' + (d.es_hoy ? ' hoy' : '') + '">' + marca + '</span></button>';
    }
    if (d.estado === 'frenado') {
      return '<div class="ini-cell velada"><span class="ini-vel">⛔</span><span class="ini-marca">No sale</span></div>';
    }
    var marcaV = d.es_hoy ? 'Hoy' : (esMan ? 'Mañana' : esc(d.fecha || d.dia || ''));
    var cell = '<span class="ini-vel">🔒</span>' + (marcaV ? '<span class="ini-marca' + (d.es_hoy ? ' hoy' : '') + '">' + marcaV + '</span>' : '');
    if (d.estado === 'falta') {
      return '<button class="ini-cell velada' + (d.es_hoy ? ' hoy' : '') + '" data-act="producir" data-fecha="' + esc(d.key) + '" type="button" title="Producir el posteo de este día">' + cell + '</button>';
    }
    return '<div class="ini-cell velada' + (d.es_hoy ? ' hoy' : '') + '">' + cell + '</div>';
  }
  function iniLiteralHtml(c) {
    var hora = (c.inicio && c.inicio.hora_salida) || '19:00';
    var hoyKey = '';
    (c.semana || []).forEach(function (d) { if (d.es_hoy) hoyKey = d.key; });
    var manKey = hoyKey ? keyMasDias(hoyKey, 1) : '';
    var cells = (c.semana || []).map(function (d) { return iniCeldaHtml(c, d, manKey, hora); }).join('');
    if (!cells) cells = '<div class="ini-cell velada"><span class="ini-vel">🔒</span></div><div class="ini-cell velada"><span class="ini-vel">🔒</span></div><div class="ini-cell velada"><span class="ini-vel">🔒</span></div>';
    return '<div class="ini-home">'
      + '<div class="ini-prof"><span class="ini-ava" style="background:' + avaGrad(c.user_id) + '">' + esc(iniciales(c.business_name)) + '</span>'
      + '<div style="min-width:0"><div class="ini-pname">' + esc(c.business_name || 'Sin nombre') + '</div>'
      + '<div class="ini-psub">@' + esc(c.ig_username || '—') + (c.categoria ? ' · ' + esc(c.categoria) : '') + '</div></div></div>'
      + '<div class="ini-grid">' + cells + '</div>'
      + '<div class="ini-fnote">Su inicio, tal como lo ve él: su semana ya en su lugar. Tocá una pieza para decidir o cambiarla.</div>'
      + '</div>';
  }
  // La capa del operador, compacta, SOBRE su inicio: su clase, su
  // momento comercial, su negocio en una línea y el salto a su IG.
  function iniOpHtml(c, claseTxt) {
    var inner = '';
    if (claseTxt || c.comercial) {
      inner += '<div class="ini-oprow">' + (claseTxt ? '<span class="ini-clase">' + esc(claseTxt.toUpperCase()) + '</span>' : '')
        + (c.comercial ? '<span class="ini-comercial">' + esc(c.comercial.texto || '') + '</span>' : '') + '</div>';
    }
    if (c.negocio_linea) inner += '<div class="ini-negocio">' + esc(c.negocio_linea.texto || '') + '</div>';
    if (c.ig_username) inner += '<a class="ini-iglink" href="https://instagram.com/' + esc(c.ig_username) + '" target="_blank" rel="noopener">Ver su Instagram ↗</a>';
    return inner ? '<div class="ini-op">' + inner + '</div>' : '';
  }
  function iniPedidosHtml(c) {
    var ps = c.pedidos || [];
    if (!ps.length) return '<div class="ini-calm">No pidió nada por el chat.</div>';
    return ps.map(function (pd) {
      var chip = pd.estado === 'resuelto' ? '<span class="ini-chip verde">Resuelto</span>'
        : pd.estado === 'en_revision' ? '<span class="ini-chip ambar">En revisión</span>'
        : '<span class="ini-chip rojo">Nuevo</span>';
      return '<div class="ini-card"><div class="ini-ped-txt">«' + esc(pd.texto || '') + '»</div>'
        + '<div style="margin-top:7px">' + chip + (pd.hace ? '<span style="font-size:12px;color:#A2937D;font-weight:650;margin-left:8px">' + esc(pd.hace) + '</span>' : '') + '</div>'
        + (pd.estado === 'resuelto' && pd.respuesta ? '<div class="ini-resp">✓ Lo resolví yo: ' + esc(pd.respuesta) + '</div>' : '')
        + '</div>';
    }).join('');
  }
  function iniSubidosHtml(c) {
    var ss = c.subidos || [];
    if (!ss.length) return '<div class="ini-calm">Todavía no subió material — su semana se arma desde su Instagram.</div>';
    return '<div class="ini-card">' + ss.map(function (sm) {
      return '<div class="ini-sub">' + (sm.img ? '<img src="' + esc(sm.img) + '" alt="" loading="lazy">' : '')
        + '<span><span class="st" style="display:block">' + esc(sm.producto || (sm.kind === 'video' ? 'Un video que subió' : 'Una foto que subió')) + '</span>'
        + '<span class="su" style="display:block">' + esc(sm.uso || '') + '</span></span></div>';
    }).join('') + '</div>';
  }
  function iniPlataHtml(c) {
    var out = '';
    var b = c.impulso;
    if (b) out += '<div class="pf-line boost">🚀 Impulso activo — día ' + (b.dia != null ? b.dia : '—') + ' de ' + (b.dias_total != null ? b.dias_total : '—')
      + ' · gastados US$ ' + (Number(b.gasto_cents || 0) / 100).toFixed(2).replace('.', ',') + ' de US$ ' + (Number(b.presupuesto_cents || 0) / 100).toFixed(0)
      + (b.visitas_perfil != null ? ' · ' + b.visitas_perfil + ' visitas al perfil' : '') + '</div>';
    if (c.billetera) out += '<div class="pf-line ok">💰 Billetera: US$ ' + (Number(c.billetera.saldo_cents || 0) / 100).toFixed(2).replace('.', ',') + '</div>';
    return out;
  }
  function iniCorreccionesHtml(c) {
    var cs = c.correcciones || [];
    var hilo = cs.map(function (m) {
      var out = '<div class="ini-corr-msg mio">' + esc(m.texto || '') + (m.hace ? '<span class="hace">' + esc(m.hace) + '</span>' : '') + '</div>';
      if (m.estado === 'aplicada') out += '<div class="ini-corr-msg resp">Hecha ✓' + (m.respuesta ? ' — ' + esc(m.respuesta) : '') + '</div>';
      return out;
    }).join('');
    return (hilo || '<div class="ini-calm">Sin correcciones todavía. Escribile a bamboo lo que haya que cambiar de este cliente.</div>')
      + '<div class="ini-corr-row"><input id="corrIn" type="text" maxlength="1000" placeholder="Escribile una corrección a bamboo…">'
      + '<button class="btn primary" data-act="corr-enviar" type="button">Enviar</button></div>';
  }
  function mInicioHtml() {
    var c = cliente;
    var fila = ((vista && vista.clientes) || []).filter(function (f) { return Number(f.user_id) === Number(c.user_id); })[0] || {};
    var orden = iniOrdenClientes();
    var pos = orden.indexOf(Number(c.user_id));
    var claseTxt = fila.clase_label || '';
    // 1 · la navegación del operador (no es parte de su inicio)
    var html = '<div class="ini-switch">'
      + '<button class="ini-swbtn" data-minav="-1" type="button" aria-label="Cliente anterior">‹</button>'
      + '<div class="ini-swmid"><div class="ini-swname">' + esc(c.business_name || 'Sin nombre') + '</div>'
      + '<div class="ini-swpos">cliente ' + (pos >= 0 ? (pos + 1) + ' de ' + orden.length : '—') + '</div></div>'
      + '<button class="ini-swbtn" data-minav="1" type="button" aria-label="Cliente siguiente">›</button>'
      + '<button class="ini-neg" data-mback type="button">Negocios</button></div>';
    // 2 · la capa del operador, compacta, sobre su inicio
    html += iniOpHtml(c, claseTxt);
    // 3 · SU INICIO LITERAL: su perfil + su semana en su lugar
    html += iniLiteralHtml(c);
    // 4 · el resto (la capa del operador, debajo de su inicio)
    if ((c.alertas || []).length) {
      html += '<div style="margin-top:12px">' + c.alertas.map(function (a) { return '<div class="ini-alert ' + esc(a.tono || 'ambar') + '">⚠ ' + esc(a.texto || '') + '</div>'; }).join('') + '</div>';
    }
    html += '<div class="sec-t">Pidió por el chat</div>' + iniPedidosHtml(c);
    html += '<div class="sec-t">Subió</div>' + iniSubidosHtml(c);
    html += iniPlataHtml(c);
    html += '<div class="sec-t">Correcciones para mí</div>' + iniCorreccionesHtml(c);
    html += '<button class="btn ini-completa" data-mact="ficha-completa" type="button">Ver su ficha completa</button>';
    return html;
  }
  function mFichaCompletaHtml() {
    var c = cliente;
    var ini = iniciales(c.business_name);
    var fila = ((vista && vista.clientes) || []).filter(function (f) { return Number(f.user_id) === Number(c.user_id); })[0] || {};
    var dot = fila.dot === 'green' ? 'green' : (fila.dot === 'yellow' ? 'yellow' : 'grey');
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
    var enPosteos = {};
    (c.posteos || []).forEach(function (p) { enPosteos[p.id] = true; });
    var plan = c.plan_prueba_detalle || null;
    var planCards = plan ? plan.slots.filter(function (s) { return s.estado !== 'listo' || !s.post_id || !enPosteos[s.post_id]; })
      .filter(function (s) { return s.estado !== 'listo'; }).map(function (s) { return planCard(s, ini); }).join('') : '';
    var grid = (c.posteos || []).length || planCards
      ? '<div class="posts">' + (c.posteos || []).map(function (p) { return postCard(p, true, ini); }).join('') + planCards + '</div>'
      : '<div class="m-cargando">Esta cuenta todavía no tiene posteos.</div>';
    return '<button class="m-back" data-mact="volver-inicio" type="button">← Su inicio</button>'
      + '<div class="m-ficha-head"><div class="nm">' + esc(c.business_name || 'Sin nombre') + '</div>'
      + '<div class="hd">@' + esc(c.ig_username || '—') + (c.categoria ? ' · ' + esc(c.categoria) : '') + '</div>'
      + '<div class="st"><span class="dot ' + dot + '"></span>' + esc(fila.estado || '') + '</div></div>'
      + mDescHtml(c)
      + '<div class="sec-t">Su semana</div>' + week
      + '<div class="sec-t">Sus posteos</div>' + grid;
  }
  // ---------------- la hoja de cambio / decisión ----------------
  // (LOTE CONSERJE-INICIO · AGREGADO A) Tocar el posteo de hoy o de
  // mañana abre SU hoja: cambiar la pieza DE VERDAD (otra pieza de su
  // semana por set-image; su material subido por set-media), editar
  // el texto completo (edit-caption) y las decisiones de siempre
  // (Sale / Que no salga / Que se rehaga si falló), por las puertas
  // admin que ya existen. Al guardar, la tarjeta del inicio se
  // re-pinta con lo nuevo (la vista se relee entera).
  var hojaPost = null;
  function cerrarHojaPost() {
    var f = $('iniSheet');
    if (f) f.remove();
    hojaPost = null;
  }
  function abrirHojaPost(postId) {
    var c = cliente;
    if (!c) return;
    var post = (c.posteos || []).filter(function (x) { return Number(x.id) === Number(postId); })[0]
      || (c.inicio && c.inicio.hoy && Number(c.inicio.hoy.id) === Number(postId) ? c.inicio.hoy : null)
      || (c.inicio && c.inicio.manana && Number(c.inicio.manana.id) === Number(postId) ? c.inicio.manana : null);
    if (!post) { toast('Ese posteo ya no está en su semana.', 'warn'); return; }
    hojaPost = { post: post, caption: post.caption || '', assets: null };
    pintarHojaPost();
    api('/api/admin/support/conserje/posteo-media?user_id=' + c.user_id + '&post_id=' + postId).then(function (j) {
      if (!hojaPost || Number(hojaPost.post.id) !== Number(postId) || !j || !j.ok) return;
      hojaPost.caption = j.caption || '';
      var ta = $('hojaCap');
      if (ta && document.activeElement !== ta) ta.value = hojaPost.caption;
    }).catch(function () { /* queda el caption de la vista */ });
    api('/api/admin/support/conserje/material?user_id=' + c.user_id + '&limit=24').then(function (j) {
      if (!hojaPost || Number(hojaPost.post.id) !== Number(postId)) return;
      hojaPost.assets = (j && j.material) || [];
      var box = $('hojaAlts');
      if (box) box.innerHTML = hojaAlternativasHtml();
    }).catch(function () { /* sin material legible: quedan las piezas de la semana */ });
  }
  function hojaAlternativasHtml() {
    var c = cliente, hp = hojaPost;
    if (!c || !hp) return '';
    var p = hp.post;
    var out = (c.posteos || []).filter(function (x) { return Number(x.id) !== Number(p.id) && x.status !== 'published'; }).map(function (x) {
      var img = x.poster_url || x.image_url || '';
      return '<button class="ini-alt" data-cambiar-desde="' + x.id + '" type="button">'
        + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '')
        + '<span><span class="at" style="display:block">' + esc(x.titulo || 'Pieza de su semana') + '</span>'
        + '<span class="as" style="display:block">De su semana · ' + esc(fechaCorta(x.dia_key) || '') + '</span></span></button>';
    }).join('');
    if (hp.assets === null) out += '<div class="ini-calm">Cargando su material…</div>';
    else out += hp.assets.filter(function (a) { return a.kind === 'photo' || a.kind === 'video'; }).map(function (a) {
      var thumb = a.thumb_path || a.file_path || '';
      return '<button class="ini-alt" data-cambiar-asset="' + esc(a.file_path || '') + '" data-asset-kind="' + esc(a.kind || '') + '" data-asset-thumb="' + esc(a.thumb_path || '') + '" type="button">'
        + (thumb ? '<img src="' + esc(thumb) + '" alt="" loading="lazy">' : '')
        + '<span><span class="at" style="display:block">' + esc(a.producto || (a.kind === 'video' ? 'Un video que subió' : 'Una foto que subió')) + '</span>'
        + '<span class="as" style="display:block">Su material subido</span></span></button>';
    }).join('');
    return out || '<div class="ini-calm">No hay otra pieza para poner en su lugar.</div>';
  }
  function pintarHojaPost() {
    var hp = hojaPost;
    cerrarHojaPost();
    var c = cliente;
    if (!c || !hp) return;
    hojaPost = hp;
    var p = hp.post;
    var img = p.poster_url || p.image_url || '';
    var esVid = /video|reel/.test(String(p.media_type || ''));
    var fondo = document.createElement('div');
    fondo.className = 'ini-sheet-fondo';
    fondo.id = 'iniSheet';
    fondo.innerHTML = '<div class="ini-sheet">'
      + '<div class="sh-head">' + (img ? '<img class="ini-thumb" src="' + esc(img) + '" alt="">' : '<span class="ini-thumb ph">' + esc(iniciales(c.business_name)) + '</span>')
      + '<div style="flex:1;min-width:0"><div class="sh-title">' + esc(p.titulo || 'Posteo') + '</div>'
      + iniChipDe(p.estado) + (esVid ? '<span class="ini-chip gris">Video</span>' : '') + '</div>'
      + '<button class="ini-swbtn" data-hoja-cerrar type="button" style="background:#F2EDE3;color:#0A1E33" aria-label="Cerrar">✕</button></div>'
      + '<div class="sec-t">El texto</div>'
      + '<textarea id="hojaCap" maxlength="2200" placeholder="El texto completo del posteo…">' + esc(hp.caption || '') + '</textarea>'
      + '<div class="ini-acts"><button class="btn primary" data-hoja-caption type="button">Guardar el texto</button></div>'
      + '<div class="sec-t">Cambiar la pieza</div><div id="hojaAlts">' + hojaAlternativasHtml() + '</div>'
      + '<div class="sec-t">Decisión</div>'
      + '<div class="ini-acts"><button class="btn primary" data-hoja-sale type="button">✓ Sale así</button>'
      + '<button class="btn" data-hoja-nosale type="button">Que no salga</button></div>'
      + (p.estado === 'fallido'
        ? (p.rehacer_pedida
          ? '<div class="ini-resp" style="margin-top:10px">✓ Orden de rehacer registrada (caso #' + (p.rehacer_caso_id || '—') + '): la línea a mano ya lo tiene en su cola.</div>'
          : '<div class="ini-acts"><button class="btn" data-hoja-rehacer type="button">Que se rehaga</button></div>')
        : '')
      + '</div>';
    document.body.appendChild(fondo);
    fondo.addEventListener('click', function (ev) { onHojaClick(ev, fondo); });
  }
  function hojaTrasCambiar(msg) {
    cerrarHojaPost();
    despuesDeActuar(msg);
  }
  function onHojaClick(ev, fondo) {
    var hp = hojaPost;
    if (!hp) return;
    var p = hp.post;
    if (ev.target === fondo || ev.target.closest('[data-hoja-cerrar]')) { cerrarHojaPost(); return; }
    var bCap = ev.target.closest('[data-hoja-caption]');
    if (bCap) {
      var txt = String(($('hojaCap') || {}).value || '');
      if (!txt.trim()) { toast('El texto no puede quedar vacío.', 'warn'); return; }
      bCap.disabled = true;
      api('/api/admin/posts/' + p.id + '/edit-caption', { method: 'POST', body: { caption: txt, confirm: true } }).then(function (j) {
        if (j && j.ok) hojaTrasCambiar('Texto guardado: el posteo sale con el texto nuevo.');
        else { toast('No se pudo guardar el texto (' + ((j && (j.error || j.motivo)) || 'error') + ').', 'err'); bCap.disabled = false; }
      }).catch(function () { toast('No se pudo guardar el texto.', 'err'); bCap.disabled = false; });
      return;
    }
    var bDesde = ev.target.closest('[data-cambiar-desde]');
    if (bDesde) {
      bDesde.disabled = true;
      api('/api/admin/posts/' + p.id + '/set-image', { method: 'POST', body: { from_post_id: Number(bDesde.getAttribute('data-cambiar-desde')) } }).then(function (j) {
        if (j && j.ok) hojaTrasCambiar('Pieza cambiada: el posteo sale con la pieza elegida.');
        else { toast('No se pudo cambiar la pieza (' + ((j && (j.error || j.motivo)) || 'error') + ').', 'err'); bDesde.disabled = false; }
      }).catch(function () { toast('No se pudo cambiar la pieza.', 'err'); bDesde.disabled = false; });
      return;
    }
    var bAsset = ev.target.closest('[data-cambiar-asset]');
    if (bAsset) {
      var ruta = bAsset.getAttribute('data-cambiar-asset');
      var kindA = bAsset.getAttribute('data-asset-kind') || '';
      var thumbA = bAsset.getAttribute('data-asset-thumb') || '';
      if (!ruta) { toast('Ese material no tiene archivo.', 'err'); return; }
      bAsset.disabled = true;
      toast('Aplicando su material al posteo…');
      var aDataUri = function (url) {
        return fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
          return new Promise(function (res, rej) {
            var fr = new FileReader();
            fr.onload = function () { res(String(fr.result || '')); };
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          });
        });
      };
      aDataUri(ruta).then(function (dataUri) {
        var bodyM = { media: dataUri };
        if (kindA === 'video' && thumbA) {
          return aDataUri(thumbA).then(function (coverUri) { bodyM.cover = coverUri; return bodyM; }).catch(function () { return bodyM; });
        }
        return bodyM;
      }).then(function (bodyM) {
        return api('/api/admin/posts/' + p.id + '/set-media', { method: 'POST', body: bodyM });
      }).then(function (j) {
        if (j && j.ok) hojaTrasCambiar('Pieza cambiada: el posteo sale con su material.');
        else { toast('No se pudo cambiar la pieza (' + ((j && (j.error || j.motivo)) || 'error') + ').', 'err'); bAsset.disabled = false; }
      }).catch(function () { toast('No se pudo cambiar la pieza.', 'err'); bAsset.disabled = false; });
      return;
    }
    var bSale = ev.target.closest('[data-hoja-sale]');
    if (bSale) {
      bSale.disabled = true;
      decidir(cliente.user_id, p.dia_key, p.id, 'sale').then(function (j) {
        if (j && j.ok) hojaTrasCambiar('Sale así: quedó aprobado y programado.');
        else { toast('No se pudo aprobar (' + ((j && (j.error || j.motivo)) || 'error') + ').', 'err'); bSale.disabled = false; }
      }).catch(function () { toast('No se pudo aprobar.', 'err'); bSale.disabled = false; });
      return;
    }
    var bNo = ev.target.closest('[data-hoja-nosale]');
    if (bNo) {
      bNo.disabled = true;
      decidir(cliente.user_id, p.dia_key, p.id, 'no_sale').then(function (j) {
        if (j && j.ok) hojaTrasCambiar('No sale: quedó en borrador y el día marcado.');
        else { toast('No se pudo registrar (' + ((j && (j.error || j.motivo)) || 'error') + ').', 'err'); bNo.disabled = false; }
      }).catch(function () { toast('No se pudo registrar.', 'err'); bNo.disabled = false; });
      return;
    }
    var bRe = ev.target.closest('[data-hoja-rehacer]');
    if (bRe) {
      bRe.disabled = true;
      api('/api/admin/conserje/vista/producir', { method: 'POST', body: { user_id: Number(cliente.user_id), post_id: Number(p.id), detalle: 'Que se rehaga este posteo: orden atada al posteo abierta desde su hoja en el inicio del cliente.' } }).then(function (j) {
        if (j && j.ok) hojaTrasCambiar(j.duplicado ? 'Ese rehacer ya estaba pedido: la orden sigue en la cola.' : 'Orden de rehacer registrada: entró a la cola de producción a mano.');
        else { toast('No se pudo pedir el rehacer (' + ((j && j.error) || 'error') + ').', 'err'); bRe.disabled = false; }
      }).catch(function () { toast('No se pudo pedir el rehacer.', 'err'); bRe.disabled = false; });
    }
  }
  function mPosteosHtml() {
    var m = vista && vista.manana;
    if (!m || !m.items || !m.items.length) return '<div class="m-cargando">No hay producción de mañana para revisar.</div>';
    var fecha = m.fecha || '';
    var html = '<div class="sec-t" style="margin-top:2px">Cola de revisión · ' + esc(m.fecha_label || 'mañana') + '</div>';
    html += m.items.map(function (i) {
      var estadoTxt = i.estado === 'listo' ? (i.sin_posteo_decidido ? 'No sale · decidido' : 'Listo') : (i.estado === 'en_preparacion' ? (i.post ? 'Propuesta por decidir' : 'Posty lo arma') : 'Falta');
      var head = '<div class="mp-in"><div class="mp-biz">' + esc(i.business_name || 'Sin nombre') + '</div>';
      if (!i.post) {
        return '<div class="m-post">' + head + '<div class="mp-title">' + (i.sin_posteo_decidido ? 'El dueño decidió que mañana no sale' : 'Sin posteo para mañana') + '</div>'
          + '<span class="m-state ' + i.estado + '">' + estadoTxt + '</span>'
          + (i.sin_posteo_decidido ? '' : '<div class="mp-acts"><button class="btn primary" data-act="falta-pedir" data-uid="' + i.user_id + '" data-fecha="' + esc(fecha) + '" type="button">Posty lo arma</button></div>')
          + '</div></div>';
      }
      var img = i.post.poster_url || i.post.image_url || '';
      var esVid = /video|reel/.test(String(i.post.media_type || ''));
      var decidable = i.estado === 'en_preparacion' && !i.sin_posteo_decidido;
      return '<div class="m-post">'
        + (img ? '<button class="mp-thumb" data-ver data-ver-post="' + i.post.id + '" data-ver-uid="' + i.user_id + '" data-ver-fb="' + regVisorFallback({ media_type: i.post.media_type, image_url: i.post.image_url, poster_url: i.post.poster_url, caption: i.post.caption || '' }) + '" type="button"><img src="' + esc(img) + '" alt="" loading="lazy">' + (esVid ? '<span class="play">▶</span>' : '') + '</button>' : '')
        + head + '<div class="mp-title">' + esc(i.post.titulo || 'Posteo de mañana') + '</div>'
        + (i.necesita_atencion ? '<div class="mp-att">⚠ ' + esc(i.motivo_atencion || 'Necesita atención') + '</div>' : '')
        + '<span class="m-state ' + i.estado + '">' + estadoTxt + '</span>'
        + (decidable ? '<div class="mp-acts"><button class="btn primary" data-act="pieza-sale" data-uid="' + i.user_id + '" data-fecha="' + esc(fecha) + '" data-pid="' + i.post.id + '" type="button">✓ Sale</button>'
          + '<button class="btn" data-act="pieza-arreglar" data-uid="' + i.user_id + '" data-fecha="' + esc(fecha) + '" data-pid="' + i.post.id + '" type="button">Arreglar</button>'
          + '<button class="btn" data-act="pieza-nosale" data-uid="' + i.user_id + '" data-fecha="' + esc(fecha) + '" data-pid="' + i.post.id + '" type="button">No sale</button></div>' : '')
        + '</div></div>';
    }).join('');
    return html;
  }
  function mMasHtml() {
    // (LOTE CONSERJE-INICIO · nota AVISOS-APAGADOS) El botón «Activar
    // avisos» ya no se ofrece: el dueño apagó las notificaciones de
    // clientes por completo y el sistema de avisos quedó dormido —
    // no tiene sentido invitar a activar algo apagado por decisión
    // suya. La maquinaria de suscripción queda en el código, dormida.
    return '<div class="sec-t" style="margin-top:2px">Accesos</div>'
      + '<button class="m-link" data-mact="escritorio" type="button">🖥️ Consola completa<span class="go">›</span></button>'
      + '<a class="m-link" href="/panel">🧭 Panel de soporte<span class="go">›</span></a>'
      + '<button class="m-link" data-mact="descuentos" type="button">🏷️ Descuentos por código<span class="go">›</span></button>'
      + '<button class="m-link" data-mact="recargar" type="button">↻ Actualizar la vista<span class="go">›</span></button>';
  }
  // La delegación de la capa móvil: convive con la de siempre (que
  // sigue atendiendo los data-act / data-goto / data-ver de las
  // tarjetas). Un toque en un nombre con data-goto dentro de una
  // tarjeta de Hoy también deja la capa en la ficha de ese negocio,
  // para que el drill-in se vea en la piel del teléfono.
  document.addEventListener('click', function (ev) {
    var tb = ev.target.closest('[data-mtab]');
    if (tb) { mTab = tb.getAttribute('data-mtab'); if (mTab !== 'negocios') mFichaUid = null; renderMovil(); window.scrollTo(0, 0); return; }
    var bz = ev.target.closest('[data-mbiz]');
    if (bz) { mFichaUid = Number(bz.getAttribute('data-mbiz')); selUser = mFichaUid; mCompleta = false; centroVista = 'semana'; highlightPostId = null; cargarCliente(mFichaUid); window.scrollTo(0, 0); return; }
    if (ev.target.closest('[data-mback]')) { mFichaUid = null; mCompleta = false; renderMovil(); return; }
    // (LOTE CONSERJE-INICIO) Las flechas de la franja del inicio y la
    // apertura de la hoja del posteo de hoy/mañana.
    var nv = ev.target.closest('[data-minav]');
    if (nv) { stepInicioCliente(Number(nv.getAttribute('data-minav')) || 0); return; }
    var hj = ev.target.closest('[data-hoja-post]');
    if (hj) { abrirHojaPost(Number(hj.getAttribute('data-hoja-post'))); return; }
    var ac = ev.target.closest('[data-mact]');
    if (ac) {
      var a = ac.getAttribute('data-mact');
      if (a === 'escritorio') { document.body.classList.add('ver-escritorio'); window.scrollTo(0, 0); }
      else if (a === 'recargar') { cargar(true); }
      else if (a === 'descuentos') { mTab = 'descuentos'; renderMovil(); window.scrollTo(0, 0); }
      else if (a === 'ficha-completa') { mCompleta = true; renderMovil(); window.scrollTo(0, 0); }
      else if (a === 'volver-inicio') { mCompleta = false; renderMovil(); window.scrollTo(0, 0); }
      return;
    }
    var go = ev.target.closest('[data-goto]');
    if (go) { mTab = 'negocios'; mCompleta = false; mFichaUid = Number(go.getAttribute('data-goto')); }
  });
  // (LOTE CONSERJE-INICIO) Deslizar en el inicio pasa de cliente,
  // como las flechas de la franja: un delta horizontal claro y fuera
  // de campos de texto y de la hoja.
  var iniTouchX = null;
  document.addEventListener('touchstart', function (ev) {
    if (mTab !== 'negocios' || !mFichaUid || mCompleta || !ev.changedTouches || !ev.changedTouches.length) { iniTouchX = null; return; }
    iniTouchX = ev.changedTouches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', function (ev) {
    if (iniTouchX == null) return;
    var dx = ev.changedTouches[0].clientX - iniTouchX;
    iniTouchX = null;
    if (Math.abs(dx) < 70) return;
    if (ev.target.closest && ev.target.closest('input, textarea, select, .ini-sheet-fondo')) return;
    stepInicioCliente(dx < 0 ? 1 : -1);
  }, { passive: true });


  // ---------------- Descuentos por código (LOTE DESCUENTOS-CODIGO) ----------------
  // El dueño crea los códigos acá (porcentaje suyo, duración 3/6 meses o
  // permanente, un solo uso o reutilizable, ligado a un negocio o libre)
  // y ve quién lo canjeó, cuándo y qué duración corre. La misma sección
  // vive en escritorio (#descuentosBody) y en la capa móvil (Más).
  var descuentosData = null;
  var descFormUser = 0;
  function dcFecha(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es-AR'); }
  function dcDurTxt(m) { return m == null ? 'permanente' : (m + ' meses'); }
  function descuentosHtml() {
    var negOpts = '<option value="">Libre — para entregar a cualquiera</option>' + (((vista && vista.clientes) || []).map(function (f) {
      return '<option value="' + f.user_id + '"' + (Number(descFormUser) === Number(f.user_id) ? ' selected' : '') + '>' + esc(f.business_name || ('@' + (f.ig_username || ''))) + '</option>';
    }).join(''));
    var form = '<div class="dc-form">'
      + '<label>Código<input class="dc-f-code" type="text" placeholder="Automático si lo dejás vacío" maxlength="40" style="text-transform:uppercase"></label>'
      + '<label>% de descuento<input class="dc-f-pct" type="number" min="1" max="90" value="50"></label>'
      + '<label>Duración<select class="dc-f-dur"><option value="3">3 meses</option><option value="6">6 meses</option><option value="permanente">Permanente</option></select></label>'
      + '<label>Uso<select class="dc-f-uso"><option value="">Reutilizable</option><option value="1">Un solo uso</option></select></label>'
      + '<label>Negocio<select class="dc-f-neg">' + negOpts + '</select></label>'
      + '<button class="btn primary dc-f-crear" type="button">Crear código</button>'
      + '</div>'
      + '<div class="dc-msg"></div>';
    if (!descuentosData) return form + '<div class="vacio">Cargando códigos…</div>';
    var cs = descuentosData.codigos || [];
    if (!cs.length) return form + '<div class="vacio">Todavía no creaste ningún código.</div>';
    var list = cs.map(function (c) {
      var canjes = (c.canjes || []).map(function (r) {
        return '<div class="dc-canje">' + (r.vigente ? '🟢' : '⚪') + ' <b>' + esc(r.negocio || ('#' + r.user_id)) + '</b> · canjeó el ' + dcFecha(r.redeemed_at)
          + (r.expires_at ? ' · vence el ' + dcFecha(r.expires_at) : ' · sin vencimiento') + (r.via ? ' · vía ' + esc(r.via) : '') + '</div>';
      }).join('');
      return '<div class="dc-item' + (c.active ? '' : ' off') + '">'
        + '<div class="dc-head"><span class="dc-code">' + esc(c.code) + '</span>'
        + '<span class="dc-tag">' + c.percent + '% off</span>'
        + '<span class="dc-tag">' + dcDurTxt(c.duration_months) + '</span>'
        + '<span class="dc-tag">' + (c.single_use ? 'un solo uso' : 'reutilizable') + '</span>'
        + (c.user_id ? '<span class="dc-tag">para ' + esc(c.user_label || ('#' + c.user_id)) + '</span>' : '<span class="dc-tag">libre</span>')
        + (c.active ? '' : '<span class="dc-tag warn">desactivado</span>')
        + '<span class="spacer"></span>'
        + '<button class="btn small" data-dc-toggle="' + c.id + '" data-on="' + (c.active ? '0' : '1') + '" type="button">' + (c.active ? 'Desactivar' : 'Activar') + '</button></div>'
        + (canjes || '<div class="dc-canje dim">Todavía nadie lo canjeó.</div>')
        + '</div>';
    }).join('');
    return form + '<div class="dc-list">' + list + '</div>';
  }
  function bindDescuentos(root) {
    if (!root) return;
    var q = function (sel) { return root.querySelector(sel); };
    var btn = q('.dc-f-crear');
    if (btn) btn.onclick = function () {
      var body = {
        code: (q('.dc-f-code') || {}).value || '',
        percent: Number((q('.dc-f-pct') || {}).value || 0),
        duration: (q('.dc-f-dur') || {}).value || '3',
        single_use: ((q('.dc-f-uso') || {}).value || '') === '1',
        user_id: Number((q('.dc-f-neg') || {}).value || 0) || null,
      };
      btn.disabled = true;
      api('/api/admin/conserje/descuentos', { method: 'POST', body: body }).then(function (j) {
        btn.disabled = false;
        var msg = q('.dc-msg');
        if (j && j.ok) { toast('Código ' + j.codigo.code + ' creado ✓'); descFormUser = 0; renderDescuentos(); }
        else if (msg) msg.textContent = 'No se pudo crear: ' + ((j && j.error) || 'error');
      }).catch(function () { btn.disabled = false; var msg = q('.dc-msg'); if (msg) msg.textContent = 'No se pudo crear el código.'; });
    };
    var tgl = root.querySelectorAll('[data-dc-toggle]');
    for (var i = 0; i < tgl.length; i++) (function (b) {
      b.onclick = function () {
        api('/api/admin/conserje/descuentos/activar', { method: 'POST', body: { id: Number(b.getAttribute('data-dc-toggle')), active: b.getAttribute('data-on') === '1' } }).then(function (j) {
          if (j && j.ok) renderDescuentos(); else toast('No se pudo cambiar el código.', 'err');
        });
      };
    })(tgl[i]);
  }
  function renderDescuentos() {
    api('/api/admin/conserje/descuentos').then(function (j) {
      if (j && j.ok) descuentosData = j;
      var sec = $('descuentosBody');
      if (sec) { sec.innerHTML = descuentosHtml(); bindDescuentos(sec); }
      if (mTab === 'descuentos') renderMovil();
    }).catch(function () { /* la sección reintenta en la próxima carga */ });
  }
  function mDescHtml(c) {
    var d = c && c.descuento;
    var line = d
      ? '<div class="desc-line">🏷️ <b>' + d.percent_off + '% off</b> por ' + (d.fuente === 'codigo' ? 'código' : d.fuente === 'referidos' ? 'referidos' : 'invitado')
        + (d.codigo ? ' · código <b>' + esc(d.codigo.code) + '</b>' + (d.codigo.expires_at ? ' · vence el ' + dcFecha(d.codigo.expires_at) : ' · permanente') : '') + '</div>'
      : '<div class="desc-line dim">Sin descuento activo.</div>';
    return '<div class="desc-box">' + line + '<button class="btn small" data-dc-link="' + c.user_id + '" type="button">Crear código para este negocio</button></div>';
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-dc-link]');
    if (!b) return;
    descFormUser = Number(b.getAttribute('data-dc-link')) || 0;
    if (window.innerWidth <= 760) { mTab = 'descuentos'; renderMovil(); window.scrollTo(0, 0); }
    else { renderDescuentos(); var s = $('descuentosSec'); if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  });

  // ---------------- carga ----------------
  function cargar(recargarCliente, silencioso) {
    return api('/api/admin/conserje/vista').then(function (j) {
      if (!j || !j.ok) {
        if (j && (j.__status === 401 || j.__status === 403)) {
          var gm = $('gateMsg');
          if (gm) gm.textContent = 'Ese token no abrió la consola. Revisalo y probá de nuevo.';
          abrirGate(); return;
        }
        if (!silencioso) toast('No se pudo cargar la consola.', 'err');
        return;
      }
      vista = j;
      detectarPedidosNuevos(j);
      renderTop(); renderGasto(); renderSemaforo(); renderDatosBandeja(); renderRoster(); renderDecisiones(); renderCola(); renderMovil(); renderDescuentos();
      // (LOTE CONSERJE-FORMA) Al abrir, el centro es la producción de
      // mañana — la vista de trabajo. La ficha se abre solo cuando el
      // dueño toca una cuenta o un ítem (el drill-in); un recargar la
      // conserva si ya estaba abierta, sin auto-abrir ninguna.
      if (recargarCliente && selUser && centroModo === 'ficha') return cargarCliente(selUser);
      renderCentro();
      // (LOTE CONSERJE-NAV · palabra del dueño 27/11, que reemplaza al
      // CONSERJE-INICIO del 24/11) La consola abre en su inicio — la
      // producción de mañana y la bandeja — y NO auto-abre ningún
      // negocio en «Su producto»: esa vista era adonde caía sin
      // pedirlo («que no me lleve a esto»). La ficha de un cliente se
      // abre solo cuando lo toca.
    }).catch(function () { if (!silencioso) toast('No se pudo cargar la consola.', 'err'); });
  }
  // (LOTE CONSERJE-VIVO) ¿Qué pedidos de la lista de decisiones no
  // estaban en la carga anterior? La primera carga solo siembra el
  // conjunto: lo que ya estaba cuando la consola abrió no es
  // «nuevo». Los que se resuelven salen solos de la lista de sin ver.
  function idsPedidosDe(v) {
    var out = {};
    var ds = (v && (v.mano || v.decisiones)) || [];
    for (var i = 0; i < ds.length; i++) { var d = ds[i]; if (d && (d.clase || 'pedido') === 'pedido' && d.id) out[d.id] = true; }
    return out;
  }
  function detectarPedidosNuevos(j) {
    var ahora = idsPedidosDe(j);
    if (pedidosConocidos === null) { pedidosConocidos = ahora; return; }
    for (var id in ahora) {
      if (!pedidosConocidos[id] && pedidosSinVer.indexOf(id) < 0) pedidosSinVer.push(id);
    }
    pedidosSinVer = pedidosSinVer.filter(function (id) { return !!ahora[id]; });
    pedidosConocidos = ahora;
    pintarAvisoNuevos();
  }
  function pintarAvisoNuevos() {
    var b = $('avisoNuevos');
    if (!b) return;
    if (!pedidosSinVer.length) { b.hidden = true; return; }
    var tx = $('avisoNuevosTxt');
    if (tx) tx.textContent = pedidosSinVer.length + (pedidosSinVer.length === 1 ? ' pedido nuevo' : ' pedidos nuevos');
    b.hidden = false;
  }
  // El refresco vivo: al volver a primer plano y cada 45 s la
  // consola se relee sola (en silencio y conservando la ficha
  // abierta) — sin pisar jamás lo que el operador está escribiendo:
  // si hay un texto a medio escribir en un área de respuesta, este
  // ciclo espera al siguiente.
  function refrescarVivo() {
    if (!vista || document.hidden) return;
    var a = document.activeElement;
    if (a && a.tagName === 'TEXTAREA' && String(a.value || '').trim()) return;
    cargar(true, true);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refrescarVivo(); });
  window.addEventListener('focus', refrescarVivo);
  window.addEventListener('pageshow', refrescarVivo);
  setInterval(refrescarVivo, 45000);

  function cargarCliente(uid, postId) {
    centroModo = 'ficha';
    // (LOTE CENSO-CONSERJE-2 · F3) El posteo referido viaja en el
    // pedido: la ficha lo incluye aunque no esté entre los 12 últimos.
    return api('/api/admin/conserje/vista/cliente?user_id=' + uid + (postId ? '&post_id=' + Number(postId) : '')).then(function (j) {
      if (j && j.ok) { cliente = j; try { renderRoster(); renderCentro(); renderMovil(); } catch (e) { toast('La ficha se cargó pero no se pudo mostrar.', 'err'); } return; }
      // (LOTE CONSERJE-BOTONES · F5) La ficha que no carga AVISA —
      // nunca más el silencio que dejaba la ficha vieja (o ninguna)
      // como si el toque no hubiera hecho nada: con el token vencido
      // se reabre la puerta con su mensaje (espejo de cargar) y con
      // cualquier otro error sale el toast.
      if (j && (j.__status === 401 || j.__status === 403)) {
        var gm = $('gateMsg');
        if (gm) gm.textContent = 'Ese token no abrió la consola. Revisalo y probá de nuevo.';
        abrirGate();
        return;
      }
      toast('No se pudo cargar la ficha.', 'err');
    }).catch(function () { toast('No se pudo cargar la ficha.', 'err'); });
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
  // (LOTE CONSERJE-TAP) La marca «Posty · CONSERJE» vuelve al inicio
  // de la consola: sin cliente elegido, el centro en la producción de
  // mañana, los filtros y buscadores limpios y el teléfono en su
  // pestaña de arranque — el mismo estado en el que la consola abre,
  // en las dos pieles. Como las demás vueltas (data-mback, «← Hoy»),
  // no conserva lo tipeado sin guardar: la ficha se re-pinta entera.
  function irAlInicio() {
    // (LOTE CONSERJE-NAV) La marca lleva al inicio de la NUEVA pantalla:
    // si la consola estaba en la piel completa (ver-escritorio), la
    // marca también sale de esa piel — el inicio es la bandeja.
    document.body.classList.remove('ver-escritorio');
    selUser = null;
    cliente = null;
    highlightPostId = null;
    centroModo = 'manana';
    centroVista = 'semana';
    filtro = 'todos';
    var bIni = $('buscador'); if (bIni) bIni.value = '';
    var bTopIni = $('buscadorTop'); if (bTopIni) bTopIni.value = '';
    mFichaUid = null;
    mTab = 'hoy';
    renderRoster();
    renderCentro();
    renderMovil();
    window.scrollTo(0, 0);
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
  // (LOTE CONSERJE-INICIO · AGREGADO C) LA REGLA del dueño: tocar una
  // push del conserje aterriza en el INICIO de ese cliente — en la
  // bandeja (la piel que manda, en su pestaña Negocios) y en la ficha
  // del centro — con su posteo marcado si el aviso lo trae. La usan
  // el arranque con ?user= y el mensaje del service worker cuando la
  // app ya estaba abierta de fondo: nunca se queda donde estaba.
  function abrirInicioCliente(uid, postId) {
    var u = Number(uid) || 0;
    if (!u) return;
    document.body.classList.remove('ver-escritorio');
    mTab = 'negocios';
    mFichaUid = u;
    mCompleta = false;
    gotoFicha(u, postId || null);
    window.scrollTo(0, 0);
  }
  // El service worker, al tocar la push con la consola ya abierta, no
  // recarga: enfoca la ventana y pasa el destino por este canal.
  if ('serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.addEventListener('message', function (ev) {
        var d = ev && ev.data;
        if (!d || d.tipo !== 'conserje-ir') return;
        abrirInicioCliente(d.user, d.post || null);
      });
    } catch (e) { /* sin canal: el aterrizaje va por la URL */ }
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
  // (LOTE CONSERJE-PRODUCTO-DISENO) El switcher del mock: pasar de un
  // negocio al siguiente en el orden visible del riel, con los botones
  // ‹ › o las flechas del teclado, sin salir de la pestaña abierta.
  function stepCliente(d) {
    if (!rosterOrden.length) return;
    var idx = rosterOrden.indexOf(selUser);
    var base = idx < 0 ? 0 : idx;
    var next = rosterOrden[(((base + d) % rosterOrden.length) + rosterOrden.length) % rosterOrden.length];
    if (next && next !== selUser) { selUser = next; cargarCliente(next); irAlCentro(); }
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.target && ev.target.id === 'duenoChatIn' && ev.key === 'Enter') { var bD = document.querySelector('[data-act="dueno-enviar"]'); if (bD) bD.click(); return; }
    if (ev.target && ev.target.id === 'corrIn' && ev.key === 'Enter') { var bCorr = document.querySelector('[data-act="corr-enviar"]'); if (bCorr) bCorr.click(); return; }
    if (!document.body.classList.contains('ficha-open')) return;
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    var ae = document.activeElement;
    if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
    var vs = $('visor');
    if (vs && vs.classList.contains('open')) return;
    ev.preventDefault();
    stepCliente(ev.key === 'ArrowRight' ? 1 : -1);
  });

  document.addEventListener('click', function (ev) {
    // (LOTE CONSERJE-VER-GRANDE) La imagen de un posteo se mira en
    // grande ANTES que cualquier otra cosa: la miniatura puede vivir
    // dentro de una fila que navega (data-goto) y el toque en la foto
    // es para VERLA, no para ir a la ficha.
    var ver = ev.target.closest('[data-ver]');
    if (ver) { onVerThumb(ver); return; }
    var sel = ev.target.closest('[data-sel]');
    if (sel) { selUser = Number(sel.getAttribute('data-sel')); centroVista = 'semana'; highlightPostId = null; cargarCliente(selUser); irAlCentro(); return; } // (LOTE CONSERJE-NAV) Tocar un cliente abre SU FICHA (su información), como en el teléfono y en gotoFicha — nunca más la vista «Su producto»: era el pedido del dueño y el toque caía en el paginador de producto.
    var go = ev.target.closest('[data-goto]');
    if (go) { gotoFicha(go.getAttribute('data-goto'), go.getAttribute('data-goto-post')); return; }
    var f = ev.target.closest('[data-filtro]');
    if (f) { filtro = f.getAttribute('data-filtro'); $('buscador').value = ''; renderRoster(); return; } // (LOTE LIMPIEZA-23/11 · TODOS-LIMPIA) Tocar un chip vacía el buscador: con una búsqueda sin match activa, «Todos» volvía a una lista vacía.
    var v = ev.target.closest('[data-vista]');
    if (v) { centroVista = v.getAttribute('data-vista'); renderCentro(); return; }
    var b = ev.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    b.disabled = true;
    var re = function () { b.disabled = false; };
    if (act === 'cli-prev') { stepCliente(-1); re(); return; }
    if (act === 'cli-next') { stepCliente(1); re(); return; }
    if (act === 'dueno-enviar') {
      var inpD = $('duenoChatIn');
      var txtD = inpD ? String(inpD.value || '').trim() : '';
      if (txtD) {
        api('/api/admin/conserje/vista/dueno-chat', { method: 'POST', body: { user_id: Number(selUser), texto: txtD, autor: 'dueno' } }).then(function (j) {
          if (j && j.ok) { toast('Pedido enviado: bamboo lo tiene como tarea.'); renderFicha(); }
          else { toast('No se pudo enviar el pedido.', 'err'); re(); }
        }).catch(function () { toast('No se pudo enviar el pedido.', 'err'); re(); });
      } else { re(); }
      return;
    }
    if (act === 'ir-proximo') {
      var ordenP = ((vista && vista.clientes) || []).filter(function (f) { return f.urgencia && f.urgencia.nivel < 3; })
        .sort(function (a, b) { return (a.urgencia.nivel - b.urgencia.nivel) || ((b.urgencia.espera_min || 0) - (a.urgencia.espera_min || 0)); });
      var idxP = -1;
      ordenP.forEach(function (f, i) { if (f.user_id === selUser) idxP = i; });
      var sigP = null;
      for (var kP = 1; kP <= ordenP.length; kP++) { var candP = ordenP[(idxP + kP) % ordenP.length]; if (candP && candP.user_id !== selUser) { sigP = candP; break; } }
      if (!sigP) { toast(ordenP.length ? 'El único con problemas es el que estás viendo.' : 'Nadie con problemas.'); re(); return; }
      selUser = sigP.user_id; centroVista = 'semana'; highlightPostId = null; cargarCliente(selUser); irAlCentro(); re();
    } else if (act === 'ir-manana') {
      centroModo = 'manana'; highlightPostId = null; renderCentro(); re();
    } else if (act === 'limpiar-busqueda') {
      // (LOTE CONSERJE-BUSQUEDA) Limpiar es limpiar LAS DOS bocas de la
      // misma búsqueda: la del riel y la de la barra superior se espejan,
      // y texto que quede en cualquiera vuelve a filtrar al próximo render.
      var bL = $('buscador'); if (bL) bL.value = '';
      var bTL = $('buscadorTop'); if (bTL) bTL.value = '';
      renderRoster(); re();
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
    } else if (act === 'fallido-rehacer') {
      // (LOTE CONSERJE-ACCION-REHACER) La orden entra por la puerta de
      // producir con el post_id: queda atada a ESTE posteo fallido.
      api('/api/admin/conserje/vista/producir', { method: 'POST', body: { user_id: Number(b.getAttribute('data-uid')), post_id: Number(b.getAttribute('data-pid')), detalle: 'Que se rehaga este posteo: orden atada al posteo abierta desde su tarjeta en la consola.' } })
        .then(function (j) { if (j && j.ok) despuesDeActuar(j.duplicado ? 'Ese rehacer ya estaba pedido: la orden sigue en la cola.' : 'Orden de rehacer registrada: entró a la cola de producción a mano.'); else { toast('No se pudo pedir el rehacer (' + ((j && j.error) || 'error') + ').', 'err'); re(); } })
        .catch(function () { toast('No se pudo pedir el rehacer.', 'err'); re(); });
    } else if (act === 'corr-enviar') {
      // (LOTE CONSERJE-INICIO · AGREGADO B) La corrección del operador
      // para bamboo, desde el inicio del cliente: envío optimista (se
      // pinta ya en el hilo) y refetch de la vista del cliente para
      // confirmar contra la base.
      var inpC = $('corrIn');
      var txtC = inpC ? String(inpC.value || '').trim() : '';
      if (!txtC) { toast('Escribí la corrección primero.', 'warn'); re(); return; }
      var uidC = Number(mFichaUid || selUser) || 0;
      if (cliente && Number(cliente.user_id) === uidC) {
        cliente.correcciones = (cliente.correcciones || []).concat([{ id: 0, texto: txtC, estado: 'nueva', respuesta: '', hace: 'ahora' }]);
        renderMovil();
      }
      api('/api/admin/conserje/correcciones', { method: 'POST', body: { user_id: uidC, texto: txtC } }).then(function (j) {
        if (j && j.ok) { toast('Corrección enviada: bamboo la recibe.'); if (uidC) cargarCliente(uidC); }
        else { toast('No se pudo enviar la corrección.', 'err'); if (uidC) cargarCliente(uidC); }
      }).catch(function () { toast('No se pudo enviar la corrección.', 'err'); re(); });
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
  $('volverBandeja').addEventListener('click', function () { document.body.classList.remove('ver-escritorio'); window.scrollTo(0, 0); });
  // (LOTE CONSERJE-TAP) La marca, a inicio: en escritorio es la de la
  // barra del mock (visible con la ficha abierta); en el teléfono, la
  // placa y el título de la cabecera de la bandeja.
  var brandEls = document.querySelectorAll('.mkbrand, #movil .m-ava, #movil .m-head > div');
  for (var bi = 0; bi < brandEls.length; bi++) brandEls[bi].addEventListener('click', irAlInicio);
  // (LOTE CONSERJE-BUSQUEDA) Las dos bocas de la búsqueda se espejan en
  // los dos sentidos: lo que se tipea en una se ve en la otra, así el
  // filtro activo nunca queda escondido en el campo que no se está
  // mirando (en la piel de ficha el buscador del riel está oculto y el
  // de arriba es el que manda; su texto filtraba sin verse en ningún
  // campo del riel).
  $('buscador').addEventListener('input', function () { var btS = $('buscadorTop'); if (btS && btS.value !== $('buscador').value) btS.value = $('buscador').value; renderRoster(); });
  var bTop = $('buscadorTop');
  if (bTop) bTop.addEventListener('input', function () { var b = $('buscador'); if (b) b.value = bTop.value; renderRoster(); });
  // (LOTE CONSERJE-BUSQUEDA) La consola SIEMPRE abre sin filtro. La
  // búsqueda no se persiste en ningún storage ni en la URL, pero el
  // navegador sí puede restaurar el valor de un campo al volver a la
  // pestaña o desde su caché de página — y el arranque no lo pisaba:
  // un texto restaurado (p. ej. el mail que el teclado del teléfono
  // sugiere con un toque) dejaba la cartera en «0 de N» sin que nadie
  // hubiera buscado en esta visita. Se pisa al arrancar y en cada
  // vuelta desde la caché de página (pageshow persistido).
  function limpiarBuscadores() { var b1 = $('buscador'); if (b1) b1.value = ''; var b2 = $('buscadorTop'); if (b2) b2.value = ''; }
  limpiarBuscadores();
  window.addEventListener('pageshow', function (ev) { if (ev && ev.persisted) { limpiarBuscadores(); renderRoster(); } });
  $('btnRecargar').addEventListener('click', function () { cargar(true); });
  // (LOTE CONSERJE-INICIO · nota AVISOS-APAGADOS) El botón de avisos
  // de la barra de escritorio se retiró de la interfaz junto con el
  // de Más: los avisos del operador están apagados por decisión del
  // dueño y el sistema quedó dormido (la suscripción no se consulta
  // ni se ofrece; la maquinaria opPush* queda en el código, inerte).
  // (LOTE CONSERJE-VIVO) El aviso de pedidos nuevos: al tocarlo se
  // apaga y lleva a la lista — en el teléfono, a la pestaña «Hoy»;
  // en la compu, a la columna de decisiones con un destello.
  var avNuevos = $('avisoNuevos');
  if (avNuevos) avNuevos.addEventListener('click', function () {
    pedidosSinVer = [];
    pintarAvisoNuevos();
    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
      mTab = 'hoy'; renderMovil();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      var dec = $('decisiones');
      if (dec) { dec.scrollIntoView({ block: 'start', behavior: 'smooth' }); dec.classList.remove('flash'); void dec.offsetWidth; dec.classList.add('flash'); }
    }
  });

  // ---------------- gate ----------------
  function abrirGate() { $('gate').classList.add('open'); var i = $('gateToken'); if (i) i.focus(); }
  $('gateBtn').addEventListener('click', function () {
    var v = ($('gateToken').value || '').trim();
    // (LOTE CONSERJE-BOTONES) «Entrar» sin token no es un clic
    // mudo: la puerta dice qué falta, en la puerta misma.
    if (!v) { var gmE = $('gateMsg'); if (gmE) gmE.textContent = 'Pegá el token de administración para entrar.'; return; }
    token = v;
    try { localStorage.setItem('posta_admin_token', v); } catch (e) {}
    var gmB = $('gateMsg');
    if (gmB) gmB.textContent = '';
    $('gate').classList.remove('open');
    // (LOTE CONSERJE-BOTONES · F4) El deep link de la push también
    // se sigue tras entrar por la puerta, igual que en el arranque
    // con token guardado: sin esto, el enlace ?user=&post= se perdía
    // al tipear el token — y también al re-entrar tras un 401.
    cargar(true).then(function () {
      if (deepUser) { try { abrirInicioCliente(deepUser, deepPost || null); } catch (e) {} }
    });
  });
  $('gateToken').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') $('gateBtn').click(); });

  if (!token) abrirGate();
  else cargar(true).then(function () {
    if (deepUser) { try { abrirInicioCliente(deepUser, deepPost || null); } catch (e) {} }
  });
})();
