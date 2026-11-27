import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@doodle/sim';
import { DoodleRoom, originAllowed } from './DoodleRoom';
import { installLimits } from './limits';

const port = Number(process.env.PORT ?? 2567);

// The game creates a room, joins one by its code, and rejoins after a reload. join and joinOrCreate, which
// pick a room for the caller, stay off.
matchMaker.controller.exposedMethods = ['create', 'joinById', 'reconnect'];
installLimits();

// Only the allowed sites may read the matchmaker's answers. DoodleRoom.onAuth is what refuses the rest:
// CORS alone lets a request that skips the preflight through.
matchMaker.controller.getCorsHeaders = (headers: Headers): Record<string, string> => {
  const allowed = DoodleRoom.allowedOrigins;
  if (allowed.length === 0) return {};
  const origin = headers.get('origin');
  return {
    'Access-Control-Allow-Origin': origin !== null && originAllowed(origin) ? origin : allowed[0],
    Vary: 'Origin',
  };
};

const server = new Server({
  transport: new WebSocketTransport({ pingInterval: 5000 }),
  greet: false,
});

server.define(ROOM_NAME, DoodleRoom);

await server.listen(port);
console.log(`Doodle War server listening on :${port}`);
