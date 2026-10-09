import { isWorkspace } from './model'
import type { Classroom, Observation, Student, Workspace } from './model'

export type Change =
  | { kind: 'classroom-add'; value: Classroom }
  | { kind: 'classroom-update'; id: string; patch: Partial<Pick<Classroom, 'name' | 'archived'>> }
  | { kind: 'student-add'; value: Student }
  | { kind: 'student-update'; id: string; patch: Partial<Pick<Student, 'alias' | 'archived'>> }
  | { kind: 'note-add'; value: Observation }
  | { kind: 'note-update'; before: Observation; value: Observation }
  | { kind: 'note-remove'; id: string }

export function applyChange(workspace: Workspace, change: Change): Workspace {
  let next: Workspace
  switch (change.kind) {
    case 'classroom-add':
      next = { ...workspace, classrooms: [...workspace.classrooms.filter(c => c.id !== change.value.id), change.value] }
      break
    case 'classroom-update':
      if (!workspace.classrooms.some(c => c.id === change.id)) throw new Error('Refresh your classrooms and try again.')
      next = { ...workspace, classrooms: workspace.classrooms.map(c => c.id === change.id ? { ...c, ...change.patch } : c) }
      break
    case 'student-add':
      if (!workspace.classrooms.some(c => c.id === change.value.classroomId && !c.archived)) throw new Error('Restore the classroom before adding a student.')
      next = { ...workspace, students: [...workspace.students.filter(s => s.id !== change.value.id), change.value] }
      break
    case 'student-update':
      if (!workspace.students.some(s => s.id === change.id)) throw new Error('Refresh your students and try again.')
      next = { ...workspace, students: workspace.students.map(s => s.id === change.id ? { ...s, ...change.patch } : s) }
      break
    case 'note-update':
    case 'note-add': {
      if (change.kind === 'note-update') {
        const existing = workspace.notes.find(n => n.id === change.before.id)
        if (!existing || !sameObservation(existing, change.before)) throw new Error('This observation changed or was deleted. Close the editor, refresh, and reopen it to review the latest version. Your draft has not been saved.')
        if (change.value.id !== existing.id || change.value.studentId !== existing.studentId) throw new Error('An observation must stay in its original student timeline.')
      }
      const student = workspace.students.find(s => s.id === change.value.studentId)
      if (!student || student.archived || !workspace.classrooms.some(c => c.id === student.classroomId && !c.archived)) {
        throw new Error('Restore the student and classroom before adding an observation.')
      }
      next = { ...workspace, notes: [change.value, ...workspace.notes.filter(n => n.id !== change.value.id)] }
      break
    }
    case 'note-remove':
      next = { ...workspace, notes: workspace.notes.filter(n => n.id !== change.id) }
      break
  }
  if (!isWorkspace(next)) throw new Error('Use a different classroom name or student alias, and check the entry length.')
  return next
}

export function sameObservation(a: Observation, b: Observation) {
  return a.id === b.id && a.studentId === b.studentId && a.date === b.date && a.category === b.category && a.note === b.note
}
