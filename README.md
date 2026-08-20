# Caption Studio

Caption Studio is an Android-only, local-first automatic subtitle editor. Import a video, generate word-timed captions on the phone, then edit and style them without transcription credits, font limits, a watermark, or an API key.

## Install it on an Android phone

### Easiest: download on the phone

1. Open the [latest Caption Studio release](https://github.com/Hatsunama/Caption-Media/releases/latest) on the phone.
2. Tap **caption-studio-android.apk**.
3. Open the finished download.
4. If Android asks, allow **Install unknown apps** for the browser or file manager you used.
5. Tap **Install**, then open **Caption Studio**.

Android may show a Play Protect warning because this independent APK is not installed through Google Play. Check that the address is this repository before continuing. Never download the APK from a mirror or reposting site.

The current beta APK supports 64-bit ARM Android devices running Android 7 or newer, including the Solana Seeker and nearly all current physical Android phones. The source project retains React Native targets for 32-bit ARM, x86, and x86_64 builds as well.

### From Termux on the phone

This downloads the same release APK; it does not compile the app on the phone.

```bash
pkg update
pkg install curl
termux-setup-storage
curl -L -o ~/storage/downloads/caption-studio-android.apk \
  https://github.com/Hatsunama/Caption-Media/releases/latest/download/caption-studio-android.apk
termux-open ~/storage/downloads/caption-studio-android.apk
```

When `termux-setup-storage` runs, tap **Allow**. If `termux-open` shows a chooser, select Android's package installer. Then allow **Install unknown apps** for Termux when Android asks.

### From a Windows PC with the phone plugged in

1. Install Google's [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools).
2. On the phone, open **Settings → About phone** and tap **Build number** seven times.
3. Open **Settings → System → Developer options** and enable **USB debugging**.
4. Plug in the phone and choose **File transfer** if Android shows a USB-mode prompt.
5. Download **caption-studio-android.apk** from the [latest release](https://github.com/Hatsunama/Caption-Media/releases/latest) to the PC.
6. Open PowerShell in the folder containing the APK and run:

```powershell
adb devices
adb install -r .\caption-studio-android.apk
```

The first time `adb devices` runs, unlock the phone. Tap **Allow** on **Allow USB debugging?** and optionally check **Always allow from this computer**. Run the two commands again if the device initially says `unauthorized`.

## What the current Android build includes

- Android video import with source-orientation-aware preview
- Persistent first-frame thumbnails in the editor and project list, with readable date/time names replacing UUIDs and camera-number filenames
- A dedicated `com.hatsunama.captionstudio` Android identity so Caption Studio installs as its own app
- On-device Whisper transcription through `whisper.rn`
- Native Android audio decoding to PCM WAV without a cloud API
- Presentation-timestamp-aware audio extraction plus on-device Silero voice-activity detection, so Whisper tokens inside opening or interior silence are rejected instead of becoming early captions
- Responsive preparation feedback at 5% after 3 seconds and 10% after 23 seconds (an exact 20-second interval) while long videos are being decoded
- Safe **Generate again** control for replacing caption text/timing while preserving the project style and added layers
- Downloadable Fast, Balanced, and Accurate Whisper model tiers
- Caption grouping from word timestamps
- A layered, magnetic timeline with a fixed video track plus reorderable caption, added-text, and image/sticker tracks
- Neon pink/blue/green subtitle blocks that stay end-to-end on one lane; genuine overlaps automatically move to additional visible lanes so no subtitle can hide underneath another
- Always-visible left and right timing grips: drag either edge directly, even before selecting the subtitle, while the block body remains available for timeline scrolling
- Clear **Undo** and **Redo** controls directly below the video for timeline, transform, style, layer, and video-edit changes
- TikTok-style caption manipulation: drag to move, pinch to resize text, twist to rotate, resize from four large edge bars, or use the corner resize/rotate control
- Project default → caption override → word override style inheritance
- An explicit **This subtitle / All subtitles** styling decision
- One searchable font browser with 32 deliberately varied OFL fonts, favorites, recents, two-color treatments, and unlimited `.ttf`/`.otf` imports
- 21 data-driven caption animations whose motion restarts from each spoken word's timestamps, including three visibly different emoji-reaction modes
- Word-aware emoji reactions (for example camera, money, music, emotion, warning, food, and movement) instead of a fixed random emoji set
- Added text and phone images with their own timing, layer order, movement, resizing, rotation, and deletion controls
- Source, 9:16, 16:9, 1:1, and 4:5 canvases
- Fit and Fill framing for making a wide clip fill a TikTok canvas
- Direct video drag, pinch-to-resize, two-finger rotation, size buttons, 90-degree rotation, and a precise free-angle scrubber
- Nondestructive video split, clip deletion, and edge trimming with magnetic ripple updates to timed captions and visual layers
- Local SQLite project snapshots

Styled MP4/SRT/ASS export and production signing remain pre-release work. Video cuts are currently represented and previewed nondestructively in the project timeline; final rendered-video export is not yet available. The source video is never rewritten by editing operations.

## Architecture

- Expo SDK 57 / React Native 0.86
- Custom Android native build; this project does not run in Expo Go
- `expo-video` for hardware-backed preview
- `whisper.rn` for local inference
- Local Expo Kotlin module for Android media metadata and audio decoding
- Expo SQLite for nondestructive project state

Caption appearance resolves in this order:

```text
project default style
  → caption override
    → word override
```

Video and text transforms use normalized coordinates so projects remain portable between source, preview, and export resolutions.

## Build from source on Windows

Requirements: Node.js 20+, Android SDK 36, JDK 17, and an Android device with USB debugging enabled.

Clone to a short path such as `C:\Caption-Media` or `D:\Caption-Media`. Android's native CMake build can exceed Windows' object-file path limit when the repository is nested deeply under Documents.

```powershell
git clone https://github.com/Hatsunama/Caption-Media.git C:\Caption-Media
cd C:\Caption-Media
npm install
npm run android
```

`npm run android` generates the native Android project, applies the repository's Windows/Gradle compatibility patch, builds the app, installs it on the connected device, and launches it.

For an already-installed development build:

```powershell
adb reverse tcp:8081 tcp:8081
npx expo start --localhost
```

The first transcription downloads the selected model once. Later transcription can run offline.
After installing an update that improves transcription timing, open an existing project and tap **Generate again** once to replace its previously saved word timings; project styling and added layers are preserved.

## Privacy and product principles

- Ordinary caption generation does not require an OpenAI API key.
- Source videos and transcription stay on the device during the normal workflow.
- No watermark, transcription credits, font packs, export quota, or per-style paywall is part of the product design.
- Imported fonts remain the user's responsibility to license for their intended use.

## License

MIT. Third-party libraries and downloaded models retain their own licenses. Bundled typefaces come from Google Fonts under the SIL Open Font License; the individual license files are preserved in [`assets/fonts/licenses`](assets/fonts/licenses).
