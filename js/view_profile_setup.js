export function readLearningPreferences() {
  const form = document.getElementById('onboardingForm');
  if (!form?.elements.learnerAge) return {};
  const age = Number(form.elements.learnerAge.value);
  return { age: form.elements.learnerAge.value && Number.isInteger(age) && age >= 7 && age <= 70 ? age : null,
    interests: form.elements.learnerInterests.value.split(/[,，、]/).map(s => s.trim().slice(0, 120)).filter(Boolean).slice(0, 10),
    teachingLanguage: form.elements.teachingLanguage.value.trim().slice(0, 80) || 'zh-CN' };
}

export function openProfileSetup(profile = {}, { dismissible = true } = {}) {
  const runtime = window.helloLearnerRuntime;
  if (!runtime) return;
  const form = document.getElementById('onboardingForm');
  const dialog = document.getElementById('onboardingDialog');
  if (!form.elements.learnerAge) {
    const section = form.querySelector('[data-onboarding-step="1"]');
    const intro = section.querySelector('.onboarding-intro');
    if (intro) intro.textContent = '创建学习档案，让 Maya 为你准备适合的课程。';
    const note = document.createElement('p'); note.textContent = '学习任何主题 · 7–70 岁。年龄和偏好均可留空，难度按已有基础调整。'; section.append(note);
    for (const [name, title, type, max] of [['learnerAge', '年龄（可选）', 'number', 70], ['learnerInterests', '兴趣（可选，用逗号分隔）', 'text', 1200], ['teachingLanguage', '教学语言（可选，如 zh-CN、en-US）', 'text', 80]]) {
      const label = document.createElement('label'); label.textContent = title; label.className = 'block my-3';
      const input = document.createElement('input'); input.name = name; input.type = type;
      input.className = 'block w-full rounded-xl border border-[#174f46]/25 p-3';
      if (type === 'number') { input.min = 7; input.max = max; input.step = 1; } else input.maxLength = max;
      label.append(input); section.append(label);
    }
    const levelHeading = form.querySelector('[data-onboarding-step="2"] h2');
    if (levelHeading) levelHeading.textContent = '英语课程偏好（其他学科不使用此等级）';
    const goalHeading = form.querySelector('[data-onboarding-step="3"] h2');
    if (goalHeading) goalHeading.textContent = '学习目标（可选，也可在制定计划时说明）';
  }
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
  form.elements.learnerAge.value = profile.age || '';
  form.elements.learnerInterests.value = (profile.interests || []).join('，');
  form.elements.teachingLanguage.value = profile.teachingLanguage || '';
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
