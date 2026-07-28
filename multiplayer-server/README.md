# Pet Village multiplayer server

Long-lived Colyseus 0.17 server for the authenticated `town_default` room. Convex remains responsible for authentication and durable saves; it issues one-use, 60-second admission JWTs.

## Local

```sh
cp .env.example .env.local
# Use the same >=32-character value for both processes:
npx convex env set MULTIPLAYER_TICKET_SECRET '...'
MULTIPLAYER_TICKET_SECRET='...' npm run dev:multiplayer
# another terminal
VITE_MULTIPLAYER_URL=ws://localhost:2567 npm run dev
curl http://localhost:2567/healthz
```

Guests intentionally stay offline. The browser receives only a short-lived ticket and the public `VITE_MULTIPLAYER_URL`; never expose `MULTIPLAYER_TICKET_SECRET` as a Vite variable.

## Smoke checks

Three scripts drive real clients against a running server, signing their own
tickets with the same secret. They are deliberately not in CI — they need the
server up — so run them by hand against local changes to the room or the
client's view of it:

```sh
MULTIPLAYER_TICKET_SECRET='...' npm run smoke:worlds    # presence through every scene portal
MULTIPLAYER_TICKET_SECRET='...' npm run smoke:sled      # a Sled Run race end to end
MULTIPLAYER_TICKET_SECRET='...' npm run smoke:presence  # who the chat log says has come and gone
```

`smoke:worlds` and `smoke:presence` default to `ws://127.0.0.1:2567` and take
`MULTIPLAYER_SMOKE_URL` to point elsewhere; `smoke:sled` uses `SLED_SMOKE_URL`.

## Deploy

Deploy `multiplayer-server` to a persistent Node/WebSocket host (Fly.io, Railway, Render, etc.), not GitHub Pages/serverless functions. A production container is provided at the repository root:

```bash
docker build -f Dockerfile.multiplayer -t pet-village-multiplayer .
docker run --rm -p 2567:2567 \
  -e MULTIPLAYER_TICKET_SECRET \
  -e CORS_ORIGINS=https://kimchankwon.github.io \
  pet-village-multiplayer
```

Configure `PORT`, `MULTIPLAYER_TICKET_SECRET`, and comma-separated `CORS_ORIGINS` on the host. Configure the identical secret in the production Convex deployment, then set the GitHub Actions repository variable `VITE_MULTIPLAYER_URL=wss://your-host`; the Pages workflow injects it during the production build. Keep `https://kimchankwon.github.io` in allowed origins.

The current HS256 design is used because it is supported consistently by Convex actions and Node. It makes the server and Convex joint holders of the signing key; rotate both together. An EdDSA/ES256 key pair would reduce trust at the game server but requires managed private/public key provisioning.

`GET /healthz` reports process/protocol health. This repository's Pages workflow deploys only `dist` and Convex; it deliberately does not deploy the long-lived server.
