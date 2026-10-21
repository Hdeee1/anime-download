package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"anime-download/internal/catalog"
	"anime-download/internal/downloader"
	"anime-download/internal/model"
)

type DownloadHandler struct {
	catalog    *catalog.CatalogService
	workerPool *downloader.WorkerPool
}

func NewDownloadHandler(catalog *catalog.CatalogService, workerPool *downloader.WorkerPool) *DownloadHandler {
	return &DownloadHandler{
		catalog:    catalog,
		workerPool: workerPool,
	}
}

// EnqueueDownloads handles POST /api/downloads
func (h *DownloadHandler) EnqueueDownloads(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req model.DownloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	if req.AnimeID == "" || req.SeasonNumber <= 0 || len(req.EpisodeNumbers) == 0 {
		writeError(w, http.StatusBadRequest, "animeId, seasonNumber, and at least one episodeNumber are required")
		return
	}

	enqueuedJobs := make([]model.DownloadJob, 0, len(req.EpisodeNumbers))

	for _, epNum := range req.EpisodeNumbers {
		title, epURL, err := h.catalog.FindEpisode(req.AnimeID, req.SeasonNumber, epNum)
		if err != nil {
			continue // skip invalid episodes
		}

		_, filename, fullPath := h.catalog.GetStoragePath(title, req.SeasonNumber, epNum)

		// Check if already exists
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			continue // skip already downloaded file
		}

		jobID := downloader.GenerateJobID(req.AnimeID, req.SeasonNumber, epNum)
		job := &model.DownloadJob{
			JobID:      jobID,
			AnimeID:    req.AnimeID,
			AnimeTitle: title,
			Season:     req.SeasonNumber,
			Episode:    epNum,
			URL:        epURL,
			TargetPath: fullPath,
			Filename:   filename,
			Status:     model.StatusQueued,
			Progress:   0,
			Speed:      "0 KB/s",
		}

		jobSnapshot := *job
		if err := h.workerPool.Enqueue(job); err == nil {
			enqueuedJobs = append(enqueuedJobs, jobSnapshot)
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"enqueuedCount": len(enqueuedJobs),
		"jobs":          enqueuedJobs,
	})
}

// GetDownloads handles GET /api/downloads
func (h *DownloadHandler) GetDownloads(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	jobs := h.workerPool.GetAllJobs()
	writeJSON(w, http.StatusOK, map[string]any{
		"activeWorkers": h.workerPool.ActiveCount(),
		"maxWorkers":    h.workerPool.MaxWorkers(),
		"jobs":          jobs,
	})
}

// CancelDownload handles DELETE /api/downloads/{jobId}
func (h *DownloadHandler) CancelDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	jobID := r.PathValue("jobId")
	if jobID == "" {
		jobID = strings.TrimPrefix(r.URL.Path, "/api/downloads/")
	}

	if jobID == "" {
		writeError(w, http.StatusBadRequest, "Missing jobId")
		return
	}

	canceled := h.workerPool.Cancel(jobID)
	if !canceled {
		writeError(w, http.StatusNotFound, "Job not found or already finished")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"jobId":  jobID,
		"status": model.StatusCanceled,
	})
}

// EventsStream handles GET /api/downloads/events (SSE)
func (h *DownloadHandler) EventsStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	eventCh := h.workerPool.Subscribe()
	defer h.workerPool.Unsubscribe(eventCh)

	// Send initial ping event so client knows connection is ready
	fmt.Fprintf(w, "event: ping\ndata: {}\n\n")
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-eventCh:
			if !ok {
				return
			}
			jsonBytes, err := json.Marshal(evt.Data)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Event, string(jsonBytes))
			flusher.Flush()
		}
	}
}
