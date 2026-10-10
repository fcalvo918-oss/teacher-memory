import { activeStudents, daysAgo } from './model'
import type { Student, Workspace } from './model'

export type CoverageStatus = 'none' | 'overdue' | 'recent'
export type CoverageEntry = { student: Student; status: CoverageStatus; lastDate: string | null; days: number | null }

export function classroomCoverage(workspace: Workspace, classroomId: string, today: string): CoverageEntry[] {
  const latest = new Map<string, string>()
  for (const note of workspace.notes) {
    if (note.date <= today && (!latest.has(note.studentId) || note.date > latest.get(note.studentId)!)) latest.set(note.studentId, note.date)
  }
  const rank = { none: 0, overdue: 1, recent: 2 }
  return activeStudents(workspace, classroomId).map(student => {
    const lastDate = latest.get(student.id) ?? null
    const days = lastDate ? daysAgo(lastDate, today) : null
    const status: CoverageStatus = days === null ? 'none' : days >= 7 ? 'overdue' : 'recent'
    return { student, status, lastDate, days }
  }).sort((a, b) => rank[a.status] - rank[b.status] || (b.days ?? 0) - (a.days ?? 0) || a.student.alias.localeCompare(b.student.alias))
}
