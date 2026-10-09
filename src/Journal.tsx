import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { categories, daysAgo, localDate, students, validDate } from './model'
import type { Category } from './model'
import './App.css'
import { useObservations } from './useObservations'

type Theme = 'system' | 'light' | 'dark'
function initialTheme(): Theme {
  try { const value = localStorage.getItem('teacher-memory.theme'); return value === 'light' || value === 'dark' ? value : 'system' } catch { return 'system' }
}
function displayDate(value: string) { return new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }

type Props = { userId?: string; accountEmail?: string; onExit: () => void; signingOut?: boolean }
export default function Journal({ userId, accountEmail, onExit, signingOut = false }: Props) {
  const { notes, error, loading, saving, lastSync, reload, add, remove, blocked } = useObservations(userId)
  const draftId = useRef<string | null>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [selected, setSelected] = useState('am')
  const [search, setSearch] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)
  const [category, setCategory] = useState<Category>('Learning')
  const [date, setDate] = useState(localDate)
  const [today, setToday] = useState(localDate)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const noteInput = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme }
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [theme])
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const latest = (id: string) => notes.filter(n => n.studentId === id && n.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0]
  const due = (id: string) => { const last = latest(id); return !last || daysAgo(last.date, today) >= 7 }
  const dueCount = students.filter(s => due(s.id)).length
  const recentCount = notes.filter(n => daysAgo(n.date, today) >= 0 && daysAgo(n.date, today) < 7).length
  const student = students.find(s => s.id === selected)!
  const timeline = notes.filter(n => n.studentId === selected).sort((a, b) => b.date.localeCompare(a.date))
  const visibleStudents = students.filter(s => s.alias.toLowerCase().includes(search.toLowerCase()) && (!onlyDue || due(s.id)))
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim() || !validDate(date) || date > localDate()) { setMessage('Enter an observation and a valid date that is not in the future.'); return }
    if (saving || loading || blocked) return
    // Keep the ID after an uncertain network response so retrying cannot duplicate a note.
    draftId.current ??= crypto.getRandomValues(new Uint32Array(4)).join('-')
    if (await add({ id: draftId.current, studentId: selected, date, category, note: draft.trim() })) {
      draftId.current = null
      setDraft(''); setMessage(userId ? `Observation saved to your account for ${student.alias}.` : `Observation saved in this browser for ${student.alias}.`)
    }
  }
  function selectStudent(id: string) {
    if (id === selected || saving || loading) return
    if (draft.trim() && !window.confirm('Discard your unsaved observation before switching students?')) return
    draftId.current = null
    setSelected(id); setDraft(''); setMessage(''); setPendingDelete(null)
  }
  function changeTheme(value: Theme) {
    setTheme(value)
    try { localStorage.setItem('teacher-memory.theme', value) } catch { setMessage('Theme changed for this visit; your browser could not save the preference.') }
  }
  function exit() {
    if (saving) return
    if (draft.trim() && !window.confirm('Discard your unsaved observation before leaving?')) return
    onExit()
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#main"><span className="brand-icon" aria-hidden="true">tm<span>✦</span></span><span>Teacher Memory<small>BY FERCHOCOL SOFTWARE</small></span></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <div className="nav-active"><span aria-hidden="true">▦</span> Classroom journal</div>
      <div className="sidebar-note"><span className="small-spark">✧</span><h3>Small moments.<br />A fuller picture.</h3><p>A little observation today helps you see every learner tomorrow.</p></div>
      <div className="sidebar-bottom"><span className="demo-dot" /> {userId ? 'Fictional cloud classroom' : 'Fictional demo classroom'}<small>6 student aliases · Prototype</small></div>
    </aside>
    <main id="main">
      <header className="topbar"><span>Classroom <span className="slash">/</span> <strong>Overview</strong></span><div className="account-tools">{userId && <span className="account-email" title={accountEmail}>{accountEmail}</span>}<button disabled={saving || signingOut} onClick={exit}>{userId ? (signingOut ? 'Signing out…' : 'Sign out') : 'Accounts'}</button></div><label className="theme-label">Appearance <select value={theme} onChange={e => changeTheme(e.target.value as Theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">A LITTLE ATTENTION GOES A LONG WAY</div><h1>Every student, seen.</h1><p>Capture the moments that help you understand your classroom.</p></div><button className="primary" onClick={() => noteInput.current?.focus()}>＋ Add observation</button></div>
        <div className="demo-banner"><span aria-hidden="true">◈</span><span><strong>A space to try things out.</strong> {userId ? 'Use fictional student information only. Notes are saved to your signed-in account. Your browser demo remains separate.' : 'All students and sample notes are fictional. Notes stay in this browser. Sign in to use account syncing.'}</span></div>
        {userId && <div className="cloud-status"><span role="status"><span className="sync-dot" />{loading ? 'Refreshing your account notes…' : lastSync ? `Last synced at ${lastSync.toLocaleTimeString()}. Refreshes every 30 seconds while this page is visible.` : 'Waiting for the first successful sync.'}</span><button disabled={loading || saving} onClick={() => { void reload() }}>Refresh notes</button></div>}
        {error && <div className="error" role="alert">{error}</div>}
        <section className="stats" aria-label="Classroom overview"><div><span>Students in your classroom</span><strong>06 <small>fictional aliases</small></strong></div><div><span>Observations in the last 7 days</span><strong>{String(recentCount).padStart(2, '0')} <small>moments captured</small></strong></div><div><span>Ready for a check-in</span><strong>{String(dueCount).padStart(2, '0')} <small>{dueCount === 0 ? 'everyone covered' : 'students to reconnect with'}</small></strong></div></section>
        <div className="journal-grid">
          <section className="panel roster"><div className="panel-heading"><h2>Your students <span className="count">6</span></h2><p>Choose a student to see their story.</p></div><div className="roster-controls"><label className="sr-only" htmlFor="search">Search student aliases</label><input id="search" placeholder="Search aliases…" value={search} onChange={e => setSearch(e.target.value)} /><button className={onlyDue ? 'filter active' : 'filter'} aria-pressed={onlyDue} onClick={() => setOnlyDue(!onlyDue)}>◷ Needs a check-in <span>{dueCount}</span></button></div><div className="student-list">{visibleStudents.map(s => { const last = latest(s.id); return <button key={s.id} className={`student-row ${selected === s.id ? 'selected' : ''}`} aria-pressed={selected === s.id} disabled={saving || loading} onClick={() => selectStudent(s.id)}><span className={`avatar ${s.color}`}>{s.alias}</span><span className="student-info"><strong>{s.alias}</strong><small>{last ? `Last note ${daysAgo(last.date, today) === 0 ? 'today' : `${daysAgo(last.date, today)}d ago`}` : 'No observations yet'}</small></span>{due(s.id) ? <span className="due-dot" title="Needs a check-in"><span className="sr-only">Needs a check-in</span></span> : <span className="row-check" aria-label="Recently observed">✓</span>}</button> })}{visibleStudents.length === 0 && <p className="empty">No students match this filter.</p>}</div><div className="coverage-help">Reminders appear after 7 days without a note, or when a student has no notes.</div></section>
          <div className="student-detail">
            <section className="panel composer"><div className="detail-heading"><span className={`avatar large ${student.color}`}>{student.alias}</span><div><h2>{student.alias} <span className="alias-tag">Fictional student</span></h2><p>{due(selected) ? 'A good time for a fresh observation.' : 'Keep building the picture, one moment at a time.'}</p></div></div><form onSubmit={event => { void save(event) }}><div className="form-top"><h3>What did you notice?</h3><span>A moment worth remembering</span></div><label className="sr-only" htmlFor="note">Observation for {student.alias}</label><textarea ref={noteInput} id="note" value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} disabled={saving} required placeholder="What happened? What might help next? Keep it specific and kind." /><div className="form-fields"><label>Category<select disabled={saving} value={category} onChange={e => setCategory(e.target.value as Category)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Observation date<input type="date" disabled={saving} value={date} max={today} required onChange={e => setDate(e.target.value)} /></label></div><div className="form-footer"><span>{draft.length}/2,000 characters</span><button className="primary" disabled={!draft.trim() || blocked || saving || loading}>{saving ? 'Saving…' : 'Save observation'} <span aria-hidden="true">↗</span></button></div><p className="save-message" role="status">{message}</p></form></section>
            <section className="panel timeline"><div className="timeline-title"><h2>Student timeline</h2><span>{timeline.length} {timeline.length === 1 ? 'observation' : 'observations'}</span></div>{timeline.length === 0 ? <div className="empty"><span className="empty-symbol">✧</span><h3>A story starts with one moment.</h3><p>Add the first observation for {student.alias} above.</p></div> : <ol>{timeline.map(n => <li key={n.id}><div className="timeline-meta"><span className={`category category-${n.category.toLowerCase()}`}>{n.category}</span><time dateTime={n.date}>{displayDate(n.date)}</time></div><p className="note-text">{n.note}</p>{pendingDelete === n.id ? <div className="delete-confirm"><span>Delete this observation?</span><button className="danger" disabled={saving || loading} onClick={async () => { if (await remove(n.id)) { setPendingDelete(null); setMessage('Observation deleted.') } }}>Delete</button><button onClick={() => setPendingDelete(null)}>Keep it</button></div> : <button className="delete-link" aria-label={`Delete ${n.category.toLowerCase()} observation from ${displayDate(n.date)}`} disabled={saving || loading} onClick={() => setPendingDelete(n.id)}>Delete</button>}</li>)}</ol>}</section>
          </div>
        </div><footer>Teacher Memory <span>by Ferchocol Software</span><span>Made for the moments that matter.</span></footer>
      </div>
    </main>
  </div>
}
