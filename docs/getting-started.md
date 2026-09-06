# Getting started

## Run locally

There is no build step in the source path. Serve the folder with any static server and open the entry HTML.

- **VS Code Live Server** — right-click `HelloLearner.html` → *Open with Live Server*. This is the recommended path.
- **Any static server** — `python -m http.server` from this directory, then open `http://127.0.0.1:8000/HelloLearner.html`.

Do **not** use `npm run dev`. The Vite dev server belongs to the release pipeline; it rewrites source files and reaches the network. See `AGENTS.md`.

### Local KeepworkSDK

When the host is `127.0.0.1` or `localhost` and the path does not contain `/dist/`, `js/app.js` tries to import the SDK from a local dev server:

```text
http://127.0.0.1:5001/index.ts
```

If that server is not running, the app logs a warning and falls back to the CDN bundle (`SDK_CDN_URL` in `js/config.js`). A missing local SDK is a warning, not a failure.

### URL parameters

| Parameter | Values | Default | Effect |
| --- | --- | --- | --- |
| `token` | Keepwork token | `''` | Injected into the SDK constructor and the engine iframe URL. Memory-only, never persisted or logged. |
| `workspace` | letters, digits, spaces, `_`, `-`, CJK, ≤ 64 chars | `HelloLearner` | Standalone PersonalPageStore workspace name. |
| `lang` | `zh-CN`, `en-US` | `zh-CN` | Switches integration and primary shell labels. Authored lesson explanations stay Chinese in this release. |

Embedded mode is detected automatically via `window.parent !== window`; there is no parameter for it.

## Commands

```bash
npm run dev      # Vite dev server on 127.0.0.1:3005 — RELEASE PIPELINE, see warning below
npm run build    # vite build + scripts/generateRelease.mjs
npm run upload   # npm run build + scripts/uploadRelease.mjs
```

**Agents must not run any of these.** `npm run build` mutates tracked source and reaches the network:

1. Downloads the live KeepworkSDK bundle and rewrites `SDK_CDN_URL` in `js/config.js` with its content hash.
2. Rewrites `../AIChat/AIChat.html` in `js/aichat-bridge.js` to the released AIChat URL.
3. Empties and rebuilds `dist/`.

## Build output

`vite build` produces two HTML entries and copies `SKILL.md` and `data/` next to the output:

```text
dist/
  HelloLearner.html
  avatar-preview.html
  SKILL.md
  data/
    curriculum-data.js
    roleplay-data.json
    avatar-config.json
  assets/
    HelloLearner-<hash>.js
    HelloLearner-<hash>.css
    learner-runtime-<hash>.js
    avatar-config-<hash>.json
    favicon-<hash>.svg
```

`data/` is copied as a side-by-side runtime resource because the curriculum and roleplay scripts are loaded as classic `<script>` tags in standalone mode.

## Release

`scripts/generateRelease.mjs` runs after the build:

1. Hashes every file in `dist/` (path + contents) into a 12-char `releaseHash`.
2. Writes `release/HelloLearner_v1.html` — the built HTML with a `<base href="https://cdn.keepwork.com/maisi/hellolearner/release/<hash>/">` injected.
3. Writes `release/release.json` with `{ releaseHash, baseHref }`.

`scripts/uploadRelease.mjs` then uploads `dist/` to that prefix using the repo's shared uploader:

```text
.github/skills/upload-deploy-cdn-files/qiniu_upload_local_files.py
```

It resolves the repo root as five levels up from `scripts/`, and uses `python` on Windows or `python3` elsewhere (override with `PYTHON`).

Release constants live in `scripts/releaseConfig.mjs`:

| Constant | Value |
| --- | --- |
| `entryHtmlName` | `HelloLearner.html` |
| `releaseHtmlName` | `HelloLearner_v1.html` |
| `cdnReleaseBase` | `https://cdn.keepwork.com/maisi/hellolearner/release` |

## Generated output — never hand-edit

`dist/`, `release/HelloLearner_v1.html`, `release/release.json`, `node_modules/`.

## Verifying a change

```bash
node --check js/<changed>.js
node -e "JSON.parse(require('fs').readFileSync('data/avatar-config.json','utf8'))"
git diff --check
```

Then open the app from a static server and check:

- Bump the `?v=` cache buster on every module you edited, or your change will not appear.
- Exercise the first and last curriculum lesson and one roleplay end to end.
- Check standalone anonymous state, then authenticated persistence across a reload.

See `qa-report.md` for the full checklist.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Edit does not appear in the browser | Missing `?v=` bump on the changed module |
| SDK is undefined or auth silently empty | Local SDK on `127.0.0.1:5001` is down and the CDN is blocked; check the console warning |
| Live2D coach is blank | Live2D CDN unreachable; the app keeps the static fallback by design |
| No audio | Keepwork TTS failed silently, or playback was not unlocked by a user gesture |
| Save status stuck on "正在保存学习进度" | Workspace backend write rejected; check the console for `[HelloLearner] save failed` |
| Progress never persists | User is anonymous — every write is gated on `auth.loggedIn` by design |
