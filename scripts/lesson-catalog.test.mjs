import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadDefaultLessons } from '../js/lesson-catalog.js';
const base = 'https://example.com/release/content/';
const index = JSON.parse(await fs.readFile(new URL('../data/default_lesson_index.json', import.meta.url), 'utf8'));
const response = value => ({ ok: true, text: async () => JSON.stringify(value) });
async function fetchFile(url) {
  return { ok: true, text: () => fs.readFile(new URL(new URL(url).pathname.replace('/release/content/', '../'), import.meta.url), 'utf8') };
}
test('startup fetches only the index; concurrent same-unit opens share one fetch; all 54 lessons load', async () => {
  const calls = [];
  const catalog = await loadDefaultLessons(base, url => { calls.push(url); return fetchFile(url); });
  assert.equal(calls.length, 1);
  assert.equal(catalog.lessons.length, 54);
  assert.ok(catalog.lessons.every(l => !l.grammarJudgment && !l.practice));
  const [first, intro] = await Promise.all([catalog.loadLesson('greeting-politely'), catalog.loadLesson('introductions')]);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith('/data/lessons/U1.json'));
  assert.equal(first.id, 'greeting-politely');
  assert.equal(intro.practice.fills[0].fullSentence, 'What is your name?');
  await catalog.loadLesson('introductions');
  assert.equal(calls.length, 2);
  await catalog.loadLesson('passive-service');
  assert.equal(calls.length, 3);
  assert.ok(calls[2].endsWith('/U9.json'));
  for (const lesson of index.lessons) await catalog.loadLesson(lesson.id);
  assert.equal(calls.length, 10);
  assert.equal(catalog.lessons.filter(l => l.practice).length, 4);
  assert.ok(catalog.lessons.every(l => l.grammarJudgment));
});
test('failed unit fetch can retry without discarding the index or caching partial content', async () => {
  let failures = 1;
  const catalog = await loadDefaultLessons(base, url => url.endsWith('/U1.json') && failures-- > 0 ? { ok: false, status: 404 } : fetchFile(url));
  await assert.rejects(catalog.loadLesson('introductions'), /404/);
  assert.ok(catalog.lessons.every(l => !l.grammarJudgment));
  assert.equal((await catalog.loadLesson('introductions')).id, 'introductions');
  await assert.rejects(catalog.loadLesson('unknown'), /Unknown lesson/);
});
test('invalid index paths and duplicate IDs are rejected before fetching units', async () => {
  for (const path of ['../outside.json', 'https://foreign.test/lesson.json', '/lesson.json', './%2e%2e/lesson.json']) {
    const changed = structuredClone(index); changed.unitFiles.U1 = path;
    await assert.rejects(loadDefaultLessons(base, async () => response(changed)), /路径/);
  }
  const changed = structuredClone(index); changed.lessons[1].id = changed.lessons[0].id;
  await assert.rejects(loadDefaultLessons(base, async () => response(changed)), /重复/);
});
test('mismatched unit contents are rejected atomically', async () => {
  const catalog = await loadDefaultLessons(base, async url => url.endsWith('default_lesson_index.json') ? response(index) : response({version:1,lessons:[{id:'wrong',unit:'U1'}]}));
  await assert.rejects(catalog.loadLesson('introductions'), /与目录不一致/);
  assert.ok(catalog.lessons.every(l => !l.grammarJudgment));
});
test('entry HTML never requests the removed curriculum script', async () => {
  assert.doesNotMatch(await fs.readFile(new URL('../HelloLearner.html', import.meta.url), 'utf8'), /curriculum-data\.js/);
});
