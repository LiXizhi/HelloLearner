import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { search: '' };
globalThis.window = {};
window.parent = window;
globalThis.matchMedia = () => ({ matches: false });
const { LearnerStorage, createStandaloneBackend } = await import('../js/storage.js');

test('invalid record shapes fall back; unknown nested fields survive writes', async () => {
  const files = new Map([
    ['.hellolearner/profile.json', '[]'],
    ['.hellolearner/progress.json', JSON.stringify({ vocabularyExposure: { hello: { future: 42 } }, future: { enabled: true } })],
  ]);
  const store = new LearnerStorage({ kind: 'memory', read: async path => files.get(path), write: async (path, text) => files.set(path, text) });
  await store.load();
  assert.equal(store.records.profile.englishLevel, 'A1');
  store.update('progress', { feedback: [] });
  await store.flush('progress');
  const saved = JSON.parse(files.get('.hellolearner/progress.json'));
  assert.equal(saved.vocabularyExposure.hello.future, 42);
  assert.equal(saved.future.enabled, true);
});
test('anonymous backend does not claim cloud sync', async () => {
  let message;
  const store = new LearnerStorage({ kind: 'memory', read: async () => '' }, { onStatus: (_, text) => { message = text; } });
  await store.load();
  assert.match(message, /仅保留在本页/);
});
test('disposing storage cancels queued account writes', async () => {
  let writes = 0;
  const store = new LearnerStorage({ kind: 'memory', read: async () => '', write: async () => { writes++; } });
  await store.load();
  store.update('profile', { displayName: 'test' });
  const pending = store.flush('profile');
  store.dispose();
  await pending;
  assert.equal(writes, 0);
  assert.equal(store.timers.size, 0);
});
test('failed reads remain warnings rather than successful empty reads', async () => {
  let status;
  const backend = createStandaloneBackend({ readFile: async () => { throw new Error('offline'); } });
  const store = new LearnerStorage(backend, { onStatus: value => { status = value; } });
  await store.load();
  assert.equal(status, 'warning');
});
test('retry writes only failed records and later successes cannot hide errors', async () => {
  const writes = [];
  let fail = true;
  let status;
  const store = new LearnerStorage({
    read: async () => '',
    write: async path => {
      writes.push(path);
      if (path.endsWith('/progress.json') && fail) throw new Error('simulated write failure');
    },
  }, { onStatus: value => { status = value; } });
  await store.load();
  await store.flush('progress');
  await store.flush('profile');
  assert.equal(status, 'error');
  fail = false;
  await store.retryFailed();
  assert.deepEqual(writes, ['.hellolearner/progress.json', '.hellolearner/profile.json', '.hellolearner/progress.json']);
  assert.equal(status, 'saved');
  assert.equal(store.failedWrites.size, 0);
});