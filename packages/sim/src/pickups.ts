import { SPECIAL_MAX } from './defs';
import { bodyCenter, bodyRadius, fallTicks, landingY } from './physics';
import type { GameState, Pickup, PickupKind, ShotEvent, Unit } from './state';

export const PICKUP_HEAL = 250;
export const PICKUP_STAR = 50;
const MAX_PICKUPS = 3;
/** Every this many turns there's a chance of a drop. */
const DROP_EVERY = 3;
const GRAB_RANGE = 12;

export const PICKUP_INFO: Record<PickupKind, { name: string; effect: string }> = {
  bandaid: { name: 'Band-Aid', effect: `+${PICKUP_HEAL} HP` },
  star: { name: 'Gold Star', effect: `+${PICKUP_STAR}% special` },
  refill: { name: 'Ink Refill', effect: 'Draw is ready again' },
};

export interface Collected {
  pickupId: number;
  unitId: number;
  kind: PickupKind;
}

/** Maybe drops a pickup at the start of a turn. Uses the match RNG, so it's deterministic. */
export function maybeSpawnPickup(state: GameState): Pickup | null {
  if (state.turn.number % DROP_EVERY !== 0 || state.pickups.length >= MAX_PICKUPS) return null;
  if (state.rng.next() < 0.3) return null;
  const t = state.terrain;
  const kinds: PickupKind[] = ['bandaid', 'bandaid', 'star', 'refill'];
  const kind = kinds[state.rng.int(0, kinds.length - 1)];
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = state.rng.int(120, t.width - 120);
    const top = t.topSurface(x);
    if (top === null || top < 60) continue;
    const y = landingY(t, x, top - 1);
    if (y === null) continue;
    // Not right on top of someone, and not on top of another pickup.
    if (state.units.some((u) => u.alive && Math.abs(u.x - x) < 50)) continue;
    if (state.pickups.some((p) => Math.abs(p.x - x) < 60)) continue;
    const pickup: Pickup = { id: state.nextPickupId++, kind, x, y };
    state.pickups.push(pickup);
    return pickup;
  }
  return null;
}

/** Applies a pickup's effect. Exported so client mirrors can show it instantly. */
export function applyPickup(unit: Unit, kind: PickupKind): void {
  if (kind === 'bandaid') unit.hp = Math.min(unit.maxHp, unit.hp + PICKUP_HEAL);
  else if (kind === 'star') unit.special = Math.min(SPECIAL_MAX, unit.special + PICKUP_STAR);
  else unit.drawUsed = false;
}

/** Any pickups touching this unit's body are collected. */
export function collectPickups(state: GameState, unit: Unit): Collected[] {
  if (!unit.alive) return [];
  const c = bodyCenter(unit);
  const reach = bodyRadius(unit) + GRAB_RANGE;
  const got: Collected[] = [];
  state.pickups = state.pickups.filter((p) => {
    if (Math.hypot(p.x - c.x, p.y - 8 - c.y) > reach) return true;
    applyPickup(unit, p.kind);
    got.push({ pickupId: p.id, unitId: unit.id, kind: p.kind });
    return false;
  });
  return got;
}

/** Drops pickups whose ground was blown away. Returns when the last one lands. */
export function settlePickups(state: GameState, tick: number, events: ShotEvent[]): number {
  let end = tick;
  state.pickups = state.pickups.filter((p) => {
    const land = landingY(state.terrain, p.x, p.y);
    if (land !== null && land <= p.y) return true;
    const toY = land ?? state.terrain.height + 60;
    const ticks = fallTicks(toY - p.y);
    events.push({ type: 'pickupFall', tick, pickupId: p.id, fromY: p.y, toY, ticks, lost: land === null });
    end = Math.max(end, tick + ticks);
    p.y = toY;
    return land !== null;
  });
  return end;
}
