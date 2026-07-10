import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { env } from './config/env'; 
import { loadDataset, datasetMemori } from './services/datasetService';
import { initDatabase, sql } from './db/config';
import { handleTelegramUpdate, setupBotCommands } from './bot/handler';

// 1. Inisialisasi Hono
export const app = new Hono();

// A. Throttling (Rate Limiting) Middleware berbasis IP (maks 60 req/menit)
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
app.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
  const now = Date.now();
  const record = ipRequestCounts.get(ip);
  if (!record || now > record.resetTime) {
    ipRequestCounts.set(ip, { count: 1, resetTime: now + 60000 });
  } else {
    record.count++;
    if (record.count > 60) {
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }
  }
  await next();
});

// B. CORS untuk semua endpoint (agar dashboard bisa mengakses API dari browser)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}));

// C. Handle CORS Preflight (OPTIONS) untuk semua route /api/* SEBELUM bearerAuth
// Browser mengirim OPTIONS request tanpa Authorization header, jadi perlu di-handle terlebih dahulu
app.options('/api/*', (c) => c.text('', 204));

// D. Bearer Auth khusus untuk Endpoint Admin /api/*
app.use('/api/*', bearerAuth({ token: env.ADMIN_API_KEY }));

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

// A. Inisialisasi Database PostgreSQL (HARUS PERTAMA agar tabel sudah ada)
await initDatabase();
console.log("ℹ️ Database Status:", "PostgreSQL connected & Ready");

// B. Load Dataset ke RAM (Optimasi Performa) - setelah tabel siap
await loadDataset(); // Mengeksekusi fungsi baca dari db
console.log("ℹ️ Dataset Status:", `Loaded [${env.DATASET_TARGET}] into memory`);

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

// Endpoint untuk menerima sinkronisasi dari Google Sheets
app.post('/api/sync-sheets', async (c: Context) => {
  try {
    const items = await c.req.json();
    for (const item of items) {
      const dataJsonb = { question: item.question, answer: item.answer };
      await sql`
        INSERT INTO knowledge (reference_id, dataset_target, type, data, is_active)
        VALUES (${item.reference_id}, ${env.DATASET_TARGET}, ${item.type}, ${dataJsonb}, ${item.is_active})
        ON CONFLICT (reference_id) DO UPDATE 
        SET type = EXCLUDED.type, data = EXCLUDED.data, is_active = EXCLUDED.is_active, updated_at = CURRENT_TIMESTAMP
      `;
    }
    await loadDataset(); 
    return c.json({ ok: true, message: "Sinkronisasi Berhasil!" }, 200);
  } catch (err: any) {
    console.error("❌ Error Sync Sheets:", err.message);
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// Endpoint untuk mengambil ulasan/rating dari pengguna (dengan pagination)
app.get('/api/ratings', async (c: Context) => {
  try {
    const page = Number(c.req.query('page') || 1);
    const limit = Number(c.req.query('limit') || 10);
    const offset = (page - 1) * limit;

    const search = c.req.query('search') || '';

    let total;
    let ratings;

    if (search) {
      const sp = `%${search}%`;
      const totalResult = await sql`
        SELECT count(*) FROM ratings r
        LEFT JOIN sessions s ON r.session_id = s.id_session
        LEFT JOIN users u ON s.user_id = u.id
        WHERE u.username ILIKE ${sp} OR u.first_name ILIKE ${sp}
      `;
      total = Number(totalResult[0].count);

      ratings = await sql`
        SELECT r.id, r.session_id, r.score, r.created_at, s.user_id, u.first_name, u.username
        FROM ratings r
        LEFT JOIN sessions s ON r.session_id = s.id_session
        LEFT JOIN users u ON s.user_id = u.id
        WHERE u.username ILIKE ${sp} OR u.first_name ILIKE ${sp}
        ORDER BY r.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      const totalResult = await sql`SELECT count(*) FROM ratings`;
      total = Number(totalResult[0].count);

      ratings = await sql`
        SELECT r.id, r.session_id, r.score, r.created_at, s.user_id, u.first_name, u.username
        FROM ratings r
        LEFT JOIN sessions s ON r.session_id = s.id_session
        LEFT JOIN users u ON s.user_id = u.id
        ORDER BY r.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    // Ambil statistik rata-rata
    const statsResult = await sql`
      SELECT COALESCE(AVG(score), 0) as average, COUNT(*) as count 
      FROM ratings
    `;
    const stats = {
      average: parseFloat(parseFloat(statsResult[0].average).toFixed(2)),
      totalCount: Number(statsResult[0].count)
    };

    return c.json({
      ok: true,
      data: ratings,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }, 200);
  } catch (err: any) {
    console.error("❌ Error Get Ratings:", err.message);
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// Endpoint untuk mengambil sesi percakapan (dengan pagination & filtering status)
app.get('/api/sessions', async (c: Context) => {
  try {
    const page = Number(c.req.query('page') || 1);
    const limit = Number(c.req.query('limit') || 10);
    const offset = (page - 1) * limit;

    const statusFilter = c.req.query('status'); // 'active' atau 'finished'
    const search = c.req.query('search') || '';

    let sessions;
    let total;

    if ((statusFilter === 'active' || statusFilter === 'finished') && search) {
      const sp = `%${search}%`;
      const totalResult = await sql`
        SELECT count(*) FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.status = ${statusFilter} AND (u.username ILIKE ${sp} OR u.first_name ILIKE ${sp})
      `;
      total = Number(totalResult[0].count);

      sessions = await sql`
        SELECT s.id_session, s.user_id, s.status, s.created_at, s.updated_at, u.first_name, u.username,
               (SELECT count(*) FROM messages WHERE session_id = s.id_session) as message_count
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.status = ${statusFilter} AND (u.username ILIKE ${sp} OR u.first_name ILIKE ${sp})
        ORDER BY s.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (statusFilter === 'active' || statusFilter === 'finished') {
      const totalResult = await sql`
        SELECT count(*) FROM sessions WHERE status = ${statusFilter}
      `;
      total = Number(totalResult[0].count);

      sessions = await sql`
        SELECT s.id_session, s.user_id, s.status, s.created_at, s.updated_at, u.first_name, u.username,
               (SELECT count(*) FROM messages WHERE session_id = s.id_session) as message_count
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.status = ${statusFilter}
        ORDER BY s.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (search) {
      const sp = `%${search}%`;
      const totalResult = await sql`
        SELECT count(*) FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE (u.username ILIKE ${sp} OR u.first_name ILIKE ${sp})
      `;
      total = Number(totalResult[0].count);

      sessions = await sql`
        SELECT s.id_session, s.user_id, s.status, s.created_at, s.updated_at, u.first_name, u.username,
               (SELECT count(*) FROM messages WHERE session_id = s.id_session) as message_count
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE (u.username ILIKE ${sp} OR u.first_name ILIKE ${sp})
        ORDER BY s.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      const totalResult = await sql`SELECT count(*) FROM sessions`;
      total = Number(totalResult[0].count);

      sessions = await sql`
        SELECT s.id_session, s.user_id, s.status, s.created_at, s.updated_at, u.first_name, u.username,
               (SELECT count(*) FROM messages WHERE session_id = s.id_session) as message_count
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        ORDER BY s.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    return c.json({
      ok: true,
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }, 200);
  } catch (err: any) {
    console.error("❌ Error Get Sessions:", err.message);
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// Endpoint untuk mengambil pesan per sesi percakapan
app.get('/api/sessions/:id/messages', async (c: Context) => {
  try {
    const sessionId = c.req.param('id');
    const messages = await sql`
      SELECT id, sender, content, created_at
      FROM messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
    `;
    return c.json({ ok: true, data: messages }, 200);
  } catch (err: any) {
    console.error("❌ Error Get Session Messages:", err.message);
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// ============================================================
// CRUD API: USERS
// ============================================================
app.get('/api/users', async (c: Context) => {
  try {
    const page = Number(c.req.query('page') || 1);
    const limit = Number(c.req.query('limit') || 10);
    const search = c.req.query('search') || '';
    const offset = (page - 1) * limit;
    let total;
    let users;
    if (search) {
      const sp = `%${search}%`;
      const totalResult = await sql`SELECT count(*) FROM users WHERE username ILIKE ${sp} OR first_name ILIKE ${sp}`;
      total = Number(totalResult[0].count);
      users = await sql`SELECT * FROM users WHERE username ILIKE ${sp} OR first_name ILIKE ${sp} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    } else {
      const totalResult = await sql`SELECT count(*) FROM users`;
      total = Number(totalResult[0].count);
      users = await sql`SELECT * FROM users ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    }
    return c.json({ ok: true, data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

app.get('/api/users/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const user = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (user.length === 0) return c.json({ ok: false, error: 'User not found' }, 404);
    return c.json({ ok: true, data: user[0] });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

app.put('/api/users/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    await sql`UPDATE users SET username = ${body.username || ''}, first_name = ${body.first_name || ''} WHERE id = ${id}`;
    return c.json({ ok: true, message: 'User updated' });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

app.delete('/api/users/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    await sql`DELETE FROM users WHERE id = ${id}`;
    return c.json({ ok: true, message: 'User deleted' });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

// ============================================================
// CRUD API: KNOWLEDGE
// ============================================================
app.get('/api/knowledge', async (c: Context) => {
  try {
    const page = Number(c.req.query('page') || 1);
    const limit = Number(c.req.query('limit') || 10);
    const offset = (page - 1) * limit;
    const typeFilter = c.req.query('type');
    const search = c.req.query('search') || '';
    let data, total;
    
    if (typeFilter && search) {
      const sp = `%${search}%`;
      const totalResult = await sql`SELECT count(*) FROM knowledge WHERE type = ${typeFilter} AND (reference_id ILIKE ${sp} OR data->>'question' ILIKE ${sp})`;
      total = Number(totalResult[0].count);
      data = await sql`SELECT * FROM knowledge WHERE type = ${typeFilter} AND (reference_id ILIKE ${sp} OR data->>'question' ILIKE ${sp}) ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    } else if (typeFilter) {
      const totalResult = await sql`SELECT count(*) FROM knowledge WHERE type = ${typeFilter}`;
      total = Number(totalResult[0].count);
      data = await sql`SELECT * FROM knowledge WHERE type = ${typeFilter} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    } else if (search) {
      const sp = `%${search}%`;
      const totalResult = await sql`SELECT count(*) FROM knowledge WHERE (reference_id ILIKE ${sp} OR data->>'question' ILIKE ${sp})`;
      total = Number(totalResult[0].count);
      data = await sql`SELECT * FROM knowledge WHERE (reference_id ILIKE ${sp} OR data->>'question' ILIKE ${sp}) ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    } else {
      const totalResult = await sql`SELECT count(*) FROM knowledge`;
      total = Number(totalResult[0].count);
      data = await sql`SELECT * FROM knowledge ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    }
    return c.json({ ok: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

app.post('/api/knowledge', async (c: Context) => {
  try {
    const body = await c.req.json();
    const dataJsonb = body.data || { question: body.question || '', answer: body.answer || '' };
    await sql`
      INSERT INTO knowledge (reference_id, dataset_target, type, data, is_active)
      VALUES (${body.reference_id || null}, ${body.dataset_target || env.DATASET_TARGET}, ${body.type || 'faq'}, ${dataJsonb}, ${body.is_active !== false})
    `;
    await loadDataset();
    return c.json({ ok: true, message: 'Knowledge created' }, 201);
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

app.put('/api/knowledge/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const dataJsonb = body.data || { question: body.question || '', answer: body.answer || '' };
    await sql`
      UPDATE knowledge SET type = ${body.type || 'faq'}, data = ${dataJsonb}, is_active = ${body.is_active !== false}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
    await loadDataset();
    return c.json({ ok: true, message: 'Knowledge updated' });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

app.delete('/api/knowledge/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    await sql`DELETE FROM knowledge WHERE id = ${id}`;
    await loadDataset();
    return c.json({ ok: true, message: 'Knowledge deleted' });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

// ============================================================
// CRUD API: SESSIONS (Tambahan Delete & Update Status)
// ============================================================
app.put('/api/sessions/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    await sql`UPDATE sessions SET status = ${body.status || 'finished'}, updated_at = CURRENT_TIMESTAMP WHERE id_session = ${id}`;
    return c.json({ ok: true, message: 'Session updated' });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

app.delete('/api/sessions/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    await sql`DELETE FROM sessions WHERE id_session = ${id}`;
    return c.json({ ok: true, message: 'Session deleted' });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

// ============================================================
// CRUD API: MESSAGES (Delete)
// ============================================================
app.delete('/api/messages/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    await sql`DELETE FROM messages WHERE id = ${id}`;
    return c.json({ ok: true, message: 'Message deleted' });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

// ============================================================
// CRUD API: RATINGS (Delete)
// ============================================================
app.delete('/api/ratings/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    await sql`DELETE FROM ratings WHERE id = ${id}`;
    return c.json({ ok: true, message: 'Rating deleted' });
  } catch (err: any) { return c.json({ ok: false, error: err.message }, 500); }
});

// Export untuk Bun
export default {
  port: env.PORT || 3000,
  fetch: app.fetch,
};