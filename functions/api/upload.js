// /api/upload  —  POST an image to R2 (protected). Returns { key, url }.
import { getIdentity, unauthorized, json } from "../_shared/auth.js";
import { putImage, storageKind, maxBytes, sniffImageType } from "../_shared/images.js";

const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// Obergrenze haengt vom Speicher ab (R2: 4 MB, D1-Fallback: 1,2 MB) — das Admin-UI
// rechnet Bilder ohnehin vorher auf max. 1600 px / WebP herunter.

export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!id) return unauthorized();
  if (!storageKind(env)) return json({ error: "Kein Bildspeicher konfiguriert" }, 503);

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) return json({ error: "multipart/form-data erwartet" }, 400);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Ungültige Daten" }, 400); }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Keine Datei" }, 400);

  const ext = ALLOWED[file.type];
  if (!ext) return json({ error: "Nur JPEG, PNG oder WebP erlaubt" }, 415);
  const limit = maxBytes(env);
  if (file.size <= 0 || file.size > limit) {
    return json({ error: "Bild zu groß (max. " + Math.round(limit / 1024 / 1024 * 10) / 10 + " MB)" }, 413);
  }

  // Secure, unguessable key — user file name is never used.
  const key = `news/${crypto.randomUUID()}.${ext}`;
  const buf = await file.arrayBuffer();

  // Der gemeldete Content-Type kommt vom Client — entscheidend sind die echten Bytes.
  const real = sniffImageType(buf);
  if (!real || real !== file.type) {
    return json({ error: "Das ist keine gültige JPEG-, PNG- oder WebP-Datei" }, 415);
  }

  let where;
  try {
    where = await putImage(env, key, file.type, buf);
  } catch {
    return json({ error: "Bild konnte nicht gespeichert werden" }, 500);
  }

  return json({ key, url: `/img/${key}`, storage: where }, 201);
}
