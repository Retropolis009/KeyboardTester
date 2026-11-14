require('./env');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword, generateRandomToken } = require('./cryptoUtils');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'keypulse.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'superadmin',
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      csrf_token TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seo_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_path TEXT UNIQUE NOT NULL,
      page_name TEXT NOT NULL,
      title TEXT NOT NULL,
      meta_description TEXT NOT NULL,
      focus_keyword TEXT NOT NULL DEFAULT '',
      secondary_keywords TEXT NOT NULL DEFAULT '',
      canonical_override TEXT NOT NULL DEFAULT '',
      robots_directive TEXT NOT NULL DEFAULT 'index, follow, max-snippet:-1, max-image-preview:large',
      og_title TEXT NOT NULL DEFAULT '',
      og_description TEXT NOT NULL DEFAULT '',
      og_image TEXT NOT NULL DEFAULT '',
      schema_type TEXT NOT NULL DEFAULT 'WebApplication',
      faq_json TEXT NOT NULL DEFAULT '[]',
      custom_head_html TEXT NOT NULL DEFAULT '',
      sitemap_priority REAL NOT NULL DEFAULT 0.8,
      sitemap_changefreq TEXT NOT NULL DEFAULT 'weekly',
      include_in_sitemap INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS redirects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_path TEXT UNIQUE NOT NULL,
      to_path TEXT NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 301,
      hits INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ad_slots (
      slot_key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      placement_hint TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      mode TEXT NOT NULL DEFAULT 'placeholder',
      ad_unit_id TEXT NOT NULL DEFAULT '',
      ad_format TEXT NOT NULL DEFAULT 'auto',
      min_height_px INTEGER NOT NULL DEFAULT 90,
      custom_html TEXT NOT NULL DEFAULT '',
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS guides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content_html TEXT NOT NULL,
      focus_keyword TEXT NOT NULL DEFAULT '',
      meta_title TEXT NOT NULL DEFAULT '',
      meta_description TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT 'KeyPulse Hardware Lab',
      category TEXT NOT NULL DEFAULT 'Diagnostics',
      reading_minutes INTEGER NOT NULL DEFAULT 4,
      published INTEGER NOT NULL DEFAULT 1,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policy_pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content_html TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feature_modules (
      module_key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      route_path TEXT NOT NULL,
      description TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      nav_order INTEGER NOT NULL DEFAULT 1,
      badge TEXT NOT NULL DEFAULT '',
      config_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS external_apis (
      api_key_slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      auth_key TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL,
      last_status TEXT NOT NULL DEFAULT 'ready',
      last_checked_at TEXT,
      config_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      route_path TEXT NOT NULL,
      bot_name TEXT,
      referrer TEXT,
      metric_name TEXT,
      metric_value REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, String(value));
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function seedDefaults() {
  // 1. Seed or sync bootstrap admin account from .env
  const envUser = (process.env.ADMIN_USER || 'admin').trim();
  const envPass = process.env.ADMIN_PASSWORD || 'KeyPulse@2026!';
  const envEmail = (process.env.ADMIN_EMAIL || 'ops@keypulse.tools').trim();

  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (adminCount === 0) {
    const { salt, hash } = hashPassword(envPass);
    db.prepare(`
      INSERT INTO admins (username, email, password_hash, salt, role, must_change_password)
      VALUES (?, ?, ?, ?, 'superadmin', 0)
    `).run(envUser, envEmail, hash, salt);
  } else if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
    const matchingEnv = db.prepare('SELECT id FROM admins WHERE username = ?').get(envUser);
    if (!matchingEnv && adminCount === 1) {
      const { salt, hash } = hashPassword(envPass);
      db.prepare(`
        UPDATE admins SET username = ?, email = ?, password_hash = ?, salt = ? WHERE id = 1
      `).run(envUser, envEmail, hash, salt);
    }
  }

  // 2. Global Settings (SEO, Verification, AdSense, Consent)
  const indexNowKey = generateRandomToken(16);
  const defaultSettings = {
    site_name: 'KeyPulse',
    site_tagline: 'Hardware Bench: Keyboard, Mouse, Gamepad, Monitor & Audio Diagnostics',
    site_base_url: '',
    title_separator: ' | ',
    default_og_image: '/og-banner.svg',
    google_site_verification: '',
    bing_site_verification: '',
    yandex_verification: '',
    ga4_measurement_id: '',
    gtm_container_id: '',
    indexnow_key: indexNowKey,
    robots_txt_custom: [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/admin/',
      '',
      'Sitemap: {{BASE_URL}}/sitemap.xml'
    ].join('\n'),
    adsense_enabled: 'true',
    adsense_publisher_id: 'ca-pub-0000000000000000',
    adsense_auto_ads: 'false',
    adsense_test_mode: 'true',
    ads_txt_content: [
      '# Google AdSense Authorized Digital Sellers (ads.txt)',
      '# Replace pub-0000000000000000 with your live AdSense Publisher ID in Admin > Monetization',
      'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0'
    ].join('\n'),
    consent_banner_enabled: 'true',
    adblock_notice_enabled: 'false',
    organization_schema_json: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'KeyPulse Hardware Diagnostics',
      description: 'Browser-native hardware diagnostic workbench for keyboards, mice, controllers, monitors, microphones, webcams, and typing benchmarks.'
    })
  };

  for (const [k, v] of Object.entries(defaultSettings)) {
    const exists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k);
    if (!exists) setSetting(k, v);
  }

  // 3. Seed All Hardware Diagnostic Feature Modules (Upsert missing modules seamlessly)
  const modules = [
    {
      module_key: 'keyboard_tester',
      name: 'Keyboard Test',
      route_path: '/',
      description: 'Full ANSI/ISO/Mac/TKL/75%/60% scan-code bench with NKRO, polling Hz, lock LEDs, chatter & report export.',
      enabled: 1,
      nav_order: 1,
      badge: 'Input'
    },
    {
      module_key: 'chatter_analyzer',
      name: 'Switch Chatter',
      route_path: '/chatter-analyzer',
      description: 'Mechanical switch bounce & release-to-press interval analyzer (<35ms fault detection).',
      enabled: 1,
      nav_order: 2,
      badge: ''
    },
    {
      module_key: 'mouse_cps_test',
      name: 'Mouse & Hz Test',
      route_path: '/mouse-cps-test',
      description: 'M1–M5 button matrix, USB polling rate (Hz), microswitch double-click fault detector & CPS test.',
      enabled: 1,
      nav_order: 3,
      badge: ''
    },
    {
      module_key: 'gamepad_tester',
      name: 'Gamepad & Drift',
      route_path: '/gamepad-test',
      description: 'Controller thumbstick drift X/Y plotter, deadzone %, analog triggers, button matrix & dual-rumble test.',
      enabled: 1,
      nav_order: 4,
      badge: 'New'
    },
    {
      module_key: 'display_tester',
      name: 'Monitor & Pixel',
      route_path: '/display-test',
      description: 'Fullscreen dead/stuck pixel color cycler, real-time refresh rate (Hz) counter & grayscale contrast ramp.',
      enabled: 1,
      nav_order: 5,
      badge: 'New'
    },
    {
      module_key: 'audio_video_tester',
      name: 'Mic, Speaker & Cam',
      route_path: '/audio-video-test',
      description: 'Local microphone waveform & dB meter, L/R stereo speaker sweep generator & webcam FPS/resolution check.',
      enabled: 1,
      nav_order: 6,
      badge: 'New'
    },
    {
      module_key: 'typing_test',
      name: 'Typing Speed',
      route_path: '/typing-test',
      description: 'Live WPM, raw speed & accuracy benchmark across English, Hardware, JS Code & GitHub API feeds.',
      enabled: 1,
      nav_order: 7,
      badge: ''
    },
    {
      module_key: 'guides_cms',
      name: 'Repair Guides',
      route_path: '/guides',
      description: 'Technical troubleshooting guides for switches, stick drift, dead pixels, NKRO, and laptop keyboards.',
      enabled: 1,
      nav_order: 8,
      badge: ''
    }
  ];

  const insertMod = db.prepare(`
    INSERT OR IGNORE INTO feature_modules (module_key, name, route_path, description, enabled, nav_order, badge)
    VALUES (@module_key, @name, @route_path, @description, @enabled, @nav_order, @badge)
  `);
  for (const m of modules) insertMod.run(m);

  // 4. Seed Heavy SEO Pages for Every Hardware Tool & Legal Route
  const pages = [
    {
      route_path: '/',
      page_name: 'Home — Online Keyboard Tester',
      title: 'Online Keyboard Tester — Free Key, NKRO & Switch Chatter Check',
      meta_description: 'Use our free online keyboard tester to test laptop, Mac, and mechanical keys instantly. Check stuck keys, NKRO ghosting, polling Hz, and switch chatter.',
      focus_keyword: 'online keyboard tester',
      secondary_keywords: 'keyboard test, test my keys, mechanical keyboard tester, nkro test, keyboard ghosting test, mac keyboard tester, laptop key test',
      schema_type: 'WebApplication',
      sitemap_priority: 1.0,
      sitemap_changefreq: 'daily',
      faq_json: JSON.stringify([
        {
          q: 'How do I test my keyboard keys online without installing software?',
          a: 'Press any key on your physical keyboard while on KeyPulse. Active keys illuminate immediately while verified keys stay marked so you can inspect Full-Size, TKL, 75%, 60%, ISO, or Mac layouts.'
        },
        {
          q: 'What is NKRO (N-Key Rollover) and keyboard ghosting?',
          a: 'Key rollover measures how many simultaneous keys your keyboard reports over USB. Standard membrane matrices block inputs past 2 to 6 keys (6KRO), whereas dioded NKRO mechanical boards register unlimited held keys.'
        },
        {
          q: 'How can I tell if my mechanical keyboard has key chatter?',
          a: 'Key chatter occurs when oxidized switch contacts bounce twice on a single press within 5 to 32 milliseconds. KeyPulse monitors release-to-press intervals automatically and flags chattering scan codes.'
        },
        {
          q: 'Why does the laptop Fn key sometimes not register in browser keyboard testers?',
          a: 'On most laptops and compact keyboards, the Fn modifier is handled inside onboard microcontroller firmware to switch hardware layers and never emits an OS-level USB HID scan code.'
        }
      ])
    },
    {
      route_path: '/gamepad-test',
      page_name: 'Gamepad & Controller Drift Tester',
      title: 'Gamepad Tester Online — Controller Stick Drift, Triggers & Rumble',
      meta_description: 'Run a free gamepad tester online for Xbox, PlayStation DualSense, Switch Pro, and PC controllers. Measure analog stick drift, deadzones, triggers, and vibration.',
      focus_keyword: 'gamepad tester online',
      secondary_keywords: 'controller drift test, stick drift tester, ps5 dualsense test, xbox controller tester, gamepad deadzone check',
      schema_type: 'WebApplication',
      sitemap_priority: 0.95,
      sitemap_changefreq: 'weekly',
      faq_json: JSON.stringify([
        {
          q: 'How do I test controller stick drift online?',
          a: 'Connect your controller via USB or Bluetooth, press any button to wake the HTML5 Gamepad API, and release both thumbsticks. Resting X/Y values consistently exceeding 0.06–0.08 (6–8%) indicate potentiometer wear or spring centering drift.'
        },
        {
          q: 'Why do Hall Effect controller sticks resist drift?',
          a: 'Traditional analog sticks rub carbon resistive tracks with physical wipers that wear down over time, whereas Hall Effect thumbsticks sense magnet position contactlessly with zero mechanical friction on the sensor.'
        }
      ])
    },
    {
      route_path: '/display-test',
      page_name: 'Monitor Dead Pixel & Refresh Rate Tester',
      title: 'Monitor Test Online — Dead Pixel Check, Refresh Rate Hz & Contrast',
      meta_description: 'Use our fullscreen monitor test online to inspect dead or stuck pixels, measure real display refresh rate in Hz (60Hz/144Hz/240Hz), and check color banding.',
      focus_keyword: 'monitor test online',
      secondary_keywords: 'dead pixel test, refresh rate test hz, stuck pixel checker, screen uniformity test, monitor contrast ramp',
      schema_type: 'WebApplication',
      sitemap_priority: 0.9,
      sitemap_changefreq: 'weekly',
      faq_json: JSON.stringify([
        {
          q: 'What is the difference between a dead pixel and a stuck pixel?',
          a: 'A dead pixel receives no power or fails to pass light and remains permanently black across white and RGB screens, while a stuck pixel keeps one or two sub-pixels (red, green, or blue) constantly illuminated.'
        },
        {
          q: 'Why does my 144Hz monitor show 60Hz in the browser refresh rate test?',
          a: 'Check your OS Display Advanced Settings to confirm 144Hz is selected rather than the default 60Hz mode, and ensure browser hardware acceleration and battery-saver frame caps are not throttling requestAnimationFrame.'
        }
      ])
    },
    {
      route_path: '/audio-video-test',
      page_name: 'Microphone, Speaker & Webcam Tester',
      title: 'Mic & Webcam Test Online — Check Audio Waveform, Stereo & Camera',
      meta_description: 'Run a private mic and webcam test online in your browser. Inspect live microphone waveform dB levels, test left/right stereo speakers, and verify camera FPS.',
      focus_keyword: 'webcam test online',
      secondary_keywords: 'microphone test online, webcam tester, left right speaker test, audio frequency test, camera resolution check',
      schema_type: 'WebApplication',
      sitemap_priority: 0.9,
      sitemap_changefreq: 'weekly',
      faq_json: JSON.stringify([
        {
          q: 'Are my microphone audio or webcam video streams uploaded to any server?',
          a: 'Never. KeyPulse processes WebRTC MediaStream tracks strictly inside your local browser tab using Web Audio AnalyserNode and HTML5 video elements—zero audio or video leaves your device.'
        }
      ])
    },
    {
      route_path: '/typing-test',
      page_name: 'Typing Speed & WPM Test',
      title: 'Typing Speed Test Online — Live WPM, Accuracy & Switch Check',
      meta_description: 'Take a free typing speed test in Words Per Minute (WPM) with real-time accuracy, 15s/30s/60s timers, developer code snippets, and mechanical hardware text.',
      focus_keyword: 'typing speed test',
      secondary_keywords: 'wpm test, words per minute test, online typing benchmark, programmer typing test',
      schema_type: 'WebApplication',
      sitemap_priority: 0.9,
      sitemap_changefreq: 'weekly',
      faq_json: JSON.stringify([
        {
          q: 'How is WPM (Words Per Minute) calculated?',
          a: 'Standard WPM divides every 5 typed characters (including spaces) by elapsed minutes, subtracting uncorrected errors so both speed and accuracy are measured.'
        }
      ])
    },
    {
      route_path: '/mouse-cps-test',
      page_name: 'Mouse Button, Polling Hz & CPS Tester',
      title: 'Mouse Tester Online — Polling Rate Hz, Double-Click & CPS Test',
      meta_description: 'Run our free mouse tester online to verify left, right, middle, and side buttons, measure USB polling rate in Hz, detect double-click faults, and test CPS.',
      focus_keyword: 'mouse tester online',
      secondary_keywords: 'mouse polling rate test, mouse double click test, cps test, scroll wheel tester, mouse button checker',
      schema_type: 'WebApplication',
      sitemap_priority: 0.9,
      sitemap_changefreq: 'weekly',
      faq_json: JSON.stringify([
        {
          q: 'How do I test my mouse polling rate in Hz?',
          a: 'Move your cursor in smooth continuous circles inside the diagnostic pad. High-speed gaming mice report pointer updates at 500Hz to 1000Hz+, whereas standard Bluetooth office mice average 90Hz to 125Hz.'
        }
      ])
    },
    {
      route_path: '/chatter-analyzer',
      page_name: 'Mechanical Switch Chatter & Latency Lab',
      title: 'Keyboard Chatter Test — Mechanical Switch Bounce & Debounce Lab',
      meta_description: 'Run an online keyboard chatter test for double-typing mechanical switches. Set custom millisecond debounce thresholds and inspect per-key bounce intervals.',
      focus_keyword: 'keyboard chatter test',
      secondary_keywords: 'switch bounce test, double typing keyboard fix, mechanical switch tester, debounce threshold test',
      schema_type: 'WebApplication',
      sitemap_priority: 0.85,
      sitemap_changefreq: 'weekly',
      faq_json: JSON.stringify([
        {
          q: 'What threshold in milliseconds indicates keyboard switch chatter?',
          a: 'Human fingers rarely double-tap a single key faster than 45–55ms intentionally. Same-key intervals below 30–35ms almost always indicate metallic leaf contact chatter or insufficient firmware debounce.'
        }
      ])
    },
    {
      route_path: '/guides',
      page_name: 'Hardware Diagnostic & Repair Guides',
      title: 'Keyboard Troubleshooting Guides & Peripheral Repair Reference',
      meta_description: 'Browse expert keyboard troubleshooting guides covering mechanical switch chatter repair, controller stick drift, dead pixels, NKRO ghosting, and laptop keys.',
      focus_keyword: 'keyboard troubleshooting guides',
      secondary_keywords: 'fix stuck keys, controller stick drift fix, dead pixel guide, nkro explained',
      schema_type: 'CollectionPage',
      sitemap_priority: 0.8,
      sitemap_changefreq: 'weekly',
      faq_json: '[]'
    },
    {
      route_path: '/about',
      page_name: 'About KeyPulse',
      title: 'About KeyPulse — Browser Input Hardware Diagnostics Lab',
      meta_description: 'Learn about KeyPulse and how we engineer privacy-first browser diagnostic tools for mechanical keyboards, gamepads, monitors, mice, microphones, and webcams.',
      focus_keyword: 'about keypulse',
      secondary_keywords: 'input hardware diagnostics, keyboard testing platform',
      schema_type: 'AboutPage',
      sitemap_priority: 0.5,
      sitemap_changefreq: 'monthly',
      faq_json: '[]'
    },
    {
      route_path: '/contact',
      page_name: 'Contact KeyPulse',
      title: 'Contact KeyPulse — Hardware Feedback, Support & Sponsorships',
      meta_description: 'Contact KeyPulse to request regional keyboard layouts, report browser scan-code edge cases, or inquire about hardware sponsorships and advertising.',
      focus_keyword: 'contact keypulse',
      secondary_keywords: 'keyboard tester support, hardware feedback',
      schema_type: 'ContactPage',
      sitemap_priority: 0.5,
      sitemap_changefreq: 'monthly',
      faq_json: '[]'
    },
    {
      route_path: '/privacy-policy',
      page_name: 'Privacy Policy',
      title: 'Privacy Policy & Google AdSense Cookie Disclosure — KeyPulse',
      meta_description: 'Read our Privacy Policy covering 100% browser-local hardware testing, Google AdSense cookies, DoubleClick disclosures, and GDPR/CCPA consent options.',
      focus_keyword: 'privacy policy',
      secondary_keywords: 'google adsense cookie policy, keystroke privacy',
      schema_type: 'WebPage',
      sitemap_priority: 0.3,
      sitemap_changefreq: 'monthly',
      faq_json: '[]'
    },
    {
      route_path: '/terms',
      page_name: 'Terms of Service',
      title: 'Terms of Service — KeyPulse Hardware Diagnostic Utilities',
      meta_description: 'Review the Terms of Service governing use of the KeyPulse online keyboard tester, gamepad drift tester, monitor pixel check, and repair guides.',
      focus_keyword: 'terms of service',
      secondary_keywords: 'website terms',
      schema_type: 'WebPage',
      sitemap_priority: 0.3,
      sitemap_changefreq: 'monthly',
      faq_json: '[]'
    }
  ];

  const insertSeo = db.prepare(`
    INSERT OR IGNORE INTO seo_pages (
      route_path, page_name, title, meta_description, focus_keyword,
      secondary_keywords, schema_type, faq_json, sitemap_priority, sitemap_changefreq
    ) VALUES (
      @route_path, @page_name, @title, @meta_description, @focus_keyword,
      @secondary_keywords, @schema_type, @faq_json, @sitemap_priority, @sitemap_changefreq
    )
  `);
  for (const p of pages) insertSeo.run(p);

  // 5. Seed CLS-Safe Google AdSense Slots
  const slots = [
    {
      slot_key: 'top_leaderboard',
      name: 'Top Workbench Leaderboard (728×90 / Responsive)',
      placement_hint: 'Top of hardware workspace with reserved 90px CLS shield',
      enabled: 1,
      mode: 'placeholder',
      ad_unit_id: '1000000001',
      ad_format: 'horizontal',
      min_height_px: 90
    },
    {
      slot_key: 'mid_incontent',
      name: 'Below-Bench In-Content Unit (Responsive)',
      placement_hint: 'Between interactive hardware test bench and technical reference section',
      enabled: 1,
      mode: 'placeholder',
      ad_unit_id: '1000000002',
      ad_format: 'auto',
      min_height_px: 110
    },
    {
      slot_key: 'sidebar_rectangle',
      name: 'Reference Rail Rectangle (300×250)',
      placement_hint: 'Alongside technical documentation & guide reading column',
      enabled: 1,
      mode: 'placeholder',
      ad_unit_id: '1000000003',
      ad_format: 'rectangle',
      min_height_px: 250
    },
    {
      slot_key: 'footer_multiplex',
      name: 'Bottom Multiplex / Pre-Footer Unit',
      placement_hint: 'Bottom of workspace above legal links',
      enabled: 1,
      mode: 'placeholder',
      ad_unit_id: '1000000004',
      ad_format: 'autorelaxed',
      min_height_px: 95
    }
  ];
  const insertSlot = db.prepare(`
    INSERT OR IGNORE INTO ad_slots (slot_key, name, placement_hint, enabled, mode, ad_unit_id, ad_format, min_height_px)
    VALUES (@slot_key, @name, @placement_hint, @enabled, @mode, @ad_unit_id, @ad_format, @min_height_px)
  `);
  for (const s of slots) insertSlot.run(s);

  // 6. Seed High-Intent SEO Hardware Guides
  const guides = [
    {
      slug: 'how-to-fix-mechanical-keyboard-key-chatter',
      title: 'How to Diagnose & Fix Mechanical Keyboard Key Chatter (Double Typing)',
      excerpt: 'Step-by-step hardware guide to isolating oxidized mechanical switch leaves, adjusting QMK/VIA debounce algorithms, and eliminating double-registered keystrokes.',
      focus_keyword: 'fix mechanical keyboard key chatter',
      meta_title: 'How to Fix Mechanical Keyboard Key Chatter (Double Typing Guide)',
      meta_description: 'Is your mechanical keyboard typing letters twice? Learn how to verify switch chatter online, clean oxidized copper leaves, tune debounce, or hot-swap switches.',
      category: 'Switch Repair',
      reading_minutes: 5,
      content_html: `
        <h2>What Causes Mechanical Keyboard Key Chatter?</h2>
        <p>Key chatter occurs when a single physical press causes a mechanical switch's internal metal contact leaves to bounce multiple times beyond your keyboard's firmware debounce window (typically 5ms). Your OS receives rapid electrical pulses—usually separated by <strong>4ms to 30ms</strong>—as duplicate characters.</p>
        <h3>Step 1: Isolate the Exact Faulty Switch</h3>
        <p>Open our <a href="/chatter-analyzer">Switch Chatter Lab</a> or main <a href="/">Online Keyboard Tester</a> and tap suspect keys 30 times at normal cadence. Any actuation interval below 32ms flags the offending scan code.</p>
        <h3>Step 2: 99% Isopropyl Alcohol Contact Cleaning</h3>
        <p>Unplug USB power, pull the keycap, depress the stem, and apply two drops of <strong>99% isopropyl alcohol (IPA)</strong> inside the switch housing. Actuate rapidly 40 times and allow 15 minutes to evaporate completely.</p>
        <h3>Step 3: Increase Firmware Debounce Time</h3>
        <p>Raising QMK/VIA or vendor software debounce from 2ms to <strong>8ms–10ms</strong> suppresses leaf bounce without noticeable latency.</p>
      `
    },
    {
      slug: 'nkro-vs-6kro-keyboard-ghosting-explained',
      title: 'NKRO vs. 6KRO Explained: How to Test Keyboard Ghosting & Rollover',
      excerpt: 'Understand diode matrices, USB HID boot descriptors, membrane blocking, and why gaming or stenography workflows benefit from full N-Key Rollover.',
      focus_keyword: 'nkro vs 6kro keyboard ghosting',
      meta_title: 'NKRO vs 6KRO Explained — How to Test Keyboard Ghosting Online',
      meta_description: 'Discover the difference between 2KRO membrane blocking, 6-Key Rollover (6KRO), and true N-Key Rollover (NKRO), and test simultaneous key presses online.',
      category: 'Keyboard Engineering',
      reading_minutes: 4,
      content_html: `
        <h2>Ghosting vs. Matrix Blocking</h2>
        <p>Un-dioded membrane matrices block third or fourth simultaneous key combinations along shared row/column traces, causing dropped diagonal movement or sprint inputs in games.</p>
        <h2>6KRO vs. Full NKRO Over USB</h2>
        <ul>
          <li><strong>6-Key Rollover (6KRO):</strong> Standard USB HID Boot descriptor reporting up to 6 regular keys plus 4 modifiers simultaneously.</li>
          <li><strong>N-Key Rollover (NKRO):</strong> Individual per-switch diodes + bitmap HID reports allowing unlimited simultaneous keystrokes across the entire board.</li>
        </ul>
        <p>Press multiple keys simultaneously on the <a href="/">KeyPulse Keyboard Tester</a> and inspect the live <strong>Peak Rollover</strong> counter.</p>
      `
    },
    {
      slug: 'how-to-diagnose-controller-analog-stick-drift',
      title: 'How to Test & Fix Controller Analog Stick Drift (PS5, Xbox & Switch)',
      excerpt: 'Learn how potentiometer wiper wear causes thumbstick drift, how to measure circularity error and resting deadzones online, and when to upgrade to Hall Effect sticks.',
      focus_keyword: 'controller analog stick drift',
      meta_title: 'How to Diagnose & Fix Controller Analog Stick Drift Online',
      meta_description: 'Measure controller analog stick drift and resting deadzone percentages online for DualSense, Xbox, and Switch Pro gamepads, plus cleaning and calibration fixes.',
      category: 'Controllers',
      reading_minutes: 5,
      content_html: `
        <h2>Why Analog Thumbsticks Develop Drift</h2>
        <p>Standard DualSense, DualShock, Xbox, and Joy-Con thumbsticks rely on two 10k-ohm carbon film potentiometers (one for X-axis, one for Y-axis) plus a mechanical centering spring. After hundreds of gaming hours, microscopic carbon dust and wiper track grooves shift voltage readings away from 0.00 even when untouched.</p>
        <h2>Measuring Drift Percentage Online</h2>
        <p>Connect your gamepad via USB or Bluetooth and open the <a href="/gamepad-test">Gamepad &amp; Stick Drift Tester</a>. Flick both sticks gently and let them snap back to center. Resting axis offsets under <strong>0.05 (5%)</strong> fall within normal factory tolerance, while readings above <strong>0.08–0.12</strong> cause camera or character creep in games with tight inner deadzones.</p>
      `
    },
    {
      slug: 'laptop-keyboard-keys-not-working-troubleshooting',
      title: 'Laptop Keyboard Keys Not Working? Complete Hardware vs. OS Checklist',
      excerpt: 'Distinguish Windows/macOS accessibility filter settings from damaged scissor-switch clips and loose ZIF ribbon cables using browser scan-code diagnostics.',
      focus_keyword: 'laptop keyboard keys not working',
      meta_title: 'Laptop Keyboard Keys Not Working? Step-by-Step Diagnostic Guide',
      meta_description: 'Diagnose dead laptop keys in minutes. Tell whether non-responsive keys are caused by Filter Keys, OS layout mismatches, scissor mechanisms, or ribbon cables.',
      category: 'Laptop Diagnostics',
      reading_minutes: 5,
      content_html: `
        <h2>1. Check If Dead Keys Share a Matrix Trace</h2>
        <p>Test every row on our <a href="/">Online Keyboard Tester</a> using the 75% or Mac layout. When an entire diagonal group such as <code>8, I, K, ,</code> fails together, one pin on the internal ZIF ribbon cable is oxidized or unseated.</p>
        <h2>2. Rule Out OS Filter Keys &amp; Mouse Keys</h2>
        <p>Ensure Windows <strong>Filter Keys</strong> and macOS <strong>Mouse Keys</strong> are disabled, then verify whether raw <code>KeyboardEvent.code</code> events fire in the browser telemetry readout.</p>
      `
    }
  ];

  const insertGuide = db.prepare(`
    INSERT OR IGNORE INTO guides (
      slug, title, excerpt, content_html, focus_keyword,
      meta_title, meta_description, category, reading_minutes, published
    ) VALUES (
      @slug, @title, @excerpt, @content_html, @focus_keyword,
      @meta_title, @meta_description, @category, @reading_minutes, 1
    )
  `);
  for (const g of guides) insertGuide.run(g);

  // 7. Seed Google AdSense Required Policy Pages
  const policies = [
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy & Advertising Cookie Disclosure',
      content_html: `
        <p><strong>Effective Date:</strong> November 2026</p>
        <h2>1. 100% Local Browser Hardware Processing</h2>
        <p>All keyboard testing, mouse polling measurements, gamepad axis diagnostics, monitor pixel checks, microphone waveforms, and webcam previews run <strong>strictly locally inside your web browser</strong>. KeyPulse never transmits, records, or stores typed characters, audio streams, or camera frames on any server.</p>
        <h2>2. Aggregate Performance Telemetry</h2>
        <p>We record anonymous pageview counts and Core Web Vitals (TTFB, LCP, CLS) to maintain search performance without personal keystroke or media data.</p>
        <h2>3. Google AdSense &amp; DoubleClick Cookie Disclosure</h2>
        <p>We partner with third-party advertising networks including <strong>Google AdSense</strong>:</p>
        <ul>
          <li>Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to this website or other websites.</li>
          <li>Google's use of advertising cookies enables it and its partners to serve ads based on visits to KeyPulse and other sites on the Internet.</li>
          <li>Users may opt out of personalized advertising via our Cookie Preferences control or at <a href="https://www.google.com/settings/ads" rel="noopener noreferrer" target="_blank">Google Ads Settings</a>.</li>
        </ul>
        <h2>4. GDPR &amp; CCPA Privacy Rights</h2>
        <p>Visitors in the EEA, UK, and California can manage consent choices via the Cookie Preferences control in the sidebar/footer or reach us on our <a href="/contact">Contact Page</a>.</p>
      `
    },
    {
      slug: 'terms',
      title: 'Terms of Service',
      content_html: `
        <p><strong>Last Updated:</strong> November 2026</p>
        <h2>1. Hardware Diagnostic Purpose</h2>
        <p>KeyPulse provides browser-based peripheral and display diagnostic tools ("as-is") for testing keyboards, mice, controllers, monitors, speakers, microphones, and webcams. Browser sandboxes restrict web apps from intercepting certain OS-reserved keys (such as <code>Ctrl+Alt+Del</code> or firmware-only <code>Fn</code> layers).</p>
        <h2>2. Acceptable Use &amp; Hardware Safety</h2>
        <p>Automated abuse or invalid interaction with advertisements is prohibited. Always disconnect power before cleaning switches or servicing internal cables.</p>
      `
    },
    {
      slug: 'about',
      title: 'About KeyPulse Hardware Diagnostics',
      content_html: `
        <h2>Full-System Browser Hardware Bench</h2>
        <p>KeyPulse is an instant, zero-install hardware diagnostic workbench built for PC builders, repair technicians, mechanical keyboard enthusiasts, gamers, and remote professionals.</p>
        <h2>Complete Peripheral Coverage</h2>
        <ul>
          <li><strong>Input Bench:</strong> <a href="/">Online Keyboard Tester</a> (ANSI, ISO, Mac, TKL, 75%, 60%), <a href="/chatter-analyzer">Switch Chatter Lab</a>, <a href="/mouse-cps-test">Mouse Polling Hz &amp; Microswitch Tester</a>, and <a href="/gamepad-test">Gamepad Stick Drift &amp; Rumble Tester</a>.</li>
          <li><strong>Display &amp; Media Bench:</strong> <a href="/display-test">Monitor Dead Pixel &amp; Refresh Rate (Hz) Tester</a>, <a href="/audio-video-test">Microphone Waveform, Stereo Speaker &amp; Webcam Inspector</a>, and <a href="/typing-test">Typing Speed WPM Benchmark</a>.</li>
          <li><strong>Local Privacy Guarantee:</strong> Every hardware event stays in local browser memory.</li>
        </ul>
      `
    },
    {
      slug: 'contact',
      title: 'Contact KeyPulse',
      content_html: `
        <h2>Hardware Feedback, Layout Requests &amp; Support</h2>
        <p>Have a suggestion for a custom keyboard matrix, controller mapping, or one of our <a href="/guides">hardware repair guides</a>? Send a message directly to the KeyPulse engineering inbox below.</p>
        <h2>Advertising, Sponsorships &amp; Privacy Inquiries</h2>
        <p>For peripheral sponsorships or questions regarding our <a href="/privacy-policy">Privacy &amp; Cookie Policy</a>, use the form below.</p>
      `
    }
  ];
  const insertPolicy = db.prepare(`
    INSERT OR IGNORE INTO policy_pages (slug, title, content_html)
    VALUES (@slug, @title, @content_html)
  `);
  for (const p of policies) insertPolicy.run(p);

  // 8. Seed Foreign / External API Connectors Registry
  const apis = [
    {
      api_key_slug: 'github_code_corpus',
      name: 'GitHub Public Snippet & Release Corpus API',
      provider: 'api.github.com',
      endpoint_url: 'https://api.github.com/repos/expressjs/express/readme',
      auth_key: '',
      enabled: 1,
      description: 'Fetches live open-source documentation excerpts from GitHub REST API for Typing Speed Test mode (with instant local fallback).'
    },
    {
      api_key_slug: 'indexnow_search_ping',
      name: 'IndexNow Instant Search Engine Indexing API',
      provider: 'Bing / Yandex / IndexNow',
      endpoint_url: 'https://api.indexnow.org/indexnow',
      auth_key: indexNowKey,
      enabled: 1,
      description: 'Notifies participating search engines whenever SEO metadata or new Hardware Guides are published.'
    },
    {
      api_key_slug: 'google_pagespeed_api',
      name: 'Google PageSpeed Insights / CrUX Webhook',
      provider: 'Google Search Central',
      endpoint_url: 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
      auth_key: '',
      enabled: 0,
      description: 'Optional external Core Web Vitals lab audit connector for production domain benchmarking.'
    },
    {
      api_key_slug: 'switch_database_sync',
      name: 'Peripheral & Switch Spec Feed',
      provider: 'GitHub Raw / Custom Webhook',
      endpoint_url: 'https://api.github.com/repos/Retropolis009/KeyboardTester',
      auth_key: '',
      enabled: 1,
      description: 'Extensible external data feed hook for hardware spec tables and future expansion modules.'
    }
  ];
  const insertApi = db.prepare(`
    INSERT OR IGNORE INTO external_apis (api_key_slug, name, provider, endpoint_url, auth_key, enabled, description)
    VALUES (@api_key_slug, @name, @provider, @endpoint_url, @auth_key, @enabled, @description)
  `);
  for (const a of apis) insertApi.run(a);
}

initSchema();
seedDefaults();

module.exports = {
  db,
  getSetting,
  setSetting,
  getAllSettings
};
