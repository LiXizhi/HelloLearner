# HelloLearner docs

Start here. `AGENTS.md` at the project root is the authoritative operating manual for anyone — human or agent — changing this app.

## Current design and session handoff

For work continuing the general-purpose learning design agreed on 2026-09-08, read:

1. [General learning session handoff](general-learning-handoff.md) — accepted decisions, current implementation, UI correction and future scope.
2. [General interaction contracts](general-interactions.md) — module ownership, schemas, completion rules and AIChat integration.
3. [General interaction verification](general-interactions-qa.md) — recorded tests, known failures and manual verification limits.

These documents extend the original English-demo design below. Keep the English
curriculum, but do not treat its original English-only scope or hidden-only engine
description as restrictions on new generalized plans.

## Reading order

| # | Document | Read when |
| --- | --- | --- |
| 0 | [`../AGENTS.md`](../AGENTS.md) | Always. Tech stack, module ownership, hard rules, verification. |
| 1 | [`design.md`](design.md) | You need product scope, the learning flow, or the 10 acceptance criteria. |
| 2 | [`architecture.md`](architecture.md) | You need module ownership, data flow, persistence, or fallback design. |
| 3 | [`external-tool-protocol.md`](external-tool-protocol.md) | You touch `js/aichat-bridge.js` or any host-facing behavior. **Required.** |
| 4 | [`getting-started.md`](getting-started.md) | You need to run, build, or release the app. |
| 5 | [`avatars.md`](avatars.md) | You touch the coach picker, Live2D models, or `data/avatar-config.json`. |
| 6 | [`code-plan.md`](code-plan.md) | You need implementation status and what was validated so far. |
| 7 | [`qa-report.md`](qa-report.md) | You are running or updating browser QA. |
| — | [`../SKILL.md`](../SKILL.md) | You change Voice tutor behavior. |
| — | [`../observer-copilot.md`](../observer-copilot.md) | You change Observer reasoning or the `Copilot小纸条：` protocol. |

## What this app is

General lesson plans: see [`general-lesson-plans.md`](general-lesson-plans.md) for
the workspace library, AI planning conversation, on-demand daily steps, storage,
bridge additions and verification. This extends the original three-core-record
and five-command baseline described in older sections below.

HelloLearner is the learner-only H5 application behind the catalog product **LanguageLearner**. It is a Chinese-first, mobile-first learning experience across subjects for ages 7–70 for Keepwork users, ported from the supplied Hello Learner demo.

It runs standalone in a browser, or embedded inside AIChat as an external tool. Curriculum administration, CMS publishing, local accounts, and password handling are explicitly out of scope.

## Quick facts

- 54 curriculum lessons, Pre-A1 through A2+.
- 15 authored roleplay scenarios with deterministic goal matching.
- 9 selectable Live2D coach avatars with per-role voice profiles.
- Three persisted records under `.hellolearner/`: `profile.json`, `progress.json`, `settings.json`.
- Bridge channel `aichat.external-tool.v1`; audited learning/navigation/planning commands are declared in `js/aichat-bridge.js`.
- No framework, no build step in the source path, no localStorage, no passwords.

## Conventions worth knowing before your first edit

- **Cache busters.** Local modules are referenced with `?v=<yyyymmdd><letter>`. Bump the suffix whenever you change that module, or your edit will not appear in the browser. See `AGENTS.md`.
- **Preserved demo assets.** `HelloLearner.html` and `styles.css` keep their `data-page-node-id` attributes and demo visual system. Do not reformat them.
- **Vite is release-only.** Run the app from a plain static server, never `npm run dev`.

General-purpose interactions extend the original English experience; see [interaction contracts](general-interactions.md) for version 2 data, completion rules and inline AIChat activities.
