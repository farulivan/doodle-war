/// <reference lib="webworker" />
import {
  Rng,
  Terrain,
  getMap,
  planBotTurn,
  type BotLevel,
  type GameState,
  type Pickup,
  type TurnState,
  type Unit,
} from '@doodle/sim';

/** Everything the planner reads, in a form that survives postMessage. */
export interface PlanRequest {
  id: number;
  mapId: string;
  seed: number;
  width: number;
  height: number;
  terrain: Uint8Array;
  units: Unit[];
  pickups: Pickup[];
  turn: TurnState;
  suddenDeath: boolean;
  actorId: number;
  level: BotLevel;
}

self.onmessage = (e: MessageEvent<PlanRequest>) => {
  const r = e.data;
  const state = {
    config: { mapId: r.mapId, seed: r.seed, players: [] },
    map: getMap(r.mapId),
    terrain: new Terrain(r.width, r.height, r.terrain),
    units: r.units,
    rng: new Rng(r.seed),
    turn: r.turn,
    phase: 'turn',
    winner: null,
    suddenDeath: r.suddenDeath,
    nextProjectileId: 1,
    pickups: r.pickups,
    nextPickupId: 1,
  } as GameState;
  // The actor is found by id, so no field of a message is ever used as a property name. Without a match
  // there's no reply, and BotPlanner's timeout plans on the main thread instead.
  const actor = state.units.find((u) => u.id === r.actorId);
  if (!actor) return;
  const plan = planBotTurn(state, actor, r.level);
  (self as unknown as Worker).postMessage({ id: r.id, plan });
};
