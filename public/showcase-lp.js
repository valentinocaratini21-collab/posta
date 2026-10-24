/* 📣 (v370) REAL SOCIAL PROOF — landing EN (la ES usa lpShowcaseInit en
   app.js; esta página es estática y no carga app.js, por eso vive acá).
   The «Real stories» section is injected ONLY when /api/showcase
   returns active cases: a paying client who said yes, approved their
   story word for word, and is still a client. With no cases — or any
   failure — nothing is inserted: no section, no empty box, no "coming
   soon" in the served HTML. The frame is English; each client's quote
   stays in the language they approved it in (their real words). */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  fetch('/api/showcase').then(function (r) { return r.json(); }).then(function (d) {
    var cases = (d && d.cases) ? d.cases : [];
    if (!cases.length) return;
    var anchor = document.querySelector('.lp-week-sec');
    if (!anchor || document.getElementById('real-stories')) return;
    var cards = cases.map(function (c) {
      var who = esc(c.business_name) + (c.rubro ? ' · ' + esc(c.rubro) : '') + (c.city ? ' · ' + esc(c.city) : '');
      var img = c.image ? '<div class="sc-phone"><div class="sc-phone-head"><b>' + esc(c.business_name) + '</b><span>•••</span></div><img loading="lazy" src="' + esc(c.image) + '" alt="A real post from ' + esc(c.business_name) + ', made with Posty"></div>' : '';
      var inner = '<figure class="sc-card-lp">' + img + '<blockquote>«' + esc(c.quote) + '»</blockquote><figcaption><b>' + who + '</b><span class="sc-chip">📊 ' + esc(c.metric_label || '') + '</span></figcaption></figure>';
      return c.permalink ? '<a class="sc-link" href="' + esc(c.permalink) + '" target="_blank" rel="noopener">' + inner + '</a>' : inner;
    }).join('');
    anchor.insertAdjacentHTML('afterend',
      '<div class="section sc-sec" id="real-stories"><div class="wrap">' +
      '<h2>Real stories 💛</h2>' +
      '<p class="lede">Businesses that no longer touch their Instagram: Posty runs it for them — and they say it themselves.</p>' +
      '<div class="sc-row">' + cards + '</div>' +
      '</div></div>');
  }).catch(function () {});
})();
