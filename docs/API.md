# 📖 Dokumentasi REST API Chatbot

Seluruh API admin di bawah path `/api/*` dilindungi menggunakan **Bearer Authentication**. Anda harus menyertakan header `Authorization: Bearer <API_KEY>` pada setiap request.

## 🔐 Konfigurasi Autentikasi
*   **Header Name**: `Authorization`
*   **Header Value**: `Bearer uas_secret_token_2026` *(atau sesuai nilai `ADMIN_API_KEY` di file `.env`)*

---

## 📌 Daftar Endpoint

### 1. Cek Status Server (Public)
Digunakan untuk memonitor apakah server backend menyala dan berjalan.

*   **URL**: `/`
*   **Method**: `GET`
*   **Auth**: Tidak Butuh (Public)
*   **Response**: `text/plain`
    ```text
    Bot Admin Diskominfo is Online! 🚀
    ```

---

### 2. Webhook Telegram (Public)
Endpoint tujuan callback Telegram Bot API saat menerima pesan baru dari user.

*   **URL**: `/webhook`
*   **Method**: `POST`
*   **Auth**: Tidak Butuh (Public)
*   **Request Body**: `application/json` (Telegram Update Object)
*   **Response**: `application/json`
    ```json
    { "ok": true }
    ```

---

### 3. Sinkronisasi Data Google Sheets (Protected)
Digunakan untuk memasukkan atau memperbarui knowledge base secara massal dari integrasi spreadsheet Google.

*   **URL**: `/api/sync-sheets`
*   **Method**: `POST`
*   **Auth**: **Bearer Token Required**
*   **Request Body**: `application/json`
    ```json
    [
      {
        "reference_id": "FAQ-999",
        "type": "faq",
        "question": "Jam operasional kantor?",
        "answer": "Senin - Jumat jam 08:00 sampai 16:00.",
        "is_active": true
      }
    ]
    ```
*   **Response (200 OK)**:
    ```json
    {
      "ok": true,
      "message": "Sinkronisasi Berhasil!"
    }
    ```

---

### 4. Mengambil Data Ulasan/Rating (Protected)
Mengambil riwayat feedback bintang 1-5 yang dikirim oleh pengguna bot, lengkap dengan statistik ulasan rata-rata.

*   **URL**: `/api/ratings`
*   **Method**: `GET`
*   **Auth**: **Bearer Token Required**
*   **Query Parameters**:
    *   `page` (number, optional, default: `1`): Halaman data.
    *   `limit` (number, optional, default: `10`): Jumlah data per halaman.
*   **Response (200 OK)**:
    ```json
    {
      "ok": true,
      "data": [
        {
          "id": 1,
          "session_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          "score": 5,
          "created_at": "2026-07-09T05:00:00.000Z",
          "user_id": 123456789,
          "first_name": "John",
          "username": "johndoe"
        }
      ],
      "stats": {
        "average": 4.5,
        "totalCount": 1
      },
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 1,
        "totalPages": 1
      }
    }
    ```

---

### 5. Mengambil Sesi Percakapan (Protected)
Mengambil daftar sesi percakapan chatbot.

*   **URL**: `/api/sessions`
*   **Method**: `GET`
*   **Auth**: **Bearer Token Required**
*   **Query Parameters**:
    *   `page` (number, optional, default: `1`): Halaman data.
    *   `limit` (number, optional, default: `10`): Jumlah data per halaman.
    *   `status` (string, optional, values: `active` atau `finished`): Filter status sesi.
*   **Response (200 OK)**:
    ```json
    {
      "ok": true,
      "data": [
        {
          "id_session": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          "user_id": 123456789,
          "status": "finished",
          "created_at": "2026-07-09T04:30:00.000Z",
          "updated_at": "2026-07-09T04:35:00.000Z",
          "first_name": "John",
          "username": "johndoe",
          "message_count": 6
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 1,
        "totalPages": 1
      }
    }
    ```

---

### 6. Mengambil Pesan Riwayat Chat per Sesi (Protected)
Mengambil transkrip percakapan lengkap (pesan user dan bot) pada satu sesi tertentu.

*   **URL**: `/api/sessions/:id/messages`
*   **Method**: `GET`
*   **Auth**: **Bearer Token Required**
*   **URL Path Parameter**:
    *   `:id` (string, required): ID UUID sesi percakapan.
*   **Response (200 OK)**:
    ```json
    {
      "ok": true,
      "data": [
        {
          "id": 1,
          "sender": "user",
          "content": "/start",
          "created_at": "2026-07-09T04:30:00.000Z"
        },
        {
          "id": 2,
          "sender": "bot",
          "content": "Halo John! Selamat datang di chatbot kami...",
          "created_at": "2026-07-09T04:30:01.000Z"
        }
      ]
    }
    ```
