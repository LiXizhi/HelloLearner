export class KeepworkAuth {
  constructor(sdk, { embedded = false } = {}) {
    this.sdk = sdk;
    this.embedded = embedded;
    this.listeners = new Set();
    this.unsubscribe = null;
    this.pendingRefresh = null;
    this.lastSignature = null;
  }

  async initialize() {
    if (typeof this.sdk?.onAuthStateChange === 'function') {
      this.unsubscribe = this.sdk.onAuthStateChange(() => { void this.refresh(); });
    }
    return this.refresh();
  }

  refresh() {
    const token = this.sdk?.token;
    if (this.pendingRefresh && this.pendingRefresh.token === token) return this.pendingRefresh.promise;
    // Defer the SDK call until the guard exists: some SDK versions emit auth
    // notifications synchronously while reading/updating the profile cache.
    const job = { token, promise: null };
    this.pendingRefresh = job;
    job.promise = Promise.resolve().then(() => this.readProfile(token)).finally(() => {
      if (this.pendingRefresh === job) this.pendingRefresh = null;
    });
    return job.promise;
  }

  async readProfile(token) {
    let profile = null;
    try {
      if (typeof this.sdk?.getUserProfile === 'function') profile = await this.sdk.getUserProfile();
      else if (typeof this.sdk?.getCurrentUser === 'function') profile = await this.sdk.getCurrentUser();
    } catch {
      profile = null;
    }
    if (this.sdk?.token !== token) return this.refresh();
    const user = profile?.user || profile || {};
    const state = {
      loggedIn: Boolean(this.sdk?.token || user.id || user.username),
      displayName: String(user.displayName || user.nickname || user.username || ''),
      avatar: String(user.avatar || user.avatarUrl || ''),
    };
    const signature = JSON.stringify([token, user.id || user.username || '', state]);
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.listeners.forEach((listener) => listener(state));
    }
    return state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async login() {
    if (this.embedded) throw new Error('请在 AIChat 顶部账号区域登录 Keepwork');
    if (typeof this.sdk?.showLoginWindow === 'function') {
      await this.sdk.showLoginWindow({ enableRegister: true });
    } else if (typeof this.sdk?.loginWindow?.show === 'function') {
      await this.sdk.loginWindow.show({ enableRegister: true });
    } else {
      throw new Error('当前 KeepworkSDK 不支持登录窗口');
    }
    return this.refresh();
  }

  async showProfile() {
    if (typeof this.sdk?.profileWindow?.show === 'function') return this.sdk.profileWindow.show();
    return null;
  }

  async logout() {
    if (typeof this.sdk?.logout === 'function') await this.sdk.logout();
    return this.refresh();
  }
}
