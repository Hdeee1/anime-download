package catalog

import (
	"path/filepath"
	"testing"
)

func TestCatalogService(t *testing.T) {
	jsonPath := "../../anime_list.json"
	basePath := "/tmp/anime_test_storage"

	cs, err := NewCatalogService(jsonPath, basePath)
	if err != nil {
		t.Fatalf("Failed to initialize catalog service: %v", err)
	}

	summaries := cs.GetAllAnime()
	if len(summaries) != 6 {
		t.Errorf("Expected 6 anime, got %d", len(summaries))
	}

	// Verify Kusuriya no Hitorigoto
	detail, err := cs.GetAnimeDetail("kusuriya-no-hitorigoto")
	if err != nil {
		t.Fatalf("Failed to get anime detail: %v", err)
	}

	if detail.Title != "Kusuriya no Hitorigoto" {
		t.Errorf("Expected title 'Kusuriya no Hitorigoto', got %q", detail.Title)
	}

	if len(detail.Seasons) != 2 {
		t.Fatalf("Expected 2 seasons, got %d", len(detail.Seasons))
	}

	// Season 1: 24 episodes
	if detail.Seasons[0].TotalEpisodes != 24 {
		t.Errorf("Expected 24 episodes in Season 1, got %d", detail.Seasons[0].TotalEpisodes)
	}

	// Season 2: 0 episodes (empty array)
	if detail.Seasons[1].TotalEpisodes != 0 {
		t.Errorf("Expected 0 episodes in Season 2, got %d", detail.Seasons[1].TotalEpisodes)
	}

	// Test storage path generation
	folder, filename, fullPath := cs.GetStoragePath("Kusuriya no Hitorigoto", 1, 1)
	expectedFolder := filepath.Join(basePath, "Kusuriya no Hitorigoto", "Season 1")
	expectedFilename := "Kusuriya no Hitorigoto - S01E01.mp4"
	expectedFullPath := filepath.Join(expectedFolder, expectedFilename)

	if folder != expectedFolder {
		t.Errorf("Expected folder %q, got %q", expectedFolder, folder)
	}
	if filename != expectedFilename {
		t.Errorf("Expected filename %q, got %q", expectedFilename, filename)
	}
	if fullPath != expectedFullPath {
		t.Errorf("Expected fullPath %q, got %q", expectedFullPath, fullPath)
	}
}
