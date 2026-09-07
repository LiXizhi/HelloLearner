export function examplePlan(id = 'plan-test') {
  const units = { 'unit-01': '出行与交通', 'unit-02': '住宿与餐饮', 'unit-03': '购物与返程' };
  return { schemaVersion: 1, id, units, unitFiles: Object.fromEntries(Object.keys(units).map(unit => [unit, `./units/${unit}.json`])), title: '旅行英语 · 每日练习', goal: '能在旅途中自然表达需求', level: 'A1', dailyMinutes: 10,
    lessons: Array.from({ length: 14 }, (_, i) => ({ id: `day-${String(i + 1).padStart(2, '0')}`, title: `旅行交流 ${i + 1}`, unit: `unit-0${Math.floor(i / 6) + 1}`,
      objectives: ['练习礼貌表达并完成情景任务'], steps: ['vocabulary', 'phrase', 'grammar', 'cloze', 'dialogue', 'review'].map((type, j) => ({
        id: `step-${String(j + 1).padStart(2, '0')}`, type, objective: `掌握${type}中的核心表达`, minutes: [2, 2, 1, 1, 3, 1][j],
      })) })) };
}
export function exampleLesson(plan, outline = plan.lessons[0]) {
  return { schemaVersion: 1, planId: plan.id, id: outline.id, title: outline.title,
    steps: outline.steps.map(step => ({ ...step, content: step.type === 'dialogue'
      ? { role: 'Barista', opening: 'What would you like?', completionMessage: 'Enjoy your coffee!', goals: [{ id: 'request', prompt: 'Ask for coffee.', hint: 'A coffee, please.', accept: ['a coffee', 'coffee please'] }] }
      : step.type === 'grammar' ? { sentence: 'I would like coffee.', correct: true, correction: 'I would like coffee.', explanation: 'would like 表示礼貌请求。' }
        : { items: [{ prompt: step.type === 'cloze' ? 'I would like ___.' : '咖啡', answers: ['coffee'], hint: '以 c 开头的饮品。' }] } })) };
}
export function memoryBackend(files = new Map()) {
  return { kind: 'test', files, read: async path => files.get(path) || '', write: async (path, content) => files.set(path, content),
    list: async path => [...new Set([...files.keys()].filter(k => k.startsWith(`${path}/`)).map(k => k.slice(path.length + 1).split('/')[0] + '/'))] };
}
