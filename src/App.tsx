import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import Journal from './Journal'
import { authRedirect, cloudConfigured, supabase } from './supabase'
import './Account.css'
import Brand from './Brand'

type Mode = 'signin' | 'signup' | 'reset'

function AccountForm({ recovery, onRecovered, onDemo }: { recovery: boolean; onRecovered: () => void; onDemo: () => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const title = recovery ? 'Choose a new password' : mode === 'signup' ? 'Make room for every moment.' : mode === 'reset' ? 'Let’s get you back in.' : 'Your classroom, wherever you are.'
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    setError(''); setMessage('')
    if ((recovery || mode === 'signup') && password !== confirm) { setError('The passwords do not match.'); return }
    setBusy(true)
    try {
      if (recovery) {
        const { error: problem } = await supabase.auth.updateUser({ password })
        if (problem) throw problem
        setPassword(''); setConfirm(''); onRecovered()
      } else if (mode === 'signin') {
        const { error: problem } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (problem) throw problem
        setPassword('')
      } else if (mode === 'signup') {
        const { error: problem, data } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirect() } })
        if (problem) throw problem
        setPassword(''); setConfirm('')
        if (!data.session) setMessage('Check your email for a confirmation link. After confirming, sign in on both devices with this account.')
      } else {
        const { error: problem } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect() })
        if (problem) throw problem
        setMessage('If an account exists for that email, you will receive a password reset link.')
      }
    } catch {
      setError(mode === 'signin' && !recovery ? 'Could not sign in. Check your email, password, email confirmation, and internet connection.' : 'The request could not be completed. Check your connection, try again later, or request a fresh email link.')
    } finally { setBusy(false) }
  }
  function switchMode(next: Mode) { setMode(next); setError(''); setMessage(''); setPassword(''); setConfirm('') }
  return <div className="account-page"><div className="account-card">
    <div className="account-brand"><Brand /></div>
    <div className="eyebrow">A LITTLE ATTENTION GOES A LONG WAY</div><h1>{title}</h1>
    <p>{recovery ? 'Enter a new password to continue to your account.' : 'Sign in with the same account on your computer and phone to share your fictional classroom notes.'}</p>
    {!cloudConfigured && <div className="account-notice">Account syncing is not connected yet. You can still use the browser demo below.</div>}
    <form onSubmit={submit}>
      {!recovery && <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy || !cloudConfigured} /></label>}
      {(recovery || mode !== 'reset') && <label>{recovery ? 'New password' : 'Password'}<input type="password" autoComplete={recovery || mode === 'signup' ? 'new-password' : 'current-password'} minLength={recovery || mode === 'signup' ? 12 : undefined} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy || !cloudConfigured} /></label>}
      {(recovery || mode === 'signup') && <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy || !cloudConfigured} /><small>Use at least 12 characters.</small></label>}
      {error && <p className="account-error" role="alert">{error}</p>}{message && <p className="account-notice" role="status">{message}</p>}
      <button className="primary" disabled={busy || !cloudConfigured}>{busy ? 'Please wait…' : recovery ? 'Save new password' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}</button>
    </form>
    {!recovery && <div className="account-links">{mode === 'signin' ? <><button disabled={busy} onClick={() => switchMode('signup')}>Create an account</button><button disabled={busy} onClick={() => switchMode('reset')}>Forgot password?</button></> : <button disabled={busy} onClick={() => switchMode('signin')}>Back to sign in</button>}</div>}
    <button className="demo-choice" disabled={busy} onClick={onDemo}>Continue with browser demo</button>
    <p className="account-footnote">Use fictional student information while this prototype is being tested. Browser demo notes stay on this device.</p>
  </div></div>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [demo, setDemo] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  useEffect(() => {
    if (!supabase) return
    let mounted = true
    let revision = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, current) => {
      if (!mounted) return
      ++revision
      setSession(current); setLoading(false)
      if (event === 'PASSWORD_RECOVERY') { setRecovery(true); setDemo(false) }
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    const requestedAt = revision
    void supabase.auth.getSession().then(({ data, error: problem }) => {
      if (!mounted || revision !== requestedAt) return
      setSession(data.session); setLoading(false)
      if (problem) setError('Could not restore your session. Please sign in again.')
    }).catch(() => { if (mounted) { setLoading(false); setError('Could not restore your session. Please sign in again.') } })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])
  async function signOut() {
    if (!supabase || signingOut) return
    setSigningOut(true); setError('')
    try {
      const { error: problem } = await supabase.auth.signOut({ scope: 'local' })
      if (problem) throw problem
      setSession(null); setRecovery(false)
    } catch { setError('Could not sign out. Check your connection and try again.') }
    finally { setSigningOut(false) }
  }
  if (loading) return <div className="account-page"><p role="status">Checking your account…</p></div>
  if (demo) return <Journal key="demo" onExit={() => setDemo(false)} />
  if (session && !recovery) return <>
    {error && <div className="account-global-error" role="alert">{error}</div>}
    <Journal key={session.user.id} userId={session.user.id} accountEmail={session.user.email} onExit={() => { void signOut() }} signingOut={signingOut} />
  </>
  return <>{error && <div className="account-global-error" role="alert">{error}</div>}<AccountForm recovery={recovery} onRecovered={() => setRecovery(false)} onDemo={() => setDemo(true)} /></>
}
