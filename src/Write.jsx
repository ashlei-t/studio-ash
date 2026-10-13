import { useCallback, useEffect, useRef, useState } from 'react'
import { addEntry, allEntries, loadDraft, saveDraft } from './lib/localStore.js'
import { onSyncChange, sync } from './lib/sync.js'
import { supabase } from './lib/supabase.js'
import SignIn from './SignIn.jsx'
import Earlier from './Earlier.jsx'

const today = () =>
  new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString()

export default function Write() {
  const [text, setText] = useState(loadDraft)
  const [entries, setEntries] = useState([])
  const [session, setSession] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [view, setView] = useState('write') // write | earlier | signin
  const textareaRef = useRef(null)

  const refresh = useCallback(() => allEntries().then(setEntries), [])

  useEffect(() => {
    refresh()
    return onSyncChange(refresh)
  }, [refresh])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const onChange = (e) => {
    setText(e.target.value)
    saveDraft(e.target.value)
  }

  const keep = async () => {
    const body = text.trim()
    if (!body) return
    await addEntry(body) // the draft is only cleared once the entry is safely stored
    saveDraft('')
    setText('')
    await refresh()
    sync()
    textareaRef.current?.focus()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      keep()
    }
  }

  if (view === 'signin') return <SignIn onDone={() => setView('write')} />
  if (view === 'earlier') return <Earlier entries={entries} onBack={() => setView('write')} />

  const unsynced = entries.filter((e) => !e.synced).length
  const latest = entries[0] && isToday(entries[0].created_at) ? entries[0] : null

  let status = null
  if (!online) status = 'offline · kept on this device'
  else if (!session) status = (
    <button className="quiet" onClick={() => setView('signin')}>sign in to sync</button>
  )
  else if (unsynced) status = 'saving…'

  return (
    <main className="page">
      <header className="top">
        <span className="date">{today()}</span>
        <span className="status">{status}</span>
      </header>

      <textarea
        ref={textareaRef}
        className="writing"
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder="Write."
        autoFocus
        spellCheck
      />

      <footer className="bottom">
        {entries.length > 0 && (
          <button className="quiet" onClick={() => setView('earlier')}>earlier</button>
        )}
        {text.trim() && (
          <button className="keep" onClick={keep} title="⌘ + Enter">keep</button>
        )}
      </footer>

      {latest && !text && (
        <section className="latest">
          <p className="latest-body">{latest.body}</p>
          {latest.reply && <p className="reply">{latest.reply}</p>}
        </section>
      )}
    </main>
  )
}
