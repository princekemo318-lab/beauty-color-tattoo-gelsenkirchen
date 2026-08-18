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
| Admin-Schutz | **Eigener Login** (Benutzername + Passwort) + signiertes Session-Cookie |
| Schreib-Auth | **Server-seitige** Session-Prüfung in jeder Write-Function |

```
functions/
  _shared/auth.js        # Passwortpruefung + signierte Session (HMAC-SHA256) + JSON-Helper
  _shared/loginpage.js   # gebrandete Login-Seite
  admin/_middleware.js   # /admin serverseitig sperren, sonst Login-Seite ausliefern
  api/admin/login.js     # POST Login  ·  logout.js  ·  session.js
  _shared/news.js        # Validierung + Mapper
  api/news.js            # GET (öffentlich: published) · GET ?status=all (Admin) · POST
  api/news/[id].js       # PUT · DELETE  (geschützt)
  api/upload.js          # POST Bild → R2 (geschützt)
  img/[[path]].js        # GET Bild aus privatem R2 ausliefern (öffentlich lesbar)
admin/                   # /admin — einfacher Editor (index.html, admin.css, admin.js)
assets/js/news.js        # öffentliche News-Sektion (lazy, non-blocking)
shop/                    # /shop — Gutscheine & Seminare mit PayPal
schema.sql               # D1-Tabelle
wrangler.toml            # Pages + D1/R2 Bindings + ADMIN_USER
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

### c) Admin-Login (KEIN Cloudflare Access, kein Zero Trust)
Der Login ist selbst gebaut und braucht im Dashboard nur **ein Secret**:

```bash
npx wrangler pages secret put ADMIN_PASSWORD --project-name beauty-color-tattoo-gelsenkirchen
```
oder Dashboard → **Workers & Pages → beauty-color-tattoo-gelsenkirchen → Settings →
Variables and Secrets → Add → Type: Secret**, Name `ADMIN_PASSWORD`.

Der Benutzername steht als normale Variable `ADMIN_USER` in `wrangler.toml` (kein Geheimnis).
Optional: `SESSION_SECRET` als zweites Secret — ohne wird der Signaturschlüssel aus
`ADMIN_PASSWORD` abgeleitet (Passwortwechsel wirft dann alle Sessions raus, was gewollt ist).

So funktioniert es:
1. `/admin` prüft **serverseitig** die Session (`functions/admin/_middleware.js`). Ohne gültige
   Session wird das Admin-UI **gar nicht ausgeliefert**, sondern die Login-Seite.
2. `POST /api/admin/login` vergleicht Benutzer + Passwort in **konstanter Laufzeit** gegen
   `ADMIN_USER`/`ADMIN_PASSWORD` und setzt danach das Cookie `bct_session`
   (**HttpOnly, Secure, SameSite=Strict**, 7 Tage).
3. Das Cookie enthält **kein Passwort** — nur Ablaufzeit, Zufallswert und eine HMAC-SHA256-
   Signatur. Ohne den Schlüssel lässt es sich nicht fälschen.
4. **Jeder** Admin-Endpunkt (News schreiben/ändern/löschen, Upload, Bestellungen, Gutscheine)
   prüft die Session selbst — der Seitenschutz allein wäre nicht genug.
5. `POST /api/admin/logout` löscht das Cookie (Button „Abmelden" oben rechts).

Passwort ändern: einfach das Secret neu setzen — sonst nichts.

### d) Variablen & Bindings setzen
In `wrangler.toml` steht bereits alles Nicht-Geheime:
```toml
[vars]
ADMIN_USER = "nicole"
```
Bindings `DB` (D1) und `NEWS_BUCKET` (R2) ebenfalls. Alternativ/zusätzlich im
**Pages-Dashboard → Settings → Functions → Bindings** (D1 = `DB`, R2 = `NEWS_BUCKET`).
**Geheim bleibt nur `ADMIN_PASSWORD`** (plus optional die PayPal-Secrets, siehe README-SHOP.md).

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
npx wrangler pages dev . --port 8801 --binding ADMIN_USER=nicole ADMIN_PASSWORD=test-passwort
```
- Ohne `--d1/--r2`-Flags nutzt der Dev-Server die Bindings aus `wrangler.toml` und damit
  **dieselbe** lokale D1 wie `wrangler d1 execute --local` (sonst legt er eine zweite an).
- Hängt der Dev-Server einmal: Prozesse beenden, `.wrangler/tmp` + `.wrangler/state` löschen,
  Schema lokal neu einspielen, neu starten.
- Öffnen: `http://localhost:8801/` (Seite) und `http://localhost:8801/admin` (Login → Editor).

---

## 4) So benutzt es die Kundin (bewusst simpel)

1. `deine-domain/admin` öffnen → **Benutzername + Passwort** eingeben → **Einloggen**.
   Man bleibt 7 Tage angemeldet; oben rechts gibt es **Abmelden**.
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

- [x] Admin-UI **serverseitig** gesperrt (`functions/admin/_middleware.js`) — ohne Session wird es nicht ausgeliefert.
- [x] **Server-seitige** Session-Prüfung in **jeder** Admin-Function — verlässt sich **nicht** allein auf den /admin-Schutz.
- [x] Passwort nur als **Secret** (nie im Frontend, nie im Repo); Vergleich in **konstanter Laufzeit**; Fehlversuche werden **verzögert**.
- [x] Session-Cookie **HttpOnly + Secure + SameSite=Strict**, HMAC-signiert, mit Ablaufzeit — Manipulation an Signatur oder Laufzeit führt zu 401.
- [x] `GET /api/news` öffentlich, liefert **nur veröffentlichte** News, keine Admin-Felder.
- [x] D1 nur mit **Prepared Statements / Bindings** — kein String-Zusammenbau.
- [x] R2-Keys werden **server-seitig generiert** (`news/<uuid>.<ext>`), Nutzer-Dateinamen werden nie verwendet; Key-Format wird validiert.
- [x] Upload: **Content-Type** (JPEG/PNG/WebP) + **Größe** (max. 4 MB) geprüft.
- [x] R2-Bucket **privat**; Auslieferung über `/img/*`, nur Keys unter `news/`.
- [x] Ausgabe im Frontend ausschließlich per **`textContent`** (kein `innerHTML`) → kein XSS.
- [x] Keine Secrets im Frontend / im Repo (nur öffentliche IDs).
- [x] Kein offenes CORS (alles same-origin).
- [ ] Optional: zusätzliches Rate-Limiting für `/api/upload` über eine Cloudflare **WAF-Rate-Limiting-Rule** (empfohlen; ebenso eine Rate-Limiting-Rule auf `/api/admin/login` gegen Durchprobieren).

## 7) Performance-Checkliste

- [x] **Kein Framework**, keine CMS-Library, kein Bundler — reines Vanilla.
- [x] `news.js` ist **`defer`**, lädt die API **nach** dem Rendern, mit Timeout/AbortController.
- [x] Kein blockierendes Fetch im `<head>`; Fehler werden still behandelt.
- [x] News-Bilder **lazy** (`loading="lazy"`) + client-seitig auf max. 1600 px verkleinert (WebP) vor Upload → **keine Riesenbilder**.
- [x] `/img/*` mit `Cache-Control: immutable, 1 Jahr` (Cloudflare-Edge-Cache).
- [x] `GET /api/news` mit `max-age=60` cachebar.
- [x] **PayPal-SDK lädt nur auf `/shop/`** — Startseite/Mobile-Performance unverändert.
- [x] Three.js, GSAP, Lenis, Galerie, Booking und der WebGL-Fallback **unverändert**.
