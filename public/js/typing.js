(function () {
  const promptEl = document.getElementById('typing-prompt');
  const inputEl = document.getElementById('typing-input');
  if (!promptEl || !inputEl) return;

  const elWpm = document.getElementById('stat-wpm');
  const elRaw = document.getElementById('stat-raw-wpm');
  const elAcc = document.getElementById('stat-accuracy');
  const elTimer = document.getElementById('stat-time-left');
  const elSource = document.getElementById('stat-corpus-source');

  const modeSelect = document.getElementById('select-typing-mode');
  const durationSelect = document.getElementById('select-typing-duration');
  const restartBtn = document.getElementById('btn-typing-restart');

  let targetText = '';
  let durationSec = 30;
  let timeLeft = 30;
  let startedAt = 0;
  let timerHandle = null;
  let finished = false;

  function renderPrompt(typed = '') {
    const chars = targetText.split('');
    promptEl.innerHTML = chars.map((ch, idx) => {
      let cls = '';
      if (idx < typed.length) {
        cls = typed[idx] === ch ? 'char-correct' : 'char-wrong';
      } else if (idx === typed.length) {
        cls = 'char-current';
      }
      const safe = ch === '&' ? '&amp;' : (ch === '<' ? '&lt;' : (ch === '>' ? '&gt;' : ch));
      return `<span class="${cls}">${safe}</span>`;
    }).join('');
  }

  function computeMetrics() {
    const typed = inputEl.value;
    const elapsedMin = startedAt ? Math.max(0.02, (performance.now() - startedAt) / 60000) : 0;
    let correct = 0;
    for (let i = 0; i < typed.length; i++) {
      if (typed[i] === targetText[i]) correct++;
    }
    const acc = typed.length > 0 ? Math.round((correct / typed.length) * 100) : 100;
    const netWpm = elapsedMin > 0 ? Math.round((correct / 5) / elapsedMin) : 0;
    const rawWpm = elapsedMin > 0 ? Math.round((typed.length / 5) / elapsedMin) : 0;

    if (elWpm) elWpm.textContent = `${netWpm} WPM`;
    if (elRaw) elRaw.textContent = `${rawWpm} Raw`;
    if (elAcc) elAcc.textContent = `${acc}%`;
  }

  function finishTest() {
    finished = true;
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
    inputEl.disabled = true;
    computeMetrics();
  }

  async function loadPassage() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
    finished = false;
    startedAt = 0;
    durationSec = Number(durationSelect ? durationSelect.value : 30) || 30;
    timeLeft = durationSec;
    inputEl.disabled = false;
    inputEl.value = '';

    if (elTimer) elTimer.textContent = `${timeLeft}s`;
    if (elWpm) elWpm.textContent = '0 WPM';
    if (elRaw) elRaw.textContent = '0 Raw';
    if (elAcc) elAcc.textContent = '100%';

    const mode = modeSelect ? modeSelect.value : 'standard';
    try {
      const res = await fetch(`/api/typing-corpus?mode=${encodeURIComponent(mode)}`);
      const data = await res.json();
      targetText = data.text || 'Test your typing accuracy and speed across every mechanical switch on your keyboard.';
      if (elSource) elSource.textContent = data.source === 'api.github.com' ? 'GitHub API Live' : 'Curated Lab';
    } catch (_) {
      targetText = 'Mechanical switches register clean actuation signals when typed with steady rhythm and accuracy.';
      if (elSource) elSource.textContent = 'Local Corpus';
    }

    renderPrompt('');
    inputEl.focus();
  }

  inputEl.addEventListener('input', () => {
    if (finished) return;
    if (!startedAt && inputEl.value.length > 0) {
      startedAt = performance.now();
      timerHandle = setInterval(() => {
        timeLeft--;
        if (elTimer) elTimer.textContent = `${Math.max(0, timeLeft)}s`;
        computeMetrics();
        if (timeLeft <= 0) {
          finishTest();
        }
      }, 1000);
    }

    renderPrompt(inputEl.value);
    computeMetrics();

    if (inputEl.value.length >= targetText.length) {
      finishTest();
    }
  });

  if (modeSelect) modeSelect.addEventListener('change', loadPassage);
  if (durationSelect) durationSelect.addEventListener('change', loadPassage);
  if (restartBtn) restartBtn.addEventListener('click', loadPassage);

  loadPassage();
})();
