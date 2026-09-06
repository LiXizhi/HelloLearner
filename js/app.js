import { runtimeConfig, SDK_CDN_URL } from './config.js';
import { updateState, getState, subscribe } from './state.js';
import { KeepworkAuth } from './auth.js';
import { AIChatBridge } from './aichat-bridge.js?v=20260906j';
import { initLiveVoice } from './view_live_voice.js?v=20260906p';
import { LearnerStorage, createEmbeddedBackend, createStandaloneBackend } from './storage.js?v=20260905c';
import { SpeechController } from './speech.js?v=20260905r';
import { AvatarController } from './avatar.js?v=20260906a';
import { applyLearnerProjections, renderShell } from './view_shell.js?v=20260905c';
import { openProfileSetup } from './view_profile_setup.js?v=20260905b';
import { initAvatarSelector } from './view_select_avartar.js?v=20260905n';
import { $, todayKey } from './utils.js';
import { loadLessonPack } from './lesson-pack.js?v=20260905b';
import { appendFeedback } from './feedback.js?v=20260905a';
import { loadRoleplayCatalog } from './roleplay-catalog.js?v=20260905a';

let sdk = null;
let auth = null;
let bridge = null;
let storage = null;
let avatar = null;
let standalonePersistent = false;
let speechStartedAt = 0;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}

// Dynamic import via new Function so Vite does not try to resolve/bundle the
// local keepworkSDK dev server URL at build time.
function importRuntimeModule(src) {
  return new Function('src', 'return import(src)')(src);
}

async function ensureSDK() {
  if (window.KeepworkSDK) {
    sdk = new window.KeepworkSDK({ timeout: 30000, ...(runtimeConfig.token ? { token: runtimeConfig.token } : {}) });
    window.sdk = sdk;
    return sdk;
  }
  const host = window.location.hostname;
  const isLocalHost = host === '127.0.0.1' || host === 'localhost';
  const useLocalIndex = isLocalHost && !window.location.pathname.includes('/dist/');
  try {
    if (useLocalIndex) {
      await importRuntimeModule('http://127.0.0.1:5001/index.ts');
    } else {
      await loadScript(SDK_CDN_URL);
    }
  } catch (err) {
    if (useLocalIndex) {
      console.warn('Local KeepworkSDK import failed, fallback to CDN:', err);
      await loadScript(SDK_CDN_URL);
    } else {
      throw err;
    }
  }
  sdk = new window.KeepworkSDK({ timeout: 30000, ...(runtimeConfig.token ? { token: runtimeConfig.token } : {}) });
  window.sdk = sdk;
  return sdk;
}

function getBoundedContext() {
  const state = getState();
  const runtime = window.helloLearnerRuntime?.getContext?.() || {};
  return {
    app: 'LanguageLearner',
    screen: state.screen,
    learnerLevel: state.profile?.englishLevel || 'A1',
    activeLessonId: runtime.activeLessonId ?? state.activeLessonId ?? '',
    activeLessonTitle: runtime.activeLessonTitle || '',
    activeScenarioId: runtime.activeScenarioId ?? state.activeScenarioId ?? '',
    exercise: runtime.exercise || state.exercise || '',
    goalIndex: Number(runtime.goalIndex || 0),
    speaking: state.speaking,
    completedLessonCount: Object.keys(state.progress?.completedLessons || {}).length,
    completedRoleplayCount: Object.keys(state.progress?.roleplayOutcomes || {}).length,
  };
}

async function executeCommand(command, args) {
  const runtime = window.helloLearnerRuntime;
  if (!runtime) throw new Error('Learner runtime is not ready');
  if (command === 'navigate') {
    if (!['learning', 'roleplay', 'progress', 'profile'].includes(args.screen)) throw new Error('Invalid screen');
    runtime.navigate(args.screen);
  } else if (command === 'openLesson') {
    runtime.openLessonById(String(args.lessonId || ''));
  } else if (command === 'openRoleplay') {
    runtime.openRoleplayById(String(args.scenarioId || ''));
  } else if (command === 'presentPhrase') {
    const text = String(args.text || getBoundedContext().activeLessonTitle || '').trim().slice(0, 240);
    if (!text) throw new Error('Phrase is required');
    await window.helloLearnerSpeech.speak(text, { language: 'en-US', rate: 0.82 });
  } else if (command === 'refreshLearnerState') {
    const records = await storage.load();
    updateState(records);
    applyLearnerProjections(records);
  }
  return getBoundedContext();
}

function createMemoryBackend() {
  const files = new Map();
  return { kind: 'memory', read: async (path) => files.get(path) || '', write: async (path, content) => files.set(path, content) };
}

function bindLearnerEvents() {
  addEventListener('hellolearner:feedback', event => {
    if (!getState().auth.loggedIn) return;
    const progress = storage.update('progress', current => ({ feedback: appendFeedback(current.feedback, event.detail) }));
    updateState({ progress });
    applyLearnerProjections(storage.records);
  });
  addEventListener('hellolearner:screen', (event) => updateState({
    screen: event.detail.screen || getState().screen,
    activeLessonId: event.detail.lessonId || getState().activeLessonId,
    activeScenarioId: event.detail.scenarioId || getState().activeScenarioId,
  }));
  addEventListener('hellolearner:profile-save', (event) => {
    if (!getState().auth.loggedIn) return auth.login().catch((error) => showNotice(error.message));
    const profile = storage.update('profile', event.detail);
    updateState({ profile });
    applyLearnerProjections(storage.records);
  });
  addEventListener('hellolearner:setting', (event) => {
    if (!getState().auth.loggedIn) return auth.login().catch((error) => showNotice(error.message));
    const profile = storage.update('profile', event.detail);
    updateState({ profile });
  });
  addEventListener('hellolearner:lesson-complete', (event) => {
    if (!getState().auth.loggedIn) return auth.login().catch((error) => showNotice(error.message));
    const { lessonId, turns, vocabulary = [] } = event.detail;
    const exposureAt = new Date().toISOString();
    storage.update('progress', (progress) => ({
      lessonAttempts: { ...(progress.lessonAttempts || {}), [lessonId]: Number(progress.lessonAttempts?.[lessonId] || 0) + 1 },
      completedLessons: { ...(progress.completedLessons || {}), [lessonId]: { completedAt: new Date().toISOString(), turns } },
      vocabularyExposure: {
        ...(progress.vocabularyExposure || {}),
        ...Object.fromEntries(vocabulary.map((word) => [word, { lastSeenAt: exposureAt, lessonId }])),
      },
    }));
    storage.recordActivity({ type: 'lesson', id: lessonId, turns });
    updateState({ progress: storage.records.progress });
    applyLearnerProjections(storage.records);
  });
  addEventListener('hellolearner:roleplay-complete', (event) => {
    if (!getState().auth.loggedIn) return auth.login().catch((error) => showNotice(error.message));
    const { scenarioId, turns } = event.detail;
    storage.update('progress', (progress) => ({ roleplayOutcomes: { ...(progress.roleplayOutcomes || {}), [scenarioId]: { completedAt: new Date().toISOString(), turns } } }));
    storage.recordActivity({ type: 'roleplay', id: scenarioId, turns });
    updateState({ progress: storage.records.progress });
    applyLearnerProjections(storage.records);
  });
}

function showNotice(message) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

async function bootstrap() {
  avatar = new AvatarController($('avatarStage'), $('live2dCanvas'), { closeUp: true });
  const avatarReady = avatar.initialize();
  window.HELLO_LEARNER_ROLEPLAYS = await loadRoleplayCatalog();
  updateState({ phase: 'sdk-loading', embedded: runtimeConfig.embedded });
  await ensureSDK();
  auth = new KeepworkAuth(sdk, { embedded: runtimeConfig.embedded });
  bridge = new AIChatBridge({
    getContext: getBoundedContext,
    executeCommand,
    getVoiceModel: () => {
      const live = sdk.apiKeySettings?.listLiveAPIs?.()?.[0];
      return live?.name || live?.id || '';
    },
    token: sdk.token || runtimeConfig.token,
    onHostEvent(message) {
      window.helloLearnerLiveVoice?.handleEvent(message);
      if (message.type === 'host:voice-changed') {
        const speaking = message.state === 'speaking';
        avatar?.setSpeaking(speaking);
      }
      if (message.type === 'host:chat-io' && message.source === 'voice' && message.role === 'assistant' && message.messageType !== 'observer') {
        const speaking = message.phase !== 'done' && message.phase !== 'error';
        avatar?.setSpeaking(speaking);
      }
    },
  });
  bridge.start();
  window.helloLearnerAI = bridge;

  const initialAuth = await auth.initialize();
  updateState({ auth: initialAuth });
  auth.subscribe(async (nextAuth) => {
    updateState({ auth: nextAuth });
    bridge.setToken(sdk.token || runtimeConfig.token);
    if (!runtimeConfig.embedded && !nextAuth.loggedIn && standalonePersistent) {
      standalonePersistent = false;
      storage?.dispose();
      storage = new LearnerStorage(createMemoryBackend(), {
        onStatus: (saveStatus, saveMessage) => updateState({ saveStatus, saveMessage }),
      });
      const anonymousRecords = await storage.load();
      updateState(anonymousRecords);
      applyLearnerProjections(anonymousRecords);
    }
    if (!runtimeConfig.embedded && nextAuth.loggedIn && !standalonePersistent && sdk.personalPageStore?.withWorkspace) {
      standalonePersistent = true;
      storage = new LearnerStorage(createStandaloneBackend(sdk.personalPageStore.withWorkspace(runtimeConfig.workspace)), {
        onStatus: (saveStatus, saveMessage) => updateState({ saveStatus, saveMessage }),
      });
      const persistedRecords = await storage.load();
      updateState(persistedRecords);
      applyLearnerProjections(persistedRecords);
      if (!persistedRecords.profile.displayName) openProfileSetup({ ...persistedRecords.profile, displayName: nextAuth.displayName });
    }
  });

  let backend = createMemoryBackend();
  if (runtimeConfig.embedded) backend = createEmbeddedBackend(bridge);
  else if (initialAuth.loggedIn && sdk.personalPageStore?.withWorkspace) {
    standalonePersistent = true;
    backend = createStandaloneBackend(sdk.personalPageStore.withWorkspace(runtimeConfig.workspace));
  }
  storage = new LearnerStorage(backend, { onStatus: (saveStatus, saveMessage) => updateState({ saveStatus, saveMessage }) });
  const saveStatus = $('saveStatus');
  saveStatus.setAttribute('role', 'button');
  saveStatus.tabIndex = 0;
  saveStatus.title = '重试保存';
  const retrySave = () => {
    if (!getState().auth.loggedIn || getState().saveStatus !== 'error') return;
    storage.retryFailed();
  };
  saveStatus.addEventListener('click', retrySave);
  saveStatus.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); retrySave(); }
  });
  const records = await storage.load();
  updateState({ ...records, phase: 'ready' });

  const speech = new SpeechController({
    sdk,
    onState({ speaking }) {
      updateState({ speaking });
      avatar?.setSpeaking(speaking);
      if (speaking) {
        speechStartedAt = performance.now();
      } else if (speechStartedAt && getState().auth.loggedIn) {
        const elapsedMinutes = Math.max(0, (performance.now() - speechStartedAt) / 60000);
        speechStartedAt = 0;
        const date = todayKey();
        const progress = storage.update('progress', (current) => ({
          speakingMinutesByDate: {
            ...(current.speakingMinutesByDate || {}),
            [date]: Number(current.speakingMinutesByDate?.[date] || 0) + elapsedMinutes,
          },
        }));
        updateState({ progress });
        applyLearnerProjections(storage.records);
      }
    },
  });
  window.helloLearnerSpeech = speech;
  window.helloLearnerLiveVoice = initLiveVoice({
    bridge,
    cancelSpeech: () => speech.cancel(),
    onError: showNotice,
  });
  await avatarReady;
  window.helloLearnerAvatar = avatar;
  window.helloLearnerMountPracticeAvatar = () => avatar.setTarget($('practiceAvatarStage'), { closeUp: true });
  window.helloLearnerUnmountPracticeAvatar = () => avatar.setTarget($('avatarStage'), { closeUp: true });
  await initAvatarSelector({ button: $('chooseCoach'), avatar, speech, sdk, showNotice });
  bindLearnerEvents();
  const lessonPackPath = new URLSearchParams(location.search).get('lessonPack');
  if (lessonPackPath) {
    try {
      window.HELLO_LEARNER_CURRICULUM = await loadLessonPack(lessonPackPath, location.href);
      window.HELLO_LEARNER_CURRICULUM.premade = true;
    } catch (error) {
      console.warn('Lesson pack rejected:', error.message);
      alert(`课程包加载失败，保留内置课程。\n${error.message}`);
    }
  }
  await import('./learner-runtime.js?v=20260906p');
  applyLearnerProjections(records);
  if (initialAuth.loggedIn && !records.profile.displayName) openProfileSetup({ ...records.profile, displayName: initialAuth.displayName }, { dismissible: false });

  subscribe((state) => renderShell(state, {
    onLogin: () => auth.login().catch((error) => showNotice(error.message)),
    onProfile: () => auth.showProfile(),
    onSettings: () => openProfileSetup(getState().profile || {}),
    onLogout: () => auth.logout(),
  }));
  postMessageToOuter({ type: 'gameLoaded', app: 'HelloLearner' });
}

function postMessageToOuter(message) {
  if (window.parent !== window) window.parent.postMessage(message, '*');
}

addEventListener('beforeunload', () => {
  if (window.helloLearnerLiveVoice?.active) {
    const target = window.parent !== window ? window.parent : bridge?.engineFrame?.contentWindow;
    bridge?.post('host:voice', { action: 'stop' }, target);
  }
  bridge?.stop();
  avatar?.destroy();
  window.helloLearnerSpeech?.destroy?.();
});

bootstrap().catch((error) => {
  console.error('[HelloLearner] bootstrap failed', error);
  updateState({ phase: 'error', saveStatus: 'error', saveMessage: '载入失败，请刷新重试' });
  showNotice('HelloLearner 载入失败，请检查网络后重试');
});
