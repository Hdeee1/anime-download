# Panduan Pengembangan (Development Guide)

Panduan ini ditujukan bagi developer untuk memahami cara menjalankan, menguji, dan mengembangkan fitur-fitur baru pada **Anime Batch Downloader**.

---

## 1. Prasyarat Lingkungan

* **Go**: Versi 1.22 atau lebih baru.
* **Make**: GNU Make (opsional, untuk menjalankan target build).
* **Browser**: Modern web browser dengan dukungan HTML5 & EventSource (Chrome, Firefox, Safari, Edge).

---

## 2. Konfigurasi Lingkungan (.env & Environment Variables)

Aplikasi secara otomatis membaca berkas `.env` saat pertama kali dijalankan. Salin berkas `.env.example` ke `.env` untuk mengatur konfigurasi Anda secara aman:

```bash
cp .env.example .env
```

| Variabel | Default | Keterangan |
| :--- | :--- | :--- |
| `PORT` | `8080` | Port HTTP tempat server mendengarkan koneksi. |
| `STORAGE_PATH` | `./downloads` | Direktori lokal root untuk penyimpanan video hasil unduhan. |
| `CATALOG_PATH` | `./anime_list.json` | Path ke berkas JSON sumber katalog anime. |

> [!TIP]
> Berkas `.env` telah dimasukkan ke `.gitignore` sehingga path lokal dan konfigurasi pribadi Anda tidak akan pernah tersebar ke repository publik.

### Contoh Menjalankan dengan Variabel Kustom Langsung:
```bash
PORT=9000 STORAGE_PATH="/media/hdd/Anime" CATALOG_PATH="./data.json" ./bin/anime-downloader
```

---

## 3. Menambahkan Anime Baru ke Katalog

1. Buka berkas `anime_list.json` di text editor favorit Anda.
2. Tambahkan objek anime baru mengikuti struktur berikut:
```json
{
  "id": "judul-anime-kebab-case",
  "title": "Judul Anime",
  "seasons": [
    {
      "season": 1,
      "title": "Season 1",
      "totalEpisodes": 12,
      "episodes": [
        {
          "number": 1,
          "url": "https://storages.domain.com/Anime/1-1080p-timestamp.mp4"
        }
      ]
    }
  ]
}
```
3. Simpan berkas, lalu di antarmuka web, klik tombol **"Reload Data"** di header navbar. Data baru akan langsung muncul tanpa perlu me-restart server Go.

---

## 4. Perintah Pengembangan (Makefile)

Gunakan perintah make berikut:

```bash
# Melakukan kompilasi kode ke bin/anime-downloader
make build

# Mengkompilasi dan langsung menjalankan server
make run

# Menjalankan seluruh pengujian unit
make test

# Menghapus output kompilasi di folder bin/
make clean
```

---

## 5. Menulis Pengujian (Testing Guidelines)

* **Unit Test Katalog**: Simpan di `internal/catalog/*_test.go`. Pastikan menguji pembacaan JSON, penanganan season kosong, dan pemetaan path lokal.
* **Unit Test Downloader**: Simpan di `internal/downloader/*_test.go`. Pastikan menguji antrean, batas worker, dan pembatalan (*cancel context*).

Untuk menjalankan pengujian dengan detail output:
```bash
go test -v -race ./...
```

---

## 6. Roadmap Ide Fitur Masa Depan (Post-MVP)

Jika Anda ingin melanjutkan pengembangan di masa depan, berikut beberapa peningkatan yang telah dirancang untuk mudah diintegrasikan:

1. **Resume Partial Download**:
   - Manfaatkan header HTTP `Range: bytes=offset-` jika server CDN mendukungnya, sehingga file `.part` yang terputus dapat dilanjutkan tanpa mengulang dari 0%.
2. **Pengaturan Concurrency Dinamis**:
   - Menyediakan slider di UI (misal: 1 s.d. 4 worker) yang dapat disetel pengguna sesuai kondisi kecepatan internet.
3. **Form UI Input / Import Link**:
   - Modal input untuk menempelkan teks daftar link download sekaligus, lalu backend otomatis mengekstrak nomor episode dan menyimpannya ke `anime_list.json`.
4. **Embedded Video Player**:
   - Untuk episode yang sudah berstatus *"Downloaded"*, sediakan tombol play yang memutar video langsung di browser menggunakan tag `<video>` lokal.
