(function () {
  const pad = document.getElementById('cps-click-pad');
  if (!pad) return;

  const elLastBtn = document.getElementById('stat-mouse-btn');
  const elCps = document.getElementById('stat-mouse-cps');
  const elPeakCps = document.getElementById('stat-mouse-peak');
  const elDoubleFaults = document.getElementById('stat-mouse-faults');
  const elScroll = document.getElementById('stat-mouse-scroll');
  const elPoll = document.getElementById('stat-mouse-poll');
  const elMinDelta = document.getElementById('stat-mouse-min-delta');
  const elDistance = document.getElementById('stat-mouse-distance');
  const resetBtn = document.getElementById('btn-mouse-reset');

  const btnEls = {
    0: document.getElementById('mbtn-left'),
    1: document.getElementById('mbtn-middle'),
    2: document.getElementById('mbtn-right'),
    3: document.getElementById('mbtn-back'),
    4: document.getElementById('mbtn-fwd')
  };

  const BUTTON_NAMES = { 0: 'Left (M1)', 1: 'Middle (M3)', 2: 'Right (M2)', 3: 'Back (M4)', 4: 'Forward (M5)' };
  const DOUBLE_CLICK_MS = 52;

  let clickTimestamps = [];
  let peakCps = 0;
  let doubleFaults = 0;
  let lastPressByButton = new Map();
  let scrollUp = 0;
  let scrollDown = 0;
  let distancePx = 0;
  let lastPos = null;
  let lastMoveStamp = null;
  let fastestMoveDelta = null;
  let lockCps = false;

  // ---------------- CPS engine ----------------
  function computeCps() {
    const now = performance.now();
    clickTimestamps = clickTimestamps.filter((t) => now - t <= 1000);
    return clickTimestamps.length;
  }

  function refreshCps() {
    const cps = computeCps();
    if (elCps) elCps.textContent = `${cps} CPS`;
    if (cps > peakCps) {
      peakCps = cps;
      if (elPeakCps) elPeakCps.textContent = `${peakCps} Peak CPS`;
    }
  }

  const cpsTicker = setInterval(() => {
    if (!lockCps) refreshCps();
  }, 100);
  window.addEventListener('beforeunload', () => clearInterval(cpsTicker));

  // ---------------- Polling-rate estimation ----------------
  function estimatePollHz(minDeltaMs) {
    if (!minDeltaMs) return null;
    const raw = 1000 / minDeltaMs;
    const buckets = [125, 250, 500, 1000, 2000, 4000, 8000];
    let closest = buckets[0];
    for (const b of buckets) {
      if (Math.abs(b - raw) < Math.abs(closest - raw)) closest = b;
    }
    return { hz: closest, raw: Math.round(raw) };
  }

  function updatePollReadout() {
    if (!elPoll) return;
    const est = estimatePollHz(fastestMoveDelta);
    if (!est) {
      elPoll.textContent = 'Move mouse…';
      elPoll.className = 'readout-val';
      return;
    }
    elPoll.textContent = `~${est.hz} Hz`;
    elPoll.className = 'readout-val active';
    elPoll.title = `Fastest observed pointer delta ${fastestMoveDelta.toFixed(2)} ms (raw ${est.raw} Hz)`;
    if (elMinDelta) elMinDelta.textContent = `${fastestMoveDelta.toFixed(2)} ms`;
  }

  function handleMove(e) {
    const now = performance.now();
    const x = e.clientX;
    const y = e.clientY;
    if (lastPos) {
      distancePx += Math.hypot(x - lastPos.x, y - lastPos.y);
    }
    lastPos = { x, y };

    const stamp = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : now;
    if (lastMoveStamp !== null) {
      const d = stamp - lastMoveStamp;
      // Ignore coalesced/duplicate reports and huge pauses
      if (d > 0.2 && d < 60) {
        if (fastestMoveDelta === null || d < fastestMoveDelta) {
          fastestMoveDelta = d;
          updatePollReadout();
        }
      }
    }
    lastMoveStamp = stamp;

    if (elDistance) elDistance.textContent = `${Math.round(distancePx)} px`;
  }

  // ---------------- Button & click handling ----------------
  function pressButton(buttonIndex, now) {
    const el = btnEls[buttonIndex];
    if (el) el.classList.add('pressed');

    const prevPress = lastPressByButton.get(buttonIndex);
    if (prevPress !== undefined) {
      const gap = now - prevPress;
      // two distinct physical presses closer than the OS double-click window
      if (gap > 0 && gap < DOUBLE_CLICK_MS) {
        doubleFaults++;
        if (elDoubleFaults) {
          elDoubleFaults.textContent = `${doubleFaults} Fault${doubleFaults === 1 ? '' : 's'}`;
          elDoubleFaults.className = 'readout-val fault';
        }
      }
    }
    lastPressByButton.set(buttonIndex, now);
  }

  function releaseButton(buttonIndex) {
    const el = btnEls[buttonIndex];
    if (el) el.classList.remove('pressed');
  }

  pad.addEventListener('contextmenu', (e) => e.preventDefault());

  pad.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const now = performance.now();
    pad.classList.add('clicking');
    clickTimestamps.push(now);
    if (elLastBtn) {
      elLastBtn.textContent = BUTTON_NAMES[e.button] || `Button ${e.button}`;
      elLastBtn.className = 'readout-val active';
    }
    pressButton(e.button, now);
    refreshCps();
  });

  pad.addEventListener('mouseup', (e) => {
    pad.classList.remove('clicking');
    releaseButton(e.button);
  });

  pad.addEventListener('mouseleave', () => {
    pad.classList.remove('clicking');
    Object.keys(btnEls).forEach((idx) => releaseButton(Number(idx)));
    lastPos = null;
    lastMoveStamp = null;
  });

  pad.addEventListener('mousemove', handleMove);

  pad.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) scrollUp++;
    else scrollDown++;
    if (elScroll) elScroll.textContent = `↑${scrollUp} / ↓${scrollDown}`;
    if (elLastBtn) {
      elLastBtn.textContent = e.deltaY < 0 ? 'Scroll Up' : 'Scroll Down';
      elLastBtn.className = 'readout-val active';
    }
    const flash = btnEls[1];
    if (flash) {
      flash.classList.add('pressed');
      setTimeout(() => flash.classList.remove('pressed'), 90);
    }
  }, { passive: false });

  // Global pointer sampling so polling can be measured anywhere on the page
  window.addEventListener('mousemove', (e) => {
    if (e.target === pad || pad.contains(e.target)) return;
    if (lastPos === null) {
      lastPos = { x: e.clientX, y: e.clientY };
    }
    lastMoveStamp = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : performance.now();
    distancePx += 0;
    if (elDistance) elDistance.textContent = `${Math.round(distancePx)} px`;
  });

  // ---------------- Reset ----------------
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      lockCps = true;
      clickTimestamps = [];
      peakCps = 0;
      doubleFaults = 0;
      lastPressByButton = new Map();
      scrollUp = 0;
      scrollDown = 0;
      distancePx = 0;
      fastestMoveDelta = null;
      lastPos = null;
      lastMoveStamp = null;
      if (elCps) elCps.textContent = '0 CPS';
      if (elPeakCps) elPeakCps.textContent = '0 Peak CPS';
      if (elDoubleFaults) {
        elDoubleFaults.textContent = '0 Clean';
        elDoubleFaults.className = 'readout-val pass';
      }
      if (elScroll) elScroll.textContent = '↑0 / ↓0';
      if (elDistance) elDistance.textContent = '0 px';
      if (elMinDelta) elMinDelta.textContent = '—';
      if (elPoll) {
        elPoll.textContent = 'Move mouse…';
        elPoll.className = 'readout-val';
      }
      if (elLastBtn) {
        elLastBtn.textContent = 'Ready';
        elLastBtn.className = 'readout-val active';
      }
      Object.values(btnEls).forEach((el) => el && el.classList.remove('pressed'));
      setTimeout(() => { lockCps = false; }, 120);
    });
  }
})();
