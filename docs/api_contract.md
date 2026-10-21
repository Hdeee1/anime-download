# Dokumentasi Kontrak API: Anime Batch Downloader

Dokumen ini mendefinisikan kontrak komunikasi antara Frontend SPA dan Backend Go Monolith.

---

## 1. Format Respons Standar

Seluruh endpoint REST API menggunakan format amplop JSON standar:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Jika terjadi error, field `success` bernilai `false`, `data` bernilai `null`, dan `error` berisi pesan error:

```json
{
  "success": false,
  "data": null,
  "error": "Pesan deskripsi kesalahan"
}
```

---

## 2. Endpoints Katalog Anime

### 2.1 `GET /api/anime`
Mengambil ringkasan seluruh serial anime untuk tampilan kartu (Cards) di halaman utama.

* **Method**: `GET`
* **Query Parameters**: Tidak ada
* **Status Response**: `200 OK`
* **Contoh Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "kusuriya-no-hitorigoto",
      "title": "Kusuriya no Hitorigoto",
      "totalSeasons": 2,
      "totalEpisodes": 24,
      "downloadedEpisodes": 5
    },
    {
      "id": "grand-blue",
      "title": "Grand Blue",
      "totalSeasons": 1,
      "totalEpisodes": 12,
      "downloadedEpisodes": 0
    }
  ],
  "error": null
}
```

---

### 2.2 `GET /api/anime/{id}`
Mengambil detail satu anime beserta seluruh season, daftar episode, dan status keberadaan fisik file di storage lokal.

* **Method**: `GET`
* **Path Parameter**: `id` (contoh: `kusuriya-no-hitorigoto`)
* **Status Response**: `200 OK` atau `404 Not Found`
* **Contoh Response**:
```json
{
  "success": true,
  "data": {
    "id": "kusuriya-no-hitorigoto",
    "title": "Kusuriya no Hitorigoto",
    "seasons": [
      {
        "season": 1,
        "title": "Season 1",
        "totalEpisodes": 24,
        "downloadedCount": 1,
        "episodes": [
          {
            "number": 1,
            "url": "https://storages.anime.com/Kusuriya%20no%20Hitorigoto-1080p.mp4",
            "isDownloaded": true,
            "filename": "Kusuriya no Hitorigoto - S01E01.mp4",
            "fileSize": 452189020
          },
          {
            "number": 2,
            "url": "https://storages.anime.com/Kusuriya%20no%20Hitorigoto-1080p.mp4",
            "isDownloaded": false,
            "filename": "Kusuriya no Hitorigoto - S01E02.mp4",
            "fileSize": 0
          }
        ]
      },
      {
        "season": 2,
        "title": "Season 2",
        "totalEpisodes": 0,
        "downloadedCount": 0,
        "episodes": []
      }
    ]
  },
  "error": null
}
```

---

### 2.3 `POST /api/anime/reload`
Memuat ulang berkas `anime_list.json` dari disk tanpa perlu me-restart server Go.

* **Method**: `POST`
* **Request Body**: Kosong
* **Status Response**: `200 OK`
* **Contoh Response**:
```json
{
  "success": true,
  "data": {
    "message": "Catalog reloaded successfully",
    "totalAnime": 6
  },
  "error": null
}
```

---

## 3. Endpoints Download Manager

### 3.1 `POST /api/downloads`
Mendaftarkan satu atau banyak episode ke antrean download (batch download).

* **Method**: `POST`
* **Request Header**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "animeId": "kusuriya-no-hitorigoto",
  "seasonNumber": 1,
  "episodeNumbers": [2, 3, 4]
}
```
* **Status Response**: `202 Accepted`
* **Contoh Response**:
```json
{
  "success": true,
  "data": {
    "enqueuedCount": 3,
    "jobs": [
      {
        "jobId": "job-kusuriya-no-hitorigoto-s01e02-482910",
        "animeId": "kusuriya-no-hitorigoto",
        "animeTitle": "Kusuriya no Hitorigoto",
        "season": 1,
        "episode": 2,
        "filename": "Kusuriya no Hitorigoto - S01E02.mp4",
        "status": "QUEUED",
        "progress": 0,
        "downloadedBytes": 0,
        "totalBytes": 0,
        "speed": "0 KB/s",
        "error": null
      }
    ]
  },
  "error": null
}
```

---

### 3.2 `GET /api/downloads`
Mendapatkan daftar seluruh job unduhan yang sedang berjalan, mengantre, atau baru saja selesai.

* **Method**: `GET`
* **Status Response**: `200 OK`
* **Contoh Response**:
```json
{
  "success": true,
  "data": {
    "activeWorkers": 2,
    "maxWorkers": 2,
    "jobs": [
      {
        "jobId": "job-kusuriya-no-hitorigoto-s01e02-482910",
        "animeId": "kusuriya-no-hitorigoto",
        "animeTitle": "Kusuriya no Hitorigoto",
        "season": 1,
        "episode": 2,
        "filename": "Kusuriya no Hitorigoto - S01E02.mp4",
        "status": "DOWNLOADING",
        "progress": 45.8,
        "downloadedBytes": 204857600,
        "totalBytes": 447283200,
        "speed": "3.8 MB/s",
        "error": null
      }
    ]
  },
  "error": null
}
```

---

### 3.3 `DELETE /api/downloads/{jobId}`
Membatalkan proses unduhan.
- Jika job sedang aktif berjalan: HTTP connection streaming langsung diputus seketika, dan file sementara `.part` dihapus dari disk.
- Jika job masih di antrean: Job ditandai `CANCELED` dan diabaikan saat giliran tiba.

* **Method**: `DELETE`
* **Path Parameter**: `jobId`
* **Status Response**: `200 OK` (atau `404 Not Found`)
* **Contoh Response**:
```json
{
  "success": true,
  "data": {
    "jobId": "job-kusuriya-no-hitorigoto-s01e02-482910",
    "status": "CANCELED"
  },
  "error": null
}
```

---

## 4. Server-Sent Events (SSE) Stream

### Endpoint: `GET /api/downloads/events`
Koneksi streaming satu arah (unidirectional) dari server Go ke frontend browser untuk memberikan pembaruan status real-time tanpa polling berulang.

* **Headers Response**:
  * `Content-Type: text/event-stream`
  * `Cache-Control: no-cache`
  * `Connection: keep-alive`

### Event Types:

#### 1. `event: progress`
Dipancarkan setiap ~500ms selama streaming download berjalan aktif.
```http
event: progress
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e02-482910","animeId":"kusuriya-no-hitorigoto","season":1,"episode":2,"status":"DOWNLOADING","progress":52.4,"downloadedBytes":234128000,"totalBytes":447283200,"speed":"4.2 MB/s"}
```

#### 2. `event: completed`
Dipancarkan setelah file tuntas 100% dan berhasil di-rename atomik ke ekstensi `.mp4`.
```http
event: completed
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e02-482910","animeId":"kusuriya-no-hitorigoto","season":1,"episode":2,"filename":"Kusuriya no Hitorigoto - S01E02.mp4","fileSize":447283200}
```

#### 3. `event: failed`
Dipancarkan jika terjadi kegagalan koneksi atau error I/O.
```http
event: failed
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e02-482910","animeId":"kusuriya-no-hitorigoto","season":1,"episode":2,"error":"connection reset by peer"}
```

#### 4. `event: canceled`
Dipancarkan saat pengguna membatalkan job melalui tombol batal.
```http
event: canceled
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e02-482910","animeId":"kusuriya-no-hitorigoto","season":1,"episode":2}
```

#### 5. `event: enqueued`
Dipancarkan saat job baru didaftarkan ke antrean.
```http
event: enqueued
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e03-482911","animeId":"kusuriya-no-hitorigoto","season":1,"episode":3,"filename":"Kusuriya no Hitorigoto - S01E03.mp4","status":"QUEUED"}
```
