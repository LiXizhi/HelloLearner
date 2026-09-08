export function confirmPractice(onConfirm) {
  if (document.querySelector('#confirmPracticeDialog')) return;
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'confirmPracticeDialog';
  dialog.className = 'rounded-lg border border-lime-200 bg-white p-6 text-emerald-950 shadow-xl';
  dialog.style.width = 'min(400px, calc(100vw - 32px))';
  dialog.setAttribute('aria-labelledby', 'confirmPracticeTitle');
  dialog.setAttribute('aria-describedby', 'confirmPracticeDescription');
  dialog.innerHTML = `<h2 id="confirmPracticeTitle" class="text-lg font-bold">进入情景对练？</h2>
    <p id="confirmPracticeDescription" class="my-4 text-sm">跳过当前讲解和热身练习，直接进入情景对练？</p>
    <form method="dialog" class="flex justify-end gap-3">
      <button value="cancel" autofocus class="rounded border border-emerald-200 px-4 py-2">取消</button>
      <button value="confirm" class="rounded bg-emerald-900 px-4 py-2 text-white">进入对练</button>
    </form>`;
  let settled = false;
  function finish(confirmed) {
    if (settled) return;
    settled = true;
    dialog.close();
    dialog.remove();
    previousFocus?.focus();
    if (confirmed) onConfirm();
  }
  dialog.addEventListener('submit', event => {
    event.preventDefault();
    finish(event.submitter?.value === 'confirm');
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    finish(false);
  });
  dialog.addEventListener('close', () => finish(dialog.returnValue === 'confirm'), { once: true });
  document.body.append(dialog);
  dialog.showModal();
}