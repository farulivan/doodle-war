import { describe, expect, it } from 'vitest';
import {
  MAPS,
  UNIT_KINDS,
  beginTurn,
  createMatch,
  fire,
  moveActive,
  planBotTurn,
  skipTurn,
  type UnitKind,
} from '../src';

/** Plays a whole bot-vs-bot match through the same calls the client makes. */
function playMatch(mapId: string, seed: number, perTeam: number) {
  const kinds: UnitKind[] = [];
  for (let i = 0; i < perTeam * 2; i++) kinds.push(UNIT_KINDS[(seed + i) % UNIT_KINDS.length]);
  const state = createMatch({
    mapId,
    seed,
    players: kinds.map((kind, i) => ({
      name: `B${i}`,
      team: i % 2,
      kind,
      controller: 'bot',
      botLevel: 'normal',
    })),
  });
  let turns = 0;
  while (state.phase !== 'over' && turns < 300) {
    const actor = beginTurn(state);
    if (!actor) break;
    turns++;
    const plan = planBotTurn(state, actor);
    if (plan.move !== 0) {
      const res = moveActive(state, plan.move > 0 ? 1 : -1, Math.abs(plan.move));
      if (res.turnEnded) continue;
    }
    actor.facing = plan.facing;
    if (!Number.isFinite(plan.angle) || !Number.isFinite(plan.power)) {
      skipTurn(state);
      continue;
    }
    const result = fire(state, { angle: plan.angle, power: plan.power, slot: plan.slot });
    expect(result.totalTicks).toBeLessThan(60 * 20);
  }
  return { state, turns };
}

describe('full bot matches', () => {
  for (const map of MAPS) {
    it(`finishes on ${map.name}`, () => {
      const lengths: number[] = [];
      for (const seed of [1, 2]) {
        const { state, turns } = playMatch(map.id, seed, seed);
        expect(state.phase).toBe('over');
        lengths.push(turns);
      }
      // Rough pacing check: matches should neither be instant nor drag on forever.
      console.log(`${map.name}: turns ${lengths.join(', ')}`);
      for (const n of lengths) expect(n).toBeGreaterThan(3);
    }, 120_000);
  }
});
