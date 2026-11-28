import { MAPS, UNITS, type UnitKind } from '@doodle/sim';

/** How each doodle is presented on the select screen. The numbers come from the rules where they can. */

export interface RosterInfo {
  /** One line that sells the doodle. */
  pitch: string;
  /** The doodle's own color, for its card and name. */
  accent: string;
  /** 1 to 5. */
  firepower: number;
  control: number;
  /** 1 easy, 3 tricky. */
  difficulty: 1 | 2 | 3;
  strengths: string[];
  weaknesses: string[];
}

export const ROSTER: Record<UnitKind, RosterInfo> = {
  pencil: {
    pitch: 'Point, shoot, and dig them out of any hole.',
    accent: '#d99a1c',
    firepower: 4,
    control: 2,
    difficulty: 1,
    strengths: ['Easy to pick up', 'Sharpener tunnels through cover', 'Longest Draw line'],
    weaknesses: ['No tricks of its own'],
  },
  squid: {
    pitch: 'Slow them down, push their turns back, win the tempo.',
    accent: '#7350d0',
    firepower: 2,
    control: 5,
    difficulty: 2,
    strengths: ['Wide, forgiving splashes', 'Inked enemies walk less and act later'],
    weaknesses: ['Least damage per hit'],
  },
  plane: {
    pitch: 'Ride the wind, cross the gaps, strike from anywhere.',
    accent: '#5b8fd6',
    firepower: 3,
    control: 2,
    difficulty: 3,
    strengths: ['Fastest on its feet', 'Glides across gaps', 'Darts ride a tailwind for huge range'],
    weaknesses: ['Fragile', 'Headwinds wreck its darts'],
  },
  stapler: {
    pitch: 'Walk slow, hit hard, shrug off the splash.',
    accent: '#22957c',
    firepower: 4,
    control: 2,
    difficulty: 1,
    strengths: ['Most health, plated against splash', 'Fast, flat, precise staples'],
    weaknesses: ['Slowest walker', 'A big target'],
  },
  highlighter: {
    pitch: 'If you can see it, you can hit it.',
    accent: '#7a9e14',
    firepower: 3,
    control: 3,
    difficulty: 2,
    strengths: [
      'Beams ignore wind and gravity',
      'Laser sight shows the exact line',
      'Overdrive pierces cover and crowds',
    ],
    weaknesses: ['Needs a clear line of sight', 'Fragile'],
  },
  glue: {
    pitch: 'Build the battlefield you want, then glue them to it.',
    accent: '#e0761e',
    firepower: 3,
    control: 4,
    difficulty: 3,
    strengths: [
      'Builds walls, bridges and bunkers',
      'Super Glue roots enemies for a turn',
      'Climbs steep slopes',
    ],
    weaknesses: ["Can't fire flat", 'Light damage'],
  },
};

const hps = Object.values(UNITS).map((u) => u.hp);
const moves = Object.values(UNITS).map((u) => u.moveBudget);

/** A 1-to-5 rating of a value within the roster's range. */
function rate(value: number, all: number[]): number {
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return 1 + Math.round(((value - lo) / (hi - lo || 1)) * 4);
}

export function statsFor(kind: UnitKind): { label: string; value: number; note: string }[] {
  const u = UNITS[kind];
  const r = ROSTER[kind];
  return [
    { label: 'Health', value: rate(u.hp, hps), note: `${u.hp}` },
    { label: 'Mobility', value: rate(u.moveBudget, moves), note: `${u.moveBudget}px` },
    { label: 'Firepower', value: r.firepower, note: '' },
    { label: 'Control', value: r.control, note: '' },
  ];
}

export interface StageInfo {
  /** Short tags for what makes the map play differently. */
  tags: string[];
  /** Which doodles shine here. */
  favors: UnitKind[];
  size: 'Medium' | 'Large' | 'Tall';
}

export const STAGES: Record<string, StageInfo> = {
  'margin-hills': { tags: ['Rolling hills', 'Hidden caves'], favors: ['pencil', 'squid'], size: 'Large' },
  'sticky-notes': { tags: ['Islands', 'Bottomless page'], favors: ['plane', 'glue'], size: 'Large' },
  'coffee-ring': { tags: ['Deep valley', 'High ground'], favors: ['stapler', 'squid'], size: 'Large' },
  'spiral-tower': { tags: ['Central tower', 'Lob or dig'], favors: ['pencil', 'highlighter'], size: 'Tall' },
  'paper-bridges': {
    tags: ['Thin bridges', 'Long sightlines', 'Windiest'],
    favors: ['highlighter', 'stapler'],
    size: 'Large',
  },
};

export function windLabel(windMax: number): string {
  return windMax >= 10 ? 'Gusty' : windMax >= 9 ? 'Windy' : windMax >= 8 ? 'Breezy' : 'Calm';
}

export function mapById(id: string) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
