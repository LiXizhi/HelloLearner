import { interactionTypes, interactionLabels, legacyTypes, getInteraction, interactionCompleted } from './interaction-registry.js?v=20260908j';
import { normalizeAnswer } from './lesson-engine.js?v=20260905a';

export const PLAN_ROOT = '.hellolearner/plans';
export const STEP_TYPES = interactionTypes;
export const STEP_LABELS = interactionLabels;
export const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value);
export const newId = prefix => `${prefix}-${crypto.randomUUID()}`;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4000;
const texts = value => Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(text);

function inspect(value, depth = 0, allowSymbols = false) {
  if (depth > 12) throw new Error('内容嵌套过深');
  if (typeof value === 'string' && (value.length > 4000 || !allowSymbols && /[<>]/.test(value))) throw new Error('课程仅支持有长度限制的纯文本');
  if (object(value) || Array.isArray(value)) for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('无效的内容字段');
    inspect(child, depth + 1, allowSymbols);
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
  inspect(plan, 0, plan?.schemaVersion === 2);
  requireValue(new TextEncoder().encode(JSON.stringify(plan)).length <= 90000, '计划过长，请减少课程数量或缩短摘要');
  requireValue(object(plan) && [1, 2].includes(plan.schemaVersion) && validId(plan.id), '计划版本或 ID 无效');
  requireValue(text(plan.title) && text(plan.goal), '计划标题或目标无效');
  if (plan.schemaVersion === 1) requireValue(['Pre-A1', 'A1', 'A1+', 'A2', 'A2+'].includes(plan.level), '英语等级无效');
  else requireValue(text(plan.subject) && text(plan.priorKnowledge) && text(plan.teachingLanguage), '请提供学科、已有基础和教学语言');
  requireValue([10, 20].includes(plan.dailyMinutes), '每日时长须为 10 或 20 分钟');
  requireValue(Array.isArray(plan.lessons) && plan.lessons.length > 0 && plan.lessons.length <= 60, '计划需要 1–60 课');
  const ids = new Set();
  plan.lessons.forEach(lesson => {
    requireValue(object(lesson) && validId(lesson.id) && !ids.has(lesson.id), '课程 ID 无效或重复');
    ids.add(lesson.id);
    requireValue(text(lesson.title) && texts(lesson.objectives), '课程标题或目标无效');
    steps(lesson.steps, plan.dailyMinutes);
    if (plan.schemaVersion === 1) requireValue(lesson.steps.every(s => legacyTypes.includes(s.type)), '旧计划不支持新互动类型');
  });
  requireValue(object(plan.units) && object(plan.unitFiles) && Object.keys(plan.units).length > 0, '计划需要主题单元和单元文件目录');
  requireValue(Object.keys(plan.unitFiles).length === Object.keys(plan.units).length, '单元文件目录不一致');
  for (const [unit, title] of Object.entries(plan.units)) {
    requireValue(validId(unit) && text(title) && plan.unitFiles[unit] === `./units/${unit}.json`, '单元标题、ID 或相对路径无效');
    const lessons = plan.lessons.filter(lesson => lesson.unit === unit);
    requireValue(lessons.length > 0 && lessons.length <= 6, '每个主题单元需要 1–6 课');
  }
  const closed = new Set();
  let previous;
  for (const lesson of plan.lessons) {
    requireValue(Object.hasOwn(plan.units, lesson.unit), '课程必须属于已定义的主题单元');
    if (lesson.unit !== previous) {
      requireValue(!closed.has(lesson.unit), '同一主题单元的课程需要连续排列');
      if (previous) closed.add(previous);
      previous = lesson.unit;
    }
  }
  return plan;
}

export function validateDailyLesson(lesson, plan, outline) {
  inspect(lesson, 0, lesson?.schemaVersion === 2);
  requireValue(object(lesson) && lesson.schemaVersion === plan.schemaVersion && lesson.planId === plan.id && lesson.id === outline.id, '生成内容不属于当前课程');
  requireValue(text(lesson.title), '课程标题缺失');
  steps(lesson.steps, plan.dailyMinutes);
  requireValue(lesson.steps.length === outline.steps.length, '生成步骤数量与已确认计划不符');
  lesson.steps.forEach((step, index) => {
    const expected = outline.steps[index];
    requireValue(step.id === expected.id && step.type === expected.type && step.minutes === expected.minutes, '生成步骤与已确认计划不符');
    const c = step.content;
    requireValue(object(c), '步骤内容缺失');
    requireValue(getInteraction(step.type).validate(c), '互动内容或答案无效');
  });
  return lesson;
}

export function checkItem(item, answer) {
  return item.answers.some(expected => normalizeAnswer(expected) === normalizeAnswer(answer));
}

export function stepCompleted(step, answers, response) {
  return interactionCompleted(step, getInteraction(step.type).legacy ? answers : response);
}

// Cumulative JSONL stream: only completed preview records are shown, never partial JSON/reasoning.
export function previewLines(output) {
  return String(output || '').split('\n').flatMap(line => {
    try { const value = JSON.parse(line); return value.kind === 'preview' && text(value.message) && !/[<>]/.test(value.message) ? [value.message] : []; }
    catch {
      if (!/^\s*\{\s*"kind"\s*:\s*"preview"\s*,\s*"message"\s*:\s*"/.test(line)) return [];
      const partial = line.replace(/^\s*\{\s*"kind"\s*:\s*"preview"\s*,\s*"message"\s*:\s*"/, '');
      try { const message = JSON.parse(`"${partial.replace(/\\(?:u[0-9a-f]{0,3})?$/i, '')}"`); return text(message) && !/[<>]/.test(message) ? [message] : []; }
      catch { return []; }
    }
  }).slice(-30);
}
export function parseGeneration(output) {
  const source = String(output || '');
  requireValue(source.length <= 1000000, '生成内容超过大小限制');
  const values = source.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"' && depth) quoted = true;
    else if (character === '{') { if (!depth) start = index; depth++; }
    else if (character === '}' && depth && !--depth) {
      try { values.push(JSON.parse(source.slice(start, index + 1))); } catch {}
    }
  }
  const result = values.findLast(value => ['plan', 'lesson', 'question', 'action', 'schedule', 'batch'].includes(value?.kind));
  requireValue(result, 'AI 返回的内容不完整，请重试');
  return result;
}

export function learnerSummary(state, progress = {}) {
  const p = state.profile || {};
  return {
    age: Number.isInteger(p.age) ? p.age : null, interests: (Array.isArray(p.interests) ? p.interests : []).slice(0, 10).map(s => String(s).slice(0, 120)), teachingLanguage: p.teachingLanguage || 'zh-CN',
    level: p.englishLevel || 'A1', goals: (p.goals || []).slice(0, 5).map(s => String(s).slice(0, 120)),
    dailyMinutes: p.dailyTargetMinutes >= 20 ? 20 : 10,
    completedLessons: Object.keys(progress.lessons || {}).filter(id => progress.lessons[id].completedAt).length,
    feedback: [...(progress.feedback || []), ...(state.progress?.feedback || [])].slice(-8).map(f => ({
      text: String(f.text || f.correction || f.corrected || '').slice(0, 300),
    })),
  };
}
