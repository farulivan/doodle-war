import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@doodle/sim';
import { DoodleRoom } from './DoodleRoom';

const port = Number(process.env.PORT ?? 2567);

const server = new Server({
  transport: new WebSocketTransport({ pingInterval: 5000 }),
  greet: false,
});

server.define(ROOM_NAME, DoodleRoom);

await server.listen(port);
console.log(`Doodle War server listening on :${port}`);
