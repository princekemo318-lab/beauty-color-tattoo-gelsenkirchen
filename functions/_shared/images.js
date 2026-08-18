// Bildspeicher für News-Bilder — funktioniert MIT und OHNE R2.
//
// Reihenfolge:
//   1. R2 (Binding NEWS_BUCKET), falls vorhanden — der bessere Speicher für Dateien.
//   2. sonst D1-Tabelle `images` (BLOB). Damit läuft der Bild-Upload sofort, ohne dass
//      im Cloudflare-Konto erst R2 freigeschaltet werden muss.
//
// Wird R2 später aktiviert, landen NEUE Bilder automatisch dort; alte bleiben in D1
// abrufbar, weil beim Lesen beide Quellen geprüft werden.

// D1 erlaubt max. 2 MB pro Zeile — mit Sicherheitsabstand.
export const MAX_DB_BYTES = 1_200_000;
export const MAX_R2_BYTES = 4 * 1024 * 1024;

export function storageKind(env) {
  return env.NEWS_BUCKET ? "r2" : (env.DB ? "d1" : null);
}

export function maxBytes(env) {
  return env.NEWS_BUCKET ? MAX_R2_BYTES : MAX_DB_BYTES;
}

export async function putImage(env, key, contentType, buf) {
  if (env.NEWS_BUCKET) {
    await env.NEWS_BUCKET.put(key, buf, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
    return "r2";
  }
  if (!env.DB) throw new Error("Kein Bildspeicher konfiguriert");
  await env.DB.prepare(
    "INSERT INTO images (key, content_type, bytes, size) VALUES (?, ?, ?, ?)"
  ).bind(key, contentType, buf, buf.byteLength).run();
  return "d1";
}

/** { body, contentType, size } oder null. */
export async function getImage(env, key) {
  if (env.NEWS_BUCKET) {
    const obj = await env.NEWS_BUCKET.get(key);
    if (obj) {
      return {
        body: obj.body,
        contentType: (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
        size: obj.size,
        etag: obj.httpEtag,
      };
    }
  }
  if (env.DB) {
    const row = await env.DB.prepare(
      "SELECT content_type, bytes, size FROM images WHERE key=?"
    ).bind(key).first();
    if (row && row.bytes) {
      const bytes = row.bytes instanceof ArrayBuffer ? row.bytes : new Uint8Array(row.bytes).buffer;
      return {
        body: bytes,
        contentType: row.content_type || "application/octet-stream",
        size: row.size || bytes.byteLength,
        etag: null,
      };
    }
  }
  return null;
}

/** Best effort — Fehler werden bewusst verschluckt. */
export async function deleteImage(env, key) {
  if (!key) return;
  if (env.NEWS_BUCKET) { try { await env.NEWS_BUCKET.delete(key); } catch { /* egal */ } }
  if (env.DB) { try { await env.DB.prepare("DELETE FROM images WHERE key=?").bind(key).run(); } catch { /* egal */ } }
}

export function validKey(key) {
  return /^news\/[A-Za-z0-9._-]{1,120}$/.test(key || "");
}

/**
 * Prüft die echten Dateikopf-Bytes (Magic Bytes) — der vom Browser gemeldete
 * Content-Type ist frei wählbar und darf allein nicht entscheiden.
 * Liefert den erkannten Typ oder null.
 */
export function sniffImageType(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  const ascii = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}
