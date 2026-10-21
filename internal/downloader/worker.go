package downloader

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"anime-download/internal/model"
)

func (wp *WorkerPool) worker(workerID int) {
	defer wp.wg.Done()

	for {
		select {
		case <-wp.ctx.Done():
			return
		case job, ok := <-wp.jobQueue:
			if !ok {
				return
			}

			// Check if job was canceled while waiting in queue
			wp.jobsMu.RLock()
			canceled := (job.Status == model.StatusCanceled)
			wp.jobsMu.RUnlock()
			if canceled {
				continue
			}

			wp.processJob(job)
		}
	}
}

func (wp *WorkerPool) processJob(job *model.DownloadJob) {
	// Atomic check & state transition under lock
	wp.jobsMu.Lock()
	if job.Status == model.StatusCanceled {
		wp.jobsMu.Unlock()
		return
	}
	job.Status = model.StatusDownloading
	partPath := job.TargetPath + ".part"
	job.PartPath = partPath
	initialTotalBytes := job.TotalBytes
	jobID := job.JobID
	animeID := job.AnimeID
	season := job.Season
	episode := job.Episode
	targetPath := job.TargetPath
	jobURL := job.URL
	wp.jobsMu.Unlock()

	// Create context for this specific download
	jobCtx, jobCancel := context.WithCancel(wp.ctx)

	wp.cancelsMu.Lock()
	wp.cancels[jobID] = jobCancel
	wp.cancelsMu.Unlock()

	defer func() {
		wp.cancelsMu.Lock()
		delete(wp.cancels, jobID)
		wp.cancelsMu.Unlock()
	}()

	// Ensure destination directory exists
	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		wp.failJob(job, fmt.Errorf("failed to create directory: %w", err))
		return
	}

	wp.Broadcast("progress", map[string]any{
		"jobId":           jobID,
		"animeId":         animeID,
		"season":          season,
		"episode":         episode,
		"status":          model.StatusDownloading,
		"progress":        0.0,
		"downloadedBytes": int64(0),
		"totalBytes":      initialTotalBytes,
		"speed":           "0 KB/s",
	})

	// Create HTTP request
	req, err := http.NewRequestWithContext(jobCtx, http.MethodGet, jobURL, nil)
	if err != nil {
		wp.failJob(job, fmt.Errorf("failed to create http request: %w", err))
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AnimeBatchDownloader/1.0")

	resp, err := wp.httpClient.Do(req)
	if err != nil {
		if jobCtx.Err() == context.Canceled {
			wp.cancelJob(job)
			return
		}
		wp.failJob(job, fmt.Errorf("http request failed: %w", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		wp.failJob(job, fmt.Errorf("received non-200 status code: %d", resp.StatusCode))
		return
	}

	totalBytes := resp.ContentLength
	wp.jobsMu.Lock()
	job.TotalBytes = totalBytes
	wp.jobsMu.Unlock()

	// Create .part file
	partFile, err := os.OpenFile(partPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		wp.failJob(job, fmt.Errorf("failed to create part file: %w", err))
		return
	}

	// Stream copying with speed & progress calculation
	buf := make([]byte, 64*1024) // 64KB buffer
	var downloadedBytes int64 = 0

	startTime := time.Now()
	lastReportTime := startTime
	lastReportBytes := int64(0)

	var streamErr error
	for {
		// Check cancellation
		if jobCtx.Err() != nil {
			streamErr = jobCtx.Err()
			break
		}

		n, rErr := resp.Body.Read(buf)
		if n > 0 {
			_, wErr := partFile.Write(buf[:n])
			if wErr != nil {
				streamErr = fmt.Errorf("failed to write part file: %w", wErr)
				break
			}
			downloadedBytes += int64(n)

			now := time.Now()
			// Report progress every 500ms
			if now.Sub(lastReportTime) >= 500*time.Millisecond {
				elapsedSec := now.Sub(lastReportTime).Seconds()
				deltaBytes := downloadedBytes - lastReportBytes
				bytesPerSec := float64(deltaBytes) / elapsedSec

				speedStr := formatSpeed(bytesPerSec)
				var progress float64 = 0
				if totalBytes > 0 {
					progress = float64(downloadedBytes) / float64(totalBytes) * 100.0
					if progress > 100.0 {
						progress = 100.0
					}
				}

				wp.jobsMu.Lock()
				job.DownloadedBytes = downloadedBytes
				job.Progress = progress
				job.Speed = speedStr
				wp.jobsMu.Unlock()

				wp.Broadcast("progress", map[string]any{
					"jobId":           jobID,
					"animeId":         animeID,
					"season":          season,
					"episode":         episode,
					"status":          model.StatusDownloading,
					"progress":        progress,
					"downloadedBytes": downloadedBytes,
					"totalBytes":      totalBytes,
					"speed":           speedStr,
				})

				lastReportTime = now
				lastReportBytes = downloadedBytes
			}
		}

		if rErr != nil {
			if rErr != io.EOF {
				streamErr = rErr
			}
			break
		}
	}

	partFile.Close()

	if streamErr != nil {
		_ = os.Remove(partPath)
		if jobCtx.Err() == context.Canceled {
			wp.cancelJob(job)
		} else {
			wp.failJob(job, streamErr)
		}
		return
	}

	// Validate complete byte transfer
	if downloadedBytes == 0 || (totalBytes > 0 && downloadedBytes != totalBytes) {
		_ = os.Remove(partPath)
		wp.failJob(job, fmt.Errorf("incomplete download: got %d of %d bytes", downloadedBytes, totalBytes))
		return
	}

	// Atomic rename from .part to final .mp4
	if err := os.Rename(partPath, targetPath); err != nil {
		_ = os.Remove(partPath)
		wp.failJob(job, fmt.Errorf("failed to finalize file: %w", err))
		return
	}

	// Complete job
	wp.jobsMu.Lock()
	job.Status = model.StatusCompleted
	job.Progress = 100.0
	job.DownloadedBytes = downloadedBytes
	job.Speed = "0 KB/s"
	wp.jobsMu.Unlock()

	wp.Broadcast("completed", map[string]any{
		"jobId":    job.JobID,
		"animeId":  job.AnimeID,
		"season":   job.Season,
		"episode":  job.Episode,
		"filename": job.Filename,
		"fileSize": downloadedBytes,
	})
}

func (wp *WorkerPool) failJob(job *model.DownloadJob, err error) {
	errMsg := err.Error()
	wp.jobsMu.Lock()
	job.Status = model.StatusFailed
	job.Error = &errMsg
	job.Speed = "0 KB/s"
	wp.jobsMu.Unlock()

	wp.Broadcast("failed", map[string]any{
		"jobId":   job.JobID,
		"animeId": job.AnimeID,
		"season":  job.Season,
		"episode": job.Episode,
		"error":   errMsg,
	})
}

func (wp *WorkerPool) cancelJob(job *model.DownloadJob) {
	wp.jobsMu.Lock()
	job.Status = model.StatusCanceled
	job.Speed = "0 KB/s"
	wp.jobsMu.Unlock()

	wp.Broadcast("canceled", map[string]any{
		"jobId":   job.JobID,
		"animeId": job.AnimeID,
		"season":  job.Season,
		"episode": job.Episode,
	})
}

func formatSpeed(bytesPerSec float64) string {
	if bytesPerSec < 1024 {
		return fmt.Sprintf("%.0f B/s", bytesPerSec)
	} else if bytesPerSec < 1024*1024 {
		return fmt.Sprintf("%.1f KB/s", bytesPerSec/1024)
	}
	return fmt.Sprintf("%.2f MB/s", bytesPerSec/(1024*1024))
}
