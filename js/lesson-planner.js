import { newId, validatePlan, validateDailyLesson, parseGeneration, previewLines, learnerSummary } from './plan-model.js?v=20260907c';

export const PLAN_SCHEMA = `PLAN: {schemaVersion:1,id:APP_ASSIGNED,title,goal,level:"Pre-A1|A1|A1+|A2|A2+",dailyMinutes:10|20,lessons:[{id:"day-01",title,objectives:[text],steps:[{id:"step-01",type:"vocabulary|phrase|grammar|cloze|dialogue|review",objective,minutes:positive_integer}]}]}. 1–60 lessons, 2–12 steps each. Step minutes must total dailyMinutes. Use IDs day-01, day-02 etc and step-01, step-02 etc; the app assigns final IDs.`;
export const LESSON_SCHEMA = `LESSON: {schemaVersion:1,planId,id,title,steps:[{id,type,objective,minutes,content}]}. Copy IDs, types, order and minutes from the requested outline. Content for vocabulary/phrase/cloze/review: {items:[{prompt,answers:[accepted_exact_answer,...],hint:optional_text}]}, 1–12 items. Vocabulary prompts give Chinese meanings, answers English words; phrase prompts request an English expression, answers acceptable expressions; cloze prompt contains exactly one ___, answers contain only the missing text; review tests prior expressions. Content for grammar: {sentence,correct:boolean,correction,explanation}; complete punctuated sentences, correct is true iff sentence equals correction. Content for dialogue: {role,opening,completionMessage,goals:[{id,prompt,hint,accept:[accepted_phrase,...]}]}; 1–12 goals, 1–20 phrases each. All text plain, no HTML, <=4000 characters per field. Include multiple natural accepted answers where appropriate.`;

export class LessonPlanner {
  constructor(bridge, getState, fetcher = fetch) {
    this.bridge = bridge;
    this.getState = getState;
    this.fetcher = (...args) => fetcher(...args);
    this.controller = null;
    this.skill = null;
  }
  cancel() { this.controller?.abort(); this.controller = null; }
  async instructions() {
    if (this.skill) return this.skill;
    const response = await this.fetcher(new URL('../lesson-planner/SKILL.md?v=20260907c', import.meta.url));
    if (!response.ok) throw new Error('课程规划技能加载失败，请重试');
    this.skill = await response.text();
    return this.skill;
  }
  async generate(operation, data, onPreview = () => {}) {
    this.cancel();
    const controller = this.controller = new AbortController();
    const instructions = await this.instructions();
    controller.signal.throwIfAborted();
    const messages = [{ role: 'system', content: `${instructions}\nOperation: ${operation}\n${operation === 'outline' ? PLAN_SCHEMA : LESSON_SCHEMA}` },
      { role: 'user', content: JSON.stringify(data) }];
    if (new TextEncoder().encode(JSON.stringify(messages)).length > 128000) throw new Error('规划内容过长，请缩短课程摘要后重试');
    const result = await this.bridge.requestLLM({
      model: this.getState().settings?.coursewareModel || 'keepwork-pro',
      presentation: 'tool',
      displayPrompt: operation === 'outline' ? '制定 / 修改学习计划' : '准备今天的英语课',
      messages,
    }, 300000, { signal: controller.signal, onStream: message => onPreview(previewLines(message.text)) });
    controller.signal.throwIfAborted();
    return parseGeneration(result.text);
  }
  async outline(request, draft, conversation, onPreview) {
    const result = await this.generate('outline', { request: request.slice(0, 2000),
      learner: learnerSummary(this.getState()), draft, conversation: conversation.slice(-8) }, onPreview);
    if (result.kind === 'question' && typeof result.message === 'string') return { question: result.message.slice(0, 500) };
    if (result.kind !== 'plan' || !result.value || !Array.isArray(result.value.lessons)) throw new Error('AI 未返回完整计划，请重试');
    const id = draft?.id || newId('plan');
    const plan = { ...result.value, id, schemaVersion: 1,
      lessons: result.value.lessons.map((lesson, i) => ({ ...lesson, id: `day-${String(i + 1).padStart(2, '0')}`,
        steps: Array.isArray(lesson.steps) ? lesson.steps.map((step, j) => ({ ...step, id: `step-${String(j + 1).padStart(2, '0')}` })) : lesson.steps })) };
    return { plan: validatePlan(plan) };
  }
  async daily(plan, outline, progress, onPreview) {
    const result = await this.generate('daily', { plan, requestedLesson: outline,
      learner: learnerSummary(this.getState(), progress) }, onPreview);
    if (result.kind !== 'lesson') throw new Error('AI 未返回完整课程，请重试');
    return validateDailyLesson(result.value, plan, outline);
  }
  // Only classify routing, never let intent checking evaluate an exercise or mutate progress.
  async intent(text) {
    const result = await this.bridge.requestLLM({ displayPrompt: '识别课程规划请求', presentation: 'tool',
      messages: [{ role: 'system', content: 'Classify the user turn. Is it an explicit request to create a learning/course/lesson plan, list available plans, or neither? Do not treat an exercise sentence, negated request, or discussion about the word plan as a request. Return exactly one JSON object {"action":"create"|"list"|"none"}.' },
        { role: 'user', content: text.slice(0, 2000) }] });
    try { const value = JSON.parse(result.text); return ['create', 'list'].includes(value.action) ? value.action : 'none'; }
    catch { return 'none'; }
  }
}
