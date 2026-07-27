import { Server, matchMaker } from '@colyseus/core';
import type { NextFunction, Request, Response } from 'express';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { PROTOCOL_VERSION, ROOM_NAME, SLED_RUN_ROOM } from '@pet-village/multiplayer-protocol';
import { TownRoom } from './TownRoom.ts';
import { SledRunRoom } from './SledRunRoom.ts';

const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,https://kimchankwon.github.io')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const port = Number(process.env.PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be a valid TCP port');

matchMaker.controller.getCorsHeaders = (headers) => {
  const origin = headers.get('origin');
  return { 'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : 'null' };
};

const server = new Server({
  transport: new WebSocketTransport({
    pingInterval: 6_000,
    pingMaxRetries: 4,
    verifyClient: (info: { origin: string }) => !info.origin || origins.includes(info.origin),
  }),
  express: (app) => {
    app.use((request: Request, response: Response, next: NextFunction) => {
      const origin = request.headers.origin;
      if (origin && !origins.includes(origin)) {
        response.sendStatus(403);
        return;
      }
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        response.sendStatus(204);
        return;
      }
      next();
    });
    app.get('/healthz', (_request: Request, response: Response) => response.json({ ok: true, protocol: PROTOCOL_VERSION }));
  },
});

server.define(ROOM_NAME, TownRoom);
server.define(SLED_RUN_ROOM, SledRunRoom);
await server.listen(Number(process.env.PORT ?? 2567));
