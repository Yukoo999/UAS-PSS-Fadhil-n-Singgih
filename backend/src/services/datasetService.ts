import { env } from '../config/env';
import { sql } from '../db/config';

// Variabel global untuk menyimpan data dataset di memori agar bisa diakses oleh bot/handler
export let datasetMemori: any = null;

export async function loadDataset() {
  try {
    console.log(`📂 Mengekstrak knowledge dari PostgreSQL untuk target: ${env.DATASET_TARGET}...`);
    
    // Ambil data knowledge dari database berdasarkan target
    const knowledgeData = await sql`
      SELECT reference_id, type, data FROM knowledge 
      WHERE dataset_target = ${env.DATASET_TARGET} AND is_active = TRUE
    `;
    
    if (knowledgeData.length === 0) {
      console.warn(`⚠️ Peringatan: Tidak ada data knowledge di database untuk target ${env.DATASET_TARGET}.`);
    }

    // Format knowledge ke dalam memori
    datasetMemori = knowledgeData;
    
    console.log('✅ Dataset berhasil dimuat ke memori dari database!');
  } catch (error: any) {
    console.error('❌ Gagal memuat dataset dari database:', error.message);
    // Tidak di-exit karena mungkin db belum di-seed, namun di setup kita sudah panggil seedData
  }
}