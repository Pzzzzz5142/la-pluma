<script setup lang="ts">
import { useUiStore } from '~/stores/uiStore'

const ui = useUiStore()
const isMobile = useMediaQuery('(max-width: 768px)')
const noteContext = computed(() => ui.aiNoteContext)

// Close sidebar on mobile when navigating
const route = useRoute()
watch(route, () => {
  if (isMobile.value) ui.sidebarOpen = false
})
</script>

<template>
  <div class="h-screen overflow-hidden bg-background text-foreground flex flex-col">

    <!-- Desktop layout -->
    <div v-if="!isMobile" class="flex flex-1 min-h-0 overflow-hidden">
      <Transition name="sidebar">
        <LayoutAppSidebar v-if="ui.sidebarOpen" class="w-64 shrink-0 border-r border-border" />
      </Transition>
      <main class="flex-1 min-w-0 overflow-hidden flex flex-col">
        <slot />
      </main>
      <Transition name="ai-panel">
        <AiPanel v-if="ui.aiPanelOpen" class="w-80 shrink-0" :note-context="noteContext" />
      </Transition>
    </div>

    <!-- Mobile layout -->
    <div v-else class="flex flex-1 min-h-0 flex-col overflow-hidden">
      <main class="flex-1 min-h-0 overflow-auto" style="padding-bottom:64px">
        <slot />
      </main>
      <!-- Mobile AI panel: bottom sheet -->
      <Transition name="ai-sheet">
        <div
          v-if="ui.aiPanelOpen"
          style="position:fixed;bottom:0;left:0;right:0;z-index:200;height:70vh"
        >
          <AiPanel :note-context="noteContext" class="h-full" />
        </div>
      </Transition>
      <LayoutMobileNav style="position:fixed;bottom:0;left:0;right:0;z-index:100" />
    </div>
  </div>
</template>

<style scoped>
.sidebar-enter-active,
.sidebar-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.sidebar-enter-from,
.sidebar-leave-to {
  width: 0;
  opacity: 0;
}
.ai-panel-enter-active,
.ai-panel-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.ai-panel-enter-from,
.ai-panel-leave-to {
  width: 0;
  opacity: 0;
}
.ai-sheet-enter-active,
.ai-sheet-leave-active {
  transition: transform 0.25s ease, opacity 0.2s ease;
}
.ai-sheet-enter-from,
.ai-sheet-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
