# General interactions verification — 2026-09-08

## Automated checks

- 19 new tests pass: interaction validation/completion, v1/v2 compatibility,
  persisted response reload, failure/retry, discussion cancellation, microphone
  denial fallback, source/engine routing, workspace guards, parameter/pid forwarding,
  and reversible agent-only layout configuration.
- HelloLearner tests and script suites: 101/102 pass.
- Selected AIChat integration suites: 22/27 pass.
- All 16 changed JavaScript modules and the edited inline HTML scripts pass
  `node --check`; both catalogs parse; both repositories pass `git diff --check`.

The remaining six assertions reference older contracts already superseded by
other work in the dirty worktrees. They were not rewritten as part of this feature:

| Suite | Remaining assertion |
| --- | --- |
| HelloLearner `live-voice.test.mjs` | Exact old Observer-note wording and tennis example |
| AIChat `external_tool_chat_order_contract.test.mjs` | Exact old model fallback implementation |
| AIChat `hello_learner_contract.test.mjs` | Catalog source URL instead of the existing published URL |
| Same | Old curriculum/roleplay JavaScript data files |
| Same | Old literal engine URL expression rather than local/release selection |
| Same | Old avatar button/pressed markup |

## Browser checks

Used the existing VS Code source server on `127.0.0.1:3001`; no development or
deployment server was started. The main HelloLearner page booted with its existing
account and curriculum. The isolated `tests/interaction-preview.html` page verified:

- Single-choice, unordered multiple-choice, multiple accepted blank answers and
  typed repetition reach completion through the rendered controls.
- Discussion participation remains incomplete until its finish button is pressed.
  The fixture uses a labeled test reply, not a real model-quality evaluation.
- A real `roleplay-movie-player` opens inside the activity area via AIChat. The
  player shows its manual file/JSON selection UI. Returning hides the same engine
  iframe (one iframe remains), and launch alone does not complete the activity.
- A real Paracraft tool opens with `layout=agent`, displaying only tool UI. DOM
  inspection confirms the topbar, composer, side panel and chat messages are hidden.
  No Paracraft CLI/world-modifying instruction was issued.
- Native controls and inline movie layout were inspected at the existing narrow
  viewport (~419px); restored blank answers were also inspected at 1280px width.
  The viewport override was reset afterward.

## Manual follow-up limits

Microphone denial and late recognition cleanup use test adapters; actual microphone
permission, speech accuracy and TTS remain device-dependent. End-to-end generated
course quality, authenticated cross-device persistence, movie playback with supplied
content, and desktop Paracraft CLI execution were not exercised. Browser interaction
fixtures use memory checkpoints, with persistence validated separately by store tests.

Production standalone use requires the normal human-controlled publication of both
updated applications. Older AIChat releases are detected before revealing an activity.
Generated release files and unrelated user changes were preserved.

## Subsequent layout correction — 2026-09-08

At the user's request, removed the injected **学习新主题** home action because it
created an extra row and broke the coach layout. Kept the existing plan interfaces.
Updated the view import and entry-module cache suffixes to `20260908k`.
`node --check` passed for `view_lesson_plans.js` and `app.js`, and
`git diff --check` passed. The test totals above describe the feature verification
run; they are a historical record, not a claim that all suites were rerun after
this small removal or subsequent documentation updates.
