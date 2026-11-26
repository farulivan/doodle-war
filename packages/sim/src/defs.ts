export type UnitKind = 'pencil' | 'plane' | 'squid' | 'stapler';

export type ProjectileSprite =
  'graphite' | 'lead' | 'drill' | 'ink' | 'inkDrop' | 'dart' | 'crumple' | 'staple' | 'band';

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
  /** Ink slows the units it hits on their next turn. */
  ink?: boolean;
  /** Splits into children at the top of its arc instead of flying on. */
  split?: { count: number; spreadDeg: number; child: ProjectileDef };
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
  blurb: string;
  hp: number;
  /** Pixels of walking per turn. */
  moveBudget: number;
  /** Aim range relative to the body, in degrees above forward. */
  angleMin: number;
  angleMax: number;
  bodyRadius: number;
  /** [shot 1, shot 2, special]. The special needs a full meter. */
  weapons: [WeaponDef, WeaponDef, WeaponDef];
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

export const UNITS: Record<UnitKind, UnitDef> = {
  pencil: {
    kind: 'pencil',
    name: 'Pencil Tank',
    blurb: 'Reliable all-rounder. Its special drills through the ground before going off.',
    hp: 1000,
    moveBudget: 180,
    angleMin: 0,
    angleMax: 90,
    bodyRadius: 14,
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
        blurb: 'Tunnels through terrain, then explodes big.',
        delay: 900,
        spawns: [{ def: drill }],
      },
    ],
  },
  squid: {
    kind: 'squid',
    name: 'Ink Squid',
    blurb: 'Splashes sticky ink that halves enemy movement next turn.',
    hp: 950,
    moveBudget: 170,
    angleMin: 0,
    angleMax: 90,
    bodyRadius: 14,
    weapons: [
      {
        id: 'ink-blot',
        name: 'Ink Blot',
        blurb: 'Wide, sticky splash.',
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
    blurb: 'Fast mover. Its darts glide and ride the wind.',
    hp: 880,
    moveBudget: 230,
    angleMin: 0,
    angleMax: 85,
    bodyRadius: 13,
    weapons: [
      {
        id: 'dart',
        name: 'Paper Dart',
        blurb: 'Light glider. Wind pushes it hard.',
        delay: 580,
        spawns: [{ def: dart }],
      },
      {
        id: 'crumple',
        name: 'Crumple Ball',
        blurb: 'Heavy and drops fast, barely touched by wind.',
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
    blurb: 'Tough and slow. Fires fast, flat staples.',
    hp: 1150,
    moveBudget: 140,
    angleMin: 0,
    angleMax: 90,
    bodyRadius: 15,
    weapons: [
      {
        id: 'staple',
        name: 'Staple',
        blurb: 'Fast and precise, with a small blast.',
        delay: 620,
        spawns: [{ def: staple }],
      },
      {
        id: 'rubber-band',
        name: 'Rubber Band',
        blurb: 'Bounces twice off the ground before exploding.',
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
};

export const UNIT_KINDS: UnitKind[] = ['pencil', 'squid', 'plane', 'stapler'];

/** Delay added when a player draws an ink line. */
export const DRAW_DELAY = 150;
export const DRAW_MAX_LENGTH = 170;
export const DRAW_REACH = 320;
export const DRAW_THICKNESS = 8;
/** Delay added when a turn times out without a shot. */
export const SKIP_DELAY = 500;
export const SPECIAL_MAX = 100;
