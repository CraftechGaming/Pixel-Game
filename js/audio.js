'use strict';
// ---------------------------------------------------------------------------
// Sound: every effect is synthesised with the Web Audio API (no audio files),
// plus a gentle generative soundtrack that changes between day and night.
// ---------------------------------------------------------------------------

const MATERIAL_FREQ = { stone: 1400, dirt: 520, wood: 900, glass: 3200, sand: 700, plant: 1800, cloth: 600, metal: 2600, snow: 1100, water: 800 };

const Sound = {
  ctx: null, master: null, sfx: null, musicBus: null, noiseBuf: null,
  enabled: true, musicOn: true, night: false,
  last: {}, beat: 0, nextNote: 0,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.enabled ? 0.55 : 0; this.sfx.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicOn ? 0.16 : 0;
    const delay = c.createDelay(1); delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.38;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.musicBus.connect(this.master); this.musicBus.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  setEnabled(v) { this.enabled = v; if (this.sfx) this.sfx.gain.value = v ? 0.55 : 0; },
  setMusic(v) { this.musicOn = v; if (this.musicBus) this.musicBus.gain.value = v ? 0.16 : 0; },

  tone(freq, dur, o = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + o.slide), t + dur);
    const vol = o.vol === undefined ? 0.15 : o.vol;
    const att = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.dest || this.sfx);
    osc.start(t); osc.stop(t + dur + 0.05);
  },
  noise(dur, o = {}) {
    const c = this.ctx; if (!c || !this.noiseBuf) return;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, (o.freq || 1000) + o.slide), t + dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol === undefined ? 0.2 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },

  play(name, o = {}) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const gap = { whoosh: 0.15, countdown: 0.3, step: 0.11, dig: 0.07, place: 0.04, grow: 0.08, talk: 0.5, honk: 1.5, chicken: 2, pig: 2, sheep: 2, pop: 0.05, splash: 0.2 }[name] || 0.02;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const mat = o.block !== undefined && BLOCKS[o.block] ? BLOCKS[o.block].sound : 'stone';
    const mf = MATERIAL_FREQ[mat] || 1000;
    switch (name) {
      case 'jump': this.tone(330, 0.12, { slide: 220, vol: 0.06 }); break;
      case 'land': this.noise(0.09, { filter: 'lowpass', freq: 500, vol: 0.25 * (o.vol || 0.5) }); break;
      case 'step': this.noise(0.05, { freq: mf * 0.8, vol: 0.05, q: 1.5 }); break;
      case 'dig': this.noise(0.06, { freq: mf, vol: 0.12, q: 2 }); break;
      case 'break': this.noise(0.16, { freq: mf, vol: 0.28, q: 1.2, slide: -mf * 0.5 }); this.tone(mf / 8, 0.08, { type: 'triangle', vol: 0.08 }); break;
      case 'place': this.tone(160 + mf / 20, 0.07, { type: 'triangle', vol: 0.16 }); this.noise(0.04, { freq: mf, vol: 0.08 }); break;
      case 'splash': this.noise(0.4, { freq: 1100, slide: -800, vol: 0.22, q: 0.8 }); break;
      case 'bounce': this.tone(220, 0.25, { type: 'sine', slide: 520, vol: 0.18 }); break;
      case 'boost': this.tone(380, 0.3, { type: 'sawtooth', slide: 700, vol: 0.05 }); this.noise(0.3, { filter: 'highpass', freq: 1500, vol: 0.08 }); break;
      case 'start': [440, 660].forEach((f, i) => this.tone(f, 0.14, { delay: i * 0.1, vol: 0.09 })); break;
      case 'check': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.14, { delay: i * 0.08, vol: 0.08 })); break;
      case 'finish':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { delay: i * 0.11, vol: 0.09 }));
        [523, 659, 784].forEach(f => this.tone(f, 1.2, { type: 'triangle', delay: 0.5, vol: 0.06, attack: 0.03 }));
        break;
      case 'grow': this.tone(880 + Math.random() * 200, 0.15, { type: 'sine', slide: 500, vol: 0.06 }); break;
      case 'growBig': [523, 659, 784, 988, 1175].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', delay: i * 0.09, vol: 0.07 })); break;
      case 'click': this.tone(620, 0.03, { vol: 0.04 }); break;
      case 'open': this.tone(420, 0.08, { type: 'triangle', slide: 200, vol: 0.08 }); break;
      case 'close': this.tone(600, 0.08, { type: 'triangle', slide: -200, vol: 0.07 }); break;
      case 'talk': for (let i = 0; i < 3; i++) this.tone(260 + Math.random() * 240, 0.06, { delay: i * 0.08, vol: 0.035 }); break;
      case 'chicken': this.tone(950, 0.06, { vol: 0.04, slide: 300 }); this.tone(1050, 0.06, { vol: 0.04, delay: 0.1 }); break;
      case 'pig': this.tone(170, 0.2, { type: 'sawtooth', slide: -60, vol: 0.04 }); break;
      case 'sheep': this.tone(320, 0.35, { type: 'sawtooth', slide: -40, vol: 0.035 }); break;
      case 'honk': this.tone(330, 0.2, { vol: 0.05 }); this.tone(415, 0.2, { vol: 0.05 }); break;
      case 'explode': this.noise(1.0, { filter: 'lowpass', freq: 900, slide: -820, vol: 0.7, q: 0.6 }); this.tone(70, 0.5, { type: 'sine', slide: -30, vol: 0.4 }); break;
      case 'fuse': this.noise(0.4, { filter: 'highpass', freq: 3000, vol: 0.07 }); break;
      case 'pop': this.noise(0.08, { freq: 2200, vol: 0.12 }); this.tone(700 + Math.random() * 500, 0.1, { type: 'sine', vol: 0.05 }); break;
      case 'respawn': this.tone(300, 0.3, { type: 'sine', slide: 300, vol: 0.1 }); break;
      case 'hurt': this.tone(240, 0.2, { slide: -120, vol: 0.1 }); break;
      case 'sleep': [660, 523, 392].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', delay: i * 0.3, vol: 0.07, attack: 0.05 })); break;
      case 'error': this.tone(200, 0.08, { vol: 0.06 }); this.tone(170, 0.1, { vol: 0.06, delay: 0.1 }); break;
      case 'whoosh': this.noise(0.35, { filter: 'bandpass', freq: 600, slide: 1400, vol: 0.18, q: 0.7 }); this.tone(500, 0.2, { type: 'sine', slide: -300, vol: 0.06 }); break;
      case 'countdown': this.tone(523, 0.18, { type: 'square', vol: 0.08 }); break;
      case 'go': [784, 1046].forEach((f, i) => this.tone(f, 0.3, { type: 'square', vol: 0.08, delay: i * 0.08 })); break;
      case 'qualify': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, { delay: i * 0.09, vol: 0.08 })); [523, 659, 784].forEach(f => this.tone(f, 1.4, { type: 'triangle', delay: 0.5, vol: 0.06, attack: 0.03 })); break;
      case 'eliminated': [392, 330, 262].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', delay: i * 0.22, vol: 0.09 })); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.07, { freq: 900, vol: 0.12, delay: i * 0.12 }); break;
      case 'craft': this.tone(330, 0.08, { type: 'triangle', vol: 0.1 }); this.tone(494, 0.12, { type: 'triangle', vol: 0.1, delay: 0.07 }); this.noise(0.08, { freq: 1200, vol: 0.08 }); break;
      case 'discover': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.9, { type: 'triangle', delay: i * 0.16, vol: 0.06, attack: 0.04 })); break;
      default: break;
    }
  },

  musicTick() {
    const c = this.ctx;
    if (!c || !this.musicOn) return;
    const t = c.currentTime;
    if (t < this.nextNote) return;
    const night = this.night;
    const day = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
    const nite = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    const scale = night ? nite : day;
    const prog = night ? [0, 3, 1, 4] : [0, 4, 5, 3];
    if (this.beat % 8 === 0) {
      const root = scale[prog[(this.beat / 8) % prog.length]] / 2;
      [1, 1.25, 1.5].forEach(m => this.tone(root * m, 4.2, { type: 'sine', vol: 0.05, attack: 1.2, dest: this.musicBus }));
    }
    if (Math.random() < (night ? 0.4 : 0.55)) {
      const f = scale[Math.floor(Math.random() * scale.length)];
      this.tone(f, 1.4, { type: 'triangle', vol: 0.06, attack: 0.02, dest: this.musicBus });
    }
    this.beat++;
    this.nextNote = t + (night ? 0.8 : 0.55);
  },
};
