# Seba Shongi (server)

The API for the Seba Shongi community service event platform. Built with Express and MongoDB. Private routes accept only a valid JWT issued by the client website (BetterAuth jwt plugin), checked against the client's public keys at `/api/auth/jwks`.

- Client repo: add the client repo link here
- Live API: add your live server link here

## Routes

| Method | Route | Access | What it does |
| --- | --- | --- | --- |
| GET | `/events` | public | Upcoming events only, soonest first. Optional `limit`, `type`, `search` |
| GET | `/events/:id` | public | One event with the number of people who joined |
| POST | `/events` | JWT | Create an event (future date only) |
| PUT | `/events/:id` | JWT, owner | Update your own event |
| DELETE | `/events/:id` | JWT, owner | Delete your own event and its joins |
| GET | `/my-events` | JWT | Events you created |
| POST | `/events/:id/join` | JWT | Join an event (no duplicates, not after it ended) |
| GET | `/events/:id/join-status` | JWT | Did I already join this event |
| GET | `/my-joined` | JWT | Events you joined, sorted by event date |

## Run on your computer

1. Run `npm install`.
2. Copy `.env.example` to `.env` and fill in the values.
3. Run `npm run dev`. The server starts on http://localhost:5000

## Deploy on Vercel

The `vercel.json` and `api/index.js` files are already set up. Add the same variables as `.env` in Vercel (`MONGODB_URI`, `MONGODB_DB`, `AUTH_URL`, `CLIENT_URLS`). Set `AUTH_URL` and `CLIENT_URLS` to your live client address.
