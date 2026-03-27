<script setup lang="ts">
import { useUiStore } from '~/stores/uiStore'
import { useNotes } from '~/composables/useNotes'

definePageMeta({ middleware: 'auth' })

const ui = useUiStore()
const isMobile = useMediaQuery('(max-width: 768px)')
const { notes, loading, fetchNotes, createNote } = useNotes()
const user = useSupabaseUser()
const router = useRouter()

watch(user, (u) => { if (u) fetchNotes() }, { immediate: true })

async function handleNewNote() {
  const note = await createNote()
  if (note) router.push(`/notes/${note.id}`)
}
</script>

<template>
  <!-- Mobile: show note list -->
  <div v-if="isMobile" class="flex flex-col h-full">
    <header class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
      <span class="text-sm font-semibold tracking-tight">Notes</span>
      <UButton size="xs" variant="ghost" icon="i-lucide-plus" :loading="loading" @click="handleNewNote" />
    </header>

    <div class="flex-1 overflow-y-auto">
      <div v-if="loading && !notes.length" class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-circle" class="animate-spin text-muted" />
      </div>
      <div v-else-if="!notes.length" class="flex flex-col items-center justify-center h-full text-center px-8 py-12 gap-3">
        <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-1">
          <UIcon name="i-lucide-notebook-pen" class="text-xl text-primary/70" />
        </div>
        <div>
          <p class="text-sm font-medium">No notes yet</p>
          <p class="text-xs text-muted mt-1">Tap below to create your first note.</p>
        </div>
        <button class="text-xs text-primary underline underline-offset-2 mt-1" @click="handleNewNote">
          New note
        </button>
      </div>
      <ul v-else>
        <li v-for="note in notes" :key="note.id">
          <NuxtLink
            :to="`/notes/${note.id}`"
            class="flex flex-col px-4 py-3.5 border-b border-border active:bg-elevated transition-colors"
          >
            <span class="text-sm font-medium truncate">{{ note.title || 'Untitled' }}</span>
            <span class="text-xs text-muted mt-0.5">{{ new Date(note.updated_at).toLocaleDateString() }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>

  <!-- Desktop: empty state -->
  <div v-else class="relative flex flex-col items-center justify-center h-full text-center px-6 py-12 gap-4">
    <div v-if="!ui.sidebarOpen" class="absolute top-3 left-3">
      <UButton variant="ghost" size="sm" icon="i-lucide-panel-left-open" @click="ui.toggleSidebar()" />
    </div>
    <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-1">
      <UIcon name="i-lucide-notebook-pen" class="text-2xl text-primary/60" />
    </div>
    <div>
      <p class="font-medium">No note selected</p>
      <p class="text-sm text-muted mt-1">Pick a note from the sidebar or start a new one.</p>
    </div>
    <UButton variant="soft" size="sm" icon="i-lucide-plus" :loading="loading" @click="handleNewNote">
      New note
    </UButton>
  </div>
</template>
