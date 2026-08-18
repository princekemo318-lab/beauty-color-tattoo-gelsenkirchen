// /api/upload  —  POST an image to R2 (protected). Returns { key, url }.
import { getIdentity, unauthorized, json } from "../_shared/auth.js";

const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB (admin resizes client-side first)

export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!id) return unauthorized();
  if (!env.NEWS_BUCKET) return json({ error: "Bild-Upload ist noch nicht aktiv — R2 im Cloudflare-Dashboard freischalten. Text-News funktionieren." }, 503);

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) return json({ error: "multipart/form-data erwartet" }, 400);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Ungültige Daten" }, 400); }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Keine Datei" }, 400);

  const ext = ALLOWED[file.type];
  if (!ext) return json({ error: "Nur JPEG, PNG oder WebP erlaubt" }, 415);
  if (file.size <= 0 || file.size > MAX_BYTES) return json({ error: "Datei zu groß (max. 4 MB)" }, 413);

  // Secure, unguessable key — user file name is never used.
  const key = `news/${crypto.randomUUID()}.${ext}`;
  const buf = await file.arrayBuffer();

  await env.NEWS_BUCKET.put(key, buf, {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
  });

  return json({ key, url: `/img/${key}` }, 201);
}
