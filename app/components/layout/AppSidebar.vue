<script setup lang="ts">
import { useUiStore } from '~/stores/uiStore'
import { useNotes } from '~/composables/useNotes'

const ui = useUiStore()
const { notes, loading, fetchNotes, createNote } = useNotes()
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()

const search = ref('')

const filteredNotes = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return notes.value
  return notes.value.filter(n =>
    n.title.toLowerCase().includes(q)
    || JSON.stringify(n.content).toLowerCase().includes(q),
  )
})

watch(user, (u) => { if (u) fetchNotes() }, { immediate: true })

async function handleNewNote() {
  const note = await createNote()
  if (note) router.push(`/notes/${note.id}`)
}

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <aside class="flex flex-col h-full bg-background">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-5 pb-3">
      <span class="text-xs font-semibold tracking-widest uppercase text-muted/70 select-none">Notes</span>
      <div class="flex items-center gap-0.5">
        <UButton
          variant="ghost"
          size="xs"
          icon="i-lucide-plus"
          :loading="loading"
          class="text-muted hover:text-foreground"
          @click="handleNewNote"
        />
        <UButton
          variant="ghost"
          size="xs"
          icon="i-lucide-panel-left-close"
          class="text-muted hover:text-foreground"
          @click="ui.toggleSidebar()"
        />
      </div>
    </div>

    <!-- Search -->
    <div class="px-3 pb-3">
      <UInput
        v-model="search"
        size="sm"
        placeholder="Search notes..."
        icon="i-lucide-search"
        variant="soft"
        class="w-full"
      />
    </div>

    <!-- Note list -->
    <ul class="flex-1 overflow-y-auto py-1">
      <li v-if="loading && !notes.length" class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-circle" class="animate-spin text-muted" />
      </li>

      <li v-else-if="!filteredNotes.length" class="px-5 py-10 text-center">
        <p class="text-xs text-muted">{{ search ? 'No matching notes' : 'Nothing here yet' }}</p>
        <button
          v-if="!search"
          class="mt-2 text-xs text-primary underline underline-offset-2"
          @click="handleNewNote"
        >
          Create a note
        </button>
      </li>

      <li v-for="note in filteredNotes" :key="note.id">
        <NuxtLink
          :to="`/notes/${note.id}`"
          class="relative flex flex-col px-4 py-2.5 transition-colors hover:bg-elevated"
          :class="route.params.id === note.id ? 'bg-elevated' : ''"
        >
          <!-- Active left-border accent -->
          <span
            v-if="route.params.id === note.id"
            class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary"
          />
          <span
            class="truncate text-sm leading-snug"
            :class="route.params.id === note.id ? 'font-medium text-foreground' : 'text-foreground/80'"
          >
            {{ note.title || 'Untitled' }}
          </span>
          <span class="text-xs text-muted mt-0.5">
            {{ relativeDate(note.updated_at) }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </aside>
</template>
