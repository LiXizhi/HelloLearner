import { $ } from './utils.js';
import { renderProgressSummary } from './view_progress.js?v=20260905c';

let accountMenu;

function createAccountMenu(accountButton) {
  const menu = document.createElement('div');
  menu.id = 'accountMenu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-labelledby', 'accountButton');
  menu.className = 'absolute right-3 top-full mt-2 w-48 max-w-[calc(100vw-24px)] rounded-lg border border-[#174f46]/15 bg-white p-1.5 text-sm text-[#174f46] shadow-xl';
  const items = [
    ['onProfile', '用户信息', '○'],
    ['onSettings', '用户设置', '○'],
    ['onSystemSettings', '系统设置', '⚙'],
    ['onLogin', '登录 / 注册', '↪'],
    ['onLogout', '退出登录', '↗'],
  ];
  for (const [action, label, icon] of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
    button.className = `flex w-full items-center gap-3 rounded px-3 py-3 text-left hover:bg-[#edf3e4] focus:bg-[#edf3e4] focus:outline-none ${action === 'onLogout' ? 'border-t border-[#174f46]/10 text-red-700' : ''}`;
    const symbol = document.createElement('span');
    symbol.setAttribute('aria-hidden', 'true');
    symbol.className = 'w-4 text-center';
    symbol.textContent = icon;
    button.append(symbol, document.createTextNode(label));
    menu.append(button);
  }
  $('integrationBar').append(menu);
  accountButton.setAttribute('aria-haspopup', 'menu');
  accountButton.setAttribute('aria-controls', menu.id);
  accountButton.setAttribute('aria-expanded', 'false');
  const visibleItems = () => [...menu.querySelectorAll('button')].filter((button) => !button.hidden);
  const close = (restoreFocus = false) => {
    menu.hidden = true;
    accountButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus) accountButton.focus();
  };
  const open = (last = false) => {
    menu.hidden = false;
    accountButton.setAttribute('aria-expanded', 'true');
    const buttons = visibleItems();
    buttons[last ? buttons.length - 1 : 0]?.focus();
  };
  const controller = { menu, close, callbacks: {} };
  accountButton.onclick = () => menu.hidden ? open() : close(true);
  accountButton.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    open(event.key === 'ArrowUp');
  });
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    close(true);
    controller.callbacks[button.dataset.action]?.();
  });
  menu.addEventListener('keydown', (event) => {
    const buttons = visibleItems();
    const index = buttons.indexOf(document.activeElement);
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  });
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && !accountButton.contains(event.target)) close();
  });
  document.addEventListener('focusin', (event) => {
    if (!menu.contains(event.target) && !accountButton.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      close(true);
    }
  });
  return controller;
}

export function renderShell(state, { onLogin, onProfile, onSettings, onSystemSettings, onLogout } = {}) {
  const accountButton = $('accountButton');
  const saveStatus = $('saveStatus');
  const saveDot = $('saveStatusDot');
  if (!accountButton) return;

  saveStatus.textContent = state.saveMessage;
  saveDot.dataset.status = state.saveStatus;

  accountButton.disabled = state.phase === 'init' || state.phase === 'sdk-loading';
  accountButton.textContent = `${state.auth.loggedIn ? state.auth.displayName || '我的账号' : '登录 / 注册'} ▾`;
  if (accountButton.disabled && !state.auth.loggedIn) accountButton.textContent = '正在加载账号…';
  accountButton.classList.add('max-w-[45vw]', 'truncate');
  accountMenu ||= createAccountMenu(accountButton);
  accountMenu.callbacks = { onLogin, onProfile, onSettings, onSystemSettings, onLogout };
  if (accountMenu.loggedIn !== state.auth.loggedIn) accountMenu.close();
  accountMenu.loggedIn = state.auth.loggedIn;
  for (const button of accountMenu.menu.querySelectorAll('button')) {
    const action = button.dataset.action;
    button.hidden = action === 'onLogin' ? state.auth.loggedIn : action === 'onLogout' || action === 'onProfile' ? !state.auth.loggedIn : false;
  }
}

export function applyLearnerProjections(records) {
  const profile = records.profile;
  const progress = records.progress;
  renderProgressSummary(progress);
  const completedCount = Object.keys(progress.completedLessons || {}).length;
  const activityDates = progress.activityDates || [];
  const latestWeek = activityDates.slice(-7);
  const speaking = progress.speakingMinutesByDate || {};
  const speakingTotal = latestWeek.reduce((sum, date) => sum + Number(speaking[date] || 0), 0);

  document.querySelectorAll('.day-streak strong, .progress-streak strong').forEach((node) => { node.textContent = String(stateSafeStreak(activityDates)); });
  const completedMetric = document.querySelector('.profile-stats > div:nth-child(2) strong');
  if (completedMetric) completedMetric.textContent = String(completedCount);
  if ($('speakingTotalMinutes')) $('speakingTotalMinutes').textContent = speakingTotal.toFixed(1).replace('.0', '');
  if ($('speakingDailyAverage')) $('speakingDailyAverage').textContent = (speakingTotal / 7).toFixed(1);
  if ($('speakingDailyGoal')) $('speakingDailyGoal').textContent = String(profile.dailyTargetMinutes || 10);
  window.helloLearnerRuntime?.applyProfile(profile);
}

function stateSafeStreak(activityDates) {
  const dates = new Set(activityDates);
  const cursor = new Date();
  let count = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    count += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}
