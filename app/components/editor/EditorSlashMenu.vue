<script setup lang="ts">
import { slashMenuState } from '~/utils/editor/slashMenuState'

const position = computed(() => {
  const rect = slashMenuState.value?.clientRect?.()
  if (!rect) return null
  return {
    top: `${rect.bottom + window.scrollY + 4}px`,
    left: `${rect.left + window.scrollX}px`,
  }
})

function selectItem(index: number) {
  const state = slashMenuState.value
  if (!state) return
  const item = state.items[index]
  if (item) state.command(item)
  slashMenuState.value = null
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-100"
      enter-from-class="opacity-0 translate-y-1"
      leave-active-class="transition-all duration-75"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="slashMenuState && slashMenuState.items.length && position"
        :style="position"
        class="fixed z-50 w-56 bg-background border border-border rounded-xl shadow-lg overflow-hidden py-1"
      >
        <button
          v-for="(item, i) in slashMenuState.items"
          :key="item.label"
          class="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
          :class="i === slashMenuState.selectedIndex ? 'bg-elevated text-foreground' : 'text-foreground/80 hover:bg-elevated'"
          @click="selectItem(i)"
          @mouseenter="slashMenuState!.selectedIndex = i"
        >
          <span class="flex items-center justify-center w-7 h-7 rounded-md bg-background border border-border shrink-0">
            <UIcon :name="item.icon" class="text-sm text-muted" />
          </span>
          <span class="flex flex-col min-w-0">
            <span class="text-sm font-medium leading-tight truncate">{{ item.label }}</span>
            <span class="text-xs text-muted leading-tight">{{ item.description }}</span>
          </span>
        </button>

        <div v-if="!slashMenuState.items.length" class="px-3 py-2 text-xs text-muted">
          No results
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
