import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../js/learner-runtime.js', import.meta.url), 'utf8');
function setup() {
  const timers = new Map();
  const classes = new Set();
  const sessions = [];
  const submitted = [];
  class Recognition {
    constructor() { sessions.push(this); }
    start() {}
    stop() {}
    abort() {}
  }
  const context = {
    window: {
      SpeechRecognition: Recognition,
      setTimeout(fn, ms) { timers.set(ms, fn); return ms; },
      clearTimeout(id) { timers.delete(id); },
      helloLearnerSpeech: { cancel() {} },
    },
    roomMic: { classList: { add: v => classes.add(v), remove: v => classes.delete(v) }, setAttribute() {} },
    roomMicLabel: { textContent: '' },
    practiceTextForm: { hidden: true },
    practiceTextInput: { focus() {} },
    fillAnswerInput: { value: '', focus() {} },
    fillQuestions: [{ answer: 'name' }], fillState: { questionIndex: 0 },
    fillQuestionForm: { requestSubmit() { submitted.push(context.fillAnswerInput.value); } },
    showToast() {},
    evaluateDialogueSpeech: text => ({ normalized: text, accepted: true }),
    getActiveRoleplayScenario: () => null,
    submitPracticeAnswer: text => submitted.push(text),
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('let fillSpeechRecognition'), source.indexOf('function normalizeRecognizedSpeech')), context);
  vm.runInContext(source.slice(source.indexOf('function startDialogueVoiceAnswer'), source.indexOf('const languageProfiles')), context);
  return { context, sessions, classes, timers, submitted };
}

test('listening starts only after startup; array-like final results submit once and release the microphone', () => {
  const { context, sessions, classes, timers, submitted } = setup();
  context.startDialogueVoiceAnswer();
  assert.equal(classes.has('listening'), false);
  const recognition = sessions[0];
  recognition.onstart();
  assert.equal(classes.has('listening'), true);
  recognition.onresult({ results: [{ 0: { transcript: 'My name is Sam' }, length: 1, isFinal: true }] });
  assert.deepEqual(submitted, ['My name is Sam']);
  assert.equal(classes.has('listening'), false);
  assert.equal(timers.size, 0);
  assert.equal(recognition.onresult, null);
  context.startDialogueVoiceAnswer();
  assert.equal(sessions.length, 2);
});

for (const failure of ['network', 'not-allowed', 'end', 'timeout', 'throw']) {
  test(`${failure} clears recording and leaves typing and retry available`, () => {
    const { context, sessions, classes, timers } = setup();
    if (failure === 'throw') context.window.SpeechRecognition.prototype.start = () => { throw new Error('device'); };
    context.startDialogueVoiceAnswer();
    const recognition = sessions[0];
    if (failure === 'timeout') timers.get(15000)();
    else if (failure === 'end') recognition.onend();
    else if (failure !== 'throw') recognition.onerror({ error: failure });
    assert.equal(classes.has('listening'), false);
    assert.equal(context.practiceTextForm.hidden, false);
    assert.equal(timers.size, 0);
    assert.doesNotMatch(context.roomMicLabel.textContent, /正在/);
    context.startDialogueVoiceAnswer();
    assert.equal(sessions.length, 2);
  });
}

test('stop waits for final results, then times out if the browser stays silent', () => {
  const { context, sessions, timers } = setup();
  context.startDialogueVoiceAnswer();
  sessions[0].onstart();
  sessions[0].stop();
  assert.equal(timers.has(5000), true);
  timers.get(5000)();
  assert.equal(context.practiceTextForm.hidden, false);
  assert.equal(timers.size, 0);
});

test('fill results accept non-iterable alternatives and submit before navigation can change the question', () => {
  const { context, sessions, submitted, timers } = setup();
  context.startFillVoiceAnswer();
  sessions[0].onresult({ results: [{ 0: { transcript: 'name.' }, length: 1, isFinal: true }] });
  assert.deepEqual(submitted, ['name']);
  assert.equal(timers.size, 0);
  assert.equal(sessions[0].onresult, null);
});
