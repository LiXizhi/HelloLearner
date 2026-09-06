const DEFAULT_SDK_VOICE = 'zh_female_tianmeiyueyue_moon_bigtts';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function explicitLanguageFor(language) {
  const code = String(language || '').toLowerCase();
  if (code.startsWith('zh')) return 'zh';
  if (code.startsWith('ja')) return 'ja';
  if (code.startsWith('ko')) return 'ko';
  return 'en';
}

export class SpeechController {
  constructor({ sdk = null, onState = () => {} } = {}) {
    this.sdk = sdk;
    this.onState = onState;
    this.voices = [];
    this.voicePreference = null;
    this.current = null;
    this.rtcSession = null;
    this.generation = 0;
    this.refreshVoices = this.refreshVoices.bind(this);
    if (!this.hasSdkTts()) {
      window.speechSynthesis?.addEventListener?.('voiceschanged', this.refreshVoices);
      this.refreshVoices();
    }
  }

  hasSdkTts() {
    const speech = this.sdk?.speech;
    return !!(speech?.playSynthesizedAudio || speech?.synthesizeAudio || this.sdk?.speechRTC?.createSession);
  }

  refreshVoices() {
    this.voices = window.speechSynthesis?.getVoices?.() || [];
  }

  setVoicePreference(preference) {
    this.voicePreference = preference || null;
  }

  unlockPlayback() {
    try { this.sdk?.speech?.resumeSharedAudioEngine?.(); } catch { /* ignore */ }
    if (!this.unlockAudio) {
      this.unlockAudio = new Audio();
      this.unlockAudio.preload = 'auto';
    }
    const audio = this.unlockAudio;
    if (audio.src) return;
    audio.muted = true;
    const playResult = audio.play?.();
    if (playResult?.catch) playResult.catch(() => {});
    audio.muted = false;
  }

  speak(text, { language = 'en-US', rate = 0.84, voicePreference = null } = {}) {
    this.cancel();
    this.unlockPlayback();
    const content = String(text || '').trim().slice(0, 1200);
    if (!content) return Promise.resolve(false);
    const generation = this.generation;
    const options = { language, rate, voicePreference };
    if (this.hasSdkTts()) return this.speakWithSdk(content, options, generation);
    return this.speakWithChrome(content, options, generation);
  }

  async speakWithSdk(text, { language, rate, voicePreference }, generation) {
    const preference = voicePreference || this.voicePreference || {};
    const selectedLanguage = language || preference.language;
    const voiceType = String(preference.voiceType || this.sdk.speech?.getSupportedVoices?.()?.[0]?.id || DEFAULT_SDK_VOICE);
    const speedRatio = clamp(preference.rate ?? rate, 0.5, 1.5, 0.84);
    this.onState({ speaking: true, text });
    try {
      if (this.sdk.speechRTC?.createSession) {
        await this.speakWithSpeechRtc(text, { voiceType, speedRatio }, generation);
      } else if (this.sdk.speech?.playSynthesizedAudio) {
        await this.sdk.speech.playSynthesizedAudio(text, {
          voiceType,
          encoding: 'mp3',
          speedRatio,
          explicitLanguage: explicitLanguageFor(selectedLanguage),
          fallbackMode: 'silent',
        });
      } else {
        const result = await this.sdk.speech.synthesizeAudio(text, {
          voiceType,
          encoding: 'mp3',
          speedRatio,
          explicitLanguage: explicitLanguageFor(selectedLanguage),
        });
        const base64 = result?.data?.audioBase64;
        if (!base64) throw new Error('Keepwork TTS returned empty audio');
        await this.playAudioUrl(`data:audio/mpeg;base64,${base64}`, generation);
      }
      return generation === this.generation;
    } catch (error) {
      console.warn('[HelloLearner] Keepwork TTS failed', error);
      return false;
    } finally {
      if (generation === this.generation) this.onState({ speaking: false, text: '' });
    }
  }

  async speakWithSpeechRtc(text, { voiceType, speedRatio }, generation) {
    const speechRate = Math.round(clamp((speedRatio - 1) * 50, -50, 100, 0));
    const session = this.sdk.speechRTC.createSession({
      voiceType,
      speechRate,
      audioFormat: 'mp3',
      autoPlay: false,
      enableSubtitle: false,
    });
    this.rtcSession = session;
    try {
      const result = await session.synthesize(text, {
        voiceType,
        close: true,
        closeConnection: false,
      });
      if (generation !== this.generation) return;
      const audioUrl = result?.audioUrl || session._buildAudioUrl?.();
      if (!audioUrl) throw new Error('Keepwork SpeechRTC returned empty audio');
      this.rtcSession = null;
      await this.playAudioUrl(audioUrl, generation);
    } finally {
      if (this.rtcSession === session) this.rtcSession = null;
    }
  }

  playAudioUrl(src, generation) {
    return new Promise((resolve, reject) => {
      const audio = this.unlockAudio || new Audio();
      this.unlockAudio = audio;
      audio.onended = null;
      audio.onerror = null;
      try { audio.pause(); } catch { /* ignore */ }
      audio.muted = false;
      audio.src = src;
      this.current = audio;
      audio.onended = () => {
        if (this.current === audio) this.current = null;
        resolve(generation === this.generation);
      };
      audio.onerror = () => {
        if (this.current === audio) this.current = null;
        reject(new Error('Keepwork TTS playback failed'));
      };
      const playResult = audio.play();
      if (playResult?.catch) playResult.catch(reject);
    });
  }

  async speakWithChrome(text, { language, rate, voicePreference }, generation) {
    if (!('speechSynthesis' in window)) return false;
    await sleep(50);
    if (generation !== this.generation) return false;
    if (!this.voices.length) this.refreshVoices();
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const preference = voicePreference || this.voicePreference || {};
      const selectedLanguage = language || preference.language;
      utterance.lang = selectedLanguage;
      utterance.rate = clamp(preference.rate ?? rate, 0.5, 1.5, 0.84);
      utterance.pitch = clamp(preference.pitch, 0.5, 2, 1);
      const preferredNames = preference.names || [];
      utterance.voice = this.voices.find((voice) => preferredNames.some((name) => voice.name.toLowerCase().includes(name.toLowerCase())))
        || this.voices.find((voice) => voice.lang.toLowerCase().startsWith(selectedLanguage.slice(0, 2).toLowerCase()))
        || null;
      const finish = (ok) => {
        if (this.current !== utterance || generation !== this.generation) return;
        this.current = null;
        this.onState({ speaking: false, text: '' });
        resolve(ok);
      };
      utterance.onstart = () => {
        if (generation === this.generation) this.onState({ speaking: true, text: utterance.text });
      };
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);
      this.current = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }

  cancel() {
    this.generation += 1;
    try { this.current?.pause?.(); } catch { /* ignore */ }
    this.current = null;
    this.onState({ speaking: false, text: '' });
    try { this.sdk?.speech?.stopAllAudio?.(); } catch { /* ignore */ }
    void this.rtcSession?.interrupt?.().catch(() => {});
    this.rtcSession = null;
    window.speechSynthesis?.cancel?.();
  }

  destroy() {
    this.cancel();
    window.speechSynthesis?.removeEventListener?.('voiceschanged', this.refreshVoices);
  }
}
