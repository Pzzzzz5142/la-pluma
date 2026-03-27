<script setup lang="ts">
import type { AiMessage } from '~/types/aiPanel'

defineProps<{ message: AiMessage }>()
</script>

<template>
  <!-- User message -->
  <div v-if="message.role === 'user'" class="flex justify-end">
    <div class="max-w-[85%] bg-primary/10 text-foreground rounded-xl rounded-tr-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
      {{ message.blocks[0]?.type === 'text' ? message.blocks[0].content : '' }}
    </div>
  </div>

  <!-- Assistant message -->
  <div v-else class="flex flex-col gap-1.5">
    <div v-for="(block, i) in message.blocks" :key="i">
      <AiThinkingBlock v-if="block.type === 'thinking'" :block="block" />
      <AiToolUseBlock v-else-if="block.type === 'tool_use'" :block="block" />
      <AiTextBlock v-else-if="block.type === 'text'" :block="block" />
    </div>
  </div>
</template>
