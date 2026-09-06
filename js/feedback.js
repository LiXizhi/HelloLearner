export function appendFeedback(existing, detail, now = new Date().toISOString()) {
  const text = typeof detail?.text === 'string' ? detail.text.trim().slice(0, 300) : '';
  const records = Array.isArray(existing) ? existing : [];
  if (!text) return records;
  return [...records, { category: 'expression', text, lessonId: String(detail.lessonId || '').slice(0, 80), scenarioId: String(detail.scenarioId || '').slice(0, 80), createdAt: now }].slice(-100);
}