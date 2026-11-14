(function () {
  const mount = document.getElementById('keyboard-mount');
  if (!mount) return;

  // Helper key builders
  const k = (code, label, u = 1, sub = '') => ({ code, label, u, sub });
  const sp = (u = 0.25) => ({ spacer: true, u });

  const FN_ROW_STD = [
    k('Escape', 'Esc', 1),
    sp(1),
    k('F1', 'F1'), k('F2', 'F2'), k('F3', 'F3'), k('F4', 'F4'),
    sp(0.5),
    k('F5', 'F5'), k('F6', 'F6'), k('F7', 'F7'), k('F8', 'F8'),
    sp(0.5),
    k('F9', 'F9'), k('F10', 'F10'), k('F11', 'F11'), k('F12', 'F12')
  ];

  const MAIN_ROWS_ANSI = [
    [
      k('Backquote', '`', 1, '~'), k('Digit1', '1', 1, '!'), k('Digit2', '2', 1, '@'),
      k('Digit3', '3', 1, '#'), k('Digit4', '4', 1, '$'), k('Digit5', '5', 1, '%'),
      k('Digit6', '6', 1, '^'), k('Digit7', '7', 1, '&'), k('Digit8', '8', 1, '*'),
      k('Digit9', '9', 1, '('), k('Digit0', '0', 1, ')'), k('Minus', '-', 1, '_'),
      k('Equal', '=', 1, '+'), k('Backspace', 'Backspace', 2)
    ],
    [
      k('Tab', 'Tab', 1.5), k('KeyQ', 'Q'), k('KeyW', 'W'), k('KeyE', 'E'),
      k('KeyR', 'R'), k('KeyT', 'T'), k('KeyY', 'Y'), k('KeyU', 'U'),
      k('KeyI', 'I'), k('KeyO', 'O'), k('KeyP', 'P'),
      k('BracketLeft', '[', 1, '{'), k('BracketRight', ']', 1, '}'), k('Backslash', '\\', 1.5, '|')
    ],
    [
      k('CapsLock', 'Caps', 1.75), k('KeyA', 'A'), k('KeyS', 'S'), k('KeyD', 'D'),
      k('KeyF', 'F'), k('KeyG', 'G'), k('KeyH', 'H'), k('KeyJ', 'J'),
      k('KeyK', 'K'), k('KeyL', 'L'), k('Semicolon', ';', 1, ':'),
      k('Quote', "'", 1, '"'), k('Enter', 'Enter', 2.25)
    ],
    [
      k('ShiftLeft', 'Shift', 2.25), k('KeyZ', 'Z'), k('KeyX', 'X'), k('KeyC', 'C'),
      k('KeyV', 'V'), k('KeyB', 'B'), k('KeyN', 'N'), k('KeyM', 'M'),
      k('Comma', ',', 1, '<'), k('Period', '.', 1, '>'), k('Slash', '/', 1, '?'),
      k('ShiftRight', 'Shift', 2.75)
    ],
    [
      k('ControlLeft', 'Ctrl', 1.25), k('MetaLeft', 'Win', 1.25), k('AltLeft', 'Alt', 1.25),
      k('Space', 'Space', 6.25),
      k('AltRight', 'Alt', 1.25), k('MetaRight', 'Win', 1.25), k('ContextMenu', 'Menu', 1.25),
      k('ControlRight', 'Ctrl', 1.25)
    ]
  ];

  const MAIN_ROWS_ISO = [
    MAIN_ROWS_ANSI[0],
    [
      k('Tab', 'Tab', 1.5), k('KeyQ', 'Q'), k('KeyW', 'W'), k('KeyE', 'E'),
      k('KeyR', 'R'), k('KeyT', 'T'), k('KeyY', 'Y'), k('KeyU', 'U'),
      k('KeyI', 'I'), k('KeyO', 'O'), k('KeyP', 'P'),
      k('BracketLeft', '[', 1, '{'), k('BracketRight', ']', 1, '}'), k('Enter', 'Return', 1.5, 'ISO')
    ],
    [
      k('CapsLock', 'Caps', 1.75), k('KeyA', 'A'), k('KeyS', 'S'), k('KeyD', 'D'),
      k('KeyF', 'F'), k('KeyG', 'G'), k('KeyH', 'H'), k('KeyJ', 'J'),
      k('KeyK', 'K'), k('KeyL', 'L'), k('Semicolon', ';', 1, ':'),
      k('Quote', "'", 1, '@'), k('Backslash', '#', 1, '~'), k('Enter', '↵', 1.25)
    ],
    [
      k('ShiftLeft', 'Shift', 1.25), k('IntlBackslash', '\\', 1, '|'), k('KeyZ', 'Z'),
      k('KeyX', 'X'), k('KeyC', 'C'), k('KeyV', 'V'), k('KeyB', 'B'),
      k('KeyN', 'N'), k('KeyM', 'M'), k('Comma', ',', 1, '<'),
      k('Period', '.', 1, '>'), k('Slash', '/', 1, '?'), k('ShiftRight', 'Shift', 2.75)
    ],
    MAIN_ROWS_ANSI[4]
  ];

  const MAIN_ROWS_MAC = [
    [
      k('Backquote', '`', 1, '~'), k('Digit1', '1', 1, '!'), k('Digit2', '2', 1, '@'),
      k('Digit3', '3', 1, '#'), k('Digit4', '4', 1, '$'), k('Digit5', '5', 1, '%'),
      k('Digit6', '6', 1, '^'), k('Digit7', '7', 1, '&'), k('Digit8', '8', 1, '*'),
      k('Digit9', '9', 1, '('), k('Digit0', '0', 1, ')'), k('Minus', '-', 1, '_'),
      k('Equal', '=', 1, '+'), k('Backspace', 'delete', 2)
    ],
    MAIN_ROWS_ANSI[1],
    [
      k('CapsLock', 'caps lock', 1.75), k('KeyA', 'A'), k('KeyS', 'S'), k('KeyD', 'D'),
      k('KeyF', 'F'), k('KeyG', 'G'), k('KeyH', 'H'), k('KeyJ', 'J'),
      k('KeyK', 'K'), k('KeyL', 'L'), k('Semicolon', ';', 1, ':'),
      k('Quote', "'", 1, '"'), k('Enter', 'return', 2.25)
    ],
    MAIN_ROWS_ANSI[3],
    [
      k('ControlLeft', 'control', 1.25, '⌃'), k('AltLeft', 'option', 1.25, '⌥'), k('MetaLeft', 'command', 1.5, '⌘'),
      k('Space', 'space', 6.0),
      k('MetaRight', 'command', 1.5, '⌘'), k('AltRight', 'option', 1.25, '⌥'),
      k('ControlRight', 'control', 1.25, '⌃'), k('ContextMenu', 'fn', 1.0)
    ]
  ];

  const NAV_CLUSTER = {
    fnRow: [k('PrintScreen', 'PrtSc'), k('ScrollLock', 'ScrLk'), k('Pause', 'Pause')],
    rows: [
      [k('Insert', 'Ins'), k('Home', 'Home'), k('PageUp', 'PgUp')],
      [k('Delete', 'Del'), k('End', 'End'), k('PageDown', 'PgDn')],
      [sp(3)],
      [sp(1), k('ArrowUp', '↑'), sp(1)],
      [k('ArrowLeft', '←'), k('ArrowDown', '↓'), k('ArrowRight', '→')]
    ]
  };

  const NUMPAD_KEYS = [
    { code: 'NumLock', label: 'Num' },
    { code: 'NumpadDivide', label: '/' },
    { code: 'NumpadMultiply', label: '*' },
    { code: 'NumpadSubtract', label: '-' },
    { code: 'Numpad7', label: '7', sub: 'Home' },
    { code: 'Numpad8', label: '8', sub: '↑' },
    { code: 'Numpad9', label: '9', sub: 'PgUp' },
    { code: 'NumpadAdd', label: '+', spanRow: 2 },
    { code: 'Numpad4', label: '4', sub: '←' },
    { code: 'Numpad5', label: '5' },
    { code: 'Numpad6', label: '6', sub: '→' },
    { code: 'Numpad1', label: '1', sub: 'End' },
    { code: 'Numpad2', label: '2', sub: '↓' },
    { code: 'Numpad3', label: '3', sub: 'PgDn' },
    { code: 'NumpadEnter', label: 'Enter', spanRow: 2 },
    { code: 'Numpad0', label: '0', sub: 'Ins', spanCol: 2 },
    { code: 'NumpadDecimal', label: '.', sub: 'Del' }
  ];

  const COMPACT_75_ROWS = [
    [
      k('Escape', 'Esc'), k('F1', 'F1'), k('F2', 'F2'), k('F3', 'F3'), k('F4', 'F4'),
      k('F5', 'F5'), k('F6', 'F6'), k('F7', 'F7'), k('F8', 'F8'), k('F9', 'F9'),
      k('F10', 'F10'), k('F11', 'F11'), k('F12', 'F12'), k('PrintScreen', 'PrtSc'), k('Delete', 'Del')
    ],
    [
      k('Backquote', '`', 1, '~'), k('Digit1', '1'), k('Digit2', '2'), k('Digit3', '3'),
      k('Digit4', '4'), k('Digit5', '5'), k('Digit6', '6'), k('Digit7', '7'),
      k('Digit8', '8'), k('Digit9', '9'), k('Digit0', '0'), k('Minus', '-'),
      k('Equal', '='), k('Backspace', 'Backspace', 2), k('Home', 'Home')
    ],
    [
      k('Tab', 'Tab', 1.5), k('KeyQ', 'Q'), k('KeyW', 'W'), k('KeyE', 'E'),
      k('KeyR', 'R'), k('KeyT', 'T'), k('KeyY', 'Y'), k('KeyU', 'U'),
      k('KeyI', 'I'), k('KeyO', 'O'), k('KeyP', 'P'),
      k('BracketLeft', '['), k('BracketRight', ']'), k('Backslash', '\\', 1.5), k('PageUp', 'PgUp')
    ],
    [
      k('CapsLock', 'Caps', 1.75), k('KeyA', 'A'), k('KeyS', 'S'), k('KeyD', 'D'),
      k('KeyF', 'F'), k('KeyG', 'G'), k('KeyH', 'H'), k('KeyJ', 'J'),
      k('KeyK', 'K'), k('KeyL', 'L'), k('Semicolon', ';'), k('Quote', "'"),
      k('Enter', 'Enter', 2.25), k('PageDown', 'PgDn')
    ],
    [
      k('ShiftLeft', 'Shift', 2.25), k('KeyZ', 'Z'), k('KeyX', 'X'), k('KeyC', 'C'),
      k('KeyV', 'V'), k('KeyB', 'B'), k('KeyN', 'N'), k('KeyM', 'M'),
      k('Comma', ','), k('Period', '.'), k('Slash', '/'),
      k('ShiftRight', 'Shift', 1.75), k('ArrowUp', '↑'), k('End', 'End')
    ],
    [
      k('ControlLeft', 'Ctrl', 1.25), k('MetaLeft', 'Win', 1.25), k('AltLeft', 'Alt', 1.25),
      k('Space', 'Space', 6.25),
      k('AltRight', 'Alt', 1), k('ControlRight', 'Ctrl', 1), k('ContextMenu', 'Fn', 1),
      k('ArrowLeft', '←'), k('ArrowDown', '↓'), k('ArrowRight', '→')
    ]
  ];

  // State
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  let currentLayout = isMac ? 'mac' : 'full_ansi';
  let soundProfile = 'mute';
  let captureShortcuts = true;
  const CHATTER_THRESHOLD_MS = 32;

  const activeKeys = new Set();
  const testedCodes = new Set();
  const pressCounts = new Map();
  const lastReleaseTime = new Map();
  const pressStartTime = new Map();
  const chatterCodes = new Set();
  let chatterFaultCount = 0;
  let maxRollover = 0;
  let totalKeystrokes = 0;
  const keyHistory = [];

  // Audio Synthesizer (Zero External Audio Dependencies)
  let audioCtx = null;
  function playSwitchSound(profile, isUp = false) {
    if (profile === 'mute') return;
    try {
      if (!audioCtx) {
        const AudioContextCls = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCls) return;
        audioCtx = new AudioContextCls();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      if (profile === 'clicky') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isUp ? 1450 : 2100, now);
        osc.frequency.exponentialRampToValueAtTime(280, now + 0.028);
        gain.gain.setValueAtTime(isUp ? 0.05 : 0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      } else if (profile === 'tactile') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isUp ? 520 : 780, now);
        osc.frequency.exponentialRampToValueAtTime(170, now + 0.032);
        gain.gain.setValueAtTime(isUp ? 0.04 : 0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      } else {
        // Linear Thock
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isUp ? 260 : 340, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.04);
        gain.gain.setValueAtTime(isUp ? 0.05 : 0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
      }

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } catch (_) {}
  }

  function buildRowEl(items, extraClass = '') {
    const rowEl = document.createElement('div');
    rowEl.className = `kb-row ${extraClass}`.trim();
    for (const item of items) {
      if (item.spacer) {
        const spEl = document.createElement('div');
        spEl.className = 'kb-spacer';
        spEl.style.width = `calc(${item.u} * 48px + (${item.u} - 1) * 6px)`;
        rowEl.appendChild(spEl);
      } else {
        const keyEl = document.createElement('div');
        keyEl.className = 'keycap';
        keyEl.dataset.code = item.code;
        keyEl.style.setProperty('--u', String(item.u || 1));
        keyEl.innerHTML = `
          <span class="k-sub">${item.sub || ''}</span>
          <span class="k-primary">${item.label}</span>
          <span class="k-count"></span>
        `;
        keyEl.addEventListener('mousedown', () => simulateKey(item.code, item.label, true));
        keyEl.addEventListener('mouseup', () => simulateKey(item.code, item.label, false));
        keyEl.addEventListener('mouseleave', () => {
          if (activeKeys.has(item.code)) simulateKey(item.code, item.label, false);
        });
        rowEl.appendChild(keyEl);
      }
    }
    return rowEl;
  }

  function renderKeyboard() {
    mount.innerHTML = '';
    const chassis = document.createElement('div');
    chassis.className = 'keyboard-chassis';

    if (currentLayout === 'compact_75') {
      const sec = document.createElement('div');
      sec.className = 'kb-section';
      COMPACT_75_ROWS.forEach((r, idx) => {
        sec.appendChild(buildRowEl(r, idx === 0 ? 'fn-row' : ''));
      });
      chassis.appendChild(sec);
    } else if (currentLayout === 'mini_60') {
      const sec = document.createElement('div');
      sec.className = 'kb-section';
      const rows60 = MAIN_ROWS_ANSI.map((r, idx) => {
        if (idx === 0) {
          const copy = [...r];
          copy[0] = k('Escape', 'Esc', 1, '`');
          return copy;
        }
        return r;
      });
      rows60.forEach((r) => sec.appendChild(buildRowEl(r)));
      chassis.appendChild(sec);
    } else {
      // Main Section (ANSI, ISO, TKL, or Mac)
      const mainSec = document.createElement('div');
      mainSec.className = 'kb-section';
      mainSec.appendChild(buildRowEl(FN_ROW_STD, 'fn-row'));
      const mainMatrix = currentLayout === 'iso_105'
        ? MAIN_ROWS_ISO
        : (currentLayout === 'mac' ? MAIN_ROWS_MAC : MAIN_ROWS_ANSI);
      mainMatrix.forEach((r) => mainSec.appendChild(buildRowEl(r)));
      chassis.appendChild(mainSec);

      // Navigation Section
      const navSec = document.createElement('div');
      navSec.className = 'kb-section';
      navSec.appendChild(buildRowEl(NAV_CLUSTER.fnRow, 'fn-row'));
      NAV_CLUSTER.rows.forEach((r) => navSec.appendChild(buildRowEl(r)));
      chassis.appendChild(navSec);

      // Numpad Section (Full ANSI, ISO, Mac Full)
      if (currentLayout !== 'tkl_87') {
        const numSec = document.createElement('div');
        numSec.className = 'kb-section';
        // Empty spacer aligned with Fn row
        const fnSpacer = document.createElement('div');
        fnSpacer.className = 'kb-row fn-row';
        numSec.appendChild(fnSpacer);

        const grid = document.createElement('div');
        grid.className = 'kb-numpad-grid';
        for (const nk of NUMPAD_KEYS) {
          const keyEl = document.createElement('div');
          keyEl.className = 'keycap';
          if (nk.spanCol === 2) keyEl.classList.add('span-col-2');
          if (nk.spanRow === 2) keyEl.classList.add('span-row-2');
          keyEl.dataset.code = nk.code;
          keyEl.innerHTML = `
            <span class="k-sub">${nk.sub || ''}</span>
            <span class="k-primary">${nk.label}</span>
            <span class="k-count"></span>
          `;
          keyEl.addEventListener('mousedown', () => simulateKey(nk.code, nk.label, true));
          keyEl.addEventListener('mouseup', () => simulateKey(nk.code, nk.label, false));
          grid.appendChild(keyEl);
        }
        numSec.appendChild(grid);
        chassis.appendChild(numSec);
      }
    }

    mount.appendChild(chassis);
    syncAllKeyStates();
    updateTelemetryReadouts();
  }

  function getLayoutUniqueCodes() {
    const codes = new Set();
    mount.querySelectorAll('.keycap[data-code]').forEach((el) => {
      codes.add(el.dataset.code);
    });
    return codes;
  }

  function syncKeyElement(code) {
    const els = mount.querySelectorAll(`.keycap[data-code="${CSS.escape(code)}"]`);
    els.forEach((el) => {
      el.classList.toggle('pressed', activeKeys.has(code));
      el.classList.toggle('tested', testedCodes.has(code));
      el.classList.toggle('chatter', chatterCodes.has(code));
      const cntEl = el.querySelector('.k-count');
      const count = pressCounts.get(code) || 0;
      if (cntEl) cntEl.textContent = count > 0 ? String(count) : '';
    });
  }

  function syncAllKeyStates() {
    mount.querySelectorAll('.keycap[data-code]').forEach((el) => {
      syncKeyElement(el.dataset.code);
    });
  }

  // Telemetry DOM Nodes
  const elLastKey = document.getElementById('stat-last-key');
  const elEventCode = document.getElementById('stat-event-code');
  const elRollover = document.getElementById('stat-nkro');
  const elTested = document.getElementById('stat-tested-progress');
  const elHoldMs = document.getElementById('stat-hold-ms');
  const elChatter = document.getElementById('stat-chatter-count');
  const elStream = document.getElementById('key-history-stream');

  function updateTelemetryReadouts(extra = {}) {
    if (extra.keyLabel !== undefined && elLastKey) {
      elLastKey.textContent = extra.keyLabel === ' ' ? 'Space' : extra.keyLabel;
    }
    if (extra.code !== undefined && elEventCode) {
      elEventCode.textContent = `${extra.code}${extra.keyCode ? ` (${extra.keyCode})` : ''}`;
    }
    if (elRollover) {
      elRollover.textContent = `${activeKeys.size} Active / ${maxRollover} Peak`;
    }
    if (elTested) {
      const layoutCodes = getLayoutUniqueCodes();
      let testedInLayout = 0;
      layoutCodes.forEach((c) => {
        if (testedCodes.has(c)) testedInLayout++;
      });
      const pct = layoutCodes.size > 0 ? Math.round((testedInLayout / layoutCodes.size) * 100) : 0;
      elTested.textContent = `${testedInLayout}/${layoutCodes.size} (${pct}%)`;
    }
    if (extra.holdMs !== undefined && elHoldMs) {
      elHoldMs.textContent = `${extra.holdMs} ms`;
    }
    if (elChatter) {
      elChatter.textContent = chatterFaultCount === 0 ? '0 Clean' : `${chatterFaultCount} Bounce!`;
      elChatter.className = `telemetry-value ${chatterFaultCount > 0 ? 'warn' : 'good'}`;
    }
  }

  function pushStreamChip(label, code, chattered, deltaMs) {
    keyHistory.unshift({ label, code, chattered, deltaMs });
    if (keyHistory.length > 18) keyHistory.pop();
    if (!elStream) return;
    elStream.innerHTML = keyHistory.map((item) => {
      const text = item.label === ' ' ? 'Space' : item.label;
      const badge = item.chattered ? ` ⚠ ${item.deltaMs}ms` : '';
      return `<span class="stream-chip${item.chattered ? ' chatter-flag' : ''}">${text.replace(/</g, '&lt;')}${badge}</span>`;
    }).join('');
  }

  function handlePress(code, keyLabel, keyCode, nowMs) {
    const prevUp = lastReleaseTime.get(code);
    let chattered = false;
    let deltaMs = 0;

    if (prevUp !== undefined) {
      deltaMs = Math.round(nowMs - prevUp);
      if (deltaMs >= 2 && deltaMs < CHATTER_THRESHOLD_MS) {
        chattered = true;
        chatterFaultCount++;
        chatterCodes.add(code);
      }
    }

    activeKeys.add(code);
    if (activeKeys.size > maxRollover) maxRollover = activeKeys.size;

    testedCodes.add(code);
    totalKeystrokes++;
    pressCounts.set(code, (pressCounts.get(code) || 0) + 1);
    pressStartTime.set(code, nowMs);

    playSwitchSound(soundProfile, false);
    syncKeyElement(code);
    pushStreamChip(keyLabel || code, code, chattered, deltaMs);
    updateTelemetryReadouts({ keyLabel: keyLabel || code, code, keyCode });
  }

  function handleRelease(code, nowMs) {
    const started = pressStartTime.get(code);
    let holdMs = undefined;
    if (started !== undefined) {
      holdMs = Math.max(1, Math.round(nowMs - started));
    }
    activeKeys.delete(code);
    lastReleaseTime.set(code, nowMs);
    playSwitchSound(soundProfile, true);
    syncKeyElement(code);
    updateTelemetryReadouts({ holdMs });
  }

  function simulateKey(code, label, isDown) {
    const now = performance.now();
    if (isDown) {
      if (!activeKeys.has(code)) handlePress(code, label, null, now);
    } else {
      handleRelease(code, now);
    }
  }

  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (captureShortcuts) {
      e.preventDefault();
    }

    if (e.repeat) return; // Ignore OS auto-repeat so real switch chatter is measured accurately
    const code = e.code || `KeyCode_${e.keyCode}`;
    handlePress(code, e.key, e.keyCode, performance.now());
  });

  window.addEventListener('keyup', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (captureShortcuts) {
      e.preventDefault();
    }
    const code = e.code || `KeyCode_${e.keyCode}`;
    // macOS CapsLock / PrintScreen quirk: ensure tested state even if keydown was swallowed
    if (!testedCodes.has(code)) {
      testedCodes.add(code);
      pressCounts.set(code, (pressCounts.get(code) || 0) + 1);
    }
    handleRelease(code, performance.now());
  });

  window.addEventListener('contextmenu', (e) => {
    if (captureShortcuts && e.target && e.target.closest('.keyboard-chassis')) {
      e.preventDefault();
    }
  });

  // Clear stuck held keys if user Alt-Tabs out of browser window
  window.addEventListener('blur', () => {
    activeKeys.clear();
    syncAllKeyStates();
    updateTelemetryReadouts();
  });

  // Toolbar Bindings
  const layoutSelect = document.getElementById('select-kb-layout');
  if (layoutSelect) {
    layoutSelect.value = currentLayout;
    layoutSelect.addEventListener('change', () => {
      currentLayout = layoutSelect.value;
      renderKeyboard();
    });
  }

  const soundSelect = document.getElementById('select-switch-sound');
  if (soundSelect) {
    soundSelect.addEventListener('change', () => {
      soundProfile = soundSelect.value;
    });
  }

  const lockToggle = document.getElementById('chk-lock-shortcuts');
  if (lockToggle) {
    lockToggle.checked = captureShortcuts;
    lockToggle.addEventListener('change', () => {
      captureShortcuts = lockToggle.checked;
    });
  }

  const resetBtn = document.getElementById('btn-reset-keyboard');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      activeKeys.clear();
      testedCodes.clear();
      pressCounts.clear();
      lastReleaseTime.clear();
      pressStartTime.clear();
      chatterCodes.clear();
      chatterFaultCount = 0;
      maxRollover = 0;
      totalKeystrokes = 0;
      keyHistory.length = 0;
      if (elStream) {
        elStream.innerHTML = '<span class="stream-placeholder">Press any physical key on your keyboard to begin real-time diagnostics...</span>';
      }
      if (elLastKey) elLastKey.textContent = 'Ready';
      if (elEventCode) elEventCode.textContent = '—';
      if (elHoldMs) elHoldMs.textContent = '0 ms';
      syncAllKeyStates();
      updateTelemetryReadouts();
    });
  }

  renderKeyboard();
})();
