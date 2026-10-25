/* ===== CAPA DE JUEGO + SCROLL — homes · 2026-10-25 =====
   1) El viaje de niveles crece al entrar en pantalla.
   2) La luz dorada viaja con la lectura (progreso real de scroll).
   3) Las secciones entran suaves cuando llegan al viewport.
   4) La semana de ejemplo se arma posteo a posteo y UN posteo se publica
      solo (demo del piloto automático, sobre material de ejemplo rotulado).
   Sin scroll-jacking: el visitante baja a su velocidad; todo acompaña.
   Con prefers-reduced-motion o sin IntersectionObserver: página estática
   y completa, como si la capa no existiera. */
(function () {
  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var HAS_IO = 'IntersectionObserver' in window;
  var EN = (document.documentElement.lang || '').indexOf('en') === 0;
  var armed = new WeakSet();

  /* ---------- 2) la luz que viaja con la lectura ---------- */
  if (!RM) {
    var light = document.createElement('div');
    light.className = 'gj-light';
    light.setAttribute('aria-hidden', 'true');
    light.innerHTML = '<i></i>';
    document.documentElement.appendChild(light);
    var bar = light.firstChild, ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var h = document.documentElement;
        var max = h.scrollHeight - h.clientHeight;
        var p = max > 0 ? Math.min(1, (window.scrollY || h.scrollTop) / max) : 0;
        bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
        document.documentElement.classList.toggle('gj-scroll', p > 0.005);
      });
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- observador único de reveals ---------- */
  var revealIO = null;
  function reveal(el) {
    if (RM || !HAS_IO) { el.classList.add('gj-in'); return; }
    if (!revealIO) {
      revealIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('gj-in'); revealIO.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    }
    revealIO.observe(el);
  }
  function belowFold(el) {
    var r = el.getBoundingClientRect();
    return r.top > (window.innerHeight || 700) * 0.92;
  }

  /* ---------- 4) grillas de ejemplo: se arman y una pieza se publica ---------- */
  var pubDone = {};
  function badge(grid, target, owner) {
    if (pubDone[owner || 'grid'] || !target) return;
    pubDone[owner || 'grid'] = true;
    var b = document.createElement('span');
    b.className = 'gj-pub';
    b.innerHTML = (EN ? '✓ Published!' : '✓ ¡Publicado!') + ' <span class="gj-demo">DEMO</span>';
    b.title = EN ? "Demo: this is how Posty's autopilot posts on its own"
                 : 'Demo: así publica el piloto automático de Posty, solo';
    if (target.tagName === 'IMG') {
      grid.classList.add('gj-pub-wrap');
      b.classList.add('gj-pub-l');
      b.style.left = (target.offsetLeft + target.offsetWidth - 8) + 'px';
      b.style.top = (target.offsetTop + 8) + 'px';
      b.style.right = 'auto';
      grid.appendChild(b);
    } else {
      target.classList.add('gj-pub-wrap');
      target.appendChild(b);
    }
    setTimeout(function () { b.classList.add('on'); }, RM ? 0 : 350);
  }
  function armGrid(grid, withBadge) {
    if (!grid || armed.has(grid)) return;
    armed.add(grid);
    var pieces = Array.prototype.slice.call(grid.children);
    if (!pieces.length) return;
    var target = withBadge ? (grid.querySelector('.igp-cell-reel') || pieces[Math.min(2, pieces.length - 1)]) : null;
    if (RM || !HAS_IO || !belowFold(grid)) {
      pieces.forEach(function (p) { p.classList.add('gj-in'); });
      if (withBadge) badge(grid, target);
      return;
    }
    document.documentElement.classList.add('gj-armed');
    pieces.forEach(function (p) { p.classList.add('gj-piece'); });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.disconnect();
        pieces.forEach(function (p, i) {
          setTimeout(function () { p.classList.add('gj-in'); }, 130 * i);
        });
        setTimeout(function () { if (withBadge) badge(grid, target); }, 130 * pieces.length + 750);
      });
    }, { threshold: 0.22 });
    io.observe(grid);
    /* La semana de ejemplo puede re-renderizarse (chips de rubro): las
       piezas nuevas entran visibles, sin repetir la coreografía. */
    new MutationObserver(function () {
      Array.prototype.forEach.call(grid.children, function (p) {
        if (!p.classList.contains('gj-piece')) p.classList.add('gj-piece', 'gj-in');
      });
    }).observe(grid, { childList: true });
  }

  /* ---------- la oficina: su día, al ritmo de la bajada ---------- */
  var CAPS = EN
    ? ['Posty settles into his corner and plans your week.', 'He builds your post wall, one piece at a time, in your brand.', 'Your week gets scheduled, day by day.', 'A comment comes in… and gets answered.', 'And a post goes out on its own. Like that, all week long.']
    : ['Posty llega a su sector y piensa tu semana.', 'Arma tu pared de posteos, uno por uno, con tu marca.', 'Tu semana queda programada, día por día.', 'Llega un comentario… y queda respondido.', 'Y un posteo se publica solo. Así, toda la semana.'];
  var office = null, officeState = {};
  function officeFinalize(sec) {
    sec.querySelectorAll('.gj-op').forEach(function (p) { p.classList.add('on'); });
    sec.querySelectorAll('.gj-days i').forEach(function (d) { d.classList.add('on'); });
    sec.querySelectorAll('.gj-cin,.gj-cout').forEach(function (c) { c.classList.add('on'); });
    var glow = sec.querySelector('.gj-glow'); if (glow) glow.style.opacity = '.8';
    var pieces = sec.querySelectorAll('.gj-op');
    if (pieces.length) badge(sec.querySelector('.gj-feedwall'), pieces[Math.min(4, pieces.length - 1)], 'office');
    var cap = sec.querySelector('[data-gj-cap]'); if (cap) cap.textContent = CAPS[4];
  }
  function officeDrive() {
    if (!office) return;
    var wrap = office.querySelector('.gj-stage-wrap');
    var r = wrap.getBoundingClientRect();
    var vh = window.innerHeight || 700;
    if (r.bottom < 0 || r.top > vh) return;
    var total = wrap.offsetHeight - vh;
    var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
    var sec = office;
    var nP = Math.max(0, Math.min(6, Math.round(((p - 0.10) / 0.34) * 6)));
    if (officeState.nP !== nP) {
      officeState.nP = nP;
      sec.querySelectorAll('.gj-op').forEach(function (el, i) { el.classList.toggle('on', i < nP); });
    }
    var nD = Math.max(0, Math.min(7, Math.round(((p - 0.44) / 0.17) * 7)));
    if (officeState.nD !== nD) {
      officeState.nD = nD;
      sec.querySelectorAll('.gj-days i').forEach(function (el, i) { el.classList.toggle('on', i < nD); });
    }
    var cin = p >= 0.63, cout = p >= 0.73;
    if (officeState.cin !== cin) { officeState.cin = cin; var e1 = sec.querySelector('.gj-cin'); if (e1) e1.classList.toggle('on', cin); }
    if (officeState.cout !== cout) { officeState.cout = cout; var e2 = sec.querySelector('.gj-cout'); if (e2) e2.classList.toggle('on', cout); }
    var glow = sec.querySelector('.gj-glow');
    if (glow) glow.style.opacity = p >= 0.84 ? String(0.35 + (p - 0.84) * 3) : '0';
    if (p >= 0.86 && !officeState.pub) {
      officeState.pub = true;
      var pieces = sec.querySelectorAll('.gj-op');
      if (pieces.length) badge(sec.querySelector('.gj-feedwall'), pieces[Math.min(4, pieces.length - 1)], 'office');
    }
    var ci = p < 0.10 ? 0 : p < 0.44 ? 1 : p < 0.61 ? 2 : p < 0.84 ? 3 : 4;
    if (officeState.ci !== ci) {
      officeState.ci = ci;
      var cap = sec.querySelector('[data-gj-cap]');
      if (cap) {
        cap.classList.add('gj-capfade');
        setTimeout(function () { cap.textContent = CAPS[ci]; cap.classList.remove('gj-capfade'); }, 260);
      }
    }
  }
  function armOffice(root) {
    var sec = (root || document).querySelector('[data-gj-office]');
    if (!sec || office) return;
    office = sec;
    if (RM || !HAS_IO) { officeFinalize(sec); return; }
    document.documentElement.classList.add('gj-armed');
    addEventListener('scroll', function () {
      if (officeState.tk) return;
      officeState.tk = true;
      requestAnimationFrame(function () { officeState.tk = false; officeDrive(); });
    }, { passive: true });
    addEventListener('resize', officeDrive, { passive: true });
    officeDrive();
  }

  /* ---------- tipografía cinética + fondo vivo (capa de cierre) ----------
     Las letras de los titulares principales juegan al llegar: cascada por
     letra en el hero, la oficina y el cierre; y UNA frase que se arma con
     la bajada (scrub atado al scroll): la de niveles. El fondo ambiental
     es CSS (body::before/::after en gj.css); acá solo recibe su parallax
     mínimo vía --gjbg. Sin JS el texto queda nativo y completo; con
     reduced-motion no se arma nada: texto estático, fondo plano. */
  var ktDone = new WeakSet(), scrubbers = [], ktTk = false;
  function ktSplit(el) {
    if (!el || ktDone.has(el) || el.getAttribute('data-gj-kt')) return null;
    var text = '';
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) text += c.nodeValue;
        else if (c.tagName === 'BR') text += ' ';
        else walk(c);
      });
    })(el);
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    el.setAttribute('data-gj-kt', '1'); ktDone.add(el);
    el.setAttribute('aria-label', text);
    var wrap = document.createElement('span');
    wrap.className = 'kt-src'; wrap.setAttribute('aria-hidden', 'true');
    var letters = [];
    (function build(node, parent) {
      Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
        if (ch.nodeType === 3) {
          ch.nodeValue.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { parent.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span'); w.className = 'kt-w';
            Array.from(part).forEach(function (chr) {
              var l = document.createElement('span'); l.className = 'kt-l'; l.textContent = chr;
              w.appendChild(l); letters.push(l);
            });
            parent.appendChild(w);
          });
        } else if (ch.nodeType === 1 && ch.tagName !== 'BR') {
          var clone = ch.cloneNode(false); parent.appendChild(clone); build(ch, clone);
        } else { parent.appendChild(ch.cloneNode(true)); }
      });
    })(el, wrap);
    el.innerHTML = ''; el.appendChild(wrap);
    return letters;
  }
  function ktPlay(el) {
    el.classList.add('kt-in');
  }
  function ktCascade(el) {
    if (RM || !HAS_IO) return;
    var letters = ktSplit(el); if (!letters) return;
    el.classList.add('kt-cascade');
    letters.forEach(function (l, i) { l.style.transitionDelay = Math.min(i * 22, 800) + 'ms'; });
    var hidden = el.offsetParent === null;
    if (!hidden && !belowFold(el)) {
      requestAnimationFrame(function () { requestAnimationFrame(function () { ktPlay(el); }); });
      return;
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { ktPlay(el); io.disconnect(); } });
    }, { threshold: 0.35 });
    io.observe(el);
  }
  function ktScrub(el) {
    if (RM || !HAS_IO) return;
    var letters = ktSplit(el); if (!letters) return;
    el.classList.add('kt-scrub');
    scrubbers.push({ el: el, letters: letters, done: false });
    scrubDrive();
  }
  function scrubDrive() {
    var vh = window.innerHeight || 700;
    scrubbers.forEach(function (s) {
      if (s.done) return;
      var r = s.el.getBoundingClientRect();
      if (r.bottom < -60 || r.top > vh + 60) return;
      var p = Math.min(1, Math.max(0, (vh * 0.96 - r.top) / (vh * 0.52)));
      var n = s.letters.length;
      s.letters.forEach(function (l, i) {
        var lp = Math.min(1, Math.max(0, p * (n + 4) - i));
        l.style.opacity = lp.toFixed(3);
        l.style.transform = 'translateY(' + ((1 - lp) * 0.34).toFixed(3) + 'em) scale(' + (0.9 + 0.1 * lp).toFixed(3) + ')';
      });
      if (p >= 1) {
        s.done = true; s.el.classList.add('kt-in');
        s.letters.forEach(function (l) { l.style.opacity = ''; l.style.transform = ''; });
      }
    });
    /* parallax mínimo del fondo: sube 14px en todo el recorrido */
    var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
    var p2 = max > 0 ? Math.min(1, (window.scrollY || h.scrollTop) / max) : 0;
    h.style.setProperty('--gjbg', (p2 * -14).toFixed(1) + 'px');
  }
  if (!RM && HAS_IO) {
    addEventListener('scroll', function () {
      if (ktTk) return; ktTk = true;
      requestAnimationFrame(function () { ktTk = false; scrubDrive(); });
    }, { passive: true });
    addEventListener('resize', scrubDrive, { passive: true });
  }
  function armKt(doc) {
    var hero = doc.querySelector('.hero h1');
    if (hero) ktCascade(hero);
    var lv = doc.querySelector('[data-gj-levels] h2');
    if (lv) ktScrub(lv);
    var off = doc.querySelector('[data-gj-office] h2');
    if (off) ktCascade(off);
    var fin = doc.querySelector('.lp-final h2');
    if (fin) ktCascade(fin);
  }

  /* ---------- TALLO VIVO (2026-10-25 · MAGIA POST-PAGO, paquete 2) ----------
     Un solo componente, dos modos — y vive ACÁ (gj.js corre en la home ES
     renderizada por app.js y en la home EN estática, así que el mismo
     código sirve a las dos). Sin sesión (401) no pasa nada: la sección
     queda como está, el camino como promesa. Con sesión, EL MISMO
     endpoint que la app (/api/posty/level, misma sesión) devuelve su
     tallo real y la sección se vuelve SU tallo: nudos llenos por orden,
     segmento siguiente lleno según progress_pct, nota con el próximo
     paso real («te faltan N cosas para ser…»), CTA a su semana y, si
     acaba de subir, la MISMA celebración que el chat de la app
     (level_message). Sin nivel computable, camino genérico: nunca un
     nivel inventado. Los nombres vienen por ORDEN de nudo, no por texto:
     ES y EN comparten la estructura. */
  var LIVE_NAMES = EN
    ? ['New to your feed', 'Reading your world', 'One of the house', "Your Instagram's right hand", 'Your content partner']
    : ['Nuevo en tu feed', 'Leyendo tu mundo', 'De la casa', 'Mano derecha de tu Instagram', 'Tu socio de contenido'];
  var liveFetch = null; /* null = sin intentar · Promise = en curso/resuelto · false = sin sesión */
  function applyLive(sec, d) {
    var nodes = sec.querySelectorAll('.gj-node');
    var segs = sec.querySelectorAll('.gj-seg i');
    if (nodes.length !== 5 || !d || typeof d.level !== 'number') return false;
    sec.classList.add('gj-live');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('gj-done', i < d.level - 1);
      nodes[i].classList.toggle('gj-cur', i === d.level - 1);
    }
    for (var j = 0; j < segs.length; j++) {
      var pct = 0;
      if (j < d.level - 1) pct = 100;
      else if (j === d.level - 1) pct = Math.max(0, Math.min(100, d.progress_pct || 0));
      segs[j].style.width = pct + '%';
      segs[j].style.height = pct + '%';
    }
    var note = sec.querySelector('.gj-note');
    if (note) {
      if (d.level >= 5) {
        note.textContent = EN
          ? 'Your live stem: you made it — your content partner. Your whole week goes out on its own.'
          : 'Tu tallo en vivo: llegaste — tu socio de contenido. Tu semana entera sale sola.';
      } else {
        var miss = (d.next_missing || []).length;
        var nextName = LIVE_NAMES[d.level] || '';
        note.textContent = EN
          ? 'Your live stem: ' + (miss ? ('you are ' + miss + ' step' + (miss === 1 ? '' : 's') + ' away from ' + nextName + '.') : ('almost ' + nextName + '.'))
          : 'Tu tallo en vivo: ' + (miss ? ('te faltan ' + miss + ' ' + (miss === 1 ? 'cosa' : 'cosas') + ' para ser ' + nextName + '.') : ('casi ' + nextName + '.'));
      }
    }
    var eye = sec.querySelector('.gj-eyebrow');
    if (eye) eye.textContent = EN ? '🌱 YOUR LIVE STEM' : '🌱 TU TALLO EN VIVO';
    var cta = sec.querySelector('.gj-cta-row a');
    if (cta) { cta.setAttribute('href', '#/app/schedule'); cta.textContent = EN ? 'See my week →' : 'Ver mi semana →'; }
    if (d.leveled_up && d.level_message && !sec.querySelector('.gj-live-cele')) {
      var cel = document.createElement('p');
      cel.className = 'gj-live-cele';
      cel.textContent = d.level_message;
      var row = sec.querySelector('.gj-cta-row');
      if (row) row.parentNode.insertBefore(cel, row); else sec.appendChild(cel);
    }
    return true;
  }
  function tryLive(sec) {
    if (liveFetch === false) return;
    if (liveFetch && liveFetch.then) { liveFetch.then(function (d) { if (d) applyLive(sec, d); }); return; }
    liveFetch = fetch('/api/posty/level', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('no-session'); return r.json(); })
      .then(function (d) { if (!d || !d.ok) throw new Error('no-level'); return d; })
      .catch(function () { liveFetch = false; return null; });
    liveFetch.then(function (d) { if (d) applyLive(sec, d); });
  }

  /* ---------- 1) + 3) niveles y secciones ---------- */
  function arm(root) {
    var doc = root || document;
    /* niveles */
    var secs = doc.querySelectorAll('[data-gj-levels]');
    for (var i = 0; i < secs.length; i++) {
      var sec = secs[i];
      if (armed.has(sec)) continue;
      armed.add(sec);
      tryLive(sec);
      if (RM || !HAS_IO) { sec.classList.add('gj-in'); continue; }
      (function (s) {
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) { if (!s.classList.contains('gj-live')) s.classList.add('gj-in'); io.disconnect(); } });
        }, { threshold: 0.3 });
        io.observe(s);
      })(sec);
    }
    /* secciones que Posty trae (solo las que nacen bajo el pliegue) */
    if (!RM && HAS_IO) {
      var blocks = doc.querySelectorAll('.section:not([data-gj-levels]):not([data-gj-office]), .gj-levels');
      for (var j = 0; j < blocks.length; j++) {
        var bl = blocks[j];
        if (armed.has(bl) || bl.hasAttribute('data-gj-levels')) continue;
        if (!belowFold(bl)) { armed.add(bl); continue; }
        armed.add(bl);
        bl.setAttribute('data-gj-rv', '');
        document.documentElement.classList.add('gj-armed');
        reveal(bl);
      }
    }
    /* grillas de ejemplo: la vidriera se arma sola; el momento «¡Publicado!»
       vive en la semana de ejemplo rotulada (o en la vidriera si no hay).
       La oficina tiene su propio driver: sus grillas quedan fuera de éste. */
    var week = doc.querySelector('#lpWeekGrid');
    var wall = doc.querySelector('.igp-grid');
    if (wall) armGrid(wall, !week);
    if (week) armGrid(week, true);
    armOffice(doc);
    armKt(doc);
  }
  /* Primitivas de magia para la app (mismo lenguaje, sin duplicar):
     la bienvenida y los encabezados post-pago juegan con la misma
     cascada que los titulares de la landing. */
  try { window.__gjKt = { cascade: ktCascade, scrub: ktScrub }; } catch (e) {}
  arm(document);
  if ('MutationObserver' in window) {
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; arm(document); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
