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

  list.innerHTML = items.map(d => {
    const pct = d.duration > 0 ? Math.round((d.timestamp / d.duration) * 100) : 0;
    const thumb = `https://img.youtube.com/vi/${d.videoId}/mqdefault.jpg`;
    return `
      <a class="item" href="${d.url}&t=${d.timestamp}s" target="_blank" data-key="yt_ts_${d.videoId}">
        <div class="thumb">
          <img src="${thumb}" onerror="this.style.display='none'" alt="">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="info">
          <div class="title" title="${d.title}">${d.title}</div>
          <div class="meta">
            <span class="ts-badge">${formatTime(d.timestamp)}</span>
            ${d.duration ? `/ ${formatTime(d.duration)}` : ''}
            · ${timeAgo(d.savedAt)}
          </div>
        </div>
        <button class="delete-btn" title="Remove" data-key="yt_ts_${d.videoId}">✕</button>
      </a>
    `;
  }).join('');

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
    const items = Object.entries(all)
      .filter(([k]) => k.startsWith('yt_ts_'))
      .map(([, v]) => v);
    render(items);
  });
}

document.getElementById('clearAll').addEventListener('click', () => {
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all).filter(k => k.startsWith('yt_ts_'));
    chrome.storage.local.remove(keys, loadItems);
  });
});

loadItems();
