import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import {
  ROOM_NAME,
  createMatch,
  rleDecode,
  type LobbySnapshot,
  type MatchStart,
  type MoveMessage,
  type ShotMessage,
  type TurnMessage,
} from '@doodle/sim';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DoodleRoom } from '../src/DoodleRoom';

const PORT = 25670 + Math.floor(Math.random() * 100);
let server: Server;

beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define(ROOM_NAME, DoodleRoom);
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

/** Resolves with the next message of a type that passes the filter. */
function next<T>(
  room: Room,
  type: string,
  filter: (m: T) => boolean = () => true,
  timeout = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeout);
    const off = room.onMessage(type, (m: T) => {
      if (!filter(m)) return;
      clearTimeout(timer);
      off();
      resolve(m);
    });
  });
}

describe('DoodleRoom', () => {
  it('runs a 1v1 online match: lobby, start, terrain sync, walk and fire', async () => {
    const endpoint = `ws://localhost:${PORT}`;
    const a = new Client(endpoint);
    const b = new Client(endpoint);

    const host = await a.create(ROOM_NAME, { name: 'Host' });
    expect(host.roomId).toMatch(/^[A-Z2-9]{4}$/);
    const guestLobby = new Promise<Room>((resolve) => resolve(b.joinById(host.roomId, { name: 'Guest' })));
    const lobby = await next<LobbySnapshot>(host, 'lobby', (l) => l.players.length === 2);
    const guest = await guestLobby;
    expect(new Set(lobby.players.map((p) => p.team)).size).toBe(2);
    expect(lobby.players.find((p) => p.name === 'Host')?.host).toBe(true);

    const startA = next<MatchStart>(host, 'start');
    const startB = next<MatchStart>(guest, 'start');
    guest.send('ready', { ready: true });
    await next<LobbySnapshot>(host, 'lobby', (l) => l.players.every((p) => p.ready || p.host));
    host.send('start', {});
    const [sa, sb] = await Promise.all([startA, startB]);

    // Both clients get the same terrain, and it matches a local rebuild from the config.
    const local = createMatch(sa.config);
    expect(rleDecode(sa.terrain, local.terrain.data.length)).toEqual(local.terrain.data);
    expect(sb.owners).toEqual(sa.owners);

    const turn = await next<TurnMessage>(host, 'turn');
    const activeOwner = sa.owners[turn.turn.activeId];
    const mover = activeOwner === host.sessionId ? host : guest;
    const watcher = mover === host ? guest : host;

    // Walk a few pixels; everyone sees the authoritative position.
    const moved = next<MoveMessage>(watcher, 'move');
    mover.send('move', { dir: 1, px: 8 });
    const mv = await moved;
    expect(mv.unitId).toBe(turn.turn.activeId);
    expect(mv.moveLeft).toBeLessThan(turn.turn.moveLeft);

    // The other player can't fire out of turn.
    watcher.send('fire', { angle: 45, power: 50, slot: 0 });

    const shotA = next<ShotMessage>(host, 'shot');
    const shotB = next<ShotMessage>(guest, 'shot');
    mover.send('fire', { angle: 50, power: 55, slot: 0 });
    const [ra, rb] = await Promise.all([shotA, shotB]);
    expect(ra.result.actorId).toBe(turn.turn.activeId);
    expect(ra.result.events.length).toBeGreaterThan(0);
    expect(rb.result.events).toEqual(ra.result.events);

    const second = await next<TurnMessage>(host, 'turn', () => true, 15000);
    expect(second.turn.number).toBe(2);

    await host.leave();
    await guest.leave();
  }, 30000);

  it('lets the host fill a team with a bot that plays its own turns', async () => {
    const c = new Client(`ws://localhost:${PORT}`);
    const host = await c.create(ROOM_NAME, { name: 'Solo' });
    await next<LobbySnapshot>(host, 'lobby');
    host.send('profile', { team: 0 });
    host.send('addBot', { team: 1 });
    await next<LobbySnapshot>(host, 'lobby', (l) => l.players.some((p) => p.bot));
    const start = next<MatchStart>(host, 'start');
    host.send('start', {});
    const s = await start;
    const botId = s.owners.indexOf('bot');
    expect(botId).toBeGreaterThanOrEqual(0);

    // Skip our own turn quickly if we're first, by firing a weak shot.
    let turn = await next<TurnMessage>(host, 'turn');
    if (turn.turn.activeId !== botId) {
      host.send('fire', { angle: 80, power: 10, slot: 0 });
      turn = await next<TurnMessage>(host, 'turn', () => true, 15000);
    }
    expect(turn.turn.activeId).toBe(botId);
    const shot = await next<ShotMessage>(host, 'shot', () => true, 15000);
    expect(shot.result.actorId).toBe(botId);
    await host.leave();
  }, 40000);

  it('lets no one into a room without its code', async () => {
    const endpoint = `ws://localhost:${PORT}`;
    const host = await new Client(endpoint).create(ROOM_NAME, { name: 'Host' });
    await next<LobbySnapshot>(host, 'lobby');
    await expect(new Client(endpoint).join(ROOM_NAME, { name: 'Stranger' })).rejects.toThrow();
    await host.leave();
  });

  it('drops a client that floods the room with messages', async () => {
    const room = await new Client(`ws://localhost:${PORT}`).create(ROOM_NAME, { name: 'Flood' });
    await next<LobbySnapshot>(room, 'lobby');
    const dropped = new Promise<void>((resolve) => {
      room.onDrop(() => resolve());
      room.onLeave(() => resolve());
    });
    for (let i = 0; i < 300; i++) room.send('ready', { ready: i % 2 === 0 });
    await dropped;
    await room.leave().catch(() => undefined);
  });

  it('turns away a browser on another site before making a room', async () => {
    const saved = DoodleRoom.allowedOrigins;
    DoodleRoom.allowedOrigins = ['https://doodle-war.example'];
    const create = (origin?: string) =>
      fetch(`http://localhost:${PORT}/matchmake/create/${ROOM_NAME}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
        body: JSON.stringify({ name: 'Origin' }),
      });
    try {
      expect((await create('https://elsewhere.example')).ok).toBe(false);
      expect((await create('https://doodle-war.example')).ok).toBe(true);
      expect((await create()).ok).toBe(true);
    } finally {
      DoodleRoom.allowedOrigins = saved;
    }
  });

  it('stops making rooms at the cap, and still lets players into open ones', async () => {
    const endpoint = `ws://localhost:${PORT}`;
    const host = await new Client(endpoint).create(ROOM_NAME, { name: 'Host' });
    await next<LobbySnapshot>(host, 'lobby');
    const saved = DoodleRoom.maxRooms;
    DoodleRoom.maxRooms = 1;
    try {
      await expect(new Client(endpoint).create(ROOM_NAME, { name: 'Late' })).rejects.toThrow(
        /Too many rooms/,
      );
      const guest = await new Client(endpoint).joinById(host.roomId, { name: 'Guest' });
      await guest.leave();
    } finally {
      DoodleRoom.maxRooms = saved;
    }
    await host.leave();
  });
});
