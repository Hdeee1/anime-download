package main

import (
	"bufio"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"anime-download/internal/catalog"
	"anime-download/internal/downloader"
	"anime-download/internal/handler"
)

const (
	defaultPort     = "8080"
	defaultBasePath = "./downloads"
	defaultJSONPath = "./anime_list.json"
	maxWorkers      = 2
	queueCapacity   = 500
)

// loadEnvFile reads a local .env file and sets environment variables if not already set
func loadEnvFile(path string) {
	file, err := os.Open(path)
	if err != nil {
		return // .env is optional
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, `"'`)
			if os.Getenv(key) == "" {
				_ = os.Setenv(key, val)
			}
		}
	}
}

func main() {
	loadEnvFile(".env")
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	basePath := os.Getenv("STORAGE_PATH")
	if basePath == "" {
		basePath = defaultBasePath
	}

	jsonPath := os.Getenv("CATALOG_PATH")
	if jsonPath == "" {
		jsonPath = defaultJSONPath
	}

	log.Printf("[Anime Downloader] Initializing...")
	log.Printf("[Anime Downloader] Target storage: %s", basePath)
	log.Printf("[Anime Downloader] Catalog file: %s", jsonPath)

	// Ensure target storage directory exists
	if err := os.MkdirAll(basePath, 0755); err != nil {
		log.Fatalf("Failed to create storage directory: %v", err)
	}

	// Initialize Catalog Service
	catalogService, err := catalog.NewCatalogService(jsonPath, basePath)
	if err != nil {
		log.Fatalf("Failed to initialize catalog service: %v", err)
	}
	log.Printf("[Anime Downloader] Loaded %d anime series from catalog", len(catalogService.GetAllAnime()))

	// Initialize Downloader Worker Pool (2 workers)
	workerPool := downloader.NewWorkerPool(maxWorkers, queueCapacity)
	workerPool.Start()
	log.Printf("[Anime Downloader] Started downloader pool with %d concurrent workers", maxWorkers)

	// Initialize Handlers
	animeHandler := handler.NewAnimeHandler(catalogService)
	downloadHandler := handler.NewDownloadHandler(catalogService, workerPool)

	// Setup Routes
	mux := http.NewServeMux()

	// REST API Routes
	mux.HandleFunc("GET /api/anime", animeHandler.GetAllAnime)
	mux.HandleFunc("GET /api/anime/{id}", animeHandler.GetAnimeDetail)
	mux.HandleFunc("POST /api/anime/reload", animeHandler.ReloadCatalog)

	mux.HandleFunc("POST /api/downloads", downloadHandler.EnqueueDownloads)
	mux.HandleFunc("GET /api/downloads", downloadHandler.GetDownloads)
	mux.HandleFunc("DELETE /api/downloads/{jobId}", downloadHandler.CancelDownload)
	mux.HandleFunc("GET /api/downloads/events", downloadHandler.EventsStream)

	// Static Web Assets
	fs := http.FileServer(http.Dir("./web"))
	mux.Handle("/", fs)

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // Set to 0 to support SSE long-lived streaming
		IdleTimeout:  60 * time.Second,
	}

	// Server runner in background
	go func() {
		log.Printf("[Anime Downloader] Server is running at http://localhost:%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	log.Printf("[Anime Downloader] Shutting down server gracefully...")

	// 1. Shutdown HTTP server first so no new requests are accepted
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	// 2. Now safely stop downloader pool
	workerPool.Stop()

	log.Printf("[Anime Downloader] Server stopped cleanly.")
}
