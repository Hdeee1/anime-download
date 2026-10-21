package catalog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"anime-download/internal/model"
)

var invalidPathChars = strings.NewReplacer(
	"/", "-", "\\", "-", ":", " -", "*", "", "?", "", "\"", "'", "<", "", ">", "", "|", "-",
)

func sanitizeName(name string) string {
	s := invalidPathChars.Replace(name)
	return strings.TrimSpace(s)
}

type CatalogService struct {
	mu           sync.RWMutex
	jsonFilePath string
	basePath     string
	data         *model.CatalogFile
}

func NewCatalogService(jsonFilePath, basePath string) (*CatalogService, error) {
	cs := &CatalogService{
		jsonFilePath: jsonFilePath,
		basePath:     basePath,
	}

	if err := cs.Reload(); err != nil {
		return nil, err
	}

	return cs, nil
}

// Reload reads the anime_list.json file and updates the in-memory catalog
func (cs *CatalogService) Reload() error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	fileBytes, err := os.ReadFile(cs.jsonFilePath)
	if err != nil {
		return fmt.Errorf("failed to read json file: %w", err)
	}

	var catalogFile model.CatalogFile
	if err := json.Unmarshal(fileBytes, &catalogFile); err != nil {
		return fmt.Errorf("failed to parse json catalog: %w", err)
	}

	cs.data = &catalogFile
	return nil
}

// GetStoragePath returns expected folder and filename for an episode with sanitized paths
func (cs *CatalogService) GetStoragePath(animeTitle string, season, episode int) (folderPath, filename, fullPath string) {
	safeTitle := sanitizeName(animeTitle)
	folderPath = filepath.Join(cs.basePath, safeTitle, fmt.Sprintf("Season %d", season))
	filename = fmt.Sprintf("%s - S%02dE%02d.mp4", safeTitle, season, episode)
	fullPath = filepath.Join(folderPath, filename)
	return folderPath, filename, fullPath
}

// GetAllAnime returns a summary list of all anime with downloaded counts
func (cs *CatalogService) GetAllAnime() []model.AnimeSummary {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	if cs.data == nil {
		return []model.AnimeSummary{}
	}

	summaries := make([]model.AnimeSummary, 0, len(cs.data.Anime))

	for _, a := range cs.data.Anime {
		totalEpisodes := 0
		downloadedCount := 0

		for _, s := range a.Seasons {
			seasonTotal := s.TotalEpisodes
			if len(s.Episodes) > seasonTotal {
				seasonTotal = len(s.Episodes)
			}
			totalEpisodes += seasonTotal

			for _, ep := range s.Episodes {
				_, _, fullPath := cs.GetStoragePath(a.Title, s.Season, ep.Number)
				if info, err := os.Stat(fullPath); err == nil && !info.IsDir() && info.Size() > 0 {
					downloadedCount++
				}
			}
		}

		summaries = append(summaries, model.AnimeSummary{
			ID:                 a.ID,
			Title:              a.Title,
			TotalSeasons:       len(a.Seasons),
			TotalEpisodes:      totalEpisodes,
			DownloadedEpisodes: downloadedCount,
		})
	}

	return summaries
}

// GetAnimeDetail returns detailed season and episode info for a given anime ID
func (cs *CatalogService) GetAnimeDetail(id string) (*model.AnimeDetail, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	if cs.data == nil {
		return nil, fmt.Errorf("catalog is empty")
	}

	for _, a := range cs.data.Anime {
		if a.ID == id {
			detail := &model.AnimeDetail{
				ID:      a.ID,
				Title:   a.Title,
				Seasons: make([]model.SeasonDetail, 0, len(a.Seasons)),
			}

			for _, s := range a.Seasons {
				totalEps := s.TotalEpisodes
				if len(s.Episodes) > totalEps {
					totalEps = len(s.Episodes)
				}

				sDetail := model.SeasonDetail{
					Season:          s.Season,
					Title:           s.Title,
					TotalEpisodes:   totalEps,
					DownloadedCount: 0,
					Episodes:        make([]model.EpisodeDetail, 0, len(s.Episodes)),
				}

				for _, ep := range s.Episodes {
					_, filename, fullPath := cs.GetStoragePath(a.Title, s.Season, ep.Number)
					isDownloaded := false
					var fileSize int64 = 0

					if info, err := os.Stat(fullPath); err == nil && !info.IsDir() && info.Size() > 0 {
						isDownloaded = true
						fileSize = info.Size()
						sDetail.DownloadedCount++
					}

					sDetail.Episodes = append(sDetail.Episodes, model.EpisodeDetail{
						Number:       ep.Number,
						URL:          ep.URL,
						IsDownloaded: isDownloaded,
						Filename:     filename,
						FileSize:     fileSize,
					})
				}

				detail.Seasons = append(detail.Seasons, sDetail)
			}

			return detail, nil
		}
	}

	return nil, fmt.Errorf("anime with id %q not found", id)
}

// FindEpisode finds the specific episode URL and title
func (cs *CatalogService) FindEpisode(animeID string, seasonNumber, episodeNumber int) (animeTitle string, epURL string, err error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	if cs.data == nil {
		return "", "", fmt.Errorf("catalog is empty")
	}

	for _, a := range cs.data.Anime {
		if a.ID == animeID {
			for _, s := range a.Seasons {
				if s.Season == seasonNumber {
					for _, ep := range s.Episodes {
						if ep.Number == episodeNumber {
							return a.Title, ep.URL, nil
						}
					}
					return "", "", fmt.Errorf("episode %d not found in season %d", episodeNumber, seasonNumber)
				}
			}
			return "", "", fmt.Errorf("season %d not found for anime %s", seasonNumber, animeID)
		}
	}

	return "", "", fmt.Errorf("anime %s not found", animeID)
}
