export const APP_ID = 'language-learner';
export const APP_NAME = 'LanguageLearner';
export const CHANNEL = 'aichat.external-tool.v1';
export const DEFAULT_WORKSPACE = 'HelloLearner';
export const SCHEMA_VERSION = 1;
export const DATA_ROOT = '.hellolearner';
export const SDK_CDN_URL = 'https://cdn.keepwork.com/sdk/keepworkSDK.iife.js?v=1c493a6eeff0';
export const LIVE2D_CDN = 'https://cdn.keepwork.com/digitalhuman/live2d/';
export const TUTOR_SKILL_ID = 'local-language-learner';

const params = new URLSearchParams(location.search);

export const runtimeConfig = Object.freeze({
  embedded: window.parent !== window,
  token: params.get('token') || '',
  workspace: sanitizeWorkspace(params.get('workspace')),
  language: params.get('lang') === 'en-US' ? 'en-US' : 'zh-CN',
});

export function sanitizeWorkspace(value) {
  const candidate = String(value || '').trim();
  return candidate && candidate.length <= 64 && /^[\p{L}\p{N} _-]+$/u.test(candidate)
    ? candidate
    : DEFAULT_WORKSPACE;
}
