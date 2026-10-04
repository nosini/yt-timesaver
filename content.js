(() => {
  // The main player's <video>. YouTube keeps this element across in-app
  // navigation and loads each new video into it.
  const PLAYER_VIDEO = '#movie_player video';
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

  let video = null;
  let currentVideoId = null;   // video whose position is being saved, if any
  let navigating = false;
  let loadedSinceNavigation = false;

  function getVideoId() {
    const id = new URLSearchParams(window.location.search).get('v');
    return id && VIDEO_ID.test(id) ? id : null;
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
        duration:  Number.isFinite(video.duration) ? Math.floor(video.duration) : 0,
        title:     document.title.replace(' - YouTube', '').trim(),
        url:       `https://www.youtube.com/watch?v=${currentVideoId}`,
        savedAt:   Date.now(),
      }
    });
  }

  function restoreTimestamp() {
    const videoId = currentVideoId;
    const v = video;
    if (!videoId || !v) return;

    chrome.storage.local.get(storageKey(videoId), (result) => {
      const data = result[storageKey(videoId)];
      if (!data || data.timestamp < 5) return;
      // Another video may have loaded while storage was read
      if (currentVideoId !== videoId || video !== v) return;
      // Only seek if the video hasn't already progressed
      if (v.currentTime > 10) return;
      v.currentTime = data.timestamp;
    });
  }

  // Start saving the video named in the URL, now that the player holds it.
  function trackLoadedVideo() {
    currentVideoId = getVideoId();
    restoreTimestamp();
  }

  // Media events don't bubble, so listen in the capture phase. This also
  // catches a player that is created after this script runs.
  document.addEventListener('loadedmetadata', (e) => {
    if (!(e.target instanceof HTMLVideoElement) || !e.target.matches(PLAYER_VIDEO)) return;
    video = e.target;
    loadedSinceNavigation = true;
    // Until the navigation finishes, the URL may still name the previous video
    currentVideoId = null;
    if (!navigating) trackLoadedVideo();
  }, true);

  // YouTube is a SPA and fires these on document for in-app navigation.
  // (Wrapping history.pushState wouldn't work: content scripts run in an
  // isolated world, so YouTube's own calls never reach the wrapper.)
  document.addEventListener('yt-navigate-start', () => {
    saveTimestamp();
    navigating = true;
    loadedSinceNavigation = false;
  });

  document.addEventListener('yt-navigate-finish', () => {
    navigating = false;
    // If no new video loaded, the player still holds the previous one (the
    // miniplayer, or a video that loads later), so keep saving it as is.
    if (loadedSinceNavigation) trackLoadedVideo();
  });

  // Save on tab close / navigation away
  window.addEventListener('pagehide', saveTimestamp);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveTimestamp();
  });

  setInterval(saveTimestamp, 5000);

  // Initial load: the player may have loaded its video before this script ran
  const v = document.querySelector(PLAYER_VIDEO);
  if (v && v.readyState >= 1) {
    video = v;
    trackLoadedVideo();
  }
})();
