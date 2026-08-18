-- Beauty & Color Tattoo — D1 schema (News-CMS + Gutschein-Shop).
-- Run once against your D1 database (see README-CMS.md).

-- ========== NEWS / AKTUELLES ==========
CREATE TABLE IF NOT EXISTS news (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  image_key  TEXT,
  published  INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_news_public ON news (published, sort_order DESC, created_at DESC);

-- ========== SHOP: BESTELLUNGEN ==========
CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  paypal_order_id TEXT    UNIQUE,          -- PayPal-Order-ID (Idempotenz-Anker)
  customer_email  TEXT    NOT NULL,
  customer_name   TEXT,
  items_json      TEXT    NOT NULL,        -- Snapshot der bestellten Positionen
  amount_total    REAL    NOT NULL,        -- Brutto gesamt (inkl. MwSt + Versand)
  amount_shipping REAL    NOT NULL DEFAULT 0,
  amount_net      REAL    NOT NULL,        -- Netto (ohne MwSt)
  amount_tax      REAL    NOT NULL,        -- MwSt-Betrag (19 %)
  currency        TEXT    NOT NULL DEFAULT 'EUR',
  status          TEXT    NOT NULL DEFAULT 'created', -- created|paid|failed|cancelled|refunded
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  paid_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status, created_at DESC);

-- ========== SHOP: GUTSCHEINE ==========
CREATE TABLE IF NOT EXISTS vouchers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  code        TEXT    NOT NULL UNIQUE,     -- BC-XXXX-XXXX
  kind        TEXT    NOT NULL,            -- tattoo|piercing|seminar|custom
  title       TEXT    NOT NULL,
  value       REAL    NOT NULL,            -- Gutscheinwert (Brutto-Nennwert)
  status      TEXT    NOT NULL DEFAULT 'active', -- active|redeemed|cancelled|expired
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  redeemed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_vouchers_order ON vouchers (order_id);

-- ========== NEWS-BILDER (Fallback ohne R2) ==========
-- Bilder liegen in R2, sobald das Binding NEWS_BUCKET existiert. Ist R2 im Konto nicht
-- freigeschaltet, speichert die API die (klein gerechneten) Bilder hier — dadurch
-- funktioniert der Bild-Upload ohne jede weitere Cloudflare-Einrichtung.
CREATE TABLE IF NOT EXISTS images (
  key          TEXT    PRIMARY KEY,          -- news/<uuid>.<ext>
  content_type TEXT    NOT NULL,
  bytes        BLOB    NOT NULL,
  size         INTEGER NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ========== SHOP-EINSTELLUNGEN (im Admin pflegbar) ==========
-- PayPal- und Resend-Zugangsdaten. Geheime Werte stehen hier NICHT im Klartext, sondern
-- AES-GCM-verschluesselt (Schluessel: Pages-Secret SETTINGS_KEY, ersatzweise ADMIN_PASSWORD).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  is_secret  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
