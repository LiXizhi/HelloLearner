// Interaction views emit checkpoints; they never own storage or the host transport.
export function mountInteraction({ root, step, plan, response, interaction, bridge, speak, onCheckpoint, onComplete, onIntent }) {
  let stopped = false, waiting = false, recognition = null, recognitionTimer = null;
  const controller = new AbortController();
  let saved = structuredClone(response || (step.type === 'discussion' ? { turns: [], confirmed: false } : {}));
  const c = step.content;
  function node(tag, text = '', parent = root) { const el = document.createElement(tag); el.textContent = text; parent.append(el); return el; }
  const status = node('p'); status.setAttribute('role', 'status'); status.className = 'my-3 whitespace-pre-wrap';
  const controls = [];
  function button(label, action, parent = root) {
    const el = node('button', label, parent); el.type = 'button';
    el.className = 'm-1 rounded-xl border border-[#174f46]/25 px-4 py-3 text-base disabled:opacity-50'; controls.push(el);
    el.addEventListener('click', () => run(action)); return el;
  }
  async function run(action) {
    if (waiting || stopped) return;
    waiting = true; controls.forEach(el => { el.disabled = true; });
    try { await action(); }
    catch (error) { if (!stopped && error.name !== 'AbortError') status.textContent = `${error.message}。请重试。`; }
    finally { waiting = false; if (!stopped) controls.forEach(el => { el.disabled = false; }); }
  }
  async function checkpoint(next, finish = false) {
    if (stopped) return;
    if (!interaction.responseValid(c, next)) throw new Error('请完成当前回答');
    const done = finish && interaction.completed(c, next);
    await onCheckpoint({ stepId: step.id, answers: [], response: next, completed: done });
    if (stopped) return;
    saved = structuredClone(next);
    status.textContent = done ? '本环节已完成。' : finish ? step.type === 'discussion' ? '先进行一轮讨论，再结束本环节。' : step.type === 'external-tool' ? '请先打开互动体验，完成后再确认。' : '再试一次。' : '已保存当前练习。';
    if (done) { stopped = true; bridge.hideActivity?.(); clearTimeout(recognitionTimer); recognition?.abort(); onComplete(); }
  }
  function input(label, initial = '', parent = root) {
    const wrapper = node('label', label, parent); wrapper.className = 'block my-3';
    const el = node('input', '', wrapper); el.type = 'text'; el.value = initial; el.maxLength = 2000;
    el.className = 'block w-full rounded-xl border border-[#174f46]/25 p-3 text-base'; controls.push(el); return el;
  }
  let submitText = () => { status.textContent = '请使用本环节的选项或完成按钮。'; };
  if (step.type.endsWith('choice')) {
    const field = node('fieldset'); node('legend', c.prompt, field).className = 'text-lg';
    const options = c.options.map(option => {
      const label = node('label', '', field); label.className = 'flex items-center gap-3 p-3';
      const el = node('input', '', label); el.type = step.type === 'single-choice' ? 'radio' : 'checkbox'; el.name = step.id;
      el.value = option.id; el.checked = saved.selectedIds?.includes(option.id) || false; controls.push(el); node('span', option.text, label); return el;
    });
    button('提交答案', () => checkpoint({ selectedIds: options.filter(o => o.checked).map(o => o.value) }, true));
  } else if (step.type === 'fill-blanks') {
    node('p', c.prompt).className = 'text-lg whitespace-pre-wrap';
    const values = c.blanks.map((blank, i) => input(`第 ${i + 1} 空`, saved.values?.[i] || ''));
    button('提交答案', () => checkpoint({ values: values.map(el => el.value.trim()) }, true));
  } else if (step.type === 'repeat') {
    node('p', c.target).className = 'text-xl'; node('p', '听示范后跟读，也可以输入文字。此练习核对文字，不评估发音。');
    button('播放示范', () => speak(c.target, { language: c.language || plan.teachingLanguage || 'zh-CN' }));
    const transcript = input('跟读文字', saved.transcript || '');
    const submit = () => checkpoint({ transcript: transcript.value.trim() }, true);
    button('核对文字', submit);
    button('麦克风跟读', () => {
      const Speech = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
      if (!Speech) { status.textContent = '当前浏览器不支持语音识别，请输入文字。'; return; }
      recognition?.abort(); clearTimeout(recognitionTimer);
      const activeRecognition = recognition = new Speech();
      recognition.lang = c.language || plan.teachingLanguage || 'zh-CN';
      recognition.onresult = event => { if (!stopped && recognition === activeRecognition) transcript.value = event.results[0][0].transcript.slice(0, 2000); };
      recognition.onend = () => { if (recognition === activeRecognition) clearTimeout(recognitionTimer); };
      recognition.onerror = () => { if (!stopped && recognition === activeRecognition) { clearTimeout(recognitionTimer); status.textContent = '无法使用麦克风，请输入文字继续。'; } };
      recognitionTimer = setTimeout(() => { activeRecognition.abort(); if (!stopped && recognition === activeRecognition) status.textContent = '语音识别已停止，可重试或输入文字。'; }, 30000);
      try { recognition.start(); } catch (error) { clearTimeout(recognitionTimer); throw error; }

    });
    submitText = text => { transcript.value = String(text).slice(0, 2000); return run(submit); };
  } else if (step.type === 'discussion') {
    node('p', c.opening).className = 'text-lg';
    const history = node('div'); history.className = 'my-4 space-y-3';
    const renderHistory = () => { history.replaceChildren(); saved.turns.forEach(t => node('p', `${t.role === 'user' ? '你' : '老师'}：${t.content}`, history)); };
    renderHistory();
    const answer = input('你的想法');
    async function submit() {
      const text = answer.value.trim(); if (!text) return;
      if (await onIntent?.(text) || stopped) return;
      const result = await bridge.requestLLM({ presentation: 'tool', displayPrompt: text, messages: [
        { role: 'system', content: `You are a learning partner. Subject: ${plan.subject || 'English'}. Prior knowledge: ${plan.priorKnowledge || plan.level || 'unspecified'}. Teaching language: ${plan.teachingLanguage || 'zh-CN'}. Topic: ${c.topic}. ${c.mode === 'socratic' ? 'Use Socratic questioning: explore the learner\'s assumptions and evidence, ask exactly one short question at a time, and do not reveal an answer before their reasoning.' : 'Follow the learner\'s topic and respond naturally with at most one follow-up question.'} Keep replies concise. Never award scores or completion.` },
        ...saved.turns.slice(-18), { role: 'user', content: text },
      ] }, 90000, { signal: controller.signal });
      if (stopped) return;
      const reply = String(result.text || '').trim().slice(0, 2000); if (!reply) throw new Error('AI 返回空回复');
      await checkpoint({ turns: [...saved.turns, { role: 'user', content: text }, { role: 'assistant', content: reply }].slice(-20), confirmed: false });
      if (!stopped) { renderHistory(); answer.value = ''; }
    }
    button('发送', submit); button('结束本次讨论', () => checkpoint({ ...saved, confirmed: true }, true));
    submitText = text => { answer.value = String(text).slice(0, 2000); return run(submit); };
  } else if (step.type === 'external-tool') {
    node('p', c.prompt).className = 'text-lg whitespace-pre-wrap';
    node('p', c.tool === 'roleplay-movie-player' ? '打开播放器后，请在其中选择或加载互动电影。' : '在 Paracraft 工具内完成世界连接和互动，再返回本课。');
    const slot = node('div'); slot.style.cssText = 'position:relative;width:100%;height:min(65vh,720px);min-height:320px'; slot.hidden = true;
    button('打开互动体验', async () => {
      const activityId = `${plan.id}/${step.id}/${crypto.randomUUID()}`;
      slot.hidden = false;
      try {
        await bridge.launchActivity({ tool: c.tool, prompt: c.prompt, params: c.params || {}, activityId }, slot, { signal: controller.signal });
        if (window.parent !== window) slot.hidden = true;
        if (!stopped) await checkpoint({ launched: true, confirmed: false, activityId });
      } catch (error) { slot.hidden = true; bridge.hideActivity?.(); throw error; }
    });
    button('返回本课', () => { slot.hidden = true; bridge.hideActivity?.(); });
    button('我已完成体验', () => checkpoint({ ...saved, launched: saved.launched === true, confirmed: true }, true));
  }
  if (c.hint) button('提示', () => { status.textContent = c.hint; });
  return { submitText, stop() { stopped = true; controller.abort(); clearTimeout(recognitionTimer); recognition?.abort(); bridge.hideActivity?.(); } };
}
