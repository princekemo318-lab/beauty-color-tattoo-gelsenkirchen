// Shop catalog + pricing + voucher helpers. PRICES ARE AUTHORITATIVE HERE
// (server-side). The client can never set prices — only choose product id + qty.

export const CURRENCY = "EUR";
export const TAX_RATE = 0.19;      // 19 % MwSt (im Bruttopreis enthalten)
export const SHIPPING = 1.80;      // Versand/Bearbeitung pro Bestellung (brutto), wie im Alt-Shop
export const CUSTOM_MIN = 200;     // "eigener Betrag" ab 200 €

// Bruttopreise (inkl. MwSt), 1:1 aus dem bisherigen Shop.
export const CATALOG = [
  { id: "tattoo-50",   kind: "tattoo",   title: "Tattoo-Gutschein 50 €",   price: 50.0,  category: "Tattoo-Gutschein" },
  { id: "tattoo-100",  kind: "tattoo",   title: "Tattoo-Gutschein 100 €",  price: 100.0, category: "Tattoo-Gutschein" },
  { id: "piercing-50", kind: "piercing", title: "Piercing-Gutschein 50 €", price: 50.0,  category: "Piercing-Gutschein" },
  { id: "piercing-100",kind: "piercing", title: "Piercing-Gutschein 100 €",price: 100.0, category: "Piercing-Gutschein" },
  { id: "custom",      kind: "custom",   title: "Gutschein (Wunschbetrag)",price: null,  category: "Wunschbetrag", customMin: CUSTOM_MIN },
];

export const byId = (id) => CATALOG.find((p) => p.id === id);

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// items: [{ id, qty, amount? }]  → server computes the whole order.
export function computeOrder(items) {
  if (!Array.isArray(items) || !items.length) return { error: "Warenkorb ist leer" };
  if (items.length > 20) return { error: "Zu viele Positionen" };

  const lines = [];
  let subtotal = 0;
  for (const it of items) {
    const p = byId(it && it.id);
    if (!p) return { error: "Unbekanntes Produkt" };
    const qty = Math.min(20, Math.max(1, parseInt(it.qty, 10) || 1));
    let unit;
    if (p.id === "custom") {
      unit = round2(parseFloat(it.amount));
      if (!isFinite(unit) || unit < CUSTOM_MIN) return { error: "Wunschbetrag ab " + CUSTOM_MIN + " €" };
      if (unit > 5000) return { error: "Betrag zu hoch" };
    } else {
      unit = p.price;
    }
    const line = round2(unit * qty);
    subtotal = round2(subtotal + line);
    lines.push({ id: p.id, kind: p.kind, title: p.title, unit, qty, line });
  }
  const shipping = SHIPPING;
  const total = round2(subtotal + shipping);
  const net = round2(total / (1 + TAX_RATE));
  const tax = round2(total - net);
  return { lines, subtotal, shipping, total, net, tax, currency: CURRENCY };
}

// Unambiguous voucher code: BC-XXXX-XXXX (no 0/O/1/I). Server-side, unguessable.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return "BC-" + s.slice(0, 4) + "-" + s.slice(4, 8);
}

export function validEmail(e) {
  return typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && e.length <= 254;
}
