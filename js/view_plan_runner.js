import { getInteraction, interactionCompleted, validateResponse } from './interaction-registry.js?v=20260908j';
import { checkItem, STEP_LABELS } from './plan-model.js?v=20260908j';
import { evaluateLessonDialogue } from './lesson-engine.js?v=20260905a';

export function element(tag, text = '', parent) {
  const node = document.createElement(tag);
  node.textContent = text;
  parent?.append(node);
  return node;
}
export function button(parent, label, action) {
  const node = element('button', label, parent);
  node.type = 'button';
  node.className = 'rounded-xl border border-[#174f46]/25 px-4 py-3 text-sm hover:bg-[#edf3e4] disabled:opacity-50';
  node.addEventListener('click', () => { Promise.resolve().then(action).catch(error => {
    const status = parent.closest('[data-plan-surface]')?.querySelector('[data-plan-status]');
    if (status) status.textContent = error.message;
  }); });
  return node;
}

export function mountPlanRunner(root, { plan, lesson, progress, bridge, speak, onCheckpoint, onDone, onAvatar, onIntent, onContext, sharedPractice = false }) {
  for (const step of lesson.steps) {
    const saved = progress.steps?.[step.id];
    if (!saved || getInteraction(step.type).legacy) continue;
    if (!validateResponse(step, saved.response) || saved.completedAt && !interactionCompleted(step, saved.response)) throw new Error('互动进度无效，请重新加载课程');
  }
  let stopped = false, waiting = false, cursor = 0, generation = 0, submitText = () => {};
  const completed = new Set(Object.entries(progress.steps || {}).filter(([, s]) => s.completedAt).map(([id]) => id));
  const savedAnswers = new Map(Object.entries(progress.steps || {}).map(([id, s]) => [id, s.answers || []]));
  let controller = null, activeInteraction = null;
  const advance = () => {
    cursor = lesson.steps.findIndex(step => !completed.has(step.id));
    if (cursor < 0) { root.replaceChildren(); element('h3', '本课已完成', root); button(root, '返回计划', onDone); return; }
    render();
  };
  function render() {
    activeInteraction?.stop(); activeInteraction = null;
    const token = ++generation;
    root.replaceChildren();
    const step = lesson.steps[cursor];
    const stages = element('nav', '', root); stages.className = 'flex flex-wrap gap-2 mb-5'; stages.setAttribute('aria-label', '课程环节');
    lesson.steps.forEach((stage, index) => {
      const tab = button(stages, `${index + 1} · ${STEP_LABELS[stage.type]}${completed.has(stage.id) ? ' ✓' : ''}`, () => {
        if (waiting || stopped) return;
        cursor = index; render();
      });
      tab.setAttribute('aria-current', index === cursor ? 'step' : 'false');
      tab.disabled = completed.has(stage.id);
      if (index === cursor) tab.className += ' bg-[#174f46] text-white';
    });
    onContext?.({ screen: 'lesson', activeLessonId: `${plan.id}-${lesson.id}`, activeLessonTitle: lesson.title,
      activeScenarioId: '', subject: plan.subject || 'English', priorKnowledge: plan.priorKnowledge || plan.level, teachingLanguage: plan.teachingLanguage || 'zh-CN', discussionMode: step.content.mode || '', exercise: step.type, goalIndex: cursor });
    let answers = [...(savedAnswers.get(step.id) || [])];
    element('p', `${cursor + 1} / ${lesson.steps.length} · ${STEP_LABELS[step.type]} · 约 ${step.minutes} 分钟`, root).className = 'text-sm opacity-70';
    element('h3', step.objective, root).className = 'text-xl font-bold my-3';
    const avatar = element('div', '', root);
    avatar.hidden = sharedPractice;
    avatar.className = 'relative h-40 overflow-hidden rounded-xl bg-[#edf3e4]';
    element('span', 'Maya · 学习伙伴', avatar).className = 'absolute bottom-2 left-3 text-sm';
    if (!sharedPractice) onAvatar?.(avatar);
    const content = step.content;
    const interaction = getInteraction(step.type);
    if (!interaction.legacy) {
      activeInteraction = interaction.render({ root, step, plan, response: progress.steps?.[step.id]?.response,
        bridge, speak: (text, options = {}) => speak(text, { language: plan.teachingLanguage || 'zh-CN', ...options }), onIntent,
        onCheckpoint: async detail => {
          if (stopped || token !== generation) return;
          await onCheckpoint(detail);
          if (stopped || token !== generation) return;
          progress.steps ||= {}; progress.steps[step.id] = { ...progress.steps[step.id], ...detail };
        },
        onComplete: () => {
          if (stopped || token !== generation) return;
          completed.add(step.id);
          button(root, completed.size === lesson.steps.length ? '完成本课' : '下一步骤', advance);
        },
      });
      submitText = text => activeInteraction?.submitText(text);
      return;
    }

    return interaction.render({ renderLegacy() {
    if (['vocabulary', 'phrase'].includes(step.type)) {
      const study = element('details', '', root);
      study.className = 'rounded-xl bg-[#edf3e4] p-3 my-3';
      element('summary', '先学表达，再尝试回忆', study).className = 'cursor-pointer font-bold';
      content.items.forEach(item => {
        const row = element('div', '', study); row.className = 'my-3';
        element('p', `${item.prompt} → ${item.answers.join(' / ')}`, row);
        button(row, '听表达', () => speak(item.answers[0]));
      });
    }
    const history = element('div', '', root);
    history.className = 'my-3 space-y-2';
    const prompt = element('p', '', root);
    prompt.className = sharedPractice ? 'room-message ai-room-message whitespace-pre-wrap text-lg my-3' : 'whitespace-pre-wrap text-lg my-3';
    const feedback = element('p', '', root);
    feedback.setAttribute('role', 'status');
    feedback.className = 'whitespace-pre-wrap text-sm my-2';
    const form = element('form', '', root);
    form.hidden = sharedPractice;
    form.className = 'flex flex-wrap gap-2';
    const input = element('input', '', form);
    input.type = 'text'; input.maxLength = 2000;
    input.className = 'min-w-0 flex-1 rounded-xl border border-[#174f46]/25 p-3';
    input.placeholder = '输入你的回答…'; input.setAttribute('aria-label', '练习回答');
    const submit = element('button', '提交', form);
    submit.className = 'rounded-xl bg-[#174f46] px-4 py-3 text-white';
    submit.type = 'submit';
    const actions = element('div', '', root); actions.className = 'flex flex-wrap gap-2 mt-3';
    let itemIndex = answers.length;
    const goalState = () => evaluateLessonDialogue(content, answers);
    function refreshPrompt() {
      if (step.type === 'dialogue') {
        const state = goalState();
        prompt.textContent = answers.length ? state.bridge : content.opening;
      } else if (step.type === 'grammar') prompt.textContent = `这句话是否正确？输入“正确”或“错误”。\n${content.sentence}`;
      else prompt.textContent = content.items[Math.min(itemIndex, content.items.length - 1)].prompt;
    }
    refreshPrompt();
    button(actions, '播放', () => speak(step.type === 'grammar' ? content.sentence : prompt.textContent));
    button(actions, '提示', () => {
      feedback.textContent = step.type === 'dialogue' ? goalState().hint : step.type === 'grammar' ? '判断完整句子的语法。答题后会显示解释。' : content.items[itemIndex]?.hint || '试着回忆这一课的词汇和表达。';
    });
    button(actions, '学习计划', () => onIntent('list'));
    const next = button(actions, '下一步骤', advance); next.hidden = true;
    async function checkpoint(done, note = '') {
      await onCheckpoint({ stepId: step.id, answers: [...answers], completed: done, feedback: note });
      savedAnswers.set(step.id, [...answers]);
      progress.steps ||= {};
      progress.steps[step.id] = { ...(progress.steps[step.id] || {}), answers: [...answers] };
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const answer = input.value.trim();
      if (!answer || waiting || stopped) return;
      waiting = true; submit.disabled = true;
      try {
        if (await onIntent(answer)) return;
        if (stopped || token !== generation) return;
        if (sharedPractice) {
          const message = element('p', answer, history);
          message.className = 'room-message learner-room-message whitespace-pre-wrap';
        }
        let accepted = false, done = false, note = '';
        if (step.type === 'dialogue') {
          const before = goalState();
          const proposed = [...answers, answer];
          const after = evaluateLessonDialogue(content, proposed);
          controller = new AbortController();
          const result = await bridge.requestLLM({ displayPrompt: answer,
            messages: [{ role: 'system', content: `You are a friendly tutor playing ${content.role}. Reply in 1–3 short sentences, at most one question. Give one gentle correction if needed. Never score or award completion. Next prompt: ${after.bridge}. Subject: ${plan.subject || 'English'}. Prior knowledge: ${plan.priorKnowledge || plan.level}. Teaching language: ${plan.teachingLanguage || 'English'}.` },
              ...answers.slice(-10).map(value => ({ role: 'user', content: value })), { role: 'user', content: answer }] }, 90000, { signal: controller.signal });
          if (stopped || token !== generation) return;
          if (!String(result.text || '').trim()) throw new Error('AI 返回空回复，请重试');
          element('p', `你：${answer}`, history);
          element('p', `Maya：${String(result.text).slice(0, 4000)}`, history);
          accepted = after.goalIndex > before.goalIndex;
          if (accepted) answers = proposed;
          done = after.completed;
          feedback.textContent = accepted ? '表达已达成本步骤目标。' : before.hint;
          void speak(String(result.text).slice(0, 4000));
        } else if (step.type === 'grammar') {
          const choice = /^(正确|对|true|correct)$/i.test(answer) ? true : /^(错误|错|false|incorrect|wrong)$/i.test(answer) ? false : null;
          accepted = choice === content.correct;
          done = accepted;
          if (accepted) answers = [answer];
          note = accepted ? '' : `语法练习：${content.sentence} → ${content.correction}`;
          feedback.textContent = `${accepted ? '回答正确。' : '再试一次。'} ${content.explanation}\n${content.correction}`;
        } else {
          const item = content.items[itemIndex];
          accepted = checkItem(item, answer);
          if (accepted) { answers.push(answer); itemIndex++; }
          done = itemIndex >= content.items.length;
          note = accepted ? '' : `练习：${item.prompt}；参考表达：${item.answers[0]}`;
          feedback.textContent = accepted ? '回答正确。' : `再试一次。参考表达：${item.answers.join(' / ')}`;
        }
        await checkpoint(done, note);
        if (stopped || token !== generation) return;
        if (done) {
          completed.add(step.id); form.hidden = true; next.hidden = false;
          next.textContent = completed.size === lesson.steps.length ? '完成本课' : '下一步骤';
        } else if (accepted) { input.value = ''; refreshPrompt(); input.focus(); }
      } catch (error) {
        if (!stopped && error.name !== 'AbortError') {
          feedback.textContent = `未能完成本次操作：${error.message}。请重试。`;
          // Restore the last durable checkpoint; a retry must not skip an item.
          answers = [...(progress.steps?.[step.id]?.answers || [])];
          itemIndex = answers.length; refreshPrompt();
        }
      } finally { waiting = false; submit.disabled = false; }
    });
    submitText = text => { input.value = String(text).slice(0, 2000); form.requestSubmit(); };
    if (!sharedPractice) input.focus();
    } });
  }
  advance();
  return { submitText: text => submitText(text), stop() { stopped = true; generation++; controller?.abort(); activeInteraction?.stop(); } };
}
