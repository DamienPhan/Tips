import { useState } from 'react'
import { supabase } from '../lib/supabase'

const field = 'w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-amber/40'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const signIn = async () => {
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Identifiants incorrects')
    setBusy(false)
  }

  return (
    <div className="min-h-full flex flex-col justify-center px-6">
      <p className="text-muted text-xs uppercase tracking-[0.2em] mb-1">Rapports de mission</p>
      <h1 className="font-display text-amber text-3xl font-bold mb-8">Connexion</h1>
      <div className="space-y-3">
        <input type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" className={field} autoComplete="email" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Mot de passe" className={field} autoComplete="current-password"
          onKeyDown={e => e.key === 'Enter' && signIn()} />
        {error && <p className="text-error text-sm">{error}</p>}
        <button onClick={signIn} disabled={busy}
          className="w-full bg-amber text-night font-medium py-3 rounded-xl active:bg-amber/80 disabled:opacity-50">
          {busy ? '…' : 'Se connecter'}
        </button>
      </div>
    </div>
  )
}
