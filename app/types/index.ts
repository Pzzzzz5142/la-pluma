export type NoteMode = 'quick' | 'article'

export interface Note {
  id: string
  user_id: string
  title: string
  content: Record<string, unknown>  // Tiptap JSON
  mode: NoteMode
  tags: string[]
  claude_session_id: string | null
  chat_version: number
  created_at: string
  updated_at: string
}

export type NoteInsert = Pick<Note, 'title' | 'content' | 'mode' | 'tags'>
export type NoteUpdate = Partial<NoteInsert & Pick<Note, 'claude_session_id' | 'chat_version'>>

// Database type map for the typed Supabase client
export interface Database {
  public: {
    Tables: {
      notes: {
        Row: Note
        Insert: NoteInsert & { user_id?: string }
        Update: NoteUpdate
      }
    }
  }
}
