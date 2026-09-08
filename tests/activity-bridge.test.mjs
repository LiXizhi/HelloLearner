import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { search: '', href: 'http://localhost/HelloLearner/HelloLearner.html' };
globalThis.window = {}; window.parent = window;
const { AIChatBridge } = await import('../js/aichat-bridge.js');
test('embedded activities target parent with workspace guard and no nested engine', async () => {
  const peer = {}; window.parent = peer;
  const bridge = new AIChatBridge(); bridge.engineReadyPromise = Promise.resolve(); bridge.workspaceId = 'workspace-a';
  let args; bridge.request = async (...value) => { args = value; return { ok: true }; };
  await bridge.launchActivity({ tool: 'paracraft', prompt: 'Observe', params: { pid: '123' }, activityId: 'attempt' }, {});
  assert.equal(args[0], 'tool:host-command'); assert.equal(args[1].command, 'promptUserTool');
  assert.equal(args[1].expectedWorkspaceId, 'workspace-a'); assert.equal(args[3], peer);
  assert.equal(bridge.engineFrame, null);
});
test('standalone launch reuses engine; unsupported hosts and cancelled attempts do not launch', async () => {
  window.parent = window;
  const frame = { contentWindow: {}, setAttribute() {} }, bridge = new AIChatBridge();
  bridge.engineFrame = frame; bridge.engineReadyPromise = Promise.resolve();
  let launches = 0, shown = 0;
  bridge.request = async () => { launches++; return { ok: true }; }; bridge.showActivity = () => shown++;
  await assert.rejects(bridge.launchActivity({}, {}), /不支持/);
  bridge.agentLayoutSupported = true;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(bridge.launchActivity({}, {}, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(launches, 0);
  await bridge.launchActivity({ tool: 'roleplay-movie-player' }, {});
  assert.equal(bridge.engineFrame, frame); assert.equal(launches, 1); assert.equal(shown, 1);
  bridge.hideActivity(); assert.equal(frame.hidden, true);
});
