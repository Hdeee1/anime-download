package downloader

import (
	"context"
	"fmt"
	"sync"
	"time"

	"anime-download/internal/model"
)

type SSEEvent struct {
	Event string `json:"event"`
	Data  any    `json:"data"`
}

type WorkerPool struct {
	maxWorkers int
	jobQueue   chan *model.DownloadJob
	jobsMu     sync.RWMutex
	jobs       map[string]*model.DownloadJob
	cancelsMu  sync.Mutex
	cancels    map[string]context.CancelFunc

	listenersMu sync.RWMutex
	listeners   map[chan SSEEvent]struct{}

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewWorkerPool(maxWorkers int, queueSize int) *WorkerPool {
	ctx, cancel := context.WithCancel(context.Background())
	return &WorkerPool{
		maxWorkers: maxWorkers,
		jobQueue:   make(chan *model.DownloadJob, queueSize),
		jobs:       make(map[string]*model.DownloadJob),
		cancels:    make(map[string]context.CancelFunc),
		listeners:  make(map[chan SSEEvent]struct{}),
		ctx:        ctx,
		cancel:     cancel,
	}
}

func (wp *WorkerPool) Start() {
	for i := 0; i < wp.maxWorkers; i++ {
		wp.wg.Add(1)
		go wp.worker(i + 1)
	}
}

func (wp *WorkerPool) Stop() {
	wp.cancel()

	// Cancel all running jobs
	wp.cancelsMu.Lock()
	for _, cancelFn := range wp.cancels {
		cancelFn()
	}
	wp.cancelsMu.Unlock()

	close(wp.jobQueue)
	wp.wg.Wait()
}

// Enqueue adds a download job to the queue
func (wp *WorkerPool) Enqueue(job *model.DownloadJob) error {
	wp.jobsMu.Lock()
	// Check if this file is already queued or downloading
	for _, existing := range wp.jobs {
		if existing.AnimeID == job.AnimeID && existing.Season == job.Season && existing.Episode == job.Episode {
			if existing.Status == model.StatusQueued || existing.Status == model.StatusDownloading {
				wp.jobsMu.Unlock()
				return fmt.Errorf("episode %d is already %s", job.Episode, existing.Status)
			}
		}
	}
	wp.jobs[job.JobID] = job
	wp.jobsMu.Unlock()

	select {
	case wp.jobQueue <- job:
		wp.Broadcast("enqueued", job)
		return nil
	default:
		wp.jobsMu.Lock()
		errMsg := "queue is full"
		job.Status = model.StatusFailed
		job.Error = &errMsg
		wp.jobsMu.Unlock()
		return fmt.Errorf("download queue is full")
	}
}

// Cancel cancels a running or queued job
func (wp *WorkerPool) Cancel(jobID string) bool {
	wp.cancelsMu.Lock()
	cancelFn, running := wp.cancels[jobID]
	if running {
		cancelFn()
		delete(wp.cancels, jobID)
		wp.cancelsMu.Unlock()
		return true
	}
	wp.cancelsMu.Unlock()

	// If not running, check if it's queued
	wp.jobsMu.Lock()
	defer wp.jobsMu.Unlock()
	if job, ok := wp.jobs[jobID]; ok {
		if job.Status == model.StatusQueued {
			job.Status = model.StatusCanceled
			wp.Broadcast("canceled", map[string]any{
				"jobId":   job.JobID,
				"animeId": job.AnimeID,
				"season":  job.Season,
				"episode": job.Episode,
			})
			return true
		}
	}

	return false
}

func (wp *WorkerPool) GetAllJobs() []*model.DownloadJob {
	wp.jobsMu.RLock()
	defer wp.jobsMu.RUnlock()

	list := make([]*model.DownloadJob, 0, len(wp.jobs))
	for _, job := range wp.jobs {
		list = append(list, job)
	}
	return list
}

func (wp *WorkerPool) GetJob(jobID string) (*model.DownloadJob, bool) {
	wp.jobsMu.RLock()
	defer wp.jobsMu.RUnlock()
	job, ok := wp.jobs[jobID]
	return job, ok
}

// SSE Subscription
func (wp *WorkerPool) Subscribe() chan SSEEvent {
	ch := make(chan SSEEvent, 64)
	wp.listenersMu.Lock()
	wp.listeners[ch] = struct{}{}
	wp.listenersMu.Unlock()
	return ch
}

func (wp *WorkerPool) Unsubscribe(ch chan SSEEvent) {
	wp.listenersMu.Lock()
	delete(wp.listeners, ch)
	close(ch)
	wp.listenersMu.Unlock()
}

func (wp *WorkerPool) Broadcast(event string, data any) {
	wp.listenersMu.RLock()
	defer wp.listenersMu.RUnlock()

	sseEvt := SSEEvent{
		Event: event,
		Data:  data,
	}

	for ch := range wp.listeners {
		select {
		case ch <- sseEvt:
		default:
			// avoid blocking if subscriber is slow
		}
	}
}

func (wp *WorkerPool) ActiveCount() int {
	wp.cancelsMu.Lock()
	defer wp.cancelsMu.Unlock()
	return len(wp.cancels)
}

func (wp *WorkerPool) MaxWorkers() int {
	return wp.maxWorkers
}

// GenerateJobID creates a unique job identifier
func GenerateJobID(animeID string, season, episode int) string {
	return fmt.Sprintf("job-%s-s%02de%02d-%d", animeID, season, episode, time.Now().UnixNano()%1000000)
}
