# la-pluma

A personal workspace PWA — notes, writing, and Claude AI integration.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Nuxt 3 (SPA) + Nuxt UI v3 + Tailwind CSS v4 |
| Editor | Tiptap (Notion-style slash commands, bubble menu) |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| Auth | GitHub OAuth (primary) + email/password (fallback) |
| AI | Claude via claude-agent-sdk — browser → relay → Pi backend → Anthropic |
| Deploy | Vercel (frontend) + cloud server (relay) + Raspberry Pi (backend) |

## Architecture

```
Browser (Vercel)
    │
    │  WebSocket
    ▼
relay/  (Node.js, cloud server)
    │  verifies Supabase JWT
    │  WebSocket
    ▼
backend/  (Python, Raspberry Pi)
    │  claude-agent-sdk
    ▼
Anthropic API
```

The Pi connects outbound to the relay — no inbound ports or public IP needed.

## Project Structure

```
├── app/                  # Nuxt source (srcDir)
│   ├── pages/
│   ├── components/
│   ├── composables/
│   ├── stores/
│   └── middleware/
├── relay/                # WebSocket relay (Node.js)
├── backend/              # Claude agent backend (Python)
├── supabase/migrations/  # DB schema
└── docs/                 # Requirements + architecture docs
```

## Development

### Prerequisites

- Node.js 20+
- Python 3.11+
- A Supabase project
- Anthropic API key

### Setup

```bash
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY, RELAY_SECRET

pnpm install
pnpm dev
```

### Running the full stack

```bash
# Frontend (Vercel / local)
pnpm dev

# Relay server
cd relay && pnpm dev

# Backend (Pi or local)
cd backend && uvicorn main:app
```

### Supabase Auth setup

1. Dashboard → Authentication → Providers → **GitHub**: enable, add Client ID + Secret
2. GitHub OAuth App → Authorization callback URL:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
3. Dashboard → Authentication → URL Configuration → Redirect URLs:
   ```
   https://your-domain.com/auth/confirm
   ```

### Commands

```bash
pnpm dev          # dev server
pnpm build        # production build
pnpm typecheck    # type check
pnpm lint         # lint
```

## Docs

- [`AGENTS.md`](./AGENTS.md) — project conventions, tech stack, gotchas
- [`docs/requirements/overview.md`](./docs/requirements/overview.md) — feature requirements
- [`docs/design/modules/overview.md`](./docs/design/modules/overview.md) — architecture decisions
