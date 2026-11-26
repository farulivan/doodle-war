import { MAPS, UNIT_KINDS, type BotLevel, type MatchConfig, type UnitKind } from '@doodle/sim';

export interface SlotSetup {
  name: string;
  kind: UnitKind;
  controller: 'human' | 'bot';
  botLevel: BotLevel;
}

export interface SetupState {
  teamSize: 1 | 2 | 3;
  /** Three slots per team; only the first `teamSize` are used. */
  teams: [SlotSetup[], SlotSetup[]];
  mapId: string;
  /** Null means the map's default layout. */
  mapSeed: number | null;
  turnSeconds: number;
}

const STORAGE_KEY = 'doodle-war:setup:v1';

export const defaultSetup: SetupState = {
  teamSize: 1,
  teams: [
    [
      { name: 'You', kind: 'pencil', controller: 'human', botLevel: 'normal' },
      { name: 'Buddy', kind: 'squid', controller: 'bot', botLevel: 'normal' },
      { name: 'Pal', kind: 'plane', controller: 'bot', botLevel: 'normal' },
    ],
    [
      { name: 'Scribbles', kind: 'stapler', controller: 'bot', botLevel: 'normal' },
      { name: 'Smudge', kind: 'plane', controller: 'bot', botLevel: 'normal' },
      { name: 'Inky', kind: 'squid', controller: 'bot', botLevel: 'normal' },
    ],
  ],
  mapId: MAPS[0].id,
  mapSeed: null,
  turnSeconds: 30,
};

export function loadSetup(): SetupState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSetup;
    const parsed = JSON.parse(raw) as SetupState;
    if (!MAPS.some((m) => m.id === parsed.mapId)) return defaultSetup;
    const valid = parsed.teams?.every((t) => t.length === 3 && t.every((s) => UNIT_KINDS.includes(s.kind)));
    return valid ? parsed : defaultSetup;
  } catch {
    return defaultSetup;
  }
}

export function saveSetup(setup: SetupState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
}

export function toMatchConfig(setup: SetupState): MatchConfig {
  const players = [];
  // Interleave so unit ids alternate teams; it reads nicer in the turn queue.
  for (let i = 0; i < setup.teamSize; i++) {
    for (const team of [0, 1] as const) {
      const s = setup.teams[team][i];
      players.push({
        name: s.name.trim() || (s.controller === 'bot' ? 'Bot' : `Player ${team + 1}`),
        team,
        kind: s.kind,
        controller: s.controller,
        botLevel: s.botLevel,
      });
    }
  }
  return {
    mapId: setup.mapId,
    mapSeed: setup.mapSeed ?? undefined,
    seed: Math.floor(Math.random() * 1e9),
    players,
  };
}

/** One human vs one bot on a random map, using the saved unit choice. */
export function quickPlayConfig(setup: SetupState): MatchConfig {
  const you = setup.teams[0][0];
  const kinds = UNIT_KINDS.filter((k) => k !== you.kind);
  return {
    mapId: MAPS[Math.floor(Math.random() * MAPS.length)].id,
    seed: Math.floor(Math.random() * 1e9),
    players: [
      {
        name: you.controller === 'human' ? you.name || 'You' : 'You',
        team: 0,
        kind: you.kind,
        controller: 'human',
      },
      {
        name: 'Scribbles',
        team: 1,
        kind: kinds[Math.floor(Math.random() * kinds.length)],
        controller: 'bot',
        botLevel: 'normal',
      },
    ],
  };
}
