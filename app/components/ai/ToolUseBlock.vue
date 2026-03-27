<script setup lang="ts">
import type { ToolUseUiBlock } from '~/types/aiPanel'
defineProps<{ block: ToolUseUiBlock }>()
</script>

<template>
  <div v-show="block.visible" class="flex items-center gap-2 text-xs text-muted px-2.5 py-1.5 border border-border rounded-md">
    <UIcon name="i-lucide-wrench" class="shrink-0" />
    <span class="font-mono">{{ block.name }}</span>
    <span class="ml-auto">
      <UIcon v-if="block.status === 'running'" name="i-lucide-loader-circle" class="animate-spin" />
      <UIcon v-else-if="block.status === 'success'" name="i-lucide-check" class="text-green-500" />
      <UIcon v-else name="i-lucide-x" class="text-red-500" />
    </span>
  </div>
</template>
