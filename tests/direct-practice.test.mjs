import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../js/learner-runtime.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('function confirmDirectPractice()'), source.indexOf("practicePhaseEntry.addEventListener('click'"));

function setup(confirmed) {
  const calls = [];
  const context = {
    plannerPaused: false, introPracticeRoom: { hidden: false },
    practiceRoomShell: { dataset: { phase: 'intro' } },
    confirmPractice: callback => { calls.push('confirm'); if (confirmed) callback(); },
    window: { clearTimeout() {},
      helloLearnerSpeech: { cancel() {} }, speechSynthesis: { cancel() {} } },
    openIntroPracticeRoom: {}, stopFillSpeechRecognition() {}, stopDialogueSpeechRecognition() {},
    continueToDialogue: () => calls.push('dialogue'),
  };
  for (const name of ['welcomeRoomMessage', 'vocabularyPreviewMessage', 'readyPrompt', 'practiceTurn', 'roomAnswerHint', 'practiceTextForm']) {
    context[name] = { hidden: false };
  }
  vm.createContext(context);
  vm.runInContext(handler, context);
  return { context, calls };
}

test('cancel leaves the current lesson phase untouched', () => {
  const { context, calls } = setup(false);
  context.confirmDirectPractice();
  assert.deepEqual(calls, ['confirm']);
  assert.equal(context.practiceRoomShell.dataset.phase, 'intro');
  assert.equal(context.welcomeRoomMessage.hidden, false);
});

test('confirmation hides explanation and enters the existing dialogue flow', () => {
  const { context, calls } = setup(true);
  context.confirmDirectPractice();
  assert.deepEqual(calls, ['confirm', 'dialogue']);
  assert.equal(context.practiceRoomShell.dataset.phase, 'practice');
  assert.equal(context.welcomeRoomMessage.hidden, true);
  assert.equal(context.practiceTurn.hidden, false);
});

test('already active dialogue is not restarted', () => {
  const { context, calls } = setup(true);
  context.practiceRoomShell.dataset.practiceStep = 'dialogue';
  context.confirmDirectPractice();
  assert.deepEqual(calls, []);
});

test('dialogue entry automatically starts voice with the lesson opening', async () => {
  const calls = [];
  const context = {
    window: { clearTimeout() {}, setTimeout() {},
      helloLearnerSpeech: { speak: text => calls.push(text) },
      helloLearnerLiveVoice: { start: async ({ beforeStart }) => { await beforeStart(); calls.push('start'); } } },
    openRoleplayBriefing: {}, fillState: {}, practiceRoomShell: { dataset: {} },
    document: { querySelector: () => ({}) }, resetDialogueState() {},
    getActiveRoleplayScenario: () => null, getActiveLesson: () => ({ opening: 'Is this seat free?' }),
  };
  for (const name of ['warmupQuiz', 'fillQuiz', 'roleplayBriefing', 'dialogueTurn', 'roomMicLabel']) context[name] = {};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function continueToDialogue()'), source.indexOf('function toSpeechText(')), context);
  context.continueToDialogue();
  await Promise.resolve();
  assert.equal(context.practiceRoomShell.dataset.practiceStep, 'dialogue');
  assert.deepEqual(calls, ['Is this seat free?', 'start']);
});