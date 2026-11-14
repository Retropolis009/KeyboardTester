(function () {
  const tbody = document.getElementById('chatter-table-body');
  if (!tbody) return;

  const thresholdInput = document.getElementById('input-chatter-threshold');
  const resetBtn = document.getElementById('btn-chatter-reset');
  const elTotalPresses = document.getElementById('stat-ch-presses');
  const elTotalFaults = document.getElementById('stat-ch-faults');
  const elWorstKey = document.getElementById('stat-ch-worst');
  const elMinDelta = document.getElementById('stat-ch-min');

  const keyStats = new Map();
  let totalPresses = 0;
  let totalFaults = 0;
  let globalMinMs = Infinity;

  function getThreshold() {
    return Math.max(5, Math.min(120, Number(thresholdInput ? thresholdInput.value : 35) || 35));
  }

  function renderStats() {
    if (elTotalPresses) elTotalPresses.textContent = String(totalPresses);
    if (elTotalFaults) {
      elTotalFaults.textContent = totalFaults === 0 ? '0 Clean' : `${totalFaults} Chatter Events`;
      elTotalFaults.className = `telemetry-value ${totalFaults > 0 ? 'warn' : 'good'}`;
    }
    if (elMinDelta) {
      elMinDelta.textContent = globalMinMs === Infinity ? '—' : `${Math.round(globalMinMs)} ms`;
    }

    const entries = [...keyStats.values()].sort((a, b) => b.faults - a.faults || b.presses - a.presses);
    if (elWorstKey) {
      const topFault = entries.find((e) => e.faults > 0);
      elWorstKey.textContent = topFault ? `${topFault.code} (${topFault.faults})` : 'None';
    }

    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted)">Tap suspect mechanical switches repeatedly to measure inter-actuation bounce timing...</td></tr>';
      return;
    }

    tbody.innerHTML = entries.map((item) => {
      const avg = item.intervals.length > 0
        ? Math.round(item.intervals.reduce((a, b) => a + b, 0) / item.intervals.length)
        : 0;
      const minStr = item.minMs === Infinity ? '—' : `${Math.round(item.minMs)} ms`;
      const statusHtml = item.faults > 0
        ? `<span style="color:var(--accent-danger);font-weight:700">${item.faults} Bounce Fault(s)</span>`
        : `<span style="color:var(--accent-emerald);font-weight:600">Healthy</span>`;
      return `
        <tr>
          <td><code>${item.code}</code> (${item.label})</td>
          <td>${item.presses}</td>
          <td>${minStr}</td>
          <td>${avg ? `${avg} ms` : '—'}</td>
          <td>${statusHtml}</td>
        </tr>
      `;
    }).join('');
  }

  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    if (e.repeat) return;

    const now = performance.now();
    const code = e.code || `Key_${e.keyCode}`;
    const threshold = getThreshold();

    let rec = keyStats.get(code);
    if (!rec) {
      rec = {
        code,
        label: e.key === ' ' ? 'Space' : e.key,
        presses: 0,
        faults: 0,
        lastUpMs: null,
        minMs: Infinity,
        intervals: []
      };
      keyStats.set(code, rec);
    }

    rec.presses++;
    totalPresses++;

    if (rec.lastUpMs !== null) {
      const delta = now - rec.lastUpMs;
      rec.intervals.push(delta);
      if (rec.intervals.length > 40) rec.intervals.shift();
      if (delta < rec.minMs) rec.minMs = delta;
      if (delta < globalMinMs) globalMinMs = delta;
      if (delta >= 2 && delta < threshold) {
        rec.faults++;
        totalFaults++;
      }
    }

    renderStats();
  });

  window.addEventListener('keyup', (e) => {
    const code = e.code || `Key_${e.keyCode}`;
    const rec = keyStats.get(code);
    if (rec) rec.lastUpMs = performance.now();
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      keyStats.clear();
      totalPresses = 0;
      totalFaults = 0;
      globalMinMs = Infinity;
      renderStats();
    });
  }

  renderStats();
})();
