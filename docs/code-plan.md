# HelloLearner Code Stage

## Status

Implementation complete and ready for browser QA.

## Implemented Scope

- Ported the supplied learner shell, responsive visual system, favicon, 54-lesson curriculum, and 15 authored roleplays.
- Excluded all demo admin/CMS files and removed CMS publishing overlays, local user records, password hashing, password fields, and localStorage persistence.
- Added password-free learner profile setup after Keepwork authentication.
- Added versioned `.hellolearner/profile.json`, `progress.json`, and `settings.json` records with future-field preservation, corruption fallback, debounced serialized writes, and save-state UI.
- Added standalone PersonalPageStore workspace binding (default `HelloLearner`) and embedded AIChat current-workspace storage through `tool:workspace:read|write`.
- Added KeepworkSDK-only auth controls with memory-only URL token handling and feature-detected profile/login/register/logout paths.
- Added bounded generic three-turn dialogue for all curriculum lessons without handcrafted scripts.
- Added one speech lifecycle for all runtime TTS, with browser recognition retained as optional input and typed practice always available.
- Added lightweight Keepwork Live2D `littlegirl` rendering and speaking-driven mouth synchronization with static fallback and reduced-motion handling.
- Added standalone AIChat tutor embedding (`local-language-learner`, `layout=thin`, `chat=new`, `persist=0`) and responsive learner/tutor pane switching.
- Added `aichat.external-tool.v1` child-tool bridge with source/channel validation, bounded context, workspace requests, voice events, and five audited commands.
- Added Voice-primary `SKILL.md`, background `observer-copilot.md`, stable AIChat tool/skill registrations, and focused static contracts.
- Persisted runtime-owned lesson/roleplay completion, vocabulary exposure, activity dates, recent activity, and app-owned speaking minutes.

## Validation So Far

- All new JavaScript modules pass `node --check`.
- AIChat tool and skill catalogs parse successfully.
- Focused contract suite passes 8/8 tests.
- Editor diagnostics report no errors in edited source, HTML, CSS, JSON, or skill files checked so far.

## Open Browser Checks

- Confirm SDK/Live2D remote resources load under the existing HTTP development server.
- Exercise representative first and last curriculum lessons and one roleplay end-to-end.
- Verify standalone anonymous state, tutor mounting, AIChat embedded launch, responsive layout, screenshots, and canvas nonblank checks.
- Real Keepwork login/register/logout, authenticated cloud persistence across reload, Live Voice model availability, microphone permission, and cross-device sync depend on interactive credentials/browser permission and may require manual follow-up if no authenticated session is present.