const assert = require('node:assert/strict');
const http = require('node:http');
require('../server/env');
const { app } = require('../server/index');

function request(server, method, urlPath, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = Object.assign({}, headers);
    if (payload && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: addr.port,
      path: urlPath,
      method,
      headers: reqHeaders
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const PUBLIC_ROUTES = [
  '/',
  '/gamepad-test',
  '/display-test',
  '/audio-video-test',
  '/typing-test',
  '/mouse-cps-test',
  '/chatter-analyzer',
  '/guides',
  '/privacy-policy',
  '/terms',
  '/about',
  '/contact'
];

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));

  try {
    // 1. Public SEO Home Page
    const home = await request(server, 'GET', '/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
    });
    assert.equal(home.status, 200);
    assert.match(home.text, /<title>Online Keyboard Tester/i);
    assert.match(home.text, /application\/ld\+json/);
    assert.match(home.text, /FAQPage/);
    assert.match(home.text, /ad-slot-wrapper/);

    // 2. Full hardware diagnostic suite + legal pages
    for (const p of PUBLIC_ROUTES) {
      const res = await request(server, 'GET', p);
      assert.equal(res.status, 200, `Expected 200 on ${p}`);
      assert.match(res.text, /class="app-shell"/, `Missing grid shell on ${p}`);
      assert.match(res.text, /class="app-sidebar"/, `Missing sidebar on ${p}`);
      assert.ok(!/<a[^>]+href="\/admin/i.test(res.text), `Public page ${p} must not link to /admin`);
      assert.ok(!/>\s*Admin\s*</i.test(res.text), `Public page ${p} must not render an Admin button`);
    }

    // 3. Sidebar exposes the expanded hardware suite
    assert.match(home.text, /href="\/gamepad-test"/);
    assert.match(home.text, /href="\/display-test"/);
    assert.match(home.text, /href="\/audio-video-test"/);

    // 4. SEO & AdSense Root Endpoints
    const sitemap = await request(server, 'GET', '/sitemap.xml');
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.text, /<urlset/);
    assert.match(sitemap.text, /how-to-fix-mechanical-keyboard-key-chatter/);
    assert.match(sitemap.text, /\/gamepad-test/);
    assert.match(sitemap.text, /\/display-test/);
    assert.match(sitemap.text, /\/audio-video-test/);

    const robots = await request(server, 'GET', '/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(robots.text, /Sitemap:/);

    const adsTxt = await request(server, 'GET', '/ads.txt');
    assert.equal(adsTxt.status, 200);
    assert.match(adsTxt.text, /google\.com,\s*pub-/);

    // 5. Unauthenticated /admin redirects to /admin/login
    const unauthAdmin = await request(server, 'GET', '/admin');
    assert.equal(unauthAdmin.status, 302);
    assert.equal(unauthAdmin.headers.location, '/admin/login');

    // 6. Invalid Login Rejected
    const badLogin = await request(server, 'POST', '/api/admin/login', {
      body: { username: 'nobody', password: 'wrong-password' }
    });
    assert.equal(badLogin.status, 401);

    // 7. Valid Admin Login using .env credentials + CSRF enforcement
    const goodLogin = await request(server, 'POST', '/api/admin/login', {
      body: {
        username: process.env.ADMIN_USER || 'keypulse_admin',
        password: process.env.ADMIN_PASSWORD || 'KP-Oy_-q-K01-ff!9x'
      }
    });
    assert.equal(goodLogin.status, 200, 'Login with .env credentials should succeed');
    assert.ok(goodLogin.json.csrfToken);
    const setCookie = goodLogin.headers['set-cookie'];
    assert.ok(Array.isArray(setCookie) && setCookie[0].includes('HttpOnly'));
    const cookieHeader = setCookie[0].split(';')[0];

    // Write without CSRF token must fail with 403
    const noCsrf = await request(server, 'PUT', '/api/admin/settings', {
      headers: { Cookie: cookieHeader },
      body: { site_name: 'Blocked' }
    });
    assert.equal(noCsrf.status, 403);

    // Dashboard & Live SEO Audit Score Verification
    const dash = await request(server, 'GET', '/api/admin/dashboard', {
      headers: { Cookie: cookieHeader }
    });
    assert.equal(dash.status, 200);
    console.log('Average Sitewide SEO Score:', dash.json.kpis.avgSeoScore);
    console.log('Route Scores:', dash.json.pageScores.map((p) => `${p.route_path}: ${p.score}`).join(', '));
    assert.ok(dash.json.kpis.avgSeoScore >= 90, 'Expected 90+ sitewide SEO score');
    for (const route of ['/', '/gamepad-test', '/display-test', '/audio-video-test']) {
      const score = dash.json.pageScores.find((p) => p.route_path === route);
      assert.ok(score, `SEO audit missing for ${route}`);
      assert.ok(score.score >= 90, `Expected 90+ SEO score on ${route}, got ${score.score}`);
    }

    // Live audit endpoint for the new hardware pages
    const liveAudit = await request(server, 'GET', '/api/admin/seo/audit?path=/gamepad-test', {
      headers: { Cookie: cookieHeader }
    });
    assert.equal(liveAudit.status, 200);
    assert.ok(liveAudit.json.audit.score >= 90, `Live audit expected 90+, got ${liveAudit.json.audit.score}`);

    // Foreign API Typing Corpus (GitHub API Live test)
    const ghCorpus = await request(server, 'GET', '/api/typing-corpus?mode=github_live');
    assert.equal(ghCorpus.status, 200);
    assert.ok(ghCorpus.json.text.length > 50);
    console.log('Typing Corpus Source:', ghCorpus.json.source);

    console.log('ALL SMOKE & INTEGRATION TESTS PASSED!');
  } finally {
    server.close();
  }
})();
