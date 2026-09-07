import { runtimeConfig, SDK_CDN_URL, sanitizeWorkspace } from './config.js';
import { PlanStore } from './plan-store.js?v=20260907c';
import { LessonPlanner } from './lesson-planner.js?v=20260907c';
import { mountLessonPlans } from './view_lesson_plans.js?v=20260907k';
import { updateState, getState, subscribe } from './state.js';
import { KeepworkAuth } from './auth.js?v=20260907g';
import { AIChatBridge } from './aichat-bridge.js?v=20260907i';
import { initLiveVoice } from './view_live_voice.js?v=20260906p';
import { LearnerStorage, createEmbeddedBackend, createStandaloneBackend } from './storage.js?v=20260907c';
import { SpeechController } from './speech.js?v=20260905r';
import { AvatarController } from './avatar.js?v=20260906a';
import { applyLearnerProjections, renderShell } from './view_shell.js?v=20260907h';
import { openSystemSettings } from './view_system_settings.js?v=20260907d';
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
let planUI = null, planner = null, hostWorkspace = null, routingPlan = false;
const planStores = new Map();

function lessonWorkspaceName() {
  return runtimeConfig.embedded ? hostWorkspace?.name || hostWorkspace?.workspace || 'AIChat 当前绑定空间'
    : sanitizeWorkspace(getState().settings?.lessonWorkspace || runtimeConfig.workspace);
}
function currentPlanStore() {
  const loggedIn = getState().auth.loggedIn;
  const name = lessonWorkspaceName();
  const key = `${loggedIn ? 'user' : 'anonymous'}:${runtimeConfig.embedded ? hostWorkspace?.id || 'unbound' : name}`;
  if (!planStores.has(key)) {
    let backend = createMemoryBackend();
    if (runtimeConfig.embedded) {
      const expectedWorkspaceId = hostWorkspace?.id || '';
      const request = async (type, detail) => {
        if (!expectedWorkspaceId) throw new Error('请先在 AIChat 绑定工作空间');
        return bridge.request(type, { ...detail, expectedWorkspaceId });
      };
      backend = { kind: 'aichat-workspace',
        read: async path => String((await request('tool:workspace:read', { path })).content || ''),
        write: (path, content) => request('tool:workspace:write', { path, content }),
        list: async path => (await request('tool:workspace:list', { path })).entries || [] };
    } else if (loggedIn && sdk.personalPageStore?.withWorkspace) backend = createStandaloneBackend(sdk.personalPageStore.withWorkspace(name));
    planStores.set(key, new PlanStore(backend));
  }
  return planStores.get(key);
}
async function requirePlanLogin(store) {
  if (!getState().auth.loggedIn) {
    const result = await auth.login();
    if (!result.loggedIn) throw new Error('请登录后保存，计划草稿仍在本页');
    return currentPlanStore();
  }
  return store.backend.kind === 'memory' ? currentPlanStore() : store;
}
async function routePlanRequest(text) {
  if (!planner || !planUI) return false;
  if (routingPlan) return true;
  // Avoid an extra model round on ordinary exercise answers. The model confirms ambiguous candidates.
  if (!/计划|课程|课表|规划|学习安排|\b(plan|course|curriculum|syllabus|lessons)\b/i.test(text)) return false;
  routingPlan = true;
  try {
    const action = await planner.intent(text);
    if (action === 'create') { await planUI.start(text); return true; }
    if (action === 'list') { await planUI.library(); return true; }
    return false;
  } catch {
    const input = document.querySelector('#practiceTextInput');
    if (input) input.value = text;
    showNotice('暂时无法识别规划请求，请重试或点击“学习计划”');
    return true;
  } finally { routingPlan = false; }
}

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
  const runtime = state.planContext || window.helloLearnerRuntime?.getContext?.() || {};
  return {
    app: 'LanguageLearner',
    screen: runtime.screen || state.screen,
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
  if (['startLessonPlan', 'listLessonPlans', 'openLessonPlan', 'openPlanLesson'].includes(command)) {
    if (!planUI) throw new Error('Lesson planner is not ready');
    if (command === 'startLessonPlan') return planUI.start(String(args.request || '').slice(0, 2000));
    if (command === 'listLessonPlans') {
      const result = await currentPlanStore().list(args);
      await planUI.library();
      return result;
    }
    const plan = await currentPlanStore().get(String(args.planId || ''));
    if (command === 'openLessonPlan') {
      void planUI.showPlan(plan.id).catch(error => showNotice(error.message));
    } else {
      if (!plan.lessons.some(l => l.id === args.lessonId)) throw new Error('Unknown plan lesson');
      void planUI.openLesson(plan.id, args.lessonId).catch(error => showNotice(error.message));
    }
    return { accepted: true, planId: plan.id, message: '已打开课程页面；准备状态将在页面显示。' };
  }
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
  updateState({ phase: 'sdk-loading', embedded: runtimeConfig.embedded });
  await ensureSDK();
  auth = new KeepworkAuth(sdk, { embedded: runtimeConfig.embedded });
  subscribe((state) => renderShell(state, {
    onLogin: () => auth.login().catch((error) => showNotice(error.message)),
    onProfile: () => auth.showProfile(),
    onSettings: () => openProfileSetup(getState().profile || {}),
    onSystemSettings: () => openSystemSettings({
      embedded: runtimeConfig.embedded,
      lessonWorkspace: lessonWorkspaceName(),
      settings: getState().settings,
      loggedIn: getState().auth.loggedIn,
      listModels: () => bridge.listModels(),
      listVoiceModels: () => {
        const provider = sdk.localAPIKeySettings?.listLiveAPIs ? sdk.localAPIKeySettings : sdk.apiKeySettings;
        return [...new Set((provider?.listLiveAPIs?.() || []).map(live => live.name || live.id).filter(Boolean))];
      },
      onSave: async (selection, { createWorkspace = false } = {}) => {
        if (!runtimeConfig.embedded && selection.lessonWorkspace !== lessonWorkspaceName()) {
          planUI?.cancel();
          const previous = currentPlanStore();
          await previous.drain();
          if (previous.failed.size) {
            await previous.retry();
            if (previous.failed.size) throw new Error('原空间还有未保存内容，请重试后切换');
          }
        }
        if (createWorkspace && !runtimeConfig.embedded) {
          if (!getState().auth.loggedIn) await auth.login();
          if (!getState().auth.loggedIn) throw new Error('请登录后创建云端工作空间，输入内容已保留');
          const workspace = sdk.personalPageStore?.withWorkspace(selection.lessonWorkspace);
          if (!workspace) throw new Error('工作空间服务不可用，请重试');
          // A private marker creates the cloud folder without replacing existing documents or plans.
          const marker = '.hellolearner/workspace.json';
          if (!await workspace.readFile(marker)) {
            await workspace.createFile(marker, JSON.stringify({ schemaVersion: 1,
              name: selection.lessonWorkspace, createdAt: new Date().toISOString() }, null, 2));
          }
        }
        const settings = getState().auth.loggedIn
          ? storage.update('settings', selection)
          : { ...getState().settings, ...selection };
        updateState({ settings });
        planUI?.invalidate();
        showNotice(getState().auth.loggedIn ? '系统设置已更新' : '系统设置已应用于本次使用');
      },
    }),
    onLogout: () => auth.logout(),
  }));
  bridge = new AIChatBridge({
    getContext: getBoundedContext,
    executeCommand,
    getModel: () => getState().settings?.model || '',
    getVoiceModel: () => {
      const selected = getState().settings?.voiceModel;
      if (selected) return selected;
      if (runtimeConfig.embedded) return '';
      const live = sdk.apiKeySettings?.listLiveAPIs?.()?.[0];
      return live?.name || live?.id || '';
    },
    token: sdk.token || runtimeConfig.token,
    async onHostEvent(message) {
      if (message.type === 'host:prompt') {
        const text = String(message.text || message.prompt || '').trim().slice(0, 2000);
        if (!text) throw new Error('请输入学习目标');
        if (await routePlanRequest(text)) return;
        if (planUI?.isOpen) return planUI.handlePrompt(text);
        return window.helloLearnerRuntime?.submitText?.(text);
      }
      if (message.type === 'host:init' && Object.hasOwn(message, 'workspace')) {
        const changed = String(hostWorkspace?.id || '') !== String(message.workspace?.id || '');
        hostWorkspace = message.workspace;
        if (changed) planUI?.invalidate();
      }
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
  if (runtimeConfig.embedded) bridge.start();
  window.helloLearnerAI = bridge;

  const initialAuth = await auth.initialize();
  updateState({ auth: initialAuth });
  window.HELLO_LEARNER_ROLEPLAYS = await loadRoleplayCatalog();
  auth.subscribe(async (nextAuth) => {
    if (getState().auth.loggedIn && !nextAuth.loggedIn) { planUI?.invalidate(); planStores.clear(); }
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
  const avatarReady = avatar.initialize();

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
    onPlanContext: context => updateState({ planContext: context }),
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
  await import('./learner-runtime.js?v=20260907c');
  planner = new LessonPlanner(bridge, getState);
  window.helloLearnerPlanRequest = routePlanRequest;
  const restorePlanAvatar = () => {
    const room = $('introPracticeRoom');
    avatar.setTarget(room && !room.hidden ? $('practiceAvatarStage') : $('avatarStage'), { closeUp: true });
  };
  planUI = mountLessonPlans({
    planner, bridge, getStore: currentPlanStore, getWorkspace: lessonWorkspaceName,
    pause: async () => {
      window.helloLearnerRuntime?.pauseForPlanner?.();
      try { await window.helloLearnerLiveVoice?.stop(); } catch { showNotice('语音连接未能正常结束，可继续使用文字规划'); }
      speech.cancel();
    },
    resume: () => window.helloLearnerRuntime?.resumeAfterPlanner?.(),
    speak: text => speech.speak(text, { language: 'en-US', rate: 0.84 }),
    cancelSpeech: () => speech.cancel(),
    onAvatar: target => avatar.setTarget(target, { closeUp: true }), restoreAvatar: restorePlanAvatar,
    route: routePlanRequest,
    getCurriculum: () => ({ ...window.HELLO_LEARNER_CURRICULUM, completed: getState().progress?.completedLessons || {} }),
    openCurriculumLesson: id => window.helloLearnerRuntime.openLessonById(id),
    savePlan: async (store, plan) => (await requirePlanLogin(store)).savePlan(plan),
    saveLesson: async (store, plan, outline, lesson) => (await requirePlanLogin(store)).saveLesson(plan, outline, lesson),
    checkpoint: async (store, plan, lesson, detail) => {
      if (!getState().auth.loggedIn) throw new Error('请登录后保存学习进度');
      const result = await store.checkpoint(plan, lesson, detail);
      dispatchEvent(new CustomEvent('hellolearner:plan-step', { detail: { planId: plan.id, lessonId: lesson.id, stepId: detail.stepId, completed: detail.completed } }));
      return result;
    },
  });
  void planUI.refreshHome();
  applyLearnerProjections(records);
  if (initialAuth.loggedIn && !records.profile.displayName) openProfileSetup({ ...records.profile, displayName: initialAuth.displayName }, { dismissible: false });


  if (!runtimeConfig.embedded) {
    // Let the authenticated learner view paint before the hidden AI engine
    // starts its SDK/network/UI work. Embedded mode needs its bridge earlier
    // to read learner records from the host workspace.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    bridge.setToken(sdk.token || '');
    bridge.start();
  }
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
