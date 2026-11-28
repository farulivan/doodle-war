import { settings } from './settings';

/**
 * Procedural audio with the Web Audio API: no sound files at all. Effects are short noise
 * and oscillator envelopes tuned to sound papery; the music is a small generative lo-fi
 * sequencer (soft keys, bass, kalimba melody and desk-tap percussion).
 */
type Sfx =
  | 'fire'
  | 'boom'
  | 'splat'
  | 'bounce'
  | 'split'
  | 'scribble'
  | 'click'
  | 'turn'
  | 'hit'
  | 'fall'
  | 'win'
  | 'lose'
  | 'pickup'
  | 'pop'
  | 'drop'
  | 'zap'
  | 'goo'
  | 'glide'
  | 'callout'
  | 'select'
  | 'whoosh'
  | 'chat';
export type Mood = 'menu' | 'battle';

const SFX_LEVEL = 0.7;
const MUSIC_LEVEL = 0.32;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// Four-chord loop: Cmaj7, Am7, Fmaj7, G6.
const CHORDS = [
  [60, 64, 67, 71],
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 59, 62, 64],
];
const BASS = [36, 33, 41, 43];
const PENTA = [72, 74, 76, 79, 81, 84, 86];
const RHYTHMS = [
  [0, 3, 6, 8, 11, 14],
  [0, 2, 4, 8, 10],
  [0, 6, 8, 12, 14],
  [2, 4, 7, 10, 12],
  [0, 4, 6, 10],
];

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  /** Ducks the music under big sound effects. */
  private duck: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private mood: Mood | null = null;
  private wantMood: Mood | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private phraseSeed = 1;

  constructor() {
    settings.subscribe(() => this.applyVolumes());
  }

  get muted(): boolean {
    return settings.get().muted;
  }

  setMuted(muted: boolean): void {
    settings.set({ muted });
  }

  /** Browsers only allow audio after a user gesture, so this runs on the first input. */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.duck = ctx.createGain();
      this.duck.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.duck);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      if (this.wantMood) this.startMusic(this.wantMood);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const s = settings.get();
    const now = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(s.muted ? 0 : 1, now, 0.03);
    this.sfxBus!.gain.setTargetAtTime(s.sfx * SFX_LEVEL, now, 0.03);
    this.musicBus!.gain.setTargetAtTime(s.music * MUSIC_LEVEL, now, 0.05);
  }

  // ---------------------------------------------------------------------------
  // Sound effects

  private noiseBurst(
    duration: number,
    filter: BiquadFilterType,
    freq: number,
    endFreq: number,
    gain: number,
    q = 1,
    out?: AudioNode,
    at?: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    const now = at ?? ctx.currentTime;
    f.frequency.setValueAtTime(freq, now);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src
      .connect(f)
      .connect(g)
      .connect(out ?? this.sfxBus!);
    src.start(now, Math.random() * 0.5, duration + 0.05);
  }

  private tone(
    type: OscillatorType,
    freq: number,
    endFreq: number,
    duration: number,
    gain: number,
    delay = 0,
    out?: AudioNode,
    at?: number,
    attack = 0.01,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    const now = (at ?? ctx.currentTime) + delay;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(out ?? this.sfxBus!);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  private duckMusic(amount: number, seconds: number): void {
    if (!this.ctx || !this.duck) return;
    const now = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(now);
    this.duck.gain.setTargetAtTime(1 - amount, now, 0.02);
    this.duck.gain.setTargetAtTime(1, now + seconds, 0.25);
  }

  play(sfx: Sfx, intensity = 1): void {
    if (!this.ctx || settings.get().muted) return;
    // A little pitch variety keeps repeats from sounding robotic.
    const v = 0.94 + Math.random() * 0.12;
    switch (sfx) {
      case 'fire':
        this.noiseBurst(0.18, 'bandpass', 1800 * v, 400, 0.5, 2);
        this.tone('triangle', 320 * v, 120, 0.12, 0.25);
        break;
      case 'boom':
        this.duckMusic(0.55, 0.5);
        this.noiseBurst(0.5 + 0.3 * intensity, 'lowpass', 1400 * v, 60, 0.9 * Math.min(1.3, intensity));
        this.noiseBurst(0.12, 'highpass', 3000, 1500, 0.25);
        this.tone('sine', 110 * v, 35, 0.45, 0.6 * Math.min(1.2, intensity));
        break;
      case 'splat':
        this.duckMusic(0.45, 0.4);
        this.noiseBurst(0.35, 'bandpass', 900 * v, 200, 0.7, 3);
        this.tone('sine', 220 * v, 60, 0.25, 0.3);
        break;
      case 'bounce':
        this.tone('sine', 180 * v, 520, 0.18, 0.35);
        break;
      case 'split':
        this.tone('square', 900 * v, 1400, 0.08, 0.1);
        break;
      case 'scribble':
        this.noiseBurst(0.22, 'highpass', 3000, 5000, 0.18, 0.7);
        this.noiseBurst(0.18, 'highpass', 3500, 5500, 0.14, 0.7, undefined, this.ctx.currentTime + 0.12);
        break;
      case 'click':
        this.tone('triangle', 900 * v, 600, 0.05, 0.15);
        break;
      case 'chat':
        // Two soft taps, like a note passed across the desk.
        this.tone('sine', 1320 * v, 1320 * v, 0.07, 0.07);
        this.tone('sine', 1760 * v, 1760 * v, 0.09, 0.06, 0.07);
        break;
      case 'turn':
        this.tone('triangle', 659, 659, 0.12, 0.16);
        this.tone('triangle', 988, 988, 0.18, 0.16, 0.09);
        break;
      case 'hit':
        this.tone('square', 260 * v, 90, 0.14, 0.12);
        break;
      case 'fall':
        this.tone('sine', 600, 120, 0.6, 0.2);
        break;
      case 'win':
        this.duckMusic(0.8, 1.4);
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.2, i * 0.11));
        break;
      case 'pickup':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.14, i * 0.05));
        break;
      case 'pop':
        this.noiseBurst(0.1, 'bandpass', 2200, 900, 0.35, 2);
        this.tone('sine', 700, 200, 0.1, 0.15);
        break;
      case 'drop':
        this.tone('sine', 1200, 500, 0.7, 0.07, 0, undefined, undefined, 0.2);
        break;
      case 'zap':
        // A laser: a falling buzz with a bright edge.
        this.duckMusic(0.35, 0.3);
        this.tone('sawtooth', 2200 * v, 260, 0.22 * Math.min(1.6, intensity), 0.11);
        this.tone('square', 3300 * v, 900, 0.12, 0.04);
        this.noiseBurst(0.08, 'highpass', 5000, 3000, 0.18);
        break;
      case 'goo':
        // A wet squelch.
        this.noiseBurst(0.28, 'lowpass', 1100 * v, 180, 0.55 * Math.min(1.3, intensity), 5);
        this.tone('sine', 190 * v, 80, 0.26, 0.3);
        this.tone('sine', 420 * v, 140, 0.12, 0.12, 0.05);
        break;
      case 'glide':
        this.noiseBurst(0.7, 'bandpass', 500, 1600, 0.22, 1.4);
        this.tone('sine', 520, 760, 0.6, 0.05, 0, undefined, undefined, 0.2);
        break;
      case 'callout':
        this.duckMusic(0.6, 0.9);
        [659, 988, 1319, 1760].forEach((f, i) => this.tone('triangle', f, f, 0.24, 0.16, i * 0.07));
        this.noiseBurst(0.5, 'highpass', 6000, 4000, 0.12, 0.6, undefined, this.ctx.currentTime + 0.2);
        break;
      case 'select':
        this.tone('triangle', 660 * v, 990, 0.12, 0.16);
        this.tone('sine', 1320 * v, 1320, 0.14, 0.06, 0.06);
        break;
      case 'whoosh':
        this.noiseBurst(0.3, 'bandpass', 800, 2400, 0.2, 1.2);
        break;
      case 'lose':
        this.duckMusic(0.8, 1.4);
        [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.97, 0.34, 0.18, i * 0.17));
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Music

  /** Picks the soundtrack; it starts once audio is unlocked by a user gesture. */
  music(mood: Mood | null): void {
    this.wantMood = mood;
    if (!this.ctx) return;
    if (mood === null) this.stopMusic();
    else if (mood !== this.mood) this.startMusic(mood);
  }

  private startMusic(mood: Mood): void {
    const ctx = this.ctx!;
    this.mood = mood;
    if (this.timer === null) {
      this.step = 0;
      this.nextTime = ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
  }

  private stopMusic(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.mood = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.mood) return;
    const bpm = this.mood === 'battle' ? 98 : 84;
    const sixteenth = 60 / bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  private playStep(step: number, t: number): void {
    if (settings.get().music <= 0 || settings.get().muted) return;
    const bus = this.musicBus!;
    const battle = this.mood === 'battle';
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = CHORDS[bar % 4];
    if (s === 0 && bar % 16 === 0) this.phraseSeed = (this.phraseSeed * 9301 + 49297) % 233280;

    // Soft keys: chord on the downbeat and the "and" of 2.
    if (s === 0 || s === 6) {
      for (const n of chord) {
        this.tone('triangle', midi(n), midi(n), 1.1, 0.045, 0, bus, t, 0.03);
        this.tone('sine', midi(n) * 1.003, midi(n) * 1.003, 1.1, 0.03, 0, bus, t, 0.03);
      }
    }
    // Bass.
    if (s === 0 || (battle && s === 10)) {
      const root = BASS[bar % 4];
      this.tone('sine', midi(root), midi(root), 0.5, 0.22, 0, bus, t, 0.01);
    }
    // Desk percussion.
    if (battle && (s === 0 || s === 8)) this.tone('sine', 130, 45, 0.18, 0.28, 0, bus, t, 0.002);
    if (s === 4 || s === 12) this.noiseBurst(0.06, 'highpass', 2500, 2000, battle ? 0.16 : 0.09, 0.8, bus, t);
    if (battle && s % 2 === 0) this.noiseBurst(0.025, 'highpass', 7000, 6000, 0.035, 0.6, bus, t);

    // Kalimba melody: seeded per bar so phrases repeat a little before changing.
    const phrase = (bar % 8) + this.phraseSeed;
    const rhythm = RHYTHMS[phrase % RHYTHMS.length];
    if (rhythm.includes(s) && !(bar % 8 === 7 && s > 8)) {
      const pick = (phrase * 31 + s * 7) % PENTA.length;
      const strong = s === 0 || s === 8;
      const note = strong ? chord[(phrase + s) % chord.length] + 12 : PENTA[pick];
      const f = midi(note);
      this.tone('sine', f, f, 0.45, 0.07, 0, bus, t, 0.005);
      this.tone('sine', f * 3, f * 3, 0.12, 0.012, 0, bus, t, 0.003);
    }
  }
}

export const audio = new Audio();
