# Premade Lesson Packs

## Authoring Workflow

Follow SchoolTeacher's lesson-designer workflow: review a teaching plan first,
generate a JSON artifact second, then preview and revise it. Version-1 URL packs
remain a separate authoring/preview format. Personalized workspace plans and
flexible daily activities use the new [general lesson plans](general-lesson-plans.md)
workflow and schema; they do not modify or publish these legacy packs.

Open `HelloLearner.html?lessonPack=./data/my-lessons.json` on a static HTTP
server to preview a reviewed pack. Paths must be same-origin. Loading errors
leave the built-in curriculum available. Packs replace the route for this
page session, including legacy lesson overrides; they are not persisted.
Keep IDs stable across revisions, and use distinct IDs for unrelated lessons
because completion records are keyed by lesson ID.

## Version 1 Contract

The executable contract is `js/lesson-pack.js` (`validateLessonPack`).
The envelope is `{ "version": 1, "units": { "U1": "Unit title" }, "lessons": [] }`.
There must be 1-300 lessons and at most six per unit (the current route layout).
All content is plain text, never HTML. Packs are bounded to 1 MB when loaded.

Each lesson requires:

- `id`: unique ASCII kebab-case identifier, up to 80 characters.
- `number`: display number as text; `order`: positive integer.
- `unit`: key from `units`; `band` and `level`: Pre-A1, A1, A1+, A2, or A2+.
- `title`, `subtitle`, `phrase`, `meaning`, `summary`, `answerTip`.
- `aiRole`, `mission`, `opening`, `hint`, `briefing`.
- `vocabulary`: nonempty array of `[word, phonetic, meaning]` text tuples.
- `grammarJudgment`: `sentence`, boolean `correct`, `correction`,
  `grammarFocus`, `explanation`, and exactly three `targets`.
- Optional `icon` and `phonetic` text.

Judgment and corrected sentences must be complete, end in punctuation, and
contain no blank placeholders. Correct judgments must retain the same sentence;
incorrect judgments must change it. Each target must occur in the correction;
repeated targets require repeated token occurrences. The runtime derives three
cloze questions from those targets. Dialogue remains LLM-driven; pack content
does not award completion or replace unavailable AI with scripted replies.

## Validation

## Data-Driven Dialogue

`data/example-lesson-pack.json` is a complete editable example. Preview it with
`?lessonPack=./data/example-lesson-pack.json`. No runtime change is needed to
create another English scenario, role, or sequence of goals.

Optional `lesson.dialogue` replaces the legacy three-reply completion rule:

```json
{
    "role": "Librarian",
    "opening": "Welcome! What would you like?",
    "completionMessage": "Confirm the request and end the visit politely.",
    "goals": [
        {
            "id": "request-book",
            "prompt": "Ask which book the learner wants.",
            "hint": "I would like a book, please.",
            "accept": ["a book", "the book"]
        }
    ]
}
```

There may be 1-12 ordered goals, each with 1-20 accepted phrases. Matching is
case-insensitive, punctuation-normalized, and word-bounded. Each submitted
answer can complete only the current goal. Unrelated answers never advance
progress. The engine replays successful turn history, so failed LLM requests
do not commit progress. It generates state and next-goal instructions, not
fallback coach replies; the existing LLM transport remains responsible for
natural responses. Old lessons without `dialogue` retain legacy behavior.

AI authoring guidance: first write a reviewed teaching objective; select one
observable action per goal; provide multiple accepted phrasings and a helpful
hint; keep goal IDs stable. Validate before previewing. Literal matching is
not semantic assessment: negation and meaning are not understood. Choose
criteria suitable for phrase practice, not grading open-ended reasoning.

The current lesson format still follows overview, grammar judgment, three
derived cloze questions, then dialogue. Arbitrary exercise ordering, new
exercise types, and languages beyond the English-learning contract are not
supported by this version.

## Validation Commands

Run from this folder:

```sh
node --test scripts/curriculum-progress.test.mjs scripts/lesson-pack.test.mjs
node --check js/lesson-pack.js
node --check js/learner-runtime.js
node --check js/app.js
```

The tests load all 54 authored records, check the pack contract, malformed
content, cross-origin rejection, and empty/partial/complete route progress.

## Iteration Status

Implemented: real unit completion counts and recommendations; progress refresh
on record projection; standalone pure progress module; validated JSON preview
loading; focused regression tests. Existing authored content remains untouched.

Also implemented: calendar-based speaking chart, record-based dashboard and
completion history, vocabulary playback, profile edit actions, profile form
reset, practice speed control, removal of simulated microphone scoring, and
initialization when the SDK constructor is already loaded. Unsupported reminder
and language options are explicitly identified, not advertised as working.

Browser checks: all 54 lesson overviews open; anonymous route shows 0/6 and 0%;
vocabulary empty-state dialog opens/closes; mobile 390px layout has no horizontal
overflow. Static preview runs at http://127.0.0.1:5500/HelloLearner/HelloLearner.html.

Still pending: extract grammar construction into a pure module with behavioral
tests;
browser completion checks for first/last lessons
and roleplays; authenticated save/reload and microphone checks. AI generation,
pack library management, and publishing require a separate reviewed design.
This iteration is not a claim that all missing product features are complete.

Additional iteration: actual coach corrections now emit an app-owned feedback
event and persist for authenticated learners (100 records, 300 characters per
correction). They are categorized as expression feedback; no grammar or
pronunciation classification is invented. Vocabulary review now supports typed
recall, answer checking, replay, and repeated rounds. Browser tests exercised
correct/incorrect recall and opening all 15 roleplays. Storage tests cover
invalid record shapes, unknown-field retention, and memory-only status. Failed
writes can be retried from the save-status control; read warnings cannot trigger
an overwrite with defaults.

Save-safety follow-up: standalone read exceptions now surface as warnings;
retry writes only records that actually failed. A successful write to another
record cannot hide an outstanding error. Five storage tests cover these paths.
Applying an empty profile resets the visible name and level to anonymous
defaults; this was verified in the browser with a temporary test identity.

Not implemented: background reminders (requires an agreed service-worker/push
or host reminder integration), additional teaching/native languages, automatic
pronunciation assessment, and AI pack generation/publishing. These require
capabilities beyond the current learner-only, Chinese-first English contract.
