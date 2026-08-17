// /api/news  —  GET (public list + admin ?status=all) and POST (create, protected)
import { getIdentity, unauthorized, json } from "../_shared/auth.js";
import { validate, mapPublic, mapAdmin } from "../_shared/news.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ news: [] }); // CMS not configured yet → behave as "no news"
  const url = new URL(request.url);

  if (url.searchParams.get("status") === "all") {
    const id = await getIdentity(request, env);
    if (!id) return unauthorized();
    const { results } = await env.DB.prepare(
      "SELECT id,title,body,image_key,published,sort_order,created_at,updated_at FROM news ORDER BY sort_order DESC, created_at DESC"
    ).all();
    return json({ news: (results || []).map(mapAdmin) });
  }

  const { results } = await env.DB.prepare(
    "SELECT id,title,body,image_key,created_at FROM news WHERE published = 1 ORDER BY sort_order DESC, created_at DESC LIMIT 20"
  ).all();
  return json({ news: (results || []).map(mapPublic) }, 200, { "cache-control": "public, max-age=60" });
}

export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!id) return unauthorized();
  if (!env.DB) return json({ error: "DB nicht konfiguriert" }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ error: "Ungültiges JSON" }, 400); }
  const v = validate(data);
  if (v.error) return json({ error: v.error }, 400);

  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    "INSERT INTO news (title, body, image_key, published, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(v.title, v.body, v.image_key, v.published, v.sort_order, now, now).run();

  return json({ id: r.meta.last_row_id, ok: true }, 201);
}
