/* Shop — cart + PayPal checkout via our own server API.
   Prices for DISPLAY only; the server recomputes authoritatively before payment.
   PayPal SDK loads only here (homepage performance untouched). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var euro = function (n) { return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",") + " €"; };

  var cfg = { shipping: 1.8, taxRate: 0.19, customMin: 200, currency: "EUR" };
  var cart = [];           // [{lineId, id, kind, title, unit, qty}]
  var seq = 0;
  var ppRendered = false;

  var itemsEl = $("cartItems"), emptyEl = $("cartEmpty"), totalsEl = $("cartTotals"),
      checkoutEl = $("checkout"), notice = $("ppNotice"), success = $("shopSuccess");

  /* ---------- add to cart ---------- */
  [].forEach.call(document.querySelectorAll(".shop__card"), function (card) {
    var btn = card.querySelector(".shop__add");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var id = card.getAttribute("data-id");
      var kind = card.getAttribute("data-kind");
      var title = card.getAttribute("data-title");
      var unit;
      if (id === "custom") {
        unit = parseFloat(($("customAmount") || {}).value || "0");
        if (!isFinite(unit) || unit < cfg.customMin) { setNotice("Bitte einen Betrag ab " + cfg.customMin + " € eingeben.", true); return; }
        cart.push({ lineId: ++seq, id: id, kind: kind, title: "Gutschein " + euro(unit), unit: unit, qty: 1 });
      } else {
        unit = parseFloat(card.getAttribute("data-price"));
        var ex = cart.find(function (i) { return i.id === id; });
        if (ex) ex.qty++; else cart.push({ lineId: ++seq, id: id, kind: kind, title: title, unit: unit, qty: 1 });
      }
      setNotice("", false);
      render();
    });
  });

  /* ---------- render cart ---------- */
  function render() {
    itemsEl.textContent = "";
    if (!cart.length) {
      emptyEl.hidden = false; totalsEl.hidden = true; checkoutEl.hidden = true;
      return;
    }
    emptyEl.hidden = true; totalsEl.hidden = false; checkoutEl.hidden = false;

    var sub = 0;
    cart.forEach(function (i) {
      sub += i.unit * i.qty;
      var li = document.createElement("li"); li.className = "cart__item";
      var info = document.createElement("div"); info.className = "cart__item-info";
      var t = document.createElement("b"); t.textContent = i.title; info.appendChild(t);
      var p = document.createElement("span"); p.textContent = euro(i.unit * i.qty); info.appendChild(p);
      li.appendChild(info);

      var ctr = document.createElement("div"); ctr.className = "cart__qty";
      if (i.id !== "custom") {
        ctr.appendChild(qtyBtn("−", function () { i.qty = Math.max(1, i.qty - 1); render(); }));
        var q = document.createElement("span"); q.textContent = i.qty; ctr.appendChild(q);
        ctr.appendChild(qtyBtn("+", function () { i.qty = Math.min(20, i.qty + 1); render(); }));
      }
      ctr.appendChild(qtyBtn("✕", function () { cart = cart.filter(function (x) { return x.lineId !== i.lineId; }); render(); }, "cart__rm"));
      li.appendChild(ctr);
      itemsEl.appendChild(li);
    });

    var total = sub + cfg.shipping;
    var tax = total - total / (1 + cfg.taxRate);
    $("tSub").textContent = euro(sub);
    $("tShip").textContent = euro(cfg.shipping);
    $("tTotal").textContent = euro(total);
    $("tTax").textContent = euro(tax);
  }
  function qtyBtn(label, fn, cls) {
    var b = document.createElement("button"); b.type = "button"; b.className = "cart__qbtn" + (cls ? " " + cls : "");
    b.textContent = label; b.addEventListener("click", fn); return b;
  }

  function serverItems() {
    return cart.map(function (i) { return i.id === "custom" ? { id: "custom", qty: i.qty, amount: i.unit } : { id: i.id, qty: i.qty }; });
  }
  function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e || ""); }

  /* ---------- config + PayPal ---------- */
  fetch("/api/shop/config", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (c) {
      if (c.shipping != null) cfg.shipping = c.shipping;
      if (c.taxRate != null) cfg.taxRate = c.taxRate;
      if (c.customMin != null) cfg.customMin = c.customMin;
      if (c.currency) cfg.currency = c.currency;
      render();
      if (!c.paypalClientId) return fallback("Online-Bezahlung wird gerade eingerichtet — bestelle solange per WhatsApp.");
      loadSDK(c.paypalClientId, c.currency).then(renderButtons).catch(function () {
        fallback("PayPal konnte nicht geladen werden — bitte per WhatsApp bestellen.");
      });
    })
    .catch(function () { render(); fallback("Shop momentan nicht erreichbar — bitte per WhatsApp bestellen."); });

  function loadSDK(clientId, currency) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(clientId) +
              "&currency=" + (currency || "EUR") + "&components=buttons&enable-funding=paylater&locale=de_DE";
      s.onload = function () { window.paypal ? resolve() : reject(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function renderButtons() {
    if (ppRendered) return; ppRendered = true;
    window.paypal.Buttons({
      style: { color: "gold", shape: "pill", label: "pay", height: 46, tagline: false },
      createOrder: function () {
        if (!cart.length) { setNotice("Dein Warenkorb ist leer.", true); return Promise.reject(); }
        var email = ($("email").value || "").trim();
        if (!validEmail(email)) { setNotice("Bitte eine gültige E-Mail-Adresse angeben.", true); $("email").focus(); return Promise.reject(); }
        setNotice("", false);
        return fetch("/api/shop/paypal/create-order", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: serverItems(), email: email })
        }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || "Fehler"); return b.id; }); })
          .catch(function (e) { setNotice(e.message || "Bestellung fehlgeschlagen.", true); throw e; });
      },
      onApprove: function (data) {
        return fetch("/api/shop/paypal/capture-order", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderID: data.orderID })
        }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || "Zahlung nicht bestätigt"); return b; }); })
          .then(showSuccess)
          .catch(function (e) { setNotice(e.message || "Zahlung konnte nicht bestätigt werden. Bitte kontaktiere uns per WhatsApp.", true); });
      },
      onError: function () { setNotice("Bei der Zahlung ist ein Fehler aufgetreten. Bitte erneut versuchen oder per WhatsApp bestellen.", true); },
      onCancel: function () { setNotice("Zahlung abgebrochen.", false); }
    }).render("#paypal-buttons");
  }

  function showSuccess(res) {
    var ul = $("successVouchers"); ul.textContent = "";
    (res.vouchers || []).forEach(function (v) {
      var li = document.createElement("li");
      var t = document.createElement("b"); t.textContent = v.title + " — " + euro(v.value); li.appendChild(t);
      var c = document.createElement("span"); c.className = "shop__vcode"; c.textContent = v.code; li.appendChild(c);
      if (res.voucherUrl || v.code) {
        var a = document.createElement("a"); a.href = "/voucher/" + v.code; a.target = "_blank"; a.rel = "noopener";
        a.textContent = "ansehen ↗"; a.className = "shop__vlink"; li.appendChild(a);
      }
      ul.appendChild(li);
    });
    document.querySelector(".shop__layout").style.display = "none";
    success.hidden = false;
    success.scrollIntoView({ behavior: "smooth" });
  }

  function fallback(text) {
    setNotice(text, false);
    var wa = $("waFallback"); if (wa) { wa.hidden = false; wa.classList.add("btn", "btn--line"); }
  }
  function setNotice(text, isErr) {
    if (!notice) return;
    notice.textContent = text || ""; notice.hidden = !text;
    notice.classList.toggle("shop__notice--err", !!isErr);
  }

  render();
})();
