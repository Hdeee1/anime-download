# System Architecture: Anime Batch Downloader

This document details the technical architecture, component design, and engineering decisions behind the **Anime Batch Downloader** application.

---

## 1. Component Architecture Diagram

```mermaid
graph TD
    subgraph Client [Frontend Browser - Native ES Modules SPA]
        UI[Web Interface: HTML5 / CSS3]
        AppOrch[app.js - Orchestrator & SSE Dispatcher]
        StateStore[state.js - Central State Store]
        UIComp[components/ - Catalog, Detail, Tray, Modal]
        Services[services/ - Thumbnail AniList, Toast]
        APIClient[api.js - REST & EventSource SSE]
        
        UI --> AppOrch
        AppOrch --> UIComp
        UIComp --> StateStore
        UIComp --> Services
        UIComp --> APIClient
    end

    subgraph GoServer [Go Monolith HTTP Server]
        Router[Go 1.22 http.ServeMux Router]
        AnimeHdl[AnimeHandler]
        DownloadHdl[DownloadHandler]
        
        CatalogSvc[CatalogService RWMutex]
        
        subgraph DownloadEngine [Download Engine]
            Queue[FIFO Job Queue Channel]
            WorkerPool[Worker Pool: 2 Goroutines]
            SSEHub[SSE Event Broadcaster Hub]
        end
    end

    subgraph Storage [Local Filesystem]
        JSONFile[(anime_list.json)]
        VideoDisk[(STORAGE_PATH / Video Directory)]
    end

    subgraph Remote [External Video Provider]
        CDN[Direct MP4 Storage Server]
    end
    APIClient -->|REST Calls| Router
    Router -->|GET /api/anime| AnimeHdl
    Router -->|POST /api/downloads| DownloadHdl
    Router -->|GET /api/downloads/events| DownloadHdl

    %% Service Connections
    AnimeHdl --> CatalogSvc
    DownloadHdl --> CatalogSvc
    DownloadHdl --> Queue
    DownloadHdl --> SSEHub
    CatalogSvc -->|Read/Reload| JSONFile
    CatalogSvc -->|Scan File Exists| VideoDisk

    %% Downloader Connections
    Queue --> WorkerPool
    WorkerPool -->|HTTP GET Stream| CDN
    WorkerPool -->|Atomic Write: .part -> .mp4| VideoDisk
    WorkerPool -->|Push Progress Events| SSEHub
    SSEHub -->|text/event-stream| APIClient
```

---

## 2. Component Responsibilities

### 2.1 `internal/catalog` (Catalog Service)
- Reads `anime_list.json` and maps it to Go data models safely (*thread-safe* using `sync.RWMutex`).
- Scans local disk directories (`os.Stat`) to detect whether a video file already exists (`isDownloaded: true/false`).
- Standardizes directory hierarchy and file naming conventions:
  - Folder: `<Base Storage>/<Anime Title>/Season <N>/`
  - Filename: `<Anime Title> - S<0N>E<0N>.mp4`
- Supports hot *Reload* capabilities without requiring a server restart.

### 2.2 `internal/downloader` (Download Engine)
The download engine is designed for local network stability and protection against CDN rate-limit bans:
- **`WorkerPool`**:
  - Manages fixed worker capacity (**2 concurrent active downloads**).
  - Uses a buffered Go channel as a FIFO Job Queue with a capacity of 500 items.
  - Maps per-job cancellation functions using `context.CancelFunc`.
- **`Worker` (Streaming & Atomic File Writing)**:
  - Performs HTTP streaming using a 64KB buffer.
  - Computes transfer speed and progress percentages every 500ms.
  - **File Integrity**: Data is written to a temporary `<Filename>.mp4.part` file. Only after the HTTP stream reaches 100% completion with EOF is the file atomically renamed to `.mp4`.
  - In case of cancellation (*Cancel*) or network disconnection, the `.part` file is immediately deleted to avoid leaving corrupted files on disk.
- **`SSEHub`**:
  - Distributes real-time events (`progress`, `completed`, `failed`, `canceled`, `enqueued`) to all connected browser clients via `text/event-stream`.

### 2.3 `internal/handler` (HTTP Layer)
- Translates HTTP requests into service calls and returns uniform JSON responses.
- SSE endpoints leverage `http.Flusher` to ensure each event is pushed immediately without being buffered by the web server.

### 2.4 `web/` (Frontend Layer)
- Built with **Vanilla HTML, CSS, and JavaScript Native ES Modules (ESM)** without `node_modules` or bundlers (Webpack/Vite).
- Modular component-based architecture:
  - **`app.js` (Orchestrator)**: Application entry point, component initializer, real-time SSE event dispatcher, and view router.
  - **`state.js`**: Reactive in-memory central state store (`animeList`, `currentAnime`, `activeJobs`).
  - **`api.js`**: REST fetch client and EventSource Server-Sent Events wrapper.
  - **`services/`**: Isolated services such as `thumbnail.js` (AniList GraphQL API + localStorage cache) and `toast.js` (UI notifications).
  - **`components/`**: Self-contained UI components (`catalog-view.js`, `detail-view.js`, `download-tray.js`, `import-modal.js`).
  - **`utils.js`**: Pure utility helpers (`escapeHtml`, `formatBytes`).
- Features a floating drawer (*Download Manager Tray*) that monitors download progress in real time via SSE.

---

## 3. Design Decisions & Trade-offs

| Decision | Rationale / Justification | Trade-off |
| :--- | :--- | :--- |
| **Go Standard Library** | Eliminates *dependency bloat*, provides high performance, and simplifies long-term maintenance. | Slightly more manual routing patterns (addressed with Go 1.22 mux enhancements). |
| **Worker Concurrency = 2** | Prevents residential bandwidth saturation and avoids IP bans from video storage providers. | Batch download speed depends on sequential queue processing rather than mass concurrent downloads. |
| **In-Memory Queue (MVP)** | Lightweight, zero-config, and rapid to implement without setting up an external database (SQLite/PostgreSQL). | If the server is abruptly terminated, active queue state is lost; however, completed files remain secure on disk. |
| **Direct Local Disk Storage** | Eliminates repeated browser download prompts and enables automated folder organization. | The backend server must run on the same physical host as the target storage filesystem. |
