import { defineStore } from 'pinia'
import type { AiMessage, AiUiBlock, ThinkingUiBlock, ToolUseUiBlock, TextUiBlock } from '~/types/aiPanel'

interface WsBlock {
  type: string
  [key: string]: unknown
}

interface WsServerMessage {
  type: string
  sessionId?: string
  msgId?: string
  block?: WsBlock
  stopReason?: string
  error?: string
  userId?: string
  claudeSessionId?: string
  chatVersion?: number
  content?: string
  agentOnline?: boolean
  timestamp?: number
}

// ---------------------------------------------------------------------------
// WsMessageProcessor — maps relay messages → UI blocks
// ---------------------------------------------------------------------------

class WsMessageProcessor {
  process(msg: WsServerMessage, messages: Ref<AiMessage[]>): void {
    if (msg.type === 'block' && msg.block) {
      this._applyBlock(msg.block, messages)
    }
  }

  private _applyBlock(block: WsBlock, messages: Ref<AiMessage[]>): void {
    const msgs = messages.value
    // Find or create the current assistant message
    let assistantMsg = msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant'
      ? msgs[msgs.length - 1]
      : null

    if (!assistantMsg) {
      assistantMsg = { role: 'assistant', blocks: [] }
      msgs.push(assistantMsg)
    }

    const blocks = assistantMsg.blocks

    if (block.type === 'thinking') {
      const uiBlock: ThinkingUiBlock = {
        type: 'thinking',
        content: (block.thinking as string) ?? '',
        status: 'done',
      }
      blocks.push(uiBlock)
    } else if (block.type === 'tool_use') {
      const uiBlock: ToolUseUiBlock = {
        type: 'tool_use',
        id: (block.id as string) ?? '',
        name: (block.name as string) ?? '',
        input: JSON.stringify(block.input ?? {}),
        status: 'running',
      }
      blocks.push(uiBlock)
    } else if (block.type === 'tool_result') {
      // Match the tool_use block by tool_use_id and update its status
      const toolUseId = block.tool_use_id as string
      for (const msg of msgs) {
        for (const b of msg.blocks) {
          if (b.type === 'tool_use' && b.id === toolUseId) {
            b.status = (block.is_error as boolean) ? 'error' : 'success'
            b.result = JSON.stringify(block.content ?? '')
            b.isError = (block.is_error as boolean) ?? false
          }
        }
      }
    } else if (block.type === 'text') {
      // Append to existing text block or create new one
      const last = blocks[blocks.length - 1]
      if (last?.type === 'text') {
        last.content += (block.text as string) ?? ''
      } else {
        const uiBlock: TextUiBlock = {
          type: 'text',
          content: (block.text as string) ?? '',
          status: 'done',
        }
        blocks.push(uiBlock)
      }
    }
  }

}

// ---------------------------------------------------------------------------
// localStorage cache helpers
// ---------------------------------------------------------------------------

interface CachedHistory {
  version: number
  messages: AiMessage[]
}

function cacheKey(claudeSessionId: string): string {
  return `ai-history:${claudeSessionId}`
}

function loadCache(claudeSessionId: string): CachedHistory | null {
  try {
    const raw = localStorage.getItem(cacheKey(claudeSessionId))
    if (!raw) return null
    return JSON.parse(raw) as CachedHistory
  } catch {
    return null
  }
}

function saveCache(claudeSessionId: string, version: number, messages: AiMessage[]): void {
  try {
    localStorage.setItem(cacheKey(claudeSessionId), JSON.stringify({ version, messages }))
  } catch {
    // QuotaExceededError — clean oldest entries
    cleanOldCacheEntries()
    try {
      localStorage.setItem(cacheKey(claudeSessionId), JSON.stringify({ version, messages }))
    } catch {
      // Still failing, give up silently
    }
  }
}

function removeCache(claudeSessionId: string): void {
  localStorage.removeItem(cacheKey(claudeSessionId))
}

function cleanOldCacheEntries(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('ai-history:')) keys.push(key)
  }
  // Remove first half (oldest by insertion order, rough heuristic)
  const toRemove = Math.max(1, Math.floor(keys.length / 2))
  for (let i = 0; i < toRemove; i++) {
    localStorage.removeItem(keys[i])
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAiStore = defineStore('ai', () => {
  const messages = ref<AiMessage[]>([])
  const streaming = ref(false)
  const queued = ref(false)
  const connected = ref(false)
  const backendConnected = ref(false)
  const relayLatency = ref<number | null>(null)
  const restoring = ref(false)
  const restoreFailed = ref(false)
  const sessionCleared = ref(false)
  const claudeSessionId = ref<string | null>(null)

  const processor = new WsMessageProcessor()

  let ws: WebSocket | null = null
  let wsSessionId = ''
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectDelay = 1000
  let currentNoteId: string | null = null
  let currentChatVersion = 0
  let pendingRestore: { cSessionId: string; noteId: string } | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null

  function _startPing(): void {
    if (pingTimer) return
    const sendPing = () => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
      }
    }
    sendPing()
    pingTimer = setInterval(sendPing, 10000)
  }

  function _stopPing(): void {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
    relayLatency.value = null
  }

  const wsUrl = useRuntimeConfig().public.wsUrl as string
  const supabaseSession = useSupabaseSession()

  // Cross-tab sync: listen for localStorage changes from other tabs
  if (import.meta.client) {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (!e.key?.startsWith('ai-history:') || !claudeSessionId.value) return
      if (e.key !== cacheKey(claudeSessionId.value)) return
      // Block update only if this tab is actively receiving blocks (not just waiting in queue).
      // When queued, we allow the update but re-append the pending user message so it isn't lost.
      if (streaming.value && !queued.value) return
      if (e.newValue) {
        try {
          const updated = JSON.parse(e.newValue) as CachedHistory
          if (updated.version >= currentChatVersion) {
            // If queued, the user message was already pushed to messages; preserve it
            const last = messages.value[messages.value.length - 1]
            const pendingUserMsg = queued.value && last?.role === 'user' ? last : null
            messages.value = updated.messages
            currentChatVersion = updated.version
            if (pendingUserMsg) messages.value.push(pendingUserMsg)
          }
        } catch { /* ignore parse errors */ }
      }
    })
  }

  function connect(): void {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      reconnectDelay = 1000
      const token = supabaseSession.value?.access_token
      if (token) {
        ws!.send(JSON.stringify({ type: 'auth', token }))
        return
      }
      // Session not ready yet — watch for it
      const stop = watch(supabaseSession, (session) => {
        if (!session?.access_token) return
        stop()
        if (ws?.readyState === WebSocket.OPEN) {
          ws!.send(JSON.stringify({ type: 'auth', token: session.access_token }))
        }
      })
    }

    ws.onmessage = (event) => {
      let msg: WsServerMessage
      try {
        msg = JSON.parse(event.data as string) as WsServerMessage
      } catch {
        return
      }

      if (msg.type === 'auth_ok') {
        connected.value = true
        backendConnected.value = msg.agentOnline ?? false
        _startPing()
        if (pendingRestore) {
          const { cSessionId, noteId } = pendingRestore
          pendingRestore = null
          _requestRestore(cSessionId, noteId)
        }
      } else if (msg.type === 'auth_error') {
        console.error('[aiStore] Auth error:', msg.error)
        ws?.close()
      } else if (msg.type === 'pong') {
        if (msg.timestamp != null) relayLatency.value = Date.now() - msg.timestamp
      } else if (msg.type === 'agent_online') {
        backendConnected.value = true
      } else if (msg.type === 'agent_offline') {
        backendConnected.value = false
        streaming.value = false
        restoring.value = false
        messages.value.push({
          role: 'assistant',
          blocks: [{ type: 'text', content: '*(AI backend is offline)*', status: 'done' }],
        })
      } else if (msg.type === 'session_id') {
        // New Claude session created — save the ID
        if (msg.claudeSessionId) {
          claudeSessionId.value = msg.claudeSessionId
        }
      } else if (msg.type === 'queued') {
        // Request is waiting in relay queue — still streaming from user's perspective
        queued.value = true
      } else if (msg.type === 'block') {
        queued.value = false
        processor.process(msg, messages)
      } else if (msg.type === 'done') {
        queued.value = false
        processor.process(msg, messages)
        streaming.value = false
        // Update chat_version from server and persist cache
        if (msg.chatVersion != null) {
          currentChatVersion = msg.chatVersion
        }
        if (claudeSessionId.value) {
          saveCache(claudeSessionId.value, currentChatVersion, messages.value)
        }
      } else if (msg.type === 'error') {
        queued.value = false
        streaming.value = false
        messages.value.push({
          role: 'assistant',
          blocks: [{ type: 'text', content: `*(Error: ${msg.error})*`, status: 'error' }],
        })
      } else if (msg.type === 'restore_user_msg') {
        messages.value.push({ role: 'user', blocks: [{ type: 'text', content: msg.content ?? '', status: 'done' }] })
      } else if (msg.type === 'restore_done') {
        restoring.value = false
        if (!claudeSessionId.value) return
        if (msg.chatVersion != null) {
          currentChatVersion = msg.chatVersion
        }
        if (claudeSessionId.value) {
          saveCache(claudeSessionId.value, currentChatVersion, messages.value)
        }
      } else if (msg.type === 'restore_error') {
        restoring.value = false
        claudeSessionId.value = null
        restoreFailed.value = true
        const noticeBlock: TextUiBlock = { type: 'text', content: '*(对话历史已过期，已开始新对话)*', status: 'done' }
        messages.value = [{ role: 'assistant', blocks: [noticeBlock] }]
        if (import.meta.client && currentNoteId) {
          localStorage.setItem(`ai-notice:${currentNoteId}`, noticeBlock.content)
        }
      }
    }

    ws.onclose = () => {
      connected.value = false
      backendConnected.value = false
      streaming.value = false
      _stopPing()
      // Reconnect with backoff
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000)
        connect()
      }, reconnectDelay)
    }

    ws.onerror = () => {
      // onclose will fire after this and handle reconnect
    }
  }

  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    _stopPing()
    ws?.close()
    ws = null
    connected.value = false
    backendConnected.value = false
  }

  function sendMessage(userMessage: string, noteContext: string): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    wsSessionId = self.crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
    const msgId = self.crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)

    messages.value.push({ role: 'user', blocks: [{ type: 'text', content: userMessage, status: 'done' }] })
    streaming.value = true

    ws.send(JSON.stringify({
      type: 'chat',
      sessionId: wsSessionId,
      msgId,
      userMessage,
      noteContext,
      claudeSessionId: claudeSessionId.value ?? undefined,
      noteId: currentNoteId ?? undefined,
      userToken: supabaseSession.value?.access_token,
    }))
  }

  function cancelStreaming(): void {
    if (!wsSessionId || !ws) return
    ws.send(JSON.stringify({ type: 'cancel', sessionId: wsSessionId, msgId: '' }))
    streaming.value = false
    queued.value = false
  }

  /**
   * Load chat history for a note. Tries localStorage cache first,
   * falls back to restore from backend.
   */
  function loadForNote(noteId: string, noteClaudeSessionId: string | null, noteChatVersion: number): void {
    currentNoteId = noteId
    currentChatVersion = noteChatVersion

    if (!noteClaudeSessionId) {
      claudeSessionId.value = null
      messages.value = []
      pendingRestore = null
      if (import.meta.client) {
        const notice = localStorage.getItem(`ai-notice:${noteId}`)
        if (notice) {
          localStorage.removeItem(`ai-notice:${noteId}`)
          messages.value = [{ role: 'assistant', blocks: [{ type: 'text', content: notice, status: 'done' }] }]
        }
      }
      return
    }

    claudeSessionId.value = noteClaudeSessionId

    // Try localStorage cache
    const cached = loadCache(noteClaudeSessionId)
    if (cached && cached.version >= noteChatVersion) {
      messages.value = cached.messages
      return
    }

    // Cache miss or stale — restore from backend
    _requestRestore(noteClaudeSessionId, noteId)
  }

  function _requestRestore(cSessionId: string, noteId: string): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pendingRestore = { cSessionId, noteId }
      return
    }

    wsSessionId = self.crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
    restoring.value = true
    messages.value = []

    ws.send(JSON.stringify({
      type: 'restore',
      sessionId: wsSessionId,
      claudeSessionId: cSessionId,
      noteId,
      userToken: supabaseSession.value?.access_token,
    }))
  }

  function clearHistory(): void {
    if (claudeSessionId.value) {
      removeCache(claudeSessionId.value)
    }
    claudeSessionId.value = null
    messages.value = []
    currentChatVersion = 0
    pendingRestore = null
    sessionCleared.value = true
  }

  return {
    messages,
    streaming,
    queued,
    connected,
    backendConnected,
    relayLatency,
    restoring,
    restoreFailed,
    sessionCleared,
    claudeSessionId,
    connect,
    disconnect,
    sendMessage,
    cancelStreaming,
    loadForNote,
    clearHistory,
  }
})
