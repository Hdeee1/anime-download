# API Contract Documentation: Anime Batch Downloader

This document defines the communication contract between the Single Page Application (SPA) frontend and the Go Monolith backend.

---

## 1. Standard Response Envelope

All REST API endpoints use a uniform JSON response envelope:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

If an error occurs, `success` evaluates to `false`, `data` is `null`, and `error` contains the descriptive error string:

```json
{
  "success": false,
  "data": null,
  "error": "Descriptive error message"
}
```

---

## 2. Anime Catalog Endpoints

### 2.1 `GET /api/anime`
Retrieves a summary list of all anime series for grid card rendering on the home view.

* **Method**: `GET`
* **Query Parameters**: None
* **Status Code**: `200 OK`
* **Example Response**:
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
Retrieves detailed information for a single anime including all seasons, episode lists, and physical disk availability status.

* **Method**: `GET`
* **Path Parameter**: `id` (e.g., `kusuriya-no-hitorigoto`)
* **Status Code**: `200 OK` or `404 Not Found`
* **Example Response**:
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

### 2.3 `POST /api/anime`
Creates a new anime series, appends a new season, or adds episodes directly to the catalog, persisting changes atomically to `anime_list.json`. If an episode number already exists in the given season, its URL is overwritten.

* **Method**: `POST`
* **Request Header**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "animeId": "kusuriya-no-hitorigoto",
  "animeTitle": "",
  "seasonNumber": 1,
  "seasonTitle": "Season 1",
  "episodes": [
    {
      "number": 25,
      "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
    }
  ]
}
```
* **Status Code**: `201 Created` or `400 Bad Request`
* **Example Response**: Returns the updated `AnimeDetail` object.

---

### 2.4 `POST /api/anime/reload`
Reloads the `anime_list.json` file from disk into server memory without restarting the Go process.

* **Method**: `POST`
* **Request Body**: Empty
* **Status Code**: `200 OK`
* **Example Response**:
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

## 3. Download Manager Endpoints

### 3.1 `POST /api/downloads`
Enqueues one or multiple episodes into the batch download FIFO queue.

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
* **Status Code**: `202 Accepted`
* **Example Response**:
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
Returns the status of all active, queued, or recently finished download jobs.

* **Method**: `GET`
* **Status Code**: `200 OK`
* **Example Response**:
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
Cancels an ongoing or queued download job.
- If the job is currently streaming: The HTTP stream connection is terminated immediately, and the temporary `.part` file is unlinked from disk.
- If the job is queued: The job is marked as `CANCELED` and bypassed when pulled by workers.

* **Method**: `DELETE`
* **Path Parameter**: `jobId`
* **Status Code**: `200 OK` (or `404 Not Found`)
* **Example Response**:
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
A unidirectional real-time streaming connection from the Go backend to browser clients via `text/event-stream`.

* **Response Headers**:
  * `Content-Type: text/event-stream`
  * `Cache-Control: no-cache`
  * `Connection: keep-alive`

### Event Types:

#### 1. `event: progress`
Emitted every ~500ms while an active download is streaming.
```http
event: progress
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e02-482910","animeId":"kusuriya-no-hitorigoto","season":1,"episode":2,"status":"DOWNLOADING","progress":52.4,"downloadedBytes":234128000,"totalBytes":447283200,"speed":"4.2 MB/s"}
```

#### 2. `event: completed`
Emitted once the video file is 100% verified and atomically renamed to `.mp4`.
```http
event: completed
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e02-482910","animeId":"kusuriya-no-hitorigoto","season":1,"episode":2,"filename":"Kusuriya no Hitorigoto - S01E02.mp4","fileSize":447283200}
```

#### 3. `event: failed`
Emitted when network disconnection or I/O failure occurs.
```http
event: failed
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e02-482910","animeId":"kusuriya-no-hitorigoto","season":1,"episode":2,"error":"connection reset by peer"}
```

#### 4. `event: canceled`
Emitted when the user cancels the job via the UI.
```http
event: canceled
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e02-482910","animeId":"kusuriya-no-hitorigoto","season":1,"episode":2}
```

#### 5. `event: enqueued`
Emitted when a new download job is enqueued.
```http
event: enqueued
data: {"jobId":"job-kusuriya-no-hitorigoto-s01e03-482911","animeId":"kusuriya-no-hitorigoto","season":1,"episode":3,"filename":"Kusuriya no Hitorigoto - S01E03.mp4","status":"QUEUED"}
```
