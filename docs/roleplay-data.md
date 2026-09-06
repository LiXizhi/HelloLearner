# Editing Roleplays

Edit `data/roleplay-data.json`. It is the sole authored roleplay catalog;
the previous JavaScript wrapper has been removed. All 15 scenarios retain
their original IDs, goals, aliases, regular expressions, and text.

`js/app.js` awaits `js/roleplay-catalog.js` before initializing the learner.
The loader checks version, scenario IDs, goal IDs, and regular expression
syntax, then supplies the existing `window.HELLO_LEARNER_ROLEPLAYS` interface.
Use a static HTTP server; JSON loading does not support opening from file URLs.

The root contains `version: 1` and a `scenarios` object keyed by scenario ID.
Keep each key equal to its scenario's `id`. Preserve IDs when editing existing
content because learner progress uses them. JSON requires double-quoted keys
and strings, no comments, and no trailing commas. Regex backslashes must be
escaped: write `"\\bpassport\\b"` in JSON to represent word boundaries.

After edits run:

```sh
node --test scripts/roleplay-catalog.test.mjs
```

Bump the JSON URL's `?v=` suffix in `js/roleplay-catalog.js` when changing the
catalog, and bump its import suffix in `js/app.js` plus the app entry suffix
in `HelloLearner.html`. The roleplay card layout remains in the entry HTML;
adding an entirely new scenario also requires its catalog card there.

Generated `dist/` and `release/` copies are updated only by the human-run release
pipeline, not by editing those copies directly.