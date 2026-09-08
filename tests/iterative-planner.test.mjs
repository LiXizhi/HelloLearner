import test from 'node:test';
import assert from 'node:assert/strict';
import { LessonPlanner } from '../js/lesson-planner.js';
import { parseGeneration, previewLines } from '../js/plan-model.js';
import { examplePlan } from '../scripts/plan-fixtures.mjs';

test('formatted results and incomplete learner-facing previews are supported', () => {
  const result = { kind: 'plan', value: examplePlan() };
  assert.deepEqual(parseGeneration('```json\n' + JSON.stringify(result, null, 2) + '\n```'), result);
  assert.deepEqual(previewLines('{"kind":"preview","message":"Learn garden'), ['Learn garden']);
  assert.deepEqual(previewLines('{"kind":"reasoning","message":"private'), []);
  assert.throws(() => parseGeneration('{"kind":"plan","value":'));
});

test('14-day schedule resumes validated batches after bounded repair attempts', async () => {
  const plan = examplePlan();
  const schedule = { ...plan, lessons: plan.lessons.map(({ steps, ...lesson }) => lesson) };
  const offsets = [];
  let fail = true, schedules = 0;
  const planner = new LessonPlanner({ requestLLM: async payload => {
    const data = JSON.parse(payload.messages[1].content);
    if (!('offset' in data)) { schedules++; return { text: JSON.stringify({ kind: 'schedule', value: schedule }, null, 2) }; }
    offsets.push(data.offset);
    if (data.offset === 3 && fail) return { text: '{"kind":"batch","value":' };
    return { text: JSON.stringify({ kind: 'batch', value: { lessons: plan.lessons.slice(data.offset, data.offset + 3) } }, null, 2) };
  } }, () => ({ settings: {} }), async () => ({ ok: true, text: async () => '' }));
  const request = '14天学会100个小学五年级单词，有computer game有关的，例如心动小镇、我的世界。';
  await assert.rejects(planner.outline(request, null, []));
  assert.deepEqual(offsets, [0, 3, 3, 3]);
  fail = false;
  const result = await planner.outline(request, null, []);
  assert.equal(result.plan.lessons.length, 14);
  assert.equal(schedules, 1);
  assert.deepEqual(offsets.slice(4), [3, 6, 9, 12]);
});

test('cancellation prevents later batches and permits a retry', async () => {
  const plan = examplePlan();
  let planner, calls = 0;
  planner = new LessonPlanner({ requestLLM: async payload => {
    calls++;
    const data = JSON.parse(payload.messages[1].content);
    if (!('offset' in data)) return { text: JSON.stringify({ kind: 'schedule', value: plan }) };
    planner.cancel();
    return { text: JSON.stringify({ kind: 'batch', value: { lessons: plan.lessons.slice(0, 3) } }) };
  } }, () => ({}), async () => ({ ok: true, text: async () => '' }));
  await assert.rejects(planner.outline('14 days', null, []), { name: 'AbortError' });
  assert.equal(calls, 2);
  assert.equal(planner.pendingOutline.lessons.length, 0);
});