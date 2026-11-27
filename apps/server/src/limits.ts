import { isIP } from 'node:net';
import { ServerError, matchMaker, type AuthContext } from '@colyseus/core';

/**
 * Limits per address on the matchmaker, the one way into a room: create, join by code and reconnect all go
 * through it. A player makes one or two of these requests a game, so the limits only bite on a script.
 */
export const limits = {
  /** Requests one address may make per window. Guessing room codes at that rate takes about a day a hit. */
  requests: 10,
  windowMs: 10_000,
  /** Rooms one address may have open at once, so one machine can't hold every one of the maxRooms slots. */
  roomsPerAddress: 2,
};

const requests = new Map<string, { count: number; until: number }>();
const roomsOpen = new Map<string, number>();
const openedBy = new Map<string, string>();

/**
 * What the limits count by: an IPv4 address, or an IPv6 /64, since one machine usually holds a whole /64.
 * Null for anything that isn't an IP address.
 */
export function addressKey(ip: string): string | null {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? ip;
  if (isIP(v4) === 4) return v4;
  if (isIP(ip) !== 6) return null;
  const [head, tail] = ip.toLowerCase().split('%')[0].split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const groups =
    tail === undefined ? front : [...front, ...Array(8 - front.length - back.length).fill('0'), ...back];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/**
 * The address Railway's edge puts in X-Real-IP. Only that header: the others Colyseus falls back to, such as
 * X-Forwarded-For, carry whatever the client wrote. A request without it, as on a laptop, isn't limited.
 */
function addressOf(auth: AuthContext | undefined): string | null {
  const ip = auth?.headers.get('x-real-ip')?.trim();
  return ip ? addressKey(ip) : null;
}

function overRequestLimit(address: string): boolean {
  const now = Date.now();
  const entry = requests.get(address);
  if (!entry || entry.until <= now) {
    requests.set(address, { count: 1, until: now + limits.windowMs });
    return false;
  }
  entry.count++;
  return entry.count > limits.requests;
}

function countRoom(address: string, by: 1 | -1): void {
  const n = (roomsOpen.get(address) ?? 0) + by;
  if (n > 0) roomsOpen.set(address, n);
  else roomsOpen.delete(address);
}

/** Called as a room closes, so the address that opened it may open another. */
export function roomClosed(roomId: string): void {
  const address = openedBy.get(roomId);
  if (address === undefined) return;
  openedBy.delete(roomId);
  countRoom(address, -1);
}

let installed = false;

/** Puts the limits in front of the matchmaker. */
export function installLimits(): void {
  if (installed) return;
  installed = true;
  const invoke = matchMaker.controller.invokeMethod.bind(matchMaker.controller);
  // The messages reach the player as they are, so they avoid the words the game maps to its own messages
  // (see connect() in apps/web/src/net/online.ts).
  matchMaker.controller.invokeMethod = async (method, roomName, options, auth) => {
    const address = addressOf(auth);
    if (address === null) return invoke(method, roomName, options, auth);
    if (overRequestLimit(address)) {
      throw new ServerError(429, 'Too many tries. Wait a few seconds and try again.');
    }
    if (method !== 'create') return invoke(method, roomName, options, auth);
    if ((roomsOpen.get(address) ?? 0) >= limits.roomsPerAddress) {
      throw new ServerError(
        429,
        `You already have ${limits.roomsPerAddress} rooms open. Close one to make another.`,
      );
    }
    // Counted before the room exists, so two requests at once can't both slip under the limit.
    countRoom(address, 1);
    try {
      const reservation = await invoke(method, roomName, options, auth);
      openedBy.set(reservation.roomId, address);
      return reservation;
    } catch (e) {
      countRoom(address, -1);
      throw e;
    }
  };
  // Forget addresses whose window has passed, so the map holds only the last few seconds.
  setInterval(() => {
    const now = Date.now();
    for (const [address, entry] of requests) if (entry.until <= now) requests.delete(address);
  }, limits.windowMs).unref();
}
