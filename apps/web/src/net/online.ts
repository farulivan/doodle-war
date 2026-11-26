import type { Client, Room } from '@colyseus/sdk';
import {
  ROOM_NAME,
  type AimUpdate,
  type ClientMessages,
  type DrawMessage,
  type LobbySnapshot,
  type MatchStart,
  type MoveMessage,
  type OverMessage,
  type ShotMessage,
  type SyncMessage,
  type TurnMessage,
} from '@doodle/sim';
import { Store } from '../game/store';

/** Where the room server lives. Dev uses the same host on port 2567 so phones on the LAN work too. */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? `ws://${location.hostname}:2567` : '');

export const onlineAvailable = SERVER_URL !== '';

export interface OnlineState {
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  error: string | null;
  lobby: LobbySnapshot | null;
  me: string;
}

export const online = new Store<OnlineState>({ status: 'idle', error: null, lobby: null, me: '' });

/** What the game controller needs to hear from the server. */
export interface OnlineHandlers {
  start(msg: MatchStart, me: string): void;
  sync(msg: SyncMessage, me: string): void;
  turn(msg: TurnMessage): void;
  move(msg: MoveMessage): void;
  aim(msg: AimUpdate): void;
  shot(msg: ShotMessage): void;
  draw(msg: DrawMessage): void;
  skip(msg: { unitId: number }): void;
  over(msg: OverMessage): void;
  toast(text: string): void;
}

const TOKEN_KEY = 'doodle-war:reconnect';
const NAME_KEY = 'doodle-war:name';

export function savedName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

class OnlineSession {
  private client: Client | null = null;
  private room: Room | null = null;
  private handlers: OnlineHandlers | null = null;

  bind(handlers: OnlineHandlers): void {
    this.handlers = handlers;
  }

  get connected(): boolean {
    return !!this.room;
  }

  /** The SDK is only downloaded when someone actually goes online. */
  private async getClient(): Promise<Client> {
    if (!this.client) {
      const { Client: SdkClient } = await import('@colyseus/sdk');
      this.client = new SdkClient(SERVER_URL);
    }
    return this.client;
  }

  async create(name: string): Promise<void> {
    await this.connect(async () => (await this.getClient()).create(ROOM_NAME, { name }), name);
  }

  async join(code: string, name: string): Promise<void> {
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{4}$/.test(clean)) {
      online.set({ status: 'error', error: 'Room codes are 4 letters, like KQ7P' });
      return;
    }
    await this.connect(async () => (await this.getClient()).joinById(clean, { name }), name);
  }

  /**
   * Rejoins after a page refresh, if this tab was in a room. Only on a real reload:
   * duplicated tabs (and same-origin iframes) share the stored token and would steal the seat.
   */
  async resume(): Promise<boolean> {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!token || !onlineAvailable || nav?.type !== 'reload') return false;
    try {
      await this.connect(async () => (await this.getClient()).reconnect(token), savedName());
      return true;
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      online.set({ status: 'idle', error: null });
      return false;
    }
  }

  private async connect(open: () => Promise<Room>, name: string): Promise<void> {
    if (!onlineAvailable) {
      online.set({ status: 'error', error: 'Online play is not set up for this build' });
      return;
    }
    if (name) localStorage.setItem(NAME_KEY, name);
    online.set({ status: 'connecting', error: null });
    try {
      const room = await open();
      this.attach(room);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const friendly = /not found|locked|full/i.test(message)
        ? "Couldn't join that room. Check the code, or the match may have started."
        : /failed|ECONNREFUSED|network|connect/i.test(message)
          ? "Can't reach the game server right now."
          : message;
      online.set({ status: 'error', error: friendly });
      throw err;
    }
  }

  private attach(room: Room): void {
    this.room = room;
    sessionStorage.setItem(TOKEN_KEY, room.reconnectionToken);
    online.set({ status: 'connected', error: null, me: room.sessionId });
    const h = () => this.handlers!;
    room.onMessage('lobby', (m: LobbySnapshot) => online.set({ lobby: m }));
    room.onMessage('start', (m: MatchStart) => h().start(m, room.sessionId));
    room.onMessage('sync', (m: SyncMessage) => h().sync(m, room.sessionId));
    room.onMessage('turn', (m: TurnMessage) => h().turn(m));
    room.onMessage('move', (m: MoveMessage) => h().move(m));
    room.onMessage('aim', (m: AimUpdate) => h().aim(m));
    room.onMessage('shot', (m: ShotMessage) => h().shot(m));
    room.onMessage('draw', (m: DrawMessage) => h().draw(m));
    room.onMessage('skip', (m: { unitId: number }) => h().skip(m));
    room.onMessage('over', (m: OverMessage) => h().over(m));
    room.onMessage('toast', (m: { text: string }) => h().toast(m.text));
    room.onDrop(() => online.set({ status: 'reconnecting' }));
    room.onReconnect(() => {
      sessionStorage.setItem(TOKEN_KEY, room.reconnectionToken);
      online.set({ status: 'connected' });
    });
    room.onLeave((code: number) => {
      if (this.room !== room) return;
      this.room = null;
      sessionStorage.removeItem(TOKEN_KEY);
      const consented = code === 1000 || code === 4000;
      online.set({
        status: consented ? 'idle' : 'error',
        error: consented ? null : 'Disconnected from the room',
        lobby: null,
      });
    });
  }

  send<K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]): void {
    this.room?.send(type as string, payload);
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.room = null;
    sessionStorage.removeItem(TOKEN_KEY);
    online.set({ status: 'idle', error: null, lobby: null });
    if (room) await room.leave().catch(() => undefined);
  }
}

export const session = new OnlineSession();
