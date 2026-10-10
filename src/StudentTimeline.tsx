import { useState } from 'react'
import type { ReactNode } from 'react'
import { categories } from './model'
import type { Category, Observation } from './model'
import { emptyFilters, filterProblem, filterTimeline } from './timelineFilters'
import type { TimelineFilters } from './timelineFilters'
import './StudentTimeline.css'

type Props = { notes: Observation[]; alias: string; readOnly: boolean; exportDisabled: boolean; onExport: (notes: Observation[]) => void; children: (notes: Observation[]) => ReactNode }

export default function StudentTimeline({ notes, alias, readOnly, exportDisabled, onExport, children }: Props) {
  const [filters, setFilters] = useState<TimelineFilters>({ ...emptyFilters })
  const matches = filterTimeline(notes, filters)
  const problem = filterProblem(filters)
  const hasFilters = Boolean(filters.query || filters.category || filters.from || filters.to)
  function clear() { setFilters({ ...emptyFilters }) }
  return <section className="panel timeline" aria-label={`Timeline for ${alias}`}>
    <div className="timeline-title"><h2>Student timeline</h2><span role="status" aria-live="polite">{hasFilters ? `${matches.length} of ${notes.length}` : notes.length} {notes.length === 1 ? 'observation' : 'observations'}</span></div>
    <div className="timeline-filters" role="search" aria-label={`Search observations for ${alias}`}>
      <p>Find observations for <strong>{alias}</strong>.</p>
      <div className="timeline-filter-grid">
        <label className="timeline-search-field">Search note text<input type="search" placeholder="e.g. reading or teamwork" value={filters.query} maxLength={2000} onChange={event => setFilters({ ...filters, query: event.target.value })} /></label>
        <label>Filter by category<select value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value as Category | '' })}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>From date<input type="date" value={filters.from} aria-invalid={Boolean(problem)} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>To date<input type="date" value={filters.to} aria-invalid={Boolean(problem)} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
      </div>
      <div className="timeline-filter-footer"><span>Dates include both the start and end day.</span><button type="button" onClick={clear} disabled={!hasFilters}>Clear filters</button></div>
      <div className="timeline-export-controls"><span>Exports only the saved notes matching these filters.</span><button type="button" disabled={exportDisabled || Boolean(problem) || matches.length === 0} onClick={() => onExport(matches)}>Export shown notes ({matches.length})</button></div>
      {problem && <p className="dialog-error" role="alert">{problem}</p>}
    </div>
    {notes.length === 0 ? <div className="empty"><span className="empty-symbol">✧</span><h3>A story starts with one moment.</h3><p>{readOnly ? 'No observations in this archived timeline.' : `Add the first observation for ${alias} above.`}</p></div> : problem ? <div className="empty"><p>Adjust the date range to see matching observations.</p></div> : matches.length === 0 ? <div className="empty"><h3>No matching observations.</h3><p>Try a different search or clear the filters to see this student’s full timeline.</p><button type="button" onClick={clear}>Clear timeline filters</button></div> : children(matches)}
  </section>
}
