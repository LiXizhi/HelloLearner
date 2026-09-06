import { APP_ID, CHANNEL, DEFAULT_WORKSPACE } from './config.js';
import { requestId } from './utils.js';

const COMMAND_ALIASES = {
  open_lesson: 'openLesson',
  open_roleplay: 'openRoleplay',
  present_phrase: 'presentPhrase',
  refresh_learner_state: 'refreshLearnerState',
};
const ALLOWED_COMMANDS = new Set(['navigate', 'openLesson', 'openRoleplay', 'presentPhrase', 'refreshLearnerState', ...Object.keys(COMMAND_ALIASES)]);
const COMMANDS = [
  { name: 'navigate', description: 'Open a learner section.', parameters: { type: 'object', properties: { screen: { type: 'string', enum: ['learning', 'roleplay', 'progress', 'profile'] } }, required: ['screen'] } },
  { name: 'open_lesson', description: 'Open one curriculum lesson by ID.', parameters: { type: 'object', properties: { lessonId: { type: 'string' } }, required: ['lessonId'] } },
  { name: 'open_roleplay', description: 'Open one authored roleplay by ID.', parameters: { type: 'object', properties: { scenarioId: { type: 'string' } }, required: ['scenarioId'] } },
  { name: 'present_phrase', description: 'Speak a short English practice phrase.', parameters: { type: 'object', properties: { text: { type: 'string', maxLength: 240 } } } },
  { name: 'refresh_learner_state', description: 'Reload learner records from the current workspace.', readOnly: true, parameters: { type: 'object', properties: {} } },
];

export class AIChatBridge {
  constructor({ getContext, executeCommand, onHostEvent = () => {}, getVoiceModel = () => '', token = '' } = {}) {
    this.getContext = getContext;
    this.executeCommand = executeCommand;
    this.onHostEvent = onHostEvent;
    this.getVoiceModel = getVoiceModel;
    this.token = token;
    this.pending = new Map();
    this.hostReady = false;
    this.engineFrame = null;
    this.engineReady = false;
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
    const url = new URL('../AIChat/AIChat.html', location.href);
    url.searchParams.set('layout', 'thin');
    url.searchParams.set('compact', '1');
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

  announceReady() {
    this.post('tool:ready', {
      toolId: APP_ID,
      capabilities: ['tool-context', 'tool-commands', 'game-world-commands', 'workspace', 'llm', 'voice'],
      commands: COMMANDS,
    });
  }

  stop() {
    window.removeEventListener('message', this.handleMessage);
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error('AIChat bridge stopped'));
    });
    this.pending.clear();
    this.engineFrame?.remove();
    this.engineFrame = null;
  }

  post(type, detail = {}, target = window.parent) {
    target?.postMessage({ channel: CHANNEL, type, ...detail }, '*');
  }

  request(type, detail = {}, timeoutMs = 8000, target = window.parent) {
    if (!target || target === window) return Promise.reject(new Error('AIChat host is not available'));
    const id = requestId('learner');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`AIChat request timed out: ${type}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, target });
      this.post(type, { ...detail, requestId: id }, target);
    });
  }

  async requestLLM(detail, timeoutMs = 90000) {
    await Promise.race([
      this.engineReadyPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('AIChat engine did not become ready')), 30000)),
    ]);
    const target = window.parent !== window ? window.parent : this.engineFrame?.contentWindow;
    return this.request('tool:llm-request', { includeHistory: false, ...detail }, timeoutMs, target);
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
    const model = window.parent === window && action === 'start' ? this.getVoiceModel() : '';
    return this.request('host:voice', { action, ...(model ? { model } : {}) }, 45000, target);
  }

  setToken(token) {
    this.token = String(token || '');
    if (this.engineReady && this.engineFrame) {
      this.post('host:auth-set', { token: this.token, reason: 'hellolearner-auth' }, this.engineFrame.contentWindow);
    }
  }

  async handleMessage(event) {
    const message = event.data;
    const fromParent = window.parent !== window && event.source === window.parent;
    const fromEngine = event.source === this.engineFrame?.contentWindow;
    if ((!fromParent && !fromEngine) || message?.channel !== CHANNEL) return;

    if (fromEngine && message.type === 'host:ready') {
      this.post('host:init', {
        app: 'HelloLearner',
        config: { layout: 'thin', compact: true, chat: 'keep', persist: false, frontpage: 'hide', workspace: DEFAULT_WORKSPACE },
        capabilities: ['llm', 'voice', 'chat-io'],
      }, event.source);
      return;
    }
    if (fromEngine && message.type === 'tool:ready') {
      this.engineReady = true;
      this.resolveEngineReady();
      if (this.token) this.setToken(this.token);
      return;
    }

    if (message.requestId && this.pending.has(message.requestId)) {
      const pending = this.pending.get(message.requestId);
      if (event.source !== pending.target) return;
      if (message.type === 'host:llm-stream') return;
      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      if (message.ok === false || message.type === 'host:llm-error') pending.reject(new Error(message.error || 'AIChat request failed'));
      else pending.resolve(message);
      return;
    }

    if (message.type === 'host:voice-changed' || message.type === 'host:chat-io') {
      this.onHostEvent(message);
      return;
    }
    if (!fromParent) return;
    if (message.type === 'host:init' || message.type === 'host:auth-set' || message.type === 'host:auth-changed'
      || message.type === 'host:voice-changed' || message.type === 'host:chat-io') {
      this.onHostEvent(message);
      if (message.type === 'host:init') {
        this.engineReady = true;
        this.resolveEngineReady();
        this.announceReady();
      }
      return;
    }
    if (message.type === 'host:get-tool-context' || message.type === 'host:tool-context-request') {
      this.post('tool:tool-context', { requestId: message.requestId || '', ok: true, context: JSON.stringify(this.getContext()) });
      return;
    }
    if (message.type === 'host:tool-command') await this.handleCommand(message);
  }

  async handleCommand(message) {
    const id = String(message.requestId || '');
    const command = String(message.command || '');
    this.post('tool:status', { requestId: id, status: 'busy', message: `Running ${command}` });
    try {
      if (!id) throw new Error('Missing requestId');
      if (!ALLOWED_COMMANDS.has(command)) throw new Error(`Unsupported command: ${command}`);
      const result = await this.executeCommand(COMMAND_ALIASES[command] || command, message.args || {});
      this.post('tool:tool-command-result', { requestId: id, ok: true, result });
      this.post('tool:status', { requestId: id, status: 'done', message: 'Command completed' });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.post('tool:tool-command-result', { requestId: id, ok: false, error: text });
      this.post('tool:status', { requestId: id, status: 'error', message: text });
    }
  }
}

export { ALLOWED_COMMANDS, COMMANDS, COMMAND_ALIASES };
