/* Public "Aktuelles" news section — loads AFTER render, never blocks the site.
   If the API is unreachable or empty, the section simply stays hidden. */
(function () {
  "use strict";
  var sec = document.getElementById("news");
  var grid = document.getElementById("newsGrid");
  if (!sec || !grid) return;

  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 6000);

  fetch("/api/news", { signal: ctrl.signal, headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (data) {
      clearTimeout(timer);
      var items = (data && Array.isArray(data.news)) ? data.news : [];
      if (!items.length) return; // stay hidden
      var frag = document.createDocumentFragment();
      items.forEach(function (n) { frag.appendChild(card(n)); });
      grid.appendChild(frag);
      sec.hidden = false;
      reveal();
    })
    .catch(function () { clearTimeout(timer); /* silent — site keeps working */ });

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  function card(n) {
    var art = el("article", "news__card reveal");

    if (n.image) {
      var fig = el("div", "news__img");
      var img = el("img");
      img.loading = "lazy"; img.decoding = "async"; img.alt = "";
      img.src = String(n.image);
      fig.appendChild(img);
      art.appendChild(fig);
    }

    var body = el("div", "news__body");

    if (n.created_at) {
      var t = el("time", "news__date");
      t.textContent = fmtDate(n.created_at);
      body.appendChild(t);
    }

    var h = el("h3");
    h.textContent = String(n.title || "");            // textContent = safe, no HTML injection
    body.appendChild(h);

    var text = el("div", "news__text");
    String(n.body || "").split(/\n{2,}/).forEach(function (seg) {
      var p = el("p");
      p.textContent = seg.replace(/\n/g, " ").trim(); // collapse single newlines, escape via textContent
      if (p.textContent) text.appendChild(p);
    });
    body.appendChild(text);

    art.appendChild(body);
    return art;
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }); }
    catch (e) { return ""; }
  }

  function reveal() {
    var els = grid.querySelectorAll(".reveal");
    if (matchMedia("(prefers-reduced-motion:reduce)").matches || !("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  }
})();
