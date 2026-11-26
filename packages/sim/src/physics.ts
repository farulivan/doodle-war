import { UNITS, type ProjectileDef, type WeaponDef } from './defs';
import type { GameState, ProjectileTrack, ShotEvent, Unit, Wind } from './state';
import type { Terrain } from './terrain';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const GRAVITY = 500;
/** Launch speed at 100 power, in px/s. */
export const MAX_LAUNCH_SPEED = 1100;
/** Wind acceleration per point of wind strength, in px/s². */
export const WIND_ACCEL = 16;
export const WALK_SPEED = 55;
const FALL_GRAVITY = 1100;
const MAX_CLIMB = 3;
const MAX_STEP_DOWN = 6;
const MAX_SHOT_TICKS = TICK_RATE * 14;
/** Extra damage once sudden death starts. */
export const SUDDEN_DEATH_MULT = 1.5;

export function bodyRadius(u: Unit): number {
  return UNITS[u.kind].bodyRadius;
}

export function bodyCenter(u: Unit): { x: number; y: number } {
  return { x: u.x, y: u.y - bodyRadius(u) };
}

export function standingAt(t: Terrain, x: number, y: number): boolean {
  return t.solid(x - 2, y + 1) || t.solid(x, y + 1) || t.solid(x + 2, y + 1);
}

/** Where a unit dropped at (x, y) comes to rest, or null if it falls off the page. */
export function landingY(t: Terrain, x: number, y: number): number | null {
  for (let yy = Math.floor(y); yy < t.height; yy++) {
    if (standingAt(t, x, yy)) return yy;
  }
  return null;
}

function surfaceNear(t: Terrain, x: number, y: number): number | null {
  if (t.solid(x, y)) {
    for (let k = 1; k <= 12; k++) if (!t.solid(x, y - k)) return y - k;
    return null;
  }
  for (let k = 0; k <= 12; k++) if (t.solid(x, y + k + 1)) return y + k;
  return null;
}

export function computeTilt(t: Terrain, x: number, y: number): number {
  const left = surfaceNear(t, x - 8, y) ?? y;
  const right = surfaceNear(t, x + 8, y) ?? y;
  const tilt = Math.atan2(right - left, 16);
  return Math.max(-0.6, Math.min(0.6, tilt));
}

export function fallTicks(distance: number): number {
  return Math.max(1, Math.round(Math.sqrt((2 * Math.max(0, distance)) / FALL_GRAVITY) * TICK_RATE));
}

export interface FallInfo {
  fromY: number;
  toY: number;
  dead: boolean;
}

/** Drops a unit to the ground. A unit with no ground below dies. */
export function settleUnit(state: GameState, u: Unit): FallInfo | null {
  const t = state.terrain;
  const land = landingY(t, u.x, u.y);
  if (land === null) {
    const fromY = u.y;
    u.alive = false;
    u.hp = 0;
    u.y = t.height + 80;
    return { fromY, toY: u.y, dead: true };
  }
  u.tilt = computeTilt(t, u.x, land);
  if (land <= u.y) return null;
  const fromY = u.y;
  u.y = land;
  return { fromY, toY: land, dead: false };
}

/** Walks a unit up to `px` pixels, climbing small steps and stepping off ledges. */
export function walk(
  state: GameState,
  u: Unit,
  dir: 1 | -1,
  px: number,
): { moved: number; fall: FallInfo | null } {
  const t = state.terrain;
  const r = bodyRadius(u);
  u.facing = dir;
  let moved = 0;
  let fall: FallInfo | null = null;
  while (moved < px) {
    const nx = u.x + dir;
    if (nx < 4 || nx > t.width - 5) break;
    let ny = u.y;
    if (t.solid(nx, ny)) {
      let climbed = false;
      for (let k = 1; k <= MAX_CLIMB; k++) {
        if (!t.solid(nx, ny - k)) {
          ny -= k;
          climbed = true;
          break;
        }
      }
      if (!climbed) break;
    }
    if (t.solid(nx, ny - r) || t.solid(nx, ny - 2 * r + 2)) break;
    let drop = 0;
    while (!standingAt(t, nx, ny) && drop < MAX_STEP_DOWN) {
      ny++;
      drop++;
    }
    u.x = nx;
    u.y = ny;
    moved++;
    if (!standingAt(t, nx, ny)) {
      fall = settleUnit(state, u);
      break;
    }
  }
  if (u.alive) u.tilt = computeTilt(t, u.x, u.y);
  return { moved, fall };
}

/** World direction of the barrel for a relative aim angle in degrees. */
export function aimDirection(u: Unit, angleDeg: number): { dx: number; dy: number } {
  const a = (angleDeg * Math.PI) / 180;
  const theta = u.facing === 1 ? u.tilt - a : Math.PI + u.tilt + a;
  return { dx: Math.cos(theta), dy: Math.sin(theta) };
}

/** Elevation above the horizon in degrees, which is what players read. */
export function worldElevation(u: Unit, angleDeg: number): number {
  const tiltDeg = (u.tilt * 180) / Math.PI;
  return Math.round(u.facing === 1 ? angleDeg - tiltDeg : angleDeg + tiltDeg);
}

export function muzzle(u: Unit, angleDeg: number): { x: number; y: number } {
  const c = bodyCenter(u);
  const d = aimDirection(u, angleDeg);
  const reach = bodyRadius(u) + 9;
  return { x: c.x + d.dx * reach, y: c.y + d.dy * reach };
}

// ---------------------------------------------------------------------------
// Shot simulation

interface SimProjectile {
  id: number;
  def: ProjectileDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  bouncesLeft: number;
  drilled: number;
  tunnel: number[];
  dead: boolean;
  track: ProjectileTrack | null;
}

export interface ShotSimulation {
  events: ShotEvent[];
  tracks: ProjectileTrack[];
  impactTicks: number;
  /** Damage per unit index. */
  damage: number[];
  /** Units that died, by index. */
  killed: boolean[];
  impacts: { x: number; y: number }[];
}

interface SimContext {
  state: GameState;
  actor: Unit;
  dry: boolean;
  wind: Wind;
  hp: number[];
  alive: boolean[];
  out: ShotSimulation;
  damageMult: number;
  nextId: () => number;
  spawned: SimProjectile[];
}

export interface RunShotOptions {
  /** A dry run reads the terrain and units but never changes them. Bots use it to plan. */
  dry: boolean;
  /** Fire from another position or facing without moving the unit (for bot planning). */
  actorOverride?: Unit;
}

export function runShot(
  state: GameState,
  actorIn: Unit,
  weapon: WeaponDef,
  angle: number,
  power: number,
  opts: RunShotOptions,
): ShotSimulation {
  const actor = opts.actorOverride ?? actorIn;
  const out: ShotSimulation = {
    events: [],
    tracks: [],
    impactTicks: 0,
    damage: state.units.map(() => 0),
    killed: state.units.map(() => false),
    impacts: [],
  };
  let localId = 1;
  const ctx: SimContext = {
    state,
    actor,
    dry: opts.dry,
    wind: state.turn.wind,
    hp: state.units.map((u) => u.hp),
    alive: state.units.map((u) => u.alive),
    out,
    damageMult: state.suddenDeath ? SUDDEN_DEATH_MULT : 1,
    nextId: opts.dry ? () => localId++ : () => state.nextProjectileId++,
    spawned: [],
  };

  const origin = muzzle(actor, angle);
  const baseSpeed = (Math.max(0, Math.min(100, power)) / 100) * MAX_LAUNCH_SPEED;
  const pending = weapon.spawns.map((s) => ({ ...s, tick: s.delayTicks ?? 0, done: false }));
  const active: SimProjectile[] = [];

  let tick = 0;
  for (; tick <= MAX_SHOT_TICKS; tick++) {
    for (const s of pending) {
      if (s.done || s.tick !== tick) continue;
      s.done = true;
      const dir = aimDirection(actor, angle + (s.angleOffset ?? 0));
      const speed = baseSpeed * (s.powerScale ?? 1) * (s.def.speedScale ?? 1);
      active.push(spawn(ctx, s.def, origin.x, origin.y, dir.dx * speed, dir.dy * speed, tick));
    }
    for (const p of active) if (!p.dead) step(ctx, p, tick);
    for (const child of ctx.spawned) active.push(child);
    ctx.spawned.length = 0;
    for (let i = active.length - 1; i >= 0; i--) if (active[i].dead) active.splice(i, 1);
    if (active.length === 0 && pending.every((s) => s.done)) break;
  }
  for (const p of active) {
    out.events.push({ type: 'lost', tick, x: p.x, y: p.y, projectileId: p.id });
  }
  out.impactTicks = tick + 1;
  return out;
}

function spawn(
  ctx: SimContext,
  def: ProjectileDef,
  x: number,
  y: number,
  vx: number,
  vy: number,
  tick: number,
): SimProjectile {
  const id = ctx.nextId();
  const track: ProjectileTrack | null = ctx.dry
    ? null
    : { id, sprite: def.sprite, spawnTick: tick, points: [x, y] };
  if (track) ctx.out.tracks.push(track);
  return {
    id,
    def,
    x,
    y,
    vx,
    vy,
    age: 0,
    bouncesLeft: def.bounces ?? 0,
    drilled: 0,
    tunnel: [],
    dead: false,
    track,
  };
}

function step(ctx: SimContext, p: SimProjectile, tick: number): void {
  const t = ctx.state.terrain;
  const def = p.def;
  const ws = def.windScale ?? 1;
  p.vx += ctx.wind.ax * ws * DT;
  p.vy += (GRAVITY * (def.gravityScale ?? 1) + ctx.wind.ay * ws) * DT;
  p.age++;

  if (def.split && p.age >= 10 && p.vy >= 0) {
    split(ctx, p, tick);
    p.track?.points.push(p.x, p.y);
    return;
  }

  const n = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) * DT));
  const sx = (p.vx * DT) / n;
  const sy = (p.vy * DT) / n;
  const stepLen = Math.hypot(sx, sy);
  for (let i = 0; i < n && !p.dead; i++) {
    const nx = p.x + sx;
    const ny = p.y + sy;
    if (nx < -300 || nx > t.width + 300 || ny > t.height + 60) {
      p.dead = true;
      ctx.out.events.push({ type: 'lost', tick, x: p.x, y: p.y, projectileId: p.id });
      break;
    }
    const hit = unitAt(ctx, nx, ny);
    if (hit !== null) {
      p.x = nx;
      p.y = ny;
      explode(ctx, p, tick, hit);
      break;
    }
    if (t.solid(nx, ny)) {
      if (def.drill) {
        p.drilled += stepLen;
        const last = p.tunnel.length;
        if (last === 0 || Math.hypot(nx - p.tunnel[last - 2], ny - p.tunnel[last - 1]) >= 6)
          p.tunnel.push(nx, ny);
        p.x = nx;
        p.y = ny;
        if (p.drilled >= def.drill) explode(ctx, p, tick, null);
        continue;
      }
      if (p.bouncesLeft > 0) {
        bounce(ctx, p, nx, ny, tick);
        break;
      }
      p.x = nx;
      p.y = ny;
      explode(ctx, p, tick, null);
      break;
    }
    p.x = nx;
    p.y = ny;
  }
  p.track?.points.push(p.x, p.y);
}

function unitAt(ctx: SimContext, x: number, y: number): number | null {
  const units = ctx.state.units;
  for (let i = 0; i < units.length; i++) {
    if (!ctx.alive[i]) continue;
    const u = units[i];
    const r = UNITS[u.kind].bodyRadius;
    const dx = x - u.x;
    const dy = y - (u.y - r);
    if (dx * dx + dy * dy <= (r + 2) * (r + 2)) return i;
  }
  return null;
}

function bounce(ctx: SimContext, p: SimProjectile, hx: number, hy: number, tick: number): void {
  const t = ctx.state.terrain;
  let nx = 0;
  let ny = 0;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dy * dy > 16) continue;
      if (t.solid(hx + dx, hy + dy)) {
        nx -= dx;
        ny -= dy;
      }
    }
  }
  let len = Math.hypot(nx, ny);
  if (len === 0) {
    nx = -p.vx;
    ny = -p.vy;
    len = Math.hypot(nx, ny) || 1;
  }
  nx /= len;
  ny /= len;
  const dot = p.vx * nx + p.vy * ny;
  if (dot < 0) {
    p.vx -= 2 * dot * nx;
    p.vy -= 2 * dot * ny;
  }
  const keep = p.def.restitution ?? 0.6;
  p.vx *= keep;
  p.vy *= keep;
  p.bouncesLeft--;
  ctx.out.events.push({ type: 'bounce', tick, x: p.x, y: p.y, projectileId: p.id });
}

function split(ctx: SimContext, p: SimProjectile, tick: number): void {
  const s = p.def.split!;
  p.dead = true;
  ctx.out.events.push({ type: 'split', tick, x: p.x, y: p.y, projectileId: p.id });
  const speed = Math.hypot(p.vx, p.vy);
  const heading = Math.atan2(p.vy, p.vx);
  for (let k = 0; k < s.count; k++) {
    const f = s.count === 1 ? 0 : k / (s.count - 1) - 0.5;
    const a = heading + (f * s.spreadDeg * Math.PI) / 180;
    const sp = speed * (1 - Math.abs(f) * 0.12);
    ctx.spawned.push(spawn(ctx, s.child, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, tick));
  }
}

function explode(ctx: SimContext, p: SimProjectile, tick: number, directUnit: number | null): void {
  p.dead = true;
  const def = p.def;
  let damage = def.damage;
  let radius = def.radius;
  if (def.split) {
    // Hit something before it could split: one bigger splash.
    damage = def.split.child.damage * 1.6;
    radius = def.split.child.radius + 8;
  }
  damage *= ctx.damageMult;
  const ink = !!(def.ink || def.split?.child.ink);
  const { state, out } = ctx;
  out.impacts.push({ x: p.x, y: p.y });
  out.events.push({ type: 'explode', tick, x: p.x, y: p.y, radius, projectileId: p.id, ink, directUnit });

  if (!ctx.dry) {
    for (let i = 0; i < p.tunnel.length; i += 2) {
      carve(ctx, p.tunnel[i], p.tunnel[i + 1], 8, tick);
    }
    carve(ctx, p.x, p.y, radius, tick);
    // Pickups caught in the blast pop.
    state.pickups = state.pickups.filter((pk) => {
      if (Math.hypot(pk.x - p.x, pk.y - 8 - p.y) > radius + 6) return true;
      out.events.push({ type: 'pickup', tick, pickupId: pk.id, unitId: null, kind: pk.kind });
      return false;
    });
  }

  const units = state.units;
  for (let i = 0; i < units.length; i++) {
    if (!ctx.alive[i]) continue;
    const u = units[i];
    const r = UNITS[u.kind].bodyRadius;
    let amount = 0;
    if (i === directUnit) {
      amount = damage;
    } else {
      const d = Math.hypot(p.x - u.x, p.y - (u.y - r));
      if (d >= radius + r) continue;
      const f = 1 - Math.max(0, d - r) / radius;
      amount = damage * 0.9 * Math.pow(f, 0.8);
    }
    amount = Math.round(amount);
    if (amount > 0) applyDamage(ctx, i, amount, tick, i === directUnit, ink);
  }
}

function carve(ctx: SimContext, x: number, y: number, radius: number, tick: number): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  const r = Math.round(radius);
  if (ctx.state.terrain.carveCircle(cx, cy, r)) {
    ctx.out.events.push({ type: 'carve', tick, x: cx, y: cy, radius: r });
  }
}

function applyDamage(
  ctx: SimContext,
  i: number,
  amount: number,
  tick: number,
  direct: boolean,
  ink: boolean,
): void {
  const { out, actor, state } = ctx;
  const before = ctx.hp[i];
  const dealt = Math.min(before, amount);
  ctx.hp[i] = Math.max(0, before - amount);
  out.damage[i] += dealt;
  const dead = ctx.hp[i] <= 0;
  if (dead) {
    ctx.alive[i] = false;
    out.killed[i] = true;
  }
  if (ctx.dry) return;

  const u = state.units[i];
  const enemy = u.team !== actor.team;
  u.hp = ctx.hp[i];
  u.stats.damageTaken += dealt;
  u.special = Math.min(100, u.special + dealt * 0.12);
  if (enemy) {
    actor.stats.damageDealt += dealt;
    actor.special = Math.min(100, actor.special + dealt * 0.08);
  }
  out.events.push({ type: 'damage', tick, unitId: u.id, amount: dealt, hpAfter: u.hp, direct });
  if (ink && !dead) {
    u.inked = 1;
    out.events.push({ type: 'inked', tick, unitId: u.id });
  }
  if (dead) {
    u.alive = false;
    if (enemy) actor.stats.kills++;
    out.events.push({ type: 'death', tick, unitId: u.id, cause: 'hp' });
  }
}
