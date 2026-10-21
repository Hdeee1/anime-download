package downloader

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"anime-download/internal/model"
)

func TestWorkerPool_DownloadAndCancelWithTestServer(t *testing.T) {
	tempDir := t.TempDir()

	// Setup local mock HTTP server
	var requested atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested.Add(1)
		payload := []byte("VALID_VIDEO_STREAM_BYTES_FOR_TESTING")
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(payload)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	wp := NewWorkerPool(2, 10)
	wp.Start()
	defer wp.Stop()

	targetPath := filepath.Join(tempDir, "test-s01e01.mp4")
	jobID := GenerateJobID("test-anime", 1, 1)
	job := &model.DownloadJob{
		JobID:      jobID,
		AnimeID:    "test-anime",
		AnimeTitle: "Test Anime",
		Season:     1,
		Episode:    1,
		URL:        server.URL + "/video.mp4",
		TargetPath: targetPath,
		Filename:   "test-s01e01.mp4",
		Status:     model.StatusQueued,
	}

	sseCh := wp.Subscribe()
	defer wp.Unsubscribe(sseCh)

	if err := wp.Enqueue(job); err != nil {
		t.Fatalf("Failed to enqueue job: %v", err)
	}

	// Wait for completion via SSE event loop with timeout
	completed := false
	timeout := time.After(3 * time.Second)

loop:
	for {
		select {
		case evt := <-sseCh:
			if evt.Event == "completed" {
				completed = true
				break loop
			}
		case <-timeout:
			break loop
		}
	}

	if !completed {
		t.Fatalf("Expected download to complete successfully")
	}

	// Verify target file exists and content matches
	content, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("Expected target file to exist: %v", err)
	}
	if string(content) != "VALID_VIDEO_STREAM_BYTES_FOR_TESTING" {
		t.Errorf("Unexpected file content: %s", string(content))
	}

	// Verify .part file was removed
	if _, err := os.Stat(targetPath + ".part"); !os.IsNotExist(err) {
		t.Errorf("Expected .part file to be removed after completion")
	}
}

func TestWorkerPool_IncompleteDownloadFails(t *testing.T) {
	tempDir := t.TempDir()

	// Server reports 1000 bytes but sends only 10 bytes
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1000")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("SHORT_DATA"))
	}))
	defer server.Close()

	wp := NewWorkerPool(1, 10)
	wp.Start()
	defer wp.Stop()

	targetPath := filepath.Join(tempDir, "incomplete.mp4")
	jobID := GenerateJobID("test-anime", 1, 2)
	job := &model.DownloadJob{
		JobID:      jobID,
		AnimeID:    "test-anime",
		AnimeTitle: "Test Anime",
		Season:     1,
		Episode:    2,
		URL:        server.URL + "/video.mp4",
		TargetPath: targetPath,
		Filename:   "incomplete.mp4",
		Status:     model.StatusQueued,
	}

	sseCh := wp.Subscribe()
	defer wp.Unsubscribe(sseCh)

	if err := wp.Enqueue(job); err != nil {
		t.Fatalf("Failed to enqueue job: %v", err)
	}

	failed := false
	timeout := time.After(3 * time.Second)

loop:
	for {
		select {
		case evt := <-sseCh:
			if evt.Event == "failed" {
				failed = true
				break loop
			}
		case <-timeout:
			break loop
		}
	}

	if !failed {
		t.Fatalf("Expected incomplete download to fail")
	}

	// Verify neither final file nor .part file remained on disk
	if _, err := os.Stat(targetPath); !os.IsNotExist(err) {
		t.Errorf("Expected target file to NOT exist on incomplete download")
	}
	if _, err := os.Stat(targetPath + ".part"); !os.IsNotExist(err) {
		t.Errorf("Expected .part file to be cleaned up on incomplete download")
	}
}

func TestWorkerPool_Cancellation(t *testing.T) {
	tempDir := t.TempDir()

	blocker := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "100000")
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		<-blocker // wait until canceled
	}))
	defer server.Close()
	defer close(blocker)

	wp := NewWorkerPool(1, 10)
	wp.Start()
	defer wp.Stop()

	targetPath := filepath.Join(tempDir, "cancel.mp4")
	jobID := GenerateJobID("test-anime", 1, 3)
	job := &model.DownloadJob{
		JobID:      jobID,
		AnimeID:    "test-anime",
		AnimeTitle: "Test Anime",
		Season:     1,
		Episode:    3,
		URL:        server.URL + "/cancel.mp4",
		TargetPath: targetPath,
		Filename:   "cancel.mp4",
		Status:     model.StatusQueued,
	}

	sseCh := wp.Subscribe()
	defer wp.Unsubscribe(sseCh)

	if err := wp.Enqueue(job); err != nil {
		t.Fatalf("Failed to enqueue job: %v", err)
	}

	// Wait until DOWNLOADING event
	timeout := time.After(2 * time.Second)
	active := false
waitActive:
	for {
		select {
		case evt := <-sseCh:
			if evt.Event == "progress" {
				active = true
				break waitActive
			}
		case <-timeout:
			break waitActive
		}
	}

	if !active {
		t.Fatalf("Job did not start downloading within timeout")
	}

	// Trigger Cancel
	if !wp.Cancel(jobID) {
		t.Errorf("Expected Cancel to return true")
	}

	// Wait for canceled event
	canceled := false
	timeoutCancel := time.After(2 * time.Second)
waitCancel:
	for {
		select {
		case evt := <-sseCh:
			if evt.Event == "canceled" {
				canceled = true
				break waitCancel
			}
		case <-timeoutCancel:
			break waitCancel
		}
	}

	if !canceled {
		t.Errorf("Expected job canceled event")
	}

	savedJob, exists := wp.GetJob(jobID)
	if !exists {
		t.Fatalf("Expected job to exist")
	}
	if savedJob.Status != model.StatusCanceled {
		t.Errorf("Expected job status to be CANCELED, got %s", savedJob.Status)
	}
}
