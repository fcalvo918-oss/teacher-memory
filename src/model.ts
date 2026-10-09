export const students = [
  { id: 'am', alias: 'A.M.', color: 'peach' },
  { id: 'bk', alias: 'B.K.', color: 'blue' },
  { id: 'cr', alias: 'C.R.', color: 'lavender' },
  { id: 'ds', alias: 'D.S.', color: 'green' },
  { id: 'el', alias: 'E.L.', color: 'peach' },
  { id: 'fn', alias: 'F.N.', color: 'blue' },
]
export const categories = ['Learning', 'Participation', 'Wellbeing', 'Celebration'] as const
export type Category = typeof categories[number]
export type Observation = { id: string; studentId: string; date: string; category: Category; note: string }
export const storageKey = 'teacher-memory.observations.v1'
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function daysAgo(date: string, today = localDate()) {
  return Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000)
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00')
  return !Number.isNaN(date.getTime()) && localDate(date) === value
}
export function isObservations(value: unknown): value is Observation[] {
  return Array.isArray(value) && value.every(item => item && typeof item.id === 'string' &&
    students.some(s => s.id === item.studentId) && typeof item.date === 'string' && validDate(item.date) &&
    categories.includes(item.category) && typeof item.note === 'string' && item.note.trim().length > 0 && item.note.length <= 2000)
}
export function seed(): Observation[] {
  const date = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return localDate(d) }
  return [
    { id: 'demo-1', studentId: 'am', date: date(0), category: 'Celebration', note: 'Explained a new strategy to a partner and encouraged them to try it independently.' },
    { id: 'demo-2', studentId: 'bk', date: date(2), category: 'Learning', note: 'Used a number line to solve the warm-up. Next time, invite an explanation of each step.' },
    { id: 'demo-3', studentId: 'cr', date: date(8), category: 'Participation', note: 'Shared an idea in a small group. Offer another low-pressure opportunity to contribute.' },
    { id: 'demo-4', studentId: 'ds', date: date(3), category: 'Wellbeing', note: 'Chose a quiet workspace and settled into the activity after a short check-in.' },
    { id: 'demo-5', studentId: 'am', date: date(4), category: 'Learning', note: 'Tried two approaches to the reading activity and identified which one helped most.' },
  ]
}
