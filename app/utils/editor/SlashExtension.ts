import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { slashMenuState } from './slashMenuState'
import { slashCommands } from './slashCommands'

export const SlashExtension = Extension.create({
  name: 'slash',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,

        items({ query }) {
          const q = query.toLowerCase()
          return q
            ? slashCommands.filter(c => c.label.toLowerCase().includes(q))
            : slashCommands
        },

        command({ editor, range, props }) {
          editor.chain().focus().deleteRange(range).run()
          props.action(editor)
        },

        render() {
          return {
            onStart(props) {
              slashMenuState.value = {
                items: props.items,
                command: props.command,
                clientRect: props.clientRect ?? null,
                selectedIndex: 0,
              }
            },

            onUpdate(props) {
              if (!slashMenuState.value) return
              slashMenuState.value = {
                ...slashMenuState.value,
                items: props.items,
                command: props.command,
                clientRect: props.clientRect ?? null,
                selectedIndex: 0,
              }
            },

            onKeyDown({ event }) {
              const state = slashMenuState.value
              if (!state) return false

              if (event.key === 'Escape') {
                slashMenuState.value = null
                return true
              }
              if (event.key === 'ArrowDown') {
                slashMenuState.value = { ...state, selectedIndex: (state.selectedIndex + 1) % state.items.length }
                return true
              }
              if (event.key === 'ArrowUp') {
                slashMenuState.value = { ...state, selectedIndex: (state.selectedIndex - 1 + state.items.length) % state.items.length }
                return true
              }
              if (event.key === 'Enter') {
                const item = state.items[state.selectedIndex]
                if (item) state.command(item)
                slashMenuState.value = null
                return true
              }
              return false
            },

            onExit() {
              slashMenuState.value = null
            },
          }
        },
      }),
    ]
  },
})
