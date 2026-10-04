function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Saved entries are only shown if they have the shape content.js writes
function isEntry(d) {
  return !!d && typeof d === 'object'
    && typeof d.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(d.videoId)
    && Number.isInteger(d.timestamp) && d.timestamp >= 0
    // Live streams were saved with an infinite duration, which storage keeps as null
    && (d.duration == null || (Number.isInteger(d.duration) && d.duration >= 0))
    && typeof d.title === 'string'
    && Number.isFinite(d.savedAt);
}

// The valid saved positions among everything in storage
function savedEntries(all) {
  return Object.entries(all)
    .filter(([k, v]) => k === `yt_ts_${v?.videoId}` && isEntry(v))
    .map(([, v]) => v);
}

function render(items) {
  const list = document.getElementById('list');

  if (items.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <span>⏱️</span>
        No saved positions yet.<br>Watch a YouTube video and<br>your progress will appear here.
      </div>`;
    return;
  }

  // Sort by most recently saved
  items.sort((a, b) => b.savedAt - a.savedAt);

  // Titles come from the page, so everything is set as text, never as markup
  list.replaceChildren(...items.map(d => {
    const pct = d.duration > 0 ? Math.round((d.timestamp / d.duration) * 100) : 0;
    const key = `yt_ts_${d.videoId}`;

    const item = el('a', 'item');
    item.href = `https://www.youtube.com/watch?v=${d.videoId}&t=${d.timestamp}s`;
    item.target = '_blank';
    item.dataset.key = key;

    const thumb = el('div', 'thumb');
    const img = el('img');
    img.src = `https://img.youtube.com/vi/${d.videoId}/mqdefault.jpg`;
    img.alt = '';
    img.addEventListener('error', () => { img.style.display = 'none'; });
    const progress = el('div', 'progress-bar');
    progress.style.width = `${Math.min(pct, 100)}%`;
    thumb.append(img, progress);

    const title = el('div', 'title', d.title);
    title.title = d.title;
    const meta = el('div', 'meta');
    meta.append(
      el('span', 'ts-badge', formatTime(d.timestamp)),
      `${d.duration ? ` / ${formatTime(d.duration)}` : ''} · ${timeAgo(d.savedAt)}`,
    );
    const info = el('div', 'info');
    info.append(title, meta);

    const del = el('button', 'delete-btn', '✕');
    del.title = 'Remove';
    del.dataset.key = key;

    item.append(thumb, info, del);
    return item;
  }));

  // Delete buttons
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.dataset.key;
      chrome.storage.local.remove(key, loadItems);
    });
  });
}

function loadItems() {
  chrome.storage.local.get(null, (all) => {
    render(savedEntries(all));
  });
}

document.getElementById('clearAll').addEventListener('click', () => {
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all).filter(k => k.startsWith('yt_ts_'));
    chrome.storage.local.remove(keys, loadItems);
  });
});

function showStatus(text) {
  const status = document.getElementById('status');
  status.textContent = text;
  status.hidden = false;
}

document.getElementById('export').addEventListener('click', () => {
  chrome.storage.local.get(null, (all) => {
    const entries = savedEntries(all);
    const json = JSON.stringify({ format: 'yt-timesaver', version: 1, entries }, null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    link.download = `yt-timesaver-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    showStatus(`Exported ${entries.length} saved position${entries.length === 1 ? '' : 's'}.`);
  });
});

// Opening a file chooser closes the popup on most platforms, so importing
// happens in a tab showing this same page.
const inTab = new URLSearchParams(location.search).has('tab');
if (inTab) {
  document.body.classList.add('in-tab');
  showStatus('Choose Import to pick an exported file.');
}

document.getElementById('import').addEventListener('click', () => {
  if (inTab) {
    document.getElementById('importFile').click();
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab') });
    window.close();
  }
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  let entries;
  try {
    const data = JSON.parse(await file.text());
    if (data?.format !== 'yt-timesaver' || !Array.isArray(data.entries)) throw new Error();
    entries = data.entries;
  } catch {
    showStatus(`${file.name} is not a YT TimeSaver export.`);
    return;
  }

  chrome.storage.local.get(null, (all) => {
    // Keep whichever copy of a video's position was saved last
    const updates = {};
    let skipped = 0;
    for (const d of entries) {
      if (!isEntry(d)) { skipped++; continue; }
      const key = `yt_ts_${d.videoId}`;
      const current = updates[key] ?? all[key];
      if (isEntry(current) && current.savedAt >= d.savedAt) continue;
      updates[key] = {
        videoId:   d.videoId,
        timestamp: d.timestamp,
        duration:  d.duration ?? 0,
        title:     d.title,
        url:       `https://www.youtube.com/watch?v=${d.videoId}`,
        savedAt:   d.savedAt,
      };
    }
    chrome.storage.local.set(updates, () => {
      const added = Object.keys(updates).length;
      showStatus(`Imported ${added} saved position${added === 1 ? '' : 's'}`
        + (entries.length - skipped - added ? `, ${entries.length - skipped - added} already up to date` : '')
        + (skipped ? `, ${skipped} invalid` : '') + '.');
      loadItems();
    });
  });
});

loadItems();
