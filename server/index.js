const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const { db, getAllSettings, getSetting } = require('./db');
const { getSessionFromRequest } = require('./auth');
const {
  escapeHtml,
  resolveBaseUrl,
  detectSearchBot,
  renderTemplatePage,
  generateSitemapXml
} = require('./seoEngine');

const publicApiRouter = require('./routes/publicApi');
const adminApiRouter = require('./routes/adminApi');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VIEWS_DIR = path.join(PUBLIC_DIR, 'views');

app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Security headers (iframe-preview compatible — no X-Frame-Options block)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Static assets (CSS, JS, SVG icons/OG banners) with fast caching headers
app.use(express.static(PUBLIC_DIR, {
  index: false,
  maxAge: '1h'
}));

// Dynamic 301/302 SEO Redirect Manager Middleware
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/admin')) {
    return next();
  }
  const rule = db.prepare('SELECT * FROM redirects WHERE from_path = ? AND enabled = 1').get(req.path);
  if (rule) {
    db.prepare('UPDATE redirects SET hits = hits + 1 WHERE id = ?').run(rule.id);
    return res.redirect(rule.status_code === 302 ? 302 : 301, rule.to_path);
  }
  next();
});

// Search Engine & AdSense Critical Root Endpoints
app.get('/ads.txt', (_req, res) => {
  const adsTxt = getSetting('ads_txt_content', 'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0');
  res.type('text/plain; charset=utf-8').send(adsTxt);
});

app.get('/robots.txt', (req, res) => {
  const settings = getAllSettings();
  const baseUrl = resolveBaseUrl(req, settings);
  const rawRobots = settings.robots_txt_custom || 'User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: {{BASE_URL}}/sitemap.xml';
  const rendered = rawRobots.replace(/\{\{BASE_URL\}\}/g, baseUrl);
  res.type('text/plain; charset=utf-8').send(rendered);
});

app.get('/sitemap.xml', (req, res) => {
  const settings = getAllSettings();
  const baseUrl = resolveBaseUrl(req, settings);
  const xml = generateSitemapXml(baseUrl);
  res.type('application/xml; charset=utf-8').send(xml);
});

// Dynamic IndexNow verification key file (/<indexnow_key>.txt)
app.get('/:keyFile.txt', (req, res, next) => {
  const indexNowKey = getSetting('indexnow_key', '');
  if (indexNowKey && req.params.keyFile === indexNowKey) {
    return res.type('text/plain; charset=utf-8').send(indexNowKey);
  }
  next();
});

// API Routes
app.use('/api', publicApiRouter);
app.use('/api/admin', adminApiRouter);

// Analytics & Search Bot Crawler Recorder for HTML pages
function trackPageRequest(req, routePath) {
  try {
    const ua = req.headers['user-agent'] || '';
    const bot = detectSearchBot(ua);
    const referrer = String(req.headers.referer || '').slice(0, 200);
    if (bot) {
      db.prepare(`
        INSERT INTO analytics_events (event_type, route_path, bot_name, referrer)
        VALUES ('bot_crawl', ?, ?, ?)
      `).run(routePath, bot, referrer);
    } else {
      db.prepare(`
        INSERT INTO analytics_events (event_type, route_path, referrer)
        VALUES ('pageview', ?, ?)
      `).run(routePath, referrer);
    }
  } catch (_) {}
}

// Guard disabled feature modules gracefully
function ensureModuleEnabled(moduleKey, req, res, next) {
  const mod = db.prepare('SELECT enabled FROM feature_modules WHERE module_key = ?').get(moduleKey);
  if (mod && !mod.enabled) {
    return res.redirect(302, '/');
  }
  next();
}

// ---------------- PUBLIC SEO-OPTIMIZED HTML PAGES ----------------

app.get('/', (req, res) => {
  trackPageRequest(req, '/');
  const html = renderTemplatePage({ viewFile: 'index.html', routePath: '/', req });
  res.type('html').send(html);
});

app.get('/typing-test', ensureModuleEnabled.bind(null, 'typing_test'), (req, res) => {
  trackPageRequest(req, '/typing-test');
  const html = renderTemplatePage({ viewFile: 'typing-test.html', routePath: '/typing-test', req });
  res.type('html').send(html);
});

app.get('/mouse-cps-test', ensureModuleEnabled.bind(null, 'mouse_cps_test'), (req, res) => {
  trackPageRequest(req, '/mouse-cps-test');
  const html = renderTemplatePage({ viewFile: 'mouse-cps-test.html', routePath: '/mouse-cps-test', req });
  res.type('html').send(html);
});

app.get('/chatter-analyzer', ensureModuleEnabled.bind(null, 'chatter_analyzer'), (req, res) => {
  trackPageRequest(req, '/chatter-analyzer');
  const html = renderTemplatePage({ viewFile: 'chatter-test.html', routePath: '/chatter-analyzer', req });
  res.type('html').send(html);
});

app.get('/guides', ensureModuleEnabled.bind(null, 'guides_cms'), (req, res) => {
  trackPageRequest(req, '/guides');
  const guides = db.prepare('SELECT * FROM guides WHERE published = 1 ORDER BY created_at DESC').all();
  const cardsHtml = guides.map((g) => `
    <article class="guide-card">
      <div class="guide-card-meta">
        <span class="badge-chip">${escapeHtml(g.category)}</span>
        <span>${Number(g.reading_minutes || 4)} min read</span>
      </div>
      <h2><a href="/guides/${escapeHtml(g.slug)}">${escapeHtml(g.title)}</a></h2>
      <p>${escapeHtml(g.excerpt)}</p>
      <a href="/guides/${escapeHtml(g.slug)}" class="guide-read-link">Read Diagnostic Guide &rarr;</a>
    </article>
  `).join('\n');

  const html = renderTemplatePage({
    viewFile: 'guides.html',
    routePath: '/guides',
    req,
    replacements: {
      '<!--GUIDES_LIST_HTML-->': cardsHtml || '<p class="muted">No guides published yet.</p>'
    }
  });
  res.type('html').send(html);
});

app.get('/guides/:slug', (req, res, next) => {
  const guide = db.prepare('SELECT * FROM guides WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!guide) return next();

  const routePath = `/guides/${guide.slug}`;
  trackPageRequest(req, routePath);
  db.prepare('UPDATE guides SET views = views + 1 WHERE id = ?').run(guide.id);

  const settings = getAllSettings();
  const baseUrl = resolveBaseUrl(req, settings);

  const seoOverride = {
    route_path: routePath,
    page_name: guide.title,
    title: guide.meta_title || `${guide.title} | ${settings.site_name || 'KeyPulse'}`,
    meta_description: guide.meta_description || guide.excerpt,
    focus_keyword: guide.focus_keyword,
    secondary_keywords: guide.category,
    canonical_override: `${baseUrl}${routePath}`,
    robots_directive: 'index, follow, max-snippet:-1, max-image-preview:large',
    og_title: guide.meta_title || guide.title,
    og_description: guide.meta_description || guide.excerpt,
    og_image: '',
    schema_type: 'Article',
    faq_json: '[]',
    custom_head_html: ''
  };

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.meta_description || guide.excerpt,
    author: {
      '@type': 'Organization',
      name: guide.author || 'KeyPulse Hardware Lab'
    },
    datePublished: guide.created_at,
    dateModified: guide.updated_at,
    mainEntityOfPage: `${baseUrl}${routePath}`
  };

  const related = db.prepare('SELECT slug, title, category FROM guides WHERE published = 1 AND id != ? LIMIT 3').all(guide.id);
  const relatedHtml = related.map((r) => `
    <li><a href="/guides/${escapeHtml(r.slug)}">${escapeHtml(r.title)}</a> <span class="muted">(${escapeHtml(r.category)})</span></li>
  `).join('\n');

  const html = renderTemplatePage({
    viewFile: 'guide-detail.html',
    routePath,
    req,
    seoOverride,
    extraSchema: articleSchema,
    replacements: {
      '<!--GUIDE_CATEGORY-->': escapeHtml(guide.category),
      '<!--GUIDE_READ_TIME-->': `${Number(guide.reading_minutes || 4)} min read`,
      '<!--GUIDE_UPDATED-->': escapeHtml((guide.updated_at || '').slice(0, 10)),
      '<!--GUIDE_TITLE-->': escapeHtml(guide.title),
      '<!--GUIDE_EXCERPT-->': escapeHtml(guide.excerpt),
      '<!--GUIDE_BODY_HTML-->': guide.content_html,
      '<!--RELATED_GUIDES_HTML-->': relatedHtml
    }
  });
  res.type('html').send(html);
});

// AdSense Trust & Legal Policy Pages (/privacy-policy, /terms, /about, /contact)
for (const slug of ['privacy-policy', 'terms', 'about', 'contact']) {
  app.get(`/${slug}`, (req, res) => {
    const routePath = `/${slug}`;
    trackPageRequest(req, routePath);
    const pol = db.prepare('SELECT * FROM policy_pages WHERE slug = ?').get(slug);

    const contactFormHtml = slug === 'contact' ? `
      <form id="public-contact-form" class="contact-card">
        <div class="form-grid-2">
          <div class="field-group">
            <label for="c-name">Your Name</label>
            <input type="text" id="c-name" name="name" required placeholder="Alex Rivera">
          </div>
          <div class="field-group">
            <label for="c-email">Email Address</label>
            <input type="email" id="c-email" name="email" required placeholder="alex@example.com">
          </div>
        </div>
        <div class="field-group">
          <label for="c-subject">Topic</label>
          <select id="c-subject" name="subject">
            <option value="Layout / Keycode Request">Keyboard Layout or Keycode Request</option>
            <option value="Hardware Guide Suggestion">Hardware Guide Feedback</option>
            <option value="Advertising / Sponsorship">Advertising &amp; Sponsorship</option>
            <option value="Privacy / GDPR Request">Privacy / Cookie Inquiry</option>
          </select>
        </div>
        <div class="field-group">
          <label for="c-message">Message</label>
          <textarea id="c-message" name="message" rows="5" required placeholder="Tell us how we can help..."></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Send Message</button>
        <p id="contact-form-status" class="form-status" aria-live="polite"></p>
      </form>
    ` : '';

    const html = renderTemplatePage({
      viewFile: 'policy.html',
      routePath,
      req,
      replacements: {
        '<!--POLICY_TITLE-->': escapeHtml(pol ? pol.title : slug),
        '<!--POLICY_CONTENT_HTML-->': pol ? pol.content_html : '',
        '<!--CONTACT_FORM_SECTION-->': contactFormHtml
      }
    });
    res.type('html').send(html);
  });
}

// ---------------- PROTECTED ADMIN BACKEND VIEWS ----------------

app.get('/admin/login', (req, res) => {
  const session = getSessionFromRequest(req);
  if (session) {
    return res.redirect('/admin');
  }
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(VIEWS_DIR, 'admin-login.html'));
});

app.get('/admin', (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.redirect('/admin/login');
  }
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(VIEWS_DIR, 'admin.html'));
});

// SEO-friendly 404 fallback
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  res.status(404);
  const html = renderTemplatePage({
    viewFile: 'policy.html',
    routePath: '/404',
    req,
    seoOverride: {
      route_path: '/404',
      page_name: '404 Page Not Found',
      title: '404 Page Not Found | KeyPulse',
      meta_description: 'The requested diagnostic tool or hardware guide could not be found.',
      focus_keyword: '',
      secondary_keywords: '',
      robots_directive: 'noindex, follow',
      schema_type: 'WebPage',
      faq_json: '[]'
    },
    replacements: {
      '<!--POLICY_TITLE-->': '404 — Page Not Found',
      '<!--POLICY_CONTENT_HTML-->': `<p>We couldn't find that URL. Return to the <a href="/">Online Keyboard Tester</a>, <a href="/typing-test">Typing Speed Test</a>, or browse our <a href="/guides">Hardware Troubleshooting Guides</a>.</p>`,
      '<!--CONTACT_FORM_SECTION-->': ''
    }
  });
  res.type('html').send(html);
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`KeyPulse Keyboard Tester & SEO/AdSense Server listening on http://${HOST}:${PORT}`);
  });
}

module.exports = { app };
