# YT TimeSaver

YT TimeSaver remembers where you stopped watching a YouTube video. Open the
video again later and it picks up where you left off, even after closing the
tab or the browser.

Once you've watched a video to the end, its position is forgotten, so finished
videos start from the beginning as usual.

## Installing

YT TimeSaver works in Chromium-based browsers such as Brave and Chrome.

1. Download `yt-timesaver.crx` from the
   [latest release](https://github.com/nosini/yt-timesaver/releases/latest).
2. Open your browser's extensions page (`brave://extensions`,
   `chrome://extensions`, ...) and turn on **Developer mode**.
3. Drag the downloaded file onto the page and confirm.

To update, install the newer release the same way. Your saved positions are
kept.

Some browsers, notably Chrome on Windows and macOS, refuse or later disable
extensions that don't come from their store. In that case download the
release's source code zip instead, unpack it, and choose **Load unpacked** on
the extensions page, selecting the unpacked folder.

## Using it

There's nothing to set up: watch videos as usual. Your position is saved every
few seconds while a video plays.

Click the extension's icon to see your unfinished videos, most recent first,
with how far you got in each. Click one to continue watching it. Hover over a
video and click **✕** to forget it, or use **Clear all** to forget everything.

## Moving your saved positions

To take your saved positions to another browser or profile, click **Export**
in the popup. This downloads them as a file. In the other browser, click
**Import** and pick that file. Importing adds to what's already there, and
where both have the same video, the most recent position is kept.

## Privacy

Your saved positions stay in your browser. YT TimeSaver doesn't send them
anywhere, and it only runs on youtube.com. The only extra thing the popup
loads is the video thumbnails, from YouTube.

## Building it yourself

See [docs/development.md](docs/development.md) for building, testing and
releasing.

## License

YT TimeSaver is free software under the
[GNU Affero General Public License, version 3](LICENSE).
