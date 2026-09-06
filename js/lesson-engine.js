export function normalizeAnswer(value) {
  return String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
}

export function evaluateLessonDialogue(dialogue, answers) {
  let goalIndex = 0;
  for (const answer of answers) {
    const goal = dialogue.goals[goalIndex];
    if (!goal) break;
    const normalized = ` ${normalizeAnswer(answer)} `;
    const matches = goal.accept.some(phrase => normalized.includes(` ${normalizeAnswer(phrase)} `));
    if (matches) goalIndex++;
  }
  const goal = dialogue.goals[goalIndex];
  return {
    goalIndex,
    completed: !goal,
    bridge: goal?.prompt || dialogue.completionMessage,
    hint: goal?.hint || '',
    directAnswer: '',
    nativeAssist: '',
    hasQuestion: Boolean(goal),
  };
}

export function validateDialogue(dialogue) {
  const errors = [];
  if (!dialogue || typeof dialogue !== 'object' || Array.isArray(dialogue)) return ['dialogue: expected object'];
  for (const key of ['role', 'opening', 'completionMessage']) {
    if (typeof dialogue[key] !== 'string' || !dialogue[key].trim()) errors.push(`dialogue.${key}: required text`);
  }
  if (!Array.isArray(dialogue.goals) || !dialogue.goals.length || dialogue.goals.length > 12) return [...errors, 'dialogue.goals: expected 1-12 goals'];
  const ids = new Set();
  dialogue.goals.forEach((goal, index) => {
    if (!goal || typeof goal !== 'object') { errors.push(`dialogue.goals[${index}]: expected object`); return; }
    if (typeof goal.id !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(goal.id) || ids.has(goal.id)) errors.push(`dialogue.goals[${index}].id: invalid or duplicate`);
    ids.add(goal.id);
    for (const key of ['prompt', 'hint']) if (typeof goal[key] !== 'string' || !goal[key].trim()) errors.push(`dialogue.goals[${index}].${key}: required text`);
    if (!Array.isArray(goal.accept) || !goal.accept.length || goal.accept.length > 20 || goal.accept.some(phrase => typeof phrase !== 'string' || !normalizeAnswer(phrase))) errors.push(`dialogue.goals[${index}].accept: expected 1-20 nonempty phrases`);
  });
  return errors;
}