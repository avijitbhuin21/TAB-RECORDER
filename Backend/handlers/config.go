package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"recorder/services"
)

type ConfigHandler struct {
	fileWriter *services.FileWriterService
}

// NewConfigHandler creates a new ConfigHandler with the specified FileWriterService.
func NewConfigHandler(fileWriter *services.FileWriterService) *ConfigHandler {
	return &ConfigHandler{fileWriter: fileWriter}
}

// Handle processes POST requests to configure the download directory path.
// Validates the path for security (no directory traversal) and existence before applying.
// Responds with 200 OK on success or appropriate error status on failure.
func (h *ConfigHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		var config struct {
			Path string `json:"path"`
		}

		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			log.Printf("ERROR: Failed to decode config request: %v", err)
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if config.Path != "" {
			cleanPath := filepath.Clean(config.Path)
			absPath, err := filepath.Abs(cleanPath)
			if err != nil {
				log.Printf("ERROR: Invalid path: %v", err)
				http.Error(w, "Invalid path", http.StatusBadRequest)
				return
			}

			if strings.Contains(filepath.ToSlash(absPath), "..") {
				log.Printf("ERROR: Path traversal attempt detected: %s", config.Path)
				http.Error(w, "Path traversal not allowed", http.StatusBadRequest)
				return
			}

			info, err := os.Stat(absPath)
			if err != nil {
				log.Printf("ERROR: Directory does not exist: %v", err)
				http.Error(w, "Directory does not exist", http.StatusBadRequest)
				return
			}

			if !info.IsDir() {
				log.Printf("ERROR: Path is not a directory: %s", absPath)
				http.Error(w, "Path must be a directory", http.StatusBadRequest)
				return
			}

			h.fileWriter.SetDownloadDir(absPath)
			log.Printf("Download directory updated to: %s", absPath)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}