import type { ProjectileSprite, UnitKind, WeaponSlot } from './defs';
import type { MapDef } from './maps';
import type { Rng } from './rng';
import type { Terrain } from './terrain';

export type BotLevel = 'easy' | 'normal' | 'hard';

export interface PlayerConfig {
  name: string;
  team: number;
  kind: UnitKind;
  controller: 'human' | 'bot';
  botLevel?: BotLevel;
}

export interface MatchConfig {
  mapId: string;
  /** Overrides the map's default seed for a remixed layout. */
  mapSeed?: number;
  /** Drives wind, turn order and spawns. */
  seed: number;
  players: PlayerConfig[];
  /** Turn number at which every hit starts doing extra damage. */
  suddenDeathTurn?: number;
}

export interface Unit {
  id: number;
  name: string;
  team: number;
  kind: UnitKind;
  controller: 'human' | 'bot';
  botLevel: BotLevel;
  /** Feet position: bottom-center of the body. */
  x: number;
  y: number;
  facing: 1 | -1;
  /** Aim in degrees above forward, relative to the body. */
  angle: number;
  /** Ground slope under the unit, in radians. Positive means the ground drops to the right. */
  tilt: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  delay: number;
  special: number;
  /** Turns left with halved movement after an ink hit. */
  inked: number;
  /** Turns left glued to the spot: no walking or hopping. */
  rooted: number;
  /** Takes extra damage from the next hit, then the mark is gone. */
  marked: boolean;
  drawUsed: boolean;
  lastPower: number | null;
  /** Lifetime stats, shown on the results screen. */
  stats: { damageDealt: number; damageTaken: number; shots: number; kills: number };
}

export interface Wind {
  /** 0..10, shown to players. */
  strength: number;
  /** Direction in degrees, screen space (0 = right, 90 = down). */
  angle: number;
  /** Acceleration in px/s². */
  ax: number;
  ay: number;
}

export interface TurnState {
  number: number;
  activeId: number;
  wind: Wind;
  moveLeft: number;
  moveUsed: number;
  drew: boolean;
}

export type PickupKind = 'bandaid' | 'star' | 'refill';

/** Paper goodies that parachute onto the page every few turns. Walk over one to grab it. */
export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  /** Bottom of the pickup, resting on the ground. */
  y: number;
}

export interface GameState {
  config: MatchConfig;
  map: MapDef;
  terrain: Terrain;
  units: Unit[];
  rng: Rng;
  turn: TurnState;
  phase: 'turn' | 'over';
  /** Winning team, -1 for a draw, null while playing. */
  winner: number | null;
  suddenDeath: boolean;
  nextProjectileId: number;
  pickups: Pickup[];
  nextPickupId: number;
}

export interface FireInput {
  angle: number;
  power: number;
  slot: WeaponSlot;
}

export type UnitStatus = 'inked' | 'rooted' | 'marked';

export type ShotEvent =
  | {
      type: 'explode';
      tick: number;
      x: number;
      y: number;
      radius: number;
      projectileId: number;
      /** What went off, so the blast can look like it. */
      sprite: ProjectileSprite;
      ink: boolean;
      directUnit: number | null;
    }
  | { type: 'carve'; tick: number; x: number; y: number; radius: number }
  /**
   * Glue filled a circle. `skip` holds the doodles' bodies it went around, as flat [x, y, r, ...], so a
   * copy of the terrain can repeat the fill exactly.
   */
  | { type: 'build'; tick: number; x: number; y: number; radius: number; skip: number[] }
  | { type: 'damage'; tick: number; unitId: number; amount: number; hpAfter: number; direct: boolean }
  | { type: 'status'; tick: number; unitId: number; status: UnitStatus }
  | { type: 'split'; tick: number; x: number; y: number; projectileId: number }
  | { type: 'bounce'; tick: number; x: number; y: number; projectileId: number }
  | { type: 'lost'; tick: number; x: number; y: number; projectileId: number }
  | { type: 'fall'; tick: number; unitId: number; fromY: number; toY: number; ticks: number }
  | { type: 'death'; tick: number; unitId: number; cause: 'hp' | 'fell' }
  /** A pickup was grabbed (unitId set) or blown up (unitId null). */
  | { type: 'pickup'; tick: number; pickupId: number; unitId: number | null; kind: PickupKind }
  | {
      type: 'pickupFall';
      tick: number;
      pickupId: number;
      fromY: number;
      toY: number;
      ticks: number;
      lost: boolean;
    };

export interface ProjectileTrack {
  id: number;
  sprite: ProjectileSprite;
  spawnTick: number;
  /** Flat [x0, y0, x1, y1, ...], one point per tick starting at spawnTick. */
  points: number[];
}

export interface ShotResult {
  actorId: number;
  input: FireInput;
  weaponId: string;
  origin: { x: number; y: number };
  tracks: ProjectileTrack[];
  events: ShotEvent[];
  /** Tick by which every projectile has landed. */
  impactTicks: number;
  /** Tick by which falls are also done. */
  totalTicks: number;
}
