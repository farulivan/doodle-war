import { Store } from './store';

/** The local player's record, kept in this browser. */
export interface Profile {
  played: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  damage: number;
}

const KEY = 'doodle-war:profile:v1';

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Profile;
  } catch {
    // Fall through to a fresh profile.
  }
  return { played: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, damage: 0 };
}

export const profile = new Store<Profile>(load());
profile.subscribe(() => localStorage.setItem(KEY, JSON.stringify(profile.get())));

/** Records a finished match where one human side can be said to have won or lost. */
export function recordMatch(won: boolean, damage: number): void {
  const p = profile.get();
  const streak = won ? p.streak + 1 : 0;
  profile.set({
    played: p.played + 1,
    wins: p.wins + (won ? 1 : 0),
    losses: p.losses + (won ? 0 : 1),
    streak,
    bestStreak: Math.max(p.bestStreak, streak),
    damage: p.damage + Math.round(damage),
  });
}
