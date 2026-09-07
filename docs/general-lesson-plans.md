# General lesson plans

The **进度 / Learning progress** tab's **学习计划 / Lesson plans** library lists the current lesson
workspace's courses. New plans default to 14 daily lessons of 10 minutes, or 20
when selected in the profile/conversation. Days are suggestions, not date locks.
The built-in 54-lesson curriculum and URL-loaded version-1 packs remain separate.

## Conversation and preparation

Use **新建计划**, ask for another plan in typed free talk or lesson dialogue, or
use the AIChat composer/Voice commands. A planning request is routed before
exercise evaluation. A dedicated skill is fetched lazily from
`lesson-planner/SKILL.md`; it is also discoverable in AIChat as
`local-hellolearner-lesson-planner`. It never routes to the calendar planner.

The planner uses the learner's level, goals, daily target and up to eight actual
feedback summaries. It asks one essential question at a time or returns an
outline. The learner can revise the complete outline in chat before choosing
**保存计划** or **保存并开始第一课**. Saving another plan never replaces an older
one. Plans allow 1–60 days and 2–12 steps per day.

Opening an unprepared day generates only that day's complete content from its
reviewed outline and recent feedback. JSONL `preview` records stream real
learner-facing expressions and activities. The final artifact is validated and
saved before **开始本课** is enabled. There is no simulated percentage, private
reasoning display, raw JSON display, or automatic regeneration of cached lessons.
Cancellation rejects the local request and discards late output; it does not
promise to stop inference already running at the provider. Retry preserves the
outline and previously completed work. Generation uses `settings.coursewareModel`
(default `keepwork-pro`) with a five-minute response timeout.

The planning dialog pauses existing practice and stops voice/speech without
resetting exercise state or awarding completion. Return restores the original
practice; continuous voice can be restarted explicitly. The new daily runner
uses the shared speech controller and retargets the existing avatar.

## Workspace and artifacts

Standalone **系统设置 → 课程工作空间** accepts the default/current/recent workspace
names or a new valid name. Only plans and their progress switch. The preference
and recent names are saved in the original `settings.json`; profile and built-in
progress remain in their original workspace. Anonymous previews are temporary;
Save requests login. The app does not write learner credentials or localStorage.

Embedded mode displays the AIChat binding read-only. Plan requests carry
`expectedWorkspaceId`; the host rejects a request if the binding changed. A new
`host:init.workspace` invalidates generation and reloads the library. Failed
writes remain with their original store and can be retried on returning to that
space. Standalone switching first drains and retries pending writes; it stays on
the old selection if saving still fails. Read-only workspaces can browse saved
plans and content; save errors remain visible and retryable.

All plan artifacts use `schemaVersion: 1` and `updatedAt`:

- `.hellolearner/plans/index.json`: small plan metadata entries.
- `.hellolearner/plans/<planId>/plan.json`: reviewed ordered outline.
- `.hellolearner/plans/<planId>/lessons/<lessonId>.json`: generated day.
- `.hellolearner/plans/<planId>/progress.json`: step answers/checkpoints, attempts,
  completed timestamps, and bounded feedback.

Application-generated UUID plan IDs and deterministic day/step IDs are stable
after saving. Manifest writes precede index writes. Embedded directory listing
also discovers manifests after an interrupted index update. A corrupt record is
never overwritten with defaults. Unknown fields survive progress/index updates.
Writes and read-modify-write operations are serialized within the app. The
underlying workspace API has no compare-and-swap: simultaneous edits from
different devices are not merged automatically.

## Executable contracts

`plan-model.js` owns validation. The plan contains `id`, `title`, `goal`, `level`,
`dailyMinutes` and ordered `lessons`. Each day has `id`, `title`, `objectives`, and
`steps`. A step has `id`, `type`, `objective`, `minutes`; its generated counterpart
adds `content`. The day must preserve the reviewed step IDs/types/order/minutes,
and step minutes must total 10 or 20. Plan JSON is limited to 90 KB; all generation
requests respect the host's 128 KB message limit.

Supported step content and completion rules:

| Type | Content | Completion |
| --- | --- | --- |
| vocabulary / phrase / review | `items: [{prompt, answers, hint?}]` | Every item matches a normalized accepted answer |
| cloze | Same items; each prompt contains one `___` | Every missing expression matches an accepted answer |
| grammar | `sentence`, `correct`, `correction`, `explanation` | Correct true/false judgment |
| dialogue | Existing `role`, `opening`, `completionMessage`, ordered `goals` | Existing word-bounded matcher completes every goal, only after a successful LLM reply |

Content is bounded plain text, never executable HTML. Dialogue remains an actual
LLM conversation: failures never substitute scripted coach replies. The runner
reports checkpoints to `app.js`, which alone persists them. Storage rechecks
completion against the answer keys; neither agents nor host commands award it.
The app emits `hellolearner:plan-step` after a successful checkpoint save. Plan
progress is not mixed into built-in curriculum completion IDs or streaks.

## Bridge additions

Audited commands: `start_lesson_plan {request?}`, `list_lesson_plans {offset?,limit?}`,
`open_lesson_plan {planId}`, `open_plan_lesson {planId,lessonId}`. Listing returns
bounded metadata, total, offset and unreadable IDs; default 20, maximum 50 entries.
Open commands acknowledge navigation/preparation, not completed generation.
Every command and composer request terminates its busy status.

`AIChatBridge.requestLLM(detail, timeoutMs, {signal,onStream})` forwards cumulative
text for the matching request/source. Aborts, timeouts, errors and final results
remove pending listeners. `presentation: 'tool'` with `includeHistory: false`
prevents the host popup/history from showing or storing raw artifacts/reasoning;
the response still reaches the iframe. Other tools retain existing presentation.
The public `getBoundedContext()` shape remains unchanged.

The tool explicitly advertises `composer-intercept`, so embedded composer turns
enter the same planner or active practice flow. Standalone Voice can discover
the parent app's opt-in command catalog through the hidden AIChat engine; both
command results and bounded context replies return to the requesting window.

## Verification

Run `node --test scripts/*.test.mjs tests/*.test.mjs`, syntax checks on changed
modules, and `git diff --check`. Host additions have behavioral tests in
`AIChat/tests/hello_learner_plans.test.mjs`.

`scripts/lesson-plans.browser.mjs` runs a temporary static server and Playwright
against the real source app with controlled SDK/AI fixtures. Set `NODE_PATH` to
an installed Playwright package directory; `PLAYWRIGHT_CHANNEL=chrome` optionally
uses installed Chrome. It covers review/revision, no writes before Save, save
retry, stream cancellation, six activity types, completion, cached reopening,
reload, mobile layout, standalone switching, embedded composer/commands, stale
binding results, and malformed-generation retry. Screenshots go to the system
temporary directory, not the repository. No Vite or release command is used.

Real account persistence, real provider generation quality, live voice/microphone,
cross-device sync, and deployed host compatibility still need credential-enabled
manual verification. Three older host contract assertions were already stale in
HEAD (catalog dev URL, removed roleplay JS, old avatar markup); new host tests are
independent of those historical assertions.

The wider Live Voice contract suite also has an unchanged quick-reply prompt
assertion failure in `chat_send.js`. Source syntax, catalog parsing and whitespace
checks pass. The new planner and host behavior tests pass, as do the existing
learner suites; browser checks use fixtures rather than claiming real-provider QA.

## Global settings

System settings expose the current lesson workspace and **默认课程规划模型**.
The planner model preference retains the backward-compatible `coursewareModel`
key and applies to both the next outline and daily lesson generation. It does
not rewrite cached lessons. Standalone users can select a recent workspace or
specify a name. Selecting **创建并使用此工作空间** and saving creates a cloud
folder through PersonalPageStore after login, using `.hellolearner/workspace.json`
as an idempotent marker; existing documents and plans are preserved. Failed
creation keeps the settings dialog open for retry and does not switch workspaces.
These preferences remain in the original learner settings record. Embedded users
change the bound workspace in AIChat; the learner displays that binding read-only.

The home learning-path title also opens the course library (click, Enter, or Space).
The library provides **我的学习计划** and **系统内置课程** tabs. Built-in lessons
show their existing completion state and open the fixed-flow runtime; their
progress remains separate from generated plans. A URL-loaded pack continues to
use its own current curriculum in this tab.

When the current workspace has no plans and no read warnings, opening the library
selects built-in courses by default. Explicitly selecting My plans keeps its empty
state available. Selected source tabs use a solid green background; built-in course
cards use two columns on desktop and one on mobile, with the whole card clickable.
