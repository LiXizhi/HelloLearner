import { APP_ID, CHANNEL, DEFAULT_WORKSPACE } from './config.js';
import { requestId } from './utils.js';

const COMMAND_ALIASES = {
  open_lesson: 'openLesson',
  open_roleplay: 'openRoleplay',
  present_phrase: 'presentPhrase',
  refresh_learner_state: 'refreshLearnerState',
  start_lesson_plan: 'startLessonPlan',
  list_lesson_plans: 'listLessonPlans',
  open_lesson_plan: 'openLessonPlan',
  open_plan_lesson: 'openPlanLesson',
};
const ALLOWED_COMMANDS = new Set(['navigate', ...Object.values(COMMAND_ALIASES), ...Object.keys(COMMAND_ALIASES)]);
const COMMANDS = [
  { name: 'start_lesson_plan', description: 'Discuss a new learning plan for any subject. The learner reviews and saves it in the app.', parameters: { type: 'object', properties: { request: { type: 'string', maxLength: 2000 } } } },
  { name: 'list_lesson_plans', description: 'List plans in the lesson workspace.', readOnly: true, parameters: { type: 'object', properties: { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 50 } } } },
  { name: 'open_lesson_plan', description: 'Show a saved plan.', parameters: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'] } },
  { name: 'open_plan_lesson', description: 'Open a daily lesson or start visible preparation. Does not award completion.', parameters: { type: 'object', properties: { planId: { type: 'string' }, lessonId: { type: 'string' } }, required: ['planId', 'lessonId'] } },
  { name: 'navigate', description: 'Open a learner section.', parameters: { type: 'object', properties: { screen: { type: 'string', enum: ['learning', 'roleplay', 'progress', 'profile'] } }, required: ['screen'] } },
  { name: 'open_lesson', description: 'Open one curriculum lesson by ID.', parameters: { type: 'object', properties: { lessonId: { type: 'string' } }, required: ['lessonId'] } },
  { name: 'open_roleplay', description: 'Open one authored roleplay by ID.', parameters: { type: 'object', properties: { scenarioId: { type: 'string' } }, required: ['scenarioId'] } },
  { name: 'present_phrase', description: 'Speak a short practice word or sentence.', parameters: { type: 'object', properties: { text: { type: 'string', maxLength: 240 } } } },
  { name: 'refresh_learner_state', description: 'Reload learner records from the current workspace.', readOnly: true, parameters: { type: 'object', properties: {} } },
];

export class AIChatBridge {
  constructor({ getContext, executeCommand, onHostEvent = () => {}, getModel = () => '', getVoiceModel = () => '', token = '' } = {}) {
    this.getContext = getContext;
    this.executeCommand = executeCommand;
    this.onHostEvent = onHostEvent;
    this.getVoiceModel = getVoiceModel;
    this.getModel = getModel;
    this.token = token;
    this.pending = new Map();
    this.hostReady = false;
    this.engineFrame = null;
    this.engineReady = false;
    this.lastEngineToken = undefined;
    this.engineReadyPromise = new Promise((resolve) => { this.resolveEngineReady = resolve; });
    this.handleMessage = this.handleMessage.bind(this);
  }

  start() {
    window.addEventListener('message', this.handleMessage);
    if (window.parent !== window) this.announceReady();
    else this.mountEngine();
    return true;
  }

  mountEngine() {
    const isLocalHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    const url = new URL(isLocalHost
      ? '../AIChat/AIChat.html'
      : 'https://keepwork.com/api/raw/maisi/maisi/webgames/tools/AIChat/release/AIChat_v1.html', location.href);
    url.searchParams.set('layout', 'agent');
    url.searchParams.set('compact', '1');
    url.searchParams.set('hide', 'pet');
    url.searchParams.set('chat', 'new');
    url.searchParams.set('persist', '0');
    url.searchParams.set('frontpage', 'hide');
    url.searchParams.set('workspace', DEFAULT_WORKSPACE);
    url.searchParams.set('skill', 'local-language-learner');
    if (this.token) url.searchParams.set('token', this.token);
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.tabIndex = -1;
    frame.title = 'HelloLearner AIChat engine';
    frame.setAttribute('aria-hidden', 'true');
    frame.allow = 'microphone; autoplay';
    frame.src = url.toString();
    document.body.appendChild(frame);
    this.engineFrame = frame;
  }

  announceReady(target = window.parent) {
    this.post('tool:ready', {
      toolId: APP_ID,
      capabilities: ['tool-context', 'tool-commands', 'game-world-commands', 'workspace', 'llm', 'voice', 'composer-intercept', 'hide-host-pet'],
      commands: COMMANDS,
    }, target);
  }

  stop() {
    this.hideActivity();
    window.removeEventListener('message', this.handleMessage);
    this.pending.forEach(({ reject, timer, cleanup }) => {
      clearTimeout(timer);
      cleanup?.();
      reject(new Error('AIChat bridge stopped'));
    });
    this.pending.clear();
    this.engineFrame?.remove();
    this.engineFrame = null;
  }

  post(type, detail = {}, target = window.parent) {
    target?.postMessage({ channel: CHANNEL, type, ...detail }, '*');
  }

  request(type, detail = {}, timeoutMs = 8000, target = window.parent, { onStream, signal } = {}) {
    if (!target || target === window) return Promise.reject(new Error('AIChat host is not available'));
    if (signal?.aborted) return Promise.reject(new DOMException('已取消', 'AbortError'));
    const id = requestId('learner');
    return new Promise((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const abort = () => {
        clearTimeout(timer); cleanup(); this.pending.delete(id);
        reject(new DOMException('已取消', 'AbortError'));
      };
      const timer = setTimeout(() => {
        this.pending.delete(id); cleanup();
        reject(new Error(`AIChat request timed out: ${type}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, target, onStream, cleanup, type });
      signal?.addEventListener('abort', abort, { once: true });
      this.post(type, { ...detail, requestId: id }, target);
    });
  }

  async requestLLM(detail, timeoutMs = 90000, options = {}) {
    let readyTimer;
    try { await Promise.race([
      this.engineReadyPromise,
      new Promise((_, reject) => { readyTimer = setTimeout(() => reject(new Error('AIChat engine did not become ready')), 30000); }),
    ]); } finally { clearTimeout(readyTimer); }
    const target = window.parent !== window ? window.parent : this.engineFrame?.contentWindow;
    const model = this.getModel();
    return this.request('tool:llm-request', { includeHistory: false, presentation: 'tool', ...(model ? { model } : {}), ...detail }, timeoutMs, target, options);
  }

  async listModels() {
    let timer;
    try {
      await Promise.race([this.engineReadyPromise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('AIChat 尚未就绪，请稍后重试')), 30000);
      })]);
    } finally { clearTimeout(timer); }
    const target = window.parent !== window ? window.parent : this.engineFrame?.contentWindow;
    const result = await this.request('tool:models:list', {}, 8000, target);
    return [...new Set((result.models || []).filter(model => typeof model === 'string' && model))];
  }

  async launchActivity(activity, slot, { signal } = {}) {
    signal?.throwIfAborted();
    let timer, abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(new DOMException('已取消', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
    });
    try {
      await Promise.race([this.engineReadyPromise, cancelled, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('AIChat 尚未就绪')), 30000);
      })]);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    signal?.throwIfAborted();
    const target = window.parent !== window ? window.parent : this.engineFrame?.contentWindow;
    if (!target) throw new Error('AIChat 尚未就绪');
    if (window.parent === window) {
      if (!this.agentLayoutSupported) throw new Error('当前 AIChat 版本不支持互动窗口，请更新 AIChat');
      this.showActivity(slot);
    }
    try {
      return await this.request('tool:host-command', {
        command: 'promptUserTool', args: activity,
        ...(this.workspaceId !== undefined ? { expectedWorkspaceId: this.workspaceId } : {}),
      }, 45000, target, { signal });
    } catch (error) { this.hideActivity(); throw error; }
  }

  showActivity(slot) {
    this.hideActivity();
    const frame = this.engineFrame;
    if (!frame || !slot) return;
    // Moving an iframe between DOM parents reloads its browsing context. Keep it
    // mounted in body and track the inline slot instead.
    frame.hidden = false; frame.tabIndex = 0; frame.removeAttribute('aria-hidden');
    frame.style.cssText = 'position:fixed;border:0;z-index:30;background:white;';
    const position = () => {
      const r = slot.getBoundingClientRect();
      let top = 0, left = 0, right = innerWidth, bottom = innerHeight;
      // The fixed iframe must still respect the lesson's scrolling feed and
      // composer boundaries, even though it cannot be reparented into that feed.
      for (let parent = slot.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      }
      frame.style.left = `${r.left}px`; frame.style.top = `${r.top}px`;
      frame.style.width = `${r.width}px`; frame.style.height = `${r.height}px`;
      frame.style.visibility = slot.isConnected && !slot.hidden ? 'visible' : 'hidden';
      frame.style.clipPath = `inset(${Math.max(0, top - r.top)}px ${Math.max(0, r.right - right)}px ${Math.max(0, r.bottom - bottom)}px ${Math.max(0, left - r.left)}px)`;
    };
    const observer = new ResizeObserver(position); observer.observe(slot);
    if (slot.parentElement) observer.observe(slot.parentElement);
    window.addEventListener('scroll', position, true); window.addEventListener('resize', position);
    this.activityCleanup = () => { observer.disconnect(); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); };
    position();
  }

  hideActivity() {
    this.activityCleanup?.(); this.activityCleanup = null;
    if (this.engineFrame) {
      this.engineFrame.hidden = true; this.engineFrame.tabIndex = -1;
      this.engineFrame.setAttribute('aria-hidden', 'true');
    }
  }

  async requestVoice(action) {
    if (action === 'start') {
      let timer;
      try {
        await Promise.race([this.engineReadyPromise, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('AIChat 语音尚未就绪，请稍后重试')), 30000);
        })]);
      } finally { clearTimeout(timer); }
    }
    const target = window.parent !== window ? window.parent : this.engineFrame?.contentWindow;
    const model = action === 'start' ? this.getVoiceModel() : '';
    const prompt = action === 'start'
      ? `You are Maya, the LanguageLearner learning partner for all subjects and ages 7–70. Use the current subject, prior knowledge, optional age and teaching language below. When discussionMode is socratic, ask one question about reasoning or evidence and wait rather than giving away the answer. Default to Chinese guidance; use English when practising English. Use the current lesson and exercise below. Keep replies to 1-3 short sentences with one question at a time. Do not ask which lesson to practise when one is active. Never read this context aloud or invent progress.
    Follow the school-teacher Voice/Observer division: Voice only speaks; the Observer owns navigation, lesson preparation and all app commands. Briefly acknowledge such requests, but do not call tools or duplicate its operations. Free talk is direct conversation like knowledge QA: answer the learner without waiting for notes or redirecting to an old lesson. Only a User request or explicit app confirmation changes mode. Guided lesson explanation follows the current step; exercises and roleplay wait for the learner's answer.
    Messages marked as observer or prefixed with Copilot小纸条： are private instructions, not learner input. Do not read aloud, quote, translate, summarize, or paraphrase the note's analysis, instructions or prefix. For 请说： notes, naturally speak only the filtered learner-facing content in the preferred teaching language, never its labels. Never speak JSON, YAML, Markdown, code, paths, URLs, field names, tool names, arguments or results. Ignore stale, duplicate or unnecessary notes; do not acknowledge a note or interrupt an ongoing interaction. Normal free talk requires no Observer commentary.
    ${JSON.stringify(this.getContext?.() || {})}`
      : '';
    return this.request('host:voice', { action, ...(model ? { model } : {}), ...(prompt ? { prompt } : {}) }, 45000, target);
  }

  setToken(token) {
    this.token = String(token || '');
    if (this.engineReady && this.engineFrame && this.lastEngineToken !== this.token) {
      this.lastEngineToken = this.token;
      this.post('host:auth-set', { token: this.token, reason: 'hellolearner-auth' }, this.engineFrame.contentWindow);
    }
  }

  async handleMessage(event) {
    const message = event.data;
    const fromParent = window.parent !== window && event.source === window.parent;
    const fromEngine = event.source === this.engineFrame?.contentWindow;
    if ((!fromParent && !fromEngine) || message?.channel !== CHANNEL) return;

    if (fromEngine && message.type === 'host:ready') {
      this.agentLayoutSupported = message.capabilities?.includes('agent-layout') === true;
      // A new engine document announces host:ready before its handshake.
      this.engineReady = false;
      this.lastEngineToken = undefined;
      this.post('host:init', {
        app: 'HelloLearner',
        config: { layout: 'agent', compact: true, hide: 'pet', chat: 'keep', persist: false, frontpage: 'hide', workspace: DEFAULT_WORKSPACE },
        capabilities: ['llm', 'voice', 'chat-io'],
      }, event.source);
      return;
    }
    if (fromEngine && message.type === 'tool:ready') {
      if (this.engineReady) return;
      this.engineReady = true;
      this.resolveEngineReady();
      this.announceReady(event.source);
      if (this.token) this.setToken(this.token);
      return;
    }

    if (message.requestId && this.pending.has(message.requestId)) {
      const pending = this.pending.get(message.requestId);
      if (event.source !== pending.target) return;
      if (message.type === 'host:llm-stream') {
        pending.onStream?.({ text: String(message.text || '') });
        return;
      }
      if (message.type === 'host:llm-tool-call') return;
      if (pending.type === 'tool:host-command' && message.type !== 'host:command-result') return;
      if (pending.type === 'tool:llm-request'
        && !['host:llm-result', 'host:llm-error'].includes(message.type)) return;
      clearTimeout(pending.timer);
      pending.cleanup?.();
      this.pending.delete(message.requestId);
      if (message.ok === false || message.type === 'host:llm-error') pending.reject(new Error(message.error || 'AIChat request failed'));
      else pending.resolve(message);
      return;
    }

    if (message.type === 'host:voice-changed' || message.type === 'host:chat-io') {
      this.onHostEvent(message);
      return;
    }
    if (message.type === 'host:get-tool-context' || message.type === 'host:tool-context-request') {
      this.post('tool:tool-context', { requestId: message.requestId || '', ok: true, context: JSON.stringify(this.getContext()) }, event.source);
      return;
    }
    if (message.type === 'host:tool-command') {
      await this.handleCommand(message, event.source);
      return;
    }
    if (!fromParent) return;
    if (message.type === 'host:prompt') {
      const id = String(message.requestId || '');
      this.post('tool:status', { requestId: id, status: 'busy', message: '正在处理请求' });
      try {
        await this.onHostEvent(message);
        this.post('tool:status', { requestId: id, status: 'done', message: '请求已在学习页面处理' });
      } catch (error) {
        this.post('tool:status', { requestId: id, status: 'error', message: error.message });
      }
      return;
    }
    if (message.type === 'host:init' || message.type === 'host:auth-set' || message.type === 'host:auth-changed'
      || message.type === 'host:voice-changed' || message.type === 'host:chat-io') {
      this.onHostEvent(message);
      if (message.type === 'host:init') {
        if (Object.hasOwn(message, 'workspace')) this.workspaceId = String(message.workspace?.id || '');
        this.engineReady = true;
        this.resolveEngineReady();
        this.announceReady();
      }
      return;
    }
  }

  async handleCommand(message, target = window.parent) {
    const id = String(message.requestId || '');
    const command = String(message.command || '');
    this.post('tool:status', { requestId: id, status: 'busy', message: `Running ${command}` }, target);
    try {
      if (!id) throw new Error('Missing requestId');
      if (!ALLOWED_COMMANDS.has(command)) throw new Error(`Unsupported command: ${command}`);
      const result = await this.executeCommand(COMMAND_ALIASES[command] || command, message.args || {});
      this.post('tool:tool-command-result', { requestId: id, ok: true, result }, target);
      this.post('tool:status', { requestId: id, status: 'done', message: 'Command completed' }, target);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.post('tool:tool-command-result', { requestId: id, ok: false, error: text }, target);
      this.post('tool:status', { requestId: id, status: 'error', message: text }, target);
    }
  }
}

export { ALLOWED_COMMANDS, COMMANDS, COMMAND_ALIASES };
