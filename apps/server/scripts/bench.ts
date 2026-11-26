/**
 * Load test: runs many real matches (a scripted "human" vs a server bot) against an
 * in-process server and reports memory, CPU and bytes sent, to size hosting.
 *
 *   pnpm --filter @doodle/server bench -- --rooms 20
 */
import { Protocol, Server, getMessageBytes } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, type MatchStart, type OverMessage, type TurnMessage } from '@doodle/sim';
import { DoodleRoom } from '../src/DoodleRoom';

const args = process.argv.slice(2);
const ROOMS = Number(args[args.indexOf('--rooms') + 1] || 20);
const PORT = 26000 + Math.floor(Math.random() * 500);

let bytesSent = 0;
let messagesSent = 0;

/** Same room, but counts the wire size of everything it sends. */
class MeasuredRoom extends DoodleRoom {
  override broadcast(type: string | number, message?: unknown, options?: { except?: unknown }): void {
    const size = getMessageBytes.raw(Protocol.ROOM_DATA, type, message).length;
    const except = options?.except ? 1 : 0;
    bytesSent += size * Math.max(0, this.clients.length - except);
    messagesSent += Math.max(0, this.clients.length - except);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super.broadcast(type as any, message as any, options as any);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

async function playOne(index: number): Promise<{ turns: number; seconds: number }> {
  const client = new Client(`ws://localhost:${PORT}`);
  const room: Room = await client.create(ROOM_NAME, { name: `Bench${index}` });
  let mine: number[] = [];
  const started = Date.now();
  let turns = 0;
  const done = new Promise<void>((resolve) => {
    room.onMessage('start', (m: MatchStart) => {
      mine = m.owners.map((o, i) => (o === room.sessionId ? i : -1)).filter((i) => i >= 0);
    });
    room.onMessage('turn', async (m: TurnMessage) => {
      turns++;
      if (!mine.includes(m.turn.activeId)) return;
      // Behave like a person: walk a little, aim for a couple of seconds, then fire.
      for (let i = 0; i < 8; i++) {
        room.send('move', { dir: Math.random() < 0.5 ? 1 : -1, px: 2 });
        await sleep(60);
      }
      for (let i = 0; i < 25; i++) {
        room.send('aim', {
          unitId: m.turn.activeId,
          angle: 40 + i,
          facing: -1,
          power: i * 3,
          charging: i > 5,
          slot: 0,
        });
        await sleep(100);
      }
      room.send('fire', { angle: 35 + Math.random() * 40, power: 45 + Math.random() * 45, slot: 0 });
    });
    room.onMessage('over', (_m: OverMessage) => resolve());
  });
  room.onMessage('lobby', () => undefined);
  room.onMessage('*', () => undefined);
  room.send('profile', { team: 0 });
  room.send('addBot', { team: 1 });
  await sleep(300);
  room.send('start', {});
  await done;
  await room.leave();
  return { turns, seconds: (Date.now() - started) / 1000 };
}

async function main(): Promise<void> {
  const server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define(ROOM_NAME, MeasuredRoom);
  await server.listen(PORT);
  global.gc?.();
  await sleep(500);
  const base = process.memoryUsage();
  let peakRss = base.rss;
  let peakHeap = base.heapUsed;
  const sampler = setInterval(() => {
    const m = process.memoryUsage();
    peakRss = Math.max(peakRss, m.rss);
    peakHeap = Math.max(peakHeap, m.heapUsed);
  }, 200);

  // Note: the scripted clients run in this same process, so CPU includes their (small) cost.
  const cpu0 = process.cpuUsage();
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: ROOMS }, (_, i) => playOne(i)));
  const wall = (Date.now() - t0) / 1000;
  const cpu = process.cpuUsage(cpu0);
  clearInterval(sampler);

  const matchSeconds = results.reduce((s, r) => s + r.seconds, 0) / results.length;
  const turns = results.reduce((s, r) => s + r.turns, 0) / results.length;
  const cpuSeconds = (cpu.user + cpu.system) / 1e6;
  console.log(`rooms:                ${ROOMS} concurrent 1v1 (scripted human vs bot)`);
  console.log(`avg match:            ${matchSeconds.toFixed(0)} s, ${turns.toFixed(1)} turns`);
  console.log(`memory baseline:      rss ${mb(base.rss)} MB, heap ${mb(base.heapUsed)} MB`);
  console.log(`memory peak:          rss ${mb(peakRss)} MB, heap ${mb(peakHeap)} MB`);
  console.log(
    `memory per room:      ~${((peakRss - base.rss) / ROOMS / 1024 / 1024).toFixed(2)} MB (rss delta / rooms)`,
  );
  console.log(
    `cpu:                  ${cpuSeconds.toFixed(1)} s over ${wall.toFixed(0)} s wall = ${((cpuSeconds / wall) * 100).toFixed(0)}% of one core`,
  );
  console.log(`cpu per match:        ${(cpuSeconds / ROOMS).toFixed(2)} s`);
  console.log(
    `bytes sent (server):  ${mb(bytesSent)} MB total, ${(bytesSent / ROOMS / 1024).toFixed(0)} KB per match, ${messagesSent} messages`,
  );
  console.log(`per player-minute:    ${(bytesSent / ROOMS / (matchSeconds / 60) / 1024).toFixed(0)} KB`);
  await server.gracefullyShutdown(false);
  process.exit(0);
}

void main();
