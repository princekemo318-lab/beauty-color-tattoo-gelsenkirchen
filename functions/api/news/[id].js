// /api/news/:id  —  PUT (update) and DELETE, both protected
import { getIdentity, unauthorized, json } from "../../_shared/auth.js";
import { validate } from "../../_shared/news.js";
import { deleteImage } from "../../_shared/images.js";

export async function onRequestPut({ request, env, params }) {
  const idn = await getIdentity(request, env);
  if (!idn) return unauthorized();
  if (!env.DB) return json({ error: "DB nicht konfiguriert" }, 500);

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id < 1) return json({ error: "Ungültige ID" }, 400);

  let data;
  try { data = await request.json(); } catch { return json({ error: "Ungültiges JSON" }, 400); }
  const v = validate(data);
  if (v.error) return json({ error: v.error }, 400);

  const before = await env.DB.prepare("SELECT image_key FROM news WHERE id=?").bind(id).first();

  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    "UPDATE news SET title=?, body=?, image_key=?, published=?, sort_order=?, updated_at=? WHERE id=?"
  ).bind(v.title, v.body, v.image_key, v.published, v.sort_order, now, id).run();

  if (!r.meta.changes) return json({ error: "Nicht gefunden" }, 404);

  // Ersetztes/entferntes Bild aufraeumen, damit nichts verwaist liegen bleibt.
  if (before && before.image_key && before.image_key !== v.image_key) {
    await deleteImage(env, before.image_key);
  }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const idn = await getIdentity(request, env);
  if (!idn) return unauthorized();
  if (!env.DB) return json({ error: "DB nicht konfiguriert" }, 500);

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id < 1) return json({ error: "Ungültige ID" }, 400);

  const row = await env.DB.prepare("SELECT image_key FROM news WHERE id=?").bind(id).first();
  const r = await env.DB.prepare("DELETE FROM news WHERE id=?").bind(id).run();
  if (!r.meta.changes) return json({ error: "Nicht gefunden" }, 404);

  // Bild mitloeschen (R2 und/oder D1) — best effort
  if (row && row.image_key) await deleteImage(env, row.image_key);
  return json({ ok: true });
}
