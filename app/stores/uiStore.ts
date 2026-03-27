import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(true)
  const aiPanelOpen = ref(false)
  const activeModule = ref<'notes' | 'agents' | 'stocks'>('notes')
  const aiNoteContext = ref('')

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function toggleAiPanel() {
    aiPanelOpen.value = !aiPanelOpen.value
  }

  function setModule(mod: typeof activeModule.value) {
    activeModule.value = mod
  }

  return {
    sidebarOpen,
    aiPanelOpen,
    activeModule,
    aiNoteContext,
    toggleSidebar,
    toggleAiPanel,
    setModule,
  }
})
