# External tool protocol

How HelloLearner talks to AIChat. Implemented by `js/aichat-bridge.js` (`AIChatBridge`). Read this before changing anything host-facing.

LLM requests default to `presentation: 'tool'` with `includeHistory: false`:
typed practice replies render in HelloLearner without automatically opening the
host's 聊天历史 popup. This applies to both learner and host composer input.

HelloLearner advertises `hide-host-pet` so the parent hides its own avatar and
subtitles while the learner tab is active, including during Live Voice. Standalone
engine URL/config also explicitly sets `hide: pet`. Embedded requests continue
to target the parent; no nested engine is mounted. The host resolves Live model
selections for text requests and uses the advertised learner command catalog
instead of injecting pet-game `say` instructions. `say` is not a learner command.

- **Channel:** `aichat.external-tool.v1` (constant `CHANNEL` in `js/config.js`)
- **Tool id:** `language-learner` (constant `APP_ID`)
- **Transport:** `window.postMessage` only. Both sides validate `event.data.channel` and `event.source`.

## Roles

`AIChatBridge` serves two different peers with one class, and picks between them by checking `window.parent !== window`:

| Mode | Engine / LLM peer | Persistence peer |
| --- | --- | --- |
| **Embedded** (`window.parent !== window`) | the parent AIChat window | parent, via `tool:workspace:read|write` |
| **Standalone** (top-level) | a hidden child iframe: `../AIChat/AIChat.html` on `127.0.0.1` / `localhost`; `https://keepwork.com/api/raw/maisi/maisi/webgames/tools/AIChat/release/AIChat_v1.html` on other hosts | `sdk.personalPageStore` |

The engine URL is selected at runtime in both source and release builds. Local URLs retain the page's origin and port; the build does not replace them.

In embedded mode the bridge calls `announceReady()` immediately on `start()`. In standalone mode it calls `mountEngine()` instead, appending a hidden iframe with `layout=thin`, `compact=1`, `chat=new`, `persist=0`, `frontpage=hide`, `workspace=HelloLearner`, and the in-memory `token` when present. The engine is deliberately fresh and non-persistent.

## Handshake

### Embedded

```text
tool  -> parent : tool:ready { toolId, capabilities, commands }
parent -> tool  : host:init
tool  -> parent : tool:ready            (re-announced on host:init)
```

The bridge also accepts `host:init` at any time to mark the engine ready and re-announce.

### Standalone engine

```text
engine -> tool  : host:ready
tool   -> engine: host:init { app, config, capabilities: ['llm'] }
engine -> tool  : tool:ready            -> resolves engineReadyPromise
tool   -> engine: host:auth-set { token, reason }   (only if a token exists)
```

`requestLLM()` awaits `engineReadyPromise` with a 30 s cap before issuing any LLM request.

## Capabilities

Advertised in `tool:ready`:

```text
tool-context, tool-commands, game-world-commands, workspace, llm, voice
```

## Messages — tool to host

| Type | Payload | Sent when |
| --- | --- | --- |
| `tool:ready` | `toolId`, `capabilities`, `commands` | On `start()` when embedded, and on every `host:init` |
| `tool:tool-context` | `requestId`, `ok`, `context` (JSON **string**) | In reply to `host:get-tool-context` or `host:tool-context-request` |
| `tool:tool-command-result` | `requestId`, `ok`, `result` or `error` | After every command |
| `tool:status` | `requestId`, `status`, `message` | `busy` on receipt, then `done` or `error` |
| `tool:llm-request` | `includeHistory: false`, plus detail | An LLM turn is needed |

Every command produces `busy` first and **must** end with `done` or `error`. Never leave a request in `busy`.

## Messages — host to tool

| Type | Handling |
| --- | --- |
| `host:init` | Marks engine ready, re-announces `tool:ready` |
| `host:auth-set` / `host:auth-changed` | Forwarded to `onHostEvent` |
| `host:voice-changed` | `onHostEvent`; `state === 'speaking'` drives the avatar mouth |
| `host:chat-io` | `onHostEvent`; when `source === 'voice'` and `role === 'assistant'`, drives the avatar mouth until `phase` is `done` or `error` |
| `host:get-tool-context` / `host:tool-context-request` | Replies with `tool:tool-context` |
| `host:tool-command` | Validated and executed; see below |
| `host:llm-stream` | Forwarded to the request's optional `onStream` callback; request stays pending |
| `host:llm-error` | Rejects the pending request |
| `host:llm-result` | Resolves the pending LLM request |
| any other with a known `requestId` | Resolves non-LLM requests only; LLM requests wait for result/error |

Messages that are not from `window.parent` or the engine iframe, or whose `channel` does not match, are dropped immediately.

## Commands

Nine commands are allowed, with `snake_case` names accepted on the wire:

| Wire name | Internal | Args | Read-only | Behavior |
| --- | --- | --- | --- | --- |
| `navigate` | `navigate` | `screen`: `learning` \| `roleplay` \| `progress` \| `profile` | no | Clicks the matching bottom-nav button. `learning` maps to tab `path`. |
| `open_lesson` | `openLesson` | `lessonId` | no | Resets the practice room, applies the lesson config, opens the overview dialog. Throws `Unknown lesson` on an invalid id. |
| `open_roleplay` | `openRoleplay` | `scenarioId` | no | Clicks the matching `[data-scenario-id]` card. Throws `Unknown roleplay` on an invalid id. |
| `present_phrase` | `presentPhrase` | `text` (≤ 240 chars) | no | Speaks through `window.helloLearnerSpeech` at `en-US`, rate `0.82`. Falls back to the active lesson title. |
| `refresh_learner_state` | `refreshLearnerState` | — | yes | Reloads persisted records and re-applies projections. |
| `start_lesson_plan` | `startLessonPlan` | optional `request` (≤ 2000 chars) | no | Opens a new planning conversation; only the learner's Save commits the outline. |
| `list_lesson_plans` | `listLessonPlans` | `offset`, `limit` (default 20, max 50) | yes | Returns bounded plan metadata, total, offset and unreadable IDs. |
| `open_lesson_plan` | `openLessonPlan` | `planId` | no | Opens the reviewed daily sequence. |
| `open_plan_lesson` | `openPlanLesson` | `planId`, `lessonId` | no | Opens a cached lesson or starts visible preparation. Acceptance is not generation/learning completion. |

Anything else is rejected with `Unsupported command: <name>`. A missing `requestId` is rejected with `Missing requestId`.

Adding a command means editing `ALLOWED_COMMANDS`, `COMMAND_ALIASES`, and `COMMANDS` in `js/aichat-bridge.js`, plus the executor in `js/app.js` — and updating this document in the same change.

## Bounded context

Returned by `getBoundedContext()` in `js/app.js`. It merges integration state with `window.helloLearnerRuntime.getContext()`.

```jsonc
{
  "app": "LanguageLearner",
  "screen": "learning",
  "learnerLevel": "A1",
  "activeLessonId": "",
  "activeLessonTitle": "",
  "activeScenarioId": "",
  "exercise": "",
  "goalIndex": 0,
  "speaking": false,
  "completedLessonCount": 0,
  "completedRoleplayCount": 0
}
```

Deliberately excluded: **token, profile identifiers, raw file contents, full conversation history, and bulk progress**. Do not widen this shape — it is the privacy boundary between the tool and any agent that can read it.

## Workspace persistence (embedded mode)

`createEmbeddedBackend(bridge)` maps record I/O onto two request/response messages:

- `tool:workspace:read` `{ path }` → `{ content }`
- `tool:workspace:write` `{ path, content }`

The host binds these to its current workspace. Core paths are `.hellolearner/profile.json`, `.hellolearner/progress.json`, and `.hellolearner/settings.json`. Plan artifacts additionally use `.hellolearner/plans/`; `tool:workspace:list` discovers saved plan folders. Plan I/O carries `expectedWorkspaceId` and the host rejects mismatched bindings. Default request timeout is 8 s; a timeout surfaces a save warning and the records stay in memory.

Planner generation uses `requestLLM(detail, 300000, { signal, onStream })`.
Matching `host:llm-stream` messages forward cumulative text only; cancellation
removes pending callbacks and discards late results. `presentation: 'tool'` with
`includeHistory: false` leaves rich previews to the iframe and keeps raw artifacts
and reasoning out of the host popup/history. Other requests retain existing UI.
`host:prompt` routes composer requests through the same planner/practice entry,
with terminal `tool:status` messages. See [general lesson plans](general-lesson-plans.md).

## Continuous practice voice

Voice/Observer follows the school-teacher division: Voice has `voice-tools: []`
and only speaks; Observer owns audited app operations. Free talk follows QA:
Voice answers directly, Observer normally sends no note. Guided explanation
uses a current-step `Copilot小纸条：请说：` payload containing only filtered
learner-facing language. Exercises wait for learner input. Observer uses a 5m
heartbeat, thinking disabled, and does not send notes on idle ticks or in reply
to its own completed note. Playback completion permits checking context, not
awarding progress or skipping an unanswered exercise.

The collapsed observer row is display-only; RTC playback remains host-owned.
These are learner skill/startup instructions, not an audio mute/filter in the
browser. No shared AIChat or school-teacher runtime behavior is changed.

Entering lesson dialogue (including the in-app skip confirmation) automatically
starts live voice after the opening greeting. Startup sends the existing bounded
context through `host:voice.prompt`; no learner records or history are added.
AIChat installs this prompt in both the session and RTC system instructions.

HelloLearner includes its private observer guidance rules in this startup prompt
for both free talk and lessons. Messages marked `messageType: 'observer'` or
prefixed `Copilot小纸条：` are not learner input or scripts to read aloud. The
tutor must not quote, translate, summarize, or paraphrase the note itself; it
may use the guidance to form a natural learner-facing correction or question.
The existing observer marker still drives the collapsed note display. No
HelloLearner-specific routing is added to AIChat. Restart voice after changing
these instructions; an already-active session does not receive a new prompt.

The practice microphone delegates to AIChat's existing `host:voice` API through
`AIChatBridge.requestVoice('start'|'stop')`. One click starts a continuous
digital-human conversation; the next click hangs up. The standalone engine iframe
delegates `microphone; autoplay`, binds `local-language-learner`, and uses the first
configured Live API when available. Embedded use retains AIChat's selected model.
Requests require a Live-capable model; failure leaves keyboard practice available.

The account menu separates 用户设置 (the existing learner profile form) from
系统设置. System settings refresh chat choices through `tool:models:list` /
`host:models`, targeting the parent in embedded mode and the engine in standalone
mode. Live choices come from the SDK's configured `listLiveAPIs()` entries.
`settings.json` stores optional `model` and `voiceModel` IDs; empty values retain
the existing defaults. Anonymous selections stay in memory. The selected chat
model is passed to subsequent `tool:llm-request` calls (an explicit per-request
model takes precedence); the selected Live model is passed on the next
`host:voice` start in either mode. An active voice connection is not restarted.

系统设置 also provides 课件生成模型 using the full chat-model list, independently
of the practice and Live selections. It persists as `settings.coursewareModel`
and defaults to `keepwork-pro`, including when loading older settings records.
This is a configuration for future courseware generation; the current learner
app loads authored lesson packs and does not yet contain a generation entry.

`view_live_voice.js` receives validated `host:voice-changed` and voice-sourced
`host:chat-io` from either the parent AIChat or the standalone engine. User and
assistant subtitles replace cumulative text by role and turn ID in the main chat history. Closing/resetting the room or switching to typing stops voice;
cancellation during startup also stops a connection that completes later.
Local lesson TTS is suppressed while live voice is active. Voice subtitles are not
resubmitted to the lesson LLM and do not award lesson completion or scores.

Voice requests time out after 45 seconds; startup waits up to 30 seconds for the
engine handshake. This uses the existing protocol and adds no host commands.

`view_voice_history.js` renders streaming turns in the shared dialogue history.
Voice callbacks marked `messageType: 'observer'` render as collapsed native details
rows, not Maya speech. Exact observer echoes are removed from spoken subtitles;
legacy `Copilot小纸条：` messages without a reliable note boundary remain folded.
All callback text is inserted as text, never HTML.

## Request timeouts

| Wait | Duration |
| --- | --- |
| Ordinary request | 8 000 ms |
| LLM request | 90 000 ms |
| Engine readiness | 30 000 ms |

## Teardown

`stop()` removes the message listener, rejects and clears every pending request with `AIChat bridge stopped`, and removes the engine iframe. It is called from the `beforeunload` handler in `js/app.js`.

## Related

- `../AIChat/docs/external-html-tools.md` — the parent-side definition of this protocol.
- `../AIChat/AGENTS.md` — host-side contributor rules.

## General learning activity extension

See [general-interactions.md](general-interactions.md). Standalone boot now uses
`layout=agent` and checks `host:ready` for `agent-layout` before showing activities.
The same hidden engine provides ordinary LLM/Voice requests. It is never reparented
or recreated merely to show/hide a tool. The parent/child source checks are unchanged.
`promptUserTool` uses `tool:host-command` with bounded `params` and `activityId`;
embedded calls include the current `expectedWorkspaceId`. The command response is
only launch acceptance. Completion requires a separate learner confirmation.
Bounded context adds subject (120 chars), discussionMode, teachingLanguage (80 chars)
and optional age. It excludes interests, identifiers, tokens, files and raw history.
