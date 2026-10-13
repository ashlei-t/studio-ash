// On-device storage. This is the source of truth for anything written here
// until the server has confirmed it. Nothing is ever removed locally.
//
// Entry shape:
//   { id, body, created_at, reply, synced: 0|1, reflected: 0|1 }

import { openDB } from 'idb'

const DRAFT_KEY = 'studio-ash:draft'

const dbPromise = openDB('studio-ash', 1, {
  upgrade(db) {
    const entries = db.createObjectStore('entries', { keyPath: 'id' })
    entries.createIndex('created_at', 'created_at')
  },
})

export async function addEntry(body) {
  const entry = {
    id: crypto.randomUUID(),
    body,
    created_at: new Date().toISOString(),
    reply: null,
    synced: 0,
    reflected: 0,
  }
  await (await dbPromise).put('entries', entry)
  return entry
}

export async function putEntry(entry) {
  await (await dbPromise).put('entries', entry)
}

export async function getEntry(id) {
  return (await dbPromise).get('entries', id)
}

// Newest first.
export async function allEntries() {
  const list = await (await dbPromise).getAllFromIndex('entries', 'created_at')
  return list.reverse()
}

// The draft lives in localStorage so it survives a closed tab mid-sentence.
export function loadDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveDraft(text) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text)
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Storage unavailable (private mode); the draft just won't persist.
  }
}
