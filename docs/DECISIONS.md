# Architectural Decision Records (ADR)

## ADR-001: Modularisasi Frontend Menggunakan Native ES Modules

- **Status:** Diterima & Diimplementasikan
- **Tanggal:** 2026-11-09
- **Konteks:**
  Frontend SPA sebelumnya ditulis di dalam berkas monolitik `web/static/js/app.js` yang mencapai 1.233 baris dan objek global `window.API` di `web/static/js/api.js`. Berkas ini mencampurkan state store, utilities, service AniList GraphQL, view rendering, sistem toast, SSE event listeners, dan form wizard import modal. Hal ini meningkatkan risiko regresi saat menambahkan fitur baru.
- **Keputusan:**
  Memecah kode frontend menjadi Native ECMAScript Modules (ESM) terpisah (`services/`, `components/`, `utils.js`, `state.js`, `api.js`) dan dieksekusi langsung oleh browser melalui `<script type="module" src="/static/js/app.js"></script>`.
- **Konsekuensi:**
  - **Positif:**
    - Pemisahan tanggung jawab (*Separation of Concerns*) yang jelas dan modular.
    - Ukuran `app.js` berkurang drastis menjadi ~150 baris sebagai orchestrator.
    - Mempertahankan filosofi nol dependensi eksternal (*zero node_modules/bundlers*) sesuai `AGENTS.md`.
    - Modul dapat di-cache secara independen oleh HTTP cache browser.
  - **Negatif / Trade-off:**
    - Membutuhkan browser modern yang mendukung Native ES Modules (sudah didukung oleh 99%+ browser sejak 2018).
