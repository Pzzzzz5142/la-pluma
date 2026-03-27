<script setup lang="ts">
import { useAiStore } from '~/stores/aiStore'
import { useUiStore } from '~/stores/uiStore'

const props = defineProps<{ noteContext?: string }>()

const ai = useAiStore()
const ui = useUiStore()

const input = ref('')
const messagesEl = ref<HTMLElement | null>(null)

// Connect when panel opens, disconnect when it closes
watch(() => ui.aiPanelOpen, (open) => {
  if (open) ai.connect()
  else ai.disconnect()
}, { immediate: true })

// Note context changes are now handled by loadForNote in [id].vue

// Scroll to bottom on new messages
watch(() => ai.messages.length, async () => {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
})

function send() {
  const text = input.value.trim()
  if (!text || ai.streaming) return
  input.value = ''
  ai.sendMessage(text, props.noteContext ?? '')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-background border-l border-border">
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
      <UIcon name="i-lucide-sparkles" class="text-primary text-sm" />
      <span class="text-sm font-medium">AI</span>
      <div class="ml-auto flex items-center gap-1">
        <!-- Connection indicator -->
        <span
          :class="ai.connected ? 'bg-green-500' : 'bg-muted'"
          class="w-1.5 h-1.5 rounded-full"
          :title="ai.connected ? 'Connected' : 'Disconnected'"
        />
        <UButton
          v-if="ai.messages.length > 0 || ai.claudeSessionId"
          variant="ghost"
          size="xs"
          icon="i-lucide-rotate-ccw"
          title="新对话"
          class="text-muted hover:text-foreground"
          :disabled="ai.streaming || ai.restoring"
          @click="ai.clearHistory()"
        />
        <UButton
          variant="ghost"
          size="xs"
          icon="i-lucide-x"
          class="text-muted hover:text-foreground"
          @click="ui.toggleAiPanel()"
        />
      </div>
    </div>

    <!-- Messages -->
    <div ref="messagesEl" class="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4">
      <!-- Restoring indicator -->
      <div v-if="ai.restoring" class="flex-1 flex items-center justify-center">
        <div class="flex items-center gap-2 text-xs text-muted/60">
          <UIcon name="i-lucide-loader-circle" class="animate-spin text-xs" />
          Restoring history…
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="ai.messages.length === 0" class="flex-1 flex items-center justify-center">
        <p class="text-xs text-muted/60 text-center leading-relaxed">
          Ask anything about this note…
        </p>
      </div>

      <AiMessageRow v-for="(msg, i) in ai.messages" :key="i" :message="msg" />

      <!-- Queue waiting indicator -->
      <div v-if="ai.queued" class="text-xs text-muted italic pl-0.5">排队中，稍候…</div>
      <!-- Streaming cursor -->
      <div v-else-if="ai.streaming" class="text-sm text-muted animate-pulse pl-0.5">▋</div>
    </div>

    <!-- Input -->
    <div class="shrink-0 border-t border-border p-2 flex gap-2 items-end">
      <UTextarea
        v-model="input"
        placeholder="Ask something…"
        :rows="1"
        autoresize
        :disabled="!ai.connected"
        class="flex-1 text-sm resize-none"
        @keydown="onKeydown"
      />
      <UButton
        v-if="ai.streaming"
        variant="ghost"
        size="xs"
        icon="i-lucide-square"
        class="text-muted hover:text-foreground mb-0.5"
        @click="ai.cancelStreaming()"
      />
      <UButton
        v-else
        variant="ghost"
        size="xs"
        icon="i-lucide-send"
        :disabled="!input.trim() || !ai.connected"
        class="text-muted hover:text-primary mb-0.5"
        @click="send()"
      />
    </div>
  </div>
</template>
