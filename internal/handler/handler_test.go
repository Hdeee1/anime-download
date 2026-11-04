package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"anime-download/internal/catalog"
	"anime-download/internal/downloader"
	"anime-download/internal/model"
)

func setupTestServices(t *testing.T) (*catalog.CatalogService, *downloader.WorkerPool, string) {
	tempDir := t.TempDir()
	jsonFile := filepath.Join(tempDir, "test.json")
	storageDir := filepath.Join(tempDir, "storage")

	catalogData := `{
  "anime": [
    {
      "id": "test-anime",
      "title": "Test Anime",
      "seasons": [
        {
          "season": 1,
          "title": "Season 1",
          "totalEpisodes": 2,
          "episodes": [
            { "number": 1, "url": "https://example.com/1.mp4" },
            { "number": 2, "url": "https://example.com/2.mp4" }
          ]
        }
      ]
    }
  ]
}`
	if err := os.WriteFile(jsonFile, []byte(catalogData), 0644); err != nil {
		t.Fatalf("Failed to write test catalog: %v", err)
	}

	cs, err := catalog.NewCatalogService(jsonFile, storageDir)
	if err != nil {
		t.Fatalf("Failed to initialize catalog: %v", err)
	}

	wp := downloader.NewWorkerPool(2, 10)
	wp.Start()

	return cs, wp, tempDir
}

func TestAnimeHandler_GetAllAnime(t *testing.T) {
	cs, wp, _ := setupTestServices(t)
	defer wp.Stop()

	h := NewAnimeHandler(cs)
	req := httptest.NewRequest(http.MethodGet, "/api/anime", nil)
	rr := httptest.NewRecorder()

	h.GetAllAnime(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", rr.Code)
	}

	var resp model.APIResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse json response: %v", err)
	}
	if !resp.Success {
		t.Errorf("Expected success to be true")
	}
}

func TestDownloadHandler_EnqueueAndCancel(t *testing.T) {
	cs, wp, _ := setupTestServices(t)
	defer wp.Stop()

	h := NewDownloadHandler(cs, wp)

	payload := model.DownloadRequest{
		AnimeID:        "test-anime",
		SeasonNumber:   1,
		EpisodeNumbers: []int{1},
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/api/downloads", bytes.NewReader(body))
	rr := httptest.NewRecorder()

	h.EnqueueDownloads(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("Expected status 202, got %d: %s", rr.Code, rr.Body.String())
	}

	// Verify downloads list
	reqList := httptest.NewRequest(http.MethodGet, "/api/downloads", nil)
	rrList := httptest.NewRecorder()
	h.GetDownloads(rrList, reqList)

	if rrList.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", rrList.Code)
	}

	// Cancel job
	jobs := wp.GetAllJobs()
	if len(jobs) == 0 {
		t.Fatalf("Expected at least 1 job in pool")
	}

	reqCancel := httptest.NewRequest(http.MethodDelete, "/api/downloads/"+jobs[0].JobID, nil)
	rrCancel := httptest.NewRecorder()
	h.CancelDownload(rrCancel, reqCancel)

	if rrCancel.Code != http.StatusOK {
		t.Errorf("Expected status 200 for cancel, got %d", rrCancel.Code)
	}
}

func TestAnimeHandler_ImportAnime(t *testing.T) {
	cs, wp, _ := setupTestServices(t)
	defer wp.Stop()

	h := NewAnimeHandler(cs)

	// 1. Success case: add new anime
	payload := model.ImportAnimeRequest{
		AnimeTitle:   "Dungeon Meshi",
		SeasonNumber: 1,
		Episodes: []model.ImportEpisodeItem{
			{Number: 1, URL: "https://example.com/ep1.mp4"},
		},
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/anime", bytes.NewReader(body))
	rr := httptest.NewRecorder()

	h.ImportAnime(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("Expected status 201 Created, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp model.APIResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}
	if !resp.Success {
		t.Errorf("Expected resp.Success to be true")
	}

	// 2. Bad Request: Invalid payload
	badPayload := model.ImportAnimeRequest{
		AnimeTitle:   "Bad Request",
		SeasonNumber: 1,
		Episodes:     []model.ImportEpisodeItem{}, // empty episodes
	}
	badBody, _ := json.Marshal(badPayload)
	reqBad := httptest.NewRequest(http.MethodPost, "/api/anime", bytes.NewReader(badBody))
	rrBad := httptest.NewRecorder()

	h.ImportAnime(rrBad, reqBad)

	if rrBad.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 Bad Request, got %d", rrBad.Code)
	}
}
