# KeyPulse — Online Keyboard Tester, Heavy SEO Engine & AdSense Platform

A lightweight, fast-loading **HTML + Vanilla CSS/JS + Node.js (Express & built-in SQLite)** hardware diagnostic platform engineered for top Google search visibility, Google AdSense revenue compliance, and modular tool expansion.

## Core Features

### 1. Hardware Diagnostic Suite
- **Online Keyboard Tester (`/`)**:
  - 6 switchable physical form factors: **Full-Size 104-Key ANSI**, **Tenkeyless 87-Key (TKL)**, **Compact 75% (84-Key)**, **Mini 60%**, **Apple Mac Magic Keyboard**, and **ISO 105-Key (UK/EU)** with automatic OS detection.
  - Live telemetry: `event.key`, `KeyboardEvent.code`, simultaneous **N-Key Rollover (NKRO)** active & peak counter, verified key latch progress, hold duration (`ms`), per-key press counter, and automatic **Switch Chatter (<32ms bounce)** detection.
  - Zero-dependency Web Audio API mechanical switch sound synthesizer (*Cherry MX Blue Clicky, MX Brown Tactile, Topre/Linear Thock*).
- **Typing Speed & WPM Test (`/typing-test`)**:
  - Net WPM, Raw cadence, character accuracy %, 15s/30s/60s benchmarks, and 4 corpora including a live **GitHub REST API (`api.github.com`)** documentation feed with automatic offline fallback.
- **Mouse, Scroll & CPS Tester (`/mouse-cps-test`)**:
  - M1–M5 button verification, microswitch double-click fault detector (<52ms), rotary scroll encoder step direction counter, and real-time CPS benchmark.
- **Switch Chatter & Debounce Lab (`/chatter-analyzer`)**:
  - Configurable millisecond debounce fault threshold and per-key actuation timing profiler.
- **Hardware Guides CMS (`/guides` & `/guides/:slug`)**:
  - Database-backed SEO articles for long-tail search rankings, manageable directly from the Admin Console.

### 2. Heavy-Duty Google SEO Suite
- **Server-Injected Semantic HTML & JSON-LD Rich Snippets**:
  - Per-route `<title>`, `<meta name="description">`, focus & LSI keywords, canonical URLs, `hreflang`, Open Graph, Twitter Cards, and `@graph` JSON-LD (`Organization`, `BreadcrumbList`, `WebApplication`, `Article`, and visible + schema-synced `FAQPage`).
- **14-Point Live On-Page SEO Auditor & Google SERP Simulator**:
  - Audits rendered HTML across every route (0–100 score), checking SERP pixel width, keyword density, H1/H2 hierarchy, internal link graph, schema validity, image alts, and Core Web Vitals CLS shields.
- **Technical Search Infrastructure**:
  - Dynamic `/sitemap.xml`, dynamic `/robots.txt`, **301/302 Redirect Manager**, **IndexNow** verification key endpoint (`/<key>.txt`) + instant ping utility, Search Console (`google-site-verification`) & Bing (`msvalidate.01`) meta tags, search bot crawl detector (`Googlebot`, `Bingbot`, `Mediapartners-Google`), and real-user Core Web Vitals (`TTFB`, `LCP`, `CLS`) telemetry.

### 3. Google AdSense & Revenue Engine
- Dynamic root **`/ads.txt`** endpoint editable from Admin (with one-click Publisher ID sync).
- **Zero-CLS Ad Slot Manager** (`top_leaderboard`, `mid_incontent`, `sidebar_rectangle`, `footer_multiplex`) reserving explicit `min-height` containers to prevent Cumulative Layout Shift penalties.
- Supports **Preview Shield Mode** (pre-approval layout testing), **Live AdSense `<ins class="adsbygoogle">` Mode**, and **Custom Sponsor HTML Mode**, plus impression & click CTR tracking.
- Built-in **GDPR / CCPA Google Consent Mode v2** banner and AdSense-mandatory trust pages (`/privacy-policy` with DoubleClick cookie disclosure, `/terms`, `/about`, `/contact`).

### 4. Protected Admin Console (`/admin`)
- Salted `crypto.scrypt` password hashing with timing-safe verification.
- `HttpOnly`, `SameSite=Lax` sessions stored as SHA-256 hashes in SQLite, `X-CSRF-Token` validation on all mutating endpoints, 6-attempt brute-force lockout, active session revocation, and login audit trail.
- **Feature Module Registry & Foreign API Hub** for toggling tools and probing external API integrations as the site grows.

## Quick Start

```bash
npm install
npm start
```

- **Public Website:** `http://localhost:3000/`
- **Admin Console:** `http://localhost:3000/admin`
  - Default bootstrap credentials (override via `ADMIN_USER` and `ADMIN_PASSWORD` environment variables, or rotate anytime in *Admin → Security & Login Audit*):
    - **Username:** `admin`
    - **Password:** `KeyPulse@2026!`
- **Run Integration & SEO Smoke Suite:** `npm test`
