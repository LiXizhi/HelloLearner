import { validateDialogue } from './lesson-engine.js?v=20260905a';

const requiredText = ['id', 'number', 'unit', 'title', 'subtitle', 'band', 'level', 'phrase', 'meaning', 'summary', 'answerTip', 'aiRole', 'mission', 'opening', 'hint', 'briefing'];
const levels = new Set(['Pre-A1', 'A1', 'A1+', 'A2', 'A2+']);

export function validateLessonPack(value) {
  const errors = [];
  const object = item => item !== null && typeof item === 'object' && !Array.isArray(item);
  if (!object(value)) return { valid: false, errors: ['pack: expected an object'] };
  if (value.version !== 1) errors.push('version: expected 1');
  if (!object(value.units) || !Object.keys(value.units).length) errors.push('units: expected named units');
  if (!Array.isArray(value.lessons) || !value.lessons.length || value.lessons.length > 300) errors.push('lessons: expected 1-300 lessons');
  const inspect = (item, path, depth = 0) => {
    if (depth > 12) { errors.push(`${path}: nesting too deep`); return; }
    if (typeof item === 'string' && (item.length > 4000 || /[<>]/.test(item))) errors.push(`${path}: use bounded plain text, not HTML`);
    if (item && typeof item === 'object') Object.entries(item).forEach(([key, child]) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) errors.push(`${path}: reserved key ${key}`);
      inspect(child, `${path}.${key}`, depth + 1);
    });
  };
  inspect(value, 'pack');
  Object.entries(value.units || {}).forEach(([id, title]) => {
    if (!/^[A-Za-z0-9_-]+$/.test(id) || typeof title !== 'string' || !title.trim()) errors.push(`units.${id}: invalid unit`);
  });
  const ids = new Set();
  const unitCounts = new Map();
  (Array.isArray(value.lessons) ? value.lessons : []).forEach((lesson, index) => {
    const path = `lessons[${index}]`;
    if (!object(lesson)) { errors.push(`${path}: expected object`); return; }
    requiredText.forEach(key => {
      if (typeof lesson[key] !== 'string' || !lesson[key].trim()) errors.push(`${path}.${key}: required text`);
    });
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(lesson.id) || ids.has(lesson.id)) errors.push(`${path}.id: invalid or duplicate`);
    ids.add(lesson.id);
    if (lesson.dialogue !== undefined) errors.push(...validateDialogue(lesson.dialogue).map(error => `${path}.${error}`));
    if (!Object.hasOwn(value.units || {}, lesson.unit)) errors.push(`${path}.unit: unknown unit`);
    unitCounts.set(lesson.unit, (unitCounts.get(lesson.unit) || 0) + 1);
    if (!Number.isInteger(lesson.order) || lesson.order < 1) errors.push(`${path}.order: expected positive integer`);
    if (!levels.has(lesson.band) || !levels.has(lesson.level)) errors.push(`${path}.level: unsupported level`);
    if (!Array.isArray(lesson.vocabulary) || !lesson.vocabulary.length || lesson.vocabulary.some(word => !Array.isArray(word) || word.length !== 3 || word.some(part => typeof part !== 'string'))) errors.push(`${path}.vocabulary: expected [word, phonetic, meaning] tuples`);
    const grammar = lesson.grammarJudgment;
    if (!object(grammar)) { errors.push(`${path}.grammarJudgment: required`); return; }
    for (const key of ['sentence', 'correction', 'grammarFocus', 'explanation']) {
      if (typeof grammar[key] !== 'string' || !grammar[key].trim()) errors.push(`${path}.grammarJudgment.${key}: required text`);
    }
    if (typeof grammar.correct !== 'boolean') errors.push(`${path}.grammarJudgment.correct: expected boolean`);
    const sentence = String(grammar.sentence || '').trim();
    const correction = String(grammar.correction || '').trim();
    if (![sentence, correction].every(text => /[.?!]$/.test(text) && !/_{2,}|\[\s*\]|\{\s*blank\s*\}/i.test(text))) errors.push(`${path}.grammarJudgment: expected complete sentences`);
    if (grammar.correct !== (sentence === correction)) errors.push(`${path}.grammarJudgment: correction contradicts answer`);
    const tokens = [...correction.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)].map(match => match[0].toLowerCase());
    if (!Array.isArray(grammar.targets) || grammar.targets.length !== 3) errors.push(`${path}.grammarJudgment.targets: expected three tokens`);
    else grammar.targets.forEach(target => {
      const targetIndex = tokens.indexOf(String(target).toLowerCase());
      if (targetIndex < 0) errors.push(`${path}.grammarJudgment.targets: token missing or reused`);
      else tokens.splice(targetIndex, 1);
    });
  });
  for (const [unit, count] of unitCounts) if (count > 6) errors.push(`units.${unit}: route supports at most six lessons`);
  return { valid: errors.length === 0, errors };
}

export async function loadLessonPack(path, baseUrl, fetcher = fetch) {
  const url = new URL(path, baseUrl);
  if (url.origin !== new URL(baseUrl).origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Lesson packs must use the same origin');
  const response = await fetcher(url.href, { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Lesson pack request failed (${response.status})`);
  const text = await response.text();
  if (text.length > 1000000) throw new Error('Lesson pack exceeds 1 MB');
  const pack = JSON.parse(text);
  const result = validateLessonPack(pack);
  if (!result.valid) throw new Error(result.errors.slice(0, 8).join('\n'));
  return pack;
}