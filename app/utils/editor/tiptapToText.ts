interface TiptapNode {
  type?: string
  text?: string
  content?: TiptapNode[]
}

export function tiptapToText(doc: TiptapNode | null | undefined): string {
  if (!doc) return ''
  const parts: string[] = []
  collectText(doc, parts)
  return parts.join('').trim()
}

function collectText(node: TiptapNode, parts: string[]): void {
  if (node.text) {
    parts.push(node.text)
    return
  }
  if (!node.content?.length) return

  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i]
    collectText(child, parts)
    // Add newline after block-level nodes (paragraphs, headings, list items)
    if (isBlock(child) && i < node.content.length - 1) {
      parts.push('\n')
    }
  }
}

function isBlock(node: TiptapNode): boolean {
  return ['paragraph', 'heading', 'listItem', 'bulletList', 'orderedList',
    'blockquote', 'codeBlock', 'horizontalRule'].includes(node.type ?? '')
}
