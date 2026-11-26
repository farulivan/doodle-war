import type { UnitKind } from './defs';
import type { Collected } from './pickups';
import type { BotLevel, FireInput, MatchConfig, Pickup, ShotResult, TurnState, Unit } from './state';
import type { Rect } from './terrain';

/**
 * Wire format between the online room server and clients. The server runs the sim as the
 * single authority; clients keep a mirror for rendering and send intents.
 */

export const ROOM_NAME = 'doodle';
export const MAX_PER_TEAM = 3;

export interface LobbyPlayer {
  /** Session id for humans, `bot-<n>` for bots. */
  id: string;
  name: string;
  team: 0 | 1;
  kind: UnitKind;
  ready: boolean;
  bot: boolean;
  botLevel: BotLevel;
  host: boolean;
  connected: boolean;
}

export interface LobbySettings {
  mapId: string;
  mapSeed: number | null;
  turnSeconds: number;
}

export interface LobbySnapshot {
  code: string;
  phase: 'lobby' | 'playing' | 'over';
  players: LobbyPlayer[];
  settings: LobbySettings;
}

// Client -> server -----------------------------------------------------------

export interface ClientMessages {
  profile: { name?: string; kind?: UnitKind; team?: 0 | 1 };
  ready: { ready: boolean };
  settings: Partial<LobbySettings>;
  addBot: { team: 0 | 1 };
  updateBot: { id: string; kind?: UnitKind; botLevel?: BotLevel; team?: 0 | 1 };
  removeBot: { id: string };
  start: Record<string, never>;
  move: { dir: 1 | -1; px: number };
  hop: Record<string, never>;
  aim: AimUpdate;
  fire: FireInput;
  draw: { x0: number; y0: number; x1: number; y1: number };
  backToLobby: Record<string, never>;
}

// Server -> client -----------------------------------------------------------

export interface AimUpdate {
  unitId: number;
  angle: number;
  facing: 1 | -1;
  power: number;
  charging: boolean;
  slot: 0 | 1 | 2;
}

export interface MatchStart {
  config: MatchConfig;
  /** Session id (or `bot`) controlling each unit, by unit id. */
  owners: string[];
  terrain: Uint8Array;
  units: Unit[];
}

export interface TurnMessage {
  turn: TurnState;
  units: Unit[];
  pickups: Pickup[];
  suddenDeath: boolean;
  /** Seconds on the clock for this turn; 0 means no limit. */
  seconds: number;
}

export interface MoveMessage {
  unitId: number;
  x: number;
  y: number;
  tilt: number;
  facing: 1 | -1;
  moveLeft: number;
  fall: { fromY: number; toY: number; dead: boolean } | null;
  turnEnded: boolean;
  collected: Collected[];
  /** Set when this move was a hop, so watchers can animate the arc. */
  hop?: { fromX: number; fromY: number; peakX: number; peakY: number };
}

export interface ShotMessage {
  result: ShotResult;
  /** Unit state after the shot settles; clients apply it once the animation ends. */
  units: Unit[];
}

export interface DrawMessage {
  unitId: number;
  rect: Rect;
  /** RLE-encoded terrain bytes for the rect, row by row. */
  data: Uint8Array;
}

export interface OverMessage {
  winner: number;
  turns: number;
  units: Unit[];
}

export interface SyncMessage extends MatchStart {
  turn: TurnState;
  pickups: Pickup[];
  suddenDeath: boolean;
  seconds: number;
  phase: 'playing' | 'over';
}

// Run-length codec for terrain bytes ------------------------------------------

/** Encodes bytes as (value, varint length) pairs. Terrain compresses about 50x. */
export function rleEncode(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const v = bytes[i];
    let n = 1;
    while (i + n < bytes.length && bytes[i + n] === v) n++;
    out.push(v);
    let len = n;
    while (len >= 0x80) {
      out.push((len & 0x7f) | 0x80);
      len >>>= 7;
    }
    out.push(len);
    i += n;
  }
  return Uint8Array.from(out);
}

export function rleDecode(encoded: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let o = 0;
  let i = 0;
  while (i < encoded.length && o < length) {
    const v = encoded[i++];
    let len = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded[i++];
      len |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    out.fill(v, o, Math.min(length, o + len));
    o += len;
  }
  return out;
}

/** Copies a rect of a terrain buffer out (row-major) for sending. */
export function sliceRect(data: Uint8Array, width: number, rect: Rect): Uint8Array {
  const w = rect.x1 - rect.x0 + 1;
  const h = rect.y1 - rect.y0 + 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const src = (rect.y0 + y) * width + rect.x0;
    out.set(data.subarray(src, src + w), y * w);
  }
  return out;
}

export function writeRect(data: Uint8Array, width: number, rect: Rect, bytes: Uint8Array): void {
  const w = rect.x1 - rect.x0 + 1;
  const h = rect.y1 - rect.y0 + 1;
  for (let y = 0; y < h; y++) {
    data.set(bytes.subarray(y * w, y * w + w), (rect.y0 + y) * width + rect.x0);
  }
}

/** Rounds track points to whole pixels so shot messages stay small. */
export function compactShot(result: ShotResult): ShotResult {
  return {
    ...result,
    tracks: result.tracks.map((t) => ({ ...t, points: t.points.map((v) => Math.round(v)) })),
  };
}

/** Lobby players to match config, interleaving teams so turn order alternates. */
export function lobbyToConfig(
  players: LobbyPlayer[],
  settings: LobbySettings,
  seed: number,
): { config: MatchConfig; owners: string[] } {
  const teams: LobbyPlayer[][] = [players.filter((p) => p.team === 0), players.filter((p) => p.team === 1)];
  const ordered: LobbyPlayer[] = [];
  for (let i = 0; i < Math.max(teams[0].length, teams[1].length); i++) {
    for (const t of teams) if (t[i]) ordered.push(t[i]);
  }
  return {
    config: {
      mapId: settings.mapId,
      mapSeed: settings.mapSeed ?? undefined,
      seed,
      players: ordered.map((p) => ({
        name: p.name,
        team: p.team,
        kind: p.kind,
        controller: p.bot ? 'bot' : 'human',
        botLevel: p.botLevel,
      })),
    },
    owners: ordered.map((p) => (p.bot ? 'bot' : p.id)),
  };
}
