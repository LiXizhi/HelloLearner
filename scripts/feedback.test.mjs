import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFeedback } from '../js/feedback.js';

test('feedback stores only actual bounded corrections', () => {
  assert.deepEqual(appendFeedback([], { text: ' ' }), []);
  const result = appendFeedback([], { text: ' correction ', lessonId: 'lesson' }, '2026-09-05');
  assert.equal(result[0].text, 'correction');
  assert.equal(result[0].category, 'expression');
  assert.equal(result[0].createdAt, '2026-09-05');
});
test('feedback caps records and text without mutating history', () => {
  const history = Array.from({ length: 100 }, () => ({ text: 'old' }));
  const result = appendFeedback(history, { text: 'x'.repeat(500) });
  assert.equal(result.length, 100);
  assert.equal(result[99].text.length, 300);
  assert.equal(history[99].text, 'old');
});