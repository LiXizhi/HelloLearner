import test from 'node:test';
import assert from 'node:assert/strict';
import { getInteraction, interactionCompleted, validParameters } from '../js/interaction-registry.js';
import { validatePlan, validateDailyLesson } from '../js/plan-model.js';
import { PlanStore } from '../js/plan-store.js';
import { examplePlan } from '../scripts/plan-fixtures.mjs';

export const samples = [
  ['single-choice', { prompt: '哪个是行星？', options: [{ id: 'earth', text: '地球' }, { id: 'sun', text: '太阳' }], correctIds: ['earth'] }, { selectedIds: ['earth'] }, { selectedIds: ['sun'] }],
  ['multiple-choice', { prompt: '选择行星', options: [{ id: 'earth', text: '地球' }, { id: 'mars', text: '火星' }, { id: 'sun', text: '太阳' }], correctIds: ['earth', 'mars'] }, { selectedIds: ['mars', 'earth'] }, { selectedIds: ['earth'] }],
  ['fill-blanks', { prompt: '___ + ___ = 5', blanks: [{ id: 'a', answers: ['2', '二'] }, { id: 'b', answers: ['3', '三'] }] }, { values: ['二', '3'] }, { values: ['3', '2'] }],
  ['repeat', { target: 'Hello world!', answers: ['Hello world'], language: 'en-US' }, { transcript: 'HELLO, world!' }, { transcript: 'world' }],
  ['discussion', { mode: 'socratic', topic: '证据', opening: '你如何知道地球是圆的？' }, { turns: [{ role: 'user', content: '船会从地平线消失' }, { role: 'assistant', content: '为什么这是一种证据？' }], confirmed: true }, { turns: [], confirmed: true }],
  ['external-tool', { tool: 'paracraft', prompt: '观察世界中的地形', params: { pid: '1974758' } }, { launched: true, confirmed: true, activityId: 'activity-test' }, { launched: true, confirmed: false }],
];
for (const [type, content, correct, wrong] of samples) test(`${type}: validation and explicit completion contract`, () => {
  const interaction = getInteraction(type), step = { type, content };
  assert.equal(interaction.validate(content), true);
  assert.equal(interaction.validate({}), false);
  assert.equal(interactionCompleted(step, correct), true);
  assert.equal(interactionCompleted(step, wrong), false);
  assert.equal(interactionCompleted(step, null), false);
  assert.equal(typeof interaction.render, 'function');
});
test('unknown types, duplicate options, unsafe params and ambiguous blanks fail validation', () => {
  assert.throws(() => getInteraction('unknown'));
  const choice = samples[0][1];
  assert.equal(getInteraction('single-choice').validate({ ...choice, options: [choice.options[0], choice.options[0]] }), false);
  assert.equal(getInteraction('fill-blanks').validate({ ...samples[2][1], prompt: '___' }), false);
  assert.equal(validParameters({ token: 'secret' }), false);
  assert.equal(validParameters({ nested: { password: 'secret' } }), false);
  assert.equal(validParameters({ goal: 'x'.repeat(4001) }), false);
  assert.equal(validParameters({ pid: '123', position: [1, 2, 3] }), true);
});
test('v2 plans need subject knowledge instead of English level; v1 remains unchanged', () => {
  const old = examplePlan(); const snapshot = JSON.stringify(old);
  validatePlan(old); assert.equal(JSON.stringify(old), snapshot);
  const plan = { ...old, schemaVersion: 2, subject: '科学', priorKnowledge: '零基础', teachingLanguage: 'zh-CN' };
  delete plan.level; validatePlan(plan);
  assert.throws(() => validatePlan({ ...plan, subject: '' }));
});
test('v2 response checkpoints survive reload and reject automatic tool completion', async () => {
  const files = new Map();
  const backend = { read: async p => files.get(p) || '', write: async (p, v) => files.set(p, v) };
  const store = new PlanStore(backend);
  const base = examplePlan();
  const outline = { id: 'day-01', unit: 'unit-01', title: '科学', objectives: ['观察'], steps: samples.map(([type], i) => ({ id: `step-${i + 1}`, type, objective: '观察和回答', minutes: i < 4 ? 2 : 1 })) };
  const plan = { ...base, schemaVersion: 2, subject: '科学', priorKnowledge: '零基础', teachingLanguage: 'zh-CN', dailyMinutes: 10, lessons: [outline], units: { 'unit-01': '科学' }, unitFiles: { 'unit-01': './units/unit-01.json' } };
  const lesson = { schemaVersion: 2, planId: plan.id, id: outline.id, title: outline.title, steps: outline.steps.map((s, i) => ({ ...s, content: samples[i][1] })) };
  validatePlan(plan); validateDailyLesson(lesson, plan, outline);
  await store.savePlan(plan); await store.saveLesson(plan, outline, lesson);
  for (let i = 0; i < samples.length; i++) await store.checkpoint(plan, lesson, { stepId: lesson.steps[i].id, answers: [], response: samples[i][2], completed: true });
  const reloaded = new PlanStore(backend), progress = await reloaded.progress(plan.id);
  assert.equal(progress.schemaVersion, 2);
  assert.ok(progress.lessons[outline.id].completedAt);
  assert.deepEqual(progress.lessons[outline.id].steps['step-3'].response, samples[2][2]);
  await assert.rejects(store.checkpoint(plan, lesson, { stepId: 'step-6', answers: [], response: samples[5][3], completed: true }), /尚未完成/);
  assert.deepEqual(await reloaded.lesson(plan, outline), lesson);
});
