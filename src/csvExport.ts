import type { Observation, Workspace } from './model'

// Quoting handles CSV separators; the apostrophe also prevents spreadsheet
// apps from interpreting user-entered text as a formula when first opened.
export function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value) ? "'" + value : value
  return '"' + safe.replaceAll('"', '""') + '"'
}

export function observationsCsv(workspace: Workspace, classroomId: string, notes?: Observation[]) {
  const classroom = workspace.classrooms.find(c => c.id === classroomId)
  if (!classroom) throw new Error('Choose a classroom before exporting.')
  const students = new Map(workspace.students.filter(s => s.classroomId === classroomId).map(s => [s.id, s]))
  const rows = (notes ?? workspace.notes).filter(n => students.has(n.studentId))
    .slice().sort((a, b) => b.date.localeCompare(a.date) || a.studentId.localeCompare(b.studentId) || a.id.localeCompare(b.id))
    .map(n => {
      const student = students.get(n.studentId)!
      return [classroom.name, classroom.archived ? 'Yes' : 'No', student.alias, student.archived ? 'Yes' : 'No', n.date, n.category, n.note]
    })
  const headers = ['Classroom', 'Classroom archived', 'Student alias', 'Student archived', 'Observation date', 'Category', 'Observation']
  return { count: rows.length, text: '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n' }
}

export function exportFilename(scope: string, today: string) {
  const label = scope.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 65) || 'observations'
  return `teacher-memory-${label}-${today}.csv`
}

export function downloadCsv(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  try {
    link.href = url; link.download = filename; link.hidden = true
    document.body.append(link); link.click()
  } finally {
    link.remove()
    // Keep the URL available long enough for mobile browsers to begin downloading.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}
