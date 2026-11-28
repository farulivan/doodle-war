import { describe, expect, it } from 'vitest';
import {
  DIRT,
  GLUE,
  INK_DELAY,
  MAPS,
  MARK_BONUS,
  Terrain,
  UNITS,
  beginTurn,
  bodyCenter,
  buildTerrain,
  createMatch,
  drawLine,
  fire,
  moveActive,
  muzzle,
  runShot,
  UNIT_KINDS,
  type GameState,
  type ShotSimulation,
  type UnitKind,
  type WeaponSlot,
} from '../src';

/** Flat ground at y=800, no wind, the first unit at x=600 facing right and taking the first turn. */
function flat(kinds: UnitKind[], xs: number[]): GameState {
  const state = createMatch({
    mapId: 'margin-hills',
    seed: 7,
    players: kinds.map((kind, i) => ({
      name: `P${i}`,
      team: i === 0 ? 0 : 1,
      kind,
      controller: 'bot',
      botLevel: 'hard',
    })),
  });
  const t = new Terrain(2600, 1100);
  for (let y = 800; y < 1000; y++) for (let x = 0; x < t.width; x++) t.set(x, y, DIRT);
  state.terrain = t;
  state.units.forEach((u, i) => {
    u.x = xs[i];
    u.y = 799;
    u.tilt = 0;
    u.facing = i === 0 ? 1 : -1;
    u.delay = i;
  });
  beginTurn(state);
  state.turn.wind = { strength: 0, angle: 0, ax: 0, ay: 0 };
  return state;
}

/** The best shot for the first unit by `score`, found with dry runs the way the bots aim. */
function search(state: GameState, slot: WeaponSlot, score: (sim: ShotSimulation) => number) {
  const actor = state.units[0];
  const weapon = UNITS[actor.kind].weapons[slot];
  let best = { angle: 45, power: 50, score: -Infinity };
  for (let angle = 5; angle <= 85; angle += 1) {
    for (let power = 20; power <= 100; power += 1) {
      const sim = runShot(state, actor, weapon, angle, power, { dry: true });
      const s = score(sim);
      if (s > best.score) best = { angle, power, score: s };
    }
  }
  return best;
}

describe('Highlighter', () => {
  it('fires a beam that bursts where its power says, in a straight line', () => {
    const state = flat(['highlighter', 'pencil'], [600, 2400]);
    state.turn.wind = { strength: 10, angle: 90, ax: 0, ay: 160 };
    const result = fire(state, { angle: 30, power: 40, slot: 0 });
    const blast = result.events.find((e) => e.type === 'explode')!;
    const pts = result.tracks[0].points;
    const flown = Math.hypot(blast.x - pts[0], blast.y - pts[1]);
    expect(flown).toBeGreaterThan(1500 * 0.4 - 10);
    expect(flown).toBeLessThan(1500 * 0.4 + 60);
    // Straight up the aim line however hard the wind blows.
    const slope = (pts[pts.length - 1] - pts[1]) / (pts[pts.length - 2] - pts[0]);
    expect(slope).toBeCloseTo(-Math.tan((30 * Math.PI) / 180), 2);
  });

  it('Overdrive cuts through two enemies in a row and hits both in full', () => {
    const state = flat(['highlighter', 'pencil', 'stapler'], [600, 900, 1100]);
    const actor = state.units[0];
    actor.special = 100;
    const result = fire(state, { angle: 0, power: 100, slot: 2 });
    const direct = result.events.filter((e) => e.type === 'damage' && e.direct);
    expect(direct.map((e) => (e as { unitId: number }).unitId).sort()).toEqual([1, 2]);
  });

  it('a Cap Toss marks its target, and the next hit does more', () => {
    const state = flat(['highlighter', 'pencil'], [600, 1300]);
    const target = state.units[1];
    target.marked = true;
    const hp = target.hp;
    state.units[0].special = 0;
    const result = fire(state, { angle: 0, power: 100, slot: 0 });
    const hit = result.events.find((e) => e.type === 'damage' && e.unitId === 1);
    expect(hit).toBeTruthy();
    expect(target.marked).toBe(false);
    expect(hp - target.hp).toBe(Math.round(UNITS.highlighter.weapons[0].spawns[0].def.damage * MARK_BONUS));
  });
});

describe('Glue Blob', () => {
  it('Glue Wall builds glue where it lands, and never inside a doodle', () => {
    const state = flat(['glue', 'pencil'], [600, 1300]);
    const result = fire(state, { angle: 45, power: 45, slot: 1 });
    const built = result.events.find((e) => e.type === 'build');
    expect(built).toBeTruthy();
    if (built?.type !== 'build') return;
    expect(state.terrain.get(built.x, built.y - 20)).toBe(GLUE);
    for (const u of state.units) {
      const c = bodyCenter(u);
      expect(state.terrain.solid(c.x, c.y)).toBe(false);
    }
  });

  it('Super Glue roots the enemies it hits for their next turn', () => {
    const state = flat(['glue', 'pencil'], [600, 1300]);
    state.units[0].special = 100;
    const enemy = state.units[1];
    // Drop it straight onto the enemy's head from above.
    state.units[0].x = 1240;
    const result = fire(state, { angle: 80, power: 30, slot: 2 });
    expect(result.events.some((e) => e.type === 'status' && e.status === 'rooted')).toBe(true);
    expect(enemy.rooted).toBe(1);
    state.units[0].delay = 9999;
    const next = beginTurn(state)!;
    expect(next.id).toBe(enemy.id);
    expect(state.turn.moveLeft).toBe(0);
    expect(moveActive(state, 1, 30).moved).toBe(0);
  });

  it('climbs a step that stops the Pencil Tank', () => {
    const climbs = (kind: UnitKind) => {
      const state = flat([kind, 'pencil'], [600, 2000]);
      for (let y = 794; y < 800; y++) for (let x = 620; x < 700; x++) state.terrain.set(x, y, DIRT);
      moveActive(state, 1, 60);
      return state.units[0].x;
    };
    expect(climbs('pencil')).toBeLessThan(620);
    expect(climbs('glue')).toBeGreaterThan(640);
  });
});

describe('Ink Squid', () => {
  it('a rain of ink pushes the enemy turn back once, not once per drop', () => {
    const state = flat(['squid', 'stapler'], [600, 1300]);
    state.units[0].special = 100;
    const enemy = state.units[1];
    const c = bodyCenter(enemy);
    // The shot whose drops land on the enemy most often.
    const shot = search(
      state,
      2,
      (sim) => sim.impacts.filter((p) => Math.hypot(p.x - c.x, p.y - c.y) < 40).length,
    );
    expect(shot.score).toBeGreaterThan(1);
    const before = enemy.delay;
    const result = fire(state, { angle: shot.angle, power: shot.power, slot: 2 });
    const drops = result.events.filter((e) => e.type === 'damage' && e.unitId === enemy.id).length;
    expect(drops).toBeGreaterThan(1);
    expect(enemy.delay - before).toBe(INK_DELAY);
    expect(enemy.inked).toBe(1);
  });
});

describe('Stapler Mech', () => {
  it('takes less from a splash than the Pencil Tank does', () => {
    // The same shell, landing on the ground just short of each target.
    const aim = (() => {
      const state = flat(['pencil', 'pencil'], [600, 1000]);
      return search(state, 0, (sim) => {
        const p = sim.impacts[0];
        return p && p.y > 790 ? -Math.abs(p.x - 975) : -Infinity;
      });
    })();
    const splash = (kind: UnitKind) => {
      const state = flat(['pencil', kind], [600, 1000]);
      const target = state.units[1];
      const result = fire(state, { angle: aim.angle, power: aim.power, slot: 0 });
      const hit = result.events.find((e) => e.type === 'damage' && e.unitId === target.id);
      return hit?.type === 'damage' && !hit.direct ? hit.amount : null;
    };
    const pencil = splash('pencil');
    const stapler = splash('stapler');
    expect(pencil).not.toBeNull();
    expect(stapler).not.toBeNull();
    expect(stapler!).toBeLessThan(pencil!);
  });
});

describe('Paper Plane', () => {
  it('glides across a gap the others fall into', () => {
    const cross = (kind: UnitKind) => {
      const state = flat([kind, 'pencil'], [600, 2000]);
      // A 70px gap with no bottom.
      for (let y = 0; y < state.terrain.height; y++)
        for (let x = 640; x < 710; x++) state.terrain.set(x, y, 0);
      const res = moveActive(state, 1, 80);
      return { alive: state.units[0].alive, x: state.units[0].x, glide: res.glide };
    };
    const plane = cross('plane');
    expect(plane.alive).toBe(true);
    // Its feet catch the far ledge a couple of pixels before the edge.
    expect(plane.x).toBeGreaterThanOrEqual(706);
    expect(plane.glide).not.toBeNull();
    expect(cross('stapler').alive).toBe(false);
  });
});

describe('Pencil Tank', () => {
  it('draws a longer line than the others', () => {
    const length = (kind: UnitKind) => {
      const state = flat([kind, 'stapler'], [600, 2000]);
      const c = bodyCenter(state.units[0]);
      const res = drawLine(state, c.x + 20, c.y - 80, c.x + 300, c.y - 80);
      return res.x1 - res.x0;
    };
    expect(length('pencil')).toBeGreaterThan(length('squid') + 80);
  });
});

describe('fair maps', () => {
  for (const map of MAPS) {
    it(`${map.name} is a mirror image, and so are the spawns`, () => {
      const t = buildTerrain(map, 12345);
      for (let y = 0; y < t.height; y += 7) {
        for (let x = 0; x < t.width / 2; x += 5) {
          expect(t.get(x, y)).toBe(t.get(t.width - 1 - x, y));
        }
      }
      const state = createMatch({
        mapId: map.id,
        seed: 3,
        players: [0, 1, 2, 3, 4, 5].map((i) => ({
          name: `P${i}`,
          team: i % 2,
          kind: 'pencil' as const,
          controller: 'bot' as const,
        })),
      });
      const left = state.units.filter((u) => u.team === 0).map((u) => [u.x, u.y]);
      const right = state.units.filter((u) => u.team === 1).map((u) => [state.terrain.width - 1 - u.x, u.y]);
      expect(right).toEqual(left);
    });
  }
});

describe('barrels', () => {
  it('no doodle fires from inside its own body, at any angle it can aim, on any slope', () => {
    for (const kind of UNIT_KINDS) {
      const def = UNITS[kind];
      const state = flat([kind, 'pencil'], [600, 2000]);
      const u = state.units[0];
      for (const tilt of [-0.6, 0, 0.6]) {
        for (const facing of [1, -1] as const) {
          u.tilt = tilt;
          u.facing = facing;
          for (let a = def.angleMin; a <= def.angleMax; a += 5) {
            const m = muzzle(u, a);
            const c = bodyCenter(u);
            expect(Math.hypot(m.x - c.x, m.y - c.y), `${kind} at ${a}°`).toBeGreaterThan(def.bodyRadius + 2);
          }
        }
      }
    }
  });
});
