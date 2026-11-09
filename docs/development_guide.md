# Developer Guide

This guide is intended for developers to understand how to run, test, and build new features for **Anime Batch Downloader**.

---

## 1. Environment Prerequisites

* **Go**: Version 1.22 or newer.
* **Make**: GNU Make (optional, for running build targets).
* **Browser**: Modern web browser supporting HTML5 & EventSource (Chrome, Firefox, Safari, Edge).

---

## 2. Environment Configuration (.env & Environment Variables)

The application automatically reads the local `.env` file on startup. Copy `.env.example` to `.env` to configure your environment safely:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | HTTP port where the server listens for connections. |
| `STORAGE_PATH` | `./downloads` | Root directory on the local filesystem for downloaded videos. |
| `CATALOG_PATH` | `./anime_list.json` | Path to the JSON catalog file. |

> [!TIP]
> The `.env` file is excluded via `.gitignore` so your personal local directory paths and configurations remain private.

### Running with Custom Inline Environment Variables:
```bash
PORT=9000 STORAGE_PATH="/media/hdd/Anime" CATALOG_PATH="./data.json" ./bin/anime-downloader
```

---

## 3. Adding New Anime to the Catalog

1. Open `anime_list.json` in your favorite editor.
2. Add a new anime object following this schema:
```json
{
  "id": "anime-title-kebab-case",
  "title": "Anime Title",
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
3. Save the file, then click the **"Reload Data"** button in the web navigation bar. The new entries will appear immediately without requiring a Go server restart.
> Alternatively, you can use the **"+ Import / Add"** modal directly from the web interface to add anime or episodes via the REST API.

---

## 4. Development Commands (Makefile)

Use the provided `Makefile` commands:

```bash
# Compile binary to bin/anime-downloader
make build

# Compile and immediately run the server
make run

# Run all unit tests
make test

# Remove build outputs in bin/
make clean
```

---

## 5. Testing Guidelines

* **Catalog Unit Tests**: Stored under `internal/catalog/*_test.go`. Ensure tests verify JSON parsing, handling of empty seasons, and local storage path sanitization.
* **Downloader Unit Tests**: Stored under `internal/downloader/*_test.go`. Ensure tests verify FIFO queuing, worker capacity limits, atomic `.part` renaming, and context cancellation.

To execute tests with verbose race detection:
```bash
go test -v -race ./...
```

---

## 6. Post-MVP Feature Roadmap

The following enhancements are prioritized for future iterations:

1. **Partial Download Resume**:
   - Utilize HTTP `Range: bytes=offset-` headers when supported by the CDN, allowing interrupted `.part` files to resume without restarting from 0%.
2. **Dynamic Concurrency Control**:
   - Provide a UI control (e.g., 1 to 4 workers) so users can adjust parallel downloads according to local bandwidth conditions.
3. **Embedded Video Player**:
   - For episodes marked *"Downloaded"*, provide an in-browser HTML5 `<video>` modal player to verify and watch videos without switching to an external player.
4. **Link Import / Bulk Ingestion**:
   - Modal input parsing bulk text link lists, automatically extracting episode numbers and persisting them to `anime_list.json`.
