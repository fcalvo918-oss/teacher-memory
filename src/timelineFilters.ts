import type { Category, Observation } from './model'
import { validDate } from './model'

export type TimelineFilters = { query: string; category: Category | ''; from: string; to: string }
export const emptyFilters: TimelineFilters = { query: '', category: '', from: '', to: '' }

export function filterProblem(filters: TimelineFilters) {
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to))) return 'Choose valid dates for your date range.'
  if (filters.from && filters.to && filters.from > filters.to) return 'The From date must be on or before the To date.'
  return ''
}

export function filterTimeline(notes: Observation[], filters: TimelineFilters) {
  if (filterProblem(filters)) return []
  const query = filters.query.trim().toLocaleLowerCase()
  return notes.filter(n => (!query || n.note.toLocaleLowerCase().includes(query)) &&
    (!filters.category || n.category === filters.category) &&
    (!filters.from || n.date >= filters.from) && (!filters.to || n.date <= filters.to))
}
