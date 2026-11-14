(function () {
  const pad = document.getElementById('cps-click-pad');
  if (!pad) return;

  const elLastBtn = document.getElementById('stat-mouse-btn');
  const elCps = document.getElementById('stat-mouse-cps');
  const elPeakCps = document.getElementById('stat-mouse-peak');
  const elDoubleFaults = document.getElementById('stat-mouse-faults');
  const elScroll = document.getElementById('stat-mouse-scroll');
  const resetBtn = document.getElementById('btn-mouse-reset');

  const btnBadges = {
    0: document.getElementById('mbtn-left'),
    1: document.getElementById('mbtn-middle'),
    2: document.getElementById('mbtn-right'),
    3: document.getElementById('mbtn-back'),
    4: document.getElementById('mbtn-fwd')
  };

  const btnNames = {
    0: 'Left Click (M1)',
    1: 'Middle Wheel (M3)',
    2: 'Right Click (M2)',
    3: 'Side Back (M4)',
    4: 'Side Forward (M5)'
  };

  const clickTimestamps = [];
  const lastDownByBtn = {};
  let doubleClickFaults = 0;
  let peakCps = 0;
  let scrollUp = 0;
  let scrollDown = 0;

  function updateCps() {
    const now = performance.now();
    while (clickTimestamps.length > 0 && now - clickTimestamps[0] > 1000) {
      clickTimestamps.shift();
    }
    const currentCps = clickTimestamps.length;
    if (currentCps > peakCps) peakCps = currentCps;
    if (elCps) elCps.textContent = `${currentCps} CPS`;
    if (elPeakCps) elPeakCps.textContent = `${peakCps} Peak CPS`;
  }

  setInterval(updateCps, 120);

  pad.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const now = performance.now();
    const btn = e.button;
    const prev = lastDownByBtn[btn];

    if (prev !== undefined) {
      const gap = now - prev;
      // Microswitch mechanical bounce typically occurs < 52ms
      if (gap >= 2 && gap < 52) {
        doubleClickFaults++;
        if (elDoubleFaults) {
          elDoubleFaults.textContent = `${doubleClickFaults} Fault (${ Math.round(gap) }ms)!`;
          elDoubleFaults.className = 'telemetry-value warn';
        }
      }
    }
    lastDownByBtn[btn] = now;
    clickTimestamps.push(now);

    if (elLastBtn) elLastBtn.textContent = btnNames[btn] || `Button ${btn}`;
    const badge = btnBadges[btn];
    if (badge) {
      badge.classList.add('pressed', 'tested');
    }
    pad.classList.add('clicking');
    updateCps();
  });

  window.addEventListener('mouseup', (e) => {
    const badge = btnBadges[e.button];
    if (badge) badge.classList.remove('pressed');
    pad.classList.remove('clicking');
  });

  pad.addEventListener('contextmenu', (e) => e.preventDefault());

  pad.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) scrollUp++;
    else if (e.deltaY > 0) scrollDown++;
    if (elScroll) elScroll.textContent = `↑ ${scrollUp} / ↓ ${scrollDown}`;
  }, { passive: false });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      clickTimestamps.length = 0;
      Object.keys(lastDownByBtn).forEach((k) => delete lastDownByBtn[k]);
      doubleClickFaults = 0;
      peakCps = 0;
      scrollUp = 0;
      scrollDown = 0;
      if (elLastBtn) elLastBtn.textContent = 'Ready';
      if (elCps) elCps.textContent = '0 CPS';
      if (elPeakCps) elPeakCps.textContent = '0 Peak CPS';
      if (elDoubleFaults) {
        elDoubleFaults.textContent = '0 Clean';
        elDoubleFaults.className = 'telemetry-value good';
      }
      if (elScroll) elScroll.textContent = '↑ 0 / ↓ 0';
      Object.values(btnBadges).forEach((el) => {
        if (el) el.classList.remove('pressed', 'tested');
      });
    });
  }
})();
