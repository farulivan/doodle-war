import { planBotTurn, type BotPlan, type GameState, type Unit } from '@doodle/sim';
import type { PlanRequest } from './bot.worker';

/**
 * Runs bot planning off the main thread so the "thinking..." banner and the camera stay
 * smooth. Falls back to planning inline if workers are unavailable.
 */
class BotPlanner {
  private worker: Worker | null = null;
  private failed = false;
  private nextId = 1;
  private pending = new Map<number, (plan: BotPlan) => void>();

  private getWorker(): Worker | null {
    if (this.failed) return null;
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; plan: BotPlan }>) => {
        this.pending.get(e.data.id)?.(e.data.plan);
        this.pending.delete(e.data.id);
      };
      this.worker.onerror = () => {
        this.failed = true;
        this.worker?.terminate();
        this.worker = null;
      };
      return this.worker;
    } catch {
      this.failed = true;
      return null;
    }
  }

  plan(state: GameState, actor: Unit): Promise<BotPlan> {
    const worker = this.getWorker();
    if (!worker) return Promise.resolve(planBotTurn(state, actor));
    const id = this.nextId++;
    const req: PlanRequest = {
      id,
      mapId: state.map.id,
      seed: state.config.seed,
      width: state.terrain.width,
      height: state.terrain.height,
      terrain: state.terrain.data.slice(),
      units: state.units,
      pickups: state.pickups,
      turn: state.turn,
      suddenDeath: state.suddenDeath,
      actorId: actor.id,
      level: actor.botLevel,
    };
    return new Promise((resolve) => {
      // If the worker dies mid-plan, still answer.
      const timeout = window.setTimeout(() => {
        if (this.pending.delete(id)) resolve(planBotTurn(state, actor));
      }, 4000);
      this.pending.set(id, (plan) => {
        window.clearTimeout(timeout);
        resolve(plan);
      });
      worker.postMessage(req, [req.terrain.buffer]);
    });
  }
}

export const botPlanner = new BotPlanner();
