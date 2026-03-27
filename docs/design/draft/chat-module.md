# Chat Module

> Status: approved
> Date: 2026-03-22

## Requirement

See docs/requirements/overview.md#Chat Module

## Analysis

**Reusable from existing code:**
- `noteStore.ts` pattern → `chatStore.ts` follows same structure (list + current + loading/saving states)
- `useNotes.ts` pattern → `useChat.ts` follows same CRUD + optimistic update approach
- `AppSidebar.vue` → already has `modules` array, just uncomment/add chat entry. Sidebar content needs to switch between note list and conversation list based on `activeModule`.
- `uiStore.ts` → `activeModule` type needs to include `'chat'`
- `server/api/ai/` → shared Claude server route, chat module sends messages with its own system prompt
- `001_notes.sql` migration pattern → `002_conversations.sql` follows same RLS approach

**Key gap: sidebar is currently notes-only.** The sidebar body (search + list) is hardcoded to notes in `AppSidebar.vue`. Need to make sidebar content dynamic per module — either via slots or conditional rendering.

**Key gap: no streaming support yet.** Chat UX needs streaming responses from Claude. The server route needs to return a ReadableStream, and the client needs to consume it incrementally.

## Implementation Plan

### 1. Database — `supabase/migrations/002_conversations.sql`

```sql
conversations (
  id          uuid primary key,
  user_id     uuid references auth.users,
  title       text default '',
  created_at  timestamptz,
  updated_at  timestamptz
)

messages (
  id              uuid primary key,
  conversation_id uuid references conversations on delete cascade,
  role            text check (role in ('user', 'assistant')),
  content         text,
  created_at      timestamptz
)
```

RLS: users can only access their own conversations. Messages inherit access via conversation ownership.
Index: `messages(conversation_id, created_at asc)` for ordered retrieval.

### 2. Types — `app/types/index.ts`

Add `Conversation`, `Message`, `ConversationInsert`, `MessageInsert`.

### 3. Store — `app/stores/chatStore.ts`

Same shape as `noteStore`:
- `conversations: Conversation[]`
- `currentConversation: Conversation | null`
- `messages: Message[]` (for current conversation)
- `streaming: boolean`
- `loading`, `error`

### 4. Composable — `app/composables/useChat.ts`

- `fetchConversations()` — list all, ordered by `updated_at desc`
- `fetchConversation(id)` — load conversation + its **most recent N messages** (e.g. last 20). Older messages are not loaded initially.
- `loadOlderMessages(conversationId, beforeCursor)` — lazy-load older messages when user scrolls to top. Cursor-based pagination using `created_at`.
- `createConversation()` — create empty, navigate to it
- `deleteConversation(id)` — optimistic delete
- `sendMessage(content)` — append user message to store, save to Supabase immediately, call server route, stream assistant response back, save to Supabase on stream complete, append to store
- Auto-title: after first assistant response, use first ~50 chars as conversation title

Message persistence: user messages saved on send, assistant messages saved on stream complete. All messages live in Supabase — the client only loads a window at a time.

### 5. Server route — `server/api/ai/chat.post.ts`

Accepts `{ messages: {role, content}[], conversationId?: string }`.
Returns a streaming response from Claude SDK.
System prompt is generic (no note context — that's the notes AI panel's job).

This route is shared infrastructure — notes AI panel will also use it later with a different system prompt containing note content.

### 6. Components — `app/components/chat/`

- `ChatMessageList.vue` — scrollable message list, auto-scroll on new messages, lazy-load older messages on scroll-to-top (shows spinner while loading)
- `ChatMessage.vue` — single message bubble (user right-aligned, assistant left-aligned). Assistant messages rendered as markdown via `markdown-it`.
- `ChatInput.vue` — text input + send button, disabled while streaming

### 7. Pages

- `app/pages/chat/index.vue` — empty state ("Start a new conversation")
- `app/pages/chat/[id].vue` — conversation view: message list + input

### 8. Sidebar update — `AppSidebar.vue`

- Add `{ id: 'chat', icon: 'i-lucide-message-circle', label: 'Chat', path: '/chat' }` to modules array.
- Make sidebar body dynamic: when `activeModule === 'notes'` show note list, when `'chat'` show conversation list. Extract each into a component:
  - `components/layout/SidebarNotes.vue` (extract from current AppSidebar)
  - `components/layout/SidebarChat.vue` (new)
- `uiStore.activeModule` type: add `'chat'`.
- `MobileNav.vue`: add chat icon.

### 9. Files to create/modify

**Install:**
- `markdown-it` + `@types/markdown-it`

**Create:**
- `supabase/migrations/002_conversations.sql`
- `app/stores/chatStore.ts`
- `app/composables/useChat.ts`
- `server/api/ai/chat.post.ts`
- `app/components/chat/ChatMessageList.vue`
- `app/components/chat/ChatMessage.vue`
- `app/components/chat/ChatInput.vue`
- `app/components/layout/SidebarChat.vue`
- `app/components/layout/SidebarNotes.vue`
- `app/pages/chat/index.vue`
- `app/pages/chat/[id].vue`

**Modify:**
- `app/types/index.ts` — add chat types
- `app/stores/uiStore.ts` — add `'chat'` to activeModule type
- `app/components/layout/AppSidebar.vue` — add chat to modules, make body dynamic
- `app/components/layout/MobileNav.vue` — add chat icon

## Uncertainties

- **Streaming from Nuxt server route**: need to verify that Nuxt 3's `defineEventHandler` supports returning a `ReadableStream` from the Anthropic SDK. Should be possible via `sendStream()` or returning the stream directly. Quick to verify — check before implementation.
- **Markdown renderer choice**: need `markdown-it` or similar for assistant messages. Could also reuse Tiptap in read-only mode but that's heavier. Leaning `markdown-it` — quick to verify package size and SSR compatibility.

## Open Questions

None — all resolved.
