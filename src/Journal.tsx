import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { activeStudents, categories, colors, daysAgo, localDate, makeId, needsCheckIn, validDate } from './model'
import type { Category, Classroom, Observation, Student } from './model'
import type { Change } from './workspaceChanges'
import { useWorkspace } from './useWorkspace'
import './App.css'
import './Classrooms.css'
import ObservationEditor from './ObservationEditor'
import StudentTimeline from './StudentTimeline'

type Theme = 'system' | 'light' | 'dark'
type Props = { userId?: string; accountEmail?: string; onExit: () => void; signingOut?: boolean }
type Edit = { kind: 'classroom-new' } | { kind: 'classroom-rename'; classroom: Classroom } |
  { kind: 'student-new'; classroomId: string } | { kind: 'student-rename'; student: Student }
type Result = { ok: true } | { ok: false; message: string }
function initialTheme(): Theme {
  try { const v = localStorage.getItem('teacher-memory.theme'); return v === 'light' || v === 'dark' ? v : 'system' } catch { return 'system' }
}
function displayDate(date: string) { return new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
function avatarLabel(alias: string) { return alias.length <= 5 ? alias : alias.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() }

function NameDialog({ edit, busy, onClose, onSave }: { edit: Edit; busy: boolean; onClose: () => void; onSave: (name: string, id: string) => Promise<Result> }) {
  const [name, setName] = useState(edit.kind === 'classroom-rename' ? edit.classroom.name : edit.kind === 'student-rename' ? edit.student.alias : '')
  const [error, setError] = useState('')
  const [id] = useState(makeId)
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const isClass = edit.kind.startsWith('classroom')
  const title = edit.kind === 'classroom-new' ? 'Create a classroom' : edit.kind === 'classroom-rename' ? 'Rename classroom' : edit.kind === 'student-new' ? 'Add a student alias' : 'Rename student alias'
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); input.current?.focus() }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!name.trim()) { setError('Enter a name before saving.'); return }
    setError('')
    const result = await onSave(name.trim(), id)
    if (!result.ok) setError(result.message)
  }
  return <dialog ref={dialog} className="name-dialog" aria-labelledby="dialog-title" onCancel={event => { if (busy) event.preventDefault(); else onClose() }}>
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button></div>
    <p>{isClass ? 'Give this group a name you will recognize.' : 'Use fictional initials or an alias, such as K.P. or Learner 7.'}</p>
    <form onSubmit={event => { void submit(event) }}><label>{isClass ? 'Classroom name' : 'Student alias'}<input ref={input} value={name} onChange={event => setName(event.target.value)} maxLength={isClass ? 80 : 32} required disabled={busy} placeholder={isClass ? 'e.g. Morning group' : 'e.g. K.P.'} /></label>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button></div>
    </form>
  </dialog>
}

export default function Journal({ userId, accountEmail, onExit, signingOut = false }: Props) {
  const { workspace, error, loading, busy, ready, lastSync, reload, run } = useWorkspace(userId)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [classId, setClassId] = useState('starter')
  const [selected, setSelected] = useState('am')
  const [search, setSearch] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [category, setCategory] = useState<Category>('Learning')
  const [date, setDate] = useState(localDate)
  const [today, setToday] = useState(localDate)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [editingNote, setEditingNote] = useState<Observation | null>(null)
  const draftId = useRef<string | null>(null)
  const noteInput = useRef<HTMLTextAreaElement>(null)
  const classroom = workspace.classrooms.find(c => c.id === classId) ?? workspace.classrooms[0]
  const students = workspace.students.filter(s => s.classroomId === classroom?.id).sort((a, b) => a.alias.localeCompare(b.alias))
  const active = activeStudents(workspace, classroom?.id ?? '')
  const activeIds = new Set(active.map(s => s.id))
  const student = students.find(s => s.id === selected)
  const locked = busy || loading || !ready
  const readOnly = !student || student.archived || Boolean(classroom?.archived)
  const due = (id: string) => needsCheckIn(workspace.notes, id, today)
  const dueCount = active.filter(s => due(s.id)).length
  const recentCount = workspace.notes.filter(n => activeIds.has(n.studentId) && daysAgo(n.date, today) >= 0 && daysAgo(n.date, today) < 7).length
  const visible = students.filter(s => (showArchived || !s.archived) && s.alias.toLowerCase().includes(search.toLowerCase()) && (!onlyDue || (!s.archived && !classroom?.archived && due(s.id))))
  const timeline = workspace.notes.filter(n => n.studentId === student?.id).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme }
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [theme])
  useEffect(() => { const timer = window.setInterval(() => setToday(localDate()), 60000); return () => window.clearInterval(timer) }, [])
  function changeTheme(next: Theme) {
    setTheme(next)
    try { localStorage.setItem('teacher-memory.theme', next) } catch { setMessage('Theme changed for this visit; the preference could not be saved.') }
  }
  function clearDraft() { setDraft(''); draftId.current = null; setPendingDelete(null); setMessage('') }
  function canLeaveDraft() { return !draft.trim() || window.confirm('Discard your unsaved observation before switching?') }
  function chooseClass(id: string) {
    if (locked || id === classroom?.id || !canLeaveDraft()) return
    clearDraft(); setClassId(id); setSearch(''); setOnlyDue(false)
    const roster = workspace.students.filter(s => s.classroomId === id && !s.archived).sort((a, b) => a.alias.localeCompare(b.alias))
    setSelected(roster[0]?.id ?? '')
  }
  function chooseStudent(id: string) { if (!locked && id !== selected && canLeaveDraft()) { clearDraft(); setSelected(id) } }
  function openEdit(value: Edit) {
    if (locked) return
    if ((value.kind === 'classroom-new' || value.kind === 'student-new') && !canLeaveDraft()) return
    if (value.kind === 'classroom-new' || value.kind === 'student-new') clearDraft()
    setEdit(value)
  }
  async function saveName(name: string, id: string): Promise<Result> {
    if (!edit) return { ok: false, message: 'Open the form again.' }
    let change: Change
    switch (edit.kind) {
      case 'classroom-new': change = { kind: 'classroom-add', value: { id, name, archived: false } }; break
      case 'classroom-rename': change = { kind: 'classroom-update', id: edit.classroom.id, patch: { name } }; break
      case 'student-new': change = { kind: 'student-add', value: { id, classroomId: edit.classroomId, alias: name, color: colors[students.length % colors.length], archived: false } }; break
      case 'student-rename': change = { kind: 'student-update', id: edit.student.id, patch: { alias: name } }; break
    }
    const result = await run(change)
    if (result.ok) {
      if (edit.kind === 'classroom-new') { setClassId(id); setSelected(''); setSearch(''); setOnlyDue(false) }
      if (edit.kind === 'student-new') { setSelected(id); setSearch(''); setOnlyDue(false) }
      setMessage('Saved.'); setEdit(null)
    }
    return result
  }
  async function archiveClass() {
    if (!classroom || locked) return
    const action = classroom.archived ? 'Restore' : 'Archive'
    if (!window.confirm(`${action} ${classroom.name}? Observations are kept. ${draft.trim() ? 'Your unsaved observation will be discarded.' : ''}`)) return
    const result = await run({ kind: 'classroom-update', id: classroom.id, patch: { archived: !classroom.archived } })
    if (result.ok) { clearDraft(); setShowArchived(true); setOnlyDue(false); setMessage(`${classroom.name} ${classroom.archived ? 'restored' : 'archived'}.`) }
    else setMessage(result.message)
  }
  async function archiveStudent() {
    if (!student || locked) return
    const action = student.archived ? 'Restore' : 'Archive'
    if (!window.confirm(`${action} ${student.alias}? Their timeline is kept. ${draft.trim() ? 'Your unsaved observation will be discarded.' : ''}`)) return
    const result = await run({ kind: 'student-update', id: student.id, patch: { archived: !student.archived } })
    if (result.ok) { clearDraft(); setShowArchived(true); setOnlyDue(false); setMessage(`${student.alias} ${student.archived ? 'restored' : 'archived'}.`) }
    else setMessage(result.message)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (locked || readOnly || !student) return
    if (!draft.trim() || !validDate(date) || date > localDate()) { setMessage('Enter a note and a valid observation date that is not in the future.'); return }
    draftId.current ??= makeId()
    const result = await run({ kind: 'note-add', value: { id: draftId.current, studentId: student.id, date, category, note: draft.trim() } })
    if (result.ok) { clearDraft(); setMessage(`Observation saved for ${student.alias}${userId ? ' to your account' : ' in this browser'}.`) }
    else setMessage(result.message)
  }
  async function updateObservation(value: Observation): Promise<Result> {
    if (!editingNote) return { ok: false, message: 'Open the observation again.' }
    const result = await run({ kind: 'note-update', before: editingNote, value })
    if (result.ok) { setEditingNote(null); setMessage('Observation updated.') }
    return result
  }
  function exit() { if (!busy && canLeaveDraft()) onExit() }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#main"><span className="brand-icon" aria-hidden="true">tm<span>✦</span></span><span>Teacher Memory<small>BY FERCHOCOL SOFTWARE</small></span></a>
      <div className="workspace-label">YOUR WORKSPACE</div><div className="nav-active"><span aria-hidden="true">▦</span> Classroom journal</div>
      <div className="sidebar-note"><span className="small-spark">✧</span><h3>Small moments.<br />A fuller picture.</h3><p>A little observation today helps you see every learner tomorrow.</p></div>
      <div className="sidebar-bottom"><span className="demo-dot" />{userId ? 'Your cloud workspace' : 'Browser demo'}<small>{workspace.classrooms.filter(c => !c.archived).length} active classrooms · Fictional aliases</small></div>
    </aside>
    <main id="main"><header className="topbar"><span>Classroom <span className="slash">/</span> <strong>Overview</strong></span><div className="account-tools">{userId && <span className="account-email" title={accountEmail}>{accountEmail}</span>}<button disabled={busy || signingOut} onClick={exit}>{userId ? (signingOut ? 'Signing out…' : 'Sign out') : 'Accounts'}</button></div><label className="theme-label">Appearance<select value={theme} onChange={event => changeTheme(event.target.value as Theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">A LITTLE ATTENTION GOES A LONG WAY</div><h1>Every student, seen.</h1><p>Capture the moments that help you understand your classroom.</p></div><button className="primary" disabled={locked || readOnly} onClick={() => noteInput.current?.focus()}>＋ Add observation</button></div>
        <div className="demo-banner"><span aria-hidden="true">◈</span><span><strong>A space to try things out.</strong> Use fictional student aliases and observations. {userId ? 'Your classrooms and notes are saved to your signed-in account.' : 'This demo stays in your browser. Sign in to use account syncing.'}</span></div>
        {userId && <div className="cloud-status"><span role="status"><span className="sync-dot" />{loading ? 'Refreshing your workspace…' : lastSync ? `Last synced at ${lastSync.toLocaleTimeString()}. Refreshes every 30 seconds while visible.` : 'Waiting for the first successful sync.'}</span><button disabled={loading || busy} onClick={() => { void reload() }}>Refresh notes</button></div>}
        {error && <div className="error" role="alert">{error}</div>}
        <section className="classroom-toolbar panel" aria-label="Classroom management">
          <label>Classroom<select value={classroom?.id ?? ''} disabled={locked} onChange={event => chooseClass(event.target.value)}>{!classroom && <option value="">Create your first classroom</option>}{workspace.classrooms.filter(c => !c.archived || showArchived || c.id === classroom?.id).sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' · Archived' : ''}</option>)}</select></label>
          <div className="classroom-actions"><button disabled={locked} onClick={() => openEdit({ kind: 'classroom-new' })}>＋ New classroom</button><button disabled={locked || !classroom} onClick={() => classroom && openEdit({ kind: 'classroom-rename', classroom })}>Rename classroom</button><button disabled={locked || !classroom} onClick={() => { void archiveClass() }}>{classroom?.archived ? 'Restore classroom' : 'Archive classroom'}</button></div>
          <label className="archived-control"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Show archived</label>
        </section>
        <p className="workspace-message" role="status">{message}</p>
        {classroom?.archived && <div className="archive-notice">This classroom is archived. Its timelines are kept. Restore the classroom to add students or observations.</div>}
        <section className="stats" aria-label="Classroom overview"><div><span>Active students in this classroom</span><strong>{String(active.length).padStart(2, '0')}<small>fictional aliases</small></strong></div><div><span>Observations in the last 7 days</span><strong>{String(recentCount).padStart(2, '0')}<small>for active students</small></strong></div><div><span>Ready for a check-in</span><strong>{String(dueCount).padStart(2, '0')}<small>{dueCount ? 'students to reconnect with' : 'everyone covered'}</small></strong></div></section>
        <div className="journal-grid"><section className="panel roster"><div className="panel-heading"><h2>Your students <span className="count">{active.length}</span></h2><p>{classroom?.name ?? 'Choose or create a classroom.'}</p></div>
          <div className="roster-controls"><button className="add-student" disabled={locked || !classroom || classroom.archived} onClick={() => classroom && openEdit({ kind: 'student-new', classroomId: classroom.id })}>＋ Add student alias</button><label className="sr-only" htmlFor="search">Search student aliases</label><input id="search" placeholder="Search aliases…" value={search} onChange={event => setSearch(event.target.value)} /><button className={onlyDue ? 'filter active' : 'filter'} aria-pressed={onlyDue} onClick={() => setOnlyDue(!onlyDue)}>◷ Needs a check-in <span>{dueCount}</span></button></div>
          <div className="student-list">{visible.map(s => {
            const last = workspace.notes.filter(n => n.studentId === s.id && n.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0]
            return <button key={s.id} className={`student-row ${student?.id === s.id ? 'selected' : ''}`} aria-pressed={student?.id === s.id} disabled={locked} onClick={() => chooseStudent(s.id)}><span className={`avatar ${s.color}`} aria-hidden="true">{avatarLabel(s.alias)}</span><span className="student-info"><strong>{s.alias}</strong><small>{s.archived ? 'Archived · History kept' : last ? `Last note ${daysAgo(last.date, today) === 0 ? 'today' : `${daysAgo(last.date, today)}d ago`}` : 'No observations yet'}</small></span>{s.archived || classroom?.archived ? <span className="archived-mark" aria-label="Archived">◷</span> : due(s.id) ? <span className="due-dot" title="Needs a check-in"><span className="sr-only">Needs a check-in</span></span> : <span className="row-check" aria-label="Recently observed">✓</span>}</button>
          })}{visible.length === 0 && <p className="empty">{loading ? 'Loading students…' : students.length === 0 ? 'Add your first fictional student alias to get started.' : 'No students match. Try clearing the filters or showing archived students.'}</p>}</div><div className="coverage-help">Check-in reminders appear after 7 days without a note. Archived students and classrooms are excluded.</div>
        </section>
        <div className="student-detail">{student ? <>
          <section className="panel composer"><div className="detail-heading"><span className={`avatar large ${student.color}`} aria-hidden="true">{avatarLabel(student.alias)}</span><div><h2>{student.alias}<span className="alias-tag">{readOnly ? 'Archived' : 'Fictional alias'}</span></h2><p>{readOnly ? 'Their history is kept. Restore to add observations.' : due(student.id) ? 'A good time for a fresh observation.' : 'Keep building the picture, one moment at a time.'}</p></div></div>
            <div className="student-actions"><button disabled={locked} onClick={() => openEdit({ kind: 'student-rename', student })}>Rename alias</button><button disabled={locked || Boolean(classroom?.archived)} onClick={() => { void archiveStudent() }}>{student.archived ? 'Restore student' : 'Archive student'}</button></div>
            <form onSubmit={event => { void save(event) }}><div className="form-top"><h3>What did you notice?</h3><span>A moment worth remembering</span></div><label className="sr-only" htmlFor="note">Observation for {student.alias}</label><textarea ref={noteInput} id="note" value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} disabled={busy || readOnly} required placeholder={readOnly ? 'Restore this student and classroom to add a new observation.' : 'What happened? What might help next? Keep it specific and kind.'} /><div className="form-fields"><label>Category<select value={category} disabled={busy || readOnly} onChange={event => setCategory(event.target.value as Category)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Observation date<input type="date" value={date} max={today} disabled={busy || readOnly} required onChange={event => setDate(event.target.value)} /></label></div><div className="form-footer"><span>{draft.length}/2,000 characters</span><button className="primary" disabled={locked || readOnly || !draft.trim()}>{busy ? 'Saving…' : 'Save observation'} <span aria-hidden="true">↗</span></button></div></form>
          </section>
          <StudentTimeline key={student.id} alias={student.alias} notes={timeline} readOnly={readOnly}>{matches => <ol>{matches.map(n => <li key={n.id}><div className="timeline-meta"><span className={`category category-${n.category.toLowerCase()}`}>{n.category}</span><time dateTime={n.date}>{displayDate(n.date)}</time></div><p className="note-text">{n.note}</p>{!readOnly && (pendingDelete === n.id ? <div className="delete-confirm"><span>Delete this observation?</span><button className="danger" disabled={locked} onClick={async () => { const result = await run({ kind: 'note-remove', id: n.id }); if (result.ok) { setPendingDelete(null); setMessage('Observation deleted.') } else setMessage(result.message) }}>Delete</button><button disabled={busy} onClick={() => setPendingDelete(null)}>Keep it</button></div> : <div className="observation-actions"><button className="edit-observation" disabled={locked} aria-label={`Edit ${n.category.toLowerCase()} observation from ${displayDate(n.date)}`} onClick={() => { setPendingDelete(null); setEditingNote({ ...n }) }}>Edit</button><button className="delete-link" disabled={locked} aria-label={`Delete ${n.category.toLowerCase()} observation from ${displayDate(n.date)}`} onClick={() => setPendingDelete(n.id)}>Delete</button></div>)}</li>)}</ol>}</StudentTimeline>
        </> : <section className="panel empty classroom-empty"><span className="empty-symbol">✧</span><h2>{students.length ? 'Choose a student to see their story.' : 'A new classroom, ready for its stories.'}</h2><p>{students.length ? 'Select an alias from the student list.' : 'Add a fictional student alias to begin capturing observations.'}</p>{classroom && !classroom.archived && <button className="primary" disabled={locked} onClick={() => openEdit({ kind: 'student-new', classroomId: classroom.id })}>Add student alias</button>}</section>}</div></div>
        <footer>Teacher Memory <span>by Ferchocol Software</span><span>Made for the moments that matter.</span></footer>
      </div>
    </main>{editingNote && <ObservationEditor key={editingNote.id} original={editingNote} alias={workspace.students.find(s => s.id === editingNote.studentId)?.alias ?? 'Student alias'} busy={busy} locked={locked} archived={!workspace.students.some(s => s.id === editingNote.studentId && !s.archived && workspace.classrooms.some(c => c.id === s.classroomId && !c.archived))} onClose={() => setEditingNote(null)} onSave={updateObservation} />}{edit && <NameDialog edit={edit} busy={busy} onClose={() => setEdit(null)} onSave={saveName} />}
  </div>
}
