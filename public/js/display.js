(function () {
  const launchBtn = document.getElementById('btn-display-fullscreen');
  if (!launchBtn) return;

  const elHz = document.getElementById('stat-display-hz');
  const elFrameMs = document.getElementById('stat-display-frame-ms');
  const elPacing = document.getElementById('stat-display-pacing');
  const elRes = document.getElementById('stat-display-res');
  const elViewport = document.getElementById('stat-display-viewport');
  const elDpr = document.getElementById('stat-display-dpr');
  const remeasureBtn = document.getElementById('btn-display-hz');

  const swatchGrid = document.getElementById('pixel-swatch-grid');
  const grayscaleRamp = document.getElementById('grayscale-ramp');
  const colorRamp = document.getElementById('color-ramp');
  const pacingCanvas = document.getElementById('frame-pacing-canvas');

  const stage = document.getElementById('pixel-fullscreen-stage');
  const stageHud = document.getElementById('pixel-stage-hud');

  const COLORS = [
    { name: 'Red', hex: '#ff0000' },
    { name: 'Green', hex: '#00ff00' },
    { name: 'Blue', hex: '#0000ff' },
    { name: 'White', hex: '#ffffff' },
    { name: 'Black', hex: '#000000' },
    { name: 'Cyan', hex: '#00ffff' },
    { name: 'Magenta', hex: '#ff00ff' },
    { name: 'Yellow', hex: '#ffff00' },
    { name: 'Grey 50%', hex: '#808080' }
  ];

  // ---------------- Static environment readouts ----------------
  if (elRes) elRes.textContent = `${screen.width}×${screen.height}`;
  if (elViewport) elViewport.textContent = `${window.innerWidth}×${window.innerHeight}`;
  if (elDpr) elDpr.textContent = `${window.devicePixelRatio.toFixed(2)}x`;

  // ---------------- Swatches ----------------
  if (swatchGrid) {
    swatchGrid.innerHTML = COLORS.map((c, i) =>
      `<button type="button" class="pixel-swatch-btn" data-index="${i}" style="background:${c.hex};color:${c.hex === '#ffffff' ? '#111' : c.hex === '#000000' ? '#fff' : '#111'}">${c.name}</button>`
    ).join('');
  }

  // ---------------- Greyscale & colour ramps ----------------
  if (grayscaleRamp) {
    grayscaleRamp.innerHTML = Array.from({ length: 16 }, (_, i) => {
      const v = Math.round((i / 15) * 255);
      return `<div style="background:rgb(${v},${v},${v})"></div>`;
    }).join('');
  }

  if (colorRamp) {
    colorRamp.innerHTML = Array.from({ length: 16 }, (_, i) => {
      const t = i / 15;
      const r = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(t - 0.0) * 3)));
      const g = Math.round(255 * (1 - Math.abs(t - 0.5) * 2));
      const b = Math.round(255 * Math.min(1, Math.max(0, (t - 0.5) * 2)));
      return `<div style="background:rgb(${r},${g},${b})"></div>`;
    }).join('');
  }

  // ---------------- Refresh-rate measurement ----------------
  const frameStamps = [];
  const pacingBars = [];
  let measuring = false;
  let measureStart = 0;
  let rafId = null;

  function median(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function drawPacing() {
    if (!pacingCanvas) return;
    const ctx = pacingCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = pacingCanvas.getBoundingClientRect();
    const w = Math.max(200, Math.floor(rect.width));
    const h = Math.max(60, Math.floor(rect.height));
    if (pacingCanvas.width !== w * dpr || pacingCanvas.height !== h * dpr) {
      pacingCanvas.width = w * dpr;
      pacingCanvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const baseFrame = 1000 / 60;
    const maxMs = Math.max(30, ...pacingBars);
    const barW = w / Math.max(60, pacingBars.length);

    pacingBars.forEach((ms, i) => {
      const ratio = Math.min(1, ms / maxMs);
      const barH = Math.max(2, ratio * (h - 8));
      const deviated = ms > baseFrame * 1.6;
      ctx.fillStyle = deviated ? '#dc3838' : (ms > baseFrame * 1.2 ? '#e57e25' : '#2ea043');
      ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
    });
  }

  function tick(ts) {
    if (!measuring) return;
    frameStamps.push(ts);
    if (frameStamps.length > 2) {
      const delta = frameStamps[frameStamps.length - 1] - frameStamps[frameStamps.length - 2];
      if (delta > 0.5 && delta < 200) {
        pacingBars.push(delta);
        if (pacingBars.length > 240) pacingBars.shift();
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopMeasurement() {
    measuring = false;
    if (rafId) cancelAnimationFrame(rafId);

    const deltas = [];
    for (let i = 1; i < frameStamps.length; i++) {
      const d = frameStamps[i] - frameStamps[i - 1];
      if (d > 0.5 && d < 200) deltas.push(d);
    }
    if (deltas.length < 5) {
      if (elHz) elHz.textContent = 'Unavailable';
      return;
    }
    const med = median(deltas);
    const hz = 1000 / med;
    const sorted = [...deltas].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || med;
    const jitter = p95 - med;

    if (elHz) {
      elHz.textContent = `${hz.toFixed(1)} Hz`;
      elHz.className = 'readout-val active';
    }
    if (elFrameMs) elFrameMs.textContent = `${med.toFixed(2)} ms`;
    if (elPacing) {
      if (jitter < 1.5) {
        elPacing.textContent = 'Stable';
        elPacing.className = 'readout-val pass';
      } else if (jitter < 4) {
        elPacing.textContent = `Minor jitter (${jitter.toFixed(1)} ms)`;
        elPacing.className = 'readout-val active';
      } else {
        elPacing.textContent = `Dropped frames (${jitter.toFixed(1)} ms p95)`;
        elPacing.className = 'readout-val fault';
      }
      elPacing.title = `Median ${med.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms across ${deltas.length} frames`;
    }

    // Snap to the closest common panel mode for a friendlier headline
    const modes = [24, 30, 48, 50, 60, 75, 90, 100, 120, 144, 165, 180, 240, 360, 480, 500];
    let closest = modes[0];
    for (const m of modes) {
      if (Math.abs(m - hz) < Math.abs(closest - hz)) closest = m;
    }
    if (elHz && Math.abs(closest - hz) < closest * 0.06) {
      elHz.textContent = `${closest} Hz`;
    }
    drawPacing();
  }

  function startMeasurement(durationMs = 1600) {
    measuring = true;
    frameStamps.length = 0;
    measureStart = performance.now();
    if (elHz) {
      elHz.textContent = 'Measuring…';
      elHz.className = 'readout-val';
    }
    rafId = requestAnimationFrame(tick);
    setTimeout(() => {
      if (measuring && performance.now() - measureStart >= durationMs - 60) stopMeasurement();
    }, durationMs);
  }

  startMeasurement();
  if (remeasureBtn) remeasureBtn.addEventListener('click', () => startMeasurement());
  setInterval(() => {
    if (!measuring) drawPacing();
  }, 500);

  // ---------------- Fullscreen colour cycler ----------------
  let currentColorIndex = 0;
  let stageOpen = false;

  function applyStageColor() {
    if (!stageOpen) return;
    const c = COLORS[currentColorIndex % COLORS.length];
    stage.style.background = c.hex;
    if (stageHud) {
      const inverse = c.hex === '#ffffff' ? '#111' : '#fff';
      stageHud.style.color = inverse;
      stageHud.style.borderColor = inverse;
      stageHud.textContent = `${c.name} (${currentColorIndex + 1}/${COLORS.length}) · Click or Space for next · Esc to exit`;
    }
  }

  function openStage(index = 0) {
    if (!stage) return;
    currentColorIndex = index;
    stageOpen = true;
    stage.classList.remove('hidden');
    applyStageColor();
    if (stage.requestFullscreen) {
      stage.requestFullscreen().catch(() => {});
    }
  }

  function closeStage() {
    stageOpen = false;
    if (stage) stage.classList.add('hidden');
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  if (stage) {
    stage.addEventListener('click', (e) => {
      e.stopPropagation();
      currentColorIndex = (currentColorIndex + 1) % COLORS.length;
      applyStageColor();
    });
  }

  if (swatchGrid) {
    swatchGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.pixel-swatch-btn');
      if (!btn) return;
      openStage(Number(btn.dataset.index) || 0);
    });
  }

  launchBtn.addEventListener('click', () => openStage(0));

  document.addEventListener('keydown', (e) => {
    if (!stageOpen) return;
    if (e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      currentColorIndex = (currentColorIndex + 1) % COLORS.length;
      applyStageColor();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      currentColorIndex = (currentColorIndex - 1 + COLORS.length) % COLORS.length;
      applyStageColor();
    } else if (e.key === 'Escape') {
      closeStage();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && stageOpen) closeStage();
  });
})();
