# 🤖 Chatbot AI Diskominfo Kota Semarang (Multi-Purpose Bot)

Chatbot Telegram cerdas yang dikembangkan menggunakan **Bun**, **Hono**, **PostgreSQL**, dan **Google Gemini AI**. Bot ini dirancang dengan arsitektur modular yang memungkinkan pergantian dataset (misal: dari Toko Baju ke Diskominfo) hanya dengan satu baris konfigurasi.

---

## 🌟 Fitur Utama

*   **🧠 Kontekstual & Pintar**: Menggunakan Google Gemini AI dengan fitur *Multi-Turn Chat* (Bot ingat riwayat percakapan sebelumnya).
*   **📂 Modular Dataset (Plug & Play)**: Mendukung multiple dataset (Toko Baju, Diskominfo, dll) yang tersimpan secara terstruktur.
*   **🗄️ PostgreSQL Integration**: Penyimpanan permanen untuk data pengguna, sesi chat, riwayat pesan, dan basis pengetahuan (*knowledge base*).
*   **⭐ Sistem Rating User**: Fitur feedback otomatis (bintang 1-5) yang dipicu oleh kata kunci tertentu, perintah `/stop`, atau *timeout* otomatis (5 menit).
*   **⚙️ Auto-Seeding**: Mengisi database secara otomatis dari file JSON saat bot pertama kali dijalankan.
*   **🔗 Auto-Webhook & Tunneling**: Integrasi Ngrok otomatis untuk kemudahan pengembangan lokal.

---

## 🚀 Teknologi yang Digunakan

*   **Runtime**: [Bun](https://bun.sh/)
*   **Framework Web**: [Hono](https://hono.dev/)
*   **AI Engine**: Google Gemini AI (Generative Language API)
*   **Database**: PostgreSQL
*   **Platform**: Telegram Bot API

---

## 📂 Struktur Project

```text
backend/
├── src/
│   ├── bot/          # Logika handler Telegram, Menu, & Rating
│   ├── db/           # Konfigurasi PostgreSQL & Data Seeder (JSON)
│   ├── services/     # Layanan pendukung dataset
│   ├── config/       # Manajemen environment variables
│   └── index.ts      # Entry point server (Hono)
├── .env              # Konfigurasi API Key & Database
└── package.json
```

---

## ⚙️ Cara Instalasi

### 1. Prasyarat
*   Sudah menginstall **Bun** (`powershell -c "irm bun.sh/install.ps1 | iex"`)
*   Sudah menginstall **PostgreSQL** dan memiliki database kosong.
*   Memiliki **Ngrok** untuk tunneling.

### 2. Clone & Install
```bash
# Clone repository ini
git clone https://github.com/username/Telegram-Chatbot-AI-Diskominfo-Kota-Semarang.git

# Masuk ke folder backend
cd backend

# Install dependensi
bun install
```

### 3. Konfigurasi Environment
Buat file `.env` di folder `backend/` dan isi sebagai berikut:
```env
PORT=3000
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/NAMA_DATABASE"
DATASET_TARGET="toko_baju" # Ganti ke "diskominfo" sesuai kebutuhan
WEBHOOK_URL="https://your-ngrok-url.ngrok-free.app"
```

---

## 🏃 Cara Menjalankan

1.  **Jalankan Tunneling (Ngrok)**:
    ```bash
    ngrok http 3000
    ```
    *Salin URL HTTPS yang muncul ke file `.env` di bagian `WEBHOOK_URL`.*

2.  **Jalankan Bot**:
    ```bash
    bun run dev
    ```

Bot akan otomatis mendaftarkan webhook, membuat tabel database, dan melakukan seeding data dari file JSON.

---

## 🛠️ Perintah Bot (Commands)

*   `/start` - Memulai percakapan.
*   `/produk` - Melihat info produk (Mode Toko Baju).
*   `/info` - Informasi pengembang bot.
*   `/help` - Bantuan penggunaan.
*   `/stop` - Mengakhiri sesi dan memberikan rating.

---

## 👥 Pengembang
Bot ini dikembangkan oleh **Tim Magang DISKOMINFO 2026** - Universitas Dian Nuswantoro Semarang.
