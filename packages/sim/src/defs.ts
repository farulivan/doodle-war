export type UnitKind = 'pencil' | 'squid' | 'plane' | 'stapler' | 'highlighter' | 'glue';

export type ProjectileSprite =
  | 'graphite'
  | 'lead'
  | 'drill'
  | 'ink'
  | 'inkDrop'
  | 'dart'
  | 'crumple'
  | 'staple'
  | 'band'
  | 'beam'
  | 'megabeam'
  | 'cap'
  | 'glob'
  | 'wall'
  | 'superglue';

export interface ProjectileDef {
  sprite: ProjectileSprite;
  damage: number;
  /** Explosion radius in px. Also the crater size. */
  radius: number;
  gravityScale?: number;
  windScale?: number;
  speedScale?: number;
  /** Terrain bounces before exploding. */
  bounces?: number;
  restitution?: number;
  /** Distance in px the projectile tunnels through terrain before exploding. */
  drill?: number;
  /** Ink slows the units it hits on their next turn, and pushes that turn back. */
  ink?: boolean;
  /** Splits into children at the top of its arc instead of flying on. */
  split?: { count: number; spreadDeg: number; child: ProjectileDef };
  /**
   * Bursts after flying this far at full power, less at lower power. Beams use it, so power picks where
   * a straight shot goes off.
   */
  range?: number;
  /** Passes through units, hitting each once, and keeps going. */
  pierce?: boolean;
  /** Builds a mound of glue this big where it lands, instead of digging a crater. */
  build?: number;
  /** Units it hits can't walk or hop on their next turn. */
  root?: boolean;
  /** Units it hits take extra damage from the next hit. */
  mark?: boolean;
}

export interface WeaponSpawn {
  def: ProjectileDef;
  angleOffset?: number;
  powerScale?: number;
  delayTicks?: number;
}

export type WeaponSlot = 0 | 1 | 2;

export interface WeaponDef {
  id: string;
  name: string;
  blurb: string;
  /** Turn delay added after firing. Bigger weapons make you wait longer. */
  delay: number;
  spawns: WeaponSpawn[];
}

export interface UnitDef {
  kind: UnitKind;
  name: string;
  /** The job this doodle does on a team, in a word or two. */
  role: string;
  blurb: string;
  /** The rule this doodle bends, always on. */
  passive: { name: string; text: string };
  hp: number;
  /** Pixels of walking per turn. */
  moveBudget: number;
  /** Aim range relative to the body, in degrees above forward. */
  angleMin: number;
  angleMax: number;
  bodyRadius: number;
  /**
   * Where the barrel turns, measured from the feet of a doodle facing right, and how long it is. Shots
   * leave from its tip, which is where the art draws it.
   */
  mount: { x: number; y: number; length: number };
  /** [shot 1, shot 2, special]. The special needs a full meter. */
  weapons: [WeaponDef, WeaponDef, WeaponDef];
  /** Longest line its Draw can ink. */
  drawLength?: number;
  /** How far it glides after walking off a ledge, instead of dropping. */
  glide?: number;
  /** Splash damage it takes, as a fraction. Direct hits still land in full. */
  splashTaken?: number;
  /** Tallest step it can walk up, in px. */
  climb?: number;
}

const graphite: ProjectileDef = { sprite: 'graphite', damage: 260, radius: 34 };
const lead: ProjectileDef = { sprite: 'lead', damage: 150, radius: 24 };
const drill: ProjectileDef = { sprite: 'drill', damage: 380, radius: 46, drill: 130, windScale: 0.7 };

const inkBlot: ProjectileDef = { sprite: 'ink', damage: 220, radius: 40, ink: true };
const inkDrop: ProjectileDef = { sprite: 'inkDrop', damage: 115, radius: 27, ink: true };

const dart: ProjectileDef = {
  sprite: 'dart',
  damage: 235,
  radius: 30,
  gravityScale: 0.55,
  windScale: 1.8,
  speedScale: 0.82,
};
const crumple: ProjectileDef = {
  sprite: 'crumple',
  damage: 275,
  radius: 32,
  gravityScale: 1.35,
  windScale: 0.35,
  speedScale: 1.12,
};
const squadronDart: ProjectileDef = { ...dart, damage: 175 };

const staple: ProjectileDef = {
  sprite: 'staple',
  damage: 245,
  radius: 22,
  speedScale: 1.18,
  gravityScale: 0.9,
  windScale: 0.5,
};
const band: ProjectileDef = { sprite: 'band', damage: 230, radius: 30, bounces: 2, restitution: 0.62 };
const stormStaple: ProjectileDef = { ...staple, damage: 120, radius: 20 };

const beam: ProjectileDef = {
  sprite: 'beam',
  damage: 175,
  radius: 24,
  gravityScale: 0,
  windScale: 0,
  speedScale: 3,
  range: 1500,
};
const cap: ProjectileDef = { sprite: 'cap', damage: 190, radius: 30, mark: true };
const megabeam: ProjectileDef = {
  sprite: 'megabeam',
  damage: 250,
  radius: 32,
  gravityScale: 0,
  windScale: 0,
  speedScale: 3.4,
  range: 2000,
  pierce: true,
  drill: 260,
};

const glob: ProjectileDef = { sprite: 'glob', damage: 225, radius: 31, windScale: 0.85 };
const wall: ProjectileDef = { sprite: 'wall', damage: 40, radius: 14, build: 42, windScale: 0.85 };
const superglue: ProjectileDef = { sprite: 'superglue', damage: 290, radius: 46, root: true, windScale: 0.8 };

export const UNITS: Record<UnitKind, UnitDef> = {
  pencil: {
    kind: 'pencil',
    name: 'Pencil Tank',
    role: 'All-rounder',
    blurb: 'Steady and reliable. Its special drills through the ground before it goes off.',
    passive: { name: 'Sketch Artist', text: 'Its Draw line can be 60% longer.' },
    hp: 1000,
    moveBudget: 180,
    angleMin: 0,
    angleMax: 90,
    bodyRadius: 16,
    mount: { x: 4, y: -31, length: 30 },
    drawLength: 270,
    weapons: [
      {
        id: 'graphite',
        name: 'Graphite Shell',
        blurb: 'A solid lump of pencil lead.',
        delay: 600,
        spawns: [{ def: graphite }],
      },
      {
        id: 'twin-lead',
        name: 'Twin Lead',
        blurb: 'Two smaller shells, one short and one long.',
        delay: 700,
        spawns: [{ def: lead }, { def: lead, powerScale: 0.9, delayTicks: 8 }],
      },
      {
        id: 'sharpener',
        name: 'Sharpener',
        blurb: 'Tunnels through cover, then goes off big.',
        delay: 900,
        spawns: [{ def: drill }],
      },
    ],
  },
  squid: {
    kind: 'squid',
    name: 'Ink Squid',
    role: 'Controller',
    blurb: 'Splashes sticky ink. What it hits moves less and waits longer for its next turn.',
    passive: { name: 'Sticky Ink', text: 'Inked enemies walk half as far, and their next turn comes later.' },
    hp: 950,
    moveBudget: 170,
    angleMin: 0,
    angleMax: 90,
    bodyRadius: 16,
    mount: { x: 4, y: -17, length: 27 },
    weapons: [
      {
        id: 'ink-blot',
        name: 'Ink Blot',
        blurb: 'A wide, forgiving splash.',
        delay: 600,
        spawns: [{ def: inkBlot }],
      },
      {
        id: 'splatter',
        name: 'Splatter',
        blurb: 'Splits into three drops at the top of its arc.',
        delay: 720,
        spawns: [
          {
            def: { ...inkDrop, sprite: 'ink', damage: 0, split: { count: 3, spreadDeg: 16, child: inkDrop } },
          },
        ],
      },
      {
        id: 'ink-storm',
        name: 'Ink Storm',
        blurb: 'Bursts into a rain of seven drops.',
        delay: 950,
        spawns: [
          {
            def: {
              ...inkDrop,
              sprite: 'ink',
              damage: 0,
              split: { count: 7, spreadDeg: 44, child: { ...inkDrop, damage: 110, radius: 28 } },
            },
          },
        ],
      },
    ],
  },
  plane: {
    kind: 'plane',
    name: 'Paper Plane',
    role: 'Skirmisher',
    blurb: 'The fastest doodle and the most fragile. Its darts ride the wind across the page.',
    passive: { name: 'Glide', text: 'Walks off ledges into a glide, and can cross gaps.' },
    hp: 880,
    moveBudget: 230,
    angleMin: 0,
    angleMax: 85,
    bodyRadius: 15,
    mount: { x: -2, y: -25, length: 26 },
    glide: 96,
    weapons: [
      {
        id: 'dart',
        name: 'Paper Dart',
        blurb: 'A light glider. The wind pushes it hard.',
        delay: 580,
        spawns: [{ def: dart }],
      },
      {
        id: 'crumple',
        name: 'Crumple Ball',
        blurb: 'Heavy and drops fast. The wind barely moves it.',
        delay: 650,
        spawns: [{ def: crumple }],
      },
      {
        id: 'squadron',
        name: 'Squadron',
        blurb: 'Three darts in formation.',
        delay: 950,
        spawns: [
          { def: squadronDart, angleOffset: -5 },
          { def: squadronDart, delayTicks: 6 },
          { def: squadronDart, angleOffset: 5, delayTicks: 12 },
        ],
      },
    ],
  },
  stapler: {
    kind: 'stapler',
    name: 'Stapler Mech',
    role: 'Heavy',
    blurb: 'Slow, tough and plated. Fires fast, flat staples that are hard to miss.',
    passive: { name: 'Plated', text: 'Takes 20% less damage from splash.' },
    hp: 1150,
    moveBudget: 140,
    angleMin: 0,
    angleMax: 90,
    bodyRadius: 17,
    mount: { x: -6, y: -38, length: 26 },
    splashTaken: 0.8,
    weapons: [
      {
        id: 'staple',
        name: 'Staple',
        blurb: 'Fast, flat and precise, with a small blast.',
        delay: 620,
        spawns: [{ def: staple }],
      },
      {
        id: 'rubber-band',
        name: 'Rubber Band',
        blurb: 'Bounces twice off the ground before it goes off.',
        delay: 680,
        spawns: [{ def: band }],
      },
      {
        id: 'staple-storm',
        name: 'Staple Storm',
        blurb: 'Five staples in a rapid burst.',
        delay: 950,
        spawns: [-4, -2, 0, 2, 4].map((offset, i) => ({
          def: stormStaple,
          angleOffset: offset,
          delayTicks: i * 5,
        })),
      },
    ],
  },
  highlighter: {
    kind: 'highlighter',
    name: 'Highlighter',
    role: 'Sniper',
    blurb: 'Fires dead-straight beams that ignore wind. It needs a clear line to its target.',
    passive: { name: 'Laser Sight', text: 'Sees exactly where its beam will go.' },
    hp: 900,
    moveBudget: 170,
    angleMin: -30,
    angleMax: 75,
    bodyRadius: 16,
    mount: { x: 6, y: -22, length: 28 },
    weapons: [
      {
        id: 'neon-line',
        name: 'Neon Line',
        blurb: 'A straight beam. Power sets how far it flies before it bursts.',
        delay: 620,
        spawns: [{ def: beam }],
      },
      {
        id: 'cap-toss',
        name: 'Cap Toss',
        blurb: 'A lobbed cap. Whatever it hits takes 35% more from the next hit.',
        delay: 660,
        spawns: [{ def: cap }],
      },
      {
        id: 'overdrive',
        name: 'Overdrive',
        blurb: 'A huge beam that cuts through cover and every doodle in its path.',
        delay: 950,
        spawns: [{ def: megabeam }],
      },
    ],
  },
  glue: {
    kind: 'glue',
    name: 'Glue Blob',
    role: 'Builder',
    blurb: 'Builds walls and bridges out of glue, and glues enemies to the spot.',
    passive: { name: 'Sticky Feet', text: 'Climbs slopes more than twice as steep.' },
    hp: 1050,
    moveBudget: 160,
    angleMin: 15,
    angleMax: 90,
    bodyRadius: 17,
    mount: { x: 4, y: -20, length: 27 },
    climb: 7,
    weapons: [
      {
        id: 'glob',
        name: 'Glue Glob',
        blurb: 'A heavy, gooey glob.',
        delay: 610,
        spawns: [{ def: glob }],
      },
      {
        id: 'glue-wall',
        name: 'Glue Wall',
        blurb: 'Builds a mound of glue where it lands. Cover, a bridge, or a blocked shot.',
        delay: 470,
        spawns: [{ def: wall }],
      },
      {
        id: 'super-glue',
        name: 'Super Glue',
        blurb: 'A big sticky blast. Every enemy it hits is stuck for a turn.',
        delay: 950,
        spawns: [{ def: superglue }],
      },
    ],
  },
};

export const UNIT_KINDS: UnitKind[] = ['pencil', 'squid', 'plane', 'stapler', 'highlighter', 'glue'];

/** Delay added when a player draws an ink line. */
export const DRAW_DELAY = 150;
export const DRAW_MAX_LENGTH = 170;
export const DRAW_REACH = 320;
export const DRAW_THICKNESS = 8;
/** Delay added when a turn times out without a shot. */
export const SKIP_DELAY = 500;
export const SPECIAL_MAX = 100;
/** How much later an inked enemy's next turn comes. */
export const INK_DELAY = 100;
/** Extra damage a marked doodle takes from the next hit. */
export const MARK_BONUS = 1.35;
/** Units built glue never covers, around each doodle's body. */
export const BUILD_CLEARANCE = 14;

/** Longest line this kind of doodle can Draw. */
export function drawLengthFor(kind: UnitKind): number {
  return UNITS[kind].drawLength ?? DRAW_MAX_LENGTH;
}
