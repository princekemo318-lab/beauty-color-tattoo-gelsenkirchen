// /api/shop/voucher/:code — GET public (by unguessable code) · PUT admin (change status)
import { getIdentity, unauthorized, json } from "../../../_shared/auth.js";

const CODE_RE = /^BC-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export async function onRequestGet({ params, env }) {
  if (!env.DB) return json({ error: "nicht gefunden" }, 404);
  const code = String(params.code || "").toUpperCase();
  if (!CODE_RE.test(code)) return json({ error: "Ungültiger Code" }, 400);

  const v = await env.DB.prepare(
    "SELECT code, kind, title, value, status, created_at FROM vouchers WHERE code=?"
  ).bind(code).first();
  if (!v) return json({ error: "Gutschein nicht gefunden" }, 404);

  return json({ voucher: { code: v.code, title: v.title, value: v.value, kind: v.kind, status: v.status, created_at: v.created_at } });
}

export async function onRequestPut({ request, params, env }) {
  const id = await getIdentity(request, env);
  if (!id) return unauthorized();
  const code = String(params.code || "").toUpperCase();
  if (!CODE_RE.test(code)) return json({ error: "Ungültiger Code" }, 400);

  let d;
  try { d = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const status = d.status;
  if (!["active", "redeemed", "cancelled", "expired"].includes(status)) return json({ error: "Ungültiger Status" }, 400);

  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    "UPDATE vouchers SET status=?, redeemed_at = CASE WHEN ?='redeemed' THEN ? ELSE redeemed_at END WHERE code=?"
  ).bind(status, status, now, code).run();
  if (!r.meta.changes) return json({ error: "nicht gefunden" }, 404);
  return json({ ok: true });
}
