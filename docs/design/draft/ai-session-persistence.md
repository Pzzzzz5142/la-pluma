# AI Session Persistence
> Status: done
> Date: 2026-03-27

## Requirement

每个 note 绑定一个 Claude session ID，实现：
1. 多轮对话在同一 session 中进行（Claude 记得上下文）
2. 刷新页面后可以 restore 历史聊天记录
3. 后端从 `query()` 迁移到 `ClaudeSDKClient`

## Analysis

**SDK 能力已验证：**
- `ClaudeSDKClient` 支持 `resume=session_id` 恢复会话
- `get_session_messages(session_id)` 可获取完整历史（user + assistant，含 thinking/tool_use blocks）
- assistant message 的 content 格式为 `[{type: "text", text: "..."}, {type: "thinking", ...}]`，与前端 block 格式一致

**现有代码可复用：**
- `WsMessageProcessor` — block → UI 映射逻辑，restore 历史时可复用
- `RelaySender` — 序列化 + 发送，不需要改动
- relay 协议 — 只需新增 `restore` 消息类型

**现有问题（已解决）：**
- `sendMessage()` 每次都生成新 sessionId（`crypto.randomUUID()`），没有复用
- 切换 note 时 `clearHistory()` 直接清空，没有保存
- notes 表没有 `claude_session_id` 字段

## Implementation Plan

### 1. Backend: `query()` → `ClaudeSDKClient`

**`backend/agent.py`:**
- `AgentRunner` 改为管理 `ClaudeSDKClient` 实例
- 新增 `claude_session_id` 参数：有值时 `resume=id`，无值时创建新 session
- 从 `SystemMessage` 的 `data.session_id` 捕获新 session ID，通过新回调 `on_session_id` 通知调用方
- 多轮对话在同一 client 内用 `client.query()` + `client.receive_response()` 循环

**生命周期：**
- 每次 chat 请求创建一个 `ClaudeSDKClient`（connect → query → receive → disconnect）
- 不保持长连接——SDK session 本身是持久化的（存在 Claude CLI 的 session storage），reconnect 靠 `resume`

### 2. Backend: 新增 restore API + chat_version 更新

**`backend/main.py` 实现：**
- `chat` 的 `on_done` 回调中：通过 Supabase client 更新 note 的 `chat_version += 1`，将新 version 值放入 `done` 消息返回前端
- 新增 `restore` 处理：调用 `get_session_messages()`，逐条流式下发 `restore_user_msg` / `block`，结束时发 `restore_done`（或失败时 `restore_error`）。不再批量返回 `restore_ok`。

**Backend Supabase access：**
- backend 用 anon key + 请求携带的用户 JWT（`userToken`）访问 Supabase，RLS 确保只能更新自己的 note
- ⚠️ 原实现 bug（已修）：relay 只在 WS 握手时记录一次 `userToken`，长连接超过 ~1 小时后 JWT 过期，`chat_version` 更新报 `PGRST303` 失败
- 修复：browser 在每条 `chat` / `restore` 消息中携带当前 `supabaseSession.access_token`；relay 转发时优先使用消息级 token 而非握手时缓存的 token

### 3. DB: notes 表加字段

**`supabase/migrations/002_notes_claude_session.sql`:**
```sql
alter table notes add column if not exists claude_session_id text;
alter table notes add column if not exists chat_version int not null default 0;
```

不加索引——只在加载单个 note 时读取，不需要按这些字段查询。

### 4. Frontend: 绑定 note ↔ claude_session_id

**`app/types/index.ts`:**
- `Note` 类型加 `claude_session_id?: string`

**`app/stores/aiStore.ts`:**
- `sendMessage()` 接受可选的 `claudeSessionId` 参数，发送给 backend
- 新增 `claudeSessionId` state，从 backend 返回的 `session_id` 事件中更新
- `loadForNote(noteId, claudeSessionId, chatVersion)` — 切换 note 时调用，检查 cache 或触发 restore
- restore 失败时（session 过期/不存在）提示用户 "历史记录已过期"，清空 note 的 `claude_session_id`，开始新对话
- 新增 `restoreFailed` / `sessionCleared` ref，供 `[id].vue` 监听并写回 DB

**`app/pages/notes/[id].vue`:**
- 切换 note 时调用 `ai.loadForNote()`
- 监听 `ai.claudeSessionId` 变化 → `updateNote(id, { claude_session_id })` 写回 DB（**直接调用，不走 debounce**）
- 监听 `ai.restoreFailed` / `ai.sessionCleared` → `updateNote(id, { claude_session_id: null, chat_version: 0 })` 写回 DB（**直接调用，不走 debounce**）
- ⚠️ 原实现 bug（已修）：上述三处使用了 1s debounce 的 `autoSave`，可能被并发的内容编辑 autoSave 覆盖/取消，导致 DB 未更新、Realtime 事件未触发、其他端不知道 session 已变更

### 4.1 Frontend: 本地缓存 + 跨端同步

**目标：** 避免频繁 restore，同时支持多设备、多标签页数据一致。

**Source of truth:** Claude CLI session storage（后端单机）。

**同步信号：** notes 表新增 `chat_version int not null default 0`。每次后端处理完一轮对话（`done`），更新 `chat_version += 1`。

**缓存存储：** `localStorage`（跨标签页共享，持久化）。

**Cache key:** `ai-history:{claudeSessionId}`

**Cache value:**
```json
{ "version": 3, "messages": [...AiMessage[]] }
```

**完整流程：**

1. **Load（切换 note / 刷新页面 / Realtime 通知）：**
   - note 没有 `claude_session_id` → `clearHistory()`，检查 `ai-notice:{noteId}` localStorage，有则展示，结束
   - 读 localStorage cache → 命中且 `cache.version >= note.chat_version` → 直接恢复，不走网络
   - cache miss 或 version 不匹配 → 发 `restore` 请求 → 收到 `restore_ok` → 填充 messages + 写入 cache（带 version）

2. **Write（本端发消息后）：**
   - 收到 `done` 事件时，后端已更新 `chat_version`
   - 前端同步更新 `currentChatVersion`（从 `done` 消息中携带）
   - 将 `{version, messages}` 写入 localStorage

3. **跨标签页同步：**
   - `window.storage` 事件监听（`aiStore.ts`）。当其他标签页写入 `ai-history:*` 时，当前标签页自动检测到变更，若 key 匹配当前 `claudeSessionId` 且 version >= 本地 version，直接更新 `messages` 和 `currentChatVersion`，无需 restore
   - 若本标签页正在 streaming（非 queued），忽略 storage 更新；若在 queued 状态，应用更新但保留 pending user message

4. **跨设备同步（Supabase Realtime）：**
   - `[id].vue` 订阅当前 note 的 `postgres_changes` UPDATE 事件
   - 收到更新 → 对比 `claude_session_id` / `chat_version` → 调用 `ai.loadForNote()`
   - ⚠️ 原实现 bug（已修）：`if (ai.streaming) return` 直接丢弃了 streaming 期间到达的 Realtime 事件，streaming 结束后 session 状态永久错乱
   - 修复：streaming 期间将最新的 Realtime payload 存入 `pendingRealtimeUpdate`；监听 `ai.streaming` → false，此时取出并应用

5. **Invalidate：**
   - 用户手动清除对话 → 删除 cache entry + 立即写回 DB（`claude_session_id: null, chat_version: 0`）→ Realtime 通知其他端

**降级：** Realtime 断线不影响本端使用，最多其他端需要手动刷新触发 restore。

**清理策略：** localStorage 有 5-10MB 上限。聊天记录含 thinking blocks 可能较大。当写入失败（`QuotaExceededError`）时，清理最旧的 cache entries（按 key 遍历 `ai-history:*`，删除前半）。

### 4.2 Relay: 按 claudeSessionId 串行调度

**背景：** 同一个 Claude session 不支持并发请求，需要串行处理。

**实现（`relay/src/index.ts`）：**
- `noteQueues: Map<claudeSessionId, QueuedRequest[]>` — 每个 session 的等待队列
- `activeClaudeSessions: Set<claudeSessionId>` — 当前正在处理的 session
- `wsToClaudeSession: Map<wsSessionId, claudeSessionId>` — 用于 done/error 时回收
- `chat` / `restore` 消息到来时：若 session 空闲则立即 dispatch，否则入队并返回 `{ type: "queued" }`
- `done` / `error` / `restore_ok` / `restore_error` 时：清理映射，取队列下一个 dispatch
- `cancel`：从队列中移除对应 wsSessionId
- 浏览器断连：`removeFromQueue(browserWs)` 清理该连接的所有待处理请求

**前端感知：**
- 收到 `queued` 消息 → `ai.queued = true`，UI 显示"排队中，稍候…"
- 收到第一个 `block` → `ai.queued = false`，恢复正常 streaming 显示

### 5. Relay 协议

**Browser → Relay → Agent:**
```json
// chat 消息（新增 claudeSessionId、noteId、userToken）
{ "type": "chat", "sessionId": "...", "msgId": "...", "userMessage": "...", "noteContext": "...", "claudeSessionId": "...", "noteId": "...", "userToken": "<fresh JWT>" }

// 恢复历史（新增 noteId、userToken）
{ "type": "restore", "sessionId": "...", "claudeSessionId": "...", "noteId": "...", "userToken": "<fresh JWT>" }
```

> `userToken` 由 browser 在每条消息中携带当前 `supabaseSession.access_token`，relay 转发时优先使用消息级 token（覆盖握手时缓存的可能已过期的 token）。

**Agent → Relay → Browser:**
```json
// 新 session 创建时通知
{ "type": "session_id", "sessionId": "...", "claudeSessionId": "..." }

// done 消息新增 chatVersion 字段
{ "type": "done", "sessionId": "...", "stopReason": "...", "chatVersion": 3 }

// 请求入队等待
{ "type": "queued", "sessionId": "...", "position": 1 }

// 历史恢复：流式逐条下发（替代原 restore_ok 批量方案）
{ "type": "restore_user_msg", "sessionId": "...", "content": "用户消息文本" }
{ "type": "block", "sessionId": "...", "block": { "type": "text"|"thinking"|"tool_use"|"tool_result", ... } }
{ "type": "restore_done", "sessionId": "...", "chatVersion": 3 }

// 恢复失败
{ "type": "restore_error", "sessionId": "...", "error": "session not found" }
```

### 6. 消息序列化（restore 用）

SDK 的 `SessionMessage` 格式：
```python
{
    "type": "user" | "assistant",
    "message": {
        "role": "user" | "assistant",
        "content": "string" | [{"type": "text", "text": "..."}, ...]
    }
}
```

转为前端 `AiMessage` 格式：
- user: `{role: "user", blocks: [{type: "text", content: message.content}]}`
- assistant: 遍历 `message.content` 数组，映射 `text` → `TextUiBlock`，`thinking` → `ThinkingUiBlock`（visible=false）

## Known Issues / Uncertainties

- **SDK session 存储位置：** Claude CLI 的 session 存储在 `~/.claude/sessions/`，是本地文件。如果 backend 部署在多台机器上，session 不共享。当前单机部署不是问题。
- **Session 过期：** 不确定 Claude CLI session 是否有 TTL。resume 失败时提示用户并开新 session（`restore_error` 流程）。
- **`get_session_messages` 去重：** 测试发现同一条 assistant 消息可能出现多次（thinking 和 text 分开），需要按 `uuid` 去重或合并。
- **chat_version 原子性：** backend 用 read-then-write 更新 `chat_version`（非原子），理论上多端同时发消息会有 version 竞争。实际上 relay 已串行化同一 session 的请求，不会并发到 backend，所以不是问题。
