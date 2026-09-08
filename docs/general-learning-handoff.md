# General learning: future-session handoff

Last documented: 2026-09-08. This file records the user's accepted design and the
implemented source changes. Read `../AGENTS.md` before editing; use the detailed
[interaction contracts](general-interactions.md) as the implementation reference.

## User intent and settled choices

HelloLearner should support learning any subject for people aged 7–70. Separate
the learning subject from the way a learner interacts with it. Native activities
include single choice, multiple choice, filling blanks, repeating a word/sentence,
and free or Socratic discussion. Movie and immersive 3D activities use AIChat's
existing tools instead of duplicating those applications.

| Decision | Accepted behavior |
| --- | --- |
| First-release scope | Full generalization, preserving English courses and old progress |
| Learner preferences | Optional age, interests and teaching language; subject/prior knowledge collected while planning |
| Repetition assessment | Recognized or typed transcript matching, no pronunciation score |
| Socratic discussion | One question at a time, exploring assumptions/evidence and waiting for the learner |
| Standalone tool display | Inline activity using the existing AIChat engine iframe |
| Embedded tool display | Invoke the parent AIChat's tool tab with prompt and parameters |
| Tool completion | Learner explicitly confirms; launch/busy/done never awards completion |
| Movie integration | Open existing player; learner selects/loads the movie inside it |
| Home action row | Keep 选择角色 and 自由对话; remove 学习新主题 because it broke layout |

## Implemented structure

- `js/interaction-registry.js` owns per-type validation, response validation,
  completion and render adapters, including adapters for the six legacy types.
- `js/view_interactions.js` owns new interaction controls, bounded discussion
  turns, speech-recognition fallback, external activity controls and cleanup.
- `js/view_plan_runner.js` owns step navigation. App callbacks remain responsible
  for persistence; views do not write workspace files directly.
- `js/plan-model.js`, `js/plan-store.js` and `js/lesson-planner.js` support v2
  generalized artifacts and retain v1 readers. New plans carry subject, prior
  knowledge and teaching language; English level is not required for other subjects.
- Profile defaults/setup and tutor/planner/Observer guidance were generalized.
  Stable product/tool/skill IDs and the existing English curriculum remain.

Core learner records and the plan index remain version 1. New plan, lesson, unit
and written plan-progress artifacts use version 2. Do not migrate old files merely
by reading them. New progress stores typed `response` data alongside compatible
`answers`; completion is validated against the activity contract.

## AIChat boundary

AIChat's `js/embed_boot.js`, entry HTML and shell CSS implement `layout=agent`.
This mode hides host sidebars, top navigation, chat history, composer, pet, task
bars and host panels while retaining the active tool window. URL boot applies the
layout before network startup; runtime host configuration can switch layouts.

The shared versioned channel remains `aichat.external-tool.v1`. HelloLearner sends
`tool:host-command` with `command: promptUserTool` and arguments
`{tool,prompt,params,activityId}`. AIChat validates bounded JSON parameters and
returns `host:command-result` to the caller. Paracraft `params.pid` targets the
world-specific tab; parameters become labeled context for its existing instruction
pipeline. HelloLearner itself does not run Paracraft CLI commands.

Standalone uses one memory-only AIChat engine. It stays in its original DOM parent
while its fixed-position rectangle tracks/clips to the inline activity slot; moving
an iframe between DOM parents can reload it. Returning hides the same iframe.
Before revealing it, require the host's `agent-layout` capability. Embedded mode
uses the existing parent, preserving the learner's mounted tab and active step.

Keep source/channel validation, credential exclusion, cancellation and workspace
guards. Do not persist tokens in activity parameters or learner progress. Update
both apps' protocol documentation if extending the bridge.

## Future work, not implemented behavior

The user anticipates tool-emitted messages that an LLM can capture as learning
evidence. `activityId` reserves correlation metadata, but there is no outcome
subscription or automatic learning assessment yet. Design a validated, correlated
result contract before enabling this; retain learner confirmation in the meantime.

Automatic loading of a specified movie is also outside this implementation. The
existing movie player acknowledges prompts but requires manual content selection.
Extending it would require work in the movie-player app, not just a new prompt.

## Verification and continuation

See [the QA record](general-interactions-qa.md) for exact historical counts and
manual limits. Nineteen new tests passed; broader suites retained six older contract
assertion failures. Do not claim those suites are completely green or revert
unrelated changes merely to satisfy outdated source-string assertions.

`tests/interaction-preview.html` is a local acceptance fixture, not a production
learning page. It uses memory checkpoints and labeled discussion/TTS test adapters;
its movie handoff uses real AIChat. Store tests separately cover response reload.

Use VS Code Live Server and source checks. Never run Vite, build/upload scripts,
or edit generated `dist/`, `release/` or AIChat `redist/` output. Both updated apps
need their normal human-controlled publication for production standalone use.
Inspect current worktrees before editing: this work was performed alongside other
uncommitted changes, and the recorded test counts/cache suffixes are historical.
