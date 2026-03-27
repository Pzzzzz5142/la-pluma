<script setup lang="ts">
import { useUiStore } from '~/stores/uiStore'
import { useAiStore } from '~/stores/aiStore'
import { useNotes } from '~/composables/useNotes'
import { tiptapToText } from '~/utils/editor/tiptapToText'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => route.params.id as string)
const ui = useUiStore()
const ai = useAiStore()
const { currentNote, loading, saving, fetchNote, deleteNote, autoSave, updateNote } = useNotes()
const router = useRouter()
const toast = useToast()
const supabase = useSupabaseClient()

// Cross-device chat sync via Supabase Realtime
let chatSyncChannel: ReturnType<typeof supabase.channel> | null = null

// Buffer Realtime updates that arrive while streaming; apply once streaming ends
let pendingRealtimeUpdate: { noteId: string; sessionId: string | null; version: number } | null = null

watch(() => ai.streaming, (isStreaming) => {
  if (!isStreaming && pendingRealtimeUpdate) {
    const pending = pendingRealtimeUpdate
    pendingRealtimeUpdate = null
    ai.loadForNote(pending.noteId, pending.sessionId, pending.version)
  }
})

function subscribeToChatSync(noteId: string) {
  if (chatSyncChannel) {
    supabase.removeChannel(chatSyncChannel)
    chatSyncChannel = null
  }
  chatSyncChannel = supabase
    .channel(`note-chat-${noteId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notes', filter: `id=eq.${noteId}` },
      (payload) => {
        const newData = payload.new as Record<string, unknown>
        const newSessionId = newData.claude_session_id as string | null | undefined
        const newVersion = newData.chat_version as number | undefined
        if (newVersion == null) return

        // Another device cleared the session while this device had one active
        if (!newSessionId && ai.claudeSessionId) {
          localStorage.setItem(`ai-notice:${noteId}`, '*(另一端已开始新对话，历史已清空)*')
        }

        if (ai.streaming) {
          // Buffer the update; applied when streaming ends
          pendingRealtimeUpdate = { noteId, sessionId: newSessionId ?? null, version: newVersion }
          return
        }

        ai.loadForNote(noteId, newSessionId ?? null, newVersion)
      }
    )
    .subscribe()
}

watch(id, (newId) => { if (newId) subscribeToChatSync(newId) }, { immediate: true })

onUnmounted(() => {
  if (chatSyncChannel) {
    supabase.removeChannel(chatSyncChannel)
    chatSyncChannel = null
  }
})

watch(id, fetchNote, { immediate: true })

// Keep ui.aiNoteContext in sync with the current note + load AI history on first fetch
watch(currentNote, (note, oldNote) => {
  if (!note) {
    ui.aiNoteContext = ''
    return
  }
  const bodyText = tiptapToText(note.content as object | null)
  const parts = [`Title: ${note.title || 'Untitled'}`]
  if (bodyText) parts.push('', bodyText)
  ui.aiNoteContext = parts.join('\n')

  // Load AI history when note first loads (not on every content change)
  if (!oldNote || oldNote.id !== note.id) {
    ai.loadForNote(note.id, note.claude_session_id, note.chat_version)
  }
}, { immediate: true })

// Load AI history when switching notes
watch(id, () => {
  const note = currentNote.value
  ai.loadForNote(id.value, note?.claude_session_id ?? null, note?.chat_version ?? 0)
})

// Save claude_session_id back to note when it changes — use updateNote directly (not debounced)
// so the DB is updated immediately and other devices get the Realtime event promptly
watch(() => ai.claudeSessionId, (newId) => {
  if (newId && currentNote.value && currentNote.value.claude_session_id !== newId) {
    updateNote(id.value, { claude_session_id: newId })
  }
})

// Persist session expiry: clear claude_session_id in DB when restore fails
watch(() => ai.restoreFailed, (failed) => {
  if (!failed) return
  ai.restoreFailed = false
  updateNote(id.value, { claude_session_id: null, chat_version: 0 })
  toast.add({ title: '对话历史已过期', description: '已开始新对话' })
})

// Persist new session: clear claude_session_id in DB when user manually clears
watch(() => ai.sessionCleared, (cleared) => {
  if (!cleared) return
  ai.sessionCleared = false
  updateNote(id.value, { claude_session_id: null, chat_version: 0 })
})

async function handleDelete() {
  await deleteNote(id.value)
  toast.add({ title: 'Note deleted' })
  router.push('/notes')
}

function toggleMode() {
  if (!currentNote.value) return
  const next = currentNote.value.mode === 'quick' ? 'article' : 'quick'
  autoSave(id.value, { mode: next })
}
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden">
    <!-- Topbar -->
    <header
      class="group flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0"
    >
      <!-- Sidebar open button — only when sidebar is closed -->
      <UButton
        v-if="!ui.sidebarOpen"
        variant="ghost"
        size="xs"
        icon="i-lucide-panel-left-open"
        class="hidden md:flex text-muted hover:text-foreground"
        @click="ui.toggleSidebar()"
      />

      <!-- Loading shimmer -->
      <div v-if="loading" class="flex-1 flex items-center gap-2 px-2">
        <UIcon name="i-lucide-loader-circle" class="animate-spin text-muted text-xs" />
      </div>
      <div v-else class="flex-1" />

      <!-- Save indicator — whisper quiet, only visible when saving -->
      <Transition
        enter-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-300"
        leave-to-class="opacity-0"
      >
        <span v-if="saving" class="text-xs text-muted/40 flex items-center gap-1 mr-1 select-none">
          <UIcon name="i-lucide-loader-circle" class="animate-spin text-xs" />
          saving
        </span>
      </Transition>

      <!-- Action buttons — visible on hover of topbar, always visible on mobile -->
      <div class="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity duration-150 md:opacity-40 max-md:opacity-100">
        <!-- Mode toggle -->
        <UButton
          v-if="currentNote"
          variant="ghost"
          size="xs"
          :icon="currentNote.mode === 'article' ? 'i-lucide-book-open' : 'i-lucide-zap'"
          :class="currentNote.mode === 'article' ? 'text-primary' : 'text-muted hover:text-foreground'"
          :title="currentNote.mode === 'article' ? 'Switch to quick capture' : 'Switch to article mode'"
          @click="toggleMode"
        />
        <UButton
          variant="ghost"
          size="xs"
          icon="i-lucide-sparkles"
          class="text-muted hover:text-foreground"
          @click="ui.toggleAiPanel()"
        />
        <UButton
          variant="ghost"
          size="xs"
          icon="i-lucide-trash-2"
          class="text-muted hover:text-error transition-colors"
          @click="handleDelete"
        />
      </div>
    </header>

    <EditorNoteEditor
      v-if="currentNote"
      :note="currentNote"
      class="flex-1 overflow-auto"
      @update:title="autoSave(id, { title: $event })"
      @update:content="autoSave(id, { content: $event })"
    />
  </div>
</template>
