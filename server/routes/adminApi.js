const express = require('express');
const { db, getAllSettings, setSetting } = require('../db');
const {
  getClientIp,
  checkRateLimit,
  recordAuthAttempt,
  createAdminSession,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  requireAdminAuth,
  hashPassword,
  verifyPassword
} = require('../auth');
const { renderTemplatePage, auditHtmlContent, resolveBaseUrl, escapeHtml } = require('../seoEngine');

const router = express.Router();

const ROUTE_VIEW_MAP = {
  '/': 'index.html',
  '/typing-test': 'typing-test.html',
  '/mouse-cps-test': 'mouse-cps-test.html',
  '/chatter-analyzer': 'chatter-test.html',
  '/guides': 'guides.html',
  '/about': 'policy.html',
  '/contact': 'policy.html',
  '/privacy-policy': 'policy.html',
  '/terms': 'policy.html'
};

function renderRouteForAudit(routePath, req) {
  const viewFile = ROUTE_VIEW_MAP[routePath] || 'index.html';
  const replacements = {};
  if (viewFile === 'guides.html') {
    const guides = db.prepare('SELECT * FROM guides WHERE published = 1 ORDER BY created_at DESC').all();
    replacements['<!--GUIDES_LIST_HTML-->'] = guides.map((g) => `<article><h2><a href="/guides/${escapeHtml(g.slug)}">${escapeHtml(g.title)}</a></h2><p>${escapeHtml(g.excerpt)}</p></article>`).join('\n');
  } else if (viewFile === 'policy.html') {
    const slug = routePath.replace(/^\//, '');
    const pol = db.prepare('SELECT * FROM policy_pages WHERE slug = ?').get(slug);
    replacements['<!--POLICY_TITLE-->'] = escapeHtml(pol ? pol.title : slug);
    replacements['<!--POLICY_CONTENT_HTML-->'] = pol ? pol.content_html : '';
    replacements['<!--CONTACT_FORM_SECTION-->'] = '';
  }
  return renderTemplatePage({ viewFile, routePath, req, replacements });
}

// ---------------- AUTHENTICATION ----------------

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const limit = checkRateLimit(ip, username);
  if (limit.locked) {
    recordAuthAttempt({
      username,
      ip,
      userAgent,
      success: false,
      reason: 'Rate limit lockout active'
    });
    return res.status(429).json({
      error: `Too many failed login attempts. Account locked for ${limit.windowMinutes} minutes for security.`
    });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(String(username).trim());
  if (!admin || !verifyPassword(password, admin.salt, admin.password_hash)) {
    recordAuthAttempt({
      username,
      ip,
      userAgent,
      success: false,
      reason: 'Invalid username or password'
    });
    const remaining = Math.max(0, limit.maxAttempts - (limit.failedAttempts + 1));
    return res.status(401).json({
      error: `Invalid credentials. ${remaining} attempt(s) remaining before temporary lockout.`
    });
  }

  recordAuthAttempt({
    username: admin.username,
    ip,
    userAgent,
    success: true,
    reason: 'Authenticated successfully'
  });

  const { rawToken, csrfToken } = createAdminSession(admin.id, req);
  setSessionCookie(res, rawToken, req);

  res.json({
    ok: true,
    csrfToken,
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role
    }
  });
});

router.post('/logout', (req, res) => {
  const session = getSessionFromRequest(req);
  if (session) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.token_hash);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    csrfToken: session.csrf_token,
    admin: {
      id: session.admin_id,
      username: session.username,
      email: session.email,
      role: session.role,
      lastLoginAt: session.last_login_at
    }
  });
});

// All endpoints below require authenticated session + valid CSRF token on writes
router.use(requireAdminAuth);

// ---------------- DASHBOARD TELEMETRY ----------------

router.get('/dashboard', (req, res) => {
  const totalPageviews = db.prepare(`SELECT COUNT(*) as c FROM analytics_events WHERE event_type = 'pageview'`).get().c;
  const botCrawls = db.prepare(`
    SELECT bot_name, COUNT(*) as hits, MAX(created_at) as last_seen
    FROM analytics_events
    WHERE event_type = 'bot_crawl' AND bot_name IS NOT NULL
    GROUP BY bot_name
    ORDER BY hits DESC
  `).all();

  const topRoutes = db.prepare(`
    SELECT route_path, COUNT(*) as views
    FROM analytics_events
    WHERE event_type = 'pageview'
    GROUP BY route_path
    ORDER BY views DESC
    LIMIT 8
  `).all();

  const cwvRows = db.prepare(`
    SELECT metric_name, ROUND(AVG(metric_value), 3) as avg_val, COUNT(*) as samples
    FROM analytics_events
    WHERE event_type = 'cwv'
    GROUP BY metric_name
  `).all();

  const adSlots = db.prepare('SELECT slot_key, name, enabled, mode, impressions, clicks FROM ad_slots').all();
  const totalImpressions = adSlots.reduce((acc, s) => acc + (s.impressions || 0), 0);
  const totalClicks = adSlots.reduce((acc, s) => acc + (s.clicks || 0), 0);

  // Compute live SEO health across core pages
  const seoPages = db.prepare('SELECT * FROM seo_pages ORDER BY sitemap_priority DESC').all();
  const pageScores = seoPages.map((p) => {
    const html = renderRouteForAudit(p.route_path, req);
    const audit = auditHtmlContent({
      html,
      routePath: p.route_path,
      focusKeyword: p.focus_keyword,
      title: p.title,
      metaDescription: p.meta_description
    });
    return {
      route_path: p.route_path,
      page_name: p.page_name,
      score: audit.score,
      focus_keyword: p.focus_keyword,
      wordCount: audit.wordCount
    };
  });

  const avgSeoScore = pageScores.length
    ? Math.round(pageScores.reduce((s, p) => s + p.score, 0) / pageScores.length)
    : 100;

  const unreadMessages = db.prepare('SELECT COUNT(*) as c FROM contact_messages WHERE is_read = 0').get().c;
  const guideCount = db.prepare('SELECT COUNT(*) as c FROM guides WHERE published = 1').get().c;

  res.json({
    kpis: {
      totalPageviews,
      avgSeoScore,
      totalBotHits: botCrawls.reduce((s, b) => s + b.hits, 0),
      totalImpressions,
      totalClicks,
      ctrPercent: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
      unreadMessages,
      publishedGuides: guideCount
    },
    pageScores,
    botCrawls,
    topRoutes,
    coreWebVitals: cwvRows,
    adSlots
  });
});

// ---------------- HEAVY SEO SUITE ----------------

router.get('/seo/pages', (req, res) => {
  const pages = db.prepare('SELECT * FROM seo_pages ORDER BY sitemap_priority DESC, route_path ASC').all();
  const enriched = pages.map((p) => {
    const html = renderRouteForAudit(p.route_path, req);
    const audit = auditHtmlContent({
      html,
      routePath: p.route_path,
      focusKeyword: p.focus_keyword,
      title: p.title,
      metaDescription: p.meta_description
    });
    return { ...p, auditScore: audit.score, wordCount: audit.wordCount };
  });
  res.json({ pages: enriched });
});

router.get('/seo/audit', (req, res) => {
  const routePath = String(req.query.path || '/');
  const page = db.prepare('SELECT * FROM seo_pages WHERE route_path = ?').get(routePath);
  if (!page) {
    return res.status(404).json({ error: 'Route not found in SEO registry.' });
  }
  const html = renderRouteForAudit(routePath, req);
  const audit = auditHtmlContent({
    html,
    routePath,
    focusKeyword: page.focus_keyword,
    title: page.title,
    metaDescription: page.meta_description
  });
  const settings = getAllSettings();
  const baseUrl = resolveBaseUrl(req, settings);
  res.json({
    page,
    baseUrl,
    audit
  });
});

router.post('/seo/pages', (req, res) => {
  const b = req.body || {};
  if (!b.route_path || !b.title || !b.meta_description) {
    return res.status(400).json({ error: 'Route path, title, and meta description are required.' });
  }

  // Validate FAQ JSON
  let faqJsonStr = '[]';
  if (Array.isArray(b.faq_json)) {
    faqJsonStr = JSON.stringify(b.faq_json);
  } else if (typeof b.faq_json === 'string' && b.faq_json.trim()) {
    try {
      const parsed = JSON.parse(b.faq_json);
      if (!Array.isArray(parsed)) throw new Error('FAQ must be an array');
      faqJsonStr = JSON.stringify(parsed);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid FAQ JSON array format.' });
    }
  }

  db.prepare(`
    INSERT INTO seo_pages (
      route_path, page_name, title, meta_description, focus_keyword, secondary_keywords,
      canonical_override, robots_directive, og_title, og_description, og_image,
      schema_type, faq_json, custom_head_html, sitemap_priority, sitemap_changefreq,
      include_in_sitemap, updated_at
    ) VALUES (
      @route_path, @page_name, @title, @meta_description, @focus_keyword, @secondary_keywords,
      @canonical_override, @robots_directive, @og_title, @og_description, @og_image,
      @schema_type, @faq_json, @custom_head_html, @sitemap_priority, @sitemap_changefreq,
      @include_in_sitemap, datetime('now')
    )
    ON CONFLICT(route_path) DO UPDATE SET
      page_name = excluded.page_name,
      title = excluded.title,
      meta_description = excluded.meta_description,
      focus_keyword = excluded.focus_keyword,
      secondary_keywords = excluded.secondary_keywords,
      canonical_override = excluded.canonical_override,
      robots_directive = excluded.robots_directive,
      og_title = excluded.og_title,
      og_description = excluded.og_description,
      og_image = excluded.og_image,
      schema_type = excluded.schema_type,
      faq_json = excluded.faq_json,
      custom_head_html = excluded.custom_head_html,
      sitemap_priority = excluded.sitemap_priority,
      sitemap_changefreq = excluded.sitemap_changefreq,
      include_in_sitemap = excluded.include_in_sitemap,
      updated_at = datetime('now')
  `).run({
    route_path: String(b.route_path).trim(),
    page_name: String(b.page_name || b.route_path).trim(),
    title: String(b.title).trim(),
    meta_description: String(b.meta_description).trim(),
    focus_keyword: String(b.focus_keyword || '').trim(),
    secondary_keywords: String(b.secondary_keywords || '').trim(),
    canonical_override: String(b.canonical_override || '').trim(),
    robots_directive: String(b.robots_directive || 'index, follow').trim(),
    og_title: String(b.og_title || '').trim(),
    og_description: String(b.og_description || '').trim(),
    og_image: String(b.og_image || '').trim(),
    schema_type: String(b.schema_type || 'WebApplication').trim(),
    faq_json: faqJsonStr,
    custom_head_html: String(b.custom_head_html || ''),
    sitemap_priority: Math.min(1.0, Math.max(0.1, Number(b.sitemap_priority ?? 0.8))),
    sitemap_changefreq: String(b.sitemap_changefreq || 'weekly'),
    include_in_sitemap: b.include_in_sitemap === false || b.include_in_sitemap === 0 ? 0 : 1
  });

  res.json({ ok: true, message: 'SEO configuration saved and live on page.' });
});

// Redirects Manager (301 / 302)
router.get('/seo/redirects', (_req, res) => {
  const redirects = db.prepare('SELECT * FROM redirects ORDER BY id DESC').all();
  res.json({ redirects });
});

router.post('/seo/redirects', (req, res) => {
  const { from_path, to_path, status_code } = req.body || {};
  if (!from_path || !to_path) {
    return res.status(400).json({ error: 'Both source path and destination path are required.' });
  }
  const cleanFrom = String(from_path).trim().startsWith('/') ? String(from_path).trim() : `/${String(from_path).trim()}`;
  if (cleanFrom.startsWith('/admin') || cleanFrom.startsWith('/api')) {
    return res.status(400).json({ error: 'Cannot redirect protected /admin or /api routes.' });
  }
  const code = Number(status_code) === 302 ? 302 : 301;
  db.prepare(`
    INSERT INTO redirects (from_path, to_path, status_code, enabled)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(from_path) DO UPDATE SET to_path = excluded.to_path, status_code = excluded.status_code, enabled = 1
  `).run(cleanFrom, String(to_path).trim(), code);

  res.json({ ok: true });
});

router.delete('/seo/redirects/:id', (req, res) => {
  db.prepare('DELETE FROM redirects WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// IndexNow Search Engine Instant Ping
router.post('/seo/indexnow', async (req, res) => {
  const settings = getAllSettings();
  const baseUrl = resolveBaseUrl(req, settings);
  const key = settings.indexnow_key;
  const pages = db.prepare('SELECT route_path FROM seo_pages WHERE include_in_sitemap = 1').all();
  const urlList = pages.map((p) => `${baseUrl}${p.route_path}`);

  const payload = {
    host: new URL(baseUrl).host,
    key,
    keyLocation: `${baseUrl}/${key}.txt`,
    urlList
  };

  let dispatched = false;
  let remoteNote = '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timer);
    dispatched = resp.ok || resp.status === 202;
    remoteNote = `HTTP ${resp.status}`;
  } catch (err) {
    remoteNote = 'Prepared & verification key file active (external ping will dispatch once deployed on public internet host)';
  }

  db.prepare(`
    UPDATE external_apis
    SET last_status = ?, last_checked_at = datetime('now')
    WHERE api_key_slug = 'indexnow_search_ping'
  `).run(dispatched ? `Submitted (${remoteNote})` : remoteNote);

  res.json({
    ok: true,
    dispatched,
    keyLocation: payload.keyLocation,
    submittedCount: urlList.length,
    urlList,
    note: remoteNote
  });
});

// ---------------- GOOGLE ADSENSE & MONETIZATION ----------------

router.get('/monetization', (_req, res) => {
  const settings = getAllSettings();
  const slots = db.prepare('SELECT * FROM ad_slots ORDER BY slot_key ASC').all();
  const policies = db.prepare('SELECT slug FROM policy_pages').all().map((p) => p.slug);

  const pubId = (settings.adsense_publisher_id || '').trim();
  const validPubFormat = /^ca-pub-\d{10,20}$/.test(pubId) && pubId !== 'ca-pub-0000000000000000';
  const adsTxtHasGoogle = /google\.com\s*,\s*pub-\d+/i.test(settings.ads_txt_content || '');

  const readinessChecklist = [
    {
      id: 'publisher_id',
      label: 'Valid Live AdSense Publisher ID (ca-pub-XXXXXXXXXXXXXXXX)',
      ready: validPubFormat,
      hint: validPubFormat ? `Configured: ${pubId}` : 'Currently using placeholder ID (Preview Shield active). Paste your real ca-pub ID after creating your AdSense account.'
    },
    {
      id: 'ads_txt',
      label: 'Authorized Digital Sellers (/ads.txt) Endpoint Active',
      ready: adsTxtHasGoogle,
      hint: 'Served dynamically at /ads.txt with DIRECT relationship tag f08c47fec0942fa0.'
    },
    {
      id: 'privacy_policy',
      label: 'AdSense-Compliant Privacy & DoubleClick Cookie Policy (/privacy-policy)',
      ready: policies.includes('privacy-policy'),
      hint: 'Required by Google AdSense Program Policies before site review.'
    },
    {
      id: 'trust_pages',
      label: 'About, Contact & Terms Trust Pages Published',
      ready: ['about', 'contact', 'terms'].every((s) => policies.includes(s)),
      hint: 'Google reviewers verify clear site ownership, navigation, and contact channels.'
    },
    {
      id: 'consent_cmp',
      label: 'GDPR / Consent Mode v2 Banner Enabled',
      ready: settings.consent_banner_enabled === 'true',
      hint: 'Signals ad_storage and ad_personalization consent state.'
    },
    {
      id: 'cls_protection',
      label: 'Zero-CLS Minimum Height Shields on All Ad Units',
      ready: slots.every((s) => Number(s.min_height_px) >= 50),
      hint: 'Prevents layout jump penalties in Google Core Web Vitals.'
    }
  ];

  res.json({
    settings: {
      adsense_enabled: settings.adsense_enabled === 'true',
      adsense_publisher_id: settings.adsense_publisher_id || '',
      adsense_auto_ads: settings.adsense_auto_ads === 'true',
      adsense_test_mode: settings.adsense_test_mode === 'true',
      ads_txt_content: settings.ads_txt_content || '',
      consent_banner_enabled: settings.consent_banner_enabled === 'true',
      adblock_notice_enabled: settings.adblock_notice_enabled === 'true'
    },
    slots,
    readinessChecklist
  });
});

router.put('/monetization/settings', (req, res) => {
  const b = req.body || {};
  if (b.adsense_enabled !== undefined) setSetting('adsense_enabled', b.adsense_enabled ? 'true' : 'false');
  if (b.adsense_publisher_id !== undefined) {
    const cleanPub = String(b.adsense_publisher_id).trim();
    setSetting('adsense_publisher_id', cleanPub);
    // Auto-sync pub-XXXX into ads.txt if requested
    if (b.sync_ads_txt && cleanPub.startsWith('ca-pub-')) {
      const barePub = cleanPub.replace(/^ca-/, '');
      setSetting(
        'ads_txt_content',
        `# Google AdSense Authorized Digital Sellers\ngoogle.com, ${barePub}, DIRECT, f08c47fec0942fa0\n`
      );
    }
  }
  if (b.adsense_auto_ads !== undefined) setSetting('adsense_auto_ads', b.adsense_auto_ads ? 'true' : 'false');
  if (b.adsense_test_mode !== undefined) setSetting('adsense_test_mode', b.adsense_test_mode ? 'true' : 'false');
  if (b.ads_txt_content !== undefined && !b.sync_ads_txt) setSetting('ads_txt_content', String(b.ads_txt_content));
  if (b.consent_banner_enabled !== undefined) setSetting('consent_banner_enabled', b.consent_banner_enabled ? 'true' : 'false');
  if (b.adblock_notice_enabled !== undefined) setSetting('adblock_notice_enabled', b.adblock_notice_enabled ? 'true' : 'false');

  res.json({ ok: true, message: 'Google AdSense & Monetization settings updated.' });
});

router.put('/monetization/slots/:slotKey', (req, res) => {
  const { slotKey } = req.params;
  const b = req.body || {};
  const existing = db.prepare('SELECT * FROM ad_slots WHERE slot_key = ?').get(slotKey);
  if (!existing) return res.status(404).json({ error: 'Ad slot not found.' });

  db.prepare(`
    UPDATE ad_slots
    SET enabled = ?,
        mode = ?,
        ad_unit_id = ?,
        ad_format = ?,
        min_height_px = ?,
        custom_html = ?,
        updated_at = datetime('now')
    WHERE slot_key = ?
  `).run(
    b.enabled ? 1 : 0,
    ['placeholder', 'adsense', 'custom_html'].includes(b.mode) ? b.mode : existing.mode,
    String(b.ad_unit_id ?? existing.ad_unit_id).trim(),
    String(b.ad_format ?? existing.ad_format).trim(),
    Math.max(50, Math.min(600, Number(b.min_height_px || existing.min_height_px))),
    String(b.custom_html ?? existing.custom_html),
    slotKey
  );

  res.json({ ok: true });
});

// ---------------- GUIDES CMS & POLICIES ----------------

router.get('/guides', (_req, res) => {
  const guides = db.prepare('SELECT * FROM guides ORDER BY created_at DESC').all();
  res.json({ guides });
});

router.post('/guides', (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.slug || !b.content_html) {
    return res.status(400).json({ error: 'Title, URL slug, and HTML content are required.' });
  }
  const cleanSlug = String(b.slug).toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  try {
    db.prepare(`
      INSERT INTO guides (
        slug, title, excerpt, content_html, focus_keyword,
        meta_title, meta_description, category, reading_minutes, published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanSlug,
      String(b.title).trim(),
      String(b.excerpt || b.title).trim(),
      String(b.content_html),
      String(b.focus_keyword || '').trim(),
      String(b.meta_title || b.title).trim(),
      String(b.meta_description || b.excerpt || '').trim(),
      String(b.category || 'Diagnostics').trim(),
      Math.max(1, Number(b.reading_minutes || 4)),
      b.published === false ? 0 : 1
    );
    res.json({ ok: true, slug: cleanSlug });
  } catch (err) {
    res.status(400).json({ error: 'A guide with that slug already exists.' });
  }
});

router.put('/guides/:id', (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = db.prepare('SELECT * FROM guides WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Guide not found.' });

  const cleanSlug = String(b.slug || existing.slug).toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-');
  db.prepare(`
    UPDATE guides
    SET slug = ?, title = ?, excerpt = ?, content_html = ?, focus_keyword = ?,
        meta_title = ?, meta_description = ?, category = ?, reading_minutes = ?,
        published = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    cleanSlug,
    String(b.title ?? existing.title).trim(),
    String(b.excerpt ?? existing.excerpt).trim(),
    String(b.content_html ?? existing.content_html),
    String(b.focus_keyword ?? existing.focus_keyword).trim(),
    String(b.meta_title ?? existing.meta_title).trim(),
    String(b.meta_description ?? existing.meta_description).trim(),
    String(b.category ?? existing.category).trim(),
    Math.max(1, Number(b.reading_minutes || existing.reading_minutes)),
    b.published === undefined ? existing.published : (b.published ? 1 : 0),
    id
  );
  res.json({ ok: true });
});

router.delete('/guides/:id', (req, res) => {
  db.prepare('DELETE FROM guides WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

router.get('/policies', (_req, res) => {
  const policies = db.prepare('SELECT * FROM policy_pages ORDER BY slug ASC').all();
  res.json({ policies });
});

router.put('/policies/:slug', (req, res) => {
  const { slug } = req.params;
  const { title, content_html } = req.body || {};
  db.prepare(`
    UPDATE policy_pages SET title = ?, content_html = ?, updated_at = datetime('now') WHERE slug = ?
  `).run(String(title || '').trim(), String(content_html || ''), slug);
  res.json({ ok: true });
});

// ---------------- GLOBAL SETTINGS, MODULES & FOREIGN APIS ----------------

router.get('/settings', (_req, res) => {
  res.json({ settings: getAllSettings() });
});

router.put('/settings', (req, res) => {
  const allowedKeys = [
    'site_name',
    'site_tagline',
    'site_base_url',
    'google_site_verification',
    'bing_site_verification',
    'yandex_verification',
    'ga4_measurement_id',
    'gtm_container_id',
    'robots_txt_custom',
    'indexnow_key'
  ];
  const body = req.body || {};
  for (const k of allowedKeys) {
    if (body[k] !== undefined) {
      setSetting(k, String(body[k]));
    }
  }
  res.json({ ok: true, message: 'Global site & search settings updated.' });
});

router.get('/modules', (_req, res) => {
  const modules = db.prepare('SELECT * FROM feature_modules ORDER BY nav_order ASC').all();
  const externalApis = db.prepare('SELECT * FROM external_apis ORDER BY api_key_slug ASC').all();
  res.json({ modules, externalApis });
});

router.put('/modules/:moduleKey', (req, res) => {
  const { moduleKey } = req.params;
  const { enabled, nav_order, badge, name, description } = req.body || {};
  const existing = db.prepare('SELECT * FROM feature_modules WHERE module_key = ?').get(moduleKey);
  if (!existing) return res.status(404).json({ error: 'Module not found.' });

  db.prepare(`
    UPDATE feature_modules
    SET enabled = ?, nav_order = ?, badge = ?, name = ?, description = ?
    WHERE module_key = ?
  `).run(
    enabled ? 1 : 0,
    Number(nav_order ?? existing.nav_order),
    String(badge ?? existing.badge),
    String(name ?? existing.name),
    String(description ?? existing.description),
    moduleKey
  );
  res.json({ ok: true });
});

router.put('/external-apis/:slug', (req, res) => {
  const { slug } = req.params;
  const { enabled, endpoint_url, auth_key } = req.body || {};
  const existing = db.prepare('SELECT * FROM external_apis WHERE api_key_slug = ?').get(slug);
  if (!existing) return res.status(404).json({ error: 'Connector not found.' });

  db.prepare(`
    UPDATE external_apis
    SET enabled = ?, endpoint_url = ?, auth_key = ?
    WHERE api_key_slug = ?
  `).run(
    enabled ? 1 : 0,
    String(endpoint_url ?? existing.endpoint_url).trim(),
    String(auth_key ?? existing.auth_key).trim(),
    slug
  );
  res.json({ ok: true });
});

router.post('/external-apis/:slug/test', async (req, res) => {
  const { slug } = req.params;
  const api = db.prepare('SELECT * FROM external_apis WHERE api_key_slug = ?').get(slug);
  if (!api) return res.status(404).json({ error: 'Connector not found.' });

  let statusText = 'Unreachable in current network';
  let ok = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const headers = { 'User-Agent': 'KeyPulse-Admin-Healthcheck/1.0' };
    if (api.auth_key && api.provider.includes('github')) {
      headers.Authorization = `Bearer ${api.auth_key}`;
    }
    const resp = await fetch(api.endpoint_url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timer);
    ok = resp.status < 500;
    statusText = `HTTP ${resp.status} (${ok ? 'Reachable' : 'Server Error'})`;
  } catch (err) {
    statusText = `Offline / Restricted Host (${err.name === 'AbortError' ? 'Timeout' : 'Network Sandbox'})`;
  }

  db.prepare(`
    UPDATE external_apis SET last_status = ?, last_checked_at = datetime('now') WHERE api_key_slug = ?
  `).run(statusText, slug);

  res.json({ ok, statusText });
});

// ---------------- INBOX & SECURITY ----------------

router.get('/messages', (_req, res) => {
  const messages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100').all();
  res.json({ messages });
});

router.patch('/messages/:id', (req, res) => {
  db.prepare('UPDATE contact_messages SET is_read = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/messages/:id', (req, res) => {
  db.prepare('DELETE FROM contact_messages WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

router.get('/security/audit', (req, res) => {
  const logs = db.prepare('SELECT * FROM auth_logs ORDER BY id DESC LIMIT 40').all();
  const sessions = db.prepare(`
    SELECT substr(token_hash, 1, 12) as session_id, ip, user_agent, created_at, expires_at,
           (token_hash = ?) as is_current
    FROM sessions
    WHERE admin_id = ? AND datetime(expires_at) > datetime('now')
    ORDER BY created_at DESC
  `).all(req.adminSession.token_hash, req.adminSession.admin_id);

  res.json({ logs, sessions });
});

router.delete('/security/sessions/:prefix', (req, res) => {
  const prefix = String(req.params.prefix || '');
  db.prepare(`
    DELETE FROM sessions
    WHERE admin_id = ? AND substr(token_hash, 1, 12) = ?
  `).run(req.adminSession.admin_id, prefix);
  res.json({ ok: true });
});

router.post('/security/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.adminSession.admin_id);
  if (!admin || !verifyPassword(currentPassword, admin.salt, admin.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const { salt, hash } = hashPassword(newPassword);
  db.prepare(`
    UPDATE admins
    SET password_hash = ?, salt = ?, must_change_password = 0
    WHERE id = ?
  `).run(hash, salt, admin.id);

  // Revoke all other sessions for security
  db.prepare(`
    DELETE FROM sessions
    WHERE admin_id = ? AND token_hash != ?
  `).run(admin.id, req.adminSession.token_hash);

  recordAuthAttempt({
    username: admin.username,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || '',
    success: true,
    reason: 'Admin password rotated'
  });

  res.json({ ok: true, message: 'Password updated and other sessions revoked.' });
});

module.exports = router;
