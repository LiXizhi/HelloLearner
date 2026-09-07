import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { loadDefaultLessons } from '../js/lesson-catalog.js';
import { LessonPlanner } from '../js/lesson-planner.js';
import { cdnReleaseBase } from '../scripts/releaseConfig.mjs';

const root = new URL('../', import.meta.url);
const vite = await fs.readFile(new URL('vite.config.mjs', root), 'utf8');
// Inspect the declared copy inputs only; never import Vite or execute build hooks.
const copyInputs = [...vite.match(/const sideBySideEntries = \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const files = new Map();
async function collect(relative) {
  const url = new URL(relative, root);
  if ((await fs.stat(url)).isDirectory()) {
    for (const name of await fs.readdir(url)) await collect(`${relative}/${name}`);
  } else files.set(relative, await fs.readFile(url, 'utf8'));
}
for (const input of copyInputs) await collect(input);

function deployedFetcher(baseHref, calls) {
  const base = new URL(baseHref);
  return async input => {
    const url = new URL(input);
    calls.push(url.href);
    assert.equal(url.origin, base.origin);
    assert.ok(url.pathname.startsWith(base.pathname), `resource escaped release directory: ${url.pathname}`);
    const relative = url.pathname.slice(base.pathname.length);
    assert.ok(files.has(relative), `resource is absent from Vite copy inputs: ${relative}`);
    return { ok: true, text: async () => files.get(relative) };
  };
}

test('Vite ships all lesson resources and preserves the page-relative release layout', () => {
  assert.match(vite, /base:\s*'\.\/'/);
  assert.match(vite, /fs\.cpSync\(source, target, \{ recursive: true \}\)/);
  assert.ok(files.has('data/default_lesson_index.json'));
  assert.ok(files.has('lesson-planner/SKILL.md'));
  assert.ok(!files.has('data/curriculum-data.js'));
  const index = JSON.parse(files.get('data/default_lesson_index.json'));
  assert.equal(Object.keys(index.unitFiles).length, 9);
  for (const path of Object.values(index.unitFiles)) {
    const url = new URL(path, 'https://test.invalid/data/default_lesson_index.json');
    assert.ok(files.has(url.pathname.slice(1)), path);
  }
});

for (const baseHref of [`${cdnReleaseBase}/abcdef123456/`, `${cdnReleaseBase}/fedcba654321/`, 'http://localhost:5500/nested/HelloLearner/']) {
  test(`lesson and planner resources resolve under ${baseHref}`, async () => {
    const calls = [], fetcher = deployedFetcher(baseHref, calls);
    const catalog = await loadDefaultLessons(baseHref, fetcher);
    assert.deepEqual(calls, [`${baseHref}data/default_lesson_index.json`]);
    await catalog.loadLesson('greeting-politely');
    await catalog.loadLesson('introductions');
    assert.equal(calls.length, 2);
    for (const lesson of catalog.lessons) await catalog.loadLesson(lesson.id);
    assert.equal(calls.length, 10);
    assert.ok(catalog.lessons.every(lesson => lesson.grammarJudgment));
    const planner = new LessonPlanner(null, () => ({}), fetcher, baseHref);
    assert.match(await planner.instructions(), /big-topic units/);
    assert.equal(calls.length, 11);
    assert.equal(new URL(calls.at(-1)).pathname, new URL('lesson-planner/SKILL.md', baseHref).pathname);
    await planner.instructions();
    assert.equal(calls.length, 11);
  });
}

test('planner defaults to the wrapper document base instead of its JS chunk location', async () => {
  const previous = globalThis.document;
  const baseHref = `${cdnReleaseBase}/abcdef123456/`;
  globalThis.document = { baseURI: baseHref };
  try {
    const calls = [];
    const planner = new LessonPlanner(null, () => ({}), deployedFetcher(baseHref, calls));
    await planner.instructions();
    assert.ok(calls[0].startsWith(`${baseHref}lesson-planner/`));
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
