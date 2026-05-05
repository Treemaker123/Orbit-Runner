class AudioManager {
  constructor() {
    this._ctx = null;
    this._engineNodes = null;
    this._engineGain = null;
    this._enabled = true;
    this._started = false;
  }

  _getCtx() {
    if (!this._enabled) return null;
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        this._enabled = false;
      }
    }
    return this._ctx;
  }

  // Must be called from a user gesture to unlock AudioContext on iOS/Chrome
  resume() {
    const ctx = this._getCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  startEngine() {
    const ctx = this._getCtx();
    if (!ctx || this._engineGain) return;

    this._engineGain = ctx.createGain();
    this._engineGain.gain.value = 0.06;
    this._engineGain.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.connect(this._engineGain);

    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 48;

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 96;

    // Subtle chorus oscillator for spacey feel
    const o3 = ctx.createOscillator();
    o3.type = 'triangle';
    o3.frequency.value = 144;

    const g3 = ctx.createGain();
    g3.gain.value = 0.4;
    o3.connect(g3);
    g3.connect(filter);

    o1.connect(filter);
    o2.connect(filter);

    o1.start();
    o2.start();
    o3.start();

    this._engineNodes = [o1, o2, o3];
  }

  stopEngine() {
    if (this._engineNodes) {
      for (const n of this._engineNodes) {
        try { n.stop(); } catch (_) {}
      }
      this._engineNodes = null;
    }
    if (this._engineGain) {
      try { this._engineGain.disconnect(); } catch (_) {}
      this._engineGain = null;
    }
  }

  setSpeed(speed, maxSpeed) {
    const ctx = this._getCtx();
    if (!ctx || !this._engineGain || !this._engineNodes) return;
    const t = Math.max(0, Math.min(1, speed / maxSpeed));
    const now = ctx.currentTime;
    this._engineGain.gain.setTargetAtTime(0.04 + t * 0.11, now, 0.6);
    this._engineNodes[0].frequency.setTargetAtTime(42 + t * 70, now, 0.6);
    this._engineNodes[1].frequency.setTargetAtTime(84 + t * 140, now, 0.6);
    this._engineNodes[2].frequency.setTargetAtTime(126 + t * 210, now, 0.6);
  }

  playTurn() {
    const ctx = this._getCtx();
    if (!ctx) return;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.55);
    g.connect(ctx.destination);

    // Swoosh: filtered noise + descending tone
    const bufLen = Math.floor(ctx.sampleRate * 0.55);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 0.5);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 700;
    filt.Q.value = 1.5;
    noise.connect(filt);
    filt.connect(g);
    noise.start(ctx.currentTime);

    // Tonal sweep
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.2, ctx.currentTime);
    og.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    o.connect(og);
    og.connect(ctx.destination);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.55);
  }

  playCollect() {
    const ctx = this._getCtx();
    if (!ctx) return;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.22);
    g.connect(ctx.destination);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.18);
    o.connect(g);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.22);
  }

  playShieldActivate() {
    const ctx = this._getCtx();
    if (!ctx) return;

    const freqs = [440, 660, 880];
    for (let i = 0; i < 3; i++) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.09);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.09 + 0.35);
      g.connect(ctx.destination);

      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freqs[i], ctx.currentTime + i * 0.09);
      o.frequency.linearRampToValueAtTime(freqs[i] * 1.5, ctx.currentTime + i * 0.09 + 0.35);
      o.connect(g);
      o.start(ctx.currentTime + i * 0.09);
      o.stop(ctx.currentTime + i * 0.09 + 0.4);
    }
  }

  playJump() {
    const ctx = this._getCtx();
    if (!ctx) return;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    g.connect(ctx.destination);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(280, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.28);
    o.connect(g);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.3);
  }

  playHit() {
    const ctx = this._getCtx();
    if (!ctx) return;

    const dur = 0.35;
    const bufLen = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.8);
    }
    const g = ctx.createGain();
    g.gain.value = 0.45;
    g.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    src.start(ctx.currentTime);

    // Low boom
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.35);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.3, ctx.currentTime);
    og.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    o.connect(og);
    og.connect(ctx.destination);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.35);
  }

  playGameOver() {
    const ctx = this._getCtx();
    if (!ctx) return;

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.9);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.95);

    // Tail: distant echo
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(200, ctx.currentTime + 0.5);
    o2.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 1.2);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, ctx.currentTime + 0.5);
    g2.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.6);
    g2.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start(ctx.currentTime + 0.5);
    o2.stop(ctx.currentTime + 1.3);
  }
}
