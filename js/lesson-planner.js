import { newId, validatePlan, validateDailyLesson, parseGeneration, previewLines, learnerSummary } from './plan-model.js?v=20260908j';

export const PLAN_SCHEMA = `PLAN: {schemaVersion:2,id:APP_ASSIGNED,title,goal,subject,priorKnowledge,teachingLanguage,level:optional_English_level,dailyMinutes:10|20,units:{"unit-01":"Big topic title","unit-02":"Another big topic"},lessons:[{id:"day-01",unit:"unit-01",title,objectives:[text],steps:[{id:"step-01",type:"single-choice|multiple-choice|fill-blanks|repeat|discussion|external-tool|vocabulary|phrase|grammar|cloze|dialogue|review",objective,minutes:positive_integer}]}]}. 1–60 lessons, grouped into named big-topic units of 1–6 lessons, 2–12 steps each. Each lesson must name its unit. Keep each unit contiguous in lesson order. Unit IDs must be lowercase kebab-case. The app assigns relative unitFiles paths. Step minutes must total dailyMinutes. Use IDs day-01, day-02 etc and step-01, step-02 etc; the app assigns final IDs.`;
export const LESSON_SCHEMA = `LESSON: {schemaVersion:2,planId,id,title,steps:[{id,type,objective,minutes,content}]}. Copy IDs, types, order and minutes from the requested outline. Content for vocabulary/phrase/cloze/review: {items:[{prompt,answers:[accepted_exact_answer,...],hint:optional_text}]}, 1–12 items. Vocabulary prompts give Chinese meanings, answers English words; phrase prompts request an English expression, answers acceptable expressions; cloze prompt contains exactly one ___, answers contain only the missing text; review tests prior expressions. Content for grammar: {sentence,correct:boolean,correction,explanation}; complete punctuated sentences, correct is true iff sentence equals correction. Content for dialogue: {role,opening,completionMessage,goals:[{id,prompt,hint,accept:[accepted_phrase,...]}]}; 1–12 goals, 1–20 phrases each. New interaction content:
+ single-choice/multiple-choice: {prompt,options:[{id:lowercase_kebab_id,text}],correctIds:[option_id]}, 2–20 unique options; single-choice has exactly one correct ID; multiple-choice has one or more.
+ fill-blanks: {prompt,blanks:[{id,answers:[accepted_answer]}]}, 1–20 blanks; each ___ in prompt corresponds to one blank in order.
+ repeat: {target,answers:[accepted_transcript],language:BCP47_code}; text matching only, not pronunciation scoring.
+ discussion: {mode:"free|socratic",topic,opening}; completion is learner-confirmed after participation.
+ external-tool: {tool:"paracraft|roleplay-movie-player",prompt,params:{}}; Paracraft params may include pid. Only use known user-supplied world IDs, never invent them. Movie player opens for manual movie selection; it does not load a supplied movie automatically. Keep params JSON under 4000 characters, maximum nesting depth 4, no credentials. Opening tools never awards completion.
All new content text fields <=2000 characters. All text plain, no HTML, <=4000 characters per field. Include multiple natural accepted answers where appropriate.`;

export class LessonPlanner {
  constructor(bridge, getState, fetcher = fetch, baseUrl = globalThis.document?.baseURI || new URL('../', import.meta.url).href) {
    this.bridge = bridge;
    this.getState = getState;
    this.fetcher = (...args) => fetcher(...args);
    this.baseUrl = baseUrl;
    this.controller = null;
    this.skill = null;
  }
  cancel() { this.controller?.abort(); this.controller = null; }
  async instructions() {
    if (this.skill) return this.skill;
    // Copied beside the entry HTML, independently of Vite's assets/ chunks.
    const response = await this.fetcher(new URL('./lesson-planner/SKILL.md?v=20260908j', this.baseUrl));
    if (!response.ok) throw new Error('课程规划技能加载失败，请重试');
    this.skill = await response.text();
    return this.skill;
  }
  async generate(operation, data, onPreview = () => {}, sharedController = null, schema = '', onOutput = () => {}) {
    if (!sharedController) this.cancel();
    const controller = sharedController || (this.controller = new AbortController());
    const instructions = await this.instructions();
    controller.signal.throwIfAborted();
    const messages = [{ role: 'system', content: `${instructions}\nOperation: ${operation}\n${schema || (operation === 'outline' ? PLAN_SCHEMA : LESSON_SCHEMA)}` },
      { role: 'user', content: JSON.stringify(data) }];
    if (new TextEncoder().encode(JSON.stringify(messages)).length > 128000) throw new Error('规划内容过长，请缩短课程摘要后重试');
    const result = await this.bridge.requestLLM({
      model: this.getState().settings?.coursewareModel || 'keepwork-pro',
      presentation: 'tool',
      displayPrompt: operation === 'outline' ? '制定 / 修改学习计划' : '准备今天的课程',
      messages,
    }, 300000, { signal: controller.signal, onStream: message => {
      onPreview(previewLines(message.text));
      onOutput(String(message.text || ''));
    } });
    controller.signal.throwIfAborted();
    onOutput(String(result.text || ''));
    return parseGeneration(result.text);
  }
  async outline(request, draft, conversation, onPreview, onPartial = () => {}) {
    this.cancel();
    const controller = this.controller = new AbortController();
    const data = { request: request.slice(0, 2000), learner: learnerSummary(this.getState()), draft, conversation: conversation.slice(-8) };
    const key = JSON.stringify(data);
    if (this.pendingOutline?.key !== key) this.pendingOutline = { key, schedule: null, lessons: [] };
    const pending = this.pendingOutline;
    const report = (label, lines = []) => onPreview?.([label, ...lines]);
    const attempt = async (operation, payload, schema, validate, label) => {
      let feedback = '';
      for (let retry = 0; retry < 3; retry++) {
        controller.signal.throwIfAborted();
        report(`${label}${retry ? '，正在修复并重试…' : '…'}`);
        try {
          const result = await this.generate(operation, { ...payload, ...(feedback ? { repair: feedback } : {}) },
            lines => report(label, lines), controller, schema);
          return validate(result);
        } catch (error) {
          controller.signal.throwIfAborted();
          if (error.name === 'AbortError' || retry === 2) throw error;
          feedback = `Previous response was invalid: ${error.message}. Return a complete result matching the requested schema; keep text concise.`;
        }
      }
    };
    const scheduleSchema = `${PLAN_SCHEMA}\nFor this operation return a COMPACT schedule, NOT detailed steps: {"kind":"schedule","value":{title,goal,subject,priorKnowledge,teachingLanguage,level,dailyMinutes,units,lessons:[{unit,title,objectives:[text]}]}}. Omit steps for now. Preserve the requested day count. Distribute concrete subject objectives across days with later reviews explicitly marked. Adapt examples to the learner's optional age and interests, and difficulty to their prior knowledge. For language vocabulary goals, distribute the requested distinct words across the schedule. This operation-specific format overrides the full-plan result format. A question result is allowed only if essential information is missing.`;
    const result = pending.schedule || await attempt('outline', data, scheduleSchema, result => {
      if (result.kind === 'question') return result;
      if (result.kind === 'plan') { this.normalizePlan(result.value, draft?.id); return result; }
      if (result.kind !== 'schedule') throw new Error('AI 未返回课程日程');
      this.normalizePlan({ ...result.value, lessons: result.value?.lessons?.map(lesson => ({ ...lesson,
        steps: [{ type: 'vocabulary', objective: '学习', minutes: result.value.dailyMinutes - 1 }, { type: 'review', objective: '复习', minutes: 1 }] })) }, draft?.id);
      return result;
    }, '正在安排主题和每日目标');
    if (result.kind === 'question' && typeof result.message === 'string') return { question: result.message.slice(0, 500) };
    if (result.kind === 'plan') return { plan: this.normalizePlan(result.value, draft?.id) };
    pending.schedule = result;
    const schedule = result.value;
    const publishPartial = () => onPartial({ ...schedule, lessons: structuredClone(pending.lessons) }, schedule.lessons.length);
    publishPartial();
    while (pending.lessons.length < schedule.lessons.length) {
      const offset = pending.lessons.length;
      const requestedLessons = schedule.lessons.slice(offset, offset + 3);
      const lessons = await attempt('outline-batch', { ...data, draft: undefined, schedule, offset, requestedLessons },
        `${PLAN_SCHEMA}\nReturn {"kind":"batch","value":{"lessons":[...]}} with detailed steps for ONLY the requested ${requestedLessons.length} lessons, in order. Copy their unit, title and objectives exactly. Do not return the entire plan. No exercise content yet. This batch format overrides the full-plan result format.`, result => {
          const lessons = result.kind === 'batch' && result.value?.lessons;
          if (!Array.isArray(lessons) || lessons.length !== requestedLessons.length) throw new Error('生成的课程数量不匹配');
          const merged = lessons.map((lesson, index) => ({ ...lesson, ...requestedLessons[index], steps: lesson.steps }));
          const units = Object.fromEntries([...new Set(merged.map(lesson => lesson.unit))].map(unit => [unit, schedule.units[unit]]));
          this.normalizePlan({ ...schedule, units, lessons: merged }, draft?.id);
          return merged;
        }, `已完成 ${offset}/${schedule.lessons.length} 天，正在生成第 ${offset + 1}–${offset + requestedLessons.length} 天`);
      controller.signal.throwIfAborted();
      pending.lessons.push(...lessons);
      publishPartial();
      report(`已完成 ${pending.lessons.length}/${schedule.lessons.length} 天`, pending.lessons.map((lesson, index) => `第 ${index + 1} 天 · ${lesson.title}：${lesson.objectives.join('；')}`));
    }
    const plan = this.normalizePlan({ ...schedule, lessons: pending.lessons }, draft?.id);
    this.pendingOutline = null;
    return { plan };
  }
  normalizePlan(value, existingId) {
    const result = { kind: 'plan', value };
    if (result.kind !== 'plan' || !result.value || !Array.isArray(result.value.lessons)) throw new Error('AI 未返回完整计划，请重试');
    if (!result.value.units || typeof result.value.units !== 'object' || Array.isArray(result.value.units)) throw new Error('AI 未按大主题分组课程，请重试');
    const id = existingId || newId('plan');
    const plan = { ...result.value, id, schemaVersion: 2,
      subject: value.subject || (value.schemaVersion === 1 ? '英语' : ''), priorKnowledge: value.priorKnowledge || value.level || '', teachingLanguage: value.teachingLanguage || 'zh-CN',
      unitFiles: Object.fromEntries(Object.keys(result.value.units).map(unit => [unit, `./units/${unit}.json`])),
      lessons: result.value.lessons.map((lesson, i) => ({ ...lesson, id: `day-${String(i + 1).padStart(2, '0')}`,
        steps: Array.isArray(lesson.steps) ? lesson.steps.map((step, j) => ({ ...step, id: `step-${String(j + 1).padStart(2, '0')}` })) : lesson.steps })) };
    return validatePlan(plan);
  }
  async daily(plan, outline, progress, onPreview, onOutput) {
    const result = await this.generate('daily', { plan, requestedLesson: outline,
      learner: learnerSummary(this.getState(), progress) }, onPreview, null, LESSON_SCHEMA.replace('schemaVersion:2', `schemaVersion:${plan.schemaVersion}`), onOutput);
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
