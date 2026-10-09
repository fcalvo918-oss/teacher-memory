import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { categories, localDate, validDate } from './model'
import type { Category, Observation } from './model'
import { sameObservation } from './workspaceChanges'
import './ObservationEditor.css'

type Result = { ok: true } | { ok: false; message: string }
type Props = {
  original: Observation
  alias: string
  busy: boolean
  locked: boolean
  archived: boolean
  onClose: () => void
  onSave: (value: Observation) => Promise<Result>
}

export default function ObservationEditor({ original, alias, busy, locked, archived, onClose, onSave }: Props) {
  const [note, setNote] = useState(original.note)
  const [date, setDate] = useState(original.date)
  const [category, setCategory] = useState<Category>(original.category)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const value = { ...original, note: note.trim(), date, category }
  const changed = !sameObservation(value, original)
  function close() {
    if (busy) return
    if ((note !== original.note || date !== original.date || category !== original.category) && !window.confirm('Discard your unsaved changes to this observation?')) return
    onClose()
  }
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
    input.current?.focus()
  }, [])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (locked || archived || !changed) return
    if (!note.trim() || note.trim().length > 2000 || !validDate(date) || date > localDate()) {
      setError('Enter a note and a valid date that is not in the future.'); return
    }
    setError('')
    const result = await onSave(value)
    if (!result.ok) setError(result.message)
  }
  return <dialog ref={dialog} className="name-dialog observation-editor" aria-labelledby="observation-editor-title" onCancel={event => { event.preventDefault(); close() }}>
    <div className="dialog-heading"><h2 id="observation-editor-title">Edit observation</h2><button aria-label="Close observation editor" disabled={busy} onClick={close}>×</button></div>
    <p>For <strong>{alias}</strong>. Changes stay in this student’s timeline.</p>
    {archived && <p role="alert" className="dialog-error">This student or classroom is archived. Close the editor and restore it before saving changes.</p>}
    <form onSubmit={event => { void save(event) }}>
      <label>Observation<textarea ref={input} value={note} onChange={event => setNote(event.target.value)} required maxLength={2000} disabled={busy} /></label>
      <div className="form-fields"><label>Category<select value={category} onChange={event => setCategory(event.target.value as Category)} disabled={busy}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Observation date<input type="date" value={date} max={localDate()} required disabled={busy} onChange={event => setDate(event.target.value)} /></label></div>
      <p className="editor-character-count">{note.length}/2,000 characters</p>
      {error && <p role="alert" className="dialog-error">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button className="primary" disabled={locked || archived || !changed || !note.trim()}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  </dialog>
}
