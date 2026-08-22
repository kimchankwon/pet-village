# Pet Village multiplayer server

Long-lived Colyseus 0.17 server for the authenticated `town_default` room. Convex remains responsible for authentication and durable saves. It issues one-use, 60-second admission JWTs.

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

Guests stay offline on purpose. The browser receives only a short-lived ticket and the public `VITE_MULTIPLAYER_URL`. Never expose `MULTIPLAYER_TICKET_SECRET` as a Vite variable.

## Smoke checks

Three scripts drive real clients against a running server, signing their own
tickets with the same secret. They are not in CI. They need the
server up, so run them by hand against local changes to the room or the
client's view of it:

```sh
MULTIPLAYER_TICKET_SECRET='...' npm run smoke:worlds    # presence through every scene portal
MULTIPLAYER_TICKET_SECRET='...' npm run smoke:sled      # a Sled Run race end to end
MULTIPLAYER_TICKET_SECRET='...' npm run smoke:presence  # who the chat log says has come and gone
```

`smoke:worlds` and `smoke:presence` default to `ws://127.0.0.1:2567` and take
`MULTIPLAYER_SMOKE_URL` to point elsewhere. `smoke:sled` defaults to
`ws://127.0.0.1:2765` and uses `SLED_SMOKE_URL`, so point it at your port.

`smoke:presence` names its villagers per run and asserts only about those, so it
is safe to re-run back to back. `smoke:worlds` counts the whole room instead, so
give the previous run's seats time to clear. A dropped player holds one for
twenty seconds before you run it again.

## Deploy

Deploy `multiplayer-server` to a persistent Node/WebSocket host (Fly.io, Railway, Render, etc.), not GitHub Pages or serverless functions. A production container is provided at the repository root:

```bash
docker build -f Dockerfile.multiplayer -t pet-village-multiplayer .
docker run --rm -p 2567:2567 \
  -e MULTIPLAYER_TICKET_SECRET \
  -e CORS_ORIGINS=https://kimchankwon.github.io \
  pet-village-multiplayer
```

Configure `PORT`, `MULTIPLAYER_TICKET_SECRET`, and comma-separated `CORS_ORIGINS` on the host. Configure the identical secret in the production Convex deployment, then set the GitHub Actions repository variable `VITE_MULTIPLAYER_URL=wss://your-host`. The Pages workflow injects it during the production build. Keep `https://kimchankwon.github.io` in allowed origins.

The current HS256 design is used because Convex actions and Node both support it. The server and Convex jointly hold the signing key. Rotate both together. An EdDSA/ES256 key pair would reduce trust at the game server but needs managed private/public key provisioning.

`GET /healthz` reports process/protocol health. This repository's Pages workflow deploys only `dist` and Convex. It does not deploy the long-lived server.
