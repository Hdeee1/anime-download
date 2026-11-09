# 🎬 AnimeFlow: Batch Downloader

> Aplikasi web lokal berkinerja tinggi berbasis **Go (Standard Library)** dan **Vanilla Web Technologies** untuk mengelola katalog anime dan mengunduh video direct MP4 secara batch langsung ke direktori komputer Anda.

![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)
![Architecture](https://img.shields.io/badge/Architecture-Monolith-8B5CF6?style=flat)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla_JS_%2B_CSS-F59E0B?style=flat)
![Protocol](https://img.shields.io/badge/Realtime-Server--Sent_Events-10B981?style=flat)

---

## ✨ Fitur Utama

* **⚡ Pengunduh Batch Terkontrol (Worker Pool)**:
  * Menggunakan sistem antrean FIFO terpusat dengan batasan **2 worker paralel**.
  * Bandwidth lokal tidak tercekik dan server CDN terhindar dari pemblokiran rate limit.
* **📂 Struktur Folder & Penamaan Otomatis**:
  * Menghilangkan kerumitan pop-up browser save file.
  * File langsung terorganisir rapi di disk lokal (sesuai `STORAGE_PATH` di `.env`):
    ```
    STORAGE_PATH/
    └── Kusuriya no Hitorigoto/
        └── Season 1/
            ├── Kusuriya no Hitorigoto - S01E01.mp4
            └── Kusuriya no Hitorigoto - S01E02.mp4
    ```
* **🛡️ Integritas File Atomik (`.part`)**:
  * Data diunduh ke file sementara `<Filename>.part`.
  * Hanya setelah streaming sukses 100%, file di-rename menjadi `.mp4`.
  * Pembatalan (*Cancel*) atau kegagalan jaringan otomatis membersihkan file sementara agar tidak menyisakan file korup.
* **📡 Pembaruan Real-Time (Server-Sent Events)**:
  * Memantau persentase, transfer byte, dan kecepatan unduhan (MB/s) secara langsung tanpa membebani browser dengan polling berulang.
* **🎨 Tampilan Modern Anime Dark Theme**:
  * Single Page Application dengan estetika glassmorphism, badge status dinamis (*Downloaded*, *Downloading*, *Queued*, *Coming Soon*), tab season, dan laci mengambang (*Floating Download Manager*).
* **🔄 Hot-Reload Data Katalog**:
  * Cukup perbarui berkas `anime_list.json` dan klik tombol **"Reload Data"** di navigasi untuk sinkronisasi instan tanpa me-restart server.

---

## 🚀 Memulai Cepat (Quick Start)

### 1. Prasyarat
* [Go 1.22+](https://go.dev/dl/) terpasang di komputer Anda.
* Direktori penyimpanan video lokal (diatur melalui `STORAGE_PATH` di `.env`).

### 2. Konfigurasi Lingkungan & Data
Salin template konfigurasi dan katalog contoh:
```bash
# Salin konfigurasi environment lokal
cp .env.example .env

# Salin berkas katalog contoh jika belum memiliki anime_list.json
cp anime_list.example.json anime_list.json
```
> Atur target direktori penyimpanan video pada variabel `STORAGE_PATH` di dalam file `.env`. Berkas `.env` telah diabaikan oleh `.gitignore` sehingga path lokal pribadi Anda tetap aman dan rahasia.

### 3. Kompilasi & Jalankan Server
Menggunakan **Makefile**:
```bash
# Kompilasi dan langsung jalankan server
make run
```
Atau manual menggunakan Go:
```bash
go build -o bin/anime-downloader .
./bin/anime-downloader
```

### 4. Buka di Browser
Akses antarmuka web melalui:
👉 **[http://localhost:8080](http://localhost:8080)**

---

## 🛠️ Struktur Direktori Proyek

```
anime-download/
├── bin/                          # Output biner hasil kompilasi (diabaikan git)
│   └── anime-downloader
├── docs/                         # Dokumentasi teknis mendalam
│   ├── api_contract.md           # Spesifikasi REST API & stream Server-Sent Events
│   ├── architecture.md           # Arsitektur sistem, worker pool, & diagram alur
│   └── development_guide.md      # Panduan pengembangan & roadmap post-MVP
├── internal/
│   ├── catalog/                  # Layanan pembaca JSON & pemindai disk fisik
│   │   ├── catalog.go
│   │   └── catalog_test.go       # Unit test catalog & storage mapper
│   ├── downloader/               # Worker pool, antrean FIFO, & atomic streaming
│   │   ├── worker_pool.go
│   │   ├── worker_pool_test.go   # Unit test antrean & pembatalan job
│   │   └── worker.go
│   ├── handler/                  # REST API & SSE HTTP Handlers
│   │   ├── anime_handler.go
│   │   └── download_handler.go
│   └── model/                    # Definisi Go structs (katalog, status, jobs)
│       └── anime.go
├── web/                          # Frontend Single Page Application (Native ES Modules)
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css         # Desain responsif modern dark glassmorphism
│   │   └── js/
│   │       ├── components/       # Komponen UI: catalog, detail, tray, import-modal
│   │       ├── services/         # Layanan: thumbnail (AniList GraphQL), toast
│   │       ├── api.js            # Klien HTTP & EventSource SSE listener (ESM)
│   │       ├── app.js            # Main entry point & SSE orchestrator (<160 baris)
│   │       ├── state.js          # Central in-memory state store
│   │       └── utils.js          # Helper fungsi sanitasi & format string
│   └── index.html                # Entry template HTML5 (<script type="module">)
├── anime_list.example.json       # Template struktur katalog anime
├── go.mod                        # Modul Go definition
├── Makefile                      # Otomasi build, run, test, dan clean
└── README.md                     # Dokumentasi utama proyek
```

---

## 📚 Dokumentasi Lanjutan

Untuk informasi teknis lebih mendalam, silakan baca dokumen di folder `docs/`:

* 📖 **[Dokumentasi Kontrak API](docs/api_contract.md)**: Detail seluruh endpoint HTTP REST, payload JSON, dan struktur event SSE.
* 🏗️ **[Arsitektur & Desain Sistem](docs/architecture.md)**: Penjelasan arsitektur monolith, concurrency model, mitigasi file korup, dan diagram Mermaid.
* 💻 **[Panduan Pengembang & Roadmap](docs/development_guide.md)**: Variabel lingkungan (`PORT`, `STORAGE_PATH`), cara menambah episode baru, dan ide pengembangan masa depan.

---

## 🧪 Menjalankan Pengujian

Jalankan seluruh rangkaian unit test:
```bash
make test
```
Atau via `go test`:
```bash
go test -v ./...
```
