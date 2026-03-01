# Vape 'n' Vibe

<p align="center">
  <img src="https://raw.githubusercontent.com/KenKaiii/vape-n-vibe/main/assets/icon.png" alt="Vape 'n' Vibe" width="200">
</p>

<p align="center">
  <strong>Push-to-talk voice transcription. Fully local. Completely free.</strong>
</p>

<p align="center">
  <a href="https://github.com/KenKaiii/vape-n-vibe/releases/latest"><img src="https://img.shields.io/github/v/release/KenKaiii/vape-n-vibe?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=for-the-badge" alt="GPL v3 License"></a>
  <a href="https://youtube.com/@kenkaidoesai"><img src="https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube"></a>
  <a href="https://skool.com/kenkai"><img src="https://img.shields.io/badge/Skool-Community-7C3AED?style=for-the-badge" alt="Skool"></a>
</p>

Hold a key, speak, release. Your words get transcribed and pasted instantly into whatever app you're using. No cloud. No API keys. No subscription. Everything runs on your machine.

---

## Why this exists

Voice typing shouldn't require a cloud service, a monthly fee, or trusting someone else with your audio. Vape 'n' Vibe runs Whisper locally on your hardware. Your voice never leaves your computer.

Press a hotkey, talk, let go. The transcription shows up wherever your cursor is. That's it.

---

## What it does

### Push-to-talk transcription

Hold your hotkey (fn on Mac, Ctrl+Space on Windows), speak, release. Whisper transcribes your audio and the text is pasted into the focused app automatically. No app switching, no copy-paste.

### Runs entirely on your machine

Uses whisper-large-v3-turbo (quantized) for fast, accurate transcription. No internet connection needed after the one-time model download. No API keys. No accounts.

### Works with any app

The transcribed text goes straight to your clipboard and gets pasted into whatever's focused. Text editor, browser, Slack, terminal, anything.

### Visual feedback

A transparent overlay shows you when it's recording with a real-time frequency visualizer. Unobtrusive, always-on-top, click-through.

### Configurable

- Rebind the hotkey to any key
- Pick your microphone
- Choose transcription language or let it auto-detect
- Mute system audio during recording to avoid feedback

### Auto-updates

Ships with auto-update support via GitHub releases. You'll get notified when a new version is available.

---

## Getting started

### Download

| Platform | Architecture                | Link                                                                                               |
| -------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| macOS    | Apple Silicon (M1/M2/M3/M4) | [Download](https://github.com/KenKaiii/vape-n-vibe/releases/latest/download/vape-n-vibe.dmg)       |
| Windows  | x64                         | [Download](https://github.com/KenKaiii/vape-n-vibe/releases/latest/download/vape-n-vibe-setup.exe) |

### Setup

1. Install and launch the app
2. It downloads the Whisper model on first run (~1-2 GB, one-time)
3. Grant microphone + accessibility permissions when prompted (macOS)
4. Start talking

That's it.

---

## macOS permissions

The app needs a few permissions to work:

- **Microphone** — to record your voice
- **Accessibility** — to detect the hotkey globally and simulate paste
- **System Events** — to paste into the focused app via Cmd+V

The app prompts for all of these on first run.

---

## Privacy

- All transcription runs locally via Whisper.cpp
- Audio is never sent anywhere
- No analytics, no telemetry, no cloud
- The only network request is the one-time model download from HuggingFace

---

## For developers

```bash
git clone https://github.com/KenKaiii/vape-n-vibe.git
cd vape-n-vibe
npm install
npm start
```

Stack: Electron + whisper-node + uiohook-napi + native Obj-C (macOS fn key)

```bash
npm test          # 50 tests via vitest
npm run lint      # eslint
npm run build:mac # build for macOS
npm run build:win # build for Windows
```

---

## Community

- [YouTube @kenkaidoesai](https://youtube.com/@kenkaidoesai) — tutorials and demos
- [Skool community](https://skool.com/kenkai) — come hang out

---

## License

GPL-3.0

---

<p align="center">
  <strong>Talk. Transcribe. Paste. All local, all free.</strong>
</p>

<p align="center">
  <a href="https://github.com/KenKaiii/vape-n-vibe/releases/latest"><img src="https://img.shields.io/badge/Download-Latest%20Release-blue?style=for-the-badge" alt="Download"></a>
</p>
