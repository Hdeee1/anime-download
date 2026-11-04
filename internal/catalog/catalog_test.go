package catalog

import (
	"os"
	"path/filepath"
	"testing"

	"anime-download/internal/model"
)

func TestCatalogService_SelfContained(t *testing.T) {
	tempDir := t.TempDir()
	jsonFile := filepath.Join(tempDir, "test_anime.json")
	storageDir := filepath.Join(tempDir, "storage")

	sampleJSON := `{
  "anime": [
    {
      "id": "fate-stay-night",
      "title": "Fate/stay night: Unlimited Blade Works",
      "seasons": [
        {
          "season": 1,
          "title": "Season 1",
          "totalEpisodes": 12,
          "episodes": [
            { "number": 1, "url": "https://example.com/ep1.mp4" },
            { "number": 2, "url": "https://example.com/ep2.mp4" }
          ]
        },
        {
          "season": 2,
          "title": "Season 2",
          "totalEpisodes": 12,
          "episodes": []
        }
      ]
    }
  ]
}`

	if err := os.WriteFile(jsonFile, []byte(sampleJSON), 0644); err != nil {
		t.Fatalf("Failed to write test json: %v", err)
	}

	cs, err := NewCatalogService(jsonFile, storageDir)
	if err != nil {
		t.Fatalf("Failed to initialize catalog service: %v", err)
	}

	summaries := cs.GetAllAnime()
	if len(summaries) != 1 {
		t.Fatalf("Expected 1 anime summary, got %d", len(summaries))
	}

	// Verify total episodes calculation preserves totalEpisodes (12 + 12 = 24)
	if summaries[0].TotalEpisodes != 24 {
		t.Errorf("Expected TotalEpisodes 24, got %d", summaries[0].TotalEpisodes)
	}

	// Verify title sanitization in GetStoragePath
	folder, filename, fullPath := cs.GetStoragePath("Fate/stay night: Unlimited Blade Works", 1, 1)
	expectedSanitized := "Fate-stay night - Unlimited Blade Works"
	expectedFolder := filepath.Join(storageDir, expectedSanitized, "Season 1")
	expectedFilename := expectedSanitized + " - S01E01.mp4"

	if folder != expectedFolder {
		t.Errorf("Expected folder %q, got %q", expectedFolder, folder)
	}
	if filename != expectedFilename {
		t.Errorf("Expected filename %q, got %q", expectedFilename, filename)
	}

	// Test downloaded detection with non-empty file
	if err := os.MkdirAll(folder, 0755); err != nil {
		t.Fatalf("Failed to create folder: %v", err)
	}
	if err := os.WriteFile(fullPath, []byte("dummy video content"), 0644); err != nil {
		t.Fatalf("Failed to write dummy video: %v", err)
	}

	detail, err := cs.GetAnimeDetail("fate-stay-night")
	if err != nil {
		t.Fatalf("Failed to get anime detail: %v", err)
	}

	if detail.Seasons[0].DownloadedCount != 1 {
		t.Errorf("Expected DownloadedCount 1, got %d", detail.Seasons[0].DownloadedCount)
	}
	if !detail.Seasons[0].Episodes[0].IsDownloaded {
		t.Errorf("Expected episode 1 to be marked as downloaded")
	}
	if detail.Seasons[0].Episodes[1].IsDownloaded {
		t.Errorf("Expected episode 2 to NOT be marked as downloaded")
	}
}

func TestCatalogService_AddOrUpdateAnime(t *testing.T) {
	tempDir := t.TempDir()
	jsonFile := filepath.Join(tempDir, "test_anime.json")
	storageDir := filepath.Join(tempDir, "storage")

	initialJSON := `{"anime": []}`
	if err := os.WriteFile(jsonFile, []byte(initialJSON), 0644); err != nil {
		t.Fatalf("Failed to write initial json: %v", err)
	}

	cs, err := NewCatalogService(jsonFile, storageDir)
	if err != nil {
		t.Fatalf("Failed to initialize catalog service: %v", err)
	}

	// 1. Test adding a new anime with season and episodes
	reqNew := model.ImportAnimeRequest{
		AnimeTitle:   "Sousou no Frieren",
		SeasonNumber: 1,
		SeasonTitle:  "First Season",
		Episodes: []model.ImportEpisodeItem{
			{Number: 2, URL: "https://example.com/ep2.mp4"},
			{Number: 1, URL: "https://example.com/ep1.mp4"},
		},
	}

	detail, err := cs.AddOrUpdateAnime(reqNew)
	if err != nil {
		t.Fatalf("AddOrUpdateAnime failed: %v", err)
	}

	if detail.Title != "Sousou no Frieren" {
		t.Errorf("Expected title 'Sousou no Frieren', got %q", detail.Title)
	}
	if len(detail.Seasons) != 1 {
		t.Fatalf("Expected 1 season, got %d", len(detail.Seasons))
	}
	// Verify sorting of episodes
	if len(detail.Seasons[0].Episodes) != 2 {
		t.Fatalf("Expected 2 episodes, got %d", len(detail.Seasons[0].Episodes))
	}
	if detail.Seasons[0].Episodes[0].Number != 1 || detail.Seasons[0].Episodes[1].Number != 2 {
		t.Errorf("Expected episodes sorted by number: got %d and %d",
			detail.Seasons[0].Episodes[0].Number, detail.Seasons[0].Episodes[1].Number)
	}

	// Verify persistence to disk
	csReloaded, err := NewCatalogService(jsonFile, storageDir)
	if err != nil {
		t.Fatalf("Failed to reload catalog from disk: %v", err)
	}
	all := csReloaded.GetAllAnime()
	if len(all) != 1 || all[0].Title != "Sousou no Frieren" {
		t.Fatalf("Disk persistence failed, got %v", all)
	}

	// 2. Test adding a new season to existing anime by AnimeID
	reqNewSeason := model.ImportAnimeRequest{
		AnimeID:      detail.ID,
		SeasonNumber: 2,
		SeasonTitle:  "Second Season",
		Episodes: []model.ImportEpisodeItem{
			{Number: 1, URL: "https://example.com/s2ep1.mp4"},
		},
	}

	detail2, err := cs.AddOrUpdateAnime(reqNewSeason)
	if err != nil {
		t.Fatalf("Failed to add new season: %v", err)
	}
	if len(detail2.Seasons) != 2 {
		t.Fatalf("Expected 2 seasons, got %d", len(detail2.Seasons))
	}
	if detail2.Seasons[1].Season != 2 || detail2.Seasons[1].Title != "Second Season" {
		t.Errorf("Unexpected season 2 data: %+v", detail2.Seasons[1])
	}

	// 3. Test overwrite and append episodes
	reqOverwriteAndAppend := model.ImportAnimeRequest{
		AnimeID:      detail.ID,
		SeasonNumber: 1,
		Episodes: []model.ImportEpisodeItem{
			{Number: 1, URL: "https://example.com/ep1_updated.mp4"}, // overwrite
			{Number: 3, URL: "https://example.com/ep3.mp4"},         // append
		},
	}

	detail3, err := cs.AddOrUpdateAnime(reqOverwriteAndAppend)
	if err != nil {
		t.Fatalf("Failed to overwrite and append: %v", err)
	}
	s1 := detail3.Seasons[0]
	if len(s1.Episodes) != 3 {
		t.Fatalf("Expected 3 episodes after append (not 4), got %d", len(s1.Episodes))
	}
	if s1.Episodes[0].URL != "https://example.com/ep1_updated.mp4" {
		t.Errorf("Expected episode 1 URL to be overwritten, got %q", s1.Episodes[0].URL)
	}
	if s1.Episodes[2].Number != 3 || s1.Episodes[2].URL != "https://example.com/ep3.mp4" {
		t.Errorf("Expected episode 3 to be appended, got %+v", s1.Episodes[2])
	}

	// 4. Test validation errors
	invalidReqs := []model.ImportAnimeRequest{
		{AnimeTitle: "", Episodes: []model.ImportEpisodeItem{{Number: 1, URL: "https://x.com/a.mp4"}}},
		{AnimeTitle: "Valid", Episodes: []model.ImportEpisodeItem{}},
		{AnimeTitle: "Valid", Episodes: []model.ImportEpisodeItem{{Number: 0, URL: "https://x.com/a.mp4"}}},
		{AnimeTitle: "Valid", Episodes: []model.ImportEpisodeItem{{Number: 1, URL: "invalid-url"}}},
	}

	for i, inv := range invalidReqs {
		if _, err := cs.AddOrUpdateAnime(inv); err == nil {
			t.Errorf("Expected error for invalid request #%d, got nil", i)
		}
	}
}
