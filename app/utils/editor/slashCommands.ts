import type { Editor } from '@tiptap/core'

export interface SlashCommand {
  label: string
  description: string
  icon: string
  action: (editor: Editor) => void
}

export const slashCommands: SlashCommand[] = [
  {
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'i-lucide-heading-1',
    action: e => e.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'i-lucide-heading-2',
    action: e => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'i-lucide-heading-3',
    action: e => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    label: 'Bullet list',
    description: 'Unordered list of items',
    icon: 'i-lucide-list',
    action: e => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Numbered list',
    description: 'Ordered list of items',
    icon: 'i-lucide-list-ordered',
    action: e => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: 'Task list',
    description: 'Checklist with checkboxes',
    icon: 'i-lucide-check-square',
    action: e => e.chain().focus().toggleTaskList().run(),
  },
  {
    label: 'Code block',
    description: 'Block of code with syntax highlighting',
    icon: 'i-lucide-code',
    action: e => e.chain().focus().setCodeBlock().run(),
  },
  {
    label: 'Quote',
    description: 'Blockquote for citations',
    icon: 'i-lucide-quote',
    action: e => e.chain().focus().setBlockquote().run(),
  },
]
