import { normalizeAnswer, validateDialogue, evaluateLessonDialogue } from './lesson-engine.js?v=20260905a';

export const PLAN_ROOT = '.hellolearner/plans';
export const STEP_TYPES = ['vocabulary', 'phrase', 'grammar', 'cloze', 'dialogue', 'review'];
export const STEP_LABELS = { vocabulary: '词汇', phrase: '表达练习', grammar: '语法判断', cloze: '填空', dialogue: '情景对话', review: '复习' };
export const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value);
export const newId = prefix => `${prefix}-${crypto.randomUUID()}`;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4000 && !/[<>]/.test(value);
const texts = value => Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(text);

function inspect(value, depth = 0) {
  if (depth > 12) throw new Error('内容嵌套过深');
  if (typeof value === 'string' && (value.length > 4000 || /[<>]/.test(value))) throw new Error('课程仅支持有长度限制的纯文本');
  if (object(value) || Array.isArray(value)) for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('无效的内容字段');
    inspect(child, depth + 1);
  }
}
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function steps(value, duration) {
  requireValue(Array.isArray(value) && value.length >= 2 && value.length <= 12, '每天需要 2–12 个学习步骤');
  const ids = new Set();
  for (const step of value) {
    requireValue(object(step) && validId(step.id) && !ids.has(step.id), '步骤 ID 无效或重复');
    ids.add(step.id);
    requireValue(STEP_TYPES.includes(step.type) && text(step.objective), '步骤类型或目标无效');
    requireValue(Number.isInteger(step.minutes) && step.minutes > 0, '步骤时长必须为正整数');
  }
  requireValue(value.reduce((sum, step) => sum + step.minutes, 0) === duration, '步骤时长总计必须等于每日时长');
}

export function validatePlan(plan) {
  inspect(plan);
  requireValue(new TextEncoder().encode(JSON.stringify(plan)).length <= 90000, '计划过长，请减少课程数量或缩短摘要');
  requireValue(object(plan) && plan.schemaVersion === 1 && validId(plan.id), '计划版本或 ID 无效');
  requireValue(text(plan.title) && text(plan.goal) && ['Pre-A1', 'A1', 'A1+', 'A2', 'A2+'].includes(plan.level), '计划标题、目标或英语等级无效');
  requireValue([10, 20].includes(plan.dailyMinutes), '每日时长须为 10 或 20 分钟');
  requireValue(Array.isArray(plan.lessons) && plan.lessons.length > 0 && plan.lessons.length <= 60, '计划需要 1–60 课');
  const ids = new Set();
  plan.lessons.forEach(lesson => {
    requireValue(object(lesson) && validId(lesson.id) && !ids.has(lesson.id), '课程 ID 无效或重复');
    ids.add(lesson.id);
    requireValue(text(lesson.title) && texts(lesson.objectives), '课程标题或目标无效');
    steps(lesson.steps, plan.dailyMinutes);
  });
  return plan;
}

export function validateDailyLesson(lesson, plan, outline) {
  inspect(lesson);
  requireValue(object(lesson) && lesson.schemaVersion === 1 && lesson.planId === plan.id && lesson.id === outline.id, '生成内容不属于当前课程');
  requireValue(text(lesson.title), '课程标题缺失');
  steps(lesson.steps, plan.dailyMinutes);
  requireValue(lesson.steps.length === outline.steps.length, '生成步骤数量与已确认计划不符');
  lesson.steps.forEach((step, index) => {
    const expected = outline.steps[index];
    requireValue(step.id === expected.id && step.type === expected.type && step.minutes === expected.minutes, '生成步骤与已确认计划不符');
    const c = step.content;
    requireValue(object(c), '步骤内容缺失');
    if (step.type === 'dialogue') {
      requireValue(validateDialogue(c).length === 0, '对话目标或答案无效');
    } else if (step.type === 'grammar') {
      requireValue(text(c.sentence) && text(c.correction) && text(c.explanation) && typeof c.correct === 'boolean', '语法内容不完整');
      requireValue(c.correct === (c.sentence.trim() === c.correction.trim()) && [c.sentence, c.correction].every(s => /[.?!]$/.test(s.trim()) && !/_{2,}/.test(s)), '语法答案与句子矛盾');
    } else {
      requireValue(Array.isArray(c.items) && c.items.length > 0 && c.items.length <= 12, '练习需要 1–12 个题目');
      c.items.forEach(item => {
        requireValue(object(item) && text(item.prompt) && texts(item.answers) && item.answers.every(a => normalizeAnswer(a)), '练习题目或参考答案缺失');
        if (step.type === 'cloze') requireValue((item.prompt.match(/___/g) || []).length === 1, '每道填空题需要一个 ___');
      });
    }
  });
  return lesson;
}

export function checkItem(item, answer) {
  return item.answers.some(expected => normalizeAnswer(expected) === normalizeAnswer(answer));
}

export function stepCompleted(step, answers) {
  if (!Array.isArray(answers) || answers.some(answer => typeof answer !== 'string' || answer.length > 2000)) return false;
  if (step.type === 'dialogue') return evaluateLessonDialogue(step.content, answers).completed;
  if (step.type === 'grammar') {
    if (answers.length !== 1) return false;
    const answer = answers[0];
    return step.content.correct ? /^(正确|对|true|correct)$/i.test(answer) : /^(错误|错|false|incorrect|wrong)$/i.test(answer);
  }
  return answers.length === step.content.items.length && step.content.items.every((item, index) => checkItem(item, answers[index]));
}

// Cumulative JSONL stream: only completed preview records are shown, never partial JSON/reasoning.
export function previewLines(output) {
  return String(output || '').split('\n').flatMap(line => {
    try { const value = JSON.parse(line); return value.kind === 'preview' && text(value.message) ? [value.message] : []; }
    catch { return []; }
  }).slice(-30);
}
export function parseGeneration(output) {
  const source = String(output || '');
  requireValue(source.length <= 1000000, '生成内容超过大小限制');
  const values = source.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const result = values.findLast(value => ['plan', 'lesson', 'question', 'action'].includes(value?.kind));
  requireValue(result, 'AI 返回的内容不完整，请重试');
  return result;
}

export function learnerSummary(state, progress = {}) {
  const p = state.profile || {};
  return {
    level: p.englishLevel || 'A1', goals: (p.goals || []).slice(0, 5).map(s => String(s).slice(0, 120)),
    dailyMinutes: p.dailyTargetMinutes >= 20 ? 20 : 10,
    completedLessons: Object.keys(progress.lessons || {}).filter(id => progress.lessons[id].completedAt).length,
    feedback: [...(progress.feedback || []), ...(state.progress?.feedback || [])].slice(-8).map(f => ({
      text: String(f.text || f.correction || f.corrected || '').slice(0, 300),
    })),
  };
}
