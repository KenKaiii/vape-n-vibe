# Vape 'n' Vibe UI

## Design read

- **Surface:** compact native desktop application UI, with a passive recording overlay.
- **Audience:** people who repeatedly dictate text while working in other apps.
- **Single job:** make the active shortcut, input source, language, and transcription model fast to verify and change.
- **Task and risk:** frequent, low-decision settings changes; recording and permission state must remain unmistakable.
- **Platform:** fixed 400 × 340 Electron settings window, keyboard and pointer input, plus a transparent 340 × 150 mouse-through overlay.
- **Constraints:** preserve the existing Slackey wordmark, controls, IPC wiring, and compact window dimensions. The app must remain usable when web fonts are unavailable.

## Evidence and direction

Application UI leads. The closest structural references in the skill corpus are `linear.app` for stable, quiet control placement and `superhuman` for compact keyboard-first utility. `intercom` is the contrast: this window should not become a spacious conversational surface.

The theme is **late-night voice utility**: near-black neutral surfaces keep the persistent tray app calm, vapor green marks ready/processing state, and coral is reserved for recording. The dark theme belongs because the existing app is dark-first and the recording overlay appears over arbitrary desktop content. The temporary overlay uses translucency because it must preserve context over the active app.

## Semantic tokens

- Canvas: `#0b0d0c`
- Base and raised surfaces: `#121613`, `#191e1a`
- Primary, secondary, and muted text: `#f4f7f2`, `#c0c8c0`, `#8f998f`
- Ready/processing signal: `#b7f774`
- Recording signal: `#ff716b`
- Focus: `#d5ffa8`
- Spacing: compact 4 px rhythm with 7–18 px composed gaps
- Radius: 6 px controls, 10 px temporary panels, full radius only for status badges
- Motion: 100 ms micro-feedback and 170 ms state feedback with named properties; reduced motion removes repeated animation

## Type and craft

Slackey remains the product wordmark. DM Sans carries interface text, with Segoe UI as the offline fallback. Controls share one geometry, focus treatment, surface model, and transition curve. Borders express containment; shadows are limited to floating menus, tooltips, modals, and the desktop overlay.

The product-specific signature is a restrained vapor-green plume at the window edge plus a compact signal capsule. During recording, nine coral reeds respond to speech energy; during processing, they resolve into a vapor-green trace drifting across one quiet rail. The state-aware approach follows the useful parts of the compact `VADIndicator` and smoothed `VoiceWave` references from `chevgan/react-ai-voice-visualizer`, while deliberately replacing their generic pulse-ring and spinner patterns. Resting settings remain still.

## Responsive and states

The fixed desktop window keeps four settings visible without scrolling. At narrower widths, selects cap at 56 vw and footer actions retain access. Hover, focus-visible, disabled, ready, recording, granted, update-ready, modal, and menu states use the same tokens. The processing trace runs on a restrained 1.05-second cycle; reduced-motion mode replaces both animations with static, color-coded signal states. Forced-colors mode retains state meaning.
