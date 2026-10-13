// Moves entries between this device and Supabase, then asks for reflections.
//
// Order of operations on every run:
//   1. push  — upload entries not yet confirmed by the server
//   2. pull  — fetch entries changed elsewhere (other devices, replies)
//   3. reflect — ask the reflect function about synced, unreflected entries
//
// Only one run happens at a time; a request during a run schedules one more.
// Any failure leaves local state untouched, so the next run simply retries.

import { supabase } from './supabase.js'
import { allEntries, getEntry, putEntry } from './localStore.js'

const PULL_CURSOR_KEY = 'studio-ash:pulled-until'
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

let running = false
let again = false
const listeners = new Set()

export function onSyncChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  for (const fn of listeners) fn()
}

export async function sync() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      if (!navigator.onLine) break
      const { data } = await supabase.auth.getSession()
      if (!data.session) break
      await push()
      await pull()
      await reflect()
    } while (again)
  } catch (e) {
    console.warn('[sync]', e)
  } finally {
    running = false
    notify()
  }
}

async function push() {
  const pending = (await allEntries()).filter((e) => !e.synced)
  if (!pending.length) return
  const rows = pending.map(({ id, body, created_at }) => ({ id, body, created_at }))
  const { error } = await supabase.from('entries').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  for (const e of pending) await putEntry({ ...e, synced: 1 })
  notify()
}

async function pull() {
  let cursor
  try {
    cursor = localStorage.getItem(PULL_CURSOR_KEY)
  } catch {
    cursor = null
  }
  let query = supabase
    .from('entries')
    .select('id, body, created_at, updated_at, reply, reflected_at')
    .order('updated_at', { ascending: true })
    .limit(500)
  if (cursor) query = query.gt('updated_at', cursor)
  const { data, error } = await query
  if (error) throw error
  if (!data.length) return

  for (const row of data) {
    const local = await getEntry(row.id)
    // A local edit that hasn't been pushed yet wins over the server copy.
    if (local && !local.synced) continue
    await putEntry({
      id: row.id,
      body: row.body,
      created_at: row.created_at,
      reply: row.reply,
      synced: 1,
      reflected: row.reflected_at ? 1 : 0,
    })
  }
  try {
    localStorage.setItem(PULL_CURSOR_KEY, data[data.length - 1].updated_at)
  } catch {
    // Without a cursor the next pull re-reads everything; harmless.
  }
  notify()
}

async function reflect() {
  const waiting = (await allEntries()).filter((e) => e.synced && !e.reflected).reverse() // oldest first
  for (const entry of waiting) {
    const { data, error } = await supabase.functions.invoke('reflect', {
      body: { entry_id: entry.id, time_zone: TIME_ZONE },
    })
    if (error) {
      // Leave it unreflected; it is retried on the next run. Keep going so one
      // stubborn entry never blocks the ones after it.
      console.warn('[sync] reflect', entry.id, error)
      continue
    }
    const latest = await getEntry(entry.id)
    await putEntry({ ...latest, reply: data.reply || null, reflected: 1 })
    notify()
  }
}

// Run on load, when the connection returns, when the app comes back into view,
// and every minute while it is visible.
export function startSync() {
  const kick = () => sync()
  kick()
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick()
  }
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') kick()
  }, 60_000)
  const { data: auth } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') kick()
  })
  return () => {
    window.removeEventListener('online', kick)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
    auth.subscription.unsubscribe()
  }
}
