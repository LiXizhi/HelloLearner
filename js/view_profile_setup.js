export function openProfileSetup(profile = {}, { dismissible = true } = {}) {
  const runtime = window.helloLearnerRuntime;
  if (!runtime) return;
  const form = document.getElementById('onboardingForm');
  const dialog = document.getElementById('onboardingDialog');
  let closeButton = document.getElementById('closeProfileSetup');
  if (!closeButton) {
    closeButton = document.createElement('button');
    closeButton.id = 'closeProfileSetup';
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.title = '关闭设置';
    closeButton.setAttribute('aria-label', '关闭设置');
    closeButton.className = 'ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#174f46]/20 bg-white text-2xl text-[#174f46] hover:bg-[#edf3e4] focus-visible:outline focus-visible:outline-2';
    closeButton.addEventListener('click', () => dialog.close());
    form.querySelector('.onboarding-footer').append(closeButton);
  }
  closeButton.hidden = !dismissible;
  form.reset();
  form.elements.learnerName.value = profile.displayName || '';
  form.querySelectorAll('[name="learningGoals"]').forEach(option => { option.checked = false; });
  const level = form.querySelector(`[name="englishLevel"][value="${CSS.escape(profile.englishLevel || 'A1')}"]`);
  if (level) level.checked = true;
  (profile.goals || []).forEach((goal) => {
    const option = form.querySelector(`[name="learningGoals"][value="${CSS.escape(goal)}"]`);
    if (option) option.checked = true;
  });
  const minutes = form.querySelector(`[name="dailyMinutes"][value="${Number(profile.dailyTargetMinutes) || 10}"]`);
  if (minutes) minutes.checked = true;
  runtime.showProfileSetup();
}
