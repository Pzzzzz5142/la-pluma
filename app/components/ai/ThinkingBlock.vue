<script setup lang="ts">
import type { ThinkingUiBlock } from '~/types/aiPanel'

defineProps<{ block: ThinkingUiBlock }>()
const open = ref(false)
</script>

<template>
  <div v-show="block.visible" class="text-xs text-muted border border-border rounded-md overflow-hidden">
    <button
      class="flex items-center gap-1.5 w-full px-2.5 py-1.5 hover:bg-muted/30 transition-colors text-left"
      @click="open = !open"
    >
      <UIcon name="i-lucide-brain" class="shrink-0 text-xs" />
      <span class="font-medium">Thinking</span>
      <UIcon
        :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="ml-auto text-xs opacity-50"
      />
    </button>
    <div v-show="open" class="px-2.5 pb-2.5 pt-1 font-mono italic opacity-70 whitespace-pre-wrap leading-relaxed border-t border-border">
      {{ block.content }}
    </div>
  </div>
</template>
