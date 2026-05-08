import { env } from '../config/env';
import { sql } from '../db/config';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inisialisasi Google Gemini AI
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

// Fungsi bantuan untuk mengirim pesan kembali ke Telegram via API (tanpa library berat)
// Di dalam handler.ts
async function sendTelegramMessage(chatId: number, text: string, reply_markup?: any) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body: any = { 
    chat_id: chatId, 
    text: text,
    disable_web_page_preview: true
  };
  
  if (reply_markup) {
    body.reply_markup = reply_markup;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const errorData = await res.json();
    console.error("❌ Telegram API Error:", errorData);
  }
}

// Timeout storage (simple in-memory solution for 5-minute timeout)
const sessionTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

// Daftarkan command sebagai tombol menu resmi di Telegram (muncul saat user ketik "/")
export async function setupBotCommands() {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`;
  const commands = [
    { command: 'start', description: 'Memulai bot' },
    { command: 'produk', description: 'Informasi tentang layanan kami' },
    { command: 'info', description: 'Informasi tentang bot ini' },
    { command: 'help', description: 'Bantuan jika terjadi kendala' },
    { command: 'stop', description: 'Selesai menggunakan bot' }
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands })
  });

  if (res.ok) {
    console.log('✅ Command bot berhasil didaftarkan ke Telegram Menu!');
  } else {
    const err = await res.json();
    console.error('❌ Gagal mendaftarkan command:', err);
  }
}

async function sendRatingRequest(chatId: number, sessionId: string) {
  const ratingMarkup = {
    inline_keyboard: [
      [
        { text: "⭐ 1", callback_data: `rate_1_${sessionId}` },
        { text: "⭐ 2", callback_data: `rate_2_${sessionId}` },
        { text: "⭐ 3", callback_data: `rate_3_${sessionId}` },
        { text: "⭐ 4", callback_data: `rate_4_${sessionId}` },
        { text: "⭐ 5", callback_data: `rate_5_${sessionId}` }
      ]
    ]
  };
  await sendTelegramMessage(chatId, "Bantu kami menjadi lebih baik! Silakan berikan rating untuk pelayanan kami:", ratingMarkup);
}

// Fungsi utama yang dipanggil oleh webhook di index.ts
export async function handleTelegramUpdate(update: any, dataset: any) {
  // Log semua jenis update yang masuk
  const updateType = update.callback_query ? 'callback_query' : update.message ? 'message' : 'unknown';
  console.log(`📨 Update diterima: type=${updateType}`);

  // Handle callback query for ratings
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message.chat.id;
    const callbackQueryId = cb.id;
    const data = (cb.data ?? '') as string;

    console.log(`🎯 Callback diterima | id=${callbackQueryId} | data=${data} | chatId=${chatId}`);

    // Fungsi helper: selalu jawab Telegram untuk hapus loading spinner
    const answerCb = async (text: string) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false })
        });
        const resJson = await res.json() as any;
        console.log(`✅ answerCallbackQuery response:`, JSON.stringify(resJson));
      } catch (fetchErr: any) {
        console.error('❌ answerCallbackQuery gagal:', fetchErr.message);
      }
    };

    if (data.startsWith('rate_')) {
      const firstUnderscore = data.indexOf('_');
      const secondUnderscore = data.indexOf('_', firstUnderscore + 1);
      const score = parseInt(data.substring(firstUnderscore + 1, secondUnderscore));
      const sessionId = data.substring(secondUnderscore + 1);

      console.log(`⭐ Rating: score=${score} | sessionId=${sessionId}`);

      // Jawab Telegram PERTAMA KALI agar spinner hilang
      await answerCb(`⭐ Rating ${score} bintang diterima!`);

      try {
        await sql`
          INSERT INTO ratings (session_id, score)
          VALUES (${sessionId}, ${score})
          ON CONFLICT (session_id) DO UPDATE SET score = EXCLUDED.score;
        `;
        console.log(`✅ Rating ${score} bintang berhasil disimpan untuk session: ${sessionId}`);
        await sendTelegramMessage(chatId, `Terima kasih sudah memberikan rating bintang ${score}! Kami akan terus meningkatkan pelayanan 🙏`);
      } catch (e: any) {
        console.error("❌ Gagal menyimpan rating ke DB:", e.message, "| sessionId:", sessionId);
        await sendTelegramMessage(chatId, "Maaf, terjadi kesalahan saat menyimpan rating. Terima kasih sudah mencoba! 🙏");
      }
    } else {
      await answerCb("Perintah tidak dikenal.");
    }
    return;
  }

  // Pastikan update yang masuk benar-benar berupa pesan teks dari user
  if (!update.message || !update.message.text) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const firstName = msg.from.first_name || '';
  const text = msg.text;

  try {
    // ==========================================
    // 1. SIMPAN/UPDATE DATA USER KE DATABASE
    // ==========================================
    await sql`
      INSERT INTO users (id, username, first_name)
      VALUES (${userId}, ${username}, ${firstName})
      ON CONFLICT (id) DO UPDATE 
      SET username = EXCLUDED.username, first_name = EXCLUDED.first_name;
    `;

    // ==========================================
    // 2. MANAJEMEN SESI (Mencari sesi aktif atau membuat baru)
    // ==========================================
    let session = await sql`
      SELECT id_session FROM sessions 
      WHERE user_id = ${userId} AND status = 'active' 
      ORDER BY created_at DESC LIMIT 1;
    `;
    
    let sessionId: string;
    if (session.length === 0) {
      // Jika tidak ada sesi aktif, buat sesi baru menggunakan UUID v7
      sessionId = uuidv4();
      await sql`
        INSERT INTO sessions (id_session, user_id, status)
        VALUES (${sessionId}, ${userId}, 'active');
      `;
    } else {
      sessionId = session[0].id_session;
    }

    // ==========================================
    // 3. SIMPAN PESAN USER KE DATABASE
    // ==========================================
    await sql`
      INSERT INTO messages (session_id, sender, content)
      VALUES (${sessionId}, 'user', ${text});
    `;

    // ==========================================
    // 4. LOGIKA AI & BALASAN BOT
    // ==========================================
    let replyText = "";
    let isCommand = true;

    if (text === '/start') {
      replyText = `Halo ${firstName}! Selamat datang di chatbot kami, ada yang bisa kami bantu?`;
    } else if (text === '/produk') {
      replyText = "Kami memiliki berbagai pilihan produk, silakan beri tahu kami apa kebutuhan anda";
    } else if (text === '/info') {
      replyText = "Bot ini adalah milik Tim Magang DISKOMINFO 2026, Universitas Dian Nuswantoro Semarang";
    } else if (text === '/help') {
      replyText = "Jika terjadi kendala pada chatbot hubungi instagram: @yukasahistya_";
    } else if (text === '/stop') {
      // Tandai sesi sebagai selesai
      await sql`
        UPDATE sessions SET status = 'finished', updated_at = NOW()
        WHERE id_session = ${sessionId};
      `;
      // Hentikan timeout yang mungkin sedang berjalan
      if (sessionTimeouts[sessionId]) {
        clearTimeout(sessionTimeouts[sessionId]);
        delete sessionTimeouts[sessionId];
      }
      // Kirim pesan + langsung trigger rating
      await sendTelegramMessage(chatId, "Terima kasih sudah menggunakan layanan kami! 🙏");
      await sendRatingRequest(chatId, sessionId);
      return; // Hentikan eksekusi lebih lanjut
    } else {
      isCommand = false;
      // Panggil Gemini AI jika bukan command
      if (env.ENABLE_GEMINI) {
        // Format knowledge dari database
        const knowledgeText = Array.isArray(dataset) && dataset.length > 0
          ? dataset.map((k: any) => `- [${k.type}]: ${k.content}`).join('\n')
          : 'Tidak ada data knowledge tersedia.';

        const systemInstruction = `
Kamu adalah asisten virtual toko baju online bernama "ShopBot". Kamu bertugas membantu pelanggan menemukan produk yang tepat, menjawab pertanyaan seputar toko, dan memberikan rekomendasi outfit yang sesuai.

=== DATA PRODUK, FAQ, DAN PENGETAHUAN TOKO ===
${knowledgeText}

=== PANDUAN MENJAWAB ===
1. Baca riwayat percakapan sebelum menjawab. Jangan ulangi pertanyaan yang sudah dijawab user.
2. Jika user melanjutkan topik sebelumnya, lanjutkan konteks langsung tanpa memulai dari awal.
3. HANYA rekomendasikan produk yang BENAR-BENAR ADA di daftar produk di atas. Jika tidak ada, langsung katakan dengan jujur dan luwes: "Kak, untuk [jenis produk] tersebut kami belum menyediakan" lalu tawarkan alternatif yang MEMANG ADA jika relevan.
4. JANGAN pernah menyebut, mendeskripsikan, atau merekomendasikan produk yang tidak ada di data.
5. Untuk pertanyaan STOK/HARGA/UKURAN: jawab persis sesuai data.
6. Untuk KEBIJAKAN (retur, ongkir, COD): jawab sesuai FAQ.
7. Jika stok produk ≤ 3, ingatkan stok hampir habis.
8. Jika pertanyaan di luar konteks toko baju, tolak sopan: "Maaf kak, saya hanya membantu seputar produk toko kami 😊"
9. Gunakan sapaan "Kak". Jawaban natural, singkat, dan mengalir. Maksimal 4 kalimat.
`;

        // Ambil riwayat percakapan dari database (maks 10 pesan terakhir)
        const recentMessages = await sql`
          SELECT sender, content FROM messages
          WHERE session_id = ${sessionId}
          ORDER BY created_at DESC
          LIMIT 10
        `;

        // Format riwayat ke format Gemini (dibalik karena query DESC)
        const history = recentMessages
          .reverse()
          .slice(0, -1) // hapus pesan user terakhir (akan dikirim sebagai input baru)
          .map((m: any) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }));

        const model = genAI.getGenerativeModel({
          model: env.GEMINI_MODEL,
          systemInstruction: systemInstruction
        });

        const chat = model.startChat({ history });
        const result = await chat.sendMessage(text);
        replyText = result.response.text();
      } else {
        replyText = "Maaf, fitur kecerdasan buatan sedang dinonaktifkan oleh Admin saat ini.";
      }
    }

    // ==========================================
    // 5. KIRIM BALASAN KE TELEGRAM
    // ==========================================
    await sendTelegramMessage(chatId, replyText);

    // ==========================================
    // 6. RATING TRIGGER (INTENT & TIMEOUT)
    // ==========================================
    if (!isCommand) {
      const ratingTriggers = ["terima kasih", "makasih", "selesai", "sudah", "itu saja"];
      const textLower = text.toLowerCase();
      const isRatingIntent = ratingTriggers.some(trigger => textLower.includes(trigger));

      if (isRatingIntent) {
        // Send rating request immediately
        await sendRatingRequest(chatId, sessionId);
        // Clear any existing timeout for this session
        if (sessionTimeouts[sessionId]) clearTimeout(sessionTimeouts[sessionId]);
      } else {
        // Reset 5-minute timeout for rating request
        if (sessionTimeouts[sessionId]) clearTimeout(sessionTimeouts[sessionId]);
        sessionTimeouts[sessionId] = setTimeout(async () => {
          await sendRatingRequest(chatId, sessionId);
          delete sessionTimeouts[sessionId];
        }, 5 * 60 * 1000);
      }
    }

    // ==========================================
    // 6. SIMPAN PESAN BOT KE DATABASE
    // ==========================================
    await sql`
      INSERT INTO messages (session_id, sender, content)
      VALUES (${sessionId}, 'bot', ${replyText});
    `;

  } catch (error: any) {
    console.error("❌ Error di Bot Handler:", error.message);
    // Deteksi error Gemini overload (503 / quota exceeded)
    const isOverload = error.message?.includes('503') ||
      error.message?.includes('overloaded') ||
      error.message?.includes('429') ||
      error.message?.includes('quota') ||
      error.message?.includes('RESOURCE_EXHAUSTED');
    const errorMsg = isOverload
      ? "Maaf server bot sedang sibuk, coba lagi nanti 🙏"
      : "Mohon maaf, terjadi kesalahan pada sistem saya saat memproses pesan Anda. 🙏";
    await sendTelegramMessage(chatId, errorMsg);
  }
}