import { MAPS, UNIT_KINDS, type BotLevel, type MatchConfig, type UnitKind } from '@doodle/sim';

export interface SlotSetup {
  name: string;
  kind: UnitKind;
  controller: 'human' | 'bot';
  botLevel: BotLevel;
}

export interface QuickSetup {
  botLevel: BotLevel;
  /** The bot's doodle, or 'random' for a different one each match. */
  opponent: UnitKind | 'random';
}

export interface SetupState {
  teamSize: 1 | 2 | 3;
  /** Three slots per team; only the first `teamSize` are used. */
  teams: [SlotSetup[], SlotSetup[]];
  /** A map id, or 'random'. */
  mapId: string;
  /** Null means the map's default layout. */
  mapSeed: number | null;
  turnSeconds: number;
  quick: QuickSetup;
}

const STORAGE_KEY = 'doodle-war:setup:v2';

export const defaultSetup: SetupState = {
  teamSize: 1,
  teams: [
    [
      { name: 'You', kind: 'pencil', controller: 'human', botLevel: 'normal' },
      { name: 'Buddy', kind: 'squid', controller: 'bot', botLevel: 'normal' },
      { name: 'Pal', kind: 'glue', controller: 'bot', botLevel: 'normal' },
    ],
    [
      { name: 'Scribbles', kind: 'stapler', controller: 'bot', botLevel: 'normal' },
      { name: 'Smudge', kind: 'highlighter', controller: 'bot', botLevel: 'normal' },
      { name: 'Inky', kind: 'plane', controller: 'bot', botLevel: 'normal' },
    ],
  ],
  mapId: MAPS[0].id,
  mapSeed: null,
  turnSeconds: 30,
  quick: { botLevel: 'normal', opponent: 'random' },
};

export function loadSetup(): SetupState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('doodle-war:setup:v1');
    if (!raw) return defaultSetup;
    const parsed = JSON.parse(raw) as Partial<SetupState>;
    const mapOk = parsed.mapId === 'random' || MAPS.some((m) => m.id === parsed.mapId);
    const teamsOk = parsed.teams?.every((t) => t.length === 3 && t.every((s) => UNIT_KINDS.includes(s.kind)));
    if (!mapOk || !teamsOk) return defaultSetup;
    const quick = { ...defaultSetup.quick, ...parsed.quick };
    if (quick.opponent !== 'random' && !UNIT_KINDS.includes(quick.opponent)) quick.opponent = 'random';
    return { ...defaultSetup, ...parsed, quick } as SetupState;
  } catch {
    return defaultSetup;
  }
}

export function saveSetup(setup: SetupState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
}

function resolveMap(setup: SetupState): { mapId: string; mapSeed: number | undefined } {
  if (setup.mapId === 'random')
    return { mapId: MAPS[Math.floor(Math.random() * MAPS.length)].id, mapSeed: undefined };
  return { mapId: setup.mapId, mapSeed: setup.mapSeed ?? undefined };
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
  return { ...resolveMap(setup), seed: Math.floor(Math.random() * 1e9), players };
}

/** One human against one bot, with the doodle and the stage picked on the select screens. */
export function quickPlayConfig(setup: SetupState): MatchConfig {
  const you = setup.teams[0][0];
  const others = UNIT_KINDS.filter((k) => k !== you.kind);
  const opponent =
    setup.quick.opponent === 'random'
      ? others[Math.floor(Math.random() * others.length)]
      : setup.quick.opponent;
  return {
    ...resolveMap(setup),
    seed: Math.floor(Math.random() * 1e9),
    players: [
      {
        name: you.controller === 'human' ? you.name || 'You' : 'You',
        team: 0,
        kind: you.kind,
        controller: 'human',
      },
      { name: 'Scribbles', team: 1, kind: opponent, controller: 'bot', botLevel: setup.quick.botLevel },
    ],
  };
}
