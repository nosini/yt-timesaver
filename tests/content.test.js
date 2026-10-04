'use strict';
// Runs content.js against a minimal fake page and replays YouTube's event
// orders to check which video each position is saved under.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';

class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.readyState = 0;
    this.currentTime = 0;
    this.duration = 600;
  }
  matches(selector) { return selector === '#movie_player video'; }
}

function load({ url = `https://www.youtube.com/watch?v=${A}`, video = new FakeVideo(), stored = {} } = {}) {
  const document = new EventTarget();
  const window = new EventTarget();
  const store = { ...stored };
  let tick = null;

  document.title = 'Title - YouTube';
  document.visibilityState = 'visible';
  document.querySelector = (s) => (s === '#movie_player video' ? video : null);
  window.location = new URL(url);

  // Captured listeners on document get events dispatched on the video.
  const dispatch = video.dispatchEvent.bind(video);
  video.dispatchEvent = (event) => {
    const forward = new Event(event.type);
    Object.defineProperty(forward, 'target', { value: video });
    document.dispatchEvent(forward);
    return dispatch(event);
  };

  const chrome = {
    storage: {
      local: {
        set: (items) => Object.assign(store, items),
        remove: (key) => delete store[key],
        get: (key, cb) => cb({ [key]: store[key] }),
      },
    },
  };

  vm.runInNewContext(SOURCE, {
    document, window, chrome, URLSearchParams, Event,
    HTMLVideoElement: FakeVideo,
    setInterval: (fn) => { tick = fn; },
  });

  return {
    video, store, document,
    navigate(to) { window.location = new URL(to); },
    fire(type) { document.dispatchEvent(new Event(type)); },
    load(time = 0) {
      video.readyState = 1;
      video.currentTime = time;
      video.dispatchEvent(new Event('loadedmetadata'));
    },
    save() { tick(); },
  };
}

const saved = (page, id) => page.store[`yt_ts_${id}`]?.timestamp;

test('initial load restores and saves the video in the URL', () => {
  const video = new FakeVideo();
  video.readyState = 1;
  const page = load({ video, stored: { [`yt_ts_${A}`]: { timestamp: 120 } } });
  assert.equal(video.currentTime, 120);
  video.currentTime = 130;
  page.save();
  assert.equal(saved(page, A), 130);
});

test('a player that loads after the script starts is picked up', () => {
  const page = load({ stored: { [`yt_ts_${A}`]: { timestamp: 120 } } });
  page.load();
  assert.equal(page.video.currentTime, 120);
});

test('switching videos when the new one loads before navigation finishes', () => {
  const page = load();
  page.load(50);
  page.fire('yt-navigate-start');
  assert.equal(saved(page, A), 50);

  page.load(70);          // B's media, URL still says A
  page.save();
  assert.equal(saved(page, A), 50, 'B position must not be saved as A');
  page.navigate(`https://www.youtube.com/watch?v=${B}`);
  page.fire('yt-navigate-finish');
  page.save();
  assert.equal(saved(page, B), 70);
  assert.equal(saved(page, A), 50);
});

test('switching videos when the new one loads after navigation finishes', () => {
  const page = load({ stored: { [`yt_ts_${B}`]: { timestamp: 300 } } });
  page.load(50);
  page.fire('yt-navigate-start');
  page.navigate(`https://www.youtube.com/watch?v=${B}`);
  page.fire('yt-navigate-finish');
  page.video.currentTime = 55;   // A still playing until B loads
  page.save();
  assert.equal(saved(page, A), 55);
  assert.equal(saved(page, B), 300);

  page.load(0);
  assert.equal(page.video.currentTime, 300, 'B restored');
  page.video.currentTime = 310;
  page.save();
  assert.equal(saved(page, B), 310);
  assert.equal(saved(page, A), 55);
});

test('leaving the watch page keeps saving the video still in the player', () => {
  const page = load();
  page.load(50);
  page.fire('yt-navigate-start');
  page.navigate('https://www.youtube.com/');
  page.fire('yt-navigate-finish');
  page.video.currentTime = 80;
  page.save();
  assert.equal(saved(page, A), 80);
});

test('invalid video IDs are ignored', () => {
  for (const id of ['short', `${A}x`, 'aaaaaaaaa"<', '']) {
    const page = load({ url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` });
    page.load(50);
    page.save();
    assert.deepEqual(page.store, {}, id);
  }
});
