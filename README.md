# Studio Ash

A calm **Vite + React** daily companion with **morning**, **focus**, and **evening** modes. Powered by the Anthropic API (Claude), with **Supabase Auth + Storage** for per-user context and **team chat** with an inbox of assistant suggestions.

## Stack

- [React](https://react.dev/) 19 · [Vite](https://vite.dev/) 8
- [Supabase](https://supabase.com/) Auth, Database, Storage, Realtime
- [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm)
- Claude via Anthropic Messages API (proxied in dev so the browser can call `/api/anthropic/...`)

## Prerequisites

- Node.js (current LTS is a good default)
- An [Anthropic API key](https://console.anthropic.com/)
- A Supabase project (free tier is fine)

## Setup

```bash
npm install
```

Create a `.env` in the project root (gitignored):

```bash
# required
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# dev-only: when set, the browser calls Anthropic via the Vite proxy with
# this key bundled into JS. Leave this UNSET in any deployed build — the app
# will then call the `anthropic` Edge Function instead (see below).
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
```

> `VITE_*` variables are embedded in the client bundle. Setting `VITE_ANTHROPIC_API_KEY` is fine for `npm run dev` on a trusted machine. For anything deployed, deploy the Edge Function (next section) and leave `VITE_ANTHROPIC_API_KEY` empty so the key never ships to browsers.

### Anthropic Edge Function (production)

The repo includes a Supabase Edge Function at [`supabase/functions/anthropic/`](supabase/functions/anthropic/index.ts) that takes the user's JWT, forwards the request to `api.anthropic.com` with a server-side key, and returns the response. The frontend automatically uses it whenever `VITE_ANTHROPIC_API_KEY` is empty.

Deploy once per project:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
supabase functions deploy anthropic
```

### Database schema

In the Supabase **SQL editor**, run the files in `supabase/migrations/` in order:

| File | Adds |
|------|------|
| `0001_profiles.sql` | `profiles` table + signup trigger |
| `0002_context_storage.sql` | private `context` Storage bucket + RLS |
| `0003_teams.sql` | `teams`, `team_members`, `team` Storage bucket |
| `0004_team_chat.sql` | `team_messages` + Realtime |
| `0005_inbox.sql` | `inbox_items` |
| `0006_teams_creator_select.sql` | RLS fix so `insert().select()` works for the team creator |
| `0007_invite_codes.sql` | code-based `team_invites` + `redeem_invite()` RPC |
| `0008_team_message_inbox_hint.sql` | `has_inbox_suggestion` column |

If you signed up before `0001_profiles.sql` ran, backfill once:

```sql
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
```

Also under **Authentication → URL configuration**, add `http://localhost:5173` (and any prod URL) to the redirect URLs so magic-link sign-in returns to the app.

## Scripts

| Command           | Description              |
| ----------------- | ------------------------ |
| `npm run dev`     | Dev server with HMR (localhost only) |
| `npm run dev:host` | Dev server bound to **all interfaces** — use on your phone (see below) |
| `npm run build`   | Production build → `dist` |
| `npm run preview` | Serve the production build locally |
| `npm run lint`    | ESLint                   |

### Using the app on your phone (same Wi‑Fi)

1. On your computer, run **`npm run dev:host`** (this is `vite --host`).
2. In the terminal, Vite prints **Network** URLs, e.g. `http://192.168.1.x:5173/`.
3. Open that URL on your phone’s browser. Your machine and phone must be on the **same local network**.
4. macOS may ask to allow incoming connections the first time. Same-network only — your bundled Anthropic key is reachable from any device on that LAN.

## How the app is organized

```
src/
  auth/        sign-in, onboarding, AuthProvider, useAuth
  scope/       personal vs team scope, ScopeProvider, team switcher, invites
  components/  ChatView, TeamChatView, KanbanBoard, InboxPanel, etc.
  hooks/       useDocument, useKanban, useTeamChat, useInbox, etc.
  lib/         api (Claude + context I/O), contextStore (local vs Storage),
               applyUpdates, teamObserver, kanban, log, prompts, etc.
utils/
  supabase.js  shared Supabase client (anon/publishable)
supabase/
  migrations/  ordered SQL setup
```

The three canonical markdown files are:

- `identity.md` — slow-moving facts (replaces `context.md`)
- `season.md` — current sprint, kanban, recent priorities (replaces `now.md`)
- `thinkies.md` — dated journal entries the assistant appends to (replaces `log.md`)

Personal scope reads/writes them from the `context` Storage bucket under `<user-id>/`. Team scope reads/writes them from the `team` Storage bucket under `<team-id>/`. Claude writes silent update blocks (`---UPDATE:file:mode---`) that the app strips before showing the reply and merges into the active scope.

## How requests work in dev

- **`/api/anthropic/*`** — proxied to `https://api.anthropic.com` (see `vite.config.js`).
- **`/api/context/*`** — only used when **no Supabase user is active** (e.g. before sign-in completes). Once authenticated, all context I/O goes through Supabase Storage.

Production builds do not include the dev middleware. Authenticated context lives entirely in Supabase Storage.

## License

Private project (`"private": true` in `package.json`). Add a license file if you open-source it later.
