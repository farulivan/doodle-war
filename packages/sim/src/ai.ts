import { UNITS, type WeaponSlot } from './defs';
import { canUseSpecial } from './match';
import { bodyCenter, runShot, walk } from './physics';
import { Rng } from './rng';
import type { BotLevel, GameState, Unit } from './state';

export interface BotPlan {
  /** Signed pixels to walk before aiming. */
  move: number;
  facing: 1 | -1;
  angle: number;
  power: number;
  slot: WeaponSlot;
  /** Best expected score, for debugging and tests. */
  score: number;
}

interface Candidate {
  facing: 1 | -1;
  angle: number;
  power: number;
  slot: WeaponSlot;
  score: number;
}

const NOISE: Record<BotLevel, { angle: number; power: number; topPick: number }> = {
  easy: { angle: 5, power: 7, topPick: 5 },
  normal: { angle: 1.5, power: 2.5, topPick: 2 },
  hard: { angle: 0.4, power: 0.8, topPick: 1 },
};

/**
 * Plans a bot turn by brute force: dry-run a coarse grid of shots, refine the best ones,
 * then add level-based aim error. Bots read the wind exactly; the error stands in for skill.
 */
export function planBotTurn(state: GameState, actor: Unit, level: BotLevel = actor.botLevel): BotPlan {
  const rng = new Rng((state.config.seed ^ (state.turn.number * 2654435761)) >>> 0);
  let best = searchFrom(state, actor, actor, rng, level);
  let move = 0;

  // Worth walking over to a pickup? Score the best shot from there plus the pickup's value.
  const budget0 = Math.floor(state.turn.moveLeft);
  for (const p of state.pickups) {
    const dx = p.x - actor.x;
    if (Math.abs(dx) > budget0 || Math.abs(dx) < 4) continue;
    const value = pickupValue(actor, p.kind);
    if (value <= 0) continue;
    const ghost: Unit = { ...actor, stats: { ...actor.stats } };
    const dir: 1 | -1 = dx > 0 ? 1 : -1;
    const res = walk(state, ghost, dir, Math.abs(dx) + 2);
    if (!ghost.alive || Math.abs(ghost.x - p.x) > 6 || Math.abs(ghost.y - p.y) > 14) continue;
    const cand = searchFrom(state, actor, ghost, rng, level);
    const total = Math.max(cand.score, 0) + value;
    if (total > best.score) {
      best = { ...cand, score: total };
      move = dir * res.moved;
    }
  }

  // Nothing to hit from here: try walking toward the enemy and search again.
  if (best.score <= 0) {
    const budget = Math.floor(state.turn.moveLeft);
    const enemy = nearestEnemy(state, actor);
    if (enemy && budget > 10) {
      const dir: 1 | -1 = enemy.x > actor.x ? 1 : -1;
      for (const dist of [budget, Math.floor(budget / 2)]) {
        const ghost: Unit = { ...actor, stats: { ...actor.stats } };
        const res = walk(state, ghost, dir, dist);
        if (!ghost.alive || res.moved < 8) continue;
        const cand = searchFrom(state, actor, ghost, rng, level);
        if (cand.score > best.score) {
          best = cand;
          move = dir * res.moved;
        }
      }
    }
  }

  const noise = NOISE[level];
  const def = UNITS[actor.kind];
  const angle = clamp(best.angle + rng.range(-noise.angle, noise.angle), def.angleMin, def.angleMax);
  const power = clamp(best.power + rng.range(-noise.power, noise.power), 5, 100);
  return { move, facing: best.facing, angle, power, slot: best.slot, score: best.score };
}

function searchFrom(state: GameState, actor: Unit, from: Unit, rng: Rng, level: BotLevel): Candidate {
  const def = UNITS[actor.kind];
  const slots: WeaponSlot[] = canUseSpecial(actor) ? [0, 1, 2] : [0, 1];
  const coarse: Candidate[] = [];
  for (const facing of [1, -1] as const) {
    const shooter: Unit = { ...from, facing };
    for (const slot of slots) {
      for (let angle = def.angleMin; angle <= def.angleMax; angle += 5) {
        for (let power = 25; power <= 100; power += 5) {
          coarse.push({
            facing,
            angle,
            power,
            slot,
            score: score(state, actor, shooter, slot, angle, power),
          });
        }
      }
    }
  }
  coarse.sort((a, b) => b.score - a.score);

  // Refine the top few with a finer grid around each.
  const refined: Candidate[] = [];
  for (const c of coarse.slice(0, 4)) {
    const shooter: Unit = { ...from, facing: c.facing };
    for (let da = -4; da <= 4; da += 2) {
      for (let dp = -4; dp <= 4; dp += 1) {
        const angle = clamp(c.angle + da, def.angleMin, def.angleMax);
        const power = clamp(c.power + dp, 5, 100);
        refined.push({ ...c, angle, power, score: score(state, actor, shooter, c.slot, angle, power) });
      }
    }
  }
  refined.sort((a, b) => b.score - a.score);
  const pool = refined.length ? refined : coarse;
  const top = pool.slice(0, NOISE[level].topPick);
  return top[Math.floor(rng.next() * top.length)] ?? pool[0];
}

function score(
  state: GameState,
  actor: Unit,
  shooter: Unit,
  slot: WeaponSlot,
  angle: number,
  power: number,
): number {
  const weapon = UNITS[actor.kind].weapons[slot];
  const sim = runShot(state, actor, weapon, angle, power, { dry: true, actorOverride: shooter });
  let enemyDamage = 0;
  let friendlyDamage = 0;
  let kills = 0;
  state.units.forEach((u, i) => {
    if (!u.alive) return;
    const dmg = sim.damage[i];
    if (u.team === actor.team) friendlyDamage += u.id === actor.id ? dmg * 1.5 : dmg;
    else {
      enemyDamage += dmg;
      if (sim.killed[i]) kills++;
    }
  });
  if (enemyDamage > 0 || friendlyDamage > 0) {
    // A special that only grazes should not beat a clean normal hit.
    const specialTax = slot === 2 ? 40 : 0;
    return enemyDamage + kills * 300 - friendlyDamage * 1.4 - specialTax;
  }
  // No damage: prefer shots that land close to an enemy so movement and later turns improve.
  let nearest = Infinity;
  for (const impact of sim.impacts) {
    for (const u of state.units) {
      if (!u.alive || u.team === actor.team) continue;
      const c = bodyCenter(u);
      nearest = Math.min(nearest, Math.hypot(impact.x - c.x, impact.y - c.y));
    }
  }
  return nearest === Infinity ? -5000 : -nearest;
}

/** How much a bot wants a pickup, in the same units as damage. */
function pickupValue(actor: Unit, kind: 'bandaid' | 'star' | 'refill'): number {
  if (kind === 'bandaid') {
    const missing = actor.maxHp - actor.hp;
    return missing < 60 ? 0 : Math.min(250, missing) * (actor.hp < actor.maxHp * 0.5 ? 1.2 : 0.7);
  }
  if (kind === 'star') return actor.special >= 100 ? 0 : 90;
  return actor.drawUsed ? 25 : 0;
}

function nearestEnemy(state: GameState, actor: Unit): Unit | null {
  let best: Unit | null = null;
  let dist = Infinity;
  for (const u of state.units) {
    if (!u.alive || u.team === actor.team) continue;
    const d = Math.abs(u.x - actor.x);
    if (d < dist) {
      dist = d;
      best = u;
    }
  }
  return best;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
