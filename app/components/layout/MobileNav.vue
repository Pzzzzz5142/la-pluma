<script setup lang="ts">
import { useNotes } from '~/composables/useNotes'

const { createNote } = useNotes()
const router = useRouter()
const route = useRoute()

async function handleNewNote() {
  const note = await createNote()
  if (note) router.push(`/notes/${note.id}`)
}

const isNotes = computed(() => route.path.startsWith('/notes'))
</script>

<template>
  <nav class="bg-background border-t border-border flex items-end justify-around px-6 pt-2 pb-3 safe-area-pb">
    <!-- Notes -->
    <NuxtLink to="/notes" class="flex flex-col items-center gap-0.5 min-w-[48px]">
      <UIcon
        name="i-lucide-file-text"
        class="text-xl transition-colors"
        :class="isNotes ? 'text-primary' : 'text-muted'"
      />
      <span
        class="text-[10px] font-medium transition-colors"
        :class="isNotes ? 'text-primary' : 'text-muted'"
      >Notes</span>
    </NuxtLink>

    <!-- New note — prominent center action -->
    <button
      class="flex flex-col items-center gap-0.5 min-w-[48px]"
      @click="handleNewNote"
    >
      <span class="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-white -mt-4 shadow-md shadow-primary/30">
        <UIcon name="i-lucide-plus" class="text-lg" />
      </span>
      <span class="text-[10px] font-medium text-muted">New</span>
    </button>

    <!-- Search placeholder (routes to notes list for now) -->
    <NuxtLink to="/notes" class="flex flex-col items-center gap-0.5 min-w-[48px]">
      <UIcon name="i-lucide-search" class="text-xl text-muted" />
      <span class="text-[10px] font-medium text-muted">Search</span>
    </NuxtLink>
  </nav>
</template>
