// Bun membaca file .env secara otomatis, sehingga import dotenv bisa dihapus.

export const env = {
  // Konfigurasi Server
  PORT: Number(process.env.PORT || 3000),
  
  // Konfigurasi Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  WEBHOOK_URL: process.env.WEBHOOK_URL || "", // Contoh: URL Ngrok untuk set webhook
  
  // Konfigurasi AI (Gemini)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  ENABLE_GEMINI: String(process.env.ENABLE_GEMINI || "true").toLowerCase() === "true",

  // Konfigurasi Database PostgreSQL
  DATABASE_URL: process.env.DATABASE_URL || "", 

  // Konfigurasi Dataset Modular (Plug & Play)
  DATASET_TARGET: process.env.DATASET_TARGET || "toko_baju", // Ganti ke "diskominfo" saat migrasi
};