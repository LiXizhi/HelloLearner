import test from 'node:test';
import assert from 'node:assert/strict';
import { getInteraction } from '../js/interaction-registry.js';
function element(tag = 'main') {
  return { tag, children: [], events: {}, value: '', textContent: '',
    append(el) { this.children.push(el); }, setAttribute() {}, replaceChildren() { this.children = []; },
    addEventListener(name, fn) { this.events[name] = fn; },
  };
}
function all(root) { return [root, ...root.children.flatMap(all)]; }
function setup(type, content, options = {}) {
  globalThis.document = { createElement: element };
  const root = element(); const checkpoints = []; let completed = 0;
  const view = getInteraction(type).render({ root, step: { id: 'step-test', type, content }, plan: { id: 'plan-test', subject: '科学' },
    bridge: { hideActivity() {}, requestLLM: async () => ({ text: '为什么？' }) }, speak: async () => {},
    onCheckpoint: async d => checkpoints.push(d), onComplete: () => completed++, ...options });
  const click = label => all(root).find(el => el.tag === 'button' && el.textContent === label).events.click();
  return { root, view, checkpoints, click, completed: () => completed };
}
test('failed persistence never completes a choice; retry saves the retained selection', async () => {
  let fail = true;
  const sample = setup('single-choice', { prompt: '选择', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctIds: ['a'] }, {
    onCheckpoint: async () => { if (fail) throw new Error('offline'); },
  });
  all(sample.root).find(el => el.tag === 'input' && el.value === 'a').checked = true;
  await sample.click('提交答案'); assert.equal(sample.completed(), 0);
  fail = false; await sample.click('提交答案'); assert.equal(sample.completed(), 1);
});
test('cancelled discussion ignores late LLM output and never checkpoints', async () => {
  let resolve; const result = new Promise(r => { resolve = r; });
  const sample = setup('discussion', { mode: 'socratic', topic: '证据', opening: '为什么？' }, { bridge: { requestLLM: () => result, hideActivity() {} } });
  const turn = sample.view.submitText('因为观察到了');
  await Promise.resolve(); sample.view.stop(); resolve({ text: '下一问题' }); await turn;
  assert.equal(sample.checkpoints.length, 0); assert.equal(sample.completed(), 0);
});
test('discussion requires participation and an explicit finish; repeated submits are serialized', async () => {
  const sample = setup('discussion', { mode: 'free', topic: '历史', opening: '你想了解什么？' });
  await sample.click('结束本次讨论'); assert.equal(sample.completed(), 0);
  await Promise.all([sample.view.submitText('古代生活'), sample.view.submitText('古代生活')]);
  assert.equal(sample.checkpoints.filter(c => !c.response.confirmed).length, 1);
  assert.equal(sample.completed(), 0); await sample.click('结束本次讨论'); assert.equal(sample.completed(), 1);
});
test('microphone denial leaves a typed repeat usable', async () => {
  globalThis.SpeechRecognition = class { start() { this.onerror({ error: 'not-allowed' }); } abort() {} };
  const sample = setup('repeat', { target: 'Hello', answers: ['hello'] });
  await sample.click('麦克风跟读'); assert.equal(sample.completed(), 0);
  assert.ok(all(sample.root).some(el => el.textContent.includes('无法使用麦克风')));
  await sample.view.submitText('HELLO'); assert.equal(sample.completed(), 1);
  delete globalThis.SpeechRecognition;
});
