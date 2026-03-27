import { defineStore } from 'pinia'
import type { Note, NoteInsert, NoteUpdate } from '~/types'

export const useNoteStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const currentNote = ref<Note | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  function setNotes(list: Note[]) {
    notes.value = list
  }

  function setCurrentNote(note: Note | null) {
    currentNote.value = note
  }

  function upsertNote(note: Note) {
    const idx = notes.value.findIndex(n => n.id === note.id)
    if (idx >= 0) {
      notes.value[idx] = note
    }
    else {
      notes.value.unshift(note)
    }
    if (currentNote.value?.id === note.id) {
      currentNote.value = note
    }
  }

  function removeNote(id: string) {
    notes.value = notes.value.filter(n => n.id !== id)
    if (currentNote.value?.id === id) {
      currentNote.value = null
    }
  }

  // Optimistic title/content update (before server confirms)
  function patchCurrent(patch: NoteUpdate) {
    if (!currentNote.value) return
    currentNote.value = { ...currentNote.value, ...patch }
    const idx = notes.value.findIndex(n => n.id === currentNote.value!.id)
    if (idx >= 0) {
      notes.value[idx] = { ...notes.value[idx], ...patch }
    }
  }

  return {
    notes,
    currentNote,
    loading,
    saving,
    error,
    setNotes,
    setCurrentNote,
    upsertNote,
    removeNote,
    patchCurrent,
  }
})
