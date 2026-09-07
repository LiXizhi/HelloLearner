import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.location = { search: '', href: 'http://localhost/HelloLearner/HelloLearner.html' };
globalThis.window = {};
window.parent = window;
const { AIChatBridge } = await import('../js/aichat-bridge.js');

for (const embedded of [false, true]) {
  test(`model selection reaches the ${embedded ? 'parent' : 'standalone engine'}`, async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const peer = {};
    window.parent = embedded ? peer : window;
    let model = 'configured/chat-a';
    const bridge = new AIChatBridge({ getModel: () => model, getVoiceModel: () => 'configured/live-a' });
    bridge.engineFrame = { contentWindow: peer };
    bridge.resolveEngineReady();
    const calls = [];
    bridge.request = async (type, detail, timeout, target) => {
      calls.push({ type, detail, target });
      return { models: ['configured/chat-a', 'configured/chat-a', null, 'configured/chat-b'] };
    };
    assert.deepEqual(await bridge.listModels(), ['configured/chat-a', 'configured/chat-b']);
    await bridge.requestLLM({ prompt: 'Hello' });
    model = 'configured/chat-b';
    await bridge.requestLLM({ prompt: 'Again' });
    await bridge.requestLLM({ prompt: 'Override', model: 'explicit/chat' });
    await bridge.requestVoice('start');
    await bridge.requestVoice('stop');
    assert.ok(calls.every(call => call.target === peer));
    assert.equal(calls[0].type, 'tool:models:list');
    assert.equal(calls[1].detail.model, 'configured/chat-a');
    assert.equal(calls[2].detail.model, 'configured/chat-b');
    assert.equal(calls[3].detail.model, 'explicit/chat');
    assert.equal(calls[4].detail.model, 'configured/live-a');
    assert.equal(calls[5].detail.model, undefined);
    model = '';
    await bridge.requestLLM({ prompt: 'Default' });
    assert.equal(calls[6].detail.model, undefined);
  });
}

test('model listing surfaces host errors for retry', async () => {
  window.parent = {};
  const bridge = new AIChatBridge();
  bridge.resolveEngineReady();
  bridge.request = async () => { throw new Error('host unavailable'); };
  await assert.rejects(bridge.listModels(), /host unavailable/);
});
