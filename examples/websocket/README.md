# WebSocket Echo Bot

Real-time echo bot and event logger. Connects via Socket.IO, logs all events,
and replies with a random message when a user sends a message or completes a review.

## Setup

```bash
npm install
cp ../.env.example ../.env   # if not already done
```

The WebSocket connection uses **JWT authentication** (not API keys). The example automatically logs in with email/password to obtain a JWT token.

Add these to your `../.env`:

```
PLACET_USER_EMAIL=admin@placet.local
PLACET_USER_PASSWORD=changeme
```

## Run

```bash
npx tsx ws_echo.ts
```

The bot connects, subscribes to the channel, and logs all events.
Send messages via the web UI to see it respond.
