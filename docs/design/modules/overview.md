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
│  ┌──────────────────────▼─────────────────────┐  │
│  │            Server API Routes               │  │
│  │  /api/ai/chat   /api/ai/transform          │  │
│  │  /api/<module>/...                         │  │
│  └──────────┬───────────────┬─────────────────┘  │
└─────────────┼───────────────┼────────────────────┘
              │               │
    ┌─────────▼───┐   ┌──────▼──────┐
    │  Claude SDK │   │  Supabase   │
    │  (AI)       │   │  (data)     │
    └─────────────┘   └─────────────┘
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
Browser (Vercel) ←——WS——→ relay/ (cloud server) ←——WS——→ backend/ (Pi, Python)
                                                                  ↓
                                                           Anthropic API
```

- **relay/** (Node.js, `ws`): routes messages by `sessionId`, verifies Supabase JWT for browsers, `RELAY_SECRET` for Pi backend. Pi connects outbound — no inbound ports needed.
- **backend/** (Python, FastAPI + `claude-agent-sdk`): connects outbound to relay, runs Agent SDK (`query()`), streams blocks back. Model: `claude-opus-4-6`, adaptive thinking, MCP tool `search_notes` (stub).
- **Frontend**: `aiStore.ts` manages WS lifecycle + `WsMessageProcessor` class maps SDK blocks → UI blocks. Components: `AiPanel`, `AiMessageRow`, `AiThinkingBlock`, `AiToolUseBlock`, `AiTextBlock`.
- Note context: `tiptapToText()` utility extracts plain text from Tiptap JSON, stored in `uiStore.aiNoteContext`, synced from `[id].vue`.
- Inline `/ai` editor commands: pending (F8)

### Data Layer (implemented)

- Supabase PostgreSQL + Auth (magic link) + RLS
- `updated_at` auto-trigger
- Tiptap JSON format (not Markdown) — preserves full format, export to Markdown on demand

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Editor | Tiptap | Vue-native, highly extensible, active ecosystem |
| Content format | Tiptap JSON (jsonb) | Preserves rich format, flexible queries, export to Markdown later |
| AI calls | Dedicated backend (Pi) via relay | API key never in Nuxt; Pi connects outbound, no public IP needed |
| Panels | splitpanes | Stable, lightweight, Vue 3 compatible |
| Auth | Supabase magic link | No password management, good mobile UX |

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | power | Initial version |
| 2026-03-22 | agent | Updated to reflect actual implementation: splitpanes, English, removed stale plan, added module pattern |
| 2026-03-22 | agent | F6: BubbleMenu, SlashExtension, mode toggle, task list, CodeBlockLowlight, article serif mode |
| 2026-03-27 | agent | F7: AI panel with relay/backend split architecture, WebSocket, Agent SDK (Python) |
