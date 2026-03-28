# Project Requirements

## Priority Rule

**Human requirements > Agent interpretation > Actual code implementation.**

When conflicts arise: defer to the human section first. If the human section is silent, defer to the agent section. Code that diverges from either must be treated as a bug, not a feature.

**Human sections:** The agent may summarize and edit these (e.g. after a chat-based discussion), but the changes must be explicitly approved by the human before they are considered final. Until approved, treat the previous version as authoritative.

**Agent Interpretation sections:** The agent maintains these freely, but must flag any conflict with the Human section above it.

---

## Core App

### Human

> A modular personal workspace PWA, mobile-first, with Claude AI integration and multi-device sync.
> GitHub OAuth as primary login. Email + password as fallback. No magic link.

### Agent Interpretation

**Auth (implemented):**
- Primary: GitHub OAuth via Supabase Auth (`signInWithOAuth`). Redirect callback at `/auth/confirm`, which watches `useSupabaseUser()` — no manual code exchange.
- Auth flow: `implicit` (not PKCE). `useSsrCookies: false` + `clientOptions.auth.flowType: 'implicit'` in `nuxt.config.ts`. Session stored in localStorage.
- Fallback: email + password via `signInWithPassword`. Hidden behind a toggle link on the login page.
- `useAuth` composable exposes `signInWithGithub`, `signInWithPassword`, `signOut`.
- Route-level `auth` middleware (`app/middleware/auth.ts`) guards all pages except `/login` and `/auth/confirm`.

**Multi-device sync (implemented for AI chat):**
- Supabase Realtime `postgres_changes` subscription on the current note detects `claude_session_id` / `chat_version` changes from other devices and triggers reload.
- Same-browser cross-tab sync via `window.storage` event on `ai-history:*` localStorage keys.
- Note content sync (title/body edits across devices) not yet wired — current flow is request/response only.

---

## Notes Module

### Human

> Two modes: quick capture (block style) and long-form article writing.
> AI integration: inline /ai commands in editor and a toggled side panel for chat with note context.

### Agent Interpretation

**Note modes (implemented):**
- `notes.mode` column has a DB-level check constraint: `'quick' | 'article'`.
- Quick mode: block/outline style, compact line height, one idea per block.
- Article mode: full-document layout, larger type, dedicated title input.
- Note content stored as Tiptap JSON (`content jsonb` in Supabase), not Markdown — preserves rich format.
- Mode toggle button in topbar; persisted via `autoSave`.

**Slash commands (implemented, no AI yet):**
- `/` in the editor opens a floating menu with formatting commands: H1/H2/H3, bullet list, ordered list, task list, code block, blockquote.
- Inline `/ai` command (polish, expand, summarize, continue) — **not yet implemented**.

**AI side panel (implemented):**
- Toggled by the sparkles button in topbar (`uiStore.aiPanelOpen`).
- Full chat UI with streaming, thinking blocks, tool-use blocks, cancel button, queue indicator. Thinking and tool-use blocks remain visible after streaming completes and are restored in history.
- Note title + body text injected as context on every message (`uiStore.aiNoteContext`).
- "新对话" button clears history and starts a fresh Claude session.

**AI architecture — WebSocket relay (implemented):**
- No Nuxt server routes for AI. All Claude calls go through: browser → WebSocket relay (Node.js) → Python backend → Claude SDK.
- Relay (`relay/src/index.ts`) authenticates browser connections via Supabase JWT, verifies with anon key, routes messages to the Python agent.
- Python backend (`backend/main.py`) manages `AgentRunner` instances, talks to Claude CLI via `claude_agent_sdk`.
- Browser sends a fresh `supabaseSession.access_token` in each message so the backend can perform Supabase operations without stale JWT.

**AI session persistence (implemented):**
- Each note stores `claude_session_id` and `chat_version` in the DB.
- On load: checks localStorage cache first; falls back to `restore` request to backend if cache is stale.
- On send: `done` response carries new `chatVersion`; frontend writes to localStorage cache.
- Relay enforces per-session serial dispatch (CUDA-stream model) — concurrent requests to the same Claude session are queued, not rejected.
- See `docs/design/draft/ai-session-persistence.md` for full design.

---

## Chat Module

### Human

> Add a chat module as a standalone domain to demonstrate the app's extensibility. The app is not only a note app now.

### Agent Interpretation

Not yet implemented. `uiStore.activeModule` currently supports `'notes' | 'agents' | 'stocks'` — chat would be added as a new entry (type union + sidebar `modules` array). Design draft pending.

---

## Extensibility

### Human

> Must be extendable in the future. Each new domain (notes, chat, agents, stocks, etc.) should be a self-contained module.

### Agent Interpretation

**Module-first architecture (implemented in app shell):**
- App shell is already decoupled from notes: `layouts/default.vue` is generic (sidebar + main), `uiStore.activeModule` tracks which domain is active.
- `AppSidebar.vue` has a `modules` array driving the top nav icons — adding a new module is one entry.
- `MobileNav.vue` uses the same pattern — extensible bottom icons.

**Per-module isolation (pattern established by notes):**
- Each domain owns: `pages/<module>/`, `stores/<module>Store.ts`, `composables/use<Module>.ts`, `components/<module>/`, `supabase/migrations/`.
- Current notes module follows this: `noteStore.ts` + `useNotes.ts` + `pages/notes/` + `components/editor/` + `001_notes.sql`.

**Shared infrastructure:**
- Auth, layout, sidebar, Supabase client, Pinia, `uiStore` — all module-agnostic.
- AI (WebSocket relay + Python backend) is also module-agnostic; `noteContext` is injected per-message, not hardcoded.

---

## PWA

### Human

> Want to make a PWA app. Should handle multiple modules each with appropriate offline behavior.

### Agent Interpretation

**Currently configured (scaffold only):**
- `@vite-pwa/nuxt` installed and configured in `nuxt.config.ts`.
- Web app manifest: `display: standalone`, dark theme (`#18181b`), references `public/icons/icon-192.png` + `icon-512.png` (files not yet created).
- Workbox set to cache `**/*.{js,css,html,png,svg,ico}` with `navigateFallback: '/'`.

**Not yet implemented:**
- Per-module runtime caching strategy.
- Push notifications (out of scope until agents module).
- Actual icon files in `public/icons/`.

---

## Code Quality

### Human

> Keep overall code style with good encapsulation and reusable utils.
> When one module goes too complex, split it.
> When you think you need a class, try to use it.

### Agent Interpretation

Implementation rules live in AGENTS.md under "Code Conventions > Encapsulation & Reuse". Not duplicated here.
