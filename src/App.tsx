import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type SyntheticEvent,
  type ReactNode,
} from 'react'
import {
  Clock,
  Copy,
  Check,
  Share2,
  Lock,
  PlusCircle,
  FileText,
  Flame,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  QrCode,
  Trash2,
  ChevronRight,
  HelpCircle,
  MessageCircle,
  History,
  LogOut,
  AlertCircle,
  Palette,
  Video,
  BookOpen,
  Globe,
  Layers,
  ChevronDown,
} from 'lucide-react'
import {
  type NoteItem,
  type ProductIconName,
  PRODUCT_TEMPLATES,
  EXPIRATION_MS,
  encodePayload,
  decodePayload,
  generateNoteId,
  encryptString,
  decryptString,
} from './data'
import {
  saveNoteToFirebase,
  fetchNoteFromFirebase,
  deleteNoteFromFirebase,
  signInWithGoogle,
  signOutGoogle,
} from './firebase'

const AUTH_STORAGE_KEY = 'digikarya_notes_auth'
const HISTORY_STORAGE_KEY = 'digikarya_notes_history'
const SESSION_TTL_MS = 30 * 60 * 1000
const NOTE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
const LEGACY_ENCRYPTED_NOTE_MESSAGE = 'Note lama tanpa enkripsi — hubungi admin untuk rotasi'

type AdminSession = {
  v: 1
  exp: number
  email: string
}

type HistoryItem = {
  id: string
  title: string
  createdAt: number
  expiresAt: number
  category: NoteItem['category']
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readAdminSession = (): AdminSession | null => {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (
      !isRecord(parsed) ||
      parsed.v !== 1 ||
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp <= Date.now() ||
      typeof parsed.email !== 'string' ||
      !parsed.email.includes('@')
    ) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    return { v: 1, exp: parsed.exp, email: parsed.email }
  } catch {
    try {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
    } catch {
      // Ignore unavailable storage.
    }
    return null
  }
}

const isHistoryCategory = (
  value: unknown,
): value is NonNullable<NoteItem['category']> => {
  return (
    value === 'akun' ||
    value === 'panduan' ||
    value === 'voucher' ||
    value === 'order' ||
    value === 'umum'
  )
}

const sanitizeHistoryItem = (value: unknown): HistoryItem | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !NOTE_ID_PATTERN.test(value.id) ||
    typeof value.title !== 'string' ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    (value.category !== undefined && !isHistoryCategory(value.category))
  ) {
    return null
  }

  return {
    id: value.id,
    title: value.title,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    category: value.category,
  }
}

const migrateStoredHistory = (raw: string): HistoryItem[] => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(HISTORY_STORAGE_KEY)
      return []
    }

    const uniqueItems = new Map<string, HistoryItem>()
    for (const candidate of parsed) {
      const item = sanitizeHistoryItem(candidate)
      if (item) uniqueItems.set(item.id, item)
    }

    const migrated = Array.from(uniqueItems.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 50)
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(migrated))
    return migrated
  } catch {
    localStorage.removeItem(HISTORY_STORAGE_KEY)
    return []
  }
}

export function App() {
  // Navigation views:
  // - 'loading': Initial router preloader checking URL parameters
  // - 'auth': PIN Login screen for Admin / Creator
  // - 'create': Admin note creator panel (Authorized only)
  // - 'history': Admin saved notes list (Authorized only, path: /history)
  // - 'view': Public / direct note reader (Accessed via unique path /:id or hash / query)
  const [view, setView] = useState<'loading' | 'auth' | 'create' | 'history' | 'view'>('loading')

  // Client-side auth only gates this UI; it is not a replacement for backend authentication and authorization.
  const [adminSession, setAdminSession] = useState<AdminSession | null>(readAdminSession)
  const isAdminAuthenticated = adminSession !== null
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  // Current Active Note being viewed (Client reader)
  const [currentNote, setCurrentNote] = useState<NoteItem | null>(null)
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null)
  const [isLoadingNote, setIsLoadingNote] = useState(false)
  const [noteNotFound, setNoteNotFound] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const [remainingTime, setRemainingTime] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedContent, setCopiedContent] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  // Creation Form State (Admin Only) - Defaults to Google AI Pro template
  const defaultTpl = PRODUCT_TEMPLATES[0]
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(defaultTpl.id)
  const [formTitle, setFormTitle] = useState(defaultTpl.title)
  const [formContent, setFormContent] = useState(defaultTpl.content)
  const [formCategory, setFormCategory] = useState<NoteItem['category']>(defaultTpl.category)
  const [formAuthor, setFormAuthor] = useState('Admin DigiKarya')
  const [formBadgeText, setFormBadgeText] = useState(defaultTpl.defaultBadge)
  const [formTags, setFormTags] = useState<string[]>(defaultTpl.tags)
  const [formPassword, setFormPassword] = useState('')
  const [formBurnAfterRead, setFormBurnAfterRead] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Custom template picker (non-native dropdown)
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
  const templatePickerRef = useRef<HTMLDivElement>(null)

  // Close template picker on outside click / Escape
  useEffect(() => {
    if (!isTemplatePickerOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (templatePickerRef.current && !templatePickerRef.current.contains(e.target as Node)) {
        setIsTemplatePickerOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsTemplatePickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isTemplatePickerOpen])

  // Local History stored in localStorage (Admin Only)
  const [recentNotes, setRecentNotes] = useState<HistoryItem[]>([])
  const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; title: string; isAll?: boolean } | null>(null)
  const burnDeleteStartedRef = useRef<Set<string>>(new Set())
  const expiryDeleteStartedRef = useRef<Set<string>>(new Set())
  const activeNoteIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!adminSession) return

    const remaining = adminSession.exp - Date.now()
    if (remaining <= 0) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      setAdminSession(null)
      setView('auth')
      return
    }

    const timeout = window.setTimeout(() => {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      setAdminSession(null)
      setView('auth')
    }, remaining)

    return () => window.clearTimeout(timeout)
  }, [adminSession])

  // Helper to render URL text as aesthetic clickable anchor links
  const renderFormattedContent = (text: string): ReactNode => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = text.split(urlRegex)

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#854d0e] hover:text-[#5c350a] bg-[#fefce8] hover:bg-[#fef9c3] px-1.5 py-0.5 rounded-md border border-[#fde047] transition shadow-2xs underline decoration-[#d97706]/40 underline-offset-2 break-all"
          >
            <span>{part}</span>
            <ExternalLink className="w-3 h-3 text-[#b45309] shrink-0 inline" />
          </a>
        )
      }
      return part
    })
  }

  // Helper to render lucide icon component dynamically
  const renderProductIcon = (iconName: ProductIconName, className = 'w-4 h-4') => {
    switch (iconName) {
      case 'sparkles':
        return <Sparkles className={`${className} text-amber-500`} />
      case 'palette':
        return <Palette className={`${className} text-purple-500`} />
      case 'video':
        return <Video className={`${className} text-blue-500`} />
      case 'book-open':
        return <BookOpen className={`${className} text-emerald-500`} />
      case 'message-circle':
        return <MessageCircle className={`${className} text-green-500`} />
      case 'globe':
        return <Globe className={`${className} text-sky-500`} />
      case 'file-text':
      default:
        return <FileText className={`${className} text-stone-500`} />
    }
  }

  // Apply template helper
  const handleSelectTemplateById = (templateId: string) => {
    const found = PRODUCT_TEMPLATES.find((t) => t.id === templateId)
    if (!found) return
    setSelectedTemplateId(found.id)
    setFormTitle(found.title)
    setFormContent(found.content)
    setFormCategory(found.category)
    setFormBadgeText(found.defaultBadge)
    setFormTags(found.tags)
  }

  // Initial Routing / URL Parsing
  useEffect(() => {
    // 1. Load history from localStorage for admin
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (saved) {
        setRecentNotes(migrateStoredHistory(saved))
      }
    } catch {
      // ignore storage error
    }

    parseUrlAndRoute()

    window.addEventListener('hashchange', parseUrlAndRoute)
    window.addEventListener('popstate', parseUrlAndRoute)
    return () => {
      window.removeEventListener('hashchange', parseUrlAndRoute)
      window.removeEventListener('popstate', parseUrlAndRoute)
    }
  }, [isAdminAuthenticated])

  const parseUrlAndRoute = async () => {
    const hash = window.location.hash.replace(/^#/, '')
    const urlParams = new URLSearchParams(window.location.search)
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '')

    // 1. Check direct path /history (SPA history route)
    if (rawPath === 'history' || hash === 'history') {
      if (isAdminAuthenticated) {
        setView('history')
      } else {
        setView('auth')
      }
      return
    }

    // 2. Check direct path /:id (e.g. /nhb7b34r)
    if (rawPath && rawPath !== 'index.html' && !rawPath.includes('.')) {
      const noteId = rawPath
      setView('view')
      setIsLoadingNote(true)
      setNoteNotFound(false)
      await fetchNoteById(noteId)
      return
    }

    // 3. Fallback / legacy support: query or hash param (e.g. ?note=xxx, #note:xxx, #id:xxx)
    const noteParam = urlParams.get('note') || hash
    if (noteParam) {
      if (noteParam.startsWith('note:')) {
        const payloadStr = noteParam.slice(5)
        const note = decodePayload<NoteItem>(payloadStr)
        if (note) {
          loadNote(note)
          return
        }
      } else if (noteParam.startsWith('id:')) {
        const noteId = noteParam.slice(3)
        setView('view')
        setIsLoadingNote(true)
        setNoteNotFound(false)
        await fetchNoteById(noteId)
        return
      }
    }

    // 4. Root Route (Protected: only accessible with Admin PIN authorization)
    if (isAdminAuthenticated) {
      setView('create')
    } else {
      setView('auth')
    }
  }

  const deleteExpiredNote = (note: NoteItem) => {
    if (expiryDeleteStartedRef.current.has(note.id)) return
    expiryDeleteStartedRef.current.add(note.id)
    void deleteNoteFromFirebase(note.id).catch(() => {})
  }

  const markNoteAsRead = (note: NoteItem) => {
    if (
      !note.burnAfterRead ||
      Date.now() > note.expiresAt ||
      burnDeleteStartedRef.current.has(note.id)
    ) {
      return
    }

    burnDeleteStartedRef.current.add(note.id)
    void deleteNoteFromFirebase(note.id).catch(() => {})
  }

  const loadNote = (note: NoteItem) => {
    activeNoteIdRef.current = note.id
    setCurrentNote(note)
    setView('view')
    setNoteNotFound(false)
    setIsLoadingNote(false)
    setPasswordInput('')
    setDecryptedContent(null)
    setCopiedContent(false)
    setShowQrModal(false)

    const expired = Date.now() > note.expiresAt
    setIsExpired(expired)
    if (expired) {
      deleteExpiredNote(note)
      setIsUnlocked(false)
      setUnlockError(null)
      return
    }

    if (note.isEncrypted) {
      setIsUnlocked(false)
      setUnlockError(note.crypto ? null : LEGACY_ENCRYPTED_NOTE_MESSAGE)
      return
    }

    setIsUnlocked(true)
    setDecryptedContent(note.content)
    setUnlockError(null)
    markNoteAsRead(note)
  }

  const fetchNoteById = async (noteId: string) => {
    setView('view')
    setIsLoadingNote(true)
    setNoteNotFound(false)
    setCurrentNote(null)
    setDecryptedContent(null)
    setIsExpired(false)
    activeNoteIdRef.current = null

    if (!NOTE_ID_PATTERN.test(noteId)) {
      setIsLoadingNote(false)
      setNoteNotFound(true)
      return
    }

    try {
      const fetched = await fetchNoteFromFirebase<NoteItem>(noteId)
      setIsLoadingNote(false)
      if (fetched?.id === noteId) {
        loadNote(fetched)
        return
      }
    } catch {
      setIsLoadingNote(false)
    }

    setNoteNotFound(true)
  }

  // Countdown timer ticker for remaining expiration
  useEffect(() => {
    if (!currentNote) return

    const updateTimer = () => {
      const now = Date.now()
      const diff = currentNote.expiresAt - now

      if (diff <= 0) {
        if (!expiryDeleteStartedRef.current.has(currentNote.id)) {
          deleteExpiredNote(currentNote)
          setPasswordInput('')
          setDecryptedContent(null)
          setIsUnlocked(false)
          setIsExpired(true)
        }
        setRemainingTime('Expired')
        return
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)

        setRemainingTime(
          `${hours.toString().padStart(2, '0')}j ${minutes
            .toString()
            .padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}d`,
        )
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [currentNote])

  // Save history to localStorage
  const saveToHistory = (note: NoteItem) => {
    const historyItem: HistoryItem = {
      id: note.id,
      title: note.title,
      createdAt: note.createdAt,
      expiresAt: note.expiresAt,
      category: note.category,
    }

    setRecentNotes((prev) => {
      const filtered = prev.filter((item) => item.id !== note.id)
      const updated: HistoryItem[] = [historyItem, ...filtered].slice(0, 50)
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated))
      } catch {
        // storage overflow fallback
      }
      return updated
    })
  }

  // Delete single item from history
  const handleDeleteHistoryItem = (idToDelete: string) => {
    setRecentNotes((prev) => {
      const updated = prev.filter((item) => item.id !== idToDelete)
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated))
      } catch {
        // ignore
      }
      return updated
    })
    setDeleteCandidate(null)
  }

  // Delete all items from history
  const handleClearAllHistory = () => {
    setRecentNotes([])
    localStorage.removeItem(HISTORY_STORAGE_KEY)
    setDeleteCandidate(null)
  }

  // Handle Admin Google OAuth Authentication (allowlist email)
  const handleGoogleSignIn = async () => {
    if (isGoogleLoading) return
    setGoogleError(null)
    setIsGoogleLoading(true)

    try {
      const email = await signInWithGoogle()
      const now = Date.now()
      const nextSession: AdminSession = {
        v: 1,
        exp: now + SESSION_TTL_MS,
        email,
      }
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
      setAdminSession(nextSession)
      setGoogleError(null)

      const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '')
      setView(rawPath === 'history' ? 'history' : 'create')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message === 'NOT_ALLOWED') {
        setGoogleError('Email ini tidak terdaftar sebagai admin.')
      } else if (message.includes('auth/operation-not-allowed')) {
        setGoogleError('Login Google belum diaktifkan — hubungi admin.')
      } else if (message.includes('auth/popup-closed-by-user')) {
        setGoogleError('Login dibatalkan.')
      } else if (message.includes('auth/unauthorized-domain')) {
        setGoogleError('Domain ini belum diizinkan — hubungi admin.')
      } else {
        setGoogleError('Login Google gagal — coba lagi.')
      }
    } finally {
      setIsGoogleLoading(false)
    }
  }

  const handleLogout = () => {
    try {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
    } catch {
      // Ignore unavailable storage.
    }
    void signOutGoogle()
    setAdminSession(null)
    setDecryptedContent(null)
    setCurrentNote(null)
    activeNoteIdRef.current = null
    window.history.pushState({}, '', '/')
    setView('auth')
  }

  // Handle Note Creation & Sync to Firebase + Clean /:id Path
  const handleCreateNote = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!formContent.trim()) return

    setIsSaving(true)
    setCreateError(null)

    try {
      const now = Date.now()
      const newNoteId = generateNoteId()
      let storedContent = formContent
      let cryptoMetadata: NoteItem['crypto']

      if (formPassword) {
        const enc = await encryptString(formContent, formPassword)
        storedContent = enc.ciphertextB64
        cryptoMetadata = {
          iv: enc.ivB64,
          salt: enc.saltB64,
        }
      } else {
        // Plaintext is allowed only for notes explicitly classified as non-sensitive.
      }

      const newNote: NoteItem = {
        id: newNoteId,
        title: formTitle.trim() || `DigiKarya Note #${newNoteId.toUpperCase()}`,
        content: storedContent,
        createdAt: now,
        expiresAt: now + EXPIRATION_MS,
        author: formAuthor.trim() || 'Admin DigiKarya',
        category: formCategory,
        burnAfterRead: formBurnAfterRead,
        tags: formTags.length > 0 ? formTags : undefined,
        isEncrypted: Boolean(formPassword),
        crypto: cryptoMetadata,
        badge: formBadgeText.trim()
          ? {
              text: formBadgeText.trim(),
              color: formCategory === 'akun' ? 'amber' : 'emerald',
            }
          : undefined,
      }

      const firebaseSaved = await saveNoteToFirebase(
        newNote as unknown as Record<string, unknown>,
      )

      if (firebaseSaved) {
        window.history.pushState({}, '', `/${newNoteId}`)
      } else {
        const encoded = encodePayload(newNote as unknown as Record<string, unknown>)
        window.location.hash = `note:${encoded}`
      }

      saveToHistory(newNote)
      loadNote(newNote)
    } catch {
      setCreateError('Gagal membuat note. Periksa konfigurasi dan coba lagi.')
    } finally {
      setFormPassword('')
      setIsSaving(false)
    }
  }

  const handleCopyLink = useCallback(async (textToCopy?: string) => {
    const link = textToCopy || window.location.href
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback using text selection
      const textArea = document.createElement('textarea')
      textArea.value = link
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try {
        navigator.clipboard.writeText(textArea.value).catch(() => {})
      } finally {
        document.body.removeChild(textArea)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    }
  }, [])

  const handleCopyContent = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedContent(true)
      setTimeout(() => setCopiedContent(false), 2500)
    } catch {
      // ignore
    }
  }, [])

  const handleShare = async () => {
    if (navigator.share && currentNote) {
      try {
        await navigator.share({
          title: currentNote.title,
          text: `[DigiKarya Notes 48 Jam] ${currentNote.title} - DigiKarya Store`,
          url: window.location.href,
        })
      } catch {
        // Share cancelled or not supported
      }
    } else {
      handleCopyLink()
    }
  }

  const handleUnlock = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setUnlockError(null)

    const note = currentNote
    if (!note?.isEncrypted) return

    if (!note.crypto) {
      setIsUnlocked(false)
      setDecryptedContent(null)
      setUnlockError(LEGACY_ENCRYPTED_NOTE_MESSAGE)
      return
    }

    if (!passwordInput) {
      setUnlockError('Masukkan password untuk membuka note.')
      return
    }

    const noteId = note.id
    try {
      const plaintext = await decryptString(
        {
          ciphertextB64: note.content,
          ivB64: note.crypto.iv,
          saltB64: note.crypto.salt,
        },
        passwordInput,
      )

      if (activeNoteIdRef.current !== noteId) return
      if (Date.now() > note.expiresAt) {
        deleteExpiredNote(note)
        setPasswordInput('')
        setIsExpired(true)
        setIsUnlocked(false)
        setDecryptedContent(null)
        return
      }

      setPasswordInput('')
      setDecryptedContent(plaintext)
      setIsUnlocked(true)
      setUnlockError(null)
      markNoteAsRead(note)
    } catch {
      if (activeNoteIdRef.current !== noteId) return
      setPasswordInput('')
      setIsUnlocked(false)
      setDecryptedContent(null)
      setUnlockError('Password salah atau data note rusak. Silakan coba lagi.')
    }
  }

  const selectedTemplate = useMemo(() => {
    return PRODUCT_TEMPLATES.find((t) => t.id === selectedTemplateId) || PRODUCT_TEMPLATES[0]
  }, [selectedTemplateId])

  return (
    <div className="min-h-screen bg-[#fcfaf2] text-[#1c1917] paper-grid flex flex-col justify-between selection:bg-[#fde047] selection:text-[#1c1917] relative w-full overflow-x-hidden">
      {/* Top Brand Banner & Navigation - ONLY SHOWN ON ADMIN & AUTH MODES (HIDDEN ON FOCUSED NOTE VIEW) */}
      {view !== 'view' && view !== 'loading' && (
        <header className="w-full max-w-4xl mx-auto px-3 sm:px-6 pt-3 sm:pt-6 pb-2">
          <div className="bg-[#fefce8] border border-[#e7e0d6] rounded-2xl shadow-xs p-3 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4 backdrop-blur-sm">
            {/* Logo & Brand Info */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="relative shrink-0">
                <img
                  src="/logo.png"
                  alt="DigiKarya Logo"
                  className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl object-contain shadow-2xs border border-[#e7e0d6] bg-white p-1"
                />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-500"></span>
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-extrabold text-base sm:text-xl tracking-tight text-[#1c1917] truncate">
                    DigiKarya <span className="text-[#ee4d2d]">Notes</span>
                  </h1>
                  <span className="bg-[#fef08a] text-[#854d0e] text-[10px] sm:text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border border-[#fde047]">
                    48h Temp Note
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-[#78716c] font-medium flex items-center gap-1.5 truncate mt-0.5">
                  <span className="truncate">Catatan Kredensial & Pesan Ramah Pelanggan</span>
                </p>
              </div>
            </div>

            {/* Action Tabs / Status Navigation */}
            <div className="flex items-center justify-end sm:justify-start gap-1.5 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#fef08a]/60">
              {isAdminAuthenticated ? (
                <div className="flex items-center w-full sm:w-auto justify-between sm:justify-start gap-1 bg-[#f5f0e6] p-1 rounded-xl border border-[#e7e0d6]">
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/')
                      setView('create')
                    }}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      view === 'create'
                        ? 'bg-white text-[#1c1917] shadow-xs'
                        : 'text-[#78716c] hover:text-[#1c1917]'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Buat Note</span>
                  </button>
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/history')
                      setView('history')
                    }}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      view === 'history'
                        ? 'bg-white text-[#1c1917] shadow-xs'
                        : 'text-[#78716c] hover:text-[#1c1917]'
                    }`}
                  >
                    <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Riwayat</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-lg text-xs text-[#78716c] hover:text-red-600 hover:bg-white transition cursor-pointer shrink-0"
                    title="Logout Otorisasi"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center w-full sm:w-auto gap-1 text-[11px] sm:text-xs text-[#78716c] bg-[#f5f0e6] px-3 py-1.5 rounded-xl border border-[#e7e0d6]">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-[#1c1917]">Protected Admin Access</span>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Main Container Area */}
      <main className="w-full max-w-4xl mx-auto px-2.5 sm:px-6 py-2.5 sm:py-5 flex-1 flex flex-col items-center justify-center">
        {/* ======================================================== */}
        {/* VIEW -1: INITIAL ROUTER PRELOADER (NO GLITCH) */}
        {/* ======================================================== */}
        {view === 'loading' && (
          <div className="w-full max-w-md animate-in fade-in duration-150 text-center py-12">
            <div className="bg-[#fffdf0] border-2 border-[#fef08a] rounded-3xl p-8 shadow-xl shadow-amber-900/5 paper-lines text-center relative">
              <div className="w-10 h-10 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs font-bold text-[#78716c] tracking-wide">Memuat Catatan DigiKarya...</p>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 0: ROOT AUTH SCREEN (PROTECTED ROOT ACCESS) */}
        {/* ======================================================== */}
        {view === 'auth' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#fffdf0] border-2 border-[#fef08a] rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl shadow-amber-900/5 paper-lines text-center relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-32 h-6 washi-tape rounded-xs rotate-[-1deg] border border-[#fde047]/60 flex items-center justify-center">
                <span className="font-hand text-xs font-bold text-[#854d0e]">RESTRICTED ACCESS</span>
              </div>

              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-100/80 border border-[#fde68a] flex items-center justify-center text-amber-700 mx-auto mt-2 mb-3 sm:mb-4 shadow-inner">
                <Lock className="w-6 h-6 sm:w-7 sm:h-7 text-amber-700" />
              </div>

              <h2 className="text-base sm:text-xl font-black text-[#1c1917] tracking-tight mb-1">
                Otorisasi Akses DigiKarya Hub
              </h2>
              <p className="text-xs text-[#78716c] max-w-xs mx-auto mb-5 leading-relaxed">
                Root path tidak dapat diakses publik. Masuk dengan akun Google admin untuk membuat catatan baru,
                atau buka link unik dari admin untuk membaca pesan.
              </p>

              <div className="space-y-3 max-w-xs mx-auto">
                {adminSession && (
                  <p className="text-xs text-[#78716c]">
                    Masuk sebagai <span className="font-bold text-[#1c1917]">{adminSession.email}</span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                  className="w-full py-2.5 bg-white hover:bg-stone-50 text-[#1c1917] text-xs font-bold rounded-xl border border-[#e7e0d6] shadow-xs transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGoogleLoading ? (
                    <span className="w-3.5 h-3.5 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.6-5 3.6-8.9z"/>
                      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.7 2.9v.1C3.5 21.3 7.4 24 12 24z"/>
                      <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.7-2.9-.1.1C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.3l3.9-2.9z"/>
                      <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.5 2.7 1.3 6.7l3.9 2.9c1-2.9 3.7-4.9 6.8-4.9z"/>
                    </svg>
                  )}
                  <span>{isGoogleLoading ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
                </button>
                {googleError && (
                  <p className="text-xs font-semibold text-red-600 mt-2 flex items-center justify-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{googleError}</span>
                  </p>
                )}
                <p className="text-[11px] text-[#a8a29e] leading-relaxed">
                  Hanya email admin terdaftar yang bisa masuk.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 1: READ / ACTIVE NOTE (FOCUSED ESTETIK & COMPACT) */}
        {/* ======================================================== */}
        {view === 'view' && (
          <div className="w-full max-w-xl animate-in fade-in zoom-in-95 duration-200">
            {isLoadingNote ? (
              <div className="bg-[#fffdf0] border-2 border-[#fef08a] rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center shadow-xl">
                <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-bold text-[#78716c]">Memuat Catatan...</p>
              </div>
            ) : noteNotFound ? (
              <div className="bg-[#fffdf0] border-2 border-[#fef08a] rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-center shadow-xl">
                <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-red-500 mx-auto mb-3" />
                <h3 className="font-bold text-base text-[#1c1917] mb-1">Catatan Tidak Ditemukan</h3>
                <p className="text-xs text-[#78716c] mb-4">
                  Link ini mungkin telah kadaluarsa (melewati 48 jam), telah terhapus, atau URL tidak valid.
                </p>
                <a
                  href="https://wa.me/6282312480063"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#059669] text-white text-xs font-bold rounded-xl"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Hubungi Admin DigiKarya
                </a>
              </div>
            ) : currentNote ? (
              isExpired ? (
                <div className="bg-[#fffdf0] border-2 border-[#fef08a] rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-center shadow-xl">
                  <Clock className="w-10 h-10 sm:w-12 sm:h-12 text-red-500 mx-auto mb-3" />
                  <h3 className="font-bold text-base text-[#1c1917] mb-1">
                    Catatan Kedaluwarsa
                  </h3>
                  <p className="text-xs text-[#78716c]">
                    Catatan ini sudah tidak tersedia.
                  </p>
                </div>
              ) : (
              <div className="w-full">
                {/* Main Aesthetic Paper Note Container (Kuning Estetik) */}
                <div className="relative bg-[#fffdf0] border-2 border-[#fef08a] rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 shadow-xl shadow-amber-900/5 paper-lines transition-all">
                  {/* Aesthetic Washi Tape Decorative Elements */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-28 sm:w-32 h-5 sm:h-6 washi-tape rounded-xs rotate-[-1deg] border border-[#fde047]/60 flex items-center justify-center">
                    <span className="font-hand text-[11px] sm:text-xs font-bold text-[#854d0e] tracking-wider opacity-80">
                      DIGIKARYA NOTES
                    </span>
                  </div>

                  {/* Compact Header Note: Badges + Countdown Kadaluarsa */}
                  <div className="pt-2 sm:pt-0 mb-2.5 sm:mb-3.5 border-b border-[#fef08a]/80 pb-2.5 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-[#fef08a] text-[#854d0e] border border-[#fde047]">
                        {currentNote.category?.toUpperCase() || 'CATATAN'}
                      </span>
                      {currentNote.badge && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {currentNote.badge.text}
                        </span>
                      )}
                      {currentNote.burnAfterRead && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-red-600" />
                          Burn
                        </span>
                      )}
                    </div>

                    {/* Integrated Expiry Badge in Note Header */}
                    <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-medium bg-[#fffbeb] border border-[#fde68a] text-[#92400e] px-2 py-0.5 rounded-lg shadow-2xs">
                      <Clock className="w-3 h-3 animate-spin-slow text-[#d97706] shrink-0" />
                      <span>
                        {isExpired ? (
                          <strong className="text-red-600">Expired</strong>
                        ) : (
                          <>
                            Sisa: <strong className="font-mono text-[#b45309]">{remainingTime}</strong>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Note Title */}
                  <h2 className="text-base sm:text-xl font-black text-[#1c1917] tracking-tight mb-2 sm:mb-3 break-words">
                    {currentNote.title}
                  </h2>

                  {currentNote.burnAfterRead && (
                    <p className="mb-2 text-[11px] font-semibold text-red-700">
                      Note ini akan dihapus otomatis setelah dibaca.
                    </p>
                  )}

                  {/* Note Content / Decryption Lock Screen */}
                  {currentNote.isEncrypted && !isUnlocked ? (
                    <div className="my-3 sm:my-4 p-3.5 sm:p-5 bg-[#fffbeb] border-2 border-dashed border-[#fde68a] rounded-xl text-center flex flex-col items-center">
                      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mb-2 shadow-inner">
                        <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <h3 className="font-bold text-xs sm:text-sm text-[#1c1917] mb-1">
                        Catatan Dilindungi Password
                      </h3>
                      <p className="text-[11px] text-[#78716c] max-w-xs mb-3">
                        Masukkan password untuk membuka isi pesan.
                      </p>

                      {currentNote.crypto ? (
                        <form onSubmit={handleUnlock} className="w-full max-w-xs flex gap-1.5">
                          <input
                            type="password"
                            required
                            autoComplete="current-password"
                            placeholder="Password..."
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-[#e7e0d6] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 bg-[#1c1917] hover:bg-neutral-800 text-white text-xs font-bold rounded-lg shadow-xs transition shrink-0 cursor-pointer"
                          >
                            Buka
                          </button>
                        </form>
                      ) : (
                        <p className="text-[11px] font-semibold text-red-600 max-w-xs">
                          {LEGACY_ENCRYPTED_NOTE_MESSAGE}
                        </p>
                      )}
                      {currentNote.crypto && unlockError && (
                        <p className="text-[11px] font-semibold text-red-600 mt-1.5">
                          {unlockError}
                        </p>
                      )}
                    </div>
                  ) : isUnlocked && decryptedContent !== null ? (
                    <div className="my-2 sm:my-3">
                      {/* Note Body Text Container with Clickable Aesthetic Amber/Brown Links */}
                      <div className="bg-[#fffdf5]/90 border border-[#fef08a] rounded-xl p-3 sm:p-4 font-mono text-[11px] sm:text-xs leading-relaxed text-[#292524] whitespace-pre-wrap selection:bg-[#fde047] relative group shadow-2xs break-words overflow-x-auto">
                        {renderFormattedContent(decryptedContent)}

                        {/* Quick copy text button in corner */}
                        <button
                          onClick={() => handleCopyContent(decryptedContent)}
                          className="mt-2.5 sm:mt-0 sm:absolute sm:top-2 sm:right-2 p-1.5 rounded-lg bg-white/90 hover:bg-white text-[#78716c] hover:text-[#1c1917] border border-[#e7e0d6] shadow-2xs transition flex items-center gap-1 text-[10px] sm:text-xs cursor-pointer"
                          title="Salin Teks Isi Note"
                        >
                          {copiedContent ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700 font-sans font-bold">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span className="font-sans font-medium">Salin Teks</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Tags if available */}
                  {currentNote.tags && currentNote.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 my-2">
                      {currentNote.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] sm:text-[10px] font-medium bg-[#fefce8] text-[#854d0e] px-2 py-0.5 rounded-md border border-[#fde047]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Compact Bottom Action Bar */}
                  <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-[#fef08a]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyLink()}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1c1917] hover:bg-neutral-800 text-white shadow-xs transition active:scale-95 cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Salin Link</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleShare}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#fffbeb] hover:bg-[#fef9c3] text-[#854d0e] border border-[#fde047] transition shadow-2xs cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Bagikan</span>
                      </button>

                      <button
                        onClick={() => setShowQrModal(true)}
                        className="p-1.5 rounded-lg text-xs font-semibold bg-[#fffbeb] hover:bg-[#fef9c3] text-[#854d0e] border border-[#fde047] transition shadow-2xs cursor-pointer shrink-0"
                        title="Tampilkan Link Note"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 text-[10px] sm:text-[11px] text-[#78716c]">
                      <span className="truncate">Oleh: <strong className="text-[#1c1917]">{currentNote.author}</strong></span>
                      <span className="text-[#d6d3d1]">•</span>
                      <span className="font-mono text-[#a8a29e]">ID: {currentNote.id}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Helper / Customer Care Bar */}
                <div className="mt-2.5 flex items-center justify-between text-[11px] sm:text-xs text-[#78716c] px-1">
                  <span className="flex items-center gap-1 truncate">
                    <HelpCircle className="w-3 h-3 shrink-0 text-[#a8a29e]" />
                    <span>Butuh bantuan akun?</span>
                  </span>
                  <a
                    href="https://wa.me/6282312480063"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[#059669] hover:text-[#047857] font-semibold underline decoration-emerald-300 shrink-0"
                  >
                    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>WA 0823-1248-0063</span>
                  </a>
                </div>
              </div>
              )
            ) : null}
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: CREATE NEW TEMPORARY NOTE (AUTHORIZED ADMIN ONLY) */}
        {/* ======================================================== */}
        {view === 'create' && isAdminAuthenticated && (
          <div className="w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#fffdf0] border-2 border-[#fef08a] rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xl shadow-amber-900/5 paper-lines relative">
              {/* Tape deco */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-28 h-5 sm:h-6 washi-tape rounded-xs rotate-[1deg] border border-[#fde047]/60 flex items-center justify-center">
                <span className="font-hand text-[11px] sm:text-xs font-bold text-[#854d0e]">NEW 48H NOTE</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 sm:mb-4 pt-2">
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-[#1c1917] tracking-tight flex items-center gap-2">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-[#ee4d2d] shrink-0" />
                    <span>Tulis Catatan / Kredensial Baru</span>
                  </h2>
                  <p className="text-[11px] sm:text-xs text-[#78716c] font-medium">
                    Pilih template produk di bawah agar pesan ramah terisi otomatis.
                  </p>
                </div>
                <div className="bg-[#fef08a] text-[#854d0e] font-mono text-xs font-bold px-2.5 py-1 rounded-lg border border-[#fde047] self-start sm:self-auto">
                  ⏱️ 48 JAM
                </div>
              </div>

              {/* Template Quick Selection — Custom Pretty Picker */}
              <div className="mb-4 sm:mb-5 bg-[#fffbeb] border border-[#fde68a] rounded-2xl p-3 sm:p-3.5 shadow-2xs">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[#854d0e] uppercase tracking-wider mb-2">
                  <Layers className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Pilih Template Produk:</span>
                </span>

                <div className="relative" ref={templatePickerRef}>
                  <button
                    type="button"
                    onClick={() => setIsTemplatePickerOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={isTemplatePickerOpen}
                    className="relative w-full flex items-center gap-2.5 pl-3 pr-9 py-2 bg-white border border-[#e7e0d6] rounded-xl text-left shadow-2xs hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors cursor-pointer"
                  >
                    <span className="shrink-0 w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
                      {renderProductIcon(selectedTemplate.iconName, 'w-4 h-4')}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs sm:text-sm font-bold text-[#1c1917] truncate">
                        {selectedTemplate.name}
                      </span>
                      <span className="block text-[10px] sm:text-[11px] text-[#a8a29e] font-medium truncate">
                        {selectedTemplate.defaultBadge}
                      </span>
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#78716c] absolute right-3 transition-transform duration-200 ${isTemplatePickerOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isTemplatePickerOpen && (
                    <div className="absolute z-30 mt-2 w-full bg-[#fffdf0] border-2 border-[#fde68a] rounded-2xl shadow-xl shadow-amber-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                      <ul role="listbox" aria-label="Template produk" className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
                        {PRODUCT_TEMPLATES.map((tpl) => {
                          const active = tpl.id === selectedTemplateId
                          return (
                            <li key={tpl.id}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  handleSelectTemplateById(tpl.id)
                                  setIsTemplatePickerOpen(false)
                                }}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-amber-100/80 border border-amber-300'
                                    : 'border border-transparent hover:bg-amber-50'
                                }`}
                              >
                                <span className="shrink-0 w-8 h-8 rounded-lg bg-white border border-[#f0e9dc] flex items-center justify-center shadow-2xs">
                                  {renderProductIcon(tpl.iconName, 'w-4 h-4')}
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-xs sm:text-sm font-bold text-[#1c1917] truncate">
                                    {tpl.name}
                                  </span>
                                  <span className="block text-[10px] sm:text-[11px] text-[#a8a29e] font-medium truncate">
                                    {tpl.defaultBadge}
                                  </span>
                                </span>
                                {active && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Input */}
              <form onSubmit={handleCreateNote} className="space-y-3 sm:space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-[11px] sm:text-xs font-bold text-[#1c1917] uppercase tracking-wider mb-1">
                    Judul Note / Keterangan Order
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Aktivasi Google AI Pro (Gemini Advanced 5TB)..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs sm:text-sm bg-white border border-[#e7e0d6] rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-sans"
                  />
                </div>

                {/* Content Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] sm:text-xs font-bold text-[#1c1917] uppercase tracking-wider">
                      Isi Pesan / Kredensial (Pesan Ramah Ringkas)
                    </label>
                    <span className="text-[10px] sm:text-[11px] text-[#78716c] font-mono">
                      {formContent.length} karakter
                    </span>
                  </div>
                  <textarea
                    required
                    rows={8}
                    placeholder="Tulis pesan ramah atau pilih salah satu dropdown template di atas..."
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs sm:text-sm bg-white border border-[#e7e0d6] rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono leading-relaxed resize-y"
                  />
                </div>

                {/* Category, Author & Badge Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold text-[#1c1917] uppercase tracking-wider mb-1">
                      Kategori Pesan
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) =>
                        setFormCategory(e.target.value as NoteItem['category'])
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-[#e7e0d6] rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium cursor-pointer"
                    >
                      <option value="akun">👑 Akun & Kredensial</option>
                      <option value="panduan">📖 Panduan & Tutorial</option>
                      <option value="order">📦 Detail Invoice Order</option>
                      <option value="voucher">🎟️ Kode Voucher / Lisensi</option>
                      <option value="umum">📝 Catatan Umum</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold text-[#1c1917] uppercase tracking-wider mb-1">
                      Pengirim / Author
                    </label>
                    <input
                      type="text"
                      placeholder="Admin DigiKarya"
                      value={formAuthor}
                      onChange={(e) => setFormAuthor(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#e7e0d6] rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold text-[#1c1917] uppercase tracking-wider mb-1">
                      Label Badge (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Google AI Pro 5TB"
                      value={formBadgeText}
                      onChange={(e) => setFormBadgeText(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#e7e0d6] rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-sans"
                    />
                  </div>
                </div>

                {/* Security Options */}
                <div className="p-3 sm:p-3.5 bg-[#fefce8] border border-[#fde68a] rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span className="text-xs font-bold text-[#1c1917]">
                        Password Protection (Opsional)
                      </span>
                    </div>
                  </div>
                  <input
                    type="password"
                    placeholder="Kosongkan bila tanpa password..."
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#e7e0d6] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="flex items-center gap-2 pt-0.5">
                    <input
                      type="checkbox"
                      id="burnAfterRead"
                      checked={formBurnAfterRead}
                      onChange={(e) => setFormBurnAfterRead(e.target.checked)}
                      className="rounded border-[#e7e0d6] text-red-600 focus:ring-red-500 shrink-0"
                    />
                    <label htmlFor="burnAfterRead" className="text-[11px] sm:text-xs text-[#78716c] select-none">
                      Tandai sebagai <span className="text-red-700 font-semibold">Self-Destruct Sekali Baca</span>
                    </label>
                  </div>
                </div>

                {createError && (
                  <p className="text-xs font-semibold text-red-600 flex items-center justify-end gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{createError}</span>
                  </p>
                )}

                {/* Submit Action */}
                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#1c1917] hover:bg-neutral-800 text-white shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-[#fde047]" />
                        <span>Generate Link 48 Jam</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 3: RECENT LOCAL NOTES HISTORY (AUTHORIZED ADMIN ONLY) */}
        {/* ======================================================== */}
        {view === 'history' && isAdminAuthenticated && (
          <div className="w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#fffdf0] border-2 border-[#fef08a] rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xl shadow-amber-900/5 paper-lines">
              <div className="flex items-center justify-between mb-4 border-b border-[#fef08a] pb-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 sm:w-5 sm:h-5 text-amber-700 shrink-0" />
                  <h2 className="text-base sm:text-lg font-bold text-[#1c1917]">Riwayat Catatan Tersimpan</h2>
                </div>
                {recentNotes.length > 0 && (
                  <button
                    onClick={() => {
                      setDeleteCandidate({ id: 'ALL', title: 'Semua Catatan Riwayat', isAll: true })
                    }}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Bersihkan Semua</span>
                  </button>
                )}
              </div>

              {recentNotes.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <FileText className="w-8 h-8 sm:w-10 sm:h-10 text-[#d6d3d1] mx-auto mb-2" />
                  <p className="text-xs sm:text-sm font-semibold text-[#78716c]">Belum ada riwayat catatan.</p>
                  <p className="text-[11px] sm:text-xs text-[#a8a29e] mt-1">
                    Catatan yang Anda buat akan otomatis tersimpan di panel ini.
                  </p>
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/')
                      setView('create')
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#1c1917] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Buat Catatan Sekarang
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 sm:space-y-3">
                  {recentNotes.map((note) => {
                    const isNoteExpired = Date.now() > note.expiresAt
                    return (
                      <div
                        key={note.id}
                        className="p-3 sm:p-3.5 bg-white border border-[#e7e0d6] hover:border-amber-400 rounded-xl transition shadow-2xs hover:shadow-xs flex items-center justify-between gap-2.5 sm:gap-3 group"
                      >
                        {/* SPA Clean Link to View Note */}
                        <div
                          onClick={() => {
                            window.history.pushState({}, '', `/${note.id}`)
                            void fetchNoteById(note.id)
                          }}
                          className="flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="text-[10px] sm:text-[11px] font-bold bg-[#fef08a] text-[#854d0e] px-2 py-0.5 rounded-md">
                              {note.category?.toUpperCase() || 'NOTE'}
                            </span>
                            {isNoteExpired ? (
                              <span className="text-[10px] sm:text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">
                                Expired
                              </span>
                            ) : (
                              <span className="text-[10px] sm:text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                Aktif (48 Jam)
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-[#a8a29e] ml-auto sm:ml-0">
                              /{note.id}
                            </span>
                          </div>
                          <h4 className="text-xs sm:text-sm font-bold text-[#1c1917] truncate group-hover:text-[#ee4d2d] transition">
                            {note.title}
                          </h4>
                          <p className="text-[11px] sm:text-xs text-[#78716c] truncate font-mono mt-0.5">
                            ID: /{note.id} • kadaluarsa{' '}
                            {new Date(note.expiresAt).toLocaleString('id-ID')}
                          </p>
                        </div>

                        {/* Action buttons on item */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCopyLink(`${window.location.origin}/${note.id}`)
                            }}
                            className="p-1.5 rounded-lg text-[#78716c] hover:text-[#1c1917] hover:bg-neutral-100 transition cursor-pointer"
                            title="Salin Link SPA"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteCandidate({ id: note.id, title: note.title })
                            }}
                            className="p-1.5 rounded-lg text-[#a8a29e] hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Hapus Dari Riwayat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <div
                            onClick={() => {
                              window.history.pushState({}, '', `/${note.id}`)
                              void fetchNoteById(note.id)
                            }}
                            className="p-1 cursor-pointer"
                          >
                            <ChevronRight className="w-4 h-4 text-[#a8a29e] group-hover:text-[#1c1917] transition" />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal with Smooth Animation Transition */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-[#e7e0d6] text-center relative animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="font-bold text-base text-[#1c1917] mb-1">
              {deleteCandidate.isAll ? 'Bersihkan Semua Riwayat?' : 'Hapus Catatan Ini?'}
            </h3>
            
            <p className="text-xs text-[#78716c] mb-4 leading-relaxed">
              {deleteCandidate.isAll ? (
                'Semua data riwayat catatan yang tersimpan di browser ini akan dihapus.'
              ) : (
                <>
                  Hapus <strong className="text-[#1c1917]">"{deleteCandidate.title}"</strong> dari riwayat browser?
                </>
              )}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setDeleteCandidate(null)}
                className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-[#1c1917] text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (deleteCandidate.isAll) {
                    handleClearAllHistory()
                  } else {
                    handleDeleteHistoryItem(deleteCandidate.id)
                  }
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Link Modal */}
      {showQrModal && currentNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-[#e7e0d6] text-center relative animate-in zoom-in-95">
            <h3 className="font-bold text-base text-[#1c1917] mb-1">Link Note</h3>
            <p className="text-xs text-[#78716c] mb-4">
              Salin link ini untuk membuka catatan tanpa mengirim URL ke layanan eksternal.
            </p>

            {/* TODO: render QR dengan lib qrcode lokal; jangan kirim URL note ke pihak ketiga. */}
            <div className="p-3 sm:p-4 bg-[#fefce8] border border-[#fde68a] rounded-2xl mb-4">
              <p className="text-[11px] font-mono text-[#854d0e] break-all">
                {window.location.href}
              </p>
            </div>

            <button
              onClick={() => handleCopyLink()}
              className="w-full py-2.5 mb-2 bg-[#1c1917] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Tersalin!' : 'Salin Link'}
            </button>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-neutral-100 text-[#1c1917] text-xs font-bold rounded-xl cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Footer Branding matching DigiKarya Lynk Hub */}
      <footer className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-3 sm:py-6 text-center text-xs text-[#78716c]">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-[11px] sm:text-xs font-medium mb-1.5">
          <a
            href="https://digikarya-store.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#1c1917] flex items-center gap-1 transition"
          >
            <span>Lynk Store Profile</span>
            <ExternalLink className="w-3 h-3 text-[#78716c]" />
          </a>
          <span className="text-[#d6d3d1] hidden sm:inline">•</span>
          <a
            href="https://wa.me/6282312480063"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#1c1917] flex items-center gap-1 transition"
          >
            <span>WhatsApp Official</span>
            <ExternalLink className="w-3 h-3 text-[#78716c]" />
          </a>
          <span className="text-[#d6d3d1] hidden sm:inline">•</span>
          <span className="text-emerald-700 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Auto-Destruct 48 Jam
          </span>
        </div>
        <p className="text-[10px] sm:text-[11px] text-[#a8a29e]">
          &copy; {new Date().getFullYear()} DigiKarya Hub • Ephemeral Pastel Note System
        </p>
      </footer>
    </div>
  )
}

export default App
