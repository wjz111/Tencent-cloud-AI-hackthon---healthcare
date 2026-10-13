# AI Healthier Every Day

Intelligent Support for Long-Term Self-Care — a personal healthcare Agent Web app built for the Tencent Cloud ADP Hackathon (Scene #18: Agent Apps).

## Features

- **AI Health Companion "Plus"** — a friendly pet-like character that chats with you about your daily health habits
- **Food Detection & Nutrition Tracking** — mention what you ate in chat, and Plus estimates calories, sugar, fat, and protein
- **Personalized Health Goals** — auto-generated based on your profile (age, height, weight, gender, conditions)
- **Daily Progress Dashboard** — visual progress bars for each health goal
- **Split-Storage Architecture** — profiles and nutrition logs stored server-side per user; chat history stored client-side in browser localStorage for privacy
- **Session Token Authentication** — per-user session tokens with automatic refresh
- **Chat Export** — download today's conversation as a Markdown file

## Tech Stack

- **Backend**: Node.js built-in `http` module (no Express dependency), SSE streaming
- **Frontend**: React 18 (pre-compiled JSX, no Babel runtime needed), served as static files
- **Storage**: Per-user JSON files (server-side) + browser localStorage (client-side)
- **AI**: CodeBuddy Agent SDK (with intelligent fallback responses when SDK is not installed)

## Getting Started

```bash
# Clone and run
cd ai-healthier-every-day
node server/index.js
# Open http://localhost:3001
```

No `npm install` required — the app is fully self-contained.

## Project Structure

```
ai-healthier-every-day/
  server/
    index.js        — Self-contained server (HTTP + SSE + all logic)
    prompts.js      — System prompts (reference)
    agent.js        — Agent wrapper (reference)
    store.js        — Data store (reference)
    nutrition.js    — Nutrition estimation (reference)
    data/           — Per-user profiles & logs (gitignored)
      profiles/     — {userId}.json
      logs/         — {userId}_{date}.json
  public/
    index.html      — Self-contained React frontend (pre-compiled JSX)
    react.production.min.js
    react-dom.production.min.js
  client/           — Original React+Vite source (for future use)
  package.json
```

## Architecture

```
Browser (React)  <-- SSE + REST -->  Node.js Server (port 3001)
                     |
                     +-- data/profiles/{userId}.json  (profile + goals + memory)
                     +-- data/logs/{userId}_{date}.json  (daily nutrition)
                     +-- In-memory sessions Map  (token -> userId)
```

Chat history is stored in the browser's `localStorage` — the server never retains conversation content. Each chat request includes the client-side history as context.

## License

MIT
