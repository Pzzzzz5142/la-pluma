export type BlockStatus = 'streaming' | 'done' | 'error'

export interface ThinkingUiBlock {
  type: 'thinking'
  content: string
  status: BlockStatus
}

export interface ToolUseUiBlock {
  type: 'tool_use'
  id: string
  name: string
  input: string // JSON string
  result?: string
  isError?: boolean
  status: 'running' | 'success' | 'error'
}

export interface TextUiBlock {
  type: 'text'
  content: string
  status: BlockStatus
}

export type AiUiBlock = ThinkingUiBlock | ToolUseUiBlock | TextUiBlock

export interface AiMessage {
  role: 'user' | 'assistant'
  blocks: AiUiBlock[]
}
