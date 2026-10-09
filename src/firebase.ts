// Firebase Configuration & REST API Client for DigiKarya Notes (hardened)
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

const NOTE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
const MAX_NOTE_CONTENT_LENGTH = 20_000
const MAX_EXPIRY_WINDOW_MS = 72 * 60 * 60 * 1000

export interface FirebaseConfig {
  apiKey: string
  authDomain?: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId?: string
  databaseUrl?: string
}

const getEnvValue = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : ''
}

const getIdToken = (idToken?: string): string | undefined => {
  const token = getEnvValue(idToken)
  return token || undefined
}

const getJsonHeaders = (idToken?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = getIdToken(idToken)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

const getFirestoreDocumentUrl = (
  config: FirebaseConfig,
  noteId: string,
  create = false,
): string => {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    config.projectId,
  )}/databases/(default)/documents/notes`
  const path = create ? baseUrl : `${baseUrl}/${encodeURIComponent(noteId)}`
  const query = create
    ? `documentId=${encodeURIComponent(noteId)}&key=${encodeURIComponent(config.apiKey)}`
    : `key=${encodeURIComponent(config.apiKey)}`
  return `${path}?${query}`
}

const getRealtimeDatabaseUrl = (
  config: FirebaseConfig,
  noteId: string,
  idToken?: string,
): string => {
  const baseUrl = config.databaseUrl?.replace(/\/+$/, '')
  const token = getIdToken(idToken)
  const authQuery = token ? `?auth=${encodeURIComponent(token)}` : ''
  return `${baseUrl}/notes/${encodeURIComponent(noteId)}.json${authQuery}`
}

const isValidTimestamp = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
}

const isValidNoteForSave = (note: Record<string, unknown>, now: number): boolean => {
  if (!note || typeof note !== 'object') {
    return false
  }
  if (typeof note.title !== 'string' || typeof note.content !== 'string') {
    return false
  }
  if (note.content.length > MAX_NOTE_CONTENT_LENGTH) {
    return false
  }
  if (!isValidTimestamp(note.createdAt) || !isValidTimestamp(note.expiresAt)) {
    return false
  }
  return note.expiresAt > now && note.expiresAt <= now + MAX_EXPIRY_WINDOW_MS
}

export const getFirebaseConfig = (): FirebaseConfig => {
  return {
    apiKey: getEnvValue(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: getEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: getEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: getEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: getEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: getEnvValue(import.meta.env.VITE_FIREBASE_APP_ID),
    databaseUrl: getEnvValue(import.meta.env.VITE_FIREBASE_DATABASE_URL),
  }
}

export const isFirebaseConfigured = (): boolean => {
  const config = getFirebaseConfig()
  return Boolean(config.apiKey && config.projectId && config.apiKey.length >= 20)
}

// ---- Google OAuth dengan allowlist email ----

const getAdminEmails = (): string[] => {
  const raw =
    typeof import.meta.env.VITE_ADMIN_EMAILS === 'string'
      ? import.meta.env.VITE_ADMIN_EMAILS
      : 'marzukiberg@gmail.com,digikaryaadmin@gmail.com'
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export const isEmailAllowed = (email: string | null | undefined): boolean => {
  if (!email) return false
  return getAdminEmails().includes(email.trim().toLowerCase())
}

const getFirebaseApp = () => {
  const apps = getApps()
  if (apps.length > 0) return apps[0]
  const config = getFirebaseConfig()
  return initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain || `${config.projectId}.firebaseapp.com`,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  })
}

/**
 * Login via Google OAuth. Mengembalikan email bila lolos allowlist,
 * melempar Error('NOT_ALLOWED') bila email tidak terdaftar,
 * atau melempar error asli Firebase bila provider belum diaktifkan, dsb.
 */
export async function signInWithGoogle(): Promise<string> {
  const auth = getAuth(getFirebaseApp())
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(auth, provider)
  const email = result.user.email
  if (!isEmailAllowed(email)) {
    try {
      await signOut(auth)
    } catch {
      // Ignore sign-out failure; sesi sudah ditolak.
    }
    throw new Error('NOT_ALLOWED')
  }
  return email as string
}

export async function signOutGoogle(): Promise<void> {
  const apps = getApps()
  if (apps.length === 0) return
  try {
    await signOut(getAuth(apps[0]))
  } catch {
    // Ignore — tidak ada sesi aktif.
  }
}

export const sanitizeNoteId = (id: string): string | null => {
  if (typeof id !== 'string' || !NOTE_ID_PATTERN.test(id)) {
    return null
  }
  return id
}

export async function saveNoteToFirebase(
  note: Record<string, unknown>,
  idToken?: string,
): Promise<boolean> {
  const noteId = sanitizeNoteId(
    note && typeof note === 'object' && typeof note.id === 'string' ? note.id : '',
  )
  if (!noteId) {
    return false
  }

  const now = Date.now()
  if (!isValidNoteForSave(note, now)) {
    return false
  }

  const config = getFirebaseConfig()
  if (!isFirebaseConfigured()) {
    return false
  }

  try {
    if (config.databaseUrl) {
      const res = await fetch(getRealtimeDatabaseUrl(config, noteId, idToken), {
        method: 'PUT',
        headers: getJsonHeaders(),
        body: JSON.stringify(note),
      })
      return res.ok
    }

    const fields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(note)) {
      if (typeof value === 'string') {
        fields[key] = { stringValue: value }
      } else if (typeof value === 'number') {
        fields[key] = { integerValue: String(value) }
      } else if (typeof value === 'boolean') {
        fields[key] = { booleanValue: value }
      } else if (value !== null && typeof value === 'object') {
        fields[key] = { stringValue: JSON.stringify(value) }
      }
    }

    const res = await fetch(getFirestoreDocumentUrl(config, noteId, true), {
      method: 'POST',
      headers: getJsonHeaders(idToken),
      body: JSON.stringify({ fields }),
    })
    if (res.status === 409) {
      return false
    }
    return res.ok
  } catch {
    return false
  }
}

export async function fetchNoteFromFirebase<T = Record<string, unknown>>(
  noteId: string,
  idToken?: string,
): Promise<T | null> {
  const sanitizedNoteId = sanitizeNoteId(noteId)
  if (!sanitizedNoteId) {
    return null
  }

  const config = getFirebaseConfig()
  if (!isFirebaseConfigured()) {
    return null
  }

  try {
    if (config.databaseUrl) {
      const res = await fetch(getRealtimeDatabaseUrl(config, sanitizedNoteId, idToken), {
        method: 'GET',
        headers: getJsonHeaders(),
      })
      if (!res.ok) return null
      return (await res.json()) as T
    }

    const res = await fetch(getFirestoreDocumentUrl(config, sanitizedNoteId), {
      method: 'GET',
      headers: getJsonHeaders(idToken),
    })
    if (!res.ok) return null

    const json = (await res.json()) as {
      fields?: Record<string, Record<string, unknown>>
    }
    if (!json.fields) return null

    const doc: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(json.fields)) {
      if ('stringValue' in value) {
        const stringValue = value.stringValue
        if (typeof stringValue !== 'string') continue
        if (
          (stringValue.startsWith('{') && stringValue.endsWith('}')) ||
          (stringValue.startsWith('[') && stringValue.endsWith(']'))
        ) {
          try {
            doc[key] = JSON.parse(stringValue)
          } catch {
            doc[key] = stringValue
          }
        } else {
          doc[key] = stringValue
        }
      } else if ('integerValue' in value) {
        doc[key] = Number(value.integerValue)
      } else if ('doubleValue' in value) {
        doc[key] = Number(value.doubleValue)
      } else if ('booleanValue' in value) {
        doc[key] = Boolean(value.booleanValue)
      }
    }
    return doc as T
  } catch {
    return null
  }
}

export async function deleteNoteFromFirebase(
  noteId: string,
  idToken?: string,
): Promise<boolean> {
  const sanitizedNoteId = sanitizeNoteId(noteId)
  if (!sanitizedNoteId) {
    return false
  }

  const config = getFirebaseConfig()
  if (!isFirebaseConfigured()) {
    return false
  }

  try {
    if (config.databaseUrl) {
      const res = await fetch(getRealtimeDatabaseUrl(config, sanitizedNoteId, idToken), {
        method: 'DELETE',
        headers: getJsonHeaders(),
      })
      return res.ok
    }

    const res = await fetch(getFirestoreDocumentUrl(config, sanitizedNoteId), {
      method: 'DELETE',
      headers: getJsonHeaders(idToken),
    })
    return res.ok
  } catch {
    return false
  }
}
