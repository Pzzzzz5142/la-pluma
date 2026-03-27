<script setup lang="ts">
import type { TextUiBlock } from '~/types/aiPanel'
defineProps<{ block: TextUiBlock }>()
</script>

<template>
  <div class="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{{ block.content }}</div>
</template>
