import { useCallback, useEffect, useRef, useState } from 'react'
import { isObservations, seed, storageKey } from './model'
import type { Observation } from './model'
import { supabase } from './supabase'

function readDemo() {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return { notes: seed(), error: '' }
    const parsed: unknown = JSON.parse(raw)
    if (!isObservations(parsed)) throw new Error('Invalid saved data')
    return { notes: parsed, error: '' }
  } catch {
    return { notes: [] as Observation[], error: 'Saved demo notes could not be read. Existing browser storage has been preserved; demo saving is blocked.' }
  }
}

export function useObservations(userId?: string) {
  const [initial] = useState(() => userId ? { notes: [] as Observation[], error: '' } : readDemo())
  const [notes, setNotes] = useState(initial.notes)
  const [error, setError] = useState(initial.error)
  const [loading, setLoading] = useState(Boolean(userId))
  const [saving, setSaving] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const alive = useRef(true)
  const revision = useRef(0)
  const mutating = useRef(false)
  const fetching = useRef(false)

  const reload = useCallback(async () => {
    if (!userId || !supabase || mutating.current || fetching.current) return
    fetching.current = true
    const request = ++revision.current
    setLoading(true)
    try {
      const all: Observation[] = []
      // Read every page; PostgREST's default row limit must not truncate timelines.
      for (let offset = 0; ; offset += 500) {
        const { data, error: problem } = await supabase.from('tm_observations')
          .select('id, student_id, observed_on, category, note').eq('owner_id', userId)
          .order('observed_on', { ascending: false }).order('id').range(offset, offset + 499)
        if (problem) throw problem
        const mapped = (data ?? []).map(row => ({ id: row.id, studentId: row.student_id, date: row.observed_on, category: row.category, note: row.note }))
        if (!isObservations(mapped)) throw new Error('Unexpected observation format')
        all.push(...mapped)
        if (mapped.length < 500) break
      }
      if (alive.current && revision.current === request) { setNotes(all); setError(''); setLastSync(new Date()) }
    } catch {
      if (alive.current && revision.current === request) setError('Could not refresh cloud notes. Check your connection and account session, then try Refresh notes. Previously loaded notes are still shown.')
    } finally {
      fetching.current = false
      if (alive.current && revision.current === request) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    alive.current = true
    void reload()
    const refreshVisible = () => { if (document.visibilityState === 'visible') void reload() }
    const timer = userId ? window.setInterval(refreshVisible, 30000) : undefined
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      alive.current = false
      if (timer !== undefined) window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [reload, userId])

  const writeDemo = (next: Observation[]) => {
    if (initial.error) return false
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setNotes(next); setError(''); return true }
    catch { setError('Could not save in this browser. Your draft is still here. Check browser storage permissions and try again.'); return false }
  }

  async function add(observation: Observation) {
    if (!userId) return writeDemo([observation, ...notes])
    if (!supabase || mutating.current || loading) return false
    mutating.current = true; setSaving(true); ++revision.current
    try {
      const { error: problem } = await supabase.from('tm_observations').upsert({
        owner_id: userId, id: observation.id, student_id: observation.studentId,
        observed_on: observation.date, category: observation.category, note: observation.note,
      }, { onConflict: 'owner_id,id' })
      if (problem) throw problem
      if (!alive.current) return false
      setNotes(previous => [observation, ...previous.filter(n => n.id !== observation.id)])
      setError(''); setLastSync(new Date()); return true
    } catch {
      if (alive.current) setError('Could not save to your account. Your draft is still here. Check your connection or sign in again, then retry.')
      return false
    } finally { mutating.current = false; if (alive.current) setSaving(false) }
  }

  async function remove(id: string) {
    if (!userId) return writeDemo(notes.filter(n => n.id !== id))
    if (!supabase || mutating.current || loading) return false
    mutating.current = true; setSaving(true); ++revision.current
    try {
      const { error: problem } = await supabase.from('tm_observations').delete().eq('owner_id', userId).eq('id', id)
      if (problem) throw problem
      if (!alive.current) return false
      setNotes(previous => previous.filter(n => n.id !== id)); setError(''); setLastSync(new Date()); return true
    } catch {
      if (alive.current) setError('Could not delete this cloud note. Check your connection and account session, then retry.')
      return false
    } finally { mutating.current = false; if (alive.current) setSaving(false) }
  }

  return { notes, error, loading, saving, lastSync, reload, add, remove, blocked: Boolean(initial.error) }
}
