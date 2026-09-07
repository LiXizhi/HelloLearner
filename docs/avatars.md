# Coach avatars

The coach is a Live2D character rendered on a PIXI canvas that also drives mouth animation while speaking. This document covers the model catalog, the picker UI, and the live preview page.

## Components

| File | Role |
| --- | --- |
| `js/avatar.js` | `AvatarController` — PIXI/Cubism init, model loading, mouth animation, framing, static fallback |
| `js/view_select_avartar.js` | Picker dialog, live preview iframe controller, voice preview, apply action |
| `data/avatar-config.json` | The catalog: 9 avatars with model path, copy, tier, and voice profile |
| `avatar-preview.html` | Standalone Live2D preview page, loaded in a hidden iframe inside the picker |

`avatar-preview.html` is a **second Vite entry** (`AvatarPreview` in `vite.config.mjs`), so it is built and released alongside the app.

## Model catalog

Loaded at bootstrap by `initAvatarSelector()` from `data/avatar-config.json`. Each entry:

```jsonc
{
  "id": "maya",
  "name": "Maya",
  "model": "littlegirl/littlegirl.model3.json",
  "vip": false,
  "scale": 3.3,                 // optional, defaults to 1
  "role": "温柔启蒙教练",
  "personality": "耐心、亲切，擅长帮助你轻松开口。",
  "specialty": "日常交流 · 发音入门",
  "sample": "Hi! Ready to practice English together?",
  "voice": {
    "language": "en-US",
    "voiceType": "zh_female_tianmeiyueyue_moon_bigtts",
    "label": "甜美悦悦",
    "names": ["Ava", "Samantha"],
    "rate": 0.84,
    "pitch": 1.08
  }
}
```

| Field | Used by |
| --- | --- |
| `id` | Selection key; persisted via the runtime profile |
| `model` | Path under the Live2D CDN `assets/` directory |
| `vip` | Tier badge and the entitlement gate on **使用此角色** |
| `scale` | Extra fit multiplier in the preview page only |
| `role` / `personality` / `specialty` / `sample` | Picker detail copy |
| `voice` | `SpeechController.setVoicePreference()`; `sample` is what 试听声音 speaks |

Current catalog: `maya` (free), `waiter`, `haru`, `hiyori`, `mark`, `natori`, `rice`, `mao`, `wanko` (all VIP).

### Adding an avatar

1. Add the model directory to the Live2D CDN under `digitalhuman/live2d/assets/`.
2. Append an entry to `data/avatar-config.json`.
3. Bump `CONFIG_URL`'s `?v=` in `js/view_select_avartar.js`.
4. Verify the preview page loads the model and that 试听声音 works.

## Runtime behavior

- `AvatarController.initialize()` loads three CDN scripts in order — `pixi-7.4.3.min.js`, `live2dcubismcore.min.js`, `cubism4-lipsyncpatch-0.5.0-ls-8.min.js` — then creates the PIXI application on `#live2dCanvas`.
- Mouth animation writes `ParamMouthOpenY` / `ParamMouthForm` (with `PARAM_*`, `ParamMouthUp`, `ParamA` fallbacks) from `setSpeaking()`.
- The controller retargets between the coach stage (`#avatarStage`) and the practice room stage (`#practiceAvatarStage`) via `window.helloLearnerMountPracticeAvatar` / `window.helloLearnerUnmountPracticeAvatar`, both exposed by `js/app.js`.
- Clicking the stage toggles close-up framing.
- Reduced motion is honored through `settings.reducedMotion`.
- **Any failure hides the canvas and logs a warning.** The static coach stays visible. Never let a Live2D failure break the learning flow.

## Voice coupling (easy to miss)

Selecting a role sets two things:

```js
speech.setVoicePreference(item.voice);
window.helloLearnerVoice = item.voice;
```

`window.helloLearnerVoice` is read by the ported `learner-runtime.js` for its own speech calls (language, rate, pitch). If you change the voice shape in `avatar-config.json`, update both consumers — `js/speech.js` and the runtime's fallback path in `js/learner-runtime.js`.

The picker's 试听声音 button temporarily switches to that role's voice and restores state on completion or a second click (cancel).

## VIP gating

`isVip` is resolved once per dialog open via `sdk.isUserVip()`, defaulting to `false` when the SDK has no such method or the call fails.

- VIP roles are always previewable and auditionable. The note `VIP 专属角色，可免费预览与试听` shows for them.
- Applying a VIP role without entitlement shows `此角色为 VIP 专属，请先开通会员` and does nothing else.

Because the value is fetched only on open, an entitlement change during an open dialog is not reflected until it is reopened.

## Preview page protocol

`avatar-preview.html` is a bare Live2D viewer that talks to the picker over postMessage:

```text
frame -> parent : avatar-preview-frame-ready
parent -> frame : { type: 'preview-avatar', id, model, scale }
frame -> parent : avatar-preview-ready { id }   |   avatar-preview-error { id }
```

The controller tracks a `requestId` and drops stale responses, so rapid role switching renders only the last selection. The frame is created lazily on first `show()` and torn down on close.

Pointer movement in the preview drives the model's `focusController`, giving a subtle head-tracking effect.

## Cache busters

Three separate `?v=` values matter here:

- `../data/avatar-config.json?v=…` — bump after editing the catalog.
- `avatar-preview.html?v=…` — bump after editing the preview page.
- The `?v=` on `./view_select_avartar.js` in `js/app.js` — bump after editing the picker.
