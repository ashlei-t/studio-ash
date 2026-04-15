# Studio Ash

A calm **Vite + React** daily companion with **morning**, **focus**, and **evening** modes. It uses the Anthropic API (Claude) for conversation and keeps lightweight context in local markdown files under `context/`.

## Stack

- [React](https://react.dev/) 19 · [Vite](https://vite.dev/) 8
- [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm)
- Claude via Anthropic Messages API (proxied in dev so the browser can call `/api/anthropic/...`)

## Prerequisites

- Node.js (current LTS is a good default)
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

```bash
npm install
```

Create a `.env` in the project root (this file is gitignored):

```bash
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
```

> `VITE_*` variables are embedded in the client bundle. Treat this app as a **local / personal** tool unless you add a proper server-side secret.

## Scripts

| Command        | Description              |
| -------------- | ------------------------ |
| `npm run dev`  | Dev server with HMR      |
| `npm run build` | Production build → `dist` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint                   |

## Local context files

In development, Vite serves a small middleware API at `/api/context` that reads and writes **only** these files in `context/`:

- `context.md`
- `now.md`
- `log.md`

The repo includes starter copies; the assistant can suggest updates that get merged into them.

## How requests work in dev

- **`/api/anthropic/*`** — proxied to `https://api.anthropic.com` (see `vite.config.js`).
- **`/api/context/*`** — read/write the allowed markdown files above.

Production builds do not include that dev middleware or proxy unless you deploy an equivalent backend.

## License

Private project (`"private": true` in `package.json`). Add a license file if you open-source it later.
