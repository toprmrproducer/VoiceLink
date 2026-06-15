# VoiceLink — RapidX AI Voice Agent

AI phone agent for **inbound and outbound calls**, built on **VoiceLink** telephony
(Indian DIDs) + **Gemini Live**. Node API + Next.js dashboard. Talk to a real AI
voice agent over a real phone call, and place calls right from the UI.

> Live-tested: real two-way calls, clean A-law audio, agent greets + responds.

## What you need (only two secrets)

| Credential | Where to get it | Goes in |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → Get API key | `apps/api/.env` |
| VoiceLink Bearer token | See below (you mint it from your VoiceLink login) | `apps/api/.env` |

You also need a VoiceLink account with at least one DID and one channel, and
`cloudflared` (free) so VoiceLink's cloud can reach your machine.

### Where the VoiceLink token comes from
It is a VoiceLink account Bearer token, format `1234|longhash`. It is **not** shown on
a settings page, you mint it by logging in to the API. Two options:

- **Easiest (recommended):** put your VoiceLink account login in `apps/api/.env`:
  `VOICELINK_RESELLER_USERNAME=<your VoiceLink username/email>` and
  `VOICELINK_RESELLER_PASSWORD=<your password>`, leave `VOICELINK_RESELLER_TOKEN` blank.
  The app logs in via `POST /v1/auth/login` and gets the token automatically (and
  refreshes it when it expires).
- **Or mint it once yourself** and paste it as `VOICELINK_RESELLER_TOKEN`:
  ```bash
  curl -s -X POST https://app.voicelink.co.in/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"YOUR_VOICELINK_USERNAME","password":"YOUR_VOICELINK_PASSWORD"}'
  # copy data.access_token from the response
  ```

No SIP host, LiveKit URL, or trunk credentials are needed. The app uses VoiceLink's
WebSocket Bot path, which `scripts/setup-voicelink.ts` wires up with just the token.

## Quick start

```bash
git clone https://github.com/toprmrproducer/VoiceLink.git
cd VoiceLink
pnpm install
pnpm --filter @voiceplatform/shared build

# datastores (native, no Docker): mongod on 27017, redis on 6379
mongod --dbpath ./.mongo-data --port 27017 &
redis-server &

# config
cp apps/api/.env.example apps/api/.env
# then edit apps/api/.env — set GEMINI_API_KEY, VOICELINK_RESELLER_TOKEN,
# VOICELINK_API_BASE=https://app.voicelink.co.in/api, VOICELINK_MODE=live,
# MONGO_URL=mongodb://localhost:27017/voiceplatform, REDIS_URL=redis://localhost:6379,
# GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview, JWT_SECRET / BYOK_ENCRYPTION_KEY (openssl rand -hex 32)

# expose the API publicly so VoiceLink can reach it, then set WS_BASE_URL
cloudflared tunnel --url http://localhost:4000
# copy the https URL it prints, set WS_BASE_URL=wss://<that-host> in apps/api/.env

# run
pnpm --filter @voiceplatform/api dev   # http://localhost:4000
pnpm --filter @voiceplatform/ui dev    # http://localhost:3000

# wire VoiceLink (creates WS bots + routes your DIDs to them) and seed
pnpm --filter @voiceplatform/api exec tsx scripts/setup-voicelink.ts   # see CLAUDE.md for the calls
pnpm --filter @voiceplatform/api exec tsx scripts/seed.ts
```

Login at http://localhost:3000 with the seeded owner account (printed by the seed script).

## Make a call from the dashboard

1. Sign in, you land on **Dashboard**.
2. In the **Place a call** card, enter a phone number (India: 10 digits, e.g. `9307512816`).
3. Click **Call me**. Your phone rings and the RapidX AI agent talks to you.

## Inbound

Call your DID directly and the agent answers (the DID is routed to the WebSocket bot).
Inbound needs a free concurrent channel on your VoiceLink plan.

## Notes that will save you hours

- **VoiceLink audio is G.711 A-law @ 8kHz**, not µ-law. Encoding the wrong curve =
  pure static. The bridge auto-detects the codec from the call's start frame.
- **Outbound number format**: use the national number + `country_code`, not full
  E.164 (`919307512816` fails with cause 38; `9307512816` + `91` works).
- The public link is a cloudflared quick tunnel tied to your machine. For
  production, deploy the API to a server with a stable domain and re-register the bots.

## Deploy to production (permanent URL, no tunnel)
Local + cloudflared is fine for a demo, but the tunnel dies with your laptop. For a
24/7 deployment with a stable `wss://` URL, use the `deploy/` assets (VPS + Docker +
Caddy auto-HTTPS + Mongo + Redis):
1. A VPS (any provider) and a domain with DNS A records pointing to it.
2. Run `deploy/vps-bootstrap.sh` on the VPS (installs Docker).
3. Edit `deploy/Caddyfile` to your domains (e.g. `app.you.com` -> ui, `api.you.com` ->
   api/ws). Caddy issues HTTPS automatically.
4. Build the `apps/api` + `apps/ui` Docker images, drop `.env.api` / `.env.ui` next to
   `deploy/docker-compose.prod.yml`, and `docker compose -f deploy/docker-compose.prod.yml up -d`.
5. Set `WS_BASE_URL=wss://<your api/ws domain>`, then run `scripts/setup-voicelink.ts`
   and `scripts/seed.ts` against the deployed stack so the bots point at the live URL.

After that, the dashboard "Place a call" works from anywhere, with your laptop off.

Full architecture + every VoiceLink endpoint used is documented in [CLAUDE.md](./CLAUDE.md).
