import { createVoiceHistory } from './view_voice_history.js?v=20260906p';
// AIChat owns the digital-human session, ASR, replies and audio playback.
export function initLiveVoice({ bridge, cancelSpeech, onError, micSelector = '#roomMic', labelSelector = '#roomMicLabel', roomSelector = '#introPracticeRoom', anchorSelector = 'footer' }) {
  const mic = document.querySelector(micSelector);
  const label = document.querySelector(labelSelector);
  const room = document.querySelector(roomSelector);
  const history = createVoiceHistory(document.querySelector('#dialogueHistory'), document.querySelector('#practiceChatFeed'));
  let wanted = false;
  let active = false;
  let starting = null;
  let stopping = null;
  let intent = 0;
  let cancelGreeting = null;

  function render(state = 'idle') {
    mic.classList.toggle('listening', wanted && active);
    mic.setAttribute('aria-pressed', String(wanted));
    mic.setAttribute('aria-label', wanted ? '停止对话' : '开始对话');
    mic.querySelector('span').textContent = wanted ? '■' : '●';
    label.setAttribute('data-voice-state', state);
    const labels = {
      starting: '正在连接语音…点击可取消',
      listening: '聆听中',
      thinking: '思考中',
      speaking: 'Maya 正在说话',
      stopping: '正在结束对话…',
      idle: '点击开始对话 · 无需按住',
    };
    label.textContent = labels[state] || labels.listening;
  }

  async function stop() {
    intent++;
    if (cancelGreeting) {
      cancelGreeting();
      cancelSpeech();
    }
    const hadSession = wanted || active || starting;
    wanted = false;
    render(hadSession ? 'stopping' : 'idle');
    if (!hadSession) return;
    if (stopping) return stopping;
    stopping = (async () => {
      // A pending start must finish before the final stop, preventing a late
      // connection from reopening the microphone after closing the room.
      try {
        if (starting) await starting.catch(() => {});
        await bridge.requestVoice('stop');
        active = false;
        render();
      } catch (error) {
        wanted = active = true;
        render('listening');
        label.textContent = '结束语音失败 · 请再次点击停止';
        onError(error.message);
      } finally { stopping = null; }
    })();
    return stopping;
  }

  async function toggle() {
    if (stopping) return;
    if (wanted || active) return stop();
    return start();
  }

  async function start({ beforeStart } = {}) {
    const request = ++intent;
    if (stopping) await stopping;
    if (request !== intent || room.hidden || wanted || active) return;
    wanted = true;
    cancelSpeech();
    render('starting');
    starting = (async () => {
      if (beforeStart) {
        label.textContent = 'Maya 正在说话';
        const cancelled = new Promise(resolve => { cancelGreeting = resolve; });
        try { await Promise.race([beforeStart(), cancelled]); } catch { /* Speech failure must not block conversation. */ }
        finally { cancelGreeting = null; }
      }
      if (request !== intent || room.hidden || !wanted) return { active: false };
      render('starting');
      return bridge.requestVoice('start');
    })();
    try {
      const result = await starting;
      active = result.active !== false;
      if (wanted) render(result.state || 'listening');
    } catch (error) {
      if (wanted) {
        wanted = active = false;
        render();
        label.textContent = '实时语音未连接 · 请检查 AIChat 语音模型，或使用输入';
        onError(error.message);
        // Also stop a host connection that completes after a request timeout.
        void bridge.requestVoice('stop').catch(() => {});
      }
    } finally { starting = null; }
  }

  function handleEvent(message) {
    if (!wanted || stopping) return;
    if (message.type === 'host:voice-changed') {
      active = !!message.active;
      if (message.state === 'idle' || message.state === 'error') wanted = false;
      if (wanted) render(message.state);
      else if (!stopping) render();
      return;
    }
    if (message.type !== 'host:chat-io' || message.source !== 'voice'
      || !['user', 'assistant'].includes(message.role)) return;
    history.update(message);
  }

  room.addEventListener('close', () => {
    void stop();
    history.clear();
  });
  return { start, toggle, stop, handleEvent, get active() { return wanted || active; } };
}
