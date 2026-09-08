import { normalizeAnswer, validateDialogue, evaluateLessonDialogue } from './lesson-engine.js?v=20260905a';
import { mountInteraction } from './view_interactions.js?v=20260908j';

export const legacyTypes = ['vocabulary', 'phrase', 'grammar', 'cloze', 'dialogue', 'review'];
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;
const list = v => Array.isArray(v) && v.length > 0 && v.length <= 20;
const strings = v => list(v) && v.every(text);
const equal = (a, b) => String(a).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase() === String(b).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const matches = (answers, value) => answers.some(answer => equal(answer, value));
const labels = { vocabulary: '词汇', phrase: '表达练习', grammar: '语法判断', cloze: '填空', dialogue: '情景对话', review: '复习', 'single-choice': '单选', 'multiple-choice': '多选', 'fill-blanks': '填空', repeat: '跟读', discussion: '讨论', 'external-tool': '互动体验' };
const registry = new Map();
const define = (type, validate, responseValid, completed) => registry.set(type, Object.freeze({ type, label: labels[type], validate, responseValid, completed,
  render: environment => mountInteraction({ ...environment, interaction: registry.get(type) }) }));

export function validParameters(value) {
  if (!record(value) || JSON.stringify(value).length > 4000) return false;
  const walk = (v, depth) => {
    if (depth > 4) return false;
    if (v === null || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)) return true;
    if (typeof v === 'string') return v.length <= 2000;
    if (Array.isArray(v)) return v.length <= 20 && v.every(x => walk(x, depth + 1));
    return record(v) && Object.entries(v).every(([k, x]) => !/^(?:__proto__|constructor|prototype|token|password|secret|authorization)$/i.test(k) && walk(x, depth + 1));
  };
  return walk(value, 0);
}
function choiceContent(c) {
  return record(c) && text(c.prompt) && list(c.options) && c.options.length >= 2 && c.options.every(o => record(o) && typeof o.id === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(o.id) && text(o.text))
    && new Set(c.options.map(o => o.id)).size === c.options.length && strings(c.correctIds) && new Set(c.correctIds).size === c.correctIds.length && c.correctIds.every(id => c.options.some(o => o.id === id));
}
for (const type of ['single-choice', 'multiple-choice']) define(type,
  c => choiceContent(c) && (type !== 'single-choice' || c.correctIds.length === 1),
  (c, r) => record(r) && strings(r.selectedIds) && new Set(r.selectedIds).size === r.selectedIds.length && (type !== 'single-choice' || r.selectedIds.length === 1) && r.selectedIds.every(id => c.options.some(o => o.id === id)),
  (c, r) => r.selectedIds.length === c.correctIds.length && c.correctIds.every(id => r.selectedIds.includes(id)));
define('fill-blanks', c => record(c) && text(c.prompt) && list(c.blanks) && c.blanks.every(b => record(b) && text(b.id) && strings(b.answers)) && new Set(c.blanks.map(b => b.id)).size === c.blanks.length && (c.prompt.match(/___/g) || []).length === c.blanks.length,
  (c, r) => record(r) && Array.isArray(r.values) && r.values.length === c.blanks.length && r.values.every(text),
  (c, r) => c.blanks.every((b, i) => matches(b.answers, r.values[i])));
define('repeat', c => record(c) && text(c.target) && strings(c.answers) && c.answers.every(normalizeAnswer) && (!c.language || text(c.language)),
  (c, r) => record(r) && text(r.transcript), (c, r) => c.answers.some(a => normalizeAnswer(a) === normalizeAnswer(r.transcript)));
define('discussion', c => record(c) && ['free', 'socratic'].includes(c.mode) && text(c.opening) && text(c.topic),
  (c, r) => record(r) && Array.isArray(r.turns) && r.turns.length <= 20 && r.turns.every(t => record(t) && ['user', 'assistant'].includes(t.role) && text(t.content)) && typeof r.confirmed === 'boolean',
  (c, r) => r.confirmed && r.turns.some(t => t.role === 'user') && r.turns.some(t => t.role === 'assistant'));
define('external-tool', c => record(c) && ['paracraft', 'roleplay-movie-player'].includes(c.tool) && text(c.prompt) && validParameters(c.params || {}),
  (c, r) => record(r) && typeof r.launched === 'boolean' && typeof r.confirmed === 'boolean' && (!r.activityId || text(r.activityId)),
  (c, r) => r.launched && r.confirmed);

for (const type of legacyTypes) {
  const legacyText = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 4000 && !/[<>]/.test(v);
  const legacyStrings = v => list(v) && v.every(legacyText);
  const validate = c => {
    if (!record(c)) return false;
    if (type === 'dialogue') return validateDialogue(c).length === 0;
    if (type === 'grammar') return [c.sentence, c.correction, c.explanation].every(legacyText) && typeof c.correct === 'boolean' && c.correct === (c.sentence.trim() === c.correction.trim()) && [c.sentence, c.correction].every(s => /[.?!]$/.test(s.trim()) && !/_{2,}/.test(s));
    return list(c.items) && c.items.length <= 12 && c.items.every(i => record(i) && legacyText(i.prompt) && legacyStrings(i.answers) && i.answers.every(normalizeAnswer) && (type !== 'cloze' || (i.prompt.match(/___/g) || []).length === 1));
  };
  registry.set(type, Object.freeze({ type, label: labels[type], legacy: true, validate,
    responseValid: (c, r) => Array.isArray(r) && r.length <= 20 && r.every(a => typeof a === 'string' && a.length <= 2000),
    completed: (c, r) => type === 'dialogue' ? evaluateLessonDialogue(c, r).completed : type === 'grammar' ? r.length === 1 && (c.correct ? /^(正确|对|true|correct)$/i : /^(错误|错|false|incorrect|wrong)$/i).test(r[0]) : r.length === c.items.length && c.items.every((i, n) => i.answers.some(a => normalizeAnswer(a) === normalizeAnswer(r[n]))),
    render: environment => environment.renderLegacy(),
  }));
}
export const interactionTypes = Object.freeze([...registry.keys()]);
export const interactionLabels = Object.freeze(labels);
export function getInteraction(type) {
  const interaction = registry.get(type);
  if (!interaction) throw new Error(`不支持的互动类型：${type}`);
  return interaction;
}
export function validateResponse(step, response) {
  const interaction = getInteraction(step.type);
  try { return JSON.stringify(response)?.length <= 50000 && interaction.responseValid(step.content, response); } catch { return false; }
}
export function interactionCompleted(step, response) {
  const interaction = getInteraction(step.type);
  return validateResponse(step, response) && interaction.completed(step.content, response);
}
