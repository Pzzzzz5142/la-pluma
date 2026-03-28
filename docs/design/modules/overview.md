# Overall Architecture

> Status: implemented
> Author: power
> Created: 2026-03-22
> Last updated: 2026-03-22

## Background

A mobile-first personal workspace with Claude AI integration. Existing tools (Logseq, Notion) have poor mobile UX or inflexible AI integration — hence building our own.

## Goals

- Mobile-first PWA, installable to home screen
- Modular: notes now, chat/agents/stocks later — each domain is a self-contained module
- Claude AI integration: inline editor commands + chat panel
- Multi-device sync via Supabase Realtime
- Desktop: resizable panel layout

## Non-goals

- Team collaboration (personal tool)
- Full offline sync (PWA caches app shell + last-viewed data)
- Plugin system

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                    Nuxt 3 App                    │
│                                                  │
│  ┌────────────┐  ┌─────────────┐  ┌──────────┐  │
│  │   Pages    │  │ Composables │  │  Stores  │  │
│  │ /notes     │  │ useNotes    │  │ noteStore│  │
│  │ /chat      │  │ useChat     │  │ chatStore│  │
│  │ /<module>  │  │ useAuth     │  │ uiStore  │  │
│  └─────┬──────┘  └──────┬──────┘  └────┬─────┘  │
│        └────────────────┴──────────────┘         │
│                         │                        │
│              ┌──────────▼──────────┐             │
│              │     Supabase        │             │
│              │     (data/auth)     │             │
│              └─────────────────────┘             │
│                                                  │
│  AI: no server routes — direct WS to relay       │
└──────────────────────────────────────────────────┘
```

---

## Module Pattern

Every domain follows the same structure:

```
app/pages/<module>/          # routes
app/stores/<module>Store.ts  # state
app/composables/use<Module>.ts  # logic + API calls
app/components/<module>/     # UI
server/api/<module>/         # server routes (if needed)
supabase/migrations/         # DB schema (if needed)
```

Shared infrastructure (auth, layout, sidebar, AI panel, Supabase client) lives outside any module. Sidebar navigation is driven by a `modules` array in `AppSidebar.vue`.

---

## Core Modules

### Notes (implemented)

Two modes:
- **Quick Note**: outline-style blocks, compact, for fast capture
- **Article**: full-document layout, title field, for long-form writing

Data: `notes` table in Supabase, content as Tiptap JSON (`jsonb`), RLS per user.
Editor: Tiptap with StarterKit, Placeholder, TaskList, TaskItem, CodeBlockLowlight (lowlight/common), Image, SlashExtension (custom, via @tiptap/suggestion), BubbleMenu.
- **BubbleMenu**: floating toolbar on text selection (Bold, Italic, Strike, H1, H2, Code, Quote)
- **Slash commands**: type `/` on empty line → block picker (headings, lists, task list, code block, quote)
- **Mode toggle**: topbar button switches quick ↔ article; article mode uses Georgia serif body text
- Slash state bridged via module-level singleton (`utils/editor/slashMenuState.ts`); extension is a class (`utils/editor/SlashExtension.ts`)

### Layout (implemented)

Desktop: sidebar + main content (splitpanes for resize). AI panel slides in on toggle.
Mobile: single column + bottom nav.

### AI (F7 implemented)

Three-tier architecture — browser never directly touches Claude:

```
Browser (Vercel) ←——WS——→ relay/ (cloud server) ←——WS——→ backend/ (homeserver, Python)
                                                                  ↓
                                                           Anthropic API
```

- **relay/** (Node.js, `ws`): routes messages by `sessionId`, verifies Supabase JWT for browsers, `RELAY_SECRET` for homeserver backend. homeserver connects outbound — no inbound ports needed.
  - **Per-session serial queue**: same `claudeSessionId` can't run concurrently. Incoming `chat`/`restore` requests are queued per `claudeSessionId`; browser receives `{ type: "queued", position }` while waiting. `done`/`error`/`restore_done`/`restore_error` dequeue the next request.
- **backend/** (Python, FastAPI + `claude-agent-sdk`): connects outbound to relay, runs `ClaudeSDKClient`, streams blocks back. Model: `claude-sonnet-4-6`, adaptive thinking. MCP servers: `notes` (SDK, in-process) with `search_notes` tool (stub); `xhs` (HTTP, `http://localhost:18060/mcp`) with all Xiaohongshu tools.
  - **TLS note**: the relay server does TLS fingerprint filtering at the nginx level — only browser-like ClientHellos are accepted; OpenSSL-based clients get TCP RST. The backend uses `curl_cffi` (impersonate `"firefox"`) instead of `websockets` to pass this check.
- **Frontend**: `aiStore.ts` manages WS lifecycle + `WsMessageProcessor` class maps SDK blocks → UI blocks. Components: `AiPanel`, `AiMessageRow`, `AiThinkingBlock`, `AiToolUseBlock`, `AiTextBlock`.
  - Thinking and tool-use blocks are always visible (collapsible for thinking). Shown during streaming and retained after done.
  - **Restore on connect**: if `_requestRestore` is called while WS is not yet open, saved to `pendingRestore` and executed on next `auth_ok`.
- Note context: `tiptapToText()` utility extracts plain text from Tiptap JSON, stored in `uiStore.aiNoteContext`, synced from `[id].vue`.
- Inline `/ai` editor commands: pending (F8)

**Session persistence:**
- Each note stores `claude_session_id` (text) + `chat_version` (int) in the DB (`002_notes_claude_session.sql`).
- On note load: check localStorage cache (`ai-history:{claudeSessionId}`, stores `{ version, messages[] }`). Cache hit with `version >= chat_version` → instant restore. Miss/stale → send `restore` to backend.
- Backend restore streams history block-by-block: `restore_user_msg` for user turns, `block` for assistant blocks (text/thinking/tool_use/tool_result), then `restore_done` with final `chatVersion`. Frontend rebuilds messages live.
- On `done`: backend increments `chat_version` in DB and returns new value. Frontend writes updated cache.
- `userToken` (fresh JWT) is carried in every `chat`/`restore` message so backend Supabase calls never use a stale auth-time token.

**Multi-device / cross-tab sync:**
- **Cross-tab**: `window.storage` event on `ai-history:*` keys. Other tab's cache write triggers immediate update if version is newer and this tab isn't actively streaming.
- **Cross-device**: `[id].vue` subscribes to Supabase Realtime `postgres_changes` on the current note. `claude_session_id`/`chat_version` change → call `ai.loadForNote()`. Realtime events arriving during streaming are held in `pendingRealtimeUpdate` and applied when streaming ends.

### Data Layer (implemented)

- Supabase PostgreSQL + Auth (GitHub OAuth + email/password fallback) + RLS
- `updated_at` auto-trigger
- Tiptap JSON format (not Markdown) — preserves full format, export to Markdown on demand

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Editor | Tiptap | Vue-native, highly extensible, active ecosystem |
| Content format | Tiptap JSON (jsonb) | Preserves rich format, flexible queries, export to Markdown later |
| AI calls | Dedicated backend (homeserver) via relay | API key never in Nuxt; homeserver connects outbound, no public IP needed |
| Panels | splitpanes | Stable, lightweight, Vue 3 compatible |
| Auth | GitHub OAuth (primary) + email/password (fallback) | GitHub OAuth for convenience; password fallback for direct access |

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | power | Initial version |
| 2026-03-22 | agent | Updated to reflect actual implementation: splitpanes, English, removed stale plan, added module pattern |
| 2026-03-22 | agent | F6: BubbleMenu, SlashExtension, mode toggle, task list, CodeBlockLowlight, article serif mode |
| 2026-03-27 | agent | F7: AI panel with relay/backend split architecture, WebSocket, Agent SDK (Python) |
| 2026-03-27 | agent | backend: replaced `websockets` with `curl_cffi` to bypass relay server TLS fingerprint filtering |
| 2026-03-28 | agent | backend: added XHS MCP HTTP server (`xhs`) alongside existing `notes` SDK server |
| 2026-03-28 | agent | F2: replaced magic link with GitHub OAuth + password fallback; removed Google |
| 2026-03-28 | agent | fix: AI chat history not restored on new device or relay reconnect — added `pendingRestore` to aiStore |
| 2026-03-28 | agent | docs: fix stale server API routes diagram (no server/api exists); fix auth flow (implicit, not PKCE); homeserver rename |
| 2026-03-28 | agent | AI session persistence: per-note claude_session_id, chat_version, localStorage cache, cross-tab/device sync, streaming restore, serial relay queue |
