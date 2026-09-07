# HelloLearner Architecture

The [general lesson plan extension](general-lesson-plans.md) adds a separate
workspace artifact store, lazy planner skill, streamed daily generation and
flexible step runner. The three records and fixed lesson runtime described below
remain the core learner subsystem; plan progress does not share its completion IDs.

## Structure

```text
HelloLearner/
  AGENTS.md              contributor instructions (read first)
  HelloLearner.html
  avatar-preview.html    second Vite entry; standalone Live2D preview page
  styles.css
  favicon.svg
  SKILL.md               Voice tutor agent
  observer-copilot.md    background Observer agent
  vite.config.mjs        release pipeline only
  data/
    default_lesson_index.json    ordered local lesson catalog
    lessons/<unitId>.json
    roleplay-data.json
    avatar-config.json
  js/
    app.js
    roleplay-catalog.js
    config.js
    state.js
    utils.js
    auth.js
    storage.js
    aichat-bridge.js
    speech.js
    avatar.js
    learner-runtime.js
    view_shell.js
    view_profile_setup.js
    view_select_avartar.js
  scripts/
    releaseConfig.mjs
    generateRelease.mjs
    uploadRelease.mjs
  docs/
    index.md
    design.md
    architecture.md
    code-plan.md
    external-tool-protocol.md
    getting-started.md
    avatars.md
    qa-report.md
```

`HelloLearner.html` retains the supplied learner demo's semantic page/modal markup and loads the Keepwork Tailwind CDN, KeepworkSDK, curriculum and roleplay data, then the ES-module bootstrap. The demo's large visual stylesheet remains in `styles.css` to preserve fidelity and avoid an unmaintainable inline block. This is the only Standard Tech Stack deviation; there is still no build step, framework, JSX, TypeScript, external font file, or DOMContentLoaded wrapper.

## Ownership And Data Flow

- `state.js`: single integration state for mode, active screen/lesson/scenario, auth summary, learner records, save status, and speech status. It exposes immutable snapshots and a small subscription/update API.
- `learner-runtime.js`: the ported deterministic lesson, grammar, cloze, speech-input, and roleplay behavior. It emits learner events rather than persisting data itself.
- `app.js`: bootstrap and orchestration. It creates the SDK once, selects embedded or standalone storage, loads records, mounts views, connects runtime events to projections/persistence, and announces `gameLoaded`.
- View modules own integration HTML and local event wiring. Existing demo content remains in the entry template because it is one cohesive learner surface rather than separate routable pages.
- `auth.js`: memory-only URL token injection, Keepwork profile lookup, login/register window, auth-state subscription, logout.
- `storage.js`: schema/default merging, serialized debounced writes, standalone PersonalPageStore backend, and embedded bridge backend.
- `aichat-bridge.js`: the only postMessage transport. Standalone mode mounts a fresh, non-persistent AIChat iframe as the invisible LLM engine; embedded mode uses the parent AIChat directly. It validates parent/engine source and channel, manages request IDs/timeouts, exposes bounded context, and dispatches audited commands.
- `speech.js`: one speech lifecycle. Prefers Keepwork SpeechRTC (`createSession` + blob playback), then HTTP `playSynthesizedAudio`. Chrome `speechSynthesis` is used only when those SDK APIs are missing. It emits speaking state consumed by avatar and app progress tracking.
- `view_live_voice.js`: practice-room start/stop toggle and streaming user/assistant subtitles. AIChat owns the continuous digital-human voice session over the existing bridge; local lesson TTS pauses during live conversation. These subtitles do not trigger a second lesson LLM request or award progress.
- Free talk opens the shared practice room directly, reusing its avatar, message bubbles, text composer and live-voice toggle. It hides curriculum stages, goals and rounds; typed turns use a bounded free-conversation history and never enter lesson evaluation. The older demonstration dialog is no longer a free-talk entry.
- `view_practice_page.js` mounts the practice section in the main page layout and hides the home surface while it is active. Lessons and free talk enter this page directly. At 900px and wider it uses avatar/conversation columns; narrower screens stack them. Returning restores home focus and scroll position and dispatches the existing cleanup event. `AvatarController.setTarget` moves the same canvas; page navigation never creates another Live2D controller or model.
- `avatar.js`: optional PIXI/Cubism model initialization and speaking-driven `ParamMouthOpenY`/`ParamMouthForm`; static fallback on failure.

Flow: `DOM action -> learner-runtime -> AIChat LLM request (parent when embedded, hidden child when standalone) -> validated coach turn -> learner event -> app -> state update -> view projection -> storage queue`. Host commands follow `outer AIChat -> bridge validation -> command whitelist -> app callback -> learner runtime -> result`.

## SDK And Workspace

- SDK constructor: `new KeepworkSDK({ timeout: 30000, token })`; `token` is read once from the URL and never persisted or logged.
- Auth: `getUserProfile()` (with `getCurrentUser()` fallback), `showLoginWindow({ enableRegister: true })` or `loginWindow.show`, `onAuthStateChange()`, and SDK logout when available.
- Standalone persistence: `sdk.personalPageStore.withWorkspace(validatedWorkspace, callback)`; URL `workspace` defaults exactly to `HelloLearner` and allows only letters, digits, spaces, `_`, `-`, and CJK characters up to 64 characters.
- Embedded persistence: `tool:workspace:read` and `tool:workspace:write` over `aichat.external-tool.v1`, bound by the host to its current workspace.
- App files are always `.hellolearner/profile.json`, `.hellolearner/progress.json`, and `.hellolearner/settings.json`.

## Persistence

All records contain `schemaVersion: 1`, `updatedAt`, and their domain fields. Reads deep-merge known defaults while retaining unknown top-level and nested fields. Invalid JSON produces defaults plus a non-blocking warning. Writes are debounced, serialized, and use complete JSON documents.

No learner data, passwords, hashes, or tokens use localStorage. The standalone hidden AIChat engine is fresh and non-persistent (`persist=0`, `chat=new`).

## Views

- `view_shell.js`: account and save-status controls. Callbacks: `onLogin`, `onProfile`, `onLogout`.
- `view_profile_setup.js`: first authenticated learner-profile setup with display name, level, goals, and daily target. Callbacks: `onSave`, `onCancel`.
- `view_select_avartar.js`: coach picker dialog, lazy Live2D preview iframe, voice audition, VIP gate. See `avatars.md`.

The ported learner runtime owns the detailed lesson and roleplay modal wiring, matching the original demo interaction surface.

## Runtime Globals And Events

`app.js` publishes the seams the ported runtime consumes:

- `window.helloLearnerRuntime`: `openLessonById`, `openRoleplayById`, `navigate`, `applyProfile`, `showProfileSetup`, `getContext`.
- `window.helloLearnerSpeech`: `speak`, `cancel`, `destroy`.
- `window.helloLearnerAI`: the `AIChatBridge` instance.
- `window.helloLearnerAvatar`: the `AvatarController` instance.
- `window.helloLearnerVoice`: the active role's voice profile, read directly by `learner-runtime.js`.
- `window.helloLearnerMountPracticeAvatar` / `window.helloLearnerUnmountPracticeAvatar`: retarget the Live2D canvas between the coach stage and the practice room.

Learner events: `hellolearner:runtime-ready`, `screen`, `profile-save`, `setting`, `lesson-complete`, `roleplay-complete`. Only `app.js` turns these into storage writes, and every completion write is gated on `auth.loggedIn`.

## Cache Busters

Local module and data references carry a `?v=<yyyymmdd><letter>` suffix — in `HelloLearner.html`, `js/app.js`, and `js/view_select_avartar.js`. It must be bumped whenever the referenced file changes, or the edit will not appear in the browser.

## Build And Release

Vite is release-only and is not how the app runs in development. `vite build` reaches the network and mutates tracked source: it rewrites `SDK_CDN_URL` in `js/config.js` from the live CDN content hash, rewrites the AIChat engine URL in `js/aichat-bridge.js` to its release form, and copies `SKILL.md` and `data/` beside the output. `scripts/generateRelease.mjs` then hashes `dist/`, injects a `<base href>` into `release/HelloLearner_v1.html`, and writes `release/release.json`. `scripts/uploadRelease.mjs` uploads to `cdnReleaseBase/<hash>/`.

Agents must never run these. See `getting-started.md`.

## Bridge Contract

Capabilities: `tool-context`, `game-world-commands`, `workspace`, `llm`, `voice`.

Audited commands:

- `navigate`: `learning`, `roleplay`, `progress`, or `profile`.
- `openLesson`: validated curriculum ID.
- `openRoleplay`: validated scenario ID.
- `presentPhrase`: bounded text or active lesson phrase, routed through app speech.
- `refreshLearnerState`: reload persisted records.

Context contains only screen, active IDs/titles, level, current exercise/goal index, speaking state, and aggregate completion counts. It excludes token, profile identifiers, raw files, full history, and bulk progress.

## Voice And Observer

The catalog skill ID is `local-language-learner`. `SKILL.md` is Voice-primary, declares `observer-agent: observer-copilot.md`, opens `language-learner`, and grants only `control_game_world` to Voice. The observer uses bounded tool context plus allowed workspace reads/writes under `.hellolearner/`; it sends private guidance with `sendAgentMessage` prefixed exactly `Copilot小纸条：`. Only app/runtime events award completion.

## Risks And Fallbacks

- Live2D CDN/runtime failure: retain static avatar. KeepworkSDK TTS failure stays silent; Chrome speech is only used when the SDK speech APIs are unavailable.
- Browser blocks speech/microphone: typed practice remains complete; show a concise toast.
- AIChat engine unavailable: keep the learner turn retryable, roll back prepared goal progress, and show a concise availability error. Scripted replies are never substituted for an LLM turn.
- Anonymous persistence attempt: preserve in-memory state and open the Keepwork login/register UI.
- Host workspace API timeout: keep records in memory, surface save warning, allow retry/refresh.
- Unknown SDK minor-version API differences: feature-detect profile/login/logout and PPS methods.

## Milestones

1. Port learner shell, styles, favicon, curriculum, and roleplay data; remove CMS entry and external fonts.
2. Add state, utility, auth, storage, bridge, speech, and avatar modules.
3. Adapt learner runtime to events, persisted projections, generic dialogue fallback, and unified speech.
4. Add integration views and app bootstrap.
5. Add Voice/observer skill and AIChat catalog registrations.
6. Add contract tests, syntax checks, browser smoke tests, responsive screenshots, and QA report.

### Authentication refresh stability

The auth adapter coalesces concurrent profile refreshes for the same token and
publishes only changed account snapshots. SDK profile-cache notifications must
not recursively request profiles. Responses from a previous token cannot restore
a logged-out account. The standalone bridge announces its command catalog once
per engine handshake and sends authentication only when the token changes; a new
engine document resets that synchronization. This avoids repeated host profile
requests and redundant UI work while preserving login/logout propagation.

### Standalone startup order

Load SDK authentication first and render the account state as soon as it resolves.
Load learner records and initialize the learner view before mounting the hidden
AIChat engine, allowing a browser paint before engine startup. The account control
shows a loading state rather than a false login prompt during initialization.
Embedded mode starts the bridge early because its learner records require the
host workspace transport.
