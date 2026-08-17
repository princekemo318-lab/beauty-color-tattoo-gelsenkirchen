// Shared validation + row mappers for the news CMS.
export const MAX_TITLE = 140;
export const MAX_BODY = 4000;

// Validate + normalise incoming news payload. Returns {error} or clean fields.
export function validate(d) {
  const title = (d && d.title != null ? String(d.title) : "").trim();
  const body = (d && d.body != null ? String(d.body) : "").trim();
  if (!title) return { error: "Titel fehlt" };
  if (title.length > MAX_TITLE) return { error: "Titel zu lang" };
  if (!body) return { error: "Text fehlt" };
  if (body.length > MAX_BODY) return { error: "Text zu lang" };

  let image_key = null;
  if (d.image_key) {
    // Only accept keys we generated (news/<uuid>.<ext>) — never trust arbitrary input.
    if (!/^news\/[A-Za-z0-9._-]{1,120}$/.test(String(d.image_key))) {
      return { error: "Ungültiger Bild-Key" };
    }
    image_key = String(d.image_key);
  }
  const published = d.published ? 1 : 0;
  const sort_order = Number.isInteger(d.sort_order) ? d.sort_order : 0;
  return { title, body, image_key, published, sort_order };
}

// public projection — no draft/admin fields
export const mapPublic = (r) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  image: r.image_key ? `/img/${r.image_key}` : null,
  created_at: r.created_at,
});

// admin projection — full row
export const mapAdmin = (r) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  image_key: r.image_key,
  image: r.image_key ? `/img/${r.image_key}` : null,
  published: !!r.published,
  sort_order: r.sort_order,
  created_at: r.created_at,
  updated_at: r.updated_at,
});
