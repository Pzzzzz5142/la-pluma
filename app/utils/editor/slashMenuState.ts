import { ref } from 'vue'
import type { SlashCommand } from './slashCommands'

export interface SlashMenuState {
  items: SlashCommand[]
  command: (item: SlashCommand) => void
  clientRect: (() => DOMRect | null) | null
  selectedIndex: number
}

// Module-level singleton — bridge between the Tiptap Extension and the Vue component
export const slashMenuState = ref<SlashMenuState | null>(null)
