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
  // 1. Seed bootstrap admin account
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (adminCount === 0) {
    const defaultUser = process.env.ADMIN_USER || 'admin';
    const defaultPass = process.env.ADMIN_PASSWORD || 'KeyPulse@2026!';
    const { salt, hash } = hashPassword(defaultPass);
    db.prepare(`
      INSERT INTO admins (username, email, password_hash, salt, role, must_change_password)
      VALUES (?, ?, ?, ?, 'superadmin', 0)
    `).run(defaultUser, 'admin@keypulse.tools', hash, salt);
  }

  // 2. Global Settings (SEO, Verification, AdSense, Consent)
  const indexNowKey = generateRandomToken(16);
  const defaultSettings = {
    site_name: 'KeyPulse',
    site_tagline: 'Online Keyboard Tester, NKRO Ghosting & Switch Diagnostic Suite',
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
    // Google AdSense & Monetization Settings
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
      description: 'Free browser-based keyboard tester, mechanical switch chatter analyzer, NKRO rollover checker, typing speed test, and mouse CPS diagnostics.'
    })
  };

  for (const [k, v] of Object.entries(defaultSettings)) {
    const exists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k);
    if (!exists) setSetting(k, v);
  }

  // 3. Seed Feature Modules (Extensible Tool Registry)
  const modCount = db.prepare('SELECT COUNT(*) as c FROM feature_modules').get().c;
  if (modCount === 0) {
    const modules = [
      {
        module_key: 'keyboard_tester',
        name: 'Keyboard Tester',
        route_path: '/',
        description: 'Full ANSI/ISO/Mac/TKL/75%/60% interactive key tester with NKRO, switch chatter, polling ms & mechanical audio.',
        enabled: 1,
        nav_order: 1,
        badge: 'Core'
      },
      {
        module_key: 'typing_test',
        name: 'Typing Speed (WPM)',
        route_path: '/typing-test',
        description: 'Real-time WPM, raw speed, accuracy & character error diagnostics with English, Hardware & Code modes.',
        enabled: 1,
        nav_order: 2,
        badge: 'Popular'
      },
      {
        module_key: 'mouse_cps_test',
        name: 'Mouse & CPS Test',
        route_path: '/mouse-cps-test',
        description: 'Left/Middle/Right/Side button check, double-click switch fault detector, scroll encoder & CPS benchmark.',
        enabled: 1,
        nav_order: 3,
        badge: ''
      },
      {
        module_key: 'chatter_analyzer',
        name: 'Switch Chatter Lab',
        route_path: '/chatter-analyzer',
        description: 'High-precision mechanical switch bounce & double-actuation interval analyzer (<35ms fault detection).',
        enabled: 1,
        nav_order: 4,
        badge: 'Pro'
      },
      {
        module_key: 'guides_cms',
        name: 'Hardware Guides',
        route_path: '/guides',
        description: 'SEO knowledge base covering NKRO ghosting, fixing mechanical switch chatter, polling rates, and keycaps.',
        enabled: 1,
        nav_order: 5,
        badge: ''
      }
    ];
    const stmt = db.prepare(`
      INSERT INTO feature_modules (module_key, name, route_path, description, enabled, nav_order, badge)
      VALUES (@module_key, @name, @route_path, @description, @enabled, @nav_order, @badge)
    `);
    for (const m of modules) stmt.run(m);
  }

  // 4. Seed Heavy SEO Pages with Structured FAQs for Rich Snippets
  const seoCount = db.prepare('SELECT COUNT(*) as c FROM seo_pages').get().c;
  if (seoCount === 0) {
    const pages = [
      {
        route_path: '/',
        page_name: 'Home — Online Keyboard Tester',
        title: 'Online Keyboard Tester — Free Key, NKRO & Switch Chatter Check',
        meta_description: 'Use our free online keyboard tester to test laptop, Mac, and mechanical keys instantly. Check stuck keys, NKRO ghosting, latency, and switch chatter.',
        focus_keyword: 'online keyboard tester',
        secondary_keywords: 'keyboard test, test my keys, mechanical keyboard tester, nkro test, keyboard ghosting test, mac keyboard tester, laptop key test',
        schema_type: 'WebApplication',
        sitemap_priority: 1.0,
        sitemap_changefreq: 'daily',
        faq_json: JSON.stringify([
          {
            q: 'How do I test my keyboard keys online without installing software?',
            a: 'Simply press any key on your physical keyboard while on KeyPulse. Active keys illuminate immediately while tested keys stay latched in green so you can quickly verify every switch across Full-Size, TKL, 75%, 60%, ISO, or Mac layouts.'
          },
          {
            q: 'What is NKRO (N-Key Rollover) and keyboard ghosting?',
            a: 'Key rollover measures how many keys your keyboard can register simultaneously. Membrane keyboards usually cap around 2 to 6 keys (6KRO), causing missed inputs ("ghosting"), whereas gaming and mechanical keyboards with NKRO register unlimited simultaneous presses.'
          },
          {
            q: 'How can I tell if my mechanical keyboard has key chatter?',
            a: 'Key chatter happens when an aging or oxidized mechanical switch contacts twice on a single press, firing duplicate characters within 5 to 35 milliseconds. KeyPulse automatically monitors inter-press intervals and alerts you whenever switch bounce occurs.'
          },
          {
            q: 'Why do Fn or multimedia keys sometimes not highlight in a browser keyboard tester?',
            a: 'On most laptops and mechanical keyboards, the Fn key is processed directly inside the keyboard microcontroller firmware to trigger hardware layers (brightness, volume, RGB) and does not send an operating-system keycode to web browsers.'
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
            a: 'Standard WPM divides every 5 typed characters (including spaces) by the elapsed time in minutes, subtracting uncorrected errors so both speed and precision are reflected.'
          },
          {
            q: 'What is a good typing speed on a mechanical keyboard?',
            a: 'The average computer user types between 40 and 50 WPM. Experienced office professionals average 65–80 WPM, while competitive typists and software engineers frequently exceed 95–130+ WPM.'
          }
        ])
      },
      {
        route_path: '/mouse-cps-test',
        page_name: 'Mouse Button, Scroll & CPS Tester',
        title: 'Mouse Tester Online — Double-Click Faults, Scroll & CPS Test',
        meta_description: 'Run our free mouse tester online to verify left, right, middle, and side buttons, detect double-click microswitch faults, scroll jumps, and Clicks Per Second.',
        focus_keyword: 'mouse tester online',
        secondary_keywords: 'mouse double click test, cps test, scroll wheel tester, mouse button checker',
        schema_type: 'WebApplication',
        sitemap_priority: 0.9,
        sitemap_changefreq: 'weekly',
        faq_json: JSON.stringify([
          {
            q: 'How do I test if my mouse has the double-click hardware bug?',
            a: 'Click the target pad repeatedly at a normal cadence. If the microswitch spring has lost tension or oxidized, two click events will fire under 55 milliseconds apart and our Fault Counter will immediately highlight the defective button.'
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
        page_name: 'Keyboard & Hardware Diagnostic Guides',
        title: 'Keyboard Troubleshooting Guides & Mechanical Switch Repair',
        meta_description: 'Browse expert keyboard troubleshooting guides covering mechanical switch chatter repair, NKRO vs 6KRO ghosting tests, and dead laptop key checklists.',
        focus_keyword: 'keyboard troubleshooting guides',
        secondary_keywords: 'fix stuck keys, mechanical switch repair, nkro explained, keyboard maintenance',
        schema_type: 'CollectionPage',
        sitemap_priority: 0.8,
        sitemap_changefreq: 'weekly',
        faq_json: '[]'
      },
      {
        route_path: '/about',
        page_name: 'About KeyPulse',
        title: 'About KeyPulse — Browser Input Hardware Diagnostics Lab',
        meta_description: 'Learn about KeyPulse and how we engineer privacy-first browser diagnostic tools for mechanical keyboards, NKRO testing, switch chatter, and mouse CPS.',
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
        meta_description: 'Read our Privacy Policy covering 100% browser-local keystroke testing, Google AdSense cookies, DoubleClick disclosures, and GDPR/CCPA consent options.',
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
        meta_description: 'Review the Terms of Service governing use of the KeyPulse online keyboard tester, typing speed WPM benchmark, mouse CPS tester, and repair guides.',
        focus_keyword: 'terms of service',
        secondary_keywords: 'website terms',
        schema_type: 'WebPage',
        sitemap_priority: 0.3,
        sitemap_changefreq: 'monthly',
        faq_json: '[]'
      }
    ];

    const insertSeo = db.prepare(`
      INSERT INTO seo_pages (
        route_path, page_name, title, meta_description, focus_keyword,
        secondary_keywords, schema_type, faq_json, sitemap_priority, sitemap_changefreq
      ) VALUES (
        @route_path, @page_name, @title, @meta_description, @focus_keyword,
        @secondary_keywords, @schema_type, @faq_json, @sitemap_priority, @sitemap_changefreq
      )
    `);
    for (const p of pages) insertSeo.run(p);
  }

  // 5. Seed CLS-Safe Google AdSense Slots
  const slotCount = db.prepare('SELECT COUNT(*) as c FROM ad_slots').get().c;
  if (slotCount === 0) {
    const slots = [
      {
        slot_key: 'top_leaderboard',
        name: 'Top Leaderboard Banner (728×90 / Responsive)',
        placement_hint: 'Above diagnostic tool — high viewability with reserved 90px CLS shield',
        enabled: 1,
        mode: 'placeholder',
        ad_unit_id: '1000000001',
        ad_format: 'horizontal',
        min_height_px: 90
      },
      {
        slot_key: 'mid_incontent',
        name: 'Below-Tool In-Content Unit (Responsive)',
        placement_hint: 'Between interactive keyboard tester and SEO guide / FAQ section',
        enabled: 1,
        mode: 'placeholder',
        ad_unit_id: '1000000002',
        ad_format: 'auto',
        min_height_px: 120
      },
      {
        slot_key: 'sidebar_rectangle',
        name: 'Diagnostic Sidebar / Guide Rectangle (300×250)',
        placement_hint: 'Alongside telemetry & hardware article reading rail',
        enabled: 1,
        mode: 'placeholder',
        ad_unit_id: '1000000003',
        ad_format: 'rectangle',
        min_height_px: 250
      },
      {
        slot_key: 'footer_multiplex',
        name: 'Pre-Footer Multiplex / Anchor Unit',
        placement_hint: 'Bottom of page above footer links',
        enabled: 1,
        mode: 'placeholder',
        ad_unit_id: '1000000004',
        ad_format: 'autorelaxed',
        min_height_px: 100
      }
    ];
    const insertSlot = db.prepare(`
      INSERT INTO ad_slots (slot_key, name, placement_hint, enabled, mode, ad_unit_id, ad_format, min_height_px)
      VALUES (@slot_key, @name, @placement_hint, @enabled, @mode, @ad_unit_id, @ad_format, @min_height_px)
    `);
    for (const s of slots) insertSlot.run(s);
  }

  // 6. Seed High-Intent SEO Guides (Topical Authority for Google Search)
  const guideCount = db.prepare('SELECT COUNT(*) as c FROM guides').get().c;
  if (guideCount === 0) {
    const guides = [
      {
        slug: 'how-to-fix-mechanical-keyboard-key-chatter',
        title: 'How to Diagnose & Fix Mechanical Keyboard Key Chatter (Double Typing)',
        excerpt: 'Step-by-step hardware guide to isolating oxidized mechanical switch leaves, adjusting QMK/VIA debounce algorithms, and permanently eliminating double-registered keystrokes.',
        focus_keyword: 'fix mechanical keyboard key chatter',
        meta_title: 'How to Fix Mechanical Keyboard Key Chatter (Double Typing Guide)',
        meta_description: 'Is your mechanical keyboard typing letters twice? Learn how to verify switch chatter online, clean oxidized copper leaves, tune firmware debounce, or hot-swap switches.',
        category: 'Switch Repair',
        reading_minutes: 5,
        content_html: `
          <h2>What Causes Mechanical Keyboard Key Chatter?</h2>
          <p>Key chatter occurs when a single physical press causes a mechanical switch's internal metal contact leaves to bounce or arc multiple times beyond your keyboard's firmware debounce window (typically 5ms). The operating system interprets those rapid electrical spikes—usually separated by <strong>4ms to 30ms</strong>—as two or three intentional keystrokes.</p>
          <h3>Step 1: Isolate the Exact Faulty Switch</h3>
          <p>Open our <a href="/chatter-analyzer">Switch Chatter Lab</a> or main <a href="/">Online Keyboard Tester</a> and type several sentences naturally, or tap suspect keys 30 times at steady rhythm. Any actuation interval below 35ms will automatically flag the offending key code.</p>
          <h3>Step 2: Compressed Air &amp; 99% Isopropyl Alcohol Flush</h3>
          <p>Dust fibers and microscopic oxidation on copper alloy contacts cause over 70% of switch bounce issues. Unplug your keyboard, pull the keycap off with a wire puller, depress the stem, and apply two drops of <strong>99% isopropyl alcohol (IPA)</strong> inside the housing. Actuate the switch rapidly 40 times and allow 15 minutes to evaporate completely.</p>
          <h3>Step 3: Increase Firmware Debounce Time (QMK / VIA / Brand Software)</h3>
          <p>Ultra-low gaming debounce settings (1ms–2ms) frequently trigger false double inputs as switches age. Raising asymmetric eager/defer debounce from 2ms to <strong>8ms–10ms</strong> eliminates chatter without perceptible input lag.</p>
          <h3>Step 4: Hot-Swap or Desolder the Defective Switch</h3>
          <p>If cleaning fails, fatigued copper leaf tension is the culprit. On hot-swap PCBs, use a switch puller to swap in a fresh Cherry MX, Gateron, or Kailh switch in under 30 seconds, then re-verify on the <a href="/">Keyboard Tester</a>.</p>
        `
      },
      {
        slug: 'nkro-vs-6kro-keyboard-ghosting-explained',
        title: 'NKRO vs. 6KRO Explained: How to Test Keyboard Ghosting & Rollover',
        excerpt: 'Understand diode matrices, USB HID boot descriptors, membrane blocking, and why gaming or stenography workflows benefit from full N-Key Rollover.',
        focus_keyword: 'nkro vs 6kro keyboard ghosting',
        meta_title: 'NKRO vs 6KRO Explained — How to Test Keyboard Ghosting Online',
        meta_description: 'Discover the difference between 2KRO membrane blocking, 6-Key Rollover (6KRO), and true N-Key Rollover (NKRO), and test simultaneous key presses online.',
        category: 'Hardware Engineering',
        reading_minutes: 4,
        content_html: `
          <h2>Ghosting vs. Jamming (Key Blocking)</h2>
          <p>True <strong>keyboard ghosting</strong> happens on un-dioded matrix circuits when holding three corners of a shared row/column rectangle completes a phantom electrical path, registering a fourth key you never touched. Modern budget membrane boards avoid phantom keys by <em>blocking</em> (jamming) the third or fourth key instead—which is why holding <code>W + Shift + Space</code> in games sometimes ignores crouch or reload.</p>
          <h2>6KRO vs. Full NKRO Over USB</h2>
          <ul>
            <li><strong>6-Key Rollover (6KRO):</strong> Standard USB HID Boot Protocol supports up to 6 regular keys plus 4 modifier keys (Ctrl, Shift, Alt, Win/Cmd) held simultaneously. Works seamlessly inside BIOS screens and KVM switches.</li>
            <li><strong>N-Key Rollover (NKRO):</strong> Uses individual switch diodes and an extended USB HID bitmap report so every key on a 104-key board can be held down at the exact same instant with zero dropped inputs.</li>
          </ul>
          <h3>How to Benchmark Your Keyboard Right Now</h3>
          <p>Visit the <a href="/">KeyPulse Keyboard Tester</a>, press both palms gently across home row keys, and watch the live <strong>Max Rollover (NKRO)</strong> counter in the top telemetry bar. If it plateaus at 6 non-modifier keys, your board is running in 6KRO mode.</p>
        `
      },
      {
        slug: 'laptop-keyboard-keys-not-working-troubleshooting',
        title: 'Laptop Keyboard Keys Not Working? Complete Hardware vs. OS Checklist',
        excerpt: 'Learn how to distinguish Windows/macOS driver filter bugs from damaged scissor-switch clips and loose ZIF ribbon cables using browser keycode diagnostics.',
        focus_keyword: 'laptop keyboard keys not working',
        meta_title: 'Laptop Keyboard Keys Not Working? Step-by-Step Diagnostic Guide',
        meta_description: 'Diagnose dead laptop keys in minutes. Tell whether non-responsive keys are caused by Filter Keys, OS layout mismatches, scissor mechanisms, or ribbon cables.',
        category: 'Laptop Diagnostics',
        reading_minutes: 5,
        content_html: `
          <h2>1. Check If Dead Keys Share a Diagonal Matrix Line</h2>
          <p>Run all rows across our <a href="/">Online Keyboard Tester</a> (select the 75% or Mac layout to match compact laptop boards). When an entire diagonal group such as <code>8, I, K, ,</code> fails together while neighboring keys work fine, one trace on the internal membrane ribbon or ZIF connector is unseated or corroded.</p>
          <h2>2. Rule Out OS Accessibility &amp; Layout Filters</h2>
          <p>Before opening hardware screws, verify that Windows <strong>Filter Keys</strong> or macOS <strong>Slow Keys / Mouse Keys</strong> (which hijack the numeric cluster around <code>U, I, O, J, K, L</code>) are turned off. Observe the live <code>event.code</code> readout on KeyPulse: if no scan code fires at all, the fault lies below the OS driver stack.</p>
          <h2>3. Inspect Scissor Clips &amp; Silicone Domes</h2>
          <p>If a single isolated laptop key feels mushy or requires heavy force, gentle debris removal around the scissor hinge with a soft nylon brush restores clean travel without snapping fragile plastic retainers.</p>
        `
      }
    ];

    const insertGuide = db.prepare(`
      INSERT INTO guides (
        slug, title, excerpt, content_html, focus_keyword,
        meta_title, meta_description, category, reading_minutes, published
      ) VALUES (
        @slug, @title, @excerpt, @content_html, @focus_keyword,
        @meta_title, @meta_description, @category, @reading_minutes, 1
      )
    `);
    for (const g of guides) insertGuide.run(g);
  }

  // 7. Seed Google AdSense Required Policy Pages (Privacy, Terms, About, Contact)
  const policyCount = db.prepare('SELECT COUNT(*) as c FROM policy_pages').get().c;
  if (policyCount === 0) {
    const policies = [
      {
        slug: 'privacy-policy',
        title: 'Privacy Policy & Advertising Cookie Disclosure',
        content_html: `
          <p><strong>Effective Date:</strong> November 2026</p>
          <h2>1. Zero Keystroke Logging Commitment</h2>
          <p>All keyboard testing, NKRO rollover detection, switch chatter timing, mouse click testing, and typing speed calculations happen <strong>100% locally inside your web browser</strong> using standard DOM KeyboardEvent and PointerEvent APIs. KeyPulse never transmits, records, or stores the characters or passwords you type into our diagnostic tools.</p>
          <h2>2. Telemetry &amp; Core Web Vitals</h2>
          <p>To keep page load speeds optimal for search users, we collect anonymous aggregate pageview counts and browser performance metrics (Largest Contentful Paint, Cumulative Layout Shift, Interaction to Next Paint) without personally identifiable keystroke data.</p>
          <h2>3. Google AdSense &amp; DoubleClick Cookie Disclosure</h2>
          <p>We partner with third-party advertising networks, including <strong>Google AdSense</strong>, to fund free hardware diagnostic tools:</p>
          <ul>
            <li>Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to this website or other websites on the internet.</li>
            <li>Google's use of advertising cookies enables it and its partners to serve ads to users based on their visit to KeyPulse and/or other sites on the Internet.</li>
            <li>Users may opt out of personalized advertising at any time using our on-site Cookie Consent controls or by visiting <a href="https://www.google.com/settings/ads" rel="noopener noreferrer" target="_blank">Google Ads Settings</a> and <a href="https://www.aboutads.info/choices/" rel="noopener noreferrer" target="_blank">aboutads.info</a>.</li>
          </ul>
          <h2>4. GDPR &amp; CCPA Privacy Rights</h2>
          <p>Visitors in the EEA, UK, and California can manage advertising consent preferences directly via the Privacy &amp; Cookie Consent banner in the footer or contact us via our <a href="/contact">Contact Page</a>.</p>
        `
      },
      {
        slug: 'terms',
        title: 'Terms of Service',
        content_html: `
          <p><strong>Last Updated:</strong> November 2026</p>
          <h2>1. Diagnostic Utility Purpose</h2>
          <p>KeyPulse provides browser-based input diagnostic utilities ("as-is") for testing computer keyboards, mechanical switches, mice, and typing performance. Browser security sandboxes prevent web pages from intercepting certain OS-reserved combinations (such as <code>Ctrl+Alt+Del</code>, hardware <code>Fn</code> layers, or power buttons).</p>
          <h2>2. Acceptable Use</h2>
          <p>Automated scraping that degrades service availability or fraudulent interaction with sponsored advertisements is strictly prohibited.</p>
          <h2>3. Hardware Disclaimer</h2>
          <p>Repair guides are provided for educational reference. Always disconnect USB/battery power before cleaning switches or reseating laptop cables.</p>
        `
      },
      {
        slug: 'about',
        title: 'About KeyPulse Hardware Diagnostics',
        content_html: `
          <h2>Precision Browser-Native Peripheral Testing</h2>
          <p>KeyPulse was engineered for mechanical keyboard builders, laptop repair technicians, competitive gamers, and everyday computer users who need an instant, zero-install way to verify peripheral health right inside any modern browser.</p>
          <h2>Engineering Principles Behind KeyPulse</h2>
          <ul>
            <li><strong>Multi-Form-Factor Scan-Code Accuracy:</strong> Switch seamlessly between 104-key ANSI, 105-key European ISO, Apple Mac Magic Keyboard, Tenkeyless (TKL), 75% laptop/enthusiast, and 60% compact layouts using hardware <code>KeyboardEvent.code</code> identifiers.</li>
            <li><strong>Sub-Millisecond Switch Chatter Detection:</strong> Built-in high-resolution <code>performance.now()</code> timers catch oxidized copper contact bounce and microswitch double-click wear before intermittent typos disrupt work or gaming sessions.</li>
            <li><strong>Strict Browser-Local Privacy:</strong> Every keystroke, rollover test, and typing cadence stays inside volatile browser memory—never transmitted or logged on remote servers.</li>
          </ul>
          <h2>Continuous Expansion &amp; Open Standards</h2>
          <p>Alongside our core <a href="/">Online Keyboard Tester</a>, KeyPulse offers a <a href="/typing-test">Typing Speed WPM Benchmark</a>, <a href="/mouse-cps-test">Mouse &amp; CPS Tester</a>, <a href="/chatter-analyzer">Switch Chatter Lab</a>, and <a href="/guides">Hardware Troubleshooting Guides</a>.</p>
        `
      },
      {
        slug: 'contact',
        title: 'Contact KeyPulse',
        content_html: `
          <h2>Hardware Feedback, Layout Requests &amp; Support</h2>
          <p>Have a suggestion for a regional keyboard layout, spotted a browser scan-code quirk on Linux, macOS, or ChromeOS, or need clarity on one of our <a href="/guides">mechanical switch repair guides</a>? Send a message directly to the KeyPulse engineering inbox using the form below.</p>
          <h2>Advertising, Sponsorships &amp; Privacy Inquiries</h2>
          <p>For direct peripheral brand sponsorships, custom diagnostic integrations, or GDPR/CCPA privacy inquiries regarding our <a href="/privacy-policy">Privacy &amp; Cookie Policy</a>, select the matching topic below and our team will respond promptly.</p>
        `
      }
    ];
    const insertPolicy = db.prepare(`
      INSERT INTO policy_pages (slug, title, content_html)
      VALUES (@slug, @title, @content_html)
    `);
    for (const p of policies) insertPolicy.run(p);
  }

  // 8. Seed Foreign / External API Connectors Registry (for current & future expansion)
  const apiCount = db.prepare('SELECT COUNT(*) as c FROM external_apis').get().c;
  if (apiCount === 0) {
    const apis = [
      {
        api_key_slug: 'github_code_corpus',
        name: 'GitHub Public Snippet & Release Corpus API',
        provider: 'api.github.com',
        endpoint_url: 'https://api.github.com/repos/nodejs/node/readme',
        auth_key: '',
        enabled: 1,
        description: 'Fetches live open-source developer documentation/code excerpts from GitHub API for Programmer Typing Speed Test mode (with instant offline fallback).'
      },
      {
        api_key_slug: 'indexnow_search_ping',
        name: 'IndexNow Instant Search Engine Indexing API',
        provider: 'Bing / Yandex / IndexNow',
        endpoint_url: 'https://api.indexnow.org/indexnow',
        auth_key: indexNowKey,
        enabled: 1,
        description: 'Notifies participating search engines immediately whenever SEO metadata or new Hardware Guides are published.'
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
        name: 'Mechanical Switch Force-Curve & Spec Feed',
        provider: 'GitHub Raw / Custom Webhook',
        endpoint_url: 'https://api.github.com/repos/Retropolis009/KeyboardTester',
        auth_key: '',
        enabled: 1,
        description: 'Extensible external data feed hook for future mechanical switch comparison & affiliate price modules.'
      }
    ];
    const insertApi = db.prepare(`
      INSERT INTO external_apis (api_key_slug, name, provider, endpoint_url, auth_key, enabled, description)
      VALUES (@api_key_slug, @name, @provider, @endpoint_url, @auth_key, @enabled, @description)
    `);
    for (const a of apis) insertApi.run(a);
  }
}

initSchema();
seedDefaults();

module.exports = {
  db,
  getSetting,
  setSetting,
  getAllSettings
};
