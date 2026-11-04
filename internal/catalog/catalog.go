package catalog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
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

func slugifyTitle(title string) string {
	s := strings.ToLower(title)
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
		} else if r == ' ' || r == '-' || r == '_' || r == '.' || r == ':' {
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	res := strings.Trim(b.String(), "-")
	if res == "" {
		res = "anime"
	}
	return res
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

// saveToFileLocked marshals the in-memory catalog and writes it atomically to jsonFilePath.
// Must be called with cs.mu held.
func (cs *CatalogService) saveToFileLocked() error {
	if cs.data == nil {
		return fmt.Errorf("catalog data is nil")
	}

	bytes, err := json.MarshalIndent(cs.data, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal catalog data: %w", err)
	}
	bytes = append(bytes, '\n')

	tmpPath := cs.jsonFilePath + ".tmp"
	if err := os.WriteFile(tmpPath, bytes, 0644); err != nil {
		return fmt.Errorf("failed to write temporary catalog file: %w", err)
	}

	if err := os.Rename(tmpPath, cs.jsonFilePath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to atomic rename catalog file: %w", err)
	}

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

	return cs.getAnimeDetailLocked(id)
}

func (cs *CatalogService) getAnimeDetailLocked(id string) (*model.AnimeDetail, error) {
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

// AddOrUpdateAnime adds or updates an anime, season, and episodes in memory and persists to disk
func (cs *CatalogService) AddOrUpdateAnime(req model.ImportAnimeRequest) (*model.AnimeDetail, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	if cs.data == nil {
		return nil, fmt.Errorf("catalog data is not loaded")
	}

	cleanAnimeID := strings.TrimSpace(req.AnimeID)
	cleanAnimeTitle := strings.TrimSpace(req.AnimeTitle)

	if cleanAnimeID == "" && cleanAnimeTitle == "" {
		return nil, fmt.Errorf("animeTitle or animeId is required")
	}

	if req.SeasonNumber <= 0 {
		req.SeasonNumber = 1
	}

	if len(req.Episodes) == 0 {
		return nil, fmt.Errorf("at least one episode is required")
	}

	// Validate episodes
	for _, ep := range req.Episodes {
		if ep.Number <= 0 {
			return nil, fmt.Errorf("invalid episode number: %d (must be > 0)", ep.Number)
		}
		u := strings.TrimSpace(ep.URL)
		if u == "" {
			return nil, fmt.Errorf("episode %d URL cannot be empty", ep.Number)
		}
		if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
			return nil, fmt.Errorf("episode %d URL must start with http:// or https://", ep.Number)
		}
	}

	// 1. Find or create anime
	animeIdx := -1
	if cleanAnimeID != "" {
		for i, a := range cs.data.Anime {
			if a.ID == cleanAnimeID {
				animeIdx = i
				break
			}
		}
		if animeIdx == -1 {
			return nil, fmt.Errorf("anime with id %q not found", cleanAnimeID)
		}
	} else {
		// Match by title case-insensitive
		for i, a := range cs.data.Anime {
			if strings.EqualFold(a.Title, cleanAnimeTitle) {
				animeIdx = i
				break
			}
		}
		if animeIdx == -1 {
			// Generate new unique ID
			baseSlug := slugifyTitle(cleanAnimeTitle)
			finalID := baseSlug
			counter := 1
			for {
				exists := false
				for _, a := range cs.data.Anime {
					if a.ID == finalID {
						exists = true
						break
					}
				}
				if !exists {
					break
				}
				counter++
				finalID = fmt.Sprintf("%s-%d", baseSlug, counter)
			}

			newAnime := model.AnimeData{
				ID:      finalID,
				Title:   cleanAnimeTitle,
				Seasons: []model.SeasonData{},
			}
			cs.data.Anime = append(cs.data.Anime, newAnime)
			animeIdx = len(cs.data.Anime) - 1
		}
	}

	targetAnime := &cs.data.Anime[animeIdx]

	// 2. Find or create season
	seasonIdx := -1
	for i, s := range targetAnime.Seasons {
		if s.Season == req.SeasonNumber {
			seasonIdx = i
			break
		}
	}

	if seasonIdx == -1 {
		sTitle := strings.TrimSpace(req.SeasonTitle)
		if sTitle == "" {
			sTitle = fmt.Sprintf("Season %d", req.SeasonNumber)
		}
		newSeason := model.SeasonData{
			Season:        req.SeasonNumber,
			Title:         sTitle,
			TotalEpisodes: 0,
			Episodes:      []model.EpisodeData{},
		}
		targetAnime.Seasons = append(targetAnime.Seasons, newSeason)
		seasonIdx = len(targetAnime.Seasons) - 1
	} else if strings.TrimSpace(req.SeasonTitle) != "" {
		targetAnime.Seasons[seasonIdx].Title = strings.TrimSpace(req.SeasonTitle)
	}

	targetSeason := &targetAnime.Seasons[seasonIdx]

	// 3. Add or overwrite episodes
	for _, epItem := range req.Episodes {
		cleanURL := strings.TrimSpace(epItem.URL)
		found := false
		for i := range targetSeason.Episodes {
			if targetSeason.Episodes[i].Number == epItem.Number {
				// Overwrite existing episode URL as requested
				targetSeason.Episodes[i].URL = cleanURL
				found = true
				break
			}
		}
		if !found {
			targetSeason.Episodes = append(targetSeason.Episodes, model.EpisodeData{
				Number: epItem.Number,
				URL:    cleanURL,
			})
		}
	}

	// 4. Sort episodes ascending
	sort.Slice(targetSeason.Episodes, func(i, j int) bool {
		return targetSeason.Episodes[i].Number < targetSeason.Episodes[j].Number
	})

	if len(targetSeason.Episodes) > targetSeason.TotalEpisodes {
		targetSeason.TotalEpisodes = len(targetSeason.Episodes)
	}

	// 5. Sort seasons ascending
	sort.Slice(targetAnime.Seasons, func(i, j int) bool {
		return targetAnime.Seasons[i].Season < targetAnime.Seasons[j].Season
	})

	// 6. Persist to disk atomically
	if err := cs.saveToFileLocked(); err != nil {
		return nil, fmt.Errorf("failed to save catalog: %w", err)
	}

	// 7. Return detailed anime snapshot
	return cs.getAnimeDetailLocked(targetAnime.ID)
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
