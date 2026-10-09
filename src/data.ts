// DigiKarya Notes Data Types & Crypto Utils

export interface NoteItem {
  id: string
  title: string
  // When isEncrypted is true, content contains ciphertextB64, not plaintext.
  content: string
  createdAt: number // timestamp ms
  expiresAt: number // timestamp ms (createdAt + 48 hours)
  author: string
  category?: 'akun' | 'panduan' | 'voucher' | 'order' | 'umum'
  isEncrypted?: boolean
  /** Base64url AES-GCM IV and PBKDF2 salt, present when isEncrypted is true. */
  crypto?: {
    iv: string
    salt: string
  }
  viewsCount?: number
  burnAfterRead?: boolean
  tags?: string[]
  badge?: {
    text: string
    color: 'amber' | 'emerald' | 'rose' | 'blue'
  }
}

export type ProductIconName =
  | 'sparkles'
  | 'palette'
  | 'video'
  | 'book-open'
  | 'message-circle'
  | 'globe'
  | 'file-text'

export interface ProductTemplate {
  id: string
  name: string
  iconName: ProductIconName
  category: NoteItem['category']
  defaultBadge: string
  title: string
  content: string
  tags: string[]
}

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    id: 'google-ai-pro',
    name: 'Google AI Pro (Gemini Advanced 5TB)',
    iconName: 'sparkles',
    category: 'akun',
    defaultBadge: 'Google AI Pro 5TB',
    title: 'Aktivasi Google AI Pro (Gemini Advanced 5TB)',
    tags: ['Google AI Pro', 'Gemini Advanced', '5TB Cloud Storage'],
    content: `Halo Kak, terima kasih sudah order di DigiKarya Store!

Berikut link aktivasi Google AI Pro Anda:
https://families.google.com/join/invite/[KODE_INVITE_DI_SINI]

Benefit: Gemini Advanced 1.5 Pro, 5TB Cloud Storage Google Drive & Photos, Veo Video AI, NotebookLM Pro, Google AI Studio, integrasi Docs/Gmail.

Langkah Cepat:
1. Buka link aktivasi di atas menggunakan akun Google Anda.
2. Klik "Gabung ke Keluarga" / "Accept Invitation".
3. Buka https://one.google.com untuk verifikasi kapasitas 5TB & buka https://gemini.google.com/ untuk menggunakan Gemini Advanced.

Simpan note ini baik-baik (berlaku 48 jam). Bantuan admin WA: 0823-1248-0063.`,
  },
  {
    id: 'canva-pro',
    name: 'Canva Pro Tim',
    iconName: 'palette',
    category: 'akun',
    defaultBadge: 'Canva Pro Tim',
    title: 'Akses Undangan Canva Pro Tim',
    tags: ['Canva Pro', 'Brand Kit'],
    content: `Halo Kak, terima kasih sudah order Canva Pro di DigiKarya Store!

Link Undangan Tim:
https://www.canva.com/brand/join?token=[TOKEN_INVITE_DI_SINI]

Benefit: Full Brand Kit, Magic Studio AI, Unlimited Premium Assets & Templates, Export Kualitas Tinggi, Penghapus Background.

Langkah:
1. Buka link undangan di atas lalu login ke akun Canva Anda.
2. Pilih tim "DigiKarya VIP Team" di pojok kiri atas Canva.

Note ini aktif 48 jam. Bantuan admin WA: 0823-1248-0063.`,
  },
  {
    id: 'capcut-pro',
    name: 'CapCut Pro Desktop & Mobile',
    iconName: 'video',
    category: 'akun',
    defaultBadge: 'CapCut Pro',
    title: 'Akun Login CapCut Pro (PC & Mobile)',
    tags: ['CapCut Pro', 'Video Editing'],
    content: `Halo Kak, terima kasih sudah order CapCut Pro di DigiKarya Store!

Detail Login:
Email: [email_login]
Password: [password_login]

Benefit: Auto-Caption AI, 4K 60FPS Export, Pro Transitions & Effects, Background Remover Video, Multi-device PC/HP.

Langkah: Buka aplikasi CapCut -> Sign in with Email -> Masukkan email & password di atas.

Note ini aktif 48 jam. Bantuan admin WA: 0823-1248-0063.`,
  },
  {
    id: 'scribd-everand',
    name: 'Scribd Downloader (Link GDrive)',
    iconName: 'book-open',
    category: 'umum',
    defaultBadge: 'Scribd Download',
    title: 'Link Download Dokumen Scribd (Google Drive)',
    tags: ['Scribd', 'Download', 'Google Drive'],
    content: `Halo Kak, terima kasih sudah order jasa download Scribd di DigiKarya Store!

Dokumen Anda sudah siap! Silakan download melalui link Google Drive berikut:
[link_gdrive_dokumen]

Benefit: File PDF kualitas penuh, tersimpan aman di Google Drive, bisa diunduh kapan saja.

Langkah:
1. Buka link Google Drive di atas.
2. Klik ikon download untuk menyimpan ke perangkat Anda.

Note ini aktif 48 jam. Bantuan admin WA: 0823-1248-0063.`,
  },
  {
    id: 'nomor-whatsapp',
    name: 'Nomor WhatsApp OTP Virtual',
    iconName: 'message-circle',
    category: 'akun',
    defaultBadge: 'Nomor WA Virtual',
    title: 'Nomor WhatsApp Virtual & Kode OTP',
    tags: ['WhatsApp', 'OTP'],
    content: `Halo Kak, detail nomor WhatsApp virtual Anda:

Nomor: [nomor_hp]
Kode OTP: [kode_otp]

Benefit: Fresh Virtual Number, Verifikasi OTP Cepat, Support WA Messenger & WA Business.

Langkah: Masukkan nomor di aplikasi WA -> Masukkan kode OTP di atas -> Aktifkan PIN 2FA di setelan WA.

Note ini aktif 48 jam. Bantuan admin WA: 0823-1248-0063.`,
  },
  {
    id: 'jasa-landing-page',
    name: 'Jasa Pembuatan Landing Page',
    iconName: 'globe',
    category: 'order',
    defaultBadge: 'Landing Page Ready',
    title: 'Serah Terima Proyek Website / Landing Page',
    tags: ['Landing Page', 'Website'],
    content: `Halo Kak, proyek landing page Anda telah selesai!

Link Website: [link_preview_website]
Source Code: [link_repository_file]

Benefit: Desain Modern Responsif HP/PC, Fast Loading, Integrasi Tombol WhatsApp Direct Chat, SEO Meta Tags, Garansi Revisi 30 Hari.

Note ini aktif 48 jam. Bantuan admin WA: 0823-1248-0063.`,
  },
  {
    id: 'custom-kosong',
    name: 'Template Kustom / Format Bebas',
    iconName: 'file-text',
    category: 'umum',
    defaultBadge: 'Catatan Ramah',
    title: 'Pesan Kredensial Pelanggan DigiKarya',
    tags: ['Kredensial', 'Catatan'],
    content: `Halo Kak, terima kasih sudah bertransaksi di DigiKarya Store!

Link / Kredensial:
[masukkan link atau informasi penting di sini]

Benefit: [sebutkan benefit singkat produk dipisahkan koma].

Note ini aktif 48 jam. Bantuan admin WA: 0823-1248-0063.`,
  },
]

export const EXPIRATION_HOURS = 48
export const EXPIRATION_MS = EXPIRATION_HOURS * 60 * 60 * 1000

// WARNING: only for notes WITHOUT sensitive credentials or passwords.
// These are fallback hash-link helpers, not encryption.
export function encodePayload(data: Record<string, unknown>): string {
  try {
    const jsonStr = JSON.stringify(data)
    const utf8Bytes = new TextEncoder().encode(jsonStr)
    let binary = ''
    utf8Bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  } catch (err) {
    console.error('Failed to encode payload:', err)
    return ''
  }
}

export function decodePayload<T = unknown>(encoded: string): T | null {
  try {
    // restore standard base64 from url-safe
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) {
      base64 += '='
    }
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const jsonStr = new TextDecoder().decode(bytes)
    return JSON.parse(jsonStr) as T
  } catch (err) {
    console.error('Failed to decode payload:', err)
    return null
  }
}

export interface EncryptedPayload {
  ciphertextB64: string
  ivB64: string
  saltB64: string
}

const MAX_PLAINTEXT_LENGTH = 20_000
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_SALT_BYTES = 16
const AES_GCM_IV_BYTES = 12
const AES_GCM_KEY_LENGTH = 256
const AES_GCM_TAG_LENGTH = 128
const AES_GCM_TAG_BYTES = AES_GCM_TAG_LENGTH / 8
const NOTE_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const NOTE_ID_LENGTH = 21
const NOTE_ID_MAX_UNBIASED_BYTE =
  Math.floor(256 / NOTE_ID_ALPHABET.length) * NOTE_ID_ALPHABET.length

function b64encode(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error('Invalid base64url value')
  }

  let base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  if (base64.length % 4 === 1) {
    throw new Error('Invalid base64url value')
  }
  while (base64.length % 4) {
    base64 += '='
  }

  let binary: string
  try {
    binary = atob(base64)
  } catch {
    throw new Error('Invalid base64url value')
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function getWebCrypto(): Crypto {
  const webCrypto = globalThis.crypto
  if (!webCrypto || !webCrypto.subtle) {
    throw new Error('WebCrypto API is unavailable')
  }
  return webCrypto
}

function validatePassword(password: string): void {
  if (password.length < 4) {
    throw new Error('Password must be at least 4 characters')
  }
}

function validatePlaintext(plaintext: string): void {
  if (plaintext.length > MAX_PLAINTEXT_LENGTH) {
    throw new Error('Plaintext must be at most 20000 characters')
  }
}

async function deriveKey(
  password: string,
  salt: ArrayBuffer,
  webCrypto: Crypto,
): Promise<CryptoKey> {
  const keyMaterial = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  return webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_GCM_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptString(
  plaintext: string,
  password: string,
): Promise<EncryptedPayload> {
  validatePassword(password)
  validatePlaintext(plaintext)

  const webCrypto = getWebCrypto()
  const salt = webCrypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES))
  const iv = webCrypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
  const key = await deriveKey(password, copyToArrayBuffer(salt), webCrypto)
  const ciphertext = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: AES_GCM_TAG_LENGTH },
    key,
    new TextEncoder().encode(plaintext),
  )

  return {
    ciphertextB64: b64encode(new Uint8Array(ciphertext)),
    ivB64: b64encode(iv),
    saltB64: b64encode(salt),
  }
}

export async function decryptString(
  payload: EncryptedPayload,
  password: string,
): Promise<string> {
  validatePassword(password)
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.ciphertextB64 !== 'string' ||
    typeof payload.ivB64 !== 'string' ||
    typeof payload.saltB64 !== 'string'
  ) {
    throw new Error('Invalid encrypted payload')
  }

  const ciphertext = b64decode(payload.ciphertextB64)
  const iv = b64decode(payload.ivB64)
  const salt = b64decode(payload.saltB64)
  if (
    iv.length !== AES_GCM_IV_BYTES ||
    salt.length !== PBKDF2_SALT_BYTES ||
    ciphertext.length < AES_GCM_TAG_BYTES
  ) {
    throw new Error('Invalid encrypted payload')
  }

  const webCrypto = getWebCrypto()
  const key = await deriveKey(password, copyToArrayBuffer(salt), webCrypto)

  let plaintextBuffer: ArrayBuffer
  try {
    plaintextBuffer = await webCrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: copyToArrayBuffer(iv), tagLength: AES_GCM_TAG_LENGTH },
      key,
      copyToArrayBuffer(ciphertext),
    )
  } catch {
    throw new Error('Unable to decrypt payload: wrong password or corrupted data')
  }

  const plaintext = new TextDecoder('utf-8', { fatal: true }).decode(plaintextBuffer)
  validatePlaintext(plaintext)
  return plaintext
}

export function isExpiredNote(note: NoteItem, now?: number): boolean {
  return (now ?? Date.now()) >= note.expiresAt
}

export function sanitizeNoteText(s: string): string {
  return s.trim().slice(0, MAX_PLAINTEXT_LENGTH)
}

// Secure 21-character IDs use rejection sampling to avoid modulo bias.
export function generateNoteId(): string {
  const webCrypto = globalThis.crypto
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    let result = ''
    while (result.length < NOTE_ID_LENGTH) {
      const randomBytes = webCrypto.getRandomValues(new Uint8Array(NOTE_ID_LENGTH))
      for (const byte of randomBytes) {
        if (byte >= NOTE_ID_MAX_UNBIASED_BYTE) {
          continue
        }
        result += NOTE_ID_ALPHABET.charAt(byte % NOTE_ID_ALPHABET.length)
        if (result.length === NOTE_ID_LENGTH) {
          break
        }
      }
    }
    return result
  }

  // Fallback only when Web Crypto is unavailable; Math.random is not secure.
  let result = ''
  for (let index = 0; index < NOTE_ID_LENGTH; index += 1) {
    result += NOTE_ID_ALPHABET.charAt(Math.floor(Math.random() * NOTE_ID_ALPHABET.length))
  }
  return result
}
