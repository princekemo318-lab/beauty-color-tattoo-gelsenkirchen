# Mini-CMS (News) + Shop — Setup & Betrieb

Dieses Dokument beschreibt **nur die zusätzliche Infrastruktur**. Die bestehende
Website (Three.js/GSAP/Lenis, Galerie, Booking, Design, Performance) wurde **nicht
umgebaut**. Änderungen am bestehenden Code:

- `index.html`: **2 Zeilen** — eine zunächst versteckte `<section id="news">` und
  `<script src="assets/js/news.js" defer>`. (Plus Nav-/Footer-Links für Shop.)
- Neue, unabhängige Dateien für CMS, Admin, API und Shop.

`app.js`, `hero.js`, `data.js`, Vendor-Libs und der WebGL-Fallback bleiben **unverändert**.
`news.js` lädt **nach** dem Rendern, blockiert nie, und bei Fehlern/leerer API bleibt die
News-Sektion einfach unsichtbar — die Seite funktioniert immer.

---

## 1) Architektur

| Teil | Technik |
|---|---|
| API | Cloudflare **Pages Functions** (`/functions`) |
| News-Daten | Cloudflare **D1** (Binding `DB`) |
| News-Bilder | Cloudflare **R2** (Binding `NEWS_BUCKET`, privat) |
| Admin-Schutz | Cloudflare **Access** (Zero Trust) für `/admin` |
| Schreib-Auth | **Server-seitige** Access-JWT-Prüfung in jeder Write-Function |

```
functions/
  _shared/auth.js        # Access-JWT verifizieren (RS256) + JSON-Helper
  _shared/news.js        # Validierung + Mapper
  api/news.js            # GET (öffentlich: published) · GET ?status=all (Admin) · POST
  api/news/[id].js       # PUT · DELETE  (geschützt)
  api/upload.js          # POST Bild → R2 (geschützt)
  img/[[path]].js        # GET Bild aus privatem R2 ausliefern (öffentlich lesbar)
admin/                   # /admin — einfacher Editor (index.html, admin.css, admin.js)
assets/js/news.js        # öffentliche News-Sektion (lazy, non-blocking)
shop/                    # /shop — Gutscheine & Seminare mit PayPal
schema.sql               # D1-Tabelle
wrangler.toml            # Pages + D1/R2 Bindings + Access-Variablen
```

---

## 2) Einmalige Einrichtung (Cloudflare)

Voraussetzung: eingeloggt via `npx wrangler login` (Konto `ourragency@gmail.com`).

### a) D1-Datenbank — ✅ ERLEDIGT (17.08.2026)
```bash
npx wrangler d1 create bct-news
npx wrangler d1 execute bct-news --remote --file=./schema.sql
```
Angelegt im Konto `ourragency@gmail.com` (Prince, `9a0b633e…`), Region **WEUR**.
`database_id = 69945e9b-e38e-4a3c-b3c6-f7a73a4d03d2` steht in `wrangler.toml`.
Schema eingespielt: Tabellen `news`, `orders`, `vouchers` + Indizes.

### b) R2-Bucket — ⚠️ OFFEN: R2 muss einmalig aktiviert werden
`wrangler r2 bucket create bct-news-images` schlägt mit
`Please enable R2 through the Cloudflare Dashboard [code: 10042]` fehl, solange R2 im Konto
nicht freigeschaltet ist. Einmalig im Dashboard: **R2 Object Storage → Get started / Enable**
(Zahlungsmittel hinterlegen; das kostenlose Kontingent reicht für News-Bilder). Danach:
```bash
npx wrangler r2 bucket create bct-news-images
```
(Bucket **privat lassen** — Bilder werden über `/img/*` ausgeliefert.)
R2 wird **nur für News-Bilder** gebraucht: News mit Text funktionieren auch ohne, der
Bild-Upload gibt bis dahin einen Fehler zurück. Der **Shop braucht R2 nicht**.

### c) Cloudflare Access für `/admin`
Zero Trust Dashboard → **Access → Applications → Add an application → Self-hosted**:
- **Application domain:** `deine-domain` **Path:** `admin` (schützt `/admin*`).
- **Policy:** Action *Allow*, Include → **Emails** → E-Mail der Inhaberin (Nicole).
- Login-Methode: **One-time PIN** (E-Mail-Code) reicht — kein Passwort nötig.
- Nach dem Anlegen in der App-Übersicht den **Application Audience (AUD) Tag** kopieren.

Team-Domain steht unter Zero Trust → **Settings → Custom Pages / General** als
`deinteam.cloudflareaccess.com`.

### d) Variablen & Bindings setzen
In `wrangler.toml` eintragen (kein Secret, darf ins Repo):
```toml
ACCESS_TEAM_DOMAIN = "deinteam.cloudflareaccess.com"
ACCESS_AUD         = "<AUD-Tag der Access-App>"
# OWNER_EMAIL      = "nicole@example.com"   # optional, empfohlen
```
Bindings `DB` (D1) und `NEWS_BUCKET` (R2) sind bereits in `wrangler.toml`. Alternativ/zusätzlich
im **Pages-Dashboard → Settings → Functions → Bindings** setzen (D1 = `DB`, R2 = `NEWS_BUCKET`)
sowie die drei Variablen als **Environment variables**.

### e) Deployen (jetzt mit Functions!)
Wichtig: Sobald Functions genutzt werden, muss **mit-deployt** werden — nicht mehr nur der
statische Ordner. Beides geht:
```bash
npx wrangler pages deploy . --project-name beauty-color-tattoo-gelsenkirchen --branch main --commit-dirty=true
```
`wrangler pages deploy` bündelt `/functions` automatisch und übernimmt die Bindings aus
`wrangler.toml`. (Alternativ Git-Integration in Cloudflare Pages einrichten → Auto-Deploy bei Push.)

---

## 3) Lokale Entwicklung / Test

Lokale D1 anlegen + Schema:
```bash
npx wrangler d1 execute bct-news --local --file=./schema.sql
```
Dev-Server mit D1 + R2 + Admin-Bypass (nur lokal!):
```bash
npx wrangler pages dev . --d1 DB --r2 NEWS_BUCKET --binding ACCESS_DEV_EMAIL=dev@local
```
- `ACCESS_DEV_EMAIL` ersetzt lokal die Access-Anmeldung (in Produktion **niemals** setzen).
- Öffnen: `http://localhost:8788/` (Seite) und `http://localhost:8788/admin` (Editor).

---

## 4) So benutzt es die Kundin (bewusst simpel)

1. `deine-domain/admin` öffnen → Cloudflare fragt die E-Mail ab → 6-stelligen Code aus der
   Mail eingeben. **Fertig eingeloggt.**
2. **+ Neue News** → Titel + Text schreiben, optional ein Bild wählen (wird automatisch
   verkleinert), **Veröffentlicht** anhaken → **Veröffentlichen**.
3. Die News erscheint **sofort** auf der Startseite im Bereich „Aktuelles".
4. Bearbeiten/Löschen: links auf einen Eintrag klicken.

Kein GitHub, kein Code, kein FTP. Nur Login → schreiben → speichern.

---

## 5) Shop

`/shop/` verkauft Gutscheine (Tattoo/Piercing je 50 €/100 € sowie Wunschbetrag ab 200 €) im
Marken-Design mit **PayPal Smart Buttons** (inkl. Ratenzahlung / 30 Tage Zahlpause). Das
Piercing-Seminar ist **kein** Shop-Artikel — Anfrage über `/seminare/`.

Die PayPal-Client-ID kommt **serverseitig** über `GET /api/shop/config` aus dem Secret
`PAYPAL_CLIENT_ID`; im Frontend steht keine ID. Solange die Secrets fehlen, zeigt der Shop
automatisch den **WhatsApp-Bestell-Fallback**. Details: **README-SHOP.md**.

**Rechtliches:** `/agb/` und `/widerruf/` sind angelegt und im Checkout per Pflicht-Checkbox
verlinkt; sie basieren auf den bestehenden Studio-AGB und sind vor dem Verkaufsstart von der
Inhaberin zu prüfen (siehe README-SHOP.md → „Rechtliches"). MwSt-/Rechnungspflichten beachten.

---

## 6) Security-Checkliste

- [x] Admin-UI durch **Cloudflare Access** geschützt (`/admin`).
- [x] **Server-seitige** Auth in jeder Write-Function (Access-JWT: Signatur + `aud` + `exp` + optional `OWNER_EMAIL`) — verlässt sich **nicht** allein auf den /admin-Schutz.
- [x] `GET /api/news` öffentlich, liefert **nur veröffentlichte** News, keine Admin-Felder.
- [x] D1 nur mit **Prepared Statements / Bindings** — kein String-Zusammenbau.
- [x] R2-Keys werden **server-seitig generiert** (`news/<uuid>.<ext>`), Nutzer-Dateinamen werden nie verwendet; Key-Format wird validiert.
- [x] Upload: **Content-Type** (JPEG/PNG/WebP) + **Größe** (max. 4 MB) geprüft.
- [x] R2-Bucket **privat**; Auslieferung über `/img/*`, nur Keys unter `news/`.
- [x] Ausgabe im Frontend ausschließlich per **`textContent`** (kein `innerHTML`) → kein XSS.
- [x] Keine Secrets im Frontend / im Repo (nur öffentliche IDs).
- [x] Kein offenes CORS (alles same-origin).
- [ ] Optional: zusätzliches Rate-Limiting für `/api/upload` über eine Cloudflare **WAF-Rate-Limiting-Rule** (empfohlen, da hinter Access ohnehin nur die Inhaberin schreibt).

## 7) Performance-Checkliste

- [x] **Kein Framework**, keine CMS-Library, kein Bundler — reines Vanilla.
- [x] `news.js` ist **`defer`**, lädt die API **nach** dem Rendern, mit Timeout/AbortController.
- [x] Kein blockierendes Fetch im `<head>`; Fehler werden still behandelt.
- [x] News-Bilder **lazy** (`loading="lazy"`) + client-seitig auf max. 1600 px verkleinert (WebP) vor Upload → **keine Riesenbilder**.
- [x] `/img/*` mit `Cache-Control: immutable, 1 Jahr` (Cloudflare-Edge-Cache).
- [x] `GET /api/news` mit `max-age=60` cachebar.
- [x] **PayPal-SDK lädt nur auf `/shop/`** — Startseite/Mobile-Performance unverändert.
- [x] Three.js, GSAP, Lenis, Galerie, Booking und der WebGL-Fallback **unverändert**.
