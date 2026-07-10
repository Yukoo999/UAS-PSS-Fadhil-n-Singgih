# 🌐 Panduan Deployment & Hosting Aplikasi

Dokumen ini menjelaskan langkah-langkah praktis untuk mendeploy database PostgreSQL dan server backend Hono + Bun ke layanan cloud agar bot Telegram Anda dapat berjalan online 24 jam tanpa perlu menggunakan laptop pribadi dan Ngrok.

---

## 1. Hosting Database PostgreSQL
Untuk database gratis dan mudah digunakan, direkomendasikan menggunakan **Supabase** atau **Neon.tech**.

### Menggunakan Neon (neon.tech):
1. Daftar akun di [neon.tech](https://neon.tech/) menggunakan akun GitHub.
2. Buat project baru dan pilih PostgreSQL versi terbaru.
3. Setelah database dibuat, salin **Connection String** yang diberikan di halaman dashboard (pilih tab *Connection string* -> *Pooler*).
4. Contoh Connection String:
   ```text
   postgresql://username:password@ep-cool-butterfly-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
5. Simpan URL ini untuk dimasukkan ke variabel `DATABASE_URL` pada konfigurasi hosting backend.

---

## 2. Hosting Backend Server (Hono + Bun)
Layanan terbaik, gratis/murah, dan mendukung runtime Bun secara langsung adalah **Railway.app** atau **Render.com**.

### Menggunakan Render (render.com):
1. Buat akun di [render.com](https://render.com) dan hubungkan dengan GitHub.
2. Di dashboard Render, klik **New** -> **Web Service**.
3. Hubungkan repositori GitHub proyek chatbot Anda.
4. Konfigurasikan detail build berikut:
   *   **Name**: `chatbot-diskominfo-backend`
   *   **Region**: Pilih terdekat (misal `Singapore` / `Asia`)
   *   **Runtime**: `Bun` (Render secara otomatis mendeteksi runtime jika ada file `bun.lock` / `package.json`).
   *   **Build Command**: `bun install`
   *   **Start Command**: `bun start`
5. Masuk ke tab **Environment Variables** dan tambahkan variabel berikut yang diambil dari file `.env` lokal Anda:
   *   `PORT` = `3000`
   *   `DATABASE_URL` = *(URL PostgreSQL dari Neon / Supabase)*
   *   `TELEGRAM_BOT_TOKEN` = *(Token bot Telegram)*
   *   `GEMINI_API_KEY` = *(API Key Gemini)*
   *   `GEMINI_MODEL` = `gemini-2.5-flash`
   *   `ENABLE_GEMINI` = `true`
   *   `DATASET_TARGET` = `diskominfo` *(atau toko_baju)*
   *   `ADMIN_API_KEY` = `uas_secret_token_2026` *(atau token buatan Anda)*
   *   `WEBHOOK_URL` = *(Isi dengan URL domain HTTPS publik yang diberikan Render setelah deploy selesai, contoh: `https://chatbot-diskominfo-backend.onrender.com`)*
6. Klik **Deploy Web Service**.

---

## 3. Pendaftaran Webhook Telegram Otomatis
Setelah server dideploy, entrypoint di `src/index.ts` Anda sudah memiliki fitur registrasi otomatis:
*   Saat server pertama kali menyala di cloud Render/Railway, kode akan mendeteksi isi dari `WEBHOOK_URL`.
*   Server secara otomatis menembak API Telegram `setWebhook` untuk mengarahkan callback bot ke `https://nama-aplikasi-anda.onrender.com/webhook`.
*   Bot Anda sekarang aktif secara permanen! Uji bot Anda dengan mengirim pesan di Telegram.
