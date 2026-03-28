# la-pluma

A personal workspace PWA — notes, writing, and Claude AI. Designed to feel like a quality notebook with superpowers: calm, editorial, focused.

## What it is

- **Notes** — two modes: quick capture (block-style) and long-form article writing. Tiptap editor with slash commands, bubble menu, and auto-save.
- **AI chat panel** — per-note Claude conversation with full session persistence. Thinking blocks, tool use, and streaming all visible inline.
- **Multi-device sync** — Supabase Realtime keeps session state and chat history in sync across tabs and devices.
- **PWA** — mobile-first layout, works on phone and desktop. Full PWA (service worker, offline) WIP.

## Built with AI Agents

This project is entirely agent-driven — every feature is designed, implemented, and documented by Claude Code following a structured workflow defined in [`AGENTS.md`](./AGENTS.md).

The workflow:
1. **Requirement** — human states intent; agent summarizes and waits for approval before touching code
2. **Design** — agent reads existing code, writes a design doc (`docs/design/draft/`), resolves uncertainties, discusses trade-offs
3. **Implement** — follows the approved design; deviations that affect user behavior require a stop and re-approval
4. **Wrap up** — merges draft into `docs/design/modules/`, updates requirements cache, updates `AGENTS.md`

All architecture decisions, gotchas, and conventions are persisted in `AGENTS.md` so any future agent session picks up full context without re-reading the codebase.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Nuxt 3 (SPA) + Nuxt UI v3 + Tailwind CSS v4 |
| Editor | Tiptap — slash commands, bubble menu, task lists, code blocks |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| Auth | GitHub OAuth + email/password |
| AI | claude-agent-sdk (Python) — adaptive thinking, MCP tools |
| Relay | Node.js (`ws`) — JWT auth, session queue |
| Deploy | Vercel (frontend) · cloud server (relay) · Raspberry Pi (backend) |

## Project Structure

```
├── app/                  # Nuxt source (srcDir)
│   ├── pages/
│   ├── components/
│   ├── stores/           # aiStore, noteStore, uiStore
│   └── composables/
├── relay/                # WebSocket relay (Node.js)
├── backend/              # Claude agent (Python — runs on Pi)
│   ├── main.py           # FastAPI + relay WS loop
│   ├── agent.py          # AgentRunner + session restore
│   └── tools.py          # MCP tool definitions
├── supabase/migrations/  # DB schema
└── docs/                 # Requirements + architecture docs
```

## Docs

- [`AGENTS.md`](./AGENTS.md) — conventions, gotchas, workflow
- [`docs/requirements/overview.md`](./docs/requirements/overview.md) — feature requirements
- [`docs/design/modules/overview.md`](./docs/design/modules/overview.md) — architecture decisions
