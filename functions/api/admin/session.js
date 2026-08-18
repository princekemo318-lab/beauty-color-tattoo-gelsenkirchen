// GET /api/admin/session → { authenticated, user } bzw. 401.
// Das Admin-UI prüft damit, ob die Session noch gültig ist.
import { json, getIdentity, loginConfigured } from "../../_shared/auth.js";

export async function onRequestGet({ request, env }) {
  const id = await getIdentity(request, env);
  if (!id) return json({ authenticated: false, configured: loginConfigured(env) }, 401);
  return json({ authenticated: true, user: id.user });
}
