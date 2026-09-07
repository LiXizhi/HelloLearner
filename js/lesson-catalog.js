import { validateLessonPack } from './lesson-pack.js?v=20260905b';

// Resolve against the page base, including the release wrapper's CDN base.
// These are authored application files; learner progress still uses storage.js.
export async function loadDefaultLessons(baseUrl, fetcher = fetch) {
  const indexUrl = new URL('./data/default_lesson_index.json', baseUrl);
  async function read(url) {
    const response = await fetcher(url.href, {
      credentials: 'same-origin', redirect: 'error', cache: 'no-cache',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`课程文件加载失败 (${response.status}): ${url.pathname}`);
    const text = await response.text();
    if (text.length > 1000000) throw new Error('课程文件超过 1 MB');
    return JSON.parse(text);
  }
  const index = await read(indexUrl);
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (index?.version !== 1 || !object(index.units) || !object(index.unitFiles)
    || !Array.isArray(index.lessons) || !index.lessons.length || index.lessons.length > 300) throw new Error('默认课程目录格式无效');
  const ids = new Set();
  for (const [unit, title] of Object.entries(index.units)) {
    if (!/^[A-Za-z0-9_-]+$/.test(unit) || typeof title !== 'string' || !title.trim()
      || !/^(?:\.\/)?(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.json$/.test(index.unitFiles[unit] || '')) throw new Error('默认课程目录包含无效相对路径');
    const count = index.lessons.filter(l => l?.unit === unit).length;
    if (!count || count > 6) throw new Error('单元需要 1-6 课');
  }
  for (const entry of index.lessons) {
    if (!entry || !/^[a-z][a-z0-9-]{0,79}$/.test(entry.id) || ids.has(entry.id)
      || !Object.hasOwn(index.units, entry.unit) || !Number.isInteger(entry.order)
      || !['title', 'number', 'subtitle', 'band', 'level', 'icon'].every(key => typeof entry[key] === 'string' && !/[<>]/.test(entry[key]))) throw new Error('默认课程目录包含无效或重复 ID / 课程摘要');
    ids.add(entry.id);
  }
  const pending = new Map();
  const catalog = { version: 1, units: index.units, lessons: index.lessons, loadLesson };
  async function loadUnit(unit) {
    if (!pending.has(unit)) {
      const job = (async () => {
        const pack = await read(new URL(index.unitFiles[unit], indexUrl));
        if (!Array.isArray(pack?.lessons)) throw new Error('单元课程格式无效');
        const expected = index.lessons.filter(l => l.unit === unit).map(l => l.id);
        if (pack.lessons.length !== expected.length || pack.lessons.some(l => !l || l.unit !== unit || !expected.includes(l.id))) throw new Error('单元课程与目录不一致');
        for (const lesson of pack.lessons) {
          if (lesson.practice !== undefined) {
            const practice = lesson.practice;
            if (!practice || typeof practice !== 'object' || Array.isArray(practice)
              || !practice.warmup || !Array.isArray(practice.fills) || !practice.fills.length
              || !['vocabulary', 'formula', 'sample', 'briefing', 'demoAnswers'].every(key => Array.isArray(practice[key]))
              || !['title', 'phrase', 'opening', 'hint', 'mission', 'role'].every(key => typeof practice[key] === 'string')) {
              throw new Error(`默认课程练习格式无效: ${lesson.id}`);
            }
            if (practice.answerPatterns !== undefined) {
              if (!Array.isArray(practice.answerPatterns) || practice.answerPatterns.some(pattern => typeof pattern !== 'string')) {
                throw new Error(`默认课程对话规则无效: ${lesson.id}`);
              }
              practice.answerPatterns.forEach(pattern => new RegExp(pattern, 'i'));
            }
            if (practice.coachTurns !== undefined && (!Array.isArray(practice.coachTurns) || practice.coachTurns.length !== 3
              || practice.coachTurns.some(turn => !turn || !['directAnswer', 'bridge', 'nativeAssist'].every(key => typeof turn[key] === 'string')))) {
              throw new Error(`默认课程对话步骤无效: ${lesson.id}`);
            }
          }
        }
        const result = validateLessonPack({ ...pack, lessons: pack.lessons.map(({ practice, ...lesson }) => lesson) });
        if (!result.valid) throw new Error(result.errors.slice(0, 8).join('\n'));
        // Publish only after the complete unit has passed validation.
        catalog.lessons = catalog.lessons.map(summary => pack.lessons.find(l => l.id === summary.id) || summary);
      })();
      pending.set(unit, job);
      job.catch(() => pending.delete(unit));
    }
    await pending.get(unit);
  }
  async function loadLesson(id) {
    const summary = index.lessons.find(l => l.id === id);
    if (!summary) throw new Error('Unknown lesson');
    await loadUnit(summary.unit);
    return catalog.lessons.find(l => l.id === id);
  }
  return catalog;
}
