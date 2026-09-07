export function openSystemSettings({ settings = {}, loggedIn, listModels, listVoiceModels, onSave, embedded = false, lessonWorkspace = 'HelloLearner' }) {
  if (document.getElementById('systemSettingsDialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'systemSettingsDialog';
  dialog.className = 'm-auto w-[calc(100%_-_32px)] max-w-md rounded-2xl border border-[#174f46]/15 bg-white p-6 text-[#174f46] shadow-xl backdrop:bg-black/30';
  dialog.setAttribute('aria-labelledby', 'systemSettingsTitle');
  dialog.innerHTML = `
    <form class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-4">
        <h2 id="systemSettingsTitle" class="text-xl font-bold">系统设置</h2>
        <button type="button" data-close aria-label="关闭系统设置" class="h-10 w-10 rounded-lg text-2xl hover:bg-[#edf3e4]">×</button>
      </div>
      <label class="flex flex-col gap-2">搜索模型
        <input type="search" placeholder="输入关键词搜索…" class="rounded-lg border border-[#174f46]/25 bg-white p-3">
      </label>
      <label class="flex flex-col gap-2">文字练习模型
        <select name="model" class="w-full min-w-0 rounded-lg border border-[#174f46]/25 bg-white p-3"></select>
      </label>
      <label class="flex flex-col gap-2">默认课程规划模型
        <select name="coursewareModel" class="w-full min-w-0 rounded-lg border border-[#174f46]/25 bg-white p-3"></select>
      </label>
      <label class="flex flex-col gap-2">实时语音模型
        <select name="voiceModel" class="w-full min-w-0 rounded-lg border border-[#174f46]/25 bg-white p-3"></select>
      </label>
      <p class="text-sm text-[#174f46]/70">规划模型用于生成学习计划和每日课程，下次生成时生效。其他模型在下一次文字请求或语音连接时生效。</p>
      <label class="flex flex-col gap-2">当前课程工作空间
        <input name="lessonWorkspace" list="lessonWorkspaceChoices" maxlength="64" class="rounded-lg border border-[#174f46]/25 p-3">
        <datalist id="lessonWorkspaceChoices"></datalist>
      </label>
      <label data-create-workspace class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="createWorkspace">创建并使用此工作空间
      </label>
      <p data-workspace-help class="text-sm text-[#174f46]/70"></p>
      <p data-status role="status" class="text-sm"></p>
      <div class="flex justify-end gap-3">
        <button type="button" data-retry class="rounded-lg border border-[#174f46]/25 px-4 py-2">刷新列表</button>
        <button type="submit" class="rounded-lg bg-[#174f46] px-5 py-2 text-white">保存</button>
      </div>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const status = dialog.querySelector('[data-status]');
  const search = form.querySelector('input');
  const retry = dialog.querySelector('[data-retry]');
  const selected = { model: settings.model || '', coursewareModel: settings.coursewareModel || 'keepwork-pro', voiceModel: settings.voiceModel || '' };
  let models = [], voiceModels = [];
  const workspaceInput = form.elements.lessonWorkspace;
  workspaceInput.value = lessonWorkspace;
  workspaceInput.readOnly = embedded;
  dialog.querySelector('[data-create-workspace]').hidden = embedded;
  for (const name of new Set(['HelloLearner', lessonWorkspace, ...(settings.recentLessonWorkspaces || [])])) {
    dialog.querySelector('datalist').append(new Option(name, name));
  }
  dialog.querySelector('[data-workspace-help]').textContent = embedded
    ? '由 AIChat 当前绑定空间决定。'
    : '选择最近使用的空间，或输入指定空间名称。新空间请勾选“创建并使用”。只切换学习计划及其进度，用户档案保持不变。创建云端空间需要登录。';
  function render() {
    for (const [key, entries, fallback, defaultValue = ''] of [
      ['model', models, '默认模型（跟随 AIChat）'],
      ['coursewareModel', models, 'keepwork-pro（默认）', 'keepwork-pro'],
      ['voiceModel', voiceModels, '默认实时语音模型'],
    ]) {
      const select = form.elements[key];
      select.replaceChildren(new Option(fallback, defaultValue));
      for (const name of new Set([...entries, selected[key]].filter(Boolean))) {
        if (name === defaultValue) continue;
        if (name !== selected[key] && !name.toLowerCase().includes(search.value.trim().toLowerCase())) continue;
        select.add(new Option(entries.includes(name) ? name : `${name}（当前不可用）`, name));
      }
      select.value = selected[key];
    }
  }
  async function refresh() {
    retry.disabled = true;
    status.textContent = '正在加载模型…';
    const results = await Promise.allSettled([listModels(), Promise.resolve().then(listVoiceModels)]);
    if (!dialog.isConnected) return;
    if (results[0].status === 'fulfilled') models = results[0].value;
    if (results[1].status === 'fulfilled') voiceModels = results[1].value;
    status.textContent = results.some(result => result.status === 'rejected')
      ? '部分模型列表加载失败，请刷新重试。'
      : !models.length && !voiceModels.length ? '暂无可用模型，可保留默认设置或刷新重试。'
        : loggedIn ? '点击保存以应用全局设置。' : '未登录时仅在本次使用中生效。';
    retry.disabled = false;
    render();
  }
  form.addEventListener('change', event => {
    if (event.target.name in selected) selected[event.target.name] = event.target.value;
  });
  search.addEventListener('input', render);
  retry.addEventListener('click', refresh);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = workspaceInput.value.trim();
    if (!embedded && (!name || name.length > 64 || !/^[\p{L}\p{N} _-]+$/u.test(name))) {
      status.textContent = '空间名称可包含字母、数字、空格、下划线或连字符，最多 64 字。'; return;
    }
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await onSave({ ...selected, ...(!embedded ? { lessonWorkspace: name,
        recentLessonWorkspaces: [...new Set([name, ...(settings.recentLessonWorkspaces || [])])].slice(0, 10) } : {}) }, { createWorkspace: !embedded && form.elements.createWorkspace.checked });
      dialog.close();
    } catch (error) { status.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  render();
  dialog.showModal();
  void refresh();
}
