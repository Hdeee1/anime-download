package catalog

import (
	"os"
	"path/filepath"
	"testing"
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
