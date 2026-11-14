(function () {
  const selectEl = document.getElementById('select-gamepad');
  if (!selectEl) return;

  const statusEl = document.getElementById('gamepad-status');
  const deadzoneToggle = document.getElementById('chk-gp-deadzone');
  const rumbleBtn = document.getElementById('btn-gp-rumble');
  const resetBtn = document.getElementById('btn-gp-reset');
  const buttonGrid = document.getElementById('gamepad-button-grid');

  const elId = document.getElementById('stat-gp-id');
  const elMapping = document.getElementById('stat-gp-mapping');
  const elButtons = document.getElementById('stat-gp-buttons');
  const elLeftDrift = document.getElementById('stat-gp-left-drift');
  const elRightDrift = document.getElementById('stat-gp-right-drift');
  const elMaxDrift = document.getElementById('stat-gp-max-drift');

  const leftCanvas = document.getElementById('canvas-left-stick');
  const rightCanvas = document.getElementById('canvas-right-stick');
  const leftCtx = leftCanvas ? leftCanvas.getContext('2d') : null;
  const rightCtx = rightCanvas ? rightCanvas.getContext('2d') : null;

  const elLX = document.getElementById('stat-left-x');
  const elLY = document.getElementById('stat-left-y');
  const elLRadius = document.getElementById('stat-left-radius');
  const elRX = document.getElementById('stat-right-x');
  const elRY = document.getElementById('stat-right-y');
  const elRRadius = document.getElementById('stat-right-radius');

  const elLtVal = document.getElementById('stat-lt-val');
  const elRtVal = document.getElementById('stat-rt-val');
  const meterLt = document.getElementById('meter-lt');
  const meterRt = document.getElementById('meter-rt');

  const BUTTON_LABELS = [
    'A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle',
    'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2',
    'Select / Share', 'Start / Options', 'L3 (Stick)', 'R3 (Stick)',
    'D-Pad Up', 'D-Pad Down', 'D-Pad Left', 'D-Pad Right',
    'Guide / Home', 'Extra 17', 'Extra 18', 'Extra 19'
  ];

  const DEADZONE = 0.08;
  let activeIndex = null;
  let buttonCells = [];
  let rafId = null;

  let leftRadiusMax = 0;
  let rightRadiusMax = 0;
  let maxObserved = 0;

  // Baseline normalisation: raw axes rest near 0, but cheap pads rest off-center.
  // We report the radius of the un-filtered value so real drift stays visible.
  function radiusFor(x, y) {
    return Math.min(1, Math.sqrt(x * x + y * y));
  }

  function deadzoneApply(x, y) {
    if (!deadzoneToggle || !deadzoneToggle.checked) return { x, y };
    const r = Math.sqrt(x * x + y * y);
    if (r < DEADZONE) return { x: 0, y: 0 };
    const scaled = (r - DEADZONE) / (1 - DEADZONE);
    return { x: (x / r) * scaled, y: (y / r) * scaled };
  }

  function drawStick(ctx, canvas, x, y, label) {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 10;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#101215';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#2b3038';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 5% drift circle (healthy threshold)
    ctx.strokeStyle = 'rgba(46,160,67,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.05, 0, Math.PI * 2);
    ctx.stroke();

    // 8% deadzone ring
    ctx.strokeStyle = 'rgba(229,126,37,0.5)';
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, r * DEADZONE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#2b3038';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    const px = cx + x * r;
    const py = cy + y * r;
    ctx.strokeStyle = 'rgba(108,182,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();

    ctx.fillStyle = '#e57e25';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#6f7785';
    ctx.font = '13px monospace';
    ctx.fillText(label, 12, h - 12);
  }

  function buildButtonGrid(count) {
    buttonGrid.innerHTML = '';
    buttonCells = [];
    const total = Math.max(16, count);
    for (let i = 0; i < total; i++) {
      const cell = document.createElement('div');
      cell.className = 'gp-cell';
      cell.dataset.index = String(i);
      cell.textContent = `${i}: ${BUTTON_LABELS[i] || `Button ${i}`}`;
      buttonGrid.appendChild(cell);
      buttonCells.push(cell);
    }
  }

  function gpSummary(gp) {
    return `${gp.id.slice(0, 48)}${gp.id.length > 48 ? '…' : ''}`;
  }

  function updateGamepadList() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const connected = [...pads].filter(Boolean);
    const previous = selectEl.value;
    selectEl.innerHTML = '';
    if (connected.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No controller detected — press a button';
      selectEl.appendChild(opt);
      if (statusEl) statusEl.textContent = 'Waiting for controller';
      if (elId) elId.textContent = 'Not connected';
      return;
    }
    connected.forEach((gp, idx) => {
      const opt = document.createElement('option');
      opt.value = String(gp.index);
      opt.textContent = `${gp.index}: ${gpSummary(gp)}`;
      selectEl.appendChild(opt);
      if (idx === 0 && activeIndex === null) activeIndex = gp.index;
    });
    if (previous && connected.some((g) => String(g.index) === previous)) {
      selectEl.value = previous;
      activeIndex = Number(previous);
    }
    selectEl.value = String(activeIndex !== null ? activeIndex : connected[0].index);
  }

  function getSelectedPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (activeIndex === null) return null;
    return pads[activeIndex] || [...pads].filter(Boolean)[0] || null;
  }

  function loop() {
    const gp = getSelectedPad();
    if (!gp) {
      if (statusEl) statusEl.textContent = 'Waiting for controller';
      rafId = requestAnimationFrame(loop);
      return;
    }

    if (statusEl) statusEl.textContent = `${gp.connected ? 'Connected' : 'Disconnected'} · polled live`;
    if (elId) elId.textContent = gpSummary(gp);
    if (elMapping) elMapping.textContent = gp.mapping || 'non-standard';

    const lx = Number(gp.axes[0] || 0);
    const ly = Number(gp.axes[1] || 0);
    const rx = Number(gp.axes[2] || 0);
    const ry = Number(gp.axes[3] || 0);

    const leftR = radiusFor(lx, ly);
    const rightR = radiusFor(rx, ry);
    leftRadiusMax = Math.max(leftRadiusMax, leftR);
    rightRadiusMax = Math.max(rightRadiusMax, rightR);
    maxObserved = Math.max(maxObserved, leftR, rightR);

    if (elLX) elLX.textContent = lx.toFixed(3);
    if (elLY) elLY.textContent = ly.toFixed(3);
    if (elLRadius) {
      elLRadius.textContent = `${(leftR * 100).toFixed(1)}%`;
      elLRadius.className = `readout-val ${leftR * 100 > 8 ? 'fault' : leftR * 100 > 3 ? 'active' : 'pass'}`;
    }
    if (elRX) elRX.textContent = rx.toFixed(3);
    if (elRY) elRY.textContent = ry.toFixed(3);
    if (elRRadius) {
      elRRadius.textContent = `${(rightR * 100).toFixed(1)}%`;
      elRRadius.className = `readout-val ${rightR * 100 > 8 ? 'fault' : rightR * 100 > 3 ? 'active' : 'pass'}`;
    }

    if (elLeftDrift) {
      elLeftDrift.textContent = `${(leftR * 100).toFixed(1)}%`;
      elLeftDrift.className = `readout-val ${leftR * 100 > 8 ? 'fault' : 'pass'}`;
    }
    if (elRightDrift) {
      elRightDrift.textContent = `${(rightR * 100).toFixed(1)}%`;
      elRightDrift.className = `readout-val ${rightR * 100 > 8 ? 'fault' : 'pass'}`;
    }
    if (elMaxDrift) elMaxDrift.textContent = `${(maxObserved * 100).toFixed(1)}%`;

    const plotLeft = deadzoneApply(lx, ly);
    const plotRight = deadzoneApply(rx, ry);
    drawStick(leftCtx, leftCanvas, plotLeft.x, plotLeft.y, 'LEFT STICK');
    drawStick(rightCtx, rightCanvas, plotRight.x, plotRight.y, 'RIGHT STICK');

    // Triggers: index 6 and 7 in the standard mapping
    const lt = gp.buttons[6] ? gp.buttons[6].value || 0 : 0;
    const rt = gp.buttons[7] ? gp.buttons[7].value || 0 : 0;
    if (elLtVal) elLtVal.textContent = `${Math.round(lt * 100)}%`;
    if (elRtVal) elRtVal.textContent = `${Math.round(rt * 100)}%`;
    if (meterLt) meterLt.style.width = `${Math.round(lt * 100)}%`;
    if (meterRt) meterRt.style.width = `${Math.round(rt * 100)}%`;

    // Buttons
    if (buttonCells.length < gp.buttons.length) buildButtonGrid(gp.buttons.length);
    let pressedCount = 0;
    gp.buttons.forEach((btn, i) => {
      const cell = buttonCells[i];
      if (!cell) return;
      const isPressed = btn.pressed || btn.value > 0.35;
      if (isPressed) pressedCount++;
      cell.classList.toggle('pressed', isPressed);
      if (btn.value > 0) {
        cell.textContent = `${i}: ${BUTTON_LABELS[i] || `Button ${i}`} ${btn.value >= 0.999 ? '' : `(${btn.value.toFixed(2)})`}`.trim();
      } else {
        cell.textContent = `${i}: ${BUTTON_LABELS[i] || `Button ${i}`}`;
      }
    });
    if (elButtons) elButtons.textContent = `${pressedCount} / ${gp.buttons.length}`;

    rafId = requestAnimationFrame(loop);
  }

  function pulseRumble() {
    const gp = getSelectedPad();
    if (!gp) {
      if (statusEl) statusEl.textContent = 'Connect a controller before testing rumble';
      return;
    }
    const actuators = [];
    if (typeof gp.vibrationActuator?.playEffect === 'function') {
      actuators.push(gp.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: 800,
        weakMagnitude: 1.0,
        strongMagnitude: 1.0
      }));
    }
    if (typeof gp.hapticActuators?.length === 'number') {
      for (let i = 0; i < gp.hapticActuators.length; i++) {
        const act = gp.hapticActuators[i];
        if (act && typeof act.pulse === 'function') actuators.push(act.pulse(1.0, 800));
      }
    }
    if (actuators.length === 0) {
      if (statusEl) statusEl.textContent = 'This controller or browser does not expose a haptics actuator';
      return;
    }
    if (statusEl) statusEl.textContent = 'Rumble pulse sent (both motors, 800ms)';
    Promise.allSettled(actuators).then((res) => {
      const failed = res.some((r) => r.status === 'rejected');
      if (failed && statusEl) statusEl.textContent = 'Rumble request rejected by the driver';
    });
  }

  window.addEventListener('gamepadconnected', (e) => {
    activeIndex = e.gamepad.index;
    updateGamepadList();
    if (statusEl) statusEl.textContent = `Connected: ${e.gamepad.id.slice(0, 40)}`;
    if (!rafId) rafId = requestAnimationFrame(loop);
  });

  window.addEventListener('gamepaddisconnected', () => {
    activeIndex = null;
    updateGamepadList();
    if (statusEl) statusEl.textContent = 'Controller disconnected';
  });

  selectEl.addEventListener('change', () => {
    activeIndex = selectEl.value === '' ? null : Number(selectEl.value);
  });

  if (rumbleBtn) rumbleBtn.addEventListener('click', pulseRumble);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      leftRadiusMax = 0;
      rightRadiusMax = 0;
      maxObserved = 0;
      if (elMaxDrift) elMaxDrift.textContent = '0.0%';
      if (statusEl) statusEl.textContent = 'Drift log cleared';
    });
  }

  buildButtonGrid(16);
  updateGamepadList();
  rafId = requestAnimationFrame(loop);

  // Browsers only reveal pads after a gesture; a click anywhere refreshes the list
  document.addEventListener('click', () => updateGamepadList(), { once: false, passive: true });
})();
