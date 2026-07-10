import postgres from 'postgres';
import { env } from '../config/env';

// 1. Membuat koneksi ke PostgreSQL menggunakan URL dari .env
export const sql = postgres(env.DATABASE_URL, {
  max: 10, // Maksimal koneksi simultan (Connection pool)
  idle_timeout: 20, // Tutup koneksi jika tidak ada aktivitas selama 20 detik
});

// 2. Fungsi inisialisasi yang dipanggil di index.ts
export async function initDatabase() {
  try {
    console.log('⏳ Sedang mencoba terhubung ke database...');
    // Coba eksekusi query sederhana
    await sql`SELECT 1`;
    console.log('✅ Berhasil terhubung ke PostgreSQL!');

    // Otomatis mengecek dan membuat tabel jika belum ada
    await setupTables();

  } catch (error: any) {
    console.error('❌ Gagal terhubung ke database!');
    console.error('Alasan:', error.message);
    console.error('Pastikan password di .env benar dan PostgreSQL sedang berjalan.');
    process.exit(1); // Matikan aplikasi jika database gagal terhubung
  }
}

// 2b. Fungsi untuk seeding data ke database dari JSON jika tabel masih kosong
async function seedData() {
  try {
    const fs = require('fs');
    const path = require('path');
    const target = env.DATASET_TARGET;
    const dataDir = path.join(process.cwd(), 'src', 'db', 'data', target);

    // Cek apakah sudah ada data untuk target ini
    const existingCount = await sql`SELECT count(*) FROM knowledge WHERE dataset_target = ${target}`;
    if (existingCount[0].count !== '0') {
      console.log(`ℹ️ Knowledge untuk [${target}] sudah ada di database, skip seeding.`);
      return;
    }

    console.log(`🌱 Seeding knowledge untuk [${target}]...`);

    // 1. Seed knowledge.json
    const knowledgePath = path.join(dataDir, 'knowledge.json');
    if (fs.existsSync(knowledgePath)) {
      const items = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'));
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const refId = `KNOW-${String(i + 1).padStart(3, '0')}`;
        // postgres.js automatically converts objects to JSON for json/jsonb columns
        await sql`
          INSERT INTO knowledge (reference_id, dataset_target, type, data) 
          VALUES (${refId}, ${target}, ${item.type}, ${item})
          ON CONFLICT (reference_id) DO UPDATE 
          SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
        `;
      }
      console.log(`  ✅ knowledge.json (${items.length} item) berhasil di-seed`);
    }

    // 2. Seed products.json
    const productsPath = path.join(dataDir, 'products.json');
    if (fs.existsSync(productsPath)) {
      const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const refId = `PROD-${String(i + 1).padStart(3, '0')}`;
        await sql`
          INSERT INTO knowledge (reference_id, dataset_target, type, data) 
          VALUES (${refId}, ${target}, 'product', ${p})
          ON CONFLICT (reference_id) DO UPDATE 
          SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
        `;
      }
      console.log(`  ✅ products.json (${products.length} produk) berhasil di-seed`);
    }

    // 3. Seed faq.json
    const faqPath = path.join(dataDir, 'faq.json');
    if (fs.existsSync(faqPath)) {
      const faqs = JSON.parse(fs.readFileSync(faqPath, 'utf-8'));
      for (let i = 0; i < faqs.length; i++) {
        const f = faqs[i];
        const refId = `FAQ-${String(i + 1).padStart(3, '0')}`;
        await sql`
          INSERT INTO knowledge (reference_id, dataset_target, type, data) 
          VALUES (${refId}, ${target}, 'faq', ${f})
          ON CONFLICT (reference_id) DO UPDATE 
          SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
        `;
      }
      console.log(`  ✅ faq.json (${faqs.length} FAQ) berhasil di-seed`);
    }

    console.log(`🎉 Seeding [${target}] selesai!`);
  } catch (err: any) {
    console.error('❌ Gagal melakukan seeding data:', err.message);
  }
}

// 3. Fungsi untuk membuat Struktur Tabel (Hanya tereksekusi jika tabel belum ada)
async function setupTables() {
  try {
    // 0. Buat Tipe ENUM jika belum ada (PostgreSQL)
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_status') THEN
          CREATE TYPE session_status AS ENUM ('active', 'finished');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_sender') THEN
          CREATE TYPE message_sender AS ENUM ('user', 'bot');
        END IF;
      END $$;
    `;

    // Tabel Users
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY, -- Menggunakan BIGINT karena ID Telegram sangat panjang
        username VARCHAR(255),
        first_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Tabel Sessions (Menggunakan UUID)
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id_session UUID PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        status session_status DEFAULT 'active', -- 'active' atau 'finished'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Tabel Messages
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id UUID REFERENCES sessions(id_session) ON DELETE CASCADE,
        sender message_sender, -- 'user' atau 'bot'
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // --- MIGRASI OTOMATIS: Ubah VARCHAR ke ENUM jika tabel sudah ada sebelumnya ---
    await sql`
      DO $$ BEGIN
        -- Migrasi kolom 'status' di tabel 'sessions'
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'sessions' AND column_name = 'status' AND data_type = 'character varying'
        ) THEN
          ALTER TABLE sessions ALTER COLUMN status TYPE session_status USING status::session_status;
          ALTER TABLE sessions ALTER COLUMN status SET DEFAULT 'active';
        END IF;

        -- Migrasi kolom 'sender' di tabel 'messages'
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'messages' AND column_name = 'sender' AND data_type = 'character varying'
        ) THEN
          ALTER TABLE messages ALTER COLUMN sender TYPE message_sender USING sender::message_sender;
        END IF;

        -- Migrasi tabel 'knowledge' (Ubah content TEXT menjadi data JSONB)
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'knowledge' AND column_name = 'content' AND data_type = 'text'
        ) THEN
          -- Hapus data lama karena strukturnya sudah berbeda jauh
          TRUNCATE TABLE knowledge;
          ALTER TABLE knowledge DROP COLUMN content;
          ALTER TABLE knowledge ADD COLUMN reference_id VARCHAR(100) UNIQUE;
          ALTER TABLE knowledge ADD COLUMN data JSONB;
          ALTER TABLE knowledge ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
          ALTER TABLE knowledge ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `;

    // Tabel Ratings (Relasi 1 to 1 dengan Session)
    await sql`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        session_id UUID UNIQUE REFERENCES sessions(id_session) ON DELETE CASCADE,
        score INT CHECK (score >= 1 AND score <= 5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Tabel Knowledge untuk integrasi AI pintar
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge (
        id SERIAL PRIMARY KEY,
        reference_id VARCHAR(100) UNIQUE,
        dataset_target VARCHAR(50), -- 'toko_baju' atau 'diskominfo'
        type VARCHAR(50),
        data JSONB,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    console.log('✅ Struktur Tabel PostgreSQL (dengan ENUM) sudah siap dan tervalidasi.');

    // Panggil fungsi seedData setelah tabel siap
    await seedData();
  } catch (error: any) {
    console.error('❌ Gagal membuat tabel:', error.message);
    process.exit(1);
  }
}