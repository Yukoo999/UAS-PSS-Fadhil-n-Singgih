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
      for (const item of items) {
        await sql`INSERT INTO knowledge (dataset_target, type, content) VALUES (${target}, ${item.type}, ${item.content})`;
      }
      console.log(`  ✅ knowledge.json (${items.length} item) berhasil di-seed`);
    }

    // 2. Seed products.json → ubah ke format knowledge
    const productsPath = path.join(dataDir, 'products.json');
    if (fs.existsSync(productsPath)) {
      const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
      for (const p of products) {
        const content = `Produk: ${p.name} | Kategori: ${p.category} | Style: ${p.style} | Ukuran: ${p.size} | Warna: ${p.color} | Harga: Rp${p.price.toLocaleString('id-ID')} | Stok: ${p.stock} | Deskripsi: ${p.description}`;
        await sql`INSERT INTO knowledge (dataset_target, type, content) VALUES (${target}, 'product', ${content})`;
      }
      console.log(`  ✅ products.json (${products.length} produk) berhasil di-seed`);
    }

    // 3. Seed faq.json → ubah ke format knowledge
    const faqPath = path.join(dataDir, 'faq.json');
    if (fs.existsSync(faqPath)) {
      const faqs = JSON.parse(fs.readFileSync(faqPath, 'utf-8'));
      for (const f of faqs) {
        const content = `Pertanyaan: ${f.question} | Jawaban: ${f.answer}`;
        await sql`INSERT INTO knowledge (dataset_target, type, content) VALUES (${target}, 'faq', ${content})`;
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
        status VARCHAR(50) DEFAULT 'active', -- 'active' atau 'finished'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Tabel Messages
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id UUID REFERENCES sessions(id_session) ON DELETE CASCADE,
        sender VARCHAR(50), -- 'user' atau 'bot'
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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
        dataset_target VARCHAR(50), -- 'toko_baju' atau 'diskominfo'
        type VARCHAR(50),
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    console.log('✅ Struktur Tabel PostgreSQL sudah siap dan tervalidasi.');
    
    // Panggil fungsi seedData setelah tabel siap
    await seedData();
  } catch (error: any) {
    console.error('❌ Gagal membuat tabel:', error.message);
    process.exit(1);
  }
}