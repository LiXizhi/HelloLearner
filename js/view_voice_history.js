import { createTranslationControl } from './view_translation.js?v=20260907u';
const OBSERVER_PREFIX = 'Copilot小纸条：';

export function splitVoiceText(text, notes = []) {
  let speech = String(text || '');
  for (const note of notes) {
    if (speech.startsWith(note)) speech = speech.slice(note.length).trimStart();
    else if (note.startsWith(speech) && speech) return { speech: '', note: '' };
  }
  // Older hosts do not mark observer messages. Keep an unsplittable prefixed
  // message collapsed instead of guessing where the private note ends.
  if (speech && OBSERVER_PREFIX.startsWith(speech.trimStart())) return { speech: '', note: speech };
  if (speech.trimStart().startsWith(OBSERVER_PREFIX)) return { speech: '', note: speech };
  return { speech, note: '' };
}

export function createVoiceHistory(history, feed) {
  const turns = new Map();
  const notes = [];
  function update(message) {
    const text = String(message.text || '');
    const observer = message.messageType === 'observer';
    if (observer && text && !notes.includes(text)) {
      notes.push(text);
      if (notes.length > 30) notes.shift();
      // Reconcile a subtitle that raced ahead of its observer metadata.
      turns.forEach(turn => {
        if (turn.message && turn.message.messageType !== 'observer') update(turn.message);
      });
    }
    const parts = observer ? { note: text, speech: '' } : splitVoiceText(text, notes);
    const key = `${message.role}:${message.turnId}`;
    let turn = turns.get(key);
    if (!turn) {
      const article = document.createElement('article');
      const column = document.createElement('div');
      column.className = 'message-column';
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      const content = document.createElement('p');
      bubble.append(content);
      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.textContent = message.role === 'user' ? 'YOU' : 'M';
      const details = document.createElement('details');
      details.className = 'voice-observer-note';
      const summary = document.createElement('summary');
      summary.textContent = '观察助手 · 小纸条';
      const note = document.createElement('p');
      details.append(summary, note);
      column.append(details, bubble);
      if (message.role === 'user') article.append(column, avatar);
      else article.append(avatar, column);
      article.className = `room-message ${message.role === 'user' ? 'learner' : 'ai'}-room-message`;
      const translation = message.role === 'assistant' ? createTranslationControl(column) : null;
      turn = { article, bubble, content, details, note, avatar, translation };
      turns.set(key, turn);
      history.append(article);
    }
    const follow = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100;
    turn.message = { ...message, text: text || turn.message?.text || '' };
    if (text || message.phase === 'start') {
      turn.content.textContent = parts.speech;
      turn.note.textContent = parts.note;
      turn.bubble.hidden = !parts.speech;
      turn.details.hidden = !parts.note;
      turn.avatar.hidden = !parts.speech;
      turn.article.hidden = !parts.speech && !parts.note;
      turn.article.classList.toggle('observer-only', !!parts.note && !parts.speech);
    }
    turn.bubble.setAttribute('aria-busy', String(!['done', 'error'].includes(message.phase)));
    turn.translation?.update(turn.content.textContent, ['done', 'error'].includes(message.phase));
    if (follow) feed.scrollTop = feed.scrollHeight;
  }
  function clear() {
    turns.forEach(turn => turn.article.remove());
    turns.clear();
    notes.length = 0;
  }
  return { update, clear };
}
