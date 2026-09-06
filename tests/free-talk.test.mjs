import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const runtime = fs.readFileSync(new URL('../js/learner-runtime.js', import.meta.url), 'utf8');
test('typed free talk uses open-ended chat and the shared message output', async () => {
  const replies = [];
  let request;
  const context = {
    dialogueState: { waiting: false },
    introPracticeRoom: { hidden: false }, practiceRoomShell: { dataset: { freeTalk: 'true' } },
    window: { helloLearnerAI: { async requestLLM(value) { request = value; return { text: 'Tell me about your weekend.' }; } } },
    setDialogueWaiting(value) { context.dialogueState.waiting = value; },
    appendLearnerDialogueMessage: () => ({ remove() {} }),
    appendCoachDialogueMessage: value => replies.push(value.directAnswer),
    scrollDialogueHistoryToEnd() {}, speakEnglish() {}, showToast() { assert.fail('Unexpected failure'); },
  };
  vm.createContext(context);
  vm.runInContext('let freeTalkSession = 1; const freeTalkHistory = [];', context);
  vm.runInContext(runtime.slice(runtime.indexOf('async function submitFreeTalkAnswer('), runtime.indexOf('function openIntroPracticeRoom(')), context);
  await context.submitFreeTalkAnswer('My weekend was fun.');
  assert.match(request.messages[0].content, /open-ended free talk/);
  assert.equal(request.messages.at(-1).content, 'My weekend was fun.');
  assert.deepEqual(replies, ['Tell me about your weekend.']);
  assert.equal(context.dialogueState.waiting, false);
});
test('free-talk entry opens the shared room without opening the legacy popup', () => {
  let opened = 0;
  const context = { openFreeTalk() { opened++; } };
  vm.runInNewContext(runtime.slice(runtime.indexOf('function openLesson('), runtime.indexOf('function showToast(')), context);
  context.openLesson('free');
  assert.equal(opened, 1);
});

test('free talk explicitly clears lesson and scenario context, including saved-state fallbacks', () => {
  const start = runtime.lastIndexOf('  getContext() {');
  const end = runtime.indexOf('\n  },', start);
  const freeContext = vm.runInNewContext(`({${runtime.slice(start, end)}\n}}).getContext()`, {
    introPracticeRoom: { hidden: false }, practiceRoomShell: { dataset: { freeTalk: 'true' } },
  });
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const context = {
    window: { helloLearnerRuntime: { getContext: () => freeContext } },
    getState: () => ({ activeLessonId: 'old-lesson', activeScenarioId: 'old-scenario', profile: {}, progress: {} }),
  };
  vm.runInNewContext(app.slice(app.indexOf('function getBoundedContext()'), app.indexOf('async function executeCommand')), context);
  const result = context.getBoundedContext();
  assert.equal(result.activeLessonId, '');
  assert.equal(result.activeScenarioId, '');
  assert.equal(result.exercise, 'free-talk');
});
