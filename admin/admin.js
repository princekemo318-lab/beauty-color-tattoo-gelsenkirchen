/* Beauty & Color — Admin-Logik. Spricht mit der session-geschützten API.
   Das Session-Cookie (bct_session) geht same-origin automatisch mit. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var list = $("list"), listEmpty = $("listEmpty");
  var form = $("form"), editorTitle = $("editorTitle"), msg = $("msg");
  var fTitle = $("f-title"), fBody = $("f-body"), fImage = $("f-image"),
      fPub = $("f-pub"), fSort = $("f-sort");
  var saveBtn = $("saveBtn"), deleteBtn = $("deleteBtn");
  var preview = $("preview"), prevImg = $("prev-img"), rmImg = $("rm-img");

  var state = { id: null, imageKey: null };

  function setMsg(text, kind) { msg.textContent = text || ""; msg.className = "ad-msg" + (kind ? " " + kind : ""); }

  function api(path, opts) {
    opts = opts || {};
    opts.credentials = "same-origin";
    opts.headers = Object.assign({ accept: "application/json" }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { location.replace("/admin/"); throw new Error("Sitzung abgelaufen — bitte neu anmelden."); }
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) throw new Error(body.error || ("Fehler " + r.status));
        return body;
      });
    });
  }

  /* ---------- list ---------- */
  function loadList() {
    api("/api/news?status=all").then(function (data) {
      var items = (data && data.news) || [];
      list.textContent = "";
      listEmpty.hidden = items.length > 0;
      items.forEach(function (n) { list.appendChild(itemEl(n)); });
    }).catch(function (e) { setMsg(e.message, "err"); });
  }

  function itemEl(n) {
    var li = document.createElement("li");
    li.className = "ad-item" + (state.id === n.id ? " active" : "");
    var b = document.createElement("b"); b.textContent = n.title; li.appendChild(b);
    var meta = document.createElement("div"); meta.className = "ad-item-meta";
    var badge = document.createElement("span");
    badge.className = "ad-badge " + (n.published ? "ad-badge--on" : "ad-badge--off");
    badge.textContent = n.published ? "Live" : "Entwurf";
    meta.appendChild(badge);
    var date = document.createElement("span");
    date.textContent = fmt(n.created_at);
    meta.appendChild(date);
    li.appendChild(meta);
    li.addEventListener("click", function () { edit(n); });
    return li;
  }
  function fmt(iso) { try { return new Date(iso).toLocaleDateString("de-DE"); } catch (e) { return ""; } }

  /* ---------- form ---------- */
  function reset() {
    state.id = null; state.imageKey = null;
    editorTitle.textContent = "Neue News";
    form.reset(); fSort.value = "0";
    hidePreview();
    deleteBtn.hidden = true;
    saveBtn.textContent = "Veröffentlichen";
    setMsg("");
    [].forEach.call(list.children, function (c) { c.classList.remove("active"); });
  }

  function edit(n) {
    state.id = n.id; state.imageKey = n.image_key || null;
    editorTitle.textContent = "News bearbeiten";
    fTitle.value = n.title; fBody.value = n.body;
    fPub.checked = !!n.published; fSort.value = n.sort_order || 0;
    if (n.image) showPreview(n.image); else hidePreview();
    deleteBtn.hidden = false;
    saveBtn.textContent = "Speichern";
    setMsg("");
    loadList(); // refresh active highlight
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showPreview(src) { prevImg.src = src; preview.hidden = false; }
  function hidePreview() { preview.hidden = true; prevImg.removeAttribute("src"); }

  rmImg.addEventListener("click", function () { state.imageKey = null; hidePreview(); fImage.value = ""; });

  /* ---------- image: resize client-side, then upload ---------- */
  fImage.addEventListener("change", function () {
    var file = fImage.files && fImage.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setMsg("Nur JPEG, PNG oder WebP.", "err"); fImage.value = ""; return; }
    setMsg("Bild wird verarbeitet …");
    saveBtn.disabled = true;
    resize(file, 1600, 0.82).then(function (blob) {
      var fd = new FormData();
      fd.append("file", blob, "news." + (blob.type === "image/webp" ? "webp" : "jpg"));
      return api("/api/upload", { method: "POST", body: fd });
    }).then(function (res) {
      state.imageKey = res.key;
      showPreview(res.url);
      setMsg("Bild hochgeladen.", "ok");
    }).catch(function (e) { setMsg(e.message, "err"); })
      .then(function () { saveBtn.disabled = false; });
  });

  function resize(file, max, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, max / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement("canvas"); c.width = cw; c.height = ch;
        c.getContext("2d").drawImage(img, 0, 0, cw, ch);
        var type = "image/webp";
        c.toBlob(function (blob) {
          if (blob && blob.type === "image/webp") return resolve(blob);
          // fallback for browsers without webp encode
          c.toBlob(function (b2) { b2 ? resolve(b2) : reject(new Error("Bild-Encoding fehlgeschlagen")); }, "image/jpeg", quality);
        }, type, quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Bild konnte nicht gelesen werden")); };
      img.src = url;
    });
  }

  /* ---------- save (create / update) ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var payload = {
      title: fTitle.value.trim(),
      body: fBody.value.trim(),
      image_key: state.imageKey,
      published: fPub.checked,
      sort_order: parseInt(fSort.value, 10) || 0,
    };
    if (!payload.title || !payload.body) { setMsg("Titel und Text sind Pflicht.", "err"); return; }
    saveBtn.disabled = true; setMsg("Speichern …");
    var req = state.id
      ? api("/api/news/" + state.id, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : api("/api/news", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    req.then(function () { setMsg("Gespeichert ✓", "ok"); reset(); loadList(); })
      .catch(function (err) { setMsg(err.message, "err"); })
      .then(function () { saveBtn.disabled = false; });
  });

  /* ---------- delete ---------- */
  deleteBtn.addEventListener("click", function () {
    if (!state.id) return;
    if (!confirm("Diese News wirklich löschen?")) return;
    api("/api/news/" + state.id, { method: "DELETE" })
      .then(function () { setMsg("Gelöscht.", "ok"); reset(); loadList(); })
      .catch(function (err) { setMsg(err.message, "err"); });
  });

  $("cancelBtn").addEventListener("click", reset);
  $("newBtn").addEventListener("click", reset);

  /* ---------- tabs ---------- */
  var tabs = document.querySelectorAll(".ad-tab");
  var panels = { news: $("tab-news"), orders: $("tab-orders"), settings: $("tab-settings") };
  var ordersLoaded = false, settingsLoaded = false;
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      tabs.forEach(function (x) { x.classList.remove("on"); });
      t.classList.add("on");
      var name = t.getAttribute("data-tab");
      Object.keys(panels).forEach(function (k) { if (panels[k]) panels[k].hidden = (k !== name); });
      if (name === "orders" && !ordersLoaded) { ordersLoaded = true; loadOrders(); }
      if (name === "settings" && !settingsLoaded) { settingsLoaded = true; loadSettings(); }
    });
  });

  /* ---------- orders + vouchers ---------- */
  var ordersList = $("ordersList"), ordersEmpty = $("ordersEmpty"), ordersMsg = $("ordersMsg");
  if ($("ordersReload")) $("ordersReload").addEventListener("click", loadOrders);

  function loadOrders() {
    if (ordersMsg) { ordersMsg.textContent = "Lade …"; ordersMsg.className = "ad-msg"; }
    api("/api/shop/orders").then(function (data) {
      var orders = (data && data.orders) || [];
      ordersList.textContent = ""; ordersEmpty.hidden = orders.length > 0; ordersMsg.textContent = "";
      orders.forEach(function (o) { ordersList.appendChild(orderEl(o)); });
    }).catch(function (e) { ordersMsg.textContent = e.message; ordersMsg.className = "ad-msg err"; });
  }
  function orderEl(o) {
    var card = document.createElement("div"); card.className = "ad-order";
    var head = document.createElement("div"); head.className = "ad-order-head";
    var left = document.createElement("div");
    var em = document.createElement("b"); em.textContent = o.customer_email || "—"; left.appendChild(em);
    var meta = document.createElement("div"); meta.className = "ad-order-meta";
    meta.textContent = fmtDT(o.paid_at || o.created_at) + " · " + euro(o.amount_total) + " (inkl. " + euro(o.amount_tax) + " MwSt.)";
    left.appendChild(meta);
    head.appendChild(left);
    var st = document.createElement("span");
    st.className = "ad-badge " + (o.status === "paid" ? "ad-badge--on" : "ad-badge--off");
    st.textContent = o.status; head.appendChild(st);
    card.appendChild(head);
    (o.vouchers || []).forEach(function (v) { card.appendChild(voucherRow(v)); });
    return card;
  }
  function voucherRow(v) {
    var row = document.createElement("div"); row.className = "ad-voucher";
    var code = document.createElement("span"); code.className = "ad-vcode"; code.textContent = v.code; row.appendChild(code);
    var val = document.createElement("span"); val.className = "ad-vval"; val.textContent = v.title + " · " + euro(v.value); row.appendChild(val);
    var stat = document.createElement("span"); stat.className = "ad-vstat ad-vstat--" + v.status; stat.textContent = vStatus(v.status); row.appendChild(stat);
    var act = document.createElement("span"); act.className = "ad-vact";
    if (v.status === "active") {
      act.appendChild(vAct("Eingelöst", function () { setVoucher(v.code, "redeemed"); }));
      act.appendChild(vAct("Stornieren", function () { setVoucher(v.code, "cancelled"); }, true));
    } else {
      act.appendChild(vAct("Reaktivieren", function () { setVoucher(v.code, "active"); }));
    }
    row.appendChild(act);
    return row;
  }
  function vAct(label, fn, danger) {
    var b = document.createElement("button"); b.type = "button";
    b.className = "ad-btn ad-btn--small" + (danger ? " ad-btn--danger" : "");
    b.textContent = label; b.addEventListener("click", fn); return b;
  }
  function setVoucher(code, status) {
    api("/api/shop/voucher/" + code, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: status }) })
      .then(loadOrders)
      .catch(function (e) { ordersMsg.textContent = e.message; ordersMsg.className = "ad-msg err"; });
  }
  function euro(n) { return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",") + " €"; }
  function vStatus(s) { return ({ active: "Gültig", redeemed: "Eingelöst", cancelled: "Storniert", expired: "Abgelaufen" })[s] || s; }
  function fmtDT(iso) { try { return new Date(iso).toLocaleString("de-DE"); } catch (e) { return ""; } }

  /* ---------- Shop-Einstellungen ---------- */
  var SET_KEYS = ["PAYPAL_CLIENT_ID", "PAYPAL_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_ENV",
                  "RESEND_API_KEY", "MAIL_FROM"];
  // ACHTUNG: nicht "setMsg" nennen — so heisst oben die Funktion fuer die News-Meldungen.
  var setForm = $("setForm"), setMsgEl = $("setMsg");

  function setSetMsg(text, kind) {
    if (!setMsgEl) return;
    setMsgEl.textContent = text || "";
    setMsgEl.className = "ad-msg" + (kind ? " " + kind : "");
  }

  function loadSettings() {
    api("/api/admin/settings").then(function (data) {
      var s = (data && data.settings) || {};
      SET_KEYS.forEach(function (k) {
        var state = $("st-" + k), info = s[k] || {};
        if (k === "PAYPAL_ENV") {
          var sel = $("s-" + k);
          // Nur bekannte Werte übernehmen, sonst bleibt die sichere Vorauswahl stehen.
          if (sel && (info.preview === "live" || info.preview === "sandbox")) sel.value = info.preview;
        } else if (k === "MAIL_FROM") {
          var inp = $("s-" + k);
          if (inp && info.preview) inp.value = info.preview;
        }
        if (!state) return;
        if (info.set) {
          state.textContent = "gespeichert: " + info.preview +
            (info.source === "env" ? " (aus der Serverkonfiguration)" : "");
          state.className = "ad-state ad-state--on";
        } else {
          state.textContent = "noch nicht gesetzt";
          state.className = "ad-state";
        }
      });
    }).catch(function (e) { setSetMsg(e.message, "err"); });
  }

  if (setForm) {
    setForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var payload = {};
      SET_KEYS.forEach(function (k) {
        var el = $("s-" + k);
        if (!el) return;
        var val = (el.value || "").trim();
        // Leere Felder bleiben unangetastet — außer bei den beiden Auswahl-/Klartextfeldern.
        if (val || k === "PAYPAL_ENV") payload[k] = val;
      });
      $("setSave").disabled = true;
      setSetMsg("Speichern …");
      api("/api/admin/settings", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function () {
        // Geheime Eingaben sofort aus dem Formular entfernen.
        ["PAYPAL_SECRET", "PAYPAL_WEBHOOK_ID", "RESEND_API_KEY"].forEach(function (k) {
          var el = $("s-" + k); if (el) el.value = "";
        });
        setSetMsg("Gespeichert ✓", "ok");
        loadSettings();
      }).catch(function (err) { setSetMsg(err.message, "err"); })
        .then(function () { $("setSave").disabled = false; });
    });
  }

  if ($("setTest")) {
    $("setTest").addEventListener("click", function () {
      $("setTest").disabled = true;
      setSetMsg("Teste Verbindung …");
      api("/api/admin/settings", { method: "POST" }).then(function (r) {
        var pp = r.paypal || {}, rs = r.resend || {};
        setSetMsg("PayPal: " + (pp.msg || "—") + "  ·  Resend: " + (rs.msg || "—"),
                  pp.ok ? "ok" : "err");
      }).catch(function (e) { setSetMsg(e.message, "err"); })
        .then(function () { $("setTest").disabled = false; });
    });
  }

  /* ---------- Session / Abmelden ---------- */
  var logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      logoutBtn.disabled = true;
      fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" })
        .then(function () { location.replace("/admin/"); })
        .catch(function () { location.replace("/admin/"); });
    });
  }

  // Zeigt an, als wer man angemeldet ist — und merkt, wenn die Session abgelaufen ist.
  fetch("/api/admin/session", { credentials: "same-origin", headers: { accept: "application/json" } })
    .then(function (r) { if (r.status === 401) { location.replace("/admin/"); return null; } return r.json(); })
    .then(function (s) {
      var hello = $("adHello");
      if (s && s.user && hello) hello.title = "Angemeldet als " + s.user;
    })
    .catch(function () {});

  loadList();
})();
