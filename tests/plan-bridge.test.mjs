import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
globalThis.location = { search: '', href: 'http://localhost/HelloLearner/HelloLearner.html' };
globalThis.window = {}; window.parent = window;
const { AIChatBridge } = await import('../js/aichat-bridge.js');
const channel = 'aichat.external-tool.v1';

test('daily lesson replaces stale curriculum context with bounded general learning context', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const context = { window: { helloLearnerRuntime: { getContext: () => ({ activeLessonId: 'old' }) } },
    getState: () => ({ screen: 'learning', profile: {}, progress: {}, planContext: {
      screen: 'lesson', activeLessonId: 'plan-test-day-01', activeLessonTitle: 'Travel English', exercise: 'cloze', goalIndex: 2,
    } }) };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function getBoundedContext()'), app.indexOf('async function executeCommand')), context);
  const value = context.getBoundedContext();
  assert.equal(value.activeLessonId, 'plan-test-day-01');
  assert.equal(value.screen, 'lesson');
  assert.deepEqual(Object.keys(value), ['app', 'screen', 'learnerLevel', 'subject', 'discussionMode', 'teachingLanguage', 'age', 'activeLessonId', 'activeLessonTitle', 'activeScenarioId', 'exercise', 'goalIndex', 'speaking', 'completedLessonCount', 'completedRoleplayCount']);
});

test('standalone engine can discover and invoke planner Voice commands; replies return to that engine', async () => {
  const messages = [], executed = [];
  window.parent = window;
  const peer = { postMessage: m => messages.push(m) };
  const bridge = new AIChatBridge({ getContext: () => ({ app: 'LanguageLearner' }), executeCommand: async name => executed.push(name) });
  bridge.engineFrame = { contentWindow: peer };
  await bridge.handleMessage({ source: peer, data: { channel, type: 'tool:ready' } });
  assert.ok(messages.find(m => m.type === 'tool:ready').commands.some(c => c.name === 'start_lesson_plan'));
  await bridge.handleMessage({ source: peer, data: { channel, type: 'host:tool-command', requestId: 'voice-plan', command: 'start_lesson_plan', args: { request: 'Travel English' } } });
  assert.deepEqual(executed, ['startLessonPlan']);
  assert.equal(messages.at(-1).status, 'done');
  assert.equal(messages.at(-1).requestId, 'voice-plan');
});

test('streaming stays request/source scoped; cancellation rejects and ignores late output', async () => {
  const peer = { postMessage() {} }, other = {};
  window.parent = peer;
  const bridge = new AIChatBridge(), streams = [], controller = new AbortController();
  const pending = bridge.request('tool:llm-request', {}, 300000, peer, { signal: controller.signal, onStream: m => streams.push(m) });
  const id = [...bridge.pending.keys()][0];
  await bridge.handleMessage({ source: peer, data: { channel, type: 'host:status', requestId: id, ok: false } });
  assert.equal(bridge.pending.size, 1);
  await bridge.handleMessage({ source: other, data: { channel, type: 'host:llm-stream', requestId: id, text: 'wrong' } });
  await bridge.handleMessage({ source: peer, data: { channel, type: 'host:llm-stream', requestId: id, text: 'preview', reasoning: 'private' } });
  assert.deepEqual(streams, [{ text: 'preview' }]);
  assert.equal(bridge.pending.size, 1);
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  await bridge.handleMessage({ source: peer, data: { channel, type: 'host:llm-result', requestId: id, text: 'late' } });
  assert.equal(bridge.pending.size, 0);
});
test('audited plan commands validate aliases and terminate busy on success/error', async () => {
  const messages = [], commands = [];
  window.parent = { postMessage: m => messages.push(m) };
  const bridge = new AIChatBridge({ executeCommand: async (name, args) => { commands.push(name); return args; } });
  for (const name of ['start_lesson_plan', 'list_lesson_plans', 'open_lesson_plan', 'open_plan_lesson', 'delete_everything']) {
    await bridge.handleCommand({ requestId: name, command: name, args: {} });
    const status = messages.filter(m => m.requestId === name && m.type === 'tool:status');
    assert.equal(status[0].status, 'busy');
    assert.equal(status.at(-1).status, name === 'delete_everything' ? 'error' : 'done');
  }
  assert.deepEqual(commands, ['startLessonPlan', 'listLessonPlans', 'openLessonPlan', 'openPlanLesson']);
});

test('duplicate engine readiness and identical tokens do not repeat authentication', async () => {
  window.parent = window;
  const messages = [], peer = { postMessage: message => messages.push(message) };
  const bridge = new AIChatBridge({ token: 'fixture' });
  bridge.engineFrame = { contentWindow: peer };
  const ready = () => bridge.handleMessage({ source: peer, data: { channel, type: 'tool:ready' } });
  await ready();
  for (let i = 0; i < 25; i++) { await ready(); bridge.setToken('fixture'); }
  assert.equal(messages.filter(m => m.type === 'host:auth-set').length, 1);
  assert.equal(messages.filter(m => m.type === 'tool:ready').length, 1);
  bridge.setToken('');
  assert.equal(messages.filter(m => m.type === 'host:auth-set').length, 2);
  await bridge.handleMessage({ source: peer, data: { channel, type: 'host:ready' } });
  await ready();
  bridge.setToken('new');
  assert.equal(messages.at(-1).type, 'host:auth-set');
});
