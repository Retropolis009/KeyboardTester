const fs = require('node:fs');
const path = require('node:path');
const { db, getAllSettings } = require('./db');

const VIEWS_DIR = path.join(__dirname, '..', 'public', 'views');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveBaseUrl(req, settings) {
  const configured = (settings.site_base_url || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (!req) return 'http://localhost:3000';
  const proto = req.headers['x-forwarded-proto']
    ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
    : (req.protocol || 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function detectSearchBot(userAgent = '') {
  const ua = String(userAgent);
  const bots = [
    { pattern: /Googlebot/i, name: 'Googlebot' },
    { pattern: /AdsBot-Google|Mediapartners-Google/i, name: 'Mediapartners-Google (AdSense)' },
    { pattern: /bingbot/i, name: 'Bingbot' },
    { pattern: /DuckDuckBot/i, name: 'DuckDuckBot' },
    { pattern: /YandexBot/i, name: 'YandexBot' },
    { pattern: /Baiduspider/i, name: 'Baiduspider' },
    { pattern: /Applebot/i, name: 'Applebot' },
    { pattern: /AhrefsBot/i, name: 'AhrefsBot' },
    { pattern: /SemrushBot/i, name: 'SemrushBot' }
  ];
  for (const b of bots) {
    if (b.pattern.test(ua)) return b.name;
  }
  return null;
}

function renderAdSlot(slotKey, settings, slotsMap) {
  if (settings.adsense_enabled !== 'true') return '';
  const slot = slotsMap[slotKey];
  if (!slot || !slot.enabled) return '';

  const pubId = (settings.adsense_publisher_id || 'ca-pub-0000000000000000').trim();
  const isTestMode = settings.adsense_test_mode === 'true' || slot.mode === 'placeholder' || pubId === 'ca-pub-0000000000000000';
  const minH = Math.max(50, Number(slot.min_height_px) || 90);

  let innerHtml = '';
  if (slot.mode === 'custom_html' && slot.custom_html.trim()) {
    innerHtml = `<div class="ad-custom-payload">${slot.custom_html}</div>`;
  } else if (!isTestMode && slot.mode === 'adsense') {
    innerHtml = `
      <ins class="adsbygoogle"
           style="display:block;min-height:${minH}px"
           data-ad-client="${escapeHtml(pubId)}"
           data-ad-slot="${escapeHtml(slot.ad_unit_id || '')}"
           data-ad-format="${escapeHtml(slot.ad_format || 'auto')}"
           data-full-width-responsive="true"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
    `;
  } else {
    innerHtml = `
      <div class="ad-preview-box" style="min-height:${minH}px">
        <div class="ad-preview-badge">AdSense Unit Slot [${escapeHtml(slot.slot_key)}] &mdash; CLS Height Reserved (${minH}px)</div>
        <div class="ad-preview-meta">
          Unit ID: <code>${escapeHtml(slot.ad_unit_id || 'pending')}</code> &middot; Format: <code>${escapeHtml(slot.ad_format || 'auto')}</code>
        </div>
      </div>
    `;
  }

  return `
    <aside class="ad-slot-wrapper" data-ad-slot-key="${escapeHtml(slot.slot_key)}" style="min-height:${minH + 22}px" aria-label="Advertisement">
      <div class="ad-disclosure-label">Sponsored / Advertisement</div>
      ${innerHtml}
    </aside>
  `;
}

function renderFaqSection(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return '';
  const items = faqs.map((item) => `
    <details class="faq-item">
      <summary class="faq-question">${escapeHtml(item.q)}</summary>
      <div class="faq-answer"><p>${escapeHtml(item.a)}</p></div>
    </details>
  `).join('\n');

  return `
    <section class="seo-faq-section" id="faq" aria-labelledby="faq-heading">
      <h2 id="faq-heading">Technical FAQ</h2>
      <div class="faq-list">
        ${items}
      </div>
    </section>
  `;
}

function buildSidebarHtml(currentPath, settings) {
  const siteName = settings.site_name || 'KeyPulse';
  const modules = db.prepare(`
    SELECT module_key, name, route_path
    FROM feature_modules
    WHERE enabled = 1
    ORDER BY nav_order ASC
  `).all();

  const linksHtml = modules.map((m) => {
    const active = currentPath === m.route_path || (m.route_path !== '/' && currentPath.startsWith(m.route_path));
    return `<li><a href="${escapeHtml(m.route_path)}" class="side-link${active ? ' active' : ''}">${escapeHtml(m.name)}</a></li>`;
  }).join('\n          ');

  const infoRoutes = [
    { path: '/about', label: 'About Bench' },
    { path: '/contact', label: 'Contact' },
    { path: '/privacy-policy', label: 'Privacy Policy' },
    { path: '/terms', label: 'Terms of Use' }
  ];
  const infoHtml = infoRoutes.map((r) => {
    const active = currentPath === r.path;
    return `<li><a href="${r.path}" class="side-link side-link-sub${active ? ' active' : ''}">${r.label}</a></li>`;
  }).join('\n          ');

  return `
  <aside class="app-sidebar" aria-label="Hardware Diagnostic Tools">
    <div class="sidebar-top">
      <div class="sidebar-brand-row">
        <a href="/" class="brand-mark" aria-label="${escapeHtml(siteName)} Home">
          <span class="brand-glyph">KP</span>
          <span class="brand-text">${escapeHtml(siteName)}</span>
        </a>
        <button type="button" id="btn-mobile-menu" class="mobile-menu-btn" aria-label="Toggle Menu">Menu</button>
      </div>
      <div class="sidebar-subline">Hardware Diagnostic Bench</div>
    </div>

    <div class="sidebar-body" id="sidebar-collapsible">
      <div class="sidebar-group">
        <div class="sidebar-group-title">Diagnostics &amp; Tests</div>
        <ul class="sidebar-list">
          ${linksHtml}
        </ul>
      </div>

      <div class="sidebar-group">
        <div class="sidebar-group-title">Reference &amp; Legal</div>
        <ul class="sidebar-list">
          ${infoHtml}
        </ul>
      </div>

      <div class="sidebar-footer-controls">
        <button type="button" id="btn-theme-toggle" class="util-btn">Switch to Light</button>
        <a href="#" id="btn-reopen-consent" class="cookie-link">Cookie Settings</a>
      </div>
    </div>
  </aside>`;
}

function buildFooterHtml(settings) {
  const siteName = settings.site_name || 'KeyPulse';
  return `
  <footer class="site-footer">
    <div class="footer-columns">
      <div>
        <strong>${escapeHtml(siteName)} Hardware Bench</strong>
        <p>Local browser-executed diagnostics for keyboards, mechanical switches, mice, controllers, monitors, microphones, speakers, and webcams. Zero hardware input leaves your device.</p>
      </div>
      <div>
        <strong>Input &amp; Controller Tools</strong>
        <ul>
          <li><a href="/">Online Keyboard Tester</a></li>
          <li><a href="/chatter-analyzer">Switch Chatter Analyzer</a></li>
          <li><a href="/mouse-cps-test">Mouse Polling Hz &amp; CPS</a></li>
          <li><a href="/gamepad-test">Gamepad &amp; Stick Drift Test</a></li>
        </ul>
      </div>
      <div>
        <strong>Display, Media &amp; Speed</strong>
        <ul>
          <li><a href="/display-test">Monitor Dead Pixel &amp; Hz Test</a></li>
          <li><a href="/audio-video-test">Mic, Speaker &amp; Webcam Test</a></li>
          <li><a href="/typing-test">Typing Speed (WPM)</a></li>
          <li><a href="/guides">Hardware Repair Guides</a></li>
        </ul>
      </div>
      <div>
        <strong>Site &amp; Compliance</strong>
        <ul>
          <li><a href="/about">About</a></li>
          <li><a href="/contact">Contact</a></li>
          <li><a href="/privacy-policy">Privacy &amp; Cookies</a></li>
          <li><a href="/terms">Terms of Service</a></li>
          <li><a href="/sitemap.xml">XML Sitemap</a> &middot; <a href="/ads.txt">ads.txt</a></li>
        </ul>
      </div>
    </div>
  </footer>`;
}

function buildSeoHead({ seoPage, settings, baseUrl, routePath, extraSchema = null }) {
  const siteName = settings.site_name || 'KeyPulse';
  const fullTitle = seoPage.title || `${siteName} — Online Keyboard Tester`;
  const desc = seoPage.meta_description || settings.site_tagline || '';
  const canonical = (seoPage.canonical_override || '').trim() || `${baseUrl}${routePath === '/' ? '/' : routePath}`;
  const ogTitle = (seoPage.og_title || '').trim() || fullTitle;
  const ogDesc = (seoPage.og_description || '').trim() || desc;
  const ogImgRaw = (seoPage.og_image || settings.default_og_image || '/og-banner.svg').trim();
  const ogImage = ogImgRaw.startsWith('http') ? ogImgRaw : `${baseUrl}${ogImgRaw}`;
  const keywords = [seoPage.focus_keyword, seoPage.secondary_keywords].filter(Boolean).join(', ');
  const robots = seoPage.robots_directive || 'index, follow';

  let faqs = [];
  try {
    faqs = JSON.parse(seoPage.faq_json || '[]');
  } catch (_) {
    faqs = [];
  }

  const graph = [];
  try {
    if (settings.organization_schema_json) {
      const org = JSON.parse(settings.organization_schema_json);
      org.url = baseUrl;
      graph.push(org);
    }
  } catch (_) {}

  const crumbs = [
    {
      '@type': 'ListItem',
      position: 1,
      name: siteName,
      item: `${baseUrl}/`
    }
  ];
  if (routePath !== '/') {
    crumbs.push({
      '@type': 'ListItem',
      position: 2,
      name: seoPage.page_name || fullTitle,
      item: canonical
    });
  }
  graph.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs
  });

  if (extraSchema) {
    graph.push(extraSchema);
  } else if (seoPage.schema_type === 'WebApplication') {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: fullTitle,
      url: canonical,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Windows, macOS, Linux, ChromeOS, iOS, Android',
      browserRequirements: 'HTML5',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD'
      },
      description: desc
    });
  } else {
    graph.push({
      '@context': 'https://schema.org',
      '@type': seoPage.schema_type || 'WebPage',
      name: fullTitle,
      url: canonical,
      description: desc
    });
  }

  if (Array.isArray(faqs) && faqs.length > 0) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a
        }
      }))
    });
  }

  const verifications = [];
  if (settings.google_site_verification) {
    verifications.push(`<meta name="google-site-verification" content="${escapeHtml(settings.google_site_verification)}">`);
  }
  if (settings.bing_site_verification) {
    verifications.push(`<meta name="msvalidate.01" content="${escapeHtml(settings.bing_site_verification)}">`);
  }
  if (settings.yandex_verification) {
    verifications.push(`<meta name="yandex-verification" content="${escapeHtml(settings.yandex_verification)}">`);
  }

  const scripts = [];
  if (settings.consent_banner_enabled === 'true') {
    scripts.push(`
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    (function(){
      var saved = null;
      try { saved = localStorage.getItem('kp_cookie_consent'); } catch(e){}
      var state = saved === 'granted' ? 'granted' : 'denied';
      gtag('consent', 'default', {
        'ad_storage': state,
        'ad_user_data': state,
        'ad_personalization': state,
        'analytics_storage': state,
        'wait_for_update': 500
      });
    })();
  </script>`);
  }

  if (settings.ga4_measurement_id) {
    const gaId = escapeHtml(settings.ga4_measurement_id.trim());
    scripts.push(`
  <script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaId}');
  </script>`);
  }

  const pubId = (settings.adsense_publisher_id || '').trim();
  const liveAdsense = settings.adsense_enabled === 'true'
    && settings.adsense_test_mode !== 'true'
    && pubId
    && pubId !== 'ca-pub-0000000000000000';

  if (liveAdsense) {
    scripts.push(`
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeHtml(pubId)}" crossorigin="anonymous"></script>`);
  }

  return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
  <meta name="robots" content="${escapeHtml(robots)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="en" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="${seoPage.schema_type === 'Article' ? 'article' : 'website'}">
  <meta property="og:site_name" content="${escapeHtml(siteName)}">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDesc)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDesc)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <meta name="theme-color" content="#141619">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  ${verifications.join('\n  ')}
  <link rel="stylesheet" href="/css/main.css">
  <script type="application/ld+json">${JSON.stringify(graph)}</script>
  ${scripts.join('\n')}
  ${seoPage.custom_head_html || ''}
`;
}

function renderTemplatePage({ viewFile, routePath, req, seoOverride = null, replacements = {}, extraSchema = null }) {
  const rawHtml = fs.readFileSync(path.join(VIEWS_DIR, viewFile), 'utf8');
  const settings = getAllSettings();
  const baseUrl = resolveBaseUrl(req, settings);

  const dbSeo = db.prepare('SELECT * FROM seo_pages WHERE route_path = ?').get(routePath);
  const seoPage = seoOverride || dbSeo || {
    route_path: routePath,
    page_name: settings.site_name || 'KeyPulse',
    title: `${settings.site_name || 'KeyPulse'} — ${settings.site_tagline || ''}`,
    meta_description: settings.site_tagline || '',
    focus_keyword: 'keyboard tester',
    secondary_keywords: '',
    robots_directive: 'index, follow',
    schema_type: 'WebPage',
    faq_json: '[]'
  };

  let faqs = [];
  try {
    faqs = JSON.parse(seoPage.faq_json || '[]');
  } catch (_) {
    faqs = [];
  }

  const allSlots = db.prepare('SELECT * FROM ad_slots').all();
  const slotsMap = {};
  for (const s of allSlots) slotsMap[s.slot_key] = s;

  const headHtml = buildSeoHead({ seoPage, settings, baseUrl, routePath, extraSchema });
  const sidebarHtml = buildSidebarHtml(routePath, settings);
  const footerHtml = buildFooterHtml(settings);
  const faqHtml = renderFaqSection(faqs);

  const consentBannerHtml = settings.consent_banner_enabled === 'true' ? `
    <div id="cookie-consent-banner" class="consent-banner hidden" role="dialog" aria-label="Cookie and Advertising Consent">
      <div class="consent-inner">
        <div class="consent-copy">
          <strong>Cookie &amp; AdSense Preferences:</strong>
          <span>Hardware diagnostics run 100% locally. Cookies are used for aggregate Core Web Vitals and Google AdSense. See <a href="/privacy-policy">Privacy Policy</a>.</span>
        </div>
        <div class="consent-actions">
          <button type="button" id="btn-consent-decline" class="btn">Essential Only</button>
          <button type="button" id="btn-consent-accept" class="btn btn-primary">Accept</button>
        </div>
      </div>
    </div>
  ` : '';

  const adblockNoticeFlag = settings.adblock_notice_enabled === 'true' ? 'data-adblock-notice="true"' : '';

  let html = rawHtml
    .replace('<!--SEO_HEAD-->', headHtml)
    .replace('<!--SIDEBAR_SHELL-->', sidebarHtml)
    .replace('<!--SITE_FOOTER-->', footerHtml)
    .replace('<!--SEO_FAQ_SECTION-->', faqHtml)
    .replace('<!--CONSENT_BANNER-->', consentBannerHtml)
    .replace('<!--BODY_ATTRS-->', adblockNoticeFlag);

  html = html.replace(/<!--AD_SLOT:([a-zA-Z0-9_]+)-->/g, (_, slotKey) => {
    return renderAdSlot(slotKey, settings, slotsMap);
  });

  for (const [placeholder, val] of Object.entries(replacements)) {
    html = html.split(placeholder).join(val);
  }

  return html;
}

function auditHtmlContent({ html, routePath, focusKeyword = '', title = '', metaDescription = '' }) {
  const checks = [];
  let earnedPoints = 0;
  let totalPoints = 0;

  function addCheck(id, label, passed, weight, detail, fixHint = '') {
    totalPoints += weight;
    if (passed) earnedPoints += weight;
    checks.push({ id, label, passed, weight, detail, fixHint });
  }

  const plainBody = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = plainBody ? plainBody.split(/\s+/) : [];
  const wordCount = words.length;
  const kw = (focusKeyword || '').trim().toLowerCase();

  const titleLen = title.trim().length;
  const approxTitlePx = Math.round(titleLen * 9.2);
  addCheck(
    'title_length',
    'Title Tag SERP Length (40–68 chars)',
    titleLen >= 40 && titleLen <= 68,
    10,
    `${titleLen} chars (~${approxTitlePx}px est.)`,
    'Keep title between 45 and 65 characters so Google does not truncate it.'
  );

  if (kw) {
    addCheck(
      'kw_in_title',
      'Focus Keyword Present in <title>',
      title.toLowerCase().includes(kw),
      10,
      title.toLowerCase().includes(kw) ? `"${focusKeyword}" found in title` : `"${focusKeyword}" missing from title`,
      'Front-load your target search keyword near the beginning of the title tag.'
    );
  }

  const descLen = metaDescription.trim().length;
  addCheck(
    'meta_desc_length',
    'Meta Description Length (115–168 chars)',
    descLen >= 115 && descLen <= 168,
    9,
    `${descLen} characters`,
    'Write an actionable 120–160 character description to maximize SERP CTR.'
  );

  if (kw) {
    addCheck(
      'kw_in_desc',
      'Focus Keyword in Meta Description',
      metaDescription.toLowerCase().includes(kw),
      7,
      metaDescription.toLowerCase().includes(kw) ? 'Matched (bolded in Google snippet)' : 'Keyword not found in meta description',
      'Include the primary keyword naturally in the meta description.'
    );
  }

  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim()
  );
  addCheck(
    'single_h1',
    'Single Semantic <h1> Heading',
    h1Matches.length === 1 && h1Matches[0].length > 5,
    10,
    h1Matches.length === 1 ? `H1: "${h1Matches[0]}"` : `Found ${h1Matches.length} <h1> tags`,
    'Ensure every indexable landing page has exactly one clear H1 heading.'
  );

  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim()
  );
  if (kw) {
    const headingsCombined = [...h1Matches, ...h2Matches].join(' ').toLowerCase();
    addCheck(
      'kw_in_headings',
      'Focus Keyword in H1/H2 Headings',
      headingsCombined.includes(kw),
      8,
      headingsCombined.includes(kw) ? 'Present in primary headings' : 'Missing in H1/H2 headings',
      'Place the target keyword or close phrase inside your H1 or top H2 subheading.'
    );
  }

  addCheck(
    'h2_structure',
    'Rich Subheading Structure (2+ H2 sections)',
    h2Matches.length >= 2,
    6,
    `${h2Matches.length} <h2> sections found`,
    'Break diagnostic tools and guides into scannable H2/H3 topical sections.'
  );

  addCheck(
    'word_count',
    'Indexable Semantic Copy Depth (250+ words)',
    wordCount >= 250,
    9,
    `${wordCount} indexable words`,
    'Pair interactive tools with helpful troubleshooting copy and FAQs.'
  );

  const hasCanonical = /<link\s+rel=["']canonical["']\s+href=["'][^"']+["']/i.test(html);
  addCheck(
    'canonical_tag',
    'Self-Referencing Canonical Tag',
    hasCanonical,
    7,
    hasCanonical ? 'Valid <link rel="canonical"> present' : 'Missing canonical tag',
    'Always specify a canonical URL to prevent duplicate query-string indexing dilution.'
  );

  const ldMatches = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  const validSchemaTypes = [];
  for (const m of ldMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const it of items) {
        if (it && it['@type']) validSchemaTypes.push(it['@type']);
      }
    } catch (_) {}
  }
  addCheck(
    'json_ld_schema',
    'Valid Schema.org JSON-LD Rich Snippets',
    validSchemaTypes.length > 0,
    9,
    validSchemaTypes.length > 0 ? `Schemas: ${validSchemaTypes.join(', ')}` : 'No valid JSON-LD schema found',
    'Add WebApplication, BreadcrumbList, and FAQPage JSON-LD.'
  );

  const hasOg = /property=["']og:title["']/i.test(html) && /property=["']og:description["']/i.test(html) && /name=["']twitter:card["']/i.test(html);
  addCheck(
    'social_meta',
    'Open Graph & Twitter Card Metadata',
    hasOg,
    5,
    hasOg ? 'Complete OG + Twitter tags' : 'Incomplete social metadata',
    'Configure Open Graph title, description, and image.'
  );

  const hrefs = [...html.matchAll(/<a\s+[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const internalLinks = hrefs.filter((h) => h.startsWith('/'));
  addCheck(
    'internal_links',
    'Internal Crawl Link Graph (4+ internal links)',
    internalLinks.length >= 4,
    5,
    `${internalLinks.length} internal crawlable links`,
    'Cross-link related diagnostic tools and hardware guides.'
  );

  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const missingAlt = imgTags.filter((tag) => !/\balt=["'][^"']*["']/i.test(tag));
  addCheck(
    'img_alt',
    'Image Alt Text Accessibility',
    missingAlt.length === 0,
    3,
    imgTags.length === 0 ? 'All vector SVG / 0 missing alts' : `${imgTags.length - missingAlt.length}/${imgTags.length} images have alt attributes`,
    'Ensure every <img> element includes descriptive alt text.'
  );

  const adWrappers = [...html.matchAll(/class=["'][^"']*ad-slot-wrapper[^"']*["'][^>]*style=["'][^"']*min-height:/gi)];
  const rawAdWrappers = [...html.matchAll(/class=["'][^"']*ad-slot-wrapper/gi)];
  addCheck(
    'cls_shield',
    'Core Web Vitals AdSense CLS Height Shield',
    rawAdWrappers.length === adWrappers.length,
    2,
    `${adWrappers.length} ad containers protected with explicit min-height`,
    'Reserve minimum heights on all ad slots to keep CLS near 0.00.'
  );

  let keywordOccurrences = 0;
  if (kw) {
    const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = plainBody.toLowerCase().match(new RegExp(escapedKw, 'g'));
    keywordOccurrences = matches ? matches.length : 0;
  }
  const keywordDensity = wordCount > 0 ? Number(((keywordOccurrences * (kw.split(/\s+/).length || 1)) / wordCount * 100).toFixed(2)) : 0;

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 100;

  return {
    routePath,
    score,
    wordCount,
    focusKeyword,
    keywordOccurrences,
    keywordDensity,
    headings: {
      h1: h1Matches,
      h2: h2Matches
    },
    schemaTypes: validSchemaTypes,
    internalLinkCount: internalLinks.length,
    approxTitlePixels: approxTitlePx,
    checks
  };
}

function generateSitemapXml(baseUrl) {
  const pages = db.prepare(`
    SELECT route_path, sitemap_priority, sitemap_changefreq, updated_at
    FROM seo_pages
    WHERE include_in_sitemap = 1
      AND robots_directive NOT LIKE '%noindex%'
    ORDER BY sitemap_priority DESC
  `).all();

  const guides = db.prepare(`
    SELECT slug, updated_at
    FROM guides
    WHERE published = 1
    ORDER BY updated_at DESC
  `).all();

  const urls = [];

  for (const p of pages) {
    const loc = `${baseUrl}${p.route_path === '/' ? '/' : p.route_path}`;
    const lastmod = (p.updated_at || new Date().toISOString()).slice(0, 10);
    urls.push(`  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${escapeHtml(lastmod)}</lastmod>
    <changefreq>${escapeHtml(p.sitemap_changefreq || 'weekly')}</changefreq>
    <priority>${Number(p.sitemap_priority || 0.8).toFixed(1)}</priority>
  </url>`);
  }

  for (const g of guides) {
    const loc = `${baseUrl}/guides/${encodeURIComponent(g.slug)}`;
    const lastmod = (g.updated_at || new Date().toISOString()).slice(0, 10);
    urls.push(`  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${escapeHtml(lastmod)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}

module.exports = {
  escapeHtml,
  resolveBaseUrl,
  detectSearchBot,
  renderTemplatePage,
  auditHtmlContent,
  generateSitemapXml
};
