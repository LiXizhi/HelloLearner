const initialState = {
  phase: 'init',
  screen: 'learning',
  activeLessonId: '',
  activeScenarioId: '',
  exercise: '',
  goalIndex: 0,
  speaking: false,
  saveStatus: 'loading',
  saveMessage: '正在载入学习档案',
  auth: { loggedIn: false, displayName: '', avatar: '' },
  profile: null,
  progress: null,
  settings: null,
};

let currentState = { ...initialState };
const listeners = new Set();

export function getState() {
  return currentState;
}

export function updateState(patch) {
  currentState = { ...currentState, ...patch };
  listeners.forEach((listener) => listener(currentState));
  return currentState;
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(currentState);
  return () => listeners.delete(listener);
}
