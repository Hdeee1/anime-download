# 🎬 AnimeFlow: Batch Downloader

> A high-performance local web application built with **Go (Standard Library)** and **Vanilla Web Technologies (Native ES Modules)** for managing anime catalogs and downloading direct MP4 videos in batch directly to your computer's filesystem.

![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)
![Architecture](https://img.shields.io/badge/Architecture-Monolith-8B5CF6?style=flat)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla_ES_Modules-F59E0B?style=flat)
![Protocol](https://img.shields.io/badge/Realtime-Server--Sent_Events-10B981?style=flat)

---

## ✨ Key Features

* **⚡ Controlled Batch Downloader (Worker Pool)**:
  * Employs a centralized FIFO job queue with a limit of **2 concurrent workers**.
  * Prevents local network saturation and avoids rate-limit bans from CDN storage providers.
* **📂 Automated Folder Hierarchy & Naming**:
  * Eliminates repetitive browser "Save As" prompts.
  * Organizes files cleanly on your local disk (configured via `STORAGE_PATH` in `.env`):
    ```
    STORAGE_PATH/
    └── Kusuriya no Hitorigoto/
        └── Season 1/
            ├── Kusuriya no Hitorigoto - S01E01.mp4
            └── Kusuriya no Hitorigoto - S01E02.mp4
    ```
* **🛡️ Atomic File Integrity (`.part`)**:
  * Streams incoming video to a temporary `<Filename>.part` file.
  * Only after the stream completes with 100% byte verification is the file atomically renamed to `.mp4`.
  * Manual cancellations or connection dropouts automatically clean up partial files, preventing corrupted video files.
* **📡 Real-Time Progress (Server-Sent Events)**:
  * Broadcasts percentage, transferred bytes, and real-time transfer speed (MB/s) without browser polling overhead.
* **🎨 Modern Anime Dark Theme & Native ES Modules**:
  * Single Page Application featuring a dark glassmorphism aesthetic, dynamic status badges (*Downloaded*, *Downloading*, *Queued*, *Coming Soon*), season tabs, and a floating download manager tray.
* **🔄 Hot-Reload Catalog Data**:
  * Simply update the `anime_list.json` file and click **"Reload Data"** in the navigation bar for instant synchronization without restarting the server.

---

## 🚀 Quick Start

### 1. Prerequisites
* [Go 1.22+](https://go.dev/dl/) installed on your machine.
* A target local directory for video storage (configured via `STORAGE_PATH` in `.env`).

### 2. Environment & Data Configuration
Copy the environment template and example catalog:
```bash
# Copy local environment configuration
cp .env.example .env

# Copy example catalog if you do not have anime_list.json yet
cp anime_list.example.json anime_list.json
```
> Configure your target storage directory using the `STORAGE_PATH` variable inside `.env`. The `.env` file is ignored by `.gitignore` to keep your personal local paths private.

### 3. Build & Run Server
Using **Makefile**:
```bash
# Compile and immediately run the server
make run
```
Or manually using Go:
```bash
go build -o bin/anime-downloader .
./bin/anime-downloader
```

### 4. Open in Browser
Access the web interface at:
👉 **[http://localhost:8080](http://localhost:8080)**

---

## 🛠️ Project Directory Structure

```
anime-download/
├── bin/                          # Compiled binary output (git-ignored)
│   └── anime-downloader
├── docs/                         # In-depth technical documentation
│   ├── api_contract.md           # REST API & Server-Sent Events specifications
│   ├── architecture.md           # System architecture, worker pool, & data flow
│   ├── ASSETS.md                 # External asset sourcing and licensing log
│   ├── DECISIONS.md              # Architectural Decision Records (ADR)
│   └── development_guide.md      # Developer guide & post-MVP roadmap
├── internal/
│   ├── catalog/                  # JSON catalog service & physical disk scanner
│   │   ├── catalog.go
│   │   └── catalog_test.go       # Catalog & storage path unit tests
│   ├── downloader/               # Worker pool, FIFO queue, & atomic streaming
│   │   ├── worker_pool.go
│   │   ├── worker_pool_test.go   # Queue & job cancellation unit tests
│   │   └── worker.go
│   ├── handler/                  # REST API & SSE HTTP handlers
│   │   ├── anime_handler.go
│   │   ├── download_handler.go
│   │   └── handler_test.go
│   └── model/                    # Go structs (catalog, status, jobs, API DTOs)
│       └── anime.go
├── web/                          # Frontend Single Page Application (Native ES Modules)
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css         # Responsive modern dark glassmorphism stylesheet
│   │   ├── images/
│   │   │   └── poster-placeholder.svg # Minimal SVG poster fallback
│   │   └── js/
│   │       ├── components/       # UI components: catalog, detail, tray, import-modal
│   │       ├── services/         # Services: thumbnail (AniList GraphQL), toast
│   │       ├── api.js            # HTTP client & EventSource SSE listener (ESM)
│   │       ├── app.js            # Main entry point & SSE orchestrator (<160 lines)
│   │       ├── state.js          # Central in-memory state store
│   │       └── utils.js          # Sanitization & string formatting helpers
│   └── index.html                # HTML5 entry template (<script type="module">)
├── anime_list.example.json       # Example catalog template
├── go.mod                        # Go module definition
├── Makefile                      # Build, run, test, and clean automation
└── README.md                     # Main project documentation
```

---

## 📚 Further Documentation

For in-depth technical references, see the files in the `docs/` directory:

* 📖 **[API Contract Documentation](docs/api_contract.md)**: Full REST HTTP endpoint specifications, JSON payloads, and SSE stream schemas.
* 🏗️ **[System Architecture & Design](docs/architecture.md)**: Monolith architecture overview, concurrency model, file integrity mitigation, and Mermaid diagrams.
* 💻 **[Developer Guide & Roadmap](docs/development_guide.md)**: Environment variables (`PORT`, `STORAGE_PATH`), catalog update instructions, and post-MVP roadmap.
* ⚖️ **[Architectural Decision Records (ADR)](docs/DECISIONS.md)**: Key design decisions, trade-offs, and motivations.
* 🎨 **[Asset Attribution & Licensing](docs/ASSETS.md)**: Third-party fonts, icons, and placeholder asset records.

---

## 🧪 Running Tests

Run the full unit test suite:
```bash
make test
```
Or via Go directly:
```bash
go test -v ./...
```
