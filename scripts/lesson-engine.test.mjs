import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLessonDialogue, validateDialogue } from '../js/lesson-engine.js';

const dialogue = {
  role: 'Librarian', opening: 'How can I help?', completionMessage: 'Your library visit is complete.',
  goals: [
    { id: 'request', prompt: 'Ask for a book.', hint: 'I would like a book.', accept: ['a book'] },
    { id: 'thanks', prompt: 'Thank the librarian.', hint: 'Thank you.', accept: ['thank you', 'thanks'] },
  ],
};
test('arbitrary lesson goals require matching answers, not a turn count', () => {
  assert.deepEqual(validateDialogue(dialogue), []);
  assert.equal(evaluateLessonDialogue(dialogue, ['hello','hello','hello','hello']).completed, false);
  assert.equal(evaluateLessonDialogue(dialogue, ['A BOOK, please!']).goalIndex, 1);
  assert.equal(evaluateLessonDialogue(dialogue, ['A book, please.', 'Thanks!']).completed, true);
});
test('one answer advances at most one goal; matching uses word boundaries', () => {
  assert.equal(evaluateLessonDialogue(dialogue, ['a book thanks']).goalIndex, 1);
  assert.equal(evaluateLessonDialogue(dialogue, ['a bookshelf']).goalIndex, 0);
});
test('invalid generated criteria are rejected', () => {
  assert.ok(validateDialogue({ ...dialogue, goals: [{id:'x',prompt:'Ask',hint:'Try',accept:['!!!']}] }).length);
  assert.ok(validateDialogue({ ...dialogue, goals: [] }).length);
});