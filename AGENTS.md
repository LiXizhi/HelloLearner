# HelloLearner contributor instructions

These instructions apply to every file under this `HelloLearner/` directory.

HelloLearner is the learner-only H5 application behind the catalog product **LanguageLearner** — a Chinese-first, mobile-first English learning experience for Keepwork users. It runs in two modes:

- **Standalone** — opened directly in a browser. It mounts a hidden, non-persistent AIChat iframe as its LLM engine and persists through `sdk.personalPageStore`.
- **Embedded** — loaded as an AIChat external tool iframe. It talks to the parent over `aichat.external-tool.v1` and persists through the host workspace bridge.

The public product name is `LanguageLearner` (`APP_NAME`); the folder, entry HTML, and internal app id are `HelloLearner`. Do not rename either casually — the tool id is a stable persistence key in the AIChat catalog.

## Read this first

Read in this order before any non-trivial change:

1. `docs/index.md` — document map and reading order.
2. `docs/architecture.md` — module ownership, data flow, and fallback design.
3. `docs/design.md` — product scope and the 10 acceptance criteria.
4. `docs/external-tool-protocol.md` — required before touching `js/aichat-bridge.js` or any host-facing behavior.
5. `SKILL.md` and `observer-copilot.md` — required before touching Voice/Observer behavior.

## Tech stack (no exceptions)

- Plain ES modules, plain CSS, plain HTML. **No framework, no TypeScript, no JSX, no bundler in the source path, no npm runtime dependency.**
- `HelloLearner.html` is the entry. It loads the Keepwork Tailwind CDN, then `data/curriculum-data.js` as a classic script, then `js/app.js` as a module. The app awaits `js/roleplay-catalog.js` to load and validate `data/roleplay-data.json` before initializing the runtime.
- There is no `DOMContentLoaded` wrapper; `js/app.js` calls `bootstrap()` directly at module scope.
- Vite is **only** the human-controlled deployment pipeline. It is not the way this app runs in development.
- Curriculum and roleplay data are authored content, not app code. Treat them as data.

### Preserved demo assets — do not reformat

`HelloLearner.html` (97 KB) and `styles.css` (80 KB) are ported from the supplied Hello Learner demo. They carry `data-page-node-id="…"` attributes emitted by the design export tool, and `styles.css` keeps the demo's visual system verbatim so the UI stays pixel-faithful.

- Do **not** strip `data-page-node-id` attributes, reorder the markup wholesale, or reformat `styles.css`.
- New integration controls go in the JS view modules and use the Keepwork Tailwind CDN utilities, not new blocks in `styles.css`, unless the change is genuinely a demo-visual fix.
- `data/*.js` and `data/avatar-config.json` are content. Edits there are data edits, not refactors.

## Module ownership

| File | Owns | Change it when |
| --- | --- | --- |
| `js/config.js` | Constants and URL-param-derived runtime config | Adding a constant or a new URL parameter |
| `js/state.js` | Single integration state + subscribe/update | Adding a top-level state field |
| `js/utils.js` | DOM/escape/event helpers | Adding a shared helper |
| `js/auth.js` | KeepworkSDK-only auth lifecycle | Changing login/register/logout/profile behavior |
| `js/storage.js` | Record schema, defaults merge, debounced serialized writes, both backends | Changing what or how records persist |
| `js/aichat-bridge.js` | The only postMessage transport, command whitelist, bounded context | Changing the host protocol |
| `js/speech.js` | One TTS lifecycle (SpeechRTC → HTTP TTS → Chrome fallback) | Changing speech behavior |
| `js/avatar.js` | Live2D PIXI/Cubism init, mouth sync, static fallback | Changing rendering or framing |
| `js/view_select_avartar.js` | Coach picker dialog + iframe live preview | Changing role selection UI |
| `js/view_shell.js` | Account control, save status, progress projections | Changing header or dashboard numbers |
| `js/view_profile_setup.js` | First-use onboarding form binding | Changing onboarding fields |
| `js/learner-runtime.js` | Ported lesson/grammar/cloze/dialogue/roleplay behavior | Changing the learning interaction itself |
| `js/app.js` | Bootstrap, orchestration, event wiring, command execution | Wiring new events or commands |

Rules:

- `js/learner-runtime.js` is 140 KB of ported deterministic behavior. **Prefer additive, local edits.** Never reformat or restructure it wholesale; the port fidelity is the value.
- Runtime code emits events; it never persists. `js/app.js` is the only place that turns a learner event into a storage write.
- Only `js/app.js` and the view modules may touch `window.helloLearner*`.
- New integration surface belongs in a `js/view_*.js` module, not inline in `HelloLearner.html` and not inside `learner-runtime.js`.

## Cache-buster convention (easy to miss)

Browser and Vite caching is defeated by a `?v=<yyyymmdd><letter>` suffix on local module references, not by a build hash. Current references:

- `HelloLearner.html`: `styles.css?v=…`, `js/app.js?v=…`
- `js/roleplay-catalog.js`: `../data/roleplay-data.json?v=…`; bump its import suffix in `js/app.js` when changing the catalog loader or JSON URL.
- `js/app.js`: `./speech.js?v=…`, `./avatar.js?v=…`, `./view_select_avartar.js?v=…`, `./learner-runtime.js?v=…`
- `js/view_select_avartar.js`: `../data/avatar-config.json?v=…`, `avatar-preview.html?v=…`

**Whenever you modify one of those modules, bump its `?v=` to today's date plus a new letter.** Skipping this makes your change invisible in the browser with no error, and it is the single most common cause of "I edited it but nothing happened" in this project.

## Data flow

```text
DOM action -> learner-runtime -> AIChat LLM request
  (parent when embedded, hidden child iframe when standalone)
-> validated coach turn -> learner event -> app.js -> state update
-> view projection -> debounced storage write
```

Host commands take the reverse path: `outer AIChat -> bridge validation -> command whitelist -> app callback -> learner runtime -> result`.

### Runtime globals

Set by `js/app.js`, consumed by `learner-runtime.js`:

- `window.helloLearnerRuntime` — `openLessonById`, `openRoleplayById`, `navigate`, `applyProfile`, `showProfileSetup`, `getContext`
- `window.helloLearnerSpeech` — `speak`, `cancel`, `destroy`
- `window.helloLearnerAI` — the `AIChatBridge` instance (`requestLLM`)
- `window.helloLearnerAvatar` — the `AvatarController` instance
- `window.helloLearnerMountPracticeAvatar` / `window.helloLearnerUnmountPracticeAvatar` — retarget the Live2D canvas between the coach stage and the practice room
- `window.sdk` — the single `KeepworkSDK` instance

### Learner events

`hellolearner:runtime-ready`, `hellolearner:screen`, `hellolearner:profile-save`, `hellolearner:setting`, `hellolearner:lesson-complete`, `hellolearner:roleplay-complete`.

Every completion write is gated on `getState().auth.loggedIn`; anonymous users are sent to the Keepwork login window instead of being silently persisted.

## Persistence contract

- Three core learner records: `.hellolearner/profile.json`, `.hellolearner/progress.json`, `.hellolearner/settings.json`. General lesson plans additionally use `.hellolearner/plans/index.json`, `<planId>/plan.json`, `<planId>/lessons/<lessonId>.json`, and `<planId>/progress.json`; see `docs/general-lesson-plans.md`.
- Every record carries `schemaVersion: 1` and `updatedAt`. Bump `SCHEMA_VERSION` in `js/config.js` only for a breaking shape change.
- Reads deep-merge known defaults and **preserve unknown top-level and nested fields**. Never drop a field you do not recognize.
- Invalid JSON falls back to defaults with a non-blocking warning; never throw on load.
- Writes are debounced (450 ms), serialized through a promise queue, and always write the complete document.
- Standalone backend: `sdk.personalPageStore.withWorkspace(workspace)`; workspace defaults to `HelloLearner` and is sanitized to letters, digits, spaces, `_`, `-`, and CJK up to 64 chars.
- Embedded backend: `tool:workspace:read` / `tool:workspace:write` over the bridge, bound by the host to its current workspace.
- Plan storage is separate from core learner records. Standalone `settings.lessonWorkspace` switches only plans/progress; embedded plan calls include `expectedWorkspaceId`. Drain old writes before standalone switching and invalidate generation when the host binding changes. `plan-model.js` owns validation, `plan-store.js` artifact storage, `lesson-planner.js` AI generation, and `view_lesson_plans.js` / `view_plan_runner.js` their UI. Only app callbacks persist runtime checkpoints.
- Anonymous standalone users get an in-memory backend only.

## Security and privacy (hard rules)

- **No localStorage.** Ever. Not for learner data, not for preferences.
- **Never persist, log, or forward the Keepwork token.** It is read once from the URL, held in memory, and passed to the engine iframe over postMessage only.
- The standalone AIChat engine is deliberately fresh and non-persistent (`chat=new`, `persist=0`).
- Bounded context excludes token, profile identifiers, raw files, full history, and bulk progress. Do not widen it.
- No password, hash, or local account code may be reintroduced. The demo's admin/CMS surface stays excluded.

## Degradation rules

Every optional capability must fail soft, and the app must remain fully usable after the initial source load:

- Live2D CDN or PIXI failure → hide the canvas, keep the static coach.
- Keepwork TTS failure → stay silent, do not surface a stack of errors. Chrome `speechSynthesis` is used only when the SDK speech APIs are absent.
- Microphone denied or unavailable → typed practice stays complete; show one concise toast.
- AIChat engine unavailable → keep the learner turn retryable, roll back prepared goal progress, show a concise error. **Never substitute a scripted reply for an LLM turn.**
- Host workspace timeout → keep records in memory, surface a save warning, allow retry.

## Voice and Observer protocol

- Catalog skill id `language-learner`, display name `LanguageLearner`. Standalone tutor skill id `local-language-learner`.
- `SKILL.md` is Voice-primary: 1–3 short sentences per turn, one question at a time, gentle single correction, no invented scores or progress.
- `observer-copilot.md` is the background reasoner. It never speaks to the learner. It sends `sendAgentMessage` notes prefixed exactly `Copilot小纸条：`. Voice must never quote that prefix.
- Only app/runtime events award completion. Neither agent may mark a lesson complete, compute a score, change a streak, or add speaking minutes.

## Build and release — human only

**Agents must never run Vite, `npm run dev`, `npm run build`, `npm run upload`, `scripts/generateRelease.mjs`, or `scripts/uploadRelease.mjs`.**

These are not merely slow; `npm run build` mutates tracked source and reaches the network:

- It downloads the live KeepworkSDK bundle and **rewrites `SDK_CDN_URL` in `js/config.js`** to match the CDN content hash.
- The engine URL is selected at runtime: `127.0.0.1` / `localhost` use local `../AIChat/AIChat.html`; other hosts use AIChat release. Builds must preserve this selection.
- It empties `dist/`, then `scripts/uploadRelease.mjs` uploads to `https://cdn.keepwork.com/maisi/hellolearner/release/<hash>/`.

Validate source changes with the checks below instead. If a human asks for a release, say so explicitly rather than running the pipeline yourself.

Generated output — do not hand-edit: `dist/`, `release/HelloLearner_v1.html`, `release/release.json`, `node_modules/`.

## Verification

Source-level checks are the default and are sufficient for ordinary changes:

```bash
# every changed ES module
node --check js/<changed>.js

# after data or catalog edits
node -e "JSON.parse(require('fs').readFileSync('data/avatar-config.json','utf8'))"

# whitespace/conflict hygiene
git diff --check
```

Then:

- Serve the folder with VS Code Live Server (or any static server) and open `HelloLearner.html` directly. **Do not use `npm run dev`** — the Vite dev server is part of the release pipeline.
- On `127.0.0.1` / `localhost`, the app imports the SDK from `http://127.0.0.1:5001/index.ts` and falls back to the CDN if that is not running. A missing local SDK is a warning, not a failure.
- Exercise at least the first and last curriculum lesson and one roleplay end to end.
- Verify standalone anonymous state, then standalone authenticated persistence across a reload.
- Reports that need real credentials, microphone permission, or cross-device sync may be marked as pending manual follow-up; do not fake them.

## Do not do these

- Do not add a framework, build step, TypeScript, or npm runtime dependency to the source path.
- Do not introduce localStorage, passwords, tokens-on-disk, or a second auth system.
- Do not add a command outside the audited whitelist, or a second postMessage channel.
- Do not widen bridge context beyond the bounded shape.
- Do not reformat `HelloLearner.html`, `styles.css`, `data/*.js`, or `js/learner-runtime.js`.
- Do not let a `busy` status end without a `done` or `error`.
- Do not overwrite or revert unrelated work in a dirty worktree.

## Related directories

- `../AIChat/` — the host app. Its `AGENTS.md` and `docs/external-html-tools.md` define the parent side of the protocol this app implements. Read them before changing bridge behavior.
