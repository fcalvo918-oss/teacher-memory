export const categories = ['Learning', 'Participation', 'Wellbeing', 'Celebration'] as const
export const colors = ['peach', 'blue', 'lavender', 'green'] as const
export type Category = typeof categories[number]
export type Color = typeof colors[number]
export type Classroom = { id: string; name: string; archived: boolean }
export type Student = { id: string; classroomId: string; alias: string; color: Color; archived: boolean }
export type Observation = { id: string; studentId: string; date: string; category: Category; note: string }
export type Workspace = { classrooms: Classroom[]; students: Student[]; notes: Observation[] }
export const storageKey = 'teacher-memory.observations.v1'
export const workspaceKey = 'teacher-memory.workspace.v2'
export const starterStudents: Student[] = [
  { id: 'am', classroomId: 'starter', alias: 'A.M.', color: 'peach', archived: false },
  { id: 'bk', classroomId: 'starter', alias: 'B.K.', color: 'blue', archived: false },
  { id: 'cr', classroomId: 'starter', alias: 'C.R.', color: 'lavender', archived: false },
  { id: 'ds', classroomId: 'starter', alias: 'D.S.', color: 'green', archived: false },
  { id: 'el', classroomId: 'starter', alias: 'E.L.', color: 'peach', archived: false },
  { id: 'fn', classroomId: 'starter', alias: 'F.N.', color: 'blue', archived: false },
]
export const emptyWorkspace = (): Workspace => ({ classrooms: [], students: [], notes: [] })
export function makeId() { return crypto.getRandomValues(new Uint32Array(4)).join('-') }
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
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
export function isObservations(value: unknown): value is Observation[] {
  return Array.isArray(value) && value.every(item => record(item) && text(item.id, 100) && text(item.studentId, 100) &&
    typeof item.date === 'string' && validDate(item.date) && categories.includes(item.category as Category) && text(item.note, 2000))
}
export function isWorkspace(value: unknown): value is Workspace {
  if (!record(value) || !Array.isArray(value.classrooms) || !Array.isArray(value.students) || !isObservations(value.notes)) return false
  if (!value.classrooms.every(c => record(c) && text(c.id, 100) && text(c.name, 80) && typeof c.archived === 'boolean')) return false
  if (!value.students.every(s => record(s) && text(s.id, 100) && text(s.classroomId, 100) && text(s.alias, 32) && colors.includes(s.color as Color) && typeof s.archived === 'boolean')) return false
  const classes = value.classrooms as Classroom[]
  const students = value.students as Student[]
  const classIds = new Set(classes.map(c => c.id))
  const studentIds = new Set(students.map(s => s.id))
  const unique = (items: string[]) => new Set(items).size === items.length
  return classIds.size === classes.length && studentIds.size === students.length && unique(value.notes.map(n => n.id)) &&
    unique(classes.map(c => c.name.trim().toLowerCase())) && unique(students.map(s => `${s.classroomId}\u0000${s.alias.trim().toLowerCase()}`)) &&
    students.every(s => classIds.has(s.classroomId)) && value.notes.every(n => studentIds.has(n.studentId))
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
export function demoWorkspace(notes = seed()): Workspace {
  return { classrooms: [{ id: 'starter', name: 'Starter classroom', archived: false }], students: starterStudents.map(s => ({ ...s })), notes }
}
export interface BrowserStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function readDemo(storage: BrowserStorage): { workspace: Workspace; error: string } {
  try {
    const current = storage.getItem(workspaceKey)
    if (current !== null) {
      const parsed: unknown = JSON.parse(current)
      if (!isWorkspace(parsed)) throw new Error('Invalid workspace')
      return { workspace: parsed, error: '' }
    }
    const legacy = storage.getItem(storageKey)
    if (legacy === null) return { workspace: demoWorkspace(), error: '' }
    const notes: unknown = JSON.parse(legacy)
    if (!isObservations(notes)) throw new Error('Invalid old notes')
    const workspace = demoWorkspace(notes)
    if (!isWorkspace(workspace)) throw new Error('Unknown old student')
    return { workspace, error: '' }
  } catch { return { workspace: emptyWorkspace(), error: 'Saved browser data could not be read. It has been preserved, and saving is blocked to avoid overwriting it.' } }
}
export function needsCheckIn(notes: Observation[], id: string, today = localDate()) {
  const latest = notes.filter(n => n.studentId === id && n.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0]
  return !latest || daysAgo(latest.date, today) >= 7
}
export function activeStudents(workspace: Workspace, classroomId: string) {
  if (!workspace.classrooms.some(c => c.id === classroomId && !c.archived)) return []
  return workspace.students.filter(s => s.classroomId === classroomId && !s.archived)
}
