import { isWorkspace } from './model'
import type { Classroom, Observation, Student, Workspace } from './model'

export type Change =
  | { kind: 'classroom-add'; value: Classroom }
  | { kind: 'classroom-update'; id: string; patch: Partial<Pick<Classroom, 'name' | 'archived'>> }
  | { kind: 'student-add'; value: Student }
  | { kind: 'student-update'; id: string; patch: Partial<Pick<Student, 'alias' | 'archived'>> }
  | { kind: 'note-add'; value: Observation }
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
    case 'note-add': {
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
