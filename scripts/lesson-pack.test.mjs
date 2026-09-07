import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateLessonPack, loadLessonPack } from '../js/lesson-pack.js';

const index = JSON.parse(fs.readFileSync(new URL('../data/default_lesson_index.json', import.meta.url), 'utf8'));
const pack = { ...index, lessons: Object.values(index.unitFiles).flatMap(path =>
  JSON.parse(fs.readFileSync(new URL('../data/' + path, import.meta.url), 'utf8')).lessons
).map(({ practice, ...lesson }) => lesson) };
test('all 54 authored lessons satisfy the JSON pack contract', () => {
  assert.equal(pack.lessons.length, 54);
  assert.deepEqual(validateLessonPack(pack).errors, []);
});
test('invalid data cannot enter HTML or break exercise construction', () => {
  for (const mutate of [
    value => { value.lessons[0].title = '<img src=x onerror=alert(1)>'; },
    value => { value.lessons[0].grammarJudgment.targets = ['missing', 'missing', 'missing']; },
    value => { value.lessons[1].id = value.lessons[0].id; },
    value => { value.lessons[0].unit = 'unknown'; },
    value => { value.version = 2; },
  ]) {
    const changed = structuredClone(pack);
    mutate(changed);
    assert.equal(validateLessonPack(changed).valid, false);
  }
});
test('loader accepts valid JSON and rejects foreign origins before fetch', async () => {
  const loaded = await loadLessonPack('./pack.json', 'http://localhost/app/', async () => ({ ok: true, text: async () => JSON.stringify(pack) }));
  assert.equal(loaded.lessons.length, 54);
  await assert.rejects(loadLessonPack('https://example.com/pack.json', 'http://localhost/', () => assert.fail('must not fetch')), /same origin/);
  await assert.rejects(loadLessonPack('./pack.json', 'http://localhost/', async () => ({ ok: true, text: async () => '{}' })), /version/);
});