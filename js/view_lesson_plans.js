import { STEP_LABELS } from './plan-model.js?v=20260907c';
import { element, button, mountPlanRunner } from './view_plan_runner.js?v=20260907c';

export function mountLessonPlans(options) {
  const { planner, getStore, getWorkspace, pause, resume, savePlan, saveLesson, checkpoint, speak, onAvatar, restoreAvatar, route } = options;
  let dialog = null, body, status, previews, runner = null, busy = false, epoch = 0, draft = null;
  let conversation = [], lastAction = null, returnFocus = null, openingLesson = '';
  let cancelButton, retryButton;
  let viewMode = 'library';
  const home = element('section');
  home.id = 'lessonPlanLibrary'; home.dataset.planSurface = '';
  home.className = 'my-5 rounded-2xl border border-[#174f46]/15 bg-white p-5 text-[#174f46]';
  document.querySelector('#progressPage .progress-content')?.prepend(home);
  const courseTitle = document.querySelector('#learningPath .journey-header h2');
  if (courseTitle) {
    courseTitle.tabIndex = 0;
    courseTitle.setAttribute('role', 'button');
    courseTitle.setAttribute('aria-label', '选择课程：我的学习计划或系统内置课程');
    courseTitle.style.cursor = 'pointer';
    courseTitle.style.textDecorationLine = 'underline';
    courseTitle.style.textDecorationThickness = '1px';
    courseTitle.style.textUnderlineOffset = '5px';
    courseTitle.addEventListener('click', () => library());
    courseTitle.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void library(); }
    });
  }
  const practiceHeader = document.querySelector('#closePracticeRoom')?.parentElement;
  if (practiceHeader) button(practiceHeader, '学习计划', () => library());

  function cancel() {
    epoch++; planner.cancel(); runner?.stop(); runner = null; busy = false; openingLesson = '';
    options.cancelSpeech?.();
    options.onPlanContext?.(null);
    if (cancelButton) { cancelButton.disabled = true; cancelButton.hidden = true; }
  }
  function close() { dialog?.close(); }
  async function open() {
    if (dialog) return;
    returnFocus = document.activeElement;
    await pause();
    // pause can await Voice shutdown; another request may already have opened it.
    if (dialog) return;
    dialog = element('dialog', '', document.body);
    dialog.id = 'lessonPlansDialog'; dialog.dataset.planSurface = '';
    dialog.className = 'm-auto w-[calc(100%_-_24px)] max-w-4xl max-h-[92dvh] overflow-hidden rounded-3xl border border-[#174f46]/20 bg-[#f7faf8] p-0 text-[#174f46] shadow-xl backdrop:bg-black/40';
    dialog.setAttribute('aria-labelledby', 'lessonPlansTitle');
    const header = element('header', '', dialog); header.className = 'border-b border-[#174f46]/10 bg-white px-5 py-4 sm:px-7';
    const top = element('div', '', header); top.className = 'flex items-center justify-between gap-3';
    const title = element('h2', '学习计划 / Lesson plans', top); title.id = 'lessonPlansTitle'; title.className = 'text-xl font-bold tracking-tight';
    button(top, '返回练习', close);
    element('p', `课程空间：${getWorkspace()}`, header).className = 'mt-1 text-xs opacity-60 break-all';
    const content = element('div', '', dialog); content.className = 'max-h-[calc(92dvh_-_110px)] overflow-y-auto p-5 sm:p-7';
    const nav = element('div', '', content); nav.className = 'flex flex-wrap gap-2 mb-4';
    button(nav, '全部计划', () => { cancel(); return library(); });
    const create = button(nav, '新建计划', () => { cancel(); return start(); });
    create.className = 'rounded-xl bg-[#174f46] px-4 py-3 text-sm font-semibold text-white hover:bg-[#23695d]';
    cancelButton = button(nav, '取消生成', () => { if (!busy) return; cancel(); retryButton.hidden = false; status.textContent = '已取消，可以重试。'; });
    cancelButton.disabled = true; cancelButton.hidden = true;
    retryButton = button(nav, '重试', () => run(lastAction)); retryButton.hidden = true;
    status = element('p', '', content); status.className = 'mb-4 text-sm leading-relaxed opacity-70'; status.dataset.planStatus = ''; status.setAttribute('role', 'status');
    previews = element('div', '', content); previews.className = 'space-y-2 my-3 text-sm'; previews.setAttribute('aria-live', 'polite');
    body = element('div', '', content); body.className = 'space-y-4';
    dialog.addEventListener('close', () => {
      cancel(); restoreAvatar?.(); dialog.remove(); dialog = null;
      resume(); returnFocus?.isConnected && returnFocus.focus();
      void refreshHome();
    });
    dialog.showModal();
  }
  async function run(action) {
    if (!action || busy) return;
    lastAction = action; busy = true;
    cancelButton.disabled = false; cancelButton.hidden = false; retryButton.hidden = true;
    const token = epoch;
    try { await action(token); }
    catch (error) { if (dialog && token === epoch && error.name !== 'AbortError') { status.textContent = `${error.message}。内容已保留，可重试。`; retryButton.hidden = false; } }
    finally { if (token === epoch) { busy = false; cancelButton.disabled = true; cancelButton.hidden = true; } }
  }
  const current = token => dialog && token === epoch;
  const stream = token => lines => {
    if (!current(token)) return;
    previews.replaceChildren();
    lines.forEach(line => element('p', line, previews));
  };
  function outlineView(container, plan, clickable = false, progress = {}, readiness = {}) {
    element('h3', plan.title, container).className = 'text-xl font-bold';
    element('p', plan.goal, container);
    element('p', `${plan.level} · ${plan.lessons.length} 课 · 每课 ${plan.dailyMinutes} 分钟`, container).className = 'text-sm opacity-70';
    const next = plan.lessons.find(l => !progress.lessons?.[l.id]?.completedAt);
    if (clickable && next) button(container, '继续学习', () => openLesson(plan.id, next.id));
    const list = element('ol', '', container); list.className = 'space-y-3';
    plan.lessons.forEach((lesson, i) => {
      const row = element('li', '', list); row.className = 'rounded-xl border border-[#174f46]/15 p-4';
      const p = progress.lessons?.[lesson.id];
      const label = p?.completedAt ? '已完成' : Object.keys(p?.steps || {}).length ? '学习中' : readiness[lesson.id] ? '已准备' : '待生成';
      if (clickable) button(row, `第 ${i + 1} 天 · ${lesson.title} · ${label}`, () => openLesson(plan.id, lesson.id));
      else element('h4', `第 ${i + 1} 天 · ${lesson.title}`, row).className = 'font-bold';
      element('p', lesson.objectives.join(' · '), row).className = 'my-2';
      element('p', lesson.steps.map(step => `${STEP_LABELS[step.type]} ${step.minutes} 分钟：${step.objective}`).join('\n'), row).className = 'whitespace-pre-wrap text-sm opacity-80';
    });
  }
  function renderDraft() {
    body.replaceChildren();
    if (draft) {
      outlineView(body, draft);
      const actions = element('div', '', body); actions.className = 'flex flex-wrap gap-2';
      for (const [label, startFirst] of [['保存计划', false], ['保存并开始第一课', true]]) button(actions, label, () => run(async token => {
        const store = getStore(), reviewed = draft;
        cancelButton.disabled = true;
        status.textContent = '正在保存计划…';
        await savePlan(store, reviewed);
        if (!current(token)) return;
        status.textContent = '计划已保存'; draft = null; conversation = [];
        // Release run's lock before navigating to another operation.
        busy = false;
        if (startFirst) await openLesson(reviewed.id, reviewed.lessons[0].id);
        else await showPlan(reviewed.id);
        void refreshHome();
      }));
    }
    const history = element('div', '', body); history.className = 'space-y-2 text-sm';
    conversation.slice(-8).forEach(turn => element('p', `${turn.role === 'user' ? '你' : '规划老师'}：${turn.content}`, history));
    const form = element('form', '', body); form.className = 'flex flex-col gap-3';
    const input = element('textarea', '', form); input.rows = 3; input.maxLength = 2000;
    input.placeholder = draft ? '修改目标、主题或课程长度…' : '例如：制定 14 天旅行英语计划，每天 10 分钟';
    input.setAttribute('aria-label', '与 AI 讨论学习计划');
    input.className = 'rounded-xl border border-[#174f46]/25 p-3';
    const send = element('button', draft ? '修改计划' : '与 AI 制定计划', form); send.type = 'submit';
    send.className = 'rounded-xl bg-[#174f46] px-4 py-3 text-white';
    form.addEventListener('submit', event => { event.preventDefault(); if (input.value.trim()) void discuss(input.value.trim()); });
  }
  async function discuss(request) {
    await run(async token => {
      status.textContent = '正在规划课程…'; previews.replaceChildren();
      const result = await planner.outline(request, draft, conversation, stream(token));
      if (!current(token)) return;
      conversation.push({ role: 'user', content: request.slice(0, 2000) });
      if (result.question) conversation.push({ role: 'assistant', content: result.question });
      else draft = result.plan;
      status.textContent = result.question ? '请补充这一项信息' : '请检查每天的目标和活动，满意后保存。';
      renderDraft();
    });
  }
  async function start(request = '') {
    await open(); cancel(); draft = null; conversation = []; previews.replaceChildren();
    viewMode = 'draft';
    status.textContent = '告诉规划老师你想达到什么目标。默认 14 课，每天一课。'; renderDraft();
    if (request) void discuss(request);
    return { opened: true };
  }
  function libraryTabs(selected) {
    const tabs = element('div', '', body);
    tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '课程来源');
    tabs.className = 'grid grid-cols-2 gap-1 rounded-2xl bg-[#e7efeb] p-1.5';
    for (const [id, label, action] of [['plans', '我的学习计划', () => library(false)], ['builtin', '系统内置课程', builtins]]) {
      const tab = button(tabs, label, action);
      tab.id = `course-tab-${id}`;
      tab.className = `rounded-xl px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174f46] ${selected === id ? 'bg-[#174f46] text-white shadow-sm hover:bg-[#23695d]' : 'bg-transparent text-[#174f46] hover:bg-white/70'}`;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(selected === id));
      tab.setAttribute('aria-controls', 'course-library-panel');
      tab.addEventListener('keydown', event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const target = event.key === 'Home' ? tabs.firstElementChild : event.key === 'End' ? tabs.lastElementChild : tab === tabs.firstElementChild ? tabs.lastElementChild : tabs.firstElementChild;
          target.focus(); target.click();
        }
      });
    }
    const panel = element('div', '', body); panel.id = 'course-library-panel';
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', `course-tab-${selected}`);
    return panel;
  }
  async function builtins() {
    await open(); cancel(); restoreAvatar?.(); viewMode = 'library';
    body.replaceChildren(); previews.replaceChildren();
    const panel = libraryTabs('builtin');
    const { lessons = [], completed = {}, premade = false } = options.getCurriculum();
    status.textContent = `${premade ? '当前课程包' : '系统内置课程'} · 共 ${lessons.length} 课，点击课程开始学习。`;
    panel.className = 'grid grid-cols-1 gap-3 sm:grid-cols-2';
    lessons.forEach((lesson, index) => {
      const card = button(panel, '', () => {
        dialog.addEventListener('close', () => options.openCurriculumLesson(lesson.id), { once: true });
        close();
      });
      card.className = 'group flex items-center gap-3 rounded-2xl border border-[#174f46]/10 bg-white p-4 text-left transition-colors hover:border-[#174f46]/40 hover:bg-[#edf3e4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#174f46]';
      element('span', String(index + 1).padStart(2, '0'), card).className = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf3e4] text-sm font-bold';
      const detail = element('span', '', card); detail.className = 'min-w-0 flex-1';
      element('span', lesson.title, detail).className = 'block text-base font-semibold leading-snug';
      element('span', `${lesson.level || '英语课程'} · ${completed[lesson.id] ? '已完成 ✓' : '开始学习'}`, detail).className = 'mt-1 block text-xs opacity-60';
      const arrow = element('span', '→', card); arrow.setAttribute('aria-hidden', 'true'); arrow.className = 'text-lg opacity-50';
    });
  }
  async function library(autoSelect = true) {
    await open();
    cancel(); restoreAvatar?.();
    viewMode = 'library';
    await run(async token => {
      status.textContent = '正在加载计划…'; previews.replaceChildren();
      let offset = 0;
      body.replaceChildren();
      const panel = libraryTabs('plans');
      const loadPage = async () => {
        const result = await getStore().list({ offset, limit: 20 });
        if (!current(token)) return;
        if (autoSelect && offset === 0 && result.total === 0 && !result.warnings.length) {
          await builtins();
          return;
        }
        body.querySelector('[data-more]')?.remove();
        renderCards(panel, result.plans);
        if (!result.total) {
          const empty = element('div', '', panel); empty.className = 'rounded-2xl border border-dashed border-[#174f46]/20 bg-white px-5 py-10 text-center';
          element('h3', '为你的目标，定制一份学习计划', empty).className = 'mb-2 text-lg font-semibold';
          element('p', '告诉 AI 你想学什么，也可以先从系统内置课程开始。', empty).className = 'mb-5 text-sm opacity-60';
          button(empty, '新建计划', () => start());
        }
        offset += result.plans.length;
        status.textContent = result.warnings.length ? `有 ${result.warnings.length} 个文件无法读取，原文件已保留。` : result.total ? `共 ${result.total} 个计划` : '还没有计划，点击“新建计划”开始。';
        if (offset < result.total) button(panel, '加载更多', () => run(loadPage)).dataset.more = '';
      };
      await loadPage();
    });
    return { opened: true };
  }
  function renderCards(parent, plans) {
    plans.forEach(plan => {
      const card = element('article', '', parent); card.className = 'rounded-2xl border border-[#174f46]/10 bg-white p-5 my-3';
      button(card, plan.title, () => showPlan(plan.id));
      element('p', plan.goal, card).className = 'my-2 text-sm';
      element('p', `${plan.level} · ${plan.count} 课 · 每课 ${plan.dailyMinutes} 分钟 · 已完成 ${plan.completed}/${plan.count}`, card).className = 'text-sm opacity-70';
    });
  }
  async function showPlan(id) {
    await open(); cancel();
    viewMode = 'plan';
    await run(async token => {
      const store = getStore(); status.textContent = '正在读取计划…';
      const plan = await store.get(id), progress = await store.progress(id), readiness = {};
      for (const lesson of plan.lessons) readiness[lesson.id] = Boolean(await store.lesson(plan, lesson));
      if (!current(token)) return;
      body.replaceChildren(); previews.replaceChildren(); restoreAvatar?.();
      outlineView(body, plan, true, progress, readiness);
      status.textContent = '选择任意一天；未准备的课程会现场生成。';
    });
    return { opened: true, planId: id };
  }
  async function openLesson(planId, lessonId) {
    if (openingLesson === `${planId}/${lessonId}`) return { opened: true, planId, lessonId };
    await open(); cancel();
    viewMode = 'lesson';
    openingLesson = `${planId}/${lessonId}`;
    await run(async token => {
      const store = getStore();
      const plan = await store.get(planId), outline = plan.lessons.find(l => l.id === lessonId);
      if (!outline) throw new Error('找不到这一天的课程');
      const progress = await store.progress(planId);
      if (!current(token)) return;
      body.replaceChildren(); previews.replaceChildren();
      element('h3', outline.title, body).className = 'text-xl font-bold';
      let lesson = await store.lesson(plan, outline);
      if (!current(token)) return;
      if (!lesson) {
        status.textContent = '我们会根据这一天的学习目标和你最近的练习情况生成课程，可能需要几分钟。';
        lesson = await planner.daily(plan, outline, progress, stream(token));
        if (!current(token)) return;
        status.textContent = '课程校验通过，正在保存…';
        cancelButton.disabled = true;
        await saveLesson(store, plan, outline, lesson);
        if (!current(token)) return;
      }
      if (store.failed.size) {
        status.textContent = '课程尚未保存成功，正在重试保存…'; await store.retry();
        if (!current(token)) return;
      }
      status.textContent = '课程已准备好，可以开始。';
      element('p', outline.objectives.join(' · '), body);
      lesson.steps.forEach(step => element('p', `${STEP_LABELS[step.type]} · ${step.minutes} 分钟 · ${step.objective}`, body));
      button(body, '开始本课', () => {
        if (runner) return;
        previews.replaceChildren(); status.textContent = '完成每个活动后继续，进度会自动保存。';
        runner = mountPlanRunner(body, { plan, lesson, progress: progress.lessons[lesson.id] || {}, bridge: options.bridge,
          onContext: options.onPlanContext,
          speak, onAvatar, onIntent: async text => text === 'list' ? (await library(), true) : route(text),
          onCheckpoint: detail => checkpoint(store, plan, lesson, detail), onDone: () => showPlan(plan.id) });
      });
    });
    openingLesson = '';
    return { opened: true, planId, lessonId };
  }
  let homeEpoch = 0;
  async function refreshHome() {
    const token = ++homeEpoch;
    home.replaceChildren();
    const heading = element('div', '', home); heading.className = 'flex flex-wrap justify-between items-center gap-2';
    element('h2', '学习计划 / Lesson plans', heading).className = 'text-lg font-bold';
    button(heading, '新建计划', () => start()); button(heading, '全部计划', library);
    const list = element('div', '', home);
    try {
      const result = await getStore().list({ limit: 3 });
      if (token !== homeEpoch) return;
      renderCards(list, result.plans);
      if (!result.total) element('p', '让 AI 为你制定每天 10 或 20 分钟的英语课程。', list).className = 'text-sm mt-3';
      if (result.warnings.length) element('p', '部分计划读取失败，请打开全部计划查看。', list);
    } catch { if (token === homeEpoch) element('p', '课程空间暂时不可用，请打开全部计划重试。', list); }
  }
  return { start, library, showPlan, openLesson, refreshHome,
    handlePrompt(text) {
      if (viewMode === 'draft') return discuss(text);
      if (runner) return runner.submitText(text);
      throw new Error('请先选择计划或开始课程，也可以说“新建学习计划”。');
    },
    invalidate() { cancel(); close(); void refreshHome(); },
    cancel, get busy() { return busy; }, get isOpen() { return Boolean(dialog); } };
}
