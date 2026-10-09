import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyWorkspace, isWorkspace, readDemo, workspaceKey } from './model'
import type { Workspace } from './model'
import { applyChange } from './workspaceChanges'
import type { Change } from './workspaceChanges'
import { supabase } from './supabase'

type Result = { ok: true } | { ok: false; message: string }
function problemMessage(problem: unknown, refreshing = false) {
  const code = typeof problem === 'object' && problem !== null && 'code' in problem ? String(problem.code) : ''
  if (code === '42P01' || code === 'PGRST202' || code === 'PGRST205') return 'The classroom database update is not available yet. Complete the setup, then refresh.'
  if (code === '23505') return 'That classroom name or student alias is already in use. Choose another name, including checking archived entries.'
  if (code === '23503' || code === '42501') return 'This change could not be saved. Refresh to check whether the classroom or student was archived, or sign in again.'
  return refreshing ? 'Could not refresh your workspace. Check your connection and account session, then try Refresh notes. Previously loaded information is still shown.' : 'Could not save the change. Your entry is still here. Check your connection and try again.'
}

export function useWorkspace(userId?: string) {
  const [initial] = useState(() => {
    if (userId) return { workspace: emptyWorkspace(), error: '' }
    try { return readDemo(localStorage) }
    catch { return { workspace: emptyWorkspace(), error: 'Browser storage is unavailable. Allow storage and reload to use the demo.' } }
  })
  const [workspace, setWorkspace] = useState(initial.workspace)
  const [error, setError] = useState(initial.error)
  const [loading, setLoading] = useState(Boolean(userId))
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(!userId && !initial.error)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const alive = useRef(true)
  const fetching = useRef(false)
  const mutating = useRef(false)
  const bootstrapped = useRef(false)
  const current = useRef(workspace)

  const replaceWorkspace = useCallback((next: Workspace) => { current.current = next; setWorkspace(next) }, [])
  const reload = useCallback(async () => {
    if (!userId || !supabase || fetching.current || mutating.current) return
    fetching.current = true; setLoading(true)
    try {
      if (!bootstrapped.current) {
        const { error: problem } = await supabase.rpc('tm_ensure_starter')
        if (problem) throw problem
        bootstrapped.current = true
      }
      // Stable ID ordering and paging avoid the API's default 1,000-row limit.
      const loadTable = async (table: string, columns: string) => {
        const all: Record<string, unknown>[] = []
        for (let offset = 0; ; offset += 500) {
          const { data, error: problem } = await supabase!.from(table).select(columns).eq('owner_id', userId).order('id').range(offset, offset + 499)
          if (problem) throw problem
          const rows = (data ?? []) as unknown as Record<string, unknown>[]
          all.push(...rows)
          if (rows.length < 500) return all
        }
      }
      const [classes, students, notes] = await Promise.all([
        loadTable('tm_classrooms', 'id,name,archived'),
        loadTable('tm_students', 'id,classroom_id,alias,color,archived'),
        loadTable('tm_observations', 'id,student_id,observed_on,category,note'),
      ])
      const next: unknown = {
        classrooms: classes,
        students: students.map(s => ({ id: s.id, classroomId: s.classroom_id, alias: s.alias, color: s.color, archived: s.archived })),
        notes: notes.map(n => ({ id: n.id, studentId: n.student_id, date: n.observed_on, category: n.category, note: n.note })),
      }
      if (!isWorkspace(next)) throw new Error('Workspace changed during refresh or contains an unexpected format')
      if (alive.current) { replaceWorkspace(next); setReady(true); setError(''); setLastSync(new Date()) }
    } catch (problem) { if (alive.current) setError(problemMessage(problem, true)) }
    finally { fetching.current = false; if (alive.current) setLoading(false) }
  }, [replaceWorkspace, userId])

  useEffect(() => {
    alive.current = true
    void reload()
    const refreshVisible = () => { if (document.visibilityState === 'visible') void reload() }
    const onStorage = (event: StorageEvent) => {
      if (userId || event.key !== workspaceKey) return
      const value = readDemo(localStorage)
      if (value.error) { setError(value.error); setReady(false) }
      else { replaceWorkspace(value.workspace); setError(''); setReady(true) }
    }
    const timer = userId ? window.setInterval(refreshVisible, 30000) : undefined
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    window.addEventListener('storage', onStorage)
    return () => {
      alive.current = false
      if (timer !== undefined) window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [reload, replaceWorkspace, userId])

  async function run(change: Change): Promise<Result> {
    if (!ready || fetching.current || mutating.current) return { ok: false, message: 'Wait for the current refresh or save, then try again.' }
    let next: Workspace
    try { next = applyChange(current.current, change) }
    catch (problem) { return { ok: false, message: problem instanceof Error ? problem.message : 'Check your entry and try again.' } }
    if (!userId) {
      try { localStorage.setItem(workspaceKey, JSON.stringify(next)); replaceWorkspace(next); setError(''); return { ok: true } }
      catch { const message = 'Could not save in this browser. Your entry is still here. Check storage permissions and try again.'; setError(message); return { ok: false, message } }
    }
    if (!supabase) return { ok: false, message: 'Account syncing is not configured.' }
    mutating.current = true; setBusy(true)
    try {
      const client = supabase
      switch (change.kind) {
        case 'classroom-add': {
          // ON CONFLICT DO NOTHING makes retrying a timed-out insert safe without
          // granting UPDATE on ownership/ID columns. Read the canonical row next.
          const { error: problem } = await client.from('tm_classrooms').upsert({ owner_id: userId, ...change.value }, { onConflict: 'owner_id,id', ignoreDuplicates: true })
          if (problem) throw problem
          const { data, error: readProblem } = await client.from('tm_classrooms').select('id,name,archived').eq('owner_id', userId).eq('id', change.value.id).single()
          if (readProblem) throw readProblem
          change = { ...change, value: data }
          break
        }
        case 'classroom-update': {
          const { data, error: problem } = await client.from('tm_classrooms').update(change.patch).eq('owner_id', userId).eq('id', change.id).select('id,name,archived').single()
          if (problem) throw problem
          change = { ...change, patch: { name: data.name, archived: data.archived } }
          break
        }
        case 'student-add': {
          const s = change.value
          const { error: problem } = await client.from('tm_students').upsert({ owner_id: userId, id: s.id, classroom_id: s.classroomId, alias: s.alias, color: s.color, archived: s.archived }, { onConflict: 'owner_id,id', ignoreDuplicates: true })
          if (problem) throw problem
          const { data, error: readProblem } = await client.from('tm_students').select('id,classroom_id,alias,color,archived').eq('owner_id', userId).eq('id', s.id).single()
          if (readProblem) throw readProblem
          const student = { id: data.id, classroomId: data.classroom_id, alias: data.alias, color: data.color, archived: data.archived }
          const check = { ...current.current, students: [...current.current.students.filter(item => item.id !== s.id), student] }
          if (!isWorkspace(check)) throw new Error('Unexpected student format')
          change = { ...change, value: student }
          break
        }
        case 'student-update': {
          const { data, error: problem } = await client.from('tm_students').update(change.patch).eq('owner_id', userId).eq('id', change.id).select('alias,archived').single()
          if (problem) throw problem
          change = { ...change, patch: { alias: data.alias, archived: data.archived } }
          break
        }
        case 'note-add': {
          const n = change.value
          const { error: problem } = await client.from('tm_observations').upsert({ owner_id: userId, id: n.id, student_id: n.studentId, observed_on: n.date, category: n.category, note: n.note }, { onConflict: 'owner_id,id' })
          if (problem) throw problem
          break
        }
        case 'note-remove': {
          const { error: problem } = await client.from('tm_observations').delete().eq('owner_id', userId).eq('id', change.id)
          if (problem) throw problem
          break
        }
      }
      if (!alive.current) return { ok: false, message: 'Your account changed before the request finished. Sign in and refresh to check the result.' }
      replaceWorkspace(applyChange(current.current, change)); setError(''); setLastSync(new Date())
      return { ok: true }
    } catch (problem) { const message = problemMessage(problem); if (alive.current) setError(message); return { ok: false, message } }
    finally { mutating.current = false; if (alive.current) setBusy(false) }
  }

  return { workspace, error, loading, busy, ready, lastSync, reload, run }
}
