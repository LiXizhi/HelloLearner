const CONFIG_URL = new URL('../data/avatar-config.json?v=20260905b', import.meta.url);

function keepworkVoiceName(item, sdk) {
  const voices = sdk?.speech?.getSupportedVoices?.() || [];
  const match = voices.find((voice) => voice.id === item.voice.voiceType);
  return match?.name || item.voice.label || item.voice.voiceType || item.voice.names?.[0] || '';
}

function createDialog(avatars) {
  const dialog = document.createElement('dialog');
  dialog.className = 'avatar-picker';
  dialog.setAttribute('aria-labelledby', 'avatarPickerTitle');
  dialog.innerHTML = `
    <header>
      <div><p>AI ENGLISH COACH</p><h2 id="avatarPickerTitle">选择角色</h2></div>
      <button class="avatar-picker-close" type="button" aria-label="关闭">×</button>
    </header>
    <div class="avatar-picker-layout">
      <div class="avatar-picker-list" aria-label="角色列表">
        ${avatars.map((item) => `
          <button class="avatar-option" type="button" data-avatar-id="${item.id}" aria-label="预览 ${item.name}${item.vip ? '，VIP 角色' : ''}">
            <span class="avatar-option-preview">${item.name.slice(0, 1)}</span>
            <span><strong>${item.name}</strong><small>${item.role}</small></span>
            ${item.vip ? '<b>VIP</b>' : '<b class="free">免费</b>'}
          </button>`).join('')}
      </div>
      <section class="avatar-detail" aria-live="polite">
        <div class="avatar-preview-stage"><span class="avatar-preview-loading">正在载入角色…</span></div>
        <div class="avatar-detail-copy">
          <div class="avatar-detail-title"><div><h3></h3><p></p></div><b class="avatar-detail-tier"></b></div>
          <p class="avatar-detail-personality"></p>
          <dl><div><dt>擅长</dt><dd class="avatar-detail-specialty"></dd></div><div><dt>声音</dt><dd class="avatar-detail-voice"></dd></div></dl>
          <blockquote class="avatar-detail-sample"></blockquote>
          <div class="avatar-detail-actions"><button class="avatar-voice-preview" type="button">试听声音</button><button class="avatar-apply" type="button">使用此角色</button></div>
          <p class="avatar-vip-note" hidden>VIP 专属角色，可免费预览与试听</p>
        </div>
      </section>
    </div>`;
  document.body.appendChild(dialog);
  return dialog;
}

function createPreviewController(dialog, avatars) {
  const stage = dialog.querySelector('.avatar-preview-stage');
  const loading = dialog.querySelector('.avatar-preview-loading');
  const previewUrl = 'avatar-preview.html?v=20260905h';
  let frame = null;
  let frameReady = false;
  let pending = null;
  let requestId = 0;
  addEventListener('message', (event) => {
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'avatar-preview-frame-ready') {
      frameReady = true;
      if (pending) frame.contentWindow.postMessage(pending, '*');
    }
    if (event.data?.id !== pending?.id) return;
    if (event.data.type === 'avatar-preview-ready') loading.hidden = true;
    if (event.data.type === 'avatar-preview-error') {
      loading.textContent = '预览载入失败';
      loading.hidden = false;
    }
  });
  return {
    activate() {
      if (frame) return;
      frameReady = false;
      frame = document.createElement('iframe');
      frame.className = 'avatar-preview-frame';
      frame.title = 'Live2D 角色预览';
      frame.src = previewUrl;
      stage.prepend(frame);
    },
    deactivate() {
      requestId += 1;
      pending = null;
      frameReady = false;
      frame?.remove();
      frame = null;
      loading.hidden = false;
      loading.textContent = '正在载入角色…';
    },
    async show(id) {
      const item = avatars.find((candidate) => candidate.id === id);
      if (!item) return;
      this.activate();
      const currentRequest = ++requestId;
      loading.hidden = false;
      loading.textContent = '正在载入角色…';
      pending = { type: 'preview-avatar', id: `${item.id}-${currentRequest}`, model: item.model, scale: item.scale || 1 };
      if (frameReady) frame?.contentWindow?.postMessage(pending, '*');
    },
  };
}

export async function initAvatarSelector({ button, avatar, speech, sdk, showNotice }) {
  const response = await fetch(CONFIG_URL);
  if (!response.ok) throw new Error('Unable to load avatar configuration');
  const { avatars } = await response.json();
  if (!Array.isArray(avatars) || !avatars.length) throw new Error('Avatar configuration is empty');
  avatar.setCatalog(avatars);
  speech.setVoicePreference(avatars[0].voice);
  window.helloLearnerVoice = avatars[0].voice;

  const dialog = createDialog(avatars);
  const preview = createPreviewController(dialog, avatars);
  let isVip = false;
  let previewed = avatars[0];
  const renderDetails = (item) => {
    previewed = item;
    dialog.querySelectorAll('.avatar-option').forEach((option) => option.classList.toggle('previewing', option.dataset.avatarId === item.id));
    dialog.querySelector('.avatar-detail-title h3').textContent = item.name;
    dialog.querySelector('.avatar-detail-title p').textContent = item.role;
    const tier = dialog.querySelector('.avatar-detail-tier');
    tier.textContent = item.vip ? 'VIP' : '免费';
    tier.classList.toggle('free', !item.vip);
    dialog.querySelector('.avatar-detail-personality').textContent = item.personality;
    dialog.querySelector('.avatar-detail-specialty').textContent = item.specialty;
    dialog.querySelector('.avatar-detail-voice').textContent = keepworkVoiceName(item, sdk);
    dialog.querySelector('.avatar-detail-sample').textContent = `“${item.sample}”`;
    dialog.querySelector('.avatar-vip-note').hidden = !(item.vip && !isVip);
    const apply = dialog.querySelector('.avatar-apply');
    apply.textContent = item.id === avatar.selectedId ? '当前使用中' : item.vip && !isVip ? 'VIP 解锁后使用' : '使用此角色';
    apply.disabled = item.id === avatar.selectedId;
    preview.show(item.id).catch(() => showNotice('角色预览载入失败'));
  };

  const close = () => {
    preview.deactivate();
    dialog.close();
  };
  dialog.querySelector('.avatar-picker-close').addEventListener('click', close);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.querySelectorAll('.avatar-option').forEach((option) => option.addEventListener('click', () => {
    const item = avatars.find((candidate) => candidate.id === option.dataset.avatarId);
    if (item) renderDetails(item);
  }));
  dialog.querySelector('.avatar-voice-preview').addEventListener('click', async () => {
    const button = dialog.querySelector('.avatar-voice-preview');
    if (button.dataset.busy === '1') {
      speech.cancel();
      button.dataset.busy = '';
      button.textContent = '试听声音';
      return;
    }
    speech.unlockPlayback();
    button.dataset.busy = '1';
    button.textContent = '正在试听…';
    try {
      const ok = await speech.speak(previewed.sample, {
        language: previewed.voice.language || 'en-US',
        rate: previewed.voice.rate,
        voicePreference: previewed.voice,
      });
      if (!ok) showNotice('试听失败，请检查网络后重试');
    } finally {
      button.dataset.busy = '';
      button.textContent = '试听声音';
    }
  });
  dialog.querySelector('.avatar-apply').addEventListener('click', async () => {
    if (previewed.vip && !isVip) return showNotice('此角色为 VIP 专属，请先开通会员');
    const apply = dialog.querySelector('.avatar-apply');
    apply.disabled = true;
    const selected = await avatar.selectModel(previewed.id);
    apply.disabled = false;
    if (!selected) return showNotice('角色载入失败，请重试');
    speech.setVoicePreference(previewed.voice);
    window.helloLearnerVoice = previewed.voice;
    showNotice(`已切换到 ${previewed.name} · ${keepworkVoiceName(previewed, sdk)}`);
    close();
  });
  button.addEventListener('click', async () => {
    isVip = typeof sdk?.isUserVip === 'function' ? await sdk.isUserVip().catch(() => false) : false;
    dialog.showModal();
    renderDetails(avatars.find((item) => item.id === avatar.selectedId) || avatars[0]);
  });
}