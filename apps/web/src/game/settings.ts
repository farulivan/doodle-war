import { Store } from './store';

export interface Settings {
  /** Master mute, toggled with M or the speaker button. */
  muted: boolean;
  music: number;
  sfx: number;
  screenShake: boolean;
  /** Faint line showing where your previous shot went. */
  tracer: boolean;
  /** Fewer particles and no camera shake, for comfort or slow devices. */
  reducedMotion: boolean;
}

const KEY = 'doodle-war:settings:v1';
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const defaults: Settings = {
  muted: false,
  music: 0.5,
  sfx: 0.8,
  screenShake: !prefersReduced,
  tracer: true,
  reducedMotion: prefersReduced,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    // Older builds stored a separate mute flag; respect it once.
    const legacyMuted = localStorage.getItem('doodle-war:muted') === '1';
    const base = raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : { ...defaults };
    if (!raw && legacyMuted) base.muted = true;
    return base;
  } catch {
    return { ...defaults };
  }
}

export const settings = new Store<Settings>(load());
settings.subscribe(() => localStorage.setItem(KEY, JSON.stringify(settings.get())));
