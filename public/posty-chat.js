/* posty-chat.js — Chat público "Hablá con Posty" (landing + /prueba).
   Vanilla, sin dependencias: inyecta sus estilos y su DOM. Se incluye con
   <script src="/posty-chat.js?v=1" defer></script>. Dentro de la app
   (#/app/...) se oculta solo: la app tiene su propio chat. */
(function () {
  if (window.__postyChatLoaded) return;
  window.__postyChatLoaded = true;

  var GREETING = '¡Hola! Soy Posty 🤖 Manejo el Instagram de negocios como el tuyo: análisis, posteos, reels, todo. ¿Querés que te cuente cómo sería con tu cuenta, o tenés una duda puntual?';
  var PAGE = location.pathname.indexOf('prueba') !== -1 ? 'prueba' : 'landing';

  var sid = null;
  try {
    sid = localStorage.getItem('posty_chat_sid');
    if (!sid || !/^[A-Za-z0-9_-]{6,80}$/.test(sid)) {
      sid = 'pc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('posty_chat_sid', sid);
    }
  } catch (e) {
    sid = 'pc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  var css = [
    '#posty-chat-root{font-family:Montserrat,system-ui,-apple-system,sans-serif;color:#0A1E33}',
    '#pcBtn{position:fixed;right:20px;bottom:20px;z-index:90;display:flex;align-items:center;gap:9px;background:#2793C8;color:#fff;border:none;border-radius:999px;padding:9px 18px 9px 9px;font-family:inherit;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 10px 26px rgba(10,30,51,.28);transition:transform .15s ease,box-shadow .15s ease}',
    '#pcBtn:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(10,30,51,.32)}',
    '#pcBtn img{width:36px;height:36px;border-radius:50%;background:#fff;display:block}',
    '#pcPanel{position:fixed;right:20px;bottom:94px;z-index:250;width:380px;max-width:calc(100vw - 24px);height:min(560px,calc(100dvh - 124px));background:#fff;border:1px solid #E3EDF4;border-radius:22px;box-shadow:0 24px 60px rgba(10,30,51,.30);display:flex;flex-direction:column;overflow:hidden;animation:pcUp .22s ease}',
    '@keyframes pcUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}',
    '.pc-head{background:#2793C8;color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}',
    '.pc-head img{width:40px;height:40px;border-radius:50%;background:#fff;display:block}',
    '.pc-head .pc-name{font-weight:800;font-size:16px;line-height:1.15}',
    '.pc-head .pc-sub{font-size:12px;opacity:.92;line-height:1.2}',
    '.pc-close{margin-left:auto;background:rgba(255,255,255,.18);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;flex:none}',
    '.pc-msgs{flex:1;overflow-y:auto;padding:14px;background:#F4FAFD;display:flex;flex-direction:column;gap:8px}',
    '.pc-b{max-width:84%;padding:10px 13px;font-size:14.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word;border-radius:16px}',
    '.pc-a{align-self:flex-start;background:#fff;border:1px solid #E3EDF4;border-bottom-left-radius:6px}',
    '.pc-u{align-self:flex-end;background:#2793C8;color:#fff;border-bottom-right-radius:6px}',
    '.pc-loading{align-self:flex-start;color:#5A7186;font-size:13.5px;font-style:italic;padding:4px 2px}',
    '.pc-chips{display:flex;flex-wrap:wrap;gap:6px;padding:2px 14px 12px;background:#F4FAFD}',
    '.pc-chip{border:1.5px solid #FEC14D;background:#fff;color:#0A1E33;border-radius:999px;padding:7px 12px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer}',
    '.pc-chip:hover{background:#FEC14D}',
    '.pc-form{display:flex;gap:8px;padding:10px;border-top:1px solid #E3EDF4;background:#fff}',
    '.pc-form input{flex:1;min-width:0;border:1.5px solid #D7E5EE;border-radius:999px;padding:10px 14px;font-family:inherit;font-size:16px;color:#0A1E33;outline:none}',
    '.pc-form input:focus{border-color:#2793C8}',
    '.pc-send{background:#FEC14D;color:#0A1E33;border:none;border-radius:999px;padding:10px 16px;font-family:inherit;font-weight:800;font-size:14px;cursor:pointer}',
    '.pc-send:disabled{opacity:.55;cursor:default}',
    '.pc-hidden{display:none!important}',
    '@media(max-width:760px){',
    '  #pcBtn{right:16px;bottom:calc(96px + env(safe-area-inset-bottom));width:58px;height:58px;padding:0;justify-content:center;border-radius:50%}',
    '  #pcBtn span{display:none}',
    '  #pcBtn img{width:42px;height:42px}',
    '  #pcPanel{left:10px;right:10px;width:auto;bottom:calc(96px + env(safe-area-inset-bottom));height:min(68dvh,560px);max-height:calc(100dvh - 190px)}',
    '}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.id = 'posty-chat-root';
  root.innerHTML =
    '<button id="pcBtn" type="button" aria-label="Hablá con Posty">' +
      '<img src="/ai-avatar.png" alt="Posty"><span>Hablá con Posty</span>' +
    '</button>' +
    '<div id="pcPanel" class="pc-hidden" role="dialog" aria-label="Chat con Posty">' +
      '<div class="pc-head">' +
        '<img src="/ai-avatar.png" alt="Posty">' +
        '<div><div class="pc-name">Posty</div>' +
        '<div class="pc-sub">Tu community manager · responde al instante</div></div>' +
        '<button class="pc-close" type="button" aria-label="Cerrar chat">✕</button>' +
      '</div>' +
      '<div class="pc-msgs" id="pcMsgs"></div>' +
      '<div class="pc-chips" id="pcChips">' +
        '<button class="pc-chip" type="button" data-send="¿Cuánto sale?">¿Cuánto sale?</button>' +
        '<button class="pc-chip" type="button" data-send="¿Qué hace Posty exactamente?">¿Qué hace Posty exactamente?</button>' +
        '<button class="pc-chip" type="button" data-goto="analisis">Quiero mi análisis gratis</button>' +
      '</div>' +
      '<form class="pc-form" id="pcForm">' +
        '<input id="pcInput" type="text" maxlength="1000" autocomplete="off" placeholder="Escribile a Posty…">' +
        '<button class="pc-send" id="pcSend" type="submit">Enviar</button>' +
      '</form>' +
    '</div>';
  document.body.appendChild(root);

  var btn = root.querySelector('#pcBtn');
  var panel = root.querySelector('#pcPanel');
  var msgs = root.querySelector('#pcMsgs');
  var chips = root.querySelector('#pcChips');
  var form = root.querySelector('#pcForm');
  var input = root.querySelector('#pcInput');
  var sendBtn = root.querySelector('#pcSend');
  var thread = [];
  var greeted = false;
  var busy = false;

  function inApp() { return location.hash.indexOf('#/app') === 0; }
  function applyHash() { root.style.display = inApp() ? 'none' : ''; }
  window.addEventListener('hashchange', applyHash);
  applyHash();

  function scrollMsgs() { msgs.scrollTop = msgs.scrollHeight; }
  function addBubble(role, text) {
    var d = document.createElement('div');
    d.className = 'pc-b ' + (role === 'user' ? 'pc-u' : 'pc-a');
    d.textContent = String(text == null ? '' : text).replace(/\*\*|__/g, '');
    msgs.appendChild(d);
    scrollMsgs();
    return d;
  }

  function openPanel() {
    panel.classList.remove('pc-hidden');
    btn.classList.add('pc-hidden');
    if (!greeted) {
      greeted = true;
      thread.push({ role: 'assistant', text: GREETING });
      addBubble('assistant', GREETING);
    }
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
  }
  function closePanel() {
    panel.classList.add('pc-hidden');
    btn.classList.remove('pc-hidden');
  }
  btn.addEventListener('click', openPanel);
  root.querySelector('.pc-close').addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.classList.contains('pc-hidden')) closePanel();
  });

  function goAnalisis() {
    closePanel();
    setTimeout(function () {
      var id = PAGE === 'prueba' ? 'formCard' : 'analisis';
      var el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (PAGE === 'prueba') {
          var inp = el.querySelector('input');
          if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 450);
        }
      } else {
        location.href = '/prueba';
      }
    }, 80);
  }

  chips.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    if (t.getAttribute('data-goto') === 'analisis') { goAnalisis(); return; }
    var txt = t.getAttribute('data-send');
    if (txt) send(txt);
  });

  function send(text) {
    var clean = String(text || '').trim().slice(0, 1000);
    if (!clean || busy) return;
    busy = true;
    sendBtn.disabled = true;
    thread.push({ role: 'user', text: clean });
    addBubble('user', clean);
    chips.classList.add('pc-hidden');
    input.value = '';
    var loading = document.createElement('div');
    loading.className = 'pc-loading';
    loading.textContent = 'Posty está escribiendo…';
    msgs.appendChild(loading);
    scrollMsgs();
    fetch('/api/posty-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, page: PAGE, messages: thread.slice(-12) })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        loading.remove();
        var reply = (data && data.reply) || 'Se me cortó un segundo 🤖 Probá de nuevo en un ratito.';
        thread.push({ role: 'assistant', text: reply });
        addBubble('assistant', reply);
      })
      .catch(function () {
        loading.remove();
        addBubble('assistant', 'Se me cortó la conexión 🤖 Probá de nuevo en un ratito — o dejame tu WhatsApp o tu email y te escribe una persona de mi equipo.');
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        try { input.focus(); } catch (e) {}
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    send(input.value);
  });
})();
