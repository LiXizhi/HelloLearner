import { LIVE2D_CDN } from './config.js';

const OPEN_IDS = ['ParamMouthOpenY', 'PARAM_MOUTH_OPEN_Y', 'ParamMouthUp', 'ParamA'];
const FORM_IDS = ['ParamMouthForm', 'PARAM_MOUTH_FORM'];
const DEFAULT_MODEL = { id: 'maya', name: 'Maya', model: 'littlegirl/littlegirl.model3.json' };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}

export class AvatarController {
  constructor(stage, canvas, { closeUp = false } = {}) {
    this.stage = stage;
    this.canvas = canvas;
    this.app = null;
    this.model = null;
    this.models = new Map();
    this.catalog = [DEFAULT_MODEL];
    this.selectedId = DEFAULT_MODEL.id;
    this.modelLoading = false;
    this.speaking = false;
    this.closeUp = closeUp;
    this.frame = 0;
    this.resizeObserver = null;
    this.resize = this.resize.bind(this);
    this.resume = this.resume.bind(this);
    this.toggleFraming = this.toggleFraming.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
  }

  async initialize() {
    try {
      if (!window.PIXI?.live2d?.Live2DModel) {
        await loadScript(`${LIVE2D_CDN}pixi-7.4.3.min.js`);
        await loadScript(`${LIVE2D_CDN}live2dcubismcore.min.js`);
        await loadScript(`${LIVE2D_CDN}cubism4-lipsyncpatch-0.5.0-ls-8.min.js`);
      }
      this.app = new PIXI.Application({
        view: this.canvas,
        autoStart: true,
        backgroundAlpha: 0,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      this.model = await this.loadModel(DEFAULT_MODEL);
      this.models.set(DEFAULT_MODEL.id, this.model);
      this.app.stage.addChild(this.model);
      this.canvas.hidden = false;
      this.stage.classList.toggle('is-close-up', this.closeUp);
      this.resize();
      addEventListener('resize', this.resize);
      addEventListener('focus', this.resume);
      addEventListener('pageshow', this.resume);
      document.addEventListener('visibilitychange', this.resume);
      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(this.resize);
        this.resizeObserver.observe(this.stage);
      }
      this.stage.addEventListener('click', this.toggleFraming);
      this.canvas.addEventListener('pointermove', this.onPointerMove);
      this.animateMouth();
      return true;
    } catch (error) {
      this.canvas.hidden = true;
      console.warn('[HelloLearner] Live2D unavailable', error);
      return false;
    }
  }

  resize() {
    if (!this.app || !this.model) return;
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    if (!width || !height) return;
    this.app.renderer.resize(width, height);
    const bounds = this.model.getLocalBounds();
    const fittedScale = Math.min((width * 0.78) / bounds.width, (height * 0.98) / bounds.height);
    const scale = fittedScale * (this.closeUp ? 2.8 : 1.3) * this.modelScale();
    this.model.scale.set(scale);
    this.model.x = width / 2 - (bounds.x + bounds.width / 2) * scale;
    this.model.y = 4 - bounds.y * scale;
  }

  onPointerMove(event) {
    if (!this.app || !this.model || document.hidden) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) * this.app.screen.width / rect.width;
    const y = (event.clientY - rect.top) * this.app.screen.height / rect.height;
    if (Number.isFinite(x) && Number.isFinite(y)) this.model.focus(x, y);
  }

  resume() {
    if (document.hidden || !this.app || !this.model) return;
    this.app.start();
    this.resize();
    this.app.renderer.render(this.app.stage);
  }

  setCatalog(catalog) {
    if (Array.isArray(catalog) && catalog.length) this.catalog = catalog;
  }

  modelScale() {
    const item = this.catalog.find((candidate) => candidate.id === this.selectedId);
    const value = Number(item?.scale);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  loadModel(item) {
    return PIXI.live2d.Live2DModel.from(`${LIVE2D_CDN}assets/${item.model}`, {
      // PIXI global pointer events also reach hidden canvases. Their zero-size
      // coordinate mapping poisons Live2D focus/physics with NaN permanently.
      // Use guarded canvas pointer events instead, including after retargeting.
      autoFocus: false,
      autoHitTest: false,
    });
  }

  async selectModel(id) {
    if (!this.app || this.modelLoading) return null;
    const item = this.catalog.find((candidate) => candidate.id === id);
    if (!item) return null;
    if (item.id === this.selectedId) return item;
    this.modelLoading = true;
    try {
      const nextModel = this.models.get(item.id) || await this.loadModel(item);
      const previousModel = this.model;
      if (!this.models.has(item.id)) this.models.set(item.id, nextModel);
      this.app.stage.addChild(nextModel);
      this.model = nextModel;
      this.selectedId = item.id;
      this.resize();
      if (previousModel) {
        this.app.stage.removeChild(previousModel);
      }
      return item;
    } catch (error) {
      console.warn('[HelloLearner] Unable to switch Live2D coach', error);
      return null;
    } finally {
      this.modelLoading = false;
    }
  }

  toggleFraming() {
    this.closeUp = !this.closeUp;
    this.stage.classList.toggle('is-close-up', this.closeUp);
    this.stage.setAttribute('aria-pressed', String(this.closeUp));
    this.stage.setAttribute('aria-label', this.closeUp
      ? 'AI 英语教练 Maya，上半身特写模式，点击切换为全身'
      : 'AI 英语教练 Maya，全身模式，点击切换为上半身特写');
    this.resize();
  }

  setTarget(stage, { closeUp = false } = {}) {
    if (!stage || stage === this.stage) return;
    this.stage.removeEventListener('click', this.toggleFraming);
    this.resizeObserver?.disconnect();
    this.stage = stage;
    this.closeUp = closeUp;
    this.stage.appendChild(this.canvas);
    this.canvas.hidden = !this.model;
    this.stage.classList.toggle('is-close-up', this.closeUp);
    this.stage.setAttribute('aria-pressed', String(this.closeUp));
    this.stage.addEventListener('click', this.toggleFraming);
    if (this.resizeObserver) this.resizeObserver.observe(this.stage);
    this.resize();
    this.resume();
  }

  setSpeaking(speaking) {
    this.speaking = Boolean(speaking);
    this.stage.classList.toggle('is-speaking', this.speaking);
    if (!this.speaking) this.setMouth(0, 0);
  }

  setMouth(open, form) {
    const core = this.model?.internalModel?.coreModel;
    if (!core?.setParameterValueById) return;
    OPEN_IDS.forEach((id) => { try { core.setParameterValueById(id, open); } catch {} });
    FORM_IDS.forEach((id) => { try { core.setParameterValueById(id, form); } catch {} });
  }

  getDiagnostics() {
    const bounds = this.model?.getBounds?.();
    return {
      loaded: Boolean(this.model),
      renderer: this.app ? [this.app.renderer.width, this.app.renderer.height] : [0, 0],
      modelBounds: bounds ? [bounds.x, bounds.y, bounds.width, bounds.height] : null,
      visible: Boolean(this.model?.visible),
      renderable: Boolean(this.model?.renderable),
    };
  }

  animateMouth() {
    const tick = (time) => {
      const pulse = this.speaking && !matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0.22 + Math.abs(Math.sin(time / 105)) * 0.58
        : 0;
      this.setMouth(pulse, this.speaking ? Math.sin(time / 280) * 0.18 : 0);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    removeEventListener('resize', this.resize);
    removeEventListener('focus', this.resume);
    removeEventListener('pageshow', this.resume);
    document.removeEventListener('visibilitychange', this.resume);
    this.resizeObserver?.disconnect();
    this.stage.removeEventListener('click', this.toggleFraming);
    this.setMouth(0, 0);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.models.forEach((model) => { try { model.destroy(); } catch {} });
    this.models.clear();
    try { this.app?.destroy(false, { children: false }); } catch {}
  }
}
