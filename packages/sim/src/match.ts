import {
  DRAW_DELAY,
  DRAW_REACH,
  DRAW_THICKNESS,
  SKIP_DELAY,
  SPECIAL_MAX,
  UNITS,
  drawLengthFor,
  type WeaponSlot,
} from './defs';
import { buildTerrain, getMap } from './maps';
import {
  WIND_ACCEL,
  bodyCenter,
  bodyRadius,
  computeTilt,
  fallTicks,
  runShot,
  settleUnit,
  standingAt,
  walk,
  type FallInfo,
  type GlideInfo,
} from './physics';
import { collectPickups, maybeSpawnPickup, settlePickups, type Collected } from './pickups';
import { Rng } from './rng';
import type { FireInput, GameState, MatchConfig, ShotResult, Unit, Wind } from './state';
import { INK, type Rect, type Terrain } from './terrain';

const DEFAULT_SUDDEN_DEATH_TURN = 40;
const PASSIVE_SPECIAL_GAIN = 12;
/** Each pixel walked adds this much turn delay. */
const MOVE_DELAY_PER_PX = 0.8;

export function createMatch(config: MatchConfig): GameState {
  if (config.players.length < 2) throw new Error('A match needs at least two players');
  const map = getMap(config.mapId);
  const terrain = buildTerrain(map, config.mapSeed ?? map.seed);
  const rng = new Rng(config.seed);

  const teams = [...new Set(config.players.map((p) => p.team))].sort((a, b) => a - b);
  const units: Unit[] = config.players.map((p, id) => {
    const def = UNITS[p.kind];
    return {
      id,
      name: p.name,
      team: p.team,
      kind: p.kind,
      controller: p.controller,
      botLevel: p.botLevel ?? 'normal',
      x: 0,
      y: 0,
      facing: 1,
      angle: 45,
      tilt: 0,
      hp: def.hp,
      maxHp: def.hp,
      alive: true,
      delay: 0,
      special: 0,
      inked: 0,
      rooted: 0,
      marked: false,
      drawUsed: false,
      lastPower: null,
      stats: { damageDealt: 0, damageTaken: 0, shots: 0, kills: 0 },
    };
  });

  placeUnits(terrain, units, teams, rng);

  // Interleave teams for the opening turns, with a random team going first.
  const byTeam = teams.map((team) => units.filter((u) => u.team === team));
  const firstTeam = rng.int(0, teams.length - 1);
  let order = 0;
  const longest = Math.max(...byTeam.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (let k = 0; k < byTeam.length; k++) {
      const unit = byTeam[(k + firstTeam) % byTeam.length][i];
      if (unit) unit.delay = order++ * 10;
    }
  }

  return {
    config,
    map,
    terrain,
    units,
    rng,
    turn: {
      number: 0,
      activeId: -1,
      wind: { strength: 0, angle: 0, ax: 0, ay: 0 },
      moveLeft: 0,
      moveUsed: 0,
      drew: false,
    },
    phase: 'turn',
    winner: null,
    suddenDeath: false,
    nextProjectileId: 1,
    pickups: [],
    nextPickupId: 1,
  };
}

function placeUnits(terrain: Terrain, units: Unit[], teams: number[], rng: Rng): void {
  const w = terrain.width;
  // Two teams get mirror-image spawns on the mirror-image page, so neither side starts better off.
  if (teams.length === 2) {
    const left = units.filter((u) => u.team === teams[0]);
    const right = units.filter((u) => u.team === teams[1]);
    const count = Math.max(left.length, right.length);
    const placed: number[] = [];
    const xs: number[] = [];
    for (let i = 0; i < count; i++) {
      const target = w * 0.06 + (w * 0.34 * (i + 0.5)) / count + rng.range(-30, 30);
      const x = findSpawnX(terrain, Math.round(target), placed, w / 2 - 40);
      placed.push(x);
      xs.push(x);
    }
    left.forEach((u, i) => spawnAt(terrain, u, xs[i], 1));
    right.forEach((u, i) => spawnAt(terrain, u, w - 1 - xs[i], -1));
    return;
  }
  const regionWidth = w / teams.length;
  const placed: number[] = [];
  teams.forEach((team, ti) => {
    const members = units.filter((u) => u.team === team);
    const start = ti * regionWidth + regionWidth * 0.1;
    const span = regionWidth * 0.75;
    members.forEach((u, i) => {
      const target = start + (span * (i + 0.5)) / members.length + rng.range(-30, 30);
      const x = findSpawnX(terrain, Math.round(target), placed, w);
      placed.push(x);
      spawnAt(terrain, u, x, x < w / 2 ? 1 : -1);
    });
  });
}

function spawnAt(terrain: Terrain, u: Unit, x: number, facing: 1 | -1): void {
  const top = terrain.topSurface(x) ?? terrain.height / 2;
  u.x = x;
  u.y = top - 1;
  u.facing = facing;
  u.tilt = computeTilt(terrain, u.x, u.y);
}

function findSpawnX(terrain: Terrain, target: number, taken: number[], maxX: number): number {
  for (let off = 0; off <= 400; off += 8) {
    for (const x of off === 0 ? [target] : [target + off, target - off]) {
      if (x < 60 || x > Math.min(maxX, terrain.width - 60)) continue;
      if (taken.some((t) => Math.abs(t - x) < 70)) continue;
      const top = terrain.topSurface(x);
      if (top === null || top < 80) continue;
      // Need a solid footing, not a one-pixel sliver.
      let thick = 0;
      while (thick < 14 && terrain.solid(x, top + thick)) thick++;
      if (thick < 14 || !standingAt(terrain, x, top - 1)) continue;
      return x;
    }
  }
  return target;
}

export function activeUnit(state: GameState): Unit | null {
  return state.units[state.turn.activeId] ?? null;
}

/** Alive units, soonest turn first. */
export function turnQueue(state: GameState): Unit[] {
  return state.units.filter((u) => u.alive).sort((a, b) => a.delay - b.delay || a.id - b.id);
}

function rollWind(state: GameState): Wind {
  const max = Math.min(12, state.map.windMax + (state.suddenDeath ? 2 : 0));
  const strength = state.rng.int(0, max);
  const angle = state.rng.int(0, 359);
  const rad = (angle * Math.PI) / 180;
  return {
    strength,
    angle,
    ax: Math.cos(rad) * strength * WIND_ACCEL,
    ay: Math.sin(rad) * strength * WIND_ACCEL,
  };
}

/** Starts the next turn: picks the unit with the lowest delay and rolls new wind. */
export function beginTurn(state: GameState): Unit | null {
  if (state.phase === 'over') return null;
  const next = turnQueue(state)[0];
  if (!next) return null;
  const number = state.turn.number + 1;
  state.suddenDeath = number >= (state.config.suddenDeathTurn ?? DEFAULT_SUDDEN_DEATH_TURN);
  const def = UNITS[next.kind];
  const slowed = next.inked > 0;
  if (slowed) next.inked--;
  const stuck = next.rooted > 0;
  if (stuck) next.rooted--;
  next.special = Math.min(SPECIAL_MAX, next.special + PASSIVE_SPECIAL_GAIN);
  state.turn = {
    number,
    activeId: next.id,
    wind: rollWind(state),
    moveLeft: stuck ? 0 : def.moveBudget * (slowed ? 0.5 : 1),
    moveUsed: 0,
    drew: false,
  };
  maybeSpawnPickup(state);
  return next;
}

function finishTurn(state: GameState, actor: Unit, cost: number): void {
  const t = state.turn;
  actor.delay += cost + t.moveUsed * MOVE_DELAY_PER_PX + (t.drew ? DRAW_DELAY : 0);
  checkWinner(state);
}

export function checkWinner(state: GameState): number | null {
  if (state.phase === 'over') return state.winner;
  const teams = new Set(state.units.filter((u) => u.alive).map((u) => u.team));
  if (teams.size <= 1) {
    state.phase = 'over';
    state.winner = teams.size === 1 ? [...teams][0] : -1;
  }
  return state.winner;
}

export function canUseSpecial(unit: Unit): boolean {
  return unit.special >= SPECIAL_MAX;
}

export function clampAngle(unit: Unit, angle: number): number {
  const def = UNITS[unit.kind];
  return Math.max(def.angleMin, Math.min(def.angleMax, angle));
}

export interface MoveResult {
  moved: number;
  fall: FallInfo | null;
  /** Set when a Paper Plane glided off a ledge; any fall after it is in `fall`. */
  glide: GlideInfo | null;
  /** True if the unit walked off the page and the turn ended. */
  turnEnded: boolean;
  collected: Collected[];
}

/** Walks the active unit, limited by what is left of its movement budget. */
export function moveActive(state: GameState, dir: 1 | -1, px: number): MoveResult {
  const actor = activeUnit(state);
  if (!actor || state.phase !== 'turn')
    return { moved: 0, fall: null, glide: null, turnEnded: false, collected: [] };
  const budget = Math.floor(Math.min(px, state.turn.moveLeft));
  const res = walk(state, actor, dir, budget);
  state.turn.moveLeft -= res.moved;
  state.turn.moveUsed += res.moved;
  if (!actor.alive) {
    finishTurn(state, actor, SKIP_DELAY);
    return { ...res, turnEnded: true, collected: [] };
  }
  return { ...res, turnEnded: false, collected: collectPickups(state, actor) };
}

/** Movement a hop costs. */
export const HOP_COST = 30;

function bodyClear(t: Terrain, x: number, y: number, r: number): boolean {
  const cy = y - r;
  if (t.solid(x, cy)) return false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (t.solid(x + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2))) return false;
  }
  return true;
}

export interface HopResult extends MoveResult {
  ok: boolean;
  fromX: number;
  fromY: number;
  /** Where the hop peaked before falling to the ground. */
  peakX: number;
  peakY: number;
}

/**
 * Hops up and forward, for getting out of craters. Tries a few arcs and takes the
 * longest one with room for the body, then drops to the ground.
 */
export function hopActive(state: GameState): HopResult {
  const actor = activeUnit(state);
  const none = {
    ok: false,
    moved: 0,
    fall: null,
    glide: null,
    turnEnded: false,
    collected: [],
    fromX: 0,
    fromY: 0,
    peakX: 0,
    peakY: 0,
  };
  if (!actor || state.phase !== 'turn' || state.turn.moveLeft < HOP_COST) return none;
  const t = state.terrain;
  const r = bodyRadius(actor);
  const fromX = actor.x;
  const fromY = actor.y;
  for (const [dx, dy] of [
    [22, 34],
    [16, 40],
    [10, 44],
    [0, 40],
  ]) {
    const nx = Math.round(fromX + actor.facing * dx);
    const ny = Math.round(fromY - dy);
    if (nx < 4 || nx > t.width - 5) continue;
    const midX = Math.round(fromX + (actor.facing * dx) / 2);
    if (!bodyClear(t, nx, ny, r) || !bodyClear(t, midX, ny - 4, r)) continue;
    actor.x = nx;
    actor.y = ny;
    const fall = settleUnit(state, actor);
    state.turn.moveLeft -= HOP_COST;
    state.turn.moveUsed += HOP_COST;
    if (!actor.alive) {
      finishTurn(state, actor, SKIP_DELAY);
      return {
        ok: true,
        moved: dx,
        fall,
        glide: null,
        turnEnded: true,
        collected: [],
        fromX,
        fromY,
        peakX: nx,
        peakY: ny,
      };
    }
    actor.tilt = computeTilt(t, actor.x, actor.y);
    return {
      ok: true,
      moved: dx,
      fall,
      glide: null,
      turnEnded: false,
      collected: collectPickups(state, actor),
      fromX,
      fromY,
      peakX: nx,
      peakY: ny,
    };
  }
  return none;
}

/** Turns the active unit around without walking. */
export function faceActive(state: GameState, dir: 1 | -1): void {
  const actor = activeUnit(state);
  if (actor) actor.facing = dir;
}

export interface DrawResult {
  ok: boolean;
  reason?: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rect: Rect | null;
}

/**
 * The Draw ability: once per match, ink a short line of new terrain near you.
 * It doesn't end the turn, but it adds delay.
 */
export function drawLine(state: GameState, x0: number, y0: number, x1: number, y1: number): DrawResult {
  const actor = activeUnit(state);
  const fail = (reason: string): DrawResult => ({ ok: false, reason, x0, y0, x1, y1, rect: null });
  if (!actor || state.phase !== 'turn') return fail('Not your turn');
  if (actor.drawUsed) return fail('Draw already used this match');
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 12) return fail('Line too short');
  const maxLength = drawLengthFor(actor.kind);
  if (len > maxLength) {
    const k = maxLength / len;
    x1 = x0 + (x1 - x0) * k;
    y1 = y0 + (y1 - y0) * k;
  }
  const c = bodyCenter(actor);
  if (Math.hypot(x0 - c.x, y0 - c.y) > DRAW_REACH || Math.hypot(x1 - c.x, y1 - c.y) > DRAW_REACH) {
    return fail('Too far from your unit');
  }
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const rect = state.terrain.fillThickLine(x0, y0, x1, y1, DRAW_THICKNESS, INK, inkSkipper(state));
  actor.drawUsed = true;
  state.turn.drew = true;
  return { ok: true, x0, y0, x1, y1, rect };
}

/** Ink never fills inside a living unit's body. Renderers reuse this to stay in sync. */
export function inkSkipper(state: GameState): (x: number, y: number) => boolean {
  const bodies = state.units
    .filter((u) => u.alive)
    .map((u) => {
      const r = bodyRadius(u) + 3;
      return { x: u.x, y: u.y - bodyRadius(u), r2: r * r };
    });
  return (x, y) => bodies.some((b) => (x - b.x) ** 2 + (y - b.y) ** 2 <= b.r2);
}

/** Fires the active unit's weapon, resolves the whole shot and ends the turn. */
export function fire(state: GameState, input: FireInput): ShotResult {
  const actor = activeUnit(state);
  if (!actor || state.phase !== 'turn') throw new Error('No active unit to fire');
  let slot: WeaponSlot = input.slot;
  if (slot === 2 && !canUseSpecial(actor)) slot = 0;
  const angle = clampAngle(actor, input.angle);
  const power = Math.max(0, Math.min(100, input.power));
  const weapon = UNITS[actor.kind].weapons[slot];

  actor.angle = angle;
  actor.lastPower = power;
  actor.stats.shots++;
  if (slot === 2) actor.special = 0;

  const sim = runShot(state, actor, weapon, angle, power, { dry: false });
  const events = sim.events;

  // Settle anyone whose footing got blown away.
  let end = sim.impactTicks;
  for (const u of state.units) {
    if (!u.alive) continue;
    const fall = settleUnit(state, u);
    if (!fall) continue;
    const ticks = fallTicks(fall.toY - fall.fromY);
    events.push({
      type: 'fall',
      tick: sim.impactTicks,
      unitId: u.id,
      fromY: fall.fromY,
      toY: fall.toY,
      ticks,
    });
    end = Math.max(end, sim.impactTicks + ticks);
    if (fall.dead) {
      events.push({ type: 'death', tick: sim.impactTicks + ticks, unitId: u.id, cause: 'fell' });
      if (u.team !== actor.team) actor.stats.kills++;
    }
  }

  // Loose pickups fall too, and anyone who lands on one grabs it.
  end = settlePickups(state, sim.impactTicks, events);
  for (const e of events) if (e.type === 'fall') end = Math.max(end, e.tick + e.ticks);
  for (const u of state.units) {
    for (const got of collectPickups(state, u)) {
      events.push({ type: 'pickup', tick: end, pickupId: got.pickupId, unitId: got.unitId, kind: got.kind });
    }
  }

  const origin = { x: sim.tracks[0]?.points[0] ?? actor.x, y: sim.tracks[0]?.points[1] ?? actor.y };
  finishTurn(state, actor, weapon.delay);
  events.sort((a, b) => a.tick - b.tick);
  return {
    actorId: actor.id,
    input: { angle, power, slot },
    weaponId: weapon.id,
    origin,
    tracks: sim.tracks,
    events,
    impactTicks: sim.impactTicks,
    totalTicks: end + 1,
  };
}

/** Ends the turn without firing, for example when the turn timer runs out. */
export function skipTurn(state: GameState): void {
  const actor = activeUnit(state);
  if (!actor || state.phase !== 'turn') return;
  finishTurn(state, actor, SKIP_DELAY);
}
