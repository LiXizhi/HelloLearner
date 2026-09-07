import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslationControl } from '../js/view_translation.js';

function element() {
  return { children: [], events: {}, attrs: {}, hidden: false,
    append(...children) { this.children.push(...children); },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(key, fn) { this.events[key] = fn; },
  };
}
globalThis.document = { createElement: element };

test('translation uses lite, caches the result, and invalidates it when subtitles change', async () => {
  const column = element();
  let request, finish, count = 0;
  const control = createTranslationControl(column, value => {
    request = value; count++;
    return new Promise(resolve => { finish = resolve; });
  });
  const [tools, result] = column.children;
  const button = tools.children[0];
  control.update('Hello', false);
  assert.equal(tools.hidden, true);
  control.update('Hello', true);
  const pending = button.events.click();
  assert.equal(request.model, 'keepwork-lite');
  assert.equal(request.messages.at(-1).content, 'Hello');
  finish({ text: '你好' });
  await pending;
  assert.equal(result.textContent, '你好');
  await button.events.click();
  assert.equal(result.hidden, true);
  await button.events.click();
  assert.equal(count, 1);
  control.update('Goodbye');
  const stale = button.events.click();
  control.update('See you');
  finish({ text: '再见' });
  await stale;
  assert.equal(result.hidden, true);
  assert.equal(result.textContent, '');
  assert.equal(button.disabled, false);
});

test('failed translations remain retryable', async () => {
  const column = element();
  let count = 0;
  const control = createTranslationControl(column, async () => {
    if (++count === 1) throw new Error('Offline');
    return { text: '你好' };
  });
  control.update('Hello');
  const button = column.children[0].children[0];
  await button.events.click();
  assert.equal(button.textContent, '重试翻译');
  assert.equal(button.disabled, false);
  await button.events.click();
  assert.equal(column.children[1].textContent, '你好');
});
