package downloader

import (
	"testing"
	"time"

	"anime-download/internal/model"
)

func TestWorkerPool_EnqueueAndCancel(t *testing.T) {
	wp := NewWorkerPool(2, 10)
	wp.Start()
	defer wp.Stop()

	if wp.MaxWorkers() != 2 {
		t.Errorf("Expected max workers 2, got %d", wp.MaxWorkers())
	}

	jobID := GenerateJobID("kusuriya-no-hitorigoto", 1, 1)
	job := &model.DownloadJob{
		JobID:      jobID,
		AnimeID:    "kusuriya-no-hitorigoto",
		AnimeTitle: "Kusuriya no Hitorigoto",
		Season:     1,
		Episode:    1,
		URL:        "https://example.com/test.mp4",
		TargetPath: "/tmp/test.mp4",
		Filename:   "test.mp4",
		Status:     model.StatusQueued,
	}

	// Subscribe to SSE
	sseCh := wp.Subscribe()
	defer wp.Unsubscribe(sseCh)

	if err := wp.Enqueue(job); err != nil {
		t.Fatalf("Failed to enqueue job: %v", err)
	}

	// Duplicate enqueue should fail
	jobDup := &model.DownloadJob{
		JobID:   "dup-job",
		AnimeID: "kusuriya-no-hitorigoto",
		Season:  1,
		Episode: 1,
		Status:  model.StatusQueued,
	}
	if err := wp.Enqueue(jobDup); err == nil {
		t.Errorf("Expected duplicate enqueue to fail")
	}

	// Cancel the job
	time.Sleep(50 * time.Millisecond)
	wp.Cancel(jobID)

	savedJob, exists := wp.GetJob(jobID)
	if !exists {
		t.Fatalf("Expected job %s to exist in jobs registry", jobID)
	}

	if savedJob.Status != model.StatusCanceled && savedJob.Status != model.StatusFailed {
		t.Logf("Job status after cancel: %s", savedJob.Status)
	}
}
