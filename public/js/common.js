(function () {
  // 1. Theme Switcher
  const savedTheme = localStorage.getItem('kp_theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  const themeBtn = document.getElementById('btn-theme-toggle');
  function syncThemeLabel() {
    if (!themeBtn) return;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    themeBtn.textContent = isLight ? 'Theme: Light (Switch Dark)' : 'Theme: Dark (Switch Light)';
  }
  syncThemeLabel();

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('kp_theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('kp_theme', 'light');
      }
      syncThemeLabel();
    });
  }

  // Mobile Sidebar Toggle
  const mobileMenuBtn = document.getElementById('btn-mobile-menu');
  const sidebarBody = document.getElementById('sidebar-collapsible');
  if (mobileMenuBtn && sidebarBody) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebarBody.classList.toggle('open');
    });
  }

  // 2. GDPR / Google AdSense Consent Mode v2 Banner
  const consentBanner = document.getElementById('cookie-consent-banner');
  const acceptBtn = document.getElementById('btn-consent-accept');
  const declineBtn = document.getElementById('btn-consent-decline');
  const reopenConsentBtn = document.getElementById('btn-reopen-consent');

  function applyConsent(choice) {
    localStorage.setItem('kp_cookie_consent', choice);
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage: choice,
        ad_user_data: choice,
        ad_personalization: choice,
        analytics_storage: choice
      });
    }
    if (consentBanner) consentBanner.classList.add('hidden');
  }

  if (consentBanner && !localStorage.getItem('kp_cookie_consent')) {
    consentBanner.classList.remove('hidden');
  }
  if (acceptBtn) acceptBtn.addEventListener('click', () => applyConsent('granted'));
  if (declineBtn) declineBtn.addEventListener('click', () => applyConsent('denied'));
  if (reopenConsentBtn && consentBanner) {
    reopenConsentBtn.addEventListener('click', (e) => {
      e.preventDefault();
      consentBanner.classList.remove('hidden');
    });
  }

  // 3. AdSense Slot Impression & Click Telemetry
  const seenSlots = new Set();
  const adWrappers = document.querySelectorAll('.ad-slot-wrapper[data-ad-slot-key]');
  if ('IntersectionObserver' in window && adWrappers.length > 0) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const key = entry.target.getAttribute('data-ad-slot-key');
          if (key && !seenSlots.has(key)) {
            seenSlots.add(key);
            fetch('/api/ads/event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slotKey: key, action: 'impression' })
            }).catch(() => {});
          }
        }
      }
    }, { threshold: 0.4 });

    adWrappers.forEach((el) => {
      io.observe(el);
      el.addEventListener('click', () => {
        const key = el.getAttribute('data-ad-slot-key');
        if (key) {
          fetch('/api/ads/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotKey: key, action: 'click' })
          }).catch(() => {});
        }
      });
    });
  }

  // 4. Core Web Vitals Beacon (TTFB, LCP, CLS)
  function sendVital(metric, value) {
    fetch('/api/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric, value, path: window.location.pathname }),
      keepalive: true
    }).catch(() => {});
  }

  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && nav.responseStart > 0) {
      sendVital('TTFB', Math.round(nav.responseStart));
    }

    if ('PerformanceObserver' in window) {
      let lcpValue = 0;
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) lcpValue = Math.round(last.startTime);
      });
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });

      let clsValue = 0;
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        }
      });
      clsObs.observe({ type: 'layout-shift', buffered: true });

      let vitalsSent = false;
      const flushVitals = () => {
        if (vitalsSent) return;
        vitalsSent = true;
        if (lcpValue > 0) sendVital('LCP', lcpValue);
        sendVital('CLS', Number(clsValue.toFixed(4)));
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushVitals();
      });
      setTimeout(flushVitals, 4500);
    }
  } catch (_) {}

  // 5. Public Contact Form Submission
  const contactForm = document.getElementById('public-contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = document.getElementById('contact-form-status');
      const formData = new FormData(contactForm);
      const payload = Object.fromEntries(formData.entries());
      if (statusEl) statusEl.textContent = 'Sending...';
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          if (statusEl) statusEl.textContent = data.error || 'Unable to submit message.';
          return;
        }
        if (statusEl) statusEl.textContent = data.message || 'Message sent!';
        contactForm.reset();
      } catch (_) {
        if (statusEl) statusEl.textContent = 'Network error while sending message.';
      }
    });
  }
})();
