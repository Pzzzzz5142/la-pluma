# AGENTS.md - nuxt-notes

## Overview

A modular personal workspace PWA built on Nuxt 3. Currently includes a notes module; designed to extend to chat, agent tracking, stock analysis, and more. Data in Supabase, AI via Claude SDK.

Requirements: `docs/requirements/overview.md` (Human req > Agent interpretation > Code — defer in this order on conflict)
Architecture: `docs/design/modules/`

---

## Rules

- **NEVER read `.env` or any file containing credentials.** Use `.env.example` for reference instead.

---

## Workflow

### Dev Flow

**Step 1 — Receive requirement**

Read: AGENTS.md + `docs/requirements/overview.md` (Agent Interpretation for context, Human section if ambiguous).

- Summarize user intent, update the Human section in requirements doc. Wait for explicit approval before it's considered final.
- Do not write code yet.

**Step 2 — Design**

Read: relevant source code + relevant `docs/design/modules/` docs.

- Write `docs/design/draft/<feature>.md` (format below).
- Resolve all quickly-verifiable items in the Uncertainties section first.
- Discuss with user, wait for approval.

**Step 3 — Implement**

- Follow the approved design. Track progress with Tasks.
- Uncertainties that can't be quickly verified: add to the design doc's Uncertainties section with date and status, continue other work.
- Plan turns out wrong:
  - Small adjustment (internal refactor, file split) → update design doc with reason, continue.
  - Affects user-visible behavior or conflicts with Human req → **stop**, update design doc, ask user.
- Run `pnpm typecheck` when done. Zero errors to be considered complete.

**Step 4 — Wrap up**

- Merge draft content into existing `docs/design/modules/` doc (update to reflect new code structure), or create a new doc if it's a genuinely new module. Delete the draft.
- Update `docs/requirements/overview.md` Agent Interpretation section (serves as cache/summary for future agents).
- Update this file: progress table and project structure.

**Shortcut — trivial changes (< 3 files, no user-facing behavior change):** skip Step 2. Implement directly, still do Step 4.

### Bug Flow

- **Finding**: read only the broken code. No docs — keep context clean.
- **Fixing** (after locating the bug): read AGENTS.md + requirements doc first so the fix aligns with design intent, then fix.

### Design Doc Format

`docs/design/draft/<feature-name>.md`:

```markdown
# <Feature Name>
> Status: draft | approved | in-progress | implemented
> Date: YYYY-MM-DD

## Requirement
See docs/requirements/overview.md#<section>

## Analysis
Existing code that can be reused.

## Implementation Plan
Step-by-step: file paths, components, API routes, DB changes.

## Uncertainties
Technical unknowns and assumptions to verify.
- Quick to verify: resolve before approval.
- Can't verify quickly: add during implementation with date and status.

## Open Questions
Decisions that need user input.
```

Status flow:
```
draft → approved → in-progress → implemented (merge to modules/, delete draft)
                       ↑
                  revise (record reason)
```

---

## Service Reload Behavior

Services started via `start.sh` have different reload behaviors. **Do not restart a service if it auto-reloads on file change.**

| Service | Auto-reload? | Details |
|---------|-------------|---------|
| frontend (`pnpm dev`) | ✅ Yes | Nuxt HMR — picks up file changes automatically |
| relay (`pnpm dev`) | ✅ Yes | tsx watch mode — restarts on file change |
| backend (`uvicorn`) | ❌ No | No `--reload` flag — must manually restart after code changes |

Only restart a service when its code changed **and** it does not auto-reload.

---

## Known Gotchas

- **Component naming**: Nuxt prefixes components with their directory name. `components/layout/AppSidebar.vue` → `<LayoutAppSidebar>`. Exception: if the filename already starts with the directory name, Nuxt deduplicates — `components/ai/AiPanel.vue` → `<AiPanel>` (not `<AiAiPanel>`). Rule: combine dir + filename, then remove duplicate prefix if filename starts with it.
- **Tailwind CSS**: Must install `tailwindcss` as a direct dev dep (`pnpm add -D tailwindcss`) and add `app/assets/css/main.css` with `@import "tailwindcss"; @import "@nuxt/ui";`, referenced in `nuxt.config.ts` via `css: ['~/assets/css/main.css']`. Without this, no styles render.
- **Google Fonts timeout**: homeserver can't reach Google servers. Set `fonts: { providers: { google: false, googleicons: false } }` in nuxt.config.ts to suppress errors.
- **Supabase cookie auth on HTTP**: Default `secure: true` drops cookies on plain HTTP. Set `cookieOptions: { secure: false }` for local dev. Remove before prod.
- **Auth / PKCE verifier error**: `useSsrCookies: true` forces `@supabase/ssr`'s `createBrowserClient` which hardcodes `flowType: 'pkce'` and causes "PKCE code verifier not found" on OAuth redirect. For SPA (`ssr: false`), use `useSsrCookies: false` + `clientOptions.auth.flowType: 'implicit'`. Session goes to localStorage; `/auth/confirm` just watches `useSupabaseUser()` — no manual `exchangeCodeForSession` needed.
- **Mobile layout**: Uses `isMobile = useMediaQuery('(max-width: 768px)')` + `v-if/v-else` (not Tailwind responsive classes) because viewport meta was missing. `app/app.vue` sets `width=device-width` via `useHead`.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Nuxt 3 (Vue 3 + TypeScript) |
| UI | Nuxt UI v3 (Tailwind CSS v4) |
| Editor | Tiptap (Notion-style, Markdown support) |
| Layout | splitpanes (resizable panels) |
| Utilities | @vueuse/core + @vueuse/nuxt (auto-import) |
| Animation | @vueuse/motion |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| AI | claude-agent-sdk (Python) — browser → relay → homeserver backend → Anthropic |
| Relay | Node.js (`ws`) — JWT auth, per-session serial queue |
| Package manager | pnpm (Node 20+ required) |
| Deploy | Vercel (frontend) · cloud server (relay) · homeserver (backend) |

---

## Commands

```bash
source ~/.nvm/nvm.sh && nvm use 20   # Node 20 required

pnpm install        # install deps
pnpm dev            # dev server
pnpm build          # production build
pnpm preview        # preview production build
pnpm lint           # lint
pnpm typecheck      # type check (must run after implementation)
```

### Git push

Always push to both remotes:

```bash
git push && git push prod main
```

`prod` remote is configured in `.git/config`.

### Running standalone Node scripts

pnpm uses strict module isolation — packages are not hoisted to `node_modules/`. For transitive dependencies (e.g. `@supabase/supabase-js` via `@nuxtjs/supabase`), set `NODE_PATH` to the package's location inside `.pnpm/`:

```bash
NODE_PATH=node_modules/.pnpm/<pkg>@<version>/node_modules node -e "..."
```

`pnpm exec node` only resolves direct dependencies, not transitive ones.

---

## Environment

```bash
cp .env.example .env
```

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=xxx
ANTHROPIC_API_KEY=sk-ant-xxx

# Relay — shared secret between relay server and backend
RELAY_SECRET=xxx
# [frontend] WebSocket URL to the relay  (ws:// dev, wss:// prod)
NUXT_PUBLIC_WS_URL=ws://localhost:3001
# [backend] WebSocket URL the homeserver dials to reach the relay
RELAY_URL=ws://localhost:3001
# [backend] XHS MCP HTTP server (optional, defaults to localhost:18060)
XHS_MCP_URL=http://localhost:18060/mcp
```

---

## Project Structure

```
nuxt-notes/
├── app/                        # srcDir (Nuxt source root)
│   ├── app.vue
│   ├── layouts/default.vue     # desktop sidebar + mobile bottom nav
│   ├── pages/
│   │   ├── index.vue           # → redirect /notes
│   │   ├── login.vue           # OAuth login (GitHub + Google)
│   │   ├── auth/confirm.vue    # Supabase callback
│   │   └── notes/
│   │       ├── index.vue       # empty state
│   │       └── [id].vue        # note editor page
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppSidebar.vue  # sidebar (module nav + note list + search)
│   │   │   └── MobileNav.vue   # mobile bottom nav
│   │   ├── editor/             # Tiptap editor
│   │   └── ai/                 # AI panel + block sub-components
│   ├── composables/
│   │   ├── useAuth.ts          # signInWithGithub / signInWithPassword / signOut
│   │   └── useNotes.ts         # CRUD + autoSave (1s debounce)
│   ├── stores/
│   │   ├── noteStore.ts        # note list + current note + optimistic updates
│   │   ├── aiStore.ts          # WS lifecycle, WsMessageProcessor, cache, restore
│   │   └── uiStore.ts          # sidebar/AI panel toggles + activeModule
│   ├── middleware/auth.ts       # redirect unauthenticated → /login
│   ├── utils/editor/
│   │   ├── slashCommands.ts    # slash command definitions
│   │   ├── slashMenuState.ts   # singleton ref bridging extension ↔ Vue
│   │   └── SlashExtension.ts   # Tiptap Extension class (slash suggestion)
│   └── types/
│       ├── index.ts            # Note, NoteInsert, NoteUpdate
│       └── aiPanel.ts          # AiMessage, AiUiBlock, ThinkingUiBlock, ToolUseUiBlock…
├── supabase/migrations/
│   ├── 001_notes.sql           # notes table + RLS + updated_at trigger
│   └── 002_notes_claude_session.sql  # claude_session_id + chat_version columns
├── relay/                      # WS relay server (deploy to cloud server)
│   ├── src/index.ts            # JWT auth, per-session queue, browser ↔ homeserver routing
│   └── package.json
├── backend/                    # Claude agent backend (run on homeserver)
│   ├── main.py                 # FastAPI + relay WS loop + restore streaming
│   ├── agent.py                # AgentRunner: ClaudeSDKClient, MCP servers, session resume
│   ├── tools.py                # notes MCP tools (search_notes stub)
│   ├── relay_sender.py         # RelaySender — serializes blocks → relay WS
│   └── requirements.txt
├── docs/
│   ├── requirements/
│   │   └── overview.md         # human requirements + agent interpretation
│   └── design/
│       ├── modules/            # finalized architecture docs
│       └── draft/              # in-progress feature designs
├── public/icons/               # PWA icons (icon-192.png / icon-512.png)
├── nuxt.config.ts
├── .env.example
└── AGENTS.md                   # this file
```

---

## Progress

| Feature | Status |
|---------|--------|
| F1 Project scaffold | ✅ |
| F2 OAuth auth (GitHub + Google) | ✅ |
| F3 Supabase DB + RLS | ✅ |
| F4 Notes CRUD + auto-save | ✅ |
| F5 Layout + sidebar | ✅ |
| F6 Tiptap editor | ✅ |
| F7 AI panel (Claude chat) | ✅ |
| F8 Editor /ai commands | 🔲 |
| F9 Chat module | 🔲 |
| F10 PWA service worker | 🔲 |
| F11 Animation + polish | 🔲 |

---

## Code Conventions

### Naming & Structure

- TypeScript everywhere. No `any` — use `unknown` or explicit casts.
- Components: `<script setup>` + PascalCase filename.
- Composables: `use` prefix (e.g. `useNotes.ts`).
- Stores: `useXxxStore` via Pinia `defineStore`.
- Server routes: `server/api/<module>/<action>.post.ts`.
- Shared types in `app/types/index.ts`; module-only types inline.
- Supabase query results: cast with `as TypeName` (client is untyped).
- AI calls: server routes only. Never expose API key to client.
- New module: own pages + store + composable + components dirs. Add nav entry to `modules` array in `AppSidebar.vue`.

### Encapsulation & Reuse

- Extract reusable logic into `app/utils/` or shared composables early — don't wait for the third copy.
- Use classes when modeling stateful objects with behavior and lifecycle. Prefer classes over closures when the thing has identity, multiple methods sharing state.
- Evaluate splitting when a file exceeds ~200 lines. Split by responsibility, not line count.
- Modules expose clean public API (composable return values, store actions). Never reach into another module's internals.
- Check `@vueuse/core` before writing a utility — it probably exists there.

---

## Design Context

### Users
Single user (personal workspace). Context: writing at a desk or on mobile, often in low-light. The job is capturing thoughts, writing longer pieces, and eventually chatting with an AI assistant. The user is technical but wants the app to feel like a quality notebook, not a developer tool.

### Brand Personality
**Calm. Editorial. Focused.**

The app should feel like a well-made physical notebook that happens to have superpowers. Not a dashboard, not a productivity suite — a place to think. The AI presence should feel like a quiet collaborator, not a chatbot widget bolted on.

Anti-references: Obsidian (too dark/techy), Roam (too dense/academic), Notion (too corporate/blocky).

### Aesthetic Direction
- **Primary reference**: Bear — sidebar + editor split, warm serif-accented typography, subtle accent color, deeply focused writing environment.
- **Secondary reference**: Craft / iA Writer — generous whitespace, editorial rhythm, content breathes.
- **Accent**: Cool blue/indigo — calm, focused, slightly intelligent. Used sparingly: active states, links, primary actions only.
- **Theme**: Both light and dark, following OS system preference via Nuxt UI `color-mode`. Light mode is warm white (stone-50 / #fafaf9). Dark mode is deep zinc (#18181b).
- **Typography**: Inter for UI chrome. Georgia/serif for article-mode editor body. Title inputs get generous size and weight. Muted dates/metadata stay xs and quiet.
- **Shape language**: Slightly rounded (not pill, not sharp). Borders are subtle — 1px, low contrast. Elevation is rare and restrained.
- **Anti-references**: No cyan-on-dark AI aesthetics, no gradient text, no glassmorphism, no purple glows.

### Design Principles
1. **Writing comes first.** The editor is the product. Every chrome element — sidebar, topbar, AI panel — should recede when not in use. Hover reveals, not always-on.
2. **Warmth over sterility.** Prefer stone/warm-gray backgrounds over cold neutrals. Use serif accents in the editor. Spacing should feel generous, not cramped.
3. **Calm intelligence.** The AI panel is a thoughtful sidebar, not a chat widget. It appears softly, feels like a co-author, not a feature announcement.
4. **Progressive disclosure.** Sidebar toggles away. Topbar actions appear on hover/focus. Save indicator is whisper-quiet. Mobile shows only what is needed.
5. **System-native.** Dark/light follows the OS. Transitions are subtle (200ms ease). No jarring mode switches or heavy animations.
