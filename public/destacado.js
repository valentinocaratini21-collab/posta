// destacado.js — Decorador cliente de "Destacado de la semana + Impulsar".
// NO reescribe la vista de la semana: decora las tarjetas existentes por
// [data-post-id] (atributo que ya trae cada tarjeta de posteo).
//  - Tarjeta destacada: badge "Destacado de la semana" + línea de por qué.
//  - Resto: botón "Destacar este en vez" (un toque -> POST /api/destacado/mover).
//  - Debajo del destacado, SOLO si el flag está on y el destacado está
//    publicado: botón "Impulsar" -> 3 montos fijos -> confirmar -> POST
//    /api/destacado/impulsar. Flag off = sin botón (no hay botón muerto).
//  - Si el flag está on pero el destacado todavía es borrador: nota honesta,
//    sin botón ("Cuando se publique lo podés impulsar").
// El cobro se confirma en la app (nunca en el email). Los mensajes de error
// son los del servidor; un impulso solo se muestra como logrado si el
// servidor responde ok:true. Sin éxitos inventados.
(function () {
  'use strict';
  if (window.__destacadoLoaded) return;
  window.__destacadoLoaded = true;

  var EN = (function () {
    try {
      if (/(?:^|[?&])lang=en(?:&|$)/.test(location.search)) return true;
      return (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
    } catch (e) { return false; }
  })();
  var T = EN ? {
    badge: 'Featured post of the week',
    mover: 'Feature this instead',
    impulsar: 'Boost',
    notaBorrador: 'When it publishes you can boost it.',
    eligeMonto: 'Choose an amount for 7 days',
    confirmar: 'Confirm',
    cancelar: 'Cancel',
    impulsado: 'Boosted. Posty will report real numbers when they arrive.',
    error: 'It could not be boosted. Nothing was charged.',
  } : {
    badge: 'Destacado de la semana',
    mover: 'Destacar este en vez',
    impulsar: 'Impulsar',
    notaBorrador: 'Cuando se publique lo podés impulsar.',
    eligeMonto: 'Elegí un monto por 7 días',
    confirmar: 'Confirmar',
    cancelar: 'Cancelar',
    impulsado: 'Impulsado. Posty te va a reportar números reales cuando lleguen.',
    error: 'No se pudo impulsar. No se cobró nada.',
  };
  var MONTOS = [20, 50, 100];

  function style() {
    if (document.getElementById('destacado-style')) return;
    var s = document.createElement('style');
    s.id = 'destacado-style';
    s.textContent = '.destacado-badge{border:2px solid #FEC14D;border-radius:12px;padding:8px 10px;margin:8px 0;text-align:center;background:#fff}'
      + '.destacado-badge b{display:block;font-size:12px;letter-spacing:1px;color:#2793C8}'
      + '.destacado-badge p{margin:6px 0 0;font-size:13px;color:#0A1E33}'
      + '.destacado-btn{display:inline-block;margin:8px 4px 0 0;padding:8px 14px;border-radius:999px;border:0;font-weight:800;cursor:pointer;background:#FEC14D;color:#0A1E33}'
      + '.destacado-btn.sec{background:#fff;color:#2793C8;border:2px solid #2793C8}'
      + '.destacado-nota{font-size:12px;color:#666;margin:8px 0 0}';
    document.head.appendChild(s);
  }

  function enSemana() {
    try { return (location.hash || '').indexOf('#/app/semana') === 0; } catch (e) { return false; }
  }

  function limpiar() {
    document.querySelectorAll('.destacado-dec').forEach(function (n) { n.remove(); });
  }

  function tarjeta(postId) {
    return document.querySelector('[data-post-id="' + String(postId).replace(/"/g, '') + '"]');
  }

  function mover(postId, despues) {
    fetch('/api/destacado/mover', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posteoId: postId }),
    }).then(function (r) { return r.json(); }).then(function () { despues(); }).catch(function () {});
  }

  function impulsar(monto, posteoId, caja) {
    fetch('/api/destacado/impulsar', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ montoUSD: monto }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      caja.textContent = j && j.ok ? T.impulsado : (T.error + (j && j.motivo ? ' (' + j.motivo + ')' : ''));
    }).catch(function () { caja.textContent = T.error; });
  }

  function hojaMontos(posteoId, ancla) {
    var caja = document.createElement('div');
    caja.className = 'destacado-dec';
    var titulo = document.createElement('p');
    titulo.textContent = T.eligeMonto;
    caja.appendChild(titulo);
    MONTOS.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'destacado-btn';
      b.textContent = '$' + m;
      b.onclick = function () {
        caja.innerHTML = '';
        var conf = document.createElement('button');
        conf.type = 'button';
        conf.className = 'destacado-btn';
        conf.textContent = T.confirmar + ' $' + m;
        conf.onclick = function () { impulsar(m, posteoId, caja); };
        var canc = document.createElement('button');
        canc.type = 'button';
        canc.className = 'destacado-btn sec';
        canc.textContent = T.cancelar;
        canc.onclick = function () { caja.remove(); };
        caja.appendChild(conf);
        caja.appendChild(canc);
      };
      caja.appendChild(b);
    });
    ancla.parentNode.insertBefore(caja, ancla.nextSibling);
  }

  function decorar(estado) {
    if (!estado || !estado.destacadoId) return;
    limpiar();
    var dest = tarjeta(estado.destacadoId);
    if (dest) {
      var badge = document.createElement('div');
      badge.className = 'destacado-badge destacado-dec';
      var b = document.createElement('b');
      b.textContent = '⭐ ' + T.badge;
      badge.appendChild(b);
      if (estado.destacadoPorQue) {
        var p = document.createElement('p');
        p.textContent = estado.destacadoPorQue;
        badge.appendChild(p);
      }
      dest.parentNode.insertBefore(badge, dest.nextSibling);
      if (estado.boostHabilitado) {
        if (estado.destacadoPublicado) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'destacado-btn destacado-dec';
          btn.textContent = '🚀 ' + T.impulsar;
          btn.onclick = function () { hojaMontos(estado.destacadoId, btn); };
          badge.parentNode.insertBefore(btn, badge.nextSibling);
        } else {
          var nota = document.createElement('p');
          nota.className = 'destacado-nota destacado-dec';
          nota.textContent = T.notaBorrador;
          badge.parentNode.insertBefore(nota, badge.nextSibling);
        }
      }
    }
    (estado.posteos || []).forEach(function (p) {
      if (String(p.id) === String(estado.destacadoId)) return;
      var card = tarjeta(p.id);
      if (!card || card.querySelector('.destacado-mover')) return;
      var mv = document.createElement('button');
      mv.type = 'button';
      mv.className = 'destacado-btn sec destacado-dec destacado-mover';
      mv.textContent = T.mover;
      mv.onclick = function () { mover(p.id, refrescar); };
      card.parentNode.insertBefore(mv, card.nextSibling);
    });
  }

  function refrescar() {
    if (!enSemana()) { limpiar(); return; }
    fetch('/api/destacado/semana', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) decorar(j); })
      .catch(function () {});
  }

  var t = null;
  function programar() {
    if (t) return;
    t = setTimeout(function () { t = null; refrescar(); }, 400);
  }

  style();
  window.addEventListener('hashchange', refrescar);
  try {
    var obs = new MutationObserver(programar);
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  refrescar();
})();
