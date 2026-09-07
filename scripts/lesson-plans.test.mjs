import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePlan, validateDailyLesson, stepCompleted, previewLines, parseGeneration, learnerSummary } from '../js/plan-model.js';
import { PlanStore } from '../js/plan-store.js';
import { LessonPlanner } from '../js/lesson-planner.js';
import { examplePlan, exampleLesson, memoryBackend } from './plan-fixtures.mjs';

test('14-day outline and six flexible step types validate; repeated/reordered activities work', () => {
  const plan = examplePlan();
  validatePlan(plan);
  const lesson = exampleLesson(plan);
  validateDailyLesson(lesson, plan, plan.lessons[0]);
  const answers = ['coffee', 'coffee', '正确', 'coffee', 'a coffee please', 'coffee'];
  lesson.steps.forEach((step, i) => {
    assert.equal(stepCompleted(step, [answers[i]]), true, step.type);
    assert.equal(stepCompleted(step, ['unrelated']), false, step.type);
  });
  plan.lessons[0].steps.reverse();
  validateDailyLesson(exampleLesson(plan), plan, plan.lessons[0]);
  plan.lessons[0].steps[0].type = 'vocabulary';
  validateDailyLesson(exampleLesson(plan), plan, plan.lessons[0]);
});
test('malformed IDs, duration, unsupported content, wrong answer keys and partial generation fail closed', () => {
  const plan = examplePlan();
  for (const mutate of [p => p.id = '../other', p => p.dailyMinutes = 15,
    p => p.lessons[0].steps[0].minutes++, p => p.lessons[0].steps[0].type = 'html',
    p => p.lessons[0].steps[0].id = p.lessons[0].steps[1].id, p => p.title = '<script>']) {
    const broken = structuredClone(plan); mutate(broken); assert.throws(() => validatePlan(broken));
  }
  for (const mutate of [l => l.planId = 'another', l => l.steps.pop(), l => l.steps[2].content.correct = false,
    l => l.steps[3].content.items[0].prompt = 'missing blank', l => l.steps[4].content.goals[0].accept = []]) {
    const broken = exampleLesson(plan); mutate(broken); assert.throws(() => validateDailyLesson(broken, plan, plan.lessons[0]));
  }
});
test('only complete learner-facing preview lines are exposed; malformed artifacts stay retryable', () => {
  const output = '{"kind":"preview","message":"正在准备咖啡店对话"}\n{"kind":"lesson","value":';
  assert.deepEqual(previewLines(output), ['正在准备咖啡店对话']);
  assert.throws(() => parseGeneration(output));
  assert.deepEqual(previewLines('{"kind":"reasoning","message":"private"}\n{"kind":"preview","message":"<script>"}'), []);
});
test('store preserves plans across concurrent saves and workspace reload; daily generation caches independently', async () => {
  const backend = memoryBackend(), store = new PlanStore(backend), plan = examplePlan();
  await Promise.all([store.savePlan(plan), store.savePlan(examplePlan('plan-second'))]);
  const reloaded = new PlanStore(backend);
  assert.equal((await reloaded.list()).total, 2);
  assert.equal((await reloaded.list({ offset: 1, limit: 1 })).plans.length, 1);
  assert.equal((await new PlanStore(memoryBackend()).list()).total, 0);
  assert.equal(await reloaded.lesson(plan, plan.lessons[0]), null);
  await reloaded.saveLesson(plan, plan.lessons[0], exampleLesson(plan));
  assert.equal((await new PlanStore(backend).lesson(plan, plan.lessons[0])).id, 'day-01');
  assert.equal(await reloaded.lesson(plan, plan.lessons[1]), null);
});
test('failed saves retain retryable artifacts and do not index before the manifest; discovery repairs visibility', async () => {
  const backend = memoryBackend(), write = backend.write;
  let failedPath = 'plan.json';
  backend.write = async (path, value) => { if (path.endsWith(failedPath)) throw new Error('read-only'); await write(path, value); };
  const store = new PlanStore(backend), plan = examplePlan();
  await assert.rejects(store.savePlan(plan), /read-only/);
  assert.equal(backend.files.has('.hellolearner/plans/index.json'), false);
  failedPath = 'index.json';
  await assert.rejects(store.savePlan(plan), /read-only/);
  assert.equal((await new PlanStore(backend).list()).total, 1);
  failedPath = 'never'; await store.retry();
  assert.equal(store.failed.size, 0);
  assert.equal((await new PlanStore(backend).list()).total, 1);
});
test('corruption never overwrites data, unknown fields survive progress updates, fake completion is rejected', async () => {
  const backend = memoryBackend(), store = new PlanStore(backend), plan = examplePlan(), lesson = exampleLesson(plan);
  await store.savePlan(plan);
  const path = store.path(plan.id, 'progress.json');
  backend.files.set(path, '{bad');
  await assert.rejects(store.progress(plan.id), /损坏/);
  assert.equal(backend.files.get(path), '{bad');
  backend.files.set(path, JSON.stringify({ schemaVersion: 1, custom: { preserved: true }, lessons: {} }));
  await assert.rejects(store.checkpoint(plan, lesson, { stepId: lesson.steps[0].id, answers: ['wrong'], completed: true }), /尚未完成/);
  await store.checkpoint(plan, lesson, { stepId: lesson.steps[0].id, answers: ['coffee'], completed: true });
  const state = await new PlanStore(backend).progress(plan.id);
  assert.equal(state.custom.preserved, true);
  assert.ok(state.lessons['day-01'].steps['step-01'].completedAt);
  assert.equal(state.lessons['day-01'].completedAt, undefined);
});
test('generation lazily loads its skill, honors courseware model, and discards cancelled responses', async () => {
  let loads = 0, request, resolveRequest;
  const bridge = { requestLLM: async (detail, timeout) => { request = { detail, timeout }; return new Promise(resolve => { resolveRequest = resolve; }); } };
  const planner = new LessonPlanner(bridge, () => ({ profile: {}, settings: { coursewareModel: 'custom-courseware' } }), async () => { loads++; return { ok: true, text: async () => 'skill instructions' }; });
  assert.equal(loads, 0);
  const pending = planner.outline('旅游英语', null, []);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(request.detail.model, 'custom-courseware'); assert.equal(request.timeout, 300000);
  planner.cancel(); resolveRequest({ text: JSON.stringify({ kind: 'plan', value: examplePlan() }) });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(loads, 1);
});
test('planner summaries exclude identifiers, credentials, raw history and bulk progress', () => {
  const summary = learnerSummary({ token: 'secret', profile: { displayName: 'private', englishLevel: 'A1' }, progress: { feedback: [{ text: 'Use would like.' }] }, history: ['private'] });
  assert.doesNotMatch(JSON.stringify(summary), /secret|private|displayName|history/);
  assert.equal(summary.feedback[0].text, 'Use would like.');
});
test('topic units require valid paths, membership and contiguous lesson order', () => {
  validatePlan(examplePlan());
  for (const mutate of [
    p => { delete p.units; delete p.unitFiles; },
    p => { delete p.units; },
    p => { delete p.unitFiles; },
    p => { delete p.lessons[0].unit; },
    p => { p.lessons[0].unit = 'missing'; },
    p => { p.unitFiles['unit-01'] = '../outside.json'; },
    p => { p.lessons[1].unit = 'unit-03'; },
    p => { p.units['empty-unit'] = 'Empty'; p.unitFiles['empty-unit'] = './units/empty-unit.json'; },
  ]) {
    const plan = examplePlan(); mutate(plan); assert.throws(() => validatePlan(plan));
  }
});

test('unit saves merge concurrent lesson generation and preserve other content after reload', async () => {
  const backend = memoryBackend(), store = new PlanStore(backend), plan = examplePlan();
  await store.savePlan(plan);
  assert.equal([...backend.files.keys()].some(path => path.includes('/units/')), false);
  await Promise.all(plan.lessons.slice(0, 2).map(outline => store.saveLesson(plan, outline, exampleLesson(plan, outline))));
  const path = store.path(plan.id, 'units/unit-01.json');
  const unit = JSON.parse(backend.files.get(path));
  assert.deepEqual(unit.lessons.map(l => l.id), ['day-01', 'day-02']);
  assert.equal([...backend.files.keys()].some(path => path.includes('/lessons/')), false);
  unit.custom = { preserved: true }; backend.files.set(path, JSON.stringify(unit));
  const reloaded = new PlanStore(backend);
  await reloaded.saveLesson(plan, plan.lessons[2], exampleLesson(plan, plan.lessons[2]));
  assert.deepEqual(JSON.parse(backend.files.get(path)).custom, { preserved: true });
  assert.equal((await reloaded.lesson(plan, plan.lessons[1])).id, 'day-02');
  assert.equal(await reloaded.lesson(plan, plan.lessons[6]), null);
  assert.equal(backend.files.has(store.path(plan.id, 'units/unit-02.json')), false);
  backend.files.set(path, '{bad');
  await assert.rejects(new PlanStore(backend).saveLesson(plan, plan.lessons[0], exampleLesson(plan)), /损坏/);
  assert.equal(backend.files.get(path), '{bad');
});

test('failed unit writes retain every prepared lesson and retry without losing siblings', async () => {
  const backend = memoryBackend(), store = new PlanStore(backend), plan = examplePlan();
  const write = backend.write;
  backend.write = async () => { throw new Error('offline'); };
  for (const outline of plan.lessons.slice(0, 2)) {
    await assert.rejects(store.saveLesson(plan, outline, exampleLesson(plan, outline)), /offline/);
  }
  backend.write = write;
  await store.retry();
  const reloaded = new PlanStore(backend);
  assert.equal((await reloaded.lesson(plan, plan.lessons[0])).id, 'day-01');
  assert.equal((await reloaded.lesson(plan, plan.lessons[1])).id, 'day-02');
});

test('lesson maker requires big-topic units and assigns safe relative file paths', async () => {
  let value = examplePlan();
  value.unitFiles = { malicious: '../outside.json' };
  const planner = new LessonPlanner({ requestLLM: async () => ({ text: JSON.stringify({ kind: 'plan', value }) }) },
    () => ({ profile: {}, settings: {} }), async () => ({ ok: true, text: async () => 'instructions' }));
  const { plan } = await planner.outline('制定旅行课程', null, []);
  assert.deepEqual(plan.unitFiles, examplePlan().unitFiles);
  assert.equal(plan.lessons[6].unit, 'unit-02');
  value = examplePlan(); delete value.units; delete value.unitFiles;
  await assert.rejects(planner.outline('制定旅行课程', null, []), /大主题/);
});
