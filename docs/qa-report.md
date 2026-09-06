# QA report

Status: **not yet executed.** This is the checklist to run, derived from the 10 acceptance criteria in `design.md` and the open browser checks in `code-plan.md`. Fill in results as they are verified; do not mark an item passing without actually running it.

Environment note: run against `HelloLearner.html` served by a static server (VS Code Live Server). Do **not** use `npm run dev` — see `getting-started.md`.

## Tracking table

| # | Area | Criterion | Result |
| --- | --- | --- | --- |
| 1 | Curriculum | All 54 lessons open and reach a bounded dialogue path without exceptions | ☐ |
| 2 | Roleplay | All 15 scenarios open; deterministic goal matching completes a representative scenario | ☐ |
| 3 | Auth | KeepworkSDK is the only auth system; no password or token persistence anywhere | ☐ |
| 4 | Persistence | Authenticated state saves versioned `profile` / `progress` / `settings` under `.hellolearner/` in the correct backend | ☐ |
| 5 | Workspace | Standalone defaults to `HelloLearner`; embedded mode uses host workspace APIs | ☐ |
| 6 | Speech | All speech paths share one lifecycle; Live2D mouth resets on end, error, cancel, view close, unload | ☐ |
| 7 | Bridge | Validates source/channel, advertises capabilities, returns bounded context, exposes only audited commands | ☐ |
| 8 | Tutor | Standalone AIChat uses `local-language-learner`, a fresh non-persistent chat, compact chrome, memory-only token | ☐ |
| 9 | Agents | Voice and Observer follow the `Copilot小纸条：` private-guidance protocol | ☐ |
| 10 | Catalog | Registration is stable (`language-learner`, display `LanguageLearner`); neither featured nor globally default | ☐ |

## Static checks (run these first)

- [ ] `node --check` passes on every changed ES module.
- [ ] `data/avatar-config.json` parses as JSON.
- [ ] AIChat tool and skill catalogs parse.
- [ ] `git diff --check` is clean.
- [ ] Every edited module has a bumped `?v=` cache buster.

## Manual browser run

### Content

- [ ] First curriculum lesson: open overview → hear core phrase → grammar judgment → cloze → guided dialogue → completion.
- [ ] Last curriculum lesson: same path.
- [ ] One roleplay: open from the catalog, complete every goal, confirm completion feedback.
- [ ] No console errors on any of the above.

### Persistence

- [ ] Anonymous standalone: content browsable; a persistent action opens the Keepwork login window; in-memory state survives navigation.
- [ ] Authenticated standalone: profile and progress survive a full page reload.
- [ ] Save status transitions `正在保存学习进度` → `学习进度已保存`, and shows `暂时无法保存…` when the backend is unavailable.
- [ ] Corrupt a record by hand; confirm it falls back to defaults, warns, and preserves unknown fields.
- [ ] Progress dashboard streak, completed count, and speaking minutes match the stored record.

### Speech and avatar

- [ ] Lesson phrase and coach reply both play; mouth animation starts and stops.
- [ ] Close the lesson modal mid-speech: audio stops and the mouth resets.
- [ ] Deny microphone permission: typed practice still completes; a single concise toast appears.
- [ ] Block the Live2D CDN: canvas hides, static coach remains, no crash.
- [ ] Toggle reduced motion and confirm mouth animation is suppressed.

### Coach picker

- [ ] All 9 roles list and preview without error.
- [ ] 试听声音 plays the sample and cancels on second click.
- [ ] Applying a free role switches model and voice.
- [ ] Applying a VIP role without entitlement shows the gate message and changes nothing.
- [ ] Preview frame is torn down on close.

### Embedded mode

- [ ] Launched from AIChat: the learner surface fills the iframe and does not recursively open the tutor.
- [ ] `host:get-tool-context` returns the bounded shape with no token or raw file content.
- [ ] Each of the five commands succeeds with valid args and fails cleanly with invalid args.
- [ ] Every `busy` status is followed by `done` or `error`.
- [ ] `tool:workspace:read|write` round-trips the three records in the host's current workspace.

### Standalone tutor

- [ ] Engine iframe mounts hidden with `chat=new` and `persist=0`; no conversation is retained.
- [ ] LLM turn succeeds; failure keeps the learner turn retryable and shows a concise error (never a scripted reply).
- [ ] Narrow screens: learner/tutor segmented switch, learner is the initial screen.
- [ ] Desktop standalone: learner and tutor can sit side by side without nested cards.

### Responsive and accessibility

- [ ] Phone, tablet, and desktop widths; no horizontal overflow.
- [ ] All controls reachable and usable with keyboard only.
- [ ] Usable with no microphone, no speech synthesis, no Live2D, no AIChat, and no network after initial load.

## Known manual-only items

These need real credentials or browser permissions and may be left pending:

- Real Keepwork login / register / logout.
- Authenticated cloud persistence across devices.
- Live Voice model availability.
- Microphone permission grant flow.
