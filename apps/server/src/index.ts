import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@doodle/sim';
import { DoodleRoom } from './DoodleRoom';

const port = Number(process.env.PORT ?? 2567);

// The game creates a room, joins one by its code, and rejoins after a reload. join and joinOrCreate, which
// pick a room for the caller, stay off.
matchMaker.controller.exposedMethods = ['create', 'joinById', 'reconnect'];

const server = new Server({
  transport: new WebSocketTransport({ pingInterval: 5000 }),
  greet: false,
});

server.define(ROOM_NAME, DoodleRoom);

await server.listen(port);
console.log(`Doodle War server listening on :${port}`);
