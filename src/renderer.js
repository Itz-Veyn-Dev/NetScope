const $ = (id) => document.getElementById(id);
const state = {
  previous: new Map(),
  samples: [],
  adapters: [],
  lastSnapshotAt: 0,
  view: 'overview',
  maxPoints: 60
};

const fmtBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return { value: '—', unit: '' };
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return { value: value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2), unit: units[index] };
};

const fmtRate = (bytesPerSecond) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) return { value: '0.00', unit: 'KB/s' };
  if (bytesPerSecond >= 1024 * 1024) return { value: (bytesPerSecond / (1024 * 1024)).toFixed(2), unit: 'MB/s' };
  if (bytesPerSecond >= 1024) return { value: (bytesPerSecond / 1024).toFixed(1), unit: 'KB/s' };
  return { value: bytesPerSecond.toFixed(0), unit: 'B/s' };
};

const fmtLinkSpeed = (speed) => {
  if (!speed || speed === '0 bps') return '—';
  return speed.replace('bits per second', 'bps').replace('bit per second', 'bps');
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function calculateRates(adapters, now) {
  let down = 0, up = 0;
  const next = new Map();
  for (const adapter of adapters) {
    const key = `${adapter.index}:${adapter.name}`;
    const received = Number(adapter.received) || 0;
    const sent = Number(adapter.sent) || 0;
    const old = state.previous.get(key);
    if (old && now > old.time && received >= old.received && sent >= old.sent) {
      const seconds = (now - old.time) / 1000;
      if (seconds > 0) {
        down += (received - old.received) / seconds;
        up += (sent - old.sent) / seconds;
      }
    }
    next.set(key, { received, sent, time: now });
  }
  state.previous = next;
  return { down, up };
}

function setStatus(connected, title, caption) {
  $('side-dot').className = `status-dot ${connected ? 'good' : 'bad'}`;
  $('side-status').textContent = title;
  $('side-caption').textContent = caption;
}

function updateMetrics(adapters, rates) {
  const down = fmtRate(rates.down);
  const up = fmtRate(rates.up);
  $('download-speed').textContent = down.value;
  $('download-unit').textContent = down.unit;
  $('upload-speed').textContent = up.value;
  $('upload-unit').textContent = up.unit;

  const totalReceived = adapters.reduce((sum, a) => sum + (Number(a.received) || 0), 0);
  const totalSent = adapters.reduce((sum, a) => sum + (Number(a.sent) || 0), 0);
  const received = fmtBytes(totalReceived);
  const sent = fmtBytes(totalSent);
  $('total-down').textContent = received.value;
  $('total-down-unit').textContent = received.unit;
  $('total-up').textContent = sent.value;
  $('total-up-unit').textContent = sent.unit;
}

function updateConnection(adapters, now) {
  const active = adapters.filter(a => String(a.status).toLowerCase() === 'up');
  $('active-count').textContent = active.length;
  $('adapter-count').textContent = adapters.length;
  $('sample-age').textContent = now ? 'Just now' : '—';

  const dot = $('connection-dot');
  if (active.length) {
    dot.className = 'big-status-dot good';
    $('connection-name').textContent = active.length === 1 ? 'Connected' : 'Connected';
    $('connection-sub').textContent = active[0].name || 'Network adapter active';
    setStatus(true, 'Connected', `${active.length} active adapter${active.length === 1 ? '' : 's'}`);
  } else {
    dot.className = 'big-status-dot bad';
    $('connection-name').textContent = 'No active adapter';
    $('connection-sub').textContent = 'Check Wi-Fi or Ethernet';
    setStatus(false, 'Disconnected', 'No active adapter detected');
  }
}

function adapterMarkup(a, ratesByKey = {}) {
  const up = String(a.status).toLowerCase() === 'up';
  const name = escapeHTML(a.name || 'Unknown adapter');
  const description = escapeHTML(a.description || 'Network interface');
  const status = up ? 'Connected' : (a.status ? escapeHTML(a.status) : 'Unavailable');
  const received = fmtBytes(Number(a.received) || 0);
  const sent = fmtBytes(Number(a.sent) || 0);
  return `<div class="adapter-row">
    <div class="adapter-name-wrap"><div class="adapter-symbol">⌁</div><div style="min-width:0"><div class="adapter-name" title="${name}">${name}</div><div class="adapter-desc" title="${description}">${description}</div></div></div>
    <div><span class="status-chip ${up ? '' : 'offline'}"><i></i>${status}</span></div>
    <div class="row-stat">${escapeHTML(fmtLinkSpeed(a.linkSpeed))}</div>
    <div class="row-stat">${received.value} ${received.unit}<small>Received</small></div>
    <div class="row-stat">${sent.value} ${sent.unit}<small>Sent</small></div>
  </div>`;
}

function updateAdapterLists(adapters) {
  const preview = adapters.slice(0, 4);
  $('adapter-preview-list').innerHTML = preview.length
    ? preview.map(a => adapterMarkup(a)).join('')
    : '<div class="empty-state">No network adapters were returned by Windows.</div>';

  $('adapter-table-body').innerHTML = adapters.length ? adapters.map(a => {
    const up = String(a.status).toLowerCase() === 'up';
    const name = escapeHTML(a.name || 'Unknown adapter');
    const description = escapeHTML(a.description || 'Network interface');
    const received = fmtBytes(Number(a.received) || 0);
    const sent = fmtBytes(Number(a.sent) || 0);
    const status = up ? 'Connected' : escapeHTML(a.status || 'Unavailable');
    return `<div class="adapter-table-row">
      <div class="adapter-name-wrap"><div class="adapter-symbol">⌁</div><div style="min-width:0"><div class="adapter-name" title="${name}">${name}</div><div class="adapter-desc" title="${description}">${description}</div></div></div>
      <div><span class="status-chip ${up ? '' : 'offline'}"><i></i>${status}</span></div>
      <div class="row-stat">${escapeHTML(fmtLinkSpeed(a.linkSpeed))}</div>
      <div class="row-stat">${received.value} ${received.unit}</div>
      <div class="row-stat">${sent.value} ${sent.unit}</div>
    </div>`;
  }).join('') : '<div class="empty-state">No adapter information available.</div>';
}

function drawChart() {
  const canvas = $('traffic-chart');
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const samples = state.samples;
  $('chart-empty').style.display = samples.length < 2 ? 'grid' : 'none';
  const pad = { left: 3, right: 3, top: 10, bottom: 10 };
  const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;

  ctx.strokeStyle = '#29313c';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = pad.top + (ch * i / 3);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  if (samples.length < 2) return;

  const max = Math.max(1024, ...samples.map(s => Math.max(s.down, s.up))) * 1.15;
  const drawLine = (key, color, fill) => {
    const points = samples.map((s, i) => ({
      x: pad.left + (i / (state.maxPoints - 1)) * cw,
      y: pad.top + ch - (Math.min(s[key], max) / max) * ch
    }));
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
    if (fill) {
      ctx.lineTo(points[points.length - 1].x, pad.top + ch);
      ctx.lineTo(points[0].x, pad.top + ch);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
  };
  drawLine('down', '#6ba7ff', 'rgba(107,167,255,0.08)');
  drawLine('up', '#55d6bd', null);
}

function showError(message) {
  const banner = $('error-banner');
  if (message) {
    $('error-message').textContent = message;
    banner.classList.remove('hidden');
  } else banner.classList.add('hidden');
}

function handleSnapshot(snapshot) {
  if (!snapshot) return;
  if (snapshot.supported === false) {
    showError(snapshot.error || 'This platform is not supported.');
    $('live-label').textContent = 'Windows only';
    return;
  }
  if (snapshot.error && !snapshot.adapters?.length) {
    showError(snapshot.error);
    $('live-label').textContent = 'Data unavailable';
    return;
  }
  showError('');
  const adapters = Array.isArray(snapshot.adapters) ? snapshot.adapters : [];
  const now = Number(snapshot.timestamp) || Date.now();
  const rates = calculateRates(adapters, now);
  state.adapters = adapters;
  state.lastSnapshotAt = now;
  state.samples.push({ time: now, down: rates.down, up: rates.up });
  if (state.samples.length > state.maxPoints) state.samples.shift();

  updateMetrics(adapters, rates);
  updateConnection(adapters, now);
  updateAdapterLists(adapters);
  drawChart();

  const time = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('last-updated').textContent = time;
  $('adapters-updated').textContent = time;
  $('live-label').textContent = 'Live monitoring';
}

function setView(view) {
  state.view = view;
  $('overview-view').classList.toggle('hidden', view !== 'overview');
  $('adapters-view').classList.toggle('hidden', view !== 'adapters');
  $('page-title').textContent = view === 'overview' ? 'Overview' : 'Network adapters';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'overview') requestAnimationFrame(drawChart);
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('view-adapters').addEventListener('click', () => setView('adapters'));
$('refresh-btn').addEventListener('click', async () => {
  $('refresh-btn').style.opacity = '.55';
  try { handleSnapshot(await window.netScope.getSnapshot()); }
  finally { $('refresh-btn').style.opacity = '1'; }
});
window.addEventListener('resize', () => requestAnimationFrame(drawChart));

window.netScope.onSnapshot(handleSnapshot);
window.netScope.getSnapshot().then(handleSnapshot).catch(() => showError('Unable to communicate with the NetScope background process.'));
