# Tab Recorder Extension

A simple browser extension for Microsoft Edge (and other Chromium-based browsers) that allows you to record audio and video from any browser tab.

## Features

- ✅ **Record tab audio and video** - Capture both audio and video content from any tab
- ✅ **Concurrent multi-tab recording** - Record multiple tabs simultaneously without interference
- ✅ **Simple interface** - Just two buttons: Start and Stop
- ✅ **Automatic download** - Recordings are automatically saved to your downloads folder
- ✅ **Per-tab recording state** - Each tab independently tracks its own recording status
- ✅ **Manifest V3** - Built using the latest extension standards
- ✅ **Edge 141+ compatible** - Fully compatible with Microsoft Edge version 141 and above

## Installation

### Method 1: Load Unpacked Extension

1. **Open Extensions Page**:
   - Open Microsoft Edge
   - Navigate to `edge://extensions/`
   - Enable "Developer mode" (toggle in the bottom-left corner)

2. **Load the Extension**:
   - Click "Load unpacked"
   - Select the folder containing the extension files
   - The extension should now appear in your extensions list

3. **Pin the Extension** (Optional):
   - Click the puzzle icon in the toolbar
   - Find "Tab Recorder" and click the pin icon

## Usage

### Recording a Tab

1. **Navigate to the tab** you want to record
2. **Click the Tab Recorder extension icon** in the toolbar
3. **Click "Start Recording"** button
4. The extension will begin recording the tab's audio and video
5. A recording indicator will appear showing the recording is active

### Recording Multiple Tabs Simultaneously

1. **Start recording on the first tab** as described above
2. **Switch to another tab** you want to record
3. **Click the Tab Recorder extension icon** and click "Start Recording"
4. You can now record multiple tabs at the same time
5. Each tab's recording is independent and can be stopped individually

### Stopping the Recording

1. **Click the Tab Recorder extension icon** on the tab you want to stop
2. **Click "Stop Recording"** button
3. The recording will automatically save to your downloads folder
4. The file will be named `tab-{tabId}-recording-YYYY-MM-DDTHH-MM-SS.webm`

## Technical Details

### Architecture

The extension uses a **Manifest V3** architecture with the following components:

- **[`popup.html`](popup.html) / [`popup.js`](popup.js)**: User interface with Start/Stop buttons
- **[`background.js`](background.js)**: Service worker that manages the recording state and coordinates between components
- **[`offscreen.html`](offscreen.html) / [`offscreen.js`](offscreen.js)**: Offscreen document that handles the actual MediaRecorder API

### APIs Used

- **chrome.tabCapture**: Captures the tab's media stream
- **chrome.offscreen**: Creates an offscreen document for background recording
- **MediaRecorder API**: Records the captured stream
- **chrome.downloads**: Saves the recording to the downloads folder

### File Format

Recordings are saved in **WebM format** with the following codecs:
- **Video**: VP8
- **Audio**: Opus

### Browser Support

- ✅ Microsoft Edge 141+
- ✅ Google Chrome 116+
- ✅ Other Chromium-based browsers with Manifest V3 support

## Limitations

- Recording stops automatically if:
  - The tab is closed
  - You navigate to a different URL in the recorded tab
- Audio playback in the recorded tab continues during recording (using Web Audio API routing)
- Each recording session creates a separate offscreen document for media capture

## File Structure

```
Chrome_Multi_Window_Recorder/
├── src/
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   ├── background/
│   │   └── background.js
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── offscreen.js
│   └── assets/
│       ├── icons/
│       └── styles/
├── tools/
│   ├── generate-icons.js
│   └── convert-to-png.py
├── manifest.json
├── README.md
├── INSTALL.md
└── PROJECT_STRUCTURE.md
```

For a detailed breakdown, see [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md).

## Permissions

The extension requires the following permissions:

- **tabCapture**: To capture audio and video from tabs
- **offscreen**: To create an offscreen document for recording
- **activeTab**: To identify the currently active tab
- **downloads**: To save recordings to the downloads folder

## Troubleshooting

### Recording doesn't start

- Make sure you're on a regular web page (not chrome:// or edge:// pages)
- Check that the tab has audio/video content to record
- Try reloading the extension

### No audio in recording

- Ensure the tab is playing audio when you start recording
- Check your system audio settings
- Try recording a different tab

### Extension doesn't load

- Verify all files are in the correct directory
- Make sure you've generated the icon files using [`icon-generator.html`](icon-generator.html)
- Check the browser console for errors (F12 → Console)

## Privacy

This extension:
- ✅ Only records when you explicitly click "Start Recording"
- ✅ Only records the active tab you're viewing
- ✅ Stores recordings locally on your computer
- ✅ Does not send any data to external servers
- ✅ Does not collect any user information

## Development

Based on research from:
- [Chrome Extensions Screen Capture Guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)
- [Chrome TabCapture API Documentation](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- Community examples from GitHub repositories

## License

This extension is provided as-is for educational and personal use.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the browser console for error messages
3. Ensure you're using Microsoft Edge 141 or above

---

**Built with ❤️ for Microsoft Edge 141+**