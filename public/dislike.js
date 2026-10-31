/* 👎 No me gusta → 3 opciones (Posty, v483).
 * Hoja que se abre desde la tarjeta de un BORRADOR de la semana.
 * Sin librerías. Se carga ANTES que app.js (ver index.html) para que
 * pcDislikeOpen exista cuando las tarjetas la llaman (gate M78).
 * Idioma: español (la vista de semana de Posty es ES).
 * La hoja NO decide nada sola: toda la regla (una ronda, solo
 * borradores, frenar) vive en el servidor (posty-dislike.js). */
(function () {
  'use strict';
  var cur = { id: 0, btn: null };

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toastMsg(m) {
    try {
      if (typeof toast === 'function') { toast(m); return; }
    } catch (e) {}
    var t = document.createElement('div');
    t.textContent = m;
    t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#0A1E33;color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;z-index:99999;max-width:92vw;text-align:center';
    document.body.appendChild(t);
    setTimeout(function () { try { t.remove(); } catch (e) {} }, 3500);
  }
  function sheetEl() { return document.getElementById('pc-dislike-sheet'); }
  function closeSheet() {
    var s = sheetEl();
    if (s) s.remove();
    cur = { id: 0, btn: null };
  }
  function openShell(inner) {
    closeSheet();
    var wrap = document.createElement('div');
    wrap.id = 'pc-dislike-sheet';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(10,30,51,.55);z-index:99990;display:flex;align-items:flex-end;justify-content:center';
    wrap.innerHTML = '<div style="background:#fff;width:100%;max-width:520px;max-height:86vh;overflow:auto;border-radius:20px 20px 0 0;padding:18px 16px 26px;box-sizing:border-box">' + inner + '</div>';
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeSheet(); });
    document.body.appendChild(wrap);
  }
  function renderError(msg, showFrenar) {
    var frenar = showFrenar
      ? '<button onclick="pcDislikeNinguna(' + cur.id + ')" style="margin-top:14px;width:100%;padding:12px;border:1px solid #ddd;background:#fff;border-radius:12px;font-size:14px;cursor:pointer">⏸ Ninguna, frenar este hueco</button>'
      : '';
    openShell(
      '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px;color:#0A1E33">No me gusta</b>' +
      '<button onclick="pcDislikeClose()" style="border:none;background:none;font-size:22px;cursor:pointer;line-height:1">×</button></div>' +
      '<p style="font-size:14px;color:#333;line-height:1.5;margin:14px 0 0">' + escHtml(msg) + '</p>' + frenar
    );
  }
  function renderOptions(opciones) {
    var cards = opciones.map(function (o, i) {
      return '<div style="border:1.5px solid #eee;border-radius:14px;padding:10px;margin-top:12px">' +
        '<img src="' + escHtml(o.imagen) + '" alt="" style="width:100%;border-radius:10px;display:block" loading="lazy">' +
        '<div style="font-size:12px;color:#2793C8;font-weight:700;margin-top:8px">' + escHtml(o.idea_label || o.idea) + '</div>' +
        '<div style="font-size:14px;color:#0A1E33;line-height:1.4;margin-top:2px">' + escHtml(o.titulo) + '</div>' +
        '<button onclick="pcDislikeElegir(' + cur.id + ',' + o.idx + ')" style="margin-top:10px;width:100%;padding:11px;background:#FEC14D;border:none;border-radius:12px;font-size:15px;font-weight:700;color:#0A1E33;cursor:pointer">Elegir esta</button>' +
        '</div>';
    }).join('');
    openShell(
      '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px;color:#0A1E33">¿Esta no te gusta? Elegí otra idea</b>' +
      '<button onclick="pcDislikeClose()" style="border:none;background:none;font-size:22px;cursor:pointer;line-height:1">×</button></div>' +
      '<p style="font-size:13px;color:#666;margin:6px 0 0">3 ideas distintas, con tu producto real. Elegí una con un toque.</p>' +
      cards +
      '<button onclick="pcDislikeNinguna(' + cur.id + ')" style="margin-top:16px;width:100%;padding:12px;border:none;background:none;font-size:14px;color:#666;cursor:pointer">⏸ Ninguna, frenar este hueco</button>'
    );
  }

  async function postJson(url, body) {
    var r = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    var data = {};
    try { data = await r.json(); } catch (e) {}
    return { status: r.status, ok: r.ok, data: data };
  }

  window.pcDislikeClose = function () { closeSheet(); };

  window.pcDislikeOpen = async function (id, btn) {
    cur = { id: Number(id) || 0, btn: btn || null };
    if (!cur.id) return;
    openShell(
      '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px;color:#0A1E33">No me gusta</b>' +
      '<button onclick="pcDislikeClose()" style="border:none;background:none;font-size:22px;cursor:pointer;line-height:1">×</button></div>' +
      '<p style="font-size:14px;color:#666;margin:14px 0">Buscando 3 ideas distintas…</p>'
    );
    var res = await postJson('/api/dislike/' + cur.id + '/opciones');
    if (res.ok && res.data && res.data.opciones) { renderOptions(res.data.opciones); return; }
    var code = (res.data && res.data.error) || '';
    if (res.status === 409 && code === 'ya_elegido') renderError('Ya usaste tu ronda para este hueco: quedó la opción que elegiste.');
    else if (res.status === 409 && code === 'frenado') renderError('Este hueco ya está frenado: no va a salir esta semana.');
    else if (res.status === 409 && code === 'publicado') renderError('Este posteo ya salió publicado: no se puede cambiar.');
    else if (res.status === 422 && code === 'sin_fotos') renderError('Posty todavía no tiene 3 fotos reales distintas para este hueco. Podés frenarlo o subir más fotos de tu producto.', true);
    else if (res.status === 404) renderError('No encontré ese posteo.');
    else if (res.status === 403) renderError('Ese posteo no es tuyo.');
    else renderError('No pude traer las opciones: probá de nuevo en un momento.');
  };

  window.pcDislikeElegir = async function (id, idx) {
    var res = await postJson('/api/dislike/' + Number(id) + '/elegir', { idx: Number(idx) });
    if (!res.ok) {
      var code = (res.data && res.data.error) || '';
      if (res.status === 409 && (code === 'ya_elegido' || code === 'frenado')) { renderError('Ya usaste tu ronda para este hueco.'); return; }
      toastMsg('No se pudo cambiar: probá de nuevo');
      return;
    }
    var elegida = (res.data && res.data.elegida) || {};
    try {
      var btn = cur.btn;
      if (btn) {
        var body = btn.closest ? btn.closest('.igmock-body') : null;
        var card = body ? body.parentElement : null;
        if (card) {
          var img = card.querySelector('img.vimg');
          if (img && elegida.imagen) { img.src = elegida.imagen; img.setAttribute('data-full', elegida.imagen); }
        }
        btn.remove();
      }
      var prev = document.querySelector('[data-revpreview="' + Number(id) + '"]');
      if (prev && elegida.caption) prev.textContent = elegida.caption;
      var cap = document.querySelector('[data-revcap="' + Number(id) + '"]');
      if (cap && elegida.caption) cap.value = elegida.caption;
    } catch (e) {}
    closeSheet();
    toastMsg('✅ Listo, quedó la que elegiste');
  };

  window.pcDislikeNinguna = async function (id) {
    var res = await postJson('/api/dislike/' + Number(id) + '/ninguna');
    if (!res.ok) { toastMsg('No se pudo frenar: probá de nuevo'); return; }
    try { if (cur.btn) cur.btn.remove(); } catch (e) {}
    closeSheet();
    toastMsg('⏸ Este hueco no sale esta semana. Cuando quieras, aceptalo de nuevo.');
  };
})();
