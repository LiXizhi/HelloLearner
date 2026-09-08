import assert from 'node:assert/strict';
import test from 'node:test';
import { initLiveVoice } from '../js/view_live_voice.js';
globalThis.location = { search: '', href: 'http://localhost/HelloLearner/HelloLearner.html' };
globalThis.window = {};
globalThis.window.parent = globalThis.window;
const { AIChatBridge } = await import('../js/aichat-bridge.js');

test('voice startup sends current bounded lesson context, stop sends no prompt', async () => {
  const context = { activeLessonId: 'lesson-1', activeLessonTitle: '礼貌打招呼', exercise: 'dialogue', learnerLevel: 'A1' };
  const bridge = new AIChatBridge({ getContext: () => context });
  bridge.engineReadyPromise = Promise.resolve();
  const calls = [];
  bridge.request = async (type, detail) => { calls.push({ type, detail }); return { active: true }; };
  await bridge.requestVoice('start');
  await bridge.requestVoice('stop');
  assert.equal(calls[0].type, 'host:voice');
  assert.ok(calls[0].detail.prompt.includes(JSON.stringify(context)));
  assert.equal(calls[1].detail.prompt, undefined);
});

test('free talk and lesson voice startup distinguish private observer guidance from speech', async () => {
  for (const exercise of ['free-talk', 'dialogue']) {
    const bridge = new AIChatBridge({ getContext: () => ({ exercise }) });
    bridge.engineReadyPromise = Promise.resolve();
    let prompt;
    bridge.request = async (type, detail) => { prompt = detail.prompt; return { active: true }; };
    await bridge.requestVoice('start');
    assert.match(prompt, /marked as observer or prefixed with Copilot小纸条：/);
    assert.match(prompt, /not learner input or text to speak/);
    assert.match(prompt, /Never read aloud, quote, translate, summarize, or paraphrase the note itself/);
    assert.match(prompt, /How often do you play tennis\?/);
    assert.ok(prompt.includes(JSON.stringify({ exercise })));
  }
});

function element() {
  return {
    textContent: '', hidden: false, children: [], attrs: {}, events: {},
    classList: { toggle() {} },
    setAttribute(key, value) { this.attrs[key] = value; },
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); },
    before(child) { this.inserted = child; },
    replaceChildren() { this.children = []; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
    addEventListener(name, fn) { this.events[name] = fn; },
  };
}
function setup(requestVoice = async action => ({ active: action === 'start', state: action === 'start' ? 'listening' : 'idle' })) {
  const mic = element(), label = element(), room = element(), footer = element(), icon = element();
  const history = element(), feed = { scrollTop: 0, scrollHeight: 100, clientHeight: 100 };
  mic.closest = () => footer;
  mic.querySelector = () => icon;
  globalThis.document = { querySelector: selector => ({ '#roomMic': mic, '#roomMicLabel': label, '#introPracticeRoom': room, '#dialogueHistory': history, '#practiceChatFeed': feed })[selector], createElement: element };
  const calls = [], errors = [];
  const voice = initLiveVoice({ bridge: { requestVoice(action) { calls.push(action); return requestVoice(action); } }, cancelSpeech() {}, onError: value => errors.push(value) });
  return { voice, calls, errors, mic, label, room, subtitles: history };
}

test('click toggle keeps live voice active across both speakers and stops on second click', async () => {
  const { voice, calls, mic, subtitles } = setup();
  await voice.toggle();
  for (const role of ['user', 'assistant']) {
    voice.handleEvent({ type: 'host:chat-io', source: 'voice', role, turnId: role, phase: 'delta', text: 'Hello' });
    voice.handleEvent({ type: 'host:chat-io', source: 'voice', role, turnId: role, phase: 'done', text: 'Hello Maya' });
  }
  assert.equal(subtitles.children.length, 2);
  assert.equal(subtitles.children[0].children[0].children[1].children[0].textContent, 'Hello Maya');
  assert.equal(subtitles.children[1].children[1].children[1].children[0].textContent, 'Hello Maya');
  assert.equal(voice.active, true);
  assert.deepEqual(calls, ['start']);
  await voice.toggle();
  assert.deepEqual(calls, ['start', 'stop']);
  assert.equal(mic.attrs['aria-pressed'], 'false');
});

test('cancel during startup stops the eventual session', async () => {
  let connect;
  const { voice, calls } = setup(action => action === 'start' ? new Promise(resolve => { connect = resolve; }) : Promise.resolve({ active: false }));
  const start = voice.toggle();
  const stop = voice.toggle();
  connect({ active: true, state: 'listening' });
  await Promise.all([start, stop]);
  assert.deepEqual(calls, ['start', 'stop']);
  assert.equal(voice.active, false);
});

test('automatic start is idempotent and displays the listening lifecycle clearly', async () => {
  const { voice, calls, label } = setup();
  await voice.start();
  await voice.start();
  assert.deepEqual(calls, ['start']);
  assert.equal(label.textContent, '聆听中');
  assert.equal(label.attrs['data-voice-state'], 'listening');
  voice.handleEvent({ type: 'host:voice-changed', active: true, state: 'speaking' });
  assert.equal(label.textContent, 'Maya 正在说话');
  voice.handleEvent({ type: 'host:voice-changed', active: true, state: 'listening' });
  assert.equal(label.textContent, '聆听中');
});

test('opening greeting finishes before connecting the microphone', async () => {
  let finish;
  const { voice, calls } = setup();
  const start = voice.start({ beforeStart: () => new Promise(resolve => { finish = resolve; }) });
  assert.deepEqual(calls, []);
  finish();
  await start;
  assert.deepEqual(calls, ['start']);
});

test('closing during a greeting cancels startup even if speech never settles', async () => {
  const { voice, calls, room } = setup();
  const start = voice.start({ beforeStart: () => new Promise(() => {}) });
  room.hidden = true;
  await voice.stop();
  await start;
  assert.equal(calls.includes('start'), false);
  assert.equal(voice.active, false);
});

test('leaving free talk cancels an automatic start queued behind an earlier hangup', async () => {
  let hangup;
  const { voice, room, calls } = setup(action => action === 'stop'
    ? new Promise(resolve => { hangup = resolve; })
    : Promise.resolve({ active: true, state: 'listening' }));
  await voice.start();
  const stop = voice.stop();
  const restart = voice.start();
  room.hidden = true;
  room.events.close();
  hangup({ active: false });
  await Promise.all([stop, restart]);
  assert.deepEqual(calls, ['start', 'stop']);
  assert.equal(voice.active, false);
});

test('observer notes are collapsed and echoed guidance is removed from Maya speech', async () => {
  const { voice, subtitles } = setup();
  await voice.toggle();
  const note = 'Copilot小纸条：Ask about their weekend.';
  voice.handleEvent({ type: 'host:chat-io', source: 'voice', role: 'assistant', turnId: 'speech', phase: 'delta', text: note + 'How was your weekend?' });
  voice.handleEvent({ type: 'host:chat-io', source: 'voice', role: 'assistant', turnId: 'note', phase: 'done', messageType: 'observer', text: note });
  const speechColumn = subtitles.children[0].children[1];
  assert.equal(speechColumn.children[0].hidden, true);
  assert.equal(speechColumn.children[1].children[0].textContent, 'How was your weekend?');
  const noteColumn = subtitles.children[1].children[1];
  assert.equal(noteColumn.children[0].hidden, false);
  assert.equal(noteColumn.children[0].open, undefined);
  assert.equal(noteColumn.children[0].children[1].textContent, note);
  assert.equal(noteColumn.children[1].hidden, true);
});

test('room close hangs up and clears subtitles; late subtitles stay ignored', async () => {
  const { voice, calls, room, subtitles } = setup();
  await voice.toggle();
  room.events.close();
  await voice.stop();
  voice.handleEvent({ type: 'host:chat-io', source: 'voice', role: 'user', turnId: 'late', text: 'late' });
  assert.deepEqual(calls, ['start', 'stop']);
  assert.equal(subtitles.children.length, 0);
});

test('connection errors are visible and the toggle is retryable', async () => {
  const { voice, errors, mic } = setup(async action => {
    if (action === 'start') throw new Error('no Live model');
    return { active: false };
  });
  await voice.toggle();
  assert.equal(voice.active, false);
  assert.equal(mic.attrs['aria-pressed'], 'false');
  assert.deepEqual(errors, ['no Live model']);
});

test('bridge accepts voice callbacks from its own engine, rejects other windows', async () => {
  globalThis.window = { parent: {} };
  const engine = {};
  const messages = [];
  const bridge = new AIChatBridge({ onHostEvent: msg => messages.push(msg) });
  bridge.engineFrame = { contentWindow: engine };
  const data = { channel: 'aichat.external-tool.v1', type: 'host:chat-io', source: 'voice', role: 'user', text: 'Hi' };
  await bridge.handleMessage({ source: {}, data });
  await bridge.handleMessage({ source: engine, data: { ...data, channel: 'wrong' } });
  await bridge.handleMessage({ source: engine, data });
  assert.deepEqual(messages, [data]);
});
