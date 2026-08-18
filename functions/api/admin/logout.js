// POST /api/admin/logout → Session-Cookie löschen (Abmelden).
import { json, clearSessionCookie } from "../../_shared/auth.js";

export function onRequestPost({ request }) {
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(new URL(request.url)) });
}

export function onRequest() {
  return json({ error: "Methode nicht erlaubt" }, 405);
}
