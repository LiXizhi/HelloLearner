# General-purpose learning

HelloLearner supports learner-selected subjects for ages 7–70. Age, interests and
teaching language are optional profile preferences; the planner collects subject,
goal and prior knowledge. Age adjusts examples, not an assumed ability level.
The original English curriculum and stable `language-learner` tool ID remain.

## Accepted product and layout decisions

The agreed scope is full subject generalization, including planning, preferences,
tutor guidance and native interaction types, while preserving existing English
courses. Use Chinese-first guidance and optional age/interests/teaching language;
do not require age onboarding or apply an age gate.

The home coach action row retains **选择角色** and **自由对话**. The additional
**学习新主题** button was removed at the user's request on 2026-09-08 because it
broke the narrow-screen layout. Do not reintroduce it as part of future cleanup.
Course creation remains available through the existing learning-plan interface.

External activities are inline in standalone mode, not a full-screen overlay.
When embedded, HelloLearner asks its existing AIChat parent to open/focus the tool;
it does not recursively embed another AIChat. Movies and 3D learning reuse AIChat
tools rather than adding a movie player or CLI implementation to HelloLearner.

## Ownership and compatibility

`interaction-registry.js` defines validation, response validation, completion and
render adapters. `view_interactions.js` mounts new controls and returns `submitText`
and `stop`; cleanup cancels requests, recognition and the inline tool surface.
`view_plan_runner.js` retains navigation and checkpoints through app callbacks.

New plan, daily lesson, unit and written plan-progress artifacts use schemaVersion 2.
Version 1 is read without migration and retains its English level and six legacy
step types. Core profile/settings/progress records and the plan index remain version 1.
V2 plan metadata includes `subject`, `priorKnowledge`, `teachingLanguage`; `level`
is optional English context. Existing IDs, unit paths, daily durations and reviewed
outline/save workflow remain unchanged. Text renders through textContent; v2 also
allows mathematical comparison symbols without interpreting them as markup.

## Interaction contracts

Every step keeps `{id,type,objective,minutes,content}`. New content and response
strings are limited to 2000 characters; arrays are bounded at 20 elements.
Optional `hint` is displayed on request.

| Type | Content | Persisted response | Completion |
| --- | --- | --- | --- |
| single-choice | `prompt, options:[{id,text}], correctIds:[id]` | `selectedIds:[id]` | Exactly the one correct option |
| multiple-choice | Same, with multiple correct IDs allowed | `selectedIds:[id]` | Exact set; order ignored, duplicates rejected |
| fill-blanks | `prompt, blanks:[{id,answers:[text]}]`; one `___` per blank | `values:[text]`, in blank order | Each matches an accepted answer |
| repeat | `target, answers:[text], language` (BCP47) | `transcript` | Normalized transcript match, not pronunciation scoring |
| discussion | `mode:free|socratic, topic, opening` | `turns:[{role,content}], confirmed` | At least one learner/assistant exchange plus explicit confirmation |
| external-tool | `tool, prompt, params` | `launched, confirmed, activityId` | Successful handoff plus explicit learner confirmation |

V2 step progress stores `response` alongside the compatible `answers:[]` field.
Legacy adapters keep string-array answers. Stored new responses are validated
against the lesson before resuming; a completion marker alone cannot bypass checks.
Discussion history retains the last 20 turns. Failed requests remain retryable and
do not fabricate responses or completion. Free/Socratic conversation does not use
exact-answer grading; the learner decides when to finish.

## AIChat activities

Allowed tools are `paracraft` and `roleplay-movie-player`. Calls use the existing
`tool:host-command` / `host:command-result` transport with `promptUserTool` arguments
`{tool,prompt,params,activityId}`. Paracraft `params.pid` selects a world-specific tab;
parameters are also bounded prompt context for its existing instruction pipeline.
HelloLearner never calls a terminal or CLI directly. Movie launch opens the existing
player for manual content selection; a movie URL is not automatically consumed.

Embedded HelloLearner focuses the parent AIChat tool tab, preserving the learner
step in its mounted tab. Standalone reveals its one existing memory-only AIChat
iframe in an inline slot. The iframe stays in the same DOM parent and follows the
slot's geometry to avoid destroying its browsing context. Returning hides it.
The engine uses `layout=agent` and must advertise `agent-layout`; older releases
show a retryable upgrade message rather than exposing a partial chat layout.

Source/channel checks, bounded parameters, credential exclusion, workspace guards
and cancellation protect handoffs. `activityId` is correlation metadata reserved
for future tool evidence; tool statuses are never learning results in this version.
No automated outcome capture or automatic completion is implemented.

Future tools may emit messages that an LLM can use as learning evidence. This is
a future extension, not a current result subscription or assessment feature.
Keep learner confirmation as the first-version completion policy; do not interpret
tool execution status, LLM prose or elapsed viewing time as demonstrated learning.

## Verification

Run `node --test tests/general-interactions.test.mjs tests/activity-bridge.test.mjs tests/interaction-lifecycle.test.mjs`
and the existing `scripts/lesson-plans.test.mjs` suite. AIChat additionally has
`tests/agent_activity.test.mjs`. The `tests/interaction-preview.html` source page
exercises the actual controls without writing learner data. Its discussion response
and TTS are labeled test adapters; its movie handoff uses the real AIChat engine.

Both updated applications need their normal human-controlled publication before
production standalone users receive this integration. Agents do not run releases.
