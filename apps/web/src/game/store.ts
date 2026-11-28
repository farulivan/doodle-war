import type { UnitKind, WeaponSlot } from '@doodle/sim';
import { useSyncExternalStore } from 'react';

export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<() => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  get = (): T => this.state;

  set(patch: Partial<T>): void {
    let changed = false;
    for (const key in patch) {
      if (!Object.is(this.state[key], patch[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export function useStore<T extends object, S>(store: Store<T>, select: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

export interface QueueEntry {
  id: number;
  name: string;
  team: number;
  kind: UnitKind;
  hp: number;
  maxHp: number;
  controller: 'human' | 'bot';
}

export interface ActiveInfo extends QueueEntry {
  special: number;
  drawUsed: boolean;
  lastPower: number | null;
  inked: boolean;
  /** Stuck in glue: no walking this turn. */
  rooted: boolean;
  /** Takes extra damage from the next hit. */
  marked: boolean;
}

export interface ResultRow {
  id: number;
  name: string;
  team: number;
  kind: UnitKind;
  alive: boolean;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  shots: number;
}

export interface MatchSummary {
  winner: number;
  /** Online matches go back to the lobby instead of offering a local rematch. */
  online?: boolean;
  /** Did a human-controlled unit's team win? Null when there are no humans or several human teams. */
  humanWon: boolean | null;
  turns: number;
  rows: ResultRow[];
}

export type TurnPhase = 'idle' | 'aim' | 'bot' | 'shot' | 'between' | 'over';

export interface HudState {
  /** 'demo' runs bots behind the title screen; the HUD stays hidden. */
  mode: 'none' | 'demo' | 'match';
  phase: TurnPhase;
  active: ActiveInfo | null;
  queue: QueueEntry[];
  angle: number;
  elevation: number;
  power: number;
  charging: boolean;
  slot: WeaponSlot;
  moveLeft: number;
  moveMax: number;
  windStrength: number;
  windAngle: number;
  turnNumber: number;
  suddenDeath: boolean;
  timer: number | null;
  timerMax: number;
  drawMode: boolean;
  banner: { id: number; text: string; sub?: string } | null;
  toast: { id: number; text: string } | null;
  summary: MatchSummary | null;
  paused: boolean;
  /** Are all human players on one team? Then bots' turns are shown as "enemy turn". */
  soloHuman: boolean;
  online: boolean;
}

export const initialHud: HudState = {
  mode: 'none',
  phase: 'idle',
  active: null,
  queue: [],
  angle: 45,
  elevation: 45,
  power: 0,
  charging: false,
  slot: 0,
  moveLeft: 0,
  moveMax: 1,
  windStrength: 0,
  windAngle: 0,
  turnNumber: 0,
  suddenDeath: false,
  timer: null,
  timerMax: 30,
  drawMode: false,
  banner: null,
  toast: null,
  summary: null,
  paused: false,
  soloHuman: true,
  online: false,
};

export const hud = new Store<HudState>(initialHud);
