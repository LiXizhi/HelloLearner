import test from 'node:test';
import assert from 'node:assert/strict';
import { KeepworkAuth } from '../js/auth.js';

test('profile notifications cannot recursively fetch or repeatedly publish unchanged auth', async () => {
  let notify, reads = 0, publishes = 0;
  const sdk = { token: 'test', onAuthStateChange(fn) { notify = fn; },
    async getUserProfile() { reads++; notify(); await Promise.resolve(); notify(); return { id: 1, username: 'Learner' }; } };
  const auth = new KeepworkAuth(sdk);
  auth.subscribe(() => publishes++);
  await auth.initialize();
  assert.equal(reads, 1);
  assert.equal(publishes, 1);
  await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()]);
  assert.equal(reads, 2);
  assert.equal(publishes, 1);
  sdk.token = 'changed';
  await auth.refresh();
  assert.equal(publishes, 2, 'real credential changes still propagate');
});

test('late profile results cannot restore an account after logout', async () => {
  let release;
  const sdk = { token: 'test', getUserProfile: () => sdk.token ? new Promise(resolve => { release = resolve; }) : Promise.resolve(null) };
  const auth = new KeepworkAuth(sdk), states = [];
  auth.subscribe(state => states.push(state));
  const old = auth.refresh(); await Promise.resolve();
  sdk.token = null;
  await auth.refresh();
  release({ id: 1, username: 'Old user' }); await old;
  assert.equal(states.length, 1);
  assert.equal(states[0].loggedIn, false);
});
