import { getState } from './state.js';
import { mountVocabularyReview } from './view_vocabulary.js?v=20260905a';

export function renderProgressSummary(progress) {
  const setText = (selector, text) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  };
  const feedback = Array.isArray(progress.feedback) ? progress.feedback : [];
  document.querySelectorAll('.feedback-card').forEach(node => {
    const category = node.classList.contains('feedback-expression') ? 'expression' : node.classList.contains('feedback-grammar') ? 'grammar' : 'pronunciation';
    node.querySelector('strong').textContent = String(feedback.filter(item => item.category === category).length);
  });
  setText('.feedback-section .progress-title > span', feedback.length ? `已保存 ${feedback.length} 条反馈` : '暂无保存的反馈');
  const words = Object.keys(progress.vocabularyExposure || {});
  setText('.vocab-progress-copy > span', '累计接触');
  setText('.vocab-progress-copy > strong', `${words.length} 个单词`);
  const labels = ['接触词汇', '完成课程', '完成场景'];
  const counts = [words.length, Object.keys(progress.completedLessons || {}).length, Object.keys(progress.roleplayOutcomes || {}).length];
  document.querySelectorAll('.vocab-numbers > div').forEach((node, index) => {
    node.querySelector('small').textContent = labels[index];
    node.querySelector('strong').textContent = String(counts[index]);
  });
  const track = document.querySelector('.vocab-progress-track');
  if (track) track.hidden = true;
  setText('[aria-labelledby="speakingTimeTitle"] .progress-title > span', '最近七天');
  const dates = new Set(progress.activityDates || []);
  let streak = 0;
  const cursor = new Date();
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let longest = 0;
  let run = 0;
  let previous = 0;
  [...dates].sort().forEach(key => {
    const time = Date.parse(`${key}T00:00:00Z`);
    if (!Number.isFinite(time)) return;
    run = time - previous === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = time;
  });
  setText('.streak-summary strong', `连续学习 ${streak} 天`);
  setText('.streak-summary small', `累计学习 ${dates.size} 天`);
  setText('[aria-labelledby="streakTitle"] .progress-title > span', `最长 ${longest} 天`);
  document.querySelectorAll('.streak-week > div').forEach((node, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 6 + index);
    const done = dates.has(date.toISOString().slice(0, 10));
    node.classList.toggle('done', done);
    node.classList.toggle('today', index === 6);
    node.querySelector('i').textContent = done ? '✓' : '·';
    node.querySelector('span').textContent = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' }).format(date);
  });
  const list = document.querySelector('.conversation-list');
  if (list) {
    list.replaceChildren();
    const entries = [
      ...Object.entries(progress.completedLessons || {}).map(([id, record]) => ({ id, record, type: 'lesson' })),
      ...Object.entries(progress.roleplayOutcomes || {}).map(([id, record]) => ({ id, record, type: 'roleplay' })),
    ].sort((left, right) => String(right.record.completedAt).localeCompare(String(left.record.completedAt)));
    for (const entry of entries.slice(0, 3)) {
      const button = document.createElement('button');
      const title = entry.type === 'lesson'
        ? window.HELLO_LEARNER_CURRICULUM?.lessons.find(lesson => lesson.id === entry.id)?.title
        : window.HELLO_LEARNER_ROLEPLAYS?.scenarios?.[entry.id]?.title;
      button.textContent = `${title || entry.id} · ${String(entry.record.completedAt || '').slice(0, 10)}`;
      button.addEventListener('click', () => openProgressDetail('全部练习记录'));
      list.append(button);
    }
    if (!entries.length) list.textContent = '暂无完成记录';
  }
}

export function openProgressDetail(action) {
  const progress = getState().progress || {};
  const modal = document.createElement('dialog');
  modal.className = 'p-6 rounded-lg max-w-lg w-full';
  const heading = document.createElement('h2');
  heading.className = 'text-xl font-bold mb-4';
  heading.textContent = action;
  const content = document.createElement('div');
  content.className = 'grid gap-3 max-h-96 overflow-auto';
  const addRow = (label, callback) => {
    const node = document.createElement(callback ? 'button' : 'p');
    node.className = 'text-left p-2 border-b';
    node.textContent = label;
    if (callback) node.addEventListener('click', callback);
    content.append(node);
  };
  if (action === '词汇训练') {
    mountVocabularyReview(content, Object.keys(progress.vocabularyExposure || {}), window.HELLO_LEARNER_CURRICULUM?.lessons || [], word => window.helloLearnerSpeech?.speak(word, { language: 'en-US' }));
  } else if (action.includes('反馈')) {
    const category = action === '语法反馈' ? 'grammar' : action === '发音反馈' ? 'pronunciation' : 'expression';
    const feedback = Array.isArray(progress.feedback) ? progress.feedback : [];
    feedback.filter(item => item.category === category).slice().reverse().forEach(item => addRow(`${item.text} · ${String(item.createdAt || '').slice(0, 10)}`));
    if (!content.childElementCount) addRow('暂无保存的反馈');
  } else {
    const lessons = window.HELLO_LEARNER_CURRICULUM?.lessons || [];
    const entries = [
      ...Object.entries(progress.completedLessons || {}).map(([id, record]) => ({ id, record, type: 'lesson' })),
      ...Object.entries(progress.roleplayOutcomes || {}).map(([id, record]) => ({ id, record, type: 'roleplay' })),
    ].sort((left, right) => String(right.record.completedAt).localeCompare(String(left.record.completedAt)));
    for (const entry of entries) {
      const title = entry.type === 'lesson'
        ? lessons.find(lesson => lesson.id === entry.id)?.title
        : window.HELLO_LEARNER_ROLEPLAYS?.scenarios?.[entry.id]?.title;
      addRow(`${title || entry.id} · ${String(entry.record.completedAt || '').slice(0, 10)}`, () => {
        modal.close();
        if (entry.type === 'lesson') window.helloLearnerRuntime.openLessonById(entry.id);
        else window.helloLearnerRuntime.openRoleplayById(entry.id);
      });
    }
    if (!content.childElementCount) addRow('暂无完成记录');
  }
  const close = document.createElement('button');
  close.className = 'mt-4 px-4 py-2 border rounded';
  close.textContent = '关闭';
  close.addEventListener('click', () => modal.close());
  modal.append(heading, content, close);
  modal.addEventListener('close', () => modal.remove(), { once: true });
  document.body.append(modal);
  modal.showModal();
}