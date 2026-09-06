import assert from 'node:assert/strict';
import test from 'node:test';
import { openPracticePage, closePracticePage } from '../js/view_practice_page.js';

test('practice replaces home in the page layout and restores navigation on return', () => {
  const classes = new Set();
  let cleanup = 0, restored = 0;
  const page = { hidden: true, dispatchEvent(event) { assert.equal(event.type, 'close'); cleanup++; } };
  const layout = { scrollTop: 350, append(node) { this.child = node; } };
  const back = { focus() {} };
  globalThis.document = {
    activeElement: { isConnected: true, focus() { restored++; } },
    body: { classList: { add: key => classes.add(key), remove: key => classes.delete(key) } },
    querySelector: key => ({ '#introPracticeRoom': page, '#standaloneLayout': layout, '#closePracticeRoom': back })[key],
  };
  openPracticePage();
  assert.equal(layout.child, page);
  assert.equal(page.hidden, false);
  assert.equal(classes.has('practice-page-active'), true);
  assert.equal(layout.scrollTop, 0);
  closePracticePage();
  closePracticePage();
  assert.equal(page.hidden, true);
  assert.equal(classes.has('practice-page-active'), false);
  assert.equal(layout.scrollTop, 350);
  assert.equal(cleanup, 1);
  assert.equal(restored, 1);
});
