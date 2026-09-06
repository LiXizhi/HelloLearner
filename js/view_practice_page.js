let returnFocus = null;
let returnScroll = 0;

export function openPracticePage() {
  const page = document.querySelector('#introPracticeRoom');
  const layout = document.querySelector('#standaloneLayout');
  if (!page.hidden) return;
  returnFocus = document.activeElement;
  returnScroll = layout.scrollTop;
  layout.append(page);
  document.body.classList.add('practice-page-active');
  page.hidden = false;
  layout.scrollTop = 0;
  document.querySelector('#closePracticeRoom').focus({ preventScroll: true });
}

export function closePracticePage() {
  const page = document.querySelector('#introPracticeRoom');
  if (page.hidden) return;
  page.hidden = true;
  document.body.classList.remove('practice-page-active');
  document.querySelector('#standaloneLayout').scrollTop = returnScroll;
  // Reuse the existing voice, timer and avatar cleanup lifecycle.
  page.dispatchEvent(new Event('close'));
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
}
