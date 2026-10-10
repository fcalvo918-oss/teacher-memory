import { useState } from 'react'
import type { Workspace } from './model'
import { classroomCoverage } from './coverage'
import './ClassroomCoverage.css'

type View = 'attention' | 'none' | 'overdue' | 'recent'
type Props = { workspace: Workspace; classroomId: string; today: string; disabled: boolean; selectedId?: string; onSelect: (id: string) => void }

export default function ClassroomCoverage({ workspace, classroomId, today, disabled, selectedId, onSelect }: Props) {
  const [view, setView] = useState<View>('attention')
  const [expanded, setExpanded] = useState(false)
  const classroom = workspace.classrooms.find(c => c.id === classroomId)
  const entries = classroomCoverage(workspace, classroomId, today)
  const none = entries.filter(e => e.status === 'none').length
  const overdue = entries.filter(e => e.status === 'overdue').length
  const recent = entries.filter(e => e.status === 'recent').length
  const filtered = entries.filter(e => view === 'attention' ? e.status !== 'recent' : e.status === view)
  const shown = expanded ? filtered : filtered.slice(0, 6)
  const percent = entries.length ? Math.round(100 * recent / entries.length) : 0
  const views: { id: View; label: string; count: number }[] = [
    { id: 'attention', label: 'Needs a check-in', count: none + overdue },
    { id: 'none', label: 'No notes yet', count: none },
    { id: 'overdue', label: '7+ days since a note', count: overdue },
    { id: 'recent', label: 'Recently observed', count: recent },
  ]
  return <section className="panel classroom-coverage" aria-labelledby="coverage-heading">
    <div className="coverage-heading"><div><h2 id="coverage-heading">Classroom coverage</h2><p>{classroom?.name ?? 'Choose a classroom'} · A guide for your next check-ins.</p></div><span className="coverage-summary" role="status">{recent} of {entries.length} active students observed in the last 7 days</span></div>
    {classroom?.archived ? <p className="coverage-empty">This classroom is archived. Its students are excluded from coverage reminders.</p> : entries.length === 0 ? <p className="coverage-empty">{disabled ? 'Loading classroom coverage…' : 'Add or restore a student alias to start tracking classroom coverage.'}</p> : <>
      <progress className="coverage-progress" max={entries.length} value={recent} aria-label={`Students observed in the last seven days: ${percent}%`} />
      <div className="coverage-views" role="group" aria-label="Coverage filters">{views.map(v => <button key={v.id} aria-pressed={view === v.id} className={view === v.id ? 'active' : ''} onClick={() => { setView(v.id); setExpanded(false) }}>{v.label}<span>{v.count}</span></button>)}</div>
      <p className="coverage-list-help">Open a student’s timeline to review their notes or add an observation.</p>
      {filtered.length === 0 ? <p className="coverage-empty">{view === 'attention' ? 'Every active student has an observation in the last 7 days.' : 'No students in this group.'}</p> : <ul className="coverage-list">{shown.map(entry => <li key={entry.student.id}><button disabled={disabled} aria-pressed={selectedId === entry.student.id} onClick={() => onSelect(entry.student.id)}><span><strong>{entry.student.alias}</strong><small>{entry.lastDate ? `Last observation: ${entry.lastDate}` : 'Start their timeline with a first observation.'}</small></span><span className={`coverage-status coverage-${entry.status}`}>{entry.days === null ? 'No notes yet' : entry.days === 0 ? 'Observed today' : `${entry.days} ${entry.days === 1 ? 'day' : 'days'} since last note`}</span><span className="coverage-open">Open timeline →</span></button></li>)}</ul>}
      {filtered.length > 6 && <button className="coverage-expand" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer students' : `Show all ${filtered.length} students in this group`}</button>}
    </>}
    <p className="coverage-footnote">Based on saved observation dates. No notes yet or 7 days without a note means a check-in is due. Archived students and classrooms are excluded.</p>
  </section>
}
