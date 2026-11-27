import { Room, ServerError, type AuthContext, type Client } from '@colyseus/core';
import {
  MAPS,
  MAX_PER_TEAM,
  UNIT_KINDS,
  activeUnit,
  beginTurn,
  checkWinner,
  compactShot,
  createMatch,
  drawLine,
  faceActive,
  fire,
  hopActive,
  lobbyToConfig,
  moveActive,
  planBotTurn,
  rleEncode,
  skipTurn,
  sliceRect,
  type AimUpdate,
  type BotLevel,
  type ClientMessages,
  type GameState,
  type LobbyPlayer,
  type LobbySettings,
  type LobbySnapshot,
  type MatchStart,
  type MoveMessage,
  type SyncMessage,
  type TurnMessage,
  type Unit,
  type UnitKind,
} from '@doodle/sim';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const activeCodes = new Set<string>();
const BOT_NAMES = ['Scribbles', 'Smudge', 'Inky', 'Doodles', 'Sketchy', 'Penny'];
/** Time for clients to read the turn banner before a bot acts. */
const BOT_THINK_MS = 1100;
/** Extra time after a shot animation before the next turn starts. */
const SHOT_SETTLE_MS = 1300;
const RECONNECT_SECONDS = 45;
/** Walking intents are capped so a client can't teleport. */
const MAX_MOVE_PER_MESSAGE = 12;

function makeCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!activeCodes.has(code)) return code;
  }
}

function cleanName(name: unknown, fallback: string): string {
  const s =
    typeof name === 'string'
      ? name
          .replace(/[^\p{L}\p{N} _.-]/gu, '')
          .trim()
          .slice(0, 14)
      : '';
  return s || fallback;
}

/** A comma-separated list of origins, such as `https://a.example,https://b.example`. */
export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Whether a request with this Origin header may use the server. No header means it isn't from a browser. */
export function originAllowed(origin: string | null): boolean {
  const allowed = DoodleRoom.allowedOrigins;
  return allowed.length === 0 || origin === null || allowed.includes(origin);
}

const isKind = (k: unknown): k is UnitKind => typeof k === 'string' && (UNIT_KINDS as string[]).includes(k);
const isLevel = (l: unknown): l is BotLevel => l === 'easy' || l === 'normal' || l === 'hard';
const isTeam = (t: unknown): t is 0 | 1 => t === 0 || t === 1;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * One online match room, addressed by a 4-letter code. The server owns the sim: clients
 * send intents (walk, aim, fire, draw) and get back authoritative results to animate.
 */
export class DoodleRoom extends Room {
  /**
   * The sites a browser may create or join a room from, from ALLOWED_ORIGINS. Empty allows any, for local
   * play and the tests.
   */
  static allowedOrigins: string[] = parseOrigins(process.env.ALLOWED_ORIGINS);
  /**
   * Rooms open at once, from MAX_ROOMS. Kept low so the hosting bill stays low: a match in progress takes
   * about 6 MB, so 10 of them add about 60 MB to the server's own 80 MB.
   */
  static maxRooms = Number(process.env.MAX_ROOMS) || 10;

  /**
   * Runs before `create` or `joinById` makes or reserves anything. A browser always sends Origin with these
   * requests, so a page on another site is turned away here, even through a request that skips the CORS
   * preflight. Clients that aren't browsers send no Origin; the message and room caps cover those.
   */
  static override async onAuth(_token: string, _options: unknown, context: AuthContext): Promise<boolean> {
    return originAllowed(context.headers.get('origin'));
  }

  override maxClients = MAX_PER_TEAM * 2;
  /**
   * A client past this is dropped (and may reconnect). Walking sends at most one message per pixel, about
   * 55 a second, and aiming about 10, so honest play stays well under it.
   */
  override maxMessagesPerSecond = 120;

  private code = '';
  private phase: LobbySnapshot['phase'] = 'lobby';
  private players: LobbyPlayer[] = [];
  private settings: LobbySettings = { mapId: MAPS[0].id, mapSeed: null, turnSeconds: 30 };
  private botCounter = 0;

  private state_: GameState | null = null;
  private owners: string[] = [];
  /** Bumped on every turn so stale timers from a previous turn do nothing. */
  private turnToken = 0;
  private turnTimer: { clear(): void } | null = null;
  private turnSeconds = 0;
  private turnStartedAt = 0;
  private busy = false;

  override onCreate(): void {
    // The message reaches the player as it is. Words such as "full" or "failed" would make the game show
    // its own message for a wrong code or a lost connection instead (see connect() in online.ts).
    if (activeCodes.size >= DoodleRoom.maxRooms) {
      throw new ServerError(503, 'Too many rooms are open right now. Try again in a few minutes.');
    }
    this.code = makeCode();
    activeCodes.add(this.code);
    this.roomId = this.code;
    this.autoDispose = true;
    // The code is the only way in. A public room could be entered with join('doodle') by anyone who
    // doesn't know it.
    void this.setPrivate(true);

    this.on('profile', (c, m) => this.onProfile(c, m));
    this.on('ready', (c, m) => this.onReady(c, m));
    this.on('settings', (c, m) => this.onSettings(c, m));
    this.on('addBot', (c, m) => this.onAddBot(c, m));
    this.on('updateBot', (c, m) => this.onUpdateBot(c, m));
    this.on('removeBot', (c, m) => this.onRemoveBot(c, m));
    this.on('start', (c) => this.onStart(c));
    this.on('move', (c, m) => this.onMove(c, m));
    this.on('hop', (c) => this.onHop(c));
    this.on('aim', (c, m) => this.onAim(c, m));
    this.on('fire', (c, m) => this.onFire(c, m));
    this.on('draw', (c, m) => this.onDraw(c, m));
    this.on('backToLobby', () => this.onBackToLobby());
  }

  /**
   * Every client message is an object, even an empty one. Anything else (null, a number) is dropped here,
   * so the handlers can read fields without checking for it.
   */
  private on<K extends keyof ClientMessages>(
    type: K,
    handler: (client: Client, m: ClientMessages[K]) => void,
  ): void {
    this.onMessage(type, (client: Client, m: unknown) => {
      if (typeof m === 'object' && m !== null) handler(client, m as ClientMessages[K]);
    });
  }

  override onJoin(client: Client, options: { name?: string } = {}): void {
    const team: 0 | 1 = this.teamCount(0) <= this.teamCount(1) ? 0 : 1;
    if (this.teamCount(team) >= MAX_PER_TEAM) {
      // A bot holds the slot; a human takes priority.
      const bot = this.players.find((p) => p.bot && p.team === team);
      if (bot) this.players = this.players.filter((p) => p !== bot);
    }
    this.players.push({
      id: client.sessionId,
      name: cleanName(options.name, `Player ${this.players.length + 1}`),
      team,
      kind: UNIT_KINDS[Math.floor(Math.random() * UNIT_KINDS.length)],
      ready: false,
      bot: false,
      botLevel: 'normal',
      host: !this.players.some((p) => p.host && !p.bot),
      connected: true,
    });
    this.broadcastLobby();
  }

  override onDrop(client: Client): void {
    const p = this.player(client);
    if (p) p.connected = false;
    this.broadcastLobby();
    this.allowReconnection(client, RECONNECT_SECONDS);
  }

  override onReconnect(client: Client): void {
    const p = this.player(client);
    if (p) p.connected = true;
    this.broadcastLobby();
    if (this.state_ && this.phase !== 'lobby') client.send('sync', this.syncMessage());
  }

  override onLeave(client: Client): void {
    const p = this.player(client);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players = this.players.filter((x) => x !== p);
    } else {
      // Mid-match: a bot takes over their units so the match can finish.
      p.connected = false;
      if (this.state_) {
        for (const u of this.state_.units) {
          if (this.owners[u.id] === client.sessionId) {
            this.owners[u.id] = 'bot';
            u.controller = 'bot';
          }
        }
        this.broadcast('toast', { text: `${p.name} left. A bot takes over.` });
        const actor = activeUnit(this.state_);
        if (actor && this.owners[actor.id] === 'bot' && !this.busy && this.state_.phase === 'turn')
          this.runBot(this.turnToken);
      }
      this.players = this.players.filter((x) => x !== p);
    }
    if (p.host) {
      const next = this.players.find((x) => !x.bot);
      if (next) next.host = true;
    }
    this.broadcastLobby();
  }

  override onDispose(): void {
    activeCodes.delete(this.code);
    this.turnTimer?.clear();
  }

  // ---------------------------------------------------------------------------
  // Lobby

  private player(client: Client): LobbyPlayer | undefined {
    return this.players.find((p) => p.id === client.sessionId);
  }

  private isHost(client: Client): boolean {
    return !!this.player(client)?.host;
  }

  private teamCount(team: 0 | 1): number {
    return this.players.filter((p) => p.team === team).length;
  }

  private lobbySnapshot(): LobbySnapshot {
    return { code: this.code, phase: this.phase, players: this.players, settings: this.settings };
  }

  private broadcastLobby(): void {
    this.broadcast('lobby', this.lobbySnapshot());
  }

  private onProfile(client: Client, m: ClientMessages['profile']): void {
    const p = this.player(client);
    if (!p || this.phase !== 'lobby') return;
    if (m.name !== undefined) p.name = cleanName(m.name, p.name);
    if (isKind(m.kind)) p.kind = m.kind;
    if (isTeam(m.team) && m.team !== p.team && this.teamCount(m.team) < MAX_PER_TEAM) p.team = m.team;
    this.broadcastLobby();
  }

  private onReady(client: Client, m: ClientMessages['ready']): void {
    const p = this.player(client);
    if (!p || this.phase !== 'lobby') return;
    p.ready = !!m.ready;
    this.broadcastLobby();
  }

  private onSettings(client: Client, m: ClientMessages['settings']): void {
    if (!this.isHost(client) || this.phase !== 'lobby') return;
    if (typeof m.mapId === 'string' && MAPS.some((x) => x.id === m.mapId)) this.settings.mapId = m.mapId;
    if (m.mapSeed === null || (finite(m.mapSeed) && m.mapSeed >= 0))
      this.settings.mapSeed = m.mapSeed ?? null;
    if (finite(m.turnSeconds) && [0, 20, 30, 45].includes(m.turnSeconds))
      this.settings.turnSeconds = m.turnSeconds;
    this.broadcastLobby();
  }

  private onAddBot(client: Client, m: ClientMessages['addBot']): void {
    if (!this.isHost(client) || this.phase !== 'lobby' || !isTeam(m.team)) return;
    if (this.teamCount(m.team) >= MAX_PER_TEAM) return;
    const n = this.botCounter++;
    this.players.push({
      id: `bot-${n}`,
      name: BOT_NAMES[n % BOT_NAMES.length],
      team: m.team,
      kind: UNIT_KINDS[n % UNIT_KINDS.length],
      ready: true,
      bot: true,
      botLevel: 'normal',
      host: false,
      connected: true,
    });
    this.broadcastLobby();
  }

  private onUpdateBot(client: Client, m: ClientMessages['updateBot']): void {
    if (!this.isHost(client) || this.phase !== 'lobby') return;
    const bot = this.players.find((p) => p.bot && p.id === m.id);
    if (!bot) return;
    if (isKind(m.kind)) bot.kind = m.kind;
    if (isLevel(m.botLevel)) bot.botLevel = m.botLevel;
    if (isTeam(m.team) && m.team !== bot.team && this.teamCount(m.team) < MAX_PER_TEAM) bot.team = m.team;
    this.broadcastLobby();
  }

  private onRemoveBot(client: Client, m: ClientMessages['removeBot']): void {
    if (!this.isHost(client) || this.phase !== 'lobby') return;
    this.players = this.players.filter((p) => !(p.bot && p.id === m.id));
    this.broadcastLobby();
  }

  private canStart(): string | null {
    if (this.teamCount(0) === 0 || this.teamCount(1) === 0) return 'Both teams need at least one doodle';
    if (this.players.some((p) => !p.bot && !p.ready && !p.host)) return 'Waiting for everyone to be ready';
    return null;
  }

  private onStart(client: Client): void {
    if (!this.isHost(client) || this.phase !== 'lobby') return;
    const problem = this.canStart();
    if (problem) {
      client.send('toast', { text: problem });
      return;
    }
    const { config, owners } = lobbyToConfig(this.players, this.settings, Math.floor(Math.random() * 1e9));
    this.state_ = createMatch(config);
    this.owners = owners;
    this.phase = 'playing';
    this.busy = false;
    void this.lock();
    this.broadcastLobby();
    const start: MatchStart = {
      config,
      owners,
      terrain: rleEncode(this.state_.terrain.data),
      units: this.state_.units,
    };
    this.broadcast('start', start);
    this.clock.setTimeout(() => this.nextTurn(), 1200);
  }

  private onBackToLobby(): void {
    if (this.phase !== 'over') return;
    this.phase = 'lobby';
    this.state_ = null;
    this.turnTimer?.clear();
    for (const p of this.players) if (!p.bot) p.ready = false;
    void this.unlock();
    this.broadcastLobby();
  }

  // ---------------------------------------------------------------------------
  // Match flow

  private syncMessage(): SyncMessage {
    const s = this.state_!;
    const elapsed = (Date.now() - this.turnStartedAt) / 1000;
    return {
      config: s.config,
      owners: this.owners,
      terrain: rleEncode(s.terrain.data),
      units: s.units,
      turn: s.turn,
      pickups: s.pickups,
      suddenDeath: s.suddenDeath,
      seconds: this.turnSeconds > 0 ? Math.max(1, Math.round(this.turnSeconds - elapsed)) : 0,
      phase: this.phase === 'over' ? 'over' : 'playing',
    };
  }

  private nextTurn(): void {
    const s = this.state_;
    if (!s || this.phase !== 'playing') return;
    if (s.phase === 'over') {
      this.finish();
      return;
    }
    const actor = beginTurn(s);
    if (!actor) {
      this.finish();
      return;
    }
    const token = ++this.turnToken;
    this.busy = false;
    const human = this.owners[actor.id] !== 'bot';
    this.turnSeconds = human ? this.settings.turnSeconds : 0;
    this.turnStartedAt = Date.now();
    const msg: TurnMessage = {
      turn: s.turn,
      units: s.units,
      pickups: s.pickups,
      suddenDeath: s.suddenDeath,
      seconds: this.turnSeconds,
    };
    this.broadcast('turn', msg);

    this.turnTimer?.clear();
    this.turnTimer = null;
    if (human) {
      if (this.turnSeconds > 0) {
        this.turnTimer = this.clock.setTimeout(
          () => {
            if (token !== this.turnToken || this.busy) return;
            skipTurn(s);
            this.broadcast('skip', { unitId: actor.id, reason: 'timeout' });
            this.afterTurn(600);
          },
          this.turnSeconds * 1000 + 500,
        );
      }
    } else {
      this.runBot(token);
    }
  }

  private afterTurn(delayMs: number): void {
    const token = this.turnToken;
    this.turnTimer?.clear();
    this.clock.setTimeout(() => {
      if (token === this.turnToken) this.nextTurn();
    }, delayMs);
  }

  private finish(): void {
    const s = this.state_!;
    this.phase = 'over';
    this.turnTimer?.clear();
    this.broadcast('over', { winner: s.winner ?? -1, turns: s.turn.number, units: s.units });
    this.broadcastLobby();
  }

  /** The client may act only for its own unit, on its turn, while nothing is resolving. */
  private actorFor(client: Client): Unit | null {
    const s = this.state_;
    if (!s || this.phase !== 'playing' || s.phase !== 'turn' || this.busy) return null;
    const actor = activeUnit(s);
    if (!actor || this.owners[actor.id] !== client.sessionId) return null;
    return actor;
  }

  private onMove(client: Client, m: ClientMessages['move']): void {
    const actor = this.actorFor(client);
    if (!actor || (m.dir !== 1 && m.dir !== -1) || !finite(m.px)) return;
    this.applyMove(actor, m.dir, Math.max(0, Math.min(MAX_MOVE_PER_MESSAGE, Math.floor(m.px))));
  }

  private applyMove(actor: Unit, dir: 1 | -1, px: number): MoveMessage {
    const s = this.state_!;
    const res =
      px > 0
        ? moveActive(s, dir, px)
        : (faceActive(s, dir), { moved: 0, fall: null, turnEnded: false, collected: [] });
    const msg: MoveMessage = {
      unitId: actor.id,
      x: actor.x,
      y: actor.y,
      tilt: actor.tilt,
      facing: actor.facing,
      moveLeft: s.turn.moveLeft,
      fall: res.fall,
      turnEnded: res.turnEnded,
      collected: res.collected,
    };
    this.broadcast('move', msg);
    if (res.turnEnded) {
      this.busy = true;
      this.afterTurn(1800);
    }
    return msg;
  }

  private onHop(client: Client): void {
    const actor = this.actorFor(client);
    if (!actor) return;
    const res = hopActive(this.state_!);
    if (!res.ok) return;
    const msg: MoveMessage = {
      unitId: actor.id,
      x: actor.x,
      y: actor.y,
      tilt: actor.tilt,
      facing: actor.facing,
      moveLeft: this.state_!.turn.moveLeft,
      fall: res.fall,
      turnEnded: res.turnEnded,
      collected: res.collected,
      hop: { fromX: res.fromX, fromY: res.fromY, peakX: res.peakX, peakY: res.peakY },
    };
    this.broadcast('move', msg);
    if (res.turnEnded) {
      this.busy = true;
      this.afterTurn(1800);
    }
  }

  private onAim(client: Client, m: ClientMessages['aim']): void {
    const actor = this.actorFor(client);
    if (!actor || !finite(m.angle) || !finite(m.power)) return;
    if (m.facing === 1 || m.facing === -1) actor.facing = m.facing;
    const update: AimUpdate = {
      unitId: actor.id,
      angle: m.angle,
      facing: actor.facing,
      power: Math.max(0, Math.min(100, m.power)),
      charging: !!m.charging,
      slot: m.slot === 1 || m.slot === 2 ? m.slot : 0,
    };
    this.broadcast('aim', update, { except: client });
  }

  private onFire(client: Client, m: ClientMessages['fire']): void {
    const actor = this.actorFor(client);
    if (!actor || !finite(m.angle) || !finite(m.power)) return;
    const slot = m.slot === 1 || m.slot === 2 ? m.slot : 0;
    this.resolveShot(m.angle, m.power, slot);
  }

  private resolveShot(angle: number, power: number, slot: 0 | 1 | 2): void {
    const s = this.state_!;
    this.busy = true;
    this.turnTimer?.clear();
    const result = fire(s, { angle, power, slot });
    this.broadcast('shot', { result: compactShot(result), units: s.units });
    checkWinner(s);
    this.afterTurn((result.totalTicks / 60) * 1000 + SHOT_SETTLE_MS);
  }

  private onDraw(client: Client, m: ClientMessages['draw']): void {
    const actor = this.actorFor(client);
    if (!actor || ![m.x0, m.y0, m.x1, m.y1].every(finite)) return;
    const s = this.state_!;
    const res = drawLine(s, m.x0, m.y0, m.x1, m.y1);
    if (!res.ok || !res.rect) {
      client.send('toast', { text: res.reason ?? "Can't draw there" });
      return;
    }
    this.broadcast('draw', {
      unitId: actor.id,
      rect: res.rect,
      data: rleEncode(sliceRect(s.terrain.data, s.terrain.width, res.rect)),
    });
  }

  // ---------------------------------------------------------------------------
  // Bots: plan with the sim, then act on a timeline so clients can watch.

  private runBot(token: number): void {
    const s = this.state_!;
    const actor = activeUnit(s)!;
    const live = () => token === this.turnToken && this.state_ === s && this.phase === 'playing';

    this.clock.setTimeout(() => {
      if (!live()) return;
      const plan = planBotTurn(s, actor);
      let t = 0;
      const at = (ms: number, fn: () => void) => this.clock.setTimeout(() => live() && fn(), (t += ms));

      if (plan.move !== 0) {
        const dir: 1 | -1 = plan.move > 0 ? 1 : -1;
        let left = Math.abs(plan.move);
        while (left > 0) {
          const step = Math.min(6, left);
          left -= step;
          at(110, () => {
            if (this.busy) return;
            this.applyMove(actor, dir, step);
          });
        }
      }
      at(250, () => {
        if (this.busy) return;
        actor.facing = plan.facing;
        this.applyMove(actor, plan.facing, 0);
      });
      // Sweep the barrel toward the target, then charge, so humans can see it coming.
      const from = actor.angle;
      for (let i = 1; i <= 6; i++) {
        const angle = from + ((plan.angle - from) * i) / 6;
        at(90, () =>
          this.broadcast('aim', {
            unitId: actor.id,
            angle,
            facing: plan.facing,
            power: 0,
            charging: false,
            slot: plan.slot,
          }),
        );
      }
      for (let i = 1; i <= 8; i++) {
        const power = (plan.power * i) / 8;
        at(95, () =>
          this.broadcast('aim', {
            unitId: actor.id,
            angle: plan.angle,
            facing: plan.facing,
            power,
            charging: true,
            slot: plan.slot,
          }),
        );
      }
      at(150, () => {
        if (this.busy) return;
        this.resolveShot(plan.angle, plan.power, plan.slot);
      });
    }, BOT_THINK_MS);
  }
}
