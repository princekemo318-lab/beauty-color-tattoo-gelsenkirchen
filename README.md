# Beauty &amp; Color Tattoo — INKTALE® Gelsenkirchen

Website for **Beauty &amp; Color Tattoo**, a tattoo &amp; piercing studio in Gelsenkirchen-Buer (NRW, Germany).
Dark, industrial "Ruhrpott" luxury look — matte black &amp; antique gold — built to match the studio's Instagram identity.

**Live:** https://beauty-color-tattoo-gelsenkirchen.pages.dev

---

## ✨ Highlights

- **"Ink Bloom" hero** — a GPU fragment shader (Three.js) where molten-gold ink blooms in dark water, forms flowing lines, then dissolves to reveal the studio photo. Single draw call, mobile-first, automatic CSS fallback.
- **Gold-dust atmosphere**, cinematic vignette &amp; concrete texture (lightweight canvas + CSS).
- **Immersive gallery** — masonry, category filters, fullscreen lightbox with keyboard + swipe.
- **Cover-Up / "Skizze → Realität"** drag slider.
- **Collapsible online booking** (KISS-Cal) — loads only on click (GDPR-friendly consent).
- Editorial artist cards, "Mutmacher-Tattoos" story, social proof, contact.
- Full **legal pages** (Impressum, Datenschutzerklärung), custom **404**.
- Production-ready: favicon/PWA icons, `manifest.webmanifest`, OpenGraph + Twitter cards, canonical, `robots.txt`, `sitemap.xml`, **LocalBusiness (TattooParlor) JSON-LD**.

## 🛠 Tech

- **Vanilla HTML / CSS / JS — no build step, no framework.**
- [Three.js](https://threejs.org/) (hero shader), [GSAP](https://gsap.com/) + ScrollTrigger, [Lenis](https://github.com/darkroomengineering/lenis) smooth scroll.
- **Self-hosted fonts** (Fraunces · Inter · Kaushan Script) — no external Google Fonts request.
- No cookies, no tracking, no external runtime dependencies.

## 📁 Structure

```
index.html                 # homepage
impressum/  datenschutz/    # legal pages
404.html
assets/
├── css/     style.css, fonts.css
├── js/      app.js, hero.js, data.js, legal.js
├── vendor/  three, gsap, ScrollTrigger, lenis
├── fonts/   *.woff2 (self-hosted)
└── web/     images (tattoo/ artists/ story/ brand/)
favicon.ico · robots.txt · sitemap.xml · manifest.webmanifest
```

## ▶️ Run locally

No dependencies — just serve the folder over HTTP (ES modules need `http://`, not `file://`):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## 🚀 Deploy

Any static host works (it's plain files):

- **Cloudflare Pages** — drag &amp; drop the folder in *Workers &amp; Pages → Create → Pages → Upload assets*.
- **Apache / IONOS** — upload the files to the web root. (Optional `.htaccess` for caching / 404 / gzip.)

## 🤝 Contributing

Issues &amp; pull requests welcome. The site is intentionally dependency-free and framework-free — please keep it that way (vanilla JS/CSS).

## © Assets

The **code** is open for collaboration. The **images, tattoo artwork, logo and brand name** belong to *Beauty &amp; Color Tattoo (Nicole Grützner)* and may not be reused without permission.
