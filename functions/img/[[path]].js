// /img/*  —  News-Bilder öffentlich ausliefern.
// Quelle ist R2 (privater Bucket) oder — falls R2 nicht eingerichtet ist — die D1-Tabelle
// `images`. Beide Wege werden geprüft, damit ein späterer Umstieg auf R2 alte Bilder nicht
// unerreichbar macht. Lesbar sind ausschließlich Keys unter "news/".
import { getImage, validKey } from "../_shared/images.js";

export async function onRequestGet({ params, env }) {
  const parts = Array.isArray(params.path) ? params.path : [params.path];
  const key = parts.join("/");
  if (!validKey(key)) return new Response("Not found", { status: 404 });

  let img;
  try { img = await getImage(env, key); } catch { img = null; }
  if (!img) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  headers.set("content-type", img.contentType);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  if (img.etag) headers.set("etag", img.etag);
  if (img.size) headers.set("content-length", String(img.size));
  return new Response(img.body, { headers });
}
