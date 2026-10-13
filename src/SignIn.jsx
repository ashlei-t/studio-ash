import { useState } from 'react'
import { supabase } from './lib/supabase.js'

export default function SignIn({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <main className="page">
      <header className="top">
        <button className="quiet" onClick={onDone}>back to writing</button>
      </header>
      <form className="signin" onSubmit={submit}>
        <p>Sign in so your entries are kept safe and reach your other devices.</p>
        <input
          type="email" autoComplete="email" placeholder="email"
          value={email} onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          type="password" autoComplete="current-password" placeholder="password"
          value={password} onChange={(e) => setPassword(e.target.value)} required
        />
        {error && <p className="error">{error}</p>}
        <button className="keep" type="submit" disabled={busy}>sign in</button>
      </form>
    </main>
  )
}
