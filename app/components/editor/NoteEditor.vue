<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import { createLowlight, common } from 'lowlight'
import { SlashExtension } from '~/utils/editor/SlashExtension'
import type { Note } from '~/types'

const props = defineProps<{ note: Note }>()
const emit = defineEmits<{
  'update:title': [value: string]
  'update:content': [value: Record<string, unknown>]
}>()

const isArticle = computed(() => props.note.mode === 'article')

const lowlight = createLowlight(common)

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      // Replaced by CodeBlockLowlight
      codeBlock: false,
    }),
    Placeholder.configure({
      placeholder: isArticle.value ? 'Start writing...' : 'Capture a thought...',
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight }),
    Image,
    SlashExtension,
  ],
  content: props.note.content ?? {},
  editorProps: {
    attributes: {
      class: ['tiptap outline-none', isArticle.value ? 'tiptap-article' : ''].join(' '),
    },
  },
  onUpdate({ editor }) {
    emit('update:content', editor.getJSON() as Record<string, unknown>)
  },
})

// Swap content when switching notes
watch(() => props.note.id, () => {
  editor.value?.commands.setContent(props.note.content ?? {})
})

// Update article class when mode changes
watch(isArticle, (val) => {
  editor.value?.setOptions({
    editorProps: {
      attributes: {
        class: ['tiptap outline-none', val ? 'tiptap-article' : ''].join(' '),
      },
    },
  })
})

onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div
    class="h-full overflow-auto"
    :class="isArticle ? 'flex flex-col items-center' : ''"
  >
    <div
      class="w-full min-h-full flex flex-col"
      :class="isArticle ? 'max-w-2xl px-8 py-10' : 'px-5 py-5'"
    >
      <!-- Title -->
      <input
        :value="note.title"
        :placeholder="'Untitled'"
        class="bg-transparent outline-none font-semibold w-full placeholder:text-muted/40 mb-4"
        :class="isArticle ? 'text-3xl leading-tight' : 'text-xl leading-snug'"
        @input="emit('update:title', ($event.target as HTMLInputElement).value)"
      />

      <!-- Body -->
      <EditorContent
        v-if="editor"
        :editor="editor"
        class="flex-1 text-foreground"
        :class="isArticle ? 'text-base leading-relaxed' : 'text-sm leading-relaxed'"
      />

      <!-- Bubble menu -->
      <EditorBubbleMenu v-if="editor" :editor="editor" />

      <!-- Slash command dropdown -->
      <EditorSlashMenu />
    </div>
  </div>
</template>
