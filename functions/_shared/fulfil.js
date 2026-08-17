// Idempotent fulfilment: mark an order paid and issue vouchers exactly once.
// Called from BOTH capture-order and the webhook — safe to call repeatedly.
import { generateCode } from "./shop.js";

export async function loadVouchers(env, orderId) {
  const { results } = await env.DB.prepare(
    "SELECT code,kind,title,value,status FROM vouchers WHERE order_id=? ORDER BY id"
  ).bind(orderId).all();
  return results || [];
}

// orderRow: full row from `orders`. Returns { vouchers, alreadyIssued }.
export async function markPaidAndIssue(env, orderRow) {
  const now = new Date().toISOString();

  // Atomically claim the order. If we don't win the race, it's already paid.
  const claim = await env.DB.prepare(
    "UPDATE orders SET status='paid', paid_at=? WHERE id=? AND status!='paid'"
  ).bind(now, orderRow.id).run();

  if (!claim.meta.changes) {
    return { vouchers: await loadVouchers(env, orderRow.id), alreadyIssued: true };
  }

  let lines = [];
  try { lines = JSON.parse(orderRow.items_json) || []; } catch { lines = []; }

  const vouchers = [];
  for (const l of lines) {
    const qty = Math.max(1, parseInt(l.qty, 10) || 1);
    for (let i = 0; i < qty; i++) {
      const v = await insertVoucher(env, orderRow.id, l);
      vouchers.push(v);
    }
  }
  return { vouchers, alreadyIssued: false };
}

async function insertVoucher(env, orderId, line) {
  const title = productTitle(line);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      await env.DB.prepare(
        "INSERT INTO vouchers (order_id, code, kind, title, value, status) VALUES (?,?,?,?,?, 'active')"
      ).bind(orderId, code, line.kind || "custom", title, Number(line.unit) || 0).run();
      return { code, kind: line.kind || "custom", title, value: Number(line.unit) || 0, status: "active" };
    } catch (e) {
      // UNIQUE collision on code → retry with a fresh code
      if (!/UNIQUE/i.test(String(e && e.message))) throw e;
    }
  }
  throw new Error("Voucher-Code konnte nicht erzeugt werden");
}

function productTitle(line) {
  if (line.kind === "custom") return "Gutschein";
  if (line.kind === "tattoo") return "Tattoo-Gutschein";
  if (line.kind === "piercing") return "Piercing-Gutschein";
  if (line.kind === "seminar") return "Piercing-Seminar";
  return line.title || "Gutschein";
}
