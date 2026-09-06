# HelloLearner Product Design

## Overview

HelloLearner is the learner-only H5 application behind the catalog product **LanguageLearner**. It is a Chinese-first, mobile-first English learning experience for Keepwork users, based closely on the supplied Hello Learner demo. It runs directly in a browser, inside AIChat as an embedded external tool, or standalone with an optional embedded AIChat tutor.

Target users are beginner to lower-intermediate English learners using phones, tablets, or desktop browsers. Curriculum administration, CMS publishing, local accounts, and password handling are explicitly excluded.

## Core Experience

- Browse a 54-lesson path spanning Pre-A1 through A2+.
- Open a lesson overview, hear the core phrase, complete grammar judgment and cloze practice, then enter guided dialogue.
- Browse 15 authored roleplay scenarios by level and topic, with deterministic goal matching and completion feedback.
- Use typed interaction everywhere; use browser speech recognition when available.
- Hear lesson phrases and coach replies through one speech lifecycle that also drives lightweight Live2D mouth movement.
- Review projected progress, recent activity, speaking minutes, streak, and learner profile.
- Authenticate only through KeepworkSDK. Anonymous users can inspect content; persistent actions request sign-in.
- In standalone mode, optionally open an embedded AIChat Voice tutor. In AIChat, expose bounded context and audited commands through `aichat.external-tool.v1`.

## Lifecycle

`init -> sdk-loading -> data-loading -> ready -> lesson|roleplay|profile|progress -> saving -> ready`

Speech runs as an orthogonal lifecycle: `idle -> loading -> speaking -> idle`, with `error -> idle`. AIChat bridge requests run `busy -> done|error` exactly once.

## UI And Interaction

- Preserve the demo's compact shell, deep green coach stage, learning route, learner tabs, lesson modal, practice room, roleplay catalog, progress dashboard, and profile presentation.
- Replace the demo's decorative avatar with a framed Live2D canvas and a visible static fallback.
- Add a restrained account control, persistence indicator, tutor toggle, and first-use profile setup without passwords.
- Desktop standalone: learner and tutor can appear side by side without nested cards.
- Narrow screens: learner/tutor segmented switch; learner remains the initial screen.
- AIChat embedded mode: learner surface fills the iframe and does not recursively open the tutor.
- All controls remain usable without microphone, speech synthesis, Live2D, AIChat, or network access after initial source load.

## Data And Dependencies

Versioned JSON files under `.hellolearner/`:

- `profile.json`: display name, avatar metadata, English level, goals, daily target, native-language mode.
- `progress.json`: lesson attempts/completions, roleplay outcomes, vocabulary exposure, speaking minutes, streak dates, recent activity.
- `settings.json`: voice, speech rate, locale, tutor visibility, reduced-motion preference.

Embedded storage uses AIChat workspace bridge APIs in the host's current workspace. Standalone storage uses `sdk.personalPageStore.withWorkspace()`, default workspace `HelloLearner`. Missing/corrupt records fall back to defaults; unknown fields survive updates. Tokens are memory-only.

External resources:

- KeepworkSDK IIFE.
- Keepwork-hosted Tailwind CDN for integration controls; the preserved demo visual system remains local CSS.
- Keepwork Live2D PIXI/Cubism runtime and the `littlegirl` model.
- Browser SpeechSynthesis and SpeechRecognition APIs as optional capabilities.
- AIChat external-tool protocol and optional embedded AIChat iframe.

## Assets

- Critical: demo curriculum data (54 lessons), roleplay data (15 scenarios), learner stylesheet.
- Critical remote: KeepworkSDK.
- Optional remote: Live2D runtime/model. Static coach fallback must remain useful if unavailable.
- No admin/CMS assets and no large new binaries.

## Internationalization

Default is Simplified Chinese (`zh-CN`) with English learning phrases. `?lang=en-US` switches integration labels and primary shell labels where available; authored lesson explanations remain Chinese in this release.

## Acceptance Criteria

1. All 54 lessons open and reach a bounded dialogue path without exceptions.
2. All 15 roleplays open and deterministic goal matching can complete a representative scenario.
3. KeepworkSDK is the only auth system; no password/token persistence exists.
4. Authenticated state saves versioned profile/progress/settings under `.hellolearner/` in the correct workspace backend.
5. Standalone defaults to workspace `HelloLearner`; embedded mode uses host workspace APIs.
6. Speech paths share one lifecycle and Live2D mouth state resets on end, error, cancel, view close, and unload.
7. The external-tool bridge validates source/channel, advertises capabilities, returns bounded context, and exposes only audited commands.
8. Standalone AIChat tutor uses the LanguageLearner skill, a fresh non-persistent chat, compact chrome, and memory-only token.
9. Voice and observer skill contracts follow the `Copilot小纸条：` private-guidance protocol.
10. Catalog registration is stable (`language-learner`, display `LanguageLearner`) and is neither featured nor made globally default.