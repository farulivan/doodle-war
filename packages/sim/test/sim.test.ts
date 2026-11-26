import { describe, expect, it } from 'vitest';
import {
  DIRT,
  INK,
  MAPS,
  Terrain,
  UNITS,
  beginTurn,
  bodyCenter,
  createMatch,
  drawLine,
  fire,
  hopActive,
  landingY,
  moveActive,
  planBotTurn,
  standingAt,
  turnQueue,
  type GameState,
  type MatchConfig,
  type UnitKind,
} from '../src';

function config(kinds: UnitKind[] = ['pencil', 'stapler'], mapId = 'margin-hills'): MatchConfig {
  return {
    mapId,
    seed: 99,
    players: kinds.map((kind, i) => ({
      name: `P${i}`,
      team: i % 2,
      kind,
      controller: 'bot',
      botLevel: 'hard',
    })),
  };
}

/** A match on flat ground at y=800 with the two units 700px apart and no wind. */
function flatMatch(kinds: UnitKind[] = ['pencil', 'stapler']): GameState {
  const state = createMatch(config(kinds));
  const t = new Terrain(2000, 1100);
  for (let y = 800; y < 1000; y++) for (let x = 0; x < t.width; x++) t.set(x, y, DIRT);
  state.terrain = t;
  state.units.forEach((u, i) => {
    u.x = i % 2 === 0 ? 600 + i * 40 : 1300 + i * 40;
    u.y = 799;
    u.tilt = 0;
    u.facing = i % 2 === 0 ? 1 : -1;
    u.delay = i;
  });
  beginTurn(state);
  state.turn.wind = { strength: 0, angle: 0, ax: 0, ay: 0 };
  return state;
}

describe('terrain', () => {
  it('carves a circle and reports the touched area', () => {
    const t = new Terrain(100, 100);
    for (let i = 0; i < t.data.length; i++) t.data[i] = DIRT;
    const rect = t.carveCircle(50, 50, 10);
    expect(rect).toEqual({ x0: 40, y0: 40, x1: 60, y1: 60 });
    expect(t.solid(50, 50)).toBe(false);
    expect(t.solid(59, 50)).toBe(false);
    expect(t.solid(50, 61)).toBe(true);
    expect(t.solid(58, 58)).toBe(true);
  });

  it('treats out-of-bounds as empty', () => {
    const t = new Terrain(10, 10);
    expect(t.solid(-1, 5)).toBe(false);
    expect(t.solid(5, 99)).toBe(false);
  });
});

describe('maps', () => {
  for (const map of MAPS) {
    it(`${map.name} spawns every unit on solid ground for 4v4`, () => {
      const kinds: UnitKind[] = [
        'pencil',
        'squid',
        'plane',
        'stapler',
        'pencil',
        'squid',
        'plane',
        'stapler',
      ];
      const state = createMatch(config(kinds, map.id));
      for (const u of state.units) {
        expect(standingAt(state.terrain, u.x, u.y)).toBe(true);
        expect(landingY(state.terrain, u.x, u.y)).toBe(u.y);
      }
      const left = state.units.filter((u) => u.team === 0);
      const right = state.units.filter((u) => u.team === 1);
      expect(Math.max(...left.map((u) => u.x))).toBeLessThan(Math.min(...right.map((u) => u.x)));
    });
  }
});

describe('match flow', () => {
  it('is deterministic for the same config', () => {
    const a = createMatch(config());
    const b = createMatch(config());
    beginTurn(a);
    beginTurn(b);
    const ra = fire(a, { angle: 40, power: 70, slot: 0 });
    const rb = fire(b, { angle: 40, power: 70, slot: 0 });
    expect(ra.events).toEqual(rb.events);
    expect(Buffer.from(a.terrain.data).equals(Buffer.from(b.terrain.data))).toBe(true);
  });

  it('alternates turns by delay', () => {
    const state = flatMatch();
    const first = state.turn.activeId;
    fire(state, { angle: 45, power: 30, slot: 0 });
    const second = beginTurn(state)!;
    expect(second.id).not.toBe(first);
  });

  it('a shot that lands on an enemy damages it and carves a crater', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    const plan = planBotTurn(state, actor, 'hard');
    expect(plan.score).toBeGreaterThan(0);
    const result = fire(state, { angle: plan.angle, power: plan.power, slot: plan.slot });
    const enemy = state.units.find((u) => u.team !== actor.team)!;
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(result.events.some((e) => e.type === 'carve')).toBe(true);
    expect(result.tracks[0].points.length).toBeGreaterThan(10);
  });

  it('special weapons need a full meter and fall back to shot 1 otherwise', () => {
    const state = flatMatch();
    const result = fire(state, { angle: 45, power: 50, slot: 2 });
    expect(result.input.slot).toBe(0);
  });

  it('splitting weapons spawn children', () => {
    const state = flatMatch(['squid', 'pencil']);
    state.units[state.turn.activeId].special = 100;
    const result = fire(state, { angle: 60, power: 70, slot: 2 });
    expect(result.events.some((e) => e.type === 'split')).toBe(true);
    expect(result.tracks.length).toBe(8);
  });

  it('the rubber band bounces before exploding', () => {
    const state = flatMatch(['stapler', 'pencil']);
    const result = fire(state, { angle: 30, power: 40, slot: 1 });
    expect(result.events.filter((e) => e.type === 'bounce').length).toBe(2);
  });

  it('units fall into craters dug under them', () => {
    const state = flatMatch();
    const victim = state.units.find((u) => u.id !== state.turn.activeId)!;
    state.terrain.carveCircle(victim.x, victim.y + 30, 32);
    const yBefore = victim.y;
    fire(state, { angle: 45, power: 10, slot: 0 });
    expect(victim.y).toBeGreaterThan(yBefore);
  });

  it('walking off the edge of the page kills the unit and ends the turn', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    // Remove the ground to the left of the actor.
    for (let y = 0; y < state.terrain.height; y++)
      for (let x = 0; x < actor.x - 20; x++) state.terrain.set(x, y, 0);
    const res = moveActive(state, -1, 100);
    expect(res.fall?.dead).toBe(true);
    expect(res.turnEnded).toBe(true);
    expect(state.phase).toBe('over');
  });

  it('movement is limited by the budget', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    const x0 = actor.x;
    moveActive(state, 1, 10_000);
    expect(actor.x - x0).toBe(UNITS[actor.kind].moveBudget);
  });

  it('draw adds ink once per match', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    const c = bodyCenter(actor);
    const ok = drawLine(state, c.x + 40, c.y - 60, c.x + 140, c.y - 60);
    expect(ok.ok).toBe(true);
    expect(state.terrain.get(c.x + 90, c.y - 60)).toBe(INK);
    const again = drawLine(state, c.x + 40, c.y - 90, c.x + 140, c.y - 90);
    expect(again.ok).toBe(false);
  });

  it('ink never fills inside a unit', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    const c = bodyCenter(actor);
    drawLine(state, c.x - 60, c.y, c.x + 60, c.y);
    expect(state.terrain.solid(c.x, c.y)).toBe(false);
  });

  it('a match ends when one team is wiped out', () => {
    const state = flatMatch();
    const enemy = state.units.find((u) => u.id !== state.turn.activeId)!;
    enemy.hp = 1;
    const actor = state.units[state.turn.activeId];
    const plan = planBotTurn(state, actor, 'hard');
    fire(state, { angle: plan.angle, power: plan.power, slot: plan.slot });
    expect(state.phase).toBe('over');
    expect(state.winner).toBe(actor.team);
    expect(turnQueue(state).every((u) => u.team === actor.team)).toBe(true);
  });
});

describe('bot', () => {
  it('plans quickly on a real map', () => {
    const state = createMatch(config(['squid', 'plane']));
    const actor = beginTurn(state)!;
    actor.special = 100;
    const start = performance.now();
    planBotTurn(state, actor, 'normal');
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('protocol', () => {
  it('round-trips terrain through the RLE codec', async () => {
    const { rleEncode, rleDecode } = await import('../src/protocol');
    const state = createMatch(config());
    const enc = rleEncode(state.terrain.data);
    expect(enc.length).toBeLessThan(state.terrain.data.length / 20);
    const dec = rleDecode(enc, state.terrain.data.length);
    expect(dec).toEqual(state.terrain.data);
  });

  it('round-trips a rect slice', async () => {
    const { sliceRect, writeRect, rleEncode, rleDecode } = await import('../src/protocol');
    const t = new Terrain(50, 40);
    t.fillCircle(20, 20, 8, INK);
    const rect = { x0: 10, y0: 10, x1: 30, y1: 30 };
    const bytes = sliceRect(t.data, t.width, rect);
    const copy = new Terrain(50, 40);
    writeRect(copy.data, copy.width, rect, rleDecode(rleEncode(bytes), bytes.length));
    expect(copy.data).toEqual(t.data);
  });
});

describe('pickups', () => {
  it('walking onto a Band-Aid heals and removes it', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    actor.hp = 500;
    state.pickups.push({ id: 99, kind: 'bandaid', x: actor.x + 30, y: actor.y });
    const res = moveActive(state, 1, 40);
    expect(res.collected.map((c) => c.pickupId)).toEqual([99]);
    expect(actor.hp).toBe(750);
    expect(state.pickups.length).toBe(0);
  });

  it('an Ink Refill gives Draw back', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    actor.drawUsed = true;
    state.pickups.push({ id: 5, kind: 'refill', x: actor.x + 20, y: actor.y });
    moveActive(state, 1, 30);
    expect(actor.drawUsed).toBe(false);
  });

  it('explosions pop pickups', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    // Fire almost straight down next to a pickup.
    state.pickups.push({ id: 7, kind: 'star', x: actor.x + 40, y: actor.y });
    const result = fire(state, { angle: 0, power: 5, slot: 0 });
    const popped = result.events.find((e) => e.type === 'pickup' && e.pickupId === 7);
    expect(popped).toBeTruthy();
    expect(state.pickups.length).toBe(0);
  });

  it('pickups drop over a long match and are deterministic', () => {
    const run = () => {
      const s = createMatch(config());
      const seen: string[] = [];
      for (let i = 0; i < 12; i++) {
        beginTurn(s);
        seen.push(s.pickups.map((p) => `${p.kind}@${p.x}`).join(','));
        skipTurnForTest(s);
      }
      return seen;
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.some((x) => x.length > 0)).toBe(true);
  });
});

function skipTurnForTest(state: GameState) {
  const actor = state.units[state.turn.activeId];
  actor.delay += 600;
}

describe('hop', () => {
  it('hops out of a crater the unit cannot walk out of', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    // Dig a steep pit and drop the unit into it.
    state.terrain.carveCircle(actor.x, actor.y + 4, 30);
    actor.y = landingY(state.terrain, actor.x, actor.y)!;
    const startX = actor.x;
    moveActive(state, 1, 60);
    const walked = actor.x - startX;
    expect(walked).toBeLessThan(30);
    let hops = 0;
    while (actor.y > 790 && hops < 4) {
      const res = hopActive(state);
      expect(res.ok).toBe(true);
      moveActive(state, 1, 10);
      hops++;
    }
    expect(actor.y).toBe(799);
  });
});

describe('bot and pickups', () => {
  it('a hurt bot walks to a nearby Band-Aid', () => {
    const state = flatMatch();
    const actor = state.units[state.turn.activeId];
    actor.hp = 300;
    // Put the enemy far out of reach so the only good option is healing.
    const enemy = state.units.find((u) => u.id !== actor.id)!;
    enemy.x = actor.x + 1900;
    state.terrain.carveCircle(enemy.x, enemy.y, 1);
    state.pickups.push({ id: 1, kind: 'bandaid', x: actor.x + 80, y: actor.y });
    const plan = planBotTurn(state, actor, 'hard');
    expect(plan.move).toBeGreaterThan(60);
  });
});
