package model

// Data structs representing raw anime_list.json
type CatalogFile struct {
	Anime []AnimeData `json:"anime"`
}

type AnimeData struct {
	ID      string       `json:"id"`
	Title   string       `json:"title"`
	Seasons []SeasonData `json:"seasons"`
}

type SeasonData struct {
	Season        int           `json:"season"`
	Title         string        `json:"title"`
	TotalEpisodes int           `json:"totalEpisodes"`
	Episodes      []EpisodeData `json:"episodes"`
}

type EpisodeData struct {
	Number int    `json:"number"`
	URL    string `json:"url"`
}

// API Models for UI rendering
type AnimeSummary struct {
	ID                 string `json:"id"`
	Title              string `json:"title"`
	TotalSeasons       int    `json:"totalSeasons"`
	TotalEpisodes      int    `json:"totalEpisodes"`
	DownloadedEpisodes int    `json:"downloadedEpisodes"`
}

type AnimeDetail struct {
	ID      string         `json:"id"`
	Title   string         `json:"title"`
	Seasons []SeasonDetail `json:"seasons"`
}

type SeasonDetail struct {
	Season          int             `json:"season"`
	Title           string          `json:"title"`
	TotalEpisodes   int             `json:"totalEpisodes"`
	DownloadedCount int             `json:"downloadedCount"`
	Episodes        []EpisodeDetail `json:"episodes"`
}

type EpisodeDetail struct {
	Number       int    `json:"number"`
	URL          string `json:"url"`
	IsDownloaded bool   `json:"isDownloaded"`
	Filename     string `json:"filename"`
	FileSize     int64  `json:"fileSize"`
}

// Download Models
type JobStatus string

const (
	StatusQueued      JobStatus = "QUEUED"
	StatusDownloading JobStatus = "DOWNLOADING"
	StatusCompleted   JobStatus = "COMPLETED"
	StatusFailed      JobStatus = "FAILED"
	StatusCanceled    JobStatus = "CANCELED"
)

type DownloadRequest struct {
	AnimeID        string `json:"animeId"`
	SeasonNumber   int    `json:"seasonNumber"`
	EpisodeNumbers []int  `json:"episodeNumbers"`
}

type DownloadJob struct {
	JobID           string    `json:"jobId"`
	AnimeID         string    `json:"animeId"`
	AnimeTitle      string    `json:"animeTitle"`
	Season          int       `json:"season"`
	Episode         int       `json:"episode"`
	URL             string    `json:"url,omitempty"`
	TargetPath      string    `json:"targetPath,omitempty"`
	PartPath        string    `json:"partPath,omitempty"`
	Filename        string    `json:"filename"`
	Status          JobStatus `json:"status"`
	Progress        float64   `json:"progress"`
	DownloadedBytes int64     `json:"downloadedBytes"`
	TotalBytes      int64     `json:"totalBytes"`
	Speed           string    `json:"speed"`
	Error           *string   `json:"error"`
}

type APIResponse struct {
	Success bool   `json:"success"`
	Data    any    `json:"data"`
	Error   *string `json:"error"`
}

// Import Models
type ImportEpisodeItem struct {
	Number int    `json:"number"`
	URL    string `json:"url"`
}

type ImportAnimeRequest struct {
	AnimeID      string              `json:"animeId,omitempty"`
	AnimeTitle   string              `json:"animeTitle,omitempty"`
	SeasonNumber int                 `json:"seasonNumber"`
	SeasonTitle  string              `json:"seasonTitle,omitempty"`
	Episodes     []ImportEpisodeItem `json:"episodes"`
}
