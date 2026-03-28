import { WebSocketServer, WebSocket } from 'ws'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

// --- Config ---
const PORT = Number(process.env.RELAY_PORT ?? 3001)
const RELAY_SECRET = process.env.RELAY_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? ''

if (!RELAY_SECRET) throw new Error('RELAY_SECRET is required')
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars are required')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})

// --- State ---
let agentConn: WebSocket | null = null
const clientConns = new Map<string, WebSocket>()
const browserConns = new Set<WebSocket>()

// --- Per-session request queue ---
interface QueuedRequest {
  msg: JsonMsg
  wsSessionId: string
  browserWs: WebSocket
  userToken: string | null
  userId: string | null
}

// claudeSessionId → pending requests
const noteQueues = new Map<string, QueuedRequest[]>()
// claudeSessionIds currently being processed by the agent
const activeClaudeSessions = new Set<string>()
// wsSessionId → claudeSessionId (active requests only, for cleanup on done)
const wsToClaudeSession = new Map<string, string>()

function dispatchQueued(req: QueuedRequest, claudeId: string): void {
  activeClaudeSessions.add(claudeId)
  wsToClaudeSession.set(req.wsSessionId, claudeId)
  clientConns.set(req.wsSessionId, req.browserWs)
  // Prefer fresh userToken from the message itself (avoids stale auth-time token expiry)
  const effectiveToken = (req.msg.userToken as string | undefined) || req.userToken
  send(agentConn!, { ...req.msg, userToken: effectiveToken, userId: req.userId })
  log(`[queue] dispatch  session=${req.wsSessionId.slice(0, 8)}  claude=${claudeId.slice(0, 8)}`)
}

function enqueueOrDispatch(req: QueuedRequest, claudeId: string): void {
  if (!activeClaudeSessions.has(claudeId)) {
    dispatchQueued(req, claudeId)
  } else {
    const q = noteQueues.get(claudeId) ?? []
    q.push(req)
    noteQueues.set(claudeId, q)
    log(`[queue] enqueued  session=${req.wsSessionId.slice(0, 8)}  claude=${claudeId.slice(0, 8)}  depth=${q.length}`)
    send(req.browserWs, { type: 'queued', sessionId: req.wsSessionId, position: q.length })
  }
}

function onRequestComplete(wsSessionId: string): void {
  const claudeId = wsToClaudeSession.get(wsSessionId)
  wsToClaudeSession.delete(wsSessionId)
  if (!claudeId) return

  activeClaudeSessions.delete(claudeId)

  const q = noteQueues.get(claudeId)
  if (!q || q.length === 0) return

  const next = q.shift()!
  if (q.length === 0) noteQueues.delete(claudeId)

  log(`[queue] dequeue  session=${next.wsSessionId.slice(0, 8)}  claude=${claudeId.slice(0, 8)}  remaining=${q.length}`)

  if (!agentConn) {
    send(next.browserWs, { type: 'agent_offline' })
    return
  }
  dispatchQueued(next, claudeId)
}

function removeFromQueue(browserWs: WebSocket): void {
  for (const [claudeId, q] of noteQueues) {
    const filtered = q.filter(r => r.browserWs !== browserWs)
    if (filtered.length !== q.length) {
      log(`[queue] removed disconnected browser's requests  claude=${claudeId.slice(0, 8)}  removed=${q.length - filtered.length}`)
      if (filtered.length === 0) noteQueues.delete(claudeId)
      else noteQueues.set(claudeId, filtered)
    }
  }
}

type JsonMsg = Record<string, unknown>

function ts() {
  return new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
}

function log(msg: string) {
  console.log(`[${ts()}] ${msg}`)
}

function send(ws: WebSocket, msg: JsonMsg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

// --- JWT verification ---
async function verifyToken(token: string): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

// --- WS Server ---
const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  let authenticated = false
  let role: 'browser' | 'agent' | null = null
  let sessionId: string | null = null
  let userId: string | null = null
  let userToken: string | null = null

  ws.on('message', async (raw) => {
    let msg: JsonMsg
    try {
      msg = JSON.parse(raw.toString()) as JsonMsg
    } catch {
      ws.close(1008, 'Invalid JSON')
      return
    }

    // ---- Phase 1: auth handshake ----
    if (!authenticated) {
      if (msg.type === 'agent_auth') {
        if (msg.secret !== RELAY_SECRET) {
          send(ws, { type: 'auth_error', error: 'Invalid secret' })
          ws.close(1008, 'Unauthorized')
          log('[agent] Auth failed: wrong secret')
          return
        }
        role = 'agent'
        authenticated = true
        agentConn = ws
        send(ws, { type: 'agent_auth_ok' })
        log('[agent] Connected and authenticated')
        for (const browserWs of browserConns) {
          send(browserWs, { type: 'agent_online' })
        }
        return
      }

      if (msg.type === 'auth') {
        const token = msg.token as string
        if (!token) {
          send(ws, { type: 'auth_error', error: 'Missing token' })
          ws.close(1008, 'Unauthorized')
          return
        }
        const uid = await verifyToken(token)
        if (!uid) {
          send(ws, { type: 'auth_error', error: 'Invalid token' })
          ws.close(1008, 'Unauthorized')
          log('[browser] Auth failed: invalid token')
          return
        }
        role = 'browser'
        authenticated = true
        userId = uid
        userToken = token
        browserConns.add(ws)
        send(ws, { type: 'auth_ok', userId: uid, agentOnline: !!agentConn })
        log(`[browser] Connected  user=${uid}`)
        return
      }

      ws.close(1008, 'Unauthorized')
      return
    }

    // ---- Phase 2: routing ----
    if (role === 'browser') {
      const msgType = msg.type as string
      const sid = msg.sessionId as string

      if (msgType === 'ping') {
        send(ws, { type: 'pong', timestamp: msg.timestamp })
        return
      }

      if (msgType === 'chat') {
        if (!sid) return
        sessionId = sid

        const preview = String(msg.userMessage ?? '').slice(0, 80).replace(/\n/g, ' ')
        const hasCtx = String(msg.noteContext ?? '').length > 0
        const claudeId = msg.claudeSessionId as string | undefined

        if (!agentConn) {
          log(`[browser→relay] chat  user=${userId}  msg="${preview}"  → agent OFFLINE`)
          send(ws, { type: 'agent_offline' })
          return
        }

        log(`[browser→agent] chat  user=${userId}  session=${sid.slice(0, 8)}  context=${hasCtx}  msg="${preview}"`)

        if (claudeId) {
          enqueueOrDispatch({ msg, wsSessionId: sid, browserWs: ws, userToken, userId }, claudeId)
        } else {
          // No claudeSessionId yet (first ever message) — dispatch directly
          clientConns.set(sid, ws)
          const effectiveToken = (msg.userToken as string | undefined) || userToken
          send(agentConn, { ...msg, userToken: effectiveToken, userId })
        }
        return
      }

      if (msgType === 'restore') {
        if (!sid) return
        sessionId = sid
        const claudeId = msg.claudeSessionId as string | undefined

        if (!agentConn) {
          send(ws, { type: 'agent_offline' })
          return
        }

        log(`[browser→agent] restore  session=${sid.slice(0, 8)}  claude=${String(claudeId ?? '').slice(0, 8)}`)

        if (claudeId) {
          enqueueOrDispatch({ msg, wsSessionId: sid, browserWs: ws, userToken, userId }, claudeId)
        } else {
          clientConns.set(sid, ws)
          const effectiveToken = (msg.userToken as string | undefined) || userToken
          send(agentConn, { ...msg, userToken: effectiveToken })
        }
        return
      }

      if (msgType === 'cancel') {
        log(`[browser→agent] cancel  session=${sid?.slice(0, 8)}`)
        if (agentConn) send(agentConn, msg)
        // Also remove any queued request with this sessionId
        for (const [claudeId, q] of noteQueues) {
          const idx = q.findIndex(r => r.wsSessionId === sid)
          if (idx !== -1) {
            q.splice(idx, 1)
            if (q.length === 0) noteQueues.delete(claudeId)
            log(`[queue] cancelled queued  session=${sid?.slice(0, 8)}`)
            break
          }
        }
        return
      }
    }

    if (role === 'agent') {
      const sid = msg.sessionId as string
      if (!sid) return

      const browserWs = clientConns.get(sid)

      if (msg.type === 'block') {
        const block = msg.block as Record<string, unknown> | undefined
        const blockType = block?.type ?? '?'
        const detail =
          blockType === 'text'
            ? `"${String(block?.text ?? '').slice(0, 60).replace(/\n/g, ' ')}"`
            : blockType === 'thinking'
            ? `(${String(block?.thinking ?? '').length} chars)`
            : blockType === 'tool_use'
            ? `tool=${block?.name}`
            : blockType === 'tool_result'
            ? `tool_use_id=${String(block?.tool_use_id ?? '').slice(0, 8)}`
            : ''
        log(`[agent→browser] block  session=${sid.slice(0, 8)}  type=${blockType}  ${detail}`)
      } else if (msg.type === 'done') {
        log(`[agent→browser] done   session=${sid.slice(0, 8)}  stop_reason=${msg.stopReason}`)
      } else if (msg.type === 'error') {
        log(`[agent→browser] error  session=${sid.slice(0, 8)}  error=${msg.error}`)
      } else if (msg.type === 'session_id') {
        log(`[agent→browser] session_id  session=${sid.slice(0, 8)}  claude=${String(msg.claudeSessionId ?? '').slice(0, 8)}`)
      } else if (msg.type === 'restore_user_msg') {
        log(`[agent→browser] restore_user_msg  session=${sid.slice(0, 8)}`)
      } else if (msg.type === 'restore_done') {
        log(`[agent→browser] restore_done  session=${sid.slice(0, 8)}  version=${msg.chatVersion}`)
      } else if (msg.type === 'restore_error') {
        log(`[agent→browser] restore_error  session=${sid.slice(0, 8)}  error=${msg.error}`)
      }

      // Strip userToken before forwarding to browser
      const { userToken: _stripped, ...forwardMsg } = msg as JsonMsg & { userToken?: string }

      if (browserWs) {
        send(browserWs, forwardMsg)
      } else {
        log(`[agent→relay] no browser for session=${sid.slice(0, 8)}, dropping`)
      }
      if (msg.type === 'done' || msg.type === 'error' || msg.type === 'restore_done' || msg.type === 'restore_error') {
        clientConns.delete(sid)
        onRequestComplete(sid)
      }
    }
  })

  ws.on('close', (code, reason) => {
    if (role === 'agent' && agentConn === ws) {
      agentConn = null
      log(`[agent] Disconnected  code=${code}`)
      for (const [sid, browserWs] of clientConns) {
        send(browserWs, { type: 'agent_offline' })
        clientConns.delete(sid)
      }
    }
    if (role === 'browser') {
      log(`[browser] Disconnected  user=${userId}  code=${code}`)
      if (sessionId) clientConns.delete(sessionId)
      browserConns.delete(ws)
      removeFromQueue(ws)
    }
  })

  ws.on('error', (err) => {
    console.error(`[${ts()}] [ws] error:`, err.message)
  })
})

log(`Listening on ws://0.0.0.0:${PORT}`)
