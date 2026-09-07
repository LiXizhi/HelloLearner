import { PLAN_ROOT, validId, validatePlan, validateDailyLesson, stepCompleted } from './plan-model.js?v=20260907c';

export class PlanStore {
  constructor(backend) {
    this.backend = backend;
    this.queue = Promise.resolve();
    this.mutations = Promise.resolve();
    this.failed = new Map();
    this.cache = new Map();
  }
  path(id, suffix = 'plan.json') {
    if (!validId(id)) throw new Error('无效的计划 ID');
    return `${PLAN_ROOT}/${id}/${suffix}`;
  }
  async read(path, fallback) {
    await this.queue;
    if (this.failed.has(path) && this.cache.has(path)) return structuredClone(this.cache.get(path));
    const raw = await this.backend.read(path);
    if (!raw) return structuredClone(fallback);
    if (raw.length > 1000000) throw new Error('课程文件过大');
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      this.cache.set(path, value);
      return value;
    } catch { throw new Error('课程文件损坏；原文件已保留'); }
  }
  write(path, value) {
    const snapshot = structuredClone({ ...value, updatedAt: new Date().toISOString() });
    this.cache.set(path, snapshot);
    const job = this.queue.then(async () => {
      try { await this.backend.write(path, JSON.stringify(snapshot, null, 2)); this.failed.delete(path); }
      catch (error) { this.failed.set(path, snapshot); throw error; }
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async retry() {
    for (const [path, value] of [...this.failed]) await this.write(path, value);
  }
  transaction(action) {
    const job = this.mutations.then(action);
    this.mutations = job.catch(() => {});
    return job;
  }
  async drain() { await this.mutations; await this.queue; }
  async list({ offset = 0, limit = 20 } = {}) {
    const index = await this.read(`${PLAN_ROOT}/index.json`, { schemaVersion: 1, plans: [] });
    if (!Array.isArray(index.plans)) throw new Error('计划目录损坏');
    const ids = new Set(index.plans.map(p => p.id).filter(validId));
    if (this.backend.list) {
      for (const entry of await this.backend.list(PLAN_ROOT)) {
        const id = String(entry).replace(/\/$/, '');
        if (validId(id)) ids.add(id);
      }
    }
    const plans = [], warnings = [];
    // Read real manifests, so an incomplete index update never invents ready content.
    for (const id of ids) {
      try {
        const plan = await this.get(id);
        const progress = await this.progress(id);
        plans.push({ id, title: plan.title.slice(0, 160), goal: plan.goal.slice(0, 300), level: plan.level,
          dailyMinutes: plan.dailyMinutes, count: plan.lessons.length, updatedAt: plan.updatedAt || '',
          completed: plan.lessons.filter(l => progress.lessons?.[l.id]?.completedAt).length });
      } catch { warnings.push(id); }
    }
    plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    offset = Math.max(0, Math.floor(Number(offset) || 0));
    limit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
    return { plans: plans.slice(offset, offset + limit), total: plans.length, offset, warnings };
  }
  async get(id) { return validatePlan(await this.read(this.path(id), null)); }
  async savePlan(plan) {
    return this.transaction(async () => {
    validatePlan(plan);
    await this.write(this.path(plan.id), plan);
    const path = `${PLAN_ROOT}/index.json`;
    const index = await this.read(path, { schemaVersion: 1, plans: [] });
    if (!Array.isArray(index.plans)) throw new Error('计划目录损坏；计划已保存，请修复目录后重试');
    await this.write(path, { ...index, plans: [...index.plans.filter(p => p.id !== plan.id), {
      id: plan.id, title: plan.title, goal: plan.goal, level: plan.level, dailyMinutes: plan.dailyMinutes, count: plan.lessons.length,
    }] });
    });
  }
  async lesson(plan, outline) {
    const value = await this.read(this.path(plan.id, `lessons/${outline.id}.json`), null);
    return value ? validateDailyLesson(value, plan, outline) : null;
  }
  async saveLesson(plan, outline, value) {
    validateDailyLesson(value, plan, outline);
    await this.write(this.path(plan.id, `lessons/${outline.id}.json`), value);
  }
  async progress(id) {
    const progress = await this.read(this.path(id, 'progress.json'), { schemaVersion: 1, lessons: {}, feedback: [] });
    if (!progress.lessons || typeof progress.lessons !== 'object' || Array.isArray(progress.lessons)) throw new Error('学习进度文件损坏');
    if (progress.schemaVersion !== 1 || (progress.feedback !== undefined && !Array.isArray(progress.feedback))) throw new Error('学习进度格式不支持');
    for (const state of Object.values(progress.lessons)) {
      if (!state || typeof state !== 'object' || !state.steps || typeof state.steps !== 'object' || Array.isArray(state.steps)) throw new Error('步骤进度文件损坏');
      for (const step of Object.values(state.steps)) {
        if (!step || !Array.isArray(step.answers) || step.answers.some(a => typeof a !== 'string' || a.length > 2000)) throw new Error('步骤回答文件损坏');
      }
    }
    return progress;
  }
  async checkpoint(plan, lesson, detail) {
    return this.transaction(async () => {
    const step = lesson.steps.find(s => s.id === detail.stepId);
    if (!step) throw new Error('未知步骤');
    if (!Array.isArray(detail.answers) || detail.answers.length > 20 || detail.answers.some(a => typeof a !== 'string' || a.length > 2000)) throw new Error('无效的步骤回答');
    if (detail.completed && !stepCompleted(step, detail.answers)) throw new Error('步骤尚未完成');
    const path = this.path(plan.id, 'progress.json');
    const progress = this.cache.get(path) || await this.progress(plan.id);
    const previous = progress.lessons[lesson.id] || { steps: {} };
    const state = { ...previous, attempts: (previous.attempts || 0) + 1,
      steps: { ...previous.steps, [step.id]: { ...(previous.steps?.[step.id] || {}), answers: detail.answers,
        completedAt: detail.completed ? new Date().toISOString() : previous.steps?.[step.id]?.completedAt || '' } } };
    if (lesson.steps.every(s => state.steps[s.id]?.completedAt)) state.completedAt ||= new Date().toISOString();
    await this.write(path, { ...progress, lessons: { ...progress.lessons, [lesson.id]: state },
      feedback: detail.feedback ? [...(progress.feedback || []), { text: detail.feedback.slice(0, 300), at: new Date().toISOString() }].slice(-100) : progress.feedback });
    return state;
    });
  }
}
