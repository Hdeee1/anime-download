package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"anime-download/internal/catalog"
	"anime-download/internal/model"
)

type AnimeHandler struct {
	catalog *catalog.CatalogService
}

func NewAnimeHandler(catalog *catalog.CatalogService) *AnimeHandler {
	return &AnimeHandler{catalog: catalog}
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(model.APIResponse{
		Success: true,
		Data:    data,
		Error:   nil,
	})
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(model.APIResponse{
		Success: false,
		Data:    nil,
		Error:   &message,
	})
}

// GetAllAnime handles GET /api/anime
func (h *AnimeHandler) GetAllAnime(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	summaries := h.catalog.GetAllAnime()
	writeJSON(w, http.StatusOK, summaries)
}

// GetAnimeDetail handles GET /api/anime/{id}
func (h *AnimeHandler) GetAnimeDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Go 1.22 path value or fallback prefix trim
	id := r.PathValue("id")
	if id == "" {
		id = strings.TrimPrefix(r.URL.Path, "/api/anime/")
	}

	if id == "" {
		writeError(w, http.StatusBadRequest, "Missing anime ID")
		return
	}

	detail, err := h.catalog.GetAnimeDetail(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, detail)
}

// ReloadCatalog handles POST /api/anime/reload
func (h *AnimeHandler) ReloadCatalog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if err := h.catalog.Reload(); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to reload catalog: "+err.Error())
		return
	}

	all := h.catalog.GetAllAnime()
	writeJSON(w, http.StatusOK, map[string]any{
		"message":    "Catalog reloaded successfully",
		"totalAnime": len(all),
	})
}
