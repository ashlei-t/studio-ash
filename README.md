# Studio Ash

A journal where Claude keeps what matters, so my past self can talk back.

Open it and you're writing. After an entry, Claude replies only when it has a new insight or a past entry worth bringing back, and quietly keeps a three-tier markdown memory (long-term, short-term, everyday). v1 (team workspace, kanban, chat) lives on the `v1-archive` branch.

## Stack

- React 19 + Vite 8, deployed as a static site (Vercel)
- Supabase: Auth, Postgres (row-level security), Edge Functions
- Claude API, called only from the `reflect` Edge Function, never from the browser
- IndexedDB (`idb`) + a service worker, so writing works offline

## Setup

```bash
npm install
```

`.env` in the project root (gitignored):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

No Anthropic key belongs in `.env`. It is a Supabase secret:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase secrets set ANTHROPIC_API_KEY=...
supabase functions deploy reflect
```

## How it fits together

```
src/
  Write.jsx         the writing page (the whole app, mostly)
  Earlier.jsx       past entries by day
  SignIn.jsx        email + password, only when you ask to sync
  lib/localStore.js entries in IndexedDB, draft in localStorage
  lib/sync.js       push → pull → reflect, retried until it succeeds
supabase/
  functions/reflect Claude reply + memory updates, runs as the signed-in user
  migrations/       0012_journal.sql adds `entries` and `memory` (0001–0011 are v1)
public/sw.js        caches the app shell for offline use
```

Entries are saved on the device first and never deleted there; sync uploads them when there's a connection. `entries` and `memory` are private to their owner. Later phases add a separate share boundary for the team page.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run dev:host` | Dev server on your LAN (phone testing) |
| `npm run build` | Production build → `dist` |
| `npm run lint` | ESLint |
