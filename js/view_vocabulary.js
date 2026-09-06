export function mountVocabularyReview(container, words, lessons, speak) {
  if (!words.length) { container.textContent = '暂无已学词汇'; return; }
  let index = 0;
  let checked = false;
  const prompt = document.createElement('p');
  const count = document.createElement('p');
  const listen = document.createElement('button');
  listen.type = 'button';
  listen.textContent = '▷';
  listen.title = '播放单词';
  listen.setAttribute('aria-label', '播放单词');
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.className = 'border rounded p-2 w-full';
  input.setAttribute('aria-label', '英文单词');
  input.autocomplete = 'off';
  input.spellcheck = false;
  const submit = document.createElement('button');
  submit.className = 'border rounded p-2 mt-2';
  submit.textContent = '检查答案';
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'status');
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = '下一个';
  next.className = 'border rounded p-2';
  const render = () => {
    const word = words[index];
    const entry = lessons.flatMap(lesson => lesson.vocabulary || []).find(item => item[0].toLowerCase() === word.toLowerCase());
    prompt.textContent = entry?.[2] && entry[2] !== word ? entry[2] : '听音写词';
    count.textContent = `${index + 1} / ${words.length}`;
    input.value = '';
    feedback.textContent = '';
    next.hidden = true;
    submit.disabled = false;
    checked = false;
  };
  listen.addEventListener('click', () => speak(words[index]));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!input.value.trim() || checked) return;
    checked = true;
    feedback.textContent = input.value.trim().toLowerCase() === words[index].toLowerCase() ? '回答正确' : `参考答案：${words[index]}`;
    submit.disabled = true;
    next.hidden = false;
    next.textContent = index === words.length - 1 ? '再练一轮' : '下一个';
  });
  next.addEventListener('click', () => { index = (index + 1) % words.length; render(); input.focus(); });
  form.append(input, submit);
  container.append(count, prompt, listen, form, feedback, next);
  render();
}