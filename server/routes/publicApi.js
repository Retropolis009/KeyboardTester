const express = require('express');
const { db } = require('../db');

const router = express.Router();

const CURATED_CORPUS = {
  standard: [
    'Every mechanical switch relies on two precision-stamped copper alloy contact leaves inside a polymer housing. When the slider stem travels past the actuation point, the contacts close the circuit and your microcontroller scans the matrix.',
    'Testing keyboard rollover ensures that holding diagonal movement keys while sprinting or crouching never drops an input. Modern dioded matrices report full N-key rollover over USB without phantom ghost presses.',
    'Consistent typing speed comes from relaxed wrist posture, steady rhythm, and minimizing unnecessary backspace corrections rather than forcing erratic bursts on familiar short words.'
  ],
  hardware: [
    'Cherry MX Brown tactile switches actuate at 2.0 millimeters of travel with 55 centinewtons of operating force, whereas linear Red switches glide smoothly at 45 centinewtons without a tactile bump or audible click jacket.',
    'Hot-swappable printed circuit boards use Kailh or Gateron metal sockets soldered onto the back of the plate assembly, allowing enthusiasts to replace chattering switches in seconds using a simple wire puller.',
    'High-speed USB polling at 1000 Hz queries the keyboard microcontroller every 1.0 millisecond, pairing asymmetric eager debounce firmware with PBT double-shot keycaps for crisp acoustic feedback.'
  ],
  code: [
    'window.addEventListener("keydown", (event) => { const latency = performance.now() - event.timeStamp; activeKeys.add(event.code); updateRolloverPeak(activeKeys.size); });',
    'function detectSwitchChatter(lastPressMs, nowMs, threshold = 32) { const delta = nowMs - lastPressMs; return { chattered: delta > 2 && delta < threshold, deltaMs: Number(delta.toFixed(2)) }; }',
    'export async function generateSitemap(routes, baseUrl) { return routes.filter((r) => r.indexable).map((r) => `${baseUrl}${r.path}`); }'
  ]
};

// Record real-user Core Web Vitals (LCP, CLS, INP, TTFB)
router.post('/vitals', (req, res) => {
  const { metric, value, path: routePath } = req.body || {};
  const allowed = ['LCP', 'CLS', 'INP', 'TTFB', 'FCP'];
  if (!allowed.includes(metric) || typeof value !== 'number' || !Number.isFinite(value)) {
    return res.status(400).json({ ok: false });
  }
  db.prepare(`
    INSERT INTO analytics_events (event_type, route_path, metric_name, metric_value)
    VALUES ('cwv', ?, ?, ?)
  `).run(String(routePath || '/').slice(0, 140), metric, Number(value.toFixed(4)));
  res.json({ ok: true });
});

// Record AdSense slot impression or click telemetry
router.post('/ads/event', (req, res) => {
  const { slotKey, action } = req.body || {};
  if (!slotKey || !['impression', 'click'].includes(action)) {
    return res.status(400).json({ ok: false });
  }
  if (action === 'impression') {
    db.prepare(`UPDATE ad_slots SET impressions = impressions + 1 WHERE slot_key = ?`).run(String(slotKey));
  } else {
    db.prepare(`UPDATE ad_slots SET clicks = clicks + 1 WHERE slot_key = ?`).run(String(slotKey));
  }
  res.json({ ok: true });
});

// Contact form submission (stored in Admin Inbox)
router.post('/contact', (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Please complete your name, email address, and message.' });
  }
  const cleanEmail = String(email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  db.prepare(`
    INSERT INTO contact_messages (name, email, subject, message)
    VALUES (?, ?, ?, ?)
  `).run(
    String(name).trim().slice(0, 100),
    cleanEmail.slice(0, 140),
    String(subject || 'General Inquiry').trim().slice(0, 160),
    String(message).trim().slice(0, 4000)
  );
  res.json({ ok: true, message: 'Thank you! Your message has been received by our team.' });
});

// Typing corpus endpoint with live Foreign API (GitHub API) support + offline fallback
router.get('/typing-corpus', async (req, res) => {
  const mode = String(req.query.mode || 'standard');

  if (mode === 'github_live') {
    const extApi = db.prepare(`SELECT * FROM external_apis WHERE api_key_slug = 'github_code_corpus'`).get();
    if (extApi && extApi.enabled) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const ghRes = await fetch(extApi.endpoint_url || 'https://api.github.com/repos/nodejs/node/readme', {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'KeyPulse-Diagnostic-Suite/1.0'
          },
          signal: controller.signal
        });
        clearTimeout(timer);

        if (ghRes.ok) {
          const data = await ghRes.json();
          if (data && data.content) {
            const decoded = Buffer.from(data.content, 'base64').toString('utf8');
            const cleanLines = decoded
              .replace(/```[\s\S]*?```/g, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
              .replace(/[#>*_`~|-]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            if (cleanLines.length > 220) {
              const snippet = cleanLines.slice(0, 340).replace(/\s+\S*$/, '') + '.';
              db.prepare(`
                UPDATE external_apis
                SET last_status = '200 OK (GitHub Live)', last_checked_at = datetime('now')
                WHERE api_key_slug = 'github_code_corpus'
              `).run();
              return res.json({ mode: 'github_live', source: 'api.github.com', text: snippet });
            }
          }
        }
      } catch (_) {
        // Graceful fallback to local code corpus
      }
    }
    const list = CURATED_CORPUS.code;
    return res.json({
      mode: 'github_live',
      source: 'local_fallback',
      text: list[Math.floor(Math.random() * list.length)]
    });
  }

  const list = CURATED_CORPUS[mode] || CURATED_CORPUS.standard;
  const text = list[Math.floor(Math.random() * list.length)];
  res.json({ mode, source: 'curated', text });
});

router.get('/modules', (_req, res) => {
  const modules = db.prepare('SELECT module_key, name, route_path, description, badge FROM feature_modules WHERE enabled = 1 ORDER BY nav_order ASC').all();
  res.json({ modules });
});

module.exports = router;
