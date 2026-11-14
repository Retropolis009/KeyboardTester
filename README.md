# KeyPulse — Full-System Hardware Diagnostics, Heavy SEO Engine & AdSense Platform

A fast, dependency-light **HTML + Vanilla CSS/JS + Node.js (Express & built-in SQLite)** hardware diagnostic workbench engineered for top Google search visibility, AdSense revenue compliance, and modular tool expansion.

The entire UI is an **edge-to-edge CSS Grid instrument panel** — `220px` sticky sidebar plus a fluid workspace that fills the viewport. No narrow centred column, no flex-heavy header bar, no rounded neon card styling: flat panels, 1px hairline borders, monospace readouts, and a single orange signal accent.

## Core Features

### 1. Hardware Diagnostic Suite
All tests run **100% in the browser** — no input telemetry is ever uploaded.

| Route | Tool | Measurements |
| --- | --- | --- |
| `/` | **Keyboard Tester** | 6 layouts (104 ANSI, 87 TKL, 75%, 60%, Apple Mac, ISO 105), NKRO peak rollover, per-key counters, switch chatter <32 ms, estimated scan rate (Hz), Caps/Num/Scroll lock LEDs, `KeyboardEvent.location`, stuck-key watchdog (>4 s), Web Audio switch sounds, JSON/TXT report export |
| `/chatter-analyzer` | **Switch Chatter Lab** | Configurable debounce threshold, per-scan-code fastest/average release-to-press interval, verdict per switch |
| `/mouse-cps-test` | **Mouse, Polling Hz & CPS** | M1–M5 matrix, sub-52 ms double-click fault detector, scroll encoder direction counters, USB polling-rate estimate, distance travelled, CPS benchmark |
| `/gamepad-test` | **Gamepad Drift & Rumble** | Canvas X/Y stick plotters, live drift radius %, 8% deadzone overlay, analog trigger meters, 16+ button matrix, `vibrationActuator` dual-rumble pulse |
| `/display-test` | **Monitor & Dead Pixel** | Fullscreen colour cycler (9 solid fields), `requestAnimationFrame` refresh-rate measurement, frame-pacing timeline, resolution/DPR readouts, 16-step greyscale + colour banding ramps |
| `/audio-video-test` | **Mic, Speaker & Webcam** | Web Audio oscilloscope, dBFS peak meter with health verdict, stereo L/R tone generator with frequency sweep, `<video>` camera resolution + FPS inspector |
| `/typing-test` | **Typing Speed (WPM)** | Net WPM, raw cadence, accuracy, 15/30/60 s modes, 4 corpora including live `api.github.com` |
| `/guides` | **Repair Guides CMS** | DB-backed SEO articles for long-tail rankings |

### 2. Heavy-Duty Google SEO Suite
- **Server-Injected Semantic HTML & JSON-LD**: per-route `<title>`, meta description, focus & LSI keywords, canonical URLs, `hreflang`, Open Graph, Twitter Cards, and `@graph` JSON-LD (`Organization`, `BreadcrumbList`, `WebApplication`, `Article`, visible + schema-synced `FAQPage`).
- **14-Point Live On-Page Auditor & SERP Simulator**: audits rendered HTML for every route (0–100), checking SERP pixel width, keyword placement, H1/H2 hierarchy, semantic word depth, canonical tags, schema validity, OG/Twitter metadata, internal link graph, image alts, and CLS shields.
- **Technical Infrastructure**: dynamic `/sitemap.xml`, `/robots.txt`, **301/302 redirect manager**, **IndexNow** key endpoint + ping, Search Console/Bing verification tags, search-bot crawl detector, and real-user Core Web Vitals (TTFB/LCP/CLS) beacons.

### 3. Google AdSense & Revenue Engine
- Dynamic `/ads.txt` endpoint editable from the admin console with one-click Publisher ID sync.
- **Zero-CLS ad slot manager** (`top_leaderboard`, `mid_incontent`, `sidebar_rectangle`, `footer_multiplex`) with explicit reserved heights.
- Preview Shield mode, live `<ins class="adsbygoogle">` mode, and custom sponsor HTML mode, plus impression/click tracking.
- **Consent Mode v2** banner and AdSense-mandatory trust pages (`/privacy-policy`, `/terms`, `/about`, `/contact`).

### 4. Protected Admin Console (`/admin`)
Reachable **only by direct URL** — every public view is free of Admin links and buttons.

- Salted `crypto.scrypt` hashing with timing-safe verification.
- `HttpOnly`, `SameSite=Lax` sessions stored as SHA-256 hashes, `X-CSRF-Token` on all mutations, six-attempt lockout, session revocation, and a login audit trail.
- Credentials are bootstrapped from `.env` (`ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`).
- Feature Module Registry & Foreign API Hub for toggling tools and probing external APIs.

## Quick Start

```bash
npm install
cp .env.example .env      # then edit the admin credentials
npm start
```

`.env` keys:

```ini
PORT=3000
HOST=0.0.0.0
ADMIN_USER=keypulse_admin
ADMIN_PASSWORD=change-me-to-a-strong-secret
ADMIN_EMAIL=ops@keypulse.tools
```

- **Public site:** `http://localhost:3000/`
- **Admin console (direct URL only):** `http://localhost:3000/admin`
- **Smoke + SEO suite:** `npm test`

On first boot the database seeds the `.env` admin account, the eight hardware modules, per-route SEO metadata, ad slots, policy pages, and repair guides. Deleting `data/keypulse.db*` re-seeds from scratch.

## Project Layout

```
server/        env loader, SQLite schema/seeds, auth, SEO+AdSense SSR engine, routers
public/views/  SSR templates (one per route, sidebar injected at <!--SIDEBAR_SHELL-->)
public/css/    main.css (full-width grid workbench) + admin.css
public/js/     keyboard.js, mouse.js, chatter.js, typing.js,
               gamepad.js, display.js, audiovideo.js, common.js, admin.js
tests/         HTTP integration + live SEO audit suite
```
