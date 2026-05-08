import { Hono, Context } from 'hono';
import { env } from './config/env'; 
import { loadDataset, datasetMemori } from './services/datasetService';
import { initDatabase } from './db/config';
import { handleTelegramUpdate, setupBotCommands } from './bot/handler';

// 1. Inisialisasi Hono (Ganti Express/Polling)
const app = new Hono();

// 2. Validasi Token 
if (!env.TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN belum diisi di file .env");
  process.exit(1);
}

/**
 * BOOTSTRAP SYSTEM
 * Bagian ini dijalankan SEKALI saat server pertama kali menyala (bun run start)
 */
console.log('-------------------------------------------');
console.log("ℹ️ Server mode:", "Telegram Webhook (Hono + Bun)");
console.log("ℹ️ Gemini enabled:", String(env.ENABLE_GEMINI));

// A. Load Dataset ke RAM (Optimasi Performa)
await loadDataset(); // Mengeksekusi fungsi baca dari db
console.log("ℹ️ Dataset Status:", `Loaded [${env.DATASET_TARGET}] into memory`);

// B. Inisialisasi Database PostgreSQL
await initDatabase();
console.log("ℹ️ Database Status:", "PostgreSQL connected & Ready");

// C. Daftarkan command menu ke Telegram
await setupBotCommands();

// D. Auto-register Webhook jika WEBHOOK_URL diisi di .env
if (env.WEBHOOK_URL) {
  const webhookTarget = `${env.WEBHOOK_URL}/webhook`;
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookTarget,
        allowed_updates: ['message', 'callback_query'] // WAJIB: pastikan callback_query diterima
      })
    }
  );
  const data = await res.json() as any;
  if (data.ok) {
    console.log(`✅ Webhook berhasil diset ke: ${webhookTarget}`);
    console.log(`✅ allowed_updates: message, callback_query`);
  } else {
    console.error(`❌ Gagal set webhook:`, data.description);
  }
} else {
  console.log(`⚠️ WEBHOOK_URL kosong di .env — set webhook manual jika belum.`);
}

console.log('-------------------------------------------');

/**
 * 3. ENDPOINT WEBHOOK
 * Menggantikan poller.js. Telegram akan mengirim POST ke URL ini.
 */
app.post('/webhook', async (c: Context) => {
  try {
    const update = await c.req.json();
    
    // Kirim ke bot handler dan tunggu selesai (penting untuk callback_query rating)
    await handleTelegramUpdate(update, datasetMemori);

    return c.json({ ok: true }, 200);
  } catch (err: any) {
    console.error("❌ Webhook Handler Error:", err.message);
    return c.json({ ok: false }, 500);
  }
});

// Root route untuk monitoring sederhana
app.get('/', (c: Context) => c.text('Bot Admin Diskominfo is Online! 🚀'));

// Export untuk Bun
export default {
  port: env.PORT || 3000,
  fetch: app.fetch,
};