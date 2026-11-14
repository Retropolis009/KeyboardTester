(function () {
  let csrfToken = '';
  let cachedSeoPages = [];
  let cachedPolicies = [];
  let cachedGuides = [];
  let currentBaseUrl = window.location.origin;

  const toastEl = document.getElementById('admin-toast');
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add('hidden'), 3200);
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scoreBadge(score) {
    const cls = score >= 88 ? 'score-good' : (score >= 70 ? 'score-warn' : 'score-bad');
    return `<span class="score-pill ${cls}">${score}/100</span>`;
  }

  async function api(url, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (csrfToken && options.method && options.method !== 'GET') {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(url, Object.assign({}, options, { headers }));
    if (res.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Unauthorized');
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  // Tab Navigation
  const tabHeadings = {
    overview: 'Search & Revenue Command Overview',
    'seo-suite': 'Heavy On-Page SEO Suite & Live SERP Simulator',
    'tech-seo': 'Technical SEO: Sitemap, Redirects, Verification & IndexNow',
    monetization: 'Google AdSense Monetization & Zero-CLS Ad Slots',
    cms: 'SEO Hardware Guides & AdSense Trust Policy CMS',
    modules: 'Platform Feature Modules & Foreign API Connectors',
    inbox: 'Visitor & Advertiser Contact Inbox',
    security: 'Security Procedures, Password Rotation & Audit Log'
  };

  function switchTab(tabId) {
    document.querySelectorAll('.side-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });
    const h1 = document.getElementById('adm-page-heading');
    if (h1 && tabHeadings[tabId]) h1.textContent = tabHeadings[tabId];
  }

  document.querySelectorAll('.side-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
      if (tab === 'overview') loadOverview();
      if (tab === 'seo-suite') loadSeoPages();
      if (tab === 'tech-seo') loadTechSeo();
      if (tab === 'monetization') loadMonetization();
      if (tab === 'cms') loadCms();
      if (tab === 'modules') loadModulesAndApis();
      if (tab === 'inbox') loadInbox();
      if (tab === 'security') loadSecurity();
    });
  });

  // Logout
  const logoutBtn = document.getElementById('btn-admin-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await api('/api/admin/logout', { method: 'POST', body: '{}' });
      window.location.href = '/admin/login';
    });
  }

  // ---------------- 1. OVERVIEW ----------------
  async function loadOverview() {
    const data = await api('/api/admin/dashboard');
    const k = data.kpis;
    const unreadBadge = document.getElementById('badge-unread');
    if (unreadBadge) {
      unreadBadge.textContent = String(k.unreadMessages);
      unreadBadge.classList.toggle('hidden', k.unreadMessages === 0);
    }

    document.getElementById('overview-kpi-grid').innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Avg SEO Health</div><div class="kpi-val" style="color:var(--adm-green)">${k.avgSeoScore}/100</div></div>
      <div class="kpi-card"><div class="kpi-label">Human Pageviews</div><div class="kpi-val">${k.totalPageviews}</div></div>
      <div class="kpi-card"><div class="kpi-label">Search Bot Crawls</div><div class="kpi-val" style="color:var(--adm-cyan)">${k.totalBotHits}</div></div>
      <div class="kpi-card"><div class="kpi-label">Ad Slot Impressions</div><div class="kpi-val">${k.totalImpressions}</div></div>
      <div class="kpi-card"><div class="kpi-label">Ad Slot CTR</div><div class="kpi-val">${k.ctrPercent}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Published Guides</div><div class="kpi-val">${k.publishedGuides}</div></div>
    `;

    const seoTbody = document.getElementById('overview-seo-tbody');
    seoTbody.innerHTML = data.pageScores.map((p) => `
      <tr>
        <td><code>${esc(p.route_path)}</code></td>
        <td>${esc(p.focus_keyword || '—')}</td>
        <td>${p.wordCount}</td>
        <td>${scoreBadge(p.score)}</td>
        <td><button type="button" class="btn btn-sm btn-jump-seo" data-route="${esc(p.route_path)}">Audit &amp; Edit</button></td>
      </tr>
    `).join('');

    seoTbody.querySelectorAll('.btn-jump-seo').forEach((b) => {
      b.addEventListener('click', async () => {
        const route = b.dataset.route;
        switchTab('seo-suite');
        await loadSeoPages(route);
      });
    });

    const cwvBody = document.getElementById('overview-cwv-tbody');
    cwvBody.innerHTML = data.coreWebVitals.length > 0
      ? data.coreWebVitals.map((r) => `
          <tr>
            <td><strong>${esc(r.metric_name)}</strong></td>
            <td><code>${r.metric_name === 'CLS' ? r.avg_val : `${r.avg_val} ms`}</code></td>
            <td>${r.samples}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" style="color:var(--adm-muted)">Open any public page to collect live TTFB, LCP &amp; CLS samples.</td></tr>';

    const botsBody = document.getElementById('overview-bots-tbody');
    botsBody.innerHTML = data.botCrawls.length > 0
      ? data.botCrawls.map((b) => `
          <tr><td><code>${esc(b.bot_name)}</code></td><td>${b.hits}</td><td>${esc(b.last_seen)}</td></tr>
        `).join('')
      : '<tr><td colspan="3" style="color:var(--adm-muted)">Waiting for Googlebot / Bingbot / Mediapartners-Google hits...</td></tr>';
  }

  // ---------------- 2. HEAVY SEO SUITE & SERP ----------------
  const routeSel = document.getElementById('seo-route-selector');
  const titleInput = document.getElementById('seo-title');
  const descInput = document.getElementById('seo-meta-desc');

  function updateSerpPreview() {
    const rPath = document.getElementById('seo-route-path').value || '/';
    const tVal = titleInput.value || '';
    const dVal = descInput.value || '';

    const pxEst = Math.round(tVal.length * 9.2);
    document.getElementById('seo-title-counter').textContent = `${tVal.length} / 65 chars (~${pxEst}px)`;
    document.getElementById('seo-desc-counter').textContent = `${dVal.length} / 160 chars`;

    document.getElementById('serp-url-preview').textContent = `${currentBaseUrl}${rPath === '/' ? '' : rPath}`;
    document.getElementById('serp-title-preview').textContent = tVal.length > 66 ? `${tVal.slice(0, 64)}...` : tVal;
    document.getElementById('serp-desc-preview').textContent = dVal.length > 164 ? `${dVal.slice(0, 161)}...` : dVal;
  }

  if (titleInput) titleInput.addEventListener('input', updateSerpPreview);
  if (descInput) descInput.addEventListener('input', updateSerpPreview);

  async function loadSeoPages(selectedRoute = null) {
    const data = await api('/api/admin/seo/pages');
    cachedSeoPages = data.pages;
    const activeRoute = selectedRoute || (routeSel.value || '/');

    routeSel.innerHTML = cachedSeoPages.map((p) =>
      `<option value="${esc(p.route_path)}">${esc(p.route_path)} — ${esc(p.page_name)} (${p.auditScore}/100)</option>`
    ).join('');

    if (cachedSeoPages.some((p) => p.route_path === activeRoute)) {
      routeSel.value = activeRoute;
    }
    await populateAndAuditRoute(routeSel.value);
  }

  async function populateAndAuditRoute(routePath) {
    const data = await api(`/api/admin/seo/audit?path=${encodeURIComponent(routePath)}`);
    const p = data.page;
    const audit = data.audit;
    currentBaseUrl = data.baseUrl || window.location.origin;

    document.getElementById('seo-route-path').value = p.route_path;
    document.getElementById('seo-page-name').value = p.page_name;
    document.getElementById('seo-focus-kw').value = p.focus_keyword || '';
    document.getElementById('seo-sec-kw').value = p.secondary_keywords || '';
    document.getElementById('seo-title').value = p.title || '';
    document.getElementById('seo-meta-desc').value = p.meta_description || '';
    document.getElementById('seo-schema-type').value = p.schema_type || 'WebApplication';
    document.getElementById('seo-robots').value = p.robots_directive || 'index, follow';
    document.getElementById('seo-priority').value = p.sitemap_priority ?? 0.8;
    document.getElementById('seo-changefreq').value = p.sitemap_changefreq || 'weekly';
    document.getElementById('seo-in-sitemap').value = String(p.include_in_sitemap ?? 1);
    document.getElementById('seo-canonical').value = p.canonical_override || '';
    document.getElementById('seo-og-image').value = p.og_image || '';
    document.getElementById('seo-custom-head').value = p.custom_head_html || '';

    try {
      document.getElementById('seo-faq-json').value = JSON.stringify(JSON.parse(p.faq_json || '[]'), null, 2);
    } catch (_) {
      document.getElementById('seo-faq-json').value = '[]';
    }

    updateSerpPreview();

    document.getElementById('seo-active-score-badge').innerHTML = `On-Page SEO Score: ${scoreBadge(audit.score)}`;
    document.getElementById('audit-summary-metrics').innerHTML = `
      Indexable Words: <strong>${audit.wordCount}</strong> &bull;
      Focus Keyword Matches: <strong>${audit.keywordOccurrences}</strong> (${audit.keywordDensity}% density) &bull;
      Internal Links: <strong>${audit.internalLinkCount}</strong> &bull;
      Active JSON-LD: <code>${esc(audit.schemaTypes.join(', ') || 'None')}</code>
    `;

    document.getElementById('seo-audit-checklist').innerHTML = audit.checks.map((c) => `
      <li class="audit-check-item">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <strong>${c.passed ? '&#9989;' : '&#9888;&#65039;'} ${esc(c.label)}</strong>
          <code style="color:var(--adm-muted);font-size:0.76rem">${esc(c.detail)}</code>
        </div>
        ${!c.passed && c.fixHint ? `<div style="margin-top:4px;color:var(--adm-amber);font-size:0.78rem">${esc(c.fixHint)}</div>` : ''}
      </li>
    `).join('');
  }

  if (routeSel) {
    routeSel.addEventListener('change', () => populateAndAuditRoute(routeSel.value));
  }
  const rerunBtn = document.getElementById('btn-rerun-audit');
  if (rerunBtn) {
    rerunBtn.addEventListener('click', () => populateAndAuditRoute(routeSel.value));
  }

  const seoForm = document.getElementById('seo-page-form');
  if (seoForm) {
    seoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/admin/seo/pages', {
          method: 'POST',
          body: JSON.stringify({
            route_path: document.getElementById('seo-route-path').value,
            page_name: document.getElementById('seo-page-name').value,
            focus_keyword: document.getElementById('seo-focus-kw').value,
            secondary_keywords: document.getElementById('seo-sec-kw').value,
            title: document.getElementById('seo-title').value,
            meta_description: document.getElementById('seo-meta-desc').value,
            schema_type: document.getElementById('seo-schema-type').value,
            robots_directive: document.getElementById('seo-robots').value,
            sitemap_priority: Number(document.getElementById('seo-priority').value),
            sitemap_changefreq: document.getElementById('seo-changefreq').value,
            include_in_sitemap: Number(document.getElementById('seo-in-sitemap').value),
            canonical_override: document.getElementById('seo-canonical').value,
            og_image: document.getElementById('seo-og-image').value,
            faq_json: document.getElementById('seo-faq-json').value,
            custom_head_html: document.getElementById('seo-custom-head').value
          })
        });
        showToast('SEO Metadata saved! Re-running audit...');
        await loadSeoPages(document.getElementById('seo-route-path').value);
      } catch (err) {
        showToast(`Error: ${err.message}`);
      }
    });
  }

  // ---------------- 3. TECHNICAL SEO & REDIRECTS ----------------
  async function loadTechSeo() {
    const [{ settings }, { redirects }] = await Promise.all([
      api('/api/admin/settings'),
      api('/api/admin/seo/redirects')
    ]);

    document.getElementById('set-site-name').value = settings.site_name || '';
    document.getElementById('set-base-url').value = settings.site_base_url || '';
    document.getElementById('set-gsc-code').value = settings.google_site_verification || '';
    document.getElementById('set-bing-code').value = settings.bing_site_verification || '';
    document.getElementById('set-ga4-id').value = settings.ga4_measurement_id || '';
    document.getElementById('set-indexnow-key').value = settings.indexnow_key || '';
    document.getElementById('set-robots-txt').value = settings.robots_txt_custom || '';

    const rTbody = document.getElementById('redirects-tbody');
    rTbody.innerHTML = redirects.length > 0
      ? redirects.map((r) => `
          <tr>
            <td><code>${esc(r.from_path)}</code></td>
            <td><code>${esc(r.to_path)}</code></td>
            <td>${r.status_code}</td>
            <td>${r.hits}</td>
            <td><button type="button" class="btn btn-sm btn-danger btn-del-red" data-id="${r.id}">Delete</button></td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" style="color:var(--adm-muted)">No custom 301/302 redirects configured yet.</td></tr>';

    rTbody.querySelectorAll('.btn-del-red').forEach((b) => {
      b.addEventListener('click', async () => {
        await api(`/api/admin/seo/redirects/${b.dataset.id}`, { method: 'DELETE' });
        showToast('Redirect removed.');
        loadTechSeo();
      });
    });
  }

  document.getElementById('global-seo-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        site_name: document.getElementById('set-site-name').value,
        site_base_url: document.getElementById('set-base-url').value,
        google_site_verification: document.getElementById('set-gsc-code').value,
        bing_site_verification: document.getElementById('set-bing-code').value,
        ga4_measurement_id: document.getElementById('set-ga4-id').value,
        indexnow_key: document.getElementById('set-indexnow-key').value,
        robots_txt_custom: document.getElementById('set-robots-txt').value
      })
    });
    showToast('Technical SEO & Verification settings updated.');
  });

  document.getElementById('redirect-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/seo/redirects', {
        method: 'POST',
        body: JSON.stringify({
          from_path: document.getElementById('red-from').value,
          to_path: document.getElementById('red-to').value,
          status_code: Number(document.getElementById('red-code').value)
        })
      });
      document.getElementById('red-from').value = '';
      document.getElementById('red-to').value = '';
      showToast('Redirect rule added.');
      loadTechSeo();
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('btn-ping-indexnow').addEventListener('click', async () => {
    const res = await api('/api/admin/seo/indexnow', { method: 'POST', body: '{}' });
    document.getElementById('indexnow-result').textContent =
      `IndexNow Key File verified at ${res.keyLocation} • ${res.submittedCount} URLs packaged (${res.note})`;
    showToast('IndexNow crawl package processed.');
  });

  // ---------------- 4. GOOGLE ADSENSE & SLOTS ----------------
  async function loadMonetization() {
    const data = await api('/api/admin/monetization');
    const s = data.settings;

    document.getElementById('adsense-readiness-list').innerHTML = data.readinessChecklist.map((item) => `
      <li class="audit-check-item">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${item.ready ? '&#9989;' : '&#128310;'} ${esc(item.label)}</strong>
          <span style="font-size:0.75rem;color:${item.ready ? 'var(--adm-green)' : 'var(--adm-amber)'}">${item.ready ? 'Ready' : 'Action Needed Before Live Ads'}</span>
        </div>
        <div style="font-size:0.78rem;color:var(--adm-muted);margin-top:3px">${esc(item.hint)}</div>
      </li>
    `).join('');

    document.getElementById('ads-enabled').checked = s.adsense_enabled;
    document.getElementById('ads-pub-id').value = s.adsense_publisher_id;
    document.getElementById('ads-test-mode').checked = s.adsense_test_mode;
    document.getElementById('ads-consent-banner').checked = s.consent_banner_enabled;
    document.getElementById('ads-txt-editor').value = s.ads_txt_content;

    const slotsWrap = document.getElementById('ad-slots-container');
    slotsWrap.innerHTML = data.slots.map((slot) => `
      <div class="audit-check-item" data-slot="${esc(slot.slot_key)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong>${esc(slot.name)}</strong>
          <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--adm-cyan)">${slot.impressions} imp &bull; ${slot.clicks} clicks</span>
        </div>
        <div style="font-size:0.76rem;color:var(--adm-muted);margin-bottom:8px">${esc(slot.placement_hint)}</div>
        <div style="display:grid;grid-template-columns:auto 1fr 1fr 90px auto;gap:8px;align-items:center">
          <label style="font-size:0.8rem;display:flex;align-items:center;gap:5px">
            <input type="checkbox" class="sl-enabled" ${slot.enabled ? 'checked' : ''}> Active
          </label>
          <select class="sl-mode" style="background:var(--adm-panel);color:var(--adm-text);border:1px solid var(--adm-border);padding:6px;border-radius:5px">
            <option value="placeholder" ${slot.mode === 'placeholder' ? 'selected' : ''}>Preview Shield</option>
            <option value="adsense" ${slot.mode === 'adsense' ? 'selected' : ''}>Live AdSense &lt;ins&gt;</option>
            <option value="custom_html" ${slot.mode === 'custom_html' ? 'selected' : ''}>Custom Sponsor HTML</option>
          </select>
          <input type="text" class="sl-unit" value="${esc(slot.ad_unit_id)}" placeholder="data-ad-slot ID" style="background:var(--adm-panel);color:var(--adm-text);border:1px solid var(--adm-border);padding:6px;border-radius:5px">
          <input type="number" class="sl-height" value="${slot.min_height_px}" min="50" max="600" title="Reserved CLS min-height (px)" style="background:var(--adm-panel);color:var(--adm-text);border:1px solid var(--adm-border);padding:6px;border-radius:5px">
          <button type="button" class="btn btn-sm btn-primary btn-save-slot">Save</button>
        </div>
      </div>
    `).join('');

    slotsWrap.querySelectorAll('.btn-save-slot').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('[data-slot]');
        const slotKey = card.dataset.slot;
        await api(`/api/admin/monetization/slots/${slotKey}`, {
          method: 'PUT',
          body: JSON.stringify({
            enabled: card.querySelector('.sl-enabled').checked,
            mode: card.querySelector('.sl-mode').value,
            ad_unit_id: card.querySelector('.sl-unit').value,
            min_height_px: Number(card.querySelector('.sl-height').value)
          })
        });
        showToast(`Ad slot "${slotKey}" updated.`);
        loadMonetization();
      });
    });
  }

  document.getElementById('btn-sync-adstxt').addEventListener('click', () => {
    const pub = document.getElementById('ads-pub-id').value.trim().replace(/^ca-/, '');
    document.getElementById('ads-txt-editor').value =
      `# Google AdSense Authorized Digital Sellers\ngoogle.com, ${pub || 'pub-0000000000000000'}, DIRECT, f08c47fec0942fa0\n`;
  });

  document.getElementById('adsense-global-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/admin/monetization/settings', {
      method: 'PUT',
      body: JSON.stringify({
        adsense_enabled: document.getElementById('ads-enabled').checked,
        adsense_publisher_id: document.getElementById('ads-pub-id').value,
        adsense_test_mode: document.getElementById('ads-test-mode').checked,
        consent_banner_enabled: document.getElementById('ads-consent-banner').checked,
        ads_txt_content: document.getElementById('ads-txt-editor').value
      })
    });
    showToast('AdSense & /ads.txt saved.');
    loadMonetization();
  });

  // ---------------- 5. GUIDES & POLICY CMS ----------------
  async function loadCms() {
    const [{ guides }, { policies }] = await Promise.all([
      api('/api/admin/guides'),
      api('/api/admin/policies')
    ]);
    cachedGuides = guides;
    cachedPolicies = policies;

    const gTbody = document.getElementById('cms-guides-tbody');
    gTbody.innerHTML = guides.map((g) => `
      <tr>
        <td><a href="/guides/${esc(g.slug)}" target="_blank">${esc(g.title)}</a></td>
        <td><code>${esc(g.focus_keyword || '—')}</code></td>
        <td>${g.views}</td>
        <td style="white-space:nowrap">
          <button type="button" class="btn btn-sm btn-edit-guide" data-id="${g.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-danger btn-del-guide" data-id="${g.id}">Del</button>
        </td>
      </tr>
    `).join('');

    gTbody.querySelectorAll('.btn-edit-guide').forEach((b) => {
      b.addEventListener('click', () => {
        const g = cachedGuides.find((x) => x.id === Number(b.dataset.id));
        if (!g) return;
        document.getElementById('guide-form-heading').textContent = `Editing Guide #${g.id}`;
        document.getElementById('guide-id').value = String(g.id);
        document.getElementById('guide-title').value = g.title;
        document.getElementById('guide-slug').value = g.slug;
        document.getElementById('guide-kw').value = g.focus_keyword;
        document.getElementById('guide-cat').value = g.category;
        document.getElementById('guide-mins').value = g.reading_minutes;
        document.getElementById('guide-excerpt').value = g.excerpt;
        document.getElementById('guide-html').value = g.content_html.trim();
      });
    });

    gTbody.querySelectorAll('.btn-del-guide').forEach((b) => {
      b.addEventListener('click', async () => {
        await api(`/api/admin/guides/${b.dataset.id}`, { method: 'DELETE' });
        showToast('Guide deleted.');
        loadCms();
      });
    });

    const polSel = document.getElementById('policy-selector');
    polSel.innerHTML = policies.map((p) => `<option value="${esc(p.slug)}">/${esc(p.slug)} — ${esc(p.title)}</option>`).join('');
    const syncPolForm = () => {
      const p = cachedPolicies.find((x) => x.slug === polSel.value);
      if (!p) return;
      document.getElementById('policy-title').value = p.title;
      document.getElementById('policy-html').value = p.content_html.trim();
    };
    polSel.onchange = syncPolForm;
    syncPolForm();
  }

  document.getElementById('btn-new-guide').addEventListener('click', () => {
    document.getElementById('guide-form-heading').textContent = 'Create New SEO Hardware Guide';
    document.getElementById('cms-guide-form').reset();
    document.getElementById('guide-id').value = '';
  });

  document.getElementById('cms-guide-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('guide-id').value;
    const payload = {
      title: document.getElementById('guide-title').value,
      slug: document.getElementById('guide-slug').value,
      focus_keyword: document.getElementById('guide-kw').value,
      category: document.getElementById('guide-cat').value,
      reading_minutes: Number(document.getElementById('guide-mins').value),
      excerpt: document.getElementById('guide-excerpt').value,
      meta_description: document.getElementById('guide-excerpt').value,
      content_html: document.getElementById('guide-html').value,
      published: true
    };
    try {
      if (id) {
        await api(`/api/admin/guides/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Guide updated!');
      } else {
        await api('/api/admin/guides', { method: 'POST', body: JSON.stringify(payload) });
        showToast('New SEO Guide published & added to sitemap.xml!');
      }
      document.getElementById('cms-guide-form').reset();
      document.getElementById('guide-id').value = '';
      loadCms();
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('policy-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const slug = document.getElementById('policy-selector').value;
    await api(`/api/admin/policies/${slug}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: document.getElementById('policy-title').value,
        content_html: document.getElementById('policy-html').value
      })
    });
    showToast(`Policy /${slug} updated.`);
    loadCms();
  });

  // ---------------- 6. MODULES & FOREIGN APIS ----------------
  async function loadModulesAndApis() {
    const { modules, externalApis } = await api('/api/admin/modules');

    const modWrap = document.getElementById('modules-list-container');
    modWrap.innerHTML = modules.map((m) => `
      <div class="audit-check-item" data-mkey="${esc(m.module_key)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong>${esc(m.name)} (<code>${esc(m.route_path)}</code>)</strong>
          <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem">
            <input type="checkbox" class="mod-enabled" ${m.enabled ? 'checked' : ''} ${m.module_key === 'keyboard_tester' ? 'disabled' : ''}> Enabled
          </label>
        </div>
        <div style="font-size:0.78rem;color:var(--adm-muted);margin-bottom:8px">${esc(m.description)}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" class="mod-order" value="${m.nav_order}" style="width:70px;background:var(--adm-panel);color:var(--adm-text);border:1px solid var(--adm-border);padding:5px;border-radius:5px" title="Nav Order">
          <input type="text" class="mod-badge" value="${esc(m.badge)}" placeholder="Badge (e.g. Pro)" style="width:130px;background:var(--adm-panel);color:var(--adm-text);border:1px solid var(--adm-border);padding:5px;border-radius:5px">
          <button type="button" class="btn btn-sm btn-save-mod">Save Module</button>
        </div>
      </div>
    `).join('');

    modWrap.querySelectorAll('.btn-save-mod').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('[data-mkey]');
        const key = card.dataset.mkey;
        await api(`/api/admin/modules/${key}`, {
          method: 'PUT',
          body: JSON.stringify({
            enabled: card.querySelector('.mod-enabled').checked,
            nav_order: Number(card.querySelector('.mod-order').value),
            badge: card.querySelector('.mod-badge').value
          })
        });
        showToast('Module navigation updated.');
      });
    });

    const apiWrap = document.getElementById('external-apis-container');
    apiWrap.innerHTML = externalApis.map((a) => `
      <div class="audit-check-item" data-aslug="${esc(a.api_key_slug)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <strong>${esc(a.name)}</strong>
          <span style="font-family:var(--font-mono);font-size:0.74rem;color:var(--adm-cyan)">${esc(a.last_status)}</span>
        </div>
        <div style="font-size:0.77rem;color:var(--adm-muted);margin-bottom:8px">${esc(a.description)}</div>
        <div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center">
          <label style="font-size:0.78rem"><input type="checkbox" class="api-enabled" ${a.enabled ? 'checked' : ''}> Active</label>
          <input type="text" class="api-url" value="${esc(a.endpoint_url)}" style="background:var(--adm-panel);color:var(--adm-text);border:1px solid var(--adm-border);padding:6px;border-radius:5px">
          <button type="button" class="btn btn-sm btn-save-api">Save</button>
          <button type="button" class="btn btn-sm btn-primary btn-probe-api">Probe API</button>
        </div>
      </div>
    `).join('');

    apiWrap.querySelectorAll('.btn-save-api').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('[data-aslug]');
        await api(`/api/admin/external-apis/${card.dataset.aslug}`, {
          method: 'PUT',
          body: JSON.stringify({
            enabled: card.querySelector('.api-enabled').checked,
            endpoint_url: card.querySelector('.api-url').value
          })
        });
        showToast('Foreign API connector saved.');
      });
    });

    apiWrap.querySelectorAll('.btn-probe-api').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('[data-aslug]');
        btn.textContent = 'Probing...';
        const res = await api(`/api/admin/external-apis/${card.dataset.aslug}/test`, { method: 'POST', body: '{}' });
        showToast(`API Probe: ${res.statusText}`);
        loadModulesAndApis();
      });
    });
  }

  // ---------------- 7. INBOX ----------------
  async function loadInbox() {
    const { messages } = await api('/api/admin/messages');
    const tbody = document.getElementById('inbox-tbody');
    tbody.innerHTML = messages.length > 0
      ? messages.map((m) => `
          <tr style="${m.is_read ? 'opacity:0.72' : 'font-weight:600'}">
            <td>${esc(m.created_at)}</td>
            <td>${esc(m.name)}<br><small style="color:var(--adm-muted)">${esc(m.email)}</small></td>
            <td>${esc(m.subject)}</td>
            <td>${esc(m.message)}</td>
            <td style="white-space:nowrap">
              ${!m.is_read ? `<button type="button" class="btn btn-sm btn-read-msg" data-id="${m.id}">Mark Read</button>` : ''}
              <button type="button" class="btn btn-sm btn-danger btn-del-msg" data-id="${m.id}">Del</button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" style="color:var(--adm-muted)">Inbox is clean — messages sent via /contact appear here.</td></tr>';

    tbody.querySelectorAll('.btn-read-msg').forEach((b) => {
      b.addEventListener('click', async () => {
        await api(`/api/admin/messages/${b.dataset.id}`, { method: 'PATCH', body: '{}' });
        loadInbox();
      });
    });
    tbody.querySelectorAll('.btn-del-msg').forEach((b) => {
      b.addEventListener('click', async () => {
        await api(`/api/admin/messages/${b.dataset.id}`, { method: 'DELETE' });
        loadInbox();
      });
    });
  }

  // ---------------- 8. SECURITY & AUDIT ----------------
  async function loadSecurity() {
    const { logs, sessions } = await api('/api/admin/security/audit');
    const sTbody = document.getElementById('security-sessions-tbody');
    sTbody.innerHTML = sessions.map((s) => `
      <tr>
        <td><code>${esc(s.session_id)}...</code> ${s.is_current ? '<span class="score-pill score-good">Current</span>' : ''}</td>
        <td>${esc(s.ip)}</td>
        <td>${esc(s.expires_at)}</td>
        <td>${!s.is_current ? `<button type="button" class="btn btn-sm btn-danger btn-revoke-sess" data-id="${esc(s.session_id)}">Revoke</button>` : ''}</td>
      </tr>
    `).join('');

    sTbody.querySelectorAll('.btn-revoke-sess').forEach((b) => {
      b.addEventListener('click', async () => {
        await api(`/api/admin/security/sessions/${b.dataset.id}`, { method: 'DELETE' });
        showToast('Session revoked.');
        loadSecurity();
      });
    });

    document.getElementById('security-logs-tbody').innerHTML = logs.map((l) => `
      <tr>
        <td>${esc(l.created_at)}</td>
        <td><code>${esc(l.username)}</code></td>
        <td>${esc(l.ip)}</td>
        <td>${l.success ? '<span style="color:var(--adm-green)">Success</span>' : '<span style="color:var(--adm-red)">Failed</span>'}</td>
        <td>${esc(l.reason)}</td>
      </tr>
    `).join('');
  }

  document.getElementById('password-change-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/admin/security/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: document.getElementById('sec-curr-pw').value,
          newPassword: document.getElementById('sec-new-pw').value
        })
      });
      document.getElementById('password-change-form').reset();
      showToast(res.message);
      loadSecurity();
    } catch (err) {
      showToast(err.message);
    }
  });

  // Bootstrap Admin App
  async function init() {
    try {
      const me = await api('/api/admin/me');
      csrfToken = me.csrfToken;
      const badge = document.getElementById('adm-user-badge');
      if (badge) badge.textContent = `Signed in as ${me.admin.username} (${me.admin.role})`;
      await loadOverview();
    } catch (_) {
      window.location.href = '/admin/login';
    }
  }

  init();
})();
