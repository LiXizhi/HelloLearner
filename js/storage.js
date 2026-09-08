import { DATA_ROOT, SCHEMA_VERSION } from './config.js';
import { safeJsonParse, todayKey } from './utils.js';

export const RECORD_PATHS = Object.freeze({
  profile: `${DATA_ROOT}/profile.json`,
  progress: `${DATA_ROOT}/progress.json`,
  settings: `${DATA_ROOT}/settings.json`,
});

export function createDefaultRecords() {
  return {
    profile: {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: '',
      displayName: '',
      avatar: '',
      age: null,
      interests: [],
      teachingLanguage: 'zh-CN',
      englishLevel: 'A1',
      goals: ['日常交流'],
      dailyTargetMinutes: 10,
      nativeLanguageMode: true,
    },
    progress: {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: '',
      lessonAttempts: {},
      completedLessons: {},
      roleplayOutcomes: {},
      vocabularyExposure: {},
      speakingMinutesByDate: {},
      activityDates: [],
      recentActivity: [],
    },
    settings: {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: '',
      voiceName: '',
      model: '',
      coursewareModel: 'keepwork-pro',
      voiceModel: '',
      lessonWorkspace: '',
      recentLessonWorkspaces: [],
      speechRate: 0.84,
      locale: 'en-US',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    },
  };
}

function mergeRecord(defaultValue, storedValue) {
  const stored = storedValue && typeof storedValue === 'object' ? storedValue : {};
  const merged = { ...defaultValue, ...stored };
  for (const [key, value] of Object.entries(defaultValue)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeRecord(value, stored[key] && !Array.isArray(stored[key]) ? stored[key] : {});
    }
  }
  return merged;
}

function parseRecord(text, defaultValue) {
  if (!text) return { value: defaultValue, corrupt: false };
  const marker = {};
  const parsed = safeJsonParse(text, marker);
  return parsed === marker || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    ? { value: defaultValue, corrupt: true }
    : { value: { ...mergeRecord(defaultValue, parsed), schemaVersion: SCHEMA_VERSION }, corrupt: false };
}

export function createStandaloneBackend(store) {
  return {
    kind: 'personal-page-store',
    async read(path) {
      return String(await store.readFile(path) || '');
    },
    async write(path, content) {
      await store.createFile(path, content);
    },
  };
}

export function createEmbeddedBackend(bridge) {
  return {
    kind: 'aichat-workspace',
    async read(path) {
      const result = await bridge.request('tool:workspace:read', { path });
      return String(result.content || '');
    },
    async write(path, content) {
      await bridge.request('tool:workspace:write', { path, content });
    },
  };
}

export class LearnerStorage {
  constructor(backend, { onStatus = () => {} } = {}) {
    this.backend = backend;
    this.onStatus = onStatus;
    this.records = createDefaultRecords();
    this.queue = Promise.resolve();
    this.timers = new Map();
    this.disposed = false;
    this.failedWrites = new Set();
  }

  async load() {
    const defaults = createDefaultRecords();
    const corrupt = [];
    const unavailable = [];
    for (const name of Object.keys(RECORD_PATHS)) {
      let text = '';
      try { text = await this.backend.read(RECORD_PATHS[name]); }
      catch { unavailable.push(RECORD_PATHS[name]); }
      const result = parseRecord(text, defaults[name]);
      this.records[name] = result.value;
      if (result.corrupt) corrupt.push(RECORD_PATHS[name]);
    }
    const status = unavailable.length || corrupt.length ? 'warning' : 'saved';
    const message = unavailable.length
      ? '当前工作空间不可用，学习内容暂存本页'
      : corrupt.length ? '部分档案损坏，已使用安全默认值' : this.backend.kind === 'memory' ? '未登录，档案仅保留在本页' : '学习档案已同步';
    this.onStatus(status, message);
    return this.records;
  }

  update(name, patch, { immediate = false } = {}) {
    const previous = this.records[name];
    if (!previous) throw new Error(`Unknown learner record: ${name}`);
    const nextPatch = typeof patch === 'function' ? patch(previous) : patch;
    this.records[name] = { ...previous, ...nextPatch, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
    this.schedule(name, immediate ? 0 : 450);
    return this.records[name];
  }

  schedule(name, delay) {
    clearTimeout(this.timers.get(name));
    this.onStatus('saving', '正在保存学习进度');
    this.timers.set(name, setTimeout(() => this.flush(name), delay));
  }

  flush(name) {
    clearTimeout(this.timers.get(name));
    this.timers.delete(name);
    this.queue = this.queue.then(async () => {
      if (this.disposed) return;
      await this.backend.write(RECORD_PATHS[name], `${JSON.stringify(this.records[name], null, 2)}\n`);
      if (this.disposed) return;
      this.failedWrites.delete(name);
      this.onStatus(this.failedWrites.size ? 'error' : 'saved', this.failedWrites.size ? '部分档案保存失败，请重试' : '学习进度已保存');
    }).catch((error) => {
      if (this.disposed) return;
      this.failedWrites.add(name);
      this.onStatus('error', '暂时无法保存，学习内容仍保留在本页');
      console.error('[HelloLearner] save failed', error);
    });
    return this.queue;
  }

  recordActivity(activity) {
    const date = todayKey();
    return this.update('progress', (progress) => ({
      activityDates: [...new Set([...(progress.activityDates || []), date])].slice(-90),
      recentActivity: [{ at: new Date().toISOString(), ...activity }, ...(progress.recentActivity || [])].slice(0, 20),
    }));
  }

  dispose() {
    this.disposed = true;
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  retryFailed() {
    if (this.disposed) return this.queue;
    for (const name of this.failedWrites) this.flush(name);
    return this.queue;
  }
}

export function calculateStreak(activityDates = [], now = new Date()) {
  const dates = new Set(activityDates);
  const cursor = new Date(now);
  let streak = 0;
  while (dates.has(todayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
