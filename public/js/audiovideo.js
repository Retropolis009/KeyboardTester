(function () {
  const micStartBtn = document.getElementById('btn-mic-start');
  if (!micStartBtn) return;

  const micStopBtn = document.getElementById('btn-mic-stop');
  const micSelect = document.getElementById('select-mic');
  const scope = document.getElementById('mic-oscilloscope');
  const scopeCtx = scope ? scope.getContext('2d') : null;
  const elMicStatus = document.getElementById('stat-mic-status');
  const elMicDb = document.getElementById('stat-mic-db');
  const elMicHealth = document.getElementById('stat-mic-health');
  const elDbText = document.getElementById('mic-db-text');
  const levelMeter = document.getElementById('mic-level-meter');

  const toneButtons = document.querySelectorAll('[data-tone]');
  const toneFreqSelect = document.getElementById('select-tone-freq');
  const toneStopBtn = document.getElementById('btn-tone-stop');

  const camStartBtn = document.getElementById('btn-cam-start');
  const camStopBtn = document.getElementById('btn-cam-stop');
  const camPreview = document.getElementById('webcam-preview');
  const elCamStatus = document.getElementById('stat-cam-status');
  const elCamRes = document.getElementById('stat-cam-res');
  const elCamFps = document.getElementById('stat-cam-fps');

  // ================= MICROPHONE =================
  let micStream = null;
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let timeData = null;
  let micRafId = null;
  let peakDb = -Infinity;

  async function listInputDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      if (!micSelect || inputs.length === 0) return;
      const current = micSelect.value;
      micSelect.innerHTML = '<option value="">Default microphone</option>' +
        inputs.map((d, i) => `<option value="${d.deviceId}">${(d.label || `Microphone ${i + 1}`).replace(/</g, '&lt;')}</option>`).join('');
      micSelect.value = current || '';
    } catch (_) {}
  }

  function dbFromAmplitude(amp) {
    if (amp <= 0.00001) return -Infinity;
    return 20 * Math.log10(amp);
  }

  function drawScope() {
    if (!scopeCtx || !analyser || !timeData) return;
    analyser.getFloatTimeDomainData(timeData);

    const dpr = window.devicePixelRatio || 1;
    const rect = scope.getBoundingClientRect();
    const w = Math.max(200, Math.floor(rect.width));
    const h = Math.max(80, Math.floor(rect.height));
    if (scope.width !== w * dpr || scope.height !== h * dpr) {
      scope.width = w * dpr;
      scope.height = h * dpr;
    }
    scopeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scopeCtx.fillStyle = '#101215';
    scopeCtx.fillRect(0, 0, w, h);

    scopeCtx.strokeStyle = '#2b3038';
    scopeCtx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      scopeCtx.beginPath();
      scopeCtx.moveTo(0, y);
      scopeCtx.lineTo(w, y);
      scopeCtx.stroke();
    }

    scopeCtx.strokeStyle = '#e57e25';
    scopeCtx.lineWidth = 1.6;
    scopeCtx.beginPath();
    const step = Math.ceil(timeData.length / w);
    let framePeak = 0;
    for (let i = 0, x = 0; i < timeData.length; i += step, x++) {
      const v = Math.max(-1, Math.min(1, timeData[i]));
      framePeak = Math.max(framePeak, Math.abs(v));
      const y = (1 - v) * (h / 2);
      if (x === 0) scopeCtx.moveTo(0, y);
      else scopeCtx.lineTo(x, y);
    }
    scopeCtx.stroke();

    if (framePeak > 0.0005) {
      const db = dbFromAmplitude(framePeak);
      peakDb = Math.max(peakDb, db);
      if (elMicDb) {
        elMicDb.textContent = `${db.toFixed(1)} dBFS`;
        elMicDb.className = `readout-val ${db > -1 ? 'fault' : db > -6 ? 'active' : 'pass'}`;
      }
      if (elDbText) elDbText.textContent = `${db.toFixed(1)} dBFS`;
      if (levelMeter) {
        const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
        levelMeter.style.width = `${pct}%`;
        levelMeter.style.background = db > -3 ? '#dc3838' : db > -10 ? '#e57e25' : '#2ea043';
      }
    }
  }

  function assessMicHealth() {
    if (!elMicHealth) return;
    if (!Number.isFinite(peakDb)) {
      elMicHealth.textContent = 'Silent';
      elMicHealth.className = 'readout-val pass';
    } else if (peakDb > -1) {
      elMicHealth.textContent = 'Clipping';
      elMicHealth.className = 'readout-val fault';
    } else if (peakDb > -6) {
      elMicHealth.textContent = 'Too hot';
      elMicHealth.className = 'readout-val active';
    } else if (peakDb > -40) {
      elMicHealth.textContent = 'Healthy';
      elMicHealth.className = 'readout-val pass';
    } else {
      elMicHealth.textContent = 'Too quiet';
      elMicHealth.className = 'readout-val active';
    }
  }

  async function startMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (elMicStatus) elMicStatus.textContent = 'getUserMedia unsupported';
      return;
    }
    stopMic();
    try {
      if (elMicStatus) {
        elMicStatus.textContent = 'Requesting…';
        elMicStatus.className = 'readout-val active';
      }
      const deviceId = micSelect && micSelect.value ? { exact: micSelect.value } : undefined;
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId } : true
      });

      const AudioContextCls = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextCls();
      sourceNode = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      sourceNode.connect(analyser);
      timeData = new Float32Array(analyser.fftSize);

      peakDb = -Infinity;
      if (elMicStatus) {
        elMicStatus.textContent = 'Capturing';
        elMicStatus.className = 'readout-val pass';
      }
      await listInputDevices();

      const render = () => {
        drawScope();
        micRafId = requestAnimationFrame(render);
      };
      render();

      setInterval(assessMicHealth, 700);
    } catch (err) {
      if (elMicStatus) {
        elMicStatus.textContent = err && err.name === 'NotAllowedError' ? 'Permission denied' : 'Unavailable';
        elMicStatus.className = 'readout-val fault';
      }
    }
  }

  function stopMic() {
    if (micRafId) {
      cancelAnimationFrame(micRafId);
      micRafId = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (_) {}
      sourceNode = null;
    }
    if (audioCtx) {
      try { audioCtx.close(); } catch (_) {}
      audioCtx = null;
    }
    analyser = null;
    if (levelMeter) levelMeter.style.width = '0%';
    if (scopeCtx && scope) scopeCtx.clearRect(0, 0, scope.width, scope.height);
  }

  if (micStartBtn) micStartBtn.addEventListener('click', startMic);
  if (micStopBtn) {
    micStopBtn.addEventListener('click', () => {
      stopMic();
      if (elMicStatus) {
        elMicStatus.textContent = 'Stopped';
        elMicStatus.className = 'readout-val';
      }
    });
  }
  if (micSelect) micSelect.addEventListener('change', () => {
    if (micStream) startMic();
  });

  listInputDevices();

  // ================= STEREO TONE GENERATOR =================
  let toneCtx = null;
  let toneOsc = null;
  let toneGain = null;
  let tonePanner = null;

  function stopTone() {
    if (toneGain && toneCtx) {
      try {
        toneGain.gain.setTargetAtTime(0, toneCtx.currentTime, 0.02);
      } catch (_) {}
    }
    const oscToStop = toneOsc;
    const ctxToClose = toneCtx;
    toneOsc = null;
    toneGain = null;
    tonePanner = null;
    toneCtx = null;
    setTimeout(() => {
      if (oscToStop) {
        try { oscToStop.stop(); } catch (_) {}
        try { oscToStop.disconnect(); } catch (_) {}
      }
      if (ctxToClose) {
        try { ctxToClose.close(); } catch (_) {}
      }
    }, 90);
  }

  function playTone(channel, freq) {
    stopTone();
    const AudioContextCls = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCls) return;
    toneCtx = new AudioContextCls();
    toneOsc = toneCtx.createOscillator();
    toneGain = toneCtx.createGain();
    tonePanner = toneCtx.createStereoPanner ? toneCtx.createStereoPanner() : null;

    toneOsc.type = 'sine';
    toneOsc.frequency.value = Number(freq) || 440;
    // Comfortable but audible reference level
    toneGain.gain.value = 0.12;

    if (tonePanner) {
      tonePanner.pan.value = channel === 'left' ? -1 : channel === 'right' ? 1 : 0;
      toneOsc.connect(toneGain);
      toneGain.connect(tonePanner);
      tonePanner.connect(toneCtx.destination);
    } else {
      toneOsc.connect(toneGain);
      toneGain.connect(toneCtx.destination);
    }

    toneOsc.start();
    // Auto-stop after 12s to be kind to speakers and ears
    setTimeout(() => { if (toneCtx) stopTone(); }, 12000);
  }

  toneButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const channel = btn.dataset.tone;
      const freq = toneFreqSelect ? toneFreqSelect.value : (btn.dataset.freq || 440);
      playTone(channel, freq);
    });
  });

  if (toneStopBtn) toneStopBtn.addEventListener('click', stopTone);
  window.addEventListener('beforeunload', stopTone);

  // ================= WEBCAM =================
  let camStream = null;
  let camFpsCount = 0;
  let camFpsTimer = null;
  let rvfcHandle = null;

  function countFpsClassic() {
    camFpsCount++;
    if (camPreview) rvfcHandle = requestAnimationFrame(countFpsClassic);
  }

  function reportCamera() {
    if (!camPreview || !camStream) return;
    const settings = camStream.getVideoTracks()[0].getSettings ? camStream.getVideoTracks()[0].getSettings() : {};
    if (elCamRes) {
      const w = settings.width || camPreview.videoWidth;
      const h = settings.height || camPreview.videoHeight;
      elCamRes.textContent = w && h ? `${w}×${h}` : '—';
    }
    if (elCamFps) {
      if (settings.frameRate) {
        elCamFps.textContent = `${Math.round(settings.frameRate)} fps (reported)`;
      } else {
        elCamFps.textContent = `${camFpsCount} fps (measured)`;
      }
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (elCamStatus) elCamStatus.textContent = 'Camera unsupported';
      return;
    }
    stopCamera();
    try {
      if (elCamStatus) {
        elCamStatus.textContent = 'Requesting…';
        elCamStatus.className = 'readout-val active';
      }
      camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (camPreview) {
        camPreview.srcObject = camStream;
        await camPreview.play().catch(() => {});
      }
      if (elCamStatus) {
        elCamStatus.textContent = 'Live';
        elCamStatus.className = 'readout-val pass';
      }

      configFpsCounter();
      setTimeout(reportCamera, 900);
    } catch (err) {
      if (elCamStatus) {
        elCamStatus.textContent = err && err.name === 'NotAllowedError' ? 'Permission denied' : 'Unavailable';
        elCamStatus.className = 'readout-val fault';
      }
    }
  }

  function configFpsCounter() {
    camFpsCount = 0;
    if (!camPreview) return;
    if (typeof camPreview.requestVideoFrameCallback === 'function') {
      const step = () => {
        camFpsCount++;
        if (camPreview && camPreview.srcObject) {
          camPreview.requestVideoFrameCallback(step);
        }
      };
      camPreview.requestVideoFrameCallback(step);
    } else if (!rvfcHandle) {
      countFpsClassic();
    }
    if (camFpsTimer) clearInterval(camFpsTimer);
    camFpsTimer = setInterval(() => {
      if (!camStream) return;
      const settings = camStream.getVideoTracks()[0].getSettings ? camStream.getVideoTracks()[0].getSettings() : {};
      if (elCamFps) {
        const measured = camFpsCount;
        if (settings.frameRate) {
          elCamFps.textContent = `${Math.round(settings.frameRate)} fps (reported ${measured}/s)`;
        } else {
          elCamFps.textContent = `${measured} fps`;
        }
      }
      camFpsCount = 0;
      reportCamera();
    }, 1000);
  }

  function stopCamera() {
    if (camFpsTimer) {
      clearInterval(camFpsTimer);
      camFpsTimer = null;
    }
    if (rvfcHandle) {
      cancelAnimationFrame(rvfcHandle);
      rvfcHandle = null;
    }
    if (camStream) {
      camStream.getTracks().forEach((t) => t.stop());
      camStream = null;
    }
    if (camPreview) camPreview.srcObject = null;
    if (elCamStatus) {
      elCamStatus.textContent = 'Stopped';
      elCamStatus.className = 'readout-val';
    }
    if (elCamFps) elCamFps.textContent = '—';
    if (elCamRes) elCamRes.textContent = '—';
  }

  if (camStartBtn) camStartBtn.addEventListener('click', startCamera);
  if (camStopBtn) camStopBtn.addEventListener('click', stopCamera);
})();
