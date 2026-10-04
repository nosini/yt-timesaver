(() => {
  let video = null;
  let saveInterval = null;
  let currentVideoId = null;

  function getVideoId() {
    return new URLSearchParams(window.location.search).get('v');
  }

  function storageKey(videoId) {
    return `yt_ts_${videoId}`;
  }

  function saveTimestamp() {
    if (!video || !currentVideoId || video.currentTime < 2) return;

    // Clear save if near the end — treat as finished
    if (video.duration && video.currentTime > video.duration - 10) {
      chrome.storage.local.remove(storageKey(currentVideoId));
      return;
    }

    chrome.storage.local.set({
      [storageKey(currentVideoId)]: {
        videoId:   currentVideoId,
        timestamp: Math.floor(video.currentTime),
        duration:  Math.floor(video.duration) || 0,
        title:     document.title.replace(' - YouTube', '').trim(),
        url:       `https://www.youtube.com/watch?v=${currentVideoId}`,
        savedAt:   Date.now(),
      }
    });
  }

  function restoreTimestamp() {
    const videoId = currentVideoId;
    if (!videoId || !video) return;

    chrome.storage.local.get(storageKey(videoId), (result) => {
      const data = result[storageKey(videoId)];
      if (!data || data.timestamp < 5) return;
      // Only seek if the video hasn't already progressed
      if (video.currentTime > 10) return;
      video.currentTime = data.timestamp;
    });
  }

  function attachToVideo(v) {
    video = v;

    if (video.readyState >= 1) {
      restoreTimestamp();
    } else {
      video.addEventListener('loadedmetadata', restoreTimestamp, { once: true });
    }

    clearInterval(saveInterval);
    saveInterval = setInterval(saveTimestamp, 5000);
  }

  function onNavigation() {
    const videoId = getVideoId();
    if (!videoId || videoId === currentVideoId) return;

    currentVideoId = videoId;
    video = null;

    // Poll until the video element appears (YouTube SPA swaps it out)
    const poll = setInterval(() => {
      const v = document.querySelector('video');
      if (v) {
        clearInterval(poll);
        attachToVideo(v);
      }
    }, 200);

    // Give up after 10s
    setTimeout(() => clearInterval(poll), 10000);
  }

  // Save on tab close / navigation away
  window.addEventListener('pagehide', saveTimestamp);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveTimestamp();
  });

  // YouTube is a SPA — intercept pushState/replaceState to catch navigation
  const _push    = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);
  history.pushState    = (...a) => { _push(...a);    onNavigation(); };
  history.replaceState = (...a) => { _replace(...a); onNavigation(); };
  window.addEventListener('popstate', onNavigation);

  // Initial load
  onNavigation();
})();
