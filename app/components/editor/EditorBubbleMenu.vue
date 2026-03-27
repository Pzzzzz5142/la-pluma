<script setup lang="ts">
import { BubbleMenu } from '@tiptap/vue-3'
import type { Editor } from '@tiptap/core'

const props = defineProps<{ editor: Editor }>()

const isMobile = useMediaQuery('(max-width: 768px)')

function shouldShow() {
  if (isMobile.value) return false
  const { from, to } = props.editor.state.selection
  return from !== to && !props.editor.isActive('codeBlock')
}
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :should-show="shouldShow"
    :tippy-options="{ duration: 100, placement: 'top' }"
  >
    <div class="flex items-center gap-0.5 bg-background border border-border rounded-lg shadow-md px-1 py-0.5">
      <UButton
        variant="ghost"
        size="xs"
        :class="editor.isActive('bold') ? 'text-foreground bg-elevated' : 'text-muted'"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <span class="font-bold text-xs">B</span>
      </UButton>
      <UButton
        variant="ghost"
        size="xs"
        :class="editor.isActive('italic') ? 'text-foreground bg-elevated' : 'text-muted'"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <span class="italic text-xs">I</span>
      </UButton>
      <UButton
        variant="ghost"
        size="xs"
        :class="editor.isActive('strike') ? 'text-foreground bg-elevated' : 'text-muted'"
        @click="editor.chain().focus().toggleStrike().run()"
      >
        <span class="line-through text-xs">S</span>
      </UButton>

      <div class="w-px h-4 bg-border mx-0.5" />

      <UButton
        variant="ghost"
        size="xs"
        :class="editor.isActive('heading', { level: 1 }) ? 'text-foreground bg-elevated' : 'text-muted'"
        @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
      >
        <span class="text-xs font-semibold">H1</span>
      </UButton>
      <UButton
        variant="ghost"
        size="xs"
        :class="editor.isActive('heading', { level: 2 }) ? 'text-foreground bg-elevated' : 'text-muted'"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        <span class="text-xs font-semibold">H2</span>
      </UButton>

      <div class="w-px h-4 bg-border mx-0.5" />

      <UButton
        variant="ghost"
        size="xs"
        icon="i-lucide-code"
        :class="editor.isActive('code') ? 'text-foreground bg-elevated' : 'text-muted'"
        @click="editor.chain().focus().toggleCode().run()"
      />
      <UButton
        variant="ghost"
        size="xs"
        icon="i-lucide-quote"
        :class="editor.isActive('blockquote') ? 'text-foreground bg-elevated' : 'text-muted'"
        @click="editor.chain().focus().toggleBlockquote().run()"
      />
    </div>
  </BubbleMenu>
</template>
