// /img/*  —  publicly serve news images from the PRIVATE R2 bucket.
// The bucket stays private; only keys under "news/" are readable, with long cache.
export async function onRequestGet({ params, env }) {
  if (!env.NEWS_BUCKET) return new Response("Not found", { status: 404 });

  const parts = Array.isArray(params.path) ? params.path : [params.path];
  const key = parts.join("/");
  if (!/^news\/[A-Za-z0-9._-]{1,120}$/.test(key)) return new Response("Not found", { status: 404 });

  const obj = await env.NEWS_BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("etag", obj.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  return new Response(obj.body, { headers });
}
