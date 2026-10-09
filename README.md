# DigiKarya Notes 📝⏱️

Aplikasi web **DigiKarya Notes Ephemeral 48 Jam** bergaya **Aesthetic Yellow Paper Sticky Note** untuk berbagi catatan, kredensial akun, lisensi, voucher, dan invoice order secara aman dengan link self-destruct otomatis.

## 🚀 Fitur Utama

1. **Restricted Root Access (Otorisasi PIN)**:
   - Path root (`/`) **TIDAK TERBUKA UNTUK PUBLIK**.
   - Halaman root menampilkan **Panel Otorisasi PIN Admin** untuk keamanan agar pengguna publik tidak dapat melihat catatan sembarangan atau membuat spam tanpa izin.
   - User publik hanya dapat membaca note tertentu jika memiliki **Direct Unique Link** (misal: `#note:<hash>` atau `#id:<noteId>`).

2. **Integrasi Firebase Firestore / Realtime Database**:
   - Terhubung dengan REST API Firebase Firestore & Realtime Database untuk persistensi data note.
   - Menyimpan payload catatan secara terpusat dengan expiry timestamp 48 jam.
   - Fallback hybrid otomatis ke URL-safe Base64 bila konfigurasi Firebase belum diisi (bukan enkripsi — jangan dipakai untuk kredensial sensitif).

3. **48 Jam Auto-Destruct Realtime**:
   - Realtime countdown countdown ticker (`47j 59m 12d`) dan progress bar sisa waktu aktif.
   - Status berubah otomatis menjadi expired jika waktu melebihi 48 jam.

4. **Keamanan & Desain**:
   - Paper note kuning estetik (`#fffdf0`, `#fef08a`), texture washi tape, dan lined paper pattern.
   - Opsi enkripsi password per catatan.
   - Fitur 1-klik Copy Link, Web Share API, dan QR Code generator.

---

## ⚙️ Konfigurasi Environment (`.env`)

Salin `.env.example` ke `.env` dan lengkapi konfigurasi Firebase Anda. **Jangan commit `.env`**; gunakan secret manager untuk CI/CD.

```env
# Firebase Firestore / Realtime DB Config
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_DATABASE_URL=

# Admin Authorization PIN: simpan hanya hash SHA-256, bukan PIN plaintext.
# Contoh: echo -n "pin" | sha256sum
VITE_ADMIN_PIN_HASH=
```

---

## 🛠️ Cara Menjalankan

```bash
cd services/notes
bun install
bun run dev
```

Build production:

```bash
bun run build
```

## 🔐 Deploy Rules & TTL

Jalankan perintah berikut dari `services/notes` setelah Firebase CLI sudah login dan project aktif:

```bash
firebase deploy --only firestore:rules
firebase deploy --only database
```

`firestore.rules` mengizinkan pembacaan satu dokumen melalui ID langsung, tetapi hanya membuat dokumen baru: overwrite, delete, list/enumerasi, dan akses path lain ditolak. `database.rules.json` tetap deny-by-default; **buka rules RTDB hanya setelah migrasi ke Firebase Authentication** dan validasi model otorisasi.

Agar dokumen kedaluwarsa dihapus otomatis, buka **Firebase Console → Firestore Database → TTL policies → Create TTL policy**, lalu pilih:

- Collection group: `notes`
- Field: `expiresAt`
- Enable TTL: aktifkan
- Expiration offset: `0` (hapus saat timestamp tercapai)
