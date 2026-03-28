import { useDebounceFn } from '@vueuse/core'
import type { Note, NoteInsert, NoteUpdate } from '~/types'
import { useNoteStore } from '~/stores/noteStore'

export function useNotes() {
  const supabase = useSupabaseClient() as ReturnType<typeof useSupabaseClient>
  const user = useSupabaseUser()
  const store = useNoteStore()
  const toast = useToast()

  async function fetchNotes() {
    if (!user.value) return
    store.loading = true
    store.error = null
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.value.id)
        .order('updated_at', { ascending: false })
      if (error) throw error
      store.setNotes((data ?? []) as Note[])
    }
    catch (e: unknown) {
      store.error = e instanceof Error ? e.message : 'Failed to load notes'
    }
    finally {
      store.loading = false
    }
  }

  async function fetchNote(id: string) {
    store.setCurrentNote(null)
    store.loading = true
    store.error = null
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      store.setCurrentNote(data as Note)
      store.upsertNote(data as Note)
    }
    catch (e: unknown) {
      store.error = e instanceof Error ? e.message : 'Failed to load note'
    }
    finally {
      store.loading = false
    }
  }

  async function createNote(payload: Partial<NoteInsert> = {}) {
    if (!user.value) return null
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.value.id,
          title: payload.title ?? '',
          content: payload.content ?? {},
          mode: payload.mode ?? 'quick',
          tags: payload.tags ?? [],
        } as never)
        .select()
        .single()
      if (error) throw error
      const note = data as Note
      store.upsertNote(note)
      return note
    }
    catch (e: unknown) {
      toast.add({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to create note', color: 'error' })
      return null
    }
  }

  async function updateNote(id: string, patch: NoteUpdate) {
    // Optimistic update
    store.patchCurrent(patch)
    store.saving = true
    try {
      const { data, error } = await supabase
        .from('notes')
        .update(patch as never)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      store.upsertNote(data as Note)
    }
    catch (e: unknown) {
      toast.add({ title: 'Save failed', description: e instanceof Error ? e.message : 'Unknown error', color: 'error' })
    }
    finally {
      store.saving = false
    }
  }

  async function deleteNote(id: string) {
    store.removeNote(id)
    try {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
    }
    catch (e: unknown) {
      toast.add({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Unknown error', color: 'error' })
      await fetchNotes() // re-sync on failure
    }
  }

  // 1s debounced auto-save — call this on every editor change
  const autoSave = useDebounceFn((id: string, patch: NoteUpdate) => {
    updateNote(id, patch)
  }, 1000)

  return {
    notes: computed(() => store.notes),
    currentNote: computed(() => store.currentNote),
    loading: computed(() => store.loading),
    saving: computed(() => store.saving),
    fetchNotes,
    fetchNote,
    createNote,
    updateNote,
    deleteNote,
    autoSave,
  }
}
