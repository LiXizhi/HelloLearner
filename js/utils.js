export const $ = (id) => document.getElementById(id);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

export function dispatchLearnerEvent(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(`hellolearner:${type}`, { detail }));
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function safeJsonParse(text, fallback) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function requestId(prefix = 'hl') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
